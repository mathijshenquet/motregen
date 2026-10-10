mod data;
mod encode;
mod renderer;

use anyhow::{Result, ensure};
use clap::{Parser, ValueEnum};
use std::path::PathBuf;

#[derive(Clone, Debug, ValueEnum)]
enum Mode {
    Weather,
}

#[derive(Parser)]
#[command(
    name = "motregen-render",
    version,
    about = "Render one local rain generation to MP4 and JPEG"
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
}

fn main() -> Result<()> {
    let arguments = Arguments::parse();
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
    let media = renderer::render(
        &arguments.data_dir,
        &arguments.basemap_dir,
        &arguments.out_dir,
        &manifest,
    )?;
    println!("{}", serde_json::to_string(&media)?);
    Ok(())
}
