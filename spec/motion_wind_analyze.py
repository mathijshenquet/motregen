"""Independent full-resolution block displacement and held-out prior comparisons.

Run with: uv run --project spec spec/motion_wind_analyze.py EXPORT OUTPUT
"""

from __future__ import annotations

import argparse
import json
import math
import re
from pathlib import Path

import cv2
import matplotlib
import numpy as np
from scipy.ndimage import convolve

matplotlib.use("Agg")
from matplotlib import pyplot as plt
from matplotlib.axes import Axes
from matplotlib.colors import LogNorm

BLOCK = 32


def vectors(values: list, components: int = 2) -> np.ndarray:
    return np.asarray(
        [value if value is not None else [np.nan] * components for value in values],
        dtype=float,
    )


def rotation_fit(
    correlation: np.ndarray,
    wind: np.ndarray,
    method: str = "ls",
    remove_zero: bool = False,
) -> tuple[complex, dict]:
    observed = correlation[..., 0] + 1j * correlation[..., 1]
    predicted = wind[..., 0] + 1j * wind[..., 1]
    confidence = correlation[..., 2]
    usable = (confidence >= 0.75) & np.isfinite(predicted) & (np.abs(predicted) > 0.01)
    if remove_zero:
        usable &= np.abs(observed) >= 0.1
    observed, predicted, confidence = (
        observed[usable],
        predicted[usable],
        confidence[usable],
    )
    if len(observed) < 12:
        return 1 + 0j, {"samples": len(observed), "fallback": True}
    weights = confidence.copy()
    factor = complex(
        np.sum(weights * observed * np.conjugate(predicted))
        / np.sum(weights * np.abs(predicted) ** 2)
    )
    if method == "median":
        ratios = observed / predicted
        factor = complex(np.median(ratios.real), np.median(ratios.imag))
    if method == "huber":
        for _ in range(20):
            residual = np.abs(observed - factor * predicted)
            weights = confidence * np.minimum(1, 0.3 / np.maximum(residual, 1e-9))
            factor = complex(
                np.sum(weights * observed * np.conjugate(predicted))
                / np.sum(weights * np.abs(predicted) ** 2)
            )
    raw_scale, raw_angle = abs(factor), np.degrees(np.angle(factor))
    angle = raw_angle if method == "wide" else np.clip(raw_angle, -60, 60)
    scale = raw_scale
    if method == "constrained":
        scale *= np.cos(np.radians(raw_angle - angle))
    bounded = np.clip(scale, 0.5, 2.5) * np.exp(1j * np.radians(angle))
    moving = np.abs(observed) >= 0.1
    angles = np.degrees(np.angle(observed[moving] / predicted[moving]))
    residual = np.abs(observed - bounded * predicted) * 5
    leverage = confidence * np.abs(predicted) ** 2
    sorted_leverage = np.sort(leverage)[::-1]
    top_count = max(1, math.ceil(len(leverage) / 10))
    return bounded, {
        "samples": len(observed),
        "fallback": False,
        "scale": abs(bounded),
        "degrees": float(np.degrees(np.angle(bounded))),
        "raw_scale": raw_scale,
        "raw_degrees": raw_angle,
        "angle_p10_p50_p90": np.percentile(angles, [10, 50, 90]).tolist()
        if len(angles)
        else [],
        "zero_fraction": float(np.mean(~moving)),
        "residual_median": float(np.median(residual)),
        "top10_leverage": float(np.sum(sorted_leverage[:top_count]) / np.sum(leverage)),
        "effective_samples": float(np.sum(leverage) ** 2 / np.sum(leverage**2)),
    }


def smooth(field: np.ndarray, shape: tuple[int, int]) -> np.ndarray:
    field = field.reshape(*shape, 2)
    valid = np.isfinite(field).all(axis=2)
    counts = convolve(valid.astype(float), np.ones((3, 3)), mode="constant")
    result = np.full_like(field, np.nan)
    for component in range(2):
        totals = convolve(
            np.nan_to_num(field[..., component]), np.ones((3, 3)), mode="constant"
        )
        np.divide(totals, counts, out=result[..., component], where=counts > 0)
    result[~valid] = np.nan
    return result.reshape(-1, 2)


def quantize(field: np.ndarray) -> np.ndarray:
    # Rust f32::round rounds half away from zero.
    return (
        np.clip(np.copysign(np.floor(np.abs(field) * 10 + 0.500001), field), -127, 127)
        / 10
    )


