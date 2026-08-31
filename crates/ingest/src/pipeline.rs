use std::{fs, path::Path};

use anyhow::{Context, Result, ensure};
use chrono::{DateTime, Duration, NaiveDateTime, SecondsFormat, Utc};
use knmi_hdf5::{RadarFrame, RadarGrid};

use crate::{
    api::{ApiClient, RemoteFile},
    arome_tar::index_lead_members,
    grid::{HOURLY_GRID, IndexMap, SHARED_GRID, UV_GRID},
    publisher::{ProducedChunk, produced_chunk},
    wind_prior::WindTimeline,
};

pub const RTCOR_DATASET: &str = "nl_rdr_data_rtcor_5m";
pub const RTCOR_VERSION: &str = "1.0";
pub const NOWCAST_DATASET: &str = "radar_forecast";
pub const NOWCAST_VERSION: &str = "2.0";
pub const AROME_DATASET: &str = "harmonie_arome_cy43_p1";
pub const AROME_VERSION: &str = "1.0";
pub const UV_DATASET: &str = "cloud_modified_UV_index_benelux";
pub const UV_VERSION: &str = "1.0";
pub const SEAMLESS_DATASET: &str = "seamless_precipitation_ensemble_forecast_members";
pub const SEAMLESS_VERSION: &str = "1.0";
const CHUNK_FORMAT_GENERATION: u32 = 2;

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
    wind: &WindTimeline,
    previous_calibration: Option<motion::Calibration>,
) -> Result<(ProducedChunk, RadarGrid, motion::CalibrationReport)> {
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
    let meta = mrf::ChunkMeta::standard(SHARED_GRID.mrf_grid(), "rtcor", &run, times);
    let encoded = encode_rain_with_motion(&frames, &meta, wind, previous_calibration)?;
    let filename = generated_chunk_filename(
        &format!(
            "rtcor-{}-h{history_hours}-w{}-c{}",
            compact_timestamp(&run)?,
            compact_timestamp(&wind.run)?,
            calibration_suffix(encoded.report)
        ),
        &meta,
    );
    Ok((
        produced_chunk(filename, encoded.bytes)?,
        grid,
        encoded.report,
    ))
}

pub fn build_nowcast_chunk(
    api: &ApiClient,
    cache_root: &Path,
    horizon_minutes: u32,
    wind: &WindTimeline,
    previous_calibration: Option<motion::Calibration>,
) -> Result<(ProducedChunk, RadarGrid, motion::CalibrationReport)> {
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
        wind,
        previous_calibration,
    )?;
    Ok((chunk.0, product.grid, chunk.1))
}

pub fn build_seamless_chunk(
    api: &ApiClient,
    cache_root: &Path,
    start_after_minutes: u32,
    wind: &WindTimeline,
    previous_calibration: Option<motion::Calibration>,
) -> Result<(ProducedChunk, motion::CalibrationReport)> {
    ensure!(
        start_after_minutes < 360,
        "nowcast horizon must be shorter than the seamless horizon"
    );
    let file = latest_files(api, SEAMLESS_DATASET, SEAMLESS_VERSION, 1)?
        .into_iter()
        .next()
        .expect("checked non-empty file list");
    let path = api.cache_file(
        SEAMLESS_DATASET,
        SEAMLESS_VERSION,
        &file,
        &cache_root.join("seamless"),
    )?;
    let product = knmi_hdf5::decode_seamless(path, start_after_minutes)?;
    let map = IndexMap::seamless(&product.grid)?;
    let run_time = DateTime::parse_from_rfc3339(&product.run)?;
    let mut frames = Vec::with_capacity(product.frames.len());
    let mut times = Vec::with_capacity(product.frames.len());
    for frame in product.frames {
        times.push(frame.time);
        frames.push(quantize_gathered(&map, &frame.rates_mm_h)?);
    }
    let first_time = DateTime::parse_from_rfc3339(times.first().context("no seamless frames")?)?;
    let last_time = DateTime::parse_from_rfc3339(times.last().context("no seamless frames")?)?;
    let first_lead = (first_time - run_time).num_minutes();
    let last_lead = (last_time - run_time).num_minutes();
    let meta = mrf::ChunkMeta::standard(SHARED_GRID.mrf_grid(), "seamless", &product.run, times);
    let encoded = encode_rain_with_motion(&frames, &meta, wind, previous_calibration)?;
    let filename = generated_chunk_filename(
        &format!(
            "seamless-{}-m{first_lead}-{last_lead}-w{}-c{}",
            compact_timestamp(&product.run)?,
            compact_timestamp(&wind.run)?,
            calibration_suffix(encoded.report)
        ),
        &meta,
    );
    Ok((produced_chunk(filename, encoded.bytes)?, encoded.report))
}

