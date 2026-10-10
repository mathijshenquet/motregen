use crate::{
    data::{Dataset, Raster},
    encode::{Video, jpeg},
};
use anyhow::{Context, Result, ensure};
use rayon::prelude::*;
use render_core::{
    constants::{constants, warp_limit},
    motion::Motion,
    overlay::draw_overlay,
    projection::Grid,
    rain::{RainCompositor, RainPair},
    temperature::{TemperaturePair, draw_temperature},
    text::Text,
    time::{Manifest, dark, epoch, frame_blend},
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
    pub fps: usize,
    pub frames: usize,
    pub hold_frames: usize,
    pub loop_epochs: Vec<i64>,
    pub render_ms: u128,
    pub loop_ms: u128,
    pub encode_ms: u128,
    pub total_ms: u128,
    pub profile: Profile,
    pub files: Vec<FileMedia>,
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
}

#[derive(Clone, Copy)]
struct FramePlan {
    epoch: i64,
    loop_frame: bool,
    still: bool,
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
        let temperatures = if self.temperatures.frames.is_empty() {
            None
        } else {
            let temperature_epoch = ((epoch + 300_000).div_euclid(600_000) * 600_000).clamp(
                self.temperatures.frames[0].epoch,
                self.temperatures.frames.last().unwrap().epoch,
            );
            let blend = frame_blend(&self.temperatures.frames, temperature_epoch);
            let left_frame = self.temperatures.frames[blend.left].clone();
            let right_frame = self.temperatures.frames[blend.right].clone();
            Some((
                self.temperatures.load(&left_frame)?,
                self.temperatures.load(&right_frame)?,
                blend.mix,
            ))
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
    plates: [Vec<u8>; 2],
    now: i64,
}

struct FrameOutput {
    rgb: Option<Vec<u8>>,
    still: Option<FileMedia>,
    profile: Profile,
    render_us: u128,
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
        draw_overlay(&mut text, &mut rgb, input.plan.epoch, self.now, input.night);
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

fn plates(directory: &Path, grid: &Grid) -> Result<[Vec<u8>; 2]> {
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
    Ok([load("light")?, load("dark")?])
}

pub fn render(
    data_directory: &Path,
    basemap_directory: &Path,
    out_directory: &Path,
    manifest: &Manifest,
) -> Result<Media> {
    let started = Instant::now();
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
    let mut plans = BTreeMap::new();
    for &epoch in &loop_epochs {
        plans.insert(
            epoch,
            FramePlan {
                epoch,
                loop_frame: true,
                still: false,
            },
        );
    }
    for &epoch in &still_epochs {
        plans
            .entry(epoch)
            .and_modify(|plan| plan.still = true)
            .or_insert(FramePlan {
                epoch,
                loop_frame: false,
                still: true,
            });
    }
    let plans: Vec<_> = plans.into_values().collect();
    let mut output = thread::scope(|scope| -> Result<VideoOutput> {
        // One queued batch bounds RGB/motion memory while ffmpeg consumes the preceding batch.
        let (sender, receiver) = mpsc::sync_channel(1);
        let writer = scope.spawn(|| write_video(receiver, temporary.path()));
        let production = (|| -> Result<()> {
            for plans in plans.chunks(4) {
                let inputs = plans
                    .iter()
                    .map(|&plan| {
                        scene
                            .prepare(plan)
                            .with_context(|| format!("Preparing map time {}", plan.epoch))
                    })
                    .collect::<Result<Vec<_>>>()?;
                let frames = inputs
                    .par_iter()
                    .map(|input| {
                        painter
                            .frame(input, temporary.path())
                            .with_context(|| format!("Rendering map time {}", input.plan.epoch))
                    })
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
        hold_frames: constants.fps,
        loop_epochs,
        render_ms: render_ms / 1000,
        loop_ms: output.loop_ms,
        encode_ms: encode_ms / 1000,
        total_ms: started.elapsed().as_millis(),
        profile: output.profile,
        files,
    };
    fs::write(
        temporary.path().join("media.json"),
        serde_json::to_vec_pretty(&media)?,
    )?;
    fs::rename(temporary.path().join("media.json"), receipt)?;
    Ok(media)
}

fn still(rgb: &[u8], epoch: i64, directory: &Path) -> Result<FileMedia> {
    let file = format!("weather-{epoch}.jpg");
    let bytes = jpeg(rgb, &directory.join(&file))?;
    Ok(FileMedia {
        file,
        kind: "photo",
        epoch,
        bytes,
        width: constants().size.width,
        height: constants().size.height,
    })
}
