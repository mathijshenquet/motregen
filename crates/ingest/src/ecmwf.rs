use std::{collections::BTreeMap, fs, io::ErrorKind, path::Path, time::SystemTime};

use anyhow::{Context, Result, ensure};
use chrono::{DateTime, Duration, NaiveDate, SecondsFormat, TimeZone, Timelike, Utc};
use chrono_tz::Europe::Amsterdam;
use serde::{Deserialize, Serialize};

use crate::{
    cams::{BilinearMap, LatLonRaster},
    grid::{GridSpec, web_mercator_to_lon_lat},
    pipeline::generated_chunk_filename,
    publisher::{ManifestChunk, ProducedChunk, atomic_write, produced_chunk, write_chunks},
};

pub mod download;

pub const SOURCE: &str = "ecmwf";
pub const SIDECAR: &str = "ecmwf.json";
pub const LICENSE: &str =
    "ECMWF IFS open data (CC BY 4.0), door motregen omgerekend naar dagwaarden";
pub const CROP: LatLonRaster = LatLonRaster {
    lat0: 54.0,
    lon0: 2.0,
    dlat: -0.25,
    dlon: 0.25,
    ni: 24,
    nj: 17,
};
pub const GRID: GridSpec = GridSpec {
    crs: "EPSG:3857",
    x0: 258_000.0,
    y0: 7_132_000.0,
    dx: 24_000.0,
    dy: -24_000.0,
    width: 24,
    height: 26,
};
const MAX_RUN_AGE_HOURS: i64 = 72;

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub enum Parameter {
    Precip,
    Tmax,
    Tmin,
    U,
    V,
    Gust,
    Cloud,
    Prob1,
    Prob5,
}

impl Parameter {
    pub const FORECAST: [Self; 7] = [
        Self::Precip,
        Self::Tmax,
        Self::Tmin,
        Self::U,
        Self::V,
        Self::Gust,
        Self::Cloud,
    ];

    pub fn from_name(name: &str) -> Option<Self> {
        Some(match name {
            "tp" => Self::Precip,
            "mx2t3" | "mx2t6" => Self::Tmax,
            "mn2t3" | "mn2t6" => Self::Tmin,
            "10u" => Self::U,
            "10v" => Self::V,
            "10fg3" | "10fg" => Self::Gust,
            "tcc" => Self::Cloud,
            "tpg1" => Self::Prob1,
            "tpg5" => Self::Prob5,
            _ => return None,
        })
    }
}

#[derive(Clone, Debug)]
pub struct Message {
    pub run: DateTime<Utc>,
    pub parameter: Parameter,
    pub start: u32,
    pub end: u32,
    pub values: Vec<f32>,
}

#[derive(Clone, Debug)]
pub struct EcmwfRun {
    pub run: DateTime<Utc>,
    pub messages: Vec<Message>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub enum Field {
    Tmax,
    Tmin,
    Precip,
    Prob1,
    Prob5,
    Wind,
    Direction,
    Gust,
    Cloud,
}

impl Field {
    pub const ALL: [Self; 9] = [
        Self::Tmax,
        Self::Tmin,
        Self::Precip,
        Self::Prob1,
        Self::Prob5,
        Self::Wind,
        Self::Direction,
        Self::Gust,
        Self::Cloud,
    ];

    pub fn name(self) -> &'static str {
        match self {
            Self::Tmax => "day_tmax_c",
            Self::Tmin => "day_tmin_c",
            Self::Precip => "day_precip_mm",
            Self::Prob1 => "day_precip_prob",
            Self::Prob5 => "day_precip_prob5",
            Self::Wind => "day_wind_ms",
            Self::Direction => "day_wind_dir",
            Self::Gust => "day_gust_ms",
            Self::Cloud => "day_cloud",
        }
    }

