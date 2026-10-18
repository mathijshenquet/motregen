use crate::{
    data::{Dataset, Raster},
    encode::{Video, jpeg},
    frame_cache::{FrameCache, Key, ModeCache, Parts, Prediction},
};
use anyhow::{Context, Result, ensure};
use rayon::prelude::*;
use render_core::{
    clock::ClockTransition,
    constants::{constants, warp_limit},
    motion::Motion,
    overlay::{ClockOptions, draw_overlay},
    projection::Grid,
    rain::{RainCompositor, RainPair},
    temperature::{TemperaturePair, draw_temperature},
    text::Text,
    time::{Manifest, TimelineFrame, dark, epoch, frame_blend},
};
use serde::Serialize;
use std::{
    collections::BTreeMap,
    fs,
    path::Path,
    sync::{Arc, Mutex, mpsc},
    thread,
    time::Instant,
};

#[derive(Debug, Serialize)]
pub struct FileMedia {
    pub file: String,
    pub kind: &'static str,
    pub epoch: i64,
    pub bytes: u64,
    pub width: usize,
    pub height: usize,
}

#[derive(Debug, Serialize)]
pub struct Media {
    pub version: u32,
    pub mode: &'static str,
    pub generated: String,
    pub now: String,
    pub width: usize,
    pub height: usize,
    pub fps: f64,
    pub frames: usize,
    pub hold_frames: usize,
    pub clock_variant: Option<ClockTransition>,
    pub loop_epochs: Vec<i64>,
    pub render_ms: u128,
    pub loop_ms: u128,
    pub encode_ms: u128,
    pub total_ms: u128,
    pub profile: Profile,
    pub files: Vec<FileMedia>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cache: Option<crate::frame_cache::Report>,
}

#[derive(Debug, Default, Serialize)]
pub struct Profile {
    pub output_frames: usize,
    pub source_frames: usize,
    pub decode_us: u128,
    pub sampling_us: u128,
    pub motion_us: u128,
    pub mixing_us: u128,
    pub overlay_us: u128,
    pub jpeg_us: u128,
    pub ffmpeg_wait_us: u128,
    pub fields_us: u128,
    pub contours_us: u128,
    pub labels_us: u128,
    pub strokes_us: u128,
    pub composition_us: u128,
}

#[derive(Clone, Copy)]
pub struct Options<'a> {
    pub clock: Option<ClockTransition>,
    pub cache: Option<&'a FrameCache>,
}

#[derive(Clone, Copy)]
pub(crate) struct FramePlan {
    pub epoch: i64,
    pub loop_frame: bool,
    pub still: bool,
}

pub(crate) fn frame_plans(loop_epochs: &[i64], still_epochs: &[i64]) -> Vec<FramePlan> {
    let mut plans = BTreeMap::new();
    for &epoch in loop_epochs {
        plans.insert(
            epoch,
            FramePlan {
                epoch,
                loop_frame: true,
                still: false,
            },
        );
    }
    for &epoch in still_epochs {
        plans
            .entry(epoch)
            .and_modify(|plan| plan.still = true)
            .or_insert(FramePlan {
                epoch,
                loop_frame: false,
                still: true,
            });
    }
    plans.into_values().collect()
}

struct FrameInput {
    plan: FramePlan,
    left: Arc<Raster>,
    right: Arc<Raster>,
    mix: f64,
    cap: f64,
    motion: Option<Arc<Vec<(f64, f64)>>>,
    temperatures: Option<(Arc<Raster>, Arc<Raster>, f64)>,
    night: bool,
}

struct Scene<'a> {
    rain: Dataset<'a>,
    temperatures: Dataset<'a>,
    compositor: Arc<RainCompositor>,
    motion_pair: Option<(usize, usize)>,
    motion: Option<Arc<Vec<(f64, f64)>>>,
    profile: Profile,
    prepare_us: u128,
}

