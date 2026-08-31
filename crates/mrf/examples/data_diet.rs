use std::{
    collections::HashMap,
    env, fs,
    path::{Path, PathBuf},
};

use mrf::{COMPRESSION_LEVEL, ChunkMeta, DecodedChunk, Grid};
use serde::{Deserialize, Serialize};

const DICTIONARY_SIZE: usize = 64 * 1024;
const CITY_POINTS: &[(f64, f64)] = &[
    (5.18, 52.10),
    (6.57, 53.22),
    (5.80, 53.20),
    (6.90, 52.22),
    (4.90, 52.37),
    (4.30, 52.08),
    (5.12, 52.09),
    (4.48, 51.92),
    (5.86, 51.84),
    (5.48, 51.44),
    (5.69, 50.85),
];

#[derive(Deserialize)]
struct Manifest {
    chunks: Vec<ManifestChunk>,
}

#[derive(Deserialize)]
struct ManifestChunk {
    url: String,
    source: String,
    #[serde(default = "default_field")]
    field: String,
}

fn default_field() -> String {
    "rain_rate".to_owned()
}

#[derive(Serialize)]
struct Report {
    snapshot: String,
    chunks: Vec<ChunkReport>,
    wind: Vec<WindReport>,
}

#[derive(Serialize)]
struct ChunkReport {
    source: String,
    field: String,
    file: String,
    frames: usize,
    width: u32,
    height: u32,
    bytes: usize,
    header_bytes: usize,
    image_payload_bytes: u64,
    motion_payload_bytes: u64,
    bytes_per_frame: f64,
    no_data_pct: f64,
    zero_pct: f64,
    shannon_bits_per_cell: f64,
    dictionary: Option<DictionaryReport>,
    delta: Option<DeltaReport>,
    subsampling: Vec<SubsamplingReport>,
}

#[derive(Serialize)]
struct DictionaryReport {
    dictionary_bytes: usize,
    payload_bytes: usize,
    total_with_raw_dictionary_bytes: usize,
    saving_pct: f64,
}

#[derive(Serialize)]
struct DeltaReport {
    xor_payload_bytes: usize,
    subtract_payload_bytes: usize,
    baseline_payload_bytes: usize,
    xor_saving_pct: f64,
    subtract_saving_pct: f64,
}

#[derive(Serialize)]
struct SubsamplingReport {
    factor: u32,
    width: u32,
    height: u32,
    encoded_bytes: usize,
    saving_pct: f64,
    mae: f64,
    p95_abs_error: f64,
    max_abs_error: f64,
    no_data_disagreement_pct: f64,
    display_class_match_pct: f64,
    city_mae: f64,
    city_p95_abs_error: f64,
    city_display_class_match_pct: f64,
}

#[derive(Serialize)]
struct WindReport {
    factor: u32,
    vector_mae_ms: f64,
    vector_p95_error_ms: f64,
    speed_mae_ms: f64,
    direction_p95_degrees: f64,
    city_beaufort_match_pct: f64,
    city_direction_match_pct: f64,
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let root = PathBuf::from(env::args().nth(1).ok_or("usage: data_diet DATA_DIR")?);
    let manifest: Manifest = serde_json::from_slice(&fs::read(root.join("manifest.json"))?)?;
    let mut chunks = Vec::with_capacity(manifest.chunks.len());
    let mut decoded_by_field = HashMap::new();
    for entry in manifest.chunks {
        let path = root.join(&entry.url);
        let bytes = fs::read(&path)?;
        let decoded = mrf::decode(&bytes)?;
        let report = analyze_chunk(&entry, &path, bytes.len(), &decoded)?;
        if matches!(entry.field.as_str(), "wind_u_ms" | "wind_v_ms") {
            decoded_by_field.insert(entry.field.clone(), decoded.clone());
        }
        chunks.push(report);
    }
    let wind = match (
        decoded_by_field.get("wind_u_ms"),
        decoded_by_field.get("wind_v_ms"),
    ) {
        (Some(u), Some(v)) => analyze_wind(u, v),
        _ => Vec::new(),
    };
    let report = Report {
        snapshot: root.display().to_string(),
        chunks,
        wind,
    };
    println!("{}", serde_json::to_string_pretty(&report)?);
    Ok(())
}

