//! Gelijkheid met het Node-pad (U101): elke uitkomst in `windsock-fixtures.json` komt uit de TypeScript van de
//! app en de bot (`bot/render-windsock-fixtures.ts`) en moet hier op afronding na terugkomen.

use render_core::{
    projection::Grid,
    windsock::{self, Cut, Interleaved, Point, WindSlice, WindsockField},
};
use serde::Deserialize;

#[derive(Deserialize)]
struct Fixtures {
    size: Size,
    shapes: Vec<ShapeCase>,
    field: FieldFixture,
    flow: Vec<FlowCase>,
    motions: Vec<MotionCase>,
    reaches: Vec<ReachCase>,
    fills: Vec<FillCase>,
    beaufort: BeaufortCase,
}

#[derive(Deserialize)]
struct Size {
    width: usize,
    height: usize,
}

#[derive(Deserialize)]
struct ShapeFixture {
    left: Vec<Point>,
    right: Vec<Point>,
    axis: Vec<Point>,
    headings: Vec<f64>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct BadgeFixture {
    x: f64,
    y: f64,
    radius: f64,
    cut_radius: f64,
    font_px: f64,
}

#[derive(Deserialize)]
struct ShapeCase {
    strength: f64,
    headings: Vec<f64>,
    shape: ShapeFixture,
    band: Vec<Point>,
    inflated: Vec<Point>,
    badge: BadgeFixture,
    middle: BadgeFixture,
}

#[derive(Deserialize)]
struct SliceFixture {
    left: Vec<f32>,
    right: Vec<f32>,
    mix: f64,
}

#[derive(Deserialize)]
struct FieldFixture {
    grid: Grid,
    slices: Vec<SliceFixture>,
}

#[derive(Deserialize)]
struct FlowCase {
    x: f64,
    y: f64,
    wind: Option<[f64; 2]>,
    lagged: Option<[f64; 2]>,
    beide: Option<Vec<f64>>,
    stroom: Option<Vec<f64>>,
    traag: Option<Vec<f64>>,
}

#[derive(Deserialize)]
struct ReachSide {
    mast: Point,
    heading: f64,
    strength: f64,
    tails: Vec<Point>,
}

#[derive(Deserialize)]
struct ReachCase {
    a: ReachSide,
    b: ReachSide,
    clear: bool,
    clear_appear: bool,
}

#[derive(Deserialize)]
struct MotionCase {
    target: f64,
    force: f64,
    elapsed: f64,
    snap: bool,
    seconds: f64,
    moving: bool,
    heading: windsock::Spring,
    strength: windsock::Spring,
    wave: f64,
    bends: Vec<f64>,
}

#[derive(Deserialize)]
struct CutFixture {
    x: f64,
    y: f64,
    radius: f64,
}

#[derive(Deserialize)]
struct FillCase {
    points: Vec<Point>,
    cut: Option<CutFixture>,
    rgb: Vec<u8>,
}

#[derive(Deserialize)]
struct SpeedCase {
    speed: f64,
    scale: f64,
}

#[derive(Deserialize)]
struct BeaufortCase {
    speeds: Vec<SpeedCase>,
    east: Vec<u8>,
    north: Vec<u8>,
    quant: Vec<Option<f32>>,
    frame: Vec<u8>,
}

fn fixtures() -> Fixtures {
    serde_json::from_str(include_str!("../assets/windsock-fixtures.json"))
        .expect("windsock fixtures")
}

fn close(actual: f64, expected: f64, what: &str) {
    assert!(
        (actual - expected).abs() <= 1e-9 * expected.abs().max(1.0),
        "{what}: {actual} != {expected}"
    );
}

fn close_points(actual: &[Point], expected: &[Point], what: &str) {
    assert_eq!(actual.len(), expected.len(), "{what}: aantal punten");
    for (index, (actual, expected)) in actual.iter().zip(expected).enumerate() {
        close(actual[0], expected[0], &format!("{what}[{index}].x"));
        close(actual[1], expected[1], &format!("{what}[{index}].y"));
    }
}

fn close_list(actual: Option<Vec<f64>>, expected: &Option<Vec<f64>>, what: &str) {
    match (actual, expected) {
        (None, None) => {}
        (Some(actual), Some(expected)) => {
            assert_eq!(actual.len(), expected.len(), "{what}: lengte");
            for (index, (actual, expected)) in actual.iter().zip(expected).enumerate() {
                close(*actual, *expected, &format!("{what}[{index}]"));
            }
        }
        (actual, expected) => panic!("{what}: {:?} != {:?}", actual.is_some(), expected.is_some()),
    }
}

#[test]
fn shape_band_outline_and_badge_match_the_app() {
    for case in fixtures().shapes {
        let shape = windsock::shape(case.strength, &case.headings);
        close_points(&shape.left, &case.shape.left, "links");
        close_points(&shape.right, &case.shape.right, "rechts");
        close_points(&shape.axis, &case.shape.axis, "as");
        close_list(
            Some(shape.headings.clone()),
            &Some(case.shape.headings.clone()),
            "koers",
        );
        close_points(&windsock::band(&shape, 2), &case.band, "band");
        close_points(&windsock::inflated(&shape, 1.6), &case.inflated, "rand");
        for (badge, expected) in [
            (windsock::badge(&shape, true, "12"), &case.badge),
            (windsock::badge(&shape, false, "104"), &case.middle),
        ] {
            close(badge.center[0], expected.x, "badge x");
            close(badge.center[1], expected.y, "badge y");
            close(badge.radius, expected.radius, "badge straal");
            close(badge.cut_radius, expected.cut_radius, "uitsparing");
            close(badge.font_px, expected.font_px, "letter");
        }
    }
}

#[test]
fn sampling_streamline_and_lag_match_the_app() {
    let fixtures = fixtures();
    let vectors: Vec<_> = fixtures
        .field
        .slices
        .iter()
        .map(|slice| {
            (
                Interleaved(&slice.left),
                Interleaved(&slice.right),
                slice.mix,
            )
        })
        .collect();
    let slice = |index: usize| WindSlice {
        left: &vectors[index].0,
        right: &vectors[index].1,
        mix: vectors[index].2,
    };
    let field = WindsockField {
        grid: &fixtures.field.grid,
        slices: [slice(0), slice(1), slice(2)],
    };
    for case in &fixtures.flow {
        let as_list = |value: Option<[f64; 2]>| value.map(|value| value.to_vec());
        close_list(
            as_list(windsock::sample(&field, 0, case.x, case.y)),
            &case.wind.map(|value| value.to_vec()),
            "wind",
        );
        close_list(
            as_list(windsock::sample(&field, 2, case.x, case.y)),
            &case.lagged.map(|value| value.to_vec()),
            "eerder",
        );
        close_list(
            windsock::headings(&field, case.x, case.y, true, true),
            &case.beide,
            "beide",
        );
        close_list(
            windsock::headings(&field, case.x, case.y, true, false),
            &case.stroom,
            "stroom",
        );
        close_list(
            windsock::headings(&field, case.x, case.y, false, true),
            &case.traag,
            "traag",
        );
    }
}

#[test]
fn sock_reach_and_overlap_test_match_the_app() {
    for (index, case) in fixtures().reaches.into_iter().enumerate() {
        let reach = |side: &ReachSide| windsock::sock_reach(side.mast, side.heading, side.strength);
        let (a, b) = (reach(&case.a), reach(&case.b));
        close_points(
            &a.tails,
            &case.a.tails,
            &format!("geval {index}: staarten a"),
        );
        close_points(
            &b.tails,
            &case.b.tails,
            &format!("geval {index}: staarten b"),
        );
        assert_eq!(
            windsock::socks_clear(&a, &b, 1.0),
            case.clear,
            "geval {index}: vrij"
        );
        assert_eq!(
            windsock::socks_clear(&a, &b, 1.15),
            case.clear_appear,
            "geval {index}: vrij met marge"
        );
    }
}

#[test]
fn momentum_and_sway_match_the_app_frame_by_frame() {
    let mut motion = windsock::SockMotion::default();
    for (index, case) in fixtures().motions.into_iter().enumerate() {
        let moving = windsock::advance_sock(
            &mut motion,
            case.target,
            case.force,
            case.elapsed,
            case.snap,
        );
        assert_eq!(moving, case.moving, "stap {index}: beweegt");
        let heading = motion.heading.unwrap();
        let strength = motion.strength.unwrap();
        close(
            heading.value,
            case.heading.value,
            &format!("stap {index}: richting"),
        );
        close(
            heading.velocity,
            case.heading.velocity,
            &format!("stap {index}: draaisnelheid"),
        );
        close(
            strength.value,
            case.strength.value,
            &format!("stap {index}: kracht"),
        );
        close(
            strength.velocity,
            case.strength.velocity,
            &format!("stap {index}: krachtsnelheid"),
        );
        close(motion.wave, case.wave, &format!("stap {index}: golf"));
        close_list(
            Some(windsock::sway_bends(
                strength.value.max(0.0),
                motion.wave,
                case.seconds,
                1.7,
            )),
            &Some(case.bends),
            &format!("stap {index}: wuiven"),
        );
    }
}

#[test]
fn polygon_fill_with_cut_is_byte_identical_to_the_bot() {
    let fixtures = fixtures();
    let size = (fixtures.size.width, fixtures.size.height);
    for (index, case) in fixtures.fills.iter().enumerate() {
        let mut rgb = vec![40u8; size.0 * size.1 * 3];
        let cut = case.cut.as_ref().map(|cut| Cut {
            center: [cut.x, cut.y],
            radius: cut.radius,
        });
        windsock::fill_polygon(&mut rgb, size, &case.points, [250, 120, 30], 0.8, cut);
        assert_eq!(rgb, case.rgb, "vulling {index}");
    }
}

#[test]
fn beaufort_scale_and_frame_codes_match_the_app() {
    let case = fixtures().beaufort;
    for speed in &case.speeds {
        close(
            windsock::beaufort_scale(speed.speed),
            speed.scale,
            "beaufort",
        );
    }
    let codes: Vec<u8> = case
        .east
        .iter()
        .zip(&case.north)
        .map(|(&east, &north)| {
            windsock::beaufort_code(case.quant[east as usize], case.quant[north as usize])
        })
        .collect();
    assert_eq!(codes, case.frame);
}
