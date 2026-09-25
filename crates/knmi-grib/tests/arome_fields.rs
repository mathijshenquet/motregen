use std::path::Path;

use anyhow::Result;

#[test]
fn selects_mean_sea_level_pressure_not_surface_pressure() -> Result<()> {
    let source =
        Path::new(env!("CARGO_MANIFEST_DIR")).join("../../data/HA43_N20_202608281200_00100_GB");
    if !source.exists() {
        eprintln!(
            "SKIP: missing full KNMI GRIB sample {}; fetch the documented sample to run this test",
            source.display()
        );
        return Ok(());
    }
    let fields = knmi_grib::decode_arome_fields(&source)?;
    let pressure = &fields.mean_sea_level_pressure_pa;
    assert_eq!(pressure.end_step, 1);
    assert_eq!(pressure.grid, fields.temperature_k.grid);
    let (min, max) = pressure
        .values
        .iter()
        .fold((f32::INFINITY, f32::NEG_INFINITY), |(min, max), value| {
            (min.min(*value), max.max(*value))
        });
    // grib_ls on this member: level 103 spans 99 689.8–101 456 Pa; parameter 1 on `sfc`
    // (surface pressure, lower over the Ardennes) goes down to 90 639.8 Pa.
    assert!((min - 99_689.8).abs() < 1.0, "min {min}");
    assert!((max - 101_456.0).abs() < 1.0, "max {max}");
    Ok(())
}
