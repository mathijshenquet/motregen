//! Gevoelstemperatuur: KNMI JAG/TI tot en met 10 °C, Steadmans apparent temperature mét straling vanaf 15 °C, een
//! lineaire band daartussen (MIP-10, MIP-41). Definitie, kalibratie van Q en bronnen: docs/fields.md
//! §Gevoelstemperatuur.

use chrono::{DateTime, Datelike};
use render_core::sky_light::solar_position;

use crate::grid::{GridSpec, web_mercator_to_lon_lat};

const WIND_CHILL_MAX_C: f32 = 10.0;
const WIND_CHILL_MIN_WIND_MS: f32 = 1.3;
const FEELS_LIKE_BLEND_C: f32 = 5.0;
// ISO 7726: kortgolvige absorptie van huid en kleding.
const BODY_SHORTWAVE_ABSORPTIVITY: f64 = 0.7;
// Onder deze gemiddelde zonshoogte in het uur is de Erbs-splitsing ruis; de directe bundel telt dan niet.
const MIN_HOUR_SUN_SIN: f64 = 0.052_335_956; // sin 3°
const MAX_DIRECT_NORMAL_W_M2: f64 = 1_000.0;
const SOLAR_CONSTANT_W_M2: f64 = 1_361.0;
const HOUR_MS: f64 = 3_600_000.0;
const HOUR_SUBSTEPS: usize = 6;

/// `sun_q_w_m2`: door een staande persoon geabsorbeerde zon per m² lichaam (Steadmans Q); telt alleen boven 10 °C.
pub fn feels_like_c(
    temperature_c: f32,
    relative_humidity: f32,
    wind_u_ms: f32,
    wind_v_ms: f32,
    sun_q_w_m2: f32,
) -> f32 {
    if [temperature_c, relative_humidity, wind_u_ms, wind_v_ms]
        .into_iter()
        .any(f32::is_nan)
    {
        return f32::NAN;
    }
    let wind_ms = wind_u_ms.hypot(wind_v_ms);
    let blend = ((temperature_c - WIND_CHILL_MAX_C) / FEELS_LIKE_BLEND_C).clamp(0.0, 1.0);
    if blend == 0.0 {
        return wind_chill_c(temperature_c, wind_ms);
    }
    let apparent = apparent_temperature_c(temperature_c, relative_humidity, wind_ms, sun_q_w_m2);
    if blend == 1.0 {
        return apparent;
    }
    wind_chill_c(temperature_c, wind_ms) * (1.0 - blend) + apparent * blend
}

fn wind_chill_c(temperature_c: f32, wind_ms: f32) -> f32 {
    if wind_ms < WIND_CHILL_MIN_WIND_MS {
        return temperature_c;
    }
    let wind_factor = (wind_ms * 3.6).powf(0.16);
    13.12 + 0.6215 * temperature_c - 11.37 * wind_factor + 0.3965 * temperature_c * wind_factor
}

/// BoM-vorm met straling (Steadman 1994).
fn apparent_temperature_c(
    temperature_c: f32,
    relative_humidity: f32,
    wind_ms: f32,
    sun_q_w_m2: f32,
) -> f32 {
    let vapour_pressure_hpa = relative_humidity.clamp(0.0, 1.0)
        * 6.105
        * (17.27 * temperature_c / (237.7 + temperature_c)).exp();
    let sun = if sun_q_w_m2 > 0.0 { sun_q_w_m2 } else { 0.0 };
    temperature_c + 0.348 * vapour_pressure_hpa - 0.70 * wind_ms + 0.70 * sun / (wind_ms + 10.0)
        - 4.25
}

/// Gevoel voor één HARMONIE-uur op `grid`. `global_at` en `global_after` zijn de uurgemiddelden van de globale
/// straling (W/m²) die op `epoch_ms` en een uur later eindigen; het laatste uur van een run heeft geen `after`.
#[allow(clippy::too_many_arguments)]
pub fn feels_like_frame(
    sun: &SunGeometry,
    epoch_ms: f64,
    temperature_c: &[f32],
    relative_humidity: &[f32],
    wind_u_ms: &[f32],
    wind_v_ms: &[f32],
    global_at: &[f32],
    global_after: Option<&[f32]>,
) -> Vec<f32> {
    let now = SunAt::new(epoch_ms);
    let hour_at = HourSun::new(epoch_ms);
    let hour_after = global_after.map(|_| HourSun::new(epoch_ms + HOUR_MS));
    (0..temperature_c.len())
        .map(|index| {
            let temperature = temperature_c[index];
            let q = if temperature > WIND_CHILL_MAX_C {
                let cell = &sun.cells[index];
                let after = global_after
                    .zip(hour_after.as_ref())
                    .map(|(global, hour)| (global[index], hour));
                sun_q(cell, &now, (global_at[index], &hour_at), after) as f32
            } else {
                0.0
            };
            feels_like_c(
                temperature,
                relative_humidity[index],
                wind_u_ms[index],
                wind_v_ms[index],
                q,
            )
        })
        .collect()
}

