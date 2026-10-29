"""Actual polyline source gates, complete text scanning and release preservation."""
import copy
import hashlib
import json
from pathlib import Path
import shutil
import tempfile
import unittest
import zipfile
from unittest.mock import patch
from check_publication import (anatomy_registry, audit, asset_scan_limit, inspect_registered_asset,
                               MAX_REGISTERED_GLB_BYTES, MAX_REGISTERED_TOTAL_BYTES)
from prepare_release import ReleaseError, prepare_release
from test_registered_anatomy import git, registry_from
from test_release import fixture

ROOT = Path(__file__).resolve().parents[1]
SOURCES = (("atlas-nerve", "mousemapper-patch0-lines.json", "prepare_mousemapper_nerve.py"),
           ("atlas-vascular", "schmid2021-mvn1-lines.json", "prepare_vascular.py"))

def source_files():
    files = {}
    for folder, filename, module in SOURCES:
        for name in ("atlas.json", filename, "LICENSE.md"):
            path = f"public/{folder}/{name}"; files[path] = (ROOT/path).read_bytes()
        path = f"scripts/{module}"; files[path] = (ROOT/path).read_bytes()
    return files

def add_sources(root):
    files = source_files()
    for name, body in files.items():
        path = root/name; path.parent.mkdir(parents=True, exist_ok=True); path.write_bytes(body)
    git(root, "add", "."); git(root, "commit", "--quiet", "-m", "add_polyline_sources")
    shutil.copytree(root/"public", root/"dist", dirs_exist_ok=True)
    return files

class PolylinePublicationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.files = source_files()

    def test_both_exact_sources_register_and_return_complete_text_for_privacy_scanning(self):
        registry = registry_from(self.files)
        self.assertEqual(len(registry), 2)
        self.assertEqual(sum(item["bytes"] for item in registry.values()), 38412022)
        for path, binding in registry.items():
            self.assertEqual(inspect_registered_asset(self.files[path], binding), self.files[path])
            self.assertEqual(asset_scan_limit(path, {}), MAX_REGISTERED_GLB_BYTES)
        self.assertEqual(MAX_REGISTERED_TOTAL_BYTES, 160*1024*1024)

    def test_scientific_claims_and_incomplete_source_licenses_reject_registration(self):
        # Pinned metadata is a single reviewed record, not a grant of arbitrary claims.
        for folder, _, _ in SOURCES:
            path = f"public/{folder}/atlas.json"
            for field, replacement in (("coordinateFrame", {}), ("sourceAttributesOmitted", [{"unreviewed": True}]),
                                       ("processing", {}), ("structures", []), ("limitations", [])):
                with self.subTest(folder=folder, field=field):
                    files = dict(self.files); manifest = json.loads(files[path]); manifest[field] = replacement
                    files[path] = json.dumps(manifest).encode()
                    with self.assertRaises(ValueError): registry_from(files)
        files = dict(self.files); notice = "public/atlas-nerve/LICENSE.md"
        files[notice] = files[notice].replace(b"   TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION", b"Removed original license terms")
        with self.assertRaises(ValueError): registry_from(files)
        files = dict(self.files); files.pop("public/atlas-vascular/LICENSE.md")
        with self.assertRaises(ValueError): registry_from(files)

    def test_rebinding_modified_numeric_data_cannot_grant_publication(self):
        bindings = registry_from(self.files)
        for path, binding in bindings.items():
            altered = self.files[path] + b" "
            forged = copy.deepcopy(binding); forged.update(bytes=len(altered), sha256=hashlib.sha256(altered).hexdigest())
            with self.assertRaises(ValueError): inspect_registered_asset(altered, forged)

    def test_invalid_large_registered_text_still_receives_complete_value_free_privacy_scan(self):
        with fixture() as root:
            add_sources(root)
            path = root/"public/atlas-vascular/schmid2021-mvn1-lines.json"
            address = "synthetic-contact" + "@" + "mailprovider.org"
            local = "/" + "home" + "/fixture-user/private-input"
            # At the end of a body larger than the ordinary text limit.
            path.write_bytes(path.read_bytes() + (" " + address + " " + local).encode())
            git(root, "add", ".")
            report = audit(root, scope="staged")
            kinds = {finding["type"] for finding in report["findings"]}
            self.assertTrue({"unregistered-or-invalid-anatomy-asset", "email-address", "machine-local-user-path"} <= kinds, report)
            self.assertNotIn("file-exceeds-scan-bound", kinds)
            self.assertNotIn(address, json.dumps(report)); self.assertNotIn(local, json.dumps(report))

    def test_release_preserves_both_numeric_sources_and_licenses_without_raw_archives(self):
        with fixture() as root:
            files = add_sources(root); release = prepare_release(root, Path(".publication/polyline"))
            self.assertEqual(release["registeredAnatomy"]["assets"], 3)
            for kind in ("source", "web"):
                with zipfile.ZipFile(root/".publication/polyline"/release["artifacts"][kind]["file"]) as archive:
                    for path, body in files.items():
                        if kind == "web" and not path.startswith("public/"): continue
                        name = "MouseBio_3D-1.2.3/" + path if kind == "source" else path.removeprefix("public/")
                        self.assertEqual(archive.read(name), body)
                    self.assertFalse(any("data/raw/" in name or "/.git/" in name for name in archive.namelist()))
            (root/"dist/atlas-nerve/LICENSE.md").write_text("Unreviewed changed attribution")
            with self.assertRaises(ReleaseError): prepare_release(root, Path(".publication/rejected"))
            self.assertFalse((root/".publication/rejected").exists())

if __name__ == "__main__":
    unittest.main()
