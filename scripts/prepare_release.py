#!/usr/bin/env python3
"""Prepare bounded source and web archives without copying private Git history.

The original checkout is read-only apart from a newly created .publication
output directory. This command does not create Git repositories, commit, push,
install dependencies or download files. Publication remains a separate action.
"""
from __future__ import annotations

import argparse
from dataclasses import dataclass
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import stat
import struct
import subprocess
import sys
import types
import zipfile

ROOT = Path(__file__).resolve().parents[1]
MAX_SOURCE_BYTES = 100 * 1024 * 1024
MAX_WEB_BYTES = 100 * 1024 * 1024
MAX_FILES = 5000
MIN_FREE_RESERVE = 32 * 1024 * 1024
ZIP_TIME = (1980, 1, 1, 0, 0, 0)
VERSION = re.compile(r"(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?\Z")
ROOT_FILES = {".gitattributes", ".gitignore", ".npmrc", "LICENSE", "LICENSES.md", "README.md",
              "index.html", "package.json", "package-lock.json", "tsconfig.json", "vite.config.ts"}
SOURCE_TYPES = {
    "src": {".ts", ".tsx", ".js", ".jsx", ".css", ".json", ".html", ".svg"},
    "tests": {".ts", ".tsx", ".js", ".mjs", ".py"},
    "scripts": {".py", ".sh", ".mjs", ".js"},
    "docs": {".md", ".txt", ".json"},
    "data": {".json", ".txt", ".md", ".html"},
    "public": {".json", ".txt", ".md", ".html", ".css", ".svg"},
}
WEB_TYPES = {".html", ".js", ".css", ".json", ".txt", ".md", ".svg"}
PRIVATE_PARTS = {".git", ".tools", ".venv", ".npm-cache", "node_modules", "dist", ".publication",
                 "research-data", "test-results", "playwright-report", "__pycache__", ".aws", ".ssh",
                 ".codex", ".agents", "agents.md", "private", "secrets", "credentials", "confidential"}
PRIVATE_STEMS = {"secret", "secrets", "credentials", "confidential", "passwords", "id_rsa", "id_ed25519"}
WINDOWS_RESERVED = {"con", "prn", "aux", "nul", *(f"com{number}" for number in range(1, 10)),
                    *(f"lpt{number}" for number in range(1, 10))}


class ReleaseError(RuntimeError):
    """A value-free error code suitable for a publication preparation report."""

    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


@dataclass(frozen=True)
class ReleaseFile:
    name: str
    data: bytes
    mode: int = 0o644


def git(root: Path, *arguments: str) -> bytes:
    try:
        result = subprocess.run(["git", "-C", str(root), *arguments], capture_output=True,
                                check=False, timeout=30)
    except (OSError, subprocess.TimeoutExpired) as error:
        raise ReleaseError("git_inspection_failed") from error
    if result.returncode:
        raise ReleaseError("git_inspection_failed")
    return result.stdout


def clean_tree(root: Path) -> None:
    if git(root, "status", "--porcelain=v1", "-z", "--untracked-files=all"):
        raise ReleaseError("working_tree_not_clean")


def relative_name(name: str) -> str:
    path = PurePosixPath(name)
    if not name or path.is_absolute() or path.as_posix() != name or "\\" in name or ":" in name:
        raise ReleaseError("unsafe_archive_path")
    for component in path.parts:
        if component in {".", ".."} or any(ord(character) < 32 or ord(character) == 127 for character in component):
            raise ReleaseError("unsafe_archive_path")
        if component.endswith((" ", ".")) or component.split(".", 1)[0].lower() in WINDOWS_RESERVED:
            raise ReleaseError("unsafe_archive_path")
        if component.lower() in PRIVATE_PARTS or component.lower().startswith(".env"):
            raise ReleaseError("private_input_path")
    if len(path.parts) >= 2 and path.parts[0].lower() == "data" and path.parts[1].lower() == "raw":
        raise ReleaseError("private_input_path")
    if path.stem.lower() in PRIVATE_STEMS:
        raise ReleaseError("private_input_path")
    return path.as_posix()


def regular_input(root: Path, name: str) -> tuple[Path, os.stat_result]:
    name = relative_name(name)
    current = root
    for index, component in enumerate(PurePosixPath(name).parts):
        current = current / component
        try:
            info = current.lstat()
        except OSError as error:
            raise ReleaseError("missing_input") from error
        if stat.S_ISLNK(info.st_mode):
            raise ReleaseError("symlink_input")
        if index < len(PurePosixPath(name).parts) - 1:
            if not stat.S_ISDIR(info.st_mode):
                raise ReleaseError("nonregular_input")
        elif not stat.S_ISREG(info.st_mode):
            raise ReleaseError("nonregular_input")
    if not current.resolve().is_relative_to(root):
        raise ReleaseError("input_outside_root")
    return current, info


