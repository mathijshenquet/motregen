use crate::constants::constants;
use serde::Deserialize;

#[derive(Clone, Debug, Deserialize, PartialEq)]
pub struct Grid {
    pub x0: f64,
    pub y0: f64,
    pub dx: f64,
    pub dy: f64,
    pub width: usize,
    pub height: usize,
}

pub fn project(lng: f64, lat: f64) -> (f64, f64) {
    let radius = 6_378_137.0;
    (
        lng.to_radians() * radius,
        (std::f64::consts::FRAC_PI_4 + lat.to_radians() / 2.0)
            .tan()
            .ln()
            * radius,
    )
}

pub struct Projection {
    pub columns: Vec<f64>,
    pub rows: Vec<f64>,
    center: (f64, f64),
    meters_per_pixel: f64,
}

impl Projection {
    pub fn new(grid: &Grid) -> Self {
        let constants = constants();
        let size = &constants.size;
        let view = &constants.view;
        let center = project(view.lng, view.lat);
        let meters_per_pixel = 2.0 * std::f64::consts::PI * 6_378_137.0
            / (512.0
                * 2.0_f64.powf(view.zoom)
                * (size.width as f64 / constants.frame.width as f64));
        Self {
            columns: (0..size.width)
                .map(|column| {
                    (center.0 + (column as f64 + 0.5 - size.width as f64 / 2.0) * meters_per_pixel
                        - grid.x0)
                        / grid.dx
                        - 0.5
                })
                .collect(),
            rows: (0..size.height)
                .map(|row| {
                    (center.1
                        - (row as f64 + 0.5 - size.height as f64 / 2.0) * meters_per_pixel
                        - grid.y0)
                        / grid.dy
                        - 0.5
                })
                .collect(),
            center,
            meters_per_pixel,
        }
    }

    pub fn point(&self, lng: f64, lat: f64) -> (f64, f64) {
        let (east, north) = project(lng, lat);
        (
            (east - self.center.0) / self.meters_per_pixel + constants().size.width as f64 / 2.0,
            (self.center.1 - north) / self.meters_per_pixel + constants().size.height as f64 / 2.0,
        )
    }

    pub fn sampling_region(
        &self,
        grid: &Grid,
        displacement: f64,
    ) -> (std::ops::Range<usize>, std::ops::Range<usize>) {
        let bounds = |coordinates: &[f64], length: usize| {
            let first = coordinates.iter().copied().fold(f64::INFINITY, f64::min);
            let last = coordinates
                .iter()
                .copied()
                .fold(f64::NEG_INFINITY, f64::max);
            let start = (first - displacement).floor().clamp(0.0, length as f64) as usize;
            let end = (last + displacement + 2.0).ceil().clamp(0.0, length as f64) as usize;
            start..end
        };
        (
            bounds(&self.columns, grid.width),
            bounds(&self.rows, grid.height),
        )
    }
}

pub fn point_value(
    grid: &Grid,
    raster: &[u8],
    quant: &[Option<f32>],
    lng: f64,
    lat: f64,
) -> Option<f64> {
    let (east, north) = project(lng, lat);
    let column = ((east - grid.x0) / grid.dx).floor();
    let row = ((north - grid.y0) / grid.dy).floor();
    if column < 0.0 || row < 0.0 || column >= grid.width as f64 || row >= grid.height as f64 {
        return None;
    }
    quant
        .get(raster[row as usize * grid.width + column as usize] as usize)
        .copied()
        .flatten()
        .map(f64::from)
}