def blend(
    correlation: np.ndarray,
    prior: np.ndarray,
    shape: tuple[int, int],
    preserve: bool = False,
) -> np.ndarray:
    confidence = correlation[:, 2]
    found = np.isfinite(confidence)
    strong = found & (confidence >= 0.75)
    result = prior.copy()
    result[found] = (
        confidence[found, None] * correlation[found, :2]
        + (1 - confidence[found, None]) * prior[found]
    )
    result[strong] = correlation[strong, :2]
    result = smooth(result, shape)
    if preserve:
        result[strong] = correlation[strong, :2]
    return quantize(result)


def apply_factor(wind: np.ndarray, factor: complex) -> np.ndarray:
    transformed = (wind[:, 0] + 1j * wind[:, 1]) * factor
    return np.column_stack((transformed.real, transformed.imag))


def match_patch(
    before: np.ndarray, after: np.ndarray, column: int, row: int, reach: int
) -> tuple[np.ndarray, float, float] | None:
    height, width = before.shape
    end_column, end_row = min(column + BLOCK, width), min(row + BLOCK, height)
    if (
        row < reach
        or column < reach
        or end_row + reach > height
        or end_column + reach > width
    ):
        return None
    template = before[row:end_row, column:end_column]
    if not np.isfinite(template).all() or np.std(template) < 0.001:
        return None
    search = after[row - reach : end_row + reach, column - reach : end_column + reach]
    scores = cv2.matchTemplate(np.nan_to_num(search), template, cv2.TM_CCOEFF_NORMED)
    _, best_score, _, location = cv2.minMaxLoc(scores)
    best_column, best_row = location
    if best_column in (0, 2 * reach) or best_row in (0, 2 * reach):
        return None
    matched = search[
        best_row : best_row + template.shape[0],
        best_column : best_column + template.shape[1],
    ]
    if not np.isfinite(matched).all():
        return None
    scores[
        max(0, best_row - 1) : best_row + 2, max(0, best_column - 1) : best_column + 2
    ] = -1
    gap = float(best_score - np.max(scores))
    return (
        np.array([best_column - reach, best_row - reach], dtype=float),
        best_score,
        gap,
    )


