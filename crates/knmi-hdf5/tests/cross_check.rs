use std::{path::Path, process::Command};

use anyhow::{Context, Result, ensure};
use knmi_hdf5::{RadarProduct, decode_nowcast, decode_rtcor};

fn check(fixture: &str, kind: &str, decode: fn(&Path) -> Result<RadarProduct>) -> Result<()> {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    let source = root.join("crates/knmi-hdf5/tests/fixtures").join(fixture);
    let output = tempfile::NamedTempFile::new()?;
    let status = Command::new("uv")
        .args(["run", "--project"])
        .arg(root.join("spec"))
        .arg(root.join("spec/radar_reference.py"))
        .args(["export", kind])
        .arg(&source)
        .arg(output.path())
        .status()
        .context("running h5py radar reference")?;
    ensure!(status.success(), "h5py radar reference failed");
    let expected: RadarProduct = serde_json::from_reader(output.reopen()?)?;
    let actual = decode(&source)?;
    assert_eq!(actual, expected);
    Ok(())
}

#[test]
fn rtcor_matches_h5py_reference() -> Result<()> {
    check("rtcor-mini.h5", "rtcor", |path| decode_rtcor(path))
}

#[test]
fn nowcast_matches_h5py_reference() -> Result<()> {
    check("nowcast-mini.h5", "nowcast", |path| decode_nowcast(path))
}
