use crate::{
    field::{Field, smoothstep},
    projection::Grid,
};
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Contour {
    pub level: f64,
    pub closed: bool,
    pub points: Vec<[f64; 2]>,
    #[serde(default)]
    pub gradient: Vec<f64>,
    #[serde(default)]
    pub length_km: f64,
}

pub fn length(points: &[[f64; 2]], closed: bool) -> f64 {
    let mut sum: f64 = points
        .windows(2)
        .map(|pair| (pair[1][0] - pair[0][0]).hypot(pair[1][1] - pair[0][1]))
        .sum();
    if closed && points.len() > 1 {
        let last = points.last().unwrap();
        sum += (points[0][0] - last[0]).hypot(points[0][1] - last[1]);
    }
    sum
}

pub fn marching_squares(values: &[f32], width: usize, height: usize, level: f64) -> Vec<Contour> {
    assert_eq!(values.len(), width * height);
    if width < 2 || height < 2 {
        return Vec::new();
    }
    let mut links = vec![[usize::MAX; 2]; width * height * 2];
    let mut points = vec![[0.0; 2]; links.len()];
    let mut touched = Vec::new();
    let segments: [&[(usize, usize)]; 16] = [
        &[],
        &[(3, 2)],
        &[(2, 1)],
        &[(3, 1)],
        &[(0, 1)],
        &[],
        &[(0, 2)],
        &[(3, 0)],
        &[(3, 0)],
        &[(0, 2)],
        &[],
        &[(0, 1)],
        &[(3, 1)],
        &[(2, 1)],
        &[(3, 2)],
        &[],
    ];
    for row in 0..height - 1 {
        for column in 0..width - 1 {
            let corners = [
                values[row * width + column],
                values[row * width + column + 1],
                values[(row + 1) * width + column + 1],
                values[(row + 1) * width + column],
            ];
            if corners.iter().any(|value| !value.is_finite()) {
                continue;
            }
            let code = corners.iter().enumerate().fold(0, |code, (index, &value)| {
                code | if f64::from(value) >= level {
                    8 >> index
                } else {
                    0
                }
            });
            let saddle;
            let pairs = if code == 5 || code == 10 {
                let center_high =
                    corners.iter().map(|value| f64::from(*value)).sum::<f64>() / 4.0 >= level;
                let cut_top_left = if code == 5 { center_high } else { !center_high };
                saddle = if cut_top_left {
                    [(3, 0), (2, 1)]
                } else {
                    [(0, 1), (3, 2)]
                };
                &saddle[..]
            } else {
                segments[code]
            };
            for &(from, to) in pairs {
                let mut crossing = |side: usize| {
                    let horizontal = side == 0 || side == 2;
                    let source_row = row + usize::from(side == 2);
                    let source_column = column + usize::from(side == 1);
                    let index = source_row * width + source_column;
                    let key = index * 2 + usize::from(!horizontal);
                    if links[key][0] == usize::MAX {
                        let start = f64::from(values[index]);
                        let end = f64::from(values[index + if horizontal { 1 } else { width }]);
                        let fraction = (level - start) / (end - start);
                        points[key] = [
                            (source_column as f64 + if horizontal { fraction } else { 0.0 }) as f32
                                as f64,
                            (source_row as f64 + if horizontal { 0.0 } else { fraction }) as f32
                                as f64,
                        ];
                        touched.push(key);
                    }
                    key
                };
                let first = crossing(from);
                let second = crossing(to);
                for (from, to) in [(first, second), (second, first)] {
                    let slot = usize::from(links[from][0] != usize::MAX);
                    links[from][slot] = to;
                }
            }
        }
    }
    let mut visited = vec![false; links.len()];
    let mut lines = Vec::new();
    for endpoints_only in [true, false] {
        for &start in &touched {
            if visited[start] || (endpoints_only && links[start][1] != usize::MAX) {
                continue;
            }
            let mut keys = vec![start];
            visited[start] = true;
            let mut current = start;
            while let Some(next) = links[current]
                .iter()
                .copied()
                .find(|&next| next != usize::MAX && !visited[next])
            {
                visited[next] = true;
                keys.push(next);
                current = next;
            }
            let closed = keys.len() > 2 && links[current].contains(&start);
            lines.push(Contour {
                level,
                closed,
                points: keys.iter().map(|&key| points[key]).collect(),
                gradient: Vec::new(),
                length_km: 0.0,
            });
        }
    }
    lines
}

