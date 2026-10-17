//! Licht op de grond voor de wolkenkaart: zonnestand, de lichtfactor uit HARMONIE-straling en de donkerte
//! op de perceptuele schaal. Port van `solar.ts`, `uv.ts` (`cloudModification`) en `cloud-section.ts`; de
//! constanten en de controlewaarden komen uit de gegenereerde modeconstanten.

use crate::mode_constants::mode_constants;

const DAY_MILLISECONDS: f64 = 86_400_000.0;
const HOUR_MILLISECONDS: f64 = 3_600_000.0;

pub struct SolarPosition {
    pub declination: f64,
    pub subsolar_longitude: f64,
}

pub fn solar_position(epoch: f64) -> SolarPosition {
    let radians = std::f64::consts::PI / 180.0;
    let days_since_j2000 = epoch / DAY_MILLISECONDS + 2_440_587.5 - 2_451_545.0;
    let mean_longitude = normalize((280.460 + 0.985_647_4 * days_since_j2000) * radians);
    let mean_anomaly = normalize((357.528 + 0.985_600_3 * days_since_j2000) * radians);
    let ecliptic_longitude = mean_longitude
        + 1.915 * radians * mean_anomaly.sin()
        + 0.020 * radians * (2.0 * mean_anomaly).sin();
    let obliquity = (23.439 - 0.000_000_4 * days_since_j2000) * radians;
    let right_ascension =
        (obliquity.cos() * ecliptic_longitude.sin()).atan2(ecliptic_longitude.cos());
    let declination = (obliquity.sin() * ecliptic_longitude.sin()).asin();
    let sidereal_time =
        normalize((280.460_618_37 + 360.985_647_366_29 * days_since_j2000) * radians);
    SolarPosition {
        declination,
        subsolar_longitude: signed(right_ascension - sidereal_time),
    }
}

pub fn solar_elevation_sin(epoch: f64, longitude: f64, latitude: f64) -> f64 {
    let radians = std::f64::consts::PI / 180.0;
    let position = solar_position(epoch);
    let latitude = latitude * radians;
    let hour_angle = longitude * radians - position.subsolar_longitude;
    latitude.sin() * position.declination.sin()
        + latitude.cos() * position.declination.cos() * hour_angle.cos()
}

fn normalize(value: f64) -> f64 {
    let full_turn = std::f64::consts::TAU;
    (value % full_turn + full_turn) % full_turn
}

fn signed(value: f64) -> f64 {
    let normalized = normalize(value);
    if normalized > std::f64::consts::PI {
        normalized - std::f64::consts::TAU
    } else {
        normalized
    }
}

/// Haurwitz heldere-hemelinstraling in W/m².
pub fn clear_sky_radiation(sin_elevation: f64) -> f64 {
    if sin_elevation > 0.01 {
        1_098.0 * sin_elevation * (-0.057 / sin_elevation).exp()
    } else {
        0.0
    }
}

/// Deel van de heldere-hemelinstraling dat de grond bereikt, uit de HARMONIE-uurmiddelen die op `epoch` en een uur
/// later eindigen. `None` 's nachts en zonder straling.
pub fn cloud_modification(
    epoch: f64,
    radiation_before: Option<f64>,
    radiation_after: Option<f64>,
    sin_elevation: impl Fn(f64) -> f64,
) -> Option<f64> {
    let mut ratios = Vec::with_capacity(2);
    for (radiation, end) in [
        (radiation_before, epoch),
        (radiation_after, epoch + HOUR_MILLISECONDS),
    ] {
        let Some(radiation) = radiation.filter(|value| value.is_finite()) else {
            continue;
        };
        let mut clear = 0.0;
        for step in 0..6 {
            clear +=
                clear_sky_radiation(sin_elevation(end - (step as f64 + 0.5) * 600_000.0)) / 6.0;
        }
        if clear > 20.0 {
            ratios.push((radiation / clear).clamp(0.0, 1.0));
        }
    }
    (!ratios.is_empty()).then(|| ratios.iter().sum::<f64>() / ratios.len() as f64)
}

/// Geschatte lichtdoorlating (0–1) uit de bedekking per laag (fracties), voor nacht en verleden.
pub fn layer_transmission(low: f64, mid: f64, high: f64) -> f64 {
    let blocking = &mode_constants().cloud.layer_blocking;
    [
        (high, blocking.high),
        (mid, blocking.mid),
        (low, blocking.low),
    ]
    .iter()
    .fold(1.0, |light, &(cover, blocking)| {
        light * (1.0 - blocking * cover.clamp(0.0, 1.0))
    })
}

/// Donkerte van hemel en wolken (0 = stralend, 1 = loodgrijs); mooi weer blijft helder.
pub fn sky_darkness(light: f64) -> f64 {
    let cloud = &mode_constants().cloud;
    if light.is_nan() || light <= 0.0 {
        return 1.0;
    }
    ((-light.min(1.0).log2() - cloud.fair_halvings)
        / (cloud.darkest_halvings - cloud.fair_halvings))
        .clamp(0.0, 1.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn matches_the_typescript_light_chain() {
        let fixtures = &mode_constants().cloud.light_fixtures;
        assert!(!fixtures.is_empty());
        for fixture in fixtures {
            let sin = solar_elevation_sin(fixture.epoch, fixture.longitude, fixture.latitude);
            assert!(
                (sin - fixture.sin_elevation).abs() < 1e-12,
                "zonnestand {fixture:?}: {sin}"
            );
            let modification = cloud_modification(
                fixture.epoch,
                fixture.radiation_before,
                fixture.radiation_after,
                |time| solar_elevation_sin(time, fixture.longitude, fixture.latitude),
            );
            match (modification, fixture.modification) {
                (Some(actual), Some(expected)) => assert!((actual - expected).abs() < 1e-12),
                (actual, expected) => assert_eq!(actual, expected, "{fixture:?}"),
            }
            let transmission = layer_transmission(fixture.low, fixture.mid, fixture.high);
            assert!((transmission - fixture.transmission).abs() < 1e-12);
            let light = fixture.light.unwrap_or(f64::NAN);
            assert!((sky_darkness(light) - fixture.darkness).abs() < 1e-12);
        }
    }
}
