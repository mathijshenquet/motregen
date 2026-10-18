//! Direct solar radiation from DWD ICON-D2 for the sunshine estimate (MIP-39, docs/icon-d2.md).

use std::{fs, io::ErrorKind, path::Path, time::SystemTime};

use anyhow::{Context, Result, ensure};
use chrono::{DateTime, Duration, SecondsFormat, Timelike, Utc};
use serde::{Deserialize, Serialize};

use crate::{
    cams::LatLonRaster,
    grid::{GridSpec, RADIATION_GRID},
    pipeline::{generated_chunk_filename, radiation_quantization_table},
    publisher::{ManifestChunk, ProducedChunk, atomic_write, produced_chunk, write_chunks},
};

pub mod archive;
pub mod download;

pub const SOURCE: &str = "icon_d2";
pub const SIDECAR: &str = "icon-d2.json";
pub const FIELD: &str = "radiation_direct";
pub const LICENSE: &str = "Deutscher Wetterdienst, ICON-D2 open data (CC BY 4.0), door motregen \
                           uitgemiddeld tot directe straling per uur";
pub const LEADS: u32 = 48;
pub const RUN_INTERVAL_HOURS: u32 = 3;
/// Same 8 km grid as the HARMONIE radiation, so both sources sample alike (MIP-38 measured on 8 km blocks).
pub const GRID: GridSpec = RADIATION_GRID;
const MAX_RUN_AGE_HOURS: i64 = 12;
/// 16-bit packing of an average over n hours leaves ≈ n · 0,015 W/m² noise after de-averaging;
/// anything below this is a broken series, not noise.
const NEGATIVE_HOUR_MEAN_TOLERANCE: f32 = 5.0;

/// One decoded `ASWDIR_S` message: the mean direct horizontal radiation since run start over `lead` hours.
#[derive(Clone, Debug)]
pub struct Average {
    pub run: DateTime<Utc>,
    pub lead: u32,
    pub raster: LatLonRaster,
    pub values: Vec<f32>,
}

/// Hour means ending at run + 1 h … run + 48 h, on [`GRID`], in W/m²; `station_hours` holds the same hours at
/// the source point nearest each [`archive::STATIONS`] entry.
#[derive(Clone, Debug)]
pub struct DirectRun {
    pub run: DateTime<Utc>,
    pub hours: Vec<Vec<f32>>,
    pub station_hours: Vec<Vec<f32>>,
}

impl DirectRun {
    pub fn times(&self) -> Vec<String> {
        hour_ends(self.run)
    }
}

pub fn hour_ends(run: DateTime<Utc>) -> Vec<String> {
    (1..=LEADS)
        .map(|lead| iso(run + Duration::hours(i64::from(lead))))
        .collect()
}

pub fn is_run_time(run: DateTime<Utc>) -> bool {
    run.hour().is_multiple_of(RUN_INTERVAL_HOURS)
        && run.minute() == 0
        && run.second() == 0
        && run.timestamp_subsec_nanos() == 0
}

/// Mean over each target cell of the source points whose centre falls inside it.
pub struct BlockMap {
    source: LatLonRaster,
    cells: Vec<Vec<u32>>,
}

impl BlockMap {
    pub fn new(source: &LatLonRaster, target: GridSpec) -> Result<Self> {
        ensure!(
            source.dlat > 0.0 && source.dlon > 0.0,
            "ICON-D2 raster must run south to north and west to east"
        );
        let mut cells = vec![Vec::new(); target.cell_count()];
        for row in 0..source.nj {
            let latitude = source.lat0 + row as f64 * source.dlat;
            let y = web_mercator_y(latitude);
            let target_row = ((y - target.y0) / target.dy).floor();
            if !(0.0..f64::from(target.height)).contains(&target_row) {
                continue;
            }
            for column in 0..source.ni {
                let longitude = source.lon0 + column as f64 * source.dlon;
                let x = web_mercator_x(longitude);
                let target_column = ((x - target.x0) / target.dx).floor();
                if !(0.0..f64::from(target.width)).contains(&target_column) {
                    continue;
                }
                let cell = target_row as usize * target.width as usize + target_column as usize;
                cells[cell].push((row * source.ni + column) as u32);
            }
        }
        ensure!(
            cells.iter().all(|cell| !cell.is_empty()),
            "ICON-D2 raster does not cover the publication grid"
        );
        Ok(Self {
            source: *source,
            cells,
        })
    }

