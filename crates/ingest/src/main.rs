use std::{
    fs,
    io::ErrorKind,
    path::PathBuf,
    thread,
    time::{Duration, Instant},
};

use anyhow::{Context, Result};
use clap::Parser;
use motregen_ingest::{
    api::ApiClient,
    pipeline::{
        AROME_DATASET, AROME_VERSION, NOWCAST_DATASET, NOWCAST_VERSION, RTCOR_DATASET,
        RTCOR_VERSION, UV_DATASET, UV_VERSION, build_arome_chunks, build_nowcast_chunk,
        build_rtcor_chunk, build_uv_chunk, latest_files, prune_download_cache,
    },
    publisher::{ProducedChunk, publish},
};
use tracing::{error, info, warn};
use tracing_subscriber::EnvFilter;

#[derive(Parser)]
#[command(about = "Turn live KNMI rain products into motregen mrf chunks")]
struct Config {
    #[arg(long, env = "KNMI_OPEN_DATA_API_KEY", hide_env_values = true)]
    api_key: Option<String>,
    #[arg(long, env = "MOTREGEN_DATA_DIR", default_value = "data")]
    data_dir: PathBuf,
    #[arg(
        long,
        env = "MOTREGEN_RADAR_CADENCE",
        default_value = "60s",
        value_parser = parse_duration
    )]
    radar_cadence: Duration,
    #[arg(
        long,
        env = "MOTREGEN_AROME_CADENCE",
        default_value = "3h",
        value_parser = parse_duration
    )]
    arome_cadence: Duration,
    #[arg(
        long,
        env = "MOTREGEN_UV_CADENCE",
        default_value = "15m",
        value_parser = parse_duration
    )]
    uv_cadence: Duration,
    #[arg(long, env = "MOTREGEN_HISTORY_HOURS", default_value_t = 3)]
    history_hours: u32,
    #[arg(long, env = "MOTREGEN_NOWCAST_MINUTES", default_value_t = 120)]
    nowcast_minutes: u32,
    #[arg(long, env = "MOTREGEN_AROME_HOURS", default_value_t = 24)]
    arome_hours: u32,
    #[arg(
        long,
        env = "MOTREGEN_PRUNE_AGE",
        default_value = "6h",
        value_parser = parse_duration
    )]
    prune_age: Duration,
    #[arg(
        long,
        env = "MOTREGEN_CACHE_AGE",
        default_value = "12h",
        value_parser = parse_duration
    )]
    cache_age: Duration,
    #[arg(long)]
    once: bool,
    #[arg(long, value_parser = parse_duration)]
    run_for: Option<Duration>,
    #[arg(long, env = "MOTREGEN_API_BASE", hide = true)]
    api_base: Option<String>,
}

fn parse_duration(value: &str) -> Result<Duration, humantime::DurationError> {
    humantime::parse_duration(value)
}

struct Daemon {
    config: Config,
    api: ApiClient,
    cache_root: PathBuf,
    rtcor_id: Option<String>,
    nowcast_id: Option<String>,
    arome_id: Option<String>,
    uv_id: Option<String>,
    rtcor: Option<ProducedChunk>,
    nowcast: Option<ProducedChunk>,
    arome: Vec<ProducedChunk>,
    uv: Option<ProducedChunk>,
    last_arome_check: Option<Instant>,
    last_uv_check: Option<Instant>,
}

impl Daemon {
    fn new(mut config: Config) -> Result<Self> {
        let api_key = match config.api_key.take() {
            Some(api_key) => api_key,
            None => read_env_file_key(".env", "KNMI_OPEN_DATA_API_KEY")?
                .context("KNMI_OPEN_DATA_API_KEY is absent from flags, environment, and .env")?,
        };
        let api = ApiClient::new(api_key, config.api_base.clone())?;
        let cache_root = config.data_dir.join(".ingest-cache");
        Ok(Self {
            config,
            api,
            cache_root,
            rtcor_id: None,
            nowcast_id: None,
            arome_id: None,
            uv_id: None,
            rtcor: None,
            nowcast: None,
            arome: Vec::new(),
            uv: None,
            last_arome_check: None,
            last_uv_check: None,
        })
    }

