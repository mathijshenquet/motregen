use std::{fs, path::Path, time::Instant};

use anyhow::{Context, Result, ensure};
use chrono::{DateTime, Duration, DurationRound, NaiveDateTime, SecondsFormat, Utc};
use knmi_hdf5::{RadarFrame, RadarGrid};
use rayon::prelude::*;
use tracing::info;

use crate::{
    api::{ApiClient, RemoteFile},
    arome_tar::index_lead_members,
    grid::{
        DETAIL_GRID, HOURLY_GRID, IndexMap, RADIATION_GRID, SHARED_GRID, SUMMARY_GRID, UV_GRID,
    },
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
    let encoded = encode_rain_with_motion(
        &frames,
        &meta,
        wind,
        previous_calibration,
        MotionParallelism::Inline,
    )?;
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
    build_seamless_chunk_for_file(
        api,
        cache_root,
        &file,
        start_after_minutes,
        wind,
        previous_calibration,
    )
}

pub fn build_seamless_chunk_for_file(
    api: &ApiClient,
    cache_root: &Path,
    file: &RemoteFile,
    start_after_minutes: u32,
    wind: &WindTimeline,
    previous_calibration: Option<motion::Calibration>,
) -> Result<(ProducedChunk, motion::CalibrationReport)> {
    ensure!(
        start_after_minutes < 360,
        "nowcast horizon must be shorter than the seamless horizon"
    );
    let path = api.cache_file(
        SEAMLESS_DATASET,
        SEAMLESS_VERSION,
        file,
        &cache_root.join("seamless"),
    )?;
    let frames_started = Instant::now();
    let decoder = knmi_hdf5::SeamlessDecoder::open(path, start_after_minutes)?;
    let run = decoder.run().to_owned();
    let map = IndexMap::seamless(decoder.grid())?;
    let run_time = DateTime::parse_from_rfc3339(&run)?;
    let mut frames = Vec::with_capacity(decoder.len());
    let mut times = Vec::with_capacity(decoder.len());
    for frame in decoder {
        let frame = frame?;
        times.push(frame.time);
        frames.push(quantize_gathered(&map, &frame.rates_mm_h)?);
    }
    let first_time = DateTime::parse_from_rfc3339(times.first().context("no seamless frames")?)?;
    let last_time = DateTime::parse_from_rfc3339(times.last().context("no seamless frames")?)?;
    let first_lead = (first_time - run_time).num_minutes();
    let last_lead = (last_time - run_time).num_minutes();
    let meta = mrf::ChunkMeta::standard(SHARED_GRID.mrf_grid(), "seamless", &run, times);
    let frames_elapsed = frames_started.elapsed();
    let motion_started = Instant::now();
    let encoded = encode_rain_with_motion(
        &frames,
        &meta,
        wind,
        previous_calibration,
        MotionParallelism::TwoThreads,
    )?;
    info!(
        frame_prepare_seconds = frames_elapsed.as_secs_f64(),
        motion_encode_seconds = motion_started.elapsed().as_secs_f64(),
        "seamless processing phases"
    );
    let filename = generated_chunk_filename(
        &format!(
            "seamless-{}-m{first_lead}-{last_lead}-w{}-c{}",
            compact_timestamp(&run)?,
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
    let encoded = encode_rain_with_motion(
        &quantized,
        &meta,
        wind,
        previous_calibration,
        MotionParallelism::Inline,
    )?;
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
    let mut decoded = decode_arome_run(api, cache_root, &file, horizon_hours, true)?;
    let run = decoded.run.clone();
    let times = decoded.times.clone();
    let wind = WindTimeline::new(
        run.clone(),
        std::mem::take(&mut decoded.wind_times),
        std::mem::take(&mut decoded.motion_wind_frames),
    )?;

    let compact_run = compact_timestamp(&run)?;
    let rain_meta =
        mrf::ChunkMeta::standard(SHARED_GRID.mrf_grid(), "harmonie", &run, times.clone());
    let encoded = encode_rain_with_motion(
        &decoded.rain_frames,
        &rain_meta,
        &wind,
        previous_calibration,
        MotionParallelism::Inline,
    )?;
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
    let mut chunks = vec![rain];
    chunks.extend(hourly_field_chunks(&decoded, &format!("h{horizon_hours}"))?);
    validate_wind_pair(&chunks)?;
    Ok(AromePublication {
        chunks,
        downloaded_bytes: decoded.downloaded_bytes,
        wind,
        calibration,
    })
}

pub struct AromeHistory {
    pub chunks: Vec<ProducedChunk>,
    pub downloaded_bytes: u64,
}

/// Older run whose early leads cover the hours between `now - history_hours`
/// and the current run start, as `(file, leads)`; `None` when the current
/// run already reaches far enough back.
pub fn arome_history_choice(
    files: &[RemoteFile],
    current_run: DateTime<Utc>,
    now: DateTime<Utc>,
    history_hours: u32,
) -> Result<Option<(RemoteFile, u32)>> {
    let first_row = now
        .duration_trunc(Duration::hours(1))?
        .checked_sub_signed(Duration::hours(i64::from(history_hours)))
        .context("history window underflow")?;
    if current_run + Duration::hours(1) <= first_row {
        return Ok(None);
    }
    let latest_start = (first_row - Duration::hours(1)).min(current_run - Duration::hours(1));
    let mut best: Option<(RemoteFile, DateTime<Utc>)> = None;
    for file in files {
        let Ok(run) = arome_run(&file.filename) else {
            continue;
        };
        let run = DateTime::parse_from_rfc3339(&run)?.with_timezone(&Utc);
        if run <= latest_start && best.as_ref().is_none_or(|(_, best)| run > *best) {
            best = Some((file.clone(), run));
        }
    }
    let Some((file, run)) = best else {
        return Ok(None);
    };
    let leads = u32::try_from((current_run - run).num_hours())?;
    ensure!(
        (1..=60).contains(&leads),
        "AROME history run {} is {leads} h older than the current run",
        file.filename
    );
    Ok(Some((file, leads)))
}

pub fn build_arome_history_chunks(
    api: &ApiClient,
    cache_root: &Path,
    current_run: &str,
    now: DateTime<Utc>,
    history_hours: u32,
) -> Result<Option<AromeHistory>> {
    if history_hours == 0 {
        return Ok(None);
    }
    let current_run = DateTime::parse_from_rfc3339(current_run)?.with_timezone(&Utc);
    let files = latest_files(api, AROME_DATASET, AROME_VERSION, 24)?;
    let Some((file, leads)) = arome_history_choice(&files, current_run, now, history_hours)? else {
        return Ok(None);
    };
    let decoded = decode_arome_run(api, cache_root, &file, leads, false)?;
    let chunks = hourly_field_chunks(&decoded, &format!("hist{leads}"))?;
    validate_wind_pair(&chunks)?;
    Ok(Some(AromeHistory {
        chunks,
        downloaded_bytes: decoded.downloaded_bytes,
    }))
}

struct DecodedArome {
    run: String,
    times: Vec<String>,
    downloaded_bytes: u64,
    rain_frames: Vec<Vec<u8>>,
    wind_times: Vec<DateTime<Utc>>,
    motion_wind_frames: Vec<Vec<Option<(f32, f32)>>>,
    temperature: Vec<Vec<u8>>,
    feels_like: Vec<Vec<u8>>,
    wind_u: Vec<Vec<u8>>,
    wind_v: Vec<Vec<u8>>,
    gust: Vec<Vec<u8>>,
    radiation: Vec<Vec<u8>>,
    relative_humidity: Vec<Vec<u8>>,
    cloud_fraction: Vec<Vec<u8>>,
    pressure: Vec<Vec<u8>>,
}

/// Decodes leads +1..=`leads` of one AROME run; +0 is only the
/// de-accumulation base. Rain and the motion wind prior are skipped when
/// `with_rain` is false (history hours are never shown as rain).
fn decode_arome_run(
    api: &ApiClient,
    cache_root: &Path,
    file: &RemoteFile,
    leads: u32,
    with_rain: bool,
) -> Result<DecodedArome> {
    let url = api.download_url(AROME_DATASET, AROME_VERSION, file)?;
    let members = index_lead_members(|start, end| api.fetch_range(&url, start, end), leads)?;
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
    let mut wind_times = Vec::new();
    let mut motion_wind_frames = Vec::new();
    if with_rain {
        wind_times.push(run_time.with_timezone(&Utc));
        motion_wind_frames.push(motion_wind_blocks(
            &motion_wind_map,
            &first.motion_wind_u_ms.values,
            &first.motion_wind_v_ms.values,
        )?);
    }
    let capacity = leads as usize;
    let mut out = DecodedArome {
        run: run.clone(),
        times: Vec::with_capacity(capacity),
        downloaded_bytes,
        rain_frames: Vec::with_capacity(capacity),
        wind_times,
        motion_wind_frames,
        temperature: Vec::with_capacity(capacity),
        feels_like: Vec::with_capacity(capacity),
        wind_u: Vec::with_capacity(capacity),
        wind_v: Vec::with_capacity(capacity),
        gust: Vec::with_capacity(capacity),
        radiation: Vec::with_capacity(capacity),
        relative_humidity: Vec::with_capacity(capacity),
        cloud_fraction: Vec::with_capacity(capacity),
        pressure: Vec::with_capacity(capacity),
    };
    let temperature_quant = temperature_quantization_table();
    let wind_quant = wind_quantization_table();
    let gust_quant = gust_quantization_table();
    let radiation_quant = radiation_quantization_table();
    let percent_quant = percent_quantization_table();
    let pressure_quant = pressure_quantization_table();
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
        if with_rain {
            out.wind_times.push(valid_time.with_timezone(&Utc));
            out.motion_wind_frames.push(motion_wind_blocks(
                &motion_wind_map,
                &current.motion_wind_u_ms.values,
                &current.motion_wind_v_ms.values,
            )?);
            let rates = knmi_grib::hourly_precipitation(
                &previous_precipitation,
                &current.precipitation_mm,
            )?;
            out.rain_frames.push(quantize_gathered(&rain_map, &rates)?);
        }

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
        let gust = current
            .gust_u_ms
            .values
            .iter()
            .zip(&current.gust_v_ms.values)
            .map(|(u, v)| u.hypot(*v))
            .collect::<Vec<_>>();
        let gust = hourly_map.gather(&gust)?;
        let feels_like = temperature
            .iter()
            .zip(&relative_humidity)
            .zip(wind_u.iter().zip(&wind_v))
            .map(|((temperature, humidity), (wind_u, wind_v))| {
                feels_like_c(*temperature, *humidity, *wind_u, *wind_v)
            })
            .collect::<Vec<_>>();
        out.temperature.push(quantize_values(
            &integrate_values(&temperature, 3)?,
            &temperature_quant,
        )?);
        out.feels_like.push(quantize_values(
            &integrate_values(&feels_like, 3)?,
            &temperature_quant,
        )?);
        out.wind_u.push(quantize_values(
            &integrate_values(&wind_u, 3)?,
            &wind_quant,
        )?);
        out.wind_v.push(quantize_values(
            &integrate_values(&wind_v, 3)?,
            &wind_quant,
        )?);
        out.gust
            .push(quantize_values(&integrate_values(&gust, 3)?, &gust_quant)?);
        out.relative_humidity.push(quantize_values(
            &integrate_values(&relative_humidity_percent, 8)?,
            &percent_quant,
        )?);
        out.cloud_fraction.push(quantize_values(
            &integrate_values(&cloud_fraction, 8)?,
            &percent_quant,
        )?);
        let pressure = hourly_map
            .gather(&current.mean_sea_level_pressure_pa.values)?
            .into_iter()
            .map(|pascal| pascal / 100.0)
            .collect::<Vec<_>>();
        out.pressure.push(quantize_values(
            &integrate_values(&pressure, 3)?,
            &pressure_quant,
        )?);

        let radiation =
            knmi_grib::hourly_precipitation(&previous_radiation, &current.global_radiation_j_m2)?
                .into_iter()
                .map(|energy| energy / 3_600.0)
                .collect::<Vec<_>>();
        let radiation = hourly_map.gather(&radiation)?;
        out.radiation.push(quantize_values(
            &integrate_values(&radiation, 4)?,
            &radiation_quant,
        )?);
        out.times
            .push(valid_time.to_rfc3339_opts(SecondsFormat::Secs, true));
        previous_precipitation = current.precipitation_mm;
        previous_radiation = current.global_radiation_j_m2;
    }
    ensure!(
        out.times.len() == leads as usize,
        "AROME member count changed while decoding"
    );
    Ok(out)
}

/// Frames per hourly-field chunk. The client fetches a whole chunk once a
/// location sample needs more than half of it, so a day-sized part keeps the
/// passive table load at one day even when the horizon is longer.
const HOURLY_CHUNK_LEADS: usize = 24;

/// Fields whose frames are stored as lossless predictive members (docs/mrf.md §Predictive frames).
const PREDICTIVE_FIELDS: [&str; 2] = ["feels_like_c", "pressure_hpa"];

fn hourly_field_chunks(decoded: &DecodedArome, horizon_label: &str) -> Result<Vec<ProducedChunk>> {
    let run = &decoded.run;
    let compact_run = compact_timestamp(run)?;
    let parts = decoded.times.len().div_ceil(HOURLY_CHUNK_LEADS);
    let field_chunk = |field: &str,
                       grid: crate::grid::GridSpec,
                       frames: &[Vec<u8>],
                       quant: Vec<Option<f32>>|
     -> Result<Vec<ProducedChunk>> {
        (0..parts)
            .map(|part| {
                let first = part * HOURLY_CHUNK_LEADS;
                let last = (first + HOURLY_CHUNK_LEADS).min(frames.len());
                let label = if parts == 1 {
                    horizon_label.to_owned()
                } else {
                    format!("{horizon_label}-l{}-{last}", first + 1)
                };
                let meta = mrf::ChunkMeta::standard(
                    grid.mrf_grid(),
                    "harmonie",
                    run,
                    decoded.times[first..last].to_vec(),
                )
                .with_field(field, quant.clone());
                let meta = if PREDICTIVE_FIELDS.contains(&field) {
                    meta.with_pred()
                } else {
                    meta
                };
                produced_chunk(
                    generated_chunk_filename(
                        &format!("harmonie-{field}-{compact_run}-{label}"),
                        &meta,
                    ),
                    mrf::encode(&frames[first..last], &meta)?,
                )
            })
            .collect()
    };
    let temperature_quant = temperature_quantization_table();
    let wind_quant = wind_quantization_table();
    let percent_quant = percent_quantization_table();
    Ok([
        field_chunk(
            "temp_c",
            DETAIL_GRID,
            &decoded.temperature,
            temperature_quant.clone(),
        )?,
        field_chunk(
            "feels_like_c",
            DETAIL_GRID,
            &decoded.feels_like,
            temperature_quant,
        )?,
        field_chunk(
            "wind_u_ms",
            DETAIL_GRID,
            &decoded.wind_u,
            wind_quant.clone(),
        )?,
        field_chunk("wind_v_ms", DETAIL_GRID, &decoded.wind_v, wind_quant)?,
        field_chunk(
            "gust_ms",
            DETAIL_GRID,
            &decoded.gust,
            gust_quantization_table(),
        )?,
        field_chunk(
            "radiation",
            RADIATION_GRID,
            &decoded.radiation,
            radiation_quantization_table(),
        )?,
        field_chunk(
            "rel_humidity",
            SUMMARY_GRID,
            &decoded.relative_humidity,
            percent_quant.clone(),
        )?,
        field_chunk(
            "cloud_frac",
            SUMMARY_GRID,
            &decoded.cloud_fraction,
            percent_quant,
        )?,
        field_chunk(
            "pressure_hpa",
            DETAIL_GRID,
            &decoded.pressure,
            pressure_quantization_table(),
        )?,
    ]
    .concat())
}

pub fn build_uv_chunks(
    api: &ApiClient,
    cache_root: &Path,
    file: &RemoteFile,
    now: DateTime<Utc>,
) -> Result<Vec<ProducedChunk>> {
    let run = DateTime::parse_from_rfc3339(&file.last_modified)?.with_timezone(&Utc);
    let cache_version = run.format("%Y%m%dT%H%M%S").to_string();
    let path = api.cache_file(
        UV_DATASET,
        UV_VERSION,
        file,
        &cache_root.join("uv").join(cache_version),
    )?;
    let product = knmi_hdf5::decode_uv_index(path)?;
    if !uv_window_active(&product.date, now)? {
        return Ok(Vec::new());
    }
    let map = IndexMap::uv(&product.grid)?;
    let run = run.to_rfc3339_opts(SecondsFormat::Secs, true);
    let stamp = run_stamp(&run)?;
    [
        ("uv", "uv", product.frames),
        ("uv_clear", "uv_clear", product.clear_frames),
    ]
    .into_iter()
    .filter(|(_, _, frames)| !frames.is_empty())
    .map(|(field, stem, frames)| {
        uv_field_chunk(&map, field, &format!("{stem}-{stamp}"), &run, frames)
    })
    .collect()
}

fn uv_field_chunk(
    map: &IndexMap,
    field: &str,
    stem: &str,
    run: &str,
    source: Vec<knmi_hdf5::UvFrame>,
) -> Result<ProducedChunk> {
    let quant = uv_quantization_table();
    let mut frames = Vec::with_capacity(source.len());
    let mut times = Vec::with_capacity(source.len());
    for frame in source {
        times.push(frame.time);
        frames.push(quantize_values(&map.gather(&frame.values)?, &quant)?);
    }
    let meta =
        mrf::ChunkMeta::standard(UV_GRID.mrf_grid(), "uv", run, times).with_field(field, quant);
    let filename = generated_chunk_filename(stem, &meta);
    produced_chunk(filename, mrf::encode(&frames, &meta)?)
}

fn run_stamp(run: &str) -> Result<String> {
    Ok(DateTime::parse_from_rfc3339(run)?
        .format("%Y%m%dT%H%M%S")
        .to_string())
}

fn uv_window_active(date: &str, now: DateTime<Utc>) -> Result<bool> {
    let window_start =
        NaiveDateTime::parse_from_str(&format!("{date}030000"), "%Y%m%d%H%M%S")?.and_utc();
    let window_end = window_start + Duration::hours(18) + Duration::minutes(45);
    Ok(now >= window_start && now <= window_end)
}

fn quantize_gathered(map: &IndexMap, source: &[f32]) -> Result<Vec<u8>> {
    map.gather_with(source, mrf::quantize)
}

fn quantize_values(values: &[f32], quant: &[Option<f32>]) -> Result<Vec<u8>> {
    values
        .iter()
        .map(|value| mrf::quantize_with_table(*value, quant).map_err(Into::into))
        .collect()
}

fn integrate_values(values: &[f32], factor: usize) -> Result<Vec<f32>> {
    ensure!(
        values.len() == HOURLY_GRID.cell_count(),
        "hourly field does not match integration grid"
    );
    ensure!(factor > 0, "integration factor must be positive");
    let width = HOURLY_GRID.width as usize;
    let height = HOURLY_GRID.height as usize;
    let coarse_width = width.div_ceil(factor);
    let coarse_height = height.div_ceil(factor);
    let mut integrated = Vec::with_capacity(coarse_width * coarse_height);
    for coarse_row in 0..coarse_height {
        for coarse_column in 0..coarse_width {
            let mut sum = 0.0_f64;
            let mut count = 0_usize;
            for row in coarse_row * factor..((coarse_row + 1) * factor).min(height) {
                for column in coarse_column * factor..((coarse_column + 1) * factor).min(width) {
                    let value = values[row * width + column];
                    if value.is_finite() {
                        sum += f64::from(value);
                        count += 1;
                    }
                }
            }
            integrated.push(if count == 0 {
                f32::NAN
            } else {
                (sum / count as f64) as f32
            });
        }
    }
    Ok(integrated)
}

struct EncodedMotion {
    bytes: Vec<u8>,
    report: motion::CalibrationReport,
}

#[derive(Clone, Copy)]
enum MotionParallelism {
    Inline,
    TwoThreads,
}

fn encode_rain_with_motion(
    frames: &[Vec<u8>],
    meta: &mrf::ChunkMeta,
    wind: &WindTimeline,
    previous_calibration: Option<motion::Calibration>,
    parallelism: MotionParallelism,
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
    let correlate_pair = |index: usize| -> Result<_> {
        let previous = dequantize_rain_frame(&frames[index - 1], &meta.quant);
        let current = dequantize_rain_frame(&frames[index], &meta.quant);
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
        Ok((field, wind.interpolate(midpoint.with_timezone(&Utc))))
    };
    let pairs = match parallelism {
        MotionParallelism::Inline => (1..frames.len())
            .map(correlate_pair)
            .collect::<Result<Vec<_>>>()?,
        MotionParallelism::TwoThreads => rayon::ThreadPoolBuilder::new()
            .num_threads(2)
            .thread_name(|index| format!("seamless-motion-{index}"))
            .build()?
            .install(|| {
                (1..frames.len())
                    .into_par_iter()
                    .map(correlate_pair)
                    .collect::<Result<Vec<_>>>()
            })?,
    };
    let (correlations, winds): (Vec<_>, Vec<_>) = pairs.into_iter().unzip();
    let report = motion::calibrate(&correlations, &winds, previous_calibration)?;
    let mut annexes = Vec::with_capacity(frames.len());
    annexes.push(None);
    for (correlation, wind) in correlations.iter().zip(&winds) {
        annexes.push(Some(
            motion::blend_with_wind(correlation, wind, report.calibration)?.vectors,
        ));
    }
    let bytes = match parallelism {
        MotionParallelism::Inline => mrf::encode_with_motion(frames, meta, motion_grid, &annexes)?,
        MotionParallelism::TwoThreads => {
            mrf::encode_with_motion_parallel(frames, meta, motion_grid, &annexes, 2)?
        }
    };
    Ok(EncodedMotion { bytes, report })
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
    if let Some(pred) = meta.pred {
        update(b"pred");
        update(&pred.v.to_le_bytes());
    }
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

pub fn gust_quantization_table() -> Vec<Option<f32>> {
    linear_quantization_table(0.0, 0.5)
}

pub fn radiation_quantization_table() -> Vec<Option<f32>> {
    linear_quantization_table(0.0, 5.0)
}

pub fn uv_quantization_table() -> Vec<Option<f32>> {
    linear_quantization_table(0.0, 12.0 / 254.0)
}

/// 0.5 hPa: 0.1 hPa over 940–1060 would need 1201 levels, a cell has 255 (docs/fields.md).
pub fn pressure_quantization_table() -> Vec<Option<f32>> {
    linear_quantization_table(940.0, 0.5)
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

/// Gevoelstemperatuur; definitie, bronnen en de overgangsband: docs/fields.md §Gevoelstemperatuur.
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
    let blend = ((temperature_c - WIND_CHILL_MAX_C) / FEELS_LIKE_BLEND_C).clamp(0.0, 1.0);
    if blend == 0.0 {
        return wind_chill_c(temperature_c, wind_ms);
    }
    let apparent = apparent_temperature_c(temperature_c, relative_humidity, wind_ms);
    if blend == 1.0 {
        return apparent;
    }
    wind_chill_c(temperature_c, wind_ms) * (1.0 - blend) + apparent * blend
}

const WIND_CHILL_MAX_C: f32 = 10.0;
const WIND_CHILL_MIN_WIND_MS: f32 = 1.3;
const FEELS_LIKE_BLEND_C: f32 = 5.0;

fn wind_chill_c(temperature_c: f32, wind_ms: f32) -> f32 {
    if wind_ms < WIND_CHILL_MIN_WIND_MS {
        return temperature_c;
    }
    let wind_factor = (wind_ms * 3.6).powf(0.16);
    13.12 + 0.6215 * temperature_c - 11.37 * wind_factor + 0.3965 * temperature_c * wind_factor
}

fn apparent_temperature_c(temperature_c: f32, relative_humidity: f32, wind_ms: f32) -> f32 {
    let vapour_pressure_hpa = relative_humidity.clamp(0.0, 1.0)
        * 6.105
        * (17.27 * temperature_c / (237.7 + temperature_c)).exp();
    temperature_c + 0.33 * vapour_pressure_hpa - 0.70 * wind_ms - 4.00
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
        &fields.mean_sea_level_pressure_pa,
        &fields.gust_u_ms,
        &fields.gust_v_ms,
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
    let of_field = |field: &str| {
        chunks
            .iter()
            .filter(|chunk| chunk.manifest.field == field)
            .collect::<Vec<_>>()
    };
    let (wind_u, wind_v) = (of_field("wind_u_ms"), of_field("wind_v_ms"));
    ensure!(!wind_u.is_empty(), "wind U chunk is missing");
    ensure!(!wind_v.is_empty(), "wind V chunk is missing");
    ensure!(wind_u.len() == wind_v.len(), "wind chunk counts differ");
    for (wind_u, wind_v) in wind_u.into_iter().zip(wind_v) {
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
    }
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
    fn hourly_fields_are_split_into_day_sized_chunks() {
        let times = (1..=30)
            .map(|lead| format!("2026-09-23T{:02}:00:00Z", lead % 24))
            .collect::<Vec<_>>();
        let frames = |grid: crate::grid::GridSpec| {
            vec![vec![0_u8; (grid.width * grid.height) as usize]; times.len()]
        };
        let decoded = DecodedArome {
            run: "2026-09-23T00:00:00Z".to_owned(),
            times: times.clone(),
            downloaded_bytes: 0,
            rain_frames: Vec::new(),
            wind_times: Vec::new(),
            motion_wind_frames: Vec::new(),
            temperature: frames(DETAIL_GRID),
            feels_like: frames(DETAIL_GRID),
            wind_u: frames(DETAIL_GRID),
            wind_v: frames(DETAIL_GRID),
            gust: frames(DETAIL_GRID),
            radiation: frames(RADIATION_GRID),
            relative_humidity: frames(SUMMARY_GRID),
            cloud_fraction: frames(SUMMARY_GRID),
            pressure: frames(DETAIL_GRID),
        };
        let chunks = hourly_field_chunks(&decoded, "h30").unwrap();
        assert_eq!(chunks.len(), 18);
        let temperature = chunks
            .iter()
            .filter(|chunk| chunk.manifest.field == "temp_c")
            .collect::<Vec<_>>();
        assert_eq!(temperature[0].manifest.times, times[..24]);
        assert_eq!(temperature[1].manifest.times, times[24..]);
        assert!(
            temperature[0]
                .filename
                .starts_with("harmonie-temp_c-20260923T0000-h30-l1-24-")
        );
        assert!(
            temperature[1]
                .filename
                .starts_with("harmonie-temp_c-20260923T0000-h30-l25-30-")
        );
        validate_wind_pair(&chunks).unwrap();
        for chunk in &chunks {
            let decoded = mrf::decode(&chunk.bytes).unwrap();
            let predictive = PREDICTIVE_FIELDS.contains(&chunk.manifest.field.as_str());
            assert_eq!(
                decoded.header.pred.is_some(),
                predictive,
                "{}",
                chunk.filename
            );
            assert!(decoded.frames.iter().flatten().all(|cell| *cell == 0));
        }
        let plain = mrf::ChunkMeta::standard(
            DETAIL_GRID.mrf_grid(),
            "harmonie",
            "2026-09-23T00:00:00Z",
            times.clone(),
        )
        .with_field("feels_like_c", temperature_quantization_table());
        assert_ne!(
            generated_chunk_filename("x", &plain),
            generated_chunk_filename("x", &plain.clone().with_pred()),
            "a predictive chunk must never reuse a bitmap chunk's URL"
        );
    }

    #[test]
    fn history_run_covers_six_hours_before_the_current_run() {
        let file = |hour: u32| RemoteFile {
            filename: format!("HARM43_V1_P1_20260923{hour:02}.tar"),
            size: 1,
            last_modified: String::new(),
        };
        let at = |hour: u32, minute: u32| {
            chrono::NaiveDate::from_ymd_opt(2026, 9, 23)
                .unwrap()
                .and_hms_opt(hour, minute, 0)
                .unwrap()
                .and_utc()
        };
        let files = (0..=10).rev().map(file).collect::<Vec<_>>();
        let (chosen, leads) = arome_history_choice(&files, at(8, 0), at(12, 35), 6)
            .unwrap()
            .unwrap();
        assert_eq!(
            (chosen.filename.as_str(), leads),
            ("HARM43_V1_P1_2026092305.tar", 3)
        );

        let without_05 = files
            .iter()
            .filter(|file| !file.filename.ends_with("05.tar"))
            .cloned()
            .collect::<Vec<_>>();
        let (chosen, leads) = arome_history_choice(&without_05, at(8, 0), at(12, 35), 6)
            .unwrap()
            .unwrap();
        assert_eq!(
            (chosen.filename.as_str(), leads),
            ("HARM43_V1_P1_2026092304.tar", 4)
        );

        assert!(
            arome_history_choice(&files, at(5, 0), at(12, 35), 6)
                .unwrap()
                .is_none()
        );
        assert!(
            arome_history_choice(&files[..3], at(8, 0), at(12, 35), 6)
                .unwrap()
                .is_none()
        );
    }

    #[test]
    fn parses_arome_run_timestamp() {
        assert_eq!(
            arome_run("HARM43_V1_P1_2026082813.tar").unwrap(),
            "2026-08-28T13:00:00Z"
        );
    }

    #[test]
    fn feels_like_follows_knmi_wind_chill_up_to_ten_degrees() {
        let wind_chill = feels_like_c(-5.0, 0.8, 20.0 / 3.6, 0.0);
        assert!((wind_chill - -11.6).abs() < 0.1);
        // KNMI TR-309 tabel 3 (JAG/TI): 0 °C bij 10 km/u geeft −3.
        assert_eq!(feels_like_c(0.0, 0.8, 0.0, 10.0 / 3.6).round(), -3.0);
        assert_eq!(feels_like_c(4.0, 0.8, 1.0, 0.5), 4.0);
    }

    #[test]
    fn feels_like_uses_steadman_apparent_temperature_when_warm() {
        let apparent = feels_like_c(25.0, 0.6, 0.0, 2.0);
        assert!((apparent - 25.85).abs() < 0.05, "{apparent}");
        let muggy = feels_like_c(30.0, 0.8, 1.0, 0.0);
        assert!(muggy > 34.0, "{muggy}");
    }

    #[test]
    fn feels_like_is_continuous_around_ten_degrees() {
        for relative_humidity in [0.5, 0.7, 0.85, 0.95] {
            for wind_ms in [0.5, 1.5, 3.0, 5.0, 8.0, 12.0] {
                let edge = feels_like_c(10.005, relative_humidity, wind_ms, 0.0)
                    - feels_like_c(9.995, relative_humidity, wind_ms, 0.0);
                assert!(
                    edge.abs() < 0.05,
                    "rh {relative_humidity} wind {wind_ms}: {edge}"
                );
                for step in 0..200 {
                    let temperature = 5.0 + step as f32 * 0.1;
                    let jump = feels_like_c(temperature + 0.1, relative_humidity, wind_ms, 0.0)
                        - feels_like_c(temperature, relative_humidity, wind_ms, 0.0);
                    assert!(
                        (-0.05..0.3).contains(&jump),
                        "rh {relative_humidity} wind {wind_ms} at {temperature}: {jump}"
                    );
                }
            }
        }
    }

    #[test]
    fn field_quantization_tables_cover_the_documented_ranges() {
        let temperature = temperature_quantization_table();
        assert_eq!(temperature[0], Some(-31.2));
        assert!((temperature[254].unwrap() - 45.0).abs() < 0.0001);
        let wind = wind_quantization_table();
        assert_eq!(wind[127], Some(0.0));
        let gust = gust_quantization_table();
        assert_eq!(gust[0], Some(0.0));
        assert_eq!(gust[120], Some(60.0));
        assert_eq!(radiation_quantization_table()[254], Some(1_270.0));
        assert!((uv_quantization_table()[254].unwrap() - 12.0).abs() < 0.0001);
        assert_eq!(percent_quantization_table()[0], Some(0.0));
        assert!((percent_quantization_table()[254].unwrap() - 100.0).abs() < 0.0001);
        let pressure = pressure_quantization_table();
        assert_eq!(pressure[0], Some(940.0));
        assert_eq!(pressure[144], Some(1_012.0));
        assert_eq!(pressure[254], Some(1_067.0));
        assert_eq!(
            quantize_values(&[1_012.1, 930.0, 1_100.0, f32::NAN], &pressure).unwrap(),
            [144, 0, 254, 255]
        );
    }

    #[test]
    fn spatial_integration_averages_valid_cells_and_keeps_empty_blocks_missing() {
        let mut values = vec![f32::NAN; HOURLY_GRID.cell_count()];
        values[0] = 2.0;
        values[1] = 4.0;
        values[HOURLY_GRID.width as usize] = 6.0;
        let integrated = integrate_values(&values, 2).unwrap();
        assert_eq!(integrated.len(), 313 * 338);
        assert_eq!(integrated[0], 4.0);
        assert!(integrated[1].is_nan());
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
                DETAIL_GRID.mrf_grid(),
                "harmonie",
                "2026-08-28T12:00:00Z",
                times.clone(),
            )
            .with_field(field, wind_quantization_table());
            produced_chunk(
                format!("{field}.mrf"),
                mrf::encode(
                    &vec![vec![127; DETAIL_GRID.cell_count()]; times.len()],
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
            &encode_rain_with_motion(
                &[previous, current],
                &meta,
                &wind,
                None,
                MotionParallelism::Inline,
            )
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
