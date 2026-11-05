"""Generate surfaces for one native micro-CT scan of Rosenhain et al. (2018) with the standard library.

The source is mouse M01 at the 0.25 h time point of figshare item 7058615
(Rosenhain et al., 2018, Scientific Data 5:180294; dataset record CC0 1.0).
Only that scan's members are used. They are read from
data/raw/rosenhain2018-M01-0.25h after extraction from the remote archive by
HTTP range requests, and each is bound to its CRC-32 and SHA-256 values.

The first organ segmentation file (Organ1) and the body class of the bed
segmentation are converted with the binary interface method used for the
Digimouse volume surfaces, on the original 0.28 mm grid. The second
segmentation file (Organ2) is used only to report agreement. No smoothing,
labels, laterality or registration are added.
"""
from __future__ import annotations

import argparse
from array import array
from collections import Counter
import hashlib
import json
import math
from pathlib import Path
import struct
import time
import zlib

from assess_volume import describe_header
from import_volume import GlbWriter, polygonize

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data/raw/rosenhain2018-M01-0.25h"
OUT = ROOT / "public/atlas-microct"
PREFIX = "1_nativeCTdata/M01_0.25h/"
ATLAS_ID = "rosenhain2018-m01-native-v1"
FRAME_ID = "rosenhain2018-m01-ct280-native-v1"
ASSET = "rosenhain2018-m01.glb"
DIMS = (142, 105, 200)
SPACING_MM = 0.28
SPACING_M = 0.00028
ARCHIVE_URL = "https://ndownloader.figshare.com/files/12981293"
ARCHIVE_BYTES = 4495345483
# Members read from the 4,495,345,483-byte archive, with the CRC-32 recorded in its
# central directory and the SHA-256 of the extracted bytes.
MEMBERS = {
    "Bed.cls": (158, "ffa095d3", "978610353c208ca881a1f7b9b21d85e65c2039f1d06f4188ed285aeb86e15cab"),
    "Bed.hdr": (348, "8275b7ac", "82c178036589e514ea24a2cafd2dcff234dec94e4ade70aa2567af61143f4a4c"),
    "Bed.img": (2982000, "f124c895", "98ff8ecf98eb57365498a85229f50d3c8867ea30f19b6bd2b2a80289a75620ef"),
    "CT280.hdr": (348, "f9d3b0ef", "d98e7a7a9645c27781cf13fcbb2492c3549bc97a9b97300d68c839523d5878dd"),
    "CT280.img": (5964000, "7a959f6a", "7d263f276b6ddec21f7704a3a3ab82a2e4c6620fdeceb8b06fe22acb0515c269"),
    "Organ1.cls": (299, "47734f0e", "bd6b07a775f73e96232dede1f194cf7cba513304381101e2777a9e1ddf5a0e97"),
    "Organ1.hdr": (348, "8275b7ac", "82c178036589e514ea24a2cafd2dcff234dec94e4ade70aa2567af61143f4a4c"),
    "Organ1.img": (2982000, "bd53f3e0", "61db0343fceea50b43159af348f5c780056ae45643a5f3d36d8ed55ea7589ffb"),
    "Organ2.cls": (326, "b85b1585", "c847093d9bde0b2fa8cea2826a18b1428178e42a7b20ebd7bfcf0d48fe2d5eb5"),
    "Organ2.hdr": (348, "8275b7ac", "82c178036589e514ea24a2cafd2dcff234dec94e4ade70aa2567af61143f4a4c"),
    "Organ2.img": (2982000, "264793bc", "bc5442bca5ded7db69ffc2bc58021c6834ef46fc15342994fc07584a7d3f1570"),
}
SYSTEMS = {
    "Bone": ["skeletal"], "Lung": ["respiratory"], "Heart": ["cardiovascular"], "Liver": ["digestive"],
    "Intestine": ["digestive"], "Bladder": ["urinary"], "Spleen": ["lymphatic", "immune"], "Stomach": ["digestive"],
    "Muscle": ["muscular"], "Kidneys": ["urinary"],
}
DISPLAY_NAMES = {"Muscle": "Muscle (part of a thigh)", "Kidneys": "Kidneys", "Lung": "Lungs"}
BODY_CLASS = 1


def member(name):
    data = (RAW / (PREFIX + name).replace("/", "__")).read_bytes()
    size, crc, sha = MEMBERS[name]
    if len(data) != size or f"{zlib.crc32(data) & 0xFFFFFFFF:08x}" != crc or hashlib.sha256(data).hexdigest() != sha:
        raise ValueError(f"Source member {name} differs from the reviewed extraction")
    return data


