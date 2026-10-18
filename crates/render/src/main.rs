mod air;
mod all;
mod data;
mod encode;
mod fields;
mod frame_cache;
mod modes;
mod renderer;
mod shared;

use anyhow::{Result, ensure};
use clap::{Parser, ValueEnum};
use std::path::PathBuf;

#[derive(Clone, Debug, ValueEnum)]
enum Mode {
    Weather,
    Wind,
    Feels,
    Air,
    All,
}

#[derive(Parser)]
#[command(
    name = "motregen-render",
    version,
    about = "Render one local weather generation to MP4 and JPEG"
)]
struct Arguments {
    #[arg(long)]
    data_dir: PathBuf,
    #[arg(long)]
    basemap_dir: PathBuf,
    #[arg(long, value_enum, default_value = "weather")]
    mode: Mode,
    #[arg(long)]
    out_dir: PathBuf,
    #[arg(long, help = "Snapshot manifest; defaults to DATA_DIR/manifest.json")]
    manifest: Option<PathBuf>,
    #[arg(
        long,
        value_delimiter = ',',
        default_value = "weather,wind,feels",
        help = "Modes rendered by --mode all"
    )]
    modes: Vec<String>,
    #[arg(long, help = "PO clock prototype: schuif or klap")]
    clock_variant: Option<render_core::clock::ClockTransition>,
    #[arg(
        long,
        help = "Reuse frames across generations from this directory (MIP-37)"
    )]
    frame_cache: Option<PathBuf>,
    #[arg(long, default_value_t = 3072, help = "Frame cache size limit in MiB")]
    frame_cache_limit_mb: u64,
}

fn main() -> Result<()> {
    let arguments = Arguments::parse();
    encode::Settings::from_env()?;
    rayon::ThreadPoolBuilder::new()
        .num_threads(2)
        .build_global()?;
    let path = arguments
        .manifest
        .unwrap_or_else(|| arguments.data_dir.join("manifest.json"));
    let manifest: render_core::time::Manifest = serde_json::from_slice(&std::fs::read(path)?)?;
    ensure!(manifest.version == 0, "Unsupported manifest version");
    render_core::time::epoch(&manifest.now)?;
    render_core::time::epoch(&manifest.generated)?;
    let cache = arguments
        .frame_cache
        .as_deref()
        .map(|directory| {
            frame_cache::FrameCache::open(
                directory,
                &arguments.basemap_dir,
                arguments.frame_cache_limit_mb * 1024 * 1024,
            )
        })
        .transpose()?;
    let options = renderer::Options {
        clock: arguments
            .clock_variant
            .or(render_core::clock::CLOCK_TRANSITION),
        cache: cache.as_ref(),
    };
    if matches!(arguments.mode, Mode::All) {
        let media = all::render(
            &arguments.data_dir,
            &arguments.basemap_dir,
            &arguments.out_dir,
            &manifest,
            &arguments.modes,
            options,
        )?;
        println!("{}", serde_json::to_string(&media)?);
        return Ok(());
    }
    let media = match arguments.mode {
        Mode::Weather => renderer::render(
            &arguments.data_dir,
            &arguments.basemap_dir,
            &arguments.out_dir,
            &manifest,
            options,
        )?,
        Mode::Wind | Mode::Feels => modes::render(
            &arguments.data_dir,
            &arguments.basemap_dir,
            &arguments.out_dir,
            &manifest,
            matches!(arguments.mode, Mode::Wind),
            options,
        )?,
        Mode::Air => air::render(
            &arguments.data_dir,
            &arguments.basemap_dir,
            &arguments.out_dir,
            &manifest,
            options,
        )?,
        Mode::All => unreachable!(),
    };
    println!("{}", serde_json::to_string(&media)?);
    Ok(())
}
