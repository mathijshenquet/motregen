use std::{path::Path, process::Command};

use anyhow::{Context, Result, ensure};
use knmi_hdf5::{RadarProduct, SeamlessProduct, decode_nowcast, decode_rtcor, decode_seamless};

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

#[test]
fn seamless_median_matches_h5py_reference() -> Result<()> {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    let source = root
        .join("crates/knmi-hdf5/tests/fixtures")
        .join("KNMI_PYSTEPS_BLEND_ENS_202608282020.nc");
    let output = tempfile::NamedTempFile::new()?;
    let status = Command::new("uv")
        .args(["run", "--project"])
        .arg(root.join("spec"))
        .arg(root.join("spec/seamless_reference.py"))
        .arg(&source)
        .arg(output.path())
        .status()
        .context("running h5py seamless reference")?;
    ensure!(status.success(), "h5py seamless reference failed");
    let expected: SeamlessProduct = serde_json::from_reader(output.reopen()?)?;
    let actual = decode_seamless(&source, 0)?;
    assert_eq!(actual.run, expected.run);
    assert_eq!(actual.grid.width, expected.grid.width);
    assert_eq!(actual.grid.height, expected.grid.height);
    assert!((actual.grid.latitude_first - expected.grid.latitude_first).abs() < 1e-12);
    assert!((actual.grid.longitude_first - expected.grid.longitude_first).abs() < 1e-12);
    assert!((actual.grid.latitude_increment - expected.grid.latitude_increment).abs() < 1e-12);
    assert!((actual.grid.longitude_increment - expected.grid.longitude_increment).abs() < 1e-12);
    assert_eq!(actual.frames, expected.frames);
    let after_nowcast = decode_seamless(&source, 120)?;
    assert_eq!(after_nowcast.frames.len(), 48);
    assert_eq!(after_nowcast.frames[0].time, "2026-08-28T22:25:00Z");
    assert_eq!(after_nowcast.frames[47].time, "2026-08-29T02:20:00Z");
    Ok(())
}
