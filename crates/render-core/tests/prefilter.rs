#[path = "support/reference_sampling.rs"]
mod reference;

use render_core::{
    composition::{Composition, CoveragePair, compose, compose_covered},
    palette::composition_colors,
    sampling::{Coverage, Sampling},
};

#[test]
fn viewport_prefilter_and_bilinear_motion_match_the_round_one_kernel() {
    let width = 71;
    let height = 85;
    let colors = composition_colors(false);
    let sources: Vec<Vec<u8>> = [0, 1, 2]
        .map(|pattern| {
            (0..width * height)
                .map(|index| match pattern {
                    0 => ((index * 37 + index / width * 17) % 255) as u8,
                    1 if index % 7 < 2 => 255,
                    1 => ((index * 17) % 200) as u8,
                    _ if index % 29 == 0 => 180,
                    _ => 0,
                })
                .collect()
        })
        .into();
    for (taps, sigma) in [(5, 0.95), (7, 1.33), (9, 1.71), (11, 1.71)] {
        for cell_width in [1.0, 1.56, 3.25] {
            let sampling = Sampling {
                kind: 3,
                taps,
                cell_width,
                sigma,
            };
            let original = reference::Sampling {
                kind: 3,
                taps,
                cell_width,
                sigma,
            };
            for source in &sources {
                let full = original.filter(source.clone(), width, height);
                assert_eq!(sampling.filter(source.clone(), width, height), full);
                for (columns, rows) in [(0..17, 0..19), (13..57, 11..73), (53..71, 65..85)] {
                    let filtered = sampling.filter_region(
                        source,
                        width,
                        height,
                        columns.clone(),
                        rows.clone(),
                    );
                    let coverage = Coverage::new(&filtered, width, height);
                    for row in rows.clone() {
                        assert_eq!(
                            &filtered[row * width + columns.start..row * width + columns.end],
                            &full[row * width + columns.start..row * width + columns.end],
                        );
                    }
                    let positions: Vec<_> = (0..12)
                        .map(|index| {
                            (
                                columns.start as f64 + 2.5 + index as f64 * 0.4,
                                rows.start as f64 + 2.2 + index as f64 * 0.4,
                            )
                        })
                        .collect();
                    for (column, row) in positions {
                        for mix in [0.0, 0.17, 0.5, 0.83, 1.0] {
                            let motion = (1.3, -1.7);
                            let expected_value = reference::sample(
                                &full,
                                width,
                                height,
                                column - motion.0 * mix,
                                row - motion.1 * mix,
                            ) * (1.0 - mix)
                                + reference::sample(
                                    &full,
                                    width,
                                    height,
                                    column + motion.0 * (1.0 - mix),
                                    row + motion.1 * (1.0 - mix),
                                ) * mix;
                            let mut expected = [100, 150, 200];
                            if expected_value > 0.0 {
                                let color =
                                    colors[((expected_value * 256.0).round() as usize).min(65_535)];
                                for channel in 0..3 {
                                    expected[channel] = (color[channel] as f64
                                        + expected[channel] as f64 * color[3] as f64)
                                        .round()
                                        .clamp(0.0, 255.0)
                                        as u8;
                                }
                            }
                            let mut actual = [100, 150, 200];
                            compose(
                                &mut actual,
                                Composition {
                                    columns: &[column],
                                    rows: &[row],
                                    grid_width: width,
                                    grid_height: height,
                                    left: &filtered,
                                    right: &filtered,
                                    mix,
                                    colors: &colors,
                                    displacements: Some(&[motion]),
                                    multiply: false,
                                },
                            );
                            assert_eq!(actual, expected);
                            let mut culled = [100, 150, 200];
                            compose_covered(
                                &mut culled,
                                Composition {
                                    columns: &[column],
                                    rows: &[row],
                                    grid_width: width,
                                    grid_height: height,
                                    left: &filtered,
                                    right: &filtered,
                                    mix,
                                    colors: &colors,
                                    displacements: Some(&[motion]),
                                    multiply: false,
                                },
                                Some(CoveragePair {
                                    left: &coverage,
                                    right: &coverage,
                                    displacement: 2.0,
                                }),
                            );
                            assert_eq!(culled, expected);
                        }
                    }
                }
            }
        }
    }
}

#[test]
fn skipping_motion_in_empty_tiles_preserves_every_composed_pixel() {
    use render_core::{motion::Motion, projection::Grid, rain::RainCompositor};
    let grid = Grid {
        x0: 0.0,
        y0: 7_600_000.0,
        dx: 1000.0,
        dy: -1000.0,
        width: 1250,
        height: 1350,
    };
    let compositor = RainCompositor::new(grid.clone());
    let columns = &compositor.projection.columns;
    let rows = &compositor.projection.rows;
    let center_column = columns[columns.len() / 2] as usize;
    let center_row = rows[rows.len() / 2] as usize;
    let mut left = vec![0; grid.width * grid.height];
    let mut right = left.clone();
    for row in center_row - 20..center_row + 20 {
        for column in center_column - 20..center_column + 20 {
            left[row * grid.width + column] = 100;
            right[(row + 5) * grid.width + column + 7] = 180;
        }
    }
    let left_coverage = Coverage::new(&left, grid.width, grid.height);
    let right_coverage = Coverage::new(&right, grid.width, grid.height);
    let vectors: Vec<i8> = (0..8 * 8 * 2)
        .map(|index| match index % 7 {
            0 => -128,
            1 => 100,
            2 => -100,
            3 => 50,
            4 => -50,
            5 => 15,
            _ => -12,
        })
        .collect();
    let motion = Motion {
        vectors: &vectors,
        width: 8,
        height: 8,
        interval: 5.0,
        cap: 15.0,
        fade: 30.0,
    };
    let coverage = CoveragePair {
        left: &left_coverage,
        right: &right_coverage,
        displacement: motion.cap,
    };
    let full_motion = compositor.project_motion(motion, None);
    let culled_motion = compositor.project_motion(motion, Some(coverage));
    let colors = composition_colors(false);
    for mix in [0.1, 0.5, 0.9] {
        let mut full = vec![150; columns.len() * rows.len() * 3];
        let mut culled = full.clone();
        let frame = Composition {
            columns,
            rows,
            grid_width: grid.width,
            grid_height: grid.height,
            left: &left,
            right: &right,
            mix,
            colors: &colors,
            displacements: Some(&full_motion),
            multiply: false,
        };
        compose(&mut full, frame);
        compose_covered(
            &mut culled,
            Composition {
                displacements: Some(&culled_motion),
                ..frame
            },
            Some(coverage),
        );
        assert_eq!(full, culled);
    }
}
