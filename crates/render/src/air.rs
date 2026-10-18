//! Lucht (U92): wat de app in de modus Lucht toont. Basiskaart op volle verzadiging, temperatuurpunten, daarboven de
//! wolkenkaart (MIP-34) en de klok. Regen en winddeeltjes zijn in Lucht weggefade, dus die tekent deze film niet.

use crate::{
    data::{Dataset, Raster},
    encode::{Video, jpeg},
    frame_cache::{Identity, Key, KeyBuilder, ModeCache, Parts, Prediction},
    renderer::{FileMedia, FramePlan, Media, Options, Profile, frame_plans, plates},
};
use anyhow::{Context, Result, ensure};
use rayon::prelude::*;
use render_core::{
    clock::ClockTransition,
    cloud::{
        CloudFrame, CloudHour, CloudInputs, CloudQuality, CloudTarget, CloudVolume, DriftSample,
        MotionView, RasterBlend, RasterView, cloud_frame, composite, drift_anchor, drift_epochs,
        drift_path, motion_mean, prepare_hour, render_fill,
    },
    constants::constants,
    field::Field,
    mode_constants::mode_constants,
    overlay::{ClockOptions, clock_appearance, draw_overlay_title},
    projection::{Grid, Projection},
    temperature::{TemperaturePair, draw_temperature},
    text::Text,
    time::{Manifest, TimelineFrame, dark, epoch, frame_blend},
};
use std::{
    fs,
    path::Path,
    sync::{Arc, Mutex, mpsc},
    thread,
    time::Instant,
};

const HOUR: i64 = 3_600_000;
pub const TITLE: &str = "Lucht";

// Rekentijd (U92, gemeten in de track-LOG op 2 kernen): de app tekent de wolken per as op de helft van zijn
// CSS-pixels, de film op een kwart; de terugtrace op de helft van het grove app-raster en het reliëf uit de
// buurpixels. Samen van 85 naar circa 21 CPU-seconden per film; de afwijking tegenover de app blijft onder 0,3 ΔE
// boven de JPEG-vloer.
const FILL_DIVISOR: f64 = 2.0;
const TRAVEL_DIVISOR: f64 = 2.0;
const QUALITY: CloudQuality = CloudQuality {
    neighbour_relief: true,
    // Dezelfde rand als de app (8 app-pixels) op het grovere vuldoel.
    border_pixels: 4,
};

/// Twee geladen bronframes en hun tijdmenging; houdt de rasters vast zolang een `RasterBlend` ernaar wijst.
struct LoadedBlend {
    left: Arc<Raster>,
    right: Arc<Raster>,
    mix: f64,
}

impl LoadedBlend {
    fn view(&self) -> RasterBlend<'_> {
        RasterBlend {
            left: raster_view(&self.left),
            right: raster_view(&self.right),
            mix: self.mix,
        }
    }
}

fn raster_view(raster: &Raster) -> RasterView<'_> {
    RasterView {
        grid: &raster.grid,
        quant: &raster.quant,
        values: &raster.values,
    }
}

/// `loadFieldBlend(frames, epoch, 0)`: niets buiten de tijdlijn van dit veld.
fn load_blend(dataset: &mut Dataset<'_>, epoch: i64) -> Result<Option<LoadedBlend>> {
    let (Some(first), Some(last)) = (dataset.frames.first(), dataset.frames.last()) else {
        return Ok(None);
    };
    if epoch < first.epoch || epoch > last.epoch {
        return Ok(None);
    }
    let blend = frame_blend(&dataset.frames, epoch);
    let left = dataset.frames[blend.left].clone();
    let right = dataset.frames[blend.right].clone();
    Ok(Some(LoadedBlend {
        left: dataset.load(&left)?,
        right: dataset.load(&right)?,
        mix: blend.mix,
    }))
}

struct Sources<'a> {
    cloud: Dataset<'a>,
    low: Dataset<'a>,
    mid: Dataset<'a>,
    high: Dataset<'a>,
    radiation: Dataset<'a>,
    rain: Dataset<'a>,
    rain_grid: Grid,
}