impl Scene<'_> {
    fn temperature_frames(&self, epoch: i64) -> Option<(TimelineFrame, TimelineFrame, f64)> {
        let frames = &self.temperatures.frames;
        if frames.is_empty() {
            return None;
        }
        let temperature_epoch = ((epoch + 300_000).div_euclid(600_000) * 600_000)
            .clamp(frames[0].epoch, frames.last().unwrap().epoch);
        let blend = frame_blend(frames, temperature_epoch);
        Some((
            frames[blend.left].clone(),
            frames[blend.right].clone(),
            blend.mix,
        ))
    }

    fn predict(
        &mut self,
        plan: FramePlan,
        now: i64,
        cache: &ModeCache,
        clock: Option<ClockTransition>,
    ) -> Result<Option<Prediction>> {
        let epoch = plan.epoch;
        let blend = frame_blend(&self.rain.frames, epoch);
        let left = self.rain.frames[blend.left].clone();
        let right = self.rain.frames[blend.right].clone();
        let mut key = cache.key();
        key.bytes(format!("{clock:?}").as_bytes())
            .number(epoch)
            .flag(plan.still)
            .flag(epoch <= now)
            .number(left.epoch)
            .number(right.epoch)
            .real(blend.mix)
            .source(self.rain.identity(&left)?)
            .source(self.rain.identity(&right)?);
        if blend.mix > 0.0 && blend.mix < 1.0 {
            match self.rain.motion_frame(&left, &right)? {
                Some(frame) => key.source(self.rain.motion_identity(&frame)?),
                None => key.flag(false),
            };
        }
        if let Some((left, right, mix)) = self.temperature_frames(epoch) {
            key.real(mix)
                .source(self.temperatures.identity(&left)?)
                .source(self.temperatures.identity(&right)?);
        }
        Ok(key.finish())
    }

    fn prepare(&mut self, plan: FramePlan) -> Result<FrameInput> {
        let started = Instant::now();
        let epoch = plan.epoch;
        ensure!(
            epoch >= self.rain.frames[0].epoch && epoch <= self.rain.frames.last().unwrap().epoch,
            "Map time outside rain timeline: {epoch}"
        );
        let blend = frame_blend(&self.rain.frames, epoch);
        let left_frame = self.rain.frames[blend.left].clone();
        let right_frame = self.rain.frames[blend.right].clone();
        let left = self.rain.load(&left_frame)?;
        let right = self.rain.load(&right_frame)?;
        ensure!(
            left.grid == self.compositor.grid && right.grid == left.grid,
            "Rain grid changes within generation"
        );
        let needs_motion = blend.mix > 0.0 && blend.mix < 1.0;
        let pair = (blend.left, blend.right);
        if needs_motion && self.motion_pair != Some(pair) {
            let started = Instant::now();
            self.motion = None;
            let interval = (right_frame.epoch - left_frame.epoch) as f64 / 60_000.0;
            let limit = warp_limit(interval);
            let motion = self.rain.motion(&left_frame, &right_frame)?;
            self.motion = motion.as_ref().map(|(width, height, vectors)| {
                Arc::new(self.compositor.project_motion(
                    Motion {
                        vectors,
                        width: *width,
                        height: *height,
                        interval,
                        cap: limit.cap_cells,
                        fade: limit.fade_end_cells,
                    },
                    Some(render_core::composition::CoveragePair {
                        left: left.coverage.as_ref().unwrap(),
                        right: right.coverage.as_ref().unwrap(),
                        displacement: limit.cap_cells,
                    }),
                ))
            });
            self.motion_pair = Some(pair);
            self.profile.motion_us += started.elapsed().as_micros();
        }
        let temperatures = match self.temperature_frames(epoch) {
            Some((left, right, mix)) => Some((
                self.temperatures.load(&left)?,
                self.temperatures.load(&right)?,
                mix,
            )),
            None => None,
        };
        self.prepare_us += started.elapsed().as_micros();
        Ok(FrameInput {
            plan,
            left,
            right,
            mix: blend.mix,
            cap: if needs_motion {
                warp_limit((right_frame.epoch - left_frame.epoch) as f64 / 60_000.0).cap_cells
            } else {
                0.0
            },
            motion: needs_motion.then(|| self.motion.clone()).flatten(),
            temperatures,
            night: dark(epoch),
        })
    }
}

struct Painter {
    compositor: Arc<RainCompositor>,
    text: [Mutex<Text>; 2],
    plates: crate::shared::Plates,
    now: i64,
    clock_variant: Option<ClockTransition>,
}

struct FrameOutput {
    rgb: Option<Vec<u8>>,
    still: Option<FileMedia>,
    profile: Profile,
    render_us: u128,
}

enum Work {
    Cached {
        plan: FramePlan,
        key: Key,
        rgb: Option<Vec<u8>>,
    },
    Render {
        input: Box<FrameInput>,
        prediction: Option<Prediction>,
    },
}