    pub fn source(&self) -> &LatLonRaster {
        &self.source
    }

    /// A target cell with any missing source value becomes no-data rather than a partial mean.
    pub fn apply(&self, values: &[f32]) -> Result<Vec<f32>> {
        ensure!(
            values.len() == self.source.cell_count(),
            "ICON-D2 field has {} values, raster expects {}",
            values.len(),
            self.source.cell_count()
        );
        Ok(self
            .cells
            .iter()
            .map(|cell| {
                let mut sum = 0.0_f64;
                for index in cell {
                    let value = values[*index as usize];
                    if !value.is_finite() {
                        return f32::NAN;
                    }
                    sum += f64::from(value);
                }
                (sum / cell.len() as f64) as f32
            })
            .collect())
    }
}

const WEB_MERCATOR_RADIUS_M: f64 = 6_378_137.0;

fn web_mercator_x(longitude: f64) -> f64 {
    WEB_MERCATOR_RADIUS_M * longitude.to_radians()
}

fn web_mercator_y(latitude: f64) -> f64 {
    WEB_MERCATOR_RADIUS_M
        * (std::f64::consts::FRAC_PI_4 + latitude.to_radians() / 2.0)
            .tan()
            .ln()
}

/// `averages[i]` is the mean since run start over `i + 1` hours on the publication grid. The hour mean
/// ending at lead n is n·A(n) − (n−1)·A(n−1).
pub fn hour_means(averages: &[Vec<f32>]) -> Result<Vec<Vec<f32>>> {
    ensure!(
        averages.len() == LEADS as usize,
        "ICON-D2 run has {} of {LEADS} leads",
        averages.len()
    );
    let mut hours = Vec::with_capacity(averages.len());
    let mut previous: Option<&Vec<f32>> = None;
    for (index, average) in averages.iter().enumerate() {
        let lead = (index + 1) as f32;
        let hour = average
            .iter()
            .enumerate()
            .map(|(cell, value)| {
                let before = previous.map_or(0.0, |previous| previous[cell] * (lead - 1.0));
                let mean = value * lead - before;
                ensure!(
                    mean.is_finite(),
                    "ICON-D2 lead {lead} has no-data on the publication grid"
                );
                ensure!(
                    mean >= -NEGATIVE_HOUR_MEAN_TOLERANCE,
                    "ICON-D2 average falls by {} W/m² in lead {lead}",
                    -mean
                );
                Ok(mean.max(0.0))
            })
            .collect::<Result<Vec<_>>>()?;
        hours.push(hour);
        previous = Some(average);
    }
    Ok(hours)
}

pub fn build_chunk(run: &DirectRun) -> Result<ProducedChunk> {
    ensure!(
        run.hours.len() == LEADS as usize,
        "ICON-D2 run has {} hours",
        run.hours.len()
    );
    let quant = radiation_quantization_table();
    let frames = run
        .hours
        .iter()
        .map(|hour| {
            ensure!(
                hour.len() == GRID.cell_count(),
                "ICON-D2 hour does not match the publication grid"
            );
            hour.iter()
                .map(|value| mrf::quantize_with_table(*value, &quant).map_err(Into::into))
                .collect::<Result<Vec<_>>>()
        })
        .collect::<Result<Vec<_>>>()?;
    let meta = mrf::ChunkMeta::standard(GRID.mrf_grid(), SOURCE, iso(run.run), run.times())
        .with_field(FIELD, quant)
        .with_pred();
    let stem = format!("icon-d2-{FIELD}-{}", run.run.format("%Y%m%dT%H"));
    produced_chunk(
        generated_chunk_filename(&stem, &meta),
        mrf::encode(&frames, &meta)?,
    )
}