impl<'a> Sources<'a> {
    /// `cloudMotionAt`: de regenbeweging van het regenframepaar rond `epoch`.
    fn motion_at(&mut self, epoch: i64) -> Result<Option<(usize, usize, Vec<i8>)>> {
        let Some((left, right)) = self.motion_pair(epoch) else {
            return Ok(None);
        };
        self.rain.motion(&left, &right)
    }

    fn motion_pair(&self, epoch: i64) -> Option<(TimelineFrame, TimelineFrame)> {
        let frames = &self.rain.frames;
        if frames.len() < 2 || epoch < frames[0].epoch || epoch > frames.last().unwrap().epoch {
            return None;
        }
        let blend = frame_blend(frames, epoch);
        let right_index = blend.right.max(1);
        let left_index = blend.left.min(right_index - 1);
        Some((frames[left_index].clone(), frames[right_index].clone()))
    }

    /// Every source frame `hour` reads, mirrored from it for the frame cache (MIP-37).
    fn hour_key(&mut self, frame: &TimelineFrame, cache: &ModeCache) -> Result<Option<Prediction>> {
        let epoch = frame.epoch;
        let mut key = cache.key();
        key.number(epoch).source(self.cloud.identity(frame)?);
        for dataset in [&mut self.low, &mut self.mid, &mut self.high] {
            key_blend(dataset, epoch, &mut key)?;
        }
        key_blend(&mut self.radiation, epoch, &mut key)?;
        key_blend(&mut self.radiation, epoch + HOUR, &mut key)?;
        match self.motion_pair(epoch) {
            Some((left, right)) => match self.rain.motion_frame(&left, &right)? {
                Some(motion) => key.source(self.rain.motion_identity(&motion)?),
                None => key.flag(false),
            },
            None => key.flag(false),
        };
        Ok(key.finish())
    }

    fn datasets(&mut self) -> [&mut Dataset<'a>; 6] {
        [
            &mut self.cloud,
            &mut self.low,
            &mut self.mid,
            &mut self.high,
            &mut self.radiation,
            &mut self.rain,
        ]
    }

    fn take_touched(&mut self) -> Vec<Option<Identity>> {
        self.datasets()
            .into_iter()
            .flat_map(|dataset| dataset.take_touched())
            .collect()
    }

    fn motion_view<'b>(
        &'b self,
        motion: &'b Option<(usize, usize, Vec<i8>)>,
    ) -> Option<MotionView<'b>> {
        motion.as_ref().map(|(width, height, vectors)| MotionView {
            grid: &self.rain_grid,
            width: *width,
            height: *height,
            vectors,
        })
    }

    /// Het bulkpad over de knopen die de kaarttijden `first`…`last` nodig hebben, met nul op het uur vóór `now`.
    fn drift(&mut self, now: i64, first: i64, last: i64) -> Result<Vec<DriftSample>> {
        let frames = &self.rain.frames;
        let epochs = drift_epochs(frames[0].epoch, frames.last().unwrap().epoch);
        let anchor = drift_anchor(&epochs, now);
        // Zoals `ensure` in de loader: een uur vóór en na het getoonde venster, en altijd het anker.
        let start = drift_anchor(&epochs, first - HOUR).min(anchor);
        let end = epochs
            .iter()
            .position(|&value| value >= last + HOUR)
            .unwrap_or(epochs.len() - 1)
            .max(anchor);
        let window = &epochs[start..=end];
        let mut velocities = Vec::with_capacity(window.len());
        for &epoch in window {
            let motion = self.motion_at(epoch)?;
            velocities.push(motion_mean(self.motion_view(&motion)));
        }
        Ok(drift_path(window, &velocities, anchor - start))
    }

    fn hour(&mut self, frame: &TimelineFrame) -> Result<CloudHour> {
        let raster = self.cloud.load(frame)?;
        let grid = raster.grid.clone();
        let values = raster
            .values
            .iter()
            .map(|&code| raster.quant[code as usize].unwrap_or(f32::NAN))
            .collect();
        let field = Field::prepare(values, grid.width, grid.height, mode_constants().cloud.blur);
        let epoch = frame.epoch;
        let low = load_blend(&mut self.low, epoch)?;
        let mid = load_blend(&mut self.mid, epoch)?;
        let high = load_blend(&mut self.high, epoch)?;
        let radiation = load_blend(&mut self.radiation, epoch)?;
        let radiation_next = load_blend(&mut self.radiation, epoch + HOUR)?;
        let motion = self.motion_at(epoch)?;
        Ok(prepare_hour(
            &grid,
            &field,
            epoch,
            CloudInputs {
                low: low.as_ref().map(LoadedBlend::view),
                mid: mid.as_ref().map(LoadedBlend::view),
                high: high.as_ref().map(LoadedBlend::view),
                radiation: radiation.as_ref().map(LoadedBlend::view),
                radiation_next: radiation_next.as_ref().map(LoadedBlend::view),
                motion: self.motion_view(&motion),
            },
        ))
    }
}

