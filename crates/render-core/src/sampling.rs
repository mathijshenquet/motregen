#[inline(always)]
pub(crate) fn sample(raster: &[u8], width: usize, height: usize, column: f64, row: f64) -> f64 {
    if column < 0.0 || row < 0.0 || column > (width - 1) as f64 || row > (height - 1) as f64 {
        return 0.0;
    }
    let west = column as usize;
    let north = row as usize;
    let east = (west + 1).min(width - 1);
    let south = (north + 1).min(height - 1);
    let values = [
        raster[north * width + west],
        raster[north * width + east],
        raster[south * width + west],
        raster[south * width + east],
    ];
    if values.contains(&255) {
        return 0.0;
    }
    if values[0] == values[1] && values[0] == values[2] && values[0] == values[3] {
        return values[0] as f64;
    }
    let horizontal = column - west as f64;
    let vertical = row - north as f64;
    let northern = values[0] as f64 + (values[1] as f64 - values[0] as f64) * horizontal;
    let southern = values[2] as f64 + (values[3] as f64 - values[2] as f64) * horizontal;
    northern + (southern - northern) * vertical
}

#[derive(Clone, Copy, Debug)]
pub struct Sampling {
    pub kind: usize,
    pub taps: usize,
    pub cell_width: f64,
    pub sigma: f64,
}

#[derive(Debug)]
pub struct Coverage {
    width: usize,
    height: usize,
    stride: usize,
    prefix: Vec<u32>,
}

impl Coverage {
    pub fn new(raster: &[u8], width: usize, height: usize) -> Self {
        let stride = width.div_ceil(8) + 1;
        let mut prefix = vec![0; stride * (height.div_ceil(8) + 1)];
        for top in (0..height).step_by(8) {
            let mut count = 0;
            let block_row = top / 8 + 1;
            for left in (0..width).step_by(8) {
                let active = (top..(top + 8).min(height)).any(|row| {
                    raster[row * width + left..row * width + (left + 8).min(width)]
                        .iter()
                        .any(|&value| value > 0 && value < 255)
                });
                count += u32::from(active);
                let block_column = left / 8 + 1;
                prefix[block_row * stride + block_column] =
                    count + prefix[(block_row - 1) * stride + block_column];
            }
        }
        Self {
            width,
            height,
            stride,
            prefix,
        }
    }

    pub fn has_value(&self, west: f64, north: f64, east: f64, south: f64) -> bool {
        if east < 0.0
            || south < 0.0
            || west > (self.width - 1) as f64
            || north > (self.height - 1) as f64
        {
            return false;
        }
        let left = west.max(0.0) as usize / 8;
        let top = north.max(0.0) as usize / 8;
        let right = (east.min((self.width - 1) as f64) as usize / 8 + 1).min(self.stride - 1);
        let bottom = south.min((self.height - 1) as f64) as usize / 8 + 1;
        self.prefix[bottom * self.stride + right] + self.prefix[top * self.stride + left]
            > self.prefix[bottom * self.stride + left] + self.prefix[top * self.stride + right]
    }
}

impl Sampling {
    fn weights(&self, length: usize) -> Vec<Vec<(usize, f64)>> {
        (0..length)
            .map(|pixel| {
                let position = (pixel as f64 + 0.5) / self.cell_width - 0.5;
                let even = self.taps.is_multiple_of(2);
                let anchor = if even {
                    position.floor()
                } else {
                    (position + 0.5).floor()
                };
                let first = if even {
                    1.0 - self.taps as f64 / 2.0
                } else {
                    -(self.taps as f64 - 1.0) / 2.0
                };
                (0..self.taps)
                    .map(|tap| {
                        let node = anchor + first + tap as f64;
                        let distance = (node - position).abs();
                        let weight = match self.kind {
                            1 => (1.0 - distance).max(0.0),
                            2 if distance < 1.0 => {
                                1.5 * distance.powi(3) - 2.5 * distance.powi(2) + 1.0
                            }
                            2 if distance < 2.0 => {
                                -0.5 * distance.powi(3) + 2.5 * distance.powi(2) - 4.0 * distance
                                    + 2.0
                            }
                            2 => 0.0,
                            _ => ((-distance.powi(2) / (2.0 * self.sigma.powi(2))).exp()
                                - (-(self.taps as f64 * 0.5).powi(2) / (2.0 * self.sigma.powi(2)))
                                    .exp())
                            .max(0.0),
                        };
                        let index = ((node + 0.5) * self.cell_width)
                            .floor()
                            .clamp(0.0, (length - 1) as f64)
                            as usize;
                        (index, weight)
                    })
                    .collect()
            })
            .collect()
    }

