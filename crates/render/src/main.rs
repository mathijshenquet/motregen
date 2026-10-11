mod all;
mod data;
mod encode;
mod fields;
mod modes;
mod renderer;
mod shared;
mod wind_rain;

use anyhow::{Result, ensure};
use clap::{Parser, ValueEnum};
use std::path::PathBuf;

#[derive(Clone, Debug, ValueEnum)]
enum Mode {
    Weather,
    Wind,
    Feels,
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
    #[arg(long, help = "PO clock prototype: schuif or klap")]
    clock_variant: Option<render_core::clock::ClockTransition>,
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
    let clock = arguments
        .clock_variant
        .or(render_core::clock::CLOCK_TRANSITION);
    if matches!(arguments.mode, Mode::All) {
        let media = all::render(
            &arguments.data_dir,
            &arguments.basemap_dir,
            &arguments.out_dir,
            &manifest,
            clock,
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
            clock,
        )?,
        Mode::Wind | Mode::Feels => modes::render(
            &arguments.data_dir,
            &arguments.basemap_dir,
            &arguments.out_dir,
            &manifest,
            matches!(arguments.mode, Mode::Wind),
            clock,
        )?,
        Mode::All => unreachable!(),
    };
    println!("{}", serde_json::to_string(&media)?);
    Ok(())
}
