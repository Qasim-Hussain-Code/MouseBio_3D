"""Numeric acceptance checks for the volume inspection, without mesh generation."""
import io
import json
import struct
import unittest

from assess_volume import ROOT, describe_header, label_statistics, parse_label_file


class VolumeInspectionTests(unittest.TestCase):
    def test_header_dimensions_spacing_and_endianness(self):
        for endian in ("<", ">"):
            with self.subTest(endian=endian):
                header = bytearray(348)
                struct.pack_into(endian + "i", header, 0, 348)
                struct.pack_into(endian + "8h", header, 40, 4, 3, 2, 2, 1, 0, 0, 0)
                struct.pack_into(endian + "hh", header, 70, 2, 8)
                struct.pack_into(endian + "8f", header, 76, 0, 0.1, 0.1, 0.1, 0, 0, 0, 0)
                parsed = describe_header(header)
                self.assertEqual(parsed["dim"][1:4], [3, 2, 2])
                self.assertEqual(parsed["datatypeCode"], 2)
                self.assertEqual(parsed["bitsPerVoxel"], 8)
                self.assertAlmostEqual(parsed["pixdim"][1], 0.1)
                self.assertEqual(parsed["byteOrder"], "little-endian" if endian == "<" else "big-endian")
        with self.assertRaises(ValueError):
            describe_header(b"\0" * 347)

    def test_streamed_counts_bounds_and_centroids_use_x_fastest_indices(self):
        source = bytes([0, 1, 1, 2, 0, 1, 2, 2, 0, 1, 0, 0])
        result = label_statistics(io.BytesIO(source), (3, 2, 2))
        self.assertEqual(result["countsByNumericLabel"], {0: 5, 1: 4, 2: 3})
        self.assertEqual(result["boundsVoxelInclusive"][1], [[0, 0, 0], [2, 1, 1]])
        self.assertEqual(result["centroidVoxelIndices"][1], [1.25, 0.5, 0.25])
        self.assertEqual(result["centroidVoxelIndices"][2], [1 / 3, 1 / 3, 2 / 3])
        with self.assertRaises(ValueError):
            label_statistics(io.BytesIO(source[:-1]), (3, 2, 2))
        with self.assertRaises(ValueError):
            label_statistics(io.BytesIO(source + b"\0"), (3, 2, 2))

    def test_aggregate_label_is_not_invented_as_an_additional_numeric_region(self):
        labels, aggregates = parse_label_file("0 --> background\n4 --> medulla\n5 --> cerebellum\n4+5 --> whole brain")
        self.assertEqual(labels, {0: "background", 4: "medulla", 5: "cerebellum"})
        self.assertEqual(aggregates, [{"name": "whole brain", "sourceLabels": [4, 5]}])

    def test_recorded_source_volume_has_exact_inventory_and_no_claimed_registration(self):
        result = json.loads((ROOT / "data/volume-assessment.json").read_text())
        histogram = next(iter(result["labelHistograms"].values()))
        self.assertEqual(histogram["bytes"], 380 * 992 * 208)
        self.assertEqual(sum(histogram["countsByNumericLabel"].values()), histogram["bytes"])
        self.assertEqual({entry["value"] for entry in result["labels"]}, set(range(22)))
        self.assertTrue(all(entry["voxelCount"] > 0 for entry in result["labels"]))
        self.assertIsNone(result["coordinateAssessment"]["voxelToTetrahedralAffine"])
        self.assertFalse(result["coordinateAssessment"]["anatomicalOrientationVerified"])
        self.assertFalse(result["generatedAnatomicalGeometry"])
        self.assertEqual(result["bundledLicense"]["license"], "CC-BY-SA-4.0")


if __name__ == "__main__":
    unittest.main(verbosity=2)