fn radar_frames_to_chunk(
    source: &str,
    run: &str,
    frames: Vec<RadarFrame>,
    grid: &RadarGrid,
    variant: &str,
    wind: &WindTimeline,
    previous_calibration: Option<motion::Calibration>,
) -> Result<(ProducedChunk, motion::CalibrationReport)> {
    let map = IndexMap::radar(grid)?;
    let mut quantized = Vec::with_capacity(frames.len());
    let mut times = Vec::with_capacity(frames.len());
    for frame in frames {
        times.push(frame.time);
        quantized.push(quantize_gathered(&map, &frame.rates_mm_h)?);
    }
    let meta = mrf::ChunkMeta::standard(SHARED_GRID.mrf_grid(), source, run, times);
    let encoded = encode_rain_with_motion(&quantized, &meta, wind, previous_calibration)?;
    let filename = generated_chunk_filename(
        &format!(
            "{source}-{}-{variant}-w{}-c{}",
            compact_timestamp(run)?,
            compact_timestamp(&wind.run)?,
            calibration_suffix(encoded.report)
        ),
        &meta,
    );
    Ok((produced_chunk(filename, encoded.bytes)?, encoded.report))
}

pub struct AromePublication {
    pub chunks: Vec<ProducedChunk>,
    pub downloaded_bytes: u64,
    pub wind: WindTimeline,
    pub calibration: motion::CalibrationReport,
}

