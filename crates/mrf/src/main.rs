use std::{fs, path::PathBuf};

use clap::{Parser, Subcommand};
use mrf::{ChunkMeta, Grid, decode, encode, parse_header, quantize_with_table};
use serde::Deserialize;

#[derive(Parser)]
#[command(about = "Inspect, encode, and decode mrf v0 chunks")]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    /// Print the JSON header and payload-relative frame table.
    Inspect { chunk: PathBuf },
    /// Convert little-endian f32 frames into an mrf chunk.
    Encode {
        #[arg(long)]
        input: PathBuf,
        #[arg(long)]
        meta: PathBuf,
        #[arg(long)]
        output: PathBuf,
    },
    /// Extract one quantized frame as raw bytes.
    Decode {
        chunk: PathBuf,
        frame_idx: usize,
        #[arg(long)]
        output: PathBuf,
    },
}

#[derive(Deserialize)]
struct RawMeta {
    grid: Grid,
    quant: Vec<Option<f32>>,
    source: String,
    run: String,
    times: Vec<String>,
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    match Cli::parse().command {
        Command::Inspect { chunk } => {
            let bytes = fs::read(chunk)?;
            let index = parse_header(&bytes)?;
            println!("header_len: {}", index.header_len);
            println!("{}", serde_json::to_string_pretty(&index.header)?);
            println!("frame table (payload-relative):");
            for (number, frame) in index.header.frames.iter().enumerate() {
                println!(
                    "{number}: {} offset={} len={}",
                    frame.time, frame.offset, frame.len
                );
            }
        }
        Command::Encode {
            input,
            meta,
            output,
        } => {
            let meta: RawMeta = serde_json::from_slice(&fs::read(meta)?)?;
            let cell_count = meta.grid.cell_count()?;
            let bytes = fs::read(input)?;
            let frame_bytes = cell_count.checked_mul(4).ok_or("frame is too large")?;
            if bytes.len()
                != frame_bytes
                    .checked_mul(meta.times.len())
                    .ok_or("input is too large")?
            {
                return Err(
                    "raw input length must be width * height * frame count * 4 bytes".into(),
                );
            }
            let mut frames = Vec::with_capacity(meta.times.len());
            for source in bytes.chunks_exact(frame_bytes) {
                let mut frame = Vec::with_capacity(cell_count);
                for value in source.chunks_exact(4) {
                    frame.push(quantize_with_table(
                        f32::from_le_bytes(value.try_into()?),
                        &meta.quant,
                    )?);
                }
                frames.push(frame);
            }
            let chunk_meta = ChunkMeta {
                grid: meta.grid,
                quant: meta.quant,
                source: meta.source,
                run: meta.run,
                frame_times: meta.times,
            };
            fs::write(output, encode(&frames, &chunk_meta)?)?;
        }
        Command::Decode {
            chunk,
            frame_idx,
            output,
        } => {
            let decoded = decode(&fs::read(chunk)?)?;
            let frame = decoded
                .frames
                .get(frame_idx)
                .ok_or("frame index is outside the chunk")?;
            fs::write(output, frame)?;
        }
    }
    Ok(())
}
