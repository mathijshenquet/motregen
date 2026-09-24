//! Lossless predictive frames (`"pred"` header key): predictor, contexts and
//! range coder are specified in docs/mrf.md §Predictive frames.

use crate::Error;

pub const VERSION: u32 = 1;

const NO_DATA: u8 = 255;
const SYMBOLS: usize = 64;
const ESCAPE: u32 = SYMBOLS as u32 - 1;
/// Zigzagged residuals span 0..=508; escaped ones are sent as `z − ESCAPE` over this many values.
const ESCAPE_RANGE: u32 = 512;
const ACTIVITY_BUCKETS: usize = 7;
const CONTEXTS: usize = ACTIVITY_BUCKETS * 4;
const INCREMENT: u32 = 32;
const MAX_TOTAL: u32 = 1 << 16;
const TOP: u32 = 1 << 24;

pub fn mask_len(cells: usize) -> usize {
    cells.div_ceil(8)
}

struct Model {
    freq: Vec<[u32; SYMBOLS]>,
    total: Vec<u32>,
}

impl Model {
    fn new() -> Self {
        Self {
            freq: vec![[1; SYMBOLS]; CONTEXTS],
            total: vec![SYMBOLS as u32; CONTEXTS],
        }
    }

    fn cumulative(&self, context: usize, symbol: u32) -> u32 {
        self.freq[context][..symbol as usize].iter().sum()
    }

    fn update(&mut self, context: usize, symbol: u32) {
        let freq = &mut self.freq[context];
        freq[symbol as usize] += INCREMENT;
        self.total[context] += INCREMENT;
        if self.total[context] > MAX_TOTAL {
            for value in freq.iter_mut() {
                *value = (*value + 1) >> 1;
            }
            self.total[context] = freq.iter().sum();
        }
    }
}

/// Prediction and context of the cell at `index`, from already reconstructed values.
fn predict(values: &[i32], width: usize, index: usize) -> (i32, usize) {
    let (row, column) = (index / width, index % width);
    let (a, b, c, d) = if row == 0 {
        let a = if column > 0 { values[index - 1] } else { 127 };
        (a, a, a, a)
    } else {
        let up = index - width;
        let b = values[up];
        let a = if column > 0 { values[index - 1] } else { b };
        let c = if column > 0 { values[up - 1] } else { b };
        let d = if column + 1 < width {
            values[up + 1]
        } else {
            b
        };
        (a, b, c, d)
    };
    let sum = 2 * a + 2 * b - c + d + 2;
    let prediction = sum.div_euclid(4).clamp(0, 254);
    let fraction = sum.rem_euclid(4) as usize;
    let activity = (a - c).abs() + (b - c).abs() + (d - b).abs();
    let bucket = match activity {
        0 => 0,
        1 => 1,
        2 => 2,
        3..=4 => 3,
        5..=7 => 4,
        8..=11 => 5,
        _ => 6,
    };
    (prediction, bucket * 4 + fraction)
}

fn zigzag(residual: i32) -> u32 {
    if residual >= 0 {
        2 * residual as u32
    } else {
        (-2 * residual - 1) as u32
    }
}

fn unzigzag(value: u32) -> i32 {
    if value.is_multiple_of(2) {
        (value / 2) as i32
    } else {
        -((value / 2) as i32) - 1
    }
}

struct Encoder {
    low: u64,
    range: u32,
    cache: u8,
    pending: u64,
    out: Vec<u8>,
}

impl Encoder {
    fn new(out: Vec<u8>) -> Self {
        Self {
            low: 0,
            range: u32::MAX,
            cache: 0,
            pending: 1,
            out,
        }
    }

    fn encode(&mut self, cumulative: u32, frequency: u32, total: u32) {
        let step = self.range / total;
        self.low += u64::from(step) * u64::from(cumulative);
        self.range = step * frequency;
        while self.range < TOP {
            self.range <<= 8;
            self.shift_low();
        }
    }

