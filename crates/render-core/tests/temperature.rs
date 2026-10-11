use render_core::{
    constants::constants,
    field::Field,
    field_palette::Palette,
    field_raster,
    mode_constants::mode_constants,
    projection::{Grid, Projection},
};
use serde::Deserialize;

#[derive(Deserialize)]
struct Range {
    low: f64,
    high: f64,
}
#[derive(Deserialize)]
struct Fixture {
    min: f64,
    max: f64,
    range: Range,
    colors: Vec<[f64; 3]>,
}
#[derive(Deserialize)]
struct Fixtures {
    palette_fixtures: Vec<Fixture>,
}

#[test]
fn temperature_bands_and_cold_warm_anchors_follow_the_typescript_palette() {
    let fixtures: Fixtures =
        serde_json::from_str(include_str!("../assets/mode-constants.json")).unwrap();
    for fixture in fixtures.palette_fixtures {
        let palette = Palette::new(fixture.min, fixture.max).unwrap();
        assert_eq!(palette.low, fixture.range.low);
        assert_eq!(palette.high, fixture.range.high);
        for (index, expected) in fixture.colors.iter().enumerate() {
            let actual = palette.color(index as f64 - 30.0 + 0.5);
            for channel in 0..3 {
                assert!((actual[channel] - expected[channel]).abs() < 1e-12);
            }
        }
    }
    assert!(Palette::new(f64::NAN, 20.0).is_none());
    assert!(Palette::new(20.0, 10.0).is_none());
}

#[test]
fn uniform_temperature_paints_the_expected_band_and_preserves_no_data() {
    let grid = Grid {
        x0: 0.0,
        y0: 8_000_000.0,
        dx: 100_000.0,
        dy: -100_000.0,
        width: 20,
        height: 20,
    };
    let projection = Projection::new(&grid);
    let palette = Palette::new(0.0, 16.0).unwrap();
    let colors = palette.bands();
    let size = &constants().size;
    let background = 120;
    let mut rgb = vec![background; size.width * size.height * 3];
    let field = Field::prepare(
        vec![8.5; grid.width * grid.height],
        grid.width,
        grid.height,
        0,
    );
    field_raster::fill(&mut rgb, &field, &projection, &colors, &[], 1.0);
    let opacity = mode_constants().isoline.fill_opacity as f32;
    let alpha = (opacity * 255.0).round();
    let color = palette.color(8.5);
    for point in [[0, 0], [480, 636], [959, 1271]] {
        let offset = (point[1] * size.width + point[0]) * 3;
        for channel in 0..3 {
            let paint = (color[channel] as f32 * 255.0 * opacity).round();
            let expected = (background as f32 * (1.0 - alpha / 255.0) + paint).round() as u8;
            assert!(rgb[offset + channel].abs_diff(expected) <= 1);
        }
    }
    let original = vec![background; rgb.len()];
    for (field, opacity) in [
        (Field::prepare(vec![f32::NAN; 400], 20, 20, 0), 1.0),
        (field, 0.0),
    ] {
        let mut rgb = original.clone();
        field_raster::fill(&mut rgb, &field, &projection, &colors, &[], opacity);
        assert_eq!(rgb, original);
    }
}