fn analyze_chunk(
    entry: &ManifestChunk,
    path: &Path,
    byte_len: usize,
    decoded: &DecodedChunk,
) -> Result<ChunkReport, Box<dyn std::error::Error>> {
    let mut counts = [0_u64; 256];
    for value in decoded.frames.iter().flatten() {
        counts[*value as usize] += 1;
    }
    let cells = counts.iter().sum::<u64>();
    let valid = cells - counts[255];
    let entropy = counts
        .iter()
        .filter(|count| **count > 0)
        .map(|count| {
            let probability = *count as f64 / cells as f64;
            -probability * probability.log2()
        })
        .sum();
    let image_payload = decoded
        .header
        .frames
        .iter()
        .map(|frame| frame.len)
        .sum::<u64>();
    let motion_payload = decoded
        .header
        .frames
        .iter()
        .filter_map(|frame| frame.motion.as_ref())
        .map(|motion| motion.len)
        .sum::<u64>();
    let dictionary = dictionary_report(&decoded.frames, image_payload as usize).ok();
    let delta = (entry.field == "rain_rate")
        .then(|| delta_report(&decoded.frames))
        .transpose()?;
    let mut subsampling = Vec::new();
    for factor in [2, 3, 4, 8] {
        subsampling.push(subsampling_report(decoded, factor, byte_len)?);
    }
    Ok(ChunkReport {
        source: entry.source.clone(),
        field: entry.field.clone(),
        file: path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .into_owned(),
        frames: decoded.frames.len(),
        width: decoded.header.grid.width,
        height: decoded.header.grid.height,
        bytes: byte_len,
        header_bytes: 8 + serde_json::to_vec(&decoded.header)?.len(),
        image_payload_bytes: image_payload,
        motion_payload_bytes: motion_payload,
        bytes_per_frame: byte_len as f64 / decoded.frames.len() as f64,
        no_data_pct: percentage(counts[255], cells),
        zero_pct: percentage(counts[0], valid),
        shannon_bits_per_cell: entropy,
        dictionary,
        delta,
        subsampling,
    })
}

fn dictionary_report(
    frames: &[Vec<u8>],
    baseline: usize,
) -> Result<DictionaryReport, std::io::Error> {
    let dictionary = zstd::dict::from_samples(frames, DICTIONARY_SIZE)?;
    let mut compressor = zstd::bulk::Compressor::with_dictionary(COMPRESSION_LEVEL, &dictionary)?;
    let payload = frames.iter().try_fold(0_usize, |total, frame| {
        compressor
            .compress(frame)
            .map(|compressed| total + compressed.len())
    })?;
    let total = dictionary.len() + payload;
    Ok(DictionaryReport {
        dictionary_bytes: dictionary.len(),
        payload_bytes: payload,
        total_with_raw_dictionary_bytes: total,
        saving_pct: saving_pct(baseline, total),
    })
}

fn delta_report(frames: &[Vec<u8>]) -> Result<DeltaReport, std::io::Error> {
    let baseline = compressed_len(frames)?;
    let mut xor = Vec::with_capacity(frames.len());
    let mut subtract = Vec::with_capacity(frames.len());
    for (index, frame) in frames.iter().enumerate() {
        if index == 0 {
            xor.push(frame.clone());
            subtract.push(frame.clone());
        } else {
            let previous = &frames[index - 1];
            xor.push(
                frame
                    .iter()
                    .zip(previous)
                    .map(|(now, before)| now ^ before)
                    .collect(),
            );
            subtract.push(
                frame
                    .iter()
                    .zip(previous)
                    .map(|(now, before)| now.wrapping_sub(*before))
                    .collect(),
            );
        }
    }
    let xor_len = compressed_len(&xor)?;
    let subtract_len = compressed_len(&subtract)?;
    Ok(DeltaReport {
        xor_payload_bytes: xor_len,
        subtract_payload_bytes: subtract_len,
        baseline_payload_bytes: baseline,
        xor_saving_pct: saving_pct(baseline, xor_len),
        subtract_saving_pct: saving_pct(baseline, subtract_len),
    })
}

fn compressed_len(frames: &[Vec<u8>]) -> Result<usize, std::io::Error> {
    frames.iter().try_fold(0_usize, |total, frame| {
        zstd::bulk::compress(frame, COMPRESSION_LEVEL).map(|compressed| total + compressed.len())
    })
}

