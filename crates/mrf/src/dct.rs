//! Low-frequency DCT frames (`"dct"` header key): layout and rationale in docs/mrf.md §DCT fields.

use std::collections::VecDeque;

use crate::Error;

/// Coefficient quantization step floor, in orthonormal-DCT units. At K=64 on the
/// 209×225 hourly grid this is ≈0,02 °C rms in the field (docs/mrf.md).
pub const MIN_STEP: f32 = 0.2;

pub fn mask_len(cells: usize) -> usize {
    cells.div_ceil(8)
}

/// Decoded byte count of one DCT frame member.
pub fn frame_len(cells: usize, k: u32) -> usize {
    let k = k as usize;
    4 + mask_len(cells) + 2 * k * k
}

/// Orthonormal DCT-II basis rows `basis[k * n + i]` for the first `k` frequencies.
fn basis(n: usize, k: usize) -> Vec<f64> {
    let mut rows = Vec::with_capacity(k * n);
    for frequency in 0..k {
        let scale = if frequency == 0 {
            (1.0 / n as f64).sqrt()
        } else {
            (2.0 / n as f64).sqrt()
        };
        for sample in 0..n {
            let angle =
                std::f64::consts::PI * (2 * sample + 1) as f64 * frequency as f64 / (2 * n) as f64;
            rows.push(scale * angle.cos());
        }
    }
    rows
}

/// Replaces NaN cells by the value of the nearest valid cell (4-neighbour BFS,
/// row-major tie order), so the transform sees no step at the no-data edge.
fn fill_nearest(values: &[f32], width: usize, height: usize) -> Vec<f64> {
    let mut filled = values
        .iter()
        .map(|value| f64::from(*value))
        .collect::<Vec<_>>();
    let mut reached = values
        .iter()
        .map(|value| value.is_finite())
        .collect::<Vec<_>>();
    let mut queue = (0..values.len())
        .filter(|index| reached[*index])
        .collect::<VecDeque<_>>();
    if queue.is_empty() {
        return vec![0.0; values.len()];
    }
    while let Some(index) = queue.pop_front() {
        let (row, column) = (index / width, index % width);
        let neighbours = [
            (row > 0).then(|| index - width),
            (column > 0).then(|| index - 1),
            (column + 1 < width).then(|| index + 1),
            (row + 1 < height).then(|| index + width),
        ];
        for neighbour in neighbours.into_iter().flatten() {
            if !reached[neighbour] {
                reached[neighbour] = true;
                filled[neighbour] = filled[index];
                queue.push_back(neighbour);
            }
        }
    }
    filled
}

/// Encodes a row-major field (NaN = no-data) as its `k`×`k` lowest DCT-II coefficients.
pub fn encode_frame(values: &[f32], width: u32, height: u32, k: u32) -> Result<Vec<u8>, Error> {
    let (w, h, kk) = (width as usize, height as usize, k as usize);
    validate_k(width, height, k)?;
    if values.len() != w * h {
        return Err(Error::WrongFrameLength {
            index: 0,
            actual: values.len(),
            expected: w * h,
        });
    }
    let filled = fill_nearest(values, w, h);
    let across = basis(w, kk);
    let down = basis(h, kk);
    // rows[y][kx] = Σx field[y][x]·across[kx][x]; coef[ky][kx] = Σy down[ky][y]·rows[y][kx]
    let mut rows = vec![0.0_f64; h * kk];
    for y in 0..h {
        let line = &filled[y * w..(y + 1) * w];
        for kx in 0..kk {
            let base = &across[kx * w..(kx + 1) * w];
            rows[y * kk + kx] = line.iter().zip(base).map(|(a, b)| a * b).sum();
        }
    }
    let mut coefficients = vec![0.0_f64; kk * kk];
    for ky in 0..kk {
        let base = &down[ky * h..(ky + 1) * h];
        for y in 0..h {
            let weight = base[y];
            let row = &rows[y * kk..(y + 1) * kk];
            for kx in 0..kk {
                coefficients[ky * kk + kx] += weight * row[kx];
            }
        }
    }
    let peak = coefficients
        .iter()
        .fold(0.0_f64, |peak, value| peak.max(value.abs()));
    let step = MIN_STEP.max((peak / f64::from(i16::MAX)) as f32);
    let mut out = Vec::with_capacity(frame_len(w * h, k));
    out.extend_from_slice(&step.to_le_bytes());
    let mut mask = vec![0_u8; mask_len(w * h)];
    for (index, value) in values.iter().enumerate() {
        if !value.is_finite() {
            mask[index / 8] |= 0x80 >> (index % 8);
        }
    }
    out.extend_from_slice(&mask);
    let quantized = coefficients
        .iter()
        .map(|value| (value / f64::from(step)).round().clamp(-32767.0, 32767.0) as i16)
        .collect::<Vec<_>>();
    out.extend(quantized.iter().map(|value| value.to_le_bytes()[0]));
    out.extend(quantized.iter().map(|value| value.to_le_bytes()[1]));
    Ok(out)
}

