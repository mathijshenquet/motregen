//! CPU-kosten van het gevoel met zon (MIP-41) op een gecachte HARMONIE-run, naast de vorm zonder straling.
//!   cargo run --release -p motregen-ingest --example feels_cost -- <data>/.ingest-cache/arome/<run>
//! Drukt per lead de rekentijd van beide vormen af, de GRIB-decodeertijd ter vergelijking, en het gevoel in De Bilt.

use std::{path::PathBuf, time::Instant};

use anyhow::{Context, Result};
use chrono::{DateTime, Duration, NaiveDateTime, Utc};
use motregen_ingest::{
    feels::{SunGeometry, feels_like_c, feels_like_frame},
    grid::{HOURLY_GRID, IndexMap},
};

fn main() -> Result<()> {
    let directory = PathBuf::from(
        std::env::args()
            .nth(1)
            .context("usage: feels_cost <arome-run-dir>")?,
    );
    let run = NaiveDateTime::parse_from_str(
        directory
            .file_name()
            .and_then(|name| name.to_str())
            .context("run dir")?,
        "%Y%m%dT%H%M",
    )?
    .and_utc();
    let mut members = std::fs::read_dir(&directory)?
        .map(|entry| entry.map(|entry| entry.path()))
        .collect::<Result<Vec<_>, _>>()?;
    members.sort();
    let de_bilt = de_bilt_index();
    let sun = SunGeometry::new(HOURLY_GRID);
    let (mut decode_total, mut shade_total, mut sun_total) = (0.0, 0.0, 0.0);
    let mut previous: Option<(knmi_grib::AromeFields, Option<Vec<f32>>)> = None;
    let mut map: Option<IndexMap> = None;
    let mut pending: Option<(DateTime<Utc>, [Vec<f32>; 5])> = None;
    for path in &members {
        let started = Instant::now();
        let fields = knmi_grib::decode_arome_fields(path)?;
        decode_total += started.elapsed().as_secs_f64();
        let map = map.get_or_insert_with(|| {
            IndexMap::arome_on(&fields.temperature_k.grid, HOURLY_GRID).unwrap()
        });
        let Some((before, _)) = previous.take() else {
            previous = Some((fields, None));
            continue;
        };
        let valid = run + Duration::hours(fields.temperature_k.end_step);
        let radiation = knmi_grib::hourly_precipitation(
            &before.global_radiation_j_m2,
            &fields.global_radiation_j_m2,
        )?
        .into_iter()
        .map(|energy| energy / 3_600.0)
        .collect::<Vec<_>>();
        let radiation = map.gather(&radiation)?;
        let temperature = map
            .gather(&fields.temperature_k.values)?
            .into_iter()
            .map(|kelvin| kelvin - 273.15)
            .collect::<Vec<_>>();
        let inputs = [
            temperature,
            map.gather(&fields.relative_humidity.values)?,
            map.gather(&fields.wind_u_ms.values)?,
            map.gather(&fields.wind_v_ms.values)?,
            radiation,
        ];
        if let Some((time, [temperature, humidity, wind_u, wind_v, global])) = pending.take() {
            let started = Instant::now();
            let shade = (0..temperature.len())
                .map(|index| {
                    feels_like_c(
                        temperature[index],
                        humidity[index],
                        wind_u[index],
                        wind_v[index],
                        0.0,
                    )
                })
                .collect::<Vec<_>>();
            shade_total += started.elapsed().as_secs_f64();
            let started = Instant::now();
            let sunny = feels_like_frame(
                &sun,
                time.timestamp_millis() as f64,
                &temperature,
                &humidity,
                &wind_u,
                &wind_v,
                &global,
                Some(&inputs[4]),
            );
            let elapsed = started.elapsed().as_secs_f64();
            sun_total += elapsed;
            println!(
                "{} De Bilt T {:.1} G {:.0} → zonder {:.1} met zon {:.1} °C · {:.1} ms",
                time.format("%Y-%m-%dT%H:%MZ"),
                temperature[de_bilt],
                global[de_bilt],
                shade[de_bilt],
                sunny[de_bilt],
                elapsed * 1_000.0
            );
        }
        pending = Some((valid, inputs));
        previous = Some((fields, None));
    }
    println!(
        "GRIB decoderen {decode_total:.2} s · gevoel zonder straling {shade_total:.3} s · met zon {sun_total:.3} s (één thread, {} leads)",
        members.len() - 2
    );
    Ok(())
}

fn de_bilt_index() -> usize {
    let (longitude, latitude) = (5.18_f64, 52.1_f64);
    let x = longitude.to_radians() * 6_378_137.0;
    let y = (std::f64::consts::FRAC_PI_4 + latitude.to_radians() / 2.0)
        .tan()
        .ln()
        * 6_378_137.0;
    let column = ((x - HOURLY_GRID.x0) / HOURLY_GRID.dx) as usize;
    let row = ((y - HOURLY_GRID.y0) / HOURLY_GRID.dy) as usize;
    row * HOURLY_GRID.width as usize + column
}
