"""HARMONIE-AROME P1-velden voor zonneschijn op de KNMI-stations halen uit het Open Data-archief.

Per run (standaard 00 UTC op iedere n-de dag) worden alleen de benodigde GRIB-berichten met HTTP Range uit
de tar gelezen: globale straling (253/117, geaccumuleerd) en bewolking totaal/laag/middel/hoog
(253/71, 73, 74, 75, instant), standaard voor leads 3…21. Per station bewaren we de dichtstbijzijnde cel en
het gemiddelde over een blok dat ruwweg het app-raster nabootst (straling 8 km, bewolking 16 km).

Gebruik: fetch_harmonie.py <eerste dag> <laatste dag> [--step 2] [--run-hours 0] [--leads 3-21] [--out harmonie]
Sleutel: KNMI_OPEN_DATA_API_KEY uit de omgeving of uit ../../.env, ../../../motregen/.env.
Schrijft data/<out>/<run>.csv.
"""

import argparse
import csv
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta
from pathlib import Path

import eccodes
import numpy as np
import requests

API = "https://api.dataplatform.knmi.nl/open-data/v1/datasets/harmonie_arome_cy43_p1/versions/1.0/files"
HERE = Path(__file__).parent
DATA = HERE / "data"
WANTED = {
    (117, 4): "radiation_acc",
    (71, 0): "cloud_total",
    (73, 0): "cloud_low",
    (74, 0): "cloud_mid",
    (75, 0): "cloud_high",
}
# Halve blokbreedte in rastercellen (0,018° breedte ≈ 2,0 km, 0,029° lengte ≈ 2,0 km op 52° N).
RADIATION_HALF_BLOCK = 2
CLOUD_HALF_BLOCK = 4


def api_key() -> str:
    if key := os.environ.get("KNMI_OPEN_DATA_API_KEY"):
        return key
    for candidate in [HERE / "../../.env", Path.home() / "motregen/.env"]:
        if candidate.exists():
            for line in candidate.read_text().splitlines():
                if line.startswith("KNMI_OPEN_DATA_API_KEY="):
                    return line.split("=", 1)[1].strip().strip('"')
    raise SystemExit("KNMI_OPEN_DATA_API_KEY ontbreekt")


def load_stations() -> list[dict[str, float]]:
    with open(DATA / "stations.csv") as handle:
        return [
            {"station": int(row["station"]), "lon": float(row["lon"]), "lat": float(row["lat"])}
            for row in csv.DictReader(handle)
        ]


class RangeReader:
    def __init__(self, session: requests.Session, url: str):
        self.session = session
        self.url = url

    def read(self, offset: int, length: int) -> bytes:
        for attempt in range(5):
            try:
                response = self.session.get(
                    self.url, headers={"Range": f"bytes={offset}-{offset + length - 1}"}, timeout=60
                )
                if response.status_code == 206:
                    return response.content
            except requests.RequestException:
                pass
            time.sleep(2 * (attempt + 1))
        raise RuntimeError(f"range {offset}+{length} mislukt")


def octal(field: bytes) -> int:
    return int(field.rstrip(b"\0 ").decode() or "0", 8)


def tar_members(reader: RangeReader, wanted_names: set[str]) -> dict[str, tuple[int, int]]:
    """Naam → (data-offset, grootte) voor de gevraagde leden; leest per lid één probe."""
    found: dict[str, tuple[int, int]] = {}
    offset = 0
    while len(found) < len(wanted_names):
        probe = reader.read(offset, 1536)
        header = probe[:512]
        if header == b"\0" * 512:
            break
        if header[156:157] == b"x":
            pax_size = octal(header[124:136])
            pax_blocks = (pax_size + 511) // 512
            real_offset = offset + 512 + pax_blocks * 512
            header = probe[512 + pax_blocks * 512 : 1024 + pax_blocks * 512]
            if len(header) < 512:
                header = reader.read(real_offset, 512)
        else:
            real_offset = offset
        name = header[:100].rstrip(b"\0").decode()
        size = octal(header[124:136])
        data_offset = real_offset + 512
        if name in wanted_names:
            found[name] = (data_offset, size)
        offset = data_offset + (size + 511) // 512 * 512
    return found


def grib_messages(reader: RangeReader, start: int, size: int) -> dict[str, bytes]:
    """Loopt de GRIB1-berichten van één lid af op hun koppen en haalt alleen de gezochte op."""
    messages: dict[str, bytes] = {}
    offset = start
    while offset < start + size and len(messages) < len(WANTED):
        head = reader.read(offset, 32)
        if head[:4] != b"GRIB":
            break
        length = int.from_bytes(head[4:7], "big")
        parameter = head[16]
        level_type = head[17]
        time_range = head[28]
        key = WANTED.get((parameter, time_range))
        if key and level_type == 105 and key not in messages:
            messages[key] = reader.read(offset, length)
        offset += length
    return messages


