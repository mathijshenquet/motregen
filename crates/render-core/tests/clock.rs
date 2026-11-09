use render_core::{
    clock::{ClockTransition, clock_state, clock_width, draw_clock},
    constants::constants,
    text::Text,
    time::epoch,
};

const VARIANTS: [ClockTransition; 2] = [ClockTransition::Schuif, ClockTransition::Klap];

#[test]
fn slide_keeps_first_tick_and_advances_last_tick_without_changing_other_transitions() {
    let slide = ClockTransition::Schuif;
    for (phase, position) in [
        (0.0, 0.0),
        (1.0 / 3.0, 1.0 / 6.0),
        (2.0 / 3.0, 15.0 / 16.0),
        (1.0, 1.0),
    ] {
        assert!((slide.animation_progress(phase) - position).abs() < 1e-6);
        assert_eq!(ClockTransition::Klap.animation_progress(phase), phase);
    }
    let positions: Vec<_> = (0..=100)
        .map(|step| slide.animation_progress(step as f32 / 100.0))
        .collect();
    assert!(positions.windows(2).all(|pair| pair[0] < pair[1]));
}

fn render(epoch: i64, variant: ClockTransition, still: bool) -> Vec<u8> {
    render_at(epoch, variant, still, 0)
}

fn render_at(epoch: i64, variant: ClockTransition, still: bool, top: i32) -> Vec<u8> {
    let size = &constants().size;
    let mut rgb = vec![25; size.width * size.height * 3];
    draw_clock(
        &mut Text::new().unwrap(),
        &mut rgb,
        epoch,
        (100.0, top),
        [240; 3],
        variant,
        still,
    );
    rgb
}

#[test]
fn moving_clock_translates_digits_colon_and_animation_together() {
    let size = &constants().size;
    let top = render_core::overlay::CLOCK_PANEL_TOP as usize;
    let row_bytes = size.width * 3;
    let start = epoch("2026-10-11T04:55:00Z").unwrap();
    for variant in VARIANTS {
        for (offset, still) in [
            (0, false),
            (100_000, false),
            (200_000, false),
            (60_000, true),
        ] {
            let original = render(start + offset, variant, still);
            let moved = render_at(start + offset, variant, still, top as i32);
            assert!(moved[..top * row_bytes].iter().all(|&pixel| pixel == 25));
            assert_eq!(
                &moved[top * row_bytes..],
                &original[..(size.height - top) * row_bytes],
                "{variant:?} offset={offset}, still={still}"
            );
        }
    }
}

#[test]
fn transitions_follow_five_minute_times_and_only_changed_digits() {
    for (start, from, to, changed) in [
        ("2026-10-11T04:00:00Z", "06:00", "06:05", 1),
        ("2026-10-11T04:05:00Z", "06:05", "06:10", 2),
        ("2026-10-11T04:55:00Z", "06:55", "07:00", 3),
        ("2026-10-11T20:55:00Z", "22:55", "23:00", 3),
        ("2026-10-11T21:55:00Z", "23:55", "00:00", 4),
    ] {
        let start = epoch(start).unwrap();
        for (offset, phase) in [(0, 0.0), (100_000, 1.0 / 3.0), (200_000, 2.0 / 3.0)] {
            let state = clock_state(start + offset);
            assert_eq!(state.from, from);
            assert_eq!(state.to, to);
            assert!((state.progress - phase).abs() < 1e-6);
            assert_eq!(
                state
                    .from
                    .chars()
                    .zip(state.to.chars())
                    .filter(|(a, b)| a != b)
                    .count(),
                changed
            );
        }
        assert_eq!(clock_state(start + 300_000).from, to);
    }
    for (start, from, to) in [
        ("2026-03-29T00:55:00Z", "01:55", "03:00"),
        ("2026-10-25T00:55:00Z", "02:55", "02:00"),
    ] {
        let state = clock_state(epoch(start).unwrap() + 200_000);
        assert_eq!((state.from.as_str(), state.to.as_str()), (from, to));
    }
}

#[test]
fn digit_animation_keeps_unchanged_columns_and_clips_vertically() {
    let start = epoch("2026-10-11T04:55:00Z").unwrap();
    let original = render(start, ClockTransition::Schuif, false);
    let mut text = Text::new().unwrap();
    let digit_width = ((clock_width(&mut text) - text.width(":", 58)) / 4.0).round() as usize;
    let colon_width = text.width(":", 58);
    let changed_ranges = [
        (100 + digit_width, 100 + digit_width * 2),
        (
            (100.0 + digit_width as f32 * 2.0 + colon_width).round() as usize,
            (100.0 + digit_width as f32 * 4.0 + colon_width).round() as usize,
        ),
    ];
    for variant in VARIANTS {
        assert_eq!(render(start, variant, false), original);
        assert_eq!(
            render(start + 300_000, variant, false),
            render(start + 300_000, ClockTransition::Schuif, false)
        );
        for offset in [100_000, 200_000] {
            let animated = render(start + offset, variant, false);
            assert_ne!(animated, original);
            for (index, (before, after)) in original
                .chunks_exact(3)
                .zip(animated.chunks_exact(3))
                .enumerate()
            {
                let x = index % constants().size.width;
                let y = index / constants().size.width;
                if !(15..71).contains(&y)
                    || !changed_ranges
                        .iter()
                        .any(|&(left, right)| (left..right).contains(&x))
                {
                    assert_eq!(
                        before, after,
                        "{variant:?} changed an unchanged cell at {x},{y}"
                    );
                }
            }
        }
    }
    assert_ne!(
        render(start + 100_000, VARIANTS[0], false),
        render(start + 100_000, VARIANTS[1], false)
    );
}

#[test]
fn stills_show_their_exact_time_even_off_a_five_minute_boundary() {
    let time = epoch("2026-10-11T04:01:00Z").unwrap();
    let still = render(time, ClockTransition::Schuif, true);
    assert_ne!(still, render(time - 60_000, ClockTransition::Schuif, true));
    for variant in VARIANTS {
        assert_eq!(render(time, variant, true), still);
        assert_ne!(render(time, variant, false), still);
    }
}
