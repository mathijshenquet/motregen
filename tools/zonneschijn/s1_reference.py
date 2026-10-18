"""Referentiewaarden van S1 en D1 (6 substappen van 10 minuten, zoals de app) voor web/src/core/sunshine.test.ts.

S1 rekent op de HARMONIE-globale straling (MIP-38), D1 op de directe straling van ICON-D2 (MIP-39).
Gebruik: uv run python s1_reference.py — print per geval de minuten zon; de test vergelijkt daarmee.
"""

import numpy as np
import pandas as pd

from evaluate import add_geometry, ramp_estimate
from evaluate_icon_d2 import add_clear_direct, direct_ramp_estimate

# Gefitte parameters uit results.md (MIP-38).
SUN_THRESHOLD_DEGREES = 4.2
RAMP_LOW = 0.28
RAMP_HIGH = 0.92
# D1-grenzen voor beide leads samen uit results-icon-d2.md (MIP-39).
DIRECT_LOW = 0.02
DIRECT_HIGH = 0.66

# (uureinde UTC, lengte, breedte, uurgemiddelde globale straling W/m²)
CASES = [
    ("2026-06-21T12:00:00Z", 5.18, 52.10, 820.0),
    ("2026-06-21T12:00:00Z", 5.18, 52.10, 450.0),
    ("2026-06-21T12:00:00Z", 5.18, 52.10, 120.0),
    ("2026-06-21T05:00:00Z", 5.18, 52.10, 150.0),
    ("2026-06-21T20:00:00Z", 5.18, 52.10, 15.0),
    ("2026-12-21T09:00:00Z", 6.57, 53.22, 20.0),
    ("2026-12-21T12:00:00Z", 3.60, 51.45, 200.0),
    ("2026-10-18T07:00:00Z", 4.90, 52.37, 10.0),
    ("2026-10-18T22:00:00Z", 4.90, 52.37, 0.0),
]


# (uureinde UTC, lengte, breedte, uurgemiddelde directe horizontale straling W/m²)
DIRECT_CASES = [
    ("2026-06-21T12:00:00Z", 5.18, 52.10, 650.0),
    ("2026-06-21T12:00:00Z", 5.18, 52.10, 250.0),
    ("2026-06-21T12:00:00Z", 5.18, 52.10, 5.0),
    ("2026-06-21T05:00:00Z", 5.18, 52.10, 60.0),
    ("2026-06-21T20:00:00Z", 5.18, 52.10, 4.0),
    ("2026-12-21T09:00:00Z", 6.57, 53.22, 8.0),
    ("2026-12-21T12:00:00Z", 3.60, 51.45, 120.0),
    ("2026-10-18T13:00:00Z", 4.90, 52.37, 100.0),
    ("2026-10-18T22:00:00Z", 4.90, 52.37, 0.0),
]


def frame_for(cases: list[tuple[str, float, float, float]]) -> pd.DataFrame:
    frame = pd.DataFrame(
        {
            "hour_end": pd.to_datetime([case[0] for case in cases]).tz_convert(None),
            "lon": [case[1] for case in cases],
            "lat": [case[2] for case in cases],
        }
    )
    return add_clear_direct(add_geometry(frame, SUN_THRESHOLD_DEGREES, substeps=6), substeps=6)


def main() -> None:
    print("S1 (globaal):")
    radiation = np.array([case[3] for case in CASES])
    minutes = ramp_estimate(frame_for(CASES), radiation, RAMP_LOW, RAMP_HIGH)
    for case, value in zip(CASES, minutes):
        print(f"{case[0]} {case[1]:.2f} {case[2]:.2f} {case[3]:6.1f} -> {value:.4f}")
    print("D1 (direct):")
    direct = np.array([case[3] for case in DIRECT_CASES])
    minutes = direct_ramp_estimate(frame_for(DIRECT_CASES), direct, DIRECT_LOW, DIRECT_HIGH)
    for case, value in zip(DIRECT_CASES, minutes):
        print(f"{case[0]} {case[1]:.2f} {case[2]:.2f} {case[3]:6.1f} -> {value:.4f}")


if __name__ == "__main__":
    main()