def classes(text):
    """Parse a class file: ClassNames, ClassIndices and ClassColors separated by vertical bars."""
    fields = dict(line.split("=", 1) for line in text.splitlines() if "=" in line)
    names = fields["ClassNames"].split("|")
    indices = [int(value) for value in fields["ClassIndices"].split("|")]
    colours = [tuple(int(part) for part in value.split()) for value in fields["ClassColors"].split("|")]
    if indices != list(range(len(names))) or len(colours) != len(names) or names[0] != "unclassified":
        raise ValueError("Unexpected class file layout")
    return names, colours


def volume(name, datatype, bits):
    header = describe_header(member(name + ".hdr"))
    if (header["dim"][:4] != [3, *DIMS] or header["datatypeCode"] != datatype or header["bitsPerVoxel"] != bits
            or header["voxelOffset"] != 0 or [round(value, 6) for value in header["pixdim"][1:4]] != [SPACING_MM] * 3
            or header["byteOrder"] != "little-endian"):
        raise ValueError(f"Unexpected {name} image layout")
    return member(name + ".img")


def padded(labels, wanted):
    """Copy x-fastest labels into a grid with one background sample on every side."""
    nx, ny, nz = DIMS
    px, py = nx + 2, ny + 2
    grid = bytearray(px * py * (nz + 2))
    low, high = [math.inf] * 3, [-1] * 3
    for z in range(nz):
        for y in range(ny):
            row = labels[nx * (y + ny * z):nx * (y + ny * z + 1)]
            start = px * (y + 1 + py * (z + 1)) + 1
            grid[start:start + nx] = row
            token = bytes((wanted,))
            first = row.find(token)
            if first >= 0:
                last = row.rfind(token)
                for axis, (a, b) in enumerate(((first + 1, last + 1), (y + 1, y + 1), (z + 1, z + 1))):
                    low[axis] = min(low[axis], a)
                    high[axis] = max(high[axis], b)
    if high[0] < 0:
        raise ValueError(f"Class {wanted} is absent")
    return grid, (px, py, nz + 2), [low, high]


def dice(first, a, second, b):
    both = sum(1 for p, q in zip(first, second) if p == a and q == b)
    total = first.count(bytes((a,))) + second.count(bytes((b,)))
    return round(2 * both / total, 3)


def hexcolour(rgb):
    return "#" + "".join(f"{value:02x}" for value in rgb[:3])


