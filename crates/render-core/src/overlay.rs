use crate::{
    clock::{ClockTransition, draw_clock},
    constants::constants,
    text::Text,
    time::{clock_date, clock_text, loop_clock_epoch},
};

pub struct ClockOptions {
    pub transition: Option<ClockTransition>,
    pub still: bool,
}

pub fn draw_overlay(
    text: &mut Text,
    rgb: &mut [u8],
    epoch: i64,
    now: i64,
    night: bool,
    options: ClockOptions,
) {
    let size = &constants().size;
    let history = epoch <= now;
    let background = if night {
        [10, 24, 32]
    } else if history {
        [239, 247, 236]
    } else {
        [232, 243, 251]
    };
    let clock_color = if night { [237, 248, 252] } else { [16, 38, 48] };
    // De boven- en linkerhoeken vallen buiten beeld; alleen rechtsonder blijft rond.
    rounded_panel(rgb, -20, -20, 220, 174, 20, background, 0.96);
    let clock_epoch = if options.transition.is_none() && !options.still {
        loop_clock_epoch(epoch)
    } else {
        epoch
    };
    let (clock, _) = clock_text(clock_epoch);
    let date = clock_date(clock_epoch);
    let content_left = 16.0;
    if let Some(transition) = options.transition {
        draw_clock(
            text,
            rgb,
            epoch,
            content_left,
            clock_color,
            transition,
            options.still,
        );
    } else {
        text.draw(rgb, &clock, (content_left, 67), 58, clock_color, None);
    }
    text.draw(rgb, &date, (content_left, 103), 30, clock_color, None);
    text.draw(
        rgb,
        "Regenradar",
        (content_left, 139),
        30,
        clock_color,
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
