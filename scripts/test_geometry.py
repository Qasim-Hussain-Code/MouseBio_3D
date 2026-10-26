"""Dependency-free checks of the imported glTF and boundary algorithm."""
from __future__ import annotations

from collections import Counter
import hashlib
import json
import math
from pathlib import Path
import struct
import unittest

from import_digimouse import ROOT, cross, dot, surface_for_region, vector_sub


def read_glb(path):
    raw = path.read_bytes()
    if raw[:4] != b"glTF":
        raise ValueError("Invalid GLB magic")
    version, length = struct.unpack_from("<II", raw, 4)
    if version != 2 or length != len(raw):
        raise ValueError("Invalid GLB header")
    json_length, json_kind = struct.unpack_from("<II", raw, 12)
    if json_kind != 0x4E4F534A:
        raise ValueError("Missing JSON chunk")
    metadata = json.loads(raw[20:20 + json_length])
    binary_start = 20 + json_length
    binary_length, binary_kind = struct.unpack_from("<II", raw, binary_start)
    if binary_kind != 0x004E4942 or binary_start + 8 + binary_length != len(raw):
        raise ValueError("Invalid binary chunk")
    binary = raw[binary_start + 8:]
    return raw, metadata, binary


def accessor_values(document, binary, index):
    accessor = document["accessors"][index]
    view = document["bufferViews"][accessor["bufferView"]]
    size = {"VEC3": 3, "SCALAR": 1}[accessor["type"]]
    code = {5126: "f", 5125: "I"}[accessor["componentType"]]
    offset = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
    count = accessor["count"] * size
    values = struct.unpack_from("<" + code * count, binary, offset)
    return [tuple(values[i:i + size]) for i in range(0, len(values), size)] if size > 1 else values


class BoundaryAlgorithmTests(unittest.TestCase):
    def test_single_tetrahedron_normals_point_outward(self):
        vertices = [(0, 0, 0), (1, 0, 0), (0, 1, 0), (0, 0, 1)]
        faces = surface_for_region(vertices, [(0, 1, 2, 3)])
        self.assertEqual(len(faces), 4)
        centre = (0.25, 0.25, 0.25)
        for a, b, c in faces:
            normal = cross(vector_sub(vertices[b], vertices[a]), vector_sub(vertices[c], vertices[a]))
            self.assertLess(dot(normal, vector_sub(centre, vertices[a])), 0)

    def test_shared_interior_face_removed(self):
        vertices = [(0, 0, 0), (1, 0, 0), (0, 1, 0), (0, 0, 1), (0, 0, -1)]
        faces = surface_for_region(vertices, [(0, 1, 2, 3), (0, 2, 1, 4)])
        self.assertEqual(len(faces), 6)
        self.assertNotIn((0, 1, 2), [tuple(sorted(face)) for face in faces])


class ImportedGeometryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.raw, cls.document, cls.binary = read_glb(ROOT / "public/atlas/digimouse.glb")
        cls.manifest = json.loads((ROOT / "public/atlas/atlas.json").read_text())

    def meshes(self):
        for node in self.document["nodes"]:
            primitive = self.document["meshes"][node["mesh"]]["primitives"][0]
            positions = accessor_values(self.document, self.binary, primitive["attributes"]["POSITION"])
            normals = accessor_values(self.document, self.binary, primitive["attributes"]["NORMAL"])
            indices = accessor_values(self.document, self.binary, primitive["indices"])
            faces = [tuple(indices[i:i + 3]) for i in range(0, len(indices), 3)]
            yield node["name"], positions, normals, faces

    def test_exact_source_inventory_and_stable_ids(self):
        ids = {f"digimouse:{i}" for i in range(1, 18)}
        self.assertEqual({node["name"] for node in self.document["nodes"]}, ids)
        self.assertEqual({s["id"] for s in self.manifest["structures"]}, ids)
        self.assertEqual(len(self.document["nodes"]), len(ids))
        self.assertEqual(len(self.document["meshes"]), len(ids))
        self.assertEqual(self.document["scenes"][0]["nodes"], list(range(17)))
        for structure in self.manifest["structures"]:
            self.assertEqual(structure["id"], structure["meshNode"])
            self.assertTrue(structure["sourceLabel"])
            self.assertTrue(structure["systems"])

    def test_hash_and_counts(self):
        stats = self.manifest["statistics"]
        self.assertEqual(len(self.raw), stats["glbBytes"])
        self.assertEqual(hashlib.sha256(self.raw).hexdigest(), stats["glbSha256"])
        self.assertEqual(sum(len(f) for _, _, _, f in self.meshes()), stats["triangles"])
        self.assertEqual(sum(len(p) for _, p, _, _ in self.meshes()), stats["surfaceVerticesIncludingRegionBoundaries"])

    def test_buffer_accessors_within_bounds(self):
        for accessor in self.document["accessors"]:
            view = self.document["bufferViews"][accessor["bufferView"]]
            start = view.get("byteOffset", 0)
            self.assertEqual(start % 4, 0)
            self.assertLessEqual(start + view["byteLength"], len(self.binary))
            width = 3 if accessor["type"] == "VEC3" else 1
            self.assertEqual(accessor["count"] * width * 4, view["byteLength"])

    def test_coordinates_indices_normals_and_closed_oriented_surfaces(self):
        for name, positions, normals, faces in self.meshes():
            with self.subTest(structure=name):
                self.assertEqual(len(positions), len(normals))
                self.assertTrue(all(math.isfinite(value) for p in positions for value in p))
                self.assertTrue(all(abs(math.sqrt(dot(n, n)) - 1) < 1e-5 for n in normals))
                self.assertTrue(all(0 <= index < len(positions) for f in faces for index in f))
                self.assertEqual(len(faces), len({tuple(sorted(f)) for f in faces}))
                edge_counts = Counter()
                directed_edges = Counter()
                volume = 0
                for a, b, c in faces:
                    self.assertEqual(len({a, b, c}), 3)
                    face_normal = cross(vector_sub(positions[b], positions[a]), vector_sub(positions[c], positions[a]))
                    self.assertGreater(dot(face_normal, face_normal), 1e-30)
                    volume += dot(positions[a], cross(positions[b], positions[c])) / 6
                    for i, j in ((a, b), (b, c), (c, a)):
                        edge_counts[tuple(sorted((i, j)))] += 1
                        directed_edges[(i, j)] += 1
                self.assertTrue(all(count == 2 for count in edge_counts.values()), "Nonmanifold or open edge")
                self.assertTrue(all(directed_edges[(i, j)] == directed_edges[(j, i)] for i, j in directed_edges), "Inconsistent winding")
                self.assertGreater(volume, 0)

    def test_coordinate_convention_and_physical_limits(self):
        coordinate_frame = self.manifest["coordinateFrame"]
        self.assertEqual(coordinate_frame["sourceToAssetScale"], 0.001)
        self.assertEqual(coordinate_frame["assetUnits"], "metres")
        self.assertFalse(coordinate_frame["anatomicalOrientationVerified"])
        self.assertFalse(coordinate_frame["physicalCalibrationVerified"])
        points = [p for _, positions, _, _ in self.meshes() for p in positions]
        extents = [max(p[a] for p in points) - min(p[a] for p in points) for a in range(3)]
        self.assertTrue(all(0.001 < extent < 0.15 for extent in extents))
        print("Native-axis mesh extents (interpreted metres):", extents)


if __name__ == "__main__":
    unittest.main(verbosity=2)
