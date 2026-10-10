use anyhow::{Context, Result, ensure};
use render_core::constants::constants;
use std::{
    fs::{self, File},
    io::{BufWriter, Write},
    path::{Path, PathBuf},
    process::{Child, ChildStdin, Command, Stdio},
    time::Instant,
};

pub struct Video {
    child: Child,
    input: Option<ChildStdin>,
    path: PathBuf,
    diagnostics: tempfile::NamedTempFile,
    frames: usize,
    started: Instant,
}

impl Video {
    pub fn start(path: &Path) -> Result<Self> {
        let constants = constants();
        let duration = (constants.loop_offsets.len() + constants.fps) as f64 / constants.fps as f64;
        let bitrate = (2_500_000.0 * 8.0 / duration).floor().to_string();
        let diagnostics = tempfile::NamedTempFile::new()?;
        let mut child = Command::new("ffmpeg")
            .args([
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
                &constants.fps.to_string(),
                "-i",
                "pipe:0",
                "-vf",
                "tpad=stop_mode=clone:stop_duration=1,setsar=1",
                "-frames:v",
                &(constants.loop_offsets.len() + constants.fps).to_string(),
                "-c:v",
                "libx264",
                "-threads",
                "1",
                "-preset",
                "ultrafast",
                "-crf",
                "25",
                "-maxrate",
                &bitrate,
                "-bufsize",
                &bitrate,
                "-pix_fmt",
                "yuv420p",
                "-movflags",
                "+faststart",
                "-an",
                "-f",
                "mp4",
            ])
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
            started: Instant::now(),
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
            self.frames == constants().loop_offsets.len(),
            "Incorrect video frame count"
        );
        let bytes = fs::metadata(&self.path)?.len();
        ensure!(bytes <= 3_000_000, "Video exceeds 3 MB ({bytes})");
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
