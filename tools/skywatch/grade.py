from __future__ import annotations

import argparse
import base64
import csv
import fcntl
import json
import math
import mimetypes
import os
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
from datetime import UTC, datetime
from pathlib import Path
from typing import cast

from skywatch.solar import solar_elevation_sine

MODEL = "gpt-6-luna"
API_URL = "https://api.openai.com/v1/decisions"
DE_BILT_LATITUDE = 52.10
DE_BILT_LONGITUDE = 5.18
SKY_CLASSES = ("strakblauw", "mooie wolkenlucht", "melkachtig", "grijs", "Mordor")
QUESTIONS: list[dict[str, object]] = [
    {
        "type": "choice",
        "name": "klasse",
        "instructions": "Kies de klasse die deze lucht als geheel het best beschrijft.",
        "choices": [
            {"value": "strakblauw", "description": "Vrijwel wolkenloze, helderblauwe lucht."},
            {"value": "mooie wolkenlucht", "description": "Aantrekkelijke losse wolken met zichtbaar blauw en contrast."},
            {"value": "melkachtig", "description": "Hoge, doorschijnende bewolking maakt de lucht wit of diffuus."},
            {"value": "grijs", "description": "Overwegend egale grijze bewolking."},
            {"value": "Mordor", "description": "Zeer donker, dreigend en zwaar gesloten wolkendek."},
        ],
    },
    {
        "type": "score",
        "name": "prettigheid",
        "instructions": "Hoe mooi of prettig is deze lucht om buiten te zijn? Geef een score van 0 tot en met 10.",
        "levels": [
            {"label": str(score), "description": description}
            for score, description in enumerate(
                (
                    "uiterst onaangenaam",
                    "zeer onaangenaam",
                    "onaangenaam",
                    "eerder onaangenaam",
                    "licht onaangenaam",
                    "neutraal",
                    "licht prettig",
                    "prettig",
                    "erg prettig",
                    "zeer mooi en prettig",
                    "uitzonderlijk mooie lucht",
                )
            )
        ],
    },
    {
        "type": "predicate",
        "name": "zon_zichtbaar",
        "instructions": "Is de zonneschijf zichtbaar in of door deze lucht?",
    },
]


def _arguments() -> argparse.Namespace:
    root = Path(__file__).resolve().parents[2]
    parser = argparse.ArgumentParser(description="Gradeer webcam en wolkendoorsnede met de OpenAI Decisions API")
    parser.add_argument("--csv", type=Path, default=root / "tools/skywatch/data/samples.csv")
    parser.add_argument("--grades", type=Path, default=root / "tools/skywatch/data/grades.jsonl")
    parser.add_argument("--home", type=Path, default=Path(os.environ.get("SKYWATCH_HOME", "~/skywatch")).expanduser())
    parser.add_argument("--renders", type=Path, default=root / "tools/skywatch/data/renders")
    parser.add_argument("--limit", type=int, default=10)
    parser.add_argument("--require", type=int, default=0, help="Stop vóór API-calls als minder nieuwe beelden beschikbaar zijn")
    parser.add_argument("--sample", action="append", default=[])
    return parser.parse_args()


def main() -> None:
    arguments = _arguments()
    rows = select_rows(arguments.csv, arguments.grades, arguments.home, arguments.limit, set(arguments.sample))
    if len(rows) < arguments.require:
        raise RuntimeError(f"Slechts {len(rows)} nieuwe daglichtbeelden beschikbaar; vereist {arguments.require}")
    if not rows:
        print("Geen nieuwe daglichtbeelden om te graden")
        return
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY ontbreekt")
    renders = render_graphs(rows, arguments.renders)
    completed = {
        (str(record.get("sample_id")), str(record.get("source")))
        for record in read_jsonl(arguments.grades)
    }
    total_cost = 0.0
    requests = 0
    started = time.perf_counter()
    for row in rows:
        sample_id = row["sample_id"]
        inputs = (
            (
                "webcam",
                arguments.home / row["webcam_path"],
                "Beoordeel de werkelijke hemel op deze webcamfoto in De Bilt. Negeer gebouwen, terrein en eventuele camera-artefacten.",
            ),
            (
                "grafiek",
                renders[sample_id],
                "Stel je de hemel voor die deze grafiek beschrijft en beoordeel die denkbeeldige lucht. De drie banen tonen hoge, midden- en lage wolken gedurende drie uur.",
            ),
        )
        for source, image_path, instruction in inputs:
            if (sample_id, source) in completed:
                continue
            result = decide(api_key, image_path, instruction)
            record = grade_record(sample_id, source, image_path, instruction, result)
            append_jsonl(arguments.grades, record)
            completed.add((sample_id, source))
            requests += 1
            cost = cast(float, record["estimated_cost_usd"])
            total_cost += cost
            print(json.dumps({"sample_id": sample_id, "source": source, "latency_ms": record["latency_ms"], "estimated_cost_usd": cost, "answers": result["answers"]}, ensure_ascii=False))
    elapsed = time.perf_counter() - started
    print(json.dumps({"graded_images": len(rows), "requests": requests, "latency_seconds": round(elapsed, 3), "estimated_cost_usd": round(total_cost, 8)}))


