use crate::data::{Dataset, Raster};
use anyhow::{Context, Result, ensure};
use render_core::{
    contours::{self, Contour},
    field::{Field, slice_weights},
    isoline_labels::{Label, Labels, Placement, Screen},
    mode_constants::mode_constants,
    pressure::{self, Mark},
    projection::{Grid, Projection, project},
    time::{Manifest, frame_blend},
};
use std::{path::Path, sync::Arc, time::Instant};

pub struct Pair {
    pub left: Arc<Raster>,
    pub right: Arc<Raster>,
    pub mix: f64,
}

pub fn pair(dataset: &mut Dataset<'_>, time: i64) -> Result<Pair> {
    let blend = frame_blend(&dataset.frames, time);
    let left = dataset.frames[blend.left].clone();
    let right = dataset.frames[blend.right].clone();
    let left = dataset.load(&left)?;
    let right = dataset.load(&right)?;
    ensure!(
        left.grid == right.grid,
        "Field grid changes within generation"
    );
    Ok(Pair {
        left,
        right,
        mix: blend.mix,
    })
}

pub fn screen(grid: &Grid) -> Screen {
    let projection = Projection::new(grid);
    let pixels_x = 1.0 / (projection.columns[1] - projection.columns[0]);
    let pixels_y = 1.0 / (projection.rows[1] - projection.rows[0]);
    let size = &render_core::constants::constants().size;
    Screen {
        origin: [
            0.5 - projection.columns[0] * pixels_x,
            0.5 - projection.rows[0] * pixels_y,
        ],
        pixels_per_cell: [pixels_x, pixels_y],
        width: size.width as f64,
        height: size.height as f64,
        scale: mode_constants().scale,
    }
}

pub fn range(field: &Field, grid: &Grid, bounds: [f64; 4]) -> Option<(f64, f64)> {
    let west = bounds[0]
        .min(bounds[2])
        .floor()
        .clamp(0.0, (grid.width - 1) as f64) as usize;
    let east = bounds[0]
        .max(bounds[2])
        .floor()
        .clamp(0.0, (grid.width - 1) as f64) as usize;
    let north = bounds[1]
        .min(bounds[3])
        .floor()
        .clamp(0.0, (grid.height - 1) as f64) as usize;
    let south = bounds[1]
        .max(bounds[3])
        .floor()
        .clamp(0.0, (grid.height - 1) as f64) as usize;
    let mut minimum = f64::INFINITY;
    let mut maximum = f64::NEG_INFINITY;
    for row in north..=south {
        for column in west..=east {
            let index = row * grid.width + column;
            if field.valid[index] <= 0.5 {
                continue;
            }
            let value = f64::from(field.values[index]);
            minimum = minimum.min(value);
            maximum = maximum.max(value);
        }
    }
    (minimum <= maximum).then_some((minimum, maximum))
}

pub struct Slice {
    pub field: Arc<Field>,
    pub segments: Vec<f32>,
    pub rings: Vec<f32>,
    pub labels: Vec<Label>,
    pub marks: Vec<Mark>,
    pub opacity: f64,
}

pub struct Fields<'a> {
    pub data: Dataset<'a>,
    pub grid: Grid,
    prepared: Vec<(usize, Arc<Field>)>,
    line_cache: Vec<((usize, i32), Vec<Contour>)>,
    mark_cache: Vec<(usize, Vec<Mark>)>,
    labels: Labels,
    pressure: bool,
    step: f64,
    pub fields_us: u128,
    pub contours_us: u128,
    pub labels_us: u128,
}

impl<'a> Fields<'a> {
    pub fn new(directory: &Path, manifest: &'a Manifest, pressure: bool) -> Result<Self> {
        let mut data = Dataset::new(
            directory,
            manifest,
            if pressure {
                "pressure_hpa"
            } else {
                "feels_like_c"
            },
        )?;
        let grid = data.grid().context("Field timeline missing")?;
        Ok(Self {
            data,
            grid,
            prepared: Vec::new(),
            line_cache: Vec::new(),
            mark_cache: Vec::new(),
            labels: Labels::default(),
            pressure,
            step: if pressure { 4.0 } else { 1.0 },
            fields_us: 0,
            contours_us: 0,
            labels_us: 0,
        })
    }

