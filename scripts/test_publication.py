#!/usr/bin/env python3
"""Synthetic publication-check acceptance cases; no real credential values."""
import json
import struct
import subprocess
import tempfile
import unittest
from pathlib import Path

from check_publication import audit, inspect_content, scan_text


class PublicationTests(unittest.TestCase):
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


if __name__ == "__main__":
    unittest.main()
