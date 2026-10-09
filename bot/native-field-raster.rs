use std::convert::TryInto;
use std::io::{self, BufReader, Read, Write};

fn integer(reader: &mut impl Read) -> io::Result<usize> {
    let mut bytes = [0; 4];
    reader.read_exact(&mut bytes)?;
    Ok(u32::from_le_bytes(bytes) as usize)
}
fn floats(reader: &mut impl Read, count: usize) -> io::Result<Vec<f32>> {
    let mut bytes = vec![0; count * 4];
    reader.read_exact(&mut bytes)?;
    Ok(bytes
        .chunks_exact(4)
        .map(|part| f32::from_le_bytes(part.try_into().unwrap()))
        .collect())
}
fn doubles(reader: &mut impl Read, count: usize) -> io::Result<Vec<f64>> {
    let mut bytes = vec![0; count * 8];
    reader.read_exact(&mut bytes)?;
    Ok(bytes
        .chunks_exact(8)
        .map(|part| f64::from_le_bytes(part.try_into().unwrap()))
        .collect())
}
fn basis(position: f64, size: usize) -> [(usize, f32); 4] {
    let cell = position.floor() as isize;
    let fraction = (position - position.floor()) as f32;
    let squared = fraction * fraction;
    let cubed = squared * fraction;
    let weights = [
        (1.0 - 3.0 * fraction + 3.0 * squared - cubed) / 6.0,
        (4.0 - 6.0 * squared + 3.0 * cubed) / 6.0,
        (1.0 + 3.0 * fraction + 3.0 * squared - 3.0 * cubed) / 6.0,
        cubed / 6.0,
    ];
    std::array::from_fn(|offset| {
        (
            ((cell - 1 + offset as isize).clamp(0, size as isize - 1)) as usize,
            weights[offset],
        )
    })
}
fn smooth(value: f32) -> f32 {
    let bounded = value.clamp(0.0, 1.0);
    bounded * bounded * (3.0 - 2.0 * bounded)
}

