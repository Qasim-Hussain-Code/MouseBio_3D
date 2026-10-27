"""Convert the licensed Digimouse tetrahedral atlas to segmented glTF 2.0.

Only Python's standard library is required. No interpolated anatomy, mesh
decimation, or anatomical registration is performed. See docs/geometry.md.
"""
from __future__ import annotations

import argparse
from array import array
from collections import Counter, defaultdict
import hashlib
import json
import math
from pathlib import Path
import struct
import sys
import urllib.request
import zipfile
import zlib

ROOT = Path(__file__).resolve().parents[1]
ARCHIVE = ROOT / "data/raw/tesselated_atlas.zip"
OUTPUT = ROOT / "public/atlas"
SOURCE_URL = "https://neuroimage.usc.edu/mouse_atlas/tesselated_atlas.zip"
LICENSE_URL = "https://neuroimage.usc.edu/neuro/Digimouse_license"
MAX_DOWNLOAD = 50 * 1024 * 1024
MAX_UNCOMPRESSED = 20 * 1024 * 1024
MM_TO_M = 0.001
EXPECTED_ARCHIVE_SHA256 = "78c09b567497d80586a5403206494f9dea620940d61b87806f5b34f46cd6415d"

REGIONS = {
    1: ("Body envelope / residual tissue", "inside skin (muscle)", ["muscular", "integumentary"], "#b3b4bc"),
    2: ("Brain", "brain", ["nervous"], "#c5a9df"),
    3: ("Heart", "heart", ["cardiovascular"], "#d56e76"),
    4: ("Bladder", "bladder", ["urinary"], "#d5b06d"),
    5: ("Stomach", "stomach", ["digestive"], "#dfac8e"),
    6: ("Spleen", "spleen", ["lymphatic", "immune"], "#aa6b9c"),
    7: ("Kidney, region 7", "kidneys", ["urinary"], "#b8797a"),
    8: ("Kidney, region 8", "kidneys", ["urinary"], "#c88b80"),
    9: ("Lung, region 9", "lungs", ["respiratory"], "#80b8c4"),
    10: ("Lung, region 10", "lungs", ["respiratory"], "#94c9cf"),
    11: ("Pancreas", "pancreas", ["digestive", "endocrine"], "#d4b870"),
    12: ("Liver", "liver", ["digestive"], "#a6645f"),
    13: ("Skeleton, aggregate", "skeleton", ["skeletal"], "#e2d9c5"),
    14: ("Muscle, region 14", "muscle", ["muscular"], "#c7808e"),
    15: ("Muscle, region 15", "muscle", ["muscular"], "#d58a98"),
    16: ("Testis, region 16", "testis", ["reproductive"], "#ba9ed0"),
    17: ("Testis, region 17", "testis", ["reproductive"], "#c8aed8"),
}


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def download() -> None:
    """Download one bounded archive; never overwrite an existing raw source."""
    if ARCHIVE.exists():
        return
    request = urllib.request.Request(SOURCE_URL, method="HEAD")
    with urllib.request.urlopen(request, timeout=30) as response:
        size = response.headers.get("Content-Length")
        if size is None or int(size) > MAX_DOWNLOAD:
            raise ValueError("Missing size or archive exceeds 50 MiB limit")
    ARCHIVE.parent.mkdir(parents=True, exist_ok=True)
    # Exclusive creation prevents replacement of a user's existing archive.
    with urllib.request.urlopen(SOURCE_URL, timeout=60) as response, ARCHIVE.open("xb") as target:
        total = 0
        while block := response.read(1024 * 1024):
            total += len(block)
            if total > MAX_DOWNLOAD:
                raise ValueError("Archive exceeds 50 MiB limit")
            target.write(block)


def mat_elements(data: bytes, start: int = 0):
    """Read little-endian MATLAB v5 tags, including small data elements."""
    offset = start
    while offset + 8 <= len(data):
        tag, size = struct.unpack_from("<II", data, offset)
        if tag >> 16:
            length = tag >> 16
            if length > 4:
                raise ValueError("Invalid small MATLAB data element")
            yield tag & 0xFFFF, data[offset + 4:offset + 4 + length]
            offset += 8
        else:
            end = offset + 8 + size
            if end > len(data):
                raise ValueError("Truncated MATLAB data element")
            yield tag, data[offset + 8:end]
            # The source uses consecutive unpadded miCOMPRESSED elements.
            offset = end if tag == 15 else offset + 8 + (size + 7) // 8 * 8


