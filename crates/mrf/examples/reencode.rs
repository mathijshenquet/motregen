//! Re-encodes chunks with the current encoder, keeping their frames, motion and metadata.
//! U93 used it to give older radar chunks member hashes for the reuse measurement:
//! `cargo run --release -p mrf --example reencode -- <input.mrf> <output.mrf>...` (pairs).

use std::{env, fs};

use mrf::{ChunkMeta, decode, encode, encode_with_motion};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let paths = env::args().skip(1).collect::<Vec<_>>();
    if paths.is_empty() || paths.len() % 2 != 0 {
        return Err(
            "usage: reencode <input.mrf> <output.mrf> [<input.mrf> <output.mrf>...]".into(),
        );
    }
    for pair in paths.chunks_exact(2) {
        let decoded = decode(&fs::read(&pair[0])?)?;
        let header = decoded.header;
        let meta = ChunkMeta {
            field: header.field,
            grid: header.grid,
            quant: header.quant,
            source: header.source,
            run: header.run,
            frame_times: header.frames.into_iter().map(|frame| frame.time).collect(),
            pred: header.pred,
        };
        let bytes = match header.motion_grid {
            Some(motion_grid) => {
                encode_with_motion(&decoded.frames, &meta, motion_grid, &decoded.motions)?
            }
            None => encode(&decoded.frames, &meta)?,
        };
        fs::write(&pair[1], &bytes)?;
        println!("{} -> {} ({} bytes)", pair[0], pair[1], bytes.len());
    }
    Ok(())
}
