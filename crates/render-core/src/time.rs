use crate::constants::constants;
use chrono::{DateTime, Datelike, Utc};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Manifest {
    pub version: u32,
    pub generated: String,
    pub now: String,
    pub chunks: Vec<Chunk>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Chunk {
    pub url: String,
    pub source: String,
    pub run: String,
    #[serde(default = "rain_field")]
    pub field: String,
    pub times: Vec<String>,
}

fn rain_field() -> String {
    "rain_rate".into()
}

#[derive(Clone, Debug, PartialEq)]
pub struct TimelineFrame {
    pub epoch: i64,
    pub chunk_index: usize,
    pub frame_index: usize,
}

#[derive(Clone, Copy, Debug, Deserialize)]
pub struct Blend {
    pub left: usize,
    pub right: usize,
    pub mix: f64,
}

pub fn epoch(text: &str) -> Result<i64, chrono::ParseError> {
    DateTime::parse_from_rfc3339(text).map(|time| time.timestamp_millis())
}

pub fn timeline(manifest: &Manifest, field: &str) -> Result<Vec<TimelineFrame>, String> {
    let now = epoch(&manifest.now).map_err(|error| error.to_string())?;
    let mut by_time: BTreeMap<i64, (usize, i64, TimelineFrame)> = BTreeMap::new();
    for (chunk_index, chunk) in manifest.chunks.iter().enumerate() {
        if chunk.field != field {
            continue;
        }
        let priority = constants()
            .source_priority
            .get(&chunk.source)
            .copied()
            .ok_or_else(|| format!("Unknown source: {}", chunk.source))?;
        let run = epoch(&chunk.run).map_err(|error| error.to_string())?;
        for (frame_index, time) in chunk.times.iter().enumerate() {
            let epoch = epoch(time).map_err(|error| error.to_string())?;
            if field == "rain_rate" && epoch < now && chunk.source != "rtcor" {
                continue;
            }
            if by_time
                .get(&epoch)
                .is_none_or(|(previous_priority, previous_run, previous)| {
                    priority > *previous_priority
                        || priority == *previous_priority
                            && manifest.chunks[previous.chunk_index].source == chunk.source
                            && run > *previous_run
                })
            {
                by_time.insert(
                    epoch,
                    (
                        priority,
                        run,
                        TimelineFrame {
                            epoch,
                            chunk_index,
                            frame_index,
                        },
                    ),
                );
            }
        }
    }
    Ok(by_time.into_values().map(|(_, _, frame)| frame).collect())
}

pub fn frame_blend(timeline: &[TimelineFrame], epoch: i64) -> Blend {
    if timeline.is_empty() || epoch <= timeline[0].epoch {
        return Blend {
            left: 0,
            right: 0,
            mix: 0.0,
        };
    }
    let last = timeline.len() - 1;
    if epoch >= timeline[last].epoch {
        return Blend {
            left: last,
            right: last,
            mix: 0.0,
        };
    }
    let right = timeline.partition_point(|frame| frame.epoch < epoch);
    let left = right - 1;
    Blend {
        left,
        right,
        mix: (epoch - timeline[left].epoch) as f64
            / (timeline[right].epoch - timeline[left].epoch) as f64,
    }
}

pub fn clock_text(epoch: i64) -> (String, &'static str) {
    let time = DateTime::<Utc>::from_timestamp_millis(epoch)
        .expect("validated map time")
        .with_timezone(&chrono_tz::Europe::Amsterdam);
    let day =
        ["ma", "di", "wo", "do", "vr", "za", "zo"][time.weekday().num_days_from_monday() as usize];
    (time.format("%H:%M").to_string(), day)
}

pub fn dark(epoch: i64) -> bool {
    let radians = std::f64::consts::PI / 180.0;
    let days = epoch as f64 / 86_400_000.0 + 2_440_587.5 - 2_451_545.0;
    let mean_longitude = (280.460 + 0.9856474 * days) * radians;
    let anomaly = (357.528 + 0.9856003 * days) * radians;
    let longitude =
        mean_longitude + 1.915 * radians * anomaly.sin() + 0.020 * radians * (2.0 * anomaly).sin();
    let obliquity = (23.439 - 0.0000004 * days) * radians;
    let ascension = (obliquity.cos() * longitude.sin()).atan2(longitude.cos());
    let declination = (obliquity.sin() * longitude.sin()).asin();
    let sidereal = (280.46061837 + 360.98564736629 * days) * radians;
    let location = &constants().location;
    let latitude = location.lat * radians;
    let hour_angle = location.lng * radians - (ascension - sidereal);
    latitude.sin() * declination.sin() + latitude.cos() * declination.cos() * hour_angle.cos()
        <= 0.0
}