fn main() -> io::Result<()> {
    let mut input = BufReader::new(io::stdin().lock());
    let mut output = io::stdout().lock();
    let width = integer(&mut input)?;
    let height = integer(&mut input)?;
    let grid_width = integer(&mut input)?;
    let grid_height = integer(&mut input)?;
    let columns = doubles(&mut input, width)?;
    let rows = doubles(&mut input, height)?;

    loop {
        let mut header = [0; 48];
        match input.read_exact(&mut header) {
            Ok(()) => (),
            Err(error) if error.kind() == io::ErrorKind::UnexpectedEof => break,
            Err(error) => return Err(error),
        }
        let pressure = u32::from_le_bytes(header[16..20].try_into().unwrap()) != 0;
        let opacity = f32::from_le_bytes(header[0..4].try_into().unwrap());
        let fill_opacity = f32::from_le_bytes(header[20..24].try_into().unwrap());
        let line_opacity = f32::from_le_bytes(header[24..28].try_into().unwrap());
        let half_width = f32::from_le_bytes(header[28..32].try_into().unwrap());
        let color: [f32; 3] = std::array::from_fn(|channel| {
            f32::from_le_bytes(
                header[32 + channel * 4..36 + channel * 4]
                    .try_into()
                    .unwrap(),
            )
        });
        let segment_count = u32::from_le_bytes(header[8..12].try_into().unwrap()) as usize;
        let has_rings = u32::from_le_bytes(header[12..16].try_into().unwrap()) != 0;
        let mut rgb = vec![0; width * height * 3];
        input.read_exact(&mut rgb)?;
        let values = if pressure {
            Vec::new()
        } else {
            floats(&mut input, grid_width * grid_height)?
        };
        let valid = if pressure {
            Vec::new()
        } else {
            floats(&mut input, grid_width * grid_height)?
        };
        let colors = if pressure {
            Vec::new()
        } else {
            floats(&mut input, 256 * 3)?
        };
        let segments = floats(&mut input, segment_count * 6)?;
        let rings = if has_rings {
            floats(&mut input, grid_width * grid_height * 2)?
        } else {
            Vec::new()
        };
        if !pressure {
            let scale = f32::from_le_bytes(header[44..48].try_into().unwrap()) as f64;
            let fill_width = (width as f64 * scale).round().max(1.0) as usize;
            let fill_height = (height as f64 * scale).round().max(1.0) as usize;
            let fill_columns: Vec<_> = (0..fill_width)
                .map(|column| {
                    columns[0] + (columns[1] - columns[0]) * ((column as f64 + 0.5) / scale - 0.5)
                })
                .collect();
            let fill_rows: Vec<_> = (0..fill_height)
                .map(|row| rows[0] + (rows[1] - rows[0]) * ((row as f64 + 0.5) / scale - 0.5))
                .collect();
            let horizontal: Vec<_> = fill_columns
                .iter()
                .map(|&position| basis(position, grid_width))
                .collect();
            let vertical: Vec<_> = fill_rows
                .iter()
                .map(|&position| basis(position, grid_height))
                .collect();
            let mut filled = vec![0u8; fill_width * fill_height * 4];
            for row in 0..fill_height {
                if fill_rows[row] < -0.5 || fill_rows[row] > grid_height as f64 - 0.5 {
                    continue;
                }
                for column in 0..fill_width {
                    if fill_columns[column] < -0.5 || fill_columns[column] > grid_width as f64 - 0.5
                    {
                        continue;
                    }
                    let mut value = 0.0;
                    let mut validity = 0.0;
                    for &(source_row, row_weight) in &vertical[row] {
                        for &(source_column, column_weight) in &horizontal[column] {
                            let index = source_row * grid_width + source_column;
                            let weight = row_weight * column_weight;
                            value += values[index] * weight;
                            validity += valid[index] * weight;
                        }
                    }
                    let level = (value + 0.5).floor();
                    let offset = value - level;
                    let mut fade = 1.0;
                    if has_rings {
                        let source_column = ((fill_columns[column] + 0.5).floor() as isize)
                            .clamp(0, grid_width as isize - 1)
                            as usize;
                        let source_row = ((fill_rows[row] + 0.5).floor() as isize)
                            .clamp(0, grid_height as isize - 1)
                            as usize;
                        let index = (source_row * grid_width + source_column) * 2;
                        if (rings[index] - level).abs() < 0.01 {
                            let horizontal_weight =
                                (fill_columns[column] - fill_columns[column].floor()) as f32;
                            let vertical_weight = (fill_rows[row] - fill_rows[row].floor()) as f32;
                            let west = (fill_columns[column].floor() as isize)
                                .clamp(0, grid_width as isize - 1)
                                as usize;
                            let north = (fill_rows[row].floor() as isize)
                                .clamp(0, grid_height as isize - 1)
                                as usize;
                            let east = (west + 1).min(grid_width - 1);
                            let south = (north + 1).min(grid_height - 1);
                            let northern = rings[(north * grid_width + west) * 2 + 1]
                                * (1.0 - horizontal_weight)
                                + rings[(north * grid_width + east) * 2 + 1] * horizontal_weight;
                            let southern = rings[(south * grid_width + west) * 2 + 1]
                                * (1.0 - horizontal_weight)
                                + rings[(south * grid_width + east) * 2 + 1] * horizontal_weight;
                            fade = northern * (1.0 - vertical_weight) + southern * vertical_weight;
                        }
                    }
                    let upper_weight = if fade >= 1.0 {
                        if offset >= 0.0 {
                            1.0
                        } else {
                            0.0
                        }
                    } else {
                        (0.5 + offset / (1.0 - fade)).clamp(0.0, 1.0)
                    };
                    let lower = ((level as isize - 1 + 128).clamp(0, 255)) as usize * 3;
                    let upper = ((level as isize + 128).clamp(0, 255)) as usize * 3;
                    let alpha = fill_opacity * smooth((validity - 0.3) / 0.4) * opacity;
                    let destination = (row * fill_width + column) * 4;
                    for channel in 0..3 {
                        let color = colors[lower + channel] * (1.0 - upper_weight)
                            + colors[upper + channel] * upper_weight;
                        filled[destination + channel] =
                            (color * 255.0 * alpha).round().clamp(0.0, 255.0) as u8;
                    }
                    filled[destination + 3] = (alpha * 255.0).round() as u8;
                }
            }
            for row in 0..height {
                for column in 0..width {
                    let position_x =
                        ((column as f64 + 0.5) * scale - 0.5).clamp(0.0, fill_width as f64 - 1.0);
                    let position_y =
                        ((row as f64 + 0.5) * scale - 0.5).clamp(0.0, fill_height as f64 - 1.0);
                    let west = position_x.floor() as usize;
                    let east = (west + 1).min(fill_width - 1);
                    let north = position_y.floor() as usize;
                    let south = (north + 1).min(fill_height - 1);
                    let horizontal = (position_x - west as f64) as f32;
                    let vertical = (position_y - north as f64) as f32;
                    let indexes = [
                        (north * fill_width + west) * 4,
                        (north * fill_width + east) * 4,
                        (south * fill_width + west) * 4,
                        (south * fill_width + east) * 4,
                    ];
                    let weights = [
                        (1.0 - horizontal) * (1.0 - vertical),
                        horizontal * (1.0 - vertical),
                        (1.0 - horizontal) * vertical,
                        horizontal * vertical,
                    ];
                    let mut rgba = [0.0f32; 4];
                    for corner in 0..4 {
                        for channel in 0..4 {
                            rgba[channel] +=
                                filled[indexes[corner] + channel] as f32 * weights[corner];
                        }
                    }
                    let destination = (row * width + column) * 3;
                    for channel in 0..3 {
                        rgb[destination + channel] =
                            (rgb[destination + channel] as f32 * (1.0 - rgba[3] / 255.0)
                                + rgba[channel])
                                .round()
                                .clamp(0.0, 255.0) as u8;
                    }
                }
            }
        }
        let mut ink = vec![0.0f32; width * height];

        for segment in segments.chunks_exact(6) {
            let [ax, ay, bx, by, alpha_a, alpha_b]: [f32; 6] = segment.try_into().unwrap();
            let delta_x = bx - ax;
            let delta_y = by - ay;
            let length_squared = (delta_x * delta_x + delta_y * delta_y).max(1e-12);
            let left = ((ax.min(bx) - 2.0).floor() as isize).clamp(0, width as isize) as usize;
            let right = ((ax.max(bx) + 2.0).ceil() as isize).clamp(0, width as isize) as usize;
            let top = ((ay.min(by) - 2.0).floor() as isize).clamp(0, height as isize) as usize;
            let bottom = ((ay.max(by) + 2.0).ceil() as isize).clamp(0, height as isize) as usize;
            for row in top..bottom {
                for column in left..right {
                    let along = (((column as f32 + 0.5 - ax) * delta_x
                        + (row as f32 + 0.5 - ay) * delta_y)
                        / length_squared)
                        .clamp(0.0, 1.0);
                    let distance = (column as f32 + 0.5 - ax - along * delta_x)
                        .hypot(row as f32 + 0.5 - ay - along * delta_y);
                    let alpha = (half_width + 0.5 - distance).clamp(0.0, 1.0)
                        * (alpha_a * (1.0 - along) + alpha_b * along);
                    let index = row * width + column;
                    ink[index] = ink[index].max(alpha);
                }
            }
        }
        for (pixel, alpha) in ink.iter().enumerate() {
            let alpha = alpha * line_opacity * opacity;
            if alpha == 0.0 {
                continue;
            }
            for channel in 0..3 {
                let index = pixel * 3 + channel;
                rgb[index] =
                    (rgb[index] as f32 * (1.0 - alpha) + color[channel] * alpha).round() as u8;
            }
        }
        output.write_all(&rgb)?;
        output.flush()?;
    }
    Ok(())
}
