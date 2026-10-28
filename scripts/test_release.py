"""Synthetic acceptance cases for privacy-bounded release artifacts."""
from contextlib import contextmanager
import hashlib
import json
from pathlib import Path
import shutil
import struct
import subprocess
import tempfile
import unittest
import zipfile

from prepare_release import ReleaseError, prepare_release, relative_name
from check_publication import audit
from test_registered_anatomy import ema147_fixture_files, hindlimb_fixture_files, volume_fixture_files


def git(root, *arguments):
    return subprocess.run(["git", "-C", str(root), *arguments], check=True, capture_output=True).stdout


@contextmanager
def fixture():
    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory) / "project"
        root.mkdir()
        git(root, "init", "--quiet", "-b", "main")
        git(root, "config", "user.name", "Qasim Hussain")
        git(root, "config", "user.email", "fixture" + "@" + "users.noreply.github.com")
        metadata = json.dumps({"asset": {"version": "2.0"}}).encode()
        metadata += b" " * (-len(metadata) % 4)
        glb = b"glTF" + struct.pack("<II", 2, 20 + len(metadata)) + struct.pack("<II", len(metadata), 0x4E4F534A) + metadata
        manifest = {"id": "synthetic-atlas", "assetUrl": "/atlas/model.glb",
                    "coordinateFrame": {"id": "synthetic-frame"},
                    "statistics": {"glbSha256": hashlib.sha256(glb).hexdigest(), "glbBytes": len(glb)}}
        files = {".gitignore": ".publication/\ndist/\n__pycache__/\n",
                 ".npmrc": "save-exact=true\ncache=.npm-cache\n",
                 "README.md": "Complete synthetic project guide.\n",
                 "LICENSE": "Synthetic license fixture.\n", "LICENSES.md": "Synthetic data attribution.\n",
                 "package.json": json.dumps({"name": "mousebio-3d", "version": "1.2.3"}),
                 "public/atlas/atlas.json": json.dumps(manifest),
                 "public/atlas/model.glb": glb, "public/atlas/LICENSE.md": "Synthetic anatomical license.\n",
                 "public/THIRD_PARTY_NOTICES.txt": "Synthetic dependency notices.\n",
                 "src/main.ts": "export const synthetic = true;\n"}
        for name, value in files.items():
            path = root / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(value if isinstance(value, bytes) else value.encode())
        (root / "scripts").mkdir()
        shutil.copyfile(Path(__file__).with_name("check_publication.py"), root / "scripts/check_publication.py")
        git(root, "add", ".")
        git(root, "commit", "--quiet", "-m", "initialize_fixture")
        shutil.copytree(root / "public", root / "dist")
        (root / "dist/index.html").write_text('<!doctype html><title>Synthetic fixture</title>')
        (root / "dist/assets").mkdir()
        (root / "dist/assets/main.js").write_text('console.log("Synthetic fixture");')
        yield root