def run(verify_existing=False):
    start = time.perf_counter()
    organ1 = volume("Organ1", 2, 8)
    organ2 = volume("Organ2", 2, 8)
    bed = volume("Bed", 2, 8)
    ct = struct.unpack(f"<{DIMS[0] * DIMS[1] * DIMS[2]}h", volume("CT280", 4, 16))
    names1, colours1 = classes(member("Organ1.cls").decode("ascii"))
    names2, _ = classes(member("Organ2.cls").decode("ascii"))
    bed_names, bed_colours = classes(member("Bed.cls").decode("ascii"))
    if names1[1:] != list(SYSTEMS) or bed_names[BODY_CLASS] != str(BODY_CLASS):
        raise ValueError("Unexpected source class inventory")

    # The bed file names its classes only by number. Class 1 is taken as the body because it
    # contains nearly all organ voxels and has soft-tissue attenuation; this is recorded, not assumed.
    organ_voxels = [index for index, value in enumerate(organ1) if value]
    inside = sum(1 for index in organ_voxels if bed[index] == BODY_CLASS) / len(organ_voxels)
    body_ct = sorted(ct[index] for index, value in enumerate(bed) if value == BODY_CLASS)
    body_evidence = {"bedClass": BODY_CLASS, "fractionOfOrgan1VoxelsInside": round(inside, 4),
                     "medianCtValue": body_ct[len(body_ct) // 2], "voxels": len(body_ct),
                     "basis": "The bed segmentation names its classes only by number. Class 1 contains this fraction of all Organ1 organ voxels and has a soft-tissue median CT value, so it is treated as the body; the other classes lie outside the organs."}
    if inside < 0.98:
        raise ValueError("Bed class 1 does not contain the segmented organs")
    agreement = {name: dice(organ1, names1.index(name), organ2, names2.index(name)) for name in names1[1:]}

    writer = GlbWriter(generator="MouseBio_3D reproducible micro-CT converter",
                       copyright="Rosenhain et al. 2018 (CC0 1.0 dataset); adaptation Qasim Hussain")
    structures = []
    regions = [("Bed", BODY_CLASS, bed, "rosenhain2018-m01:Bed:1", "Whole body", ["integumentary"], hexcolour(bed_colours[BODY_CLASS]))]
    regions += [("Organ1", index, organ1, f"rosenhain2018-m01:Organ1:{index}", DISPLAY_NAMES.get(name, name), SYSTEMS[name], hexcolour(colours1[index]))
                for index, name in enumerate(names1) if index]
    totals = Counter()
    for file, index, labels, identifier, name, systems, colour in regions:
        grid, dims, bounds = padded(labels, index)
        positions, normals, indices = polygonize(grid, dims, bounds, index, 1, SPACING_M)
        mesh_bounds = writer.add(index, name, positions, normals, indices, identifier, colour)
        voxels = labels.count(bytes((index,)))
        record = {
            "id": identifier, "name": name, "systems": systems,
            "sourceLabel": bed_names[index] if file == "Bed" else names1[index], "sourceFile": f"{PREFIX}{file}.img",
            "sourceClassIndex": index, "meshNode": identifier,
            "description": "A source-segmented region from the first organ segmentation file of the scan, extracted on the original 0.28 mm grid.",
            "geometry": {"vertices": len(positions) // 3, "triangles": len(indices) // 3, "boundsMeters": mesh_bounds,
                         "sourceVoxels": voxels, "volumeMm3": round(voxels * SPACING_MM ** 3, 1)},
            "scale": "organ", "color": colour, "defaultOpacity": 1,
            "interSegmentationDice": agreement.get(names1[index]) if file == "Organ1" else None,
        }
        if file == "Bed":
            record.update({"description": "Bed segmentation class 1, identified as the body (see bodyEvidence). Its outer surface is the body surface within the scanned field; organs lie inside it. It is not a separately segmented skin layer.",
                           "scale": "organism", "defaultOpacity": 0.08})
        if names1[index] == "Bone" and file == "Organ1":
            record.update({"description": "Aggregate bone segmented semi-automatically by thresholding and region growing in the source study. Individual bones are not identified.",
                           "scale": "system", "defaultOpacity": 0.35})
        if names1[index] in ("Kidneys", "Lung") and file == "Organ1":
            record["description"] += " Paired organs share one source class; no laterality is assigned."
        if names1[index] == "Muscle" and file == "Organ1":
            record["description"] = "The source study segmented a part of a thigh muscle only. It is not the musculature."
        structures.append(record)
        totals["triangles"] += len(indices) // 3
        totals["vertices"] += len(positions) // 3
        print(f"{identifier} {name}: {voxels} voxels, {len(positions) // 3} vertices, {len(indices) // 3} triangles", flush=True)
    glb = writer.finish()
    OUT.mkdir(parents=True, exist_ok=True)
    target = OUT / ASSET
    digest = hashlib.sha256(glb).hexdigest()
    if verify_existing and (not target.exists() or hashlib.sha256(target.read_bytes()).hexdigest() != digest):
        raise ValueError("Reproduced micro-CT asset differs from the existing GLB")
    target.write_bytes(glb)
    statistics = {"structures": len(structures), "triangles": totals["triangles"], "surfaceVerticesIncludingRegionBoundaries": totals["vertices"],
                  "glbBytes": len(glb), "glbSha256": digest, "sourceDimensions": list(DIMS), "sourceVoxelSpacingMm": [SPACING_MM] * 3}
    manifest = {
        "id": ATLAS_ID, "title": "Rosenhain native micro-CT, mouse M01",
        "assetUrl": f"/atlas-microct/{ASSET}",
        "coordinateFrame": {"id": FRAME_ID, "assetUnits": "metres", "sourceUnits": "zero-based voxel indices",
                            "sourceVoxelSpacingMm": [SPACING_MM] * 3, "voxelIndexToAssetScale": SPACING_M,
                            "origin": "Index(0,0,0) of the supplied Analyze images; no anatomical origin is established",
                            "axes": {axis: f"native storage {axis}; anatomical direction unverified" for axis in ("x", "y", "z")},
                            "anatomicalOrientationVerified": False, "physicalCalibrationVerified": False, "registrationToDigimouse": None},
        "source": {
            "id": "rosenhain2018-native-microct", "title": "A preclinical micro-computed tomography database including 3D whole body organ segmentations",
            "displayName": "Rosenhain micro-CT", "citationLabel": "Rosenhain et al., 2018",
            "authors": ["Stefanie Rosenhain", "Zuzanna A. Magnuska", "Grace G. Yamoah", "Wa'el Al Rawashdeh", "Fabian Kiessling", "Felix Gremse"],
            "doi": "10.1038/sdata.2018.294", "publicationYear": 2018, "journal": "Scientific Data 5, 180294",
            "url": "https://doi.org/10.6084/m9.figshare.c.4224377.v1", "datasetDoi": "10.6084/m9.figshare.c.4224377.v1",
            "figshareItem": 7058615, "downloadUrl": ARCHIVE_URL, "archiveBytes": ARCHIVE_BYTES,
            "license": "CC0-1.0", "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
            "licenseEvidenceUrl": "https://api.figshare.com/v2/articles/7058615",
            "licenseNote": "The figshare record of item 7058615 declares CC0 1.0 for the dataset; the article itself is CC BY 4.0. Attribution is retained.",
            "members": [{"name": PREFIX + name, "bytes": size, "crc32": crc, "sha256": sha} for name, (size, crc, sha) in MEMBERS.items()],
            "attribution": "Rosenhain S, Magnuska ZA, Yamoah GG, Al Rawashdeh W, Kiessling F, Gremse F. A preclinical micro-computed tomography database including 3D whole body organ segmentations. Scientific Data 5, 180294 (2018). Surfaces adapted by Qasim Hussain for MouseBio_3D.",
            "methodology": "Native whole-body micro-CT (Tomoscope Duo, 65 kV) of female BALB/c nu/nu mice reconstructed at 28 micrometres and averaged to 0.28 mm; organs segmented in Imalytics Preclinical, semi-automatically for bone and lung and manually for the other organs.",
            "modifications": ["Binary interfaces of each Organ1 class and of bed class 1 on the original 0.28 mm grid", "Outward triangle winding and area-weighted normals", "Indexed glTF surfaces with the source class colours"],
        },
        "specimen": {"scientificName": "Mus musculus", "taxonomyId": "NCBITaxon:10090", "sex": "female",
                     "strain": "BALB/c nu/nu (Charles River, Sulzfeld)", "scope": "native micro-CT trunk field of view", "count": 1,
                     "description": "One female BALB/c nu/nu mouse (M01) of the native dataset, scanned at the 0.25 h time point. Age and mass are not reported.",
                     "sourceReference": "https://doi.org/10.1038/sdata.2018.294"},
        "structures": structures, "statistics": statistics,
        "bodyEvidence": body_evidence,
        "interSegmentationAgreement": {"method": "Dice coefficient between the class of the first (Organ1) and second (Organ2) segmentation files of this scan",
                                       "values": agreement},
        "limitations": [
            "One female BALB/c nu/nu mouse; this athymic, hairless strain is not generic normal anatomy, and no male, developmental, disease-specific or population-average anatomy is represented.",
            "The scanned field of view is 39.8 by 29.4 by 56.0 mm, so the head, distal limbs and tail lie partly outside it and the body surface is open at the field edges.",
            "Ten organ classes from the first segmentation file only; vessels, nerves, brain, glands and most muscles were not segmented. The muscle class covers part of a thigh.",
            "The second segmentation file of the same scan agrees with the first by Dice coefficients from 0.33 (spleen) and 0.44 (bone) to 0.90 (heart); these differences are segmentation uncertainty.",
            "The body is bed segmentation class 1, identified by containment of the organs and its attenuation, not by a source name.",
            "No named anatomical orientation or independently verified physical calibration; raw voxel indices scaled by the declared 0.28 mm spacing define this separate frame.",
            "No accepted transformation to any Digimouse frame. These surfaces must not be overlaid on another reference by matching coordinates or names.",
            "The source study gave the mice a fluorescent probe at each time point; the native scans have no CT contrast agent.",
            "These surfaces and numerical checks do not constitute independent anatomical expert review.",
        ],
        "processing": {"sourceVoxelSpacingMm": [SPACING_MM] * 3, "processingVoxelSpacingMm": [SPACING_MM] * 3,
                       "method": "consistent indexed marching tetrahedra at binary isovalue 0.5 on the original grid",
                       "padding": "one background sample around each boundary", "smoothing": False},
    }
    (OUT / "atlas.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(json.dumps({"statistics": statistics, "bodyEvidence": body_evidence, "agreement": agreement,
                      "elapsedSeconds": round(time.perf_counter() - start, 1)}, indent=2), flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--verify-existing", action="store_true", help="require the regenerated GLB to match the existing SHA-256")
    run(parser.parse_args().verify_existing)
