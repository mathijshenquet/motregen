use anyhow::{Context, Result, bail, ensure};
use mrf::HeaderIndex;
use render_core::{
    constants::{blur, constants, warp_limit},
    projection::{Grid, Projection},
    sampling::{Coverage, Sampling},
    time::{Manifest, TimelineFrame, epoch, timeline},
};
use std::{
    collections::HashMap,
    fs::File,
    io::{Read, Seek, SeekFrom},
    path::{Component, Path, PathBuf},
    sync::Arc,
    time::Instant,
};

#[derive(Debug)]
pub struct Raster {
    pub grid: Grid,
    pub quant: Vec<Option<f32>>,
    pub values: Vec<u8>,
    pub coverage: Option<Coverage>,
}

pub struct Dataset<'a> {
    directory: PathBuf,
    manifest: &'a Manifest,
    pub frames: Vec<TimelineFrame>,
    headers: HashMap<usize, HeaderIndex>,
    cache: Vec<((usize, usize), Arc<Raster>)>,
    rain: bool,
    pub sampling_us: u128,
    pub decode_us: u128,
    pub loaded: usize,
    pub limit_to_view: bool,
}

impl<'a> Dataset<'a> {
    pub fn new(directory: &Path, manifest: &'a Manifest, field: &str) -> Result<Self> {
        let frames = timeline(manifest, field).map_err(anyhow::Error::msg)?;
        Ok(Self {
            directory: directory.canonicalize()?,
            manifest,
            frames,
            headers: HashMap::new(),
            cache: Vec::new(),
            rain: field == "rain_rate",
            sampling_us: 0,
            decode_us: 0,
            loaded: 0,
            limit_to_view: false,
        })
    }

    fn path(&self, chunk: usize) -> Result<PathBuf> {
        let relative = Path::new(&self.manifest.chunks[chunk].url);
        ensure!(
            relative
                .components()
                .all(|part| matches!(part, Component::Normal(_))),
            "Chunk path must stay inside data directory"
        );
        let path = self.directory.join(relative).canonicalize()?;
        ensure!(
            path.starts_with(&self.directory),
            "Chunk symlink leaves data directory"
        );
        Ok(path)
    }

    fn header(&mut self, chunk: usize) -> Result<&HeaderIndex> {
        if !self.headers.contains_key(&chunk) {
            let mut file = File::open(self.path(chunk)?)?;
            let mut prefix = [0_u8; 8];
            file.read_exact(&mut prefix)?;
            let length = u32::from_le_bytes(prefix[4..8].try_into()?) as usize;
            ensure!(length <= 8 * 1024 * 1024, "MRF header too large");
            let mut bytes = prefix.to_vec();
            bytes.resize(length + 8, 0);
            file.read_exact(&mut bytes[8..])?;
            let index = mrf::parse_header(&bytes)?;
            let metadata = &self.manifest.chunks[chunk];
            ensure!(
                index.header.source == metadata.source
                    && index.header.run == metadata.run
                    && index.header.field == metadata.field,
                "MRF identity differs from manifest: {}",
                metadata.url
            );
            ensure!(
                index.header.grid.crs == "EPSG:3857"
                    && index.header.grid.width > 0
                    && index.header.grid.height > 0,
                "Unsupported render grid"
            );
            ensure!(
                index.header.grid.cell_count()? <= 4_000_000,
                "Render grid too large"
            );
            ensure!(
                index.header.frames.len() == metadata.times.len()
                    && index
                        .header
                        .frames
                        .iter()
                        .zip(&metadata.times)
                        .all(|(frame, time)| &frame.time == time),
                "MRF times differ from manifest: {}",
                metadata.url
            );
            self.headers.insert(chunk, index);
        }
        Ok(self.headers.get(&chunk).unwrap())
    }

    fn member(&self, chunk: usize, range: std::ops::Range<u64>) -> Result<Vec<u8>> {
        let length = usize::try_from(range.end - range.start)?;
        ensure!(length <= 32 * 1024 * 1024, "Compressed member too large");
        let mut bytes = vec![0; length];
        let mut file = File::open(self.path(chunk)?)?;
        file.seek(SeekFrom::Start(range.start))?;
        file.read_exact(&mut bytes)
            .context("Truncated MRF member")?;
        Ok(bytes)
    }

