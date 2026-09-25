use std::path::PathBuf;

use anyhow::{Context, Result, bail};
use chrono::{DateTime, NaiveDate, Utc};
use clap::{Parser, ValueEnum};
use motregen_ingest::{
    cams::{self, CamsRun},
    cams_ads::{AdsClient, decode_grib, request_inputs},
    cams_open_meteo::OpenMeteoClient,
    env_file::read_env_file_key,
};
use tracing::{info, warn};
use tracing_subscriber::EnvFilter;

#[derive(Clone, Copy, PartialEq, ValueEnum)]
enum Provider {
    /// ADS when a key is configured, otherwise Open-Meteo.
    Auto,
    Ads,
    OpenMeteo,
}

#[derive(Parser)]
#[command(about = "Publish the daily CAMS pollen and air-quality forecast as motregen chunks")]
struct Config {
    #[arg(long, env = "ADS_API_KEY", hide_env_values = true)]
    ads_api_key: Option<String>,
    #[arg(long, env = "MOTREGEN_DATA_DIR", default_value = "data")]
    data_dir: PathBuf,
    #[arg(long, env = "MOTREGEN_CAMS_PROVIDER", value_enum, default_value = "auto")]
    provider: Provider,
    /// Run date (00 UTC); defaults to today. Open-Meteo always serves its latest run.
    #[arg(long)]
    run: Option<NaiveDate>,
    /// Decode this ADS GRIB file instead of downloading (recorded fixture).
    #[arg(long, env = "MOTREGEN_CAMS_GRIB")]
    grib: Option<PathBuf>,
    /// Keep the downloaded ADS GRIB at this path.
    #[arg(long)]
    record: Option<PathBuf>,
    #[arg(long, env = "MOTREGEN_ADS_API", hide = true)]
    ads_api: Option<String>,
    #[arg(long, env = "MOTREGEN_OPEN_METEO_API", hide = true)]
    open_meteo_api: Option<String>,
}

fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()))
        .with_ansi(false)
        .init();
    let config = Config::parse();
    let run = fetch(&config)?;
    let chunks = cams::build_chunks(&run)?;
    cams::write_publication(&config.data_dir, &run, &chunks)?;
    info!(
        run = %run.run,
        provider = run.provider,
        chunks = chunks.len(),
        bytes = chunks.iter().map(|chunk| chunk.bytes.len()).sum::<usize>(),
        fields = ?chunks.iter().map(|chunk| chunk.manifest.field.as_str()).collect::<std::collections::BTreeSet<_>>(),
        "cams publication written; the ingest daemon adds it to the manifest"
    );
    Ok(())
}

fn fetch(config: &Config) -> Result<CamsRun> {
    if let Some(grib) = &config.grib {
        info!(file = %grib.display(), "decoding recorded ADS GRIB");
        return decode_grib(grib);
    }
    let run_date = config.run.unwrap_or_else(|| Utc::now().date_naive());
    let run: DateTime<Utc> = run_date.and_hms_opt(0, 0, 0).expect("midnight").and_utc();
    let key = match &config.ads_api_key {
        Some(key) => Some(key.clone()),
        None => read_env_file_key(".env", "ADS_API_KEY")?,
    };
    let provider = match (config.provider, key.is_some()) {
        (Provider::Auto, true) | (Provider::Ads, _) => Provider::Ads,
        (Provider::Auto, false) => {
            warn!("ADS_API_KEY absent; using the Open-Meteo development fallback");
            Provider::OpenMeteo
        }
        (Provider::OpenMeteo, _) => Provider::OpenMeteo,
    };
    if provider == Provider::OpenMeteo {
        let client = OpenMeteoClient::new(config.open_meteo_api.clone())?;
        let latest = client.latest_run()?;
        if config.run.is_some() && latest != run {
            bail!("Open-Meteo serves run {latest}, not the requested {run}");
        }
        return client.fetch(latest, &cams::fields_for_run(latest));
    }
    let key = key.context("ADS_API_KEY is absent from flags, environment, and .env")?;
    let inputs = request_inputs(run, &cams::fields_for_run(run));
    info!(inputs = %inputs, "ADS request");
    let target = config.record.clone().unwrap_or_else(|| {
        config
            .data_dir
            .join(".ingest-cache")
            .join("cams")
            .join(format!("{}.grib2", run.format("%Y%m%dT%H")))
    });
    let path = AdsClient::new(key, config.ads_api.clone())?.retrieve(&inputs, &target)?;
    let decoded = decode_grib(&path)?;
    if decoded.run != run {
        bail!("ADS returned run {}, requested {run}", decoded.run);
    }
    Ok(decoded)
}
