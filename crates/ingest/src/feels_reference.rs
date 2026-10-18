//! MIP-37: the feels-like range over NL on the previous local calendar day. App and bot colour
//! the feels map with it, so the scale no longer shifts when new forecast hours arrive.

use std::{
    collections::BTreeMap,
    fs,
    path::{Path, PathBuf},
};

use anyhow::{Context, Result};
use chrono::{DateTime, Days, NaiveTime, TimeZone, Utc};
use chrono_tz::Europe::Amsterdam;
use render_core::{
    field_palette::{extent, palette_region},
    projection::Grid,
    time::FeelsReference,
};
use serde::{Deserialize, Serialize};

use crate::publisher::{ProducedChunk, atomic_write};

/// Hours older than this are of no use for "yesterday" any more.
const KEEP_HOURS: i64 = 72;

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
struct HourExtent {
    run: String,
    min: f64,
    max: f64,
}

/// Feels-like extent per valid hour; a newer HARMONIE run replaces the hours it covers.
pub struct FeelsHours {
    path: PathBuf,
    hours: BTreeMap<i64, HourExtent>,
}

impl FeelsHours {
    /// A missing or unreadable file starts empty: the app and bot then fall back to their own range.
    pub fn load(path: &Path) -> Self {
        let hours = fs::read(path)
            .ok()
            .and_then(|bytes| serde_json::from_slice(&bytes).ok())
            .unwrap_or_default();
        Self {
            path: path.into(),
            hours,
        }
    }

    /// Records the hours of feels-like chunks from runs newer than what is stored; saves on change.
    pub fn record(&mut self, chunks: &[&ProducedChunk], now: DateTime<Utc>) -> Result<bool> {
        let mut changed = false;
        for chunk in chunks.iter().filter(|chunk| {
            chunk.manifest.field == "feels_like_c" && chunk.manifest.source == "harmonie"
        }) {
            let run = &chunk.manifest.run;
            let index = mrf::parse_header(&chunk.bytes)?;
            let grid: Grid = serde_json::from_value(serde_json::to_value(&index.header.grid)?)?;
            let region = palette_region(&grid);
            for (frame_index, time) in chunk.manifest.times.iter().enumerate() {
                let hour = DateTime::parse_from_rfc3339(time)?.timestamp_millis();
                if self
                    .hours
                    .get(&hour)
                    .is_some_and(|stored| stored.run >= *run)
                {
                    continue;
                }
                let range = index.frame_range(frame_index)?;
                let member = chunk
                    .bytes
                    .get(range.start as usize..range.end as usize)
                    .context("feels-like member outside chunk")?;
                let codes = index.decode_frame(frame_index, member)?;
                let quant = &index.header.quant;
                let Some((min, max)) = extent(&grid, region, |cell| {
                    quant[codes[cell] as usize].map(f64::from)
                }) else {
                    continue;
                };
                self.hours.insert(
                    hour,
                    HourExtent {
                        run: run.clone(),
                        min,
                        max,
                    },
                );
                changed = true;
            }
        }
        let oldest = now.timestamp_millis() - KEEP_HOURS * 3_600_000;
        let before = self.hours.len();
        self.hours.retain(|hour, _| *hour >= oldest);
        changed |= self.hours.len() != before;
        if changed {
            if let Some(directory) = self.path.parent() {
                fs::create_dir_all(directory)?;
            }
            atomic_write(&self.path, &serde_json::to_vec(&self.hours)?)?;
        }
        Ok(changed)
    }

