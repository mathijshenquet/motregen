use std::{
    fs,
    io::ErrorKind,
    path::PathBuf,
    sync::mpsc::{self, Receiver, SyncSender, TryRecvError},
    thread,
    time::{Duration, Instant},
};

use anyhow::{Context, Result, ensure};
use clap::Parser;
use motregen_ingest::{
    api::{ApiClient, RemoteFile},
    pipeline::{
        AROME_DATASET, AROME_VERSION, NOWCAST_DATASET, NOWCAST_VERSION, RTCOR_DATASET,
        RTCOR_VERSION, SEAMLESS_DATASET, SEAMLESS_VERSION, UV_DATASET, UV_VERSION,
        build_arome_chunks, build_nowcast_chunk, build_rtcor_chunk, build_seamless_chunk_for_file,
        build_uv_chunk, latest_files, prune_download_cache,
    },
    publisher::{ProducedChunk, publish},
    wind_prior::WindTimeline,
};
use tracing::{error, info, warn};
use tracing_subscriber::EnvFilter;

#[derive(Parser)]
#[command(about = "Turn live KNMI weather products into motregen mrf chunks")]
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
        env = "MOTREGEN_SEAMLESS_CADENCE",
        default_value = "15m",
        value_parser = parse_duration
    )]
    seamless_cadence: Duration,
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

struct SeamlessJob {
    file: RemoteFile,
    wind: WindTimeline,
    previous_calibration: Option<motion::Calibration>,
}

struct SeamlessOutcome {
    file: String,
    wind_run: String,
    checked_at: Instant,
    elapsed: Duration,
    result: Result<(ProducedChunk, motion::CalibrationReport)>,
}

struct SeamlessWorker {
    jobs: SyncSender<SeamlessJob>,
    outcomes: Receiver<SeamlessOutcome>,
    busy: bool,
}

impl SeamlessWorker {
    fn new(api: ApiClient, cache_root: PathBuf, start_after_minutes: u32) -> Result<Self> {
        let (jobs, job_receiver) = mpsc::sync_channel::<SeamlessJob>(1);
        let (outcome_sender, outcomes) = mpsc::channel();
        thread::Builder::new()
            .name("seamless-refresh".into())
            .spawn(move || {
                while let Ok(job) = job_receiver.recv() {
                    let started = Instant::now();
                    let file = job.file.filename.clone();
                    let wind_run = job.wind.run.clone();
                    let result = build_seamless_chunk_for_file(
                        &api,
                        &cache_root,
                        &job.file,
                        start_after_minutes,
                        &job.wind,
                        job.previous_calibration,
                    );
                    if outcome_sender
                        .send(SeamlessOutcome {
                            file,
                            wind_run,
                            checked_at: started,
                            elapsed: started.elapsed(),
                            result,
                        })
                        .is_err()
                    {
                        return;
                    }
                }
            })?;
        Ok(Self {
            jobs,
            outcomes,
            busy: false,
        })
    }

    fn start(&mut self, job: SeamlessJob) -> Result<()> {
        ensure!(!self.busy, "seamless worker already has an active refresh");
        self.jobs
            .send(job)
            .context("seamless worker stopped before accepting a refresh")?;
        self.busy = true;
        Ok(())
    }

    fn try_outcome(&mut self) -> Result<Option<SeamlessOutcome>> {
        if !self.busy {
            return Ok(None);
        }
        match self.outcomes.try_recv() {
            Ok(outcome) => {
                self.busy = false;
                Ok(Some(outcome))
            }
            Err(TryRecvError::Empty) => Ok(None),
            Err(TryRecvError::Disconnected) => {
                anyhow::bail!("seamless worker stopped without returning its active refresh")
            }
        }
    }

    fn wait_outcome(&mut self) -> Result<SeamlessOutcome> {
        ensure!(self.busy, "seamless worker has no active refresh");
        let outcome = self
            .outcomes
            .recv()
            .context("seamless worker stopped without returning its active refresh")?;
        self.busy = false;
        Ok(outcome)
    }
}

