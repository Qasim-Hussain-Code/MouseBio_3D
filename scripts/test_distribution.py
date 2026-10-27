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
from check_publication import anatomy_registry, inspect_registered_asset

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

    def test_volume_and_all_regional_assets_match_reviewed_source(self):
        registry = anatomy_registry(lambda path, limit: (ROOT / path).read_bytes() if (ROOT / path).is_file() else None)
        volume_assets = {path: binding for path, binding in registry.items() if path.startswith("public/atlas-volume/")}
        self.assertEqual(len(volume_assets), 22)
        for path, binding in volume_assets.items():
            with self.subTest(path=path):
                data, mime = get(path.removeprefix("public"))
                self.assertNotEqual(mime, "text/html")
                inspect_registered_asset(data, binding)
                self.assertEqual(data, (ROOT / path).read_bytes())
        for name in ["atlas.json", "detail-index.json", "LICENSE.md"]:
            data, _ = get(f"/atlas-volume/{name}")
            self.assertEqual(data, (ROOT / "public/atlas-volume" / name).read_bytes())

    def test_hindlimb_and_its_attribution_match_reviewed_source(self):
        registry = anatomy_registry(lambda path, limit: (ROOT / path).read_bytes() if (ROOT / path).is_file() else None)
        path = "public/atlas-hindlimb/charles2016-hindlimb.glb"
        self.assertIn(path, registry)
        data, mime = get(path.removeprefix("public"))
        self.assertNotEqual(mime, "text/html")
        inspect_registered_asset(data, registry[path])
        self.assertEqual(data, (ROOT / path).read_bytes())
        for name in ["atlas.json", "LICENSE.md"]:
            data, _ = get(f"/atlas-hindlimb/{name}")
            self.assertEqual(data, (ROOT / "public/atlas-hindlimb" / name).read_bytes())

    def test_native_ema147_and_its_attribution_match_reviewed_source(self):
        registry = anatomy_registry(lambda path, limit: (ROOT/path).read_bytes() if (ROOT/path).is_file() else None)
        path = 'public/atlas-ema147/ema147-native.ply'
        self.assertIn(path,registry)
        data,mime = get(path.removeprefix('public'))
        self.assertNotEqual(mime,'text/html')
        inspect_registered_asset(data,registry[path])
        self.assertEqual(data,(ROOT/path).read_bytes())
        for name in ('atlas.json','LICENSE.md'):
            data,_ = get(f'/atlas-ema147/{name}')
            self.assertEqual(data,(ROOT/'public/atlas-ema147'/name).read_bytes())


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default=BASE_URL)
    args = parser.parse_args()
    parsed = urlparse(args.url)
    if parsed.scheme != "http" or parsed.hostname not in {"127.0.0.1", "localhost", "::1"}:
        parser.error("Use an HTTP loopback URL for the local production preview")
    BASE_URL = args.url.rstrip("/") + "/"
    unittest.main(argv=[__file__], verbosity=2)
