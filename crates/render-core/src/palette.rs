use crate::constants::constants;

pub fn rain_palette() -> &'static [u8] {
    &constants().palette
}

pub fn composition_colors(night: bool) -> Vec<[f32; 4]> {
    let palette = rain_palette();
    let presentation = &constants().presentation[if night { "dark" } else { "light" }];
    let saturation = presentation["saturation"].as_f64().unwrap();
    let brightness = presentation["brightness"].as_f64().unwrap();
    let opacity = presentation["opacity"].as_f64().unwrap();
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
            let alpha = interpolate(3) / 255.0;
            // Match the app's transparent canvas: SRC_ALPHA premultiplies RGB and squares alpha.
            let mut colors = [
                interpolate(0) * alpha,
                interpolate(1) * alpha,
                interpolate(2) * alpha,
            ];
            let gray = colors[0] * 0.2126 + colors[1] * 0.7152 + colors[2] * 0.0722;
            for channel in &mut colors {
                *channel = (gray + (*channel - gray) * saturation) * brightness * opacity;
            }
            [
                colors[0] as f32,
                colors[1] as f32,
                colors[2] as f32,
                (1.0 - alpha * alpha * opacity * opacity) as f32,
            ]
        })
        .collect()
}
