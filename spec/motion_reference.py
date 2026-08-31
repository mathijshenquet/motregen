#!/usr/bin/env python3
"""Compare one mrf motion annex with pySTEPS Lucas-Kanade on the same frames."""

from __future__ import annotations

import argparse
import json
import math
import struct
from datetime import datetime
from pathlib import Path
from typing import Any

import matplotlib
import numpy as np
import zstandard
from pysteps.motion.lucaskanade import dense_lucaskanade

matplotlib.use("Agg")
from matplotlib import pyplot as plt  # noqa: E402

BLOCK_SIZE = 32
NO_DATA = -128


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("chunk", type=Path)
    parser.add_argument("frame_idx", type=int)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--max-median-error", type=float, default=1.0)
    parser.add_argument("--before-chunk", type=Path)
    parser.add_argument("--before-frame-idx", type=int)
    return parser.parse_args()


def read_chunk(path: Path) -> tuple[dict[str, Any], int, bytes]:
    chunk = path.read_bytes()
    if chunk[:4] != b"mrf0" or len(chunk) < 8:
        raise ValueError("not an mrf0 chunk")
    json_len = struct.unpack_from("<I", chunk, 4)[0]
    header_len = 8 + json_len
    header = json.loads(chunk[8:header_len])
    return header, header_len, chunk


def decompress_member(
    chunk: bytes, header_len: int, member: dict[str, Any], expected_size: int
) -> bytes:
    start = header_len + int(member["offset"])
    end = start + int(member["len"])
    decoded = zstandard.ZstdDecompressor().decompress(
        chunk[start:end], max_output_size=expected_size
    )
    if len(decoded) != expected_size:
        raise ValueError(f"member decoded to {len(decoded)} bytes; expected {expected_size}")
    return decoded


def dequantize(raw: bytes, quant: list[float | None], shape: tuple[int, int]) -> np.ndarray:
    table = np.asarray([np.nan if value is None else value for value in quant], dtype=np.float32)
    return table[np.frombuffer(raw, dtype=np.uint8)].reshape(shape)


def block_reference(
    flow: np.ndarray,
    signal: np.ndarray,
    interval_minutes: float,
    bw: int,
    bh: int,
) -> tuple[np.ndarray, np.ndarray]:
    result = np.full((bh, bw, 2), np.nan, dtype=np.float32)
    has_signal = np.zeros((bh, bw), dtype=bool)
    height, width = signal.shape
    for block_y in range(bh):
        for block_x in range(bw):
            y0 = block_y * BLOCK_SIZE
            x0 = block_x * BLOCK_SIZE
            y1 = min(y0 + BLOCK_SIZE, height)
            x1 = min(x0 + BLOCK_SIZE, width)
            mask = signal[y0:y1, x0:x1]
            has_signal[block_y, block_x] = bool(mask.any())
            if not has_signal[block_y, block_x]:
                continue
            for component in range(2):
                values = flow[component, y0:y1, x0:x1][mask]
                values = values[np.isfinite(values)]
                if values.size:
                    result[block_y, block_x, component] = np.median(values) / interval_minutes
    return result, has_signal


def plot_quivers(
    rust: np.ndarray,
    reference: np.ndarray,
    valid: np.ndarray,
    output: Path,
    before: tuple[np.ndarray, np.ndarray] | None = None,
) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    y, x = np.mgrid[: rust.shape[0], : rust.shape[1]]
    columns: list[tuple[str, np.ndarray, np.ndarray]] = []
    if before is not None:
        columns.append(("Voor windprior", before[0], before[1]))
    columns.extend(
        [
            ("Na gekalibreerde windprior", rust, valid),
            ("pySTEPS Lucas-Kanade", reference, valid),
        ]
    )
    figure, axes = plt.subplots(
        1, len(columns), figsize=(7 * len(columns), 7), constrained_layout=True
    )
    axes = np.atleast_1d(axes)
    for axis, (title, vectors, vector_mask) in zip(
        axes,
        columns,
        strict=True,
    ):
        axis.quiver(
            x[vector_mask],
            y[vector_mask],
            vectors[..., 0][vector_mask],
            -vectors[..., 1][vector_mask],
            angles="xy",
            scale_units="xy",
            scale=0.25,
        )
        axis.set_title(title)
        axis.set_aspect("equal")
        axis.invert_yaxis()
        axis.set_xlabel("motion-blok x")
        axis.set_ylabel("motion-blok y")
    figure.savefig(output, dpi=150)
    plt.close(figure)


