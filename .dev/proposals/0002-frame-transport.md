# MIP-2: rain frame encoding & transport

Status: draft
Author: orchestrator (fable), 2026-08-28

## 1. The problem

The client needs the full timeline of rain fields (order 100 frames on a
~700×800 grid) fast enough for instant scrubbing, and it needs *data*, not
pictures: the intensity meter must read exact mm/h at a cell, and the shader
wants a single-channel field it can colormap and blend itself. Buienradar's
colormapped PNGs fail both. The PO floated the interesting idea of using a
real video codec for the temporal redundancy, decoded client-side, rendered
via WebGL. This MIP fixes the wire format.

## 2. Prior work

**What a video codec buys and costs.** Buys: motion-compensated temporal
prediction (rain fields advect — exactly what codecs model) and hardware
decode via WebCodecs (VP9/AV1, broadly available). Costs: lossy quantization
noise on what is *data* (phantom drizzle, eroded shower edges); a YUV
pipeline where our field must masquerade as luma; codec/container plumbing
(mp4/ivf muxing) on the encode side; and WebCodecs frame management on the
decode side. AV1 has a true lossless mode, which would neutralize the fidelity
objection at some bitrate cost — untested for this content.

**What plain compression buys.** Rain fields are sparse: typically well under
10% of NL has rain, and the 8-bit quantized field is mostly zero bytes. zstd
crushes that. Back of envelope: 700×765 = 535 KB raw per frame; sparse
quantized fields should land at a few KB to some tens of KB compressed.
A 100-frame timeline is then a very manageable initial payload, streamed
progressively (frames around "now" first). Decode cost: a tiny wasm/JS zstd
(e.g. fzstd) inflates a frame in ~1 ms; upload as an R8 texture is trivial.
Optional later: delta-vs-previous-frame before zstd for the temporal win
without any codec machinery.

**Precedents.** RainViewer and friends ship colormapped raster tiles (data
lost); meteo tooling ships GRIB/HDF5 to clients only in desktop apps. A small
custom format with a public spec is the norm-breaking but honest option.

## 3. Recommendation

**v1: a custom binary format ("mrf"), intra-only, zstd.** Per chunk file:

- header: magic + version, grid definition (projection, origin, cell size,
  W×H), the quantization table, frame count, per-frame metadata (valid time,
  source, run);
- payload: per frame the zstd-compressed 8-bit field. Value 0 = dry,
  255 = no-data mask, 1–254 = rain rate on a piecewise-log scale
  (~0.1…100+ mm/h — matches perceptual and meteorological dynamics; exact
  table fixed in the T2 spec and carried in the header, never hardcoded
  client-side).

Chunking: one file per source run (one nowcast run = 25 frames; one history
hour = 12 frames; one AROME run = its hourly frames) so request count stays
low and immutable-cache-friendly. The manifest maps timeline → chunk URLs.

Client: fetch chunks in a web worker, zstd-decode to `Uint8Array`, upload R8
textures; shader does colormap + inter-frame blending; the meter indexes the
same arrays through the header's quantization table.

**The codec idea stays alive as an epsilon track**: once real frames exist
(T2), a side experiment encodes the same timeline as grayscale AV1/VP9
(lossless and near-lossless) and compares bytes, decode latency, and
max-error vs the mrf baseline. Gate: adopt only on ≥3× byte win at
acceptable fidelity — otherwise mrf's simplicity wins. Either way we get a
measured answer instead of a vibe.

## 4. Open questions

1. **Intra-only vs delta frames in v1**: recommendation intra-only (random
   access for scrubbing stays trivial); revisit only if measured sizes
   disappoint.
2. **Quantization floor**: is 0.1 mm/h the right "dry" threshold, or keep
   KNMI's finer 0.01 mm/h steps at the bottom (more phantom-drizzle risk on
   screen, better meter fidelity)?
3. **Ship rain rate only** (recommended) or also reflectivity/other fields in
   the container from day one?

## Changelog

- 2026-08-28: draft.
