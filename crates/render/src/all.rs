use crate::{
    air, modes,
    renderer::{self, Media},
    shared,
};
use anyhow::{Context, Result, ensure};
use render_core::{clock::ClockTransition, constants::constants, time::Manifest};
use serde::Serialize;
use std::{collections::BTreeMap, fs, path::Path, sync::atomic::Ordering, thread, time::Instant};

#[derive(Serialize)]
pub struct AllMedia {
    version: u32,
    mode: &'static str,
    generated: String,
    now: String,
    width: usize,
    height: usize,
    total_ms: u128,
    shared_raster_hits: usize,
    modes: BTreeMap<&'static str, Media>,
}

pub fn render(
    data_directory: &Path,
    basemap_directory: &Path,
    out_directory: &Path,
    manifest: &Manifest,
    requested: &[String],
    clock: Option<ClockTransition>,
) -> Result<AllMedia> {
    let started = Instant::now();
    let mut selected: Vec<&'static str> = Vec::new();
    for name in requested {
        let mode = ["weather", "wind", "feels", "air"]
            .into_iter()
            .find(|mode| mode == name)
            .with_context(|| format!("Unknown weather mode: {name}"))?;
        ensure!(!selected.contains(&mode), "Duplicate weather mode: {mode}");
        selected.push(mode);
    }
    ensure!(!selected.is_empty(), "No weather modes selected");
    let inputs = shared::enable();
    fs::create_dir_all(out_directory)?;
    let receipt = out_directory.join("media.json");
    if receipt.exists() {
        fs::remove_file(&receipt)?;
    }
    let temporary = tempfile::tempdir_in(out_directory)?;
    let outputs = thread::scope(|scope| {
        let tasks: Vec<_> = selected
            .iter()
            .map(|&mode| {
                let destination = temporary.path().join(mode);
                scope.spawn(move || -> Result<Media> {
                    if mode == "weather" {
                        renderer::render(
                            data_directory,
                            basemap_directory,
                            &destination,
                            manifest,
                            clock,
                        )
                    } else if mode == "air" {
                        air::render(
                            data_directory,
                            basemap_directory,
                            &destination,
                            manifest,
                            clock,
                        )
                    } else {
                        modes::render(
                            data_directory,
                            basemap_directory,
                            &destination,
                            manifest,
                            mode == "wind",
                            clock,
                        )
                    }
                })
            })
            .collect();
        tasks
            .into_iter()
            .map(|task| {
                task.join()
                    .map_err(|_| anyhow::anyhow!("Weather mode panicked"))?
            })
            .collect::<Result<Vec<_>>>()
    })?;
    let mut modes = BTreeMap::new();
    for media in outputs {
        for file in &media.files {
            fs::rename(
                temporary.path().join(media.mode).join(&file.file),
                out_directory.join(&file.file),
            )?;
        }
        ensure!(
            modes.insert(media.mode, media).is_none(),
            "Duplicate weather mode"
        );
    }
    ensure!(modes.len() == selected.len(), "Incomplete weather matrix");
    let size = &constants().size;
    let media = AllMedia {
        version: 1,
        mode: "all",
        generated: manifest.generated.clone(),
        now: manifest.now.clone(),
        width: size.width,
        height: size.height,
        total_ms: started.elapsed().as_millis(),
        shared_raster_hits: inputs.hits.load(Ordering::Relaxed),
        modes,
    };
    fs::write(
        temporary.path().join("media.json"),
        serde_json::to_vec_pretty(&media)?,
    )?;
    fs::rename(temporary.path().join("media.json"), receipt)?;
    Ok(media)
}
