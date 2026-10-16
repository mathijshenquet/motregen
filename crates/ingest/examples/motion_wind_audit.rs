//! Read-only export of production correlation, wind and annex candidates for the U84 audit.
use std::{fs, io::Write, path::PathBuf};

use anyhow::{Context, Result, ensure};
use chrono::{DateTime, Duration, Utc};
use eccodes::{CodesFile, FallibleIterator, KeyRead, ProductKind};
use motregen_ingest::{
    grid::{IndexMap, SHARED_GRID},
    wind_prior::WindTimeline,
};
use serde::Deserialize;
use serde_json::{Value, json};

#[derive(Deserialize)]
struct Dataset {
    label: String,
    kind: String,
    rain: Vec<PathBuf>,
    wind: Vec<PathBuf>,
    wind_run: String,
}

fn vector_values(field: &motion::CorrelationField) -> Vec<Option<[f32; 3]>> {
    field
        .vectors
        .iter()
        .map(|candidate| {
            candidate.map(|vector| {
                [
                    vector.u_cells_per_minute,
                    vector.v_cells_per_minute,
                    vector.confidence,
                ]
            })
        })
        .collect()
}

fn annex_values(vectors: &[i8]) -> Vec<Option<[f32; 2]>> {
    vectors
        .chunks_exact(2)
        .map(|pair| {
            (pair[0] != -128 && pair[1] != -128)
                .then(|| [f32::from(pair[0]) * 0.1, f32::from(pair[1]) * 0.1])
        })
        .collect()
}

fn wind_blocks(
    map: &IndexMap,
    source_east: &[f32],
    source_north: &[f32],
) -> Result<Vec<Option<(f32, f32)>>> {
    // Keep the private pipeline::motion_wind_blocks mapping as an explicit audit copy.
    let east = map.gather(source_east)?;
    let north = map.gather(source_north)?;
    let grid = motion::grid_for(SHARED_GRID.width, SHARED_GRID.height)?;
    let mut vectors = Vec::new();
    for block_row in 0..grid.bh as usize {
        let start_row = block_row * motion::BLOCK_SIZE;
        let end_row = (start_row + motion::BLOCK_SIZE).min(SHARED_GRID.height as usize);
        let center_y = SHARED_GRID.y0 + (start_row + end_row) as f64 * 0.5 * SHARED_GRID.dy;
        let latitude = 2.0 * (center_y / 6_378_137.0).exp().atan() - std::f64::consts::FRAC_PI_2;
        let conversion = 60.0 / 1_000.0 / latitude.cos() as f32;
        for block_column in 0..grid.bw as usize {
            let start_column = block_column * motion::BLOCK_SIZE;
            let end_column = (start_column + motion::BLOCK_SIZE).min(SHARED_GRID.width as usize);
            let mut sum_east = 0.0;
            let mut sum_north = 0.0;
            let mut count = 0;
            for row in start_row..end_row {
                for column in start_column..end_column {
                    let index = row * SHARED_GRID.width as usize + column;
                    if east[index].is_finite() && north[index].is_finite() {
                        sum_east += east[index];
                        sum_north += north[index];
                        count += 1;
                    }
                }
            }
            vectors.push((count > 0).then(|| {
                (
                    sum_east / count as f32 * conversion,
                    -sum_north / count as f32 * conversion,
                )
            }));
        }
    }
    Ok(vectors)
}

fn read_wind(dataset: &Dataset) -> Result<(WindTimeline, WindTimeline, Vec<Value>)> {
    let run = DateTime::parse_from_rfc3339(&dataset.wind_run)?.with_timezone(&Utc);
    let mut times = Vec::new();
    let mut low_frames = Vec::new();
    let mut high_frames = Vec::new();
    let mut metadata = Vec::new();
    for path in &dataset.wind {
        let fields = knmi_grib::decode_arome_fields(path)?;
        let map = IndexMap::arome_clamped_on(&fields.motion_wind_u_ms.grid, SHARED_GRID)?;
        let valid = run + Duration::hours(fields.motion_wind_u_ms.end_step);
        times.push(valid);
        low_frames.push(wind_blocks(
            &map,
            &fields.wind_u_ms.values,
            &fields.wind_v_ms.values,
        )?);
        high_frames.push(wind_blocks(
            &map,
            &fields.motion_wind_u_ms.values,
            &fields.motion_wind_v_ms.values,
        )?);
        let mut file = CodesFile::new_from_file(path, ProductKind::GRIB)?;
        while let Some(message) = file.ref_message_iter().next()? {
            let parameter: i64 = message.read_key("indicatorOfParameter")?;
            let level: i64 = message.read_key("level")?;
            if ![33, 34].contains(&parameter) || ![10, 300].contains(&level) {
                continue;
            }
            let raw: Vec<f64> = message.read_key("values")?;
            let decoded = match (parameter, level) {
                (33, 10) => &fields.wind_u_ms.values,
                (34, 10) => &fields.wind_v_ms.values,
                (33, 300) => &fields.motion_wind_u_ms.values,
                _ => &fields.motion_wind_v_ms.values,
            };
            ensure!(
                raw.iter()
                    .map(|value| *value as f32)
                    .eq(decoded.iter().copied()),
                "GRIB scan order differs from production decoder"
            );
            let mut entry = serde_json::Map::new();
            entry.insert("path".into(), json!(path));
            entry.insert("valid_time".into(), json!(valid));
            for key in [
                "edition",
                "table2Version",
                "indicatorOfParameter",
                "level",
                "resolutionAndComponentFlags",
                "uvRelativeToGrid",
                "scanningMode",
                "jPointsAreConsecutive",
                "Ni",
                "Nj",
                "dataDate",
                "dataTime",
                "startStep",
                "endStep",
                "timeRangeIndicator",
            ] {
                let value: i64 = message.read_key(key)?;
                entry.insert(key.into(), json!(value));
            }
            let centre: String = message.read_key("centre")?;
            entry.insert("centre".into(), json!(centre));
            let grid_type: String = message.read_key("gridType")?;
            entry.insert("gridType".into(), json!(grid_type));
            metadata.push(Value::Object(entry));
        }
    }
    Ok((
        WindTimeline::new(dataset.wind_run.clone(), times.clone(), low_frames)?,
        WindTimeline::new(dataset.wind_run.clone(), times, high_frames)?,
        metadata,
    ))
}