    fn initialize(&mut self) -> Result<()> {
        info!("startup backfill begins");
        self.refresh_rtcor()?;
        self.refresh_nowcast()?;
        self.refresh_arome()?;
        self.refresh_uv()?;
        self.publish()?;
        prune_download_cache(&self.cache_root, self.config.cache_age)?;
        info!("startup backfill published");
        Ok(())
    }

    fn refresh_rtcor(&mut self) -> Result<bool> {
        let latest = latest_files(&self.api, RTCOR_DATASET, RTCOR_VERSION, 1)?
            .into_iter()
            .next()
            .expect("checked non-empty RTCOR list");
        if self.rtcor_id.as_deref() == Some(&latest.filename) {
            return Ok(false);
        }
        let (chunk, _) = build_rtcor_chunk(&self.api, &self.cache_root, self.config.history_hours)?;
        info!(
            file = latest.filename,
            frames = chunk.manifest.times.len(),
            "rtcor refresh decoded"
        );
        self.rtcor_id = Some(latest.filename);
        self.rtcor = Some(chunk);
        Ok(true)
    }

    fn refresh_nowcast(&mut self) -> Result<bool> {
        let latest = latest_files(&self.api, NOWCAST_DATASET, NOWCAST_VERSION, 1)?
            .into_iter()
            .next()
            .expect("checked non-empty nowcast list");
        if self.nowcast_id.as_deref() == Some(&latest.filename) {
            return Ok(false);
        }
        let (chunk, _) =
            build_nowcast_chunk(&self.api, &self.cache_root, self.config.nowcast_minutes)?;
        info!(
            file = latest.filename,
            frames = chunk.manifest.times.len(),
            "nowcast refresh decoded"
        );
        self.nowcast_id = Some(latest.filename);
        self.nowcast = Some(chunk);
        Ok(true)
    }

    fn arome_due(&self) -> bool {
        self.last_arome_check
            .is_none_or(|last| last.elapsed() >= self.config.arome_cadence)
    }

    fn uv_due(&self) -> bool {
        self.last_uv_check
            .is_none_or(|last| last.elapsed() >= self.config.uv_cadence)
    }

    fn refresh_arome(&mut self) -> Result<bool> {
        let checked_at = Instant::now();
        let latest = latest_files(&self.api, AROME_DATASET, AROME_VERSION, 1)?
            .into_iter()
            .next()
            .expect("checked non-empty AROME list");
        if self.arome_id.as_deref() == Some(&latest.filename) {
            self.last_arome_check = Some(checked_at);
            info!(file = latest.filename, "arome check found no newer run");
            return Ok(false);
        }
        let started = Instant::now();
        let publication = build_arome_chunks(&self.api, &self.cache_root, self.config.arome_hours)?;
        info!(
            file = latest.filename,
            chunks = publication.chunks.len(),
            frames = publication.chunks[0].manifest.times.len(),
            downloaded_bytes = publication.downloaded_bytes,
            elapsed_seconds = started.elapsed().as_secs_f64(),
            "arome ranged refresh decoded"
        );
        self.arome_id = Some(latest.filename);
        self.arome = publication.chunks;
        self.last_arome_check = Some(checked_at);
        Ok(true)
    }

    fn refresh_uv(&mut self) -> Result<bool> {
        let checked_at = Instant::now();
        let latest = latest_files(&self.api, UV_DATASET, UV_VERSION, 1)?
            .into_iter()
            .next()
            .expect("checked non-empty UV list");
        let id = format!(
            "{}:{}:{}",
            latest.filename, latest.last_modified, latest.size
        );
        let chunk = build_uv_chunk(&self.api, &self.cache_root, &latest, chrono::Utc::now())?;
        let changed = self.uv_id.as_deref() != Some(&id)
            || self.uv.as_ref().map(|chunk| &chunk.filename)
                != chunk.as_ref().map(|chunk| &chunk.filename);
        info!(
            file = latest.filename,
            last_modified = latest.last_modified,
            frames = chunk
                .as_ref()
                .map(|chunk| chunk.manifest.times.len())
                .unwrap_or(0),
            active = chunk.is_some(),
            "uv quarter-hour batch decoded"
        );
        self.uv_id = Some(id);
        self.uv = chunk;
        self.last_uv_check = Some(checked_at);
        Ok(changed)
    }

