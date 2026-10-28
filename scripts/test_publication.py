#!/usr/bin/env python3
"""Synthetic publication-check acceptance cases; no real credential values."""
import json
import struct
import subprocess
import tempfile
import unittest
from unittest.mock import patch

import check_publication
from pathlib import Path

from check_publication import audit, inspect_content, scan_text


class PublicationTests(unittest.TestCase):
    def git_bytes(self, root, *arguments, payload=None):
        return subprocess.run(["git", "-C", str(root), *arguments], input=payload,
                              capture_output=True, check=True).stdout

    def repository(self, root):
        self.git_bytes(root, "init", "--quiet")
        for key, value in [("user.name", "Qasim Hussain"),
                           ("user.email", "fixture" + "@" + "users.noreply.github.com"),
                           ("commit.gpgsign", "false"), ("tag.gpgsign", "false")]:
            self.git_bytes(root, "config", key, value)
        (root / "guide.txt").write_text("Portable guide.\n")
        self.git_bytes(root, "add", "guide.txt")
        self.git_bytes(root, "commit", "--quiet", "-m", "add_fixture")

    def repository_state(self, root):
        return tuple(self.git_bytes(root, *arguments) for arguments in [
            ("show-ref", "--head"), ("ls-files", "--stage"), ("status", "--porcelain"),
        ])

    def test_local_paths_and_credentials_are_reported_without_values(self):
        address = "person" + "@" + "mailprovider.org"
        token = "ghp_" + "a" * 30
        local_path = "/".join(["", "home", "private-user", "project"])
        report = scan_text(f"{address}\n{token}\n{local_path}", "README.md", "tracked")
        kinds = {entry["type"] for entry in report}
        self.assertTrue({"email-address", "credential-token-pattern", "machine-local-user-path"} <= kinds)
        serialized = json.dumps(report)
        for value in [address, token, local_path]:
            self.assertNotIn(value, serialized)

    def test_reserved_domain_fixtures_and_required_attribution_are_distinguished(self):
        reserved = "fixture" + "@" + "example.org"
        self.assertEqual(scan_text(reserved, "tests/check.test.ts", "tracked")[0]["severity"], "info")
        author = "author" + "@" + "thirdparty.org"
        result = scan_text(author, "public/THIRD_PARTY_NOTICES.txt", "tracked")
        self.assertEqual(result[0]["type"], "third-party-attribution-contact")
        self.assertEqual(result[0]["severity"], "warning")

    def test_checker_source_is_reviewable_without_weakening_home_path_detection(self):
        code = Path(__file__).with_name("check_publication.py").read_text()
        self.assertFalse(any(item["severity"] == "error" for item in scan_text(code, "scripts/check_publication.py", "tracked")))
        for parts in [["", "mnt", "c", "Users", "private-user", "project"], ["C:", "Users", "private-user", "project"]]:
            findings = scan_text("/".join(parts), "README.md", "tracked")
            self.assertTrue(any(item["type"] == "machine-local-user-path" for item in findings))

    def test_user_info_urls_and_private_key_headers_are_flagged(self):
        content = "https://" + "account:credential" + "@" + "service.org/resource\n"
        content += "-----BEGIN " + "PRIVATE KEY-----"
        kinds = {entry["type"] for entry in scan_text(content, "config.txt", "tracked")}
        self.assertIn("url-user-info", kinds)
        self.assertIn("private-key-header", kinds)

    def test_glb_metadata_is_checked_and_opaque_binary_is_disclosed(self):
        content = json.dumps({"asset": {"version": "2.0"}, "extras": {"path": "/".join(["", "home", "private-user", "model"])}}).encode()
        content += b" " * (-len(content) % 4)
        glb = b"glTF" + struct.pack("<II", 2, 20 + len(content)) + struct.pack("<II", len(content), 0x4E4F534A) + content
        findings, checked = inspect_content(glb, "model.glb", "tracked")
        self.assertTrue(checked)
        self.assertEqual(findings[0]["type"], "machine-local-user-path")
        self.assertEqual(inspect_content(b"\0binary", "data.bin", "tracked"), ([], False))

    def test_index_snapshot_and_working_tree_are_inspected_separately(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            subprocess.run(["git", "init", "--quiet", str(root)], check=True, capture_output=True)
            subprocess.run(["git", "-C", str(root), "config", "user.email", "fixture" + "@" + "users.noreply.github.com"], check=True)
            file = root / "README.md"
            file.write_text("Portable project guide.\n")
            subprocess.run(["git", "-C", str(root), "add", "README.md"], check=True)
            file.write_text("/".join(["", "home", "private-user", "project"]))
            staged = audit(root, "staged")
            tracked = audit(root, "tracked")
            self.assertIs(staged["gitMetadataIncluded"], False)
            self.assertIs(tracked["gitMetadataIncluded"], False)
            self.assertFalse(any(entry["type"] == "machine-local-user-path" for entry in staged["findings"]))
            self.assertTrue(any(entry["type"] == "machine-local-user-path" for entry in tracked["findings"]))

    def test_opaque_tracked_binary_requires_review_instead_of_privacy_pass(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            subprocess.run(["git", "init", "--quiet", str(root)], check=True, capture_output=True)
            (root / "input.bin").write_bytes(b"\0opaque")
            subprocess.run(["git", "-C", str(root), "add", "input.bin"], check=True)
            report = audit(root)
            self.assertEqual(report["opaqueBinariesNotTextReviewed"], 1)
            self.assertEqual(report["warningCount"], 1)
            self.assertTrue(any(entry["type"] == "opaque-binary-not-reviewed" for entry in report["findings"]))

    def test_history_identity_is_flagged_without_rewriting_or_exposing_it(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            subprocess.run(["git", "init", "--quiet", str(root)], check=True, capture_output=True)
            address = "fixture" + "@" + "mailprovider.org"
            for key, value in [("user.name", "Qasim Hussain"), ("user.email", address)]:
                subprocess.run(["git", "-C", str(root), "config", key, value], check=True)
            (root / "README.md").write_text("Portable guide.\n")
            subprocess.run(["git", "-C", str(root), "add", "README.md"], check=True)
            subprocess.run(["git", "-C", str(root), "commit", "--quiet", "-m", "add_guide"], check=True)
            before = subprocess.run(["git", "-C", str(root), "rev-parse", "HEAD"], check=True, capture_output=True).stdout
            report = audit(root, history=True)
            self.assertEqual(report["reachableCommits"], 1)
            self.assertTrue(any(entry["type"] == "reachable-history-non-noreply-email" for entry in report["findings"]))
            self.assertNotIn(address, json.dumps(report))
            after = subprocess.run(["git", "-C", str(root), "rev-parse", "HEAD"], check=True, capture_output=True).stdout
            self.assertEqual(before, after)


    def test_removed_historical_private_paths_are_checked_before_blob_dedup(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.repository(root)
            paths = ["AGENTS.md", "nested/aGeNtS.Md", "research-data/observations.csv",
                     "data/raw/original.txt", ".aws/credentials", ".env.local"]
            for name in [*paths, ".env.example"]:
                file = root / name
                file.parent.mkdir(parents=True, exist_ok=True)
                # The surviving guide shares this blob, so history dedup sees it first.
                file.write_text("Portable guide.\n")
            (root / "link-target.txt").write_text("guide.txt")
            (root / "history-symlink").symlink_to("guide.txt")
            self.git_bytes(root, "add", "--all")
            target = self.git_bytes(root, "rev-parse", "HEAD").decode().strip()
            self.git_bytes(root, "update-index", "--add", "--cacheinfo", "160000", target, "history-submodule")
            self.git_bytes(root, "commit", "--quiet", "-m", "add_private_paths")
            for name in [*paths, "history-symlink"]:
                (root / name).unlink()
            self.git_bytes(root, "rm", "--cached", "history-submodule")
            self.git_bytes(root, "add", "--all")
            self.git_bytes(root, "commit", "--quiet", "-m", "remove_private_paths")
            before = self.repository_state(root)
            report = audit(root, history=True)
            blocked = {entry["path"] for entry in report["findings"]
                       if entry["scope"] == "history" and entry["type"] == "private-input-path-tracked"}
            self.assertEqual(blocked, set(paths))
            nonregular = {entry["path"] for entry in report["findings"]
                          if entry["scope"] == "history" and entry["type"] == "missing-or-symlink-input"}
            self.assertEqual(nonregular, {"history-symlink", "history-submodule"})
            self.assertFalse(any(entry["type"] == "private-input-path-tracked" and entry["path"] == ".env.example"
                                 for entry in report["findings"]))
            self.assertFalse(any(entry["type"] == "private-input-path-tracked" and entry["scope"] == "tracked"
                                 for entry in report["findings"]))
            self.assertEqual(before, self.repository_state(root))

    def test_reachable_commit_messages_are_scanned_without_values_or_rewriting(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.repository(root)
            address = "person" + "@" + "mailprovider.org"
            token = "ghp_" + "b" * 30
            local_path = "/".join(["", "home", "private-user", "project"])
            assigned = "s" * 12
            message = "\n".join(["review_record", address, token, local_path, "password=" + assigned])
            self.git_bytes(root, "commit", "--quiet", "--allow-empty", "-F", "-", payload=message.encode())
            before = self.repository_state(root)
            report = audit(root, history=True)
            matches = [entry for entry in report["findings"] if entry["path"].startswith(".git/history/commits/")]
            self.assertTrue({"email-address", "credential-token-pattern", "machine-local-user-path",
                             "credential-assignment"} <= {entry["type"] for entry in matches})
            self.assertTrue(all(entry["scope"] == "git-metadata" for entry in matches))
            for value in [address, token, local_path, assigned]:
                self.assertNotIn(value, json.dumps(report))
            self.assertEqual(before, self.repository_state(root))

    def test_nested_annotated_tag_contents_and_tagger_are_scanned_without_values(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.repository(root)
            address = "private-tagger" + "@" + "mailprovider.org"
            token = "ghp_" + "c" * 30
            local_path = "/".join(["", "home", "private-user", "tag-source"])
            message = "\n".join(["review_tag", token, local_path])
            self.git_bytes(root, "-c", "user.email=" + address, "tag", "-a", token, "-F", "-", payload=message.encode())
            self.git_bytes(root, "tag", "-a", "outer_tag", token, "-m", "portable_tag")
            self.git_bytes(root, "tag", "-d", token)
            before = self.repository_state(root)
            report = audit(root, history=True)
            matches = [entry for entry in report["findings"] if entry["path"].startswith(".git/history/tags/")]
            self.assertTrue({"reachable-tag-non-noreply-email", "email-address",
                             "credential-token-pattern", "machine-local-user-path"}
                            <= {entry["type"] for entry in matches})
            self.assertTrue(all(entry["scope"] == "git-metadata" for entry in matches))
            for value in [address, token, local_path]:
                self.assertNotIn(value, json.dumps(report))
            self.assertEqual(before, self.repository_state(root))

    def test_commit_and_tag_metadata_retain_size_and_object_scan_bounds(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.repository(root)
            self.git_bytes(root, "commit", "--quiet", "--allow-empty", "-m", "x" * 600)
            self.git_bytes(root, "tag", "-a", "bounded_tag", "-m", "y" * 600)
            before = self.repository_state(root)
            with patch.object(check_publication, "MAX_FILE_BYTES", 256):
                report = audit(root, history=True)
            bounded = [entry["path"] for entry in report["findings"]
                       if entry["type"] == "file-exceeds-scan-bound" and entry["scope"] == "git-metadata"]
            self.assertTrue(any(path.startswith(".git/history/commits/") for path in bounded))
            self.assertTrue(any(path.startswith(".git/history/tags/") for path in bounded))
            with patch.object(check_publication, "MAX_HISTORY_BLOBS", 1):
                report = audit(root, history=True)
            self.assertTrue(any(entry["type"] == "history-metadata-exceeds-scan-bound"
                                for entry in report["findings"]))
            self.assertEqual(before, self.repository_state(root))


if __name__ == "__main__":
    unittest.main()