def read_regular(root: Path, name: str, limit: int) -> bytes:
    path, before = regular_input(root, name)
    if before.st_size > limit:
        raise ReleaseError("input_exceeds_size_bound")
    descriptor = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
    with os.fdopen(descriptor, "rb") as handle:
        opened = os.fstat(handle.fileno())
        if (opened.st_dev, opened.st_ino) != (before.st_dev, before.st_ino):
            raise ReleaseError("input_changed_during_read")
        data = handle.read(limit + 1)
        after = os.fstat(handle.fileno())
    if len(data) > limit or (before.st_size, before.st_mtime_ns) != (after.st_size, after.st_mtime_ns):
        raise ReleaseError("input_changed_during_read")
    return data


def tracked_files(root: Path) -> tuple[bytes, list[tuple[str, int]]]:
    inventory = git(root, "ls-files", "--stage", "-z")
    records: list[tuple[str, int]] = []
    seen: set[str] = set()
    try:
        for entry in filter(None, inventory.decode("utf-8").split("\0")):
            metadata, name = entry.split("\t", 1)
            mode, _blob_id, stage = metadata.split()
            if stage != "0" or mode not in {"100644", "100755"}:
                raise ReleaseError("nonregular_tracked_input")
            name = relative_name(name)
            if name.casefold() in seen:
                raise ReleaseError("ambiguous_archive_path")
            seen.add(name.casefold())
            records.append((name, 0o755 if mode == "100755" else 0o644))
    except (UnicodeError, ValueError) as error:
        raise ReleaseError("invalid_tracked_inventory") from error
    if not records or len(records) > MAX_FILES:
        raise ReleaseError("tracked_inventory_out_of_bounds")
    return inventory, sorted(records)


def asset_binding(manifest_data: bytes) -> tuple[str, dict]:
    try:
        manifest = json.loads(manifest_data)
        asset_url = manifest["assetUrl"]
        digest = manifest["statistics"]["glbSha256"]
        size = manifest["statistics"]["glbBytes"]
        frame = manifest["coordinateFrame"]["id"]
        atlas_id = manifest["id"]
        if (not isinstance(asset_url, str) or not asset_url.startswith("/atlas/")
                or not asset_url.endswith(".glb") or any(character in asset_url for character in "%?#")):
            raise ValueError
        asset = relative_name(asset_url[1:])
        if (not isinstance(digest, str) or not re.fullmatch(r"[a-f0-9]{64}", digest)
                or type(size) is not int or size <= 0 or not isinstance(frame, str) or not frame
                or not isinstance(atlas_id, str) or not atlas_id):
            raise ValueError
    except (KeyError, TypeError, ValueError, UnicodeError) as error:
        raise ReleaseError("invalid_anatomy_manifest") from error
    return asset, {"atlasId": atlas_id, "assetSha256": digest, "assetBytes": size, "coordinateFrameId": frame}


def source_allowed(name: str, anatomy_asset: str) -> bool:
    path = PurePosixPath(name)
    if len(path.parts) == 1:
        return name in ROOT_FILES
    if name == f"public/{anatomy_asset}":
        return True
    return path.parts[0] in SOURCE_TYPES and path.suffix.lower() in SOURCE_TYPES[path.parts[0]]


def publication_checker(root: Path) -> tuple[dict, types.ModuleType]:
    checker_path, _ = regular_input(root, "scripts/check_publication.py")
    try:
        checked = subprocess.run([sys.executable, str(checker_path), "--root", str(root)],
                                 capture_output=True, check=False, timeout=120)
        if len(checked.stdout) > 1024 * 1024:
            raise ReleaseError("publication_check_incomplete")
        report = json.loads(checked.stdout)
        if (checked.returncode != 0 or not isinstance(report, dict) or report.get("errorCount") != 0
                or report.get("warningCount") != 0 or report.get("scope") != "tracked"
                or report.get("historyContentIncluded") is not False or report.get("gitMetadataIncluded") is not False):
            raise ReleaseError("publication_check_failed")
        checker = types.ModuleType("mousebio_release_publication_check")
        checker.__file__ = str(checker_path)
        # Compiling source directly avoids writing bytecode into the input tree.
        exec(compile(read_regular(root, "scripts/check_publication.py", MAX_SOURCE_BYTES),
                     "<publication checker>", "exec"), checker.__dict__)
        if not callable(getattr(checker, "inspect_content", None)):
            raise ReleaseError("publication_check_incomplete")
    except (OSError, ValueError, subprocess.TimeoutExpired) as error:
        raise ReleaseError("publication_check_incomplete") from error
    return report, checker


