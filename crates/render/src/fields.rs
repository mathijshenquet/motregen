use crate::windsocks::SockChain;
use crate::{
    data::{Dataset, Raster},
    frame_cache::KeyBuilder,
};
use anyhow::{Context, Result, ensure};
use render_core::{
    contours,
    field::{Field, slice_weights},
    isoline_labels::{Label, Labels, Screen},
    mode_constants::mode_constants,
    projection::{Grid, Projection},
    time::{Manifest, frame_blend},
    windsock,
};
use serde::{Deserialize, Serialize};
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

pub struct Slice {
    pub field: Arc<Field>,
    pub segments: Vec<f32>,
    pub rings: Vec<f32>,
    pub labels: Vec<Label>,
    pub opacity: f64,
}

/// What a slice carries over to the next one: the label anchors and, for wind, the motion of the socks (U107).
#[derive(Deserialize, Serialize)]
struct FieldState {
    labels: Labels,
    #[serde(default)]
    socks: SockChain,
}

pub struct Fields<'a> {
    pub data: Dataset<'a>,
    pub grid: Grid,
    /// Only for wind: the northward component; `data` is then the eastward one and carries the timeline.
    pub north: Option<Dataset<'a>>,
    prepared: Vec<(usize, Arc<Field>)>,
    labels: Labels,
    /// Wind: momentum and wave of the socks, stepped once per film frame in `Sources::input`.
    pub socks: SockChain,
    /// Wind (U101): Beaufort bands from u and v, without labels; otherwise the feels-like temperature.
    wind: bool,
    pub fields_us: u128,
    pub contours_us: u128,
    pub labels_us: u128,
}

