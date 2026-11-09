use crate::{
    mode_constants::mode_constants,
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

/// The fixed temperature scale (U100), linear between the stops from the app and clamped outside them.
pub struct Palette {
    stops: &'static [(f64, [f64; 3])],
}

impl Palette {
    pub fn fixed() -> Self {
        Self {
            stops: &mode_constants().palette.stops,
        }
    }

    pub fn color(&self, temperature: f64) -> [f64; 3] {
        let (first, last) = (self.stops[0], self.stops[self.stops.len() - 1]);
        if temperature <= first.0 {
            return first.1;
        }
        for pair in self.stops.windows(2) {
            let ((low, from), (high, to)) = (pair[0], pair[1]);
            if temperature > high {
                continue;
            }
            let mix = (temperature - low) / (high - low);
            return std::array::from_fn(|channel| {
                from[channel] + (to[channel] - from[channel]) * mix
            });
        }
        last.1
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
