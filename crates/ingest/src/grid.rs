use anyhow::{Result, ensure};
use knmi_grib::GridDefinition as AromeGrid;
use knmi_hdf5::RadarGrid;

const WEB_MERCATOR_RADIUS_M: f64 = 6_378_137.0;
const RADAR_SEMI_MAJOR_M: f64 = 6_378_137.0;
const RADAR_SEMI_MINOR_M: f64 = 6_356_752.0;
const RADAR_TRUE_SCALE_LATITUDE_RAD: f64 = 60.0_f64.to_radians();
const MISSING_INDEX: u32 = u32::MAX;

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct GridSpec {
    pub crs: &'static str,
    pub x0: f64,
    pub y0: f64,
    pub dx: f64,
    pub dy: f64,
    pub width: u32,
    pub height: u32,
}

pub const SHARED_GRID: GridSpec = GridSpec {
    crs: "EPSG:3857",
    x0: 250_000.0,
    y0: 7_200_000.0,
    dx: 1_000.0,
    dy: -1_000.0,
    width: 650,
    height: 700,
};

impl GridSpec {
    pub fn cell_count(self) -> usize {
        self.width as usize * self.height as usize
    }

    pub fn mrf_grid(self) -> mrf::Grid {
        mrf::Grid {
            crs: self.crs.to_owned(),
            x0: self.x0,
            y0: self.y0,
            dx: self.dx,
            dy: self.dy,
            width: self.width,
            height: self.height,
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct IndexMap {
    indices: Vec<u32>,
}

impl IndexMap {
    pub fn radar(source: &RadarGrid) -> Result<Self> {
        ensure!(source.width > 0 && source.height > 0, "empty radar grid");
        ensure!(
            source.dx_km != 0.0 && source.dy_km != 0.0,
            "zero radar spacing"
        );
        let raster = SourceRaster {
            x0: source.x0_km,
            y0: source.y0_km,
            dx: source.dx_km,
            dy: source.dy_km,
            width: source.width,
            height: source.height,
        };
        Self::build(|x, y| {
            let (longitude, latitude) = web_mercator_to_lon_lat(x, y);
            let (source_x_m, source_y_m) = radar_stereographic(longitude, latitude);
            nearest_index(source_x_m / 1_000.0, source_y_m / 1_000.0, raster, 0.5)
        })
    }

    pub fn arome(source: &AromeGrid) -> Result<Self> {
        ensure!(source.ni > 0 && source.nj > 0, "empty AROME grid");
        ensure!(
            source.longitude_increment > 0.0 && source.latitude_increment > 0.0,
            "AROME grid increments must be positive"
        );
        let raster = SourceRaster {
            x0: source.longitude_first,
            y0: source.latitude_first,
            dx: source.longitude_increment,
            dy: source.latitude_increment,
            width: source.ni,
            height: source.nj,
        };
        Self::build(|x, y| {
            let (longitude, latitude) = web_mercator_to_lon_lat(x, y);
            nearest_index(longitude, latitude, raster, 0.0)
        })
    }

    fn build(mut source_index: impl FnMut(f64, f64) -> Option<usize>) -> Result<Self> {
        let mut indices = Vec::with_capacity(SHARED_GRID.cell_count());
        for row in 0..SHARED_GRID.height {
            let y = SHARED_GRID.y0 + (f64::from(row) + 0.5) * SHARED_GRID.dy;
            for column in 0..SHARED_GRID.width {
                let x = SHARED_GRID.x0 + (f64::from(column) + 0.5) * SHARED_GRID.dx;
                let index = source_index(x, y)
                    .map(u32::try_from)
                    .transpose()?
                    .unwrap_or(MISSING_INDEX);
                indices.push(index);
            }
        }
        Ok(Self { indices })
    }

    pub fn gather(&self, source: &[f32]) -> Result<Vec<f32>> {
        ensure!(
            self.indices
                .iter()
                .filter(|index| **index != MISSING_INDEX)
                .all(|index| (*index as usize) < source.len()),
            "index map does not match source field"
        );
        Ok(self
            .indices
            .iter()
            .map(|index| {
                if *index == MISSING_INDEX {
                    f32::NAN
                } else {
                    source[*index as usize]
                }
            })
            .collect())
    }

    pub fn missing_count(&self) -> usize {
        self.indices
            .iter()
            .filter(|index| **index == MISSING_INDEX)
            .count()
    }
}

#[derive(Clone, Copy)]
struct SourceRaster {
    x0: f64,
    y0: f64,
    dx: f64,
    dy: f64,
    width: usize,
    height: usize,
}

fn nearest_index(x: f64, y: f64, raster: SourceRaster, center_offset: f64) -> Option<usize> {
    let column = ((x - raster.x0) / raster.dx - center_offset).round() as isize;
    let row = ((y - raster.y0) / raster.dy - center_offset).round() as isize;
    grid_index(column, row, raster.width, raster.height)
}

fn grid_index(column: isize, row: isize, width: usize, height: usize) -> Option<usize> {
    if column < 0 || row < 0 || column >= width as isize || row >= height as isize {
        None
    } else {
        Some(row as usize * width + column as usize)
    }
}

fn web_mercator_to_lon_lat(x: f64, y: f64) -> (f64, f64) {
    let longitude = (x / WEB_MERCATOR_RADIUS_M).to_degrees();
    let latitude =
        (2.0 * (y / WEB_MERCATOR_RADIUS_M).exp().atan() - std::f64::consts::FRAC_PI_2).to_degrees();
    (longitude, latitude)
}

fn radar_stereographic(longitude_deg: f64, latitude_deg: f64) -> (f64, f64) {
    let longitude = longitude_deg.to_radians();
    let latitude = latitude_deg.to_radians();
    let eccentricity = (1.0 - (RADAR_SEMI_MINOR_M / RADAR_SEMI_MAJOR_M).powi(2)).sqrt();
    let t = stereographic_t(latitude, eccentricity);
    let latitude_of_true_scale = RADAR_TRUE_SCALE_LATITUDE_RAD;
    let m_c = latitude_of_true_scale.cos()
        / (1.0 - eccentricity.powi(2) * latitude_of_true_scale.sin().powi(2)).sqrt();
    let t_c = stereographic_t(latitude_of_true_scale, eccentricity);
    let rho = RADAR_SEMI_MAJOR_M * m_c * t / t_c;
    (rho * longitude.sin(), -rho * longitude.cos())
}

fn stereographic_t(latitude: f64, eccentricity: f64) -> f64 {
    let eccentric_sine = eccentricity * latitude.sin();
    (std::f64::consts::FRAC_PI_4 - latitude / 2.0).tan()
        / ((1.0 - eccentric_sine) / (1.0 + eccentric_sine)).powf(eccentricity / 2.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn radar_grid() -> RadarGrid {
        RadarGrid {
            projection: "stereographic".into(),
            x0_km: 0.0,
            y0_km: -3_650.0,
            dx_km: 1.0,
            dy_km: -1.0,
            width: 700,
            height: 765,
        }
    }

    fn arome_grid() -> AromeGrid {
        AromeGrid {
            grid_type: "regular_ll".into(),
            ni: 390,
            nj: 390,
            latitude_first: 49.0,
            longitude_first: 0.0,
            latitude_last: 56.002,
            longitude_last: 11.281,
            latitude_increment: 0.018,
            longitude_increment: 0.029,
        }
    }

    #[test]
    fn stereographic_formula_matches_knmi_corners() {
        let upper_left = radar_stereographic(0.0, 55.973_602);
        assert!((upper_left.0 - 0.0).abs() < 20.0);
        assert!((upper_left.1 + 3_649_995.46).abs() < 20.0);
        let upper_right = radar_stereographic(10.856_453, 55.388_973);
        assert!((upper_right.0 - 700_001.74).abs() < 20.0);
        assert!((upper_right.1 + 3_649_995.44).abs() < 20.0);
    }

    #[test]
    fn shared_grid_is_covered_by_both_sources() {
        let radar = IndexMap::radar(&radar_grid()).unwrap();
        let arome = IndexMap::arome(&arome_grid()).unwrap();
        assert_eq!(radar.indices.len(), SHARED_GRID.cell_count());
        assert_eq!(arome.indices.len(), SHARED_GRID.cell_count());
        assert_eq!(radar.missing_count(), 0);
        assert_eq!(arome.missing_count(), 0);
    }

    #[test]
    fn gather_preserves_missing_mask() {
        let map = IndexMap {
            indices: vec![1, MISSING_INDEX, 0],
        };
        let gathered = map.gather(&[2.0, 3.0]).unwrap();
        assert_eq!(gathered[0], 3.0);
        assert!(gathered[1].is_nan());
        assert_eq!(gathered[2], 2.0);
    }
}
