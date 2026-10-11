use crate::field::Field;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Mark {
    pub kind: char,
    pub column: f64,
    pub row: f64,
    pub value: f64,
    pub opacity: f64,
}

pub fn adaptive_step(minimum: f64, maximum: f64, current: f64) -> f64 {
    let count = |step: f64| (maximum / step).floor() - (minimum / step).ceil() + 1.0;
    let steps = [4.0, 2.0, 1.0];
    let ideal = steps
        .into_iter()
        .find(|&step| count(step) >= 4.0)
        .unwrap_or(1.0);
    if ideal == current {
        return ideal;
    }
    if ideal < current {
        if count(current) >= 3.0 {
            current
        } else {
            ideal
        }
    } else {
        steps
            .into_iter()
            .find(|&step| step > current && count(step) >= 6.0)
            .unwrap_or(current)
    }
}

pub fn extrema(field: &Field, radius: usize, prominence: f64) -> Vec<Mark> {
    let mut marks = Vec::new();
    if field.width <= 2 * radius || field.height <= 2 * radius {
        return marks;
    }
    for row in radius..field.height - radius {
        for column in radius..field.width - radius {
            let center = row * field.width + column;
            if field.valid[center] <= 0.5 {
                continue;
            }
            let value = field.values[center];
            let mut high = true;
            let mut low = true;
            for offset_y in -1..=1 {
                for offset_x in -1..=1 {
                    if offset_x == 0 && offset_y == 0 {
                        continue;
                    }
                    let index = (row as isize + offset_y) as usize * field.width
                        + (column as isize + offset_x) as usize;
                    high &= field.values[index] < value;
                    low &= field.values[index] > value;
                }
            }
            if !high && !low {
                continue;
            }
            let mut minimum = f32::INFINITY;
            let mut maximum = f32::NEG_INFINITY;
            let mut complete = true;
            for source_row in row - radius..=row + radius {
                for source_column in column - radius..=column + radius {
                    let index = source_row * field.width + source_column;
                    complete &= field.valid[index] > 0.5;
                    if index == center {
                        continue;
                    }
                    minimum = minimum.min(field.values[index]);
                    maximum = maximum.max(field.values[index]);
                }
            }
            if !complete {
                continue;
            }
            let kind = if high && value > maximum && f64::from(value - minimum) >= prominence {
                Some('H')
            } else if low && value < minimum && f64::from(maximum - value) >= prominence {
                Some('L')
            } else {
                None
            };
            if let Some(kind) = kind {
                marks.push(Mark {
                    kind,
                    column: column as f64,
                    row: row as f64,
                    value: f64::from(value),
                    opacity: 1.0,
                });
            }
        }
    }
    marks
}

pub fn blend_marks(left: &[Mark], right: &[Mark], mix: f64, cell_km: f64) -> Vec<Mark> {
    let mut used = vec![false; right.len()];
    let mut shown = Vec::new();
    for from in left {
        let nearest = right
            .iter()
            .enumerate()
            .filter(|(index, to)| !used[*index] && from.kind == to.kind)
            .map(|(index, to)| {
                (
                    index,
                    (to.column - from.column).hypot(to.row - from.row) * cell_km,
                )
            })
            .filter(|(_, distance)| *distance < 300.0)
            .min_by(|first, second| first.1.total_cmp(&second.1));
        let mut mark = from.clone();
        if let Some((index, _)) = nearest {
            used[index] = true;
            mark.column += (right[index].column - from.column) * mix;
            mark.row += (right[index].row - from.row) * mix;
        } else {
            mark.opacity = 1.0 - mix;
        }
        shown.push(mark);
    }
    for (index, to) in right.iter().enumerate() {
        if !used[index] {
            shown.push(Mark {
                opacity: mix,
                ..to.clone()
            });
        }
    }
    shown
}
