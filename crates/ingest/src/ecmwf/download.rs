use std::{
    fs,
    path::{Path, PathBuf},
    sync::{
        Mutex,
        atomic::{AtomicBool, AtomicU64, Ordering},
    },
    thread,
    time::{Duration as Wait, Instant},
};

use anyhow::{Context, Result, bail, ensure};
use chrono::{DateTime, Duration, NaiveDate, NaiveTime, Timelike, Utc};
use eccodes::{CodesFile, FallibleIterator, KeyRead, ProductKind};
use rayon::prelude::*;
use reqwest::{StatusCode, blocking::Client, header};
use serde::Deserialize;
use tracing::{info, warn};

use super::{CROP, EcmwfRun, Message, Parameter, forecast_steps};
use crate::publisher::atomic_write;

pub const DEFAULT_BASE: &str = "https://data.ecmwf.int/forecasts";
pub const AWS_BASE: &str = "https://ecmwf-forecasts.s3.eu-central-1.amazonaws.com";
const ATTEMPTS: u32 = 4;

fn overload_delay(retry_after: Option<&str>, now: DateTime<Utc>, attempt: u32) -> Wait {
    let backoff = Wait::from_secs(5 << attempt);
    let requested = retry_after
        .and_then(|value| {
            value
                .trim()
                .parse::<u64>()
                .ok()
                .map(Wait::from_secs)
                .or_else(|| {
                    DateTime::parse_from_rfc2822(value).ok().map(|date| {
                        (date.with_timezone(&Utc) - now)
                            .to_std()
                            .unwrap_or_default()
                    })
                })
        })
        .unwrap_or_default();
    backoff.max(requested)
}

#[derive(Clone, Debug, Deserialize)]
struct IndexEntry {
    param: String,
    step: String,
    levtype: String,
    #[serde(rename = "_offset")]
    offset: u64,
    #[serde(rename = "_length")]
    length: u64,
}

fn parse_index(bytes: &[u8]) -> Result<Vec<IndexEntry>> {
    std::str::from_utf8(bytes)?
        .lines()
        .filter(|line| !line.trim().is_empty())
        .map(|line| serde_json::from_str(line).context("invalid ECMWF index line"))
        .collect()
}

fn selected(entries: &[IndexEntry], probability: bool, step: u32) -> Result<Vec<IndexEntry>> {
    let parameters: &[Parameter] = if probability {
        &[Parameter::Prob1, Parameter::Prob5]
    } else {
        &Parameter::FORECAST
    };
    let mut result = Vec::new();
    for parameter in parameters {
        let mut matches = entries
            .iter()
            .filter(|entry| {
                entry.levtype == "sfc" && Parameter::from_name(&entry.param) == Some(*parameter)
            })
            .cloned()
            .collect::<Vec<_>>();
        if *parameter == Parameter::Gust && matches.iter().any(|entry| entry.param == "10fg3") {
            matches.retain(|entry| entry.param == "10fg3");
        }
        ensure!(
            !matches.is_empty(),
            "index lacks {parameter:?} at step {step}"
        );
        if !probability {
            ensure!(
                matches.len() == 1 && matches[0].step == step.to_string(),
                "ambiguous {parameter:?} at step {step}"
            );
        }
        for entry in &matches {
            parse_step_range(&entry.step)?;
            ensure!(
                entry.length >= 20 && entry.offset.checked_add(entry.length).is_some(),
                "invalid GRIB range"
            );
        }
        result.extend(matches);
    }
    Ok(result)
}

pub struct OpenDataClient {
    client: Client,
    base: String,
    cache: PathBuf,
    downloaded: AtomicU64,
    throttled: AtomicBool,
    prefer_mirror: AtomicBool,
    serial_request: Mutex<()>,
    resume_at: Mutex<Option<Instant>>,
}

