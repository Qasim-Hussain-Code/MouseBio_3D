"""Actual volume asset geometry and source-provenance checks, without WebGL."""
from array import array
from collections import Counter
import hashlib
import json
import math
import struct
import unittest

from import_volume import ROOT, FRAME_ID, SPACING_M, DETAIL_LEVELS, conversion_selection, polygonize


def read_glb(path):
    raw = path.read_bytes()
    if raw[:4] != b"glTF" or struct.unpack_from("<II", raw, 4) != (2, len(raw)):
        raise ValueError("Invalid GLB header")
    length, kind = struct.unpack_from("<II", raw, 12)
    if kind != 0x4E4F534A:
        raise ValueError("Expected JSON chunk")
    document = json.loads(raw[20:20 + length])
    offset = 20 + length
    binary_length, kind = struct.unpack_from("<II", raw, offset)
    if kind != 0x004E4942 or offset + 8 + binary_length != len(raw):
        raise ValueError("Invalid GLB binary chunk")
    return raw, document, memoryview(raw)[offset + 8:]


def values(document, binary, index):
    accessor = document["accessors"][index]
    view = document["bufferViews"][accessor["bufferView"]]
    code = "f" if accessor["componentType"] == 5126 else "I"
    result = array(code)
    start = view.get("byteOffset", 0)
    result.frombytes(binary[start:start + view["byteLength"]])
    return result


def geometry_report(positions, normals, indices):
    vertices = len(positions) // 3
    if not vertices or len(normals) != len(positions) or not len(indices) or len(indices) % 3:
        raise ValueError("Invalid position, normal or index counts")
    if not all(math.isfinite(value) for value in positions):
        raise ValueError("Nonfinite positions")
    for i in range(0, len(normals), 3):
        if abs(math.hypot(*normals[i:i + 3]) - 1) > 1e-5:
            raise ValueError("Invalid unit normal")
    edges = {}
    heads = array("i", [-1]) * vertices
    following = array("i", [-1]) * len(indices)
    signed_volume = 0.0
    minimum_area_squared = math.inf
    face_keys = set()
    reverse_weight = 1 << 32
    for offset in range(0, len(indices), 3):
        a, b, c = indices[offset:offset + 3]
        if a == b or b == c or c == a or max(a, b, c) >= vertices:
            raise ValueError("Invalid triangle index")
        face_key = tuple(sorted((a, b, c)))
        if face_key in face_keys:
            raise ValueError("Duplicate triangle")
        face_keys.add(face_key)
        for occurrence in range(offset, offset + 3):
            vertex = indices[occurrence]
            following[occurrence] = heads[vertex]
            heads[vertex] = occurrence
        ax, ay, az = positions[a * 3:a * 3 + 3]
        bx, by, bz = positions[b * 3:b * 3 + 3]
        cx, cy, cz = positions[c * 3:c * 3 + 3]
        ux, uy, uz = bx - ax, by - ay, bz - az
        vx, vy, vz = cx - ax, cy - ay, cz - az
        nx, ny, nz = uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx
        area_squared = nx * nx + ny * ny + nz * nz
        minimum_area_squared = min(minimum_area_squared, area_squared)
        if area_squared <= 1e-30:
            raise ValueError("Degenerate triangle")
        signed_volume += (ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx)) / 6
        for first, second in ((a, b), (b, c), (c, a)):
            low, high = (first, second) if first < second else (second, first)
            key = low * vertices + high
            edges[key] = edges.get(key, 0) + (1 if first < second else reverse_weight)
    if any(value != reverse_weight + 1 for value in edges.values()):
        raise ValueError("An edge is open, nonmanifold or inconsistently wound")
    del edges, face_keys
    for vertex in range(vertices):
        link = {}
        occurrence = heads[vertex]
        if occurrence == -1:
            raise ValueError("An isolated surface vertex is unused")
        while occurrence != -1:
            face_start, local = divmod(occurrence, 3)
            a = indices[face_start * 3 + (local + 1) % 3]
            b = indices[face_start * 3 + (local + 2) % 3]
            link.setdefault(a, []).append(b)
            link.setdefault(b, []).append(a)
            occurrence = following[occurrence]
        if any(len(neighbours) != 2 for neighbours in link.values()):
            raise ValueError("A vertex link is not a closed cycle")
        visited, pending = set(), [next(iter(link))]
        while pending:
            current = pending.pop()
            if current not in visited:
                visited.add(current)
                pending.extend(link[current])
        if len(visited) != len(link):
            raise ValueError("A vertex has disconnected surface fans")
    if signed_volume <= 0:
        raise ValueError("Region has nonpositive oriented volume")
    return {"vertices": vertices, "triangles": len(indices) // 3, "edges": len(indices) // 2, "closedVertexLinks": True,
            "signedVolumeCubicMetres": signed_volume, "minimumDoubleAreaSquared": minimum_area_squared}