impl Work {
    fn run(
        self,
        painter: &Painter,
        cache: Option<&ModeCache>,
        directory: &Path,
    ) -> Result<FrameOutput> {
        match self {
            Work::Cached { plan, key, rgb } => {
                let cache = cache.context("Cached frame without cache")?;
                let rgb = rgb
                    .map(|compressed| cache.restore(key, &compressed))
                    .transpose()?;
                let still = if plan.still {
                    let file = still_name(plan.epoch);
                    let bytes = cache.copy_still(key, &directory.join(&file))?;
                    Some(still_media(file, plan.epoch, bytes))
                } else {
                    None
                };
                Ok(FrameOutput {
                    rgb,
                    still,
                    profile: Profile::default(),
                    render_us: 0,
                })
            }
            Work::Render { input, prediction } => {
                let output = painter
                    .frame(&input, directory)
                    .with_context(|| format!("Rendering map time {}", input.plan.epoch))?;
                if let Some(cache) = cache {
                    cache.rendered(prediction.as_ref());
                    if let Some(prediction) = &prediction {
                        let still = output.still.as_ref().map(|file| directory.join(&file.file));
                        cache.store(
                            prediction.key,
                            output.rgb.as_deref(),
                            still.as_deref(),
                            None,
                        )?;
                    }
                }
                Ok(output)
            }
        }
    }
}

impl Painter {
    fn frame(&self, input: &FrameInput, directory: &Path) -> Result<FrameOutput> {
        let started = Instant::now();
        let mut text = self.text[rayon::current_thread_index().unwrap_or(0)]
            .lock()
            .map_err(|_| anyhow::anyhow!("Text worker panicked"))?;
        let mut profile = Profile {
            output_frames: 1,
            ..Profile::default()
        };
        let mut rgb = self.plates[usize::from(input.night)].clone();
        let overlay_started = Instant::now();
        if let Some((left, right, mix)) = &input.temperatures {
            draw_temperature(
                &mut text,
                &mut rgb,
                &self.compositor.projection,
                TemperaturePair {
                    left_grid: &left.grid,
                    right_grid: &right.grid,
                    left: &left.values,
                    right: &right.values,
                    left_quant: &left.quant,
                    right_quant: &right.quant,
                    mix: *mix,
                },
                input.night,
            );
        }
        profile.overlay_us += overlay_started.elapsed().as_micros();
        let mixing_started = Instant::now();
        self.compositor.compose(
            &mut rgb,
            RainPair {
                left: &input.left.values,
                right: &input.right.values,
                mix: input.mix,
                coverage: Some(render_core::composition::CoveragePair {
                    left: input.left.coverage.as_ref().unwrap(),
                    right: input.right.coverage.as_ref().unwrap(),
                    displacement: input.cap,
                }),
            },
            input.motion.as_deref().map(Vec::as_slice),
            input.night,
        );
        profile.mixing_us += mixing_started.elapsed().as_micros();
        let overlay_started = Instant::now();
        draw_overlay(
            &mut text,
            &mut rgb,
            input.plan.epoch,
            self.now,
            input.night,
            ClockOptions {
                transition: self.clock_variant,
                still: input.plan.still,
            },
        );
        profile.overlay_us += overlay_started.elapsed().as_micros();
        let render_us = started.elapsed().as_micros();
        let jpeg_started = Instant::now();
        let still = input
            .plan
            .still
            .then(|| still(&rgb, input.plan.epoch, directory))
            .transpose()?;
        if input.plan.still {
            profile.jpeg_us = jpeg_started.elapsed().as_micros();
        }
        Ok(FrameOutput {
            rgb: input.plan.loop_frame.then_some(rgb),
            still,
            profile,
            render_us,
        })
    }
}

struct VideoOutput {
    files: Vec<FileMedia>,
    bytes: u64,
    loop_ms: u128,
    profile: Profile,
    render_us: u128,
}

fn write_video(
    receiver: mpsc::Receiver<Vec<FrameOutput>>,
    directory: &Path,
) -> Result<VideoOutput> {
    let mut video = Some(Video::start(&directory.join("weather-loop.mp4"))?);
    let mut video_result = None;
    let mut video_frames = 0;
    let mut files = Vec::new();
    let mut profile = Profile::default();
    let mut render_us = 0;
    for batch in receiver {
        for frame in batch {
            profile.output_frames += frame.profile.output_frames;
            profile.mixing_us += frame.profile.mixing_us;
            profile.overlay_us += frame.profile.overlay_us;
            profile.jpeg_us += frame.profile.jpeg_us;
            render_us += frame.render_us;
            if let Some(file) = frame.still {
                files.push(file);
            }
            if let Some(rgb) = frame.rgb {
                let started = Instant::now();
                video
                    .as_mut()
                    .context("Frame after video completion")?
                    .frame(&rgb)?;
                video_frames += 1;
                if video_frames == constants().loop_offsets.len() {
                    video_result = Some(video.take().unwrap().finish()?);
                }
                profile.ffmpeg_wait_us += started.elapsed().as_micros();
            }
        }
    }
    let (bytes, loop_ms) = video_result.context("Incomplete video frames")?;
    Ok(VideoOutput {
        files,
        bytes,
        loop_ms,
        profile,
        render_us,
    })
}