    /// LZMA-style carry handling: a byte is held back while a later carry could still change it.
    fn shift_low(&mut self) {
        if self.low < 0xFF00_0000 || self.low > u64::from(u32::MAX) {
            let carry = (self.low >> 32) as u8;
            let mut byte = self.cache;
            loop {
                self.out.push(byte.wrapping_add(carry));
                byte = 0xFF;
                self.pending -= 1;
                if self.pending == 0 {
                    break;
                }
            }
            self.cache = (self.low >> 24) as u8;
        }
        self.pending += 1;
        self.low = (self.low & 0x00FF_FFFF) << 8;
    }

    fn finish(mut self) -> Vec<u8> {
        for _ in 0..5 {
            self.shift_low();
        }
        self.out
    }
}

struct Decoder<'a> {
    bytes: &'a [u8],
    position: usize,
    code: u32,
    range: u32,
}

impl<'a> Decoder<'a> {
    fn new(bytes: &'a [u8]) -> Result<Self, Error> {
        let mut decoder = Self {
            bytes,
            position: 0,
            code: 0,
            range: u32::MAX,
        };
        for _ in 0..5 {
            decoder.code = (decoder.code << 8) | u32::from(decoder.next()?);
        }
        Ok(decoder)
    }

    fn next(&mut self) -> Result<u8, Error> {
        let byte = *self.bytes.get(self.position).ok_or(Error::InvalidPred)?;
        self.position += 1;
        Ok(byte)
    }

    /// Returns the cumulative count the next symbol falls in; follow with [`Decoder::consume`].
    fn target(&mut self, total: u32) -> (u32, u32) {
        let step = self.range / total;
        ((self.code / step).min(total - 1), step)
    }

    fn consume(&mut self, step: u32, cumulative: u32, frequency: u32) -> Result<(), Error> {
        self.code -= step * cumulative;
        self.range = step * frequency;
        while self.range < TOP {
            self.code = (self.code << 8) | u32::from(self.next()?);
            self.range <<= 8;
        }
        Ok(())
    }
}

/// Encodes a row-major frame of quantized cells (255 = no-data) as mask + range-coded residuals.
pub fn encode_frame(cells: &[u8], width: u32) -> Vec<u8> {
    let width = width as usize;
    let mut out = vec![0_u8; mask_len(cells.len())];
    for (index, cell) in cells.iter().enumerate() {
        if *cell == NO_DATA {
            out[index / 8] |= 0x80 >> (index % 8);
        }
    }
    let mut encoder = Encoder::new(out);
    let mut model = Model::new();
    let mut values = vec![0_i32; cells.len()];
    for (index, cell) in cells.iter().enumerate() {
        let (prediction, context) = predict(&values, width, index);
        if *cell == NO_DATA {
            values[index] = prediction;
            continue;
        }
        values[index] = i32::from(*cell);
        let residual = zigzag(i32::from(*cell) - prediction);
        let symbol = residual.min(ESCAPE);
        encoder.encode(
            model.cumulative(context, symbol),
            model.freq[context][symbol as usize],
            model.total[context],
        );
        model.update(context, symbol);
        if symbol == ESCAPE {
            encoder.encode(residual - ESCAPE, 1, ESCAPE_RANGE);
        }
    }
    encoder.finish()
}

