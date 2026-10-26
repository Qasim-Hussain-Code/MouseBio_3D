"""Generate bounded Digimouse voxel-reference meshes using only the standard library.

Source labels are sampled on an explicit processing grid, then each binary region
is intersected with a consistent six-tetrahedron subdivision of every cube.
No anatomical labels, smoothing, registration, or laterality are invented.
"""
from __future__ import annotations

import argparse
from array import array
from collections import Counter
from datetime import datetime, timezone
import gc
import hashlib
import json
import math
from pathlib import Path
import resource
import struct
import sys
import time
import zipfile

from assess_volume import EXPECTED_ARCHIVE_SHA256, describe_header, parse_label_file

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public/atlas-volume"
SOURCE = ROOT / "data/raw/atlas.zip"
FRAME_ID = "digimouse-registered-voxel-native-v1"
MAX_GLB_BYTES = 80 * 1024 * 1024
MAX_TRIANGLES = 5_000_000
SPACING_M = 0.0001
# Vertex order: x changes fastest, then y, then z. Every neighboring cube uses
# the same face diagonal, giving a conforming simplicial grid.
TETS = ((0, 1, 3, 7), (0, 1, 5, 7), (0, 2, 3, 7),
        (0, 2, 6, 7), (0, 4, 5, 7), (0, 4, 6, 7))
SYSTEMS = {
    1: ["integumentary", "muscular"], 2: ["skeletal"], 3: ["sensory"],
    4: ["nervous"], 5: ["nervous"], 6: ["nervous"], 7: ["nervous"],
    8: ["nervous"], 9: ["cardiovascular"], 10: ["nervous"],
    11: ["muscular"], 12: ["sensory"], 13: ["urinary"],
    14: ["reproductive"], 15: ["digestive"], 16: ["lymphatic", "immune"],
    17: ["digestive", "endocrine"], 18: ["digestive"], 19: ["urinary"],
    20: ["endocrine"], 21: ["respiratory"],
}
COLORS = {
    "integumentary": "#b3b4bc", "skeletal": "#ded6c2", "sensory": "#81b9b6",
    "nervous": "#c5a6d5", "cardiovascular": "#d56e76", "muscular": "#ca8293",
    "urinary": "#bc8379", "reproductive": "#c4a0ce", "digestive": "#c18a64",
    "lymphatic": "#a2739f", "endocrine": "#d0b16d", "respiratory": "#89b8c5",
}
REGION_COLORS = {
    1: "#aab9b5", 2: "#dfd7c5", 3: "#75bfc4", 4: "#af94cf", 5: "#c3a4df",
    6: "#d2b6e8", 7: "#b9a5dc", 8: "#907bb9", 9: "#d76e79", 10: "#ac8fbd",
    11: "#c58297", 12: "#71a5bd", 13: "#d5b16f", 14: "#c5a0ca", 15: "#dda78b",
    16: "#a56d9c", 17: "#d7bd72", 18: "#b87867", 19: "#c7887f", 20: "#e0c77e", 21: "#91bbc9",
}


def digest(data):
    return hashlib.sha256(data).hexdigest()


