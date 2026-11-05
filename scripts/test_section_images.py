"""Checks for the packaged Digimouse section images, using only the standard library.

The shipped streams are always checked against the publication registry. The
reproduction from the source archives runs when they are present under data/raw;
the archives are not distributed with the application.
"""
import hashlib
import json
import struct
import unittest
import zlib
from pathlib import Path

import check_publication
import import_section_images
import jpeg_baseline

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "public/atlas-volume/sections/sections.json"


def small_binding(data, offsets):
    return {"format": "section-image-v1", "encoding": "jpeg-slices-v1", "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest(), "slices": offsets}


class SectionImageTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.manifest = json.loads(MANIFEST.read_text())
        volume = json.loads((ROOT / "public/atlas-volume/atlas.json").read_text())
        cls.registry = {}
        check_publication.register_section_images(cls.manifest, volume, cls.registry)
        cls.volume = volume

    def test_registry_binds_all_streams_and_they_pass_inspection(self):
        self.assertEqual(set(self.registry), {path for path, _ in check_publication.SECTION_SOURCES.values()})
        for path, binding in self.registry.items():
            data = (ROOT / path).read_bytes()
            self.assertEqual(check_publication.inspect_registered_asset(data, binding), b"")
            self.assertEqual(binding["atlasId"], "digimouse-volume-040-v1")

    def test_registration_rejects_changed_source_binding_and_license(self):
        for change in (lambda m: m.update(license="CC0-1.0"), lambda m: m.update(atlasId="other"), lambda m: m.update(dimensions=[1, 2, 3]),
                       lambda m: m["layers"][0].update(sourceArchiveSha256="0" * 64), lambda m: m["layers"][1].update(assetUrl="/atlas-volume/sections/other.bin"),
                       lambda m: m["layers"].pop(), lambda m: m["labels"].update(assetSha256="x")):
            altered = json.loads(json.dumps(self.manifest))
            change(altered)
            with self.assertRaises((ValueError, KeyError)):
                check_publication.register_section_images(altered, self.volume, {})

    def test_only_the_body_label_meets_the_background_at_source_resolution(self):
        nx, ny, _ = self.manifest["dimensions"]
        labels = zlib.decompress((ROOT / self.manifest["labels"]["assetUrl"].lstrip("/").replace("atlas-volume", "public/atlas-volume", 1)).read_bytes(), -15)
        background = int.from_bytes(labels.translate(b"\x01" + bytes(255)), "little")
        inner = int.from_bytes(labels.translate(bytes(2) + b"\x01" * 254), "little")
        self.assertNotEqual(inner, 0)
        # Each voxel is one byte, so neighbours are one stride apart; row ends also meet, which can only add adjacency.
        for stride in (1, nx, nx * ny):
            self.assertEqual(inner & ((background << (8 * stride)) | (background >> (8 * stride))), 0)

    def test_blood_rich_labels_are_darkest_in_the_photographs(self):
        # Independent of the greyscale volume used for orientation: the labels were drawn by the source authors, so dark organs falling inside them shows a shared grid.
        nx, ny, nz = self.manifest["dimensions"]
        layer = next(item for item in self.manifest["layers"] if item["id"] == "cryosection")
        data = (ROOT / layer["assetUrl"].lstrip("/").replace("atlas-volume", "public/atlas-volume", 1)).read_bytes()
        labels = zlib.decompress((ROOT / self.manifest["labels"]["assetUrl"].lstrip("/").replace("atlas-volume", "public/atlas-volume", 1)).read_bytes(), -15)
        ids = {structure["sourceLabel"]: structure["sourceRegion"] for structure in self.volume["structures"]}
        total = {}
        for z in range(58, nz, 32):
            start, size = layer["slices"][z]
            width, height, channels, pixels = jpeg_baseline.decode(data[start:start + size])
            self.assertEqual((width, height, channels), (nx, ny, 3))
            for y in range(0, ny, 3):
                row = (z * ny + y) * nx
                for x in range(0, nx, 3):
                    at = 3 * (y * nx + x)
                    bucket = total.setdefault(labels[row + x], [0.0, 0])
                    bucket[0] += 0.299 * pixels[at] + 0.587 * pixels[at + 1] + 0.114 * pixels[at + 2]
                    bucket[1] += 1
        mean = {label: value / count for label, (value, count) in total.items()}
        tissue = mean[ids["skin"]]
        for name in ("heart", "liver", "lungs", "spleen", "kidneys"):
            self.assertLess(mean[ids[name]], 0.6 * tissue, name)
        for name in ("rest of the brain", "testis", "bladder"):
            self.assertGreater(mean[ids[name]], 0.8 * tissue, name)

    def test_jpeg_metadata_segments_and_altered_streams_are_rejected(self):
        slice_bytes = b"\xff\xd8" + b"\xff\xe0" + struct.pack(">H", 4) + b"JF" + b"\xff\xda" + struct.pack(">H", 2) + b"\x00\xff\xd9"
        count = check_publication.SECTION_DIMENSIONS[2]
        data = slice_bytes * count
        offsets = [[index * len(slice_bytes), len(slice_bytes)] for index in range(count)]
        self.assertEqual(check_publication.inspect_registered_section_image(data, small_binding(data, offsets)), b"")
        for marker in (0xE1, 0xFE):  # EXIF and comment segments could carry metadata
            tagged = slice_bytes.replace(b"\xff\xe0", bytes((0xFF, marker)))
            data = tagged + slice_bytes * (count - 1)
            with self.assertRaises(ValueError):
                check_publication.inspect_registered_section_image(data, small_binding(data, offsets))
        data = slice_bytes * count
        with self.assertRaises(ValueError):
            check_publication.inspect_registered_section_image(data + b"\x00", small_binding(data, offsets))
        stream = zlib.compressobj(wbits=-15)
        short = stream.compress(b"\x00" * 16) + stream.flush()
        with self.assertRaises(ValueError):
            check_publication.inspect_registered_section_image(short, {"encoding": "deflate-raw-u8-v1", "bytes": len(short), "sha256": hashlib.sha256(short).hexdigest(),
                                                                       "expandedBytes": check_publication.SECTION_VOXELS, "expandedSha256": "0" * 64})

    def test_manifest_records_orientation_and_limits(self):
        photograph, ct = self.manifest["layers"]
        for row in photograph["orientationCheck"]:
            self.assertGreater(row["identity"], 0.99)
            self.assertGreater(row["identity"], max(row["flippedX"], row["flippedY"]))
        self.assertGreater(ct["meanValueByLabel"]["2"], ct["meanValueByLabel"]["1"])
        self.assertTrue(any("frozen postmortem" in text for text in self.manifest["limitations"]))
        self.assertTrue(any("Hounsfield" in text for text in self.manifest["limitations"]))

    @unittest.skipUnless((ROOT / "data/raw/digimouse-cryo_data.zip").is_file() and (ROOT / "data/raw/digimouse-ct_data.zip").is_file(), "Source archives not present")
    def test_source_archives_reproduce_the_shipped_streams(self):
        before = {path: hashlib.sha256((ROOT / path).read_bytes()).hexdigest() for path in self.registry}
        manifest_text = MANIFEST.read_text()
        import_section_images.run()
        self.assertEqual({path: hashlib.sha256((ROOT / path).read_bytes()).hexdigest() for path in self.registry}, before)
        self.assertEqual(MANIFEST.read_text(), manifest_text)


if __name__ == "__main__":
    unittest.main(verbosity=2)
