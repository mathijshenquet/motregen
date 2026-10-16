//! Diagnose: draait de blokcorrelatie van de ingest op één framepaar van een bestaande chunk en zet per blok de
//! correlatievector naast de opgeslagen (met wind gemengde) vector, in cellen per frame-interval.
//! Gebruik: cargo run -p ingest --example motion_probe -- <chunk.mrf> <frame-index> <blok-x0> <blok-x1> <blok-y0> <blok-y1>

use anyhow::{Context, Result};

fn main() -> Result<()> {
    let arguments: Vec<String> = std::env::args().collect();
    let path = arguments.get(1).context("chunkpad ontbreekt")?;
    let index: usize = arguments.get(2).context("frame-index ontbreekt")?.parse()?;
    let range = |position: usize| -> Result<usize> { Ok(arguments.get(position).context("blokbereik ontbreekt")?.parse()?) };
    let (block_x0, block_x1, block_y0, block_y1) = (range(3)?, range(4)?, range(5)?, range(6)?);

    let chunk = mrf::decode(&std::fs::read(path)?)?;
    let header = &chunk.header;
    let dequantize = |frame: &[u8]| -> Vec<f32> { frame.iter().map(|value| header.quant[*value as usize].unwrap_or(f32::NAN)).collect() };
    let previous = dequantize(&chunk.frames[index - 1]);
    let current = dequantize(&chunk.frames[index]);
    let interval = 5.0_f32;
    let field = motion::correlate(&previous, &current, header.grid.width, header.grid.height, interval)?;
    let stored = chunk.motions[index].as_ref().context("frame heeft geen bewegingsannex")?;
    let without_wind = motion::estimate(&previous, &current, header.grid.width, header.grid.height, interval)?;
    println!("frame {} ({}); per blok: correlatie u,v (vertrouwen) | opgeslagen u,v | zonder wind u,v — cellen per {interval} min", index, header.frames[index].time);
    for block_y in block_y0..=block_y1 {
        let mut line = format!("rij {block_y:2}:");
        for block_x in block_x0..=block_x1 {
            let position = block_y * field.grid.bw as usize + block_x;
            let correlation = field.vectors[position]
                .map(|vector| format!("{:+3.0},{:+3.0}({:.2})", vector.u_cells_per_minute * interval, vector.v_cells_per_minute * interval, vector.confidence))
                .unwrap_or_else(|| "     ---      ".to_string());
            let (u, v) = (stored[position * 2], stored[position * 2 + 1]);
            let (plain_u, plain_v) = (without_wind.vectors[position * 2], without_wind.vectors[position * 2 + 1]);
            line.push_str(&format!("  {correlation}|{:+4.1},{:+4.1}|{:+4.1},{:+4.1}", f32::from(u) * 0.1 * interval, f32::from(v) * 0.1 * interval, f32::from(plain_u) * 0.1 * interval, f32::from(plain_v) * 0.1 * interval));
        }
        println!("{line}");
    }
    Ok(())
}
