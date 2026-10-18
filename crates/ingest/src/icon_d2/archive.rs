//! Per-run station extracts, so ICON-D2 can be measured against KNMI sunshine later: DWD keeps only 24 hours
//! online (MIP-39 besluit 2, docs/icon-d2.md).

use std::{fmt::Write as _, fs, io::Write as _, path::Path};

use anyhow::{Context, Result, ensure};
use bzip2::{Compression, write::BzEncoder};
use chrono::{DateTime, Duration, NaiveDateTime, SecondsFormat, Utc};

use super::{DirectRun, GRID, web_mercator_x, web_mercator_y};
use crate::{cams::LatLonRaster, publisher::atomic_write};

pub const DIRECTORY: &str = "icon-d2-archive";
/// A year and a margin: enough for a yearly refit of the sunshine parameters (MIP-38, open vraag 6).
pub const RETENTION_DAYS: i64 = 400;

pub struct Station {
    pub id: u32,
    pub lon: f64,
    pub lat: f64,
}

/// The 32 KNMI stations with hourly sunshine (SQ) used in MIP-38 and MIP-39.
pub const STATIONS: [Station; 32] = [
    Station {
        id: 215,
        lon: 4.437,
        lat: 52.141,
    },
    Station {
        id: 235,
        lon: 4.781,
        lat: 52.928,
    },
    Station {
        id: 240,
        lon: 4.790,
        lat: 52.318,
    },
    Station {
        id: 249,
        lon: 4.979,
        lat: 52.644,
    },
    Station {
        id: 251,
        lon: 5.346,
        lat: 53.392,
    },
    Station {
        id: 257,
        lon: 4.603,
        lat: 52.506,
    },
    Station {
        id: 260,
        lon: 5.180,
        lat: 52.100,
    },
    Station {
        id: 267,
        lon: 5.384,
        lat: 52.898,
    },
    Station {
        id: 269,
        lon: 5.520,
        lat: 52.458,
    },
    Station {
        id: 270,
        lon: 5.752,
        lat: 53.224,
    },
    Station {
        id: 273,
        lon: 5.888,
        lat: 52.703,
    },
    Station {
        id: 275,
        lon: 5.873,
        lat: 52.056,
    },
    Station {
        id: 277,
        lon: 6.200,
        lat: 53.413,
    },
    Station {
        id: 278,
        lon: 6.259,
        lat: 52.435,
    },
    Station {
        id: 279,
        lon: 6.574,
        lat: 52.750,
    },
    Station {
        id: 280,
        lon: 6.585,
        lat: 53.125,
    },
    Station {
        id: 283,
        lon: 6.657,
        lat: 52.069,
    },
    Station {
        id: 286,
        lon: 7.150,
        lat: 53.196,
    },
    Station {
        id: 290,
        lon: 6.891,
        lat: 52.274,
    },
    Station {
        id: 310,
        lon: 3.596,
        lat: 51.442,
    },
    Station {
        id: 319,
        lon: 3.861,
        lat: 51.226,
    },
    Station {
        id: 323,
        lon: 3.884,
        lat: 51.527,
    },
    Station {
        id: 330,
        lon: 4.122,
        lat: 51.992,
    },
    Station {
        id: 344,
        lon: 4.447,
        lat: 51.962,
    },
    Station {
        id: 348,
        lon: 4.926,
        lat: 51.970,
    },
    Station {
        id: 350,
        lon: 4.936,
        lat: 51.566,
    },
    Station {
        id: 356,
        lon: 5.146,
        lat: 51.859,
    },
    Station {
        id: 370,
        lon: 5.377,
        lat: 51.451,
    },
    Station {
        id: 375,
        lon: 5.707,
        lat: 51.659,
    },
    Station {
        id: 377,
        lon: 5.763,
        lat: 51.198,
    },
    Station {
        id: 380,
        lon: 5.762,
        lat: 50.906,
    },
    Station {
        id: 392,
        lon: 6.056,
        lat: 51.487,
    },
];

/// Index of the source point nearest to each station.
pub fn nearest_points(raster: &LatLonRaster) -> Result<Vec<usize>> {
    STATIONS
        .iter()
        .map(|station| {
            let row = ((station.lat - raster.lat0) / raster.dlat).round();
            let column = ((station.lon - raster.lon0) / raster.dlon).round();
            ensure!(
                (0.0..raster.nj as f64).contains(&row) && (0.0..raster.ni as f64).contains(&column),
                "station {} lies outside the ICON-D2 raster",
                station.id
            );
            Ok(row as usize * raster.ni + column as usize)
        })
        .collect()
}

/// Index of the publication cell that contains each station, the cell the client reads for that point.
pub fn publication_cells() -> Vec<usize> {
    STATIONS
        .iter()
        .map(|station| {
            let column = ((web_mercator_x(station.lon) - GRID.x0) / GRID.dx).floor() as usize;
            let row = ((web_mercator_y(station.lat) - GRID.y0) / GRID.dy).floor() as usize;
            row * GRID.width as usize + column
        })
        .collect()
}

pub fn path(data_dir: &Path, run: DateTime<Utc>) -> std::path::PathBuf {
    data_dir
        .join(DIRECTORY)
        .join(format!("{}.csv.bz2", run.format("%Y%m%dT%H")))
}

/// One row per station and lead: the hour mean of the 8 km publication cell and of the nearest 2 km point.
pub fn write(data_dir: &Path, run: &DirectRun) -> Result<()> {
    ensure!(
        run.station_hours.len() == run.hours.len(),
        "ICON-D2 station series do not match the run"
    );
    let cells = publication_cells();
    let mut csv = String::from("station,lead,hour_end_utc,block_wm2,point_wm2\n");
    for (index, (block, points)) in run.hours.iter().zip(&run.station_hours).enumerate() {
        let lead = index as i64 + 1;
        let hour_end = (run.run + Duration::hours(lead)).to_rfc3339_opts(SecondsFormat::Secs, true);
        for ((station, cell), point) in STATIONS.iter().zip(&cells).zip(points) {
            writeln!(
                csv,
                "{},{lead},{hour_end},{:.1},{point:.1}",
                station.id, block[*cell]
            )?;
        }
    }
    let mut encoder = BzEncoder::new(Vec::new(), Compression::best());
    encoder.write_all(csv.as_bytes())?;
    atomic_write(&path(data_dir, run.run), &encoder.finish()?)
}

/// Removes extracts of runs older than [`RETENTION_DAYS`]; other files in the directory stay.
pub fn prune(data_dir: &Path, now: DateTime<Utc>) -> Result<usize> {
    let directory = data_dir.join(DIRECTORY);
    if !directory.is_dir() {
        return Ok(0);
    }
    let mut removed = 0;
    for entry in fs::read_dir(&directory)? {
        let entry = entry?;
        let name = entry.file_name();
        let Some(stamp) = name.to_str().and_then(|name| name.strip_suffix(".csv.bz2")) else {
            continue;
        };
        let Ok(run) = NaiveDateTime::parse_from_str(&format!("{stamp}0000"), "%Y%m%dT%H%M%S")
        else {
            continue;
        };
        if now - run.and_utc() > Duration::days(RETENTION_DAYS) {
            fs::remove_file(entry.path())
                .with_context(|| format!("removing {}", entry.path().display()))?;
            removed += 1;
        }
    }
    Ok(removed)
}