pub fn build_arome_chunks(
    api: &ApiClient,
    cache_root: &Path,
    horizon_hours: u32,
    previous_calibration: Option<motion::Calibration>,
) -> Result<AromePublication> {
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
    let mut decoded = paths.iter().map(knmi_grib::decode_arome_fields);
    let first = decoded.next().context("AROME member set is empty")??;
    let grid = first.precipitation_mm.grid.clone();
    validate_arome_fields(&first, &grid)?;
    let rain_map = IndexMap::arome(&grid)?;
    let hourly_map = IndexMap::arome_on(&grid, HOURLY_GRID)?;
    let motion_wind_map = IndexMap::arome_clamped_on(&grid, SHARED_GRID)?;
    let run_time = DateTime::parse_from_rfc3339(&run)?;
    let mut wind_times = vec![run_time.with_timezone(&Utc)];
    let mut motion_wind_frames = vec![motion_wind_blocks(
        &motion_wind_map,
        &first.motion_wind_u_ms.values,
        &first.motion_wind_v_ms.values,
    )?];
    let capacity = horizon_hours as usize;
    let mut rain_frames = Vec::with_capacity(capacity);
    let mut temperature_frames = Vec::with_capacity(capacity);
    let mut feels_like_frames = Vec::with_capacity(capacity);
    let mut wind_u_frames = Vec::with_capacity(capacity);
    let mut wind_v_frames = Vec::with_capacity(capacity);
    let mut radiation_frames = Vec::with_capacity(capacity);
    let mut relative_humidity_frames = Vec::with_capacity(capacity);
    let mut cloud_fraction_frames = Vec::with_capacity(capacity);
    let mut times = Vec::with_capacity(horizon_hours as usize);
    let temperature_quant = temperature_quantization_table();
    let feels_like_quant = temperature_quant.clone();
    let wind_quant = wind_quantization_table();
    let radiation_quant = radiation_quantization_table();
    let percent_quant = percent_quantization_table();
    let mut previous_precipitation = first.precipitation_mm;
    let mut previous_radiation = first.global_radiation_j_m2;

    for (lead, current) in decoded.enumerate() {
        let lead = lead + 1;
        let current = current?;
        validate_arome_fields(&current, &grid)?;
        ensure!(
            current.temperature_k.end_step == lead as i64,
            "AROME lead-time order changed while decoding"
        );
        let valid_time = run_time + Duration::hours(lead as i64);
        wind_times.push(valid_time.with_timezone(&Utc));
        motion_wind_frames.push(motion_wind_blocks(
            &motion_wind_map,
            &current.motion_wind_u_ms.values,
            &current.motion_wind_v_ms.values,
        )?);
        let rates =
            knmi_grib::hourly_precipitation(&previous_precipitation, &current.precipitation_mm)?;
        rain_frames.push(quantize_gathered(&rain_map, &rates)?);

        let temperature = hourly_map
            .gather(&current.temperature_k.values)?
            .into_iter()
            .map(|value| value - 273.15)
            .collect::<Vec<_>>();
        let relative_humidity = hourly_map.gather(&current.relative_humidity.values)?;
        let relative_humidity_percent = relative_humidity
            .iter()
            .map(|value| value * 100.0)
            .collect::<Vec<_>>();
        let cloud_fraction = hourly_map
            .gather(&current.total_cloud_cover.values)?
            .into_iter()
            .map(|value| value * 100.0)
            .collect::<Vec<_>>();
        let wind_u = hourly_map.gather(&current.wind_u_ms.values)?;
        let wind_v = hourly_map.gather(&current.wind_v_ms.values)?;
        let feels_like = temperature
            .iter()
            .zip(&relative_humidity)
            .zip(wind_u.iter().zip(&wind_v))
            .map(|((temperature, humidity), (wind_u, wind_v))| {
                feels_like_c(*temperature, *humidity, *wind_u, *wind_v)
            })
            .collect::<Vec<_>>();
        temperature_frames.push(quantize_values(&temperature, &temperature_quant)?);
        feels_like_frames.push(quantize_values(&feels_like, &feels_like_quant)?);
        wind_u_frames.push(quantize_values(&wind_u, &wind_quant)?);
        wind_v_frames.push(quantize_values(&wind_v, &wind_quant)?);
        relative_humidity_frames.push(quantize_values(&relative_humidity_percent, &percent_quant)?);
        cloud_fraction_frames.push(quantize_values(&cloud_fraction, &percent_quant)?);

        let radiation =
            knmi_grib::hourly_precipitation(&previous_radiation, &current.global_radiation_j_m2)?
                .into_iter()
                .map(|energy| energy / 3_600.0)
                .collect::<Vec<_>>();
        let radiation = hourly_map.gather(&radiation)?;
        radiation_frames.push(quantize_values(&radiation, &radiation_quant)?);
        times.push(valid_time.to_rfc3339_opts(SecondsFormat::Secs, true));
        previous_precipitation = current.precipitation_mm;
        previous_radiation = current.global_radiation_j_m2;
    }
    ensure!(
        times.len() == horizon_hours as usize,
        "AROME member count changed while decoding"
    );
    let wind = WindTimeline::new(run.clone(), wind_times, motion_wind_frames)?;

    let compact_run = compact_timestamp(&run)?;
    let rain_meta =
        mrf::ChunkMeta::standard(SHARED_GRID.mrf_grid(), "harmonie", &run, times.clone());
    let encoded = encode_rain_with_motion(&rain_frames, &rain_meta, &wind, previous_calibration)?;
    let calibration = encoded.report;
    let rain = produced_chunk(
        generated_chunk_filename(
            &format!(
                "harmonie-{compact_run}-h{horizon_hours}-w{compact_run}-c{}",
                calibration_suffix(encoded.report)
            ),
            &rain_meta,
        ),
        encoded.bytes,
    )?;
    let field_chunk =
        |field: &str, frames: &[Vec<u8>], quant: Vec<Option<f32>>| -> Result<ProducedChunk> {
            let meta =
                mrf::ChunkMeta::standard(HOURLY_GRID.mrf_grid(), "harmonie", &run, times.clone())
                    .with_field(field, quant);
            produced_chunk(
                generated_chunk_filename(
                    &format!("harmonie-{field}-{compact_run}-h{horizon_hours}"),
                    &meta,
                ),
                mrf::encode(frames, &meta)?,
            )
        };
    let chunks = vec![
        rain,
        field_chunk("temp_c", &temperature_frames, temperature_quant)?,
        field_chunk("feels_like_c", &feels_like_frames, feels_like_quant)?,
        field_chunk("wind_u_ms", &wind_u_frames, wind_quant.clone())?,
        field_chunk("wind_v_ms", &wind_v_frames, wind_quant)?,
        field_chunk("radiation", &radiation_frames, radiation_quant)?,
        field_chunk(
            "rel_humidity",
            &relative_humidity_frames,
            percent_quant.clone(),
        )?,
        field_chunk("cloud_frac", &cloud_fraction_frames, percent_quant)?,
    ];
    validate_wind_pair(&chunks)?;
    Ok(AromePublication {
        chunks,
        downloaded_bytes,
        wind,
        calibration,
    })
}

