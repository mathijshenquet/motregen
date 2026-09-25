//! Atmosphere Data Store (ADS) retrieve API and the GRIB2 it returns for CAMS Europe.

use std::{
    collections::BTreeMap,
    fs,
    io::Write,
    path::{Path, PathBuf},
    thread,
    time::{Duration, Instant},
};

use anyhow::{Context, Result, bail, ensure};
use chrono::{DateTime, NaiveDate, NaiveDateTime, NaiveTime, Utc};
use eccodes::{CodesFile, FallibleIterator, KeyRead, ProductKind};
use reqwest::blocking::{Client, Response};
use serde::Deserialize;
use serde_json::{Value, json};
use tracing::{info, warn};

use crate::cams::{ADS_DATASET, AREA, CamsRun, Field, LEADS, LatLonRaster, MASS_DENSITY};

pub const DEFAULT_ADS_API: &str = "https://ads.atmosphere.copernicus.eu/api";
const POLL_INTERVAL: Duration = Duration::from_secs(10);
/// ADS queues requests; a CAMS Europe cut-out normally finishes within minutes.
const JOB_DEADLINE: Duration = Duration::from_secs(90 * 60);
const MICROGRAMS_PER_KILOGRAM: f32 = 1e9;

/// The exact `inputs` of the retrieve request, documented in docs/pollen.md.
pub fn request_inputs(run: DateTime<Utc>, fields: &[Field]) -> Value {
    let date = run.format("%Y-%m-%d").to_string();
    json!({
        "variable": fields.iter().map(|field| field.ads_variable()).collect::<Vec<_>>(),
        "model": ["ensemble"],
        "level": ["0"],
        "date": format!("{date}/{date}"),
        "type": ["forecast"],
        "time": run.format("%H:%M").to_string(),
        "leadtime_hour": (0..=LEADS).map(|lead| lead.to_string()).collect::<Vec<_>>(),
        "data_format": "grib",
        "area": AREA,
    })
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Job {
    #[serde(rename = "jobID")]
    job_id: String,
    status: String,
}

#[derive(Deserialize)]
struct Results {
    asset: Asset,
}

#[derive(Deserialize)]
struct Asset {
    value: AssetValue,
}

#[derive(Deserialize)]
struct AssetValue {
    href: String,
}

pub struct AdsClient {
    client: Client,
    key: String,
    base: String,
}

impl AdsClient {
    pub fn new(key: String, base: Option<String>) -> Result<Self> {
        ensure!(!key.trim().is_empty(), "ADS API key is empty");
        Ok(Self {
            client: Client::builder()
                .connect_timeout(Duration::from_secs(30))
                .timeout(Duration::from_secs(30 * 60))
                .build()?,
            key: key.trim().to_owned(),
            base: base.unwrap_or_else(|| DEFAULT_ADS_API.to_owned()),
        })
    }

    /// Submits the request, waits for the job and downloads the GRIB to `target`.
    pub fn retrieve(&self, inputs: &Value, target: &Path) -> Result<PathBuf> {
        let started = Instant::now();
        let url = format!("{}/retrieve/v1/processes/{ADS_DATASET}/execution", self.base);
        let mut job: Job = checked(
            self.client
                .post(&url)
                .header("PRIVATE-TOKEN", &self.key)
                .json(&json!({ "inputs": inputs }))
                .send()?,
            "submitting ADS request",
        )?
        .json()?;
        info!(job = job.job_id, status = job.status, "ADS job submitted");
        let job_url = format!("{}/retrieve/v1/jobs/{}", self.base, job.job_id);
        while matches!(job.status.as_str(), "accepted" | "running") {
            ensure!(
                started.elapsed() < JOB_DEADLINE,
                "ADS job {} still {} after {:?}",
                job.job_id,
                job.status,
                started.elapsed()
            );
            thread::sleep(POLL_INTERVAL);
            job = checked(
                self.client
                    .get(&job_url)
                    .header("PRIVATE-TOKEN", &self.key)
                    .send()?,
                "polling ADS job",
            )?
            .json()?;
        }
        let results = self
            .client
            .get(format!("{job_url}/results"))
            .header("PRIVATE-TOKEN", &self.key)
            .send()?;
        if job.status != "successful" {
            let detail = results.text().unwrap_or_default();
            self.delete(&job_url);
            bail!("ADS job {} {}: {detail}", job.job_id, job.status);
        }
        let results: Results = checked(results, "reading ADS job results")?.json()?;
        let bytes = checked(
            self.client.get(&results.asset.value.href).send()?,
            "downloading ADS result",
        )?
        .bytes()?;
        self.delete(&job_url);
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent)?;
        }
        let mut temporary = tempfile::NamedTempFile::new_in(
            target.parent().context("ADS target has no parent")?,
        )?;
        temporary.write_all(&bytes)?;
        temporary.persist(target).map_err(|error| error.error)?;
        info!(
            bytes = bytes.len(),
            elapsed_seconds = started.elapsed().as_secs_f64(),
            "ADS result downloaded"
        );
        Ok(target.to_owned())
    }

    fn delete(&self, job_url: &str) {
        let result = self
            .client
            .delete(job_url)
            .header("PRIVATE-TOKEN", &self.key)
            .send();
        if let Err(error) = result {
            warn!(error = %error, "ADS job cleanup failed");
        }
    }
}

