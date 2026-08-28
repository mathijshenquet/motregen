//! Coarse precipitation motion estimation for mrf annexes.

use std::cmp::Ordering;

use thiserror::Error;

pub const BLOCK_SIZE: usize = 32;
const SAMPLE_STEP: usize = 4;
const LOCAL_RADIUS: i32 = 8;
const MIN_SIGNAL_SAMPLES: usize = 4;
const MIN_CORRELATION_SAMPLES: usize = 8;
const OUTLIER_DISTANCE: f32 = 6.0;
const INHERIT_PASSES: usize = 4;
const NO_DATA: i8 = -128;

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
    let seed = centroid_shift(previous, current, width, height);
    let mut vectors = Vec::with_capacity(grid.bw as usize * grid.bh as usize);
    for block_y in 0..grid.bh as usize {
        for block_x in 0..grid.bw as usize {
            vectors.push(estimate_block(
                previous, current, width, height, block_x, block_y, seed,
            ));
        }
    }
    damp_outliers(&mut vectors, grid);
    inherit_empty(&mut vectors, grid);
    smooth(&mut vectors, grid);

    let mut quantized = Vec::with_capacity(vectors.len() * 2);
    for vector in vectors {
        match vector {
            Some((u, v)) => {
                quantized.push(quantize_velocity(u / interval_minutes));
                quantized.push(quantize_velocity(v / interval_minutes));
            }
            None => quantized.extend_from_slice(&[NO_DATA, NO_DATA]),
        }
    }
    Ok(MotionField {
        grid,
        vectors: quantized,
    })
}

fn centroid_shift(previous: &[f32], current: &[f32], width: usize, height: usize) -> (i32, i32) {
    let centroid = |field: &[f32]| {
        let mut weight = 0.0_f64;
        let mut x_sum = 0.0_f64;
        let mut y_sum = 0.0_f64;
        for y in (0..height).step_by(SAMPLE_STEP) {
            for x in (0..width).step_by(SAMPLE_STEP) {
                let value = field[y * width + x];
                if value.is_finite() && value > 0.0 {
                    let value = f64::from(value.ln_1p());
                    weight += value;
                    x_sum += x as f64 * value;
                    y_sum += y as f64 * value;
                }
            }
        }
        (weight > 0.0).then_some((x_sum / weight, y_sum / weight))
    };
    match (centroid(previous), centroid(current)) {
        (Some((px, py)), Some((cx, cy))) => (
            (cx - px).round().clamp(-120.0, 120.0) as i32,
            (cy - py).round().clamp(-120.0, 120.0) as i32,
        ),
        _ => (0, 0),
    }
}

fn estimate_block(
    previous: &[f32],
    current: &[f32],
    width: usize,
    height: usize,
    block_x: usize,
    block_y: usize,
    seed: (i32, i32),
) -> Option<(f32, f32)> {
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

    let mut best: Option<(f32, i32, i32)> = None;
    for v in seed.1 - LOCAL_RADIUS..=seed.1 + LOCAL_RADIUS {
        for u in seed.0 - LOCAL_RADIUS..=seed.0 + LOCAL_RADIUS {
            let Some(score) = correlation(previous, current, width, height, x0, x1, y0, y1, u, v)
            else {
                continue;
            };
            let distance = (u - seed.0).abs() + (v - seed.1).abs();
            let replace = best.is_none_or(|(best_score, best_u, best_v)| {
                score > best_score + 1.0e-6
                    || ((score - best_score).abs() <= 1.0e-6
                        && distance < (best_u - seed.0).abs() + (best_v - seed.1).abs())
            });
            if replace {
                best = Some((score, u, v));
            }
        }
    }
    best.map(|(_, u, v)| (u as f32, v as f32))
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
}