def select_rows(csv_path: Path, grades_path: Path, home: Path, limit: int, requested: set[str]) -> list[dict[str, str]]:
    completed = {
        (str(record.get("sample_id")), str(record.get("source")))
        for record in read_jsonl(grades_path)
    }
    seen_images: set[str] = set()
    selected: list[dict[str, str]] = []
    with csv_path.open(encoding="utf-8", newline="") as source:
        for row in csv.DictReader(source):
            if requested and row["sample_id"] not in requested:
                continue
            if row["webcam_changed"] != "true" or row["webcam_sha256"] in seen_images:
                continue
            seen_images.add(row["webcam_sha256"])
            at = datetime.fromisoformat(row["polled_at"].replace("Z", "+00:00"))
            if solar_elevation_sine(at, DE_BILT_LONGITUDE, DE_BILT_LATITUDE) <= math.sin(math.radians(5)):
                continue
            if not (home / row["webcam_path"]).is_file():
                continue
            if all((row["sample_id"], source_name) in completed for source_name in ("webcam", "grafiek")):
                continue
            selected.append(row)
            if len(selected) >= limit:
                break
    return selected


def render_graphs(rows: list[dict[str, str]], output_dir: Path) -> dict[str, Path]:
    root = Path(__file__).resolve().parents[2]
    pnpm = os.environ.get("SKYWATCH_PNPM") or shutil.which("pnpm")
    if not pnpm:
        raise RuntimeError("pnpm ontbreekt")
    command = [pnpm, "--dir", str(root / "web"), "exec", "tsx", str(root / "tools/skywatch/render.ts"), "--output-dir", str(output_dir)]
    for row in rows:
        command.extend(["--sample", row["sample_id"]])
    result = subprocess.run(command, check=True, capture_output=True, text=True, timeout=180)
    rendered = cast(object, json.loads(result.stdout))
    if not isinstance(rendered, list):
        raise RuntimeError("Renderuitvoer is geen lijst")
    mapping: dict[str, Path] = {}
    for item in cast(list[object], rendered):
        if not isinstance(item, dict):
            raise RuntimeError("Renderuitvoer bevat geen object")
        record = cast(dict[str, object], item)
        if not isinstance(record.get("sampleId"), str) or not isinstance(record.get("path"), str):
            raise RuntimeError("Renderuitvoer mist sampleId/path")
        mapping[cast(str, record["sampleId"])] = Path(cast(str, record["path"]))
    if set(mapping) != {row["sample_id"] for row in rows}:
        raise RuntimeError("Niet alle grafieken zijn gerenderd")
    return mapping


def decide(api_key: str, image_path: Path, instruction: str) -> dict[str, object]:
    mime = mimetypes.guess_type(image_path.name)[0] or "application/octet-stream"
    image_url = f"data:{mime};base64,{base64.b64encode(image_path.read_bytes()).decode()}"
    payload = {
        "model": MODEL,
        "input": [{
            "type": "message",
            "role": "user",
            "content": [
                {"type": "input_text", "text": instruction},
                {"type": "input_image", "image_url": image_url, "detail": "high"},
            ],
        }],
        "questions": QUESTIONS,
        "safety_identifier": "motregen-skywatch",
    }
    request = urllib.request.Request(
        API_URL,
        data=json.dumps(payload).encode(),
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json", "User-Agent": "motregen-skywatch/0.1"},
        method="POST",
    )
    started = time.perf_counter()
    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            decoded = cast(object, json.load(response))
    except urllib.error.HTTPError as error:
        detail = error.read(4_096).decode(errors="replace")
        raise RuntimeError(f"Decisions API HTTP {error.code}: {detail}") from error
    latency_ms = round((time.perf_counter() - started) * 1_000, 1)
    if not isinstance(decoded, dict):
        raise RuntimeError("Decisions API gaf geen JSON-object")
    result = cast(dict[str, object], decoded)
    result["_latency_ms"] = latency_ms
    validate_answers(result)
    return result


