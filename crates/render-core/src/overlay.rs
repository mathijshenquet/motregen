use crate::{constants::constants, text::Text, time::clock_text};

pub fn draw_overlay(text: &mut Text, rgb: &mut [u8], epoch: i64, now: i64, night: bool) {
    let size = &constants().size;
    let left = (size.width as i32 - 320) / 2;
    let history = epoch <= now;
    let background = if night {
        [10, 24, 32]
    } else if history {
        [239, 247, 236]
    } else {
        [232, 243, 251]
    };
    let clock_color = if night { [237, 248, 252] } else { [16, 38, 48] };
    let muted_color = if night {
        [145, 170, 181]
    } else {
        [99, 123, 133]
    };
    rounded_panel(rgb, left, -16, 320, 138, 24, background, 0.96);
    let (clock, day) = clock_text(epoch);
    let time_width = text.width(&clock, 58);
    let day_width = text.width(day, 24);
    let content_left = (size.width as f32 - time_width - day_width - 16.0) / 2.0;
    text.draw(rgb, &clock, (content_left, 67), 58, clock_color, None);
    text.draw(
        rgb,
        day,
        (content_left + time_width + 16.0, 65),
        24,
        muted_color,
        None,
    );
    let title_width = text.width("Regen", 24);
    text.draw(
        rgb,
        "Regen",
        ((size.width as f32 - title_width) / 2.0, 103),
        24,
        muted_color,
        None,
    );
    let footer_color = if night { [237, 248, 252] } else { [16, 38, 48] };
    let footer_background = if night { [7, 19, 25] } else { [245, 249, 250] };
    rounded_panel(
        rgb,
        -20,
        size.height as i32 - 78,
        380,
        100,
        22,
        footer_background,
        0.9,
    );
    text.draw(
        rgb,
        "motregen.nl",
        (22.0, size.height as i32 - 43),
        28,
        footer_color,
        None,
    );
    text.draw(
        rgb,
        "KNMI · © OpenStreetMap",
        (22.0, size.height as i32 - 15),
        18,
        footer_color,
        None,
    );
}

#[allow(clippy::too_many_arguments)]
fn rounded_panel(
    rgb: &mut [u8],
    left: i32,
    top: i32,
    width: i32,
    height: i32,
    radius: i32,
    color: [u8; 3],
    alpha: f32,
) {
    let size = &constants().size;
    for row in top.max(0)..(top + height).min(size.height as i32) {
        for column in left.max(0)..(left + width).min(size.width as i32) {
            let corner_x = column.clamp(left + radius, left + width - radius - 1);
            let corner_y = row.clamp(top + radius, top + height - radius - 1);
            if (column - corner_x).pow(2) + (row - corner_y).pow(2) > radius.pow(2) {
                continue;
            }
            let offset = (row as usize * size.width + column as usize) * 3;
            for channel in 0..3 {
                rgb[offset + channel] = (color[channel] as f32 * alpha
                    + rgb[offset + channel] as f32 * (1.0 - alpha))
                    .round() as u8;
            }
        }
    }
}
