use std::{fs, path::Path};

use anyhow::{Context, Result, ensure};
use chrono::{DateTime, Duration, NaiveDateTime, SecondsFormat, Utc};
use knmi_hdf5::{RadarFrame, RadarGrid};

use crate::{
    api::{ApiClient, RemoteFile},
    arome_tar::index_lead_members,
    grid::{IndexMap, SHARED_GRID},
    publisher::{ProducedChunk, produced_chunk},
};

pub const RTCOR_DATASET: &str = "nl_rdr_data_rtcor_5m";
pub const RTCOR_VERSION: &str = "1.0";
pub const NOWCAST_DATASET: &str = "radar_forecast";
pub const NOWCAST_VERSION: &str = "2.0";
pub const AROME_DATASET: &str = "harmonie_arome_cy43_p1";
pub const AROME_VERSION: &str = "1.0";

pub fn latest_files(
    api: &ApiClient,
    dataset: &str,
    version: &str,
    count: usize,
) -> Result<Vec<RemoteFile>> {
    let files = api.list_files(dataset, version, count)?;
    ensure!(!files.is_empty(), "KNMI returned no files for {dataset}");
    Ok(files)
}

pub fn build_rtcor_chunk(
    api: &ApiClient,
    cache_root: &Path,
    history_hours: u32,
) -> Result<(ProducedChunk, RadarGrid)> {
    let frame_count = usize::try_from(history_hours)?
        .checked_mul(12)
        .context("RTCOR history is too large")?;
    ensure!(frame_count > 0, "RTCOR history must be positive");
    let files = latest_files(api, RTCOR_DATASET, RTCOR_VERSION, frame_count)?;
    let mut products = Vec::with_capacity(files.len());
    for file in files {
        let path = api.cache_file(
            RTCOR_DATASET,
            RTCOR_VERSION,
            &file,
            &cache_root.join("rtcor"),
        )?;
        products.push(knmi_hdf5::decode_rtcor(path)?);
    }
    products.sort_by(|left, right| left.run.cmp(&right.run));
    let first = products.first().context("no RTCOR products decoded")?;
    let grid = first.grid.clone();
    ensure!(
        products.iter().all(|product| product.grid == grid),
        "RTCOR grid changed within backfill"
    );
    let map = IndexMap::radar(&grid)?;
    let mut frames = Vec::with_capacity(products.len());
    let mut times = Vec::with_capacity(products.len());
    for product in products {
        let frame = product
            .frames
            .into_iter()
            .next()
            .context("RTCOR product lacks precipitation frame")?;
        times.push(frame.time);
        frames.push(quantize_gathered(&map, &frame.rates_mm_h)?);
    }
    let run = times.last().context("RTCOR backfill is empty")?.clone();
    let filename = format!("rtcor-{}-h{history_hours}.mrf", compact_timestamp(&run)?);
    let meta = mrf::ChunkMeta::standard(SHARED_GRID.mrf_grid(), "rtcor", &run, times);
    Ok((
        produced_chunk(filename, mrf::encode(&frames, &meta)?)?,
        grid,
    ))
}

pub fn build_nowcast_chunk(
    api: &ApiClient,
    cache_root: &Path,
    horizon_minutes: u32,
) -> Result<(ProducedChunk, RadarGrid)> {
    let file = latest_files(api, NOWCAST_DATASET, NOWCAST_VERSION, 1)?
        .into_iter()
        .next()
        .expect("checked non-empty file list");
    let path = api.cache_file(
        NOWCAST_DATASET,
        NOWCAST_VERSION,
        &file,
        &cache_root.join("nowcast"),
    )?;
    let product = knmi_hdf5::decode_nowcast(path)?;
    let run_time = DateTime::parse_from_rfc3339(&product.run)?;
    let frames = product
        .frames
        .into_iter()
        .filter(|frame| {
            DateTime::parse_from_rfc3339(&frame.time)
                .is_ok_and(|time| time - run_time <= Duration::minutes(i64::from(horizon_minutes)))
        })
        .collect::<Vec<_>>();
    ensure!(
        !frames.is_empty(),
        "configured nowcast horizon has no frames"
    );
    let chunk = radar_frames_to_chunk(
        "nowcast",
        &product.run,
        frames,
        &product.grid,
        &format!("m{horizon_minutes}"),
    )?;
    Ok((chunk, product.grid))
}

fn radar_frames_to_chunk(
    source: &str,
    run: &str,
    frames: Vec<RadarFrame>,
    grid: &RadarGrid,
    variant: &str,
) -> Result<ProducedChunk> {
    let map = IndexMap::radar(grid)?;
    let mut quantized = Vec::with_capacity(frames.len());
    let mut times = Vec::with_capacity(frames.len());
    for frame in frames {
        times.push(frame.time);
        quantized.push(quantize_gathered(&map, &frame.rates_mm_h)?);
    }
    let filename = format!("{source}-{}-{variant}.mrf", compact_timestamp(run)?);
    let meta = mrf::ChunkMeta::standard(SHARED_GRID.mrf_grid(), source, run, times);
    produced_chunk(filename, mrf::encode(&quantized, &meta)?)
}

