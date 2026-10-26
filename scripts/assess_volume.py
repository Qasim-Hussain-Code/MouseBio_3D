"""Inspect the official registered Digimouse volume without scientific packages.

This script does not generate geometry. Before downloading an archive, it checks
both its HTTP size and its remote ZIP central directory against fixed bounds.
"""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from datetime import datetime, timezone
import hashlib
import io
import json
import math
from pathlib import Path, PurePosixPath
import re
import resource
import shutil
import struct
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[1]
URL = "https://neuroimage.usc.edu/mouse_atlas/atlas.zip"
ARCHIVE = ROOT / "data/raw/atlas.zip"
MAX_COMPRESSED = 30 * 1024 * 1024
MAX_EXPANDED = 100 * 1024 * 1024
EXPECTED_ARCHIVE_SHA256 = "6f7cbd8a7236a78c47a14c3259d387439c0dc0284b2a83fa955f8c49efe11761"


def checked_remote_directory():
    with urllib.request.urlopen(urllib.request.Request(URL, method="HEAD"), timeout=30) as response:
        length = int(response.headers["Content-Length"])
        modified = response.headers.get("Last-Modified")
    if not 22 <= length <= MAX_COMPRESSED:
        raise ValueError("Remote archive exceeds the 30 MiB compressed limit")
    start = max(0, length - 65536)
    request = urllib.request.Request(URL, headers={"Range": f"bytes={start}-{length - 1}"})
    with urllib.request.urlopen(request, timeout=30) as response:
        if response.status != 206:
            raise ValueError("Server did not honor the bounded directory range request")
        tail = response.read(65537)
    if len(tail) != length - start:
        raise ValueError("Unexpected range response size")
    end = tail.rfind(b"PK\x05\x06")
    if end < 0 or end + 22 > len(tail):
        raise ValueError("ZIP directory end not found")
    _, disk, directory_disk, disk_entries, entries, directory_size, directory_offset, comment_size = struct.unpack_from("<4s4H2IH", tail, end)
    if disk or directory_disk or disk_entries != entries or entries == 65535:
        raise ValueError("Multi-disk and ZIP64 archives are not accepted")
    if end + 22 + comment_size != len(tail) or directory_offset < start or directory_offset + directory_size > start + end:
        raise ValueError("ZIP directory is outside the bounded range")
    offset = directory_offset - start
    members = []
    for _ in range(entries):
        fields = struct.unpack_from("<4s6H3I5H2I", tail, offset)
        if fields[0] != b"PK\x01\x02":
            raise ValueError("Invalid ZIP directory entry")
        flags, compressed, expanded = fields[3], fields[8], fields[9]
        name_length, extra_length, comment_length = fields[10:13]
        if flags & 1:
            raise ValueError("Encrypted ZIP entries are not accepted")
        raw_name = tail[offset + 46:offset + 46 + name_length]
        name = raw_name.decode("utf-8" if flags & 0x800 else "cp437")
        path = PurePosixPath(name)
        if path.is_absolute() or ".." in path.parts or "\\" in name:
            raise ValueError("Unsafe ZIP member path")
        members.append({"name": name, "compressedBytes": compressed, "uncompressedBytes": expanded})
        offset += 46 + name_length + extra_length + comment_length
    if offset != directory_offset - start + directory_size:
        raise ValueError("ZIP directory size mismatch")
    if sum(member["uncompressedBytes"] for member in members) > MAX_EXPANDED:
        raise ValueError("Remote archive exceeds the 100 MiB expanded limit")
    return {"compressedBytes": length, "lastModified": modified, "members": members}


def download_if_absent(expected_size):
    if ARCHIVE.exists():
        if ARCHIVE.stat().st_size != expected_size:
            raise ValueError("Existing raw archive size differs; it has been preserved for review")
        return
    ARCHIVE.parent.mkdir(parents=True, exist_ok=True)
    with urllib.request.urlopen(URL, timeout=60) as response, ARCHIVE.open("xb") as target:
        total = 0
        while block := response.read(1024 * 1024):
            total += len(block)
            if total > expected_size or total > MAX_COMPRESSED:
                raise ValueError("Archive exceeds the reviewed size")
            target.write(block)
    if total != expected_size:
        raise ValueError("Downloaded source archive is incomplete")


