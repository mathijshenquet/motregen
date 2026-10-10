use crate::{
    constants::constants,
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

pub fn draw_temperature(
    text: &mut Text,
    rgb: &mut [u8],
    projection: &Projection,
    pair: TemperaturePair<'_>,
    night: bool,
) {
    let color = if night { [243, 251, 253] } else { [16, 38, 48] };
    let halo = if night { [16, 32, 39] } else { [255, 255, 255] };
    for place in &constants().places {
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
        let (x, y) = projection.point(place.lng, place.lat);
        let width = text.width(&label, 20);
        text.draw(
            rgb,
            &label,
            (x as f32 - width / 2.0, y.round() as i32 - 21),
            20,
            color,
            Some(halo),
        );
    }
}
