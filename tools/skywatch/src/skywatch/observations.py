from __future__ import annotations

import csv
import json
import math
import re
import subprocess
import tempfile
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any, cast

DATASET = "10-minute-in-situ-meteorological-observations"
DATASET_VERSION = "1.0"
STATION = "06260"
API_ROOT = "https://api.dataplatform.knmi.nl/open-data/v1"
VARIABLES = {
    "radiation_w_m2": "qg",
    "sunshine_duration_minutes": "ss",
    "cloud_cover_oktas": "n",
    "cloud_base_ft": "h",
    "visibility_m": "vv",
}


@dataclass(frozen=True)
class Observation:
    filename: str
    at: datetime
    radiation_w_m2: float | None
    sunshine_duration_minutes: float | None
    cloud_cover_oktas: float | None
    cloud_base_ft: float | None
    visibility_m: float | None


def fetch_latest_observation(api_key: str, h5dump: str, timeout_seconds: float = 30) -> Observation:
    query = urllib.parse.urlencode({"maxKeys": 3, "sorting": "desc", "orderBy": "filename"})
    listing = _request_json(
        f"{API_ROOT}/datasets/{DATASET}/versions/{DATASET_VERSION}/files?{query}",
        api_key,
        timeout_seconds,
    )
    files = listing.get("files")
    if not isinstance(files, list) or not files:
        raise RuntimeError("KNMI-bestandslijst is leeg")
    newest = cast(dict[str, Any], files[0])
    filename = newest.get("filename")
    if not isinstance(filename, str):
        raise RuntimeError("KNMI-bestandslijst mist filename")
    url_data = _request_json(
        f"{API_ROOT}/datasets/{DATASET}/versions/{DATASET_VERSION}/files/{urllib.parse.quote(filename)}/url",
        api_key,
        timeout_seconds,
    )
    download_url = url_data.get("temporaryDownloadUrl")
    if not isinstance(download_url, str):
        raise RuntimeError("KNMI-downloadantwoord mist temporaryDownloadUrl")

    with tempfile.NamedTemporaryFile(suffix=".nc") as netcdf:
        request = urllib.request.Request(download_url, headers={"User-Agent": "motregen-skywatch/0.1"})
        with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
            netcdf.write(response.read())
            netcdf.flush()
        return parse_observation(Path(netcdf.name), filename, h5dump)


def parse_observation(path: Path, filename: str, h5dump: str) -> Observation:
    stations = parse_h5dump_values(_dump(h5dump, path, "station"))
    try:
        station_index = stations.index(STATION)
    except ValueError as error:
        raise RuntimeError(f"Station {STATION} ontbreekt in {filename}") from error

    time_value = _numeric_value(_dump(h5dump, path, "time", start="0", count="1"))
    if time_value is None:
        raise RuntimeError(f"Tijd ontbreekt in {filename}")
    at = datetime(1950, 1, 1, tzinfo=UTC) + timedelta(seconds=time_value)
    values = {
        key: _numeric_value(_dump(h5dump, path, variable, start=f"{station_index},0", count="1,1"))
        for key, variable in VARIABLES.items()
    }
    return Observation(filename=filename, at=at, **values)


def parse_h5dump_values(output: str) -> list[str]:
    matches = re.findall(r"\bDATA\s*\{\s*(.*?)\s*\}", output, flags=re.DOTALL)
    if not matches:
        raise ValueError("h5dump-uitvoer bevat geen DATA-blok")
    content = matches[-1].strip()
    if not content:
        return []
    return [value.strip() for value in next(csv.reader([content.replace("\n", " ")], skipinitialspace=True))]


def _numeric_value(output: str) -> float | None:
    values = parse_h5dump_values(output)
    if len(values) != 1:
        raise ValueError(f"Eén h5dump-waarde verwacht, kreeg {len(values)}")
    if values[0].lower() == "nan":
        return None
    value = float(values[0])
    return value if math.isfinite(value) else None


def _dump(h5dump: str, path: Path, dataset: str, *, start: str | None = None, count: str | None = None) -> str:
    command = [h5dump, "-A", "0", "-y", "-w", "0", "-m", "%.17g", "-d", f"/{dataset}"]
    if start is not None:
        command.extend(["-s", start])
    if count is not None:
        command.extend(["-c", count])
    command.append(str(path))
    result = subprocess.run(command, check=True, capture_output=True, text=True, timeout=20)
    return result.stdout


def _request_json(url: str, api_key: str, timeout_seconds: float) -> dict[str, Any]:
    request = urllib.request.Request(
        url,
        headers={"Authorization": api_key, "User-Agent": "motregen-skywatch/0.1"},
    )
    with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
        value = json.load(response)
    if not isinstance(value, dict):
        raise RuntimeError("KNMI-antwoord is geen JSON-object")
    return cast(dict[str, Any], value)
