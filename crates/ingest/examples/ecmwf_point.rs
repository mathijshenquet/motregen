use std::{env, fs, path::PathBuf};

use anyhow::{Context, Result, ensure};
use chrono::NaiveDate;
use motregen_ingest::ecmwf::{self, CROP, EcmwfRun, Field, Sidecar, download::decode_message};

fn main() -> Result<()> {
    let arguments = env::args().skip(1).collect::<Vec<_>>();
    ensure!(
        arguments.len() == 4,
        "usage: ecmwf_point DATA_DIR YYYY-MM-DD LAT LON"
    );
    let directory = PathBuf::from(&arguments[0]);
    let date: NaiveDate = arguments[1].parse()?;
    let lat: f64 = arguments[2].parse()?;
    let lon: f64 = arguments[3].parse()?;
    let sidecar: Sidecar = serde_json::from_slice(&fs::read(directory.join(ecmwf::SIDECAR))?)?;
    let run: chrono::DateTime<chrono::Utc> = sidecar.section.run.parse()?;
    let paths = fs::read_dir(
        directory
            .join(".ecmwf-cache")
            .join(run.format("%Y%m%dT%H").to_string()),
    )?
    .map(|entry| Ok(entry?.path()))
    .collect::<Result<Vec<_>>>()?;
    let messages = paths
        .iter()
        .filter(|path| {
            path.extension()
                .is_some_and(|extension| extension == "grib2")
        })
        .map(|path| decode_message(path))
        .collect::<Result<Vec<_>>>()?;
    let daily = ecmwf::aggregate(&EcmwfRun { run, messages })?;
    let day = daily
        .days
        .iter()
        .position(|day| day.date == date)
        .context("day not covered")?;
    let row = ((lat - CROP.lat0) / CROP.dlat).round() as isize;
    let column = ((lon - CROP.lon0) / CROP.dlon).round() as isize;
    ensure!(
        (0..CROP.nj as isize).contains(&row) && (0..CROP.ni as isize).contains(&column),
        "point outside native crop"
    );
    let source_cell = row as usize * CROP.ni + column as usize;
    let x = 6_378_137.0 * lon.to_radians();
    let y = 6_378_137.0
        * (std::f64::consts::FRAC_PI_4 + lat.to_radians() / 2.0)
            .tan()
            .ln();
    let grid = ecmwf::GRID;
    let i = ((x - grid.x0) / grid.dx).floor() as isize;
    let j = ((y - grid.y0) / grid.dy).floor() as isize;
    ensure!(
        (0..grid.width as isize).contains(&i) && (0..grid.height as isize).contains(&j),
        "point outside published grid"
    );
    println!(
        "date={date} native_lat={} native_lon={} published_cell={i},{j}",
        CROP.lat0 + row as f64 * CROP.dlat,
        CROP.lon0 + column as f64 * CROP.dlon
    );
    for field in [Field::Tmax, Field::Precip] {
        let chunk = sidecar
            .chunks
            .iter()
            .find(|chunk| chunk.field == field.name())
            .context("field absent")?;
        let decoded = mrf::decode(&fs::read(directory.join(&chunk.url))?)?;
        let value = decoded.header.quant
            [decoded.frames[day][j as usize * grid.width as usize + i as usize] as usize];
        println!(
            "{} native={:.9} published={value:?}",
            field.name(),
            daily.fields[&field][day][source_cell]
        );
    }
    Ok(())
}
