use std::{path::PathBuf, time::Instant};

use anyhow::{Result, ensure};
use chrono::{DateTime, Timelike, Utc};
use clap::Parser;
use motregen_ingest::ecmwf::{self, download::OpenDataClient};
use tracing::{info, warn};
use tracing_subscriber::EnvFilter;

#[derive(Parser)]
#[command(about = "Publish ECMWF IFS open data as local-calendar daily forecasts")]
struct Config {
    #[arg(long, env = "MOTREGEN_DATA_DIR", default_value = "data")]
    data_dir: PathBuf,
    /// Explicit 00/12 UTC run, otherwise select the newest complete run.
    #[arg(long)]
    run: Option<DateTime<Utc>>,
    #[arg(long, env = "MOTREGEN_ECMWF_API", hide = true)]
    api: Option<String>,
}

fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()))
        .with_ansi(false)
        .init();
    let config = Config::parse();
    let started = Instant::now();
    let client = OpenDataClient::new(&config.data_dir, config.api)?;
    let run = match config.run {
        Some(run) => {
            ensure!(
                [0, 12].contains(&run.hour())
                    && run.minute() == 0
                    && run.second() == 0
                    && run.timestamp_subsec_nanos() == 0,
                "ECMWF run must be 00/12 UTC"
            );
            run
        }
        None => client.latest_run(Utc::now())?,
    };
    let daily = ecmwf::aggregate(&client.fetch(run)?)?;
    let chunks = ecmwf::build_chunks(&daily)?;
    ecmwf::write_publication(&config.data_dir, &daily, &chunks)?;
    if let Err(error) = client.prune_cache(run) {
        warn!(%error, "ECMWF cache pruning failed");
    }
    info!(%run, days = daily.days.len(), chunks = chunks.len(), downloaded_bytes = client.downloaded_bytes(),
        published_bytes = chunks.iter().map(|chunk| chunk.bytes.len()).sum::<usize>(), elapsed_seconds = started.elapsed().as_secs_f64(),
        "ECMWF publication written; the ingest daemon adds it when enabled");
    Ok(())
}