    pub fn load(&mut self, frame: &TimelineFrame) -> Result<Arc<Raster>> {
        let key = (frame.chunk_index, frame.frame_index);
        if let Some((_, raster)) = self.cache.iter().find(|(cached, _)| *cached == key) {
            return Ok(Arc::clone(raster));
        }
        let started = Instant::now();
        let range = self
            .header(frame.chunk_index)?
            .frame_range(frame.frame_index)?;
        let compressed = self.member(frame.chunk_index, range)?;
        let index = self.header(frame.chunk_index)?;
        let mut values = index.decode_frame(frame.frame_index, &compressed)?;
        let grid: Grid = serde_json::from_value(serde_json::to_value(&index.header.grid)?)?;
        let quant = index.header.quant.clone();
        self.decode_us += started.elapsed().as_micros();
        self.loaded += 1;
        if self.rain {
            let started = Instant::now();
            let blur = blur(frame.epoch - epoch(&self.manifest.now)?);
            let source = &self.manifest.chunks[frame.chunk_index].source;
            let cell_width = if source == "harmonie" {
                constants().sampling.harmonie_cell_width
            } else {
                constants().sampling.radar_cell_width
            };
            let sampling = Sampling {
                kind: 3,
                taps: blur.taps,
                cell_width,
                sigma: blur.sigma,
            };
            values = if self.limit_to_view {
                let position = self
                    .frames
                    .iter()
                    .position(|candidate| candidate == frame)
                    .unwrap();
                let interval = |left: usize, right: usize| {
                    (self.frames[right].epoch - self.frames[left].epoch) as f64 / 60_000.0
                };
                let cap = warp_limit(interval(position.saturating_sub(1), position))
                    .cap_cells
                    .max(
                        warp_limit(interval(
                            position,
                            (position + 1).min(self.frames.len() - 1),
                        ))
                        .cap_cells,
                    );
                let (columns, rows) = Projection::new(&grid).sampling_region(&grid, cap);
                sampling.filter_region(&values, grid.width, grid.height, columns, rows)
            } else {
                sampling.filter(values, grid.width, grid.height)
            };
            self.sampling_us += started.elapsed().as_micros();
        }
        let started = Instant::now();
        let coverage = self
            .rain
            .then(|| Coverage::new(&values, grid.width, grid.height));
        self.sampling_us += started.elapsed().as_micros();
        let raster = Arc::new(Raster {
            grid,
            quant,
            values,
            coverage,
        });
        if self.cache.len() >= 4 {
            self.cache.remove(0);
        }
        self.cache.push((key, Arc::clone(&raster)));
        Ok(raster)
    }

    pub fn grid(&mut self) -> Result<Grid> {
        let chunk = self
            .frames
            .first()
            .context("Rain timeline missing")?
            .chunk_index;
        Ok(serde_json::from_value(serde_json::to_value(
            &self.header(chunk)?.header.grid,
        )?)?)
    }

    fn has_motion(&mut self, frame: &TimelineFrame) -> Result<bool> {
        Ok(self
            .header(frame.chunk_index)?
            .header
            .frames
            .get(frame.frame_index)
            .is_some_and(|frame| frame.motion.is_some()))
    }

