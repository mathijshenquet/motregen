use std::{
    fs,
    io::Read,
    path::{Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
    thread,
    time::Duration as Wait,
};

use anyhow::{Context, Result, bail, ensure};
use bzip2::read::BzDecoder;
use chrono::{DateTime, Duration, NaiveDate, NaiveTime, Timelike, Utc};
use eccodes::{CodesFile, FallibleIterator, KeyRead, ProductKind};
use rayon::prelude::*;
use reqwest::{StatusCode, blocking::Client};
use tracing::{info, warn};

use super::{Average, BlockMap, DirectRun, GRID, LEADS, RUN_INTERVAL_HOURS, archive, hour_means};
use crate::{cams::LatLonRaster, publisher::atomic_write};

pub const DEFAULT_BASE: &str = "https://opendata.dwd.de/weather/nwp/icon-d2/grib";
const PARAMETER: &str = "aswdir_s";
const ATTEMPTS: u32 = 4;
/// DWD overwrites `grib/HH/` with the next day's run, so only the last 24 hours are online.
const RUNS_TO_SEARCH: i64 = 8;
/// The timer fires after the newest run should be complete; an older newest run means DWD is late,
/// and failing makes systemd retry.
const MAX_SELECTED_RUN_AGE_HOURS: i64 = 4;

pub struct DwdClient {
    client: Client,
    base: String,
    cache: PathBuf,
    downloaded: AtomicU64,
}

impl DwdClient {
    pub fn new(data_dir: &Path, base: Option<String>) -> Result<Self> {
        Ok(Self {
            client: Client::builder()
                .connect_timeout(Wait::from_secs(30))
                .timeout(Wait::from_secs(120))
                .user_agent("motregen-icon-d2/0.1 (motregen.nl)")
                .build()?,
            base: base
                .unwrap_or_else(|| DEFAULT_BASE.to_owned())
                .trim_end_matches('/')
                .to_owned(),
            cache: data_dir.join(".icon-d2-cache"),
            downloaded: AtomicU64::new(0),
        })
    }

    pub fn downloaded_bytes(&self) -> u64 {
        self.downloaded.load(Ordering::Relaxed)
    }

    fn url(&self, run: DateTime<Utc>, lead: u32) -> String {
        format!(
            "{}/{:02}/{PARAMETER}/icon-d2_germany_regular-lat-lon_single-level_{}_{lead:03}_2d_{PARAMETER}.grib2.bz2",
            self.base,
            run.hour(),
            run.format("%Y%m%d%H")
        )
    }

    fn directory(&self, run: DateTime<Utc>) -> PathBuf {
        self.cache.join(run.format("%Y%m%dT%H").to_string())
    }

    fn request(&self, url: &str, head: bool) -> Result<Option<Vec<u8>>> {
        let mut last_error = None;
        for attempt in 0..ATTEMPTS {
            let result = (|| -> Result<Option<Vec<u8>>> {
                let request = if head {
                    self.client.head(url)
                } else {
                    self.client.get(url)
                };
                let mut response = request.send()?;
                if response.status() == StatusCode::NOT_FOUND {
                    return Ok(None);
                }
                response.error_for_status_ref()?;
                let mut bytes = Vec::new();
                if !head {
                    response.copy_to(&mut bytes)?;
                    self.downloaded
                        .fetch_add(bytes.len() as u64, Ordering::Relaxed);
                }
                Ok(Some(bytes))
            })();
            match result {
                Ok(bytes) => return Ok(bytes),
                Err(error) => {
                    warn!(url, attempt = attempt + 1, error = %error, "ICON-D2 request failed");
                    last_error = Some(error);
                    if attempt + 1 < ATTEMPTS {
                        thread::sleep(Wait::from_secs(2 << attempt));
                    }
                }
            }
        }
        Err(last_error.expect("at least one attempt"))
    }

    /// The newest run whose last lead is online. DWD writes leads in order, so lead 48 means complete.
    pub fn latest_run(&self, now: DateTime<Utc>) -> Result<DateTime<Utc>> {
        let hour = now.hour() - now.hour() % RUN_INTERVAL_HOURS;
        let newest = now.date_naive().and_hms_opt(hour, 0, 0).unwrap().and_utc();
        for back in 0..RUNS_TO_SEARCH {
            let run = newest - Duration::hours(back * i64::from(RUN_INTERVAL_HOURS));
            if self.request(&self.url(run, LEADS), true)?.is_some() {
                ensure!(
                    now - run < Duration::hours(MAX_SELECTED_RUN_AGE_HOURS),
                    "newest complete ICON-D2 run {run} is too old; retry when the next run is online"
                );
                return Ok(run);
            }
        }
        bail!("no complete ICON-D2 run online")
    }

    /// The decompressed GRIB of one lead, from the cache when that still decompresses.
    fn grib(&self, run: DateTime<Utc>, lead: u32) -> Result<Vec<u8>> {
        let path = self.directory(run).join(format!("{lead:03}.grib2.bz2"));
        if let Ok(bytes) = fs::read(&path)
            && let Ok(grib) = decompress(&bytes)
        {
            return Ok(grib);
        }
        let url = self.url(run, lead);
        let bytes = self
            .request(&url, false)?
            .with_context(|| format!("ICON-D2 file disappeared: {url}"))?;
        let grib = decompress(&bytes).with_context(|| format!("invalid bzip2/GRIB from {url}"))?;
        atomic_write(&path, &bytes)?;
        Ok(grib)
    }

    fn average(&self, run: DateTime<Utc>, lead: u32) -> Result<Average> {
        decode_average(&self.grib(run, lead)?, run, lead)
            .with_context(|| format!("decoding ICON-D2 {run} lead {lead}"))
    }

    /// Downloads leads 1…48, reusing cached files, and returns hour means on the publication grid.
    pub fn fetch(&self, run: DateTime<Utc>) -> Result<DirectRun> {
        let first = self.average(run, 1)?;
        let map = BlockMap::new(&first.raster, GRID)?;
        let stations = archive::nearest_points(&first.raster)?;
        let at_stations = |values: &[f32]| {
            stations
                .iter()
                .map(|index| values[*index])
                .collect::<Vec<_>>()
        };
        let pool = rayon::ThreadPoolBuilder::new().num_threads(4).build()?;
        let mut averages = vec![(map.apply(&first.values)?, at_stations(&first.values))];
        averages.extend(pool.install(|| {
            (2..=LEADS)
                .into_par_iter()
                .map(|lead| {
                    let average = self.average(run, lead)?;
                    ensure!(
                        average.raster == *map.source(),
                        "ICON-D2 raster changed within run {run}"
                    );
                    Ok((map.apply(&average.values)?, at_stations(&average.values)))
                })
                .collect::<Result<Vec<_>>>()
        })?);
        info!(%run, leads = averages.len(), downloaded_bytes = self.downloaded_bytes(), "ICON-D2 leads decoded");
        let (blocks, points): (Vec<_>, Vec<_>) = averages.into_iter().unzip();
        Ok(DirectRun {
            run,
            hours: hour_means(&blocks)?,
            station_hours: hour_means(&points)?,
        })
    }

    /// Keeps only the published run's files: one run is ≈ 200 MB.
    pub fn prune_cache(&self, published_run: DateTime<Utc>) -> Result<()> {
        let published_directory = self.directory(published_run);
        for entry in fs::read_dir(&self.cache)? {
            let entry = entry?;
            if entry.file_type()?.is_dir() && entry.path() != published_directory {
                fs::remove_dir_all(entry.path()).with_context(|| {
                    format!("removing ICON-D2 run cache {}", entry.path().display())
                })?;
            }
        }
        Ok(())
    }
}

pub fn decompress(bytes: &[u8]) -> Result<Vec<u8>> {
    let mut grib = Vec::new();
    BzDecoder::new(bytes).read_to_end(&mut grib)?;
    ensure!(
        grib.len() >= 20 && &grib[..4] == b"GRIB" && &grib[grib.len() - 4..] == b"7777",
        "not a GRIB file"
    );
    Ok(grib)
}

/// Picks the whole-hour message `0-<lead>` out of a file that also holds the next three quarter hours.
pub fn decode_average(grib: &[u8], run: DateTime<Utc>, lead: u32) -> Result<Average> {
    let _guard = crate::GRIB_DECODER_LOCK
        .lock()
        .map_err(|error| anyhow::anyhow!("GRIB decoder lock poisoned: {error}"))?;
    let mut file = CodesFile::new_from_memory(grib.to_vec(), ProductKind::GRIB)?;
    let mut messages = file.ref_message_iter();
    while let Some(handle) = messages.next()? {
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
        if integer("stepUnits")? != 1 || integer("endStep")? != i64::from(lead) {
            continue;
        }
        ensure!(
            string("shortName")? == "ASWDIR_S" && string("stepType")? == "avg",
            "expected ASWDIR_S as an average"
        );
        ensure!(
            integer("startStep")? == 0,
            "ICON-D2 average does not start at the run"
        );
        ensure!(string("units")? == "W m-2", "unexpected ICON-D2 units");
        ensure!(
            integer("edition")? == 2 && string("gridType")? == "regular_ll",
            "expected regular_ll GRIB2"
        );
        ensure!(
            integer("iScansNegatively")? == 0
                && integer("jScansPositively")? == 1
                && integer("jPointsAreConsecutive")? == 0,
            "unsupported ICON-D2 scanning mode"
        );
        let date = NaiveDate::parse_from_str(&integer("dataDate")?.to_string(), "%Y%m%d")?;
        let time = integer("dataTime")?;
        let message_run = date
            .and_time(
                NaiveTime::from_hms_opt((time / 100) as u32, (time % 100) as u32, 0)
                    .context("invalid dataTime")?,
            )
            .and_utc();
        ensure!(
            message_run == run,
            "ICON-D2 message is from run {message_run}"
        );
        let ni = usize::try_from(integer("Ni")?)?;
        let nj = usize::try_from(integer("Nj")?)?;
        let lon0 = float("longitudeOfFirstGridPointInDegrees")?;
        let raster = LatLonRaster {
            lat0: float("latitudeOfFirstGridPointInDegrees")?,
            lon0: if lon0 > 180.0 { lon0 - 360.0 } else { lon0 },
            dlat: float("jDirectionIncrementInDegrees")?,
            dlon: float("iDirectionIncrementInDegrees")?,
            ni,
            nj,
        };
        let values: Vec<f64> = handle.read_key("values")?;
        ensure!(
            values.len() == ni * nj,
            "ICON-D2 values disagree with grid size"
        );
        let missing = if integer("bitmapPresent")? == 1 {
            // DWD writes missingValue as an integer key (9999).
            Some(
                float("missingValue")
                    .or_else(|_| integer("missingValue").map(|value| value as f64))?,
            )
        } else {
            None
        };
        let values = values
            .into_iter()
            .map(|value| {
                if !value.is_finite() || missing == Some(value) {
                    f32::NAN
                } else {
                    value as f32
                }
            })
            .collect();
        return Ok(Average {
            run,
            lead,
            raster,
            values,
        });
    }
    bail!("no 0-{lead} h message in ICON-D2 file")
}
