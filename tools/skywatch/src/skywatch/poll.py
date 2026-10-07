from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
import urllib.request
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, cast

from .observations import fetch_latest_observation
from .schema import CSV_COLUMNS, MODEL_HORIZONS, append_sample
from .solar import hourly_cloud_modification_factor, instantaneous_cloud_modification_factor

WEBCAM_URL = "https://cdn.knmi.nl/knmi/map/page/weer/actueel-weer/webcam/webcam.jpg"
MANIFEST_URL = "https://motregen.nl/data/manifest.json"
DE_BILT_LATITUDE = 52.10
DE_BILT_LONGITUDE = 5.18


@dataclass(frozen=True)
class WebcamSample:
    path: str
    sha256: str
    changed: bool
    change_interval_minutes: float | None
    age_minutes: float


def utc_iso(at: datetime) -> str:
    return at.astimezone(UTC).isoformat(timespec="seconds").replace("+00:00", "Z")


def poll(repo_root: Path, skywatch_home: Path, csv_path: Path, at: datetime) -> dict[str, object]:
    api_key = os.environ.get("KNMI_OPEN_DATA_API_KEY")
    if not api_key:
        raise RuntimeError("KNMI_OPEN_DATA_API_KEY ontbreekt")
    h5dump = os.environ.get("SKYWATCH_H5DUMP") or shutil.which("h5dump")
    if not h5dump:
        raise RuntimeError("h5dump ontbreekt; voer de poller vanuit de devenv uit")

    webcam = fetch_webcam(skywatch_home, at)
    observation = fetch_latest_observation(api_key, h5dump)
    models = sample_models(repo_root, at)
    row = build_row(at, webcam, observation, models)
    append_sample(csv_path, row)
    return row


def fetch_webcam(skywatch_home: Path, at: datetime, timeout_seconds: float = 30) -> WebcamSample:
    request = urllib.request.Request(WEBCAM_URL, headers={"User-Agent": "motregen-skywatch/0.1"})
    with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
        image = response.read()
    if len(image) < 4 or not image.startswith(b"\xff\xd8") or not image.endswith(b"\xff\xd9"):
        raise RuntimeError("KNMI-webcamantwoord is geen volledige JPEG")

    digest = hashlib.sha256(image).hexdigest()
    state_path = skywatch_home / "state.json"
    state = _read_state(state_path)
    previous_digest = state.get("webcam_sha256")
    previous_path = state.get("webcam_path")
    previous_changed_at = _parse_optional_time(state.get("webcam_changed_at"))
    changed = digest != previous_digest or not isinstance(previous_path, str) or not (skywatch_home / previous_path).is_file()
    changed_at = at if changed else previous_changed_at
    if changed:
        relative_path = Path("images") / at.strftime("%Y-%m-%d") / f"{at:%H%M}.jpg"
        image_path = skywatch_home / relative_path
        image_path.parent.mkdir(parents=True, exist_ok=True)
        _atomic_write(image_path, image)
    else:
        relative_path = Path(cast(str, previous_path))

    change_interval = None
    if changed and previous_changed_at is not None:
        change_interval = max(0.0, (at - previous_changed_at).total_seconds() / 60)
    age_minutes = max(0.0, (at - changed_at).total_seconds() / 60) if changed_at is not None else 0.0
    _atomic_write(
        state_path,
        json.dumps(
            {
                "webcam_sha256": digest,
                "webcam_path": relative_path.as_posix(),
                "webcam_changed_at": utc_iso(changed_at or at),
                "last_polled_at": utc_iso(at),
            },
            indent=2,
        ).encode() + b"\n",
    )
    return WebcamSample(relative_path.as_posix(), digest, changed, change_interval, age_minutes)


def sample_models(repo_root: Path, at: datetime) -> list[dict[str, object]]:
    pnpm = os.environ.get("SKYWATCH_PNPM") or shutil.which("pnpm")
    if not pnpm:
        raise RuntimeError("pnpm ontbreekt; voer de poller vanuit de devenv uit")
    script = repo_root / "tools/skywatch/sample-model.ts"
    command = [
        pnpm,
        "--dir",
        str(repo_root / "web"),
        "exec",
        "tsx",
        str(script),
        "--manifest",
        MANIFEST_URL,
        "--at",
        utc_iso(at),
        "--latitude",
        str(DE_BILT_LATITUDE),
        "--longitude",
        str(DE_BILT_LONGITUDE),
    ]
    result = subprocess.run(command, check=True, capture_output=True, text=True, timeout=120)
    decoded = cast(object, json.loads(result.stdout))
    if not isinstance(decoded, list):
        raise RuntimeError("Modelsampler gaf geen lijst terug")
    value = cast(list[object], decoded)
    if len(value) != len(MODEL_HORIZONS) or not all(isinstance(item, dict) for item in value):
        raise RuntimeError("Modelsampler gaf niet precies zeven horizons terug")
    return cast(list[dict[str, object]], value)


