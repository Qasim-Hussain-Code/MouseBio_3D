"""Publication checks for the approved numeric-only NeuroMorpho source record."""
import copy
import hashlib
import json
from pathlib import Path
import shutil
import tempfile
import unittest
import zipfile

from check_publication import audit, inspect_registered_asset
from prepare_release import ReleaseError, prepare_release
from test_registered_anatomy import git, registry_from
from test_release import fixture


ROOT = Path(__file__).resolve().parents[1]
MANIFEST = "public/atlas-neuron/atlas.json"
ASSET = "public/atlas-neuron/nmo130632-standardized.swc.txt"
NOTICE = "public/atlas-neuron/LICENSE.md"


def neuron_files():
    return {name: (ROOT / name).read_bytes() for name in (MANIFEST, ASSET, NOTICE)}


def add_neuron_fixture(root):
    files = neuron_files()
    files["scripts/prepare_neuromorpho.py"] = (ROOT / "scripts/prepare_neuromorpho.py").read_bytes()
    for name, body in files.items():
        path = root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(body)
    git(root, "add", ".")
    git(root, "commit", "--quiet", "-m", "add_neuron_fixture")
    shutil.copytree(root / "public", root / "dist", dirs_exist_ok=True)
    return files


class NeuroMorphoPublicationTests(unittest.TestCase):
    def test_approved_numeric_source_is_registered_and_inspected_as_complete_text(self):
        files = neuron_files()
        registry = registry_from(files)
        self.assertEqual(list(registry), [ASSET])
        self.assertEqual(registry[ASSET]["format"], "swc-native-v1")
        self.assertEqual(registry[ASSET]["ids"], ["neuromorpho:130632"])
        self.assertEqual(inspect_registered_asset(files[ASSET], registry[ASSET]), files[ASSET])
        self.assertEqual(len(files[ASSET]), 424092)
        self.assertEqual(hashlib.sha256(files[ASSET]).hexdigest(),
                         "0dd36d6518aacd6338d16c76318d6ed0fd24419a0551417fdf639a8323c6ede5")

    def test_manifest_cannot_replace_source_license_identity_units_or_graph_diagnostics(self):
        original = neuron_files()
        changes = [
            lambda doc: doc.update(id="unreviewed-source"),
            lambda doc: doc.update(assetFormat="local-trace-v1"),
            lambda doc: doc.update(assetUrl="/atlas-neuron/../private.swc.txt"),
            lambda doc: doc["source"].update(id="unreviewed-source"),
            lambda doc: doc["source"].update(sourceSha256="0" * 64),
            lambda doc: doc["source"].update(sourceBytes=424092),
            lambda doc: doc["source"].update(citation="Unattributed substitute"),
            lambda doc: doc["source"].update(license="CC-BY-NC-4.0"),
            lambda doc: doc["source"].update(licenseUrl="https://creativecommons.org/licenses/by-nc/4.0/"),
            lambda doc: doc["coordinateFrame"].update(sourceUnits="micrometres"),
            lambda doc: doc["coordinateFrame"].update(assetUnits="metres"),
            lambda doc: doc["coordinateFrame"].update(sourceToAssetScale=True),
            lambda doc: doc["coordinateFrame"].update(unitsVerified=True),
            lambda doc: doc["coordinateFrame"].update(physicalCalibrationVerified=True),
            lambda doc: doc["coordinateFrame"].update(anatomicalOrientationVerified=True),
            lambda doc: doc["coordinateFrame"].update(registration={"target": "digimouse"}),
            lambda doc: doc["coordinateFrame"].pop("registrationToDigimouse"),
            lambda doc: doc["specimen"].update(sex="female"),
            lambda doc: doc["specimen"].update(age={"value": 50, "unit": "days"}),
            lambda doc: doc["structures"][0].update(id="neuromorpho:1"),
            lambda doc: doc["structures"][0].update(meshNode="region_NMO_1"),
            lambda doc: doc["structures"][0].update(systems=["circulatory"]),
            lambda doc: doc["statistics"].update(samples=11649),
            lambda doc: doc["statistics"].update(parentLinks=11648),
            lambda doc: doc["statistics"].update(assetSha256="0" * 64),
            lambda doc: doc["statistics"].update(glbSha256=doc["statistics"]["assetSha256"]),
            lambda doc: doc["statistics"].update(maxFloat32PositionError=0),
            lambda doc: doc["processing"].update(shrinkageCorrection=True),
            lambda doc: doc["processing"].update(originalCommentHeadersDistributed=True),
            lambda doc: doc["sourceDeclarations"].update(sexText="Female"),
        ]
        for case, change in enumerate(changes):
            with self.subTest(case=case):
                files = dict(original)
                document = json.loads(files[MANIFEST])
                change(document)
                files[MANIFEST] = json.dumps(document).encode()
                with self.assertRaises(ValueError):
                    registry_from(files)
        for missing in (NOTICE,):
            files = dict(original)
            files.pop(missing)
            with self.assertRaises(ValueError):
                registry_from(files)

    def test_body_cannot_be_substituted_even_by_changing_binding_hash(self):
        files = neuron_files()
        binding = registry_from(files)[ASSET]
        body = files[ASSET]
        cases = [b"# Unreviewed source comment\n" + body, body + b"\n",
                 body.replace(b" ", b"\t", 1), body[:-1], body.replace(b" ", b"  ", 1)]
        for changed in cases:
            with self.subTest(length=len(changed)):
                altered = copy.deepcopy(binding)
                altered.update(bytes=len(changed), sha256=hashlib.sha256(changed).hexdigest())
                with self.assertRaises(ValueError):
                    inspect_registered_asset(changed, altered)

    def test_invalid_registered_text_still_receives_privacy_scan_with_value_free_findings(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            git(root, "init", "--quiet")
            for name, body in neuron_files().items():
                path = root / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(body)
            address = "review-contact" + "@" + "mailprovider.org"
            local_path = "/" + "home" + "/" + "fixture-user" + "/source.swc"
            asset = root / ASSET
            asset.write_bytes(("# " + address + " " + local_path + "\n").encode() + asset.read_bytes())
            git(root, "add", ".")
            report = audit(root)
            kinds = {entry["type"] for entry in report["findings"]}
            self.assertTrue({"unregistered-or-invalid-anatomy-asset", "email-address", "machine-local-user-path"} <= kinds)
            serialized = json.dumps(report)
            self.assertNotIn(address, serialized)
            self.assertNotIn(local_path, serialized)
            self.assertEqual(report["registeredAnatomyAssetsChecked"], 0)

    def test_history_review_accepts_older_sources_without_neuron_metadata_and_preserves_git_state(self):
        with fixture() as root:
            add_neuron_fixture(root)
            before = [git(root, *arguments) for arguments in
                      (("rev-parse", "HEAD"), ("ls-files", "--stage", "-z"), ("show-ref",), ("status", "--porcelain"))]
            report = audit(root, history=True)
            self.assertEqual(report["errorCount"] + report["warningCount"], 0, report)
            self.assertEqual(report["reachableCommits"], 2)
            self.assertGreaterEqual(report["registeredAnatomyAssetsChecked"], 2)
            after = [git(root, *arguments) for arguments in
                     (("rev-parse", "HEAD"), ("ls-files", "--stage", "-z"), ("show-ref",), ("status", "--porcelain"))]
            self.assertEqual(before, after)

    def test_release_retains_numeric_source_and_attribution_in_both_archives(self):
        with fixture() as root:
            files = add_neuron_fixture(root)
            release = prepare_release(root, Path(".publication/neuron"))
            self.assertEqual(release["registeredAnatomy"]["assets"], 2)
            for kind in ("source", "web"):
                archive = root / ".publication/neuron" / release["artifacts"][kind]["file"]
                with zipfile.ZipFile(archive) as zipped:
                    for path in (MANIFEST, ASSET, NOTICE):
                        name = "MouseBio_3D-1.2.3/" + path if kind == "source" else path.removeprefix("public/")
                        self.assertEqual(zipped.read(name), files[path])
                    self.assertFalse(any("data/raw/" in name or "/.git/" in name for name in zipped.namelist()))

    def test_release_rejects_changed_neuron_body_or_notice_before_creating_output(self):
        for changed in (ASSET, NOTICE):
            with self.subTest(path=changed), fixture() as root:
                add_neuron_fixture(root)
                (root / "dist" / changed.removeprefix("public/")).write_bytes(b"Unreviewed changed input\n")
                with self.assertRaises(ReleaseError):
                    prepare_release(root, Path(".publication/neuron"))
                self.assertFalse((root / ".publication").exists())


if __name__ == "__main__":
    unittest.main()
