use crate::{
    data::Dataset,
    fields::{Pair, pair},
};
use anyhow::{Result, ensure};
use render_core::{
    composition::{Composition, CoveragePair, compose_covered},
    constants::{constants, warp_limit},
    mode_constants::mode_constants,
    motion::Motion,
    palette::composition_colors_for,
    rain::RainCompositor,
    time::{Manifest, frame_blend},
};
use std::{path::Path, sync::Arc, time::Instant};

pub struct RainInput {
    pub pair: Pair,
    pub motion: Option<Arc<Vec<(f64, f64)>>>,
    pub cap: f64,
}

pub struct WindRain<'a> {
    pub data: Dataset<'a>,
    pub pixels: Arc<WindRainPixels>,
    motion_pair: Option<(usize, usize)>,
    motion: Option<Arc<Vec<(f64, f64)>>>,
    pub motion_us: u128,
}

pub struct WindRainPixels {
    pub compositor: RainCompositor,
    colors: [Vec<[f32; 4]>; 2],
}

impl<'a> WindRain<'a> {
    pub fn new(directory: &Path, manifest: &'a Manifest) -> Result<Self> {
        let mut data = Dataset::new(directory, manifest, "rain_rate")?;
        let grid = data.grid()?;
        data.limit_to_view = true;
        Ok(Self {
            data,
            pixels: Arc::new(WindRainPixels {
                compositor: RainCompositor::new(grid),
                colors: [
                    composition_colors_for(&mode_constants().rain["light"]),
                    composition_colors_for(&mode_constants().rain["dark"]),
                ],
            }),
            motion_pair: None,
            motion: None,
            motion_us: 0,
        })
    }

    pub fn prepare(&mut self, time: i64) -> Result<RainInput> {
        let blend = frame_blend(&self.data.frames, time);
        let left = self.data.frames[blend.left].clone();
        let right = self.data.frames[blend.right].clone();
        let pair = pair(&mut self.data, time)?;
        ensure!(
            pair.left.grid == self.pixels.compositor.grid,
            "Rain grid changes within generation"
        );
        let needs_motion = blend.mix > 0.0 && blend.mix < 1.0;
        let limit = warp_limit((right.epoch - left.epoch) as f64 / 60_000.0);
        if needs_motion && self.motion_pair != Some((blend.left, blend.right)) {
            let started = Instant::now();
            self.motion = None;
            let motion = self.data.motion(&left, &right)?;
            self.motion = motion.as_ref().map(|(width, height, vectors)| {
                Arc::new(self.pixels.compositor.project_motion(
                    Motion {
                        width: *width,
                        height: *height,
                        vectors,
                        interval: (right.epoch - left.epoch) as f64 / 60_000.0,
                        cap: limit.cap_cells,
                        fade: limit.fade_end_cells,
                    },
                    Some(CoveragePair {
                        left: pair.left.coverage.as_ref().unwrap(),
                        right: pair.right.coverage.as_ref().unwrap(),
                        displacement: limit.cap_cells,
                    }),
                ))
            });
            self.motion_pair = Some((blend.left, blend.right));
            self.motion_us += started.elapsed().as_micros();
        }
        Ok(RainInput {
            pair,
            motion: needs_motion.then(|| self.motion.clone()).flatten(),
            cap: if needs_motion { limit.cap_cells } else { 0.0 },
        })
    }
}

impl WindRainPixels {
    pub fn compose(&self, rgb: &mut [u8], input: &RainInput, night: bool) {
        let left = (1.0 - input.pair.mix).powf(constants().flow_curve);
        let right = input.pair.mix.powf(constants().flow_curve);
        compose_covered(
            rgb,
            Composition {
                columns: &self.compositor.projection.columns,
                rows: &self.compositor.projection.rows,
                grid_width: self.compositor.grid.width,
                grid_height: self.compositor.grid.height,
                left: &input.pair.left.values,
                right: &input.pair.right.values,
                mix: right / (left + right).max(0.0001),
                colors: &self.colors[usize::from(night)],
                displacements: input.motion.as_deref().map(Vec::as_slice),
                multiply: mode_constants().rain[if night { "dark" } else { "light" }]["multiply"]
                    .as_bool()
                    .unwrap(),
            },
            Some(CoveragePair {
                left: input.pair.left.coverage.as_ref().unwrap(),
                right: input.pair.right.coverage.as_ref().unwrap(),
                displacement: input.cap,
            }),
        );
    }
}