pub fn chaikin(points: &[[f64; 2]], closed: bool) -> Vec<[f64; 2]> {
    let mut current = points.to_vec();
    for _ in 0..2 {
        if current.len() < 3 {
            break;
        }
        let mut next = Vec::new();
        if !closed {
            next.push(current[0]);
        }
        let count = if closed {
            current.len()
        } else {
            current.len() - 1
        };
        for index in 0..count {
            let start = current[index];
            let end = current[(index + 1) % current.len()];
            for fraction in [0.25, 0.75] {
                next.push([
                    start[0] + (end[0] - start[0]) * fraction,
                    start[1] + (end[1] - start[1]) * fraction,
                ]);
            }
        }
        if !closed {
            next.push(*current.last().unwrap());
        }
        current = next;
    }
    current
}

pub fn km_per_cell(grid: &Grid, row: f64) -> f64 {
    let north = grid.y0 + (row + 0.5) * grid.dy;
    let latitude = 2.0 * (north / 6_378_137.0).exp().atan() - std::f64::consts::FRAC_PI_2;
    grid.dx.abs() * latitude.cos() / 1000.0
}

pub fn ring_fade(contour: &Contour, minimum_km: f64) -> f64 {
    if !contour.closed || minimum_km <= 0.0 {
        1.0
    } else {
        smoothstep(minimum_km * 0.5, minimum_km, contour.length_km)
    }
}

pub fn trace(field: &Field, grid: &Grid, step: f64, tolerance: f64) -> Vec<Contour> {
    assert!(step.is_finite() && step > 0.0 && tolerance > 0.0);
    let mut horizontal = vec![0.0_f32; field.values.len()];
    let mut horizontal_valid = vec![0.0_f32; field.values.len()];
    for row in 0..field.height {
        for column in 0..field.width {
            let index = row * field.width + column;
            let west = row * field.width + column.saturating_sub(1);
            let east = row * field.width + (column + 1).min(field.width - 1);
            horizontal[index] = ((f64::from(field.values[west])
                + 4.0 * f64::from(field.values[index])
                + f64::from(field.values[east]))
                / 6.0) as f32;
            horizontal_valid[index] = ((f64::from(field.valid[west])
                + 4.0 * f64::from(field.valid[index])
                + f64::from(field.valid[east]))
                / 6.0) as f32;
        }
    }
    let mut nodes = vec![f32::NAN; field.values.len()];
    for row in 0..field.height {
        for column in 0..field.width {
            let index = row * field.width + column;
            let north = row.saturating_sub(1) * field.width + column;
            let south = (row + 1).min(field.height - 1) * field.width + column;
            let valid = (f64::from(horizontal_valid[north])
                + 4.0 * f64::from(horizontal_valid[index])
                + f64::from(horizontal_valid[south]))
                / 6.0;
            if valid >= 0.5 {
                nodes[index] = ((f64::from(horizontal[north])
                    + 4.0 * f64::from(horizontal[index])
                    + f64::from(horizontal[south]))
                    / 6.0) as f32;
            }
        }
    }
    let minimum = nodes.iter().copied().fold(f32::INFINITY, f32::min) as f64;
    let maximum = nodes.iter().copied().fold(f32::NEG_INFINITY, f32::max) as f64;
    let km_per_row: Vec<_> = (0..grid.height)
        .map(|row| km_per_cell(grid, row as f64))
        .collect();
    let km_at =
        |row: f64| km_per_row[(row + 0.5).floor().clamp(0.0, (grid.height - 1) as f64) as usize];
    let mut contours = Vec::new();
    let mut level = (minimum / step).floor() * step + step;
    while level <= maximum {
        for mut line in marching_squares(&nodes, field.width, field.height, level) {
            let coarse: Vec<_> = line
                .points
                .iter()
                .map(|&point| trace_project(field, point, level).unwrap_or(point))
                .collect();
            let segments = if line.closed {
                coarse.len()
            } else {
                coarse.len() - 1
            };
            let mut refined = Vec::new();
            for index in 0..coarse.len() {
                refined.push(coarse[index]);
                if index < segments {
                    refine(
                        field,
                        level,
                        coarse[index],
                        coarse[(index + 1) % coarse.len()],
                        tolerance,
                        0,
                        &mut refined,
                    );
                }
            }
            line.points = refined
                .iter()
                .map(|point| [point[0] as f32 as f64, point[1] as f32 as f64])
                .collect();
            line.gradient = refined
                .iter()
                .map(|point| {
                    let sample = field.sample(point[0], point[1]);
                    sample.gx.hypot(sample.gy) / km_at(point[1])
                })
                .collect();
            line.length_km = (0..if line.closed {
                refined.len()
            } else {
                refined.len() - 1
            })
                .map(|index| {
                    let start = refined[index];
                    let end = refined[(index + 1) % refined.len()];
                    (end[0] - start[0]).hypot(end[1] - start[1]) * km_at((start[1] + end[1]) / 2.0)
                })
                .sum();
            contours.push(line);
        }
        level += step;
    }
    contours
}