/// Inverse of [`encode_frame`]: the low-pass field on the full grid, NaN where masked.
pub fn decode_frame(bytes: &[u8], width: u32, height: u32, k: u32) -> Result<Vec<f32>, Error> {
    let (w, h, kk) = (width as usize, height as usize, k as usize);
    validate_k(width, height, k)?;
    let expected = frame_len(w * h, k);
    if bytes.len() != expected {
        return Err(Error::DecodedWrongLength {
            index: 0,
            actual: bytes.len(),
            expected,
        });
    }
    let step = f64::from(f32::from_le_bytes(
        bytes[..4].try_into().expect("four bytes"),
    ));
    let mask = &bytes[4..4 + mask_len(w * h)];
    let planes = &bytes[4 + mask_len(w * h)..];
    let coefficients = (0..kk * kk)
        .map(|index| f64::from(i16::from_le_bytes([planes[index], planes[kk * kk + index]])) * step)
        .collect::<Vec<_>>();
    let across = basis(w, kk);
    let down = basis(h, kk);
    // partial[ky][x] = Σkx coef[ky][kx]·across[kx][x]; field[y][x] = Σky down[ky][y]·partial[ky][x]
    let mut partial = vec![0.0_f64; kk * w];
    for ky in 0..kk {
        for kx in 0..kk {
            let coefficient = coefficients[ky * kk + kx];
            if coefficient == 0.0 {
                continue;
            }
            let base = &across[kx * w..(kx + 1) * w];
            let target = &mut partial[ky * w..(ky + 1) * w];
            for x in 0..w {
                target[x] += coefficient * base[x];
            }
        }
    }
    let mut field = vec![0.0_f64; w * h];
    for ky in 0..kk {
        let source = &partial[ky * w..(ky + 1) * w];
        for y in 0..h {
            let weight = down[ky * h + y];
            let target = &mut field[y * w..(y + 1) * w];
            for x in 0..w {
                target[x] += weight * source[x];
            }
        }
    }
    Ok(field
        .into_iter()
        .enumerate()
        .map(|(index, value)| {
            if mask[index / 8] & (0x80 >> (index % 8)) != 0 {
                f32::NAN
            } else {
                value as f32
            }
        })
        .collect())
}