    pub fn field(&mut self, index: usize) -> Result<Arc<Field>> {
        if let Some((_, field)) = self.prepared.iter().find(|(key, _)| *key == index) {
            return Ok(Arc::clone(field));
        }
        let settings = &mode_constants().isoline;
        let weights = if self.pressure {
            settings
                .time_weights
                .iter()
                .enumerate()
                .map(|(offset, &weight)| {
                    (
                        (index as isize + offset as isize
                            - settings.time_weights.len() as isize / 2)
                            .clamp(0, self.data.frames.len() as isize - 1)
                            as usize,
                        weight,
                    )
                })
                .collect::<Vec<_>>()
        } else {
            vec![(index, 1.0)]
        };
        let total: f64 = weights.iter().map(|(_, weight)| weight).sum();
        let mut rasters = Vec::new();
        for &(index, weight) in &weights {
            let frame = self.data.frames[index].clone();
            let raster = self.data.load(&frame)?;
            ensure!(
                raster.grid == self.grid,
                "Isoline grid changes within generation"
            );
            rasters.push((raster, weight));
        }
        let started = Instant::now();
        let values = (0..self.grid.width * self.grid.height)
            .map(|index| {
                let mut sum = 0.0;
                for (raster, weight) in &rasters {
                    let Some(value) = raster.quant[raster.values[index] as usize] else {
                        return f32::NAN;
                    };
                    sum += f64::from(value) * weight;
                }
                (sum / total) as f32
            })
            .collect();
        let field = Arc::new(Field::prepare(
            values,
            self.grid.width,
            self.grid.height,
            if self.pressure {
                settings.pressure_blur
            } else {
                settings.temperature_blur
            },
        ));
        if self.prepared.len() >= 8 {
            self.prepared.remove(0);
        }
        self.prepared.push((index, Arc::clone(&field)));
        self.fields_us += started.elapsed().as_micros();
        Ok(field)
    }

    fn marks(&mut self, index: usize) -> Result<Vec<Mark>> {
        if let Some((_, marks)) = self.mark_cache.iter().find(|(key, _)| *key == index) {
            return Ok(marks.clone());
        }
        let field = self.field(index)?;
        let settings = &mode_constants().isoline;
        let cell_km = self.grid.dx.abs() * 52.0_f64.to_radians().cos() / 1000.0;
        let radius = (settings.pressure_radius_km / cell_km).round().max(2.0) as usize;
        let marks = pressure::extrema(&field, radius, settings.pressure_prominence);
        if self.mark_cache.len() >= 4 {
            self.mark_cache.remove(0);
        }
        self.mark_cache.push((index, marks.clone()));
        Ok(marks)
    }

