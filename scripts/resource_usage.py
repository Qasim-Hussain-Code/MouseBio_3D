"""Account for all project storage without reading research-file contents.

Includes hidden and ignored entries, dependencies, caches, raw data and .git.
Symlinks are counted but never followed outside or within the project.
Only Python's standard library is required.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import shutil
import stat
import time

ROOT = Path(__file__).resolve().parents[1]
PROJECT_BUDGET_BYTES = 10_000_000_000


def empty_counts() -> dict:
    return {
        "regularFiles": 0,
        "directories": 0,
        "symlinks": 0,
        "otherEntries": 0,
        "logicalBytes": 0,
        "uniqueRegularFileBytes": 0,
        "allocatedBytes": 0,
    }


def available_memory() -> dict | None:
    """Read only aggregate Linux memory information, not process or user data."""
    try:
        values = {}
        for line in Path("/proc/meminfo").read_text(encoding="ascii").splitlines():
            name, _, value = line.partition(":")
            if name in {"MemTotal", "MemAvailable"}:
                values[name] = int(value.split()[0]) * 1024
        if "MemTotal" not in values:
            return None
        return {
            "totalBytes": values["MemTotal"],
            "availableBytes": values.get("MemAvailable"),
            "scope": "Linux execution environment, including WSL limits when applicable",
        }
    except (OSError, ValueError, IndexError):
        return None


def collect_usage(root: Path = ROOT, budget_bytes: int = PROJECT_BUDGET_BYTES) -> dict:
    start = time.monotonic()
    root = root.resolve(strict=True)
    if not root.is_dir():
        raise ValueError("The accounting root must be a directory")
    total = empty_counts()
    groups: dict[str, dict] = {}
    errors: list[dict] = []
    visited_inodes: set[tuple[int, int]] = set()
    allocated_supported = hasattr(root.stat(), "st_blocks")
    pending = [root]

    def record(path: Path, info: os.stat_result) -> None:
        relative = path.relative_to(root)
        top_level = relative.parts[0] if relative.parts else "."
        group = groups.setdefault(top_level, empty_counts())
        mode = info.st_mode
        if stat.S_ISREG(mode):
            category = "regularFiles"
        elif stat.S_ISDIR(mode):
            category = "directories"
        elif stat.S_ISLNK(mode):
            category = "symlinks"
        else:
            category = "otherEntries"
        for counts in (total, group):
            counts[category] += 1
            if category == "regularFiles":
                counts["logicalBytes"] += info.st_size
        identity = (info.st_dev, info.st_ino)
        # A hard-linked file occupies storage once, although its directory entries
        # contribute separately to logical size. Attribute unique storage to the
        # first lexically visited entry, preserving deterministic accounting.
        if identity not in visited_inodes:
            visited_inodes.add(identity)
            for counts in (total, group):
                if category == "regularFiles":
                    counts["uniqueRegularFileBytes"] += info.st_size
                if allocated_supported:
                    counts["allocatedBytes"] += info.st_blocks * 512

    record(root, root.lstat())
    while pending:
        directory = pending.pop()
        try:
            with os.scandir(directory) as scanner:
                entries = sorted(scanner, key=lambda entry: entry.name)
        except OSError as error:
            errors.append({"path": str(directory.relative_to(root)), "error": type(error).__name__})
            continue
        children = []
        for entry in entries:
            path = Path(entry.path)
            try:
                info = entry.stat(follow_symlinks=False)
                record(path, info)
                if stat.S_ISDIR(info.st_mode):
                    children.append(path)
            except OSError as error:
                errors.append({"path": str(path.relative_to(root)), "error": type(error).__name__})
        pending.extend(reversed(children))

    disk = shutil.disk_usage(root)
    assessment_bytes = max(total["logicalBytes"], total["allocatedBytes"])
    return {
        "schemaVersion": "mousebio.resources.v1",
        "collectedAtUtc": datetime.now(timezone.utc).isoformat(),
        "root": str(root),
        "budgetBytes": budget_bytes,
        "budgetBasis": "maximum of apparent regular-file bytes and reported allocated entry bytes",
        "budgetAssessmentBytes": assessment_bytes,
        "withinBudget": assessment_bytes <= budget_bytes if not errors else None,
        "scanComplete": not errors,
        "totals": total,
        "byTopLevel": dict(sorted(groups.items())),
        "allocatedSizeAvailable": allocated_supported,
        "disk": {"totalBytes": disk.total, "usedBytes": disk.used, "freeBytes": disk.free},
        "memory": available_memory(),
        "elapsedSeconds": round(time.monotonic() - start, 3),
        "errors": errors,
        "limitations": [
            "Metadata snapshot only; files can change while the scan is running.",
            "Symlinks are not followed; research files stored outside the project are not counted.",
            "Allocated bytes depend on filesystem reporting and do not measure the WSL virtual disk container overhead.",
            "Hard-linked file apparent sizes count each path; unique storage is assigned to the first visited path.",
            "The scan includes .git and every hidden or ignored project directory; it reads no research-file contents.",
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=ROOT, help="project directory to account for")
    args = parser.parse_args()
    result = collect_usage(args.root)
    print(json.dumps(result, indent=2))
    if not result["scanComplete"]:
        raise SystemExit(2)
    if not result["withinBudget"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