impl OpenDataClient {
    pub fn new(data_dir: &Path, base: Option<String>) -> Result<Self> {
        Ok(Self {
            client: Client::builder()
                .connect_timeout(Wait::from_secs(30))
                .timeout(Wait::from_secs(120))
                .user_agent("motregen-ecmwf/0.1 (motregen.nl)")
                .build()?,
            base: base
                .unwrap_or_else(|| DEFAULT_BASE.to_owned())
                .trim_end_matches('/')
                .to_owned(),
            cache: data_dir.join(".ecmwf-cache"),
            downloaded: AtomicU64::new(0),
            throttled: AtomicBool::new(false),
            prefer_mirror: AtomicBool::new(false),
            serial_request: Mutex::new(()),
            resume_at: Mutex::new(None),
        })
    }

    pub fn downloaded_bytes(&self) -> u64 {
        self.downloaded.load(Ordering::Relaxed)
    }

    pub fn prune_cache(&self, published_run: DateTime<Utc>) -> Result<()> {
        let published_directory = self.directory(published_run);
        ensure!(
            published_directory.is_dir(),
            "published ECMWF run has no cache directory"
        );
        for entry in fs::read_dir(&self.cache)? {
            let entry = entry?;
            if entry.file_type()?.is_dir() && entry.path() != published_directory {
                fs::remove_dir_all(entry.path()).with_context(|| {
                    format!("removing ECMWF run cache {}", entry.path().display())
                })?;
            }
        }
        Ok(())
    }

    fn prefix(&self, run: DateTime<Utc>, probability: bool, step: u32) -> String {
        let (stream, kind) = if probability {
            ("enfo", "ep")
        } else {
            ("oper", "fc")
        };
        format!(
            "{}/{}/{:02}z/ifs/0p25/{stream}/{}-{step}h-{stream}-{kind}",
            self.base,
            run.format("%Y%m%d"),
            run.hour(),
            run.format("%Y%m%d%H%M%S")
        )
    }

    fn directory(&self, run: DateTime<Utc>) -> PathBuf {
        self.cache.join(run.format("%Y%m%dT%H").to_string())
    }

    fn request_url(&self, url: &str) -> String {
        if self.prefer_mirror.load(Ordering::Relaxed)
            && let Some(suffix) = url.strip_prefix(DEFAULT_BASE)
        {
            return format!("{AWS_BASE}{suffix}");
        }
        url.to_owned()
    }

    fn wait_for_resume(&self) -> Result<()> {
        loop {
            let mut resume = self
                .resume_at
                .lock()
                .map_err(|error| anyhow::anyhow!("ECMWF cooldown lock poisoned: {error}"))?;
            let now = Instant::now();
            if let Some(until) = *resume
                && until > now
            {
                drop(resume);
                thread::sleep(until - now);
            } else {
                if self.throttled.load(Ordering::Relaxed) {
                    *resume = Some(now + Wait::from_secs(1));
                }
                return Ok(());
            }
        }
    }

    fn record_overload(&self, retry_after: Option<&str>, attempt: u32) -> Result<Wait> {
        self.throttled.store(true, Ordering::Relaxed);
        let delay = overload_delay(retry_after, Utc::now(), attempt);
        let until = Instant::now()
            .checked_add(delay)
            .context("ECMWF Retry-After is too large")?;
        let mut resume = self
            .resume_at
            .lock()
            .map_err(|error| anyhow::anyhow!("ECMWF cooldown lock poisoned: {error}"))?;
        *resume = Some(resume.map_or(until, |previous| previous.max(until)));
        if self.base == DEFAULT_BASE && !self.prefer_mirror.swap(true, Ordering::Relaxed) {
            warn!(
                mirror = AWS_BASE,
                "ECMWF portal overloaded; using the official AWS mirror"
            );
        }
        Ok(delay)
    }

