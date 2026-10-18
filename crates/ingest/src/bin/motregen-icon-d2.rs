use std::{path::PathBuf, time::Instant};

use anyhow::{Result, ensure};
use chrono::{DateTime, Utc};
use clap::Parser;
use motregen_ingest::icon_d2::{self, download::DwdClient};
use tracing::{info, warn};
use tracing_subscriber::EnvFilter;

#[derive(Parser)]
#[command(about = "Publish DWD ICON-D2 direct radiation for the sunshine estimate")]
struct Config {
    #[arg(long, env = "MOTREGEN_DATA_DIR", default_value = "data")]
    data_dir: PathBuf,
    /// Explicit 3-hourly UTC run, otherwise select the newest complete run.
    #[arg(long)]
    run: Option<DateTime<Utc>>,
    #[arg(long, env = "MOTREGEN_ICON_D2_BASE", hide = true)]
    base: Option<String>,
}

fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()))
        .with_ansi(false)
        .init();
    let config = Config::parse();
    let started = Instant::now();
    let client = DwdClient::new(&config.data_dir, config.base)?;
    let run = match config.run {
        Some(run) => {
            ensure!(icon_d2::is_run_time(run), "ICON-D2 runs are 3-hourly UTC");
            run
        }
        None => client.latest_run(Utc::now())?,
    };
    if icon_d2::published_run(&config.data_dir)? == Some(run) {
        info!(%run, "ICON-D2 run already published");
        return Ok(());
    }
    let direct = client.fetch(run)?;
    let chunk = icon_d2::build_chunk(&direct)?;
    icon_d2::write_publication(&config.data_dir, run, &chunk)?;
    // The station archive is for later measurement; a failure there must not hold back the publication.
    if let Err(error) = icon_d2::archive::write(&config.data_dir, &direct) {
        warn!(%error, "ICON-D2 station archive not written");
    }
    match icon_d2::archive::prune(&config.data_dir, Utc::now()) {
        Ok(removed) if removed > 0 => info!(removed, "old ICON-D2 station extracts removed"),
        Ok(_) => {}
        Err(error) => warn!(%error, "ICON-D2 station archive pruning failed"),
    }
    if let Err(error) = client.prune_cache(run) {
        warn!(%error, "ICON-D2 cache pruning failed");
    }
    info!(%run, downloaded_bytes = client.downloaded_bytes(), published_bytes = chunk.bytes.len(),
        elapsed_seconds = started.elapsed().as_secs_f64(),
        "ICON-D2 publication written; the ingest daemon adds it when enabled");
    Ok(())
}
