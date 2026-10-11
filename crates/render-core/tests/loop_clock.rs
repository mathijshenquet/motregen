use render_core::{
    constants::constants,
    overlay::{CLOCK_PANEL_TOP, ClockOptions, draw_overlay, draw_overlay_title},
    text::Text,
    time::{clock_date, clock_text, epoch, loop_clock_epoch, loop_clock_text},
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

#[test]
fn clock_date_follows_local_calendar_and_rounded_loop_time() {
    for (time, date) in [
        ("2026-09-23T13:30:00Z", "wo 23 sep"),
        ("2023-10-11T13:30:00Z", "wo 11 okt"),
        ("2026-10-10T22:00:00Z", "zo 11 okt"),
        ("2026-03-29T01:00:00Z", "zo 29 mrt"),
        ("2026-10-25T01:00:00Z", "zo 25 okt"),
        ("2026-12-31T23:00:00Z", "vr 1 jan"),
    ] {
        assert_eq!(clock_date(epoch(time).unwrap()), date);
    }
    let before_midnight = epoch("2026-09-30T21:58:20Z").unwrap();
    assert_eq!(clock_date(before_midnight), "wo 30 sep");
    assert_eq!(loop_clock_text(before_midnight), ("00:00".into(), "do"));
    assert_eq!(clock_date(loop_clock_epoch(before_midnight)), "do 1 okt");
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
    let panel_pixel = ((CLOCK_PANEL_TOP as usize + 80) * constants().size.width + 180) * 3;
    assert_ne!(
        &history[panel_pixel..panel_pixel + 3],
        &forecast[panel_pixel..panel_pixel + 3]
    );
}

#[test]
fn clock_leaves_the_badge_band_clear_and_rounds_both_right_corners() {
    let size = &constants().size;
    let top = CLOCK_PANEL_TOP as usize;
    let time = epoch("2026-10-11T04:01:40Z").unwrap();
    for night in [false, true] {
        for transition in [None, render_core::clock::CLOCK_TRANSITION] {
            for still in [false, true] {
                for title in ["Regenradar", "Wind", "Gevoelstemperatuur"] {
                    let mut text = Text::new().unwrap();
                    let mut rgb = vec![25; size.width * size.height * 3];
                    let bounds = render_core::overlay::clock_panel_bounds(&mut text, title);
                    draw_overlay_title(
                        &mut text,
                        &mut rgb,
                        (time, time + 3_600_000),
                        night,
                        ClockOptions { transition, still },
                        title,
                    );
                    assert!(rgb[..top * size.width * 3].iter().all(|&pixel| pixel == 25));
                    let pixel = |x: usize, y: usize| {
                        &rgb[(y * size.width + x) * 3..(y * size.width + x + 1) * 3]
                    };
                    let right = bounds[2] as usize - 1;
                    let bottom = bounds[3] as usize - 1;
                    assert_ne!(pixel(0, top), [25; 3]);
                    assert_ne!(pixel(0, bottom), [25; 3]);
                    assert_eq!(pixel(right, top), [25; 3]);
                    assert_eq!(pixel(right, bottom), [25; 3]);
                    assert_ne!(pixel(right, top + 20), [25; 3]);
                }
            }
        }
    }
}