pub fn build_uv_chunk(
    api: &ApiClient,
    cache_root: &Path,
    file: &RemoteFile,
    now: DateTime<Utc>,
) -> Result<Option<ProducedChunk>> {
    let run = DateTime::parse_from_rfc3339(&file.last_modified)?.with_timezone(&Utc);
    let cache_version = run.format("%Y%m%dT%H%M%S").to_string();
    let path = api.cache_file(
        UV_DATASET,
        UV_VERSION,
        file,
        &cache_root.join("uv").join(cache_version),
    )?;
    let product = knmi_hdf5::decode_uv_index(path)?;
    if !uv_window_active(&product.date, now)? || product.frames.is_empty() {
        return Ok(None);
    }
    let map = IndexMap::uv(&product.grid)?;
    let quant = uv_quantization_table();
    let mut frames = Vec::with_capacity(product.frames.len());
    let mut times = Vec::with_capacity(product.frames.len());
    for frame in product.frames {
        times.push(frame.time);
        frames.push(quantize_values(&map.gather(&frame.values)?, &quant)?);
    }
    let run = run.to_rfc3339_opts(SecondsFormat::Secs, true);
    let meta =
        mrf::ChunkMeta::standard(UV_GRID.mrf_grid(), "uv", &run, times).with_field("uv", quant);
    let filename = generated_chunk_filename(
        &format!(
            "uv-{}",
            DateTime::parse_from_rfc3339(&run)?.format("%Y%m%dT%H%M%S")
        ),
        &meta,
    );
    Ok(Some(produced_chunk(
        filename,
        mrf::encode(&frames, &meta)?,
    )?))
}

fn uv_window_active(date: &str, now: DateTime<Utc>) -> Result<bool> {
    let window_start =
        NaiveDateTime::parse_from_str(&format!("{date}030000"), "%Y%m%d%H%M%S")?.and_utc();
    let window_end = window_start + Duration::hours(18) + Duration::minutes(45);
    Ok(now >= window_start && now <= window_end)
}

fn quantize_gathered(map: &IndexMap, source: &[f32]) -> Result<Vec<u8>> {
    Ok(map.gather(source)?.into_iter().map(mrf::quantize).collect())
}

fn quantize_values(values: &[f32], quant: &[Option<f32>]) -> Result<Vec<u8>> {
    values
        .iter()
        .map(|value| mrf::quantize_with_table(*value, quant).map_err(Into::into))
        .collect()
}

struct EncodedMotion {
    bytes: Vec<u8>,
    report: motion::CalibrationReport,
}

