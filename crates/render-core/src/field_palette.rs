use crate::{
    mode_constants::{color, mode_constants},
    projection::{Grid, project},
};

/// Grid cell bounds `[west, north, east, south]` (fractional) of the palette region (NL + Vlaanderen).
pub fn palette_region(grid: &Grid) -> [f64; 4] {
    let bounds = &mode_constants().bounds;
    let southwest = project(bounds.west, bounds.south);
    let northeast = project(bounds.east, bounds.north);
    [
        (southwest.0 - grid.x0) / grid.dx,
        (northeast.1 - grid.y0) / grid.dy,
        (northeast.0 - grid.x0) / grid.dx,
        (southwest.1 - grid.y0) / grid.dy,
    ]
}

/// Minimum and maximum of `value` over the cells inside `bounds` (as from [`palette_region`]).
pub fn extent(
    grid: &Grid,
    bounds: [f64; 4],
    value: impl Fn(usize) -> Option<f64>,
) -> Option<(f64, f64)> {
    let clamp =
        |position: f64, size: usize| position.floor().clamp(0.0, (size - 1) as f64) as usize;
    let west = clamp(bounds[0].min(bounds[2]), grid.width);
    let east = clamp(bounds[0].max(bounds[2]), grid.width);
    let north = clamp(bounds[1].min(bounds[3]), grid.height);
    let south = clamp(bounds[1].max(bounds[3]), grid.height);
    let mut minimum = f64::INFINITY;
    let mut maximum = f64::NEG_INFINITY;
    for row in north..=south {
        for column in west..=east {
            if let Some(value) = value(row * grid.width + column) {
                minimum = minimum.min(value);
                maximum = maximum.max(value);
            }
        }
    }
    (minimum <= maximum).then_some((minimum, maximum))
}

pub struct Palette {
    pub low: f64,
    pub high: f64,
    knots: Vec<[f64; 2]>,
    ramp: Vec<[f64; 3]>,
    /// MIP-37: a fixed reference range continues outside itself in steps towards deep blue/red.
    overflow: bool,
}

impl Palette {
    pub fn new(minimum: f64, maximum: f64) -> Option<Self> {
        if !minimum.is_finite() || !maximum.is_finite() || minimum > maximum {
            return None;
        }
        let settings = &mode_constants().palette;
        let mut low = minimum.floor();
        let mut high = maximum.ceil();
        let missing = settings.minimum_span - (high - low);
        if missing > 0.0 {
            low -= (missing / 2.0).floor();
            high += (missing / 2.0).ceil();
        }
        let blue_end = 1.0 / (settings.ramp.len() - 1) as f64;
        let red_start = 1.0 - 0.5 / (settings.ramp.len() - 1) as f64;
        let knots = if high <= settings.cold {
            vec![[low, 0.0], [high, blue_end]]
        } else if low >= settings.warm {
            vec![[low, red_start], [high, 1.0]]
        } else {
            let mut knots = vec![[low, 0.0]];
            if low < settings.cold && (settings.cold - low) / (high - low) > blue_end {
                knots.push([settings.cold, blue_end]);
            }
            if high > settings.warm && (settings.warm - low) / (high - low) < red_start {
                knots.push([settings.warm, red_start]);
            }
            knots.push([high, 1.0]);
            knots
        };
        Some(Self {
            low,
            high,
            knots,
            ramp: settings
                .ramp
                .iter()
                .map(|hex| color(hex).map(|channel| f64::from(channel) / 255.0))
                .collect(),
            overflow: false,
        })
    }

    pub fn with_overflow(mut self) -> Self {
        self.overflow = true;
        self
    }

    pub fn color(&self, temperature: f64) -> [f64; 3] {
        let settings = &mode_constants().palette;
        if self.overflow && (temperature < self.low || temperature > self.high) {
            let (edge, deep, distance) = if temperature < self.low {
                (self.low, &settings.overflow_cold, self.low - temperature)
            } else {
                (self.high, &settings.overflow_warm, temperature - self.high)
            };
            let step = (distance / settings.overflow_step)
                .ceil()
                .clamp(1.0, settings.overflow_steps as f64);
            let from = self.ramp_color(edge);
            let deep = color(deep).map(|channel| f64::from(channel) / 255.0);
            let mix = step / settings.overflow_steps as f64;
            return std::array::from_fn(|channel| {
                from[channel] + (deep[channel] - from[channel]) * mix
            });
        }
        self.ramp_color(temperature)
    }

    fn ramp_color(&self, temperature: f64) -> [f64; 3] {
        let mut position = self.knots.last().unwrap()[1];
        if temperature <= self.knots[0][0] {
            position = self.knots[0][1];
        } else {
            for pair in self.knots.windows(2) {
                if temperature > pair[1][0] {
                    continue;
                }
                let fraction = (temperature - pair[0][0]) / (pair[1][0] - pair[0][0]);
                position = pair[0][1] + (pair[1][1] - pair[0][1]) * fraction;
                break;
            }
        }
        let scaled = position.clamp(0.0, 1.0) * (self.ramp.len() - 1) as f64;
        let lower = (scaled.floor() as usize).min(self.ramp.len() - 2);
        let fraction = scaled - lower as f64;
        std::array::from_fn(|channel| {
            self.ramp[lower][channel]
                + (self.ramp[lower + 1][channel] - self.ramp[lower][channel]) * fraction
        })
    }

    pub fn bands(&self) -> Vec<f32> {
        (-128..128)
            .flat_map(|band| {
                self.color(f64::from(band) + 0.5)
                    .map(|channel| channel as f32)
            })
            .collect()
    }
}