    fn request(&self, url: &str, range: Option<(u64, u64)>) -> Result<Option<Vec<u8>>> {
        let mut last_error = None;
        for attempt in 0..ATTEMPTS {
            let _serial = if self.throttled.load(Ordering::Relaxed) {
                Some(
                    self.serial_request
                        .lock()
                        .map_err(|error| anyhow::anyhow!("ECMWF request lock poisoned: {error}"))?,
                )
            } else {
                None
            };
            self.wait_for_resume()?;
            let target = self.request_url(url);
            let mut overloaded = false;
            let result = (|| -> Result<Option<Vec<u8>>> {
                let mut request = self.client.get(&target);
                if let Some((offset, length)) = range {
                    request = request.header(
                        header::RANGE,
                        format!("bytes={offset}-{}", offset + length - 1),
                    );
                }
                let mut response = request.send()?;
                if response.status() == StatusCode::NOT_FOUND {
                    return Ok(None);
                }
                if matches!(
                    response.status(),
                    StatusCode::TOO_MANY_REQUESTS | StatusCode::SERVICE_UNAVAILABLE
                ) {
                    overloaded = true;
                    let retry_after = response
                        .headers()
                        .get(header::RETRY_AFTER)
                        .and_then(|value| value.to_str().ok());
                    let delay = self.record_overload(retry_after, attempt)?;
                    warn!(url = target, status = %response.status(), retry_after, delay_seconds = delay.as_secs_f64(), concurrency = 1, "ECMWF throttled; waiting before further requests");
                }
                response.error_for_status_ref()?;
                if let Some((offset, length)) = range {
                    ensure!(
                        response.status() == StatusCode::PARTIAL_CONTENT,
                        "server ignored Range for {url}"
                    );
                    let expected = format!("bytes {offset}-{}/", offset + length - 1);
                    ensure!(
                        response
                            .headers()
                            .get(header::CONTENT_RANGE)
                            .and_then(|value| value.to_str().ok())
                            .is_some_and(|value| value.starts_with(&expected)),
                        "incorrect Content-Range for {url}"
                    );
                }
                let mut bytes = Vec::new();
                response.copy_to(&mut bytes)?;
                self.downloaded
                    .fetch_add(bytes.len() as u64, Ordering::Relaxed);
                if let Some((_, length)) = range {
                    ensure!(bytes.len() as u64 == length, "short GRIB range from {url}");
                    ensure!(valid_grib(&bytes), "invalid GRIB2 range from {url}");
                }
                Ok(Some(bytes))
            })();
            match result {
                Ok(bytes) => return Ok(bytes),
                Err(error) => {
                    warn!(url = target, attempt = attempt + 1, error = %error, "ECMWF request failed");
                    last_error = Some(error);
                    if !overloaded && attempt + 1 < ATTEMPTS {
                        thread::sleep(Wait::from_secs(1 << attempt));
                    }
                }
            }
        }
        Err(last_error.expect("at least one attempt"))
    }

    fn index(
        &self,
        run: DateTime<Utc>,
        probability: bool,
        step: u32,
    ) -> Result<Option<Vec<IndexEntry>>> {
        let kind = if probability { "ep" } else { "fc" };
        let path = self.directory(run).join(format!("{step}-{kind}.index"));
        if path.exists() {
            let entries = parse_index(&fs::read(path)?)?;
            selected(&entries, probability, step)?;
            return Ok(Some(entries));
        }
        let url = format!("{}.index", self.prefix(run, probability, step));
        let Some(bytes) = self.request(&url, None)? else {
            return Ok(None);
        };
        let entries = parse_index(&bytes)?;
        selected(&entries, probability, step)?;
        atomic_write(&path, &bytes)?;
        Ok(Some(entries))
    }

    pub fn latest_run(&self, now: DateTime<Utc>) -> Result<DateTime<Utc>> {
        let latest = now
            .date_naive()
            .and_hms_opt(if now.hour() >= 12 { 12 } else { 0 }, 0, 0)
            .unwrap()
            .and_utc();
        for half_days in 0..4 {
            let run = latest - Duration::hours(half_days * 12);
            if self.index(run, false, 240)?.is_some() && self.index(run, true, 240)?.is_some() {
                // At the timer's scheduled time, yesterday's run must fail so systemd retries.
                ensure!(
                    now - run < Duration::hours(18),
                    "latest complete ECMWF run {run} is too old; retry when the new run is available"
                );
                return Ok(run);
            }
        }
        bail!("no complete ECMWF 00/12 UTC run in the rolling archive")
    }

