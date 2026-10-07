from __future__ import annotations

import csv
import fcntl
import os
from collections.abc import Mapping
from pathlib import Path

MODEL_HORIZONS = tuple(range(7))
MODEL_COLUMNS = (
    "target_at",
    "valid_at",
    "run_at",
    "forecast_lead_hours",
    "valid_offset_minutes",
    "cloud_low_pct",
    "cloud_mid_pct",
    "cloud_high_pct",
    "cloud_frac_pct",
    "radiation_w_m2",
    "cmf",
)
BASE_COLUMNS = (
    "sample_id",
    "polled_at",
    "webcam_path",
    "webcam_sha256",
    "webcam_changed",
    "webcam_change_interval_minutes",
    "webcam_age_minutes",
    "observation_file",
    "observation_at",
    "observed_radiation_w_m2",
    "observed_sunshine_duration_minutes",
    "observed_cloud_cover_oktas",
    "observed_cloud_base_ft",
    "observed_visibility_m",
    "observed_cmf",
)
CSV_COLUMNS = BASE_COLUMNS + tuple(
    f"model_h{horizon}_{column}"
    for horizon in MODEL_HORIZONS
    for column in MODEL_COLUMNS
)


def append_sample(path: Path, row: Mapping[str, object]) -> None:
    if set(row) != set(CSV_COLUMNS):
        missing = sorted(set(CSV_COLUMNS) - set(row))
        extra = sorted(set(row) - set(CSV_COLUMNS))
        raise ValueError(f"CSV-schema wijkt af; ontbreekt={missing}, extra={extra}")

    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a+", encoding="utf-8", newline="") as output:
        fcntl.flock(output, fcntl.LOCK_EX)
        output.seek(0)
        first_line = output.readline().rstrip("\r\n")
        expected_header = ",".join(CSV_COLUMNS)
        if first_line and first_line != expected_header:
            raise ValueError("Bestaand samples.csv heeft een onverwacht schema")
        output.seek(0, os.SEEK_END)
        writer = csv.DictWriter(output, fieldnames=CSV_COLUMNS, lineterminator="\n")
        if not first_line:
            writer.writeheader()
        writer.writerow(row)
        output.flush()
        os.fsync(output.fileno())
