//! Coarse precipitation motion estimation for mrf annexes.

use std::cmp::Ordering;

use thiserror::Error;

pub const BLOCK_SIZE: usize = 32;
const SAMPLE_STEP: usize = 4;
const GLOBAL_STEP: usize = 16;
const GLOBAL_RADIUS: i32 = 8;
const LOCAL_RADIUS: i32 = 8;
const MIN_SIGNAL_SAMPLES: usize = 4;
const MIN_CORRELATION_SAMPLES: usize = 8;
const OUTLIER_DISTANCE: f32 = 6.0;
const INHERIT_PASSES: usize = 4;
const NO_DATA: i8 = -128;
pub const MIN_CALIBRATION_SAMPLES: usize = 12;
pub const STRONG_CONFIDENCE: f32 = 0.75;
const MIN_SCALE: f32 = 0.5;
const MAX_SCALE: f32 = 2.5;
const MAX_ROTATION_RADIANS: f32 = std::f32::consts::FRAC_PI_3;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct MotionGrid {
    pub bw: u32,
    pub bh: u32,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct MotionField {
    pub grid: MotionGrid,
    /// Row-major `(u, v)` pairs in 0.1 cell/minute; `(-128, -128)` is no-data.
    pub vectors: Vec<i8>,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Calibration {
    pub scale: f32,
    pub rotation_radians: f32,
}

impl Default for Calibration {
    fn default() -> Self {
        Self {
            scale: 1.0,
            rotation_radians: 0.0,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CalibrationSource {
    Fitted,
    PreviousRun,
    Default,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct CalibrationReport {
    pub calibration: Calibration,
    pub source: CalibrationSource,
    pub reliable_samples: usize,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct CorrelationVector {
    pub u_cells_per_minute: f32,
    pub v_cells_per_minute: f32,
    pub confidence: f32,
}

#[derive(Clone, Debug, PartialEq)]
pub struct CorrelationField {
    pub grid: MotionGrid,
    pub vectors: Vec<Option<CorrelationVector>>,
}

#[derive(Debug, Error, PartialEq)]
pub enum Error {
    #[error("field dimensions must be positive")]
    EmptyGrid,
    #[error("field dimensions overflow this platform")]
    GridTooLarge,
    #[error("previous field has {actual} cells; expected {expected}")]
    PreviousLength { actual: usize, expected: usize },
    #[error("current field has {actual} cells; expected {expected}")]
    CurrentLength { actual: usize, expected: usize },
    #[error("frame interval must be finite and positive")]
    InvalidInterval,
    #[error("wind field has {actual} vectors; expected {expected}")]
    WindLength { actual: usize, expected: usize },
    #[error("correlation and wind series have different frame counts")]
    SeriesLength,
    #[error("motion grids differ within a run")]
    GridMismatch,
}

pub fn grid_for(width: u32, height: u32) -> Result<MotionGrid, Error> {
    if width == 0 || height == 0 {
        return Err(Error::EmptyGrid);
    }
    let block = u32::try_from(BLOCK_SIZE).expect("block size fits u32");
    let bw = width.checked_add(block - 1).ok_or(Error::GridTooLarge)? / block;
    let bh = height.checked_add(block - 1).ok_or(Error::GridTooLarge)? / block;
    Ok(MotionGrid { bw, bh })
}

/// Estimates motion from `previous` to `current` on a 32-cell block grid.
/// Finite positive values are precipitation signal; NaN is outside the source footprint.
pub fn estimate(
    previous: &[f32],
    current: &[f32],
    width: u32,
    height: u32,
    interval_minutes: f32,
) -> Result<MotionField, Error> {
    let correlations = correlate(previous, current, width, height, interval_minutes)?;
    let mut vectors = correlations
        .vectors
        .into_iter()
        .map(|vector| vector.map(|vector| (vector.u_cells_per_minute, vector.v_cells_per_minute)))
        .collect::<Vec<_>>();
    damp_outliers(&mut vectors, correlations.grid);
    inherit_empty(&mut vectors, correlations.grid);
    smooth(&mut vectors, correlations.grid);
    Ok(quantize_field(vectors, correlations.grid))
}

/// Estimates correlation vectors and their peak-sharpness/energy confidence.
pub fn correlate(
    previous: &[f32],
    current: &[f32],
    width: u32,
    height: u32,
    interval_minutes: f32,
) -> Result<CorrelationField, Error> {
    if !interval_minutes.is_finite() || interval_minutes <= 0.0 {
        return Err(Error::InvalidInterval);
    }
    let width = usize::try_from(width).map_err(|_| Error::GridTooLarge)?;
    let height = usize::try_from(height).map_err(|_| Error::GridTooLarge)?;
    let expected = width.checked_mul(height).ok_or(Error::GridTooLarge)?;
    if previous.len() != expected {
        return Err(Error::PreviousLength {
            actual: previous.len(),
            expected,
        });
    }
    if current.len() != expected {
        return Err(Error::CurrentLength {
            actual: current.len(),
            expected,
        });
    }
    let grid = grid_for(width as u32, height as u32)?;
    let seed = global_shift(previous, current, width, height);
    let mut vectors = Vec::with_capacity(grid.bw as usize * grid.bh as usize);
    for block_y in 0..grid.bh as usize {
        for block_x in 0..grid.bw as usize {
            vectors.push(estimate_block(
                previous, current, width, height, block_x, block_y, seed,
            ));
        }
    }
    damp_correlation_outliers(&mut vectors, grid);
    for vector in vectors.iter_mut().flatten() {
        vector.u_cells_per_minute /= interval_minutes;
        vector.v_cells_per_minute /= interval_minutes;
    }
    Ok(CorrelationField { grid, vectors })
}

/// Fits one scale and rotation for a complete source run.
pub fn calibrate(
    correlations: &[CorrelationField],
    winds: &[Vec<Option<(f32, f32)>>],
    previous: Option<Calibration>,
) -> Result<CalibrationReport, Error> {
    if correlations.len() != winds.len() {
        return Err(Error::SeriesLength);
    }
    let mut numerator_real = 0.0_f64;
    let mut numerator_imag = 0.0_f64;
    let mut denominator = 0.0_f64;
    let mut reliable_samples = 0_usize;
    for (field, wind) in correlations.iter().zip(winds) {
        let expected = field.grid.bw as usize * field.grid.bh as usize;
        if wind.len() != expected {
            return Err(Error::WindLength {
                actual: wind.len(),
                expected,
            });
        }
        for (correlation, wind) in field.vectors.iter().zip(wind) {
            let (Some(correlation), Some((wind_u, wind_v))) = (correlation, wind) else {
                continue;
            };
            if correlation.confidence < STRONG_CONFIDENCE
                || !wind_u.is_finite()
                || !wind_v.is_finite()
            {
                continue;
            }
            let wind_norm = wind_u * wind_u + wind_v * wind_v;
            if wind_norm <= 1.0e-4 {
                continue;
            }
            let weight = f64::from(correlation.confidence);
            numerator_real += weight
                * f64::from(
                    wind_u * correlation.u_cells_per_minute
                        + wind_v * correlation.v_cells_per_minute,
                );
            numerator_imag += weight
                * f64::from(
                    wind_u * correlation.v_cells_per_minute
                        - wind_v * correlation.u_cells_per_minute,
                );
            denominator += weight * f64::from(wind_norm);
            reliable_samples += 1;
        }
    }
    if reliable_samples < MIN_CALIBRATION_SAMPLES || denominator <= 1.0e-9 {
        let (calibration, source) = previous.map_or_else(
            || (Calibration::default(), CalibrationSource::Default),
            |calibration| (calibration, CalibrationSource::PreviousRun),
        );
        return Ok(CalibrationReport {
            calibration,
            source,
            reliable_samples,
        });
    }
    let real = (numerator_real / denominator) as f32;
    let imag = (numerator_imag / denominator) as f32;
    let calibration = Calibration {
        scale: real.hypot(imag).clamp(MIN_SCALE, MAX_SCALE),
        rotation_radians: imag
            .atan2(real)
            .clamp(-MAX_ROTATION_RADIANS, MAX_ROTATION_RADIANS),
    };
    Ok(CalibrationReport {
        calibration,
        source: CalibrationSource::Fitted,
        reliable_samples,
    })
}

/// Applies the calibrated wind prior, then performs the existing spatial smoothing.
pub fn blend_with_wind(
    correlations: &CorrelationField,
    wind: &[Option<(f32, f32)>],
    calibration: Calibration,
) -> Result<MotionField, Error> {
    let expected = correlations.grid.bw as usize * correlations.grid.bh as usize;
    if wind.len() != expected {
        return Err(Error::WindLength {
            actual: wind.len(),
            expected,
        });
    }
    let sine = calibration.rotation_radians.sin();
    let cosine = calibration.rotation_radians.cos();
    let mut vectors = correlations
        .vectors
        .iter()
        .zip(wind)
        .map(|(correlation, wind)| {
            let prior = wind.and_then(|(u, v)| {
                if u.is_finite() && v.is_finite() {
                    Some((
                        calibration.scale * (cosine * u - sine * v),
                        calibration.scale * (sine * u + cosine * v),
                    ))
                } else {
                    None
                }
            });
            match (*correlation, prior) {
                (Some(correlation), _) if correlation.confidence >= STRONG_CONFIDENCE => Some((
                    correlation.u_cells_per_minute,
                    correlation.v_cells_per_minute,
                )),
                (Some(correlation), Some(prior)) => {
                    let weight = correlation.confidence.clamp(0.0, 1.0);
                    Some((
                        weight * correlation.u_cells_per_minute + (1.0 - weight) * prior.0,
                        weight * correlation.v_cells_per_minute + (1.0 - weight) * prior.1,
                    ))
                }
                (Some(correlation), None) => Some((
                    correlation.u_cells_per_minute,
                    correlation.v_cells_per_minute,
                )),
                (None, prior) => prior,
            }
        })
        .collect::<Vec<_>>();
    smooth(&mut vectors, correlations.grid);
    Ok(quantize_field(vectors, correlations.grid))
}

fn global_shift(previous: &[f32], current: &[f32], width: usize, height: usize) -> (i32, i32) {
    let coarse_width = width.div_ceil(GLOBAL_STEP);
    let coarse_height = height.div_ceil(GLOBAL_STEP);
    let downsample = |field: &[f32]| {
        let mut coarse = Vec::with_capacity(coarse_width * coarse_height);
        for block_y in 0..coarse_height {
            for block_x in 0..coarse_width {
                let mut sum = 0.0_f32;
                let mut count = 0_usize;
                let y1 = ((block_y + 1) * GLOBAL_STEP).min(height);
                let x1 = ((block_x + 1) * GLOBAL_STEP).min(width);
                for y in block_y * GLOBAL_STEP..y1 {
                    for x in block_x * GLOBAL_STEP..x1 {
                        let value = field[y * width + x];
                        if value.is_finite() {
                            sum += value.max(0.0).ln_1p();
                            count += 1;
                        }
                    }
                }
                coarse.push(if count > 0 {
                    sum / count as f32
                } else {
                    f32::NAN
                });
            }
        }
        coarse
    };
    let previous = downsample(previous);
    let current = downsample(current);
    let mut best: Option<(f32, i32, i32)> = None;
    for v in -GLOBAL_RADIUS..=GLOBAL_RADIUS {
        for u in -GLOBAL_RADIUS..=GLOBAL_RADIUS {
            let Some(score) =
                coarse_correlation(&previous, &current, coarse_width, coarse_height, u, v)
            else {
                continue;
            };
            let distance = u.abs() + v.abs();
            if best.is_none_or(|(best_score, best_u, best_v)| {
                score > best_score + 1.0e-6
                    || ((score - best_score).abs() <= 1.0e-6
                        && distance < best_u.abs() + best_v.abs())
            }) {
                best = Some((score, u, v));
            }
        }
    }
    best.map_or((0, 0), |(_, u, v)| {
        (u * GLOBAL_STEP as i32, v * GLOBAL_STEP as i32)
    })
}

fn coarse_correlation(
    previous: &[f32],
    current: &[f32],
    width: usize,
    height: usize,
    u: i32,
    v: i32,
) -> Option<f32> {
    let mut count = 0_usize;
    let mut signal = 0_usize;
    let mut sum_a = 0.0_f64;
    let mut sum_b = 0.0_f64;
    let mut sum_aa = 0.0_f64;
    let mut sum_bb = 0.0_f64;
    let mut sum_ab = 0.0_f64;
    for y in 0..height {
        let cy = y as i32 + v;
        if !(0..height as i32).contains(&cy) {
            continue;
        }
        for x in 0..width {
            let cx = x as i32 + u;
            if !(0..width as i32).contains(&cx) {
                continue;
            }
            let a = previous[y * width + x];
            let b = current[cy as usize * width + cx as usize];
            if !a.is_finite() || !b.is_finite() {
                continue;
            }
            signal += usize::from(a > 0.0 || b > 0.0);
            let a = f64::from(a);
            let b = f64::from(b);
            count += 1;
            sum_a += a;
            sum_b += b;
            sum_aa += a * a;
            sum_bb += b * b;
            sum_ab += a * b;
        }
    }
    if count < 64 || signal < 16 {
        return None;
    }
    let count = count as f64;
    let covariance = sum_ab - sum_a * sum_b / count;
    let variance_a = sum_aa - sum_a * sum_a / count;
    let variance_b = sum_bb - sum_b * sum_b / count;
    if variance_a <= 1.0e-9 || variance_b <= 1.0e-9 {
        return None;
    }
    Some((covariance / (variance_a * variance_b).sqrt()) as f32)
}

fn estimate_block(
    previous: &[f32],
    current: &[f32],
    width: usize,
    height: usize,
    block_x: usize,
    block_y: usize,
    seed: (i32, i32),
) -> Option<CorrelationVector> {
    let x0 = block_x * BLOCK_SIZE;
    let y0 = block_y * BLOCK_SIZE;
    let x1 = (x0 + BLOCK_SIZE).min(width);
    let y1 = (y0 + BLOCK_SIZE).min(height);
    let signal_samples = (y0..y1)
        .step_by(SAMPLE_STEP)
        .flat_map(|y| (x0..x1).step_by(SAMPLE_STEP).map(move |x| (x, y)))
        .filter(|(x, y)| {
            let value = previous[y * width + x];
            value.is_finite() && value > 0.0
        })
        .count();
    if signal_samples < MIN_SIGNAL_SAMPLES {
        return None;
    }

    let mut candidates = Vec::with_capacity(((LOCAL_RADIUS * 2 + 1).pow(2)) as usize);
    for v in seed.1 - LOCAL_RADIUS..=seed.1 + LOCAL_RADIUS {
        for u in seed.0 - LOCAL_RADIUS..=seed.0 + LOCAL_RADIUS {
            let Some(score) = correlation(previous, current, width, height, x0, x1, y0, y1, u, v)
            else {
                continue;
            };
            candidates.push((score, u, v));
        }
    }
    let &(best_score, best_u, best_v) = candidates.iter().max_by(|left, right| {
        left.0
            .partial_cmp(&right.0)
            .unwrap_or(Ordering::Equal)
            .then_with(|| {
                let left_distance = (left.1 - seed.0).abs() + (left.2 - seed.1).abs();
                let right_distance = (right.1 - seed.0).abs() + (right.2 - seed.1).abs();
                right_distance.cmp(&left_distance)
            })
    })?;
    let second_score = candidates
        .iter()
        .filter(|(_, u, v)| (*u - best_u).abs() + (*v - best_v).abs() >= 2)
        .map(|candidate| candidate.0)
        .max_by(|left, right| left.partial_cmp(right).unwrap_or(Ordering::Equal))
        .unwrap_or(best_score);
    let correlation_quality = ((best_score - 0.2) / 0.7).clamp(0.0, 1.0);
    let peak_sharpness = ((best_score - second_score) / 0.08).clamp(0.0, 1.0);
    let signal_energy = (signal_samples as f32 / 12.0).clamp(0.0, 1.0);
    Some(CorrelationVector {
        u_cells_per_minute: best_u as f32,
        v_cells_per_minute: best_v as f32,
        confidence: 0.6 * correlation_quality + 0.25 * peak_sharpness + 0.15 * signal_energy,
    })
}

#[allow(clippy::too_many_arguments)]
fn correlation(
    previous: &[f32],
    current: &[f32],
    width: usize,
    height: usize,
    x0: usize,
    x1: usize,
    y0: usize,
    y1: usize,
    u: i32,
    v: i32,
) -> Option<f32> {
    let mut count = 0_usize;
    let mut sum_a = 0.0_f64;
    let mut sum_b = 0.0_f64;
    let mut sum_aa = 0.0_f64;
    let mut sum_bb = 0.0_f64;
    let mut sum_ab = 0.0_f64;
    for y in (y0..y1).step_by(SAMPLE_STEP) {
        let cy = i32::try_from(y).ok()?.checked_add(v)?;
        if !(0..height as i32).contains(&cy) {
            continue;
        }
        for x in (x0..x1).step_by(SAMPLE_STEP) {
            let cx = i32::try_from(x).ok()?.checked_add(u)?;
            if !(0..width as i32).contains(&cx) {
                continue;
            }
            let a = previous[y * width + x];
            let b = current[cy as usize * width + cx as usize];
            if !a.is_finite() || !b.is_finite() {
                continue;
            }
            let a = f64::from(a.max(0.0).ln_1p());
            let b = f64::from(b.max(0.0).ln_1p());
            count += 1;
            sum_a += a;
            sum_b += b;
            sum_aa += a * a;
            sum_bb += b * b;
            sum_ab += a * b;
        }
    }
    if count < MIN_CORRELATION_SAMPLES {
        return None;
    }
    let count = count as f64;
    let covariance = sum_ab - sum_a * sum_b / count;
    let variance_a = sum_aa - sum_a * sum_a / count;
    let variance_b = sum_bb - sum_b * sum_b / count;
    if variance_a <= 1.0e-9 || variance_b <= 1.0e-9 {
        return None;
    }
    Some((covariance / (variance_a * variance_b).sqrt()) as f32)
}

fn damp_outliers(vectors: &mut [Option<(f32, f32)>], grid: MotionGrid) {
    let original = vectors.to_vec();
    for (index, vector) in original.iter().copied().enumerate() {
        let Some(vector) = vector else { continue };
        let neighbors = neighborhood(&original, grid, index);
        if neighbors.len() < 3 {
            continue;
        }
        let median = component_median(&neighbors);
        if (vector.0 - median.0).hypot(vector.1 - median.1) > OUTLIER_DISTANCE {
            vectors[index] = Some(median);
        }
    }
}

fn damp_correlation_outliers(vectors: &mut [Option<CorrelationVector>], grid: MotionGrid) {
    let raw = vectors
        .iter()
        .map(|vector| vector.map(|vector| (vector.u_cells_per_minute, vector.v_cells_per_minute)))
        .collect::<Vec<_>>();
    for (index, vector) in vectors.iter_mut().enumerate() {
        let Some(candidate) = vector else { continue };
        let neighbors = neighborhood(&raw, grid, index);
        if neighbors.len() < 3 {
            continue;
        }
        let median = component_median(&neighbors);
        if (candidate.u_cells_per_minute - median.0).hypot(candidate.v_cells_per_minute - median.1)
            > OUTLIER_DISTANCE
        {
            candidate.u_cells_per_minute = median.0;
            candidate.v_cells_per_minute = median.1;
        }
    }
}

fn inherit_empty(vectors: &mut [Option<(f32, f32)>], grid: MotionGrid) {
    for _ in 0..INHERIT_PASSES {
        let original = vectors.to_vec();
        let mut changed = false;
        for (index, vector) in vectors.iter_mut().enumerate() {
            if vector.is_some() {
                continue;
            }
            let neighbors = neighborhood(&original, grid, index);
            if neighbors.len() >= 2 {
                *vector = Some(component_median(&neighbors));
                changed = true;
            }
        }
        if !changed {
            break;
        }
    }
}

fn smooth(vectors: &mut [Option<(f32, f32)>], grid: MotionGrid) {
    let original = vectors.to_vec();
    for (index, vector) in vectors.iter_mut().enumerate() {
        if vector.is_none() {
            continue;
        }
        let neighbors = neighborhood(&original, grid, index);
        if !neighbors.is_empty() {
            let count = neighbors.len() as f32;
            *vector = Some((
                neighbors.iter().map(|item| item.0).sum::<f32>() / count,
                neighbors.iter().map(|item| item.1).sum::<f32>() / count,
            ));
        }
    }
}

fn neighborhood(vectors: &[Option<(f32, f32)>], grid: MotionGrid, index: usize) -> Vec<(f32, f32)> {
    let width = grid.bw as usize;
    let height = grid.bh as usize;
    let x = index % width;
    let y = index / width;
    let mut result = Vec::with_capacity(9);
    for ny in y.saturating_sub(1)..=(y + 1).min(height - 1) {
        for nx in x.saturating_sub(1)..=(x + 1).min(width - 1) {
            if let Some(vector) = vectors[ny * width + nx] {
                result.push(vector);
            }
        }
    }
    result
}

fn component_median(vectors: &[(f32, f32)]) -> (f32, f32) {
    let mut u = vectors.iter().map(|vector| vector.0).collect::<Vec<_>>();
    let mut v = vectors.iter().map(|vector| vector.1).collect::<Vec<_>>();
    u.sort_by(|left, right| left.partial_cmp(right).unwrap_or(Ordering::Equal));
    v.sort_by(|left, right| left.partial_cmp(right).unwrap_or(Ordering::Equal));
    (u[u.len() / 2], v[v.len() / 2])
}

fn quantize_velocity(value: f32) -> i8 {
    (value * 10.0).round().clamp(-127.0, 127.0) as i8
}

fn quantize_field(vectors: Vec<Option<(f32, f32)>>, grid: MotionGrid) -> MotionField {
    let mut quantized = Vec::with_capacity(vectors.len() * 2);
    for vector in vectors {
        match vector {
            Some((u, v)) => {
                quantized.push(quantize_velocity(u));
                quantized.push(quantize_velocity(v));
            }
            None => quantized.extend_from_slice(&[NO_DATA, NO_DATA]),
        }
    }
    MotionField {
        grid,
        vectors: quantized,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn translated_pair(width: usize, height: usize, u: i32, v: i32) -> (Vec<f32>, Vec<f32>) {
        let mut previous = vec![0.0; width * height];
        for y in 14..height - 14 {
            for x in 14..width - 14 {
                let wave = ((x * 17 + y * 31 + x * y) % 23) as f32 / 8.0;
                if (x / 11 + y / 13) % 3 == 0 {
                    previous[y * width + x] = wave + 0.1;
                }
            }
        }
        let mut current = vec![0.0; width * height];
        for y in 0..height {
            for x in 0..width {
                let nx = x as i32 + u;
                let ny = y as i32 + v;
                if (0..width as i32).contains(&nx) && (0..height as i32).contains(&ny) {
                    current[ny as usize * width + nx as usize] = previous[y * width + x];
                }
            }
        }
        (previous, current)
    }

    #[test]
    fn recovers_translation_in_contract_units() {
        let (previous, current) = translated_pair(128, 96, 5, -3);
        let result = estimate(&previous, &current, 128, 96, 5.0).unwrap();
        assert_eq!(result.grid, MotionGrid { bw: 4, bh: 3 });
        let valid = result
            .vectors
            .chunks_exact(2)
            .filter(|pair| pair[0] != NO_DATA)
            .collect::<Vec<_>>();
        assert!(valid.len() >= 6);
        assert!(valid.iter().all(|pair| (pair[0] - 10).abs() <= 1));
        assert!(valid.iter().all(|pair| (pair[1] - -6).abs() <= 1));
    }

    #[test]
    fn coarse_seed_recovers_hourly_translation_beyond_local_radius() {
        let (previous, current) = translated_pair(256, 256, 48, 32);
        let result = estimate(&previous, &current, 256, 256, 60.0).unwrap();
        let valid = result
            .vectors
            .chunks_exact(2)
            .filter(|pair| pair[0] != NO_DATA)
            .collect::<Vec<_>>();
        assert!(valid.len() >= 20);
        assert!(valid.iter().all(|pair| (pair[0] - 8).abs() <= 1));
        assert!(valid.iter().all(|pair| (pair[1] - 5).abs() <= 1));
    }

    #[test]
    fn empty_block_inherits_supported_neighbor_median() {
        let grid = MotionGrid { bw: 3, bh: 3 };
        let mut vectors = vec![Some((4.0, -2.0)); 9];
        vectors[4] = None;
        inherit_empty(&mut vectors, grid);
        assert_eq!(vectors[4], Some((4.0, -2.0)));
    }

    #[test]
    fn empty_fields_remain_no_data() {
        let result = estimate(&vec![0.0; 64 * 64], &vec![0.0; 64 * 64], 64, 64, 5.0).unwrap();
        assert_eq!(result.vectors, vec![NO_DATA; 8]);
    }

    #[test]
    fn rejects_invalid_shapes_and_interval() {
        assert_eq!(
            estimate(&[0.0], &[0.0], 2, 1, 5.0),
            Err(Error::PreviousLength {
                actual: 1,
                expected: 2
            })
        );
        assert_eq!(
            estimate(&[0.0], &[0.0], 1, 1, 0.0),
            Err(Error::InvalidInterval)
        );
    }

    #[test]
    fn least_squares_recovers_scale_and_rotation() {
        let grid = MotionGrid { bw: 4, bh: 3 };
        let rotation = 20.0_f32.to_radians();
        let scale = 1.4_f32;
        let winds = (0..12)
            .map(|index| {
                let u = 0.2 + index as f32 * 0.01;
                let v = -0.1 + index as f32 * 0.005;
                Some((u, v))
            })
            .collect::<Vec<_>>();
        let vectors = winds
            .iter()
            .map(|wind| {
                let (u, v) = wind.unwrap();
                Some(CorrelationVector {
                    u_cells_per_minute: scale * (rotation.cos() * u - rotation.sin() * v),
                    v_cells_per_minute: scale * (rotation.sin() * u + rotation.cos() * v),
                    confidence: 0.9,
                })
            })
            .collect();
        let report = calibrate(&[CorrelationField { grid, vectors }], &[winds], None).unwrap();
        assert_eq!(report.source, CalibrationSource::Fitted);
        assert_eq!(report.reliable_samples, 12);
        assert!((report.calibration.scale - scale).abs() < 1.0e-5);
        assert!((report.calibration.rotation_radians - rotation).abs() < 1.0e-5);
    }

    #[test]
    fn sparse_run_uses_previous_then_default_calibration() {
        let grid = MotionGrid { bw: 1, bh: 1 };
        let correlations = [CorrelationField {
            grid,
            vectors: vec![None],
        }];
        let winds = [vec![Some((0.2, -0.1))]];
        let previous = Calibration {
            scale: 1.3,
            rotation_radians: 0.2,
        };
        let reused = calibrate(&correlations, &winds, Some(previous)).unwrap();
        assert_eq!(reused.source, CalibrationSource::PreviousRun);
        assert_eq!(reused.calibration, previous);
        let defaulted = calibrate(&correlations, &winds, None).unwrap();
        assert_eq!(defaulted.source, CalibrationSource::Default);
        assert_eq!(defaulted.calibration, Calibration::default());
    }

    #[test]
    fn wind_fills_empty_blocks_and_confidence_controls_blend() {
        let grid = MotionGrid { bw: 3, bh: 1 };
        let correlations = CorrelationField {
            grid,
            vectors: vec![
                None,
                Some(CorrelationVector {
                    u_cells_per_minute: 0.0,
                    v_cells_per_minute: 0.0,
                    confidence: 0.5,
                }),
                Some(CorrelationVector {
                    u_cells_per_minute: 0.4,
                    v_cells_per_minute: 0.0,
                    confidence: 0.9,
                }),
            ],
        };
        let wind = vec![Some((0.2, 0.0)); 3];
        let field = blend_with_wind(&correlations, &wind, Calibration::default()).unwrap();
        assert!(field.vectors.chunks_exact(2).all(|pair| pair[0] != NO_DATA));
        assert_eq!(field.vectors, vec![2, 0, 2, 0, 3, 0]);
    }
}
