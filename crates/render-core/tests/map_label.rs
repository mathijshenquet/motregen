//! Kaartregime (U107): de schijfregel en de plekken komen uit `map-labels.ts`/`map-places.ts`; Rust rekent ze na.

use render_core::mode_constants::{disc_radius, mode_constants};

#[test]
fn disc_radius_matches_the_app() {
    let settings = &mode_constants().map_label;
    assert!(!settings.disc_fixture.is_empty());
    for case in &settings.disc_fixture {
        let radius = disc_radius(&case.label, settings.size);
        assert!(
            (radius - case.radius).abs() < 1e-9,
            "{}: {radius} != {}",
            case.label,
            case.radius
        );
    }
}

#[test]
fn numbers_use_the_shared_places_and_ladder() {
    let settings = &mode_constants().map_label;
    assert!(
        settings.places.len() >= 20,
        "plekken bij de botzoom: {}",
        settings.places.len()
    );
    assert_eq!(settings.ladder[0], [0.0, 0.0]);
    assert_eq!(settings.temperature_offset, 0.5);
}
