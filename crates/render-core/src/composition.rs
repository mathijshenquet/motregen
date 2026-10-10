use crate::sampling::{Coverage, sample};

#[derive(Clone, Copy)]
pub struct CoveragePair<'a> {
    pub left: &'a Coverage,
    pub right: &'a Coverage,
    pub displacement: f64,
}

impl CoveragePair<'_> {
    pub fn active_blocks(&self, columns: &[f64], rows: &[f64], mix: f64) -> Vec<bool> {
        let mut active = Vec::with_capacity(columns.len().div_ceil(32) * rows.len().div_ceil(16));
        for row in rows.chunks(16) {
            let north = row[0].min(*row.last().unwrap()) - self.displacement;
            let south = row[0].max(*row.last().unwrap()) + self.displacement + 1.0;
            for column in columns.chunks(32) {
                let west = column[0].min(*column.last().unwrap()) - self.displacement;
                let east = column[0].max(*column.last().unwrap()) + self.displacement + 1.0;
                active.push(
                    (mix < 1.0 && self.left.has_value(west, north, east, south))
                        || (mix > 0.0 && self.right.has_value(west, north, east, south)),
                );
            }
        }
        active
    }
}

#[derive(Clone, Copy)]
pub struct Composition<'a> {
    pub columns: &'a [f64],
    pub rows: &'a [f64],
    pub grid_width: usize,
    pub grid_height: usize,
    pub left: &'a [u8],
    pub right: &'a [u8],
    pub mix: f64,
    pub colors: &'a [[f32; 4]],
    pub displacements: Option<&'a [(f64, f64)]>,
    pub multiply: bool,
}

pub fn compose_frame(rgb: &mut [u8], frame: Composition<'_>) {
    #[cfg(feature = "parallel")]
    {
        let width = frame.columns.len();
        let split = frame.rows.len() / 2;
        let (upper, lower) = rgb.split_at_mut(split * width * 3);
        let (upper_rows, lower_rows) = frame.rows.split_at(split);
        rayon::join(
            || {
                compose(
                    upper,
                    Composition {
                        rows: upper_rows,
                        displacements: frame.displacements.map(|field| &field[..split * width]),
                        ..frame
                    },
                )
            },
            || {
                compose(
                    lower,
                    Composition {
                        rows: lower_rows,
                        displacements: frame.displacements.map(|field| &field[split * width..]),
                        ..frame
                    },
                )
            },
        );
    }
    #[cfg(not(feature = "parallel"))]
    compose(rgb, frame);
}

pub fn compose(rgb: &mut [u8], frame: Composition<'_>) {
    compose_covered(rgb, frame, None);
}

pub fn compose_covered(rgb: &mut [u8], frame: Composition<'_>, coverage: Option<CoveragePair<'_>>) {
    let width = frame.columns.len();
    let block_columns = width.div_ceil(32);
    let active =
        coverage.map(|coverage| coverage.active_blocks(frame.columns, frame.rows, frame.mix));
    for (row, &cell_y) in frame.rows.iter().enumerate() {
        if cell_y < 0.0 || cell_y > (frame.grid_height - 1) as f64 {
            continue;
        }
        for block in 0..block_columns {
            if active
                .as_ref()
                .is_some_and(|active| !active[row / 16 * block_columns + block])
            {
                continue;
            }
            for column in block * 32..(block * 32 + 32).min(width) {
                let cell_x = frame.columns[column];
                if cell_x < 0.0 || cell_x > (frame.grid_width - 1) as f64 {
                    continue;
                }
                let sample_at = |raster, east, north| {
                    sample(raster, frame.grid_width, frame.grid_height, east, north)
                };
                let value = if frame.mix == 0.0 {
                    sample_at(frame.left, cell_x, cell_y)
                } else if frame.mix == 1.0 {
                    sample_at(frame.right, cell_x, cell_y)
                } else {
                    let (eastward, southward) = frame
                        .displacements
                        .map_or((0.0, 0.0), |field| field[row * width + column]);
                    sample_at(
                        frame.left,
                        cell_x - eastward * frame.mix,
                        cell_y - southward * frame.mix,
                    ) * (1.0 - frame.mix)
                        + sample_at(
                            frame.right,
                            cell_x + eastward * (1.0 - frame.mix),
                            cell_y + southward * (1.0 - frame.mix),
                        ) * frame.mix
                };
                if value <= 0.0 {
                    continue;
                }
                let color = frame.colors[((value * 256.0).round() as usize).min(65_535)];
                let offset = (row * width + column) * 3;
                for channel in 0..3 {
                    let under = rgb[offset + channel] as f64;
                    let paint = color[channel] as f64;
                    rgb[offset + channel] = (if frame.multiply {
                        under * paint / 255.0
                    } else {
                        paint
                    } + under * color[3] as f64)
                        .round()
                        .clamp(0.0, 255.0) as u8;
                }
            }
        }
    }
}