fn encode_rain_with_motion(
    frames: &[Vec<u8>],
    meta: &mrf::ChunkMeta,
    wind: &WindTimeline,
    previous_calibration: Option<motion::Calibration>,
) -> Result<EncodedMotion> {
    if frames.len() < 2 {
        let (calibration, source) = previous_calibration.map_or_else(
            || {
                (
                    motion::Calibration::default(),
                    motion::CalibrationSource::Default,
                )
            },
            |calibration| (calibration, motion::CalibrationSource::PreviousRun),
        );
        return Ok(EncodedMotion {
            bytes: mrf::encode(frames, meta)?,
            report: motion::CalibrationReport {
                calibration,
                source,
                reliable_samples: 0,
            },
        });
    }
    let width = meta.grid.width;
    let height = meta.grid.height;
    let estimated_grid = motion::grid_for(width, height)?;
    let motion_grid = mrf::MotionGrid {
        bw: estimated_grid.bw,
        bh: estimated_grid.bh,
    };
    ensure!(
        wind.vector_count() == estimated_grid.bw as usize * estimated_grid.bh as usize,
        "wind prior grid does not match rain motion grid"
    );
    let mut correlations = Vec::with_capacity(frames.len() - 1);
    let mut winds = Vec::with_capacity(frames.len() - 1);
    let mut previous = dequantize_rain_frame(&frames[0], &meta.quant);
    for (index, frame) in frames.iter().enumerate().skip(1) {
        let current = dequantize_rain_frame(frame, &meta.quant);
        let previous_time = DateTime::parse_from_rfc3339(&meta.frame_times[index - 1])?;
        let current_time = DateTime::parse_from_rfc3339(&meta.frame_times[index])?;
        ensure!(
            current_time > previous_time,
            "rain frame times must increase"
        );
        let interval_minutes = (current_time - previous_time).num_seconds() as f32 / 60.0;
        let field = motion::correlate(&previous, &current, width, height, interval_minutes)?;
        ensure!(
            field.grid == estimated_grid,
            "motion estimator returned a different grid"
        );
        let midpoint = previous_time + (current_time - previous_time) / 2;
        winds.push(wind.interpolate(midpoint.with_timezone(&Utc)));
        correlations.push(field);
        previous = current;
    }
    let report = motion::calibrate(&correlations, &winds, previous_calibration)?;
    let mut annexes = Vec::with_capacity(frames.len());
    annexes.push(None);
    for (correlation, wind) in correlations.iter().zip(&winds) {
        annexes.push(Some(
            motion::blend_with_wind(correlation, wind, report.calibration)?.vectors,
        ));
    }
    Ok(EncodedMotion {
        bytes: mrf::encode_with_motion(frames, meta, motion_grid, &annexes)?,
        report,
    })
}

fn motion_wind_blocks(
    map: &IndexMap,
    source_u: &[f32],
    source_v: &[f32],
) -> Result<Vec<Option<(f32, f32)>>> {
    let u = map.gather(source_u)?;
    let v = map.gather(source_v)?;
    let grid = motion::grid_for(SHARED_GRID.width, SHARED_GRID.height)?;
    let mut result = Vec::with_capacity(grid.bw as usize * grid.bh as usize);
    for block_y in 0..grid.bh as usize {
        let y0 = block_y * motion::BLOCK_SIZE;
        let y1 = (y0 + motion::BLOCK_SIZE).min(SHARED_GRID.height as usize);
        let center_y = SHARED_GRID.y0 + (y0 + y1) as f64 * 0.5 * SHARED_GRID.dy;
        let latitude = 2.0 * (center_y / 6_378_137.0).exp().atan() - std::f64::consts::FRAC_PI_2;
        let projected_cells_per_minute = 60.0 / 1_000.0 / latitude.cos() as f32;
        for block_x in 0..grid.bw as usize {
            let x0 = block_x * motion::BLOCK_SIZE;
            let x1 = (x0 + motion::BLOCK_SIZE).min(SHARED_GRID.width as usize);
            let mut sum_u = 0.0_f32;
            let mut sum_v = 0.0_f32;
            let mut count = 0_usize;
            for y in y0..y1 {
                for x in x0..x1 {
                    let index = y * SHARED_GRID.width as usize + x;
                    if u[index].is_finite() && v[index].is_finite() {
                        sum_u += u[index];
                        sum_v += v[index];
                        count += 1;
                    }
                }
            }
            result.push((count > 0).then(|| {
                (
                    sum_u / count as f32 * projected_cells_per_minute,
                    -sum_v / count as f32 * projected_cells_per_minute,
                )
            }));
        }
    }
    Ok(result)
}

fn dequantize_rain_frame(frame: &[u8], quant: &[Option<f32>]) -> Vec<f32> {
    frame
        .iter()
        .map(|value| quant[*value as usize].unwrap_or(f32::NAN))
        .collect()
}

