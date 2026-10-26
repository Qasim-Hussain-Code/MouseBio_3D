"""Synthetic checks for bounded metadata review of larger registered GLBs."""
import hashlib
import json
from pathlib import Path
import struct
import subprocess
import tempfile
import unittest

from check_publication import (
    VOLUME_ARCHIVE_SHA256, VOLUME_FRAME, anatomy_registry, audit,
    inspect_registered_glb,
)


def synthetic_glb(ids, payload_size=4, extras=None):
    doc = {"asset": {"version": "2.0"}, "buffers": [{"byteLength": payload_size}],
           "nodes": [{"mesh": index, "extras": {"structureId": identifier}} for index, identifier in enumerate(ids)]}
    if extras is not None:
        doc["extras"] = extras
    metadata = json.dumps(doc).encode()
    metadata += b" " * (-len(metadata) % 4)
    payload = b"\0" * payload_size
    payload += b"\0" * (-len(payload) % 4)
    total = 28 + len(metadata) + len(payload)
    return (b"glTF" + struct.pack("<II", 2, total)
            + struct.pack("<II", len(metadata), 0x4E4F534A) + metadata
            + struct.pack("<II", len(payload), 0x004E4942) + payload)


def volume_fixture_files(payload_size=9 * 1024 * 1024):
    ids = [f"digimouse-volume:{label}" for label in range(1, 22)]
    coarse = synthetic_glb(ids, payload_size)
    fine = synthetic_glb([ids[2]])
    source = {"id": "digimouse-registered-volume-2007", "archiveSha256": VOLUME_ARCHIVE_SHA256,
              "license": "CC-BY-SA-4.0", "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0/"}
    manifest = {"id": "digimouse-volume-040-v1", "assetUrl": "/atlas-volume/model.glb",
                "coordinateFrame": {"id": VOLUME_FRAME}, "source": source,
                "structures": [{"id": identifier} for identifier in ids],
                "statistics": {"glbBytes": len(coarse), "glbSha256": hashlib.sha256(coarse).hexdigest()}}
    detail = {"schemaVersion": "mousebio.volume-detail-index.v1", "atlasId": manifest["id"],
              "coordinateFrame": {"id": VOLUME_FRAME}, "source": source,
              "structures": [{"id": ids[2]}],
              "assets": [{"structureId": ids[2], "assetUrl": "/atlas-volume/detail/region-3.glb",
                          "coordinateFrameId": VOLUME_FRAME, "glbBytes": len(fine),
                          "glbSha256": hashlib.sha256(fine).hexdigest()}],
              "unavailable": [{"structureId": identifier, "reason": "Synthetic unavailable fixture."}
                              for identifier in ids if identifier != ids[2]],
              "statistics": {"structures": 1, "glbBytesTotal": len(fine)}}
    return {"public/atlas-volume/atlas.json": json.dumps(manifest).encode(),
            "public/atlas-volume/detail-index.json": json.dumps(detail).encode(),
            "public/atlas-volume/LICENSE.md": b"Synthetic attribution: https://creativecommons.org/licenses/by-sa/4.0/\n",
            "public/atlas-volume/model.glb": coarse,
            "public/atlas-volume/detail/region-3.glb": fine}


def registry_from(files):
    def read(path, limit):
        value = files.get(path)
        if value is not None and len(value) > limit:
            raise ValueError("Synthetic input exceeds its bound")
        return value
    return anatomy_registry(read)


def git(root, *arguments):
    return subprocess.run(["git", "-C", str(root), *arguments], check=True, capture_output=True).stdout


