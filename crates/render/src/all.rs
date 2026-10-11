use crate::{
    modes,
    renderer::{self, Media},
    shared,
};
use anyhow::{Result, ensure};
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
    shared_motion_hits: usize,
    modes: BTreeMap<&'static str, Media>,
}

pub fn render(
    data_directory: &Path,
    basemap_directory: &Path,
    out_directory: &Path,
    manifest: &Manifest,
    clock: Option<ClockTransition>,
) -> Result<AllMedia> {
    let started = Instant::now();
    let inputs = shared::enable();
    fs::create_dir_all(out_directory)?;
    let receipt = out_directory.join("media.json");
    if receipt.exists() {
        fs::remove_file(&receipt)?;
    }
    let temporary = tempfile::tempdir_in(out_directory)?;
    let outputs = thread::scope(|scope| {
        let tasks: Vec<_> = ["weather", "wind", "feels"]
            .into_iter()
            .map(|mode| {
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
    ensure!(modes.len() == 3, "Incomplete weather matrix");
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
        shared_motion_hits: inputs.motion_hits.load(Ordering::Relaxed),
        modes,
    };
    fs::write(
        temporary.path().join("media.json"),
        serde_json::to_vec_pretty(&media)?,
    )?;
    fs::rename(temporary.path().join("media.json"), receipt)?;
    Ok(media)
}