fn iso(time: DateTime<Utc>) -> String {
    time.to_rfc3339_opts(SecondsFormat::Secs, true)
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct Sidecar {
    pub run: String,
    pub license: String,
    pub chunks: Vec<ManifestChunk>,
}

pub fn write_publication(data_dir: &Path, run: DateTime<Utc>, chunk: &ProducedChunk) -> Result<()> {
    write_chunks(data_dir, &[chunk])?;
    let sidecar = Sidecar {
        run: iso(run),
        license: LICENSE.into(),
        chunks: vec![chunk.manifest.clone()],
    };
    atomic_write(
        &data_dir.join(SIDECAR),
        &serde_json::to_vec_pretty(&sidecar)?,
    )
}

/// The run of the current publication, if any; lets a retried job skip work already done.
pub fn published_run(data_dir: &Path) -> Result<Option<DateTime<Utc>>> {
    match fs::read(data_dir.join(SIDECAR)) {
        Ok(bytes) => {
            let sidecar: Sidecar = serde_json::from_slice(&bytes)?;
            Ok(Some(
                DateTime::parse_from_rfc3339(&sidecar.run)?.with_timezone(&Utc),
            ))
        }
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error.into()),
    }
}

/// The ingest daemon's view of `icon-d2.json`: a run older than [`MAX_RUN_AGE_HOURS`] leaves the
/// manifest, and the client falls back to HARMONIE.
#[derive(Default)]
pub struct Feed {
    stamp: Option<(SystemTime, u64)>,
    loaded: Option<(DateTime<Utc>, Vec<ProducedChunk>)>,
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
        let fresh = self
            .loaded
            .as_ref()
            .filter(|(run, _)| now - *run <= Duration::hours(MAX_RUN_AGE_HOURS))
            .map(|(_, chunks)| chunks.clone())
            .unwrap_or_default();
        let names = |chunks: &[ProducedChunk]| {
            chunks
                .iter()
                .map(|chunk| chunk.filename.clone())
                .collect::<Vec<_>>()
        };
        let changed = names(&fresh) != names(&self.chunks);
        if changed {
            self.chunks = fresh;
        }
        Ok(changed)
    }
}

fn load_sidecar(data_dir: &Path) -> Result<(DateTime<Utc>, Vec<ProducedChunk>)> {
    let sidecar: Sidecar = serde_json::from_slice(&fs::read(data_dir.join(SIDECAR))?)?;
    ensure!(
        sidecar.license == LICENSE,
        "ICON-D2 sidecar lacks attribution"
    );
    let run = DateTime::parse_from_rfc3339(&sidecar.run)?.with_timezone(&Utc);
    ensure!(
        is_run_time(run),
        "ICON-D2 sidecar run is not a model run time"
    );
    ensure!(
        sidecar.chunks.len() == 1,
        "ICON-D2 sidecar must list exactly one chunk"
    );
    let entry = &sidecar.chunks[0];
    let filename = entry
        .url
        .strip_prefix("chunks/")
        .context("ICON-D2 chunk outside chunks/")?;
    ensure!(
        Path::new(filename)
            .file_name()
            .and_then(|name| name.to_str())
            == Some(filename),
        "unsafe ICON-D2 chunk filename"
    );
    let chunk = produced_chunk(
        filename.into(),
        fs::read(data_dir.join("chunks").join(filename))?,
    )?;
    ensure!(
        chunk.manifest == *entry
            && entry.source == SOURCE
            && entry.field == FIELD
            && entry.run == sidecar.run
            && entry.times == hour_ends(run),
        "ICON-D2 chunk disagrees with sidecar"
    );
    let header = mrf::parse_header(&chunk.bytes)?.header;
    ensure!(
        header.grid == GRID.mrf_grid(),
        "unexpected ICON-D2 publication grid"
    );
    Ok((run, vec![chunk]))
}

#[cfg(test)]
mod tests;