class RegisteredAnatomyTests(unittest.TestCase):
    def test_large_registered_asset_and_selective_detail_have_exact_bindings(self):
        files = volume_fixture_files()
        registry = registry_from(files)
        self.assertEqual(len(registry), 2)
        self.assertGreater(len(files["public/atlas-volume/model.glb"]), 8 * 1024 * 1024)
        for path, binding in registry.items():
            metadata = inspect_registered_glb(files[path], binding)
            self.assertIn(b"structureId", metadata)
        corrupted = bytearray(files["public/atlas-volume/model.glb"])
        corrupted[-1] = 1
        with self.assertRaises(ValueError):
            inspect_registered_glb(bytes(corrupted), registry["public/atlas-volume/model.glb"])

    def test_invalid_source_frame_path_license_or_coverage_is_rejected(self):
        original = volume_fixture_files(4)
        cases = [
            ("public/atlas-volume/atlas.json", lambda doc: doc["coordinateFrame"].update(id="wrong-frame")),
            ("public/atlas-volume/atlas.json", lambda doc: doc["source"].update(archiveSha256="0" * 64)),
            ("public/atlas-volume/atlas.json", lambda doc: doc["source"].update(license="MIT")),
            ("public/atlas-volume/detail-index.json", lambda doc: doc["assets"][0].update(assetUrl="/atlas-volume/../outside.glb")),
            ("public/atlas-volume/detail-index.json", lambda doc: doc["assets"][0].update(coordinateFrameId="wrong-frame")),
            ("public/atlas-volume/detail-index.json", lambda doc: doc["unavailable"].pop()),
        ]
        for path, change in cases:
            with self.subTest(path=path, change=change):
                files = dict(original)
                document = json.loads(files[path])
                change(document)
                files[path] = json.dumps(document).encode()
                with self.assertRaises(ValueError):
                    registry_from(files)
        missing_license = dict(original)
        missing_license.pop("public/atlas-volume/LICENSE.md")
        with self.assertRaises(ValueError):
            registry_from(missing_license)

    def test_index_and_working_tree_use_their_own_registry_snapshots(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            git(root, "init", "--quiet")
            for name, data in volume_fixture_files().items():
                path = root / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(data)
            git(root, "add", ".")
            self.assertEqual(audit(root, "staged")["errorCount"], 0)
            manifest_path = root / "public/atlas-volume/atlas.json"
            manifest = json.loads(manifest_path.read_bytes())
            manifest["coordinateFrame"]["id"] = "wrong-frame"
            manifest_path.write_text(json.dumps(manifest))
            self.assertEqual(audit(root, "staged")["errorCount"], 0)
            self.assertGreater(audit(root, "tracked")["errorCount"], 0)

    def test_history_uses_the_registry_from_each_commit(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            git(root, "init", "--quiet")
            git(root, "config", "user.name", "Qasim Hussain")
            git(root, "config", "user.email", "fixture" + "@" + "users.noreply.github.com")
            files = volume_fixture_files()
            for name, data in files.items():
                path = root / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(data)
            git(root, "add", ".")
            git(root, "commit", "--quiet", "-m", "add_fixture")
            changed = bytearray(files["public/atlas-volume/model.glb"])
            changed[-1] = 1
            (root / "public/atlas-volume/model.glb").write_bytes(changed)
            manifest = json.loads(files["public/atlas-volume/atlas.json"])
            manifest["statistics"]["glbSha256"] = hashlib.sha256(changed).hexdigest()
            (root / "public/atlas-volume/atlas.json").write_text(json.dumps(manifest))
            git(root, "add", ".")
            git(root, "commit", "--quiet", "-m", "update_fixture")
            report = audit(root, history=True)
            self.assertEqual(report["errorCount"] + report["warningCount"], 0, report)
            self.assertEqual(report["reachableCommits"], 2)
            self.assertGreaterEqual(report["registeredAnatomyAssetsChecked"], 4)

    def test_unknown_glbs_and_force_tracked_agent_files_remain_blocked(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            git(root, "init", "--quiet")
            (root / "unknown.glb").write_bytes(synthetic_glb(["synthetic:1"]))
            (root / "AGENTS.md").write_text("Synthetic internal instructions.\n")
            git(root, "add", ".")
            report = audit(root)
            types = {finding["type"] for finding in report["findings"]}
            self.assertIn("unregistered-or-invalid-anatomy-asset", types)
            self.assertIn("private-input-path-tracked", types)


if __name__ == "__main__":
    unittest.main()