    fn publish(&self) -> Result<()> {
        let rtcor = self.rtcor.as_ref().context("RTCOR is not ready")?;
        let nowcast = self.nowcast.as_ref().context("nowcast is not ready")?;
        if self.arome.is_empty() {
            anyhow::bail!("AROME is not ready");
        }
        let now = rtcor
            .manifest
            .times
            .last()
            .context("RTCOR chunk has no frames")?
            .clone();
        let mut chunks = vec![rtcor, nowcast];
        chunks.extend(self.arome.iter());
        if let Some(uv) = &self.uv {
            chunks.push(uv);
        }
        let manifest = publish(&self.config.data_dir, now, &chunks, self.config.prune_age)?;
        info!(
            chunks = manifest.chunks.len(),
            generated = manifest.generated,
            "manifest atomically published"
        );
        Ok(())
    }

    fn poll(&mut self) {
        let mut changed = false;
        match self.refresh_rtcor() {
            Ok(value) => changed |= value,
            Err(error) => {
                error!(error = %format!("{error:#}"), "rtcor refresh failed; retaining published chunk")
            }
        }
        match self.refresh_nowcast() {
            Ok(value) => changed |= value,
            Err(error) => {
                error!(error = %format!("{error:#}"), "nowcast refresh failed; retaining published chunk")
            }
        }
        if self.arome_due() {
            match self.refresh_arome() {
                Ok(value) => changed |= value,
                Err(error) => {
                    error!(error = %format!("{error:#}"), "arome refresh failed; retaining published chunk")
                }
            }
        }
        if self.uv_due() {
            match self.refresh_uv() {
                Ok(value) => changed |= value,
                Err(error) => {
                    error!(error = %format!("{error:#}"), "uv refresh failed; retaining published chunk")
                }
            }
        }
        if changed {
            if let Err(error) = self.publish() {
                error!(error = %format!("{error:#}"), "publish failed; previous manifest remains active");
            } else if let Err(error) = prune_download_cache(&self.cache_root, self.config.cache_age)
            {
                warn!(error = %format!("{error:#}"), "download-cache pruning failed");
            }
        } else {
            info!("poll complete; no new products");
        }
    }
}

fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()))
        .with_ansi(false)
        .init();
    let config = Config::parse();
    let once = config.once;
    let run_for = config.run_for;
    let cadence = config.radar_cadence;
    let mut daemon = Daemon::new(config)?;
    daemon.initialize()?;
    if once {
        return Ok(());
    }
    let started = Instant::now();
    loop {
        if run_for.is_some_and(|duration| started.elapsed() >= duration) {
            info!(
                elapsed_seconds = started.elapsed().as_secs(),
                "requested run duration completed"
            );
            return Ok(());
        }
        let sleep_for = run_for
            .map(|duration| duration.saturating_sub(started.elapsed()).min(cadence))
            .unwrap_or(cadence);
        thread::sleep(sleep_for);
        daemon.poll();
    }
}

fn read_env_file_key(path: &str, name: &str) -> Result<Option<String>> {
    let contents = match fs::read_to_string(path) {
        Ok(contents) => contents,
        Err(error) if error.kind() == ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error.into()),
    };
    for line in contents.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let Some((key, value)) = line.split_once('=') else {
            continue;
        };
        if key.trim() == name {
            let value = value.trim();
            let value = value
                .strip_prefix('"')
                .and_then(|value| value.strip_suffix('"'))
                .or_else(|| {
                    value
                        .strip_prefix('\'')
                        .and_then(|value| value.strip_suffix('\''))
                })
                .unwrap_or(value);
            return Ok(Some(value.to_owned()));
        }
    }
    Ok(None)
}

#[cfg(test)]
mod tests {
    use std::io::Write;

    use super::*;

    #[test]
    fn reads_quoted_key_from_env_file() {
        let mut file = tempfile::NamedTempFile::new().unwrap();
        writeln!(file, "# ignored\nKNMI_OPEN_DATA_API_KEY='registered-key'").unwrap();
        assert_eq!(
            read_env_file_key(file.path().to_str().unwrap(), "KNMI_OPEN_DATA_API_KEY").unwrap(),
            Some("registered-key".to_owned())
        );
    }
}
