use render_core::{
    constants::constants,
    overlay::{ClockOptions, draw_overlay},
    text::Text,
    time::{clock_text, epoch, loop_clock_text},
};

#[test]
fn loop_clock_follows_the_nearest_five_minute_pattern() {
    let now = epoch("2026-10-11T05:00:00Z").unwrap();
    let clocks: Vec<_> = constants()
        .loop_offsets
        .iter()
        .map(|offset| loop_clock_text(now + offset).0)
        .collect();
    assert_eq!(
        &clocks[..6],
        &["06:00", "06:00", "06:05", "06:05", "06:05", "06:10"]
    );
    for (index, clock) in clocks.iter().enumerate() {
        let minutes = (index + 1) / 3 * 5;
        assert_eq!(
            *clock,
            format!("{:02}:{:02}", 6 + minutes / 60, minutes % 60)
        );
    }
}

#[test]
fn rounding_handles_half_steps_midnight_and_dst() {
    let start = epoch("2026-10-11T04:00:00Z").unwrap();
    assert_eq!(loop_clock_text(start + 149_999).0, "06:00");
    assert_eq!(loop_clock_text(start + 150_000).0, "06:05");
    for (time, clock, day) in [
        ("2026-10-10T21:58:20Z", "00:00", "zo"),
        ("2026-03-29T00:58:20Z", "03:00", "zo"),
        ("2026-10-25T00:58:20Z", "02:00", "zo"),
    ] {
        assert_eq!(loop_clock_text(epoch(time).unwrap()), (clock.into(), day));
    }
}

fn overlay(time: i64, now: i64, still: bool) -> Vec<u8> {
    let mut rgb = vec![25; constants().size.width * constants().size.height * 3];
    draw_overlay(
        &mut Text::new().unwrap(),
        &mut rgb,
        time,
        now,
        false,
        ClockOptions {
            transition: None,
            still,
        },
    );
    rgb
}

#[test]
fn overlay_rounds_loop_text_but_keeps_still_time_and_actual_history_theme() {
    let start = epoch("2026-10-11T04:00:00Z").unwrap();
    let frames: Vec<_> = (0..6)
        .map(|index| overlay(start + index * 100_000, start - 3_600_000, false))
        .collect();
    assert_eq!(frames[0], frames[1]);
    assert_eq!(frames[2], frames[3]);
    assert_eq!(frames[3], frames[4]);
    assert_ne!(frames[1], frames[2]);
    assert_ne!(frames[4], frames[5]);
    let own_time = start + 60_000;
    assert_eq!(clock_text(own_time).0, "06:01");
    assert_ne!(overlay(own_time, start - 3_600_000, true), frames[0]);
    assert_eq!(overlay(own_time, start - 3_600_000, false), frames[0]);
    let history = overlay(start, start, false);
    let forecast = overlay(start + 100_000, start, false);
    let panel_pixel = (80 * constants().size.width + 40) * 3;
    assert_ne!(
        &history[panel_pixel..panel_pixel + 3],
        &forecast[panel_pixel..panel_pixel + 3]
    );
}
