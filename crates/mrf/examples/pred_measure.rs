//! U18b: encodes the frames of any chunk (bitmap or predictive) both ways and reports bytes and timings.
//!
//! `cargo run --release -p mrf --example pred_measure -- <chunk.mrf>...`

use std::{env, fs, time::Instant};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let (mut bitmap, mut pred, mut frames) = (0_usize, 0_usize, 0_usize);
    let (mut encode_s, mut decode_s) = (0.0_f64, 0.0_f64);
    for path in env::args().skip(1) {
        let chunk = mrf::decode(&fs::read(&path)?)?;
        let header = &chunk.header;
        for frame in &chunk.frames {
            let started = Instant::now();
            let payload = mrf::pred::encode_frame(frame, header.grid.width);
            let member = zstd::bulk::compress(&payload, mrf::COMPRESSION_LEVEL)?;
            encode_s += started.elapsed().as_secs_f64();
            let started = Instant::now();
            let back = mrf::pred::decode_frame(
                &zstd::bulk::decompress(&member, payload.len())?,
                header.grid.width,
                header.grid.height,
            )?;
            decode_s += started.elapsed().as_secs_f64();
            assert_eq!(&back, frame, "{path}: round trip differs");
            bitmap += zstd::bulk::compress(frame, mrf::COMPRESSION_LEVEL)?.len();
            pred += member.len();
            frames += 1;
        }
    }
    println!(
        "{frames} frames: bitmap {:.0} B/frame, pred {:.0} B/frame ({:.1} %); encode incl. zstd-19 {:.2} ms/frame, decode {:.2} ms/frame",
        bitmap as f64 / frames as f64,
        pred as f64 / frames as f64,
        pred as f64 / bitmap as f64 * 100.0,
        encode_s * 1e3 / frames as f64,
        decode_s * 1e3 / frames as f64,
    );
    Ok(())
}
