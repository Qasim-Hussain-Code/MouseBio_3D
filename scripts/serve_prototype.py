#!/usr/bin/env python3
"""Serve a built MouseBio_3D web bundle on this device using Python only.

This bounded static preview is not a replacement for publication review. It
does not install packages, upload observations or expose the source checkout.
"""
from __future__ import annotations

import argparse
from dataclasses import dataclass
import hashlib
from html.parser import HTMLParser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import re
import socketserver
import stat
import sys
from types import MappingProxyType
from typing import Mapping
from urllib.parse import urlsplit

MAX_FILES = 256
MAX_TOTAL_BYTES = 160 * 1024 * 1024
MAX_FILE_BYTES = 80 * 1024 * 1024
MAX_METADATA_BYTES = 512 * 1024
ASSET_NAME = re.compile(r"assets/[A-Za-z0-9_-]+(?:\.worker)?-[A-Za-z0-9_-]{8,}\.(?:js|css)\Z")
HASH = re.compile(r"[0-9a-f]{64}\Z")
MODEL_MANIFEST = "models/bondarenko-apical/manifest.json"
MODEL_NOTICE = "models/bondarenko-apical/LICENSE.md"
MODEL_ID = "bondarenko2004-apical-v1"
MODEL_EXPOSURE = "https://models.physiomeproject.org/exposure/b0b1820b1376263e16c6086ca64d513e"
MODEL_REVISION = "94d9d4f47495d86fec040f5439c7e3a4ffccb611"
MODEL_LICENSE_URL = "https://creativecommons.org/licenses/by/3.0/"
MODEL_MODULE = "src/models/bondarenko-apical.ts"
MODEL_COUNTS = {"states": 41, "algebraic": 71, "constants": 73}
ATLAS_ASSETS = {
    "atlas": "digimouse.glb",
    "atlas-volume": "digimouse-volume-040.glb",
    "atlas-hindlimb": "charles2016-hindlimb.glb",
    "atlas-ema147": "ema147-native.ply",
    "atlas-neuron": "nmo130632-standardized.swc.txt",
    "atlas-vascular": "schmid2021-mvn1-lines.json",
    "atlas-nerve": "mousemapper-patch0-lines.json",
}
DETAIL_NAMES = {f"atlas-volume/detail/region-{region}.glb" for region in range(3, 22)}
DETAIL_NAMES |= {f"atlas-volume/native-010/region-{region}.glb" for region in (12, 20)}
KNOWN_FILES = {"index.html", "THIRD_PARTY_NOTICES.txt", "atlas-volume/detail-index.json"} | DETAIL_NAMES
for _directory, _asset in ATLAS_ASSETS.items():
    KNOWN_FILES.update({f"{_directory}/atlas.json", f"{_directory}/LICENSE.md", f"{_directory}/{_asset}"})
KNOWN_FILES.update({MODEL_MANIFEST, MODEL_NOTICE})
KNOWN_DIRECTORIES = {"models", "models/bondarenko-apical","assets", *ATLAS_ASSETS, "atlas-volume/detail", "atlas-volume/native-010"}
CONTENT_TYPES = {".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
                 ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
                 ".txt": "text/plain; charset=utf-8", ".md": "text/plain; charset=utf-8",
                 ".glb": "model/gltf-binary", ".ply": "application/octet-stream"}
CSP = ("default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
       "img-src 'self' data: blob:; connect-src 'self'; worker-src 'self' blob:; "
       "object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'")


class PreviewError(RuntimeError):
    """Fixed error code without file contents or machine-specific paths."""


@dataclass(frozen=True)
class PreviewFile:
    data: bytes
    sha256: str
    content_type: str


@dataclass(frozen=True)
class PreviewBundle:
    """Immutable startup snapshot; requests never reopen files on disk."""
    files: Mapping[str, PreviewFile]
    total_bytes: int


def _open_directory(path: Path) -> int:
    # dir_fd and O_NOFOLLOW are available in the supported Linux/WSL runtime.
    # Fail closed on runtimes without the required no-follow open primitives.
    if not hasattr(os, "O_NOFOLLOW") or os.open not in os.supports_dir_fd:
        raise PreviewError("safe_file_open_unavailable_use_linux_or_wsl")
    flags = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW
    absolute = Path(os.path.abspath(path))
    descriptor = os.open(absolute.anchor, flags)
    try:
        for part in absolute.parts[1:]:
            child = os.open(part, flags, dir_fd=descriptor)
            os.close(descriptor)
            descriptor = child
        return descriptor
    except BaseException:
        os.close(descriptor)
        raise


