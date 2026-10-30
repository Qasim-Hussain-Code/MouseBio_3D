#!/usr/bin/env python3
"""Small local HTTP and filesystem acceptance checks for the Python preview."""
from __future__ import annotations

from contextlib import contextmanager, redirect_stderr, redirect_stdout
from dataclasses import FrozenInstanceError
import hashlib
import http.client
import io
import json
import os
from pathlib import Path
import tempfile
import threading
import unittest
from unittest import mock

import serve_prototype as preview

JS = "assets/index-abcdefgh.js"
CSS = "assets/index-abcdefgh.css"
INDEX = ("<!doctype html><html><head><title>MouseBio_3D synthetic preview</title>"
         f'<script type="module" src="/{JS}"></script><link rel="stylesheet" href="/{CSS}">'
         '</head><body><div id="root"></div></body></html>').encode()


def write(root: Path, name: str, data: bytes) -> None:
    path = root / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)


def atlas(root: Path, directory: str = "atlas") -> tuple[str, bytes]:
    name = directory + "/" + preview.ATLAS_ASSETS[directory]
    body = b"synthetic geometry fixture, not an anatomical validation"
    metadata = {"id": "synthetic-reference", "assetUrl": "/" + name,
                "statistics": {"assetBytes": len(body), "assetSha256": hashlib.sha256(body).hexdigest()}}
    write(root, name, body)
    write(root, directory + "/atlas.json", json.dumps(metadata).encode())
    write(root, directory + "/LICENSE.md", b"Synthetic attribution fixture.\n")
    return name, body


def model_metadata() -> dict:
    return {"schemaVersion": "mousebio.cellular-model.v1", "id": preview.MODEL_ID,
            "source": {"exposure": preview.MODEL_EXPOSURE, "revision": preview.MODEL_REVISION,
                       "license": "CC-BY-3.0", "licenseUrl": preview.MODEL_LICENSE_URL},
            "adaptation": {"file": preview.MODEL_MODULE, "bytes": 25153, "sha256": "a" * 64},
            "counts": dict(preview.MODEL_COUNTS)}


def model(root: Path, metadata: dict | None = None) -> None:
    write(root, preview.MODEL_MANIFEST, json.dumps(model_metadata() if metadata is None else metadata).encode())
    write(root, preview.MODEL_NOTICE,
          b"Synthetic attribution: Bondarenko et al. doi:10.1152/ajpheart.00185.2003. "
          b"https://creativecommons.org/licenses/by/3.0/\n")


@contextmanager
def fixture():
    with tempfile.TemporaryDirectory(prefix="mousebio-preview-test-") as folder:
        root = Path(folder) / "web"
        root.mkdir()
        write(root, "index.html", INDEX)
        write(root, JS, b"export const fixture = true;\n")
        write(root, CSS, b"body { color: black; }\n")
        write(root, "THIRD_PARTY_NOTICES.txt", b"Synthetic dependency notices.\n")
        atlas(root)
        yield root


@contextmanager
def running(root: Path):
    server = preview.create_server(root, port=0)
    thread = threading.Thread(target=server.serve_forever, kwargs={"poll_interval": 0.01}, daemon=True)
    thread.start()
    try: yield server
    finally:
        server.shutdown()
        thread.join(timeout=2)
        server.server_close()
        if thread.is_alive(): raise AssertionError("The local preview thread did not stop.")


def request(server, path: str, method: str = "GET", headers: dict | None = None, body: bytes | None = None):
    connection = http.client.HTTPConnection("127.0.0.1", server.server_address[1], timeout=3)
    try:
        connection.request(method, path, body=body, headers=headers or {})
        response = connection.getresponse()
        return response.status, {key.lower(): value for key, value in response.getheaders()}, response.read()
    finally: connection.close()