def inspect_records(records: list[ReleaseFile], checker: types.ModuleType) -> None:
    for record in records:
        findings, reviewed = checker.inspect_content(record.data, record.name, "release-input")
        if not reviewed or any(finding.get("severity") in {"error", "warning"} for finding in findings):
            raise ReleaseError("publication_content_rejected")


def web_files(root: Path, anatomy_asset: str) -> list[ReleaseFile]:
    distribution = root / "dist"
    if distribution.is_symlink() or not distribution.is_dir():
        raise ReleaseError("missing_or_unsafe_web_distribution")
    files: list[ReleaseFile] = []
    pending = [distribution]
    seen: set[str] = set()
    total = 0
    while pending:
        directory = pending.pop()
        for path in sorted(directory.iterdir()):
            name = relative_name(path.relative_to(distribution).as_posix())
            info = path.lstat()
            if stat.S_ISLNK(info.st_mode):
                raise ReleaseError("symlink_web_input")
            if stat.S_ISDIR(info.st_mode):
                pending.append(path)
                continue
            if not stat.S_ISREG(info.st_mode):
                raise ReleaseError("nonregular_web_input")
            if name.casefold() in seen:
                raise ReleaseError("ambiguous_archive_path")
            seen.add(name.casefold())
            if name != anatomy_asset and path.suffix.lower() not in WEB_TYPES:
                raise ReleaseError("unreviewed_web_file_type")
            total += info.st_size
            if total > MAX_WEB_BYTES or len(files) >= MAX_FILES:
                raise ReleaseError("web_distribution_exceeds_bound")
            files.append(ReleaseFile(name, read_regular(distribution, name, MAX_WEB_BYTES)))
    return sorted(files, key=lambda record: record.name)


def verify_anatomy(source: list[ReleaseFile], web: list[ReleaseFile], asset: str, binding: dict) -> None:
    source_map = {record.name: record.data for record in source}
    web_map = {record.name: record.data for record in web}
    required_source = {"LICENSE", "LICENSES.md", "README.md", "package.json", "scripts/check_publication.py",
                       "public/THIRD_PARTY_NOTICES.txt", "public/atlas/LICENSE.md", "public/atlas/atlas.json", f"public/{asset}"}
    required_web = {"index.html", "THIRD_PARTY_NOTICES.txt", "atlas/LICENSE.md", "atlas/atlas.json", asset}
    if not required_source <= source_map.keys() or not required_web <= web_map.keys():
        raise ReleaseError("required_release_file_missing")
    if source_map["public/atlas/atlas.json"] != web_map["atlas/atlas.json"]:
        raise ReleaseError("source_and_web_manifest_differ")
    for source_name, web_name in [("public/THIRD_PARTY_NOTICES.txt", "THIRD_PARTY_NOTICES.txt"),
                                  ("public/atlas/LICENSE.md", "atlas/LICENSE.md")]:
        if not source_map[source_name] or source_map[source_name] != web_map[web_name]:
            raise ReleaseError("source_and_web_notices_differ")
    for data in (source_map[f"public/{asset}"], web_map[asset]):
        if len(data) != binding["assetBytes"] or hashlib.sha256(data).hexdigest() != binding["assetSha256"]:
            raise ReleaseError("anatomy_checksum_mismatch")
        if len(data) < 20 or data[:4] != b"glTF" or struct.unpack_from("<II", data, 4) != (2, len(data)):
            raise ReleaseError("invalid_anatomy_glb")


def checked_output(root: Path, output: Path) -> Path:
    candidate = output if output.is_absolute() else root / output
    if ".." in candidate.parts:
        raise ReleaseError("unsafe_output_directory")
    publication = root / ".publication"
    if candidate.parent != publication or candidate.name in {"", ".", ".."}:
        raise ReleaseError("output_must_be_fresh_publication_child")
    if publication.is_symlink() or publication.exists() and not publication.is_dir():
        raise ReleaseError("unsafe_output_directory")
    if candidate.exists() or candidate.is_symlink():
        raise ReleaseError("output_already_exists")
    return candidate