fn trace_project(field: &Field, point: [f64; 2], level: f64) -> Option<[f64; 2]> {
    let sample = field.sample(point[0], point[1]);
    let norm = sample.gx * sample.gx + sample.gy * sample.gy;
    if sample.valid < 0.5 || norm < 1e-10 {
        return None;
    }
    let delta = (sample.value - level) / norm;
    if delta.abs() * norm.sqrt() > 1.0 {
        return None;
    }
    Some([point[0] - delta * sample.gx, point[1] - delta * sample.gy])
}

#[allow(clippy::too_many_arguments)]
fn refine(
    field: &Field,
    level: f64,
    start: [f64; 2],
    end: [f64; 2],
    tolerance: f64,
    depth: usize,
    output: &mut Vec<[f64; 2]>,
) {
    if depth >= 4 {
        return;
    }
    let middle = [(start[0] + end[0]) / 2.0, (start[1] + end[1]) / 2.0];
    let Some(projected) = trace_project(field, middle, level) else {
        return;
    };
    if (projected[0] - middle[0]).hypot(projected[1] - middle[1]) <= tolerance {
        return;
    }
    refine(field, level, start, projected, tolerance, depth + 1, output);
    output.push(projected);
    refine(field, level, projected, end, tolerance, depth + 1, output);
}

pub fn ring_fade_at(contours: &[Contour], minimum_km: f64, level: f64, point: [f64; 2]) -> f64 {
    for contour in contours {
        if !contour.closed || contour.level != level || contour.length_km >= minimum_km {
            continue;
        }
        for index in 0..contour.points.len() {
            if segment_distance(
                point,
                contour.points[index],
                contour.points[(index + 1) % contour.points.len()],
            ) < 1.0
            {
                return ring_fade(contour, minimum_km);
            }
        }
    }
    1.0
}

pub fn segment_distance(point: [f64; 2], start: [f64; 2], end: [f64; 2]) -> f64 {
    let delta = [end[0] - start[0], end[1] - start[1]];
    let along = (((point[0] - start[0]) * delta[0] + (point[1] - start[1]) * delta[1])
        / (delta[0] * delta[0] + delta[1] * delta[1]).max(1e-12))
    .clamp(0.0, 1.0);
    (point[0] - start[0] - delta[0] * along).hypot(point[1] - start[1] - delta[1] * along)
}