    fn download_message(
        &self,
        run: DateTime<Utc>,
        probability: bool,
        step: u32,
        entry: &IndexEntry,
    ) -> Result<PathBuf> {
        let kind = if probability { "ep" } else { "fc" };
        let path = self.directory(run).join(format!(
            "{step}-{kind}-{}-{}.grib2",
            entry.param, entry.step
        ));
        if let Ok(bytes) = fs::read(&path)
            && bytes.len() as u64 == entry.length
            && valid_grib(&bytes)
        {
            return Ok(path);
        }
        let url = format!("{}.grib2", self.prefix(run, probability, step));
        let bytes = self
            .request(&url, Some((entry.offset, entry.length)))?
            .with_context(|| format!("ECMWF GRIB disappeared: {url}"))?;
        atomic_write(&path, &bytes)?;
        Ok(path)
    }

    pub fn fetch(&self, run: DateTime<Utc>) -> Result<EcmwfRun> {
        let pool = rayon::ThreadPoolBuilder::new().num_threads(4).build()?;
        let mut steps = forecast_steps()
            .into_iter()
            .map(|step| (false, step))
            .collect::<Vec<_>>();
        steps.push((true, 240));
        let jobs = pool
            .install(|| {
                steps
                    .par_iter()
                    .map(|(probability, step)| {
                        let entries = self
                            .index(run, *probability, *step)?
                            .context("ECMWF step index disappeared")?;
                        Ok(selected(&entries, *probability, *step)?
                            .into_iter()
                            .map(|entry| (*probability, *step, entry))
                            .collect::<Vec<_>>())
                    })
                    .collect::<Result<Vec<_>>>()
            })?
            .into_iter()
            .flatten()
            .collect::<Vec<_>>();
        info!(%run, ranges = jobs.len(), "downloading ECMWF ranges, reusing cached messages");
        let paths = pool.install(|| {
            jobs.par_iter()
                .map(|(probability, step, entry)| {
                    self.download_message(run, *probability, *step, entry)
                })
                .collect::<Result<Vec<_>>>()
        })?;
        let mut messages = Vec::with_capacity(paths.len());
        for (path, (_, _, entry)) in paths.iter().zip(&jobs) {
            let message = decode_message(path)?;
            ensure!(
                message.run == run && Parameter::from_name(&entry.param) == Some(message.parameter),
                "GRIB disagrees with index at {}",
                path.display()
            );
            let (start, end) = parse_step_range(&entry.step)?;
            ensure!(
                message.end == end && (start == end || message.start == start),
                "GRIB stepRange disagrees with index at {}",
                path.display()
            );
            messages.push(message);
        }
        info!(%run, messages = messages.len(), downloaded_bytes = self.downloaded_bytes(), "ECMWF ranges decoded");
        Ok(EcmwfRun { run, messages })
    }
}

fn valid_grib(bytes: &[u8]) -> bool {
    bytes.len() >= 20
        && &bytes[..4] == b"GRIB"
        && bytes[7] == 2
        && &bytes[bytes.len() - 4..] == b"7777"
        && u64::from_be_bytes(bytes[8..16].try_into().unwrap()) == bytes.len() as u64
}

pub fn parse_step_range(range: &str) -> Result<(u32, u32)> {
    let (start, end) = range.split_once('-').unwrap_or((range, range));
    let start = start.parse()?;
    let end = end.parse()?;
    ensure!(start <= end, "reversed stepRange {range}");
    Ok((start, end))
}

