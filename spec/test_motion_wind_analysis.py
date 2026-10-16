"""Known translations validate the independent U84 measuring instrument."""

from __future__ import annotations

import unittest

import cv2
import numpy as np
from motion_wind_analyze import reference, rotation_fit


class MeasurementChecks(unittest.TestCase):
    def test_known_motion_including_hourly_interval_and_stationary_echo(self) -> None:
        random = np.random.default_rng(84)
        before = cv2.GaussianBlur(
            random.uniform(0.1, 3, (512, 512)).astype(np.float32), (3, 3), 0
        )
        for shift_east, shift_row, minutes in [
            (5, -3, 5),
            (-12, 6, 5),
            (0, 0, 5),
            (112, -24, 60),
        ]:
            with self.subTest(shift=(shift_east, shift_row), minutes=minutes):
                transform = np.array(
                    [[1, 0, shift_east], [0, 1, shift_row]], dtype=np.float32
                )
                after = cv2.warpAffine(
                    before, transform, (512, 512), borderValue=float("nan")
                )
                measured = reference(before, after, minutes, (16, 16))
                valid = np.isfinite(measured["velocity"]).all(axis=1)
                self.assertGreater(np.count_nonzero(valid), 4)
                expected = np.array([shift_east, shift_row]) / minutes
                np.testing.assert_allclose(
                    measured["velocity"][valid],
                    np.tile(expected, (int(np.count_nonzero(valid)), 1)),
                    atol=1e-7,
                )

    def test_flat_or_missing_field_cannot_create_reference_motion(self) -> None:
        for value in [0.0, float("nan")]:
            before = np.full((128, 128), value, dtype=np.float32)
            measured = reference(before, before, 5, (4, 4))
            self.assertFalse(np.isfinite(measured["velocity"]).any())

    def test_rotation_and_scale_recover_known_transform_and_expose_clamp(self) -> None:
        angles = np.linspace(-np.pi, np.pi, 100)
        wind = np.column_stack((np.cos(angles), np.sin(angles)))
        expected = 1.4 * np.exp(1j * np.radians(-97))
        observed = (wind[:, 0] + 1j * wind[:, 1]) * expected
        correlation = np.column_stack((observed.real, observed.imag, np.ones(100)))
        bounded, diagnostic = rotation_fit(correlation, wind)
        unbounded, _ = rotation_fit(correlation, wind, "wide")
        constrained, _ = rotation_fit(correlation, wind, "constrained")
        self.assertAlmostEqual(diagnostic["raw_degrees"], -97)
        self.assertAlmostEqual(np.degrees(np.angle(bounded)), -60)
        self.assertAlmostEqual(unbounded.real, expected.real)
        self.assertAlmostEqual(unbounded.imag, expected.imag)
        self.assertAlmostEqual(abs(constrained), 1.4 * np.cos(np.radians(37)))


if __name__ == "__main__":
    unittest.main()