struct Daemon {
    config: Config,
    api: ApiClient,
    seamless_worker: SeamlessWorker,
    cache_root: PathBuf,
    rtcor_id: Option<String>,
    nowcast_id: Option<String>,
    seamless_id: Option<String>,
    arome_id: Option<String>,
    uv_id: Option<String>,
    rtcor: Option<ProducedChunk>,
    nowcast: Option<ProducedChunk>,
    seamless: Option<ProducedChunk>,
    arome: Vec<ProducedChunk>,
    uv: Option<ProducedChunk>,
    wind: Option<WindTimeline>,
    rtcor_calibration: Option<motion::Calibration>,
    nowcast_calibration: Option<motion::Calibration>,
    seamless_calibration: Option<motion::Calibration>,
    arome_calibration: Option<motion::Calibration>,
    last_arome_check: Option<Instant>,
    last_seamless_check: Option<Instant>,
    last_uv_check: Option<Instant>,
    manifest_dirty: bool,
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
        let seamless_worker =
            SeamlessWorker::new(api.clone(), cache_root.clone(), config.nowcast_minutes)?;
        Ok(Self {
            config,
            api,
            seamless_worker,
            cache_root,
            rtcor_id: None,
            nowcast_id: None,
            seamless_id: None,
            arome_id: None,
            uv_id: None,
            rtcor: None,
            nowcast: None,
            seamless: None,
            arome: Vec::new(),
            uv: None,
            wind: None,
            rtcor_calibration: None,
            nowcast_calibration: None,
            seamless_calibration: None,
            arome_calibration: None,
            last_arome_check: None,
            last_seamless_check: None,
            last_uv_check: None,
            manifest_dirty: false,
        })
    }

    fn initialize(&mut self) -> Result<()> {
        info!("startup backfill begins");
        let changed = self.refresh_arome()?;
        self.publish_after(changed)?;
        let changed = self.refresh_rtcor()?;
        self.publish_after(changed)?;
        let changed = self.refresh_nowcast()?;
        self.publish_after(changed)?;
        self.schedule_seamless()?;
        let changed = self.refresh_uv()?;
        self.publish_after(changed)?;
        if self.config.once {
            let outcome = self.seamless_worker.wait_outcome()?;
            let changed = self.apply_seamless_outcome(outcome)?;
            self.publish_after(changed)?;
        }
        info!("startup critical-path backfill published");
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
        let wind = self
            .wind
            .as_ref()
            .context("AROME wind prior is not ready")?;
        let (chunk, _, calibration) = build_rtcor_chunk(
            &self.api,
            &self.cache_root,
            self.config.history_hours,
            wind,
            self.rtcor_calibration,
        )?;
        log_calibration("rtcor", &chunk.manifest.run, calibration);
        info!(
            file = latest.filename,
            frames = chunk.manifest.times.len(),
            "rtcor refresh decoded"
        );
        self.rtcor_id = Some(latest.filename);
        self.rtcor = Some(chunk);
        self.rtcor_calibration = Some(calibration.calibration);
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
        let wind = self
            .wind
            .as_ref()
            .context("AROME wind prior is not ready")?;
        let (chunk, _, calibration) = build_nowcast_chunk(
            &self.api,
            &self.cache_root,
            self.config.nowcast_minutes,
            wind,
            self.nowcast_calibration,
        )?;
        log_calibration("nowcast", &chunk.manifest.run, calibration);
        info!(
            file = latest.filename,
            frames = chunk.manifest.times.len(),
            "nowcast refresh decoded"
        );
        self.nowcast_id = Some(latest.filename);
        self.nowcast = Some(chunk);
        self.nowcast_calibration = Some(calibration.calibration);
        Ok(true)
    }

    fn schedule_seamless(&mut self) -> Result<bool> {
        if self.seamless_worker.busy {
            return Ok(false);
        }
        let checked_at = Instant::now();
        let latest = latest_files(&self.api, SEAMLESS_DATASET, SEAMLESS_VERSION, 1)?
            .into_iter()
            .next()
            .expect("checked non-empty seamless list");
        if self.seamless_id.as_deref() == Some(&latest.filename) {
            self.last_seamless_check = Some(checked_at);
            info!(file = latest.filename, "seamless check found no newer run");
            return Ok(false);
        }
        let wind = self
            .wind
            .as_ref()
            .context("AROME wind prior is not ready")?
            .clone();
        let filename = latest.filename.clone();
        self.seamless_worker.start(SeamlessJob {
            file: latest,
            wind,
            previous_calibration: self.seamless_calibration,
        })?;
        info!(file = filename, "seamless refresh scheduled in background");
        Ok(true)
    }

    fn apply_seamless_outcome(&mut self, outcome: SeamlessOutcome) -> Result<bool> {
        let (chunk, calibration) = outcome.result?;
        if self.wind.as_ref().map(|wind| wind.run.as_str()) != Some(outcome.wind_run.as_str()) {
            warn!(
                file = outcome.file,
                wind_run = outcome.wind_run,
                "discarding seamless refresh built against superseded AROME wind"
            );
            self.last_seamless_check = None;
            return Ok(false);
        }
        log_calibration("seamless", &chunk.manifest.run, calibration);
        info!(
            file = outcome.file,
            frames = chunk.manifest.times.len(),
            elapsed_seconds = outcome.elapsed.as_secs_f64(),
            "seamless ensemble-median refresh decoded"
        );
        self.seamless_id = Some(outcome.file);
        self.seamless = Some(chunk);
        self.seamless_calibration = Some(calibration.calibration);
        self.last_seamless_check = Some(outcome.checked_at);
        Ok(true)
    }

    fn collect_seamless(&mut self) -> Result<bool> {
        let Some(outcome) = self.seamless_worker.try_outcome()? else {
            return Ok(false);
        };
        self.apply_seamless_outcome(outcome)
    }

    fn seamless_due(&self) -> bool {
        self.last_seamless_check
            .is_none_or(|last| last.elapsed() >= self.config.seamless_cadence)
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
        let publication = build_arome_chunks(
            &self.api,
            &self.cache_root,
            self.config.arome_hours,
            self.arome_calibration,
        )?;
        log_calibration(
            "harmonie",
            &publication.chunks[0].manifest.run,
            publication.calibration,
        );
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
        self.wind = Some(publication.wind);
        self.arome_calibration = Some(publication.calibration.calibration);
        self.rtcor_id = None;
        self.nowcast_id = None;
        self.seamless_id = None;
        self.last_seamless_check = None;
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
        if self.arome.is_empty() {
            anyhow::bail!("AROME is not ready");
        }
        let now = rtcor
            .manifest
            .times
            .last()
            .context("RTCOR chunk has no frames")?
            .clone();
        let mut chunks = vec![rtcor];
        if let Some(nowcast) = &self.nowcast {
            chunks.push(nowcast);
        }
        if let Some(seamless) = &self.seamless {
            chunks.push(seamless);
        }
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

    fn publish_after(&mut self, changed: bool) -> Result<()> {
        self.manifest_dirty |= changed;
        if !self.manifest_dirty || self.rtcor.is_none() || self.arome.is_empty() {
            return Ok(());
        }
        self.publish()?;
        self.manifest_dirty = false;
        if let Err(error) = prune_download_cache(&self.cache_root, self.config.cache_age) {
            warn!(error = %format!("{error:#}"), "download-cache pruning failed");
        }
        Ok(())
    }

    fn finish_refresh(&mut self, source: &str, result: Result<bool>) -> bool {
        match result {
            Ok(changed) => {
                if let Err(error) = self.publish_after(changed) {
                    error!(
                        source,
                        error = %format!("{error:#}"),
                        "source publish failed; previous manifest remains active"
                    );
                }
                changed
            }
            Err(error) => {
                error!(
                    source,
                    error = %format!("{error:#}"),
                    "source refresh failed; retaining published chunk"
                );
                false
            }
        }
    }

    fn poll(&mut self) {
        let mut activity = false;
        let result = self.collect_seamless();
        activity |= self.finish_refresh("seamless", result);
        if self.arome_due() {
            let result = self.refresh_arome();
            activity |= self.finish_refresh("arome", result);
        }
        let result = self.refresh_rtcor();
        activity |= self.finish_refresh("rtcor", result);
        let result = self.refresh_nowcast();
        activity |= self.finish_refresh("nowcast", result);
        if self.seamless_id.is_none() || self.seamless_due() {
            match self.schedule_seamless() {
                Ok(scheduled) => activity |= scheduled,
                Err(error) => {
                    error!(
                        source = "seamless",
                        error = %format!("{error:#}"),
                        "source refresh failed; retaining published chunk"
                    );
                }
            }
        }
        if self.uv_due() {
            let result = self.refresh_uv();
            activity |= self.finish_refresh("uv", result);
        }
        let result = self.collect_seamless();
        activity |= self.finish_refresh("seamless", result);
        if !activity {
            info!("poll complete; no new products");
        }
    }
}