def _read_file(directory: int, name: str, limit: int) -> bytes:
    descriptor = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=directory)
    try:
        before = os.fstat(descriptor)
        if not stat.S_ISREG(before.st_mode) or before.st_nlink != 1 or before.st_size > limit:
            raise PreviewError("unsafe_or_oversized_bundle_file")
        with os.fdopen(descriptor, "rb", closefd=False) as source:
            body = source.read(limit + 1)
        after = os.fstat(descriptor)
        identity = lambda info: (info.st_dev, info.st_ino, info.st_size, info.st_mtime_ns, info.st_ctime_ns)
        if len(body) != before.st_size or len(body) > limit or identity(before) != identity(after):
            raise PreviewError("bundle_changed_during_validation")
        return body
    finally:
        os.close(descriptor)


class _IndexParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.title = ""
        self.in_title = False
        self.root = False
        self.scripts: list[str] = []
        self.styles: list[str] = []
        self.unsafe = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = dict(attrs)
        if tag == "title": self.in_title = True
        if tag == "div" and values.get("id") == "root": self.root = True
        if tag == "base": self.unsafe = True
        if tag == "script":
            if values.get("type") != "module" or not values.get("src"): self.unsafe = True
            else: self.scripts.append(values["src"] or "")
        if tag == "link" and values.get("rel") == "stylesheet":
            self.styles.append(values.get("href") or "")

    def handle_endtag(self, tag: str) -> None:
        if tag == "title": self.in_title = False

    def handle_data(self, data: str) -> None:
        if self.in_title: self.title += data


def _json_file(files: Mapping[str, PreviewFile], name: str) -> dict:
    entry = files.get(name)
    if entry is None or len(entry.data) > MAX_METADATA_BYTES:
        raise PreviewError("missing_or_oversized_bundle_metadata")
    try:
        value = json.loads(entry.data)
    except (UnicodeError, ValueError, RecursionError) as error:
        raise PreviewError("invalid_bundle_metadata") from error
    if not isinstance(value, dict): raise PreviewError("invalid_bundle_metadata")
    return value


def _check_binding(files: Mapping[str, PreviewFile], name: str, metadata: dict) -> None:
    entry = files.get(name)
    size = metadata.get("assetBytes", metadata.get("glbBytes"))
    digest = metadata.get("assetSha256", metadata.get("glbSha256"))
    if entry is None or type(size) is not int or size <= 0 or not isinstance(digest, str) or not HASH.fullmatch(digest):
        raise PreviewError("invalid_bundle_asset_binding")
    if len(entry.data) != size or entry.sha256 != digest:
        raise PreviewError("bundle_asset_checksum_mismatch")


def _validate_model_metadata(files: Mapping[str, PreviewFile]) -> None:
    """Check declared model identity and attribution, not absent raw equations."""
    if MODEL_MANIFEST not in files and MODEL_NOTICE not in files:
        return
    manifest = _json_file(files, MODEL_MANIFEST)
    source = manifest.get("source")
    adaptation = manifest.get("adaptation")
    counts = manifest.get("counts")
    if (manifest.get("schemaVersion") != "mousebio.cellular-model.v1" or manifest.get("id") != MODEL_ID
            or not isinstance(source, dict) or source.get("exposure") != MODEL_EXPOSURE
            or source.get("revision") != MODEL_REVISION or source.get("license") != "CC-BY-3.0"
            or source.get("licenseUrl") != MODEL_LICENSE_URL
            or not isinstance(adaptation, dict) or adaptation.get("file") != MODEL_MODULE
            or type(adaptation.get("bytes")) is not int or not 0 < adaptation["bytes"] <= MAX_FILE_BYTES
            or not isinstance(adaptation.get("sha256"), str) or not HASH.fullmatch(adaptation["sha256"])
            or not isinstance(counts, dict) or counts != MODEL_COUNTS
            or any(type(value) is not int for value in counts.values())):
        raise PreviewError("invalid_bundle_model_metadata")
    notice = files.get(MODEL_NOTICE)
    required_notice = (MODEL_LICENSE_URL.encode("ascii"), b"Bondarenko", b"10.1152/ajpheart.00185.2003")
    if notice is None or not notice.data.strip() or any(token not in notice.data for token in required_notice):
        raise PreviewError("required_bundle_model_notice_missing")