/// Inverse of [`encode_frame`]; rejects streams that are short, overlong or decode outside the table.
pub fn decode_frame(bytes: &[u8], width: u32, height: u32) -> Result<Vec<u8>, Error> {
    let (width, cells) = (width as usize, width as usize * height as usize);
    let mask = bytes.get(..mask_len(cells)).ok_or(Error::InvalidPred)?;
    let mut decoder = Decoder::new(&bytes[mask_len(cells)..])?;
    let mut model = Model::new();
    let mut values = vec![0_i32; cells];
    let mut out = vec![NO_DATA; cells];
    for index in 0..cells {
        let (prediction, context) = predict(&values, width, index);
        if mask[index / 8] & (0x80 >> (index % 8)) != 0 {
            values[index] = prediction;
            continue;
        }
        let total = model.total[context];
        let (target, step) = decoder.target(total);
        let freq = &model.freq[context];
        let (mut symbol, mut cumulative) = (0, 0);
        while cumulative + freq[symbol] <= target {
            cumulative += freq[symbol];
            symbol += 1;
        }
        decoder.consume(step, cumulative, freq[symbol])?;
        let symbol = symbol as u32;
        model.update(context, symbol);
        let residual = if symbol == ESCAPE {
            let (extra, step) = decoder.target(ESCAPE_RANGE);
            decoder.consume(step, extra, 1)?;
            ESCAPE + extra
        } else {
            symbol
        };
        let value = prediction + unzigzag(residual);
        if !(0..=254).contains(&value) {
            return Err(Error::InvalidPred);
        }
        values[index] = value;
        out[index] = value as u8;
    }
    if decoder.position != decoder.bytes.len() {
        return Err(Error::InvalidPred);
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn field(width: usize, height: usize, seed: u32) -> Vec<u8> {
        let mut state = seed;
        (0..width * height)
            .map(|index| {
                state = state.wrapping_mul(1_103_515_245).wrapping_add(12_345);
                let (x, y) = ((index % width) as f32, (index / width) as f32);
                let smooth = 140.0 + 30.0 * (x / 17.0).sin() - 20.0 * (y / 23.0).cos();
                let noise = (state >> 16) % 5;
                if y < 3.0 && x > width as f32 / 2.0 {
                    NO_DATA
                } else {
                    (smooth as u32 + noise).min(254) as u8
                }
            })
            .collect()
    }

    fn round_trip(cells: &[u8], width: u32, height: u32) -> Vec<u8> {
        let bytes = encode_frame(cells, width);
        let back = decode_frame(&bytes, width, height).unwrap();
        assert_eq!(back, cells);
        bytes
    }

    #[test]
    fn round_trips_a_noisy_field_with_no_data_and_compresses_it() {
        let cells = field(209, 225, 7);
        let bytes = round_trip(&cells, 209, 225);
        assert!(bytes.len() < cells.len() / 2, "{} bytes", bytes.len());
    }

    #[test]
    fn round_trips_extremes_escapes_and_edge_shapes() {
        let checker = (0..400)
            .map(|index| {
                if (index + index / 20) % 2 == 0 {
                    0
                } else {
                    254
                }
            })
            .collect::<Vec<u8>>();
        round_trip(&checker, 20, 20);
        round_trip(&[NO_DATA; 77], 11, 7);
        round_trip(&[254], 1, 1);
        round_trip(&[0, 254, 255, 3, 250], 5, 1);
        round_trip(&[0, 254, 255, 3, 250], 1, 5);
    }

    #[test]
    fn rejects_truncated_and_overlong_streams() {
        let cells = field(40, 30, 3);
        let bytes = encode_frame(&cells, 40);
        assert!(decode_frame(&bytes[..bytes.len() - 1], 40, 30).is_err());
        let mut longer = bytes.clone();
        longer.push(0);
        assert!(decode_frame(&longer, 40, 30).is_err());
        assert!(decode_frame(&bytes[..10], 40, 30).is_err());
    }

    #[test]
    fn encoding_is_byte_deterministic() {
        let cells = field(64, 48, 11);
        assert_eq!(encode_frame(&cells, 64), encode_frame(&cells, 64));
    }

    /// Shared with web/src/core/pred.test.ts: the TS encoder must produce these exact bytes.
    pub(crate) fn golden_cells() -> Vec<u8> {
        (0..120_u32)
            .map(|index| match index {
                7 | 64 => NO_DATA,
                33 => 0,
                _ => (100 + index % 12 * 3 + index / 12 * 2 + index * 7 % 5) as u8,
            })
            .collect()
    }

    const GOLDEN_HEX: &str = "01000000000000008000000000000000d46b80d2e882a2450dffd6566c714d06e98d2dc07dd5666ef86abc75decc9f091f6d76be138bb80b";

    #[test]
    fn golden_frame_is_stable() {
        let bytes = encode_frame(&golden_cells(), 12);
        let hex = bytes
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect::<String>();
        assert_eq!(hex, GOLDEN_HEX);
    }
}