def read_mat(data: bytes) -> dict:
    """Read only dense numeric arrays from this known MATLAB v5 source.

    This is not a general MATLAB loader. Unsupported classes fail explicitly.
    Compressed output is bounded before further processing.
    """
    if len(data) < 128 or data[126:128] != b"IM":
        raise ValueError("Expected a little-endian MATLAB v5 file")
    matrices = {}

    def visit(payload: bytes, start: int = 0):
        for tag, body in mat_elements(payload, start):
            if tag == 15:
                decompressor = zlib.decompressobj()
                expanded = decompressor.decompress(body, MAX_UNCOMPRESSED + 1)
                if len(expanded) > MAX_UNCOMPRESSED or decompressor.unconsumed_tail:
                    raise ValueError("Compressed MATLAB element exceeds limit")
                visit(expanded)
            elif tag == 14:
                parts = list(mat_elements(body))
                if len(parts) != 4:
                    raise ValueError("Unsupported MATLAB matrix layout")
                _, flags = parts[0]
                _, dimensions = parts[1]
                _, name_bytes = parts[2]
                numeric_type, values = parts[3]
                if struct.unpack_from("<I", flags)[0] & 0x800:
                    raise ValueError("Complex arrays are unsupported")
                name = name_bytes.decode("ascii")
                dims = struct.unpack("<" + "i" * (len(dimensions) // 4), dimensions)
                typecode = {5: "i", 6: "I", 9: "d", 16: "B"}.get(numeric_type)
                if typecode is None:
                    raise ValueError(f"Unsupported MATLAB numeric type {numeric_type}")
                result = array(typecode)
                result.frombytes(values)
                if sys.byteorder != "little" and result.itemsize > 1:
                    result.byteswap()
                if len(result) != math.prod(dims):
                    raise ValueError("Inconsistent MATLAB dimensions")
                matrices[name] = (dims, result)
            else:
                raise ValueError(f"Unexpected MATLAB element {tag}")

    visit(data, 128)
    return matrices


def vector_sub(a, b):
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def dot(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def surface_for_region(vertices, tetrahedra):
    """Find region boundaries and orient each triangle away from its tetrahedron."""
    faces = {}
    for tetrahedron in tetrahedra:
        for a, b, c, opposite in (
            (tetrahedron[0], tetrahedron[1], tetrahedron[2], tetrahedron[3]),
            (tetrahedron[0], tetrahedron[3], tetrahedron[1], tetrahedron[2]),
            (tetrahedron[0], tetrahedron[2], tetrahedron[3], tetrahedron[1]),
            (tetrahedron[1], tetrahedron[3], tetrahedron[2], tetrahedron[0]),
        ):
            key = tuple(sorted((a, b, c)))
            if key in faces:
                del faces[key]
                continue
            normal = cross(vector_sub(vertices[b], vertices[a]), vector_sub(vertices[c], vertices[a]))
            towards_interior = dot(normal, vector_sub(vertices[opposite], vertices[a]))
            if abs(towards_interior) < 1e-24:
                raise ValueError("Degenerate tetrahedron")
            faces[key] = (a, c, b) if towards_interior > 0 else (a, b, c)
    return [faces[key] for key in sorted(faces)]


def prepare_mesh(vertices, faces):
    used = sorted({index for face in faces for index in face})
    index_map = {old: new for new, old in enumerate(used)}
    positions = [vertices[index] for index in used]
    local_faces = [tuple(index_map[index] for index in face) for face in faces]
    normals = [[0.0, 0.0, 0.0] for _ in positions]
    for a, b, c in local_faces:
        face_normal = cross(vector_sub(positions[b], positions[a]), vector_sub(positions[c], positions[a]))
        for vertex in (a, b, c):
            for axis in range(3):
                normals[vertex][axis] += face_normal[axis]
    for normal in normals:
        length = math.sqrt(dot(normal, normal))
        if length == 0:
            raise ValueError("Undefined vertex normal")
        for axis in range(3):
            normal[axis] /= length
    return positions, normals, local_faces


class GlbWriter:
    def __init__(self):
        self.binary = bytearray()
        self.document = {
            "asset": {
                "version": "2.0",
                "generator": "MouseBio_3D reproducible Digimouse boundary converter",
                "copyright": "Digimouse, USC Biomedical Imaging Group and original authors; CC BY-SA 4.0",
            },
            "scene": 0,
            "scenes": [{"nodes": []}],
            "nodes": [], "meshes": [], "materials": [], "accessors": [], "bufferViews": [],
            "buffers": [],
        }

    def accessor(self, values, format_code, component_type, gltf_type, count, target, bounds=None):
        while len(self.binary) % 4:
            self.binary.append(0)
        start = len(self.binary)
        packed = array(format_code, values)
        if sys.byteorder != "little":
            packed.byteswap()
        self.binary.extend(packed.tobytes())
        view_id = len(self.document["bufferViews"])
        self.document["bufferViews"].append({
            "buffer": 0, "byteOffset": start, "byteLength": len(self.binary) - start, "target": target,
        })
        accessor_id = len(self.document["accessors"])
        accessor = {"bufferView": view_id, "componentType": component_type, "count": count, "type": gltf_type}
        if bounds:
            accessor["min"], accessor["max"] = bounds
        self.document["accessors"].append(accessor)
        return accessor_id

    def add_mesh(self, region, positions, normals, faces):
        name, _, _, color = REGIONS[region]
        bounds = ([min(v[a] for v in positions) for a in range(3)], [max(v[a] for v in positions) for a in range(3)])
        position_id = self.accessor((x for v in positions for x in v), "f", 5126, "VEC3", len(positions), 34962, bounds)
        normal_id = self.accessor((x for v in normals for x in v), "f", 5126, "VEC3", len(normals), 34962)
        index_id = self.accessor((x for face in faces for x in face), "I", 5125, "SCALAR", len(faces) * 3, 34963)
        rgb = [int(color[i:i + 2], 16) / 255 for i in (1, 3, 5)]
        material_id = len(self.document["materials"])
        self.document["materials"].append({
            "name": name, "pbrMetallicRoughness": {"baseColorFactor": [*rgb, 1], "metallicFactor": 0, "roughnessFactor": 0.72},
            "doubleSided": False,
        })
        mesh_id = len(self.document["meshes"])
        self.document["meshes"].append({"name": f"digimouse:{region}", "primitives": [{
            "attributes": {"POSITION": position_id, "NORMAL": normal_id}, "indices": index_id,
            "material": material_id, "mode": 4,
        }]})
        node_id = len(self.document["nodes"])
        self.document["nodes"].append({
            "name": f"digimouse:{region}", "mesh": mesh_id,
            "extras": {"structureId": f"digimouse:{region}", "sourceRegion": region},
        })
        self.document["scenes"][0]["nodes"].append(node_id)
        return bounds

    def finish(self):
        self.document["buffers"] = [{"byteLength": len(self.binary)}]
        metadata = json.dumps(self.document, ensure_ascii=True, separators=(",", ":")).encode("utf-8")
        metadata += b" " * (-len(metadata) % 4)
        binary = bytes(self.binary) + b"\0" * (-len(self.binary) % 4)
        total = 12 + 8 + len(metadata) + 8 + len(binary)
        return b"glTF" + struct.pack("<II", 2, total) + struct.pack("<II", len(metadata), 0x4E4F534A) + metadata + struct.pack("<II", len(binary), 0x004E4942) + binary


def convert():
    raw_zip = ARCHIVE.read_bytes()
    if len(raw_zip) > MAX_DOWNLOAD:
        raise ValueError("Archive exceeds size limit")
    if sha256(raw_zip) != EXPECTED_ARCHIVE_SHA256:
        raise ValueError("Upstream archive checksum differs from the reviewed source; inspect it before updating the pinned checksum")
    with zipfile.ZipFile(ARCHIVE) as archive:
        if sum(info.file_size for info in archive.infolist()) > MAX_UNCOMPRESSED:
            raise ValueError("Archive exceeds extraction limit")
        raw_mat = archive.read("tesselated_atlas/Tesselated_Atlas.mat")
        source_labels = archive.read("tesselated_atlas/labels_4_tetrahedrons.txt")
    matrices = read_mat(raw_mat)
    dims_r, r = matrices["r"]
    dims_t, t = matrices["T"]
    dims_cond, cond = matrices["cond"]
    if dims_r != (58244, 3) or dims_t != (306773, 4) or dims_cond != (306773, 1):
        raise ValueError("Unexpected upstream dimensions; review source before import")
    count = dims_r[0]
    # Preserve all source axes and origin. Conversion is a uniform scale only.
    vertices = [tuple(r[i + count * a] * MM_TO_M for a in range(3)) for i in range(count)]
    if not all(math.isfinite(v) for vertex in vertices for v in vertex):
        raise ValueError("Nonfinite source coordinate")
    tet_count = dims_t[0]
    regions = defaultdict(list)
    for i in range(tet_count):
        tetrahedron = tuple(t[i + tet_count * a] - 1 for a in range(4))
        if len(set(tetrahedron)) != 4 or min(tetrahedron) < 0 or max(tetrahedron) >= count:
            raise ValueError("Invalid tetrahedral index")
        if cond[i] not in REGIONS:
            raise ValueError("Unknown source region")
        regions[cond[i]].append(tetrahedron)

    writer = GlbWriter()
    structures = []
    total_faces = total_vertices = 0
    for region in sorted(regions):
        faces = surface_for_region(vertices, regions[region])
        positions, normals, local_faces = prepare_mesh(vertices, faces)
        bounds = writer.add_mesh(region, positions, normals, local_faces)
        name, label, systems, color = REGIONS[region]
        description = "Surface extracted from the source region's tetrahedra; internal same-region faces removed."
        if region == 1:
            description += " This is a residual tissue volume bounded by the outer body and organ cavities, not a separately segmented skin or a complete muscle inventory."
        if region in (7, 8, 9, 10, 14, 15, 16, 17):
            description += " Source labels do not establish anatomical laterality."
        structures.append({
            "id": f"digimouse:{region}", "name": name, "systems": systems,
            "sourceLabel": label, "sourceRegion": region, "meshNode": f"digimouse:{region}",
            "description": description, "color": color, "ontologyIds": [],
            "classification": "source-segmented region", "sourceId": "digimouse-2007",
            "metadata": {"sex": "male", "species": "Mus musculus", "specimen": "single 28 g normal nude male mouse"},
            "geometry": {"vertices": len(positions), "triangles": len(local_faces), "tetrahedra": len(regions[region]), "boundsMeters": bounds},
        })
        total_faces += len(faces)
        total_vertices += len(positions)
        print(f"region {region}: {name}: {len(positions)} vertices, {len(faces)} triangles", flush=True)

    glb = writer.finish()
    coordinate_frame = {
        "id": "digimouse-tessellated-native-v1", "handedness": "right-handed numerical Cartesian frame",
        "sourceUnits": "interpreted millimetres", "assetUnits": "metres",
        "sourceToAssetScale": MM_TO_M,
        "sourceToAssetMatrix": [MM_TO_M, 0, 0, 0, 0, MM_TO_M, 0, 0, 0, 0, MM_TO_M, 0, 0, 0, 0, 1],
        "origin": "Upstream mesh origin, unchanged apart from uniform scale",
        "axes": {"x": "native x; anatomical direction unverified", "y": "native y; anatomical direction unverified", "z": "native z; anatomical direction unverified"},
        "unitEvidence": "Native coordinate extents correspond to the millimetre extent of the registered 0.1 mm atlas. The distributed MAT file contains no explicit unit or orientation tags. Physical measurements and anatomical direction labels remain disabled pending independent verification.",
        "anatomicalOrientationVerified": False, "physicalCalibrationVerified": False,
    }
    limitations = [
        "One postmortem normal nude male mouse; not a population average or female anatomy.",
        "The tetrahedral model was generated from a 0.4 mm downsampled atlas. The original registered image volume is 0.1 mm isotropic; neither value is a guarantee of surface accuracy.",
        "Only 17 source-labelled regions are present. The full volumetric Digimouse atlas contains more labels than this mesh.",
        "Skeleton and brain are aggregate regions; individual bones, brain subdivisions, nerves, vessels, tissue layers and cells are not resolved.",
        "Source mesh labels do not specify laterality of paired organs or identify the two muscle regions more precisely.",
        "Native anatomical axis directions and coordinate calibration have not been independently verified.",
        "No anatomical geometry has been invented to fill missing coverage; extracted surfaces have not undergone independent anatomical expert review.",
    ]
    manifest = {
        "id": "digimouse-tessellated-v1", "title": "Digimouse tessellated atlas",
        "assetUrl": "/atlas/digimouse.glb", "coordinateFrame": coordinate_frame,
        "specimen": {"scientificName": "Mus musculus", "taxonomyId": "NCBITaxon:10090", "sex": "male",
                     "mass": {"value": 28, "unit": "g"}, "scope": "whole-body reference", "count": 1,
                     "description": "One 28 g normal nude male mouse.",
                     "sourceReference": "https://doi.org/10.1088/0031-9155/52/3/003"},
        "source": {
            "id": "digimouse-2007", "title": "Digimouse: a 3D whole body mouse atlas from CT and cryosection data",
            "displayName": "Digimouse", "citationLabel": "Dogdas et al., 2007",
            "authors": ["Belma Dogdas", "David Stout", "Arion F. Chatziioannou", "Richard M. Leahy"],
            "institution": "USC Biomedical Imaging Group and UCLA collaborators",
            "publicationYear": 2007, "doi": "10.1088/0031-9155/52/3/003",
            "url": "https://neuroimage.usc.edu/neuro/Digimouse", "downloadUrl": SOURCE_URL,
            "license": "CC-BY-SA-4.0", "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0/",
            "licenseEvidenceUrl": LICENSE_URL, "verifiedOn": "2026-10-25",
            "attribution": "Digimouse, Belma Dogdas, David Stout, Arion F. Chatziioannou and Richard M. Leahy, USC/UCLA, 2007. Mesh adapted by Qasim Hussain for MouseBio_3D under CC BY-SA 4.0.",
            "methodology": "Coregistered postmortem CT and colour cryosections; labelled anatomy and constrained Delaunay tetrahedral mesh.",
            "registeredVoxelSizeMm": [0.1, 0.1, 0.1], "meshSourceVoxelSizeMm": [0.4, 0.4, 0.4],
            "archiveSha256": sha256(raw_zip), "matSha256": sha256(raw_mat),
            "modifications": ["Extracted each region's tetrahedral boundary", "Oriented triangle normals outward", "Uniform native-coordinate scale of 0.001 for metre-valued glTF positions", "Area-weighted vertex normals", "One indexed mesh per source region", "Assigned nonquantitative display colours"],
        },
        "structures": structures,
        "statistics": {"structures": len(structures), "sourceNodes": count, "sourceTetrahedra": tet_count,
                       "surfaceVerticesIncludingRegionBoundaries": total_vertices, "triangles": total_faces,
                       "glbBytes": len(glb), "glbSha256": sha256(glb), "archiveBytes": len(raw_zip)},
        "limitations": limitations,
    }
    OUTPUT.mkdir(parents=True, exist_ok=True)
    (OUTPUT / "digimouse.glb").write_bytes(glb)
    (OUTPUT / "atlas.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    provenance = ROOT / "data/provenance"
    provenance.mkdir(parents=True, exist_ok=True)
    (provenance / "digimouse-source-labels.txt").write_bytes(source_labels)
    print(json.dumps(manifest["statistics"], indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--download", action="store_true", help="download the bounded licensed source archive if absent")
    args = parser.parse_args()
    if args.download:
        download()
    convert()