pub(crate) fn plates(directory: &Path, grid: &Grid) -> Result<crate::shared::Plates> {
    let constants = constants();
    let metadata: serde_json::Value =
        serde_json::from_slice(&fs::read(directory.join("basemap.json"))?)?;
    ensure!(metadata["version"] == 1, "Unsupported basemap version");
    ensure!(
        metadata["size"]["width"] == constants.size.width
            && metadata["size"]["height"] == constants.size.height,
        "Basemap size differs from renderer"
    );
    for (name, expected) in [
        ("lng", constants.view.lng),
        ("lat", constants.view.lat),
        ("zoom", constants.view.zoom),
    ] {
        ensure!(
            metadata["view"][name]
                .as_f64()
                .is_some_and(|actual| (actual - expected).abs() < 1e-10),
            "Basemap projection differs: {name}"
        );
    }
    let plate_grid: Grid = serde_json::from_value(metadata["grid"].clone())?;
    ensure!(
        &plate_grid == grid,
        "Basemap frame mask uses a different grid"
    );
    let load = |theme: &str| -> Result<Vec<u8>> {
        let image = image::open(directory.join(format!("{theme}.png")))?.into_rgb8();
        ensure!(
            image.width() as usize == constants.size.width
                && image.height() as usize == constants.size.height,
            "Incorrect {theme} plate dimensions"
        );
        let water = image::open(directory.join(format!("water-{theme}.png")))?;
        ensure!(
            water.width() > 0
                && water.height() > 0
                && water.width() <= image.width()
                && water.height() <= image.height(),
            "Invalid water mask"
        );
        Ok(image.into_raw())
    };
    if let Some(inputs) = crate::shared::inputs() {
        let mut plates = inputs
            .plates
            .lock()
            .map_err(|_| anyhow::anyhow!("Shared plates panicked"))?;
        if let Some(plates) = plates.as_ref() {
            return Ok(Arc::clone(plates));
        }
        let loaded = Arc::new([load("light")?, load("dark")?]);
        *plates = Some(Arc::clone(&loaded));
        Ok(loaded)
    } else {
        Ok(Arc::new([load("light")?, load("dark")?]))
    }
}

