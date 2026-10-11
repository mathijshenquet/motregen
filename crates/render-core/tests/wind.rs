use render_core::{
    constants::constants,
    mode_constants::mode_constants,
    projection::Grid,
    strokes::stroke,
    wind::{self, Water, WindField},
};

#[test]
fn narrow_row_bounds_preserve_stroke_coverage_and_tail_decay() {
    let size = &constants().size;
    for (start, end) in [
        ([20.2, 40.8], [250.7, 280.2]),
        ([250.7, 40.8], [20.2, 280.2]),
        ([250.7, 280.2], [20.2, 40.8]),
        ([20.2, 280.2], [250.7, 40.8]),
        ([40.2, 40.8], [40.2, 280.2]),
        ([40.2, 40.8], [280.2, 40.8]),
        ([-100.2, -30.8], [280.2, 40.8]),
        ([20.2, 40.8], [20.2, 40.8]),
        ([900.2, 1200.8], [1100.2, 1400.8]),
    ] {
        for width in [0.7, 2.25, 8.0] {
            let mut actual = vec![210; size.width * size.height * 3];
            let mut expected = actual.clone();
            let color = [30, 90, 150];
            let opacity = |behind: f64, coverage: f64| coverage * (-behind / 80.0).exp();
            stroke(&mut actual, start, end, width, color, opacity);
            let delta = [end[0] - start[0], end[1] - start[1]];
            let squared = (delta[0] * delta[0] + delta[1] * delta[1]).max(1e-12);
            for row in 0..size.height {
                for column in 0..size.width {
                    let along = (((column as f64 + 0.5 - start[0]) * delta[0]
                        + (row as f64 + 0.5 - start[1]) * delta[1])
                        / squared)
                        .clamp(0.0, 1.0);
                    let distance = (column as f64 + 0.5 - start[0] - along * delta[0])
                        .hypot(row as f64 + 0.5 - start[1] - along * delta[1]);
                    let alpha = opacity(
                        (1.0 - along) * squared.sqrt(),
                        (width / 2.0 + 0.5 - distance).clamp(0.0, 1.0),
                    );
                    let index = (row * size.width + column) * 3;
                    for channel in 0..3 {
                        expected[index + channel] = (210.0 * (1.0 - alpha)
                            + f64::from(color[channel]) * alpha)
                            .round() as u8;
                    }
                }
            }
            assert_eq!(actual, expected, "{start:?} -> {end:?}, width {width}");
        }
    }
}

#[test]
fn uniform_wind_preserves_count_direction_missing_values_and_sea_damping() {
    let grid = Grid {
        x0: 0.0,
        y0: 8_000_000.0,
        dx: 100_000.0,
        dy: -100_000.0,
        width: 20,
        height: 20,
    };
    let values = vec![0; grid.width * grid.height];
    let render = |east: Option<f32>, north: Option<f32>, sea: u8| {
        let east_quant = [east];
        let north_quant = [north];
        let field = |quant| WindField {
            grid: &grid,
            left: &values,
            right: &values,
            left_quant: quant,
            right_quant: quant,
            mix: 0.5,
        };
        let mut rgb = vec![255; constants().size.width * constants().size.height * 3];
        let stats = wind::draw(
            &mut rgb,
            field(&east_quant),
            field(&north_quant),
            10.0,
            false,
            Water {
                width: 1,
                height: 1,
                alpha: &[sea],
            },
        );
        let ink: u64 = rgb.iter().map(|&channel| u64::from(255 - channel)).sum();
        (stats, ink)
    };
    let (land, land_ink) = render(Some(6.0), Some(8.0), 0);
    assert_eq!(land.particles, mode_constants().wind.count);
    assert!(land.strokes >= land.particles);
    assert!((land.direction[0] / land.particles as f64 - 0.6).abs() < 1e-12);
    assert!((land.direction[1] / land.particles as f64 + 0.8).abs() < 1e-12);
    let (sea, sea_ink) = render(Some(6.0), Some(8.0), 255);
    assert_eq!(sea.particles, land.particles);
    assert!(sea_ink > 0 && sea_ink < land_ink);
    assert_eq!(render(None, Some(8.0), 0).0.particles, 0);
    assert_eq!(render(Some(0.0), Some(0.0), 0).1, 0);
    assert_ne!(wind::color(10.0, false), wind::color(10.0, true));
}
