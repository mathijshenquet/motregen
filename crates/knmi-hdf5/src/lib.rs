use std::path::Path;

use anyhow::{Context, Result, bail, ensure};
use chrono::{Duration, NaiveDate, NaiveDateTime, SecondsFormat};
use hdf5::{File, Group, types::FixedAscii};
use serde::{Deserialize, Serialize};

const PRECIPITATION_PARAMETER: &str = "PRECIP_[MM]";
const EXPECTED_PROJECTION: &str =
    "+proj=stere +lat_0=90 +lon_0=0 +lat_ts=60 +a=6378137 +b=6356752 +x_0=0 +y_0=0 +units=km";
const ACCUMULATION_TO_HOURLY_RATE: f32 = 12.0;

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct RadarGrid {
    pub projection: String,
    pub x0_km: f64,
    pub y0_km: f64,
    pub dx_km: f64,
    pub dy_km: f64,
    pub width: usize,
    pub height: usize,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct RadarFrame {
    pub time: String,
    pub rates_mm_h: Vec<f32>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct RadarProduct {
    pub run: String,
    pub grid: RadarGrid,
    pub frames: Vec<RadarFrame>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct UvGrid {
    pub latitude_first: f64,
    pub longitude_first: f64,
    pub latitude_increment: f64,
    pub longitude_increment: f64,
    pub width: usize,
    pub height: usize,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct UvFrame {
    pub time: String,
    pub values: Vec<f32>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct UvProduct {
    pub date: String,
    pub window_start: String,
    pub window_end: String,
    pub grid: UvGrid,
    pub frames: Vec<UvFrame>,
}

pub fn decode_rtcor(path: impl AsRef<Path>) -> Result<RadarProduct> {
    decode(path.as_ref(), ProductKind::Rtcor)
}

pub fn decode_nowcast(path: impl AsRef<Path>) -> Result<RadarProduct> {
    decode(path.as_ref(), ProductKind::Nowcast)
}

pub fn decode_uv_index(path: impl AsRef<Path>) -> Result<UvProduct> {
    let path = path.as_ref();
    let file = File::open(path).with_context(|| format!("opening {}", path.display()))?;
    let root = file.group("/")?;
    let date_text = read_ascii(&root, "data_product_date")?;
    let date = NaiveDate::parse_from_str(&date_text, "%Y%m%d")?;
    let product = file.group("PRODUCT")?;
    let latitude = product.dataset("latitude")?.read_raw::<f32>()?;
    let longitude = product.dataset("longitude")?.read_raw::<f32>()?;
    let times = product.dataset("time")?.read_raw::<f32>()?;
    let statuses = product.dataset("status")?.read_raw::<u8>()?;
    ensure!(latitude.len() >= 2 && longitude.len() >= 2, "empty UV grid");
    ensure!(!times.is_empty(), "UV product has no scheduled times");
    ensure!(
        times.len() == statuses.len(),
        "UV time/status lengths differ"
    );
    let latitude_increment = regular_increment(&latitude, "latitude")?;
    let longitude_increment = regular_increment(&longitude, "longitude")?;
    let cloudy = product.dataset("uvi_cloudy")?;
    ensure!(
        cloudy.shape() == [times.len(), latitude.len(), longitude.len()],
        "uvi_cloudy shape does not match coordinates"
    );
    let values = cloudy.read_raw::<f32>()?;
    let cells = latitude.len() * longitude.len();
    let timestamps = times
        .iter()
        .map(|hours| uv_timestamp(date, *hours))
        .collect::<Result<Vec<_>>>()?;
    let mut frames = Vec::new();
    for (index, status) in statuses.into_iter().enumerate() {
        match status {
            0 => continue,
            1 | 2 => {}
            value => bail!("unsupported UV status {value}"),
        }
        let frame = values[index * cells..(index + 1) * cells]
            .iter()
            .map(|value| if *value < 0.0 { f32::NAN } else { *value })
            .collect::<Vec<_>>();
        ensure!(
            frame.iter().any(|value| value.is_finite()),
            "available UV frame contains only no-data"
        );
        frames.push(UvFrame {
            time: timestamps[index].clone(),
            values: frame,
        });
    }
    Ok(UvProduct {
        date: date_text,
        window_start: timestamps[0].clone(),
        window_end: timestamps[timestamps.len() - 1].clone(),
        grid: UvGrid {
            latitude_first: f64::from(latitude[0]),
            longitude_first: f64::from(longitude[0]),
            latitude_increment: f64::from(latitude_increment),
            longitude_increment: f64::from(longitude_increment),
            width: longitude.len(),
            height: latitude.len(),
        },
        frames,
    })
}

fn regular_increment(values: &[f32], name: &str) -> Result<f32> {
    let increment = values[1] - values[0];
    ensure!(increment > 0.0, "UV {name} must increase");
    ensure!(
        values
            .windows(2)
            .all(|pair| ((pair[1] - pair[0]) - increment).abs() < 1e-5),
        "UV {name} is not regular"
    );
    Ok(increment)
}

fn uv_timestamp(date: NaiveDate, hours: f32) -> Result<String> {
    ensure!(
        (0.0..24.0).contains(&hours),
        "UV time is outside one UTC day"
    );
    let quarter_hours = (hours * 4.0).round();
    ensure!(
        (hours * 4.0 - quarter_hours).abs() < 1e-4,
        "UV time is not a quarter hour"
    );
    let minutes = quarter_hours as i64 * 15;
    let timestamp = date
        .and_hms_opt(0, 0, 0)
        .context("invalid UV product date")?
        + Duration::minutes(minutes);
    Ok(timestamp
        .and_utc()
        .to_rfc3339_opts(SecondsFormat::Secs, true))
}

#[derive(Clone, Copy)]
enum ProductKind {
    Rtcor,
    Nowcast,
}

fn decode(path: &Path, kind: ProductKind) -> Result<RadarProduct> {
    let file = File::open(path).with_context(|| format!("opening {}", path.display()))?;
    let overview = file.group("overview")?;
    let expected_precipitation_frames = match kind {
        ProductKind::Rtcor => 1,
        ProductKind::Nowcast => 25,
    };
    let image_group_count = read_i32(&overview, "number_image_groups")?;
    let grid = read_grid(&file)?;
    let run = match kind {
        ProductKind::Rtcor => read_timestamp(&overview, "product_datetime_end")?,
        ProductKind::Nowcast => read_timestamp(&overview, "product_datetime_start")?,
    };
    let mut frames = Vec::with_capacity(expected_precipitation_frames as usize);
    for index in 1..=image_group_count {
        let image = file.group(&format!("image{index}"))?;
        if read_ascii(&image, "image_geo_parameter")? != PRECIPITATION_PARAMETER {
            continue;
        }
        let time = match kind {
            ProductKind::Rtcor => run.clone(),
            ProductKind::Nowcast => read_timestamp(&image, "image_datetime_valid")?,
        };
        frames.push(RadarFrame {
            time,
            rates_mm_h: read_rates(&image, grid.width, grid.height)?,
        });
    }
    ensure!(
        frames.len() == expected_precipitation_frames as usize,
        "expected {expected_precipitation_frames} precipitation frames, found {}",
        frames.len()
    );
    Ok(RadarProduct { run, grid, frames })
}

fn read_grid(file: &File) -> Result<RadarGrid> {
    let geographic = file.group("geographic")?;
    let projection = file.group("geographic/map_projection")?;
    let projection = read_ascii(&projection, "projection_proj4_params")?;
    ensure!(
        projection == EXPECTED_PROJECTION,
        "unsupported radar projection {projection}"
    );
    let width = usize::try_from(read_i32(&geographic, "geo_number_columns")?)?;
    let height = usize::try_from(read_i32(&geographic, "geo_number_rows")?)?;
    let column_offset = f64::from(read_f32(&geographic, "geo_column_offset")?);
    let row_offset = f64::from(read_f32(&geographic, "geo_row_offset")?);
    Ok(RadarGrid {
        projection,
        x0_km: column_offset,
        y0_km: -row_offset,
        dx_km: f64::from(read_f32(&geographic, "geo_pixel_size_x")?),
        dy_km: f64::from(read_f32(&geographic, "geo_pixel_size_y")?),
        width,
        height,
    })
}

fn read_rates(image: &Group, width: usize, height: usize) -> Result<Vec<f32>> {
    let calibration = image.group("calibration")?;
    let (scale, offset) = parse_calibration(&read_ascii(&calibration, "calibration_formulas")?)?;
    let missing = u16::try_from(read_i32(&calibration, "calibration_missing_data")?)?;
    let outside = u16::try_from(read_i32(&calibration, "calibration_out_of_image")?)?;
    let dataset = image.dataset("image_data")?;
    ensure!(
        dataset.shape() == [height, width],
        "image_data shape does not match geographic metadata"
    );
    let raw = dataset.read_raw::<u16>()?;
    Ok(raw
        .into_iter()
        .map(|value| {
            if value == missing || value == outside {
                f32::NAN
            } else {
                (scale * f32::from(value) + offset) * ACCUMULATION_TO_HOURLY_RATE
            }
        })
        .collect())
}

fn parse_calibration(formula: &str) -> Result<(f32, f32)> {
    let expression = formula
        .strip_prefix("GEO=")
        .context("calibration formula must start with GEO=")?;
    let (scale, offset) = expression
        .split_once("*PV+")
        .context("calibration formula must have SCALE*PV+OFFSET")?;
    Ok((scale.parse()?, offset.parse()?))
}

fn read_ascii(group: &Group, name: &str) -> Result<String> {
    let attribute = group
        .attr(name)
        .with_context(|| format!("missing {name} attribute"))?;
    Ok(attribute
        .read_scalar::<FixedAscii<256>>()?
        .as_str()
        .to_owned())
}

fn read_i32(group: &Group, name: &str) -> Result<i32> {
    read_single(group, name)
}

fn read_f32(group: &Group, name: &str) -> Result<f32> {
    read_single(group, name)
}

fn read_single<T: hdf5::H5Type + Copy>(group: &Group, name: &str) -> Result<T> {
    let values = group
        .attr(name)
        .with_context(|| format!("missing {name} attribute"))?
        .read_raw::<T>()?;
    if values.len() != 1 {
        bail!("attribute {name} must contain exactly one value");
    }
    Ok(values[0])
}

fn read_timestamp(group: &Group, name: &str) -> Result<String> {
    let raw = read_ascii(group, name)?;
    let timestamp = NaiveDateTime::parse_from_str(&raw, "%d-%b-%Y;%H:%M:%S%.3f")
        .with_context(|| format!("invalid KNMI timestamp {raw}"))?;
    Ok(timestamp
        .and_utc()
        .to_rfc3339_opts(SecondsFormat::Secs, true))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_calibration_formula() {
        assert_eq!(
            parse_calibration("GEO=0.010000*PV+0.000000").unwrap(),
            (0.01, 0.0)
        );
    }

    #[test]
    fn converts_fractional_uv_hours_to_utc() {
        let date = NaiveDate::from_ymd_opt(2026, 8, 28).unwrap();
        assert_eq!(uv_timestamp(date, 3.25).unwrap(), "2026-08-28T03:15:00Z");
        assert!(uv_timestamp(date, 3.1).is_err());
    }
}