/// Celmiddens van een raster in breedte en lengte, voor de zonshoogte per cel.
pub struct SunGeometry {
    cells: Vec<CellPosition>,
}

struct CellPosition {
    sin_latitude: f64,
    cos_latitude: f64,
    longitude_rad: f64,
}

impl SunGeometry {
    pub fn new(grid: GridSpec) -> Self {
        let mut cells = Vec::with_capacity(grid.cell_count());
        for row in 0..grid.height {
            let y = grid.y0 + (f64::from(row) + 0.5) * grid.dy;
            for column in 0..grid.width {
                let x = grid.x0 + (f64::from(column) + 0.5) * grid.dx;
                let (longitude, latitude) = web_mercator_to_lon_lat(x, y);
                cells.push(CellPosition::new(longitude, latitude));
            }
        }
        Self { cells }
    }
}

impl CellPosition {
    fn new(longitude_deg: f64, latitude_deg: f64) -> Self {
        let latitude = latitude_deg.to_radians();
        Self {
            sin_latitude: latitude.sin(),
            cos_latitude: latitude.cos(),
            longitude_rad: longitude_deg.to_radians(),
        }
    }
}

struct SunAt {
    sin_declination: f64,
    cos_declination: f64,
    subsolar_longitude: f64,
}

impl SunAt {
    fn new(epoch_ms: f64) -> Self {
        let position = solar_position(epoch_ms);
        Self {
            sin_declination: position.declination.sin(),
            cos_declination: position.declination.cos(),
            subsolar_longitude: position.subsolar_longitude,
        }
    }

    fn sin_elevation(&self, cell: &CellPosition) -> f64 {
        cell.sin_latitude * self.sin_declination
            + cell.cos_latitude
                * self.cos_declination
                * (cell.longitude_rad - self.subsolar_longitude).cos()
    }
}

/// Het uur dat op `end` eindigt, zoals de HARMONIE-uurgemiddelden: de middens van zes stappen van tien minuten.
struct HourSun {
    substeps: [SunAt; HOUR_SUBSTEPS],
    extraterrestrial_w_m2: f64,
}

impl HourSun {
    fn new(end_ms: f64) -> Self {
        let day_of_year =
            DateTime::from_timestamp_millis(end_ms as i64).map_or(1, |time| time.ordinal());
        Self {
            substeps: std::array::from_fn(|step| {
                SunAt::new(end_ms - (step as f64 + 0.5) * HOUR_MS / HOUR_SUBSTEPS as f64)
            }),
            extraterrestrial_w_m2: SOLAR_CONSTANT_W_M2
                * (1.0 + 0.033 * (std::f64::consts::TAU * f64::from(day_of_year) / 365.0).cos()),
        }
    }

    /// Directe normaalstraling als uurgemiddelde uit het uurgemiddelde van de globale straling: helderheidsindex
    /// op het uur, Erbs splitst diffuus en direct. `None` zonder geldige straling.
    fn direct_normal(&self, cell: &CellPosition, global_mean: f32) -> Option<f64> {
        if !global_mean.is_finite() {
            return None;
        }
        let global_mean = f64::from(global_mean);
        if global_mean <= 0.0 {
            return Some(0.0);
        }
        let mu = self
            .substeps
            .iter()
            .map(|sun| sun.sin_elevation(cell).max(0.0))
            .sum::<f64>()
            / HOUR_SUBSTEPS as f64;
        if mu < MIN_HOUR_SUN_SIN {
            return Some(0.0);
        }
        let clearness = (global_mean / (self.extraterrestrial_w_m2 * mu)).min(1.0);
        let direct_horizontal = global_mean * (1.0 - erbs_diffuse_fraction(clearness));
        Some((direct_horizontal / mu).min(MAX_DIRECT_NORMAL_W_M2))
    }
}

/// Q op een tijdstip: de directe normaalstraling van de uren die erop en een uur later eindigen (zo ligt het
/// midden op het tijdstip), op de zonshoogte van dat moment. Ontbreekt één uur, dan telt het andere.
fn sun_q(
    cell: &CellPosition,
    now: &SunAt,
    at: (f32, &HourSun),
    after: Option<(f32, &HourSun)>,
) -> f64 {
    let sin_now = now.sin_elevation(cell);
    if sin_now <= 0.0 {
        return 0.0;
    }
    let directs = [Some(at), after]
        .into_iter()
        .flatten()
        .filter_map(|(global, hour)| hour.direct_normal(cell, global))
        .collect::<Vec<_>>();
    if directs.is_empty() {
        return 0.0;
    }
    absorbed_sun_q(directs.iter().sum::<f64>() / directs.len() as f64, sin_now)
}

