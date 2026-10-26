#!/usr/bin/env python3
"""Read-only, bounded publication checks with value-free findings."""
from __future__ import annotations

import argparse
import json
import re
import struct
import subprocess
from pathlib import Path
from urllib.parse import urlsplit

MAX_FILE_BYTES = 8 * 1024 * 1024
MAX_HISTORY_BLOBS = 1000
EMAIL = re.compile(r"[A-Za-z0-9.!#%+_~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
# [U] preserves the exact match while avoiding a literal home path in this pattern's own source.
LOCAL_PATH = re.compile(r"(?:[A-Za-z]:[\\/]+Users[\\/]+[^\\/\s<>\"']+|/mnt/[a-z]/[U]sers/[^/\s<>\"']+|/(?:home|Users)/[^/\s<>\"']+)")
TOKENS = re.compile(r"\b(?:gh[pousr]_[A-Za-z0-9]{20,255}|github_pat_[A-Za-z0-9_]{20,255}|(?:AKIA|ASIA)[A-Z0-9]{16}|sk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,255})\b")
PRIVATE_KEY = re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----")
ASSIGNMENT = re.compile(r"(?im)^\s*(?:export\s+)?[\"']?(?:api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|password|aws_secret_access_key)[\"']?\s*[:=]\s*[\"']?([^\s\"'#]{8,})")
URL = re.compile(r"https?://[^\s<>\"']+")
ATTRIBUTION_PATHS = {"public/THIRD_PARTY_NOTICES.txt", "public/atlas/LICENSE.md"}


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
        length, kind = struct.unpack_from("<II", data, 12)
        if kind != 0x4E4F534A or 20 + length > len(data):
            return [{"path": safe_path(path), "scope": scope, "type": "unreadable-glb-metadata", "count": 1, "severity": "error"}], True
        data = data[20:20 + length]
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

    def inspect(data: bytes, path: str, location: str) -> None:
        nonlocal inspected, opaque
        if len(data) > MAX_FILE_BYTES:
            findings.append({"path": safe_path(path), "scope": location, "type": "file-exceeds-scan-bound", "count": 1, "severity": "warning"})
            return
        matches, text_checked = inspect_content(data, path, location)
        findings.extend(matches)
        inspected += 1
        opaque += not text_checked
        if not text_checked:
            findings.append({"path": safe_path(path), "scope": location, "type": "opaque-binary-not-reviewed", "count": 1, "severity": "warning"})

    entries = git(root, "ls-files", "--stage", "-z").decode("utf-8").split("\0")
    for entry in filter(None, entries):
        entry_metadata, path = entry.split("\t", 1)
        _mode, oid, stage = entry_metadata.split()
        if stage != "0":
            findings.append({"path": safe_path(path), "scope": scope, "type": "unmerged-index", "count": 1, "severity": "error"})
            continue
        parts = Path(path).parts
        if parts and (parts[0] in {"research-data", "data/raw", ".aws"} or path.startswith("data/raw/")
                      or Path(path).name.startswith(".env") and Path(path).name != ".env.example"):
            findings.append({"path": safe_path(path), "scope": scope, "type": "private-input-path-tracked", "count": 1, "severity": "error"})
        if scope == "staged":
            size = int(git(root, "cat-file", "-s", oid))
            if size > MAX_FILE_BYTES:
                findings.append({"path": safe_path(path), "scope": scope, "type": "file-exceeds-scan-bound", "count": 1, "severity": "warning"})
                continue
            inspect(git(root, "cat-file", "blob", oid), path, scope)
        else:
            file = root / path
            if not file.is_file() or file.is_symlink():
                findings.append({"path": safe_path(path), "scope": scope, "type": "missing-or-symlink-input", "count": 1, "severity": "warning"})
                continue
            if file.stat().st_size > MAX_FILE_BYTES:
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
                if size > MAX_FILE_BYTES:
                    findings.append({"path": safe_path(path), "scope": "history", "type": "file-exceeds-scan-bound", "count": 1, "severity": "warning"})
                    continue
                inspect(git(root, "cat-file", "blob", oid), path, "history")
        if len(seen) > MAX_HISTORY_BLOBS:
            findings.append({"path": ".git/history", "scope": "history", "type": "history-exceeds-scan-bound", "count": len(seen) - MAX_HISTORY_BLOBS, "severity": "warning"})
    return {"scope": scope, "historyContentIncluded": history, "gitMetadataIncluded": history or metadata, "filesInspected": inspected,
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
