use std::path::{Path, PathBuf};
use std::process::Command;

use anyhow::{Context, Result, ensure};
use ndarray_npy::read_npy;
use serde_json::Value;

fn repository_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../..")
}

#[test]
fn matches_cfgrib_reference_elementwise() -> Result<()> {
    let root = repository_root();
    let source = root.join("data/HA43_N20_202608281200_00100_GB");
    ensure!(
        source.exists(),
        "missing test data {}; fetch the documented sample first",
        source.display()
    );
    let output = tempfile::tempdir()?;
    let status = Command::new("uv")
        .args(["run", "--project"])
        .arg(root.join("spec"))
        .arg(root.join("spec/export_fixture.py"))
        .arg(&source)
        .arg(output.path())
        .status()
        .context("running cfgrib reference exporter")?;
    ensure!(status.success(), "cfgrib reference exporter failed");

    let expected: ndarray::Array2<f32> = read_npy(output.path().join("precip.npy"))?;
    let metadata: Value =
        serde_json::from_reader(std::fs::File::open(output.path().join("metadata.json"))?)?;
    let actual = knmi_grib::decode_total_precipitation(&source)?;

    assert_eq!(actual.values.as_slice(), expected.as_slice().unwrap());
    assert_eq!(
        actual.grid.ni,
        metadata["grid"]["ni"].as_u64().unwrap() as usize
    );
    assert_eq!(
        actual.grid.nj,
        metadata["grid"]["nj"].as_u64().unwrap() as usize
    );
    assert_eq!(
        actual.grid.grid_type,
        metadata["grid"]["type"].as_str().unwrap()
    );
    assert_eq!(actual.start_step, metadata["start_step"].as_i64().unwrap());
    assert_eq!(actual.end_step, metadata["end_step"].as_i64().unwrap());
    assert_eq!(
        actual.grid.latitude_first,
        metadata["grid"]["latitude_first"].as_f64().unwrap()
    );
    assert_eq!(
        actual.grid.longitude_first,
        metadata["grid"]["longitude_first"].as_f64().unwrap()
    );
    assert_eq!(
        actual.grid.latitude_last,
        metadata["grid"]["latitude_last"].as_f64().unwrap()
    );
    assert_eq!(
        actual.grid.longitude_last,
        metadata["grid"]["longitude_last"].as_f64().unwrap()
    );
    assert_eq!(
        actual.grid.latitude_increment,
        metadata["grid"]["latitude_increment"].as_f64().unwrap()
    );
    assert_eq!(
        actual.grid.longitude_increment,
        metadata["grid"]["longitude_increment"].as_f64().unwrap()
    );
    Ok(())
}