fn generated_chunk_filename(stem: &str, meta: &mrf::ChunkMeta) -> String {
    let mut hash = 0xcbf2_9ce4_8422_2325_u64;
    let mut update = |bytes: &[u8]| {
        for byte in bytes {
            hash ^= u64::from(*byte);
            hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
        }
    };
    update(&CHUNK_FORMAT_GENERATION.to_le_bytes());
    update(meta.field.as_bytes());
    update(meta.grid.crs.as_bytes());
    for value in [meta.grid.x0, meta.grid.y0, meta.grid.dx, meta.grid.dy] {
        update(&value.to_bits().to_le_bytes());
    }
    update(&meta.grid.width.to_le_bytes());
    update(&meta.grid.height.to_le_bytes());
    for value in &meta.quant {
        match value {
            Some(value) => {
                update(&[1]);
                update(&value.to_bits().to_le_bytes());
            }
            None => update(&[0]),
        }
    }
    format!("{stem}-g{hash:016x}.mrf")
}

fn calibration_suffix(report: motion::CalibrationReport) -> String {
    format!(
        "{:08x}{:08x}",
        report.calibration.scale.to_bits(),
        report.calibration.rotation_radians.to_bits()
    )
}

pub fn temperature_quantization_table() -> Vec<Option<f32>> {
    linear_quantization_table(-31.2, 0.3)
}

pub fn wind_quantization_table() -> Vec<Option<f32>> {
    linear_quantization_table(-31.75, 0.25)
}

pub fn radiation_quantization_table() -> Vec<Option<f32>> {
    linear_quantization_table(0.0, 5.0)
}

pub fn uv_quantization_table() -> Vec<Option<f32>> {
    linear_quantization_table(0.0, 12.0 / 254.0)
}

pub fn percent_quantization_table() -> Vec<Option<f32>> {
    linear_quantization_table(0.0, 100.0 / 254.0)
}

fn linear_quantization_table(start: f32, step: f32) -> Vec<Option<f32>> {
    (0..255)
        .map(|index| Some(start + index as f32 * step))
        .chain(std::iter::once(None))
        .collect()
}

pub fn feels_like_c(
    temperature_c: f32,
    relative_humidity: f32,
    wind_u_ms: f32,
    wind_v_ms: f32,
) -> f32 {
    if [temperature_c, relative_humidity, wind_u_ms, wind_v_ms]
        .into_iter()
        .any(f32::is_nan)
    {
        return f32::NAN;
    }
    let wind_ms = wind_u_ms.hypot(wind_v_ms);
    if temperature_c <= 10.0 && wind_ms > 4.8 / 3.6 {
        let wind_factor = (wind_ms * 3.6).powf(0.16);
        return 13.12 + 0.6215 * temperature_c - 11.37 * wind_factor
            + 0.3965 * temperature_c * wind_factor;
    }
    if temperature_c >= 26.7 && relative_humidity >= 0.4 {
        return heat_index_c(temperature_c, relative_humidity * 100.0);
    }
    temperature_c
}

fn heat_index_c(temperature_c: f32, relative_humidity_percent: f32) -> f32 {
    let temperature_f = temperature_c * 1.8 + 32.0;
    let simple = 0.5
        * (temperature_f + 61.0 + (temperature_f - 68.0) * 1.2 + relative_humidity_percent * 0.094);
    if (simple + temperature_f) / 2.0 < 80.0 {
        return temperature_c;
    }
    let t = temperature_f;
    let rh = relative_humidity_percent;
    let mut heat_index = -42.379 + 2.049_015_3 * t + 10.143_332 * rh
        - 0.224_755_4 * t * rh
        - 0.006_837_83 * t * t
        - 0.054_817_17 * rh * rh
        + 0.001_228_74 * t * t * rh
        + 0.000_852_82 * t * rh * rh
        - 0.000_001_99 * t * t * rh * rh;
    if rh < 13.0 && (80.0..=112.0).contains(&t) {
        heat_index -= ((13.0 - rh) / 4.0) * ((17.0 - (t - 95.0).abs()) / 17.0).sqrt();
    } else if rh > 85.0 && (80.0..=87.0).contains(&t) {
        heat_index += ((rh - 85.0) / 10.0) * ((87.0 - t) / 5.0);
    }
    (heat_index - 32.0) / 1.8
}

