use render_core::{
    contours::{self, Contour},
    field::Field,
    isoline_labels::{Labels, Placement, Screen},
    mode_constants::mode_constants,
    pressure,
    projection::{Grid, Projection},
};
use serde::Deserialize;

#[derive(Deserialize)]
struct Input {
    grid: Grid,
    raw: Vec<Option<f32>>,
    kind: String,
    step: f64,
}
#[derive(Deserialize)]
struct Prepared {
    values: Vec<f32>,
    valid: Vec<f32>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Label {
    text: String,
    screen_x: f64,
    screen_y: f64,
    angle: f64,
    opacity: f64,
}
#[derive(Deserialize)]
struct Fixture {
    prepared: Prepared,
    tolerance: f64,
    contours: Vec<Contour>,
    labels: Vec<Label>,
}
#[derive(Deserialize)]
struct Fixtures {
    inputs: Vec<Input>,
    fixtures: Vec<Fixture>,
}

#[test]
fn real_fields_contours_and_label_anchors_follow_typescript() {
    let fixtures: Fixtures =
        serde_json::from_str(include_str!("../assets/isoline-fixtures.json")).unwrap();
    for (input, fixture) in fixtures.inputs.iter().zip(&fixtures.fixtures) {
        let pressure = input.kind == "pressure";
        let passes = if pressure {
            mode_constants().isoline.pressure_blur
        } else {
            mode_constants().isoline.temperature_blur
        };
        let field = Field::prepare(
            input
                .raw
                .iter()
                .map(|value| value.unwrap_or(f32::NAN))
                .collect(),
            input.grid.width,
            input.grid.height,
            passes,
        );
        assert_eq!(field.values, fixture.prepared.values, "field values");
        assert_eq!(field.valid, fixture.prepared.valid, "field validity");
        let contours = contours::trace(&field, &input.grid, input.step, fixture.tolerance);
        assert_eq!(contours.len(), fixture.contours.len(), "contour count");
        for (actual, expected) in contours.iter().zip(&fixture.contours) {
            assert_eq!(actual.level, expected.level);
            assert_eq!(actual.closed, expected.closed);
            assert_eq!(actual.points.len(), expected.points.len());
            for (actual, expected) in actual.points.iter().zip(&expected.points) {
                assert!(
                    (actual[0] - expected[0]).hypot(actual[1] - expected[1]) < 0.00001,
                    "{actual:?} != {expected:?}"
                );
            }
            assert!((actual.length_km - expected.length_km).abs() < 0.001);
        }
        let lines = contours::label_lines(&field, &input.grid, input.step, 60.0);
        let projection = Projection::new(&input.grid);
        let pixels_x = 1.0 / (projection.columns[1] - projection.columns[0]);
        let pixels_y = 1.0 / (projection.rows[1] - projection.rows[0]);
        let screen = Screen {
            origin: [
                0.5 - projection.columns[0] * pixels_x,
                0.5 - projection.rows[0] * pixels_y,
            ],
            pixels_per_cell: [pixels_x, pixels_y],
            width: 960.0,
            height: 1272.0,
            scale: 1.5,
        };
        let labels = Labels::default().place(Placement {
            field: &field,
            lines: &lines,
            contours: &contours,
            screen,
            step: input.step,
            key: 0,
            pressure,
            opacity: 1.0,
        });
        assert_eq!(labels.len(), fixture.labels.len(), "label count");
        for (actual, expected) in labels.iter().zip(&fixture.labels) {
            assert_eq!(actual.text, expected.text);
            assert!(
                (actual.screen[0] - expected.screen_x).abs() <= 1.5
                    && (actual.screen[1] - expected.screen_y).abs() <= 1.5,
                "label location {actual:?}"
            );
            assert!((actual.angle - expected.angle).abs() < 0.1);
            assert!((actual.opacity - expected.opacity).abs() < 0.0001);
            assert!(
                (field.sample(actual.point[0], actual.point[1]).value - actual.level).abs()
                    < input.step * 0.1
            );
        }
    }
}

#[test]
fn pressure_letters_require_a_complete_prominent_extremum() {
    let width = 15;
    let high: Vec<_> = (0..width * width)
        .map(|index| 1020.0 - ((index % width) as f32 - 7.0).hypot((index / width) as f32 - 7.0))
        .collect();
    let field = Field::prepare(high, width, width, 0);
    let marks = pressure::extrema(&field, 3, 2.0);
    assert_eq!(marks.len(), 1);
    assert_eq!(
        (marks[0].kind, marks[0].column, marks[0].row),
        ('H', 7.0, 7.0)
    );
    let mut low = field.clone();
    for value in &mut low.values {
        *value = 2040.0 - *value;
    }
    assert_eq!(pressure::extrema(&low, 3, 2.0)[0].kind, 'L');
    low.valid[6 * width + 6] = 0.0;
    assert!(pressure::extrema(&low, 3, 2.0).is_empty());
    assert!(
        pressure::extrema(
            &Field::prepare(vec![1020.0; width * width], width, width, 0),
            3,
            2.0
        )
        .is_empty()
    );
}
