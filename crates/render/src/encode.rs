use anyhow::{Context, Result, ensure};
use render_core::constants::constants;
use serde::Deserialize;
use std::{
    fs::{self, File},
    io::{BufWriter, Write},
    path::{Path, PathBuf},
    process::{Child, ChildStdin, Command, Stdio},
    time::Instant,
};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    preset: String,
    crf: u8,
    x264_params: String,
    max_bytes: u64,
    vbv_budget_ratio: f64,
    vbv_buffer_seconds: f64,
}

impl Settings {
    pub fn from_env() -> Result<Self> {
        let mut settings: Self =
            serde_json::from_str(include_str!("../assets/video-encoding.json"))?;
        if let Ok(value) = std::env::var("MOTREGEN_VIDEO_PRESET") {
            settings.preset = value;
        }
        if let Ok(value) = std::env::var("MOTREGEN_VIDEO_CRF") {
            settings.crf = value.parse().context("Invalid MOTREGEN_VIDEO_CRF")?;
        }
        if let Ok(value) = std::env::var("MOTREGEN_VIDEO_MAX_BYTES") {
            settings.max_bytes = value.parse().context("Invalid MOTREGEN_VIDEO_MAX_BYTES")?;
        }
        settings.validate()?;
        Ok(settings)
    }

    fn validate(&self) -> Result<()> {
        ensure!(
            [
                "ultrafast",
                "superfast",
                "veryfast",
                "faster",
                "fast",
                "medium",
                "slow",
                "slower",
                "veryslow",
                "placebo"
            ]
            .contains(&self.preset.as_str()),
            "Invalid MOTREGEN_VIDEO_PRESET"
        );
        ensure!(
            (1..=51).contains(&self.crf),
            "MOTREGEN_VIDEO_CRF must be 1..51"
        );
        ensure!(
            self.max_bytes > 0 && self.max_bytes < 50_000_000,
            "MOTREGEN_VIDEO_MAX_BYTES must be between 0 and 50 MB"
        );
        Ok(())
    }

    fn validate_bytes(&self, bytes: u64) -> Result<()> {
        ensure!(
            bytes > 0 && bytes <= self.max_bytes,
            "Video exceeds safety limit of {} bytes ({bytes})",
            self.max_bytes
        );
        Ok(())
    }

    fn rate_limit(&self, frames: usize, fps: (usize, usize)) -> Result<(u64, u64)> {
        ensure!(
            frames > 0 && fps.0 > 0 && fps.1 > 0,
            "Invalid video plan for VBV"
        );
        let duration = frames as f64 * fps.1 as f64 / fps.0 as f64;
        let maxrate =
            (self.vbv_budget_ratio * self.max_bytes as f64 * 8.0 / duration).floor() as u64;
        ensure!(maxrate > 0, "Video safety limit too small for VBV");
        Ok((
            maxrate,
            (self.vbv_buffer_seconds * maxrate as f64).floor() as u64,
        ))
    }
}

pub struct Video {
    child: Child,
    input: Option<ChildStdin>,
    path: PathBuf,
    diagnostics: tempfile::NamedTempFile,
    frames: usize,
    expected_frames: usize,
    started: Instant,
    settings: Settings,
}

impl Video {
    pub fn start(path: &Path) -> Result<Self> {
        let constants = constants();
        Self::start_plan(
            path,
            constants.loop_offsets.len(),
            constants.hold_frames,
            (
                constants.fps_fraction.numerator,
                constants.fps_fraction.denominator,
            ),
        )
    }