def decode(message: bytes) -> tuple[np.ndarray, dict[str, float]]:
    handle = eccodes.codes_new_from_message(message)
    try:
        grid = {
            name: eccodes.codes_get(handle, name)
            for name in [
                "Ni", "Nj", "latitudeOfFirstGridPointInDegrees", "longitudeOfFirstGridPointInDegrees",
                "iDirectionIncrementInDegrees", "jDirectionIncrementInDegrees", "jScansPositively",
            ]
        }
        values = eccodes.codes_get_values(handle).reshape(grid["Nj"], grid["Ni"])
    finally:
        eccodes.codes_release(handle)
    if not grid["jScansPositively"]:
        raise RuntimeError("onverwachte scanrichting")
    return values, grid


def sample(values: np.ndarray, grid: dict[str, float], lat: float, lon: float, half_block: int) -> tuple[float, float]:
    row = round((lat - grid["latitudeOfFirstGridPointInDegrees"]) / grid["jDirectionIncrementInDegrees"])
    column = round((lon - grid["longitudeOfFirstGridPointInDegrees"]) / grid["iDirectionIncrementInDegrees"])
    block = values[row - half_block : row + half_block + 1, column - half_block : column + half_block + 1]
    return float(values[row, column]), float(block.mean())


def download_url(session: requests.Session, key: str, filename: str) -> str:
    for attempt in range(5):
        response = session.get(f"{API}/{filename}/url", headers={"Authorization": key}, timeout=60)
        if response.ok:
            return response.json()["temporaryDownloadUrl"]
        if response.status_code == 404:
            raise FileNotFoundError(filename)
        time.sleep(10 * (attempt + 1))
    response.raise_for_status()
    return ""


def fetch_run(run: str, leads: range, out: Path, key: str, stations: list[dict[str, float]]) -> str:
    target = out / f"{run}.csv"
    if target.exists():
        return f"{run}: al aanwezig"
    session = requests.Session()
    try:
        reader = RangeReader(session, download_url(session, key, f"HARM43_V1_P1_{run}.tar"))
    except FileNotFoundError:
        return f"{run}: niet in archief"
    names = {f"HA43_N20_{run}00_{lead:03d}00_GB": lead for lead in leads}
    members = tar_members(reader, set(names))
    rows = []
    for name, (start, size) in sorted(members.items(), key=lambda item: names[item[0]]):
        lead = names[name]
        fields = {}
        for field, message in grib_messages(reader, start, size).items():
            fields[field] = decode(message)
        if len(fields) < len(WANTED):
            raise RuntimeError(f"{name}: velden ontbreken ({sorted(fields)})")
        for station in stations:
            row = [run, lead, station["station"]]
            for field in WANTED.values():
                values, grid = fields[field]
                half_block = RADIATION_HALF_BLOCK if field == "radiation_acc" else CLOUD_HALF_BLOCK
                point, block = sample(values, grid, station["lat"], station["lon"], half_block)
                row += [f"{point:.6g}", f"{block:.6g}"]
            rows.append(row)
    if len(members) < len(names):
        return f"{run}: maar {len(members)} van {len(names)} leden gevonden, overgeslagen"
    header = ["run", "lead", "station"]
    for field in WANTED.values():
        header += [f"{field}_point", f"{field}_block"]
    temporary = target.with_suffix(".tmp")
    with open(temporary, "w", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(header)
        writer.writerows(rows)
    temporary.rename(target)
    return f"{run}: {len(rows)} rijen"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("first", type=date.fromisoformat)
    parser.add_argument("last", type=date.fromisoformat)
    parser.add_argument("--step", type=int, default=2)
    parser.add_argument("--run-hours", default="0", help="komma-gescheiden UTC-uren")
    parser.add_argument("--leads", default="3-21", help="eerste-laatste lead")
    parser.add_argument("--out", default="harmonie")
    arguments = parser.parse_args()
    first_lead, last_lead = (int(part) for part in arguments.leads.split("-"))
    leads = range(first_lead, last_lead + 1)
    run_hours = [int(hour) for hour in arguments.run_hours.split(",")]
    out = DATA / arguments.out
    out.mkdir(parents=True, exist_ok=True)
    key = api_key()
    stations = load_stations()
    days = [
        arguments.first + timedelta(days=offset)
        for offset in range(0, (arguments.last - arguments.first).days + 1, arguments.step)
    ]
    runs = [day.strftime("%Y%m%d") + f"{hour:02d}" for day in days for hour in run_hours]
    failures = 0
    with ThreadPoolExecutor(max_workers=6) as pool:
        futures = [pool.submit(fetch_run, run, leads, out, key, stations) for run in runs]
        for future in futures:
            try:
                print(future.result(), flush=True)
            except Exception as error:
                failures += 1
                print(f"FOUT: {error!r}", flush=True)
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