fn subsampling_report(
    decoded: &DecodedChunk,
    factor: u32,
    baseline_bytes: usize,
) -> Result<SubsamplingReport, Box<dyn std::error::Error>> {
    let coarse_grid = coarse_grid(&decoded.header.grid, factor);
    let coarse_frames = decoded
        .frames
        .iter()
        .map(|frame| integrate(frame, &decoded.header.grid, &decoded.header.quant, factor))
        .collect::<Vec<_>>();
    let meta = ChunkMeta {
        field: decoded.header.field.clone(),
        grid: coarse_grid.clone(),
        quant: decoded.header.quant.clone(),
        source: decoded.header.source.clone(),
        run: decoded.header.run.clone(),
        frame_times: decoded
            .header
            .frames
            .iter()
            .map(|frame| frame.time.clone())
            .collect(),
    };
    let encoded_bytes = mrf::encode(&coarse_frames, &meta)?.len();
    let quality = compare_quality(decoded, &coarse_frames, &coarse_grid, factor);
    Ok(SubsamplingReport {
        factor,
        width: coarse_grid.width,
        height: coarse_grid.height,
        encoded_bytes,
        saving_pct: saving_pct(baseline_bytes, encoded_bytes),
        mae: quality.mae,
        p95_abs_error: quality.p95,
        max_abs_error: quality.max,
        no_data_disagreement_pct: quality.no_data_disagreement_pct,
        display_class_match_pct: quality.display_match_pct,
        city_mae: quality.city_mae,
        city_p95_abs_error: quality.city_p95,
        city_display_class_match_pct: quality.city_display_match_pct,
    })
}

fn coarse_grid(grid: &Grid, factor: u32) -> Grid {
    Grid {
        crs: grid.crs.clone(),
        x0: grid.x0,
        y0: grid.y0,
        dx: grid.dx * f64::from(factor),
        dy: grid.dy * f64::from(factor),
        width: grid.width.div_ceil(factor),
        height: grid.height.div_ceil(factor),
    }
}

fn integrate(frame: &[u8], grid: &Grid, quant: &[Option<f32>], factor: u32) -> Vec<u8> {
    let coarse = coarse_grid(grid, factor);
    let mut result = Vec::with_capacity((coarse.width * coarse.height) as usize);
    for coarse_row in 0..coarse.height {
        for coarse_column in 0..coarse.width {
            let mut sum = 0.0_f64;
            let mut count = 0_u32;
            for row in coarse_row * factor..((coarse_row + 1) * factor).min(grid.height) {
                for column in coarse_column * factor..((coarse_column + 1) * factor).min(grid.width)
                {
                    let value = frame[(row * grid.width + column) as usize] as usize;
                    if let Some(value) = quant[value] {
                        sum += f64::from(value);
                        count += 1;
                    }
                }
            }
            result.push(if count == 0 {
                255
            } else {
                mrf::quantize_with_table((sum / f64::from(count)) as f32, quant)
                    .expect("header quantization was validated")
            });
        }
    }
    result
}

struct Quality {
    mae: f64,
    p95: f64,
    max: f64,
    no_data_disagreement_pct: f64,
    display_match_pct: f64,
    city_mae: f64,
    city_p95: f64,
    city_display_match_pct: f64,
}

fn compare_quality(
    decoded: &DecodedChunk,
    coarse_frames: &[Vec<u8>],
    coarse_grid: &Grid,
    factor: u32,
) -> Quality {
    let mut errors = Vec::new();
    let mut mismatched_data = 0_u64;
    let mut comparisons = 0_u64;
    let mut display_matches = 0_u64;
    let mut city_errors = Vec::new();
    let mut city_comparisons = 0_u64;
    let mut city_display_matches = 0_u64;
    for (frame, coarse) in decoded.frames.iter().zip(coarse_frames) {
        for row in 0..decoded.header.grid.height {
            for column in 0..decoded.header.grid.width {
                let fine = value_at(
                    frame,
                    &decoded.header.quant,
                    decoded.header.grid.width,
                    row,
                    column,
                );
                let broad = value_at(
                    coarse,
                    &decoded.header.quant,
                    coarse_grid.width,
                    row / factor,
                    column / factor,
                );
                if fine.is_none() != broad.is_none() {
                    mismatched_data += 1;
                }
                if let (Some(fine), Some(broad)) = (fine, broad) {
                    errors.push((fine - broad).abs());
                    comparisons += 1;
                    display_matches += u64::from(
                        display_class(&decoded.header.field, fine)
                            == display_class(&decoded.header.field, broad),
                    );
                }
            }
        }
        for &(longitude, latitude) in CITY_POINTS {
            let fine = sample(
                frame,
                &decoded.header.grid,
                &decoded.header.quant,
                longitude,
                latitude,
            );
            let broad = sample(
                coarse,
                coarse_grid,
                &decoded.header.quant,
                longitude,
                latitude,
            );
            if let (Some(fine), Some(broad)) = (fine, broad) {
                city_errors.push((fine - broad).abs());
                city_comparisons += 1;
                city_display_matches += u64::from(
                    display_class(&decoded.header.field, fine)
                        == display_class(&decoded.header.field, broad),
                );
            }
        }
    }
    errors.sort_by(f32::total_cmp);
    city_errors.sort_by(f32::total_cmp);
    Quality {
        mae: mean(&errors),
        p95: percentile(&errors, 0.95),
        max: errors.last().copied().unwrap_or_default() as f64,
        no_data_disagreement_pct: percentage(
            mismatched_data,
            decoded.frames.iter().map(Vec::len).sum::<usize>() as u64,
        ),
        display_match_pct: percentage(display_matches, comparisons),
        city_mae: mean(&city_errors),
        city_p95: percentile(&city_errors, 0.95),
        city_display_match_pct: percentage(city_display_matches, city_comparisons),
    }
}