pub fn ring_raster(contours: &[Contour], minimum_km: f64, width: usize, height: usize) -> Vec<f32> {
    let mut raster = Vec::new();
    for ring in contours {
        let fade = ring_fade(ring, minimum_km);
        if fade >= 1.0 {
            continue;
        }
        if raster.is_empty() {
            raster = (0..width * height)
                .flat_map(|_| [-1000.0_f32, 1.0])
                .collect();
        }
        let left = ring
            .points
            .iter()
            .map(|point| point[0])
            .fold(f64::INFINITY, f64::min);
        let right = ring
            .points
            .iter()
            .map(|point| point[0])
            .fold(f64::NEG_INFINITY, f64::max);
        let top = ring
            .points
            .iter()
            .map(|point| point[1])
            .fold(f64::INFINITY, f64::min);
        let bottom = ring
            .points
            .iter()
            .map(|point| point[1])
            .fold(f64::NEG_INFINITY, f64::max);
        for row in (top - 2.5).floor().max(0.0) as usize
            ..=(bottom + 2.5).ceil().min((height - 1) as f64) as usize
        {
            for column in (left - 2.5).floor().max(0.0) as usize
                ..=(right + 2.5).ceil().min((width - 1) as f64) as usize
            {
                let point = [column as f64, row as f64];
                let mut inside = false;
                let mut distance = f64::INFINITY;
                for index in 0..ring.points.len() {
                    let start = ring.points[(index + ring.points.len() - 1) % ring.points.len()];
                    let end = ring.points[index];
                    if (start[1] > point[1]) != (end[1] > point[1])
                        && point[0]
                            < start[0]
                                + (point[1] - start[1]) * (end[0] - start[0]) / (end[1] - start[1])
                    {
                        inside = !inside;
                    }
                    distance = distance.min(segment_distance(point, start, end));
                }
                let local_fade =
                    fade + (1.0 - fade) * smoothstep(1.0, 2.5, if inside { 0.0 } else { distance });
                let index = (row * width + column) * 2;
                if local_fade < f64::from(raster[index + 1]) {
                    raster[index] = ring.level as f32;
                    raster[index + 1] = local_fade as f32;
                }
            }
        }
    }
    raster
}

pub fn label_lines(field: &Field, grid: &Grid, step: f64, ring_km: f64) -> Vec<Contour> {
    let values: Vec<f32> = field
        .values
        .iter()
        .zip(&field.valid)
        .map(|(&value, &valid)| if valid > 0.5 { value } else { f32::NAN })
        .collect();
    let min = values.iter().copied().fold(f32::INFINITY, f32::min) as f64;
    let max = values.iter().copied().fold(f32::NEG_INFINITY, f32::max) as f64;
    let mut lines = Vec::new();
    let mut level = (min / step).ceil() * step;
    let center_km = km_per_cell(grid, (grid.height as f64 - 1.0) / 2.0);
    while level <= max {
        for mut line in marching_squares(&values, grid.width, grid.height, level) {
            if length(&line.points, line.closed)
                < if line.closed {
                    8.0_f64.max(ring_km / center_km)
                } else {
                    2.0
                }
            {
                continue;
            }
            line.points = chaikin(&line.points, line.closed);
            if line.closed {
                line.points.push(line.points[0]);
            }
            lines.push(line);
        }
        level += step;
    }
    lines
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn contours_preserve_open_lines_saddles_and_rings() {
        let field = [0.0, 1.0, 2.0, 0.0, 1.0, 2.0, 0.0, 1.0, 2.0];
        let lines = marching_squares(&field, 3, 3, 0.5);
        assert_eq!(lines.len(), 1);
        assert!(!lines[0].closed);
        assert!(lines[0].points.iter().all(|point| point[0] == 0.5));
        assert_eq!(marching_squares(&[0.0, 2.0, 2.0, 0.0], 2, 2, 1.0).len(), 2);
        let lines = marching_squares(&[0.0, 0.0, 0.0, 0.0, 2.0, 0.0, 0.0, 0.0, 0.0], 3, 3, 1.0);
        assert_eq!(lines.len(), 1);
        assert!(lines[0].closed);
    }
}
