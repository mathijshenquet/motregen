use anyhow::{Context, Result, bail, ensure};
use mrf::HeaderIndex;
use render_core::{
    constants::{blur, constants},
    projection::Grid,
    sampling::Sampling,
    time::{Manifest, TimelineFrame, epoch, timeline},
};
use std::{
    collections::HashMap,
    fs::File,
    io::{Read, Seek, SeekFrom},
    path::{Component, Path, PathBuf},
    sync::Arc,
};

pub struct Raster {
    pub grid: Grid,
    pub quant: Vec<Option<f32>>,
    pub values: Vec<u8>,
}

pub struct Dataset<'a> {
    directory: PathBuf,
    manifest: &'a Manifest,
    pub frames: Vec<TimelineFrame>,
    headers: HashMap<usize, HeaderIndex>,
    cache: Vec<((usize, usize), Arc<Raster>)>,
    rain: bool,
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
        let range = self
            .header(frame.chunk_index)?
            .frame_range(frame.frame_index)?;
        let compressed = self.member(frame.chunk_index, range)?;
        let index = self.header(frame.chunk_index)?;
        let mut values = index.decode_frame(frame.frame_index, &compressed)?;
        let grid: Grid = serde_json::from_value(serde_json::to_value(&index.header.grid)?)?;
        let quant = index.header.quant.clone();
        if self.rain {
            let blur = blur(frame.epoch - epoch(&self.manifest.now)?);
            let source = &self.manifest.chunks[frame.chunk_index].source;
            let cell_width = if source == "harmonie" {
                constants().sampling.harmonie_cell_width
            } else {
                constants().sampling.radar_cell_width
            };
            values = Sampling {
                kind: 3,
                taps: blur.taps,
                cell_width,
                sigma: blur.sigma,
            }
            .filter(values, grid.width, grid.height);
        }
        let raster = Arc::new(Raster {
            grid,
            quant,
            values,
        });
        if self.cache.len() >= 4 {
            self.cache.remove(0);
        }
        self.cache.push((key, Arc::clone(&raster)));
        Ok(raster)
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