fn analyze_wind(u: &DecodedChunk, v: &DecodedChunk) -> Vec<WindReport> {
    assert_eq!(u.header.grid, v.header.grid);
    assert_eq!(u.frames.len(), v.frames.len());
    [2, 3, 4, 8]
        .into_iter()
        .map(|factor| {
            let grid = coarse_grid(&u.header.grid, factor);
            let coarse_u = u
                .frames
                .iter()
                .map(|frame| integrate(frame, &u.header.grid, &u.header.quant, factor))
                .collect::<Vec<_>>();
            let coarse_v = v
                .frames
                .iter()
                .map(|frame| integrate(frame, &v.header.grid, &v.header.quant, factor))
                .collect::<Vec<_>>();
            let mut vector_errors = Vec::new();
            let mut speed_errors = Vec::new();
            let mut direction_errors = Vec::new();
            let mut city_count = 0_u64;
            let mut city_beaufort_matches = 0_u64;
            let mut city_direction_matches = 0_u64;
            for frame_index in 0..u.frames.len() {
                for row in 0..u.header.grid.height {
                    for column in 0..u.header.grid.width {
                        let original = vector_at(u, v, frame_index, row, column);
                        let broad = vector_at_frames(
                            &coarse_u[frame_index],
                            &coarse_v[frame_index],
                            &u.header.quant,
                            &v.header.quant,
                            grid.width,
                            row / factor,
                            column / factor,
                        );
                        if let (Some((u0, v0)), Some((u1, v1))) = (original, broad) {
                            vector_errors.push((u0 - u1).hypot(v0 - v1));
                            speed_errors.push(u0.hypot(v0).abs_diff(u1.hypot(v1)));
                            if u0.hypot(v0) >= 0.3 && u1.hypot(v1) >= 0.3 {
                                direction_errors.push(angle_difference(u0, v0, u1, v1));
                            }
                        }
                    }
                }
                for &(longitude, latitude) in CITY_POINTS {
                    let original =
                        sample_vector(u, v, frame_index, &u.header.grid, longitude, latitude);
                    let broad = sample_vector_frames(
                        &coarse_u[frame_index],
                        &coarse_v[frame_index],
                        &u.header.quant,
                        &v.header.quant,
                        &grid,
                        longitude,
                        latitude,
                    );
                    if let (Some((u0, v0)), Some((u1, v1))) = (original, broad) {
                        city_count += 1;
                        city_beaufort_matches +=
                            u64::from(beaufort(u0.hypot(v0)) == beaufort(u1.hypot(v1)));
                        city_direction_matches += u64::from(direction(u0, v0) == direction(u1, v1));
                    }
                }
            }
            vector_errors.sort_by(f32::total_cmp);
            speed_errors.sort_by(f32::total_cmp);
            direction_errors.sort_by(f32::total_cmp);
            WindReport {
                factor,
                vector_mae_ms: mean(&vector_errors),
                vector_p95_error_ms: percentile(&vector_errors, 0.95),
                speed_mae_ms: mean(&speed_errors),
                direction_p95_degrees: percentile(&direction_errors, 0.95),
                city_beaufort_match_pct: percentage(city_beaufort_matches, city_count),
                city_direction_match_pct: percentage(city_direction_matches, city_count),
            }
        })
        .collect()
}

trait AbsDiff {
    fn abs_diff(self, other: Self) -> Self;
}

impl AbsDiff for f32 {
    fn abs_diff(self, other: Self) -> Self {
        (self - other).abs()
    }
}