def _validate_contents(files: Mapping[str, PreviewFile]) -> None:
    required = {"index.html", "THIRD_PARTY_NOTICES.txt", "atlas/atlas.json", "atlas/LICENSE.md", "atlas/digimouse.glb"}
    if not required <= files.keys() or any(not files[name].data for name in required):
        raise PreviewError("required_bundle_file_missing")
    if len(files["index.html"].data) > MAX_METADATA_BYTES:
        raise PreviewError("oversized_bundle_index")
    parser = _IndexParser()
    try: parser.feed(files["index.html"].data.decode("utf-8", errors="strict"))
    except (UnicodeError, ValueError, RecursionError) as error:
        raise PreviewError("invalid_mousebio_index") from error
    if parser.unsafe or "MouseBio_3D" not in parser.title or not parser.root or not parser.scripts or not parser.styles:
        raise PreviewError("invalid_mousebio_index")
    for url, suffix in [(url, ".js") for url in parser.scripts] + [(url, ".css") for url in parser.styles]:
        if not url.startswith("/") or not ASSET_NAME.fullmatch(url[1:]) or not url.endswith(suffix) or url[1:] not in files:
            raise PreviewError("invalid_mousebio_index_asset")
    bound: set[str] = set()
    for directory, asset in ATLAS_ASSETS.items():
        if not any(name.startswith(directory + "/") for name in files): continue
        manifest = _json_file(files, directory + "/atlas.json")
        name = directory + "/" + asset
        if manifest.get("assetUrl") != "/" + name or not isinstance(manifest.get("statistics"), dict):
            raise PreviewError("invalid_bundle_atlas_manifest")
        notice = files.get(directory + "/LICENSE.md")
        if notice is None or not notice.data.strip(): raise PreviewError("required_bundle_notice_missing")
        _check_binding(files, name, manifest["statistics"])
        bound.add(name)
    if "atlas-volume/detail-index.json" in files:
        details = _json_file(files, "atlas-volume/detail-index.json").get("assets")
        if not isinstance(details, list) or len(details) > len(DETAIL_NAMES):
            raise PreviewError("invalid_bundle_detail_index")
        for detail in details:
            if not isinstance(detail, dict) or not isinstance(detail.get("assetUrl"), str):
                raise PreviewError("invalid_bundle_detail_index")
            name = detail["assetUrl"].removeprefix("/")
            if detail["assetUrl"] != "/" + name or name not in DETAIL_NAMES or name in bound:
                raise PreviewError("invalid_bundle_detail_index")
            _check_binding(files, name, detail)
            bound.add(name)
    if (set(files) & DETAIL_NAMES) - bound:
        raise PreviewError("unbound_bundle_detail_asset")
    _validate_model_metadata(files)


def validate_bundle(directory: Path | str) -> PreviewBundle:
    """Read only known web files, with finite bounds and no symlink traversal.

    The optional co-located launcher is never served. Unknown entries make a
    source checkout, research directory or unreviewed extra file fail closed.
    File bytes are retained once, rather than copied for each HTTP request.
    """
    files: dict[str, PreviewFile] = {}
    total = 0
    try:
        root = _open_directory(Path(directory))
        def visit(descriptor: int, prefix: str = "") -> None:
            nonlocal total
            entries = sorted(os.scandir(descriptor), key=lambda entry: entry.name)
            if len(entries) > MAX_FILES: raise PreviewError("bundle_file_count_exceeds_bound")
            for entry in entries:
                name = prefix + entry.name
                info = entry.stat(follow_symlinks=False)
                if stat.S_ISDIR(info.st_mode):
                    if name not in KNOWN_DIRECTORIES: raise PreviewError("unapproved_bundle_directory")
                    child = os.open(entry.name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=descriptor)
                    try: visit(child, name + "/")
                    finally: os.close(child)
                    continue
                if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1:
                    raise PreviewError("unsafe_bundle_entry")
                if name == "serve_prototype.py":
                    if info.st_size > MAX_METADATA_BYTES: raise PreviewError("oversized_bundle_launcher")
                    continue
                if name not in KNOWN_FILES and not ASSET_NAME.fullmatch(name):
                    raise PreviewError("unapproved_bundle_file")
                if len(files) >= MAX_FILES or total + info.st_size > MAX_TOTAL_BYTES:
                    raise PreviewError("bundle_size_exceeds_bound")
                limit = MAX_METADATA_BYTES if name in {"index.html", MODEL_MANIFEST} or name.endswith(("atlas.json", "detail-index.json", "LICENSE.md")) else MAX_FILE_BYTES
                if name == "THIRD_PARTY_NOTICES.txt": limit = 2 * 1024 * 1024
                body = _read_file(descriptor, entry.name, min(limit, MAX_TOTAL_BYTES - total))
                if not body: raise PreviewError("empty_bundle_file")
                total += len(body)
                files[name] = PreviewFile(body, hashlib.sha256(body).hexdigest(), CONTENT_TYPES[Path(name).suffix])
        try: visit(root)
        finally: os.close(root)
        _validate_contents(files)
        return PreviewBundle(MappingProxyType(files), total)
    except PreviewError:
        raise
    except (OSError, ValueError, OverflowError, RecursionError) as error:
        raise PreviewError("bundle_unavailable_or_unsafe") from error