def describe_header(header):
    if len(header) != 348:
        raise ValueError("Expected a 348-byte Analyze header")
    endian = "<" if struct.unpack_from("<i", header)[0] == 348 else ">"
    if struct.unpack_from(endian + "i", header)[0] != 348:
        raise ValueError("Unknown Analyze byte order")
    decode = lambda start, size: header[start:start + size].split(b"\0")[0].decode("ascii", errors="replace")
    return {
        "headerBytes": len(header), "byteOrder": "little-endian" if endian == "<" else "big-endian",
        "dim": list(struct.unpack_from(endian + "8h", header, 40)),
        "datatypeCode": struct.unpack_from(endian + "h", header, 70)[0],
        "bitsPerVoxel": struct.unpack_from(endian + "h", header, 72)[0],
        "pixdim": list(struct.unpack_from(endian + "8f", header, 76)),
        "voxelOffset": struct.unpack_from(endian + "f", header, 108)[0],
        "voxelUnitsField": decode(56, 4), "calibrationUnitsField": decode(60, 8),
        "description": decode(148, 80), "auxiliaryFile": decode(228, 24),
        "orientationCode": header[252],
        "originatorRawHex": header[253:263].hex(),
        "originatorAsFiveInt16": list(struct.unpack_from(endian + "5h", header, 253)),
        "finalFourBytesHex": header[344:348].hex(),
    }


def label_statistics(source, dimensions):
    """Scan x-fastest Analyze storage using one 380 x 992 plane at a time.

    Coordinates below are zero-based storage indices, not named anatomical axes.
    Run-based accumulation avoids keeping a Python object per nonzero voxel.
    """
    x_size, y_size, z_size = dimensions
    counts = Counter()
    bounds = {}
    sums = defaultdict(lambda: [0, 0, 0])
    digest = hashlib.sha256()
    total = 0
    runs = re.compile(rb"([\x01-\xff])\1*")
    for z in range(z_size):
        plane = source.read(x_size * y_size)
        if len(plane) != x_size * y_size:
            raise ValueError("Truncated anatomical label image")
        digest.update(plane)
        total += len(plane)
        counts[0] += plane.count(0)
        for y in range(y_size):
            row = plane[y * x_size:(y + 1) * x_size]
            for run in runs.finditer(row):
                label = run[0][0]
                start, end = run.span()
                length = end - start
                counts[label] += length
                sums[label][0] += length * (start + end - 1) // 2
                sums[label][1] += length * y
                sums[label][2] += length * z
                if label not in bounds:
                    bounds[label] = [[start, y, z], [end - 1, y, z]]
                else:
                    minimum, maximum = bounds[label]
                    minimum[0] = min(minimum[0], start)
                    maximum[0] = max(maximum[0], end - 1)
                    minimum[1] = min(minimum[1], y)
                    maximum[1] = max(maximum[1], y)
                    minimum[2] = min(minimum[2], z)
                    maximum[2] = max(maximum[2], z)
    if source.read(1):
        raise ValueError("Image contains unexpected trailing data")
    if sum(counts.values()) != math.prod(dimensions):
        raise ValueError("Label counts do not sum to the image size")
    return {
        "bytes": total, "sha256": digest.hexdigest(), "countsByNumericLabel": dict(sorted(counts.items())),
        "boundsVoxelInclusive": bounds,
        "centroidVoxelIndices": {label: [value / counts[label] for value in sums[label]] for label in sorted(sums)},
    }


def parse_label_file(text):
    labels = {}
    aggregates = []
    for line in text.splitlines():
        key, value = [part.strip() for part in line.split("-->", 1)]
        if "+" in key:
            aggregates.append({"name": value, "sourceLabels": [int(part) for part in key.split("+")]})
        else:
            labels[int(key)] = value
    return labels, aggregates


