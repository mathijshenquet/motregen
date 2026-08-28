import argparse
import json
import math
import struct
from datetime import datetime
from pathlib import Path, PurePosixPath


def timestamp(value: str):
    if not value.endswith("Z"):
        raise ValueError(f"timestamp is not UTC: {value}")
    datetime.fromisoformat(value.replace("Z", "+00:00"))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("data_dir", type=Path)
    args = parser.parse_args()
    manifest = json.loads((args.data_dir / "manifest.json").read_text())
    if manifest["version"] != 0 or not manifest["chunks"]:
        raise ValueError("manifest version/chunks are invalid")
    timestamp(manifest["generated"])
    timestamp(manifest["now"])
    grids = []
    fields = {}
    sources = set()
    for chunk in manifest["chunks"]:
        url = PurePosixPath(chunk["url"])
        if url.is_absolute() or ".." in url.parts or url.parts[0] != "chunks":
            raise ValueError(f"unsafe chunk URL: {url}")
        timestamp(chunk["run"])
        for value in chunk["times"]:
            timestamp(value)
        path = args.data_dir.joinpath(*url.parts)
        with path.open("rb") as source:
            if source.read(4) != b"mrf0":
                raise ValueError(f"bad magic in {path}")
            json_length = struct.unpack("<I", source.read(4))[0]
            header = json.loads(source.read(json_length))
        if chunk["header_len"] != 8 + json_length:
            raise ValueError(f"header_len mismatch in {path}")
        if header["version"] != 0 or header["dict"] is not None:
            raise ValueError(f"invalid mrf v0 header in {path}")
        if header["source"] != chunk["source"] or header["run"] != chunk["run"]:
            raise ValueError(f"manifest/header provenance mismatch in {path}")
        field = chunk.get("field", "rain_rate")
        if header.get("field", "rain_rate") != field:
            raise ValueError(f"manifest/header field mismatch in {path}")
        if [frame["time"] for frame in header["frames"]] != chunk["times"]:
            raise ValueError(f"manifest/header times mismatch in {path}")
        quant = header["quant"]
        if (
            len(quant) != 256
            or quant[255] is not None
            or any(value is None or not math.isfinite(value) for value in quant[:255])
            or any(left >= right for left, right in zip(quant[:254], quant[1:255], strict=True))
            or (field in {"rain_rate", "radiation"} and quant[0] != 0.0)
            or (
                field in {"rel_humidity", "cloud_frac"}
                and (not math.isclose(quant[0], 0.0) or not math.isclose(quant[254], 100.0))
            )
        ):
            raise ValueError(f"invalid quant table in {path}")
        offset = 0
        for frame in header["frames"]:
            if frame["offset"] != offset or frame["len"] <= 0:
                raise ValueError(f"invalid frame index in {path}")
            offset += frame["len"]
        motion_grid = header.get("motion_grid")
        motion_members = [frame.get("motion") for frame in header["frames"]]
        if motion_grid is None and any(member is not None for member in motion_members):
            raise ValueError(f"motion member without motion_grid in {path}")
        if motion_grid is not None:
            if motion_grid["bw"] <= 0 or motion_grid["bh"] <= 0:
                raise ValueError(f"invalid motion_grid in {path}")
            if not any(member is not None for member in motion_members):
                raise ValueError(f"motion_grid without motion members in {path}")
            if motion_members and motion_members[0] is not None:
                raise ValueError(f"first frame has a motion member in {path}")
            for member in motion_members:
                if member is not None:
                    if member["offset"] != offset or member["len"] <= 0:
                        raise ValueError(f"invalid motion index in {path}")
                    offset += member["len"]
        if path.stat().st_size != chunk["header_len"] + offset:
            raise ValueError(f"payload length mismatch in {path}")
        grids.append(header["grid"])
        fields[field] = {"grid": header["grid"], "times": chunk["times"]}
        sources.add(chunk["source"])
    if {"wind_u_ms", "wind_v_ms"}.intersection(fields) and not {
        "wind_u_ms",
        "wind_v_ms",
    }.issubset(fields):
        raise ValueError("wind fields must be published as a pair")
    if {"wind_u_ms", "wind_v_ms"}.issubset(fields):
        if fields["wind_u_ms"] != fields["wind_v_ms"]:
            raise ValueError("wind pair grid/times invariant failed")
    print(
        json.dumps(
            {
                "chunks": len(manifest["chunks"]),
                "sources": sorted(sources),
                "fields": sorted(fields),
                "grids": len({json.dumps(grid, sort_keys=True) for grid in grids}),
            }
        )
    )


if __name__ == "__main__":
    main()
