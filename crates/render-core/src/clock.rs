use crate::{constants::constants, text::Text, time::clock_text};
use serde::Serialize;
use std::str::FromStr;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ClockTransition {
    Schuif,
    Klap,
    Kruisfade,
}

// The PO chose rounding without an effect; transitions remain available as optional previews.
pub const CLOCK_TRANSITION: Option<ClockTransition> = None;

impl ClockTransition {
    pub fn animation_progress(self, phase: f32) -> f32 {
        if self == Self::Schuif {
            // PO-proef: de twee tussenframes schuiven tot 1/5 en 4/5.
            let outgoing = phase * phase;
            let incoming = (1.0 - phase) * (1.0 - phase);
            outgoing / (outgoing + incoming)
        } else {
            phase
        }
    }
}

impl FromStr for ClockTransition {
    type Err = String;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        match value {
            "schuif" => Ok(Self::Schuif),
            "klap" => Ok(Self::Klap),
            "kruisfade" => Ok(Self::Kruisfade),
            _ => Err("Kies schuif, klap of kruisfade".into()),
        }
    }
}

pub struct ClockState {
    pub from: String,
    pub to: String,
    pub progress: f32,
}

pub fn clock_state(epoch: i64) -> ClockState {
    let start = epoch.div_euclid(300_000) * 300_000;
    ClockState {
        from: clock_text(start).0,
        to: clock_text(start + 300_000).0,
        progress: (epoch - start) as f32 / 300_000.0,
    }
}

fn digit_width(text: &mut Text) -> usize {
    ('0'..='9')
        .map(|digit| text.width(&digit.to_string(), 58).ceil() as usize)
        .max()
        .unwrap()
}

pub fn clock_width(text: &mut Text) -> f32 {
    digit_width(text) as f32 * 4.0 + text.width(":", 58)
}

pub fn draw_clock(
    text: &mut Text,
    rgb: &mut [u8],
    epoch: i64,
    left: f32,
    color: [u8; 3],
    transition: ClockTransition,
    still: bool,
) {
    let mut state = clock_state(epoch);
    if still {
        state.from = clock_text(epoch).0;
        state.progress = 0.0;
    }
    let width = digit_width(text);
    let height = 56;
    let progress = transition.animation_progress(state.progress);
    let mut position = left;
    for (from, to) in state.from.chars().zip(state.to.chars()) {
        if from == ':' {
            text.draw(rgb, ":", (position, 67), 58, color, None);
            position += text.width(":", 58);
            continue;
        }
        let old = text.digit_mask(from, width, height);
        let new = if from == to || state.progress == 0.0 {
            None
        } else {
            Some(text.digit_mask(to, width, height))
        };
        draw_digit(
            rgb,
            &old,
            new.as_deref(),
            Digit {
                width,
                height,
                left: position.round() as i32,
                top: 15,
                color,
                progress,
                transition,
            },
        );
        position += width as f32;
    }
}

struct Digit {
    width: usize,
    height: usize,
    left: i32,
    top: i32,
    color: [u8; 3],
    progress: f32,
    transition: ClockTransition,
}

fn sample(mask: &[u8], width: usize, column: usize, row: f32) -> f32 {
    let lower = row.floor() as i32;
    let alpha = |index: i32| {
        if index < 0 || index >= (mask.len() / width) as i32 {
            0.0
        } else {
            mask[index as usize * width + column] as f32 / 255.0
        }
    };
    let mix = row - lower as f32;
    alpha(lower) * (1.0 - mix) + alpha(lower + 1) * mix
}

fn transition_alpha(old: &[u8], new: &[u8], column: usize, row: usize, digit: &Digit) -> f32 {
    let width = digit.width;
    let height = digit.height as f32;
    let progress = digit.progress;
    let at = |mask: &[u8], y: f32| sample(mask, width, column, y);
    match digit.transition {
        ClockTransition::Schuif => {
            at(old, row as f32 - progress * height)
                + at(new, row as f32 + (1.0 - progress) * height)
        }
        ClockTransition::Kruisfade => {
            at(old, row as f32) * (1.0 - progress) + at(new, row as f32) * progress
        }
        ClockTransition::Klap => {
            let hinge = height / 2.0;
            let y = row as f32 + 0.5;
            let cosine = (std::f32::consts::PI * progress).cos();
            let on_flap = if cosine > 0.0 {
                y < hinge && y >= hinge - hinge * cosine
            } else {
                y >= hinge && y < hinge - hinge * cosine
            };
            if on_flap {
                let source_row = if cosine > 0.0 {
                    hinge + (y - hinge) / cosine
                } else {
                    hinge - (y - hinge) / cosine
                };
                let mask = if cosine > 0.0 { old } else { new };
                at(mask, source_row - 0.5) * (0.65 + 0.35 * cosine.abs())
            } else if y < hinge {
                at(new, row as f32)
            } else {
                at(old, row as f32)
            }
        }
    }
}

fn draw_digit(rgb: &mut [u8], old: &[u8], new: Option<&[u8]>, digit: Digit) {
    let size = &constants().size;
    for row in 0..digit.height {
        for column in 0..digit.width {
            let x = digit.left + column as i32;
            let y = digit.top + row as i32;
            if x < 0 || y < 0 || x >= size.width as i32 || y >= size.height as i32 {
                continue;
            }
            let alpha = new
                .map_or(old[row * digit.width + column] as f32 / 255.0, |new| {
                    transition_alpha(old, new, column, row, &digit)
                })
                .clamp(0.0, 1.0);
            if alpha == 0.0 {
                continue;
            }
            let offset = (y as usize * size.width + x as usize) * 3;
            for channel in 0..3 {
                rgb[offset + channel] = (digit.color[channel] as f32 * alpha
                    + rgb[offset + channel] as f32 * (1.0 - alpha))
                    .round() as u8;
            }
        }
    }
}
