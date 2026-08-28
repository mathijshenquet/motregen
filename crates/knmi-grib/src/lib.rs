use std::path::Path;

use anyhow::{Context, Result, bail};
use eccodes::{CodesFile, FallibleIterator, KeyRead, ProductKind};
use serde::{Deserialize, Serialize};

const TABLE_VERSION: i64 = 253;
const TOTAL_PRECIPITATION_PARAMETER: i64 = 61;
const TEMPERATURE_PARAMETER: i64 = 11;
const RELATIVE_HUMIDITY_PARAMETER: i64 = 52;
const U_WIND_PARAMETER: i64 = 33;
const V_WIND_PARAMETER: i64 = 34;
const GLOBAL_RADIATION_PARAMETER: i64 = 117;
const TOTAL_CLOUD_COVER_PARAMETER: i64 = 71;
const HEIGHT_ABOVE_GROUND: &str = "sfc";

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct GridDefinition {
    pub grid_type: String,
    pub ni: usize,
    pub nj: usize,
    pub latitude_first: f64,
    pub longitude_first: f64,
    pub latitude_last: f64,
    pub longitude_last: f64,
    pub latitude_increment: f64,
    pub longitude_increment: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PrecipitationField {
    pub start_step: i64,
    pub end_step: i64,
    pub grid: GridDefinition,
    pub values: Vec<f32>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct AromeFields {
    pub precipitation_mm: PrecipitationField,
    pub temperature_k: PrecipitationField,
    pub relative_humidity: PrecipitationField,
    pub wind_u_ms: PrecipitationField,
    pub wind_v_ms: PrecipitationField,
    pub global_radiation_j_m2: PrecipitationField,
    pub total_cloud_cover: PrecipitationField,
}

#[derive(Clone, Copy)]
enum FieldKind {
    Precipitation,
    Temperature,
    RelativeHumidity,
    WindU,
    WindV,
    GlobalRadiation,
    TotalCloudCover,
}

pub fn decode_arome_fields(path: impl AsRef<Path>) -> Result<AromeFields> {
    let path = path.as_ref();
    let mut file = CodesFile::new_from_file(path, ProductKind::GRIB)
        .with_context(|| format!("opening {}", path.display()))?;
    let mut precipitation = None;
    let mut temperature = None;
    let mut relative_humidity = None;
    let mut wind_u = None;
    let mut wind_v = None;
    let mut global_radiation = None;
    let mut total_cloud_cover = None;

    while let Some(message) = file.ref_message_iter().next()? {
        let parameter: i64 = message.read_key("indicatorOfParameter")?;
        let (kind, expected_level, expected_time_range) = match parameter {
            TOTAL_PRECIPITATION_PARAMETER => (FieldKind::Precipitation, 0, 4),
            TEMPERATURE_PARAMETER => (FieldKind::Temperature, 2, 0),
            RELATIVE_HUMIDITY_PARAMETER => (FieldKind::RelativeHumidity, 2, 0),
            U_WIND_PARAMETER => (FieldKind::WindU, 10, 0),
            V_WIND_PARAMETER => (FieldKind::WindV, 10, 0),
            GLOBAL_RADIATION_PARAMETER => (FieldKind::GlobalRadiation, 0, 4),
            TOTAL_CLOUD_COVER_PARAMETER => (FieldKind::TotalCloudCover, 0, 0),
            _ => continue,
        };
        let table_version: i64 = message.read_key("table2Version")?;
        if table_version != TABLE_VERSION {
            continue;
        }
        let level_type: String = message.read_key("indicatorOfTypeOfLevel")?;
        if level_type != HEIGHT_ABOVE_GROUND {
            continue;
        }
        let level: i64 = message.read_key("level")?;
        if level != expected_level {
            continue;
        }
        let time_range: i64 = message.read_key("timeRangeIndicator")?;
        if time_range != expected_time_range {
            continue;
        }

        let ni: i64 = message.read_key("Ni")?;
        let nj: i64 = message.read_key("Nj")?;
        let ni = usize::try_from(ni)?;
        let nj = usize::try_from(nj)?;
        let field = PrecipitationField {
            start_step: message.read_key("startStep")?,
            end_step: message.read_key("endStep")?,
            grid: GridDefinition {
                grid_type: message.read_key("gridType")?,
                ni,
                nj,
                latitude_first: message.read_key("latitudeOfFirstGridPointInDegrees")?,
                longitude_first: message.read_key("longitudeOfFirstGridPointInDegrees")?,
                latitude_last: message.read_key("latitudeOfLastGridPointInDegrees")?,
                longitude_last: message.read_key("longitudeOfLastGridPointInDegrees")?,
                latitude_increment: message.read_key("jDirectionIncrementInDegrees")?,
                longitude_increment: message.read_key("iDirectionIncrementInDegrees")?,
            },
            values: message
                .to_ndarray()?
                .into_iter()
                .map(|value| value as f32)
                .collect(),
        };
        let slot = match kind {
            FieldKind::Precipitation => &mut precipitation,
            FieldKind::Temperature => &mut temperature,
            FieldKind::RelativeHumidity => &mut relative_humidity,
            FieldKind::WindU => &mut wind_u,
            FieldKind::WindV => &mut wind_v,
            FieldKind::GlobalRadiation => &mut global_radiation,
            FieldKind::TotalCloudCover => &mut total_cloud_cover,
        };
        if slot.replace(field).is_some() {
            bail!("duplicate selected AROME field in {}", path.display());
        }
    }

    let missing = |name: &str| anyhow::anyhow!("no AROME {name} field found in {}", path.display());
    Ok(AromeFields {
        precipitation_mm: precipitation.ok_or_else(|| missing("total-precipitation"))?,
        temperature_k: temperature.ok_or_else(|| missing("2 m temperature"))?,
        relative_humidity: relative_humidity.ok_or_else(|| missing("2 m relative humidity"))?,
        wind_u_ms: wind_u.ok_or_else(|| missing("10 m U-wind"))?,
        wind_v_ms: wind_v.ok_or_else(|| missing("10 m V-wind"))?,
        global_radiation_j_m2: global_radiation.ok_or_else(|| missing("global-radiation"))?,
        total_cloud_cover: total_cloud_cover.ok_or_else(|| missing("total cloud cover"))?,
    })
}

pub fn decode_total_precipitation(path: impl AsRef<Path>) -> Result<PrecipitationField> {
    let path = path.as_ref();
    let mut file = CodesFile::new_from_file(path, ProductKind::GRIB)
        .with_context(|| format!("opening {}", path.display()))?;

    while let Some(message) = file.ref_message_iter().next()? {
        let parameter: i64 = message.read_key("indicatorOfParameter")?;
        if parameter != TOTAL_PRECIPITATION_PARAMETER {
            continue;
        }
        let table_version: i64 = message.read_key("table2Version")?;
        if table_version != TABLE_VERSION {
            continue;
        }
        let level_type: String = message.read_key("indicatorOfTypeOfLevel")?;
        if level_type != HEIGHT_ABOVE_GROUND {
            continue;
        }
        let level: i64 = message.read_key("level")?;
        if level != 0 {
            continue;
        }
        let time_range: i64 = message.read_key("timeRangeIndicator")?;
        if time_range != 4 {
            continue;
        }

        let ni: i64 = message.read_key("Ni")?;
        let nj: i64 = message.read_key("Nj")?;
        let ni = usize::try_from(ni)?;
        let nj = usize::try_from(nj)?;
        let values = message
            .to_ndarray()?
            .into_iter()
            .map(|value| value as f32)
            .collect::<Vec<_>>();
        return Ok(PrecipitationField {
            start_step: message.read_key("startStep")?,
            end_step: message.read_key("endStep")?,
            grid: GridDefinition {
                grid_type: message.read_key("gridType")?,
                ni,
                nj,
                latitude_first: message.read_key("latitudeOfFirstGridPointInDegrees")?,
                longitude_first: message.read_key("longitudeOfFirstGridPointInDegrees")?,
                latitude_last: message.read_key("latitudeOfLastGridPointInDegrees")?,
                longitude_last: message.read_key("longitudeOfLastGridPointInDegrees")?,
                latitude_increment: message.read_key("jDirectionIncrementInDegrees")?,
                longitude_increment: message.read_key("iDirectionIncrementInDegrees")?,
            },
            values,
        });
    }

    bail!(
        "no AROME total-precipitation field found in {}",
        path.display()
    )
}

pub fn hourly_precipitation(
    previous: &PrecipitationField,
    current: &PrecipitationField,
) -> Result<Vec<f32>> {
    if previous.grid != current.grid {
        bail!("cannot de-accumulate precipitation on different grids");
    }
    if current.end_step - previous.end_step != 1 {
        bail!("precipitation fields must be consecutive hourly lead times");
    }
    Ok(current
        .values
        .iter()
        .zip(&previous.values)
        .map(|(current, previous)| current - previous)
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn field(end_step: i64, values: Vec<f32>) -> PrecipitationField {
        PrecipitationField {
            start_step: 0,
            end_step,
            grid: GridDefinition {
                grid_type: "regular_ll".into(),
                ni: values.len(),
                nj: 1,
                latitude_first: 0.0,
                longitude_first: 0.0,
                latitude_last: 0.0,
                longitude_last: 0.0,
                latitude_increment: 0.0,
                longitude_increment: 0.0,
            },
            values,
        }
    }

    #[test]
    fn deaccumulates_consecutive_fields() {
        let previous = field(1, vec![0.25, 1.0]);
        let current = field(2, vec![0.75, 1.0]);
        assert_eq!(
            hourly_precipitation(&previous, &current).unwrap(),
            [0.5, 0.0]
        );
    }
}
