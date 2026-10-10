use crate::{
    data::Dataset,
    encode::{Video, jpeg},
};
use anyhow::{Context, Result, ensure};
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
use std::{fs, path::Path, time::Instant};

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

struct Scene<'a> {
    rain: Dataset<'a>,
    temperatures: Dataset<'a>,
    compositor: RainCompositor,
    text: Text,
    motion_pair: Option<(usize, usize)>,
    plates: [Vec<u8>; 2],
    now: i64,
    profile: Profile,
}

impl Scene<'_> {
    fn frame(&mut self, epoch: i64) -> Result<Vec<u8>> {
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
        let pair = (blend.left, blend.right);
        if self.motion_pair != Some(pair) {
            let started = Instant::now();
            let interval = (right_frame.epoch - left_frame.epoch) as f64 / 60_000.0;
            let limit = warp_limit(interval);
            let motion = self.rain.motion(&left_frame, &right_frame)?;
            self.compositor
                .set_motion(motion.as_ref().map(|(width, height, vectors)| Motion {
                    vectors,
                    width: *width,
                    height: *height,
                    interval,
                    cap: limit.cap_cells,
                    fade: limit.fade_end_cells,
                }));
            self.motion_pair = Some(pair);
            self.profile.motion_us += started.elapsed().as_micros();
        }
        let night = dark(epoch);
        let mut rgb = self.plates[usize::from(night)].clone();
        let overlay_started = Instant::now();
        if !self.temperatures.frames.is_empty() {
            let temperature_epoch = ((epoch + 300_000).div_euclid(600_000) * 600_000).clamp(
                self.temperatures.frames[0].epoch,
                self.temperatures.frames.last().unwrap().epoch,
            );
            let blend = frame_blend(&self.temperatures.frames, temperature_epoch);
            let left_frame = self.temperatures.frames[blend.left].clone();
            let right_frame = self.temperatures.frames[blend.right].clone();
            let left = self.temperatures.load(&left_frame)?;
            let right = self.temperatures.load(&right_frame)?;
            draw_temperature(
                &mut self.text,
                &mut rgb,
                &self.compositor.projection,
                TemperaturePair {
                    left_grid: &left.grid,
                    right_grid: &right.grid,
                    left: &left.values,
                    right: &right.values,
                    left_quant: &left.quant,
                    right_quant: &right.quant,
                    mix: blend.mix,
                },
                night,
            );
        }
        self.profile.overlay_us += overlay_started.elapsed().as_micros();
        let mixing_started = Instant::now();
        self.compositor.compose(
            &mut rgb,
            RainPair {
                left: &left.values,
                right: &right.values,
                mix: blend.mix,
            },
            night,
        );
        self.profile.mixing_us += mixing_started.elapsed().as_micros();
        let overlay_started = Instant::now();
        draw_overlay(&mut self.text, &mut rgb, epoch, self.now, night);
        self.profile.overlay_us += overlay_started.elapsed().as_micros();
        self.profile.output_frames += 1;
        Ok(rgb)
    }
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
    let first_frame = rain.frames[0].clone();
    let grid = rain.load(&first_frame)?.grid.clone();
    let plates = plates(basemap_directory, &grid)?;
    let mut scene = Scene {
        rain,
        temperatures: Dataset::new(data_directory, manifest, "feels_like_c")?,
        compositor: RainCompositor::new(grid),
        text: Text::new().map_err(anyhow::Error::msg)?,
        plates,
        now,
        motion_pair: None,
        profile: Profile::default(),
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
    let mut still_pending = still_epochs.clone();
    let mut video = Video::start(&temporary.path().join("weather-loop.mp4"))?;
    let mut files = Vec::new();
    let mut render_ms = 0;
    let mut encode_ms = 0;
    for &epoch in &loop_epochs {
        let frame_started = Instant::now();
        let rgb = scene
            .frame(epoch)
            .with_context(|| format!("Rendering map time {epoch}"))?;
        render_ms += frame_started.elapsed().as_micros();
        let write_started = Instant::now();
        video.frame(&rgb)?;
        scene.profile.ffmpeg_wait_us += write_started.elapsed().as_micros();
        if let Some(index) = still_pending.iter().position(|pending| *pending == epoch) {
            still_pending.remove(index);
            let jpeg_started = Instant::now();
            files.push(still(&rgb, epoch, temporary.path())?);
            encode_ms += jpeg_started.elapsed().as_micros();
        }
    }
    let finish_started = Instant::now();
    let (bytes, loop_ms) = video.finish()?;
    scene.profile.ffmpeg_wait_us += finish_started.elapsed().as_micros();
    files.insert(
        0,
        FileMedia {
            file: "weather-loop.mp4".into(),
            kind: "animation",
            epoch: now,
            bytes,
            width: constants.size.width,
            height: constants.size.height,
        },
    );
    for epoch in still_pending {
        let frame_started = Instant::now();
        let rgb = scene
            .frame(epoch)
            .with_context(|| format!("Rendering still time {epoch}"))?;
        render_ms += frame_started.elapsed().as_micros();
        let jpeg_started = Instant::now();
        files.push(still(&rgb, epoch, temporary.path())?);
        encode_ms += jpeg_started.elapsed().as_micros();
    }
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
    scene.profile.sampling_us = scene.rain.sampling_us;
    scene.profile.decode_us = scene.rain.decode_us + scene.temperatures.decode_us;
    scene.profile.source_frames = scene.rain.loaded;
    scene.profile.jpeg_us = encode_ms;
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
        loop_ms,
        encode_ms: encode_ms / 1000,
        total_ms: started.elapsed().as_millis(),
        profile: scene.profile,
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
