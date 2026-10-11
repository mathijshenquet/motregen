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
        let (row_left, row_right) = if delta[1].abs() > 1e-12 {
            let first = (row as f64 + 0.5 - padding - start[1]) / delta[1];
            let second = (row as f64 + 0.5 + padding - start[1]) / delta[1];
            let first_x = start[0] + first.min(second).clamp(0.0, 1.0) * delta[0];
            let second_x = start[0] + first.max(second).clamp(0.0, 1.0) * delta[0];
            (
                ((first_x.min(second_x) - padding).floor().max(left as f64) as usize),
                ((first_x.max(second_x) + padding).ceil().min(right as f64) as usize),
            )
        } else {
            (left, right)
        };
        for column in row_left..row_right {
            let along = (((column as f64 + 0.5 - start[0]) * delta[0]
                + (row as f64 + 0.5 - start[1]) * delta[1])
                / squared)
                .clamp(0.0, 1.0);
            let horizontal = column as f64 + 0.5 - start[0] - along * delta[0];
            let vertical = row as f64 + 0.5 - start[1] - along * delta[1];
            let distance = (horizontal * horizontal + vertical * vertical).sqrt();
            let coverage = (padding - 0.5 - distance).clamp(0.0, 1.0);
            if coverage == 0.0 {
                continue;
            }
            let alpha = opacity((1.0 - along) * length, coverage).clamp(0.0, 1.0);
            if alpha == 0.0 {
                continue;
            }
            let index = (row * size.width + column) * 3;
            for channel in 0..3 {
                rgb[index + channel] = (f64::from(rgb[index + channel]) * (1.0 - alpha)
                    + f64::from(color[channel]) * alpha
                    + 0.5) as u8;
            }
        }
    }
}