impl<'a> Fields<'a> {
    pub fn new(directory: &Path, manifest: &'a Manifest, wind: bool) -> Result<Self> {
        let mut data = Dataset::new(
            directory,
            manifest,
            if wind { "wind_u_ms" } else { "feels_like_c" },
        )?;
        let grid = data.grid().context("Field timeline missing")?;
        let north = wind
            .then(|| Dataset::new(directory, manifest, "wind_v_ms"))
            .transpose()?;
        if let Some(north) = &north {
            ensure!(
                data.frames
                    .iter()
                    .map(|frame| frame.epoch)
                    .eq(north.frames.iter().map(|frame| frame.epoch)),
                "Wind components have different timelines"
            );
        }
        Ok(Self {
            data,
            grid,
            north,
            prepared: Vec::new(),
            labels: Labels::default(),
            socks: SockChain::default(),
            wind,
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
        let frame = self.data.frames[index].clone();
        let raster = self.data.load(&frame)?;
        ensure!(
            raster.grid == self.grid,
            "Isoline grid changes within generation"
        );
        let north = match &mut self.north {
            Some(north) => {
                let frame = north.frames[index].clone();
                let raster = north.load(&frame)?;
                ensure!(
                    raster.grid == self.grid,
                    "Wind components have different grids"
                );
                Some(raster)
            }
            None => None,
        };
        let started = Instant::now();
        let codes_per_force = mode_constants().beaufort.codes_per_force;
        let values = (0..self.grid.width * self.grid.height)
            .map(|cell| {
                let value = raster.quant[raster.values[cell] as usize];
                // Wind: de gequantiseerde continue Beaufort, zoals het synthetische frame van de app.
                let value = match &north {
                    Some(north) => match windsock::beaufort_code(
                        value,
                        north.quant[north.values[cell] as usize],
                    ) {
                        255 => None,
                        code => Some((f64::from(code) / codes_per_force) as f32),
                    },
                    None => value,
                };
                value.unwrap_or(f32::NAN)
            })
            .collect();
        let field = Arc::new(Field::prepare(
            values,
            self.grid.width,
            self.grid.height,
            settings.temperature_blur,
        ));
        if self.prepared.len() >= 8 {
            self.prepared.remove(0);
        }
        self.prepared.push((index, Arc::clone(&field)));
        self.fields_us += started.elapsed().as_micros();
        Ok(field)
    }

    pub fn state(&self) -> Result<Vec<u8>> {
        Ok(serde_json::to_vec(&FieldState {
            labels: self.labels.clone(),
            socks: self.socks.clone(),
        })?)
    }

    pub fn restore(&mut self, state: &[u8]) -> Result<()> {
        let state: FieldState = serde_json::from_slice(state)?;
        self.labels = state.labels;
        self.socks = state.socks;
        Ok(())
    }

    /// Adds every source frame a slice at `time` may read: the four slice weights around the blend pair.
    pub fn key_sources(&mut self, time: i64, key: &mut KeyBuilder) -> Result<()> {
        let blend = frame_blend(&self.data.frames, time);
        let reach = 2;
        let last = self.data.frames.len() as isize - 1;
        let first = (blend.left as isize - reach).clamp(0, last) as usize;
        let end = (blend.right as isize + reach).clamp(0, last) as usize;
        key.real(blend.mix).real(self.edge_opacity(time));
        for index in first..=end {
            let frame = self.data.frames[index].clone();
            key.number(frame.epoch).source(self.data.identity(&frame)?);
            if let Some(north) = &mut self.north {
                let frame = north.frames[index].clone();
                key.source(north.identity(&frame)?);
            }
        }
        Ok(())
    }

    fn edge_opacity(&self, time: i64) -> f64 {
        let first = self.data.frames[0].epoch;
        let last = self.data.frames.last().unwrap().epoch;
        if time < first {
            (1.0 - (first - time) as f64 / mode_constants().isoline.edge_fade_ms).max(0.0)
        } else if time > last {
            (1.0 - (time - last) as f64 / mode_constants().isoline.edge_fade_ms).max(0.0)
        } else {
            1.0
        }
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
        let mut field = Field::blend(
            &fields
                .iter()
                .map(|(field, weight)| (field.as_ref(), *weight))
                .collect::<Vec<_>>(),
        );
        // Gevoel: lijnen en banden op x,5 °C (U100), dus het hele veld een halve graad omlaag; de getallen tellen
        // de offset weer op.
        if !self.wind {
            let offset = mode_constants().map_label.temperature_offset as f32;
            field.values.iter_mut().for_each(|value| *value -= offset);
        }
        let field = Arc::new(field);
        let screen = screen(&self.grid);
        self.fields_us += started
            .elapsed()
            .as_micros()
            .saturating_sub(self.fields_us - fields_before + self.data.decode_us - decode_before);
        let started = Instant::now();
        let ring_km = if self.wind {
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
        let contours = contours::trace(&field, &self.grid, 1.0, tolerance);
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
        let rings = if self.wind {
            Vec::new()
        } else {
            contours::ring_raster(&contours, ring_km, self.grid.width, self.grid.height)
        };
        self.contours_us += started.elapsed().as_micros();
        let started = Instant::now();
        let fields_before = self.fields_us;
        let decode_before = self.data.decode_us;
        let opacity = self.edge_opacity(time);
        // Geen labels op de lijnen: in Wind geven vlakken en zakken de waarde, in Gevoel de getallen op vaste
        // plekken (U107, `place_numbers`), zoals in de app.
        let labels = Vec::new();
        self.labels_us += started
            .elapsed()
            .as_micros()
            .saturating_sub(self.fields_us - fields_before + self.data.decode_us - decode_before);
        Ok(Slice {
            field,
            segments,
            rings,
            labels,
            opacity,
        })
    }

    /// The fixed temperature scale (U100), the same as the app's default; for wind the Beaufort classes.
    pub fn palette(&self) -> Vec<f32> {
        if self.wind {
            windsock::beaufort_palette()
        } else {
            render_core::field_palette::Palette::fixed()
                .bands_offset(mode_constants().map_label.temperature_offset)
        }
    }
}
