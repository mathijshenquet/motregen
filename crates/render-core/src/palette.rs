use crate::constants::{RainPresentation, constants};

pub fn rain_palette(night: bool) -> &'static [u8] {
    &constants().palettes[if night { "dark" } else { "light" }]
}

pub fn composition_colors(night: bool) -> Vec<[f32; 4]> {
    composition_colors_for(
        night,
        constants().presentation[if night { "dark" } else { "light" }],
    )
}

pub fn composition_colors_for(night: bool, presentation: RainPresentation) -> Vec<[f32; 4]> {
    let palette = rain_palette(night);
    let RainPresentation {
        saturation,
        brightness,
        opacity,
        ..
    } = presentation;
    (0..65_536)
        .map(|index| {
            let position = (index as f64 / 255.0 - 0.5).clamp(0.0, 255.0);
            let lower = position.floor() as usize;
            let upper = (lower + 1).min(255);
            let mix = position - lower as f64;
            let interpolate = |channel| {
                palette[lower * 4 + channel] as f64 * (1.0 - mix)
                    + palette[upper * 4 + channel] as f64 * mix
            };
            let alpha = interpolate(3) / 255.0 * opacity;
            let mut colors = [interpolate(0), interpolate(1), interpolate(2)];
            let gray = colors[0] * 0.2126 + colors[1] * 0.7152 + colors[2] * 0.0722;
            for channel in &mut colors {
                *channel = (gray + (*channel - gray) * saturation) * brightness * alpha;
            }
            [
                colors[0] as f32,
                colors[1] as f32,
                colors[2] as f32,
                (1.0 - alpha) as f32,
            ]
        })
        .collect()
}
