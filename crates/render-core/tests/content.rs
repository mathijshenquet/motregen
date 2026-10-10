use render_core::{
    constants::{blur, constants, warp_limit},
    time::{Manifest, clock_text, dark, frame_blend, timeline},
};
use serde_json::Value;

fn fixtures() -> Value {
    serde_json::from_str(include_str!("../assets/fixtures.json")).unwrap()
}

#[test]
fn palette_and_quantized_frame_composition_match_typescript() {
    use render_core::{
        composition::{Composition, compose},
        palette::composition_colors,
    };
    let colors = composition_colors(false);
    for fixture in fixtures()["compositions"].as_array().unwrap() {
        let mut rgb = [100, 150, 200];
        let left = vec![fixture["left"].as_u64().unwrap() as u8; 16];
        let right = vec![fixture["right"].as_u64().unwrap() as u8; 16];
        compose(
            &mut rgb,
            Composition {
                columns: &[1.5],
                rows: &[1.5],
                grid_width: 4,
                grid_height: 4,
                left: &left,
                right: &right,
                mix: fixture["mix"].as_f64().unwrap(),
                colors: &colors,
                displacements: None,
                multiply: false,
            },
        );
        let expected: Vec<u8> = fixture["rgb"]
            .as_array()
            .unwrap()
            .iter()
            .map(|channel| channel.as_u64().unwrap() as u8)
            .collect();
        assert_eq!(rgb.as_slice(), expected, "{fixture}");
    }
}

#[test]
fn shares_the_existing_web_time_model_fixtures() {
    for fixture in fixtures()["web_timelines"].as_array().unwrap() {
        let manifest: Manifest = serde_json::from_value(fixture["manifest"].clone()).unwrap();
        let frames = timeline(&manifest, "rain_rate").unwrap();
        let epochs: Vec<i64> = frames.iter().map(|frame| frame.epoch).collect();
        let sources: Vec<&str> = frames
            .iter()
            .map(|frame| manifest.chunks[frame.chunk_index].source.as_str())
            .collect();
        assert_eq!(serde_json::to_value(epochs).unwrap(), fixture["epochs"]);
        assert_eq!(serde_json::to_value(sources).unwrap(), fixture["sources"]);
        for expected in fixture["blends"].as_array().unwrap() {
            let blend = frame_blend(&frames, expected["epoch"].as_i64().unwrap());
            assert_eq!(blend.left, expected["left"].as_u64().unwrap() as usize);
            assert_eq!(blend.right, expected["right"].as_u64().unwrap() as usize);
            assert!((blend.mix - expected["mix"].as_f64().unwrap()).abs() < 1e-12);
        }
    }
}

#[test]
fn filters_no_data_and_does_not_warp_unreliable_vectors() {
    use render_core::{motion::Motion, sampling::Sampling};
    let blur = blur(0);
    let sampling = Sampling {
        kind: 3,
        taps: blur.taps,
        cell_width: constants().sampling.radar_cell_width,
        sigma: blur.sigma,
    };
    assert_eq!(sampling.filter(vec![255; 81], 9, 9), vec![255; 81]);
    assert_eq!(sampling.filter(vec![32; 81], 9, 9), vec![32; 81]);
    let mut impulse = vec![0; 81];
    impulse[40] = 200;
    let smooth = Sampling {
        cell_width: 1.0,
        ..sampling
    }
    .filter(impulse, 9, 9);
    assert!(smooth[40] > 0 && smooth[40] < 200);
    assert!(smooth[39] > 0 && smooth[31] > 0);
    let motion = Motion {
        vectors: &[10, -4],
        width: 1,
        height: 1,
        interval: 5.0,
        cap: 15.0,
        fade: 30.0,
    };
    assert_eq!(motion.displacement(4.0, 4.0, 9, 9), (5.0, -2.0));
    assert_eq!(
        Motion {
            vectors: &[-128, -128],
            ..motion
        }
        .displacement(4.0, 4.0, 9, 9),
        (0.0, 0.0)
    );
    assert_eq!(
        Motion {
            interval: 60.0,
            ..motion
        }
        .displacement(4.0, 4.0, 9, 9),
        (0.0, -0.0)
    );
    assert_eq!(
        Motion {
            interval: 60.0,
            cap: 120.0,
            fade: 240.0,
            ..motion
        }
        .displacement(4.0, 4.0, 9, 9),
        (60.0, -24.0)
    );
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
