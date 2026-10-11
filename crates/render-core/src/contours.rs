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