pub fn decode_message(path: &Path) -> Result<Message> {
    let _guard = crate::GRIB_DECODER_LOCK
        .lock()
        .map_err(|error| anyhow::anyhow!("GRIB decoder lock poisoned: {error}"))?;
    let mut file = CodesFile::new_from_file(path, ProductKind::GRIB)?;
    let mut messages = file.ref_message_iter();
    let handle = messages.next()?.context("empty ECMWF GRIB")?;
    let integer = |key: &str| -> Result<i64> {
        handle
            .read_key(key)
            .with_context(|| format!("reading GRIB key {key}"))
    };
    let float = |key: &str| -> Result<f64> {
        handle
            .read_key(key)
            .with_context(|| format!("reading GRIB key {key}"))
    };
    let string = |key: &str| -> Result<String> {
        handle
            .read_key(key)
            .with_context(|| format!("reading GRIB key {key}"))
    };
    ensure!(
        integer("edition")? == 2 && string("gridType")? == "regular_ll",
        "expected regular_ll GRIB2"
    );
    ensure!(
        integer("iScansNegatively")? == 0
            && integer("jScansPositively")? == 0
            && integer("jPointsAreConsecutive")? == 0
            && integer("alternativeRowScanning")? == 0,
        "unsupported ECMWF scanning mode"
    );
    ensure!(
        integer("stepUnits")? == 1,
        "ECMWF stepRange is not in hours"
    );
    let parameter =
        Parameter::from_name(&string("shortName")?).context("unknown ECMWF parameter")?;
    let date = NaiveDate::parse_from_str(&integer("dataDate")?.to_string(), "%Y%m%d")?;
    let time = integer("dataTime")?;
    let run = date
        .and_time(
            NaiveTime::from_hms_opt((time / 100) as u32, (time % 100) as u32, 0)
                .context("invalid dataTime")?,
        )
        .and_utc();
    let (start, end) = parse_step_range(&string("stepRange")?)?;
    let step_type = string("stepType")?;
    let expected_type = match parameter {
        Parameter::Precip | Parameter::Prob1 | Parameter::Prob5 => "accum",
        Parameter::Tmax | Parameter::Gust => "max",
        Parameter::Tmin => "min",
        Parameter::Temp | Parameter::U | Parameter::V | Parameter::Cloud => "instant",
    };
    ensure!(
        step_type == expected_type,
        "unexpected {parameter:?} stepType {step_type}"
    );
    let units = string("units")?;
    let expected_units = match parameter {
        Parameter::Precip => "m",
        Parameter::Tmax | Parameter::Tmin | Parameter::Temp => "K",
        Parameter::U | Parameter::V | Parameter::Gust => "m s**-1",
        Parameter::Cloud => "(0 - 1)",
        Parameter::Prob1 | Parameter::Prob5 => "%",
    };
    ensure!(
        units == expected_units,
        "unexpected {parameter:?} units {units}"
    );
    let ni = usize::try_from(integer("Ni")?)?;
    let nj = usize::try_from(integer("Nj")?)?;
    let lon0 = float("longitudeOfFirstGridPointInDegrees")?;
    let lat0 = float("latitudeOfFirstGridPointInDegrees")?;
    let dx = float("iDirectionIncrementInDegrees")?;
    let dy = float("jDirectionIncrementInDegrees")?;
    ensure!(
        (dx - 0.25).abs() < 1e-9 && (dy - 0.25).abs() < 1e-9,
        "unexpected ECMWF resolution"
    );
    let values: Vec<f64> = handle.read_key("values")?;
    ensure!(
        values.len() == ni * nj,
        "ECMWF values disagree with grid size"
    );
    let bitmap = integer("bitmapPresent")? == 1;
    let missing = if bitmap {
        float("missingValue").or_else(|_| integer("missingValue").map(|value| value as f64))?
    } else {
        f64::NAN
    };
    let mut cropped = Vec::with_capacity(CROP.cell_count());
    for row in 0..CROP.nj {
        let lat = CROP.lat0 + row as f64 * CROP.dlat;
        let j = ((lat0 - lat) / dy).round() as usize;
        ensure!(
            j < nj && (lat0 - j as f64 * dy - lat).abs() < 1e-8,
            "ECMWF latitude outside grid"
        );
        for column in 0..CROP.ni {
            let lon = CROP.lon0 + column as f64 * CROP.dlon;
            let i = ((lon - lon0).rem_euclid(360.0) / dx).round() as usize;
            ensure!(i < ni, "ECMWF longitude outside grid");
            let value = values[j * ni + i];
            let value = if !value.is_finite() || bitmap && value == missing {
                f32::NAN
            } else {
                match parameter {
                    Parameter::Precip => (value * 1000.0) as f32,
                    Parameter::Tmax | Parameter::Tmin | Parameter::Temp => (value - 273.15) as f32,
                    Parameter::Cloud => (value * 100.0) as f32,
                    _ => value as f32,
                }
            };
            cropped.push(value);
        }
    }
    ensure!(
        messages.next()?.is_none(),
        "range contains multiple GRIB messages"
    );
    Ok(Message {
        run,
        parameter,
        start,
        end,
        values: cropped,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn retry_after_seconds_and_http_dates_override_shorter_backoff() {
        let now: DateTime<Utc> = "2026-10-17T12:00:00Z".parse().unwrap();
        assert_eq!(overload_delay(Some("90"), now, 0), Wait::from_secs(90));
        assert_eq!(
            overload_delay(Some("Sat, 17 Oct 2026 12:01:00 GMT"), now, 1),
            Wait::from_secs(60)
        );
        assert_eq!(
            overload_delay(Some("Sat, 17 Oct 2026 11:59:00 GMT"), now, 2),
            Wait::from_secs(20)
        );
        assert_eq!(overload_delay(Some("invalid"), now, 2), Wait::from_secs(20));
    }

    #[test]
    fn overload_switches_default_source_to_mirror_and_keeps_custom_sources() {
        let directory = tempfile::tempdir().unwrap();
        let client = OpenDataClient::new(directory.path(), None).unwrap();
        let url = format!("{DEFAULT_BASE}/20261017/00z/ifs/0p25/oper/example.grib2");
        assert_eq!(client.request_url(&url), url);
        assert_eq!(
            client.record_overload(Some("90"), 0).unwrap(),
            Wait::from_secs(90)
        );
        assert!(client.throttled.load(Ordering::Relaxed));
        assert!(client.resume_at.lock().unwrap().unwrap() > Instant::now());
        assert_eq!(
            client.request_url(&url),
            format!("{AWS_BASE}/20261017/00z/ifs/0p25/oper/example.grib2")
        );
        let custom =
            OpenDataClient::new(directory.path(), Some("http://127.0.0.1:4321".into())).unwrap();
        custom.record_overload(None, 0).unwrap();
        assert_eq!(
            custom.request_url("http://127.0.0.1:4321/example.grib2"),
            "http://127.0.0.1:4321/example.grib2"
        );
    }

    #[test]
    fn cache_cleanup_keeps_only_the_published_run() {
        let directory = tempfile::tempdir().unwrap();
        let client = OpenDataClient::new(directory.path(), None).unwrap();
        let run = "2026-10-17T00:00:00Z".parse().unwrap();
        let published_directory = client.directory(run);
        let previous_directories = [
            client.directory(run - Duration::hours(12)),
            client.directory(run - Duration::hours(24)),
        ];
        for path in previous_directories.iter().chain([&published_directory]) {
            fs::create_dir_all(path.join("nested")).unwrap();
            fs::write(path.join("nested/message.grib2"), b"cached message").unwrap();
        }

        assert!(client.prune_cache(run + Duration::hours(12)).is_err());
        assert!(previous_directories.iter().all(|path| path.exists()));
        client.prune_cache(run).unwrap();

        assert_eq!(fs::read_dir(&client.cache).unwrap().count(), 1);
        assert!(previous_directories.iter().all(|path| !path.exists()));
        assert_eq!(
            fs::read(published_directory.join("nested/message.grib2")).unwrap(),
            b"cached message"
        );
    }

    #[test]
    fn rust_binding_decodes_real_ccsds_and_crops_wrapped_longitudes() {
        let path = Path::new(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/tests/fixtures/ecmwf-20261017T00-mx2t3-3.grib2"
        ));
        let message = decode_message(path).unwrap();
        assert_eq!(message.parameter, Parameter::Tmax);
        assert_eq!((message.start, message.end), (0, 3));
        assert_eq!(message.values.len(), 408);
        let utrecht = (8 * 24) + 12;
        assert!(
            (message.values[utrecht] - 11.234).abs() < 0.001,
            "{}",
            message.values[utrecht]
        );
    }

    #[test]
    fn gust_prefers_three_hour_message_when_both_are_present() {
        let mut entries = Parameter::FORECAST
            .iter()
            .map(|parameter| IndexEntry {
                param: match parameter {
                    Parameter::Precip => "tp",
                    Parameter::Tmax => "mx2t3",
                    Parameter::Tmin => "mn2t3",
                    Parameter::Temp => "2t",
                    Parameter::U => "10u",
                    Parameter::V => "10v",
                    Parameter::Gust => "10fg",
                    Parameter::Cloud => "tcc",
                    _ => unreachable!(),
                }
                .into(),
                step: "3".into(),
                levtype: "sfc".into(),
                offset: 0,
                length: 20,
            })
            .collect::<Vec<_>>();
        let mut three_hour = entries
            .iter()
            .find(|entry| entry.param == "10fg")
            .unwrap()
            .clone();
        three_hour.param = "10fg3".into();
        entries.push(three_hour);
        let picked = selected(&entries, false, 3).unwrap();
        assert_eq!(
            picked.iter().filter(|entry| entry.param == "10fg3").count(),
            1
        );
        assert!(!picked.iter().any(|entry| entry.param == "10fg"));
    }
}

#[cfg(test)]
mod http_tests {
    use super::*;
    use std::{
        io::{Read, Write},
        net::TcpListener,
    };

    fn grib_bytes() -> Vec<u8> {
        let mut bytes = vec![0; 20];
        bytes[..4].copy_from_slice(b"GRIB");
        bytes[7] = 2;
        bytes[8..16].copy_from_slice(&20_u64.to_be_bytes());
        bytes[16..].copy_from_slice(b"7777");
        bytes
    }

    #[test]
    fn range_request_retries_then_reuses_valid_cache() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let server = thread::spawn(move || {
            let mut requests = Vec::new();
            for attempt in 0..2 {
                let (mut stream, _) = listener.accept().unwrap();
                stream.set_read_timeout(Some(Wait::from_secs(5))).unwrap();
                let mut request = Vec::new();
                loop {
                    let mut buffer = [0; 1024];
                    let count = stream.read(&mut buffer).unwrap();
                    assert!(count > 0);
                    request.extend_from_slice(&buffer[..count]);
                    if request.windows(4).any(|part| part == b"\r\n\r\n") {
                        break;
                    }
                }
                requests.push(String::from_utf8(request).unwrap());
                if attempt == 0 {
                    stream.write_all(b"HTTP/1.1 503 Unavailable\r\nContent-Length: 0\r\nConnection: close\r\n\r\n").unwrap();
                } else {
                    stream.write_all(b"HTTP/1.1 206 Partial Content\r\nContent-Length: 20\r\nContent-Range: bytes 123-142/1000\r\nConnection: close\r\n\r\n").unwrap();
                    stream.write_all(&grib_bytes()).unwrap();
                }
            }
            requests
        });
        let directory = tempfile::tempdir().unwrap();
        let client =
            OpenDataClient::new(directory.path(), Some(format!("http://{address}"))).unwrap();
        let run = "2026-10-17T00:00:00Z".parse().unwrap();
        let entry = IndexEntry {
            param: "tp".into(),
            step: "3".into(),
            levtype: "sfc".into(),
            offset: 123,
            length: 20,
        };
        let path = client.download_message(run, false, 3, &entry).unwrap();
        assert_eq!(fs::read(&path).unwrap(), grib_bytes());
        assert_eq!(
            client.download_message(run, false, 3, &entry).unwrap(),
            path
        );
        assert_eq!(client.downloaded_bytes(), 20);
        let requests = server.join().unwrap();
        assert_eq!(requests.len(), 2);
        assert!(requests.iter().all(|request| {
            request
                .to_ascii_lowercase()
                .contains("range: bytes=123-142")
        }));
    }
}
