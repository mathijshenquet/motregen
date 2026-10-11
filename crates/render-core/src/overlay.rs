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

// MIP-32: 64 pixels op de 576-brede Telegram-screenshot, omgerekend naar 960 uitvoerpixels.
pub const CLOCK_PANEL_TOP: i32 = 107;

pub fn clock_panel_bounds(text: &mut Text, title: &str) -> [f64; 4] {
    [
        0.0,
        f64::from(CLOCK_PANEL_TOP),
        200.0_f64.max((text.width(title, 30) + 32.0).ceil() as f64),
        f64::from(CLOCK_PANEL_TOP + 154),
    ]
}

pub fn draw_overlay(
    text: &mut Text,
    rgb: &mut [u8],
    epoch: i64,
    now: i64,
    night: bool,
    options: ClockOptions,
) {
    draw_overlay_title(text, rgb, (epoch, now), night, options, "Regenradar");
}

pub fn draw_overlay_title(
    text: &mut Text,
    rgb: &mut [u8],
    times: (i64, i64),
    night: bool,
    options: ClockOptions,
    title: &str,
) {
    let (epoch, now) = times;
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
    // De linkerhoeken vallen buiten beeld; beide rechterhoeken blijven rond.
    let panel_width = clock_panel_bounds(text, title)[2] as i32 + 20;
    rounded_panel(
        rgb,
        -20,
        CLOCK_PANEL_TOP,
        panel_width,
        154,
        20,
        background,
        0.96,
    );
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
            (content_left, CLOCK_PANEL_TOP),
            clock_color,
            transition,
            options.still,
        );
    } else {
        text.draw(
            rgb,
            &clock,
            (content_left, CLOCK_PANEL_TOP + 67),
            58,
            clock_color,
            None,
        );
    }
    text.draw(
        rgb,
        &date,
        (content_left, CLOCK_PANEL_TOP + 103),
        30,
        clock_color,
        None,
    );
    text.draw(
        rgb,
        title,
        (content_left, CLOCK_PANEL_TOP + 139),
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