def validate_answers(result: dict[str, object]) -> None:
    decoded = result.get("answers")
    if not isinstance(decoded, list):
        raise RuntimeError("Decisions API gaf geen antwoordenlijst")
    answers = cast(list[object], decoded)
    if len(answers) != 3:
        raise RuntimeError("Decisions API gaf niet drie antwoorden")
    by_name: dict[str, dict[str, object]] = {}
    for answer in answers:
        if not isinstance(answer, dict):
            continue
        typed = cast(dict[str, object], answer)
        name = typed.get("name")
        if isinstance(name, str):
            by_name[name] = typed
    if set(by_name) != {"klasse", "prettigheid", "zon_zichtbaar"}:
        raise RuntimeError("Decisions API gaf onverwachte vraagnamen")
    if any(answer.get("type") == "refusal" for answer in by_name.values()):
        raise RuntimeError("Decisions API weigerde minstens één vraag")
    if by_name["klasse"].get("type") != "choice" or by_name["klasse"].get("choice") not in SKY_CLASSES:
        raise RuntimeError("Decisions API gaf een ongeldige luchtklasse")
    score = by_name["prettigheid"].get("score")
    if by_name["prettigheid"].get("type") != "score" or not isinstance(score, (int, float)) or not 0 <= score <= 10:
        raise RuntimeError("Decisions API gaf een ongeldige prettigheidsscore")
    probability = by_name["zon_zichtbaar"].get("probability")
    if by_name["zon_zichtbaar"].get("type") != "predicate" or not isinstance(probability, (int, float)) or not 0 <= probability <= 1:
        raise RuntimeError("Decisions API gaf een ongeldige zonkans")


def grade_record(sample_id: str, source: str, image_path: Path, instruction: str, result: dict[str, object]) -> dict[str, object]:
    answers: dict[str, dict[str, object]] = {}
    for answer in cast(list[object], result["answers"]):
        typed = cast(dict[str, object], answer)
        answers[cast(str, typed["name"])] = typed
    usage_value = result.get("usage", {})
    usage = cast(dict[str, object], usage_value) if isinstance(usage_value, dict) else {}
    probability = float(cast(float | int | str, answers["zon_zichtbaar"]["probability"]))
    return {
        "sample_id": sample_id,
        "source": source,
        "image_path": str(image_path),
        "graded_at": datetime.now(UTC).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "model": result.get("model", MODEL),
        "instruction": instruction,
        "klasse": answers["klasse"]["choice"],
        "score": answers["prettigheid"]["score"],
        "zon_zichtbaar": probability >= 0.5,
        "zon_zichtbaar_probability": probability,
        "latency_ms": result["_latency_ms"],
        "estimated_cost_usd": estimate_cost(usage),
        "usage": usage,
        "raw_response": {key: value for key, value in result.items() if key != "_latency_ms"},
    }


def estimate_cost(usage: dict[str, object]) -> float:
    input_tokens = int(cast(int | float | str, usage.get("input_tokens", 0)))
    output_tokens = int(cast(int | float | str, usage.get("output_tokens", 0)))
    details_value = usage.get("input_tokens_details", {})
    details = cast(dict[str, object], details_value) if isinstance(details_value, dict) else {}
    cached = int(cast(int | float | str, details.get("cached_tokens", 0)))
    cache_write = int(cast(int | float | str, details.get("cache_write_tokens", 0)))
    uncached = max(0, input_tokens - cached - cache_write)
    return round((uncached * 0.10 + cached * 0.01 + cache_write * 0.125 + output_tokens * 0.50) / 1_000_000, 10)


def read_jsonl(path: Path) -> list[dict[str, object]]:
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except FileNotFoundError:
        return []
    records: list[dict[str, object]] = []
    for line in lines:
        if not line.strip():
            continue
        decoded = cast(object, json.loads(line))
        if isinstance(decoded, dict):
            records.append(cast(dict[str, object], decoded))
    return records


def append_jsonl(path: Path, record: dict[str, object]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as output:
        fcntl.flock(output, fcntl.LOCK_EX)
        output.write(json.dumps(record, ensure_ascii=False, separators=(",", ":")) + "\n")
        output.flush()
        os.fsync(output.fileno())


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"Grading mislukt: {error}", file=sys.stderr)
        raise SystemExit(1) from None
