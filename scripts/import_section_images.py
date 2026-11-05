"""Prepare the coregistered Digimouse cryosection and CT images as section layers.

The source archives are the coregistered data of the Digimouse atlas: the colour
cryosection slices (cryo_data.zip), the CT image (ct_data.zip) and the label image
(atlas.zip), all on the 380 by 992 by 208 grid of 0.1 mm voxels used by the
registered-volume reference. Source bytes are kept: the JPEG slices are
concatenated without re-encoding, and the CT and label images keep the raw deflate
streams of their ZIP members. Nothing is resampled here. The browser downsamples
them for display.

The slice orientation is checked rather than assumed: decoded luminance of sampled
slices is correlated with the separately distributed greyscale cryostat volume on
the same grid. JPEG slices must contain no metadata segments.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
import struct
import zipfile
import zlib

from assess_volume import EXPECTED_ARCHIVE_SHA256, describe_header
import jpeg_baseline

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data/raw"
OUT = ROOT / "public/atlas-volume/sections"
DIMS = (380, 992, 208)
VOXELS = DIMS[0] * DIMS[1] * DIMS[2]
CRYO_ARCHIVE = ("digimouse-cryo_data.zip", "c6b40136e06709ad7b5ce1b3496828b1a282b462ca2ec4a5610971af07c73090", "https://neuroimage.usc.edu/mouse_atlas/cryo_data.zip")
CT_ARCHIVE = ("digimouse-ct_data.zip", "5ca9e99a3a4adeb7879bb4d6c8f45e407b7a49bbc599b3936fa46503cf7acb65", "https://neuroimage.usc.edu/mouse_atlas/ct_data.zip")
LABEL_ARCHIVE = ("atlas.zip", EXPECTED_ARCHIVE_SHA256, "https://neuroimage.usc.edu/mouse_atlas/atlas.zip")
SLICE_MEMBER = "cryo_data/average01_380x992x208_slices_tif/average01_380x992x208_slices{:04d}.tif"
# JFIF header, quantization tables, baseline frame, Huffman tables and scan. Anything else could carry metadata.
ALLOWED_MARKERS = {0xE0, 0xDB, 0xC0, 0xC4, 0xDD}
SAMPLED_SLICES = (20, 60, 100, 140, 180)
LATTICE = 7


def digest(data):
    return hashlib.sha256(data).hexdigest()


def archive(record):
    name, sha, _ = record
    raw = (RAW / name).read_bytes()
    if digest(raw) != sha:
        raise ValueError(f"{name} differs from the reviewed checksum")
    return raw


def raw_deflate(raw, member):
    """Return the unchanged compressed bytes of one ZIP member and verify what they expand to."""
    import io
    info = zipfile.ZipFile(io.BytesIO(raw)).getinfo(member)
    if info.compress_type != zipfile.ZIP_DEFLATED or info.file_size != VOXELS:
        raise ValueError(f"Unexpected ZIP member layout: {member}")
    signature, *_ = struct.unpack_from("<4s", raw, info.header_offset)
    name_length, extra_length = struct.unpack_from("<HH", raw, info.header_offset + 26)
    if signature != b"PK\x03\x04":
        raise ValueError("Invalid local ZIP header")
    start = info.header_offset + 30 + name_length + extra_length
    stream = raw[start:start + info.compress_size]
    expanded = zlib.decompress(stream, -15)
    if len(expanded) != VOXELS or zlib.crc32(expanded) & 0xFFFFFFFF != info.CRC:
        raise ValueError(f"The deflate stream of {member} does not match its ZIP record")
    return stream, expanded


def jpeg_markers(data):
    """The marker bytes before the scan of one JPEG; the stream must start and end as a whole image."""
    if data[:2] != b"\xff\xd8" or data[-2:] != b"\xff\xd9":
        raise ValueError("A slice is not one complete JPEG stream")
    markers, index = [], 2
    while True:
        if data[index] != 0xFF:
            raise ValueError("Invalid JPEG marker sequence")
        marker = data[index + 1]
        if marker == 0xDA:
            return markers
        markers.append(marker)
        (length,) = struct.unpack_from(">H", data, index + 2)
        index += 2 + length


def correlation(first, second):
    count = len(first)
    mean_first, mean_second = sum(first) / count, sum(second) / count
    numerator = sum((a - mean_first) * (b - mean_second) for a, b in zip(first, second))
    return numerator / math.sqrt(sum((a - mean_first) ** 2 for a in first) * sum((b - mean_second) ** 2 for b in second))


def orientation_check(cryo, slices):
    """Correlate decoded slice luminance with the coregistered greyscale volume, against both flips."""
    nx, ny, _ = DIMS
    plane = nx * ny
    grey = cryo.read("cryo_data/cryostat_380x992x208.img")
    if len(grey) != VOXELS:
        raise ValueError("Unexpected greyscale cryostat volume")
    rows = []
    for z in SAMPLED_SLICES:
        width, height, channels, pixels = jpeg_baseline.decode(slices[z])
        if (width, height, channels) != (nx, ny, 3):
            raise ValueError("Unexpected decoded slice layout")
        target = grey[plane * z:plane * (z + 1)]
        lattice = [(x, y) for y in range(0, ny, LATTICE) for x in range(0, nx, LATTICE)]
        luminance = [0.299 * pixels[3 * (y * nx + x)] + 0.587 * pixels[3 * (y * nx + x) + 1] + 0.114 * pixels[3 * (y * nx + x) + 2] for x, y in lattice]
        rows.append({"slice": z,
                     "identity": round(correlation(luminance, [target[y * nx + x] for x, y in lattice]), 4),
                     "flippedX": round(correlation(luminance, [target[y * nx + nx - 1 - x] for x, y in lattice]), 4),
                     "flippedY": round(correlation(luminance, [target[(ny - 1 - y) * nx + x] for x, y in lattice]), 4)})
    if min(row["identity"] for row in rows) < 0.99 or any(row["identity"] <= max(row["flippedX"], row["flippedY"]) for row in rows):
        raise ValueError("The slice orientation does not match the coregistered greyscale volume")
    return rows


def mean_by_label(values, labels, wanted, step=11):
    totals = {label: [0, 0] for label in wanted}
    for index in range(0, VOXELS, step):
        entry = totals.get(labels[index])
        if entry:
            entry[0] += values[index]
            entry[1] += 1
    return {str(label): round(total / count, 1) for label, (total, count) in totals.items() if count}


def run():
    cryo_raw, ct_raw, label_raw = archive(CRYO_ARCHIVE), archive(CT_ARCHIVE), archive(LABEL_ARCHIVE)
    import io
    cryo = zipfile.ZipFile(io.BytesIO(cryo_raw))
    slices, offsets, stack, offset = [], [], bytearray(), 0
    for z in range(DIMS[2]):
        data = cryo.read(SLICE_MEMBER.format(z))
        unexpected = set(jpeg_markers(data)) - ALLOWED_MARKERS
        if unexpected:
            raise ValueError(f"Slice {z} contains unreviewed JPEG segments: {sorted(unexpected)}")
        slices.append(data)
        offsets.append([offset, len(data)])
        stack += data
        offset += len(data)
    orientation = orientation_check(cryo, slices)
    ct_header = describe_header(zipfile.ZipFile(io.BytesIO(ct_raw)).read("ct_data/ct_380x992x208.hdr"))
    if ct_header["dim"][1:4] != list(DIMS) or ct_header["datatypeCode"] != 2 or ct_header["bitsPerVoxel"] != 8:
        raise ValueError("Unexpected CT image layout")
    ct_stream, ct_values = raw_deflate(ct_raw, "ct_data/ct_380x992x208.img")
    label_stream, label_values = raw_deflate(label_raw, "atlas/atlas_380x992x208.img")
    ct_means = mean_by_label(ct_values, label_values, (0, 1, 2))
    if not ct_means["2"] > ct_means["1"] > ct_means["0"]:
        raise ValueError("CT values do not separate air, soft tissue and the skeleton label")
    OUT.mkdir(parents=True, exist_ok=True)
    files = {"cryosection-slices.bin": bytes(stack), "ct-deflate.bin": ct_stream, "labels-deflate.bin": label_stream}
    for name, data in files.items():
        (OUT / name).write_bytes(data)
    base = "/atlas-volume/sections/"
    manifest = {
        "schemaVersion": "mousebio.section-images.v1", "atlasId": "digimouse-volume-040-v1",
        "coordinateFrameId": "digimouse-registered-voxel-native-v1", "dimensions": list(DIMS), "voxelSpacingMm": [0.1, 0.1, 0.1],
        "voxelOrder": "x fastest, then y, then z; a slice image has native x columns and native y rows",
        "license": "CC-BY-SA-4.0", "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0/",
        "attribution": "Digimouse, Belma Dogdas, David Stout, Arion F. Chatziioannou and Richard M. Leahy, USC/UCLA, 2007. Coregistered source images packaged without re-encoding by Qasim Hussain for MouseBio_3D under CC BY-SA 4.0.",
        "layers": [
            {"id": "cryosection", "title": "Specimen photograph", "format": "jpeg-slices-v1",
             "description": "Colour block-face photographs of the frozen postmortem specimen, averaged onto the registered grid by the source authors.",
             "assetUrl": base + "cryosection-slices.bin", "assetBytes": len(stack), "assetSha256": digest(stack), "slices": offsets,
             "sourceUrl": CRYO_ARCHIVE[2], "sourceArchiveSha256": CRYO_ARCHIVE[1], "orientationCheck": orientation},
            {"id": "ct", "title": "CT", "format": "deflate-raw-u8-v1",
             "description": "The coregistered 8-bit X-ray computed tomography image of the same specimen, in source grey values without Hounsfield calibration.",
             "assetUrl": base + "ct-deflate.bin", "assetBytes": len(ct_stream), "assetSha256": digest(ct_stream),
             "expandedBytes": VOXELS, "expandedSha256": digest(ct_values),
             "sourceUrl": CT_ARCHIVE[2], "sourceArchiveSha256": CT_ARCHIVE[1], "meanValueByLabel": ct_means},
        ],
        "labels": {"format": "deflate-raw-u8-v1", "description": "The registered source label image, used to mask the images to the labelled body.",
                   "assetUrl": base + "labels-deflate.bin", "assetBytes": len(label_stream), "assetSha256": digest(label_stream),
                   "expandedBytes": VOXELS, "expandedSha256": digest(label_values),
                   "sourceUrl": LABEL_ARCHIVE[2], "sourceArchiveSha256": LABEL_ARCHIVE[1]},
        "limitations": [
            "The photographs show one frozen postmortem specimen at the block face. Their colours are those of frozen tissue under the source imaging, not of living tissue, and blood-rich organs appear very dark.",
            "Image coregistration is the source authors'; its accuracy is not independently verified, and voxels at tissue boundaries can mix neighbouring tissue or embedding medium.",
            "The CT grey values are 8-bit source values without Hounsfield calibration.",
            "The images apply only to the registered-volume reference; no registration to the tetrahedral or any other reference is accepted.",
        ],
    }
    (OUT / "sections.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(json.dumps({"slices": len(offsets), "stackBytes": len(stack), "ctBytes": len(ct_stream), "labelBytes": len(label_stream),
                      "orientation": orientation, "ctMeans": ct_means}, indent=2), flush=True)


if __name__ == "__main__":
    argparse.ArgumentParser(description=__doc__).parse_args()
    run()