class PrototypeTests(unittest.TestCase):
    def test_hashed_worker_and_known_model_notices_are_served(self):
        with fixture() as root:
            worker="assets/cardiac-cell.worker-abcdefgh.js"
            write(root,worker,b"self.onmessage=()=>{};\n")
            model(root)
            with running(root) as server:
                status,headers,body=request(server,'/'+worker)
                self.assertEqual(status,200);self.assertIn('javascript',headers['content-type'])
                self.assertIn("worker-src 'self' blob:",headers['content-security-policy'])
                self.assertEqual(request(server,'/models/bondarenko-apical/LICENSE.md')[0],200)


    def test_model_metadata_and_required_attribution_are_a_pair(self):
        for missing in ("manifest", "notice", "empty_notice", "unrelated_notice"):
            with self.subTest(missing=missing), fixture() as root:
                model(root)
                if missing == "manifest": (root / preview.MODEL_MANIFEST).unlink()
                if missing == "notice": (root / preview.MODEL_NOTICE).unlink()
                if missing == "empty_notice": (root / preview.MODEL_NOTICE).write_bytes(b" \n")
                if missing == "unrelated_notice": (root / preview.MODEL_NOTICE).write_bytes(b"Unrelated synthetic license.\n")
                with self.assertRaises(preview.PreviewError): preview.validate_bundle(root)

    def test_model_json_identity_source_license_hash_format_and_exact_numeric_counts_are_checked(self):
        mutations = [
            lambda value: value.update(schemaVersion="other"), lambda value: value.update(id="other"),
            lambda value: value.update(source=[]),
            lambda value: value["source"].update(exposure="https://example.invalid/other"),
            lambda value: value["source"].update(revision="0" * 40),
            lambda value: value["source"].update(license="MIT"),
            lambda value: value["source"].update(licenseUrl="https://example.invalid/license"),
            lambda value: value.update(adaptation=[]),
            lambda value: value["adaptation"].update(file="data/raw/original.c"),
            lambda value: value["adaptation"].update(bytes=0),
            lambda value: value["adaptation"].update(bytes=True),
            lambda value: value["adaptation"].update(bytes=preview.MAX_FILE_BYTES + 1),
            lambda value: value["adaptation"].update(sha256=None),
            lambda value: value["adaptation"].update(sha256="A" * 64),
            lambda value: value["adaptation"].update(sha256="a" * 63),
            lambda value: value.update(counts=[]),
            lambda value: value["counts"].update(states=40),
            lambda value: value["counts"].update(states=41.0),
            lambda value: value["counts"].update(extra=1),
        ]
        for number, mutate in enumerate(mutations):
            with self.subTest(mutation=number), fixture() as root:
                metadata = model_metadata(); mutate(metadata); model(root, metadata)
                with self.assertRaisesRegex(preview.PreviewError, "invalid_bundle_model_metadata"):
                    preview.validate_bundle(root)
        for body in (b"not JSON PRIVATE_SYNTHETIC_MARKER", b"[]", b"null"):
            with self.subTest(body_type=body[:8]), fixture() as root:
                model(root); (root / preview.MODEL_MANIFEST).write_bytes(body)
                with self.assertRaises(preview.PreviewError) as caught: preview.validate_bundle(root)
                self.assertNotIn("PRIVATE_SYNTHETIC_MARKER", str(caught.exception))

    def test_model_manifest_uses_the_metadata_byte_bound_without_large_allocations(self):
        with fixture() as root:
            model(root)
            size = (root / preview.MODEL_MANIFEST).stat().st_size
            self.assertGreater(size, len(INDEX))
            with mock.patch.object(preview, "MAX_METADATA_BYTES", size - 1):
                with self.assertRaisesRegex(preview.PreviewError, "unsafe_or_oversized_bundle_file"):
                    preview.validate_bundle(root)
            with mock.patch.object(preview, "MAX_METADATA_BYTES", size):
                self.assertIn(preview.MODEL_MANIFEST, preview.validate_bundle(root).files)

    def test_current_declared_model_metadata_needs_no_raw_equations_or_source_module_in_web_bundle(self):
        public = Path(__file__).resolve().parents[1] / "public"
        with fixture() as root:
            for name in (preview.MODEL_MANIFEST, preview.MODEL_NOTICE):
                write(root, name, (public / name).read_bytes())
            bundle = preview.validate_bundle(root)
            self.assertIn(preview.MODEL_MANIFEST, bundle.files)
            self.assertNotIn(preview.MODEL_MODULE, bundle.files)


    def test_inventory_is_bounded_immutable_and_contains_only_web_files(self):
        with fixture() as root:
            bundle = preview.validate_bundle(root)
            self.assertEqual(len(bundle.files), 7)
            self.assertEqual(bundle.total_bytes, sum(len(entry.data) for entry in bundle.files.values()))
            self.assertEqual(bundle.files["index.html"].data, INDEX)
            with self.assertRaises(TypeError): bundle.files["extra.txt"] = bundle.files["index.html"]
            with self.assertRaises(FrozenInstanceError): bundle.files["index.html"].data = b"changed"

    def test_real_loopback_get_head_content_types_and_local_only_headers(self):
        with fixture() as root, running(root) as server:
            self.assertEqual(server.server_address[0], "127.0.0.1")
            cases = {"/": (INDEX, "text/html; charset=utf-8"), "/index.html": (INDEX, "text/html; charset=utf-8"),
                     "/" + JS: ((root / JS).read_bytes(), "text/javascript; charset=utf-8"),
                     "/" + CSS: ((root / CSS).read_bytes(), "text/css; charset=utf-8"),
                     "/atlas/digimouse.glb": ((root / "atlas/digimouse.glb").read_bytes(), "model/gltf-binary"),
                     "/atlas/atlas.json": ((root / "atlas/atlas.json").read_bytes(), "application/json; charset=utf-8"),
                     "/atlas/LICENSE.md": ((root / "atlas/LICENSE.md").read_bytes(), "text/plain; charset=utf-8")}
            for path, (expected, content_type) in cases.items():
                with self.subTest(path=path):
                    status, headers, body = request(server, path)
                    self.assertEqual(status, 200); self.assertEqual(body, expected)
                    self.assertEqual(headers["content-type"], content_type)
                    self.assertEqual(int(headers["content-length"]), len(expected))
                    self.assertEqual(headers["cache-control"], "no-store")
                    self.assertEqual(headers["x-content-type-options"], "nosniff")
                    self.assertEqual(headers["referrer-policy"], "no-referrer")
                    self.assertEqual(headers["cross-origin-resource-policy"], "same-origin")
                    self.assertIn("connect-src 'self'", headers["content-security-policy"])
                    self.assertNotIn("access-control-allow-origin", headers)
                    head_status, head_headers, head_body = request(server, path, "HEAD")
                    self.assertEqual(head_status, 200); self.assertEqual(head_body, b"")
                    self.assertEqual(head_headers["content-length"], str(len(expected)))

    def test_directories_traversal_encoded_paths_and_private_paths_never_fall_back_to_index(self):
        with fixture() as root, running(root) as server:
            paths = ["/assets/", "/atlas", "/atlas/", "/../index.html", "/atlas/../index.html",
                     "/%2e%2e/index.html", "/atlas%2f..%2findex.html", "/%252e%252e/index.html",
                     "/atlas\\..\\index.html", "/index.html:stream", "/.git/config", "/research-data/observations.json",
                     "/etc/passwd", "/missing", "/atlas//atlas.json", "/./index.html"]
            for path in paths:
                with self.subTest(path=path):
                    status, _, body = request(server, path)
                    self.assertEqual(status, 404); self.assertEqual(body, b"Request unavailable.\n")
                    self.assertNotIn(path.encode(), body)
            self.assertEqual(request(server, "/?local=only")[2], INDEX)

    def test_foreign_or_ambiguous_host_and_absolute_targets_are_rejected(self):
        with fixture() as root, running(root) as server:
            status, _, body = request(server, "/", headers={"Host": "untrusted.invalid"})
            self.assertEqual(status, 403); self.assertNotIn(b"untrusted.invalid", body)
            connection = http.client.HTTPConnection("127.0.0.1", server.server_address[1], timeout=3)
            try:
                connection.putrequest("GET", "/", skip_host=True)
                connection.putheader("Host", f"127.0.0.1:{server.server_address[1]}")
                connection.putheader("Host", "untrusted.invalid")
                connection.endheaders()
                response = connection.getresponse(); self.assertEqual(response.status, 403); response.read()
            finally: connection.close()
            status, _, _ = request(server, "http://untrusted.invalid/index.html", headers={"Host": f"127.0.0.1:{server.server_address[1]}"})
            self.assertEqual(status, 404)

    def test_writing_and_unknown_http_methods_are_disabled_without_echoing_request_values(self):
        with fixture() as root, running(root) as server:
            for method in ("POST", "PUT", "DELETE", "PATCH", "OPTIONS", "TRACE", "UNKNOWN"):
                with self.subTest(method=method):
                    status, headers, body = request(server, "/index.html", method, body=b"PRIVATE_SYNTHETIC_MARKER")
                    self.assertEqual(status, 405); self.assertEqual(headers["allow"], "GET, HEAD")
                    self.assertEqual(body, b"Request unavailable.\n")
            self.assertEqual((root / "index.html").read_bytes(), INDEX)

    def test_snapshot_does_not_read_replaced_files_new_files_or_later_symlink_escapes(self):
        with fixture() as root, running(root) as server:
            outside = root.parent / "private.txt"; outside.write_bytes(b"PRIVATE_SYNTHETIC_MARKER")
            (root / "index.html").unlink(); (root / "index.html").symlink_to(outside)
            write(root, "assets/extra-abcdefgh.js", b"PRIVATE_SYNTHETIC_MARKER")
            (root / "research-data").mkdir(); (root / "research-data/observations.json").symlink_to(outside)
            self.assertEqual(request(server, "/")[2], INDEX)
            for path in ("/assets/extra-abcdefgh.js", "/research-data/observations.json"):
                self.assertEqual(request(server, path)[0], 404)

    def test_source_checkout_research_and_arbitrary_extra_files_fail_closed(self):
        for extra in ("src/main.tsx", "research-data/observations.json", ".git/config", "notes.txt", "assets/raw.json", "atlas/private.json"):
            with self.subTest(path=extra), fixture() as root:
                write(root, extra, b"PRIVATE_SYNTHETIC_MARKER")
                with self.assertRaises(preview.PreviewError) as caught: preview.validate_bundle(root)
                self.assertNotIn(str(root), str(caught.exception)); self.assertNotIn("PRIVATE_SYNTHETIC_MARKER", str(caught.exception))

    def test_file_directory_root_ancestor_symlinks_and_hardlinks_are_rejected(self):
        for kind in ("file", "directory", "root", "ancestor", "hardlink"):
            with self.subTest(kind=kind), fixture() as root:
                target = root
                if kind in {"file", "hardlink"}:
                    outside = root.parent / "outside.js"; outside.write_bytes(b"PRIVATE_SYNTHETIC_MARKER")
                    (root / JS).unlink()
                    if kind == "file": (root / JS).symlink_to(outside)
                    else: os.link(outside, root / JS)
                elif kind == "directory":
                    outside = root.parent / "outside"; outside.mkdir()
                    (root / "atlas-volume").symlink_to(outside, target_is_directory=True)
                elif kind == "root":
                    target = root.parent / "alias"; target.symlink_to(root, target_is_directory=True)
                else:
                    alias = root.parent / "alias"; alias.symlink_to(root.parent, target_is_directory=True)
                    target = alias / root.name
                with self.assertRaises(preview.PreviewError): preview.validate_bundle(target)

    def test_manifest_bytes_hash_urls_and_required_attribution_are_checked(self):
        for mutation in ("bytes", "hash", "url", "license", "missing_model", "empty_notices"):
            with self.subTest(mutation=mutation), fixture() as root:
                path = root / "atlas/atlas.json"; manifest = json.loads(path.read_bytes())
                if mutation == "bytes": manifest["statistics"]["assetBytes"] += 1
                if mutation == "hash": manifest["statistics"]["assetSha256"] = "0" * 64
                if mutation == "url": manifest["assetUrl"] = "/research-data/private.glb"
                if mutation == "license": (root / "atlas/LICENSE.md").unlink()
                if mutation == "missing_model": (root / "atlas/digimouse.glb").unlink()
                if mutation == "empty_notices": (root / "THIRD_PARTY_NOTICES.txt").write_bytes(b"")
                path.write_text(json.dumps(manifest))
                with self.assertRaises(preview.PreviewError): preview.validate_bundle(root)

    def test_index_requires_the_mousebio_root_and_existing_local_hashed_entry_assets(self):
        for changed in (INDEX.replace(b"MouseBio_3D", b"Other application"), INDEX.replace(b'id="root"', b'id="other"'),
                        INDEX.replace(JS.encode(), b"assets/missing-abcdefgh.js"), INDEX.replace(("/" + JS).encode(), b"https://untrusted.invalid/script.js"),
                        INDEX.replace(b'type="module"', b'type="text/javascript"'), INDEX.replace(b"<head>", b'<head><base href="https://untrusted.invalid/">')):
            with self.subTest(index=changed), fixture() as root:
                (root / "index.html").write_bytes(changed)
                with self.assertRaises(preview.PreviewError): preview.validate_bundle(root)

    def test_optional_references_and_detail_assets_require_their_own_bound_manifest_and_notice(self):
        with fixture() as root:
            for directory in preview.ATLAS_ASSETS:
                if directory != "atlas": atlas(root, directory)
            name = "atlas-volume/detail/region-3.glb"; body = b"synthetic detail fixture"
            write(root, name, body)
            detail = {"assetUrl": "/" + name, "glbBytes": len(body), "glbSha256": hashlib.sha256(body).hexdigest()}
            write(root, "atlas-volume/detail-index.json", json.dumps({"assets": [detail]}).encode())
            bundle = preview.validate_bundle(root)
            self.assertIn("atlas-vascular/schmid2021-mvn1-lines.json", bundle.files)
            self.assertEqual(bundle.files[name].data, body)
            (root / name).write_bytes(b"changed")
            with self.assertRaisesRegex(preview.PreviewError, "bundle_asset_checksum_mismatch"): preview.validate_bundle(root)
        with fixture() as root:
            write(root, "atlas-volume/detail/region-3.glb", b"unbound")
            with self.assertRaises(preview.PreviewError): preview.validate_bundle(root)

    def test_file_count_file_bytes_and_aggregate_bounds_without_large_allocations(self):
        with fixture() as root:
            size = preview.validate_bundle(root).total_bytes
            for limit, value in (("MAX_FILES", 3), ("MAX_FILE_BYTES", 1), ("MAX_TOTAL_BYTES", size - 1), ("MAX_METADATA_BYTES", 1)):
                with self.subTest(limit=limit), mock.patch.object(preview, limit, value):
                    with self.assertRaises(preview.PreviewError): preview.validate_bundle(root)
            with mock.patch.object(preview, "MAX_TOTAL_BYTES", size): self.assertEqual(preview.validate_bundle(root).total_bytes, size)

    def test_default_location_supports_source_checkout_and_extracted_bundle_but_never_serves_launcher(self):
        with fixture() as root:
            write(root, "serve_prototype.py", b"# synthetic launcher fixture\n")
            self.assertEqual(preview.default_directory(root / "serve_prototype.py"), root)
            source_script = root.parent / "source/scripts/serve_prototype.py"
            self.assertEqual(preview.default_directory(source_script), source_script.parent.parent / "dist")
            with running(root) as server: self.assertEqual(request(server, "/serve_prototype.py")[0], 404)

    def test_invalid_ports_fail_before_binding_and_startup_errors_hide_machine_paths(self):
        for port in (-1, 65536, True, 1.5, "4173"):
            with self.subTest(port=port), self.assertRaisesRegex(preview.PreviewError, "invalid_preview_port"):
                preview.create_server(Path("not-read"), port)
        stderr = io.StringIO()
        with fixture() as root, redirect_stderr(stderr):
            write(root, "research-data/private.txt", b"PRIVATE_SYNTHETIC_MARKER")
            self.assertEqual(preview.main(["--directory", str(root)]), 2)
            self.assertNotIn(str(root), stderr.getvalue()); self.assertNotIn("PRIVATE_SYNTHETIC_MARKER", stderr.getvalue())

    def test_main_does_not_open_a_browser_unless_requested_and_closes_server(self):
        for browser in (False, True):
            with self.subTest(open_browser=browser):
                server = mock.Mock(); server.server_address = ("127.0.0.1", 4173)
                server.serve_forever.side_effect = KeyboardInterrupt
                with mock.patch.object(preview, "create_server", return_value=server) as create, mock.patch("webbrowser.open") as opener, redirect_stdout(io.StringIO()) as output:
                    self.assertEqual(preview.main(["--directory", "dist"] + (["--open-browser"] if browser else [])), 0)
                    create.assert_called_once_with(Path("dist"), 4173)
                    self.assertIn("http://127.0.0.1:4173/", output.getvalue())
                    self.assertEqual(opener.call_count, int(browser))
                    server.server_close.assert_called_once()

    def test_binding_uses_no_hostname_lookup(self):
        with fixture() as root, mock.patch("socket.getfqdn", side_effect=AssertionError("No DNS lookup is needed.")):
            server = preview.create_server(root, 0)
            try: self.assertEqual(server.server_address[0], "127.0.0.1")
            finally: server.server_close()


if __name__ == "__main__":
    unittest.main(verbosity=2)
