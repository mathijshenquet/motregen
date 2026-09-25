use std::path::Path;

use anyhow::Result;

#[test]
fn decodes_low_mid_high_cloud_cover_as_fractions() -> Result<()> {
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
    for layer in [
        &fields.low_cloud_cover,
        &fields.medium_cloud_cover,
        &fields.high_cloud_cover,
    ] {
        assert_eq!(layer.end_step, 1);
        assert_eq!(layer.grid, fields.total_cloud_cover.grid);
        assert!(layer.values.iter().all(|value| (0.0..=1.0).contains(value)));
        // grib_ls on this member: parameters 73/74/75 each reach full cover somewhere.
        assert!(layer.values.iter().any(|value| *value > 0.99));
    }
    // Total cover is at least the largest single layer (maximum-random overlap).
    let total = &fields.total_cloud_cover.values;
    let layers_exceed_total = (0..total.len())
        .filter(|&index| {
            let largest = fields.low_cloud_cover.values[index]
                .max(fields.medium_cloud_cover.values[index])
                .max(fields.high_cloud_cover.values[index]);
            largest > total[index] + 0.01
        })
        .count();
    assert_eq!(layers_exceed_total, 0);
    Ok(())
}
