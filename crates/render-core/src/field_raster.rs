use crate::{
    constants::constants, field::Field, mode_constants::mode_constants, projection::Projection,
};
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

pub fn fill(
    rgb: &mut [u8],
    field: &Field,
    projection: &Projection,
    colors: &[f32],
    rings: &[f32],
    opacity: f64,
) {
    let size = &constants().size;
    let width = size.width;
    let height = size.height;
    let grid_width = field.width;
    let grid_height = field.height;
    let values = &field.values;
    let valid = &field.valid;
    let columns = &projection.columns;
    let rows = &projection.rows;
    let has_rings = !rings.is_empty();
    let fill_opacity = mode_constants().isoline.fill_opacity as f32;
    let opacity = opacity as f32;
    let scale = mode_constants().isoline.fill_resolution;
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
            if fill_columns[column] < -0.5 || fill_columns[column] > grid_width as f64 - 0.5 {
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
                    .clamp(0, grid_width as isize - 1) as usize;
                let source_row = ((fill_rows[row] + 0.5).floor() as isize)
                    .clamp(0, grid_height as isize - 1) as usize;
                let index = (source_row * grid_width + source_column) * 2;
                if (rings[index] - level).abs() < 0.01 {
                    let horizontal_weight =
                        (fill_columns[column] - fill_columns[column].floor()) as f32;
                    let vertical_weight = (fill_rows[row] - fill_rows[row].floor()) as f32;
                    let west = (fill_columns[column].floor() as isize)
                        .clamp(0, grid_width as isize - 1) as usize;
                    let north = (fill_rows[row].floor() as isize).clamp(0, grid_height as isize - 1)
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
                if offset >= 0.0 { 1.0 } else { 0.0 }
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
    let horizontal_samples: Vec<_> = (0..width)
        .map(|column| {
            let position =
                ((column as f64 + 0.5) * scale - 0.5).clamp(0.0, fill_width as f64 - 1.0);
            let west = position.floor() as usize;
            let east = (west + 1).min(fill_width - 1);
            (west, east, (position - west as f64) as f32)
        })
        .collect();
    for row in 0..height {
        let position_y = ((row as f64 + 0.5) * scale - 0.5).clamp(0.0, fill_height as f64 - 1.0);
        let north = position_y.floor() as usize;
        let south = (north + 1).min(fill_height - 1);
        let vertical = (position_y - north as f64) as f32;
        for (column, &(west, east, horizontal)) in horizontal_samples.iter().enumerate() {
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
                    rgba[channel] += filled[indexes[corner] + channel] as f32 * weights[corner];
                }
            }
            let destination = (row * width + column) * 3;
            for channel in 0..3 {
                rgb[destination + channel] = (rgb[destination + channel] as f32
                    * (1.0 - rgba[3] / 255.0)
                    + rgba[channel]
                    + 0.5) as u8;
            }
        }
    }
}
pub fn lines(rgb: &mut [u8], segments: &[f32], color: [u8; 3], pressure: bool, opacity: f64) {
    let size = &constants().size;
    let width = size.width;
    let height = size.height;
    let settings = &mode_constants().isoline;
    let half_width = settings.line_profile.half_width as f32;
    let opacity = opacity as f32;
    let line_opacity = (if pressure {
        settings.pressure_opacity
    } else {
        settings.temperature_opacity
    } * settings.line_profile.alpha) as f32;
    let color = color.map(f32::from);
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
        for (channel, &color) in color.iter().enumerate() {
            let index = pixel * 3 + channel;
            rgb[index] = (rgb[index] as f32 * (1.0 - alpha) + color * alpha).round() as u8;
        }
    }
}
