from __future__ import annotations

import math
from datetime import datetime

DAY_SECONDS = 86_400
RADIANS = math.pi / 180


def solar_elevation_sine(at: datetime, longitude: float, latitude: float) -> float:
    epoch_seconds = at.timestamp()
    days_since_j2000 = epoch_seconds / DAY_SECONDS + 2_440_587.5 - 2_451_545
    mean_longitude = _normalize((280.460 + 0.9856474 * days_since_j2000) * RADIANS)
    mean_anomaly = _normalize((357.528 + 0.9856003 * days_since_j2000) * RADIANS)
    ecliptic_longitude = (
        mean_longitude
        + 1.915 * RADIANS * math.sin(mean_anomaly)
        + 0.020 * RADIANS * math.sin(2 * mean_anomaly)
    )
    obliquity = (23.439 - 0.0000004 * days_since_j2000) * RADIANS
    right_ascension = math.atan2(
        math.cos(obliquity) * math.sin(ecliptic_longitude),
        math.cos(ecliptic_longitude),
    )
    declination = math.asin(math.sin(obliquity) * math.sin(ecliptic_longitude))
    sidereal_time = _normalize((280.46061837 + 360.98564736629 * days_since_j2000) * RADIANS)
    subsolar_longitude = _signed(right_ascension - sidereal_time)
    latitude_radians = latitude * RADIANS
    hour_angle = longitude * RADIANS - subsolar_longitude
    return (
        math.sin(latitude_radians) * math.sin(declination)
        + math.cos(latitude_radians) * math.cos(declination) * math.cos(hour_angle)
    )


def clear_sky_radiation(elevation_sine: float) -> float:
    if elevation_sine <= 0.01:
        return 0.0
    return 1_098 * elevation_sine * math.exp(-0.057 / elevation_sine)


def hourly_cloud_modification_factor(
    radiation_w_m2: float | None,
    interval_end: datetime,
    longitude: float,
    latitude: float,
) -> float | None:
    if radiation_w_m2 is None or not math.isfinite(radiation_w_m2):
        return None
    clear_mean = sum(
        clear_sky_radiation(
            solar_elevation_sine(
                datetime.fromtimestamp(interval_end.timestamp() - (step + 0.5) * 600, tz=interval_end.tzinfo),
                longitude,
                latitude,
            )
        )
        for step in range(6)
    ) / 6
    if clear_mean <= 20:
        return None
    return min(1.0, max(0.0, radiation_w_m2 / clear_mean))


def instantaneous_cloud_modification_factor(
    radiation_w_m2: float | None,
    at: datetime,
    longitude: float,
    latitude: float,
) -> float | None:
    if radiation_w_m2 is None or not math.isfinite(radiation_w_m2):
        return None
    clear = clear_sky_radiation(solar_elevation_sine(at, longitude, latitude))
    if clear <= 20:
        return None
    return min(1.0, max(0.0, radiation_w_m2 / clear))


def _normalize(value: float) -> float:
    full_turn = math.pi * 2
    return value % full_turn


def _signed(value: float) -> float:
    normalized = _normalize(value)
    return normalized - math.pi * 2 if normalized > math.pi else normalized
