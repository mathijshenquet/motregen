use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Field {
    pub width: usize,
    pub height: usize,
    pub values: Vec<f32>,
    pub valid: Vec<f32>,
}

#[derive(Clone, Copy, Debug, Default)]
pub struct Sample {
    pub value: f64,
    pub gx: f64,
    pub gy: f64,
    pub valid: f64,
}

pub fn smoothstep(low: f64, high: f64, value: f64) -> f64 {
    let fraction = ((value - low) / (high - low).max(1e-9)).clamp(0.0, 1.0);
    fraction * fraction * (3.0 - 2.0 * fraction)
}

pub fn basis(fraction: f64) -> [f64; 4] {
    let squared = fraction * fraction;
    let cubed = squared * fraction;
    [
        (1.0 - 3.0 * fraction + 3.0 * squared - cubed) / 6.0,
        (4.0 - 6.0 * squared + 3.0 * cubed) / 6.0,
        (1.0 + 3.0 * fraction + 3.0 * squared - 3.0 * cubed) / 6.0,
        cubed / 6.0,
    ]
}

fn derivative(fraction: f64) -> [f64; 4] {
    let squared = fraction * fraction;
    [
        (-3.0 + 6.0 * fraction - 3.0 * squared) / 6.0,
        (-12.0 * fraction + 9.0 * squared) / 6.0,
        (3.0 + 6.0 * fraction - 9.0 * squared) / 6.0,
        3.0 * squared / 6.0,
    ]
}

pub fn slice_weights(time: f64, depth: usize) -> [(usize, f64); 4] {
    let base = time.floor() as isize;
    let weights = basis(time - time.floor());
    std::array::from_fn(|offset| {
        (
            (base - 1 + offset as isize).clamp(0, depth as isize - 1) as usize,
            weights[offset],
        )
    })
}

impl Field {
    pub fn prepare(mut values: Vec<f32>, width: usize, height: usize, passes: usize) -> Self {
        assert!(width > 0 && height > 0 && values.len() == width * height);
        for _ in 0..passes {
            for horizontal in [true, false] {
                let mut filtered = vec![f32::NAN; values.len()];
                for row in 0..height {
                    for column in 0..width {
                        let index = row * width + column;
                        if values[index].is_nan() {
                            continue;
                        }
                        let mut sum = 0.0_f64;
                        let mut count = 0;
                        for offset in -1..=1 {
                            let next_row = row as isize + if horizontal { 0 } else { offset };
                            let next_column = column as isize + if horizontal { offset } else { 0 };
                            if next_row < 0
                                || next_column < 0
                                || next_row >= height as isize
                                || next_column >= width as isize
                            {
                                continue;
                            }
                            let value = values[next_row as usize * width + next_column as usize];
                            if !value.is_nan() {
                                sum += f64::from(value);
                                count += 1;
                            }
                        }
                        filtered[index] = (sum / f64::from(count)) as f32;
                    }
                }
                values = filtered;
            }
        }
        let valid = values
            .iter()
            .map(|value| if value.is_nan() { 0.0 } else { 1.0 })
            .collect();
        for _ in 0..8 {
            let mut holes = Vec::new();
            for row in 0..height {
                for column in 0..width {
                    let index = row * width + column;
                    if !values[index].is_nan() {
                        continue;
                    }
                    let mut sum = 0.0_f64;
                    let mut count = 0;
                    for (next_column, next_row) in [
                        (column as isize - 1, row as isize),
                        (column as isize + 1, row as isize),
                        (column as isize, row as isize - 1),
                        (column as isize, row as isize + 1),
                    ] {
                        if next_column < 0
                            || next_row < 0
                            || next_column >= width as isize
                            || next_row >= height as isize
                        {
                            continue;
                        }
                        let value = values[next_row as usize * width + next_column as usize];
                        if !value.is_nan() {
                            sum += f64::from(value);
                            count += 1;
                        }
                    }
                    if count > 0 {
                        holes.push((index, (sum / f64::from(count)) as f32));
                    }
                }
            }
            if holes.is_empty() {
                break;
            }
            for (index, value) in holes {
                values[index] = value;
            }
        }
        for value in &mut values {
            if value.is_nan() {
                *value = 0.0;
            }
        }
        Self {
            width,
            height,
            values,
            valid,
        }
    }

    pub fn blend(fields: &[(&Self, f64)]) -> Self {
        let first = fields[0].0;
        let mut blended = Self {
            width: first.width,
            height: first.height,
            values: vec![0.0; first.values.len()],
            valid: vec![0.0; first.values.len()],
        };
        for &(field, weight) in fields {
            assert_eq!((field.width, field.height), (first.width, first.height));
            if weight == 0.0 {
                continue;
            }
            for index in 0..field.values.len() {
                blended.values[index] = (f64::from(blended.values[index])
                    + f64::from(field.values[index]) * weight)
                    as f32;
                blended.valid[index] = (f64::from(blended.valid[index])
                    + f64::from(field.valid[index]) * weight)
                    as f32;
            }
        }
        blended
    }

    pub fn sample(&self, column: f64, row: f64) -> Sample {
        let column_base = column.floor() as isize;
        let row_base = row.floor() as isize;
        let horizontal = basis(column - column.floor());
        let vertical = basis(row - row.floor());
        let horizontal_slope = derivative(column - column.floor());
        let vertical_slope = derivative(row - row.floor());
        let mut sampled = Sample::default();
        for offset_y in 0..4 {
            let source_row =
                (row_base - 1 + offset_y as isize).clamp(0, self.height as isize - 1) as usize;
            for offset_x in 0..4 {
                let source_column = (column_base - 1 + offset_x as isize)
                    .clamp(0, self.width as isize - 1) as usize;
                let index = source_row * self.width + source_column;
                let value = f64::from(self.values[index]);
                let weight = horizontal[offset_x] * vertical[offset_y];
                sampled.value += value * weight;
                sampled.valid += f64::from(self.valid[index]) * weight;
                sampled.gx += value * horizontal_slope[offset_x] * vertical[offset_y];
                sampled.gy += value * horizontal[offset_x] * vertical_slope[offset_y];
            }
        }
        sampled
    }

    pub fn project(
        &self,
        mut point: [f64; 2],
        level: f64,
        step: f64,
    ) -> Option<([f64; 2], Sample)> {
        for _ in 0..2 {
            let sample = self.sample(point[0], point[1]);
            let norm = sample.gx * sample.gx + sample.gy * sample.gy;
            if sample.valid < 0.5 || norm < 1e-8 {
                return None;
            }
            let delta = (sample.value - level) / norm;
            if delta.abs() * norm.sqrt() > 2.0 {
                return None;
            }
            point[0] -= delta * sample.gx;
            point[1] -= delta * sample.gy;
            if point[0] < 0.0
                || point[1] < 0.0
                || point[0] > (self.width - 1) as f64
                || point[1] > (self.height - 1) as f64
            {
                return None;
            }
        }
        let sample = self.sample(point[0], point[1]);
        (sample.valid >= 0.5 && (sample.value - level).abs() <= step * 0.1)
            .then_some((point, sample))
    }
}