fn main() -> Result<()> {
    let arguments = std::env::args().collect::<Vec<_>>();
    let corpus = arguments
        .get(1)
        .context("usage: motion_wind_audit corpus.json output-directory")?;
    let output = PathBuf::from(arguments.get(2).context("missing output directory")?);
    fs::create_dir_all(&output)?;
    let datasets: Vec<Dataset> = serde_json::from_slice(&fs::read(corpus)?)?;
    for dataset in datasets {
        let target = output.join(&dataset.label);
        fs::create_dir_all(&target)?;
        let (low_wind, high_wind, metadata) = read_wind(&dataset)?;
        let mut frames = Vec::new();
        let mut times = Vec::new();
        let mut stored_annexes = Vec::new();
        let quant = mrf::quantization_table();
        if dataset.kind == "mrf" {
            let chunk = mrf::decode(&fs::read(&dataset.rain[0])?)?;
            ensure!(
                chunk.header.grid == SHARED_GRID.mrf_grid(),
                "audit expects shared rain grid"
            );
            for (index, frame) in chunk.frames.iter().enumerate() {
                frames.push(
                    frame
                        .iter()
                        .map(|value| chunk.header.quant[*value as usize].unwrap_or(f32::NAN))
                        .collect::<Vec<_>>(),
                );
                times.push(
                    DateTime::parse_from_rfc3339(&chunk.header.frames[index].time)?
                        .with_timezone(&Utc),
                );
            }
            stored_annexes = chunk.motions;
        } else {
            ensure!(dataset.kind == "rtcor", "unsupported rain input");
            for path in &dataset.rain {
                let radar = knmi_hdf5::decode_rtcor(path)?;
                let map = IndexMap::radar(&radar.grid)?;
                let frame = radar.frames.first().context("radar has no frame")?;
                frames.push(
                    map.gather(&frame.rates_mm_h)?
                        .into_iter()
                        .map(|value| quant[mrf::quantize(value) as usize].unwrap_or(f32::NAN))
                        .collect(),
                );
                times.push(DateTime::parse_from_rfc3339(&frame.time)?.with_timezone(&Utc));
            }
        }
        let mut correlations = Vec::new();
        let mut high_series = Vec::new();
        let mut low_series = Vec::new();
        for index in 1..frames.len() {
            let minutes = (times[index] - times[index - 1]).num_seconds() as f32 / 60.0;
            correlations.push(motion::correlate(
                &frames[index - 1],
                &frames[index],
                SHARED_GRID.width,
                SHARED_GRID.height,
                minutes,
            )?);
            let midpoint = times[index - 1] + (times[index] - times[index - 1]) / 2;
            high_series.push(high_wind.interpolate(midpoint));
            low_series.push(low_wind.interpolate(midpoint));
        }
        let fit = motion::calibrate(&correlations, &high_series, None)?;
        let mut pairs = Vec::new();
        for index in 1..frames.len() {
            let minutes = (times[index] - times[index - 1]).num_seconds() as f32 / 60.0;
            let plain = motion::estimate(
                &frames[index - 1],
                &frames[index],
                SHARED_GRID.width,
                SHARED_GRID.height,
                minutes,
            )?;
            let baseline = motion::blend_with_wind(
                &correlations[index - 1],
                &high_series[index - 1],
                fit.calibration,
            )?;
            pairs.push(json!({"time": times[index], "minutes": minutes,
                "correlation": vector_values(&correlations[index - 1]), "wind10": low_series[index - 1],
                "wind300": high_series[index - 1], "plain": annex_values(&plain.vectors),
                "native_baseline": annex_values(&baseline.vectors),
                "stored": stored_annexes.get(index).and_then(|annex| annex.as_ref()).map(|annex| annex_values(annex))}));
            eprintln!("{} pair {index}/{}", dataset.label, frames.len() - 1);
        }
        for (index, frame) in frames.iter().enumerate() {
            let mut file = fs::File::create(target.join(format!("frame-{index:03}.f32")))?;
            for value in frame {
                file.write_all(&value.to_le_bytes())?;
            }
        }
        fs::write(
            target.join("audit.json"),
            serde_json::to_vec(&json!({
                "label": dataset.label, "kind": dataset.kind, "grid": SHARED_GRID.mrf_grid(),
                "times": times, "metadata": metadata, "pairs": pairs,
                "native_fit": {"scale": fit.calibration.scale, "degrees": fit.calibration.rotation_radians.to_degrees(), "samples": fit.reliable_samples}
            }))?,
        )?;
    }
    Ok(())
}