class _Handler(BaseHTTPRequestHandler):
    server: PrototypeServer
    protocol_version = "HTTP/1.0"

    def setup(self) -> None:
        super().setup()
        self.connection.settimeout(10)

    def version_string(self) -> str: return "MouseBioPrototype"
    def log_message(self, _format: str, *args: object) -> None: pass

    def _respond(self, status: int, data: bytes, content_type: str) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Cross-Origin-Resource-Policy", "same-origin")
        self.send_header("Content-Security-Policy", CSP)
        if status == 405: self.send_header("Allow", "GET, HEAD")
        self.end_headers()
        if self.command != "HEAD":
            try: self.wfile.write(data)
            except (BrokenPipeError, ConnectionResetError): pass

    def send_error(self, code: int, message: str | None = None, explain: str | None = None) -> None:
        self._respond(405 if code == 501 else code, b"Request unavailable.\n", "text/plain; charset=utf-8")

    def do_GET(self) -> None:
        port = self.server.server_address[1]
        allowed_hosts = {f"127.0.0.1:{port}", f"localhost:{port}"}
        if port == 80: allowed_hosts.update({"127.0.0.1", "localhost"})
        if len(self.headers.get_all("Host", [])) != 1 or self.headers.get("Host", "") not in allowed_hosts:
            self.send_error(403); return
        if len(self.path) > 2048:
            self.send_error(414); return
        try: url = urlsplit(self.path)
        except ValueError:
            self.send_error(404); return
        path = url.path
        if url.scheme or url.netloc or url.fragment or not path.startswith("/") or any(character in path for character in ("%", "\\", ":")):
            self.send_error(404); return
        name = "index.html" if path == "/" else path[1:]
        if any(part in {"", ".", ".."} for part in name.split("/")):
            self.send_error(404); return
        entry = self.server.bundle.files.get(name)
        if entry is None: self.send_error(404)
        else: self._respond(200, entry.data, entry.content_type)

    def do_HEAD(self) -> None: self.do_GET()


class PrototypeServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = False

    def __init__(self, bundle: PreviewBundle, port: int) -> None:
        self.bundle = bundle
        super().__init__(("127.0.0.1", port), _Handler)

    def server_bind(self) -> None:
        # Avoid a hostname lookup; neither validation nor serving needs DNS.
        socketserver.TCPServer.server_bind(self)
        self.server_name = "127.0.0.1"
        self.server_port = self.server_address[1]


def create_server(directory: Path | str, port: int = 4173) -> PrototypeServer:
    """Validate first, then bind exclusively to IPv4 loopback. Port 0 is useful for tests."""
    if type(port) is not int or not 0 <= port <= 65535:
        raise PreviewError("invalid_preview_port")
    return PrototypeServer(validate_bundle(directory), port)


def default_directory(script: Path | None = None) -> Path:
    parent = (script or Path(__file__)).absolute().parent
    return parent if (parent / "index.html").is_file() else parent.parent / "dist"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--directory", type=Path, default=default_directory(), help="built dist or extracted web bundle")
    parser.add_argument("--port", type=int, default=4173, help="loopback port (default: 4173)")
    parser.add_argument("--open-browser", action="store_true", help="explicitly open the local URL in a browser")
    args = parser.parse_args(argv)
    try: server = create_server(args.directory, args.port)
    except (PreviewError, OSError) as error:
        code = str(error) if isinstance(error, PreviewError) else "loopback_port_unavailable"
        print("MouseBio_3D preview could not start: " + code, file=sys.stderr)
        return 2
    url = "http://127.0.0.1" + ":" + str(server.server_address[1]) + "/"
    print("MouseBio_3D prototype: " + url, flush=True)
    print("Press Ctrl+C to stop. Only the reviewed web snapshot is available.", flush=True)
    if args.open_browser:
        import webbrowser
        try: webbrowser.open(url, new=2)
        except (OSError, webbrowser.Error): pass
    try: server.serve_forever(poll_interval=0.25)
    except KeyboardInterrupt: pass
    finally: server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
