from datetime import UTC, datetime

import pytest

from skywatch.solar import (
    clear_sky_radiation,
    hourly_cloud_modification_factor,
    solar_elevation_sine,
)


def test_haurwitz_matches_frontend_formula() -> None:
    assert clear_sky_radiation(0.5) == pytest.approx(489.849618, rel=1e-6)
    assert clear_sky_radiation(0.01) == 0


def test_hourly_cmf_is_bounded_and_unavailable_in_darkness() -> None:
    noon = datetime(2026, 6, 21, 12, tzinfo=UTC)
    clear = sum(
        clear_sky_radiation(solar_elevation_sine(datetime(2026, 6, 21, hour, minute, tzinfo=UTC), 5.18, 52.1))
        for hour, minute in ((11, 5), (11, 15), (11, 25), (11, 35), (11, 45), (11, 55))
    ) / 6
    assert hourly_cloud_modification_factor(clear / 2, noon, 5.18, 52.1) == pytest.approx(0.5)
    assert hourly_cloud_modification_factor(clear * 2, noon, 5.18, 52.1) == 1
    assert hourly_cloud_modification_factor(0, datetime(2026, 6, 21, 0, tzinfo=UTC), 5.18, 52.1) is None