fn checked(response: Response, what: &str) -> Result<Response> {
    let status = response.status();
    if status.is_success() {
        return Ok(response);
    }
    let body = response.text().unwrap_or_default();
    let hint = match status.as_u16() {
        401 => " (ADS_API_KEY wrong or expired)",
        403 => " (accept the CAMS licence on the dataset page, see docs/pollen.md)",
        _ => "",
    };
    bail!("{what}: HTTP {status}{hint}: {body}")
}

/// Decodes an ADS CAMS Europe GRIB2 file into published units. Fields are identified
/// by (parameterNumber, constituentType); anything else in the file is an error, so a
/// changed encoding can never be published under the wrong name.
pub fn decode_grib(path: &Path) -> Result<CamsRun> {
    let mut file = CodesFile::new_from_file(path, ProductKind::GRIB)
        .with_context(|| format!("opening {}", path.display()))?;
    let mut run = None;
    let mut raster = None;
    let mut fields: BTreeMap<Field, BTreeMap<u32, Vec<f32>>> = BTreeMap::new();
    while let Some(message) = file.ref_message_iter().next()? {
        let category: i64 = message.read_key("parameterCategory")?;
        let number: i64 = message.read_key("parameterNumber")?;
        let constituent: i64 = message
            .read_key("constituentType")
            .context("GRIB message without constituentType (not PDT 40)")?;
        ensure!(
            long(&message, "discipline")? == 0 && category == 20,
            "unexpected GRIB parameter category {category}"
        );
        let field = Field::from_grib_id(number, constituent).with_context(|| {
            format!("unmapped CAMS GRIB field parameterNumber={number} constituentType={constituent}")
        })?;
        let date: i64 = message.read_key("dataDate")?;
        let time: i64 = message.read_key("dataTime")?;
        let message_run = NaiveDateTime::new(
            NaiveDate::parse_from_str(&date.to_string(), "%Y%m%d")?,
            NaiveTime::from_hms_opt((time / 100) as u32, (time % 100) as u32, 0)
                .context("invalid GRIB dataTime")?,
        )
        .and_utc();
        ensure!(
            *run.get_or_insert(message_run) == message_run,
            "GRIB file mixes runs"
        );
        ensure!(
            long(&message, "indicatorOfUnitOfTimeRange")? == 1,
            "CAMS lead time is not in hours"
        );
        let lead = u32::try_from(long(&message, "forecastTime")?)?;
        let message_raster = read_raster(&message)?;
        ensure!(
            *raster.get_or_insert(message_raster) == message_raster,
            "GRIB file mixes grids"
        );
        let mut values: Vec<f64> = message.read_key("values")?;
        if long(&message, "bitmapPresent")? == 1 {
            let missing: f64 = message.read_key("missingValue")?;
            values
                .iter_mut()
                .filter(|value| **value == missing)
                .for_each(|value| *value = f64::NAN);
        }
        let scale = if number == MASS_DENSITY {
            MICROGRAMS_PER_KILOGRAM
        } else {
            1.0
        };
        let values = values
            .into_iter()
            .map(|value| value as f32 * scale)
            .collect::<Vec<_>>();
        ensure!(
            fields.entry(field).or_default().insert(lead, values).is_none(),
            "duplicate {} lead {lead}",
            field.name()
        );
    }
    Ok(CamsRun {
        run: run.with_context(|| format!("{} holds no GRIB messages", path.display()))?,
        provider: "ads".into(),
        raster: raster.expect("set with run"),
        fields,
    })
}