    pub fn start_plan(
        path: &Path,
        frames: usize,
        hold_frames: usize,
        fps: (usize, usize),
    ) -> Result<Self> {
        let constants = constants();
        let settings = Settings::from_env()?;
        let (maxrate, bufsize) = settings.rate_limit(frames + hold_frames, fps)?;
        let diagnostics = tempfile::NamedTempFile::new()?;
        let mut command = Command::new("ffmpeg");
        command.args([
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-filter_threads",
            "1",
            "-f",
            "rawvideo",
            "-pixel_format",
            "rgb24",
            "-video_size",
            &format!("{}x{}", constants.size.width, constants.size.height),
            "-framerate",
            &format!("{}/{}", fps.0, fps.1),
            "-i",
            "pipe:0",
            "-vf",
            &format!("tpad=stop_mode=clone:stop={},setsar=1", hold_frames),
            "-frames:v",
            &(frames + hold_frames).to_string(),
            "-c:v",
            "libx264",
            "-threads",
            "1",
            "-preset",
            &settings.preset,
            "-crf",
            &settings.crf.to_string(),
            "-profile:v",
            "high",
            "-maxrate",
            &maxrate.to_string(),
            "-bufsize",
            &bufsize.to_string(),
            "-pix_fmt",
            "yuv420p",
            "-movflags",
            "+faststart",
            "-an",
            "-f",
            "mp4",
        ]);
        if settings.preset == "ultrafast" {
            command.args(["-x264-params", &settings.x264_params]);
        }
        let mut child = command
            .arg(path)
            .stdin(Stdio::piped())
            .stdout(Stdio::null())
            .stderr(diagnostics.reopen()?)
            .spawn()
            .context("Starting ffmpeg")?;
        let input = child.stdin.take();
        Ok(Self {
            child,
            input,
            path: path.into(),
            diagnostics,
            frames: 0,
            expected_frames: frames,
            started: Instant::now(),
            settings,
        })
    }

    pub fn frame(&mut self, rgb: &[u8]) -> Result<()> {
        ensure!(
            rgb.len() == constants().size.width * constants().size.height * 3,
            "Invalid RGB frame length"
        );
        self.input
            .as_mut()
            .context("Video already closed")?
            .write_all(rgb)
            .context("Writing ffmpeg stdin")?;
        self.frames += 1;
        Ok(())
    }

    pub fn finish(mut self) -> Result<(u64, u128)> {
        self.input.take();
        let status = self.child.wait()?;
        ensure!(
            status.success(),
            "ffmpeg failed: {}",
            fs::read_to_string(self.diagnostics.path())?
        );
        ensure!(
            self.frames == self.expected_frames,
            "Incorrect video frame count"
        );
        let bytes = fs::metadata(&self.path)?.len();
        self.settings.validate_bytes(bytes)?;
        Ok((bytes, self.started.elapsed().as_millis()))
    }
}

impl Drop for Video {
    fn drop(&mut self) {
        self.input.take();
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

pub fn jpeg(rgb: &[u8], path: &Path) -> Result<u64> {
    let constants = constants();
    let mut writer = BufWriter::new(File::create(path)?);
    let mut encoder = jpeg_encoder::Encoder::new(&mut writer, 95);
    encoder.set_sampling_factor(jpeg_encoder::SamplingFactor::F_1_1);
    encoder.encode(
        rgb,
        constants.size.width as u16,
        constants.size.height as u16,
        jpeg_encoder::ColorType::Rgb,
    )?;
    writer.flush()?;
    Ok(fs::metadata(path)?.len())
}

#[cfg(test)]
mod tests {
    use super::Settings;

    #[test]
    fn safety_limit_is_not_a_bitrate_target() {
        let settings: Settings =
            serde_json::from_str(include_str!("../assets/video-encoding.json")).unwrap();
        settings.validate().unwrap();
        for bytes in [3_000_001, settings.max_bytes] {
            settings.validate_bytes(bytes).unwrap();
        }
        for bytes in [0, settings.max_bytes + 1] {
            assert!(settings.validate_bytes(bytes).is_err());
        }
    }

    #[test]
    fn invalid_settings_fail_instead_of_silently_changing_quality() {
        for (preset, crf, max_bytes) in [
            ("invalid", 18, 20_000_000),
            ("veryfast", 0, 20_000_000),
            ("veryfast", 52, 20_000_000),
            ("veryfast", 18, 0),
            ("veryfast", 18, 50_000_000),
        ] {
            assert!(
                Settings {
                    preset: preset.into(),
                    crf,
                    x264_params: "8x8dct=1".into(),
                    max_bytes,
                    vbv_budget_ratio: 0.9,
                    vbv_buffer_seconds: 2.0,
                }
                .validate()
                .is_err()
            );
        }
    }

    #[test]
    fn vbv_budget_includes_hold_and_fractional_frame_rate() {
        let settings: Settings =
            serde_json::from_str(include_str!("../assets/video-encoding.json")).unwrap();
        assert_eq!(
            settings.rate_limit(223, (28, 5)).unwrap(),
            (3_616_143, 7_232_286)
        );
        assert_eq!(
            settings.rate_limit(115, (28, 5)).unwrap(),
            (7_012_173, 14_024_346)
        );
        assert!(settings.rate_limit(0, (10, 1)).is_err());
        assert!(settings.rate_limit(179, (0, 1)).is_err());
    }
}