    pub fn filter(&self, source: Vec<u8>, width: usize, height: usize) -> Vec<u8> {
        if self.kind == 0 {
            return source;
        }
        self.filter_region(&source, width, height, 0..width, 0..height)
    }

    pub fn filter_region(
        &self,
        source: &[u8],
        width: usize,
        height: usize,
        columns: std::ops::Range<usize>,
        rows: std::ops::Range<usize>,
    ) -> Vec<u8> {
        if self.kind == 0 {
            return source.to_vec();
        }
        assert_eq!(source.len(), width * height);
        assert!(columns.end <= width && rows.end <= height);
        if columns.is_empty() || rows.is_empty() {
            return vec![255; source.len()];
        }
        let horizontal = self.weights(width);
        let vertical = self.weights(height);
        let horizontal_totals: Vec<f64> = horizontal
            .iter()
            .map(|weights| weights.iter().map(|&(_, weight)| weight).sum())
            .collect();
        let vertical_totals: Vec<f64> = vertical
            .iter()
            .map(|weights| weights.iter().map(|&(_, weight)| weight).sum())
            .collect();
        let needed_rows = vertical[rows.clone()]
            .iter()
            .flatten()
            .map(|&(row, _)| row)
            .fold((height, 0), |(first, last), row| {
                (first.min(row), last.max(row + 1))
            });
        let pass = |source: &[u8],
                    weights: &[Vec<(usize, f64)>],
                    totals: &[f64],
                    along_rows,
                    rows: std::ops::Range<usize>| {
            let mut result = vec![255; source.len()];
            let render_row = |row: usize, result: &mut [u8]| {
                for column in columns.clone() {
                    let axis = if along_rows { column } else { row };
                    let weights = &weights[axis];
                    let total = totals[axis];
                    let sample_at = |index| {
                        source[if along_rows {
                            row * width + index
                        } else {
                            index * width + column
                        }]
                    };
                    let Some(&(first_index, _)) = weights.first() else {
                        continue;
                    };
                    let first = sample_at(first_index);
                    if (first == 0 || first == 255)
                        && total > 0.0
                        && weights.iter().all(|&(index, _)| sample_at(index) == first)
                    {
                        result[column] = first;
                        continue;
                    }
                    let mut value = 0.0;
                    let mut validity = 0.0;
                    for &(index, weight) in weights {
                        let sample = sample_at(index);
                        if sample != 255 {
                            value += sample as f64 * weight;
                            validity += weight;
                        }
                    }
                    if validity > 0.0 && validity / total >= 0.5 {
                        result[column] = (value / validity).round().clamp(0.0, 254.0) as u8;
                    }
                }
            };
            let slice = &mut result[rows.start * width..rows.end * width];
            #[cfg(feature = "parallel")]
            {
                use rayon::prelude::*;
                slice
                    .par_chunks_mut(width)
                    .enumerate()
                    .for_each(|(index, result)| {
                        render_row(rows.start + index, result);
                    });
            }
            #[cfg(not(feature = "parallel"))]
            for (index, result) in slice.chunks_mut(width).enumerate() {
                render_row(rows.start + index, result);
            }
            result
        };
        pass(
            &pass(
                source,
                &horizontal,
                &horizontal_totals,
                true,
                needed_rows.0..needed_rows.1,
            ),
            &vertical,
            &vertical_totals,
            false,
            rows,
        )
    }
}