/// Door een staande persoon geabsorbeerde directe zon per m² lichaam.
fn absorbed_sun_q(direct_normal_w_m2: f64, sin_elevation: f64) -> f64 {
    BODY_SHORTWAVE_ABSORPTIVITY
        * standing_projected_area_factor(sin_elevation)
        * direct_normal_w_m2.max(0.0)
}

/// Projectiefactor van een staande persoon voor de directe bundel (Underwood & Ward 1966, zoals in RayMan/SOLWEIG).
fn standing_projected_area_factor(sin_elevation: f64) -> f64 {
    if sin_elevation <= 0.0 {
        return 0.0;
    }
    let degrees = sin_elevation.min(1.0).asin().to_degrees();
    0.308
        * (degrees * (1.0 - degrees * degrees / 48_402.0))
            .to_radians()
            .cos()
}

/// Erbs, Klein & Duffie (1982): diffuse fractie van de globale straling uit de helderheidsindex.
fn erbs_diffuse_fraction(clearness: f64) -> f64 {
    if clearness <= 0.22 {
        1.0 - 0.09 * clearness
    } else if clearness <= 0.8 {
        0.9511 - 0.1604 * clearness + 4.388 * clearness.powi(2) - 16.638 * clearness.powi(3)
            + 12.336 * clearness.powi(4)
    } else {
        0.165
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const DE_BILT: (f64, f64) = (5.18, 52.1);

    fn epoch(text: &str) -> f64 {
        DateTime::parse_from_rfc3339(text)
            .unwrap()
            .timestamp_millis() as f64
    }

    fn q_de_bilt(epoch_ms: f64, global_at: f32, global_after: Option<f32>) -> f32 {
        let cell = CellPosition::new(DE_BILT.0, DE_BILT.1);
        let hour_at = HourSun::new(epoch_ms);
        let hour_after = HourSun::new(epoch_ms + HOUR_MS);
        sun_q(
            &cell,
            &SunAt::new(epoch_ms),
            (global_at, &hour_at),
            global_after.map(|global| (global, &hour_after)),
        ) as f32
    }

    #[test]
    fn follows_knmi_wind_chill_up_to_ten_degrees_also_in_the_sun() {
        for q in [0.0, 100.0, 250.0] {
            let wind_chill = feels_like_c(-5.0, 0.8, 20.0 / 3.6, 0.0, q);
            assert!((wind_chill - -11.6).abs() < 0.1);
            // KNMI TR-309 tabel 3 (JAG/TI): 0 °C bij 10 km/u geeft −3.
            assert_eq!(feels_like_c(0.0, 0.8, 0.0, 10.0 / 3.6, q).round(), -3.0);
            assert_eq!(feels_like_c(4.0, 0.8, 1.0, 0.5, q), 4.0);
        }
    }

    #[test]
    fn uses_steadman_apparent_temperature_when_warm() {
        let apparent = feels_like_c(25.0, 0.6, 0.0, 2.0, 0.0);
        assert!((apparent - 25.94).abs() < 0.05, "{apparent}");
        let muggy = feels_like_c(30.0, 0.8, 1.0, 0.0, 0.0);
        assert!(muggy > 34.0, "{muggy}");
    }

    #[test]
    fn is_continuous_around_the_band() {
        let mut largest = 0.0_f32;
        for q in [0.0, 50.0, 100.0, 200.0, 250.0] {
            for relative_humidity in [0.3, 0.6, 0.85, 1.0] {
                for wind_ms in [0.0, 1.0, 1.3, 3.0, 6.0, 12.0] {
                    let edge = feels_like_c(10.005, relative_humidity, wind_ms, 0.0, q)
                        - feels_like_c(9.995, relative_humidity, wind_ms, 0.0, q);
                    assert!(
                        edge.abs() < 0.05,
                        "q {q} rh {relative_humidity} wind {wind_ms}: {edge}"
                    );
                    for step in 0..120 {
                        let temperature = 5.0 + step as f32 * 0.1;
                        let jump =
                            feels_like_c(temperature + 0.1, relative_humidity, wind_ms, 0.0, q)
                                - feels_like_c(temperature, relative_humidity, wind_ms, 0.0, q);
                        largest = largest.max(jump.abs());
                    }
                }
            }
        }
        // Geen sprong > 1 °C. Bij veel zon en weinig wind is de band steil (Q 250, windstil: ruim 0,5 °C per
        // 0,1 °C), maar continu.
        assert!(largest < 0.6, "{largest}");
    }

    #[test]
    fn without_sun_equals_the_shade_form() {
        let midnight = epoch("2026-04-20T23:00:00Z");
        assert_eq!(q_de_bilt(midnight, 0.0, Some(0.0)), 0.0);
        assert_eq!(q_de_bilt(midnight, f32::NAN, None), 0.0);
        for temperature in [15.0_f32, 18.0, 22.0, 25.0] {
            for relative_humidity in [0.3, 0.6, 0.9] {
                for wind_ms in [0.0, 3.0, 8.0] {
                    let vapour = relative_humidity
                        * 6.105
                        * (17.27 * temperature / (237.7 + temperature)).exp();
                    let shade = temperature + 0.33 * vapour - 0.70 * wind_ms - 4.00;
                    // BoM met Q = 0 tegen de vorm zonder straling (MIP-10): alleen de constanten verschillen (0,018e −
                    // 0,25), hooguit 0,3 °C op een benauwde zomeravond.
                    let difference =
                        feels_like_c(temperature, relative_humidity, wind_ms, 0.0, 0.0) - shade;
                    assert!(
                        difference.abs() < 0.3,
                        "{temperature} {relative_humidity} {wind_ms}: {difference}"
                    );
                }
            }
        }
    }

    #[test]
    fn spring_noon_sanity() {
        let noon = epoch("2026-04-20T11:40:00Z");
        let sunny = q_de_bilt(noon, 700.0, Some(700.0));
        assert!((95.0..110.0).contains(&sunny), "{sunny}");
        let overcast = q_de_bilt(noon, 150.0, Some(150.0));
        assert!(overcast < 5.0, "{overcast}");
        // MIP-41-tabel: zon 15 °C (2 Bft, RH 60 %) boven de lucht, bewolkt 15 °C (3 Bft, RH 85 %) eronder.
        let warm = feels_like_c(15.0, 0.6, 2.5, 0.0, sunny);
        assert!((warm - 18.2).abs() < 0.15, "{warm}");
        let cool = feels_like_c(15.0, 0.85, 4.4, 0.0, overcast);
        assert!((cool - 12.7).abs() < 0.15, "{cool}");
        let summer = feels_like_c(24.0, 0.6, 2.5, 0.0, sunny);
        assert!((summer - 29.9).abs() < 0.15, "{summer}");
    }

    #[test]
    fn last_hour_of_a_run_uses_one_hour_and_bad_cells_count_as_missing() {
        let noon = epoch("2026-04-20T11:40:00Z");
        let both = q_de_bilt(noon, 700.0, Some(700.0));
        let alone = q_de_bilt(noon, 700.0, None);
        assert!((both - alone).abs() < 3.0, "{both} {alone}");
        assert!((q_de_bilt(noon, f32::NAN, Some(700.0)) - both).abs() < 3.0);
    }

    #[test]
    fn has_a_plausible_beam_and_projection() {
        assert!((standing_projected_area_factor(1.0) - 0.08).abs() < 0.005);
        assert!((standing_projected_area_factor(0.01) - 0.308).abs() < 0.005);
        assert_eq!(standing_projected_area_factor(-0.1), 0.0);
        let hour = HourSun::new(epoch("2026-04-20T12:00:00Z"));
        let cell = CellPosition::new(DE_BILT.0, DE_BILT.1);
        let clear = hour.direct_normal(&cell, 700.0).unwrap();
        assert!((500.0..=1_000.0).contains(&clear), "{clear}");
        let night = HourSun::new(epoch("2026-04-20T23:00:00Z"));
        assert_eq!(night.direct_normal(&cell, 700.0), Some(0.0));
    }

    #[test]
    fn frame_matches_the_cell_formula() {
        let grid = crate::grid::DETAIL_GRID;
        let sun = SunGeometry::new(grid);
        let count = grid.cell_count();
        let noon = epoch("2026-04-20T12:00:00Z");
        let temperature = vec![18.0; count];
        let humidity = vec![0.6; count];
        let wind = vec![2.5; count];
        let calm = vec![0.0; count];
        let global = vec![700.0; count];
        let frame = feels_like_frame(
            &sun,
            noon,
            &temperature,
            &humidity,
            &wind,
            &calm,
            &global,
            Some(&global),
        );
        let cold = vec![8.0; count];
        let winter = feels_like_frame(
            &sun,
            noon,
            &cold,
            &humidity,
            &wind,
            &calm,
            &global,
            Some(&global),
        );
        let index = count / 2 + grid.width as usize / 2;
        let cell = &sun.cells[index];
        let expected = feels_like_c(
            18.0,
            0.6,
            2.5,
            0.0,
            sun_q(
                cell,
                &SunAt::new(noon),
                (700.0, &HourSun::new(noon)),
                Some((700.0, &HourSun::new(noon + HOUR_MS))),
            ) as f32,
        );
        assert_eq!(frame[index], expected);
        assert!(frame[index] > 18.0);
        assert_eq!(winter[index], feels_like_c(8.0, 0.6, 2.5, 0.0, 0.0));
    }
}
