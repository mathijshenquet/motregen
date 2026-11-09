use crate::{
    contours::{Contour, ring_fade_at},
    field::Field,
    mode_constants::{element_text, mode_constants},
    name_mask::{NameMask, Rect},
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

/// Labels keep their anchors from frame to frame; this is the whole memory of a film's isolines.
#[derive(Clone, Default, Deserialize, Serialize)]
pub struct Labels {
    anchors: Vec<Label>,
    step: f64,
    key: Option<(i64, i32)>,
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
    /// Epoch of the source frame the label lines come from.
    pub key: i64,
    pub pressure: bool,
    pub opacity: f64,
    /// Basemap names to keep clear of; `None` places as the web app does (fixture tests).
    pub names: Option<&'a NameMask>,
}

/// Text size of isoline and isobar labels in frame pixels.
pub fn label_text_size() -> u32 {
    element_text(17)
}

/// Axis-aligned box around a rotated label. Placement has no font, so the width is estimated from the character
/// count (0.6 em; digits are a little narrower and ° much narrower), which leaves a margin of its own.
fn label_rect(center: [f64; 2], text: &str, angle_degrees: f64) -> Rect {
    let size = f64::from(label_text_size());
    let width = text.chars().count() as f64 * size * 0.6;
    let height = size * 0.75;
    let (sine, cosine) = angle_degrees.to_radians().sin_cos();
    let half_width = (cosine.abs() * width + sine.abs() * height) / 2.0;
    let half_height = (sine.abs() * width + cosine.abs() * height) / 2.0;
    Rect {
        left: (center[0] - half_width).floor() as i32,
        top: (center[1] - half_height).floor() as i32,
        right: (center[0] + half_width).ceil() as i32,
        bottom: (center[1] + half_height).ceil() as i32,
    }
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
        // Anchors are placed as in the web app; a label is only left out while it lies on a basemap name, and comes
        // back once the field moves it off (U103).
        let on_name = |screen: [f64; 2], text: &str, angle: f64| {
            input
                .names
                .is_some_and(|names| names.overlaps(&label_rect(screen, text, angle)))
        };
        let add = |point: [f64; 2], level: f64, live: &mut Vec<Label>, hidden: &mut Vec<bool>| {
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
            let text = if input.pressure {
                format!("{level}")
            } else {
                format!("{level}°")
            };
            let blocked = on_name(screen, &text, angle);
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
                text,
            });
            hidden.push(blocked);
        };
        let mut hidden = Vec::new();
        for anchor in &self.anchors {
            add(anchor.point, anchor.level, &mut live, &mut hidden);
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
                    add(point, line.level, &mut live, &mut hidden);
                }
            }
        }
        self.anchors = live.clone();
        live.into_iter()
            .zip(hidden)
            .filter(|(_, hidden)| !hidden)
            .map(|(label, _)| label)
            .collect()
    }
}