/// The frames `load_blend` reads at `epoch`, or that it reads nothing.
fn key_blend(dataset: &mut Dataset, epoch: i64, key: &mut KeyBuilder) -> Result<()> {
    let (Some(first), Some(last)) = (dataset.frames.first(), dataset.frames.last()) else {
        key.flag(false);
        return Ok(());
    };
    if epoch < first.epoch || epoch > last.epoch {
        key.flag(false);
        return Ok(());
    }
    let blend = frame_blend(&dataset.frames, epoch);
    let left = dataset.frames[blend.left].clone();
    let right = dataset.frames[blend.right].clone();
    key.flag(true)
        .real(blend.mix)
        .source(dataset.identity(&left)?)
        .source(dataset.identity(&right)?);
    Ok(())
}

/// Kaarttijd → fractionele index in de wolkentijdlijn en de dekking aan de randen, zoals `timelineCursorAtEpoch` en
/// `timelineCoverage` met de isolijnvervaging.
fn cloud_time(frames: &[TimelineFrame], epoch: i64) -> (f64, f64) {
    let blend = frame_blend(frames, epoch);
    let time = blend.left as f64 + (blend.right - blend.left) as f64 * blend.mix;
    let first = frames[0].epoch;
    let last = frames.last().unwrap().epoch;
    let outside = (first - epoch).max(epoch - last).max(0) as f64;
    let coverage = (1.0 - outside / mode_constants().isoline.edge_fade_ms).max(0.0);
    (time, coverage)
}

struct Input {
    epoch: i64,
    still: bool,
    loop_frame: bool,
    night: bool,
    cloud: CloudFrame,
    coverage: f64,
    hours: Arc<Vec<Option<Arc<CloudHour>>>>,
    temperatures: Option<LoadedBlend>,
}

struct Output {
    rgb: Option<Vec<u8>>,
    loop_frame: bool,
    still: Option<FileMedia>,
    profile: Profile,
}

struct Painter<'a> {
    plates: &'a [Vec<u8>; 2],
    projection: &'a Projection,
    cloud_grid: &'a Grid,
    fill: &'a CloudTarget,
    travel: &'a CloudTarget,
    text: &'a [Mutex<Text>; 2],
    now: i64,
    clock: Option<ClockTransition>,
}