fn validate_arome_fields(
    fields: &knmi_grib::AromeFields,
    grid: &knmi_grib::GridDefinition,
) -> Result<()> {
    let selected = [
        &fields.precipitation_mm,
        &fields.temperature_k,
        &fields.relative_humidity,
        &fields.wind_u_ms,
        &fields.wind_v_ms,
        &fields.motion_wind_u_ms,
        &fields.motion_wind_v_ms,
        &fields.global_radiation_j_m2,
        &fields.total_cloud_cover,
    ];
    ensure!(
        selected.iter().all(|field| &field.grid == grid),
        "selected AROME fields do not share one grid"
    );
    let end_step = fields.temperature_k.end_step;
    ensure!(
        selected.iter().all(|field| field.end_step == end_step),
        "selected AROME fields do not share one lead time"
    );
    Ok(())
}

pub fn validate_wind_pair(chunks: &[ProducedChunk]) -> Result<()> {
    let wind_u = chunks
        .iter()
        .find(|chunk| chunk.manifest.field == "wind_u_ms")
        .context("wind U chunk is missing")?;
    let wind_v = chunks
        .iter()
        .find(|chunk| chunk.manifest.field == "wind_v_ms")
        .context("wind V chunk is missing")?;
    let wind_u_header = mrf::parse_header(&wind_u.bytes)?.header;
    let wind_v_header = mrf::parse_header(&wind_v.bytes)?.header;
    ensure!(
        wind_u_header.grid == wind_v_header.grid,
        "wind grids differ"
    );
    ensure!(
        wind_u.manifest.times == wind_v.manifest.times,
        "wind times or frame order differ"
    );
    ensure!(
        wind_u_header.frames.len() == wind_v_header.frames.len(),
        "wind frame counts differ"
    );
    Ok(())
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

    #[test]
    fn feels_like_uses_wind_chill_heat_index_and_fallback() {
        let wind_chill = feels_like_c(-5.0, 0.8, 20.0 / 3.6, 0.0);
        assert!((wind_chill - -11.6).abs() < 0.1);
        let heat_index = feels_like_c(32.0, 0.7, 0.0, 0.0);
        assert!((heat_index - 40.4).abs() < 0.2);
        assert_eq!(feels_like_c(18.0, 0.7, 4.0, 3.0), 18.0);
    }

    #[test]
    fn field_quantization_tables_cover_the_documented_ranges() {
        let temperature = temperature_quantization_table();
        assert_eq!(temperature[0], Some(-31.2));
        assert!((temperature[254].unwrap() - 45.0).abs() < 0.0001);
        let wind = wind_quantization_table();
        assert_eq!(wind[127], Some(0.0));
        assert_eq!(radiation_quantization_table()[254], Some(1_270.0));
        assert!((uv_quantization_table()[254].unwrap() - 12.0).abs() < 0.0001);
        assert_eq!(percent_quantization_table()[0], Some(0.0));
        assert!((percent_quantization_table()[254].unwrap() - 100.0).abs() < 0.0001);
    }

    #[test]
    fn uv_window_is_only_active_during_the_documented_utc_day() {
        let timestamp = |value: &str| {
            DateTime::parse_from_rfc3339(value)
                .unwrap()
                .with_timezone(&Utc)
        };
        assert!(!uv_window_active("20260828", timestamp("2026-08-28T02:59:59Z")).unwrap());
        assert!(uv_window_active("20260828", timestamp("2026-08-28T03:00:00Z")).unwrap());
        assert!(uv_window_active("20260828", timestamp("2026-08-28T21:45:00Z")).unwrap());
        assert!(!uv_window_active("20260828", timestamp("2026-08-28T21:45:01Z")).unwrap());
    }

    #[test]
    fn wind_pair_requires_identical_grid_times_and_order() {
        let make = |field: &str, times: Vec<String>| {
            let meta = mrf::ChunkMeta::standard(
                HOURLY_GRID.mrf_grid(),
                "harmonie",
                "2026-08-28T12:00:00Z",
                times.clone(),
            )
            .with_field(field, wind_quantization_table());
            produced_chunk(
                format!("{field}.mrf"),
                mrf::encode(
                    &vec![vec![127; HOURLY_GRID.cell_count()]; times.len()],
                    &meta,
                )
                .unwrap(),
            )
            .unwrap()
        };
        let times = vec![
            "2026-08-28T13:00:00Z".to_owned(),
            "2026-08-28T14:00:00Z".to_owned(),
        ];
        let valid = [
            make("wind_u_ms", times.clone()),
            make("wind_v_ms", times.clone()),
        ];
        validate_wind_pair(&valid).unwrap();
        let invalid = [
            make("wind_u_ms", times),
            make(
                "wind_v_ms",
                vec![
                    "2026-08-28T14:00:00Z".to_owned(),
                    "2026-08-28T13:00:00Z".to_owned(),
                ],
            ),
        ];
        assert!(validate_wind_pair(&invalid).is_err());
    }

    #[test]
    fn rain_encoder_adds_motion_but_other_fields_remain_annex_free() {
        let grid = mrf::Grid {
            crs: "EPSG:3857".to_owned(),
            x0: 0.0,
            y0: 64_000.0,
            dx: 1_000.0,
            dy: -1_000.0,
            width: 64,
            height: 64,
        };
        let times = vec![
            "2026-08-28T12:00:00Z".to_owned(),
            "2026-08-28T12:05:00Z".to_owned(),
        ];
        let meta =
            mrf::ChunkMeta::standard(grid.clone(), "rtcor", "2026-08-28T12:05:00Z", times.clone());
        let mut previous = vec![0_u8; 64 * 64];
        let mut current = vec![0_u8; 64 * 64];
        for y in 10..50 {
            for x in 10..50 {
                let value = 20 + ((x * 7 + y * 11) % 30) as u8;
                previous[y * 64 + x] = value;
                current[(y + 2) * 64 + x + 3] = value;
            }
        }
        let wind = WindTimeline::new(
            "2026-08-28T12:00:00Z".into(),
            times
                .iter()
                .map(|time| {
                    DateTime::parse_from_rfc3339(time)
                        .unwrap()
                        .with_timezone(&Utc)
                })
                .collect(),
            vec![vec![Some((0.1, 0.0)); 4]; 2],
        )
        .unwrap();
        let rain = mrf::decode(
            &encode_rain_with_motion(&[previous, current], &meta, &wind, None)
                .unwrap()
                .bytes,
        )
        .unwrap();
        assert_eq!(
            rain.header.motion_grid,
            Some(mrf::MotionGrid { bw: 2, bh: 2 })
        );
        assert!(rain.motions[0].is_none());
        assert!(rain.motions[1].is_some());

        let temp_meta = mrf::ChunkMeta::standard(grid, "harmonie", "2026-08-28T12:00:00Z", times)
            .with_field("temp_c", temperature_quantization_table());
        let temp_frames = vec![vec![100; 64 * 64]; 2];
        let temp = mrf::decode(&mrf::encode(&temp_frames, &temp_meta).unwrap()).unwrap();
        assert!(temp.header.motion_grid.is_none());
        assert!(temp.motions.iter().all(Option::is_none));
    }

    #[test]
    fn chunk_generation_is_stable_and_changes_with_grid_or_quantization() {
        let base = mrf::ChunkMeta::standard(
            SHARED_GRID.mrf_grid(),
            "rtcor",
            "2026-08-28T12:00:00Z",
            vec!["2026-08-28T12:00:00Z".to_owned()],
        );
        let first = generated_chunk_filename("rtcor-run-h3", &base);
        assert_eq!(first, generated_chunk_filename("rtcor-run-h3", &base));
        assert!(first.starts_with("rtcor-run-h3-g"));

        let mut changed_grid = base.clone();
        changed_grid.grid.width += 1;
        assert_ne!(
            first,
            generated_chunk_filename("rtcor-run-h3", &changed_grid)
        );

        let mut changed_quant = base.clone();
        changed_quant.quant[1] = Some(changed_quant.quant[1].unwrap() + 0.001);
        assert_ne!(
            first,
            generated_chunk_filename("rtcor-run-h3", &changed_quant)
        );
    }
}
