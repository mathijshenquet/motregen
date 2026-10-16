use crate::sampling::{Coverage, sample};

/// Eén regenlijn op een vaste veldwaarde, zoals de regenshader van de app hem tekent. Zonder serde: de bot
/// compileert dit bestand los mee (bot/native-raster.rs).
#[derive(Debug, Clone, Copy)]
pub struct RainOutline {
    /// Veldwaarde (byte) waarop de lijn ligt.
    pub index: f64,
    pub colour: [f64; 3],
    /// Dekking van de lijn over de regenkleur, 0–1.
    pub strength: f64,
    /// Halve lijndikte in pixels.
    pub half_width: f64,
}

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
    pub outlines: &'a [RainOutline],
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
    let values = field_values(&frame, coverage);
    for row in 0..frame.rows.len() {
        for column in 0..width {
            let value = values[row * width + column];
            let outline = outline_at(&frame, &values, width, row, column, value);
            if value <= 0.0 && outline.is_none() {
                continue;
            }
            let color = if value > 0.0 {
                frame.colors[((value * 256.0).round() as usize).min(65_535)]
            } else {
                [0.0, 0.0, 0.0, 1.0]
            };
            let offset = (row * width + column) * 3;
            for channel in 0..3 {
                let under = rgb[offset + channel] as f64;
                let mut paint = color[channel] as f64;
                let mut keep = color[3] as f64;
                if let Some((colour, strength)) = outline {
                    // Zelfde menging als de regenshader: de lijn ligt dekkend over de (voorvermenigvuldigde) regenkleur.
                    paint = paint * (1.0 - strength) + colour[channel] * strength;
                    keep *= 1.0 - strength;
                }
                rgb[offset + channel] = (if frame.multiply {
                    under * paint / 255.0
                } else {
                    paint
                } + under * keep)
                    .round()
                    .clamp(0.0, 255.0) as u8;
            }
        }
    }
}

/// De regenwaarde per pixel (0 = droog of buiten beeld), zodat de lijnen de helling met de buren kunnen meten.
fn field_values(frame: &Composition<'_>, coverage: Option<CoveragePair<'_>>) -> Vec<f64> {
    let width = frame.columns.len();
    let block_columns = width.div_ceil(32);
    let active =
        coverage.map(|coverage| coverage.active_blocks(frame.columns, frame.rows, frame.mix));
    let mut values = vec![0.0; width * frame.rows.len()];
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
                values[row * width + column] = if frame.mix == 0.0 {
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
            }
        }
    }
    values
}

/// Kleur en dekking van de regenlijn op deze pixel, als er een is: afstand tot de lijnwaarde gedeeld door hoeveel de
/// waarde per pixel verandert (wat `fwidth` in de shader doet), zodat de lijn op elke schaal even dun blijft.
fn outline_at(
    frame: &Composition<'_>,
    values: &[f64],
    width: usize,
    row: usize,
    column: usize,
    value: f64,
) -> Option<([f64; 3], f64)> {
    if frame.outlines.is_empty() || frame.multiply {
        return None;
    }
    let height = frame.rows.len();
    let horizontal = if column + 1 < width {
        values[row * width + column + 1]
    } else if column > 0 {
        values[row * width + column - 1]
    } else {
        value
    };
    let vertical = if row + 1 < height {
        values[(row + 1) * width + column]
    } else if row > 0 {
        values[(row - 1) * width + column]
    } else {
        value
    };
    if value <= 0.0 && horizontal <= 0.0 && vertical <= 0.0 {
        return None;
    }
    let step = ((horizontal - value).abs() + (vertical - value).abs()).max(1e-6);
    let mut result: Option<([f64; 3], f64)> = None;
    for outline in frame.outlines {
        let pixels = (value - outline.index).abs() / step;
        let strength = (1.0 - smoothstep(0.0, outline.half_width, pixels)) * outline.strength;
        if strength > result.map_or(0.0, |(_, current)| current) {
            result = Some((outline.colour, strength));
        }
    }
    result.filter(|(_, strength)| *strength > 0.0)
}

fn smoothstep(edge0: f64, edge1: f64, value: f64) -> f64 {
    let position = ((value - edge0) / (edge1 - edge0)).clamp(0.0, 1.0);
    position * position * (3.0 - 2.0 * position)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn draws_the_outline_where_the_field_crosses_its_value_and_nowhere_else() {
        // Een veld dat van droog naar regen oploopt, één cel per pixel; de lijn hoort op waarde 30 te liggen.
        let width = 64;
        let raster: Vec<u8> = (0..width * 4)
            .map(|index| ((index % width) * 4) as u8)
            .collect();
        let columns: Vec<f64> = (0..width).map(|column| column as f64).collect();
        let rows = vec![1.0, 2.0];
        let colors = vec![[0.0, 0.0, 0.0, 1.0]; 65_536];
        let outline = RainOutline {
            index: 30.0,
            colour: [255.0, 0.0, 0.0],
            strength: 1.0,
            half_width: 1.2,
        };
        let mut rgb = vec![0u8; width * rows.len() * 3];
        compose(
            &mut rgb,
            Composition {
                columns: &columns,
                rows: &rows,
                grid_width: width,
                grid_height: 4,
                left: &raster,
                right: &raster,
                mix: 0.0,
                colors: &colors,
                displacements: None,
                multiply: false,
                outlines: &[outline],
            },
        );
        let red: Vec<usize> = (0..width).filter(|&column| rgb[column * 3] > 0).collect();
        assert!(!red.is_empty());
        assert!(
            red.iter().all(|&column| (6..=9).contains(&column)),
            "lijn op {red:?}"
        );
    }
}