pub fn render(
    data_directory: &Path,
    basemap_directory: &Path,
    out_directory: &Path,
    manifest: &Manifest,
    options: Options,
) -> Result<Media> {
    let started = Instant::now();
    let clock_variant = options.clock;
    let cache = options.cache.map(|cache| cache.mode("weather"));
    let constants = constants();
    let now = epoch(&manifest.now)?;
    let mut rain = Dataset::new(data_directory, manifest, "rain_rate")?;
    ensure!(!rain.frames.is_empty(), "Rain timeline missing");
    let grid = rain.grid()?;
    rain.limit_to_view = true;
    let compositor = Arc::new(RainCompositor::new(grid.clone()));
    let painter = Painter {
        compositor: Arc::clone(&compositor),
        text: [
            Mutex::new(Text::new().map_err(anyhow::Error::msg)?),
            Mutex::new(Text::new().map_err(anyhow::Error::msg)?),
        ],
        plates: plates(basemap_directory, &grid)?,
        now,
        clock_variant,
    };
    let mut scene = Scene {
        rain,
        temperatures: Dataset::new(data_directory, manifest, "feels_like_c")?,
        compositor,
        motion_pair: None,
        motion: None,
        profile: Profile::default(),
        prepare_us: 0,
    };
    if cache.is_some() {
        scene.rain.touched = Some(Vec::new());
        scene.temperatures.touched = Some(Vec::new());
    }
    fs::create_dir_all(out_directory)?;
    let receipt = out_directory.join("media.json");
    if receipt.exists() {
        fs::remove_file(&receipt)?;
    }
    let temporary = tempfile::tempdir_in(out_directory)?;
    let loop_epochs: Vec<i64> = constants
        .loop_offsets
        .iter()
        .map(|offset| now + offset)
        .collect();
    let still_epochs: Vec<i64> = constants
        .still_minutes
        .iter()
        .map(|minute| now + minute * 60_000)
        .collect();
    let plans = frame_plans(&loop_epochs, &still_epochs);
    let mut output = thread::scope(|scope| -> Result<VideoOutput> {
        // One queued batch bounds RGB/motion memory while ffmpeg consumes the preceding batch.
        let (sender, receiver) = mpsc::sync_channel(1);
        let writer = scope.spawn(|| write_video(receiver, temporary.path()));
        let production = (|| -> Result<()> {
            for plans in plans.chunks(if crate::shared::inputs().is_some() {
                2
            } else {
                4
            }) {
                let mut works = Vec::new();
                for &plan in plans {
                    works.push(
                        plan_work(&mut scene, plan, now, cache.as_ref(), clock_variant)
                            .with_context(|| format!("Preparing map time {}", plan.epoch))?,
                    );
                }
                let frames = works
                    .into_par_iter()
                    .map(|work| work.run(&painter, cache.as_ref(), temporary.path()))
                    .collect::<Result<Vec<_>>>()?;
                sender.send(frames).context("Video writer stopped")?;
            }
            Ok(())
        })();
        drop(sender);
        let written = writer
            .join()
            .map_err(|_| anyhow::anyhow!("Video writer panicked"))?;
        match written {
            Ok(output) => {
                production?;
                Ok(output)
            }
            Err(error) => match production {
                Ok(()) => Err(error),
                Err(production_error) => {
                    Err(production_error.context(format!("Video output: {error:#}")))
                }
            },
        }
    })?;
    let render_ms = scene.prepare_us + output.render_us;
    let encode_ms = output.profile.jpeg_us;
    output.profile.sampling_us = scene.rain.sampling_us;
    output.profile.decode_us = scene.rain.decode_us + scene.temperatures.decode_us;
    output.profile.source_frames = scene.rain.loaded;
    output.profile.motion_us = scene.profile.motion_us;
    let mut files = output.files;
    files.insert(
        0,
        FileMedia {
            file: "weather-loop.mp4".into(),
            kind: "animation",
            epoch: now,
            bytes: output.bytes,
            width: constants.size.width,
            height: constants.size.height,
        },
    );
    files[1..].sort_by_key(|file| file.epoch);
    ensure!(
        files.len() == still_epochs.len() + 1,
        "Incomplete still matrix"
    );
    for file in &files {
        fs::rename(
            temporary.path().join(&file.file),
            out_directory.join(&file.file),
        )?;
    }
    let media = Media {
        version: 1,
        mode: "weather",
        generated: manifest.generated.clone(),
        now: manifest.now.clone(),
        width: constants.size.width,
        height: constants.size.height,
        fps: constants.fps,
        frames: loop_epochs.len(),
        hold_frames: constants.hold_frames,
        clock_variant,
        loop_epochs,
        render_ms: render_ms / 1000,
        loop_ms: output.loop_ms,
        encode_ms: encode_ms / 1000,
        total_ms: started.elapsed().as_millis(),
        profile: output.profile,
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

fn plan_work(
    scene: &mut Scene,
    plan: FramePlan,
    now: i64,
    cache: Option<&ModeCache>,
    clock: Option<ClockTransition>,
) -> Result<Work> {
    let Some(cache) = cache else {
        return Ok(Work::Render {
            input: Box::new(scene.prepare(plan)?),
            prediction: None,
        });
    };
    let prediction = scene.predict(plan, now, cache, clock)?;
    if let Some(prediction) = &prediction {
        let parts = Parts {
            rgb: plan.loop_frame,
            still: plan.still,
            state: false,
        };
        if let Some(hit) = cache.lookup(prediction.key, parts)? {
            return Ok(Work::Cached {
                plan,
                key: prediction.key,
                rgb: hit.rgb,
            });
        }
    }
    scene.rain.take_touched();
    scene.temperatures.take_touched();
    let input = scene.prepare(plan)?;
    let mut touched = scene.rain.take_touched();
    touched.extend(scene.temperatures.take_touched());
    Ok(Work::Render {
        input: Box::new(input),
        prediction: prediction.filter(|prediction| cache.verify(prediction, &touched)),
    })
}

fn still_name(epoch: i64) -> String {
    format!("weather-{epoch}.jpg")
}

fn still_media(file: String, epoch: i64, bytes: u64) -> FileMedia {
    FileMedia {
        file,
        kind: "photo",
        epoch,
        bytes,
        width: constants().size.width,
        height: constants().size.height,
    }
}

fn still(rgb: &[u8], epoch: i64, directory: &Path) -> Result<FileMedia> {
    let file = still_name(epoch);
    let bytes = jpeg(rgb, &directory.join(&file))?;
    Ok(still_media(file, epoch, bytes))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn temperature_plan_preserves_stills_outside_the_shorter_film() {
        let constants = constants();
        let mode = &render_core::mode_constants::mode_constants().loops.feels;
        assert_eq!(mode.fps, 5.6);
        assert_eq!(mode.fps_fraction.numerator, 28);
        assert_eq!(mode.fps_fraction.denominator, 5);
        assert_eq!(mode.hold_frames, 6);
        assert_eq!(mode.loop_offsets.len(), 217);
        assert_eq!(mode.loop_offsets[0], -3_600_000);
        assert_eq!(*mode.loop_offsets.last().unwrap(), 18_000_000);
        assert!(
            mode.loop_offsets
                .windows(2)
                .all(|pair| pair[1] - pair[0] == 100_000)
        );
        let stills: Vec<_> = constants
            .still_minutes
            .iter()
            .map(|minute| minute * 60_000)
            .collect();
        let plans = frame_plans(&mode.loop_offsets, &stills);
        assert_eq!(plans.len(), 265);
        assert_eq!(plans.iter().filter(|plan| plan.loop_frame).count(), 217);
        assert_eq!(plans.iter().filter(|plan| plan.still).count(), 85);
        assert_eq!(
            plans
                .iter()
                .filter(|plan| plan.loop_frame && plan.still)
                .count(),
            37
        );
        assert_eq!(plans.last().unwrap().epoch, 43_200_000);
        assert!(!plans.last().unwrap().loop_frame);
        assert!(plans.last().unwrap().still);
        assert!(plans.windows(2).all(|pair| pair[0].epoch < pair[1].epoch));
    }

    #[test]
    fn wind_plan_has_its_own_faster_clock_and_whole_frame_hold() {
        let mode = &render_core::mode_constants::mode_constants().loops.wind;
        assert_eq!(mode.fps, 7.5);
        assert_eq!(mode.fps_fraction.numerator, 15);
        assert_eq!(mode.fps_fraction.denominator, 2);
        assert_eq!(mode.hold_frames, 8);
        assert_eq!(mode.loop_offsets.len(), 289);
        assert_eq!(mode.loop_offsets[0], -3_600_000);
        assert_eq!(*mode.loop_offsets.last().unwrap(), 18_000_000);
        assert!(
            mode.loop_offsets
                .windows(2)
                .all(|pair| pair[1] - pair[0] == 75_000)
        );
        let plans = frame_plans(&mode.loop_offsets, &[]);
        assert_eq!(plans.len(), 289);
        assert!(plans.iter().all(|plan| plan.loop_frame && !plan.still));
    }

    #[test]
    fn fractional_rain_plan_composes_each_shared_still_only_once() {
        let constants = constants();
        assert_eq!(constants.fps, 5.6);
        assert_eq!(constants.fps_fraction.numerator, 28);
        assert_eq!(constants.fps_fraction.denominator, 5);
        assert_eq!(constants.hold_frames, 6);
        assert_eq!(constants.loop_offsets.len(), 109);
        assert_eq!(constants.loop_offsets[0], -3_600_000);
        assert_eq!(*constants.loop_offsets.last().unwrap(), 7_200_000);
        assert!(
            constants
                .loop_offsets
                .windows(2)
                .all(|pair| pair[1] - pair[0] == 100_000)
        );
        let stills: Vec<_> = constants
            .still_minutes
            .iter()
            .map(|minute| minute * 60_000)
            .collect();
        let plans = frame_plans(&constants.loop_offsets, &stills);
        assert_eq!(plans.len(), 175);
        assert_eq!(plans.iter().filter(|plan| plan.loop_frame).count(), 109);
        assert_eq!(plans.iter().filter(|plan| plan.still).count(), 85);
        assert_eq!(
            plans
                .iter()
                .filter(|plan| plan.loop_frame && plan.still)
                .count(),
            19
        );
        assert!(plans.windows(2).all(|pair| pair[0].epoch < pair[1].epoch));
        assert!(
            plans
                .iter()
                .filter(|plan| plan.still && (-3_600_000..=7_200_000).contains(&plan.epoch))
                .all(|plan| plan.loop_frame)
        );
    }
}
