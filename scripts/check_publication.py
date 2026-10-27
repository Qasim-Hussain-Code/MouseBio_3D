#!/usr/bin/env python3
"""Read-only, bounded publication checks with value-free findings."""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import struct
import subprocess
from pathlib import Path, PurePosixPath
from urllib.parse import urlsplit

MAX_FILE_BYTES = 8 * 1024 * 1024
MAX_HISTORY_BLOBS = 1000
MAX_GLB_JSON_BYTES = 1024 * 1024
MAX_REGISTERED_GLB_BYTES = 80 * 1024 * 1024
MAX_REGISTERED_TOTAL_BYTES = 100 * 1024 * 1024
VOLUME_ARCHIVE_SHA256 = "6f7cbd8a7236a78c47a14c3259d387439c0dc0284b2a83fa955f8c49efe11761"
VOLUME_FRAME = "digimouse-registered-voxel-native-v1"
DETAIL_LEVELS = {
    "fine-020": (0.2, "public/atlas-volume/detail/"),
    "source-010": (0.1, "public/atlas-volume/native-010/"),
}
EMAIL = re.compile(r"[A-Za-z0-9.!#%+_~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
# [U] preserves the exact match while avoiding a literal home path in this pattern's own source.
LOCAL_PATH = re.compile(r"(?:[A-Za-z]:[\\/]+Users[\\/]+[^\\/\s<>\"']+|/mnt/[a-z]/[U]sers/[^/\s<>\"']+|/(?:home|Users)/[^/\s<>\"']+)")
TOKENS = re.compile(r"\b(?:gh[pousr]_[A-Za-z0-9]{20,255}|github_pat_[A-Za-z0-9_]{20,255}|(?:AKIA|ASIA)[A-Z0-9]{16}|sk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,255})\b")
PRIVATE_KEY = re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----")
ASSIGNMENT = re.compile(r"(?im)^\s*(?:export\s+)?[\"']?(?:api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|password|aws_secret_access_key)[\"']?\s*[:=]\s*[\"']?([^\s\"'#]{8,})")
URL = re.compile(r"https?://[^\s<>\"']+")
ATTRIBUTION_PATHS = {"public/THIRD_PARTY_NOTICES.txt", "public/atlas/LICENSE.md", "public/atlas-volume/LICENSE.md"}


def anatomy_asset_path(url: str, folder: str) -> str:
    if (not isinstance(url, str) or not url.startswith(f"/{folder}/") or not url.endswith(".glb")
            or any(character in url for character in "%?#:\\") or "//" in url):
        raise ValueError("Invalid registered anatomical asset path")
    path = PurePosixPath(url[1:])
    if path.as_posix() != url[1:] or any(part in {".", ".."} or not re.fullmatch(r"[A-Za-z0-9_.-]+", part) for part in path.parts):
        raise ValueError("Invalid registered anatomical asset path")
    return "public/" + path.as_posix()


def register_details(detail: dict, volume: dict | None, registry: dict[str, dict]) -> None:
    """Bind supported processing levels to source labels and exact asset bytes."""
    legacy = detail.get("schemaVersion") == "mousebio.volume-detail-index.v1"
    if (volume is None or detail.get("schemaVersion") not in {"mousebio.volume-detail-index.v1", "mousebio.volume-detail-index.v2"}
            or detail.get("atlasId") != volume["id"] or detail.get("coordinateFrame", {}).get("id") != VOLUME_FRAME
            or detail.get("source", {}).get("archiveSha256") != VOLUME_ARCHIVE_SHA256
            or detail.get("source", {}).get("id") != volume["source"]["id"]
            or detail.get("source", {}).get("license") != "CC-BY-SA-4.0"
            or detail.get("source", {}).get("licenseUrl") != volume["source"]["licenseUrl"]):
        raise ValueError("Detail index does not bind to the registered volume")
    level_ids = {"fine-020"} if legacy else set(DETAIL_LEVELS)
    if not legacy:
        levels = detail.get("levels")
        if not isinstance(levels, list) or len(levels) != len(DETAIL_LEVELS):
            raise ValueError("Invalid registered processing-level inventory")
        seen_levels = set()
        for level in levels:
            if (not isinstance(level, dict) or set(level) != {"id", "title", "processingVoxelSpacingMm", "description", "limitations"}
                    or level.get("id") not in DETAIL_LEVELS or level["id"] in seen_levels
                    or not isinstance(level.get("title"), str) or not level["title"].strip()
                    or not isinstance(level.get("description"), str) or not level["description"].strip()
                    or not isinstance(level.get("limitations"), list) or not 1 <= len(level["limitations"]) <= 32
                    or any(not isinstance(value, str) or not value.strip() for value in level["limitations"])
                    or level.get("processingVoxelSpacingMm") != [DETAIL_LEVELS[level["id"]][0]] * 3):
                raise ValueError("Invalid registered processing-level declaration")
            seen_levels.add(level["id"])
    assets = detail["assets"]
    expected = {entry["id"] for entry in volume["structures"]}
    if (not isinstance(assets, list) or len(assets) > len(expected) * len(level_ids)
            or not isinstance(detail.get("unavailable"), list) or len(detail["unavailable"]) > len(expected) * len(level_ids)):
        raise ValueError("Unbounded progressive anatomical inventory")
    selected, unavailable = set(), set()
    for asset in assets:
        identifier = asset["structureId"]
        level_id = "fine-020" if legacy else asset.get("levelId")
        if not isinstance(identifier, str) or level_id not in level_ids:
            raise ValueError("Invalid progressive anatomical region or level")
        pair = (identifier, level_id)
        path = anatomy_asset_path(asset["assetUrl"], "atlas-volume")
        size, digest = asset["glbBytes"], asset["glbSha256"]
        spacing, prefix = DETAIL_LEVELS[level_id]
        allowed = {f"digimouse-volume:{label}" for label in (range(3, 22) if level_id == "fine-020" else (12, 20))}
        if (pair in selected or identifier not in expected or path in registry or not path.startswith(prefix)
                or identifier not in allowed or path != f"{prefix}region-{identifier.rsplit(':', 1)[-1]}.glb"
                or asset.get("coordinateFrameId") != VOLUME_FRAME or type(size) is not int
                or not 20 <= size <= MAX_REGISTERED_GLB_BYTES or not isinstance(digest, str)
                or not re.fullmatch(r"[a-f0-9]{64}", digest) or asset.get("processingVoxelSpacingMm") != [spacing] * 3):
            raise ValueError("Invalid progressive anatomical asset binding")
        selected.add(pair)
        registry[path] = {"bytes": size, "sha256": digest, "ids": [identifier], "atlasId": volume["id"],
                          "levelId": level_id, "coordinateFrameId": VOLUME_FRAME,
                          "manifestPath": "public/atlas-volume/detail-index.json", "licensePath": "public/atlas-volume/LICENSE.md"}
    for entry in detail["unavailable"]:
        level_id = "fine-020" if legacy else entry.get("levelId")
        identifier = entry["structureId"]
        if (not isinstance(identifier, str) or level_id not in level_ids or identifier not in expected
                or (identifier, level_id) in unavailable or not isinstance(entry.get("reason"), str) or not entry["reason"].strip()):
            raise ValueError("Invalid unavailable detail inventory")
        unavailable.add((identifier, level_id))
    available_ids = {identifier for identifier, _level_id in selected}
    structure_ids = [entry["id"] for entry in detail["structures"]]
    expected_pairs = {(identifier, level_id) for identifier in expected for level_id in level_ids}
    if (selected & unavailable or selected | unavailable != expected_pairs
            or len(structure_ids) != len(set(structure_ids)) or set(structure_ids) != available_ids
            or detail["statistics"]["structures"] != len(available_ids)
            or (not legacy and detail["statistics"].get("assets") != len(assets))
            or detail["statistics"]["glbBytesTotal"] != sum(asset["glbBytes"] for asset in assets)):
        raise ValueError("Progressive detail coverage is inconsistent")


def anatomy_registry(read) -> dict[str, dict]:
    """Read only bounded declarations from the same working/index snapshot.

    Registration binds metadata inspection to exact asset bytes. It does not
    certify anatomical accuracy or inspect binary vertex values as private text.
    The callback returns None for paths absent from the selected snapshot.
    """
    registry: dict[str, dict] = {}
    volume = None
    for folder in ("atlas", "atlas-volume"):
        manifest_path = f"public/{folder}/atlas.json"
        raw = read(manifest_path, MAX_GLB_JSON_BYTES)
        if raw is None:
            continue
        manifest = json.loads(raw)
        source = manifest.get("source", {})
        frame = manifest["coordinateFrame"]["id"]
        identifier = manifest["id"]
        expected_ids = None
        if "structures" in manifest:
            expected_ids = [entry["id"] for entry in manifest["structures"]]
            if not expected_ids or len(set(expected_ids)) != len(expected_ids):
                raise ValueError("Invalid anatomical source inventory")
        if folder == "atlas-volume":
            if (source.get("archiveSha256") != VOLUME_ARCHIVE_SHA256 or source.get("id") != "digimouse-registered-volume-2007"
                    or source.get("license") != "CC-BY-SA-4.0" or source.get("licenseUrl") != "https://creativecommons.org/licenses/by-sa/4.0/"
                    or frame != VOLUME_FRAME or not isinstance(identifier, str) or not re.fullmatch(r"digimouse-volume-[0-9]{3}-v[0-9]+", identifier)
                    or set(expected_ids or []) != {f"digimouse-volume:{label}" for label in range(1, 22)}):
                raise ValueError("Volume source, license, frame or label inventory is not registered")
            license_bytes = read(f"public/{folder}/LICENSE.md", MAX_GLB_JSON_BYTES)
            if not license_bytes or b"creativecommons.org/licenses/by-sa/4.0" not in license_bytes:
                raise ValueError("Registered volume attribution is missing")
            volume = manifest
        path = anatomy_asset_path(manifest["assetUrl"], folder)
        size, digest = manifest["statistics"]["glbBytes"], manifest["statistics"]["glbSha256"]
        if (type(size) is not int or not 20 <= size <= MAX_REGISTERED_GLB_BYTES
                or not isinstance(digest, str) or not re.fullmatch(r"[a-f0-9]{64}", digest)
                or not isinstance(frame, str) or not frame or not isinstance(identifier, str) or not identifier):
            raise ValueError("Invalid registered anatomical asset binding")
        registry[path] = {"bytes": size, "sha256": digest, "ids": expected_ids, "atlasId": identifier,
                          "coordinateFrameId": frame, "manifestPath": manifest_path,
                          "licensePath": f"public/{folder}/LICENSE.md"}
    detail_path = "public/atlas-volume/detail-index.json"
    raw = read(detail_path, MAX_GLB_JSON_BYTES)
    if raw is not None:
        register_details(json.loads(raw), volume, registry)
    if sum(asset["bytes"] for asset in registry.values()) > MAX_REGISTERED_TOTAL_BYTES:
        raise ValueError("Registered anatomical assets exceed the total bound")
    return registry


def glb_metadata(data: bytes) -> bytes:
    if len(data) < 20 or data[:4] != b"glTF" or struct.unpack_from("<II", data, 4) != (2, len(data)):
        raise ValueError("Invalid GLB header")
    length, kind = struct.unpack_from("<II", data, 12)
    end = 20 + length
    if kind != 0x4E4F534A or length > MAX_GLB_JSON_BYTES or length % 4 or end > len(data):
        raise ValueError("Unbounded or invalid GLB metadata")
    if end != len(data):
        if end + 8 > len(data):
            raise ValueError("Truncated GLB binary header")
        binary_length, binary_kind = struct.unpack_from("<II", data, end)
        if binary_kind != 0x004E4942 or binary_length % 4 or end + 8 + binary_length != len(data):
            raise ValueError("Invalid GLB binary chunk")
    metadata = data[20:end]
    doc = json.loads(metadata)
    if doc.get("asset", {}).get("version") != "2.0" or any("uri" in record for record in doc.get("buffers", []) + doc.get("images", [])):
        raise ValueError("GLB must be a self-contained glTF 2.0 asset")
    return metadata


def inspect_registered_glb(data: bytes, binding: dict) -> bytes:
    if len(data) != binding["bytes"] or hashlib.sha256(data).hexdigest() != binding["sha256"]:
        raise ValueError("Anatomical asset checksum mismatch")
    metadata = glb_metadata(data)
    if binding["ids"] is not None:
        doc = json.loads(metadata)
        identifiers = [node.get("extras", {}).get("structureId") for node in doc.get("nodes", []) if "mesh" in node]
        if len(identifiers) != len(set(identifiers)) or set(identifiers) != set(binding["ids"]):
            raise ValueError("GLB source labels differ from the registered inventory")
    return metadata


def git(root: Path, *arguments: str, required: bool = True) -> bytes:
    result = subprocess.run(["git", "-C", str(root), *arguments], capture_output=True, check=False)
    if required and result.returncode:
        raise RuntimeError("Git inspection failed; inspect repository access locally.")
    return result.stdout if result.returncode == 0 else b""


def synthetic_domain(domain: str) -> bool:
    domain = domain.lower()
    return domain in {"example.com", "example.org", "example.net", "localhost"} or domain.endswith((".example", ".invalid", ".test", ".localhost"))


def safe_path(path: str) -> str:
    return TOKENS.sub("[redacted-token]", EMAIL.sub("[redacted-email]", path))


def scan_text(text: str, path: str, scope: str) -> list[dict]:
    findings: list[dict] = []

    def add(kind: str, count: int, severity: str = "error") -> None:
        if count:
            findings.append({"path": safe_path(path), "scope": scope, "type": kind, "count": count, "severity": severity})

    contacts = EMAIL.findall(text)
    private = [value for value in contacts if not synthetic_domain(value.rsplit("@", 1)[1])
               and not value.lower().endswith("@users.noreply.github.com")]
    attribution = path in ATTRIBUTION_PATHS or path.startswith("data/provenance/")
    add("third-party-attribution-contact" if attribution else "email-address", len(private), "warning" if attribution else "error")
    add("synthetic-contact-fixture", sum(synthetic_domain(value.rsplit("@", 1)[1]) for value in contacts), "info")
    add("machine-local-user-path", len(LOCAL_PATH.findall(text)))
    add("credential-token-pattern", len(TOKENS.findall(text)))
    add("private-key-header", len(PRIVATE_KEY.findall(text)))
    assignments = [match.group(1) for match in ASSIGNMENT.finditer(text)]
    add("credential-assignment", sum(not any(marker in value.lower() for marker in
        ("example", "placeholder", "redacted", "your_", "fixture", "${", "<")) for value in assignments))
    credential_urls = 0
    for value in URL.findall(text):
        try:
            parsed = urlsplit(value)
            if (parsed.username or parsed.password) and not synthetic_domain(parsed.hostname or ""):
                credential_urls += 1
        except ValueError:
            credential_urls += 1
    add("url-user-info", credential_urls)
    return findings


def inspect_content(data: bytes, path: str, scope: str) -> tuple[list[dict], bool]:
    """GLB JSON is inspected; opaque binary payloads are explicitly unreviewed."""
    if data[:4] == b"glTF" and len(data) >= 20:
        try:
            data = glb_metadata(data)
        except (ValueError, TypeError, KeyError, AttributeError):
            return [{"path": safe_path(path), "scope": scope, "type": "unreadable-glb-metadata", "count": 1, "severity": "error"}], True
    elif b"\0" in data[:8192]:
        return [], False
    try:
        return scan_text(data.decode("utf-8-sig"), path, scope), True
    except UnicodeDecodeError:
        return [], False


def audit(root: Path, scope: str = "tracked", history: bool = False, metadata: bool = False) -> dict:
    findings: list[dict] = []
    inspected = 0
    opaque = 0
    registered = 0
    entries = git(root, "ls-files", "--stage", "-z").decode("utf-8").split("\0")
    snapshot = {}
    for entry in filter(None, entries):
        entry_metadata, path = entry.split("\t", 1)
        snapshot[path] = entry_metadata.split()

    def read_snapshot(path: str, limit: int):
        if path not in snapshot:
            return None
        mode, oid, stage = snapshot[path]
        if mode not in {"100644", "100755"} or stage != "0":
            raise ValueError("Registry input is not a regular snapshot file")
        if scope == "staged":
            if int(git(root, "cat-file", "-s", oid)) > limit:
                raise ValueError("Registry input exceeds its bound")
            return git(root, "cat-file", "blob", oid)
        file = root / path
        if any((root / Path(*Path(path).parts[:count])).is_symlink() for count in range(1, len(Path(path).parts) + 1)):
            raise ValueError("Registry input is a symlink")
        if not file.is_file() or not file.resolve().is_relative_to(root.resolve()) or file.stat().st_size > limit:
            raise ValueError("Registry input is missing or exceeds its bound")
        with file.open("rb") as handle:
            data = handle.read(limit + 1)
        if len(data) > limit:
            raise ValueError("Registry input exceeds its bound")
        return data

    try:
        registry = anatomy_registry(read_snapshot)
        if any(path not in snapshot for path in registry):
            raise ValueError("Registered anatomical input is absent from the snapshot")
    except (ValueError, TypeError, KeyError, AttributeError, OSError):
        registry = {}
        findings.append({"path": "public/atlas-volume", "scope": scope, "type": "invalid-anatomy-registry", "count": 1, "severity": "error"})

    def inspect(data: bytes, path: str, location: str, bindings: dict | None = None) -> None:
        nonlocal inspected, opaque, registered
        selected_registry = registry if bindings is None else bindings
        if path.lower().endswith(".glb"):
            try:
                if path not in selected_registry:
                    raise ValueError("Unregistered anatomical asset")
                metadata = inspect_registered_glb(data, selected_registry[path])
                findings.extend(scan_text(metadata.decode("utf-8"), path, location))
                inspected += 1
                registered += 1
            except (ValueError, TypeError, KeyError, AttributeError, UnicodeError):
                findings.append({"path": safe_path(path), "scope": location, "type": "unregistered-or-invalid-anatomy-asset", "count": 1, "severity": "error"})
            return
        if len(data) > MAX_FILE_BYTES:
            findings.append({"path": safe_path(path), "scope": location, "type": "file-exceeds-scan-bound", "count": 1, "severity": "warning"})
            return
        matches, text_checked = inspect_content(data, path, location)
        findings.extend(matches)
        inspected += 1
        opaque += not text_checked
        if not text_checked:
            findings.append({"path": safe_path(path), "scope": location, "type": "opaque-binary-not-reviewed", "count": 1, "severity": "warning"})

    for entry in filter(None, entries):
        entry_metadata, path = entry.split("\t", 1)
        _mode, oid, stage = entry_metadata.split()
        if stage != "0":
            findings.append({"path": safe_path(path), "scope": scope, "type": "unmerged-index", "count": 1, "severity": "error"})
            continue
        if _mode not in {"100644", "100755"}:
            findings.append({"path": safe_path(path), "scope": scope, "type": "missing-or-symlink-input", "count": 1, "severity": "warning"})
            continue
        parts = Path(path).parts
        if parts and (parts[0] in {"research-data", "data/raw", ".aws"} or path.startswith("data/raw/")
                      or Path(path).name.lower() == "agents.md"
                      or Path(path).name.startswith(".env") and Path(path).name != ".env.example"):
            findings.append({"path": safe_path(path), "scope": scope, "type": "private-input-path-tracked", "count": 1, "severity": "error"})
        if scope == "staged":
            size = int(git(root, "cat-file", "-s", oid))
            if size > (MAX_REGISTERED_GLB_BYTES if path in registry else MAX_FILE_BYTES):
                findings.append({"path": safe_path(path), "scope": scope, "type": "file-exceeds-scan-bound", "count": 1, "severity": "warning"})
                continue
            inspect(git(root, "cat-file", "blob", oid), path, scope)
        else:
            file = root / path
            if not file.is_file() or file.is_symlink():
                findings.append({"path": safe_path(path), "scope": scope, "type": "missing-or-symlink-input", "count": 1, "severity": "warning"})
                continue
            if file.stat().st_size > (MAX_REGISTERED_GLB_BYTES if path in registry else MAX_FILE_BYTES):
                findings.append({"path": safe_path(path), "scope": scope, "type": "file-exceeds-scan-bound", "count": 1, "severity": "warning"})
                continue
            inspect(file.read_bytes(), path, scope)

    commits: list[str] = []
    if history or metadata:
        effective_email = git(root, "config", "--get", "user.email", required=False).decode().strip()
        if effective_email and not effective_email.lower().endswith("@users.noreply.github.com"):
            findings.append({"path": ".git/config", "scope": "git-metadata", "type": "configured-non-noreply-email", "count": 1, "severity": "error"})
        config = git(root, "config", "--local", "--list", required=False).decode()
        findings.extend(scan_text(config, ".git/config", "git-metadata"))
    if history:
        identity_emails = git(root, "log", "--all", "--format=%ae%n%ce", required=False).decode().splitlines()
        non_noreply = sum(not email.lower().endswith("@users.noreply.github.com") for email in identity_emails)
        if non_noreply:
            findings.append({"path": ".git/history", "scope": "git-metadata", "type": "reachable-history-non-noreply-email", "count": non_noreply, "severity": "error"})
        commits = git(root, "rev-list", "--all", required=False).decode().splitlines()
    historical_blobs = 0
    if history:
        seen: set[str] = set()
        for commit in commits:
            tree = git(root, "ls-tree", "-r", "-z", commit).decode().split("\0")
            history_snapshot = {}
            for entry in filter(None, tree):
                entry_metadata, path = entry.split("\t", 1)
                history_snapshot[path] = entry_metadata.split()

            def read_history(path: str, limit: int):
                if path not in history_snapshot:
                    return None
                mode, kind, oid = history_snapshot[path]
                if mode not in {"100644", "100755"} or kind != "blob" or int(git(root, "cat-file", "-s", oid)) > limit:
                    raise ValueError("Historical registry input is not a bounded regular file")
                return git(root, "cat-file", "blob", oid)

            try:
                history_registry = anatomy_registry(read_history)
                if any(path not in history_snapshot for path in history_registry):
                    raise ValueError("Historical anatomical input is missing")
            except (ValueError, TypeError, KeyError, AttributeError):
                history_registry = {}
                findings.append({"path": "public/atlas-volume", "scope": "history", "type": "invalid-anatomy-registry", "count": 1, "severity": "error"})
            for entry in filter(None, tree):
                entry_metadata, path = entry.split("\t", 1)
                _mode, kind, oid = entry_metadata.split()
                if kind != "blob" or oid in seen:
                    continue
                seen.add(oid)
                if historical_blobs >= MAX_HISTORY_BLOBS:
                    continue
                historical_blobs += 1
                size = int(git(root, "cat-file", "-s", oid))
                if size > (MAX_REGISTERED_GLB_BYTES if path in history_registry else MAX_FILE_BYTES):
                    findings.append({"path": safe_path(path), "scope": "history", "type": "file-exceeds-scan-bound", "count": 1, "severity": "warning"})
                    continue
                inspect(git(root, "cat-file", "blob", oid), path, "history", history_registry)
        if len(seen) > MAX_HISTORY_BLOBS:
            findings.append({"path": ".git/history", "scope": "history", "type": "history-exceeds-scan-bound", "count": len(seen) - MAX_HISTORY_BLOBS, "severity": "warning"})
    return {"scope": scope, "historyContentIncluded": history, "gitMetadataIncluded": history or metadata, "filesInspected": inspected,
            "registeredAnatomyAssetsChecked": registered,
            "opaqueBinariesNotTextReviewed": opaque, "reachableCommits": len(commits) if history else None,
            "historicalBlobsInspected": historical_blobs, "findings": findings,
            "errorCount": sum(item["severity"] == "error" for item in findings),
            "warningCount": sum(item["severity"] == "warning" for item in findings)}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--tracked", action="store_true", help="inspect tracked working-tree files (default)")
    group.add_argument("--staged", action="store_true", help="inspect all files in the index snapshot")
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1], help="Git checkout to inspect; the path is not printed")
    parser.add_argument("--include-history", "--history", dest="history", action="store_true", help="also inspect bounded reachable history and Git metadata")
    parser.add_argument("--include-git-metadata", action="store_true", help="also inspect current Git identity and local configuration")
    args = parser.parse_args()
    try:
        report = audit(args.root.resolve(), "staged" if args.staged else "tracked", args.history, args.include_git_metadata)
    except (OSError, RuntimeError, ValueError, UnicodeError) as error:
        print(json.dumps({"error": "Publication inspection could not complete.", "exceptionType": type(error).__name__}))
        return 2
    print(json.dumps(report, indent=2))
    return 1 if report["errorCount"] or report["warningCount"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