def block_any(mask: np.ndarray, bw: int, bh: int) -> np.ndarray:
    height, width = mask.shape
    result = np.zeros((bh, bw), dtype=bool)
    for block_y in range(bh):
        for block_x in range(bw):
            y0 = block_y * BLOCK_SIZE
            x0 = block_x * BLOCK_SIZE
            result[block_y, block_x] = bool(
                mask[
                    y0 : min(y0 + BLOCK_SIZE, height),
                    x0 : min(x0 + BLOCK_SIZE, width),
                ].any()
            )
    return result


def read_motion(
    path: Path, frame_idx: int
) -> tuple[dict[str, Any], np.ndarray, np.ndarray, bytes, bytes]:
    header, header_len, chunk = read_chunk(path)
    frames = header["frames"]
    motion_grid = header.get("motion_grid")
    if not 0 < frame_idx < len(frames) or motion_grid is None:
        raise ValueError("frame_idx must identify a frame with a motion annex")
    motion_member = frames[frame_idx].get("motion")
    if motion_member is None:
        raise ValueError("selected frame has no motion annex")
    grid = header["grid"]
    frame_size = int(grid["width"]) * int(grid["height"])
    previous_raw = decompress_member(
        chunk, header_len, frames[frame_idx - 1], frame_size
    )
    current_raw = decompress_member(chunk, header_len, frames[frame_idx], frame_size)
    bw, bh = int(motion_grid["bw"]), int(motion_grid["bh"])
    raw = decompress_member(chunk, header_len, motion_member, bw * bh * 2)
    encoded = np.frombuffer(raw, dtype=np.int8).reshape((bh, bw, 2))
    return header, encoded.astype(np.float32) / 10.0, encoded, previous_raw, current_raw


