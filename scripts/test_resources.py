"""Acceptance tests for project storage accounting, using temporary fixtures."""
from __future__ import annotations

import os
from pathlib import Path
import tempfile
import unittest

from resource_usage import collect_usage


class ResourceAccountingTests(unittest.TestCase):
    def test_hidden_git_cache_and_research_entries_are_counted(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            for directory, content in ((".git", b"git"), (".npm-cache", b"cache"), ("research-data", b"research")):
                (root / directory).mkdir()
                (root / directory / "fixture").write_bytes(content)
            result = collect_usage(root)
            self.assertTrue(result["scanComplete"])
            self.assertEqual(result["totals"]["regularFiles"], 3)
            self.assertEqual(result["totals"]["logicalBytes"], 16)
            self.assertIn(".git", result["byTopLevel"])
            self.assertIn(".npm-cache", result["byTopLevel"])
            self.assertIn("research-data", result["byTopLevel"])
            self.assertTrue(result["withinBudget"])

    def test_symlinks_are_not_followed_and_cycles_are_safe(self):
        with tempfile.TemporaryDirectory() as temporary:
            parent = Path(temporary)
            root = parent / "project"
            root.mkdir()
            (parent / "outside").write_bytes(b"not part of this project")
            try:
                (root / "external").symlink_to(parent / "outside")
                (root / "cycle").symlink_to(root, target_is_directory=True)
            except (OSError, NotImplementedError):
                self.skipTest("Symlink creation is unavailable in this environment")
            result = collect_usage(root)
            self.assertTrue(result["scanComplete"])
            self.assertEqual(result["totals"]["symlinks"], 2)
            self.assertEqual(result["totals"]["regularFiles"], 0)
            self.assertEqual(result["totals"]["logicalBytes"], 0)

    def test_hardlinks_have_explicit_apparent_and_unique_accounting(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / "original").write_bytes(b"12345")
            try:
                os.link(root / "original", root / "linked")
            except OSError:
                self.skipTest("Hardlink creation is unavailable in this environment")
            result = collect_usage(root)
            self.assertEqual(result["totals"]["logicalBytes"], 10)
            self.assertEqual(result["totals"]["uniqueRegularFileBytes"], 5)
            self.assertFalse(collect_usage(root, budget_bytes=1)["withinBudget"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