def reference(
    before: np.ndarray,
    after: np.ndarray,
    minutes: float,
    shape: tuple[int, int],
    hourly_reach: int = 150,
) -> dict:
    reach = max(24, math.ceil(minutes * hourly_reach / 60))
    before_log = np.log1p(before).astype(np.float32)
    after_log = np.log1p(after).astype(np.float32)
    count = shape[0] * shape[1]
    displacement = np.full((count, 2), np.nan)
    scores = np.full(count, np.nan)
    visible = np.zeros(count, dtype=bool)
    fractions = np.zeros(count)
    for block_index in range(count):
        row = (block_index // shape[1]) * BLOCK
        column = (block_index % shape[1]) * BLOCK
        patch = before[row : row + BLOCK, column : column + BLOCK]
        rainy = patch > 0
        visible[block_index] = np.count_nonzero(rainy) >= 4
        fractions[block_index] = np.mean(rainy)
        if not visible[block_index]:
            continue
        match = match_patch(before_log, after_log, column, row, reach)
        if match is None:
            continue
        shift, score, gap = match
        if score < 0.7 or gap < 0.005:
            continue
        reverse = match_patch(
            after_log, before_log, column + int(shift[0]), row + int(shift[1]), reach
        )
        if reverse is None or np.linalg.norm(reverse[0] + shift) > 2:
            continue
        displacement[block_index] = shift / minutes
        scores[block_index] = score
    return {
        "velocity": displacement,
        "score": scores,
        "visible": visible,
        "rain_fraction": fractions,
    }


def metrics(prediction: np.ndarray, truth: np.ndarray, mask: np.ndarray) -> dict:
    available = np.isfinite(prediction).all(axis=1) & mask
    errors = np.linalg.norm(prediction[available] - truth[available], axis=1) * 5
    return {
        "count": len(errors),
        "coverage": float(np.count_nonzero(available) / max(1, np.count_nonzero(mask))),
        "median": float(np.median(errors)) if len(errors) else None,
        "p90": float(np.percentile(errors, 90)) if len(errors) else None,
        "mean": float(np.mean(errors)) if len(errors) else None,
    }


def analyze_dataset(
    directory: Path, output: Path, axis: Axes, hourly_reach: int = 150
) -> dict:
    audit = json.loads((directory / "audit.json").read_text())
    width, height = audit["grid"]["width"], audit["grid"]["height"]
    shape = (math.ceil(height / BLOCK), math.ceil(width / BLOCK))
    correlations = np.asarray(
        [vectors(pair["correlation"], 3) for pair in audit["pairs"]]
    )
    high_winds = np.asarray([vectors(pair["wind300"]) for pair in audit["pairs"]])
    low_winds = np.asarray([vectors(pair["wind10"]) for pair in audit["pairs"]])
    train = np.arange(len(correlations)) % 2 == 0
    factors, diagnostics = {}, {}
    for name, method, remove_zero, wind in [
        ("ls300", "ls", False, high_winds),
        ("ls10", "ls", False, low_winds),
        ("huber300", "huber", False, high_winds),
        ("median300", "median", False, high_winds),
        ("moving_ls300", "ls", True, high_winds),
        ("wide300", "wide", False, high_winds),
        ("constrained300", "constrained", False, high_winds),
    ]:
        factors[name], diagnostics[name] = rotation_fit(
            correlations[train], wind[train], method, remove_zero
        )
    full_factor, full_diagnostics = rotation_fit(correlations, high_winds)
    assert abs(abs(full_factor) - audit["native_fit"]["scale"]) < 1e-4
    assert (
        abs(np.degrees(np.angle(full_factor)) - audit["native_fit"]["degrees"]) < 1e-3
    )
    pair_fits = [
        rotation_fit(correlations[index : index + 1], high_winds[index : index + 1])[1]
        for index in range(len(correlations))
    ]
    block_weights = np.nansum(
        np.where(
            correlations[..., 2] >= 0.75,
            correlations[..., 2] * np.sum(high_winds**2, axis=2),
            0,
        ),
        axis=0,
    )
    top_blocks = np.argsort(block_weights)[-5:]
    trimmed_correlation = correlations.copy()
    trimmed_correlation[:, top_blocks] = np.nan
    _, trimmed_fit = rotation_fit(trimmed_correlation, high_winds)
    edge_correlation = correlations.copy().reshape(len(correlations), *shape, 3)
    edge_correlation[:, :2] = np.nan
    edge_correlation[:, -2:] = np.nan
    edge_correlation[:, :, :2] = np.nan
    edge_correlation[:, :, -2:] = np.nan
    _, interior_fit = rotation_fit(
        edge_correlation.reshape(correlations.shape), high_winds
    )
    regional_factors = []
    regional_diagnostics = []
    block_rows, block_columns = np.indices(shape)
    for region in range(4):
        mask = (
            (block_rows >= shape[0] // 2) * 2 + (block_columns >= shape[1] // 2)
        ).ravel() == region
        factor, regional_fit = rotation_fit(
            correlations[train][:, mask], high_winds[train][:, mask], "huber", True
        )
        regional_factors.append((mask, factor))
        regional_diagnostics.append(regional_fit)
    (
        pooled_truth,
        pooled_predictions,
        pooled_correlation,
        pooled_visible,
        pooled_scores,
    ) = [], {}, [], [], []
    pair_reports = []
    frames = [
        np.fromfile(directory / f"frame-{index:03}.f32", dtype="<f4").reshape(
            height, width
        )
        for index in range(len(correlations) + 1)
    ]
    display = frames[0][::4, ::4]
    axis.imshow(
        np.where(display > 0, display, np.nan),
        cmap="Blues",
        norm=LogNorm(vmin=0.01, vmax=10),
        extent=(0, width, height, 0),
    )
    axis.set_title(audit["label"] + " UTC")
    axis.set_xlabel("kolom (1 km EPSG:3857)")
    axis.set_ylabel("rij (zuidwaarts)")
    cache = output / (audit["label"] + f"-reference-v2-r{hourly_reach}.npz")
    references = dict(np.load(cache)) if cache.exists() else {}
    all_samples = correlations[..., 2] >= 0.75
    unique_blocks = int(np.count_nonzero(np.any(all_samples, axis=0)))
    for pair_index, pair in enumerate(audit["pairs"]):
        correlation, high_wind, low_wind = (
            correlations[pair_index],
            high_winds[pair_index],
            low_winds[pair_index],
        )
        if f"velocity{pair_index}" in references:
            measured = {
                name: references[f"{name}{pair_index}"]
                for name in ["velocity", "score", "visible", "rain_fraction"]
            }
        else:
            measured = reference(
                frames[pair_index],
                frames[pair_index + 1],
                pair["minutes"],
                shape,
                hourly_reach,
            )
            references.update(
                {f"{name}{pair_index}": value for name, value in measured.items()}
            )
        candidates = correlation[correlation[:, 2] >= 0.75, :2]
        if len(candidates) == 0:
            candidates = correlation[np.isfinite(correlation[:, 2]), :2]
        medians = (
            np.median(candidates, axis=0)
            if len(candidates)
            else np.array([np.nan, np.nan])
        )
        median_prior = np.tile(medians, (len(correlation), 1))
        predicted = {
            "plain": vectors(pair["plain"]),
            "native_all": vectors(pair["native_baseline"]),
            "raw300": blend(correlation, high_wind, shape),
            "raw10": blend(correlation, low_wind, shape),
            "runmedian": blend(correlation, median_prior, shape),
            "median_anchor": blend(correlation, median_prior, shape, preserve=True),
        }
        for name, factor in factors.items():
            predicted[name] = blend(
                correlation,
                apply_factor(low_wind if name == "ls10" else high_wind, factor),
                shape,
            )
        prior = high_wind.copy()
        for region_mask, region_factor in regional_factors:
            prior[region_mask] = apply_factor(high_wind[region_mask], region_factor)
        predicted["regional300"] = blend(correlation, prior, shape)
        gate = diagnostics["huber300"]
        reliable = (
            gate["samples"] >= 100
            and gate.get("residual_median", 999) <= 2.5
            and abs(gate.get("raw_degrees", 999)) < 55
        )
        predicted["gated300"] = (
            predicted["huber300"] if reliable else predicted["runmedian"]
        )
        previous_train = max(0, pair_index - 1)
        temporal_factor, _ = rotation_fit(
            correlations[previous_train : previous_train + 1],
            high_winds[previous_train : previous_train + 1],
            "huber",
            True,
        )
        predicted["temporal300"] = blend(
            correlation, apply_factor(high_wind, temporal_factor), shape
        )
        reconstructed = blend(correlation, apply_factor(high_wind, full_factor), shape)
        native = predicted["native_all"]
        native_valid = np.isfinite(native).all(axis=1)
        assert (
            np.nanmax(np.abs(reconstructed[native_valid] - native[native_valid]))
            <= 0.10001
        )
        if pair["stored"]:
            predicted["stored"] = vectors(pair["stored"])
        pair_reports.append(
            {
                "time": pair["time"],
                "visible": int(np.count_nonzero(measured["visible"])),
                "missing_correlation": int(
                    np.count_nonzero(
                        measured["visible"] & ~np.isfinite(correlation[:, 2])
                    )
                ),
                "reference": int(np.count_nonzero(np.isfinite(measured["score"]))),
            }
        )
        if not train[pair_index]:
            pooled_truth.append(measured["velocity"])
            pooled_visible.append(measured["visible"])
            pooled_scores.append(measured["score"])
            pooled_correlation.append(correlation)
            for name, prediction in predicted.items():
                pooled_predictions.setdefault(name, []).append(prediction)
        print(f"{audit['label']} pair {pair_index + 1}: {pair_reports[-1]}", flush=True)
    np.savez_compressed(cache, **references)
    truth = np.concatenate(pooled_truth)
    scores = np.concatenate(pooled_scores)
    correlation = np.concatenate(pooled_correlation)
    visible = np.concatenate(pooled_visible)
    accepted = np.isfinite(truth).all(axis=1)
    missing = ~np.isfinite(correlation[:, 2])
    strong = correlation[:, 2] >= 0.75
    common = accepted.copy()
    for parts in pooled_predictions.values():
        common &= np.isfinite(np.concatenate(parts)).all(axis=1)
    results = {}
    for name, parts in pooled_predictions.items():
        prediction = np.concatenate(parts)
        results[name] = {
            subset: metrics(prediction, truth, mask)
            for subset, mask in {
                "all": accepted,
                "common": common,
                "common_missing": common & missing,
                "missing": accepted & missing,
                "strong": accepted & strong,
                "high_score": accepted & (scores >= 0.85),
                "moving": accepted & (np.linalg.norm(truth, axis=1) >= 0.1),
            }.items()
        }
    return {
        "label": audit["label"],
        "native_fit": audit["native_fit"],
        "full_fit": full_diagnostics,
        "train_fits": diagnostics,
        "regional_fits": regional_diagnostics,
        "pair_fits": pair_fits,
        "without_top5_blocks": trimmed_fit,
        "interior_fit": interior_fit,
        "unique_strong_blocks": unique_blocks,
        "pairs": pair_reports,
        "visible": int(np.count_nonzero(visible)),
        "missing": int(np.count_nonzero(visible & missing)),
        "reference": int(np.count_nonzero(accepted)),
        "reference_missing": int(np.count_nonzero(accepted & missing)),
        "strong_zero_wrong": int(
            np.count_nonzero(
                accepted
                & strong
                & (np.linalg.norm(correlation[:, :2], axis=1) < 0.1)
                & (np.linalg.norm(truth, axis=1) >= 0.2)
            )
        ),
        "rain_coverage": float(np.mean(frames[0] > 0)),
        "rain_p95": float(np.percentile(frames[0][frames[0] > 0], 95)),
        "reference_median_velocity": np.median(truth[accepted], axis=0).tolist()
        if np.any(accepted)
        else None,
        "metrics": results,
    }


def journal_summary(path: Path) -> dict:
    entries = []
    pattern = re.compile(
        r'(2026-\d\d-\d\dT[\d:.]+Z).*source="([^"]+)".*run="([^"]+)" scale=([\d.e+-]+) rotation_degrees=([\d.e+-]+) reliable_samples=(\d+) calibration_source=(\w+)'
    )
    for line in path.read_text().splitlines():
        match = pattern.search(line)
        if match:
            stamp, source, run, scale, angle, samples, kind = match.groups()
            entries.append(
                {
                    "time": stamp,
                    "source": source,
                    "run": run,
                    "scale": float(scale),
                    "angle": float(angle),
                    "samples": int(samples),
                    "kind": kind,
                }
            )
    groups = {}
    for source in sorted({entry["source"] for entry in entries}):
        selected = [entry for entry in entries if entry["source"] == source]
        groups[source] = {
            "runs": len(selected),
            "clamped": sum(abs(entry["angle"]) >= 59.99 for entry in selected),
            "sample_p10_p50_p90": np.percentile(
                [entry["samples"] for entry in selected], [10, 50, 90]
            ).tolist(),
            "fallback": sum(entry["kind"] != "Fitted" for entry in selected),
        }
    return {"first": entries[0]["time"], "last": entries[-1]["time"], "sources": groups}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("export", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--journal", type=Path)
    parser.add_argument("--hourly-reach", type=int, default=150)
    arguments = parser.parse_args()
    arguments.output.mkdir(parents=True, exist_ok=True)
    directories = sorted(path.parent for path in arguments.export.glob("*/audit.json"))
    figure, axes = plt.subplots(
        math.ceil(len(directories) / 3),
        3,
        figsize=(12, 4 * math.ceil(len(directories) / 3)),
        squeeze=False,
    )
    results = [
        analyze_dataset(directory, arguments.output, axis, arguments.hourly_reach)
        for directory, axis in zip(directories, axes.flat)
    ]
    figure.tight_layout()
    figure.savefig(arguments.output / "rain-corpus.png", dpi=150)
    plt.close(figure)
    summary: dict[str, object] = {"datasets": results}
    if arguments.journal:
        summary["journal"] = journal_summary(arguments.journal)
    (arguments.output / "summary.json").write_text(
        json.dumps(summary, indent=2, allow_nan=False) + "\n"
    )
    methods = list(results[0]["metrics"])
    lines = [
        "| dataset | n | missing/visible | " + " | ".join(methods) + " |",
        "|---|---:|---:|" + "---:|" * len(methods),
    ]
    for result in results:
        errors = [
            format(result["metrics"][name]["all"]["median"], ".2f")
            if result["metrics"][name]["all"]["median"] is not None
            else "—"
            for name in methods
        ]
        lines.append(
            f"| {result['label']} | {result['reference']} | {result['missing']}/{result['visible']} | "
            + " | ".join(errors)
            + " |"
        )
    (arguments.output / "table.md").write_text("\n".join(lines) + "\n")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