    /// The extent of the previous local calendar day, only when every hour of it is known.
    pub fn reference(&self, now: DateTime<Utc>) -> Option<FeelsReference> {
        let today = now.with_timezone(&Amsterdam).date_naive();
        let day = today.checked_sub_days(Days::new(1))?;
        let midnight = |date: chrono::NaiveDate| {
            Amsterdam
                .from_local_datetime(&date.and_time(NaiveTime::MIN))
                .earliest()
                .map(|time| time.timestamp_millis())
        };
        let (start, end) = (midnight(day)?, midnight(today)?);
        let mut minimum = f64::INFINITY;
        let mut maximum = f64::NEG_INFINITY;
        for hour in (start..end).step_by(3_600_000) {
            let extent = self.hours.get(&hour)?;
            minimum = minimum.min(extent.min);
            maximum = maximum.max(extent.max);
        }
        Some(FeelsReference {
            day: day.format("%Y-%m-%d").to_string(),
            min: minimum,
            max: maximum,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::publisher::produced_chunk;

    fn chunk(
        run: &str,
        start: DateTime<Utc>,
        hours: usize,
        celsius: impl Fn(usize) -> f32,
    ) -> ProducedChunk {
        let grid = mrf::Grid {
            crs: "EPSG:3857".into(),
            x0: 0.0,
            y0: 8_000_000.0,
            dx: 100_000.0,
            dy: -100_000.0,
            width: 20,
            height: 20,
        };
        let quant: Vec<Option<f32>> = (0..256)
            .map(|code| (code < 255).then(|| code as f32 / 2.0 - 40.0))
            .collect();
        let times: Vec<String> = (0..hours)
            .map(|hour| {
                (start + chrono::Duration::hours(hour as i64))
                    .to_rfc3339_opts(chrono::SecondsFormat::Secs, true)
            })
            .collect();
        let frames: Vec<Vec<u8>> = (0..hours)
            .map(|hour| {
                let code = ((celsius(hour) + 40.0) * 2.0) as u8;
                let mut frame = vec![code; 400];
                frame[0] = 255;
                frame
            })
            .collect();
        let meta = mrf::ChunkMeta::standard(grid, "harmonie", run, times)
            .with_field("feels_like_c", quant)
            .with_pred();
        produced_chunk(
            format!("feels-{run}.mrf"),
            mrf::encode(&frames, &meta).unwrap(),
        )
        .unwrap()
    }

    fn utc(text: &str) -> DateTime<Utc> {
        DateTime::parse_from_rfc3339(text)
            .unwrap()
            .with_timezone(&Utc)
    }

    #[test]
    fn yesterday_needs_every_local_hour_and_newer_runs_win() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("state/feels-hours.json");
        let mut hours = FeelsHours::load(&path);
        // 2026-10-17 lokaal = 16 okt 22:00Z t/m 17 okt 21:00Z (CEST).
        let first = chunk(
            "2026-10-16T21:00:00Z",
            utc("2026-10-16T22:00:00Z"),
            12,
            |hour| hour as f32,
        );
        let now = utc("2026-10-18T10:00:00Z");
        assert!(hours.record(&[&first], now).unwrap());
        assert!(!hours.record(&[&first], now).unwrap());
        assert!(hours.reference(now).is_none());
        let rest = chunk(
            "2026-10-17T09:00:00Z",
            utc("2026-10-17T10:00:00Z"),
            12,
            |hour| 5.0 - hour as f32,
        );
        hours.record(&[&rest], now).unwrap();
        assert_eq!(
            hours.reference(now).unwrap(),
            FeelsReference {
                day: "2026-10-17".into(),
                min: -6.0,
                max: 11.0
            }
        );
        let newer = chunk(
            "2026-10-17T12:00:00Z",
            utc("2026-10-17T10:00:00Z"),
            1,
            |_| 20.0,
        );
        hours.record(&[&newer], now).unwrap();
        assert_eq!(hours.reference(now).unwrap().max, 20.0);
        let older = chunk(
            "2026-10-16T21:00:00Z",
            utc("2026-10-17T10:00:00Z"),
            1,
            |_| 30.0,
        );
        assert!(!hours.record(&[&older], now).unwrap());
        let reloaded = FeelsHours::load(&path);
        assert_eq!(reloaded.reference(now), hours.reference(now));
        assert!(reloaded.reference(utc("2026-10-19T10:00:00Z")).is_none());
    }

    #[test]
    fn a_missing_or_corrupt_file_starts_empty() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("feels-hours.json");
        fs::write(&path, b"{").unwrap();
        assert!(FeelsHours::load(&path).hours.is_empty());
    }
}
