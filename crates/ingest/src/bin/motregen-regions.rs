//! MIP-40: bouwt de regiobestanden uit een bestaande datamap (manifest + chunks, plus sidecars zoals ecmwf.json),
//! meet bytes en CPU per groep en controleert desgewenst elke waarde tegen de rasters. Raakt de datamap niet aan.
//!
//! cargo run --release -p motregen-ingest --bin motregen-regions -- --data-dir <map> [--sidecar <map>/ecmwf.json]
//!     [--level 19] [--out <map>] [--verify]
//!
//! Met `--out` is `<out>` daarna zelf een datamap: `regions/`, `manifest.json` (het invoermanifest plus de sectie
//! `regions`) en `chunks` als link naar de invoer, om de client lokaal tegen regiobestanden te draaien.

use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
    time::Instant,
};

use anyhow::{Context, Result, ensure};
use clap::Parser;
use motregen_ingest::{
    publisher::{Manifest, ManifestChunk, ProducedChunk, produced_chunk},
    regions::{
        self, BuiltGroup, Group, RegionGrid, RegionsGroup, RegionsSection, process_cpu_ms,
        read_region_file,
    },
};
use serde::Deserialize;

#[derive(Parser)]
struct Args {
    /// Map met manifest.json en chunks/.
    #[arg(long)]
    data_dir: PathBuf,
    /// Sidecar met een `chunks`-lijst (ecmwf.json, icon-d2.json); de chunks staan in chunks/ naast de sidecar.
    #[arg(long)]
    sidecar: Vec<PathBuf>,
    #[arg(long, default_value_t = regions::DEFAULT_ZSTD_LEVEL)]
    level: i32,
    /// Schrijf de generaties naar <out>/regions/, plus manifest.json met de sectie regions en een link chunks/.
    #[arg(long)]
    out: Option<PathBuf>,
    /// Vergelijk elke cel, elk frame en elk bewegingsblok in de bestanden met het raster.
    #[arg(long)]
    verify: bool,
    /// Bouw elke chunk ook los, om te zien welke velden de bytes dragen.
    #[arg(long)]
    per_chunk: bool,
}

#[derive(Deserialize)]
struct Sidecar {
    chunks: Vec<ManifestChunk>,
}

fn load(directory: &Path, chunk: &ManifestChunk) -> Result<ProducedChunk> {
    let filename = chunk
        .url
        .strip_prefix("chunks/")
        .context("chunk url outside chunks/")?;
    let bytes =
        fs::read(directory.join(&chunk.url)).with_context(|| format!("read {}", chunk.url))?;
    produced_chunk(filename.to_owned(), bytes)
}

fn main() -> Result<()> {
    let args = Args::parse();
    let manifest: Manifest =
        serde_json::from_slice(&fs::read(args.data_dir.join("manifest.json"))?)?;
    let mut chunks = manifest
        .chunks
        .iter()
        .map(|chunk| load(&args.data_dir, chunk))
        .collect::<Result<Vec<_>>>()?;
    for path in &args.sidecar {
        let sidecar: Sidecar = serde_json::from_slice(&fs::read(path)?)?;
        let directory = path.parent().context("sidecar has no directory")?;
        for chunk in &sidecar.chunks {
            if !chunks.iter().any(|known| known.manifest.url == chunk.url) {
                chunks.push(load(directory, chunk)?);
            }
        }
    }
    let grid = RegionGrid::land()?;
    println!(
        "{}: nu {}, {} chunks, {} regio's met een bestand, zstd {}, {} rayon-draden",
        args.data_dir.display(),
        manifest.now,
        chunks.len(),
        grid.present.len(),
        args.level,
        rayon::current_num_threads()
    );
    println!();
    println!(
        "| groep | chunks | bestanden | bytes per run | gem. / p95 per bestand | op schijf (4 KiB) | ongecomprimeerd | kop (los gecomprimeerd) | decode / knippen / zstd | wandklok | CPU (alle draden) |"
    );
    println!("| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |");
    let mut per_location = 0;
    let mut built_groups = Vec::new();
    for group in Group::ALL {
        let members = chunks
            .iter()
            .filter(|chunk| Group::of(&chunk.manifest.source, &chunk.manifest.field) == Some(group))
            .collect::<Vec<_>>();
        if members.is_empty() {
            println!(
                "| {} | 0 | — | — | — | — | — | — | — | — | — |",
                group.name()
            );
            continue;
        }
        let cpu_before = process_cpu_ms();
        let started = Instant::now();
        let built = regions::build_group(group, &members, &grid, args.level)?;
        let elapsed_ms = started.elapsed().as_secs_f64() * 1e3;
        let cpu_ms = cpu_before
            .zip(process_cpu_ms())
            .map(|(before, after)| after - before);
        let stats = &built.stats;
        per_location += stats.mean_bytes;
        println!(
            "| {} | {} | {} | {} kB | {} / {} B | {} kB | {} kB | {} B per bestand | {:.0} / {:.0} / {:.0} ms | {:.0} ms | {} |",
            group.name(),
            stats.chunks,
            stats.files,
            stats.bytes / 1000,
            stats.mean_bytes,
            stats.p95_bytes,
            stats.disk_bytes / 1000,
            stats.raw_bytes / 1000,
            stats.header_compressed_bytes / stats.files.max(1) as u64,
            stats.decode_ms,
            stats.cut_ms,
            stats.compress_ms,
            elapsed_ms,
            cpu_ms.map_or("—".to_owned(), |ms| format!("{ms} ms")),
        );
        if let Some(out) = &args.out {
            regions::write_group(out, &built)?;
        }
        built_groups.push((built, members));
    }
    let mut tables = std::collections::BTreeMap::new();
    for (built, _) in &built_groups {
        tables.extend(built.tables.clone());
    }
    let tables_json = serde_json::to_vec(&regions::TablesFile {
        version: regions::FORMAT_VERSION,
        tables: tables.clone(),
    })?;
    if let Some(out) = &args.out {
        let name = regions::write_tables(out, &tables)?;
        let section = RegionsSection::new(
            &grid,
            Some(name),
            built_groups
                .iter()
                .map(|(built, _)| RegionsGroup::of(built))
                .collect(),
        );
        write_manifest(&args.data_dir, out, &section)?;
    }
    println!();
    println!("Per locatie (som van het gemiddelde bestand per groep): {per_location} B");
    println!(
        "Tabellenbestand (eenmalig, immutable): {} tabellen, {} B JSON, {} B met zstd",
        tables.len(),
        tables_json.len(),
        zstd::bulk::compress(&tables_json, args.level)?.len()
    );
    if args.per_chunk {
        println!();
        println!("| groep | chunk | frames | gem. per bestand, los |");
        println!("| --- | --- | ---: | ---: |");
        for (built, members) in &built_groups {
            for chunk in members {
                let alone = regions::build_group(built.group, &[chunk], &grid, args.level)?;
                println!(
                    "| {} | {} | {} | {} B |",
                    built.group.name(),
                    chunk.filename,
                    chunk.manifest.times.len(),
                    alone.stats.mean_bytes
                );
            }
        }
    }
    if args.verify {
        for (built, members) in &built_groups {
            let (values, blocks) = verify(built, members)?;
            println!(
                "verify {}: {values} waarden en {blocks} bewegingsblokken gelijk aan het raster",
                built.group.name()
            );
        }
    }
    Ok(())
}

