//! Gevoelsgetallen in de film (U107), zoals `TemperatureNumbers` in de app (U100 "plekken-half"): een heel getal op
//! vaste plekken naast de plaatsnaam, op een schijf in de kleur van zijn band; de isolijnen liggen op x,5 °C, dus het
//! getal klopt altijd met het vlak eronder. Plaatsing met de ladder van het kaartregime tegen het naammasker, de
//! klok en eerdere getallen. De plek hangt aan de breedte van `00°`, zodat een getal binnen een film niet verspringt.

use crate::{
    constants::constants,
    field::Field,
    mode_constants::{disc_radius, mode_constants},
    name_mask::{NameMask, Rect},
    projection::Projection,
    text::{Face, Text},
};

/// Het verschoven veld (waarde − offset, zoals de lijnen en banden) en de banden zoals ze gevuld zijn.
pub struct BandedField<'a> {
    pub field: &'a Field,
    pub projection: &'a Projection,
    /// RGB per band vanaf band −128 (0–1), dezelfde als de vulling.
    pub colors: &'a [f32],
    /// Dekking van de vulling (vaste schaal × randfade): de schijf is de band op dezelfde dekking.
    pub alpha: f32,
}

const REFERENCE_LABEL: &str = "00°";

pub fn draw_place_numbers(
    text: &mut Text,
    rgb: &mut [u8],
    plate: &[u8],
    names: &NameMask,
    banded: BandedField<'_>,
    night: bool,
    clock: [f64; 4],
) {
    let settings = &mode_constants().map_label;
    let scale = mode_constants().scale;
    let frame = &constants().size;
    let size = settings.size;
    let font_px = (size * scale).round() as u32;
    // `islandBox` in de app: ±0,6 em per teken plus 6 × 3 px padding.
    let box_width = ((REFERENCE_LABEL.chars().count() as f64 * size * 0.6 + 12.0).ceil() * scale)
        .round() as i32;
    let box_height = ((size + 6.0).ceil() * scale).round() as i32;
    let step = f64::from(box_height);
    let clock = Rect {
        left: clock[0] as i32,
        top: clock[1] as i32,
        right: clock[2] as i32,
        bottom: clock[3] as i32,
    };
    let projection = banded.projection;
    let column_at =
        |x: f64| projection.columns[0] + (projection.columns[1] - projection.columns[0]) * x;
    let row_at = |y: f64| projection.rows[0] + (projection.rows[1] - projection.rows[0]) * y;
    let (ink, halo) = if night {
        ([243, 251, 253], [16, 32, 39])
    } else {
        ([16, 38, 48], [255, 255, 255])
    };
    let previous = text.set_face(Face::Map);
    let digit_height = text.digit_height(font_px);
    let mut taken: Vec<Rect> = Vec::new();
    for place in settings.places.iter().take(settings.maximum) {
        let (x, y) = projection.point(place.lng, place.lat);
        let placed = settings.ladder.iter().find_map(|&[dx, dy]| {
            let (center_x, center_y) = (x + dx * step, y + dy * step);
            let rect = Rect {
                left: (center_x - f64::from(box_width) / 2.0).round() as i32,
                top: (center_y - f64::from(box_height) / 2.0).round() as i32,
                right: (center_x + f64::from(box_width) / 2.0).round() as i32,
                bottom: (center_y + f64::from(box_height) / 2.0).round() as i32,
            };
            let margin = (2.0 * scale).round() as i32;
            let inside = rect.left >= margin
                && rect.top >= margin
                && rect.right <= frame.width as i32 - margin
                && rect.bottom <= frame.height as i32 - margin;
            let free = inside
                && !rect.intersects(&clock.grown((4.0 * scale).round() as i32))
                && taken
                    .iter()
                    .all(|other| !rect.intersects(&other.grown((3.0 * scale).round() as i32)))
                && !names.overlaps(&rect);
            if !free {
                return None;
            }
            let sample = banded.field.sample(column_at(center_x), row_at(center_y));
            (sample.valid >= 0.5).then_some((rect, center_x, center_y, sample.value))
        });
        let Some((rect, center_x, center_y, value)) = placed else {
            continue;
        };
        taken.push(rect);
        // Band k ligt tussen de lijnen k + offset en k + 1 + offset; zijn getal is het bandmidden.
        let band = value.floor() as i32;
        let label = format!("{}°", band + 1);
        let radius = disc_radius(&label, size).ceil() * scale;
        let index = ((band + 128).clamp(0, 255) as usize) * 3;
        let color = [0, 1, 2].map(|channel| banded.colors[index + channel] * 255.0);
        disc(
            rgb,
            plate,
            [center_x, center_y],
            radius,
            color,
            banded.alpha,
        );
        let width = text.width(&label, font_px);
        text.draw(
            rgb,
            &label,
            (
                (center_x - f64::from(width) / 2.0) as f32,
                (center_y + f64::from(digit_height) / 2.0).round() as i32,
            ),
            font_px,
            ink,
            Some(halo),
        );
    }
    text.set_face(previous);
}

/// Schijf in de bandkleur over de plaat, met dezelfde dekking als de vulling; de lijn eronder verdwijnt (zoals de
/// SDF-schijf in de app). Rand 1 px zacht.
fn disc(rgb: &mut [u8], plate: &[u8], center: [f64; 2], radius: f64, color: [f32; 3], alpha: f32) {
    let frame = &constants().size;
    let left = ((center[0] - radius - 1.0).floor().max(0.0)) as usize;
    let right = ((center[0] + radius + 1.0).ceil().min(frame.width as f64)) as usize;
    let top = ((center[1] - radius - 1.0).floor().max(0.0)) as usize;
    let bottom = ((center[1] + radius + 1.0).ceil().min(frame.height as f64)) as usize;
    for row in top..bottom {
        for column in left..right {
            let distance = (column as f64 + 0.5 - center[0]).hypot(row as f64 + 0.5 - center[1]);
            let coverage = (radius + 0.5 - distance).clamp(0.0, 1.0) as f32;
            if coverage <= 0.0 {
                continue;
            }
            let offset = (row * frame.width + column) * 3;
            for channel in 0..3 {
                let filled =
                    f32::from(plate[offset + channel]) * (1.0 - alpha) + color[channel] * alpha;
                rgb[offset + channel] = (f32::from(rgb[offset + channel]) * (1.0 - coverage)
                    + filled * coverage)
                    .round() as u8;
            }
        }
    }
}