fn long(message: &impl KeyRead<i64>, key: &str) -> Result<i64> {
    Ok(message.read_key(key)?)
}

fn read_raster<M: KeyRead<i64> + KeyRead<f64> + KeyRead<String>>(message: &M) -> Result<LatLonRaster> {
    let grid_type: String = message.read_key("gridType")?;
    ensure!(grid_type == "regular_ll", "CAMS grid is {grid_type}, not regular_ll");
    ensure!(
        long(message, "iScansNegatively")? == 0
            && long(message, "jPointsAreConsecutive")? == 0,
        "unsupported CAMS GRIB scanning mode"
    );
    let dlat: f64 = message.read_key("jDirectionIncrementInDegrees")?;
    let dlon: f64 = message.read_key("iDirectionIncrementInDegrees")?;
    let mut lon0: f64 = message.read_key("longitudeOfFirstGridPointInDegrees")?;
    if lon0 >= 180.0 {
        lon0 -= 360.0;
    }
    let north_first = long(message, "jScansPositively")? == 0;
    Ok(LatLonRaster {
        lat0: message.read_key("latitudeOfFirstGridPointInDegrees")?,
        lon0,
        dlat: if north_first { -dlat } else { dlat },
        dlon,
        ni: usize::try_from(long(message, "Ni")?)?,
        nj: usize::try_from(long(message, "Nj")?)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const FIXTURE: &str = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/tests/fixtures/cams-ads-20260925T00-l0-24.grib2"
    );

    #[test]
    fn recorded_ads_fixture_decodes_to_published_units() {
        let run = decode_grib(Path::new(FIXTURE)).unwrap();
        assert_eq!(run.run.to_rfc3339(), "2026-09-25T00:00:00+00:00");
        assert_eq!(
            run.raster,
            LatLonRaster {
                lat0: 53.85,
                lon0: 2.25,
                dlat: -0.1,
                dlon: 0.1,
                ni: 54,
                nj: 37
            }
        );
        assert_eq!(
            run.fields.keys().copied().collect::<Vec<_>>(),
            [Field::PollenMugwort, Field::Pm25, Field::Pm10, Field::No2, Field::O3]
        );
        assert!(run.fields.values().all(|leads| leads.len() == 25));
        run.validate().unwrap();
        // Mass density arrives in kg m-3 and must come out in µg/m³.
        let max = |field| {
            run.fields[&field]
                .values()
                .flatten()
                .copied()
                .fold(0.0_f32, f32::max)
        };
        assert!((5.0..200.0).contains(&max(Field::Pm25)), "{}", max(Field::Pm25));
        assert!((20.0..300.0).contains(&max(Field::O3)), "{}", max(Field::O3));
    }

    #[test]
    fn request_matches_the_documented_ads_inputs() {
        let run = DateTime::parse_from_rfc3339("2026-09-25T00:00:00Z")
            .unwrap()
            .with_timezone(&Utc);
        let inputs = request_inputs(run, &crate::cams::fields_for_run(run));
        assert_eq!(
            inputs["variable"],
            json!([
                "mugwort_pollen",
                "particulate_matter_2.5um",
                "particulate_matter_10um",
                "nitrogen_dioxide",
                "ozone"
            ])
        );
        assert_eq!(inputs["date"], "2026-09-25/2026-09-25");
        assert_eq!(inputs["time"], "00:00");
        assert_eq!(inputs["leadtime_hour"].as_array().unwrap().len(), 97);
        assert_eq!(inputs["area"], json!([53.9, 2.2, 50.2, 7.6]));
    }
}
