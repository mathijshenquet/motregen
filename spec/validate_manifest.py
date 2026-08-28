import argparse
import json
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
    sources = set()
    for chunk in manifest["chunks"]:
        url = PurePosixPath(chunk["url"])
        if url.is_absolute() or ".." in url.parts or url.parts[0] != "chunks":
            raise ValueError(f"unsafe chunk URL: {url}")
        if chunk["field"] != "rain_rate":
            raise ValueError("unexpected field")
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
        if [frame["time"] for frame in header["frames"]] != chunk["times"]:
            raise ValueError(f"manifest/header times mismatch in {path}")
        if len(header["quant"]) != 256 or header["quant"][0] != 0.0 or header["quant"][255] is not None:
            raise ValueError(f"invalid quant table in {path}")
        offset = 0
        for frame in header["frames"]:
            if frame["offset"] != offset or frame["len"] <= 0:
                raise ValueError(f"invalid frame index in {path}")
            offset += frame["len"]
        if path.stat().st_size != chunk["header_len"] + offset:
            raise ValueError(f"payload length mismatch in {path}")
        grids.append(header["grid"])
        sources.add(chunk["source"])
    if any(grid != grids[0] for grid in grids[1:]):
        raise ValueError("chunks do not share one grid")
    print(json.dumps({"chunks": len(manifest["chunks"]), "sources": sorted(sources), "grid": grids[0]}))


if __name__ == "__main__":
    main()
