use crate::{
    constants::constants,
    mode_constants::{element_px, element_text},
    name_mask::{NameMask, Rect},
    projection::{Grid, Projection, point_value},
    text::Text,
};

pub struct TemperaturePair<'a> {
    pub left_grid: &'a Grid,
    pub right_grid: &'a Grid,
    pub left: &'a [u8],
    pub right: &'a [u8],
    pub left_quant: &'a [Option<f32>],
    pub right_quant: &'a [Option<f32>],
    pub mix: f64,
}

#[derive(Clone, Copy)]
enum Horizontal {
    Centered,
    RightOfPoint,
    LeftOfPoint,
}

#[derive(Clone, Copy)]
enum Vertical {
    Above,
    Below,
    Centered,
}

/// Default first (above the place name, as before U103), then the remaining MapLibre variable anchors.
const CANDIDATES: [(Horizontal, Vertical); 8] = [
    (Horizontal::Centered, Vertical::Above),
    (Horizontal::Centered, Vertical::Below),
    (Horizontal::RightOfPoint, Vertical::Centered),
    (Horizontal::LeftOfPoint, Vertical::Centered),
    (Horizontal::RightOfPoint, Vertical::Above),
    (Horizontal::LeftOfPoint, Vertical::Above),
    (Horizontal::RightOfPoint, Vertical::Below),
    (Horizontal::LeftOfPoint, Vertical::Below),
];

/// Placement is decided on this width, not on the current value, so a label does not jump between frames of a film.
const REFERENCE_LABEL: &str = "00°";

struct Slot {
    rect: Rect,
    horizontal: Horizontal,
    /// The place's screen x, so a centred label sits exactly where it did before U103.
    point_x: f32,
}

/// One slot per place in `constants().places` order, `None` when every candidate hits a name or an earlier label.
fn temperature_slots(
    text: &mut Text,
    projection: &Projection,
    names: &NameMask,
    size: u32,
) -> Vec<Option<Slot>> {
    let width = text.width(REFERENCE_LABEL, size).ceil() as i32;
    let height = text.digit_height(size);
    let vertical_gap = element_px(21.0).round() as i32;
    let horizontal_gap = element_px(8.0).round() as i32;
    let padding = element_px(3.0).round() as i32;
    let mut taken: Vec<Rect> = Vec::new();
    constants()
        .places
        .iter()
        .map(|place| {
            let (screen_x, screen_y) = projection.point(place.lng, place.lat);
            let (point_x, point_y) = (screen_x.round() as i32, screen_y.round() as i32);
            let slot = CANDIDATES.iter().find_map(|&(horizontal, vertical)| {
                let left = match horizontal {
                    Horizontal::Centered => point_x - width / 2,
                    Horizontal::RightOfPoint => point_x + horizontal_gap,
                    Horizontal::LeftOfPoint => point_x - horizontal_gap - width,
                };
                let bottom = match vertical {
                    Vertical::Above => point_y - vertical_gap,
                    Vertical::Below => point_y + vertical_gap + height,
                    Vertical::Centered => point_y + height / 2,
                };
                let rect = Rect {
                    left,
                    top: bottom - height,
                    right: left + width,
                    bottom,
                };
                let padded = rect.grown(padding);
                let free = !names.overlaps(&padded)
                    && taken.iter().all(|other| !other.intersects(&padded));
                free.then_some(Slot {
                    rect,
                    horizontal,
                    point_x: screen_x as f32,
                })
            });
            if let Some(slot) = &slot {
                taken.push(slot.rect);
            }
            slot
        })
        .collect()
}

pub fn draw_temperature(
    text: &mut Text,
    rgb: &mut [u8],
    projection: &Projection,
    names: &NameMask,
    pair: TemperaturePair<'_>,
    night: bool,
) {
    let color = if night { [243, 251, 253] } else { [16, 38, 48] };
    let halo = if night { [16, 32, 39] } else { [255, 255, 255] };
    let size = element_text(20);
    let slots = temperature_slots(text, projection, names, size);
    for (place, slot) in constants().places.iter().zip(slots) {
        let Some(slot) = slot else {
            continue;
        };
        let left = point_value(
            pair.left_grid,
            pair.left,
            pair.left_quant,
            place.lng,
            place.lat,
        );
        let right = point_value(
            pair.right_grid,
            pair.right,
            pair.right_quant,
            place.lng,
            place.lat,
        );
        let value = match (left, right) {
            (Some(left), Some(right)) => Some(left * (1.0 - pair.mix) + right * pair.mix),
            (left, right) => left.or(right),
        };
        let Some(value) = value else {
            continue;
        };
        // JavaScript Math.round rounds negative halves toward positive infinity.
        let label = format!("{}°", (value + 0.5).floor() as i32);
        let width = text.width(&label, size);
        let left = match slot.horizontal {
            Horizontal::Centered => slot.point_x - width / 2.0,
            Horizontal::RightOfPoint => slot.rect.left as f32,
            Horizontal::LeftOfPoint => slot.rect.right as f32 - width,
        };
        text.draw(
            rgb,
            &label,
            (left, slot.rect.bottom),
            size,
            color,
            Some(halo),
        );
    }
}