fn log_calibration(source: &str, run: &str, report: motion::CalibrationReport) {
    info!(
        source,
        run,
        scale = report.calibration.scale,
        rotation_degrees = report.calibration.rotation_radians.to_degrees(),
        reliable_samples = report.reliable_samples,
        calibration_source = ?report.source,
        "motion wind calibration"
    );
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

    fn test_chunk(source: &str, run: &str, filename: &str) -> ProducedChunk {
        let meta = mrf::ChunkMeta::standard(
            mrf::Grid {
                crs: "EPSG:3857".into(),
                x0: 0.0,
                y0: 1.0,
                dx: 1.0,
                dy: -1.0,
                width: 1,
                height: 1,
            },
            source,
            run,
            vec![run.to_owned()],
        );
        motregen_ingest::publisher::produced_chunk(
            filename.into(),
            mrf::encode(&[vec![0]], &meta).unwrap(),
        )
        .unwrap()
    }

    fn idle_test_worker() -> SeamlessWorker {
        let (jobs, _job_receiver) = mpsc::sync_channel(1);
        let (_outcome_sender, outcomes) = mpsc::channel();
        SeamlessWorker {
            jobs,
            outcomes,
            busy: false,
        }
    }

    fn test_daemon(data_dir: PathBuf, seamless_worker: SeamlessWorker) -> Daemon {
        let api = ApiClient::new("test-key".into(), Some("http://127.0.0.1".into())).unwrap();
        Daemon {
            config: Config {
                api_key: None,
                data_dir: data_dir.clone(),
                radar_cadence: Duration::from_secs(60),
                seamless_cadence: Duration::from_secs(900),
                arome_cadence: Duration::from_secs(10_800),
                uv_cadence: Duration::from_secs(900),
                history_hours: 1,
                nowcast_minutes: 120,
                arome_hours: 1,
                prune_age: Duration::from_secs(21_600),
                cache_age: Duration::from_secs(43_200),
                once: false,
                run_for: None,
                api_base: Some("http://127.0.0.1".into()),
            },
            api,
            seamless_worker,
            cache_root: data_dir.join(".ingest-cache"),
            rtcor_id: None,
            nowcast_id: None,
            seamless_id: None,
            arome_id: None,
            uv_id: None,
            rtcor: None,
            nowcast: None,
            seamless: None,
            arome: Vec::new(),
            uv: None,
            wind: None,
            rtcor_calibration: None,
            nowcast_calibration: None,
            seamless_calibration: None,
            arome_calibration: None,
            last_arome_check: None,
            last_seamless_check: None,
            last_uv_check: None,
            manifest_dirty: false,
        }
    }

    #[test]
    fn reads_quoted_key_from_env_file() {
        let mut file = tempfile::NamedTempFile::new().unwrap();
        writeln!(file, "# ignored\nKNMI_OPEN_DATA_API_KEY='registered-key'").unwrap();
        assert_eq!(
            read_env_file_key(file.path().to_str().unwrap(), "KNMI_OPEN_DATA_API_KEY").unwrap(),
            Some("registered-key".to_owned())
        );
    }

    #[test]
    fn startup_manifest_does_not_wait_for_optional_forecasts() {
        let directory = tempfile::tempdir().unwrap();
        let mut daemon = test_daemon(directory.path().into(), idle_test_worker());
        daemon.rtcor = Some(test_chunk(
            "rtcor",
            "2026-08-31T20:00:00Z",
            "rtcor-startup.mrf",
        ));
        daemon.arome.push(test_chunk(
            "harmonie",
            "2026-08-31T17:00:00Z",
            "harmonie-startup.mrf",
        ));

        daemon.publish_after(true).unwrap();

        let manifest: motregen_ingest::publisher::Manifest =
            serde_json::from_slice(&fs::read(directory.path().join("manifest.json")).unwrap())
                .unwrap();
        assert_eq!(
            manifest
                .chunks
                .iter()
                .map(|chunk| chunk.source.as_str())
                .collect::<Vec<_>>(),
            ["rtcor", "harmonie"]
        );
    }

    #[test]
    fn slow_seamless_does_not_delay_fresh_rtcor_manifest() {
        let directory = tempfile::tempdir().unwrap();
        let (jobs, job_receiver) = mpsc::sync_channel(1);
        let (_outcome_sender, outcomes) = mpsc::channel();
        let (started_sender, started_receiver) = mpsc::channel();
        thread::spawn(move || {
            let _job = job_receiver.recv().unwrap();
            started_sender.send(()).unwrap();
            thread::sleep(Duration::from_secs(1));
        });
        let worker = SeamlessWorker {
            jobs,
            outcomes,
            busy: false,
        };
        let mut daemon = test_daemon(directory.path().into(), worker);
        let wind = WindTimeline::new(
            "2026-08-31T17:00:00Z".into(),
            vec![
                chrono::DateTime::parse_from_rfc3339("2026-08-31T17:00:00Z")
                    .unwrap()
                    .with_timezone(&chrono::Utc),
            ],
            vec![vec![Some((0.0, 0.0))]],
        )
        .unwrap();
        daemon.wind = Some(wind.clone());
        daemon.rtcor = Some(test_chunk("rtcor", "2026-08-31T20:00:00Z", "rtcor-old.mrf"));
        daemon.nowcast = Some(test_chunk(
            "nowcast",
            "2026-08-31T20:00:00Z",
            "nowcast-current.mrf",
        ));
        daemon.seamless = Some(test_chunk(
            "seamless",
            "2026-08-31T20:00:00Z",
            "seamless-running.mrf",
        ));
        daemon.arome.push(test_chunk(
            "harmonie",
            "2026-08-31T17:00:00Z",
            "harmonie-current.mrf",
        ));
        daemon.publish_after(true).unwrap();
        daemon
            .seamless_worker
            .start(SeamlessJob {
                file: RemoteFile {
                    filename: "slow-seamless.nc".into(),
                    size: 1,
                    last_modified: "2026-08-31T20:05:00Z".into(),
                },
                wind,
                previous_calibration: None,
            })
            .unwrap();
        started_receiver.recv().unwrap();

        daemon.rtcor = Some(test_chunk(
            "rtcor",
            "2026-08-31T20:05:00Z",
            "rtcor-fresh.mrf",
        ));
        let started = Instant::now();
        daemon.publish_after(true).unwrap();
        let publication_elapsed = started.elapsed();

        let manifest: motregen_ingest::publisher::Manifest =
            serde_json::from_slice(&fs::read(directory.path().join("manifest.json")).unwrap())
                .unwrap();
        assert_eq!(manifest.now, "2026-08-31T20:05:00Z");
        assert!(
            manifest
                .chunks
                .iter()
                .any(|chunk| chunk.url == "chunks/rtcor-fresh.mrf")
        );
        assert!(daemon.seamless_worker.try_outcome().unwrap().is_none());
        assert!(publication_elapsed < Duration::from_millis(250));
    }
}