fn vector_at(
    u: &DecodedChunk,
    v: &DecodedChunk,
    frame: usize,
    row: u32,
    column: u32,
) -> Option<(f32, f32)> {
    vector_at_frames(
        &u.frames[frame],
        &v.frames[frame],
        &u.header.quant,
        &v.header.quant,
        u.header.grid.width,
        row,
        column,
    )
}

fn vector_at_frames(
    u: &[u8],
    v: &[u8],
    u_quant: &[Option<f32>],
    v_quant: &[Option<f32>],
    width: u32,
    row: u32,
    column: u32,
) -> Option<(f32, f32)> {
    Some((
        value_at(u, u_quant, width, row, column)?,
        value_at(v, v_quant, width, row, column)?,
    ))
}

fn sample_vector(
    u: &DecodedChunk,
    v: &DecodedChunk,
    frame: usize,
    grid: &Grid,
    longitude: f64,
    latitude: f64,
) -> Option<(f32, f32)> {
    Some((
        sample(&u.frames[frame], grid, &u.header.quant, longitude, latitude)?,
        sample(&v.frames[frame], grid, &v.header.quant, longitude, latitude)?,
    ))
}

fn sample_vector_frames(
    u: &[u8],
    v: &[u8],
    u_quant: &[Option<f32>],
    v_quant: &[Option<f32>],
    grid: &Grid,
    longitude: f64,
    latitude: f64,
) -> Option<(f32, f32)> {
    Some((
        sample(u, grid, u_quant, longitude, latitude)?,
        sample(v, grid, v_quant, longitude, latitude)?,
    ))
}

fn sample(
    frame: &[u8],
    grid: &Grid,
    quant: &[Option<f32>],
    longitude: f64,
    latitude: f64,
) -> Option<f32> {
    let radius = 6_378_137.0;
    let x = longitude.to_radians() * radius;
    let y = (std::f64::consts::FRAC_PI_4 + latitude.to_radians() / 2.0)
        .tan()
        .ln()
        * radius;
    let column = ((x - grid.x0) / grid.dx).floor() as i64;
    let row = ((y - grid.y0) / grid.dy).floor() as i64;
    if column < 0 || row < 0 || column >= i64::from(grid.width) || row >= i64::from(grid.height) {
        return None;
    }
    value_at(frame, quant, grid.width, row as u32, column as u32)
}

fn value_at(frame: &[u8], quant: &[Option<f32>], width: u32, row: u32, column: u32) -> Option<f32> {
    quant[frame[(row * width + column) as usize] as usize]
}

fn display_class(field: &str, value: f32) -> i32 {
    match field {
        "rain_rate" => i32::from(value >= 0.1) + i32::from(value >= 7.5),
        "cloud_frac" => i32::from(value >= 20.0) + i32::from(value >= 70.0),
        "radiation" => (value / 25.0).round() as i32,
        "temp_c" | "feels_like_c" | "rel_humidity" => value.round() as i32,
        "wind_u_ms" | "wind_v_ms" => (value * 2.0).round() as i32,
        _ => (value * 10.0).round() as i32,
    }
}

fn beaufort(speed: f32) -> usize {
    [
        0.3, 1.6, 3.4, 5.5, 8.0, 10.8, 13.9, 17.2, 20.8, 24.5, 28.5, 32.7,
    ]
    .into_iter()
    .position(|limit| speed < limit)
    .unwrap_or(12)
}

fn direction(u: f32, v: f32) -> i32 {
    let from_degrees = ((-u).atan2(-v).to_degrees() + 360.0) % 360.0;
    (from_degrees / 45.0).round() as i32 % 8
}

fn angle_difference(u0: f32, v0: f32, u1: f32, v1: f32) -> f32 {
    let dot = u0 * u1 + v0 * v1;
    let cross = u0 * v1 - v0 * u1;
    let angle = cross.atan2(dot).to_degrees().abs();
    angle.min(360.0 - angle)
}

fn mean(values: &[f32]) -> f64 {
    if values.is_empty() {
        return 0.0;
    }
    values.iter().map(|value| f64::from(*value)).sum::<f64>() / values.len() as f64
}

fn percentile(values: &[f32], fraction: f64) -> f64 {
    if values.is_empty() {
        return 0.0;
    }
    let index = ((values.len() as f64 * fraction).ceil() as usize).saturating_sub(1);
    f64::from(values[index])
}

fn percentage(part: u64, whole: u64) -> f64 {
    if whole == 0 {
        0.0
    } else {
        part as f64 / whole as f64 * 100.0
    }
}

fn saving_pct(before: usize, after: usize) -> f64 {
    (before as f64 - after as f64) / before as f64 * 100.0
}