    pub fn quantization_table(self) -> Vec<Option<f32>> {
        (0..255)
            .map(|index| {
                Some(match self {
                    Self::Tmax | Self::Tmin => -40.0 + index as f32 * 0.4,
                    Self::Precip => {
                        if index <= 200 {
                            index as f32 * 0.2
                        } else {
                            40.0 + (index - 200) as f32 * 2.0
                        }
                    }
                    Self::Wind | Self::Gust => index as f32 * 0.25,
                    Self::Direction => index as f32 * 360.0 / 255.0,
                    Self::Prob1 | Self::Prob5 | Self::Cloud => index as f32 * 100.0 / 254.0,
                })
            })
            .chain(std::iter::once(None))
            .collect()
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct Day {
    pub date: NaiveDate,
    pub start: DateTime<Utc>,
    pub end: DateTime<Utc>,
}

impl Day {
    pub fn noon(&self) -> DateTime<Utc> {
        Amsterdam
            .from_local_datetime(&self.date.and_hms_opt(12, 0, 0).unwrap())
            .single()
            .unwrap()
            .with_timezone(&Utc)
    }
}

#[derive(Clone, Debug)]
pub struct DailyRun {
    pub run: DateTime<Utc>,
    pub days: Vec<Day>,
    pub fields: BTreeMap<Field, Vec<Vec<f32>>>,
}

pub fn forecast_steps() -> Vec<u32> {
    (3..=144).step_by(3).chain((150..=240).step_by(6)).collect()
}

pub fn complete_days(run: DateTime<Utc>, end: DateTime<Utc>) -> Vec<Day> {
    let mut date = run.with_timezone(&Amsterdam).date_naive();
    let mut days = Vec::new();
    loop {
        let midnight = |date: NaiveDate| {
            Amsterdam
                .from_local_datetime(&date.and_hms_opt(0, 0, 0).unwrap())
                .single()
                .unwrap()
                .with_timezone(&Utc)
        };
        let start = midnight(date);
        let next = date.succ_opt().unwrap();
        let day_end = midnight(next);
        if day_end > end {
            break;
        }
        if start >= run {
            days.push(Day {
                date,
                start,
                end: day_end,
            });
        }
        date = next;
    }
    days
}

fn precipitation_intervals(messages: &[&Message]) -> Result<Vec<Message>> {
    let mut intervals = Vec::new();
    let mut previous: Option<&Message> = None;
    for message in messages {
        let mut interval = (*message).clone();
        ensure!(message.start < message.end, "zero precipitation interval");
        if let Some(previous) = previous {
            ensure!(message.end > previous.end, "duplicate precipitation step");
            if message.start == previous.start {
                interval.start = previous.end;
                for (value, baseline) in interval.values.iter_mut().zip(&previous.values) {
                    *value -= baseline;
                }
            }
            ensure!(
                interval.start == previous.end,
                "overlapping or missing precipitation interval"
            );
        } else {
            ensure!(
                message.start == 0,
                "precipitation does not start at run time"
            );
        }
        for value in &mut interval.values {
            ensure!(
                !value.is_finite() || *value >= -0.02,
                "precipitation accumulation decreased by {} mm",
                -*value
            );
            if value.is_finite() {
                *value = value.max(0.0);
            }
        }
        intervals.push(interval);
        previous = Some(message);
    }
    Ok(intervals)
}

fn overlap_seconds(run: DateTime<Utc>, message: &Message, day: &Day) -> i64 {
    let start = (run + Duration::hours(i64::from(message.start))).max(day.start);
    let end = (run + Duration::hours(i64::from(message.end))).min(day.end);
    (end - start).num_seconds().max(0)
}

pub fn aggregate(run: &EcmwfRun) -> Result<DailyRun> {
    let mut grouped: BTreeMap<Parameter, Vec<&Message>> = BTreeMap::new();
    for message in &run.messages {
        ensure!(
            message.run == run.run && message.values.len() == CROP.cell_count(),
            "ECMWF message run/grid mismatch"
        );
        ensure!(
            message.start <= message.end && message.end <= 240,
            "invalid ECMWF interval"
        );
        grouped.entry(message.parameter).or_default().push(message);
    }
    for messages in grouped.values_mut() {
        messages.sort_by_key(|message| (message.end, message.start));
    }
    let expected = forecast_steps();
    for parameter in Parameter::FORECAST {
        let messages = grouped
            .get(&parameter)
            .with_context(|| format!("missing {parameter:?}"))?;
        ensure!(
            messages
                .iter()
                .map(|message| message.end)
                .collect::<Vec<_>>()
                == expected,
            "missing or duplicate {parameter:?} steps"
        );
        if matches!(parameter, Parameter::Tmax | Parameter::Tmin) {
            let mut end = 0;
            for message in messages {
                ensure!(
                    message.start == end,
                    "overlapping or missing {parameter:?} interval"
                );
                end = message.end;
            }
        }
    }
    for parameter in [Parameter::Prob1, Parameter::Prob5] {
        let windows = grouped
            .get(&parameter)
            .context("missing ENS probabilities")?;
        ensure!(
            windows
                .iter()
                .map(|message| (message.start, message.end))
                .collect::<Vec<_>>()
                == (0..=216)
                    .step_by(12)
                    .map(|start| (start, start + 24))
                    .collect::<Vec<_>>(),
            "missing or duplicate ENS probability window"
        );
    }
    let precipitation = precipitation_intervals(&grouped[&Parameter::Precip])?;
    let days = complete_days(run.run, run.run + Duration::hours(240));
    ensure!(
        !days.is_empty(),
        "ECMWF run covers no complete calendar days"
    );
    let mut fields = Field::ALL
        .into_iter()
        .map(|field| (field, Vec::new()))
        .collect::<BTreeMap<_, _>>();
    for day in &days {
        let mut values = Field::ALL
            .into_iter()
            .map(|field| (field, vec![f32::NAN; CROP.cell_count()]))
            .collect::<BTreeMap<_, _>>();
        for cell in 0..CROP.cell_count() {
            let mut total = 0.0;
            for message in &precipitation {
                let overlap = overlap_seconds(run.run, message, day);
                if overlap > 0 {
                    total += message.values[cell] * overlap as f32
                        / ((message.end - message.start) * 3600) as f32;
                }
            }
            values.get_mut(&Field::Precip).unwrap()[cell] = total;
            for (field, parameter, maximum) in [
                (Field::Tmax, Parameter::Tmax, true),
                (Field::Tmin, Parameter::Tmin, false),
                (Field::Gust, Parameter::Gust, true),
            ] {
                let samples = grouped[&parameter]
                    .iter()
                    .filter(|message| overlap_seconds(run.run, message, day) > 0)
                    .map(|message| message.values[cell])
                    .collect::<Vec<_>>();
                if !samples.is_empty() && samples.iter().all(|value| value.is_finite()) {
                    values.get_mut(&field).unwrap()[cell] = samples
                        .into_iter()
                        .reduce(if maximum { f32::max } else { f32::min })
                        .unwrap();
                }
            }
            let wind = grouped[&Parameter::U]
                .iter()
                .zip(&grouped[&Parameter::V])
                .filter_map(|(u, v)| {
                    let at = run.run + Duration::hours(i64::from(u.end));
                    (at.with_timezone(&Amsterdam).date_naive() == day.date
                        && (6..=21).contains(&at.with_timezone(&Amsterdam).hour()))
                    .then_some((u.values[cell], v.values[cell]))
                })
                .collect::<Vec<_>>();
            if !wind.is_empty() && wind.iter().all(|(u, v)| u.is_finite() && v.is_finite()) {
                let (u, v) = wind
                    .into_iter()
                    .max_by(|(u1, v1), (u2, v2)| u1.hypot(*v1).total_cmp(&u2.hypot(*v2)))
                    .unwrap();
                values.get_mut(&Field::Wind).unwrap()[cell] = u.hypot(v);
                values.get_mut(&Field::Direction).unwrap()[cell] =
                    (-u).atan2(-v).to_degrees().rem_euclid(360.0);
            }
            let clouds = grouped[&Parameter::Cloud]
                .iter()
                .filter(|message| {
                    let at = (run.run + Duration::hours(i64::from(message.end)))
                        .with_timezone(&Amsterdam);
                    at.date_naive() == day.date && (8..=18).contains(&at.hour())
                })
                .map(|message| message.values[cell])
                .collect::<Vec<_>>();
            if !clouds.is_empty() {
                values.get_mut(&Field::Cloud).unwrap()[cell] =
                    clouds.iter().sum::<f32>() / clouds.len() as f32;
            }
        }
        let midpoint = day.start + (day.end - day.start) / 2;
        for (field, parameter) in [
            (Field::Prob1, Parameter::Prob1),
            (Field::Prob5, Parameter::Prob5),
        ] {
            let closest = grouped[&parameter]
                .iter()
                .min_by_key(|message| {
                    let centre =
                        run.run + Duration::seconds(i64::from(message.start + message.end) * 1800);
                    (centre - midpoint).num_seconds().abs()
                })
                .unwrap();
            values.insert(field, closest.values.clone());
        }
        for (field, frame) in values {
            fields.get_mut(&field).unwrap().push(frame);
        }
    }
    Ok(DailyRun {
        run: run.run,
        days,
        fields,
    })
}

pub fn build_chunks(run: &DailyRun) -> Result<Vec<ProducedChunk>> {
    let map = BilinearMap::new(&CROP, GRID)?;
    let nearest = (0..GRID.height)
        .flat_map(|row| {
            (0..GRID.width).map(move |column| {
                let (lon, lat) = web_mercator_to_lon_lat(
                    GRID.x0 + (f64::from(column) + 0.5) * GRID.dx,
                    GRID.y0 + (f64::from(row) + 0.5) * GRID.dy,
                );
                let i = ((lon - CROP.lon0) / CROP.dlon).round() as usize;
                let j = ((lat - CROP.lat0) / CROP.dlat).round() as usize;
                j * CROP.ni + i
            })
        })
        .collect::<Vec<_>>();
    let times = run
        .days
        .iter()
        .map(|day| iso(day.noon()))
        .collect::<Vec<_>>();
    Field::ALL
        .into_iter()
        .map(|field| {
            let quant = field.quantization_table();
            let frames = run.fields[&field]
                .iter()
                .map(|frame| {
                    let values = if field == Field::Direction {
                        nearest.iter().map(|index| frame[*index]).collect()
                    } else {
                        map.apply(frame)?
                    };
                    values
                        .into_iter()
                        .map(|value| mrf::quantize_with_table(value, &quant).map_err(Into::into))
                        .collect::<Result<Vec<_>>>()
                })
                .collect::<Result<Vec<_>>>()?;
            let meta =
                mrf::ChunkMeta::standard(GRID.mrf_grid(), SOURCE, iso(run.run), times.clone())
                    .with_field(field.name(), quant)
                    .with_pred();
            let stem = format!("ecmwf-{}-{}", field.name(), run.run.format("%Y%m%dT%H"));
            produced_chunk(
                generated_chunk_filename(&stem, &meta),
                mrf::encode(&frames, &meta)?,
            )
        })
        .collect()
}

fn iso(time: DateTime<Utc>) -> String {
    time.to_rfc3339_opts(SecondsFormat::Secs, true)
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct EcmwfSection {
    pub run: String,
    pub license: String,
    pub days: Vec<Day>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct Sidecar {
    #[serde(flatten)]
    pub section: EcmwfSection,
    pub chunks: Vec<ManifestChunk>,
}

pub fn write_publication(data_dir: &Path, run: &DailyRun, chunks: &[ProducedChunk]) -> Result<()> {
    write_chunks(data_dir, &chunks.iter().collect::<Vec<_>>())?;
    let sidecar = Sidecar {
        section: EcmwfSection {
            run: iso(run.run),
            license: LICENSE.into(),
            days: run.days.clone(),
        },
        chunks: chunks.iter().map(|chunk| chunk.manifest.clone()).collect(),
    };
    atomic_write(
        &data_dir.join(SIDECAR),
        &serde_json::to_vec_pretty(&sidecar)?,
    )
}

#[derive(Default)]
pub struct Feed {
    stamp: Option<(SystemTime, u64)>,
    loaded: Option<(EcmwfSection, Vec<ProducedChunk>)>,
    pub section: Option<EcmwfSection>,
    pub chunks: Vec<ProducedChunk>,
}

impl Feed {
    pub fn refresh(&mut self, data_dir: &Path, now: DateTime<Utc>) -> Result<bool> {
        let stamp = match fs::metadata(data_dir.join(SIDECAR)) {
            Ok(metadata) => Some((metadata.modified()?, metadata.len())),
            Err(error) if error.kind() == ErrorKind::NotFound => None,
            Err(error) => return Err(error.into()),
        };
        if stamp != self.stamp {
            self.loaded = if stamp.is_some() {
                Some(load_sidecar(data_dir)?)
            } else {
                None
            };
            self.stamp = stamp;
        }
        let fresh = self.loaded.as_ref().filter(|(section, _)| {
            DateTime::parse_from_rfc3339(&section.run).is_ok_and(|run| {
                now - run.with_timezone(&Utc) <= Duration::hours(MAX_RUN_AGE_HOURS)
            })
        });
        let section = fresh.map(|(section, _)| section.clone());
        let names = |chunks: &[ProducedChunk]| {
            chunks
                .iter()
                .map(|chunk| chunk.filename.clone())
                .collect::<Vec<_>>()
        };
        let changed = section != self.section
            || names(
                fresh
                    .map(|(_, chunks)| chunks.as_slice())
                    .unwrap_or_default(),
            ) != names(&self.chunks);
        if changed {
            self.chunks = fresh.map(|(_, chunks)| chunks.clone()).unwrap_or_default();
            self.section = section;
        }
        Ok(changed)
    }
}

fn load_sidecar(data_dir: &Path) -> Result<(EcmwfSection, Vec<ProducedChunk>)> {
    let sidecar: Sidecar = serde_json::from_slice(&fs::read(data_dir.join(SIDECAR))?)?;
    ensure!(
        sidecar.section.license == LICENSE,
        "ECMWF sidecar lacks attribution"
    );
    let run = DateTime::parse_from_rfc3339(&sidecar.section.run)?.with_timezone(&Utc);
    ensure!(
        sidecar.section.days == complete_days(run, run + Duration::hours(240)),
        "ECMWF sidecar day bounds disagree with run"
    );
    let times = sidecar
        .section
        .days
        .iter()
        .map(|day| iso(day.noon()))
        .collect::<Vec<_>>();
    let mut fields = Vec::new();
    let chunks = sidecar
        .chunks
        .iter()
        .map(|entry| {
            let filename = entry
                .url
                .strip_prefix("chunks/")
                .context("ECMWF chunk outside chunks/")?;
            ensure!(
                Path::new(filename)
                    .file_name()
                    .and_then(|name| name.to_str())
                    == Some(filename),
                "unsafe ECMWF chunk filename"
            );
            let chunk = produced_chunk(
                filename.into(),
                fs::read(data_dir.join("chunks").join(filename))?,
            )?;
            ensure!(
                chunk.manifest == *entry
                    && entry.source == SOURCE
                    && entry.run == sidecar.section.run
                    && entry.times == times,
                "ECMWF chunk disagrees with sidecar"
            );
            let header = mrf::parse_header(&chunk.bytes)?.header;
            ensure!(
                header.grid == GRID.mrf_grid(),
                "unexpected ECMWF publication grid"
            );
            fields.push(entry.field.as_str());
            Ok(chunk)
        })
        .collect::<Result<Vec<_>>>()?;
    fields.sort_unstable();
    let mut expected = Field::ALL.map(Field::name);
    expected.sort_unstable();
    ensure!(fields == expected, "missing or duplicate ECMWF fields");
    Ok((sidecar.section, chunks))
}

#[cfg(test)]
mod tests;