def build_row(at: datetime, webcam: WebcamSample, observation: Any, models: list[dict[str, object]]) -> dict[str, object]:
    observed_cmf = instantaneous_cloud_modification_factor(
        observation.radiation_w_m2,
        observation.at,
        DE_BILT_LONGITUDE,
        DE_BILT_LATITUDE,
    )
    row: dict[str, object] = {
        "sample_id": at.strftime("%Y%m%dT%H%M%SZ"),
        "polled_at": utc_iso(at),
        "webcam_path": webcam.path,
        "webcam_sha256": webcam.sha256,
        "webcam_changed": str(webcam.changed).lower(),
        "webcam_change_interval_minutes": _csv_value(webcam.change_interval_minutes),
        "webcam_age_minutes": round(webcam.age_minutes, 3),
        "observation_file": observation.filename,
        "observation_at": utc_iso(observation.at),
        "observed_radiation_w_m2": _csv_value(observation.radiation_w_m2),
        "observed_sunshine_duration_minutes": _csv_value(observation.sunshine_duration_minutes),
        "observed_cloud_cover_oktas": _csv_value(observation.cloud_cover_oktas),
        "observed_cloud_base_ft": _csv_value(observation.cloud_base_ft),
        "observed_visibility_m": _csv_value(observation.visibility_m),
        "observed_cmf": _csv_value(observed_cmf),
    }
    for expected_horizon, model in zip(MODEL_HORIZONS, models, strict=True):
        horizon = int(cast(int | float | str, model["horizonHours"]))
        if horizon != expected_horizon:
            raise RuntimeError(f"Onverwachte modelhorizon {horizon}; verwacht {expected_horizon}")
        prefix = f"model_h{horizon}_"
        radiation = _optional_number(model.get("radiation"))
        valid_at = datetime.fromisoformat(cast(str, model["validAt"]).replace("Z", "+00:00"))
        cmf = hourly_cloud_modification_factor(radiation, valid_at, DE_BILT_LONGITUDE, DE_BILT_LATITUDE)
        row.update(
            {
                f"{prefix}target_at": model["targetAt"],
                f"{prefix}valid_at": model["validAt"],
                f"{prefix}run_at": model["runAt"],
                f"{prefix}forecast_lead_hours": model["forecastLeadHours"],
                f"{prefix}valid_offset_minutes": model["validOffsetMinutes"],
                f"{prefix}cloud_low_pct": _csv_value(model.get("cloud_low")),
                f"{prefix}cloud_mid_pct": _csv_value(model.get("cloud_mid")),
                f"{prefix}cloud_high_pct": _csv_value(model.get("cloud_high")),
                f"{prefix}cloud_frac_pct": _csv_value(model.get("cloud_frac")),
                f"{prefix}radiation_w_m2": _csv_value(radiation),
                f"{prefix}cmf": _csv_value(cmf),
            }
        )
    if set(row) != set(CSV_COLUMNS):
        raise RuntimeError("Interne fout: opgebouwde rij past niet bij CSV_COLUMNS")
    return row


def _read_state(path: Path) -> dict[str, object]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return {}
    return cast(dict[str, object], value) if isinstance(value, dict) else {}


def _parse_optional_time(value: object) -> datetime | None:
    if not isinstance(value, str):
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def _atomic_write(path: Path, content: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=path.parent, prefix=f".{path.name}.", delete=False) as temporary:
        temporary.write(content)
        temporary.flush()
        os.fsync(temporary.fileno())
        temporary_path = Path(temporary.name)
    temporary_path.replace(path)


def _optional_number(value: object) -> float | None:
    return float(value) if isinstance(value, int | float) else None


def _csv_value(value: object) -> object:
    if value is None:
        return ""
    if isinstance(value, float):
        return round(value, 6)
    return value


def _arguments() -> argparse.Namespace:
    repo_root = Path(__file__).resolve().parents[4]
    parser = argparse.ArgumentParser(description="Meet webcam, HARMONIE en station 260 in De Bilt")
    parser.add_argument("--repo-root", type=Path, default=repo_root)
    parser.add_argument("--home", type=Path, default=Path(os.environ.get("SKYWATCH_HOME", "~/skywatch")).expanduser())
    parser.add_argument("--csv", type=Path, default=repo_root / "tools/skywatch/data/samples.csv")
    return parser.parse_args()


def main() -> None:
    arguments = _arguments()
    at = datetime.now(UTC).replace(microsecond=0)
    try:
        row = poll(arguments.repo_root.resolve(), arguments.home.resolve(), arguments.csv.resolve(), at)
    except Exception as error:
        print(f"skywatch poll mislukt: {error}", file=sys.stderr)
        raise
    print(
        json.dumps(
            {
                "sample_id": row["sample_id"],
                "webcam_changed": row["webcam_changed"],
                "observation_at": row["observation_at"],
                "model_valid_at": row["model_h0_valid_at"],
            }
        )
    )


if __name__ == "__main__":
    main()