impl Painter<'_> {
    fn frame(&self, input: &Input, directory: &Path) -> Result<Output> {
        let mut text = self.text[rayon::current_thread_index().unwrap_or(0)]
            .lock()
            .map_err(|_| anyhow::anyhow!("Air text worker panicked"))?;
        let mut profile = Profile {
            output_frames: 1,
            ..Profile::default()
        };
        let mut rgb = self.plates[usize::from(input.night)].clone();
        let started = Instant::now();
        // De temperatuurpunten staan in de MapLibre-canvas, onder de eigen canvas van de wolkenlaag.
        if let Some(pair) = &input.temperatures {
            draw_temperature(
                &mut text,
                &mut rgb,
                self.projection,
                TemperaturePair {
                    left_grid: &pair.left.grid,
                    right_grid: &pair.right.grid,
                    left: &pair.left.values,
                    right: &pair.right.values,
                    left_quant: &pair.left.quant,
                    right_quant: &pair.right.quant,
                    mix: pair.mix,
                },
                input.night,
            );
        }
        profile.overlay_us += started.elapsed().as_micros();
        if input.coverage > 0.0 {
            let started = Instant::now();
            let volume = CloudVolume {
                grid: self.cloud_grid,
                hours: &input.hours,
            };
            let filled = render_fill(&volume, &input.cloud, self.fill, Some(self.travel), QUALITY);
            let size = &constants().size;
            composite(
                &mut rgb,
                size.width,
                size.height,
                &filled,
                self.fill.width,
                self.fill.height,
                input.coverage as f32,
            );
            profile.composition_us += started.elapsed().as_micros();
        }
        let started = Instant::now();
        draw_overlay_title(
            &mut text,
            &mut rgb,
            (input.epoch, self.now),
            input.night,
            ClockOptions {
                transition: self.clock,
                still: input.still,
            },
            TITLE,
        );
        profile.overlay_us += started.elapsed().as_micros();
        let still = if input.still {
            let started = Instant::now();
            let name = format!("air-{}.jpg", input.epoch);
            let bytes = jpeg(&rgb, &directory.join(&name))?;
            profile.jpeg_us += started.elapsed().as_micros();
            Some(FileMedia {
                file: name,
                kind: "photo",
                epoch: input.epoch,
                bytes,
                width: constants().size.width,
                height: constants().size.height,
            })
        } else {
            None
        };
        Ok(Output {
            rgb: input.loop_frame.then_some(rgb),
            loop_frame: input.loop_frame,
            still,
            profile,
        })
    }
}

/// One planned map time: everything cheap is known, the cloud hours and temperatures load only for a miss.
struct Planned {
    plan: FramePlan,
    cloud: CloudFrame,
    coverage: f64,
    night: bool,
    hour_indices: Vec<usize>,
    prediction: Option<Prediction>,
    hit: Option<(Key, Option<Vec<u8>>)>,
}

/// The cloud hours `render_fill` reads around fractional index `time`.
fn hour_indices(time: f64, depth: usize) -> Vec<usize> {
    let base = time.floor() as isize;
    (base - 1..=base + 2)
        .map(|index| index.clamp(0, depth as isize - 1) as usize)
        .collect()
}

fn temperature_epoch(temperatures: &Dataset, epoch: i64) -> i64 {
    ((epoch + 300_000).div_euclid(600_000) * 600_000).clamp(
        temperatures.frames[0].epoch,
        temperatures.frames.last().unwrap().epoch,
    )
}

fn cached_output(planned: &Planned, cache: &ModeCache, directory: &Path) -> Result<Output> {
    let (key, rgb) = planned
        .hit
        .as_ref()
        .context("Cached air frame without hit")?;
    let still = if planned.plan.still {
        let file = format!("air-{}.jpg", planned.plan.epoch);
        let bytes = cache.copy_still(*key, &directory.join(&file))?;
        Some(FileMedia {
            file,
            kind: "photo",
            epoch: planned.plan.epoch,
            bytes,
            width: constants().size.width,
            height: constants().size.height,
        })
    } else {
        None
    };
    Ok(Output {
        rgb: rgb
            .as_ref()
            .map(|compressed| cache.restore(*key, compressed))
            .transpose()?,
        loop_frame: planned.plan.loop_frame,
        still,
        profile: Profile::default(),
    })
}

/// Vuldoel en grof stromingsraster zoals de kaartlaag ze kiest: `ISOLINE_FILL_RESOLUTION` CSS-pixels, de stroming
/// `CLOUD_FLOW_DOWNSAMPLE` keer grover.
pub fn targets(projection: &Projection) -> (CloudTarget, CloudTarget) {
    let size = &constants().size;
    let scale = mode_constants().isoline.fill_resolution;
    let app_width = (size.width as f64 * scale).round().max(1.0);
    let app_height = (size.height as f64 * scale).round().max(1.0);
    let downsample = mode_constants().cloud.flow_downsample;
    let fill = CloudTarget::new(
        &projection.columns,
        &projection.rows,
        (app_width / FILL_DIVISOR).round() as usize,
        (app_height / FILL_DIVISOR).round() as usize,
    );
    let travel = CloudTarget::new(
        &projection.columns,
        &projection.rows,
        ((app_width as usize).div_ceil(downsample) as f64 / TRAVEL_DIVISOR).ceil() as usize,
        ((app_height as usize).div_ceil(downsample) as f64 / TRAVEL_DIVISOR).ceil() as usize,
    );
    (fill, travel)
}