pub(crate) fn validate_k(width: u32, height: u32, k: u32) -> Result<(), Error> {
    if k == 0 || k > width || k > height {
        return Err(Error::InvalidDct { k, width, height });
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn smooth(width: u32, height: u32) -> Vec<f32> {
        (0..height)
            .flat_map(|y| {
                (0..width).map(move |x| {
                    12.0 + 6.0 * (x as f32 / width as f32 * 3.0).sin()
                        - 4.0 * (y as f32 / height as f32 * 2.0).cos()
                })
            })
            .collect()
    }

    #[test]
    fn round_trip_keeps_a_smooth_field() {
        let (width, height) = (209, 225);
        let field = smooth(width, height);
        let bytes = encode_frame(&field, width, height, 64).unwrap();
        assert_eq!(bytes.len(), frame_len(field.len(), 64));
        let back = decode_frame(&bytes, width, height, 64).unwrap();
        let rms = (field
            .iter()
            .zip(&back)
            .map(|(a, b)| f64::from(a - b).powi(2))
            .sum::<f64>()
            / field.len() as f64)
            .sqrt();
        let max = field
            .iter()
            .zip(&back)
            .map(|(a, b)| (a - b).abs())
            .fold(0.0_f32, f32::max);
        assert!(rms < 0.05, "rms {rms}");
        assert!(max < 0.3, "max {max}");
    }

    #[test]
    fn full_k_is_exact_up_to_coefficient_quantization() {
        let field = (0..49)
            .map(|index| (index * 37 % 11) as f32 - 3.0)
            .collect::<Vec<_>>();
        let back = decode_frame(&encode_frame(&field, 7, 7, 7).unwrap(), 7, 7, 7).unwrap();
        // Each cell sums 49 coefficient errors of at most MIN_STEP/2 × basis ≤ 2/7.
        for (a, b) in field.iter().zip(&back) {
            assert!((a - b).abs() < 0.2, "{a} vs {b}");
        }
    }

    #[test]
    fn encoding_is_byte_deterministic() {
        let field = smooth(64, 48);
        assert_eq!(
            encode_frame(&field, 64, 48, 16).unwrap(),
            encode_frame(&field, 64, 48, 16).unwrap()
        );
    }

    #[test]
    fn no_data_survives_as_mask_and_does_not_leak() {
        let (width, height) = (40, 30);
        let mut field = vec![5.0_f32; 1200];
        for y in 0..height {
            for x in 0..8 {
                field[y * width + x] = f32::NAN;
            }
        }
        field[1199] = f32::NAN;
        let back = decode_frame(&encode_frame(&field, 40, 30, 12).unwrap(), 40, 30, 12).unwrap();
        for (index, (a, b)) in field.iter().zip(&back).enumerate() {
            assert_eq!(a.is_nan(), b.is_nan(), "mask differs at {index}");
            if a.is_finite() {
                assert!((a - b).abs() < 0.01, "nearest fill leaked a step: {b}");
            }
        }
    }

    #[test]
    fn warm_fields_do_not_overflow_the_dc_coefficient() {
        let field = vec![44.0_f32; 209 * 225];
        let back = decode_frame(&encode_frame(&field, 209, 225, 8).unwrap(), 209, 225, 8).unwrap();
        assert!(back.iter().all(|value| (value - 44.0).abs() < 0.05));
    }

    /// Shared with web/src/core/dct.test.ts: the TS encoder must produce these exact bytes.
    pub(crate) fn golden_field() -> Vec<f32> {
        (0..120)
            .map(|index| {
                if index == 7 || index == 64 {
                    f32::NAN
                } else {
                    let (x, y) = ((index % 12) as f32, (index / 12) as f32);
                    9.0 + 0.7 * x - 0.4 * y + (x * y * 0.3).sin()
                }
            })
            .collect()
    }

    const GOLDEN_HEX: &str = "cdcc4c3e010000000000000080000000000000618102f2ff4202fffdfd01fffcfdff06fdfe0105fefe00050302ff00ffff0000ffffff00ffffffff00ffff0000ffff000000";

    #[test]
    fn golden_frame_is_stable() {
        let bytes = encode_frame(&golden_field(), 12, 10, 5).unwrap();
        let hex = bytes
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect::<String>();
        assert_eq!(hex, GOLDEN_HEX);
    }

    #[test]
    fn rejects_k_larger_than_the_grid() {
        assert!(encode_frame(&[0.0; 6], 3, 2, 3).is_err());
        assert!(decode_frame(&[0; 4], 3, 2, 0).is_err());
    }
}
