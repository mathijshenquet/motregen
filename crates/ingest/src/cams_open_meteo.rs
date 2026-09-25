//! Key-free development fallback: the same CAMS Europe forecast through Open-Meteo's
//! air-quality API, sampled point-wise on its own 0.1° lattice (aligned on x.0°).

use std::{collections::BTreeMap, thread, time::Duration};

use anyhow::{Context, Result, bail, ensure};
use chrono::{DateTime, Utc};
use reqwest::{StatusCode, blocking::Client};
use serde::Deserialize;
use tracing::{info, warn};

use crate::cams::{AREA, CamsRun, Field, LEADS, LatLonRaster};

pub const DEFAULT_OPEN_METEO_API: &str = "https://air-quality-api.open-meteo.com";
const BATCH: usize = 100;
/// Open-Meteo counts every location as one call and allows 600 per minute; 100
/// locations every 12 s stays under that (a full lattice takes ~4 minutes).
const BATCH_PAUSE: Duration = Duration::from_secs(12);
const RATE_LIMIT_PAUSE: Duration = Duration::from_secs(65);
const ATTEMPTS: usize = 5;

/// 50.2–53.9 N × 2.2–7.6 E at 0.1°, north row first: the ADS area on Open-Meteo's lattice.
pub fn lattice() -> LatLonRaster {
    LatLonRaster {
        lat0: AREA[0],
        lon0: AREA[1],
        dlat: -0.1,
        dlon: 0.1,
        ni: ((AREA[3] - AREA[1]) / 0.1).round() as usize + 1,
        nj: ((AREA[0] - AREA[2]) / 0.1).round() as usize + 1,
    }
}

#[derive(Deserialize)]
struct Meta {
    last_run_initialisation_time: i64,
}

#[derive(Deserialize)]
struct Location {
    latitude: f64,
    longitude: f64,
    hourly: BTreeMap<String, serde_json::Value>,
}

pub struct OpenMeteoClient {
    client: Client,
    base: String,
}

impl OpenMeteoClient {
    pub fn new(base: Option<String>) -> Result<Self> {
        Ok(Self {
            client: Client::builder()
                .connect_timeout(Duration::from_secs(30))
                .timeout(Duration::from_secs(120))
                .build()?,
            base: base.unwrap_or_else(|| DEFAULT_OPEN_METEO_API.to_owned()),
        })
    }

    /// The run Open-Meteo currently serves; it does not say so in forecast responses.
    pub fn latest_run(&self) -> Result<DateTime<Utc>> {
        let meta: Meta = self
            .client
            .get(format!("{}/data/cams_europe/static/meta.json", self.base))
            .send()?
            .error_for_status()?
            .json()?;
        DateTime::from_timestamp(meta.last_run_initialisation_time, 0)
            .context("invalid Open-Meteo run time")
    }

    pub fn fetch(&self, run: DateTime<Utc>, fields: &[Field]) -> Result<CamsRun> {
        let raster = lattice();
        let points = (0..raster.nj)
            .flat_map(|j| {
                (0..raster.ni).map(move |i| {
                    (
                        raster.lat0 + j as f64 * raster.dlat,
                        raster.lon0 + i as f64 * raster.dlon,
                    )
                })
            })
            .collect::<Vec<_>>();
        let mut fields_out: BTreeMap<Field, BTreeMap<u32, Vec<f32>>> = fields
            .iter()
            .map(|field| {
                (
                    *field,
                    (0..=LEADS)
                        .map(|lead| (lead, Vec::with_capacity(points.len())))
                        .collect(),
                )
            })
            .collect();
        for (index, batch) in points.chunks(BATCH).enumerate() {
            if index > 0 {
                thread::sleep(BATCH_PAUSE);
            }
            let body = self.request(run, fields, batch)?;
            append_batch(&body, batch, fields, &mut fields_out)?;
            info!(
                points = (index * BATCH + batch.len()),
                of = points.len(),
                "open-meteo batch fetched"
            );
        }
        Ok(CamsRun {
            run,
            provider: "open-meteo".into(),
            raster,
            fields: fields_out,
        })
    }

