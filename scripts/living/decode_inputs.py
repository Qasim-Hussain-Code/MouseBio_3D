#!/usr/bin/env python3
"""Decode the packaged Digimouse section images into raw volumes for scripts/living/build.ts.

Usage: python3 scripts/living/decode_inputs.py [work directory, default ~/mousebio-work]
The raw volumes hold 391 MB in the work directory, which lies outside the project.
"""
import json
import sys
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
import jpeg_baseline  # noqa: E402

OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path.home() / "mousebio-work"
OUT.mkdir(exist_ok=True)
SECTIONS = ROOT / "public/atlas-volume/sections"
manifest = json.loads((SECTIONS / "sections.json").read_text())
nx, ny, nz = manifest["dimensions"]
photograph = next(layer for layer in manifest["layers"] if layer["id"] == "cryosection")
ct = next(layer for layer in manifest["layers"] if layer["id"] == "ct")
slices = (ROOT / photograph["assetUrl"].lstrip("/").replace("atlas-volume", "public/atlas-volume", 1)).read_bytes()
with (OUT / "rgb.bin").open("wb") as out:
    for start, size in photograph["slices"]:
        width, height, channels, pixels = jpeg_baseline.decode(slices[start:start + size])
        if (width, height, channels) != (nx, ny, 3):
            raise ValueError("Unexpected slice dimensions")
        out.write(bytes(pixels))
for name, layer in (("labels.bin", manifest["labels"]), ("ct.bin", ct)):
    data = (ROOT / layer["assetUrl"].lstrip("/").replace("atlas-volume", "public/atlas-volume", 1)).read_bytes()
    (OUT / name).write_bytes(zlib.decompress(data, -15))