    pub fn slice(&mut self, time: i64) -> Result<Slice> {
        let started = Instant::now();
        let fields_before = self.fields_us;
        let decode_before = self.data.decode_us;
        let blend = frame_blend(&self.data.frames, time);
        let weights = slice_weights(blend.left as f64 + blend.mix, self.data.frames.len());
        let mut fields = Vec::new();
        for (index, weight) in weights {
            if weight > 0.0 {
                fields.push((self.field(index)?, weight));
            }
        }
        let field = Arc::new(Field::blend(
            &fields
                .iter()
                .map(|(field, weight)| (field.as_ref(), *weight))
                .collect::<Vec<_>>(),
        ));
        let screen = screen(&self.grid);
        if self.pressure {
            let nearest = self.field((blend.left as f64 + blend.mix).round() as usize)?;
            let projection = Projection::new(&self.grid);
            let bounds = [
                projection.columns[0] + 0.5,
                projection.rows[0] + 0.5,
                projection.columns.last().unwrap() + 0.5,
                projection.rows.last().unwrap() + 0.5,
            ];
            if let Some((minimum, maximum)) = range(&nearest, &self.grid, bounds) {
                self.step = pressure::adaptive_step(minimum, maximum, self.step);
            }
        }
        self.fields_us += started
            .elapsed()
            .as_micros()
            .saturating_sub(self.fields_us - fields_before + self.data.decode_us - decode_before);
        let started = Instant::now();
        let ring_km = if self.pressure {
            0.0
        } else {
            mode_constants().isoline.ring_km
        };
        let tolerance = 2.0_f64.powf(
            (mode_constants().isoline.tolerance_px / screen.pixels_per_cell[0].abs()
                * screen.scale)
                .log2()
                .round(),
        );
        let contours = contours::trace(&field, &self.grid, self.step, tolerance);
        let mut segments = Vec::new();
        for contour in &contours {
            let fade = contours::ring_fade(contour, ring_km);
            if fade <= 0.0 {
                continue;
            }
            for index in 0..if contour.closed {
                contour.points.len()
            } else {
                contour.points.len() - 1
            } {
                let start = screen.point(contour.points[index]);
                let end = screen.point(contour.points[(index + 1) % contour.points.len()]);
                segments.extend([
                    start[0] as f32,
                    start[1] as f32,
                    end[0] as f32,
                    end[1] as f32,
                    fade as f32,
                    fade as f32,
                ]);
            }
        }
        let rings = if self.pressure {
            Vec::new()
        } else {
            contours::ring_raster(&contours, ring_km, self.grid.width, self.grid.height)
        };
        self.contours_us += started.elapsed().as_micros();
        let started = Instant::now();
        let fields_before = self.fields_us;
        let decode_before = self.data.decode_us;
        let label_index = if blend.mix < 0.5 {
            blend.left
        } else {
            blend.right
        };
        let key = (label_index, self.step as i32);
        if !self.line_cache.iter().any(|(cached, _)| *cached == key) {
            let label_field = self.field(label_index)?;
            let lines = contours::label_lines(
                &label_field,
                &self.grid,
                self.step,
                mode_constants().isoline.ring_km,
            );
            if self.line_cache.len() >= 2 {
                self.line_cache.remove(0);
            }
            self.line_cache.push((key, lines));
        }
        let lines = &self
            .line_cache
            .iter()
            .find(|(cached, _)| *cached == key)
            .unwrap()
            .1;
        let first = self.data.frames[0].epoch;
        let last = self.data.frames.last().unwrap().epoch;
        let opacity = if time < first {
            (1.0 - (first - time) as f64 / mode_constants().isoline.edge_fade_ms).max(0.0)
        } else if time > last {
            (1.0 - (time - last) as f64 / mode_constants().isoline.edge_fade_ms).max(0.0)
        } else {
            1.0
        };
        let labels = self.labels.place(Placement {
            field: &field,
            lines,
            contours: &contours,
            screen,
            step: self.step,
            key: label_index,
            pressure: self.pressure,
            opacity,
        });
        let marks = if self.pressure {
            pressure::blend_marks(
                &self.marks(blend.left)?,
                &self.marks(blend.right)?,
                blend.mix,
                self.grid.dx.abs() * 52.0_f64.to_radians().cos() / 1000.0,
            )
        } else {
            Vec::new()
        };
        self.labels_us += started
            .elapsed()
            .as_micros()
            .saturating_sub(self.fields_us - fields_before + self.data.decode_us - decode_before);
        Ok(Slice {
            field,
            segments,
            rings,
            labels,
            marks,
            opacity,
        })
    }

    pub fn palette(&mut self, now: i64) -> Result<Vec<f32>> {
        let mut minimum = f64::INFINITY;
        let mut maximum = f64::NEG_INFINITY;
        let bounds = &mode_constants().bounds;
        let southwest = project(bounds.west, bounds.south);
        let northeast = project(bounds.east, bounds.north);
        let region = [
            (southwest.0 - self.grid.x0) / self.grid.dx,
            (northeast.1 - self.grid.y0) / self.grid.dy,
            (northeast.0 - self.grid.x0) / self.grid.dx,
            (southwest.1 - self.grid.y0) / self.grid.dy,
        ];
        let frames = self.data.frames.clone();
        for frame in frames.iter().filter(|frame| {
            frame.epoch >= now.div_euclid(3_600_000) * 3_600_000
                && frame.epoch <= now + 18 * 3_600_000
        }) {
            let raster = self.data.load(frame)?;
            let values: Vec<_> = raster
                .values
                .iter()
                .map(|&code| raster.quant[code as usize].unwrap_or(f32::NAN))
                .collect();
            let field = Field {
                width: raster.grid.width,
                height: raster.grid.height,
                valid: values
                    .iter()
                    .map(|value| if value.is_nan() { 0.0 } else { 1.0 })
                    .collect(),
                values,
            };
            if let Some((low, high)) = range(&field, &self.grid, region) {
                minimum = minimum.min(low);
                maximum = maximum.max(high);
            }
        }
        Ok(render_core::field_palette::Palette::new(minimum, maximum)
            .context("Temperature palette has no valid range")?
            .bands())
    }
}