pub fn build_arome_chunk(
    api: &ApiClient,
    cache_root: &Path,
    horizon_hours: u32,
) -> Result<(ProducedChunk, u64)> {
    ensure!(
        (1..=60).contains(&horizon_hours),
        "AROME horizon must be 1..=60 hours"
    );
    let file = latest_files(api, AROME_DATASET, AROME_VERSION, 1)?
        .into_iter()
        .next()
        .expect("checked non-empty file list");
    let url = api.download_url(AROME_DATASET, AROME_VERSION, &file)?;
    let members = index_lead_members(
        |start, end| api.fetch_range(&url, start, end),
        horizon_hours,
    )?;
    let run = arome_run(&file.filename)?;
    let member_dir = cache_root.join("arome").join(compact_timestamp(&run)?);
    let mut paths = Vec::with_capacity(members.len());
    let mut downloaded_bytes = 0_u64;
    for member in &members {
        let path = member_dir.join(&member.name);
        let already_cached = path
            .metadata()
            .is_ok_and(|metadata| metadata.len() == member.size);
        api.cache_range(&url, member.data_offset, member.size, &path)?;
        if !already_cached {
            downloaded_bytes += member.size;
        }
        paths.push(path);
    }
    let totals = paths
        .iter()
        .map(knmi_grib::decode_total_precipitation)
        .collect::<Result<Vec<_>>>()?;
    ensure!(
        totals.len() == horizon_hours as usize + 1,
        "AROME member count changed while decoding"
    );
    let grid = totals[0].grid.clone();
    let map = IndexMap::arome(&grid)?;
    let run_time = DateTime::parse_from_rfc3339(&run)?;
    let mut frames = Vec::with_capacity(horizon_hours as usize);
    let mut times = Vec::with_capacity(horizon_hours as usize);
    for lead in 1..totals.len() {
        let rates = knmi_grib::hourly_precipitation(&totals[lead - 1], &totals[lead])?;
        frames.push(quantize_gathered(&map, &rates)?);
        times.push(
            (run_time + Duration::hours(lead as i64)).to_rfc3339_opts(SecondsFormat::Secs, true),
        );
    }
    let meta = mrf::ChunkMeta::standard(SHARED_GRID.mrf_grid(), "harmonie", &run, times);
    let filename = format!("harmonie-{}-h{horizon_hours}.mrf", compact_timestamp(&run)?);
    Ok((
        produced_chunk(filename, mrf::encode(&frames, &meta)?)?,
        downloaded_bytes,
    ))
}

fn quantize_gathered(map: &IndexMap, source: &[f32]) -> Result<Vec<u8>> {
    Ok(map.gather(source)?.into_iter().map(mrf::quantize).collect())
}

fn compact_timestamp(timestamp: &str) -> Result<String> {
    Ok(DateTime::parse_from_rfc3339(timestamp)?
        .with_timezone(&Utc)
        .format("%Y%m%dT%H%M")
        .to_string())
}

fn arome_run(filename: &str) -> Result<String> {
    let timestamp = filename
        .strip_prefix("HARM43_V1_P1_")
        .and_then(|name| name.strip_suffix(".tar"))
        .with_context(|| format!("unexpected AROME filename {filename}"))?;
    let run = NaiveDateTime::parse_from_str(&format!("{timestamp}0000"), "%Y%m%d%H%M%S")?.and_utc();
    Ok(run.to_rfc3339_opts(SecondsFormat::Secs, true))
}

pub fn prune_download_cache(cache_root: &Path, max_age: std::time::Duration) -> Result<()> {
    let cutoff = std::time::SystemTime::now()
        .checked_sub(max_age)
        .context("cache prune age is too large")?;
    prune_directory(cache_root, cutoff)
}

fn prune_directory(path: &Path, cutoff: std::time::SystemTime) -> Result<()> {
    if !path.exists() {
        return Ok(());
    }
    for entry in fs::read_dir(path)? {
        let entry = entry?;
        if entry.file_type()?.is_dir() {
            prune_directory(&entry.path(), cutoff)?;
            if fs::read_dir(entry.path())?.next().is_none() {
                fs::remove_dir(entry.path())?;
            }
        } else if entry.metadata()?.modified()? < cutoff {
            fs::remove_file(entry.path())?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_arome_run_timestamp() {
        assert_eq!(
            arome_run("HARM43_V1_P1_2026082813.tar").unwrap(),
            "2026-08-28T13:00:00Z"
        );
    }
}