def processing_grid(step):
    raw = SOURCE.read_bytes()
    if digest(raw) != EXPECTED_ARCHIVE_SHA256:
        raise ValueError("Volume source archive differs from the reviewed checksum")
    with zipfile.ZipFile(SOURCE) as archive:
        header = describe_header(archive.read("atlas/atlas_380x992x208.hdr"))
        if header["dim"][1:5] != [380, 992, 208, 1] or header["datatypeCode"] != 2 or header["bitsPerVoxel"] != 8 or header["voxelOffset"] != 0:
            raise ValueError("Unexpected source image layout")
        labels, aggregates = parse_label_file(archive.read("atlas/atlas_380x992x208.txt").decode())
        if set(labels) != set(range(22)):
            raise ValueError("Unexpected source label inventory")
        source_dims = (380, 992, 208)
        dims = tuple((dimension + step - 1) // step + 2 for dimension in source_dims)
        nx, ny, nz = dims
        grid = bytearray(nx * ny * nz)
        counts = Counter()
        bounds = {}
        with archive.open("atlas/atlas_380x992x208.img") as image:
            for z in range(source_dims[2]):
                plane = image.read(source_dims[0] * source_dims[1])
                if len(plane) != source_dims[0] * source_dims[1]:
                    raise ValueError("Truncated source image")
                if z % step:
                    continue
                zz = z // step + 1
                for y in range(0, source_dims[1], step):
                    yy = y // step + 1
                    row = plane[y * source_dims[0]:(y + 1) * source_dims[0]:step]
                    start = nx * (yy + ny * zz) + 1
                    grid[start:start + len(row)] = row
                    counts.update(row)
                    for x, label in enumerate(row, 1):
                        if not label:
                            continue
                        if label not in bounds:
                            bounds[label] = [[x, yy, zz], [x, yy, zz]]
                        else:
                            minimum, maximum = bounds[label]
                            for axis, value in enumerate((x, yy, zz)):
                                minimum[axis] = min(minimum[axis], value)
                                maximum[axis] = max(maximum[axis], value)
            if image.read(1):
                raise ValueError("Unexpected source image tail")
        if set(bounds) != set(range(1, 22)):
            raise ValueError(f"Processing step {step} loses source labels: {set(range(1, 22)) - set(bounds)}")
    return grid, dims, bounds, counts, labels, aggregates


def polygonize(grid, dims, bounds, label, step):
    nx, ny, nz = dims
    plane_size = nx * ny
    node_count = nx * ny * nz
    unit = step * SPACING_M
    positions = array("f")
    normals = array("d")
    indices = array("I")
    edge_vertices = {}

    def point(node):
        z, rem = divmod(node, plane_size)
        y, x = divmod(rem, nx)
        return ((x - 1) * unit, (y - 1) * unit, (z - 1) * unit)

    def edge(a, b):
        if a > b:
            a, b = b, a
        key = a * node_count + b
        existing = edge_vertices.get(key)
        if existing is not None:
            return existing
        pa, pb = point(a), point(b)
        index = len(positions) // 3
        positions.extend((0.5 * (pa[0] + pb[0]), 0.5 * (pa[1] + pb[1]), 0.5 * (pa[2] + pb[2])))
        normals.extend((0, 0, 0))
        edge_vertices[key] = index
        return index

    def triangle(a, b, c, interior):
        ai, bi, ci = a * 3, b * 3, c * 3
        ax, ay, az = positions[ai:ai + 3]
        ux, uy, uz = positions[bi] - ax, positions[bi + 1] - ay, positions[bi + 2] - az
        vx, vy, vz = positions[ci] - ax, positions[ci + 1] - ay, positions[ci + 2] - az
        normal = (uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx)
        direction = sum(normal[axis] * (interior[axis] - (ax, ay, az)[axis]) for axis in range(3))
        if abs(direction) < 1e-27:
            raise ValueError("Degenerate generated triangle or tetrahedron")
        if direction > 0:
            b, c = c, b
            normal = tuple(-value for value in normal)
        indices.extend((a, b, c))
        if len(indices) // 3 > MAX_TRIANGLES:
            raise ValueError("Region exceeds five million triangle limit")
        for vertex in (a, b, c):
            for axis in range(3):
                normals[vertex * 3 + axis] += normal[axis]

    low, high = bounds
    for z in range(max(0, low[2] - 1), min(nz - 1, high[2] + 1)):
        for y in range(max(0, low[1] - 1), min(ny - 1, high[1] + 1)):
            base = nx * (y + ny * z)
            for x in range(max(0, low[0] - 1), min(nx - 1, high[0] + 1)):
                origin = base + x
                nodes = (origin, origin + 1, origin + nx, origin + nx + 1,
                         origin + plane_size, origin + plane_size + 1,
                         origin + plane_size + nx, origin + plane_size + nx + 1)
                flags = tuple(grid[node] == label for node in nodes)
                count = sum(flags)
                if count == 0 or count == 8:
                    continue
                for tetrahedron in TETS:
                    inside = [nodes[index] for index in tetrahedron if flags[index]]
                    if not inside or len(inside) == 4:
                        continue
                    outside = [nodes[index] for index in tetrahedron if not flags[index]]
                    interior = point(inside[0])
                    if len(inside) == 1:
                        triangle(*(edge(inside[0], node) for node in outside), interior)
                    elif len(inside) == 3:
                        triangle(*(edge(outside[0], node) for node in inside), interior)
                    else:
                        a, b = edge(inside[0], outside[0]), edge(inside[0], outside[1])
                        c, d = edge(inside[1], outside[0]), edge(inside[1], outside[1])
                        triangle(a, b, c, interior)
                        triangle(b, d, c, interior)
    unit_normals = array("f")
    for index in range(0, len(normals), 3):
        length = math.hypot(*normals[index:index + 3])
        if not length:
            raise ValueError("Undefined generated vertex normal")
        unit_normals.extend(value / length for value in normals[index:index + 3])
    if not indices:
        raise ValueError("Source region generated no triangles")
    return positions, unit_normals, indices


class GlbWriter:
    def __init__(self):
        self.binary = bytearray()
        self.doc = {
            "asset": {"version": "2.0", "generator": "MouseBio_3D reproducible volume converter",
                      "copyright": "Digimouse USC/UCLA original authors; adaptation Qasim Hussain; CC BY-SA 4.0"},
            "scene": 0, "scenes": [{"nodes": []}], "nodes": [], "meshes": [],
            "materials": [], "accessors": [], "bufferViews": [], "buffers": [],
        }

    def accessor(self, values, component_type, kind, target, bounds=None):
        while len(self.binary) % 4:
            self.binary.append(0)
        start = len(self.binary)
        data = array(values.typecode, values)
        if sys.byteorder != "little":
            data.byteswap()
        self.binary.extend(data.tobytes())
        view = len(self.doc["bufferViews"])
        self.doc["bufferViews"].append({"buffer": 0, "byteOffset": start, "byteLength": len(self.binary) - start, "target": target})
        accessor = {"bufferView": view, "componentType": component_type, "count": len(values) // (3 if kind == "VEC3" else 1), "type": kind}
        if bounds:
            accessor["min"], accessor["max"] = bounds
        index = len(self.doc["accessors"])
        self.doc["accessors"].append(accessor)
        return index

    def add(self, label, name, positions, normals, indices):
        bounds = [[min(positions[axis::3]) for axis in range(3)], [max(positions[axis::3]) for axis in range(3)]]
        p = self.accessor(positions, 5126, "VEC3", 34962, bounds)
        n = self.accessor(normals, 5126, "VEC3", 34962)
        i = self.accessor(indices, 5125, "SCALAR", 34963)
        color = REGION_COLORS[label]
        rgb = [int(color[offset:offset + 2], 16) / 255 for offset in (1, 3, 5)]
        material = len(self.doc["materials"])
        self.doc["materials"].append({"name": name, "pbrMetallicRoughness": {"baseColorFactor": [*rgb, 1], "metallicFactor": 0, "roughnessFactor": 0.75}})
        mesh = len(self.doc["meshes"])
        self.doc["meshes"].append({"name": f"digimouse-volume:{label}", "primitives": [{"attributes": {"POSITION": p, "NORMAL": n}, "indices": i, "material": material, "mode": 4}]})
        node = len(self.doc["nodes"])
        self.doc["nodes"].append({"name": f"digimouse-volume:{label}", "mesh": mesh, "extras": {"structureId": f"digimouse-volume:{label}", "sourceLabel": label}})
        self.doc["scenes"][0]["nodes"].append(node)
        return bounds

    def finish(self):
        self.doc["buffers"] = [{"byteLength": len(self.binary)}]
        metadata = json.dumps(self.doc, separators=(",", ":")).encode()
        metadata += b" " * (-len(metadata) % 4)
        binary = bytes(self.binary) + b"\0" * (-len(self.binary) % 4)
        length = 28 + len(metadata) + len(binary)
        if length > MAX_GLB_BYTES:
            raise ValueError("GLB exceeds the eighty MiB cap")
        return b"glTF" + struct.pack("<II", 2, length) + struct.pack("<II", len(metadata), 0x4E4F534A) + metadata + struct.pack("<II", len(binary), 0x004E4942) + binary


def source_record():
    return {
        "id": "digimouse-registered-volume-2007", "title": "Digimouse: a 3D whole body mouse atlas from CT and cryosection data",
        "authors": ["Belma Dogdas", "David Stout", "Arion F. Chatziioannou", "Richard M. Leahy"],
        "doi": "10.1088/0031-9155/52/3/003", "publicationYear": 2007,
        "url": "https://neuroimage.usc.edu/neuro/Digimouse", "downloadUrl": "https://neuroimage.usc.edu/mouse_atlas/atlas.zip",
        "license": "CC-BY-SA-4.0", "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0/",
        "licenseEvidenceUrl": "https://neuroimage.usc.edu/neuro/Digimouse_license", "archiveSha256": EXPECTED_ARCHIVE_SHA256,
        "attribution": "Digimouse, Belma Dogdas, David Stout, Arion F. Chatziioannou and Richard M. Leahy, USC/UCLA, 2007. Volume surfaces adapted by Qasim Hussain for MouseBio_3D under CC BY-SA 4.0.",
        "methodology": "Registered postmortem CT and colour cryosections from one 28 g normal nude male mouse; categorical anatomical label image.",
        "sourceVoxelSpacingMm": [0.1, 0.1, 0.1], "sourceDimensions": [380, 992, 208],
        "modifications": ["Explicit categorical grid subsampling", "Binary half-value interfaces on a consistent tetrahedral grid", "Outward triangle winding and area-weighted normals", "Indexed glTF surfaces with nonquantitative display colours"],
    }


def run(step, per_region=False, verify_existing=False):
    start = time.perf_counter()
    grid, dims, bounds, counts, labels, aggregates = processing_grid(step)
    print(f"Processing grid {dims}, {len(grid)} byte values, all21 source labels retained", flush=True)
    code = f"{step * 10:03d}"
    target = OUT / "detail" if per_region else OUT
    target.mkdir(parents=True, exist_ok=True)
    writer = GlbWriter()
    structures, assets = [], []
    total_triangles = total_vertices = 0
    selected_labels = range(3, 22) if per_region else range(1, 22)
    for label in selected_labels:
        region_start = time.perf_counter()
        positions, normals, indices = polygonize(grid, dims, bounds[label], label, step)
        name = "Body envelope / residual tissue" if label == 1 else labels[label].capitalize()
        current_writer = GlbWriter() if per_region else writer
        mesh_bounds = current_writer.add(label, name, positions, normals, indices)
        triangles, vertices = len(indices) // 3, len(positions) // 3
        record = {
            "id": f"digimouse-volume:{label}", "name": name, "systems": SYSTEMS[label],
            "sourceLabel": labels[label], "sourceRegion": label, "meshNode": f"digimouse-volume:{label}",
            "description": "A source-labelled region extracted from the registered Digimouse voxel atlas. Paired source regions are not separated by laterality.",
            "geometry": {"vertices": vertices, "triangles": triangles, "boundsMeters": mesh_bounds},
            "sourceId": "digimouse-registered-volume-2007", "scale": "organ",
            "color": REGION_COLORS[label], "defaultOpacity": 0.06 if label == 1 else 0.14 if label == 2 else 1,
        }
        if label == 1:
            record["description"] = "The source skin label is a bulk residual body region with organ cavities. It does not independently resolve epidermis or skin tissue layers."
            record["scale"] = "organism"
        if label == 2:
            record["description"] = "Aggregate skeletal label. Individual bones are not independently identified; a finer surface does not add bone names."
            record["scale"] = "system"
        structures.append(record)
        if per_region:
            glb = current_writer.finish()
            filename = f"region-{label}.glb"
            if verify_existing and (not (target / filename).exists() or digest((target / filename).read_bytes()) != digest(glb)):
                raise ValueError(f"Reproduced detail asset differs: {filename}")
            (target / filename).write_bytes(glb)
            assets.append({"structureId": record["id"], "assetUrl": f"/atlas-volume/detail/{filename}", "coordinateFrameId": FRAME_ID,
                           "processingVoxelSpacingMm": [step * 0.1] * 3, "glbBytes": len(glb), "glbSha256": digest(glb), "geometry": record["geometry"]})
        total_triangles += triangles
        total_vertices += vertices
        print(f"{label:2d} {name}: {vertices} vertices, {triangles} triangles, {time.perf_counter() - region_start:.2f}s", flush=True)
        del positions, normals, indices
        gc.collect()
    stats = {"structures": len(structures), "triangles": total_triangles, "surfaceVerticesIncludingRegionBoundaries": total_vertices,
             "processingGridDimensionsWithPadding": list(dims), "processingGridBytes": len(grid),
             "processingVoxelSpacingMm": [step * 0.1] * 3, "sourceVoxelSpacingMm": [0.1] * 3,
             "sampledVoxelCounts": dict(sorted(counts.items()))}
    limitations = [
        "One postmortem normal nude male mouse; no female, developmental, disease-specific or population-average anatomy.",
        "Voxel label boundaries have finite source resolution; subsampling can remove thin features and small components. Processing spacing is distinct from source spacing and is not a surface-accuracy guarantee.",
        "No named anatomical orientation or independently verified physical calibration; raw voxel indices define this separate frame.",
        "No accepted transformation to the tessellated Digimouse frame. These assets must not be overlaid on that model by matching coordinates or label numbers.",
        "The source skin label is residual bulk body tissue, not a separately segmented skin layer. Skeleton remains aggregate and most individual muscles are absent.",
        "Paired eyes, glands, kidneys, testes and lungs use shared labels; no laterality, individual lobe or tissue subdivision is inferred.",
        "Separate binary interfaces approximate each region; multi-label junctions can have gaps from the half-value representation. No smoothing or fabricated tissue fills these gaps.",
        "These surfaces and numerical topology checks do not constitute independent anatomical expert review or physiological validation.",
    ]
    coordinate = {"id": FRAME_ID, "assetUnits": "metres", "sourceUnits": "zero-based voxel indices",
                  "sourceVoxelSpacingMm": [0.1] * 3, "voxelIndexToAssetScale": SPACING_M,
                  "origin": "Index(0,0,0) of the supplied Analyze image; no anatomical origin is established",
                  "axes": {axis: f"native storage {axis}; anatomical direction unverified" for axis in ("x", "y", "z")},
                  "anatomicalOrientationVerified": False, "physicalCalibrationVerified": False, "voxelToTetrahedralAffine": None}
    benchmark = {"elapsedSeconds": time.perf_counter() - start, "peakResidentKiB": resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,
                 "measuredAtUtc": datetime.now(timezone.utc).isoformat(timespec="seconds"), "step": step, "perRegion": per_region}
    if per_region:
        stats.update({"glbBytesTotal": sum(asset["glbBytes"] for asset in assets)})
        result = {"schemaVersion": "mousebio.volume-detail-index.v1", "atlasId": "digimouse-volume-040-v1", "coordinateFrame": coordinate, "source": source_record(),
                  "structures": structures, "assets": assets, "statistics": stats, "limitations": limitations, "benchmark": benchmark}
        result["unavailable"] = [{"structureId": f"digimouse-volume:{label}", "reason": "Fine envelope and aggregate skeleton surfaces are deliberately omitted to limit storage and rendering cost; the complete coarse reference retains this source label."} for label in (1, 2)]
        (OUT / "detail-index.json").write_text(json.dumps(result, indent=2) + "\n")
    else:
        glb = writer.finish()
        filename = f"digimouse-volume-{code}.glb"
        if verify_existing and (not (target / filename).exists() or digest((target / filename).read_bytes()) != digest(glb)):
            raise ValueError("Reproduced coarse asset differs from the existing GLB")
        (target / filename).write_bytes(glb)
        stats.update({"glbBytes": len(glb), "glbSha256": digest(glb)})
        result = {"id": f"digimouse-volume-{code}-v1", "title": "Digimouse registered voxel atlas",
                  "assetUrl": f"/atlas-volume/{filename}", "coordinateFrame": coordinate, "source": source_record(),
                  "structures": structures, "statistics": stats, "limitations": limitations, "benchmark": benchmark,
                  "detailIndexUrl": "/atlas-volume/detail-index.json",
                  "processing": {"sourceVoxelSpacingMm": [0.1] * 3, "processingVoxelSpacingMm": [step * 0.1] * 3,
                                 "method": "categorical subsampling and consistent indexed marching tetrahedra at binary isovalue0.5",
                                 "sampleOffsetSourceIndices": [0, 0, 0], "padding": "one background sample around each boundary", "smoothing": False}}
        benchmark.update({"elapsedSeconds": time.perf_counter() - start,
                          "peakResidentKiB": resource.getrusage(resource.RUSAGE_SELF).ru_maxrss})
        (target / "atlas.json").write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps({"statistics": stats, "benchmark": benchmark}, indent=2), flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--step", type=int, choices=(1, 2, 4), default=4)
    parser.add_argument("--per-region", action="store_true")
    parser.add_argument("--verify-existing", action="store_true", help="require each regenerated GLB to match its existing SHA-256")
    arguments = parser.parse_args()
    run(arguments.step, arguments.per_region, arguments.verify_existing)