    fn request(&self, run: DateTime<Utc>, fields: &[Field], batch: &[(f64, f64)]) -> Result<String> {
        let join = |values: Vec<String>| values.join(",");
        let hour = |time: DateTime<Utc>| time.format("%Y-%m-%dT%H:%M").to_string();
        let query = [
            ("latitude", join(batch.iter().map(|p| format!("{:.1}", p.0)).collect())),
            ("longitude", join(batch.iter().map(|p| format!("{:.1}", p.1)).collect())),
            (
                "hourly",
                join(fields.iter().map(|f| f.open_meteo_variable().to_owned()).collect()),
            ),
            ("domains", "cams_europe".to_owned()),
            ("timezone", "GMT".to_owned()),
            ("start_hour", hour(run)),
            ("end_hour", hour(run + chrono::Duration::hours(i64::from(LEADS)))),
        ];
        for attempt in 1..=ATTEMPTS {
            let response = self
                .client
                .get(format!("{}/v1/air-quality", self.base))
                .query(&query)
                .send()?;
            if response.status() == StatusCode::TOO_MANY_REQUESTS && attempt < ATTEMPTS {
                warn!(attempt, "open-meteo rate limit; pausing");
                thread::sleep(RATE_LIMIT_PAUSE);
                continue;
            }
            return Ok(response.error_for_status()?.text()?);
        }
        bail!("open-meteo kept rate-limiting after {ATTEMPTS} attempts")
    }
}

fn append_batch(
    body: &str,
    batch: &[(f64, f64)],
    fields: &[Field],
    out: &mut BTreeMap<Field, BTreeMap<u32, Vec<f32>>>,
) -> Result<()> {
    let locations: Vec<Location> = if batch.len() == 1 {
        vec![serde_json::from_str(body)?]
    } else {
        serde_json::from_str(body)?
    };
    ensure!(
        locations.len() == batch.len(),
        "open-meteo returned {} locations for {}",
        locations.len(),
        batch.len()
    );
    for (location, (lat, lon)) in locations.iter().zip(batch) {
        ensure!(
            (location.latitude - lat).abs() < 0.051 && (location.longitude - lon).abs() < 0.051,
            "open-meteo snapped {lat},{lon} to {},{}",
            location.latitude,
            location.longitude
        );
        for field in fields {
            let series: Vec<Option<f32>> = serde_json::from_value(
                location
                    .hourly
                    .get(field.open_meteo_variable())
                    .with_context(|| format!("open-meteo omitted {}", field.open_meteo_variable()))?
                    .clone(),
            )?;
            ensure!(
                series.len() == LEADS as usize + 1,
                "open-meteo returned {} hours of {}",
                series.len(),
                field.name()
            );
            let leads = out.get_mut(field).expect("field initialised");
            for (lead, value) in series.iter().enumerate() {
                leads
                    .get_mut(&(lead as u32))
                    .expect("lead initialised")
                    .push(value.unwrap_or(f32::NAN));
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lattice_covers_the_ads_area_on_whole_tenths() {
        let raster = lattice();
        assert_eq!((raster.ni, raster.nj), (55, 38));
        assert!((raster.lat0 + (raster.nj - 1) as f64 * raster.dlat - AREA[2]).abs() < 1e-9);
        assert!((raster.lon0 + (raster.ni - 1) as f64 * raster.dlon - AREA[3]).abs() < 1e-9);
    }

    #[test]
    fn batch_parser_orders_values_by_lead_and_rejects_snapping() {
        let hours = |base: f32| {
            (0..=LEADS)
                .map(|lead| if lead == 3 { "null".to_owned() } else { (base + lead as f32).to_string() })
                .collect::<Vec<_>>()
                .join(",")
        };
        let body = format!(
            r#"[{{"latitude":53.9,"longitude":2.2,"hourly":{{"time":["2026-09-25T00:00"],"ozone":[{}]}}}},
                {{"latitude":53.9,"longitude":2.3000002,"hourly":{{"time":["2026-09-25T00:00"],"ozone":[{}]}}}}]"#,
            hours(10.0),
            hours(50.0)
        );
        let mut out = BTreeMap::from([(
            Field::O3,
            (0..=LEADS).map(|lead| (lead, Vec::new())).collect(),
        )]);
        append_batch(&body, &[(53.9, 2.2), (53.9, 2.3)], &[Field::O3], &mut out).unwrap();
        assert_eq!(out[&Field::O3][&0], [10.0, 50.0]);
        assert_eq!(out[&Field::O3][&96], [106.0, 146.0]);
        assert!(out[&Field::O3][&3].iter().all(|value| value.is_nan()));
        let error = append_batch(&body, &[(53.9, 2.2), (52.0, 2.3)], &[Field::O3], &mut out)
            .unwrap_err()
            .to_string();
        assert!(error.contains("snapped"), "{error}");
    }
}
