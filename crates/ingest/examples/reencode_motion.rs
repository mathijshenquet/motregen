use std::{fs, path::Path};

use anyhow::{Context, Result, ensure};

fn main() -> Result<()> {
    let arguments = std::env::args().skip(1).collect::<Vec<_>>();
    ensure!(
        arguments.len() == 3,
        "gebruik: reencode_motion <in.mrf> <uit.mrf> <uit-manifest.json>"
    );
    let input = Path::new(&arguments[0]);
    let output = Path::new(&arguments[1]);
    let manifest_path = Path::new(&arguments[2]);
    ensure!(!output.exists(), "uitvoer bestaat al: {}", output.display());
    let mut manifest: serde_json::Value = serde_json::from_slice(&fs::read(manifest_path)?)?;
    let chunks = manifest["chunks"]
        .as_array_mut()
        .context("manifest mist chunks")?;
    let entry = chunks
        .iter_mut()
        .find(|entry| {
            entry["url"].as_str().is_some_and(|url| {
                manifest_path.parent().unwrap_or(Path::new(".")).join(url) == output
            })
        })
        .context("uitvoerpad komt niet voor in uitvoermanifest")?;
    let decoded = mrf::decode(&fs::read(input)?)?;
    let header = &decoded.header;
    ensure!(
        header.field == "rain_rate",
        "alleen regenchunks worden hercodeerd"
    );
    let meta = mrf::ChunkMeta {
        field: header.field.clone(),
        grid: header.grid.clone(),
        quant: header.quant.clone(),
        source: header.source.clone(),
        run: header.run.clone(),
        frame_times: header
            .frames
            .iter()
            .map(|frame| frame.time.clone())
            .collect(),
        pred: header.pred,
    };
    ensure!(
        entry["source"] == meta.source && entry["field"] == meta.field && entry["run"] == meta.run,
        "bron, veld of run wijkt af van het uitvoermanifest"
    );
    ensure!(
        entry["times"] == serde_json::to_value(&meta.frame_times)?,
        "frametijden wijken af van het uitvoermanifest"
    );
    let bytes = motregen_ingest::pipeline::encode_rain_with_motion(&decoded.frames, &meta)?;
    let verified = mrf::decode(&bytes)?;
    ensure!(
        verified.frames == decoded.frames,
        "regenframes zijn gewijzigd"
    );
    let header_len = mrf::parse_header(&bytes)?.header_len;
    let previous_header_len = entry["header_len"].clone();
    entry["header_len"] = header_len.into();
    fs::write(output, bytes)?;
    fs::write(manifest_path, serde_json::to_vec_pretty(&manifest)?)?;
    println!(
        "{}: {} frames identiek; header_len {} -> {}",
        header.source,
        verified.frames.len(),
        previous_header_len,
        header_len
    );
    Ok(())
}