def write_zip(destination: Path, records: list[ReleaseFile], prefix: str = "") -> None:
    with zipfile.ZipFile(destination, "x", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for record in records:
            info = zipfile.ZipInfo(f"{prefix}{record.name}", ZIP_TIME)
            info.create_system = 3
            info.external_attr = (stat.S_IFREG | record.mode) << 16
            info.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(info, record.data, compresslevel=9)


def prepare_release(root: Path, output: Path) -> dict:
    root = root.resolve(strict=True)
    if git(root, "rev-parse", "--show-toplevel").decode().strip() != str(root):
        raise ReleaseError("root_must_be_repository_top")
    clean_tree(root)
    inventory, tracked = tracked_files(root)
    try:
        package = json.loads(read_regular(root, "package.json", 1024 * 1024))
        version = package["version"]
        if not isinstance(version, str) or len(version) > 64 or not VERSION.fullmatch(version):
            raise ValueError
        if "-" in version and any(part.isdigit() and len(part) > 1 and part.startswith("0")
                                  for part in version.split("-", 1)[1].split("+", 1)[0].split(".")):
            raise ValueError
    except (KeyError, TypeError, ValueError, UnicodeError) as error:
        raise ReleaseError("invalid_package_version") from error
    output = checked_output(root, output)
    asset, anatomy = asset_binding(read_regular(root, "public/atlas/atlas.json", 1024 * 1024))
    for name, _mode in tracked:
        if not source_allowed(name, asset):
            raise ReleaseError("tracked_path_not_allowlisted")
        regular_input(root, name)
    report, checker = publication_checker(root)
    source: list[ReleaseFile] = []
    total = 0
    for name, mode in tracked:
        data = read_regular(root, name, MAX_SOURCE_BYTES)
        total += len(data)
        if total > MAX_SOURCE_BYTES:
            raise ReleaseError("source_snapshot_exceeds_bound")
        source.append(ReleaseFile(name, data, mode))
    web = web_files(root, asset)
    verify_anatomy(source, web, asset, anatomy)
    inspect_records(source, checker)
    inspect_records(web, checker)
    if inventory != git(root, "ls-files", "--stage", "-z"):
        raise ReleaseError("tracked_inventory_changed")
    clean_tree(root)
    web_bytes = sum(len(record.data) for record in web)
    # Conservative expansion allowance: source copy + twice each archive input,
    # per-file ZIP headers, metadata and a free-space reserve. No compression
    # ratio is assumed for scientific assets.
    estimated = 3 * total + 2 * web_bytes + (len(source) + len(web)) * 1024 + 2 * 1024 * 1024
    if shutil.disk_usage(root).free < estimated + MIN_FREE_RESERVE:
        raise ReleaseError("insufficient_release_disk_space")
    # Recheck immediately before the first write. An existing output is never reused.
    output = checked_output(root, output)
    output.parent.mkdir(exist_ok=True)
    output.mkdir(exist_ok=False)
    snapshot = output / "source"
    snapshot.mkdir()
    for record in source:
        destination = snapshot / record.name
        destination.parent.mkdir(parents=True, exist_ok=True)
        with destination.open("xb") as handle:
            handle.write(record.data)
        destination.chmod(record.mode)
    artifacts: dict[str, dict] = {}
    for kind, records, prefix in [("source", source, f"MouseBio_3D-{version}/"), ("web", web, "")]:
        name = f"MouseBio_3D-{version}-{kind}.zip"
        destination = output / name
        write_zip(destination, records, prefix)
        artifacts[kind] = {"file": name, "bytes": destination.stat().st_size,
                           "sha256": hashlib.sha256(destination.read_bytes()).hexdigest(), "files": len(records)}
    release = {"schemaVersion": "mousebio.release.v1", "version": version, "artifacts": artifacts,
               "anatomy": anatomy, "sourceSnapshotDirectory": "source", "estimatedOutputBytes": estimated,
               "publicationCheck": {"scope": "tracked", "historyIncluded": False,
                                     "filesInspected": report.get("filesInspected")}}
    metadata = (json.dumps(release, indent=2) + "\n").encode("utf-8")
    with (output / "release.json").open("xb") as handle:
        handle.write(metadata)
    sums = [f"{item['sha256']}  {item['file']}" for item in artifacts.values()]
    sums.append(f"{hashlib.sha256(metadata).hexdigest()}  release.json")
    with (output / "SHA256SUMS").open("x", encoding="ascii", newline="\n") as handle:
        handle.write("\n".join(sums) + "\n")
    return release


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=ROOT, help="source Git checkout; no history is copied")
    parser.add_argument("--output", type=Path, required=True, help="fresh direct child of .publication")
    args = parser.parse_args()
    try:
        result = prepare_release(args.root, args.output)
    except ReleaseError as error:
        print(json.dumps({"ok": False, "errorCode": error.code}))
        return 1
    except (OSError, UnicodeError, ValueError, RuntimeError) as error:
        print(json.dumps({"ok": False, "errorCode": "release_preparation_incomplete", "exceptionType": type(error).__name__}))
        return 2
    print(json.dumps({"ok": True, **result}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