pub fn render(
    data_directory: &Path,
    basemap_directory: &Path,
    out_directory: &Path,
    manifest: &Manifest,
    options: Options,
) -> Result<Media> {
    let started = Instant::now();
    let clock = options.clock;
    let cache = options.cache.map(|cache| cache.mode("air"));
    let now = epoch(&manifest.now)?;
    let loop_plan = &mode_constants().loops.air;
    let mut rain = Dataset::new(data_directory, manifest, "rain_rate")?;
    ensure!(!rain.frames.is_empty(), "Rain timeline missing");
    let rain_grid = rain.grid()?;
    let mut sources = Sources {
        cloud: Dataset::new(data_directory, manifest, "cloud_frac")?,
        low: Dataset::new(data_directory, manifest, "cloud_low")?,
        mid: Dataset::new(data_directory, manifest, "cloud_mid")?,
        high: Dataset::new(data_directory, manifest, "cloud_high")?,
        radiation: Dataset::new(data_directory, manifest, "radiation")?,
        rain,
        rain_grid: rain_grid.clone(),
    };
    ensure!(!sources.cloud.frames.is_empty(), "Cloud timeline missing");
    let cloud_grid = sources.cloud.grid()?;
    let cloud_frames = sources.cloud.frames.clone();
    let cloud_epochs: Vec<i64> = cloud_frames.iter().map(|frame| frame.epoch).collect();
    let mut temperatures = Dataset::new(data_directory, manifest, "feels_like_c")?;
    let plates = plates(basemap_directory, &rain_grid)?;
    let projection = Projection::new(&rain_grid);
    let cloud_projection = Projection::new(&cloud_grid);
    let (fill, travel) = targets(&cloud_projection);
    let text = [
        Mutex::new(Text::new().map_err(anyhow::Error::msg)?),
        Mutex::new(Text::new().map_err(anyhow::Error::msg)?),
    ];

    let loop_epochs: Vec<i64> = loop_plan
        .loop_offsets
        .iter()
        .map(|offset| now + offset)
        .collect();
    let still_epochs: Vec<i64> = constants()
        .still_minutes
        .iter()
        .map(|minute| now + minute * 60_000)
        .collect();
    let plans = frame_plans(&loop_epochs, &still_epochs);
    let first = plans.first().context("Empty air plan")?.epoch;
    let last = plans.last().unwrap().epoch;
    if cache.is_some() {
        for dataset in sources.datasets() {
            dataset.touched = Some(Vec::new());
        }
        temperatures.touched = Some(Vec::new());
    }
    let preparation_started = Instant::now();
    let drift = sources.drift(now, first, last)?;
    sources.take_touched();
    let mut hour_keys: Vec<Option<Option<Prediction>>> =
        (0..cloud_frames.len()).map(|_| None).collect();
    let mut planned = Vec::with_capacity(plans.len());
    for &plan in &plans {
        let (time, coverage) = cloud_time(&cloud_frames, plan.epoch);
        let night = dark(plan.epoch);
        let cloud = cloud_frame(&cloud_grid, &cloud_epochs, &drift, time, night);
        let indices = hour_indices(time, cloud_frames.len());
        let mut prediction = None;
        let mut hit = None;
        if let Some(cache) = &cache {
            let mut key = cache.key();
            key.bytes(format!("{clock:?}").as_bytes())
                .number(plan.epoch)
                .bytes(
                    clock_appearance(
                        plan.epoch,
                        ClockOptions {
                            transition: clock,
                            still: plan.still,
                        },
                    )
                    .as_bytes(),
                )
                .flag(plan.epoch <= now)
                .real(cloud.time)
                .real(cloud.phase)
                .flag(night)
                .real(coverage);
            for anchor in cloud.anchors {
                key.real(anchor);
            }
            for &index in &indices {
                if hour_keys[index].is_none() {
                    hour_keys[index] = Some(sources.hour_key(&cloud_frames[index], cache)?);
                }
                match hour_keys[index].as_ref().unwrap() {
                    Some(hour) => key.bytes(hour.key.hex().as_bytes()),
                    None => key.source(None),
                };
            }
            let temperature_time = temperature_epoch(&temperatures, plan.epoch);
            key_blend(&mut temperatures, temperature_time, &mut key)?;
            prediction = key.finish();
            if let Some(prediction) = &prediction {
                let parts = Parts {
                    rgb: plan.loop_frame,
                    still: plan.still,
                    state: false,
                };
                hit = cache
                    .lookup(prediction.key, parts)?
                    .map(|found| (prediction.key, found.rgb));
            }
        }
        planned.push(Planned {
            plan,
            cloud,
            coverage,
            night,
            hour_indices: indices,
            prediction,
            hit,
        });
    }
    // Wolkenuren alleen voor frames die gerenderd moeten worden; een uur dat buiten zijn sleutel las, wordt niet bewaard.
    let mut hours: Vec<Option<Arc<CloudHour>>> = vec![None; cloud_frames.len()];
    let mut verified_hours = vec![true; cloud_frames.len()];
    for entry in planned.iter().filter(|entry| entry.hit.is_none()) {
        for &index in &entry.hour_indices {
            if hours[index].is_some() {
                continue;
            }
            sources.take_touched();
            hours[index] = Some(Arc::new(sources.hour(&cloud_frames[index])?));
            let touched = sources.take_touched();
            if let (Some(cache), Some(Some(prediction))) = (&cache, &hour_keys[index]) {
                verified_hours[index] = cache.verify(prediction, &touched);
            }
        }
    }
    let hours = Arc::new(hours);
    let preparation_us = preparation_started.elapsed().as_micros();

    fs::create_dir_all(out_directory)?;
    let receipt = out_directory.join("media.json");
    if receipt.exists() {
        fs::remove_file(&receipt)?;
    }
    let temporary = tempfile::tempdir_in(out_directory)?;
    let painter = Painter {
        plates: &plates,
        projection: &projection,
        cloud_grid: &cloud_grid,
        fill: &fill,
        travel: &travel,
        text: &text,
        now,
        clock,
    };
    // Grotere batches: minder wachten op het traagste frame (stills met JPEG); 8 frames ≈ 30 MiB RGB, gemeten ~1 s
    // sneller op 2 kernen. In `all` delen de modi de kernen en blijven de batches klein.
    let batch_size = if crate::shared::inputs().is_some() {
        2
    } else {
        8
    };
    let (mut files, bytes, loop_ms, mut total) = thread::scope(|scope| -> Result<_> {
        let (sender, receiver) = mpsc::sync_channel::<Vec<Output>>(1);
        let writer = scope.spawn(|| -> Result<_> {
            let mut video = Video::start_plan(
                &temporary.path().join("air-loop.mp4"),
                loop_epochs.len(),
                loop_plan.hold_frames,
                (
                    loop_plan.fps_fraction.numerator,
                    loop_plan.fps_fraction.denominator,
                ),
            )?;
            let mut files = Vec::new();
            let mut profile = Profile::default();
            for batch in receiver {
                for frame in batch {
                    profile.output_frames += frame.profile.output_frames;
                    profile.composition_us += frame.profile.composition_us;
                    profile.overlay_us += frame.profile.overlay_us;
                    profile.jpeg_us += frame.profile.jpeg_us;
                    if let Some(file) = frame.still {
                        files.push(file);
                    }
                    if frame.loop_frame {
                        let started = Instant::now();
                        video.frame(
                            frame
                                .rgb
                                .as_deref()
                                .context("Air loop frame without pixels")?,
                        )?;
                        profile.ffmpeg_wait_us += started.elapsed().as_micros();
                    }
                }
            }
            let started = Instant::now();
            let (bytes, loop_ms) = video.finish()?;
            profile.ffmpeg_wait_us += started.elapsed().as_micros();
            Ok((files, bytes, loop_ms, profile))
        });
        let production = (|| -> Result<()> {
            for batch in planned.chunks(batch_size) {
                let mut works = Vec::with_capacity(batch.len());
                for entry in batch {
                    if entry.hit.is_some() {
                        works.push((entry, None));
                        continue;
                    }
                    temperatures.take_touched();
                    let temperature_time = temperature_epoch(&temperatures, entry.plan.epoch);
                    let input = Input {
                        epoch: entry.plan.epoch,
                        still: entry.plan.still,
                        loop_frame: entry.plan.loop_frame,
                        night: entry.night,
                        cloud: entry.cloud,
                        coverage: entry.coverage,
                        hours: Arc::clone(&hours),
                        temperatures: load_blend(&mut temperatures, temperature_time)?,
                    };
                    let touched = temperatures.take_touched();
                    let storable = match (&cache, &entry.prediction) {
                        (Some(cache), Some(prediction)) => {
                            cache.verify(prediction, &touched)
                                && entry
                                    .hour_indices
                                    .iter()
                                    .all(|&index| verified_hours[index])
                        }
                        _ => false,
                    };
                    works.push((entry, Some((input, storable))));
                }
                let outputs = works
                    .into_par_iter()
                    .map(|(entry, work)| -> Result<Output> {
                        let Some((input, storable)) = work else {
                            return cached_output(entry, cache.as_ref().unwrap(), temporary.path());
                        };
                        let output = painter
                            .frame(&input, temporary.path())
                            .with_context(|| format!("Rendering air map time {}", input.epoch))?;
                        if let Some(cache) = &cache {
                            let prediction = entry.prediction.as_ref().filter(|_| storable);
                            cache.rendered(prediction);
                            if let Some(prediction) = prediction {
                                let still = output
                                    .still
                                    .as_ref()
                                    .map(|file| temporary.path().join(&file.file));
                                cache.store(
                                    prediction.key,
                                    output.rgb.as_deref(),
                                    still.as_deref(),
                                    None,
                                )?;
                            }
                        }
                        Ok(output)
                    })
                    .collect::<Result<Vec<_>>>()?;
                sender.send(outputs).context("Air video writer stopped")?;
            }
            Ok(())
        })();
        drop(sender);
        let written = writer
            .join()
            .map_err(|_| anyhow::anyhow!("Air video writer panicked"))?;
        production?;
        written
    })?;
    files.insert(
        0,
        FileMedia {
            file: "air-loop.mp4".into(),
            kind: "animation",
            epoch: now,
            bytes,
            width: constants().size.width,
            height: constants().size.height,
        },
    );
    files[1..].sort_by_key(|file| file.epoch);
    ensure!(
        files.len() == still_epochs.len() + 1,
        "Incomplete air media matrix"
    );
    for file in &files {
        fs::rename(
            temporary.path().join(&file.file),
            out_directory.join(&file.file),
        )?;
    }
    total.fields_us = preparation_us;
    total.decode_us = [
        &sources.cloud,
        &sources.low,
        &sources.mid,
        &sources.high,
        &sources.radiation,
        &temperatures,
    ]
    .iter()
    .map(|dataset| dataset.decode_us)
    .sum();
    total.source_frames = sources.cloud.loaded;
    let media = Media {
        version: 1,
        mode: "air",
        generated: manifest.generated.clone(),
        now: manifest.now.clone(),
        width: constants().size.width,
        height: constants().size.height,
        fps: loop_plan.fps,
        frames: loop_epochs.len(),
        hold_frames: loop_plan.hold_frames,
        clock_variant: clock,
        loop_epochs,
        render_ms: (preparation_us + total.composition_us + total.overlay_us) / 1000,
        encode_ms: total.jpeg_us / 1000,
        loop_ms,
        total_ms: started.elapsed().as_millis(),
        profile: total,
        files,
        cache: cache.map(|cache| cache.finish(&[])).transpose()?,
    };
    fs::write(
        temporary.path().join("media.json"),
        serde_json::to_vec_pretty(&media)?,
    )?;
    fs::rename(temporary.path().join("media.json"), receipt)?;
    Ok(media)
}