class MarchingTetrahedraTests(unittest.TestCase):
    def test_native_conversion_is_bounded_before_grid_allocation(self):
        self.assertEqual(conversion_selection(1, True), ("source-010", (12, 20)))
        self.assertEqual(conversion_selection(1, True, "source-010", [20]), ("source-010", (20,)))
        for parameters in ((1, False), (2, False), (4, True), (1, True, "fine-020"),
                           (2, True, "source-010"), (1, True, "source-010", [1]),
                           (1, True, "source-010", [12, 12]), (1, True, "source-010", [])):
            with self.subTest(parameters=parameters), self.assertRaises(ValueError):
                conversion_selection(*parameters)

    def test_isolated_sample_has_half_step_bounds_and_closed_outward_surface(self):
        grid = bytearray(27)
        grid[13] = 1
        p, n, i = polygonize(grid, (3, 3, 3), [[1, 1, 1], [1, 1, 1]], 1, 2)
        report = geometry_report(p, n, i)
        self.assertGreater(report["signedVolumeCubicMetres"], 0)
        for axis in range(3):
            self.assertAlmostEqual(min(p[axis::3]), -SPACING_M)
            self.assertAlmostEqual(max(p[axis::3]), SPACING_M)

    def test_diagonally_adjacent_and_saddle_samples_remain_closed_and_consistently_wound(self):
        grid = bytearray(64)
        for x, y, z in ((1, 1, 1), (2, 2, 1), (1, 2, 2), (2, 1, 2)):
            grid[x + 4 * (y + 4 * z)] = 1
        p, n, i = polygonize(grid, (4, 4, 4), [[1, 1, 1], [2, 2, 2]], 1, 4)
        geometry_report(p, n, i)


class VolumeAssetTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.manifest = json.loads((ROOT / "public/atlas-volume/atlas.json").read_text())

    def test_separate_source_frame_inventory_and_license(self):
        manifest = self.manifest
        self.assertEqual({s["id"] for s in manifest["structures"]}, {f"digimouse-volume:{i}" for i in range(1, 22)})
        self.assertEqual(manifest["coordinateFrame"]["id"], FRAME_ID)
        self.assertFalse(manifest["coordinateFrame"]["anatomicalOrientationVerified"])
        self.assertIsNone(manifest["coordinateFrame"]["voxelToTetrahedralAffine"])
        self.assertEqual(manifest["coordinateFrame"]["voxelIndexToAssetScale"], 0.0001)
        self.assertEqual(manifest["source"]["license"], "CC-BY-SA-4.0")
        self.assertEqual(manifest["source"]["sourceVoxelSpacingMm"], [0.1] * 3)
        self.assertEqual(manifest["processing"]["processingVoxelSpacingMm"], [0.4] * 3)
        self.assertFalse(manifest["processing"]["smoothing"])

    def check_asset(self, path, expected_hash, expected_geometry=None, spacing_mm=None):
        raw, document, binary = read_glb(path)
        self.assertEqual(hashlib.sha256(raw).hexdigest(), expected_hash)
        self.assertLess(len(raw), 80 * 1024 * 1024)
        reports = {}
        for node in document["nodes"]:
            identifier = node["extras"]["structureId"]
            primitive = document["meshes"][node["mesh"]]["primitives"][0]
            p = values(document, binary, primitive["attributes"]["POSITION"])
            n = values(document, binary, primitive["attributes"]["NORMAL"])
            i = values(document, binary, primitive["indices"])
            report = geometry_report(p, n, i)
            if spacing_mm is not None:
                half_step = spacing_mm * 0.001 / 2
                self.assertTrue(all(abs(coordinate / half_step - round(coordinate / half_step)) < 0.0002 for coordinate in p),
                                "Every vertex must preserve the source-index half-step lattice")
            reports[identifier] = report
            if expected_geometry:
                expected = expected_geometry[identifier]
                self.assertEqual(report["vertices"], expected["vertices"])
                self.assertEqual(report["triangles"], expected["triangles"])
                for axis in range(3):
                    self.assertAlmostEqual(min(p[axis::3]), expected["boundsMeters"][0][axis], places=8)
                    self.assertAlmostEqual(max(p[axis::3]), expected["boundsMeters"][1][axis], places=8)
            print(identifier, report, flush=True)
        return reports

    def test_whole_reference_finite_normals_indices_manifold_winding_volume_and_hash(self):
        path = ROOT / "public" / self.manifest["assetUrl"].lstrip("/")
        expected = {s["id"]: s["geometry"] for s in self.manifest["structures"]}
        reports = self.check_asset(path, self.manifest["statistics"]["glbSha256"], expected)
        self.assertEqual(set(reports), set(expected))
        self.assertEqual(sum(r["triangles"] for r in reports.values()), self.manifest["statistics"]["triangles"])

    @unittest.skipUnless((ROOT / "public/atlas-volume/detail-index.json").exists(), "Detail conversion not yet present")
    def test_every_progressive_detail_asset_has_same_frame_and_source_id(self):
        detail = json.loads((ROOT / "public/atlas-volume/detail-index.json").read_text())
        self.assertEqual(detail["schemaVersion"], "mousebio.volume-detail-index.v2")
        self.assertEqual(detail["coordinateFrame"]["id"], FRAME_ID)
        self.assertEqual({a["structureId"] for a in detail["assets"]}, {f"digimouse-volume:{i}" for i in range(3, 22)})
        self.assertEqual(len(detail["assets"]), 21)
        self.assertEqual(len(detail["structures"]), 19)
        self.assertEqual({level["id"] for level in detail["levels"]}, set(DETAIL_LEVELS))
        pairs = {(a["structureId"], a["levelId"]) for a in detail["assets"] + detail["unavailable"]}
        self.assertEqual(pairs, {(f"digimouse-volume:{label}", level) for label in range(1, 22) for level in DETAIL_LEVELS})
        self.assertEqual(len(detail["assets"]) + len(detail["unavailable"]), len(pairs))
        self.assertTrue(all(a["reason"].strip() for a in detail["unavailable"]))
        self.assertEqual(detail["statistics"]["assets"], 21)
        self.assertEqual(detail["statistics"]["structures"], 19)
        self.assertEqual(detail["statistics"]["glbBytesTotal"], sum(a["glbBytes"] for a in detail["assets"]))
        for asset in detail["assets"]:
            definition = DETAIL_LEVELS[asset["levelId"]]
            label = int(asset["structureId"].split(":")[1])
            self.assertIn(label, definition["labels"])
            self.assertEqual(asset["coordinateFrameId"], FRAME_ID)
            spacing = definition["step"] * 0.1
            self.assertEqual(asset["processingVoxelSpacingMm"], [spacing] * 3)
            self.assertEqual(asset["assetUrl"], f"/atlas-volume/{definition['directory']}/region-{label}.glb")
            path = ROOT / "public" / asset["assetUrl"].lstrip("/")
            self.assertEqual(path.stat().st_size, asset["glbBytes"])
            reports = self.check_asset(path, asset["glbSha256"], {asset["structureId"]: asset["geometry"]}, spacing)
            self.assertEqual(set(reports), {asset["structureId"]})

    def test_native_glands_keep_source_identity_and_have_no_invented_laterality(self):
        detail = json.loads((ROOT / "public/atlas-volume/detail-index.json").read_text())
        native = {a["structureId"]: a for a in detail["assets"] if a["levelId"] == "source-010"}
        fine = {a["structureId"]: a for a in detail["assets"] if a["levelId"] == "fine-020"}
        self.assertEqual(set(native), {"digimouse-volume:12", "digimouse-volume:20"})
        expected = {
            "digimouse-volume:12": (66364, 1594108, "0dd11bf1dd60a5792746f07d0cd96a4ded5076fd45e288319789514e2911fede"),
            "digimouse-volume:20": (19372, 466296, "ff23fd3bf8817863ad932fc8df529a017a690ece8d4831a61e51d81860e174af"),
        }
        for identifier, asset in native.items():
            self.assertEqual((asset["geometry"]["triangles"], asset["glbBytes"], asset["glbSha256"]), expected[identifier])
            self.assertGreater(asset["geometry"]["triangles"], fine[identifier]["geometry"]["triangles"])
            self.assertEqual(asset["coordinateFrameId"], fine[identifier]["coordinateFrameId"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
