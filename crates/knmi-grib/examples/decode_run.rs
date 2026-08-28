use std::path::PathBuf;
use std::time::Instant;

use anyhow::{Context, Result};
use knmi_grib::{decode_total_precipitation, hourly_precipitation};

fn main() -> Result<()> {
    let directory = std::env::args_os()
        .nth(1)
        .map(PathBuf::from)
        .context("usage: decode_run DATA_DIRECTORY RUN_PREFIX")?;
    let prefix = std::env::args()
        .nth(2)
        .context("usage: decode_run DATA_DIRECTORY RUN_PREFIX")?;
    let started = Instant::now();
    let mut previous = decode_total_precipitation(directory.join(format!("{prefix}_00000_GB")))?;
    let mut checksum = 0.0_f64;
    for lead in 1..=24 {
        let current =
            decode_total_precipitation(directory.join(format!("{prefix}_{lead:03}00_GB")))?;
        checksum += hourly_precipitation(&previous, &current)?
            .into_iter()
            .map(f64::from)
            .sum::<f64>();
        previous = current;
    }
    println!(
        "decoded 24 hourly fields in {:.3}s (checksum {checksum:.6})",
        started.elapsed().as_secs_f64()
    );
    Ok(())
}