def main(offline=False):
    if offline:
        previous = json.loads((ROOT / "data/volume-assessment.json").read_text())
        remote = previous["preflight"]
    else:
        remote = checked_remote_directory()
        print(json.dumps(remote, indent=2), flush=True)
        download_if_absent(remote["compressedBytes"])
    raw = ARCHIVE.read_bytes()
    if hashlib.sha256(raw).hexdigest() != EXPECTED_ARCHIVE_SHA256:
        raise ValueError("Source checksum differs from the inspected archive; review before updating the pin")
    result = {
        "schemaVersion": "mousebio.volume-assessment.v1",
        "assessedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "sourceUrl": URL, "sourceLicense": "CC-BY-SA-4.0",
        "licenseEvidenceUrl": "https://neuroimage.usc.edu/neuro/Digimouse_license",
        "archiveSha256": hashlib.sha256(raw).hexdigest(),
        "preflight": remote, "generatedAnatomicalGeometry": False,
    }
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        if sum(info.file_size for info in archive.infolist()) > MAX_EXPANDED:
            raise ValueError("Downloaded directory exceeds expanded bound")
        text_files = {}
        headers = {}
        histograms = {}
        for info in archive.infolist():
            if info.filename.lower().endswith((".txt", ".m", ".hdr")):
                if info.file_size > 1024 * 1024:
                    raise ValueError("Unexpectedly large metadata member")
                data = archive.read(info)
                if info.filename.lower().endswith(".hdr"):
                    headers[info.filename] = describe_header(data)
                elif info.filename.lower().endswith("license.txt"):
                    if b"Creative Commons Attribution Share Alike 4.0 International" not in data:
                        raise ValueError("Archive license statement differs from reviewed permissions")
                    license_path = ROOT / "data/provenance/digimouse-volume-license.txt"
                    license_path.write_bytes(data)
                    result["bundledLicense"] = {
                        "archiveMember": info.filename, "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest(),
                        "preservedAt": "data/provenance/digimouse-volume-license.txt", "license": "CC-BY-SA-4.0",
                    }
                else:
                    text_files[info.filename] = data.decode("utf-8", errors="replace")
        result["headers"] = headers
        result["sourceTextFiles"] = text_files
        # The expected image is a byte-valued anatomical label volume. No
        # interpretation is attempted for another datatype or member count.
        if len(headers) == 1 and next(iter(headers.values()))["datatypeCode"] == 2:
            for info in archive.infolist():
                if info.filename.lower().endswith(".img"):
                    header = next(iter(headers.values()))
                    dimensions = header["dim"][1:4]
                    if header["dim"][4] != 1 or header["bitsPerVoxel"] != 8 or header["voxelOffset"] != 0:
                        raise ValueError("Unsupported anatomical image layout")
                    if info.file_size != math.prod(dimensions):
                        raise ValueError("Image byte count differs from header dimensions")
                    with archive.open(info) as source:
                        histograms[info.filename] = label_statistics(source, dimensions)
        result["labelHistograms"] = histograms
        label_text = next(value for name, value in text_files.items() if name.endswith("atlas_380x992x208.txt"))
        labels, aggregates = parse_label_file(label_text)
        histogram = next(iter(histograms.values()))
        if set(histogram["countsByNumericLabel"]) != set(labels):
            raise ValueError("Observed labels differ from the source label inventory")
        result["labels"] = [{"value": label, "sourceName": name, "voxelCount": histogram["countsByNumericLabel"][label]} for label, name in sorted(labels.items())]
        result["aggregateLabels"] = aggregates
    result["coordinateAssessment"] = {
        "storageOrder": "x index fastest, then y, then z, as conventional Analyze array storage; indices are zero-based",
        "anatomicalOrientationVerified": False, "voxelToTetrahedralAffine": None,
        "unitsEvidence": "Header voxel unit field is empty; the official Digimouse download page identifies voxel spacing as 0.1 mm isotropic.",
        "originEvidence": "Analyze originator field contains ten zero bytes; no verified anatomical origin or full affine is supplied.",
        "orientationEvidence": "Header description is reorient and orientation byte is zero. These do not independently establish a spatial transform to the tessellated mesh or named anatomical directions.",
    }
    result["resourceAssessment"] = {
        "fullUint8ArrayBytes": 78407680, "singleBooleanMaskBytes": 78407680,
        "singleFloat32VolumeBytes": 313630720, "singleFloat64VolumeBytes": 627261440,
        "twoPlaneChunkBytes": 380 * 992 * 2,
        "pipelineOptions": [
            "Streaming label scans need no full-volume array; this scan retains one plane and small per-label accumulators.",
            "A standard-library exposed-voxel-face or marching-tetrahedra converter is possible, but produces a different surface representation and needs independent geometric and resolution validation.",
            "A mature marching-cubes implementation could be justified later by topology handling and performance; no numpy, scipy, scikit-image or nibabel packages were installed for this assessment.",
            "Process one selected label and overlapping slabs, stream indexed mesh output, and avoid simultaneous full-volume float copies. Mesh and deduplication memory must be measured separately.",
        ],
        "scanPeakResidentKiB": resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,
        "expandedImageWrittenToDisk": False,
    }
    result["coverageAssessment"] = {
        "currentlyModeledSource": "17 labelled tetrahedral regions in public/atlas/atlas.json",
        "voxelNonbackgroundLabels": len(labels) - 1,
        "potentialAdditionalDetail": ["eye", "medulla", "cerebellum", "olfactory bulbs", "external cerebrum", "striatum", "rest of the brain", "lachrymal glands", "adrenal glands"],
        "limits": [
            "Label numbers in the voxel atlas and tetrahedral mesh refer to different structures and cannot be used interchangeably.",
            "The skin-labelled volume occupies most residual body voxels; it must not be described as a separately resolved histological skin layer without further examination.",
            "The voxel atlas gives a named masseter label; it does not by itself prove which unspecified tetrahedral muscle region corresponds to it.",
            "Paired eyes, glands, kidneys, testes and lungs share source labels; laterality is not identified by these labels.",
            "No new browser geometry, anatomical coordinate registration, tissue layer, cellular detail or physiological validity is established by this inspection.",
        ],
    }
    tet_atlas = json.loads((ROOT / "public/atlas/atlas.json").read_text())
    tetrahedra_by_id = {entry["id"]: entry for entry in tet_atlas["structures"]}
    nominal_crosswalk = {
        "digimouse:1": [1], "digimouse:2": [4, 5, 6, 7, 8, 10], "digimouse:3": [9],
        "digimouse:4": [13], "digimouse:5": [15], "digimouse:6": [16],
        "digimouse:7": [19], "digimouse:8": [19], "digimouse:9": [21], "digimouse:10": [21],
        "digimouse:11": [17], "digimouse:12": [18], "digimouse:13": [2],
        "digimouse:16": [14], "digimouse:17": [14],
    }
    result["nominalSourceLabelCrosswalk"] = [
        {"tetrahedralStructureId": identifier, "volumeLabels": values,
         "interpretation": "Source-label name association only; not a verified spatial registration or equivalence of boundaries"}
        for identifier, values in nominal_crosswalk.items()
    ]
    # Bounds under a plainly stated candidate index-spacing transform are given
    # as evidence of disagreement, not as a fitted or approved registration.
    examples = []
    for tetrahedral_id, volume_label in (("digimouse:3", 9), ("digimouse:4", 13), ("digimouse:5", 15), ("digimouse:12", 18), ("digimouse:13", 2)):
        examples.append({
            "tetrahedralStructureId": tetrahedral_id, "volumeLabel": volume_label,
            "volumeBoundsIndexTimesNominalSpacingMm": [[value * 0.1 for value in corner] for corner in histogram["boundsVoxelInclusive"][volume_label]],
            "tetrahedralBoundsInterpretedMm": [[value * 1000 for value in corner] for corner in tetrahedra_by_id[tetrahedral_id]["geometry"]["boundsMeters"]],
        })
    result["coordinateAssessment"]["unregisteredBoundsExamples"] = examples
    result["coordinateAssessment"]["boundsConclusion"] = "Corresponding named regions disagree under a simple index * 0.1 mm identity mapping. Downsampling, boundary processing and/or coordinate shifts require explicit assessment; no fitted transformation has been accepted."
    path = ROOT / "data/volume-assessment.json"
    path.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"archiveBytes": len(raw), "imageBytes": 78407680, "labels": result["labels"], "scanPeakResidentKiB": result["resourceAssessment"]["scanPeakResidentKiB"]}, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--offline", action="store_true", help="rescan the pinned local archive using the saved preflight directory")
    main(parser.parse_args().offline)