def main() -> None:
    args = parse_args()
    header, header_len, chunk = read_chunk(args.chunk)
    frames = header["frames"]
    if not 0 < args.frame_idx < len(frames):
        raise ValueError("frame_idx must identify a frame with a predecessor")
    current_entry = frames[args.frame_idx]
    motion_member = current_entry.get("motion")
    motion_grid = header.get("motion_grid")
    if motion_member is None or motion_grid is None:
        raise ValueError("selected frame has no motion annex")

    grid = header["grid"]
    shape = (int(grid["height"]), int(grid["width"]))
    frame_size = shape[0] * shape[1]
    quant = header["quant"]
    previous = dequantize(
        decompress_member(
            chunk, header_len, frames[args.frame_idx - 1], frame_size
        ),
        quant,
        shape,
    )
    current = dequantize(
        decompress_member(chunk, header_len, current_entry, frame_size), quant, shape
    )
    previous_time = datetime.fromisoformat(frames[args.frame_idx - 1]["time"].replace("Z", "+00:00"))
    current_time = datetime.fromisoformat(current_entry["time"].replace("Z", "+00:00"))
    interval_minutes = (current_time - previous_time).total_seconds() / 60.0
    if interval_minutes <= 0:
        raise ValueError("frame times must increase")

    finite = np.isfinite(previous) & np.isfinite(current)
    signal = finite & ((previous > 0.01) | (current > 0.01))
    pysteps_input = np.stack(
        [np.nan_to_num(previous, nan=0.0), np.nan_to_num(current, nan=0.0)]
    )
    reference_dense = np.asarray(dense_lucaskanade(pysteps_input, verbose=False))
    bw, bh = int(motion_grid["bw"]), int(motion_grid["bh"])
    reference, has_signal = block_reference(
        reference_dense, signal, interval_minutes, bw, bh
    )

    raw_motion = decompress_member(chunk, header_len, motion_member, bw * bh * 2)
    rust_raw = np.frombuffer(raw_motion, dtype=np.int8).reshape((bh, bw, 2))
    rust = rust_raw.astype(np.float32) / 10.0
    rust_valid = np.all(rust_raw != NO_DATA, axis=2)
    reference_valid = np.all(np.isfinite(reference), axis=2)
    valid = has_signal & rust_valid & reference_valid
    compared = int(valid.sum())
    if compared < 4:
        raise AssertionError(f"only {compared} signal blocks could be compared; need at least 4")
    errors = np.linalg.norm(rust[valid] - reference[valid], axis=1)
    median_error = float(np.median(errors))
    if not math.isfinite(median_error) or median_error >= args.max_median_error:
        raise AssertionError(
            f"median vector error {median_error:.3f} cell/min is not below "
            f"{args.max_median_error:.3f}"
        )
    fresh = finite & (current > 0.01) & (previous <= 0.01)
    fresh_blocks = block_any(fresh, bw, bh)
    before_plot: tuple[np.ndarray, np.ndarray] | None = None
    before_metrics = ""
    if args.before_chunk is not None:
        before_idx = args.before_frame_idx or args.frame_idx
        before_header, before, before_raw, before_previous, before_current = read_motion(
            args.before_chunk, before_idx
        )
        if before_header["grid"] != header["grid"] or before.shape != rust.shape:
            raise ValueError("before/after motion grids differ")
        if before_previous != decompress_member(
            chunk, header_len, frames[args.frame_idx - 1], frame_size
        ) or before_current != decompress_member(
            chunk, header_len, current_entry, frame_size
        ):
            raise ValueError("before/after chunks do not contain the same frame pair")
        before_valid = np.all(before_raw != NO_DATA, axis=2)
        before_comparable = has_signal & before_valid & rust_valid & reference_valid
        before_errors = np.linalg.norm(
            before[before_comparable] - reference[before_comparable], axis=1
        )
        after_common_errors = np.linalg.norm(
            rust[before_comparable] - reference[before_comparable], axis=1
        )
        before_median = float(np.median(before_errors))
        after_common_median = float(np.median(after_common_errors))
        if after_common_median > before_median + 1.0e-6:
            raise AssertionError(
                f"mixed median {after_common_median:.3f} worsened from "
                f"{before_median:.3f} cell/min on common signal blocks"
            )
        before_plot = (before, before_valid)
        before_fill = float(before_valid.mean() * 100.0)
        before_fresh_fill = (
            float(before_valid[fresh_blocks].mean() * 100.0) if fresh_blocks.any() else math.nan
        )
        after_fill = float(rust_valid.mean() * 100.0)
        after_fresh_fill = (
            float(rust_valid[fresh_blocks].mean() * 100.0) if fresh_blocks.any() else math.nan
        )
        before_metrics = (
            f" before_median={before_median:.3f} after_common_median={after_common_median:.3f} "
            f"fill_before={before_fill:.1f}% "
            f"fill_after={after_fill:.1f}% fresh_blocks={int(fresh_blocks.sum())} "
            f"fresh_fill_before={before_fresh_fill:.1f}% fresh_fill_after={after_fresh_fill:.1f}%"
        )
    plot_quivers(rust, reference, valid, args.output, before_plot)
    print(
        f"motion_reference: blocks={compared} median_error={median_error:.3f} cell/min "
        f"p90={np.percentile(errors, 90):.3f}{before_metrics} artifact={args.output}"
    )


if __name__ == "__main__":
    main()
