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
        let horizontal = self.weights(width);
        let vertical = self.weights(height);
        let pass = |source: &[u8], weights: &[Vec<(usize, f64)>], along_rows: bool| {
            let mut result = vec![255; source.len()];
            for row in 0..height {
                for column in 0..width {
                    let mut value = 0.0;
                    let mut validity = 0.0;
                    let mut total = 0.0;
                    for &(index, weight) in &weights[if along_rows { column } else { row }] {
                        let sample = source[if along_rows {
                            row * width + index
                        } else {
                            index * width + column
                        }];
                        total += weight;
                        if sample != 255 {
                            value += sample as f64 * weight;
                            validity += weight;
                        }
                    }
                    if validity > 0.0 && validity / total >= 0.5 {
                        result[row * width + column] =
                            (value / validity).round().clamp(0.0, 254.0) as u8;
                    }
                }
            }
            result
        };
        pass(&pass(&source, &horizontal, true), &vertical, false)
    }
}
