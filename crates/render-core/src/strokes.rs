use crate::constants::constants;

pub fn stroke(
    rgb: &mut [u8],
    start: [f64; 2],
    end: [f64; 2],
    width: f64,
    color: [u8; 3],
    opacity: impl Fn(f64, f64) -> f64,
) {
    let size = &constants().size;
    let delta = [end[0] - start[0], end[1] - start[1]];
    let squared = (delta[0] * delta[0] + delta[1] * delta[1]).max(1e-12);
    let length = squared.sqrt();
    let padding = width / 2.0 + 1.0;
    let left = (start[0].min(end[0]) - padding)
        .floor()
        .clamp(0.0, size.width as f64) as usize;
    let right = (start[0].max(end[0]) + padding)
        .ceil()
        .clamp(0.0, size.width as f64) as usize;
    let top = (start[1].min(end[1]) - padding)
        .floor()
        .clamp(0.0, size.height as f64) as usize;
    let bottom = (start[1].max(end[1]) + padding)
        .ceil()
        .clamp(0.0, size.height as f64) as usize;
    for row in top..bottom {
        for column in left..right {
            let along = (((column as f64 + 0.5 - start[0]) * delta[0]
                + (row as f64 + 0.5 - start[1]) * delta[1])
                / squared)
                .clamp(0.0, 1.0);
            let distance = (column as f64 + 0.5 - start[0] - along * delta[0])
                .hypot(row as f64 + 0.5 - start[1] - along * delta[1]);
            let alpha = opacity(
                (1.0 - along) * length,
                (padding - 0.5 - distance).clamp(0.0, 1.0),
            )
            .clamp(0.0, 1.0);
            if alpha == 0.0 {
                continue;
            }
            let index = (row * size.width + column) * 3;
            for channel in 0..3 {
                rgb[index + channel] = (f64::from(rgb[index + channel]) * (1.0 - alpha)
                    + f64::from(color[channel]) * alpha)
                    .round() as u8;
            }
        }
    }
}
