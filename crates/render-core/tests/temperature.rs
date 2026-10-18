use render_core::{
    constants::constants,
    field::Field,
    field_palette::Palette,
    field_raster::{self, LineColor},
    mode_constants::mode_constants,
    projection::{Grid, Projection},
};
use serde::Deserialize;

#[derive(Deserialize)]
struct Range {
    low: f64,
    high: f64,
    overflow: bool,
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
        let palette = if fixture.range.overflow {
            palette.with_overflow()
        } else {
            palette
        };
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
    for point in [
        [0, 0],
        [size.width / 2, size.height / 2],
        [size.width - 1, size.height - 1],
    ] {
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

#[test]
fn isotherms_take_the_darkened_fill_color_and_fall_back_where_there_is_no_fill() {
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
    let settings = &mode_constants().isoline;
    let line_alpha = (settings.temperature_line_fill_opacity * settings.line_profile.alpha) as f32;
    let shade = settings.temperature_line_fill_shade;
    let row = size.height / 2;
    let center = row as f32 + 0.5;
    let segment = [100.0, center, 300.0, center, 1.0, 1.0];
    let fallback = [10, 20, 30];
    let band = palette.color(8.5);
    let darkened_band = band.map(|channel| ((channel * shade).min(1.0) * 255.0) as f32);
    for (value, expected_line) in [(8.5, darkened_band), (f32::NAN, fallback.map(f32::from))] {
        let mut rgb = vec![120; size.width * size.height * 3];
        let field = Field::prepare(vec![value; grid.width * grid.height], 20, 20, 0);
        let fill = field_raster::fill(&mut rgb, &field, &projection, &colors, &[], 1.0);
        let filled = rgb.clone();
        let line = LineColor::Isotherm {
            fallback,
            fill: &fill,
        };
        field_raster::lines(&mut rgb, &segment, line, 1.0);
        let offset = (row * size.width + 200) * 3;
        for channel in 0..3 {
            let under = filled[offset + channel] as f32;
            let expected =
                (under * (1.0 - line_alpha) + expected_line[channel] * line_alpha).round();
            assert!(
                rgb[offset + channel].abs_diff(expected as u8) <= 1,
                "kanaal {channel}: {} tegen {expected}",
                rgb[offset + channel]
            );
        }
    }
}