class ReleaseTests(unittest.TestCase):
    def test_native_ply_and_its_attribution_are_preserved_in_both_archives(self):
        with fixture() as root:
            files = ema147_fixture_files()
            for name,data in files.items():
                path = root / name; path.parent.mkdir(parents=True,exist_ok=True); path.write_bytes(data)
            git(root,'add','.'); git(root,'commit','--quiet','-m','add_native_fixture')
            shutil.copytree(root/'public',root/'dist',dirs_exist_ok=True)
            release = prepare_release(root,Path('.publication/native'))
            self.assertEqual(release['registeredAnatomy']['assets'],2)
            for kind in ('source','web'):
                archive = root/'.publication/native'/release['artifacts'][kind]['file']
                with zipfile.ZipFile(archive) as zipped:
                    for path,expected in files.items():
                        if kind == 'web' and not path.startswith('public/'):
                            self.assertNotIn(path,zipped.namelist()); continue
                        name = 'MouseBio_3D-1.2.3/' + path if kind == 'source' else path.removeprefix('public/')
                        self.assertEqual(zipped.read(name),expected)

    def test_native_web_tampering_is_rejected_before_packaging(self):
        for changed_name in ('atlas-ema147/ema147-native.ply','atlas-ema147/LICENSE.md'):
            with self.subTest(path=changed_name), fixture() as root:
                for name,data in ema147_fixture_files().items():
                    path = root/name; path.parent.mkdir(parents=True,exist_ok=True); path.write_bytes(data)
                git(root,'add','.'); git(root,'commit','--quiet','-m','add_native_fixture')
                shutil.copytree(root/'public',root/'dist',dirs_exist_ok=True)
                (root/'dist'/changed_name).write_bytes(b'Changed native release input')
                with self.assertRaises(ReleaseError): prepare_release(root,Path('.publication/native'))
                self.assertFalse((root/'.publication').exists())

    def test_hindlimb_and_its_distinct_license_are_preserved_in_both_archives(self):
        with fixture() as root:
            files = hindlimb_fixture_files()
            for name, data in files.items():
                path = root / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(data)
            git(root, "add", ".")
            git(root, "commit", "--quiet", "-m", "add_hindlimb_fixture")
            shutil.copytree(root / "public", root / "dist", dirs_exist_ok=True)
            release = prepare_release(root, Path(".publication/hindlimb"))
            self.assertEqual(release["registeredAnatomy"]["assets"], 2)
            for kind in ["source", "web"]:
                archive = root / ".publication/hindlimb" / release["artifacts"][kind]["file"]
                with zipfile.ZipFile(archive) as zipped:
                    for path, expected in files.items():
                        name = "MouseBio_3D-1.2.3/" + path if kind == "source" else path.removeprefix("public/")
                        self.assertEqual(zipped.read(name), expected)

    def test_mismatched_hindlimb_web_license_is_rejected_before_packaging(self):
        with fixture() as root:
            for name, data in hindlimb_fixture_files().items():
                path = root / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(data)
            git(root, "add", ".")
            git(root, "commit", "--quiet", "-m", "add_hindlimb_fixture")
            shutil.copytree(root / "public", root / "dist", dirs_exist_ok=True)
            (root / "dist/atlas-hindlimb/LICENSE.md").write_text("Mismatched attribution.\n")
            with self.assertRaisesRegex(ReleaseError, "registered_anatomy_metadata_or_license_mismatch"):
                prepare_release(root, Path(".publication/hindlimb"))
            self.assertFalse((root / ".publication").exists())

    def test_registered_volume_and_detail_are_in_both_archives_with_exact_bytes(self):
        with fixture() as root:
            files = volume_fixture_files(multi_level=True)
            for name, data in files.items():
                path = root / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(data)
            git(root, "add", ".")
            git(root, "commit", "--quiet", "-m", "add_volume_fixture")
            shutil.copytree(root / "public", root / "dist", dirs_exist_ok=True)
            release = prepare_release(root, Path(".publication/volume"))
            self.assertEqual(release["registeredAnatomy"]["assets"], 5)
            for kind in ["source", "web"]:
                archive = root / ".publication/volume" / release["artifacts"][kind]["file"]
                with zipfile.ZipFile(archive) as zipped:
                    for path, expected in files.items():
                        name = "MouseBio_3D-1.2.3/" + path if kind == "source" else path.removeprefix("public/")
                        self.assertEqual(zipped.read(name), expected)

    def test_dist_detail_tampering_is_rejected_before_artifacts_are_created(self):
        with fixture() as root:
            for name, data in volume_fixture_files(4).items():
                path = root / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(data)
            git(root, "add", ".")
            git(root, "commit", "--quiet", "-m", "add_volume_fixture")
            shutil.copytree(root / "public", root / "dist", dirs_exist_ok=True)
            (root / "dist/atlas-volume/detail/region-3.glb").write_bytes(b"Synthetic mismatched data")
            with self.assertRaisesRegex(ReleaseError, "registered_anatomy_asset_mismatch"):
                prepare_release(root, Path(".publication/volume"))
            self.assertFalse((root / ".publication").exists())

    def test_clean_source_without_readme_preserves_required_licenses_and_notices(self):
        with fixture() as root:
            git(root, "rm", "--quiet", "README.md")
            git(root, "commit", "--quiet", "-m", "omit_fixture_guide")
            self.assertEqual(git(root, "status", "--porcelain"), b"")
            release = prepare_release(root, Path(".publication/without-guide"))
            folder = root / ".publication/without-guide"
            self.assertFalse((folder / "source/README.md").exists())
            with zipfile.ZipFile(folder / release["artifacts"]["source"]["file"]) as zipped:
                prefix = "MouseBio_3D-1.2.3/"
                self.assertNotIn(prefix + "README.md", zipped.namelist())
                for name in ("LICENSE", "LICENSES.md", "public/THIRD_PARTY_NOTICES.txt",
                             "public/atlas/LICENSE.md", "public/atlas/atlas.json", "public/atlas/model.glb"):
                    self.assertEqual(zipped.read(prefix + name), (root / name).read_bytes())
            with zipfile.ZipFile(folder / release["artifacts"]["web"]["file"]) as zipped:
                for name in ("THIRD_PARTY_NOTICES.txt", "atlas/LICENSE.md", "atlas/atlas.json", "atlas/model.glb"):
                    self.assertEqual(zipped.read(name), (root / "public" / name).read_bytes())
            self.assertEqual(git(root, "status", "--porcelain"), b"")

    def test_complete_archives_are_deterministic_bound_and_free_of_development_history(self):
        with fixture() as root:
            review = audit(root)
            self.assertEqual(review["errorCount"] + review["warningCount"], 0, review)
            first = prepare_release(root, Path(".publication/first"))
            second = prepare_release(root, Path(".publication/second"))
            self.assertEqual(first, second)
            self.assertEqual(first["version"], "1.2.3")
            original_head = git(root, "rev-parse", "HEAD").decode().strip()
            for kind in ["source", "web"]:
                artifact = first["artifacts"][kind]
                archive = root / ".publication/first" / artifact["file"]
                self.assertEqual(hashlib.sha256(archive.read_bytes()).hexdigest(), artifact["sha256"])
                with zipfile.ZipFile(archive) as zipped:
                    names = zipped.namelist()
                    self.assertFalse(any(".git/" in name or "node_modules/" in name or "data/raw/" in name for name in names))
                    self.assertTrue(all(info.date_time == (1980, 1, 1, 0, 0, 0) for info in zipped.infolist()))
                    prefix = "MouseBio_3D-1.2.3/" if kind == "source" else ""
                    self.assertIn(prefix + ("README.md" if kind == "source" else "index.html"), names)
                    self.assertIn(prefix + ("public/atlas/model.glb" if kind == "source" else "atlas/model.glb"), names)
            report = (root / ".publication/first/release.json").read_text()
            self.assertNotIn(str(root), report)
            self.assertNotIn(original_head, report)
            self.assertIn("SHA256SUMS", [path.name for path in (root / ".publication/first").iterdir()])
            self.assertEqual(git(root, "status", "--porcelain"), b"")

    def test_dirty_or_untracked_source_is_rejected_before_output_creation(self):
        with fixture() as root:
            (root / "README.md").write_text("Changed, unreviewed guide.\n")
            with self.assertRaisesRegex(ReleaseError, "working_tree_not_clean"):
                prepare_release(root, Path(".publication/release"))
            self.assertFalse((root / ".publication").exists())
        with fixture() as root:
            (root / "unreviewed.txt").write_text("Synthetic untracked input.\n")
            with self.assertRaisesRegex(ReleaseError, "working_tree_not_clean"):
                prepare_release(root, Path(".publication/release"))

    def test_tracked_private_paths_and_symlinks_fail_closed(self):
        with fixture() as root:
            (root / ".env").write_text("Synthetic private input.\n")
            git(root, "add", ".env")
            git(root, "commit", "--quiet", "-m", "add_fixture")
            with self.assertRaisesRegex(ReleaseError, "private_input_path"):
                prepare_release(root, Path(".publication/release"))
            self.assertFalse((root / ".publication").exists())
        with fixture() as root:
            target = root.parent / "outside.py"
            target.write_text("Synthetic external fixture.\n")
            (root / "scripts/link.py").symlink_to(target)
            git(root, "add", "scripts/link.py")
            git(root, "commit", "--quiet", "-m", "add_fixture")
            with self.assertRaisesRegex(ReleaseError, "nonregular_tracked_input"):
                prepare_release(root, Path(".publication/release"))
            self.assertEqual(target.read_text(), "Synthetic external fixture.\n")

    def test_web_model_and_required_notices_must_match_reviewed_source(self):
        with fixture() as root:
            (root / "dist/atlas/model.glb").write_bytes(b"Wrong synthetic model")
            with self.assertRaisesRegex(ReleaseError, "anatomy_checksum_mismatch"):
                prepare_release(root, Path(".publication/release"))
            self.assertFalse((root / ".publication").exists())
        with fixture() as root:
            (root / "dist/THIRD_PARTY_NOTICES.txt").unlink()
            with self.assertRaisesRegex(ReleaseError, "required_release_file_missing"):
                prepare_release(root, Path(".publication/release"))

    def test_built_private_content_is_rejected_even_when_tracked_source_passes(self):
        with fixture() as root:
            address = "person" + "@" + "mailprovider.org"
            (root / "dist/assets/main.js").write_text(f'const contact = "{address}";')
            with self.assertRaisesRegex(ReleaseError, "publication_content_rejected"):
                prepare_release(root, Path(".publication/release"))
            self.assertFalse((root / ".publication").exists())

    def test_existing_output_and_unsafe_paths_are_never_overwritten(self):
        with fixture() as root:
            prepare_release(root, Path(".publication/release"))
            marker = root / ".publication/release/source/README.md"
            marker.write_text("Retain this existing output.\n")
            with self.assertRaisesRegex(ReleaseError, "output_already_exists"):
                prepare_release(root, Path(".publication/release"))
            self.assertEqual(marker.read_text(), "Retain this existing output.\n")
            with self.assertRaisesRegex(ReleaseError, "output_must_be_fresh_publication_child"):
                prepare_release(root, Path("elsewhere/release"))
        for name in ["../README.md", "/README.md", "data/raw/input.txt", "src/AUX.ts", "src/file:stream.ts"]:
            with self.subTest(name=name), self.assertRaises(ReleaseError):
                relative_name(name)

    def test_internal_agent_instructions_are_never_packaged_even_if_force_tracked(self):
        with fixture() as root:
            (root / "AGENTS.md").write_text("Local instructions, not publication content.\n")
            git(root, "add", "AGENTS.md")
            git(root, "commit", "--quiet", "-m", "add_fixture")
            with self.assertRaisesRegex(ReleaseError, "private_input_path"):
                prepare_release(root, Path(".publication/release"))
            self.assertFalse((root / ".publication").exists())


if __name__ == "__main__":
    unittest.main(verbosity=2)
