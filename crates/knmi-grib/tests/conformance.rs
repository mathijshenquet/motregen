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
    if !source.exists() {
        eprintln!(
            "SKIP: missing full KNMI GRIB conformance sample {}; fetch the documented sample to run this test",
            source.display()
        );
        return Ok(());
    }
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

#[test]
fn gusts_are_the_hourly_maximum_and_exceed_the_mean_wind() -> Result<()> {
    let source = repository_root().join("data/HA43_N20_202608281200_00100_GB");
    if !source.exists() {
        eprintln!("SKIP: missing KNMI GRIB sample {}", source.display());
        return Ok(());
    }
    let fields = knmi_grib::decode_arome_fields(&source)?;
    assert_eq!(
        (fields.gust_u_ms.start_step, fields.gust_u_ms.end_step),
        (0, 1)
    );
    assert_eq!(fields.gust_v_ms.grid, fields.wind_u_ms.grid);
    let magnitude =
        |u: &[f32], v: &[f32]| -> Vec<f32> { u.iter().zip(v).map(|(u, v)| u.hypot(*v)).collect() };
    let gust = magnitude(&fields.gust_u_ms.values, &fields.gust_v_ms.values);
    let wind = magnitude(&fields.wind_u_ms.values, &fields.wind_v_ms.values);
    let above = gust
        .iter()
        .zip(&wind)
        .filter(|(gust, wind)| gust >= wind)
        .count();
    ensure!(
        above as f64 >= 0.99 * gust.len() as f64,
        "gust below mean wind in {} of {} cells",
        gust.len() - above,
        gust.len()
    );
    ensure!(gust.iter().all(|gust| (0.0..60.0).contains(gust)));
    Ok(())
}