fn write_manifest(data_dir: &Path, out: &Path, section: &RegionsSection) -> Result<()> {
    let mut manifest: serde_json::Value =
        serde_json::from_slice(&fs::read(data_dir.join("manifest.json"))?)?;
    manifest
        .as_object_mut()
        .context("manifest is not an object")?
        .insert("regions".to_owned(), serde_json::to_value(section)?);
    fs::write(out.join("manifest.json"), serde_json::to_vec(&manifest)?)?;
    let chunks = out.join("chunks");
    if chunks.symlink_metadata().is_err() {
        std::os::unix::fs::symlink(fs::canonicalize(data_dir.join("chunks"))?, &chunks)?;
    }
    Ok(())
}

fn verify(built: &BuiltGroup, members: &[&ProducedChunk]) -> Result<(u64, u64)> {
    let files = built
        .files
        .iter()
        .map(|(_, bytes)| read_region_file(bytes))
        .collect::<Result<Vec<_>>>()?;
    let by_url = members
        .iter()
        .map(|chunk| (chunk.manifest.url.as_str(), *chunk))
        .collect::<HashMap<_, _>>();
    let (mut values, mut blocks) = (0, 0);
    for url in &built.chunks {
        let decoded = mrf::decode(&by_url[url.as_str()].bytes)?;
        let width = decoded.header.grid.width as usize;
        for file in &files {
            let Some(index) = file
                .header
                .chunks
                .iter()
                .position(|entry| &entry.url == url)
            else {
                continue;
            };
            let entry = &file.header.chunks[index];
            let table = &built.tables[&entry.table];
            ensure!(
                table.quant == decoded.header.quant && table.grid == decoded.header.grid,
                "table differs for {url}"
            );
            for row in entry.window.row..entry.window.row + entry.window.height {
                for column in entry.window.column..entry.window.column + entry.window.width {
                    for (frame, raster) in decoded.frames.iter().enumerate() {
                        ensure!(
                            file.value(index, column, row, frame)
                                == Some(raster[row as usize * width + column as usize]),
                            "value differs: {url} region {} cell {column},{row} frame {frame}",
                            file.header.region
                        );
                        values += 1;
                    }
                }
            }
            if let (Some(motion), Some(grid)) = (&entry.motion, decoded.header.motion_grid) {
                for &frame in &motion.frames {
                    let vectors = decoded.motions[frame as usize]
                        .as_ref()
                        .context("motion frame without vectors")?;
                    for block_row in motion.window.row..motion.window.row + motion.window.height {
                        for block_column in
                            motion.window.column..motion.window.column + motion.window.width
                        {
                            let at =
                                (block_row as usize * grid.bw as usize + block_column as usize) * 2;
                            ensure!(
                                file.motion(index, block_column, block_row, frame)
                                    == Some((vectors[at], vectors[at + 1])),
                                "motion differs: {url}"
                            );
                            blocks += 1;
                        }
                    }
                }
            }
        }
    }
    Ok((values, blocks))
}
