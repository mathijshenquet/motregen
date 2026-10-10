use render_core::{
    constants::{blur, constants, warp_limit},
    time::{Manifest, clock_text, dark, frame_blend, timeline},
};
use serde_json::Value;

fn fixtures() -> Value {
    serde_json::from_str(include_str!("../assets/fixtures.json")).unwrap()
}

#[test]
fn timeline_and_blending_follow_typescript() {
    let fixtures = fixtures();
    let manifest: Manifest = serde_json::from_value(fixtures["manifest"].clone()).unwrap();
    let frames = timeline(&manifest, "rain_rate").unwrap();
    let expected = fixtures["timeline"].as_array().unwrap();
    assert_eq!(frames.len(), expected.len());
    for (frame, expected) in frames.iter().zip(expected) {
        assert_eq!(frame.epoch, expected["epoch"].as_i64().unwrap());
        assert_eq!(
            frame.frame_index,
            expected["frame_index"].as_u64().unwrap() as usize
        );
        assert_eq!(
            manifest.chunks[frame.chunk_index].source,
            expected["source"].as_str().unwrap()
        );
        assert_eq!(
            manifest.chunks[frame.chunk_index].url,
            expected["url"].as_str().unwrap()
        );
    }
    for expected in fixtures["blends"].as_array().unwrap() {
        let blend = frame_blend(&frames, expected["epoch"].as_i64().unwrap());
        assert_eq!(blend.left, expected["left"].as_u64().unwrap() as usize);
        assert_eq!(blend.right, expected["right"].as_u64().unwrap() as usize);
        assert!((blend.mix - expected["mix"].as_f64().unwrap()).abs() < 1e-12);
    }
    assert_eq!(timeline(&manifest, "feels_like_c").unwrap().len(), 3);
}

#[test]
fn clock_handles_midnight_and_both_dst_changes() {
    for expected in fixtures()["clocks"].as_array().unwrap() {
        let (time, day) = clock_text(expected["epoch"].as_i64().unwrap());
        assert_eq!(time, expected["time"].as_str().unwrap());
        assert_eq!(day, expected["day"].as_str().unwrap());
    }
}

#[test]
fn theme_follows_the_sun_for_each_frame() {
    for expected in fixtures()["themes"].as_array().unwrap() {
        let epoch = expected["epoch"].as_i64().unwrap();
        assert_eq!(dark(epoch), expected["dark"].as_bool().unwrap(), "{epoch}");
    }
}

#[test]
fn smoothing_and_warp_follow_map_time_and_pair_interval() {
    assert_eq!(blur(-3_600_000).sigma, blur(0).sigma);
    assert_eq!(
        blur(7_200_000).sigma,
        constants().sampling.samples[120].sigma
    );
    assert_eq!(
        blur(10_800_000).sigma,
        constants().sampling.samples[180].sigma
    );
    assert!(
        (blur(9_000_000).sigma - (blur(7_200_000).sigma + blur(10_800_000).sigma) / 2.0).abs()
            < 1e-12
    );
    assert_eq!(blur(43_200_000).sigma, blur(10_800_000).sigma);
    assert!(warp_limit(55.0).cap_cells > warp_limit(5.0).cap_cells);
}