    pub fn motion(
        &mut self,
        left: &TimelineFrame,
        right: &TimelineFrame,
    ) -> Result<Option<(usize, usize, Vec<i8>)>> {
        if left.epoch >= right.epoch {
            return Ok(None);
        }
        let selected = if self.has_motion(right)? {
            Some(right.clone())
        } else {
            let next_time = self.manifest.chunks[right.chunk_index]
                .times
                .get(right.frame_index + 1);
            let next = next_time
                .map(|time| {
                    epoch(time).map(|epoch| TimelineFrame {
                        epoch,
                        frame_index: right.frame_index + 1,
                        ..right.clone()
                    })
                })
                .transpose()?;
            if let Some(next) =
                next.filter(|next| next.epoch - right.epoch <= right.epoch - left.epoch)
            {
                if self.has_motion(&next)? {
                    Some(next)
                } else if self.has_motion(left)? {
                    Some(left.clone())
                } else {
                    None
                }
            } else if self.has_motion(left)? {
                Some(left.clone())
            } else {
                None
            }
        };
        let Some(frame) = selected else {
            return Ok(None);
        };
        let range = self
            .header(frame.chunk_index)?
            .motion_range(frame.frame_index)?;
        let bytes = self.member(frame.chunk_index, range)?;
        let index = self.header(frame.chunk_index)?;
        let Some(grid) = index.header.motion_grid else {
            bail!("Motion grid missing");
        };
        Ok(Some((
            grid.bw as usize,
            grid.bh as usize,
            index.decode_motion(frame.frame_index, &bytes)?,
        )))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use mrf::{ChunkMeta, MotionGrid};
    use render_core::time::Chunk;

    fn fixture(motions: Vec<Option<Vec<i8>>>) -> (tempfile::TempDir, Manifest) {
        let directory = tempfile::tempdir().unwrap();
        let times: Vec<String> = [
            "2026-08-28T15:00:00Z",
            "2026-08-28T15:05:00Z",
            "2026-08-28T15:10:00Z",
        ]
        .iter()
        .map(|time| (*time).into())
        .collect();
        let grid = mrf::Grid {
            crs: "EPSG:3857".into(),
            x0: 0.0,
            y0: 4000.0,
            dx: 1000.0,
            dy: -1000.0,
            width: 4,
            height: 4,
        };
        let metadata = ChunkMeta::standard(grid, "rtcor", &times[0], times.clone()).with_pred();
        let frames = vec![vec![20; 16], vec![40; 16], vec![60; 16]];
        let bytes = if motions.iter().all(Option::is_none) {
            mrf::encode(&frames, &metadata)
        } else {
            mrf::encode_with_motion(&frames, &metadata, MotionGrid { bw: 1, bh: 1 }, &motions)
        }
        .unwrap();
        std::fs::write(directory.path().join("rain.mrf"), bytes).unwrap();
        let manifest = Manifest {
            version: 0,
            generated: times[0].clone(),
            now: times[0].clone(),
            chunks: vec![Chunk {
                url: "rain.mrf".into(),
                source: "rtcor".into(),
                run: times[0].clone(),
                field: "rain_rate".into(),
                times,
            }],
        };
        (directory, manifest)
    }

    #[test]
    fn reads_predictive_members_and_reuses_filtered_frames() {
        let (directory, manifest) = fixture(vec![None, None, None]);
        let mut dataset = Dataset::new(directory.path(), &manifest, "rain_rate").unwrap();
        let frame = dataset.frames[1].clone();
        let raster = dataset.load(&frame).unwrap();
        assert_eq!(raster.values, vec![40; 16]);
        assert!(Arc::ptr_eq(&raster, &dataset.load(&frame).unwrap()));
    }

    #[test]
    fn motion_prefers_right_then_next_then_left() {
        let (directory, manifest) = fixture(vec![None, Some(vec![10, -10]), Some(vec![20, -20])]);
        let mut dataset = Dataset::new(directory.path(), &manifest, "rain_rate").unwrap();
        let frames = dataset.frames.clone();
        assert_eq!(
            dataset.motion(&frames[0], &frames[1]).unwrap().unwrap().2,
            vec![10, -10]
        );

        let (directory, manifest) = fixture(vec![None, None, Some(vec![20, -20])]);
        let mut dataset = Dataset::new(directory.path(), &manifest, "rain_rate").unwrap();
        let frames = dataset.frames.clone();
        assert_eq!(
            dataset.motion(&frames[0], &frames[1]).unwrap().unwrap().2,
            vec![20, -20]
        );

        let (directory, manifest) = fixture(vec![None, Some(vec![10, -10]), None]);
        let mut dataset = Dataset::new(directory.path(), &manifest, "rain_rate").unwrap();
        let frames = dataset.frames.clone();
        assert_eq!(
            dataset.motion(&frames[1], &frames[2]).unwrap().unwrap().2,
            vec![10, -10]
        );
        assert!(dataset.motion(&frames[1], &frames[1]).unwrap().is_none());
    }

    #[test]
    fn rejects_stale_manifest_times_and_paths_outside_data() {
        let (directory, mut manifest) = fixture(vec![None, None, None]);
        manifest.chunks[0].times[1] = "2026-08-28T15:06:00Z".into();
        let mut dataset = Dataset::new(directory.path(), &manifest, "rain_rate").unwrap();
        let frame = dataset.frames[1].clone();
        assert!(
            dataset
                .load(&frame)
                .unwrap_err()
                .to_string()
                .contains("MRF times differ")
        );
        manifest.chunks[0].url = "../rain.mrf".into();
        let mut dataset = Dataset::new(directory.path(), &manifest, "rain_rate").unwrap();
        let frame = dataset.frames[1].clone();
        assert!(
            dataset
                .load(&frame)
                .unwrap_err()
                .to_string()
                .contains("inside data directory")
        );
    }

    #[test]
    fn rejects_truncated_frame_payload() {
        let (directory, manifest) = fixture(vec![None, None, None]);
        let path = directory.path().join("rain.mrf");
        let mut bytes = std::fs::read(&path).unwrap();
        bytes.truncate(bytes.len() - 1);
        std::fs::write(path, bytes).unwrap();
        let mut dataset = Dataset::new(directory.path(), &manifest, "rain_rate").unwrap();
        let frame = dataset.frames[2].clone();
        assert!(
            dataset
                .load(&frame)
                .unwrap_err()
                .to_string()
                .contains("Truncated MRF member")
        );
    }
}
