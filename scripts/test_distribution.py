"""Verify a local production distribution over HTTP, without claiming browser QA."""
from __future__ import annotations

import argparse
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import unittest
from urllib.parse import urljoin, urlparse
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]
BASE_URL = "http://127.0.0.1:4173/"


class References(HTMLParser):
    def __init__(self):
        super().__init__()
        self.references = []

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        if tag == "script" and "src" in values:
            self.references.append(values["src"])
        if tag == "link" and values.get("rel") == "stylesheet":
            self.references.append(values["href"])


def get(path: str) -> tuple[bytes, str]:
    destination = urljoin(BASE_URL, path)
    if urlparse(destination).hostname not in {"127.0.0.1", "localhost", "::1"}:
        raise ValueError("Distribution verification is restricted to local loopback")
    with urlopen(destination, timeout=20) as response:
        if response.status != 200:
            raise AssertionError(f"Unexpected HTTP status {response.status} for {path}")
        body = response.read(32 * 1024 * 1024 + 1)
        if len(body) > 32 * 1024 * 1024:
            raise AssertionError("Unexpectedly large production asset")
        return body, response.headers.get_content_type()


class ProductionDistributionTests(unittest.TestCase):
    def test_entry_and_initial_references_are_local_and_served(self):
        html, mime = get("/")
        self.assertEqual(mime, "text/html")
        self.assertIn(b"MouseBio_3D", html)
        parser = References()
        parser.feed(html.decode("utf-8"))
        self.assertGreaterEqual(len(parser.references), 2)
        for reference in parser.references:
            self.assertFalse(urlparse(reference).netloc, "Initial scripts and styles must be local")
            body, mime = get(reference)
            self.assertTrue(body)
            self.assertNotEqual(mime, "text/html", "An asset must not be an HTML fallback")

    def test_every_built_code_asset_is_served_byte_for_byte(self):
        assets = list((ROOT / "dist/assets").glob("*"))
        self.assertGreaterEqual(len(assets), 3, "Expected separate application and renderer chunks")
        for asset in assets:
            if asset.is_file():
                actual, _ = get(f"/assets/{asset.name}")
                self.assertEqual(actual, asset.read_bytes(), asset.name)

    def test_served_anatomy_matches_its_source_bound_manifest(self):
        raw_manifest, mime = get("/atlas/atlas.json")
        self.assertEqual(mime, "application/json")
        manifest = json.loads(raw_manifest)
        self.assertEqual(len(manifest["structures"]), 17)
        glb, _ = get(manifest["assetUrl"])
        self.assertEqual(hashlib.sha256(glb).hexdigest(), manifest["statistics"]["glbSha256"])
        self.assertEqual(len(glb), manifest["statistics"]["glbBytes"])
        self.assertEqual(glb[:4], b"glTF")

    def test_distributed_source_and_dependency_notices_are_present(self):
        notices, _ = get("/THIRD_PARTY_NOTICES.txt")
        for required in [b"Qasim Hussain", b"react ", b"react-dom ", b"scheduler ", b"three ", b"CC BY-SA 4.0"]:
            self.assertIn(required, notices)
        license_text, _ = get("/atlas/LICENSE.md")
        self.assertIn(b"Dogdas", license_text)
        self.assertIn(b"creativecommons.org/licenses/by-sa/4.0", license_text)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default=BASE_URL)
    args = parser.parse_args()
    parsed = urlparse(args.url)
    if parsed.scheme != "http" or parsed.hostname not in {"127.0.0.1", "localhost", "::1"}:
        parser.error("Use an HTTP loopback URL for the local production preview")
    BASE_URL = args.url.rstrip("/") + "/"
    unittest.main(argv=[__file__], verbosity=2)
