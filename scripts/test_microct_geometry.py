"""Checks for the Rosenhain et al. (2018) micro-CT reference, using only the standard library.

The shipped manifest and GLB are always checked. Reproduction from the source
members runs when the extracted scan is present under data/raw; otherwise it is
skipped, because the raw members are not distributed with the application.
"""
import hashlib
import json
import struct
import unittest
from pathlib import Path

import import_microct

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "public/atlas-microct/atlas.json"


def glb_document(data):
    magic, version, length = struct.unpack_from("<4sII", data, 0)
    chunk_length, chunk_type = struct.unpack_from("<II", data, 12)
    if magic != b"glTF" or version != 2 or length != len(data) or chunk_type != 0x4E4F534A:
        raise ValueError("Invalid GLB container")
    return json.loads(data[20:20 + chunk_length])


class MicroCtReferenceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.manifest = json.loads(MANIFEST.read_text())
        cls.glb = (ROOT / "public" / cls.manifest["assetUrl"].lstrip("/")).read_bytes()

    def test_manifest_binds_the_asset_and_complete_class_inventory(self):
        statistics = self.manifest["statistics"]
        self.assertEqual(len(self.glb), statistics["glbBytes"])
        self.assertEqual(hashlib.sha256(self.glb).hexdigest(), statistics["glbSha256"])
        ids = [region["id"] for region in self.manifest["structures"]]
        self.assertEqual(ids, ["rosenhain2018-m01:Bed:1"] + [f"rosenhain2018-m01:Organ1:{index}" for index in range(1, 11)])
        self.assertEqual([region["sourceLabel"] for region in self.manifest["structures"][1:]], list(import_microct.SYSTEMS))
        self.assertEqual(statistics["triangles"], sum(region["geometry"]["triangles"] for region in self.manifest["structures"]))
        self.assertEqual(self.manifest["coordinateFrame"]["voxelIndexToAssetScale"], 0.00028)
        self.assertIs(self.manifest["coordinateFrame"]["registrationToDigimouse"], None)
        self.assertEqual(self.manifest["source"]["license"], "CC0-1.0")
        self.assertEqual({member["name"].rsplit("/", 1)[1] for member in self.manifest["source"]["members"]}, set(import_microct.MEMBERS))

    def test_glb_nodes_carry_source_ids_without_transforms_and_match_declared_counts(self):
        document = glb_document(self.glb)
        nodes = document["nodes"]
        self.assertEqual([node["extras"]["structureId"] for node in nodes], [region["id"] for region in self.manifest["structures"]])
        for node, region in zip(nodes, self.manifest["structures"]):
            self.assertFalse({"translation", "rotation", "scale", "matrix"} & set(node))
            primitive = document["meshes"][node["mesh"]]["primitives"][0]
            self.assertEqual(document["accessors"][primitive["indices"]]["count"] // 3, region["geometry"]["triangles"])
            self.assertEqual(document["accessors"][primitive["attributes"]["POSITION"]]["count"], region["geometry"]["vertices"])
            low, high = document["accessors"][primitive["attributes"]["POSITION"]]["min"], document["accessors"][primitive["attributes"]["POSITION"]]["max"]
            self.assertEqual([low, high], region["geometry"]["boundsMeters"])
            for axis, size in enumerate(import_microct.DIMS):
                # The body is open at the field edges, where its interface lies half a voxel outside the grid.
                self.assertGreaterEqual(low[axis], -import_microct.SPACING_M / 2 - 1e-9)
                self.assertLess(high[axis], size * import_microct.SPACING_M)

    def test_body_evidence_and_segmentation_agreement_are_recorded(self):
        evidence = self.manifest["bodyEvidence"]
        self.assertGreater(evidence["fractionOfOrgan1VoxelsInside"], 0.99)
        self.assertGreater(evidence["medianCtValue"], 0)
        agreement = self.manifest["interSegmentationAgreement"]["values"]
        self.assertEqual(set(agreement), set(import_microct.SYSTEMS))
        self.assertLess(agreement["Spleen"], 0.5)
        self.assertGreater(agreement["Heart"], 0.85)
        for region in self.manifest["structures"][1:]:
            self.assertEqual(region["interSegmentationDice"], agreement[region["sourceLabel"]])

    def test_class_files_are_parsed_strictly(self):
        names, colours = import_microct.classes("ClassColors=0 0 0 255|1 2 3 255\nClassIndices=0|1\nClassNames=unclassified|Bone\n")
        self.assertEqual((names, colours[1]), (["unclassified", "Bone"], (1, 2, 3, 255)))
        with self.assertRaises(ValueError):
            import_microct.classes("ClassColors=0 0 0 255\nClassIndices=1\nClassNames=Bone\n")

    @unittest.skipUnless((ROOT / "data/raw/rosenhain2018-M01-0.25h").is_dir(), "Extracted source scan not present")
    def test_source_members_reproduce_the_shipped_asset(self):
        for name in import_microct.MEMBERS:
            import_microct.member(name)
        original = MANIFEST.read_text()
        try:
            import_microct.run(verify_existing=True)
        finally:
            MANIFEST.write_text(original)


if __name__ == "__main__":
    unittest.main(verbosity=2)
