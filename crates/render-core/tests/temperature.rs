use render_core::{
    constants::constants,
    field::Field,
    field_palette::Palette,
    field_raster::{self, LineColor},
    mode_constants::mode_constants,
    name_mask::NameMask,
    projection::{Grid, Projection},
    temperature::{TemperaturePair, draw_temperature},
    text::Text,
};
use serde::Deserialize;

#[derive(Deserialize)]
struct Fixtures {
    palette_fixture: Vec<[f64; 3]>,
}

#[test]
fn temperature_bands_follow_the_fixed_typescript_scale() {
    let fixtures: Fixtures =
        serde_json::from_str(include_str!("../assets/mode-constants.json")).unwrap();
    let palette = Palette::fixed();
    for (index, expected) in fixtures.palette_fixture.iter().enumerate() {
        let actual = palette.color(index as f64 - 30.0 + 0.5);
        for channel in 0..3 {
            assert!((actual[channel] - expected[channel]).abs() < 1e-12);
        }
    }
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
    let palette = Palette::fixed();
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
    let palette = Palette::fixed();
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
            shade: mode_constants().isoline.temperature_line_fill_shade,
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

/// Draws a uniform 6° over the whole map with the given name mask and returns the frame (U103).
fn place_labels(names: &NameMask) -> Vec<u8> {
    let grid = Grid {
        x0: 0.0,
        y0: 8_000_000.0,
        dx: 100_000.0,
        dy: -100_000.0,
        width: 20,
        height: 20,
    };
    let projection = Projection::new(&grid);
    let size = &constants().size;
    let values = vec![0; grid.width * grid.height];
    let quant = [Some(6.0)];
    let mut rgb = vec![120; size.width * size.height * 3];
    draw_temperature(
        &mut Text::new().unwrap(),
        &mut rgb,
        &projection,
        names,
        TemperaturePair {
            left_grid: &grid,
            right_grid: &grid,
            left: &values,
            right: &values,
            left_quant: &quant,
            right_quant: &quant,
            mix: 0.0,
        },
        false,
    );
    rgb
}

fn has_ink(rgb: &[u8], columns: std::ops::Range<usize>, rows: std::ops::Range<usize>) -> bool {
    let width = constants().size.width;
    rows.flat_map(|row| {
        columns
            .clone()
            .map(move |column| (row * width + column) * 3)
    })
    .any(|offset| rgb[offset..offset + 3] != [120, 120, 120])
}

#[test]
fn temperature_labels_move_below_a_basemap_name_or_drop_when_nothing_is_free() {
    let size = &constants().size;
    let place = &constants().places[0];
    let grid = Grid {
        x0: 0.0,
        y0: 8_000_000.0,
        dx: 100_000.0,
        dy: -100_000.0,
        width: 20,
        height: 20,
    };
    let (x, y) = Projection::new(&grid).point(place.lng, place.lat);
    let (x, y) = (x.round() as usize, y.round() as usize);
    let above = (x - 15..x + 15, y - 45..y - 35);
    let below = (x - 15..x + 15, y + 40..y + 50);

    let free = place_labels(&NameMask::empty());
    assert!(
        has_ink(&free, above.0.clone(), above.1.clone()),
        "default above the place"
    );
    assert!(!has_ink(&free, below.0.clone(), below.1.clone()));

    // A name right above the place, as "Drenthe" sat above Emmen.
    let mut luma = vec![0; size.width * size.height];
    for row in y - 70..y - 30 {
        luma[row * size.width + x - 80..row * size.width + x + 80].fill(255);
    }
    let named = place_labels(&NameMask::new(size.width, size.height, &luma));
    assert!(
        !has_ink(&named, above.0.clone(), above.1.clone()),
        "kept off the name"
    );
    assert!(has_ink(&named, below.0, below.1), "moved below the place");

    let everywhere = vec![255; size.width * size.height];
    let crowded = place_labels(&NameMask::new(size.width, size.height, &everywhere));
    assert!(
        crowded.iter().all(|&channel| channel == 120),
        "dropped, names stay readable"
    );
}
