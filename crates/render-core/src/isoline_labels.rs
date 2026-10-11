use crate::{
    contours::{Contour, ring_fade_at},
    field::Field,
    mode_constants::mode_constants,
};
use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug)]
pub struct Screen {
    pub origin: [f64; 2],
    pub pixels_per_cell: [f64; 2],
    pub width: f64,
    pub height: f64,
    pub scale: f64,
}

impl Screen {
    pub fn point(&self, point: [f64; 2]) -> [f64; 2] {
        [
            self.origin[0] + point[0] * self.pixels_per_cell[0],
            self.origin[1] + point[1] * self.pixels_per_cell[1],
        ]
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Label {
    pub point: [f64; 2],
    pub screen: [f64; 2],
    pub level: f64,
    pub angle: f64,
    pub opacity: f64,
    pub text: String,
}

#[derive(Default)]
pub struct Labels {
    anchors: Vec<Label>,
    step: f64,
    key: Option<(usize, i32)>,
}

pub fn candidates(points: &[[f64; 2]], spacing: f64) -> Vec<[f64; 2]> {
    let mut until = spacing / 2.0;
    let mut candidates = Vec::new();
    for pair in points.windows(2) {
        let start = pair[0];
        let end = pair[1];
        let length = (end[0] - start[0]).hypot(end[1] - start[1]);
        while until <= length && length > 0.0 {
            let fraction = until / length;
            candidates.push([
                start[0] + (end[0] - start[0]) * fraction,
                start[1] + (end[1] - start[1]) * fraction,
            ]);
            until += spacing;
        }
        until -= length;
    }
    candidates
}

pub struct Placement<'a> {
    pub field: &'a Field,
    pub lines: &'a [Contour],
    pub contours: &'a [Contour],
    pub screen: Screen,
    pub step: f64,
    pub key: usize,
    pub pressure: bool,
    pub opacity: f64,
}

impl Labels {
    pub fn place(&mut self, input: Placement<'_>) -> Vec<Label> {
        let settings = &mode_constants().labels;
        if self.step != input.step {
            self.anchors.clear();
            self.step = input.step;
        }
        let mut live = Vec::new();
        let ring_km = if input.pressure {
            0.0
        } else {
            mode_constants().isoline.ring_km
        };
        let separated = |point: [f64; 2], labels: &[Label]| {
            labels.iter().all(|label| {
                (label.point[0] - point[0]).hypot(label.point[1] - point[1])
                    * input.screen.pixels_per_cell[0].abs()
                    >= settings.distance * input.screen.scale
            })
        };
        let add = |point: [f64; 2], level: f64, live: &mut Vec<Label>| {
            let Some((point, sample)) = input.field.project(point, level, input.step) else {
                return;
            };
            if !separated(point, live) {
                return;
            }
            let screen = input.screen.point(point);
            let mut angle = sample.gy.atan2(sample.gx).to_degrees() + 90.0;
            if angle > 90.0 {
                angle -= 180.0;
            }
            if angle <= -90.0 {
                angle += 180.0;
            }
            let fade = ring_fade_at(input.contours, ring_km, level, point);
            live.push(Label {
                point,
                screen: [
                    (screen[0] / input.screen.scale + 0.5).floor() * input.screen.scale,
                    (screen[1] / input.screen.scale + 0.5).floor() * input.screen.scale,
                ],
                level,
                angle,
                opacity: input.opacity * fade,
                text: if input.pressure {
                    format!("{level}")
                } else {
                    format!("{level}°")
                },
            });
        };
        for anchor in &self.anchors {
            add(anchor.point, anchor.level, &mut live);
        }
        let key = (input.key, input.step as i32);
        if self.key != Some(key) {
            self.key = Some(key);
            let spacing =
                settings.spacing * input.screen.scale / input.screen.pixels_per_cell[0].abs();
            for line in input.lines {
                for point in candidates(&line.points, spacing) {
                    if live.len() >= settings.maximum {
                        break;
                    }
                    let screen = input.screen.point(point);
                    if screen[0] < 0.0
                        || screen[1] < 0.0
                        || screen[0] > input.screen.width
                        || screen[1] > input.screen.height
                        || !separated(point, &live)
                    {
                        continue;
                    }
                    let Some((projected, _)) = input.field.project(point, line.level, input.step)
                    else {
                        continue;
                    };
                    if ring_fade_at(input.contours, ring_km, line.level, projected) <= 0.0 {
                        continue;
                    }
                    add(point, line.level, &mut live);
                }
            }
        }
        self.anchors = live.clone();
        live
    }
}
