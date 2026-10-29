#!/usr/bin/env python3
"""Read-only, bounded publication checks with value-free findings."""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import struct
import subprocess
from pathlib import Path, PurePosixPath
from urllib.parse import urlsplit

MAX_FILE_BYTES = 8 * 1024 * 1024
MAX_HISTORY_BLOBS = 1000
MAX_GLB_JSON_BYTES = 1024 * 1024
MAX_REGISTERED_GLB_BYTES = 80 * 1024 * 1024
MAX_REGISTERED_TOTAL_BYTES = 160 * 1024 * 1024
MAX_PLY_HEADER_BYTES = 16 * 1024
EMA147_ARCHIVE_SHA256 = "efd5df6df9b69cf21a62d1f4245ecc5419ee4e5c4c72635f444ce3fba5b7971c"
EMA147_MODEL_INFO_SHA256 = "cf37ac2de4f7ce79cfeb912dda70257ee06a561511ef54a18a7d89fa69cbeb21"
EMA147_README_SHA256 = "6e68704cf516682243460f835179124f84d93afae7e4ca7d5901f8c1d8c0c671"
EMA147_ANATOMY_INDEX_SHA256 = "970f2870a1e56603b6be75225de1ec9c0a6f0ec91dfb16bea73849c0155bac1b"
EMA147_FRAME = "emouseatlas-ema147-stl-native-v1"
# SHA-256 of sorted, newline-delimited filenames from the CC BY 4.0 source archive.
EMA147_INVENTORY_SHA256 = "19e3c365b2e677533e85ce9aa7c8507128087bb8ad2b03ba394b46c9b4ba8cd1"
EMA147_TOPOLOGY_SHA256 = "3321ead11161ab0a0c99095d41a99ae64605bce2833e405df68993b264d37e52"
VOLUME_ARCHIVE_SHA256 = "6f7cbd8a7236a78c47a14c3259d387439c0dc0284b2a83fa955f8c49efe11761"
VOLUME_FRAME = "digimouse-registered-voxel-native-v1"
HINDLIMB_PDF_SHA256 = "aadb7a020f3f9ffc1c8b91f3d8e5f9f2a1eef95d24b0816b69ac4f878637ac47"
HINDLIMB_JSON_SHA256 = "0eda5effc49a460fbc89de070baa5d48c940c5f5b0dab1319f5d4f1342629e8c"
HINDLIMB_PRC_SHA256 = "c300f38c7888b82b0c2e00548c8d2bb5b879b076872e5e44781da8a8477fc659"
HINDLIMB_DECODER_COMMIT = "24bfa43b7c29203c572892662ec8a5a8e8ae7b96"
HINDLIMB_FRAME = "charles2016-hindlimb-prc-native-v1"
HINDLIMB_AUTHORS = ("Charles", "Cappellari", "Spence", "Hutchinson", "Wells")
# Source-defined names and tessellation order, from the Charles et al. CC BY 4.0 figure.
HINDLIMB_NAMES = (
    'Peroneus digiti quinti', 'Peroneus longus', 'Tibialis posterior', 'Flexor digitorum longus',
    'Peroneus brevis', 'Peroneus digiti quarti', 'Peroneus tertius', 'Soleus',
    'Lateral gastrocnemius', 'Plantaris', 'Medial gastrocnemius', 'Extensor hallucis longus',
    'Extensor digitorum longus', 'Tibialis anterior', 'Fabellae', 'Patellar tendon',
    'Pelvis', 'Femur', 'Patella', 'Foot', 'Tibia/Fibula', 'Pectineus', 'Obturator externus',
    'Psoas minor', 'Iliacus', 'Gemellus', 'Obturator internus', 'Gluteus maximus',
    'Quadratus femoris', 'Psoas major', 'Vastus lateralis', 'Vastus intermedius',
    'Vastus medialis', 'Adductor longus', 'Rectus femoris', 'Biceps femoris (posterior)',
    'Biceps femoris (anterior)', 'Popliteus', 'Caudofemoralis', 'Gracilis (anterior)',
    'Semitendinosus', 'Adductor magnus', 'Semimembranosus', 'Gracilis (posterior)',
)
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
ATTRIBUTION_PATHS = {"public/THIRD_PARTY_NOTICES.txt", "public/atlas/LICENSE.md", "public/atlas-volume/LICENSE.md", "public/atlas-hindlimb/LICENSE.md", "public/atlas-ema147/LICENSE.md"}
NEURON_ASSET_PATH = "public/atlas-neuron/nmo130632-standardized.swc.txt"
NEURON_MANIFEST_PATH = "public/atlas-neuron/atlas.json"
NEURON_LICENSE_PATH = "public/atlas-neuron/LICENSE.md"
NEURON_ATLAS_ID = "neuromorpho-nmo130632-standardized-v1"
NEURON_FRAME_ID = "neuromorpho-nmo130632-standardized-unknown-units-v1"
NEURON_SOURCE_SHA256 = "a8340628eb02051416ad0607e72b60cba9241eb34c9be10b0c7df01771b5cfce"
NEURON_ASSET_SHA256 = "0dd36d6518aacd6338d16c76318d6ed0fd24419a0551417fdf639a8323c6ede5"
NEURON_ASSET_BYTES = 424092


# Each source remains independently pinned; its preparation module is imported
# only when the corresponding manifest occurs in the selected snapshot.
POLYLINE_SOURCES = {
    "public/atlas-vascular/atlas.json": {
        "module": "prepare_vascular", "assetPath": "public/atlas-vascular/schmid2021-mvn1-lines.json",
        "licensePath": "public/atlas-vascular/LICENSE.md", "bytes": 38356364,
        "sha256": "8d9fb19e943a126562ab5a439d83590b5694d58b208f064a8140d556ed3e4652",
        "atlasId": "schmid2021-mvn1-v1", "coordinateFrameId": "schmid2021-mvn1-source-micrometres-v1",
        "sourceId": "schmid2021-zenodo5115640-mvn1", "sourceHashField": "sourceSha256",
        "sourceSha256": "40d8a729e8bc977e4121a633da162d1e49f2e71e343454a04e18cc541965c627",
        "license": "CC-BY-4.0", "licenseUrl": "https://creativecommons.org/licenses/by/4.0/",
        "requiredAttribution": (b"Schmid", b"Conti", b"Jenny", b"Weber", b"Blinder", b"10.5281/zenodo.5115640", b"10.1038/nn.3426", b"10.1371/journal.pcbi.1005392", b"creativecommons.org/licenses/by/4.0"),
    },
    "public/atlas-nerve/atlas.json": {
        "module": "prepare_mousemapper_nerve", "assetPath": "public/atlas-nerve/mousemapper-patch0-lines.json",
        "licensePath": "public/atlas-nerve/LICENSE.md", "bytes": 55658,
        "sha256": "e59fea98d4f41adab6149eee38e28ea6c3737dfa37013d5a2039e89c4c3ef0ce",
        "atlasId": "mousemapper-nerve-patch0-v1", "coordinateFrameId": "mousemapper-nerve-patch0-native-unknown-units-v1",
        "sourceId": "mousemapper-7fe04a9c-graph-patch0", "sourceHashField": "sourceSha256",
        "sourceSha256": "b35b59a1056d04e5992a0e463751ceb89a733d80837e66d951be810899ec3c27",
        "license": "Apache-2.0", "licenseUrl": "https://www.apache.org/licenses/LICENSE-2.0",
        "requiredAttribution": (b"Kaltenecker", b"Horvath", b"Al-Maskari", b"10.1038/s41586-026-10535-2",
                                b"7fe04a9ccf37664d76fe548ae226147c0023ceb7", b"2290", b"145"),
        "fullApacheGitBlob": "261eeb9e9f8b2b4b0d119366dda99c6fd7d35c64",
    },
}
POLYLINE_TEXT_PATHS = {"public/atlas-nerve/mousemapper-patch0-lines.json",
                       "public/atlas-vascular/schmid2021-mvn1-lines.json"}


def is_registered_text_path(path: str, binding: dict | None = None) -> bool:
    return (path.lower().endswith(".swc.txt") or path in POLYLINE_TEXT_PATHS
            or binding is not None and binding.get("format") in {"swc-native-v1", "polyline-native-v1"})


def asset_scan_limit(path: str, bindings: dict) -> int:
    # Known registered-text paths retain the complete bounded privacy scan even
    # if their manifest/source registration failed and the registry is empty.
    return MAX_REGISTERED_GLB_BYTES if path in bindings or is_registered_text_path(path) else MAX_FILE_BYTES


def reviewed_polyline_manifest(data: bytes, manifest_path: str) -> dict:
    spec = POLYLINE_SOURCES.get(manifest_path)
    if (not spec or len(data) != spec["bytes"] or len(data) > MAX_REGISTERED_GLB_BYTES
            or hashlib.sha256(data).hexdigest() != spec["sha256"]):
        raise ValueError("Polyline derivative differs from its reviewed source")
    try:
        from importlib import import_module
        module = import_module(spec["module"])
        expected = module.make_manifest(data)
    except (ImportError, AttributeError):
        raise ValueError("Polyline source validation support is missing") from None
    source = expected.get("source", {})
    if (expected.get("assetFormat") != "polyline-native-v1" or expected.get("id") != spec["atlasId"]
            or expected.get("assetUrl") != spec["assetPath"].removeprefix("public")
            or expected.get("coordinateFrame", {}).get("id") != spec["coordinateFrameId"]
            or source.get("id") != spec["sourceId"] or source.get(spec["sourceHashField"]) != spec["sourceSha256"]
            or source.get("license") != spec["license"] or source.get("licenseUrl") != spec["licenseUrl"]
            or expected.get("statistics", {}).get("assetBytes") != spec["bytes"]
            or expected.get("statistics", {}).get("assetSha256") != spec["sha256"]):
        raise ValueError("Polyline preparation record differs from its pinned source")
    return expected


def polyline_binding(expected: dict, manifest_path: str) -> dict:
    spec = POLYLINE_SOURCES[manifest_path]
    return {"format": "polyline-native-v1", "bytes": spec["bytes"], "sha256": spec["sha256"],
            "sourceSha256": spec["sourceSha256"], "sourceId": spec["sourceId"],
            "ids": [entry["id"] for entry in expected["structures"]], "atlasId": spec["atlasId"],
            "coordinateFrameId": spec["coordinateFrameId"], "statistics": expected["statistics"],
            "manifestPath": manifest_path, "licensePath": spec["licensePath"]}


def register_polyline(manifest: dict, manifest_path: str, read, registry: dict[str, dict]) -> None:
    spec = POLYLINE_SOURCES[manifest_path]
    data = read(spec["assetPath"], MAX_REGISTERED_GLB_BYTES)
    if data is None:
        raise ValueError("Registered polyline derivative is missing")
    expected = reviewed_polyline_manifest(data, manifest_path)
    # All scientific sections, processing flags, omitted fields and narrative
    # provenance are pinned together. Extra fields cannot grant new claims.
    if json.dumps(manifest, sort_keys=True, allow_nan=False) != json.dumps(expected, sort_keys=True, allow_nan=False):
        raise ValueError("Polyline source metadata or scientific limitations differ")
    notice = read(spec["licensePath"], MAX_GLB_JSON_BYTES)
    if not notice or any(token not in notice for token in spec["requiredAttribution"]):
        raise ValueError("Registered polyline attribution is missing")
    if spec.get("fullApacheGitBlob"):
        license_match = re.search(rb"```text\n(.*?)\n```", notice, re.S)
        license_body = license_match.group(1) if license_match else b""
        if len(license_body) != 11357 or hashlib.sha1(f"blob {len(license_body)}\0".encode() + license_body).hexdigest() != spec["fullApacheGitBlob"]:
            raise ValueError("The complete original Apache license must be preserved")
    if spec["assetPath"] in registry:
        raise ValueError("Repeated polyline asset path")
    registry[spec["assetPath"]] = polyline_binding(expected, manifest_path)


def inspect_registered_polyline(data: bytes, binding: dict) -> bytes:
    manifest_path = binding.get("manifestPath")
    expected = reviewed_polyline_manifest(data, manifest_path)
    if binding != polyline_binding(expected, manifest_path):
        raise ValueError("Polyline asset differs from its reviewed binding")
    # Numeric JSON is still ordinary text. Its complete body, not a summary or
    # embedded header, is returned to the privacy scanner.
    return data


def reviewed_neuron_manifest(data: bytes) -> dict:
    """Recompute the approved derivative's source record without its private header."""
    if len(data) != NEURON_ASSET_BYTES or hashlib.sha256(data).hexdigest() != NEURON_ASSET_SHA256:
        raise ValueError("Neuronal source derivative differs from the approved numeric records")
    try:
        # Older snapshots without this source do not need its preparation helper.
        from prepare_neuromorpho import make_manifest
    except ImportError:
        raise ValueError("Neuronal source validation support is missing") from None
    return make_manifest(data)


def register_neuromorpho(manifest: dict, read, registry: dict[str, dict]) -> None:
    data = read(NEURON_ASSET_PATH, 2 * 1024 * 1024)
    if data is None:
        raise ValueError("Registered neuronal source derivative is missing")
    expected = reviewed_neuron_manifest(data)
    # The source's ambiguous specimen claims, unverified units, processing and
    # parent graph are reviewed together. A file header cannot grant metadata.
    keys = ("id", "assetFormat", "assetUrl", "source", "coordinateFrame", "specimen",
            "sourceDeclarations", "structures", "statistics", "processing", "limitations")
    if any(key not in manifest or json.dumps(manifest[key], sort_keys=True) != json.dumps(expected[key], sort_keys=True)
           for key in keys):
        raise ValueError("Neuronal source, license, graph or unknown coordinate frame is not registered")
    notice = read(NEURON_LICENSE_PATH, MAX_GLB_JSON_BYTES)
    required_attribution = (b"creativecommons.org/licenses/by/4.0", b"130632", b"Scala", b"Tecuatl",
                            b"RRID:SCR_002145", b"10.1038/s41467-019-12058-z", b"10.1096/fba.2024-00048")
    if not notice or any(value not in notice for value in required_attribution):
        raise ValueError("Registered neuronal source attribution is missing")
    if NEURON_ASSET_PATH in registry:
        raise ValueError("Repeated neuronal source asset path")
    registry[NEURON_ASSET_PATH] = {
        "format": "swc-native-v1", "bytes": NEURON_ASSET_BYTES, "sha256": NEURON_ASSET_SHA256,
        "sourceSha256": NEURON_SOURCE_SHA256, "ids": ["neuromorpho:130632"], "atlasId": NEURON_ATLAS_ID,
        "coordinateFrameId": NEURON_FRAME_ID, "statistics": expected["statistics"],
        "manifestPath": NEURON_MANIFEST_PATH, "licensePath": NEURON_LICENSE_PATH,
    }


def inspect_registered_source_trace(data: bytes, binding: dict) -> bytes:
    if (binding.get("bytes") != NEURON_ASSET_BYTES or binding.get("sha256") != NEURON_ASSET_SHA256
            or binding.get("sourceSha256") != NEURON_SOURCE_SHA256
            or binding.get("ids") != ["neuromorpho:130632"] or binding.get("atlasId") != NEURON_ATLAS_ID
            or binding.get("coordinateFrameId") != NEURON_FRAME_ID
            or binding.get("manifestPath") != NEURON_MANIFEST_PATH or binding.get("licensePath") != NEURON_LICENSE_PATH
            or reviewed_neuron_manifest(data)["statistics"] != binding.get("statistics")):
        raise ValueError("Neuronal source asset differs from its approved binding")
    # The entire body is ordinary text. Registration grants no privacy exemption.
    return data


def anatomy_asset_path(url: str, folder: str, suffix: str = ".glb") -> str:
    if (not isinstance(url, str) or not url.startswith(f"/{folder}/") or not url.endswith(suffix)
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


def register_ema147(manifest: dict, read, registry: dict[str, dict]) -> None:
    source, frame = manifest.get("source", {}), manifest.get("coordinateFrame", {})
    if (manifest.get("id") != "ema147-native-v1" or manifest.get("assetFormat") != "ply-native-v1"
            or manifest.get("assetUrl") != "/atlas-ema147/ema147-native.ply"
            or source.get("id") != "emouseatlas-ema147-2017" or source.get("archiveSha256") != EMA147_ARCHIVE_SHA256
            or source.get("archiveBytes") != 11393742 or source.get("doi") != "10.7488/ds/2167"
            or source.get("sourceSurfaceInventorySha256") != EMA147_INVENTORY_SHA256
            or source.get("modelInfoSha256") != EMA147_MODEL_INFO_SHA256 or source.get("readmeSha256") != EMA147_README_SHA256
            or source.get("anatomyIndexSha256") != EMA147_ANATOMY_INDEX_SHA256
            or source.get("license") != "CC-BY-4.0" or source.get("licenseUrl") != "https://creativecommons.org/licenses/by/4.0/"
            or frame.get("id") != EMA147_FRAME or frame.get("sourceUnits") != "unknown" or frame.get("assetUnits") != "unknown"
            or type(frame.get("sourceToAssetScale")) not in {int, float} or frame["sourceToAssetScale"] != 1
            or frame.get("unitsVerified") is not False or frame.get("physicalCalibrationVerified") is not False
            or frame.get("anatomicalOrientationVerified") is not False
            or "registrationToDigimouse" not in frame or frame["registrationToDigimouse"] is not None):
        raise ValueError("EMA147 source, license or uncalibrated frame is not registered")
    structures = manifest.get("structures")
    if not isinstance(structures, list) or len(structures) != 77:
        raise ValueError("EMA147 requires the exact source surface inventory")
    files = [entry["sourceFile"] for entry in structures]
    if (files != sorted(files) or len(set(files)) != len(files)
            or hashlib.sha256(("\n".join(files) + "\n").encode()).hexdigest() != EMA147_INVENTORY_SHA256):
        raise ValueError("EMA147 source filenames differ from the reviewed archive")
    source_index = read("data/provenance/ema147-source-index.txt", MAX_GLB_JSON_BYTES)
    if not source_index or hashlib.sha256(source_index).hexdigest() != EMA147_ANATOMY_INDEX_SHA256:
        raise ValueError("EMA147 anatomy index is missing or differs from the reviewed source")
    index_records = {}
    for line in source_index.decode("utf-8").splitlines():
        match = re.fullmatch(r'\s*([0-9]+)\s+([0-9]+)\s+([0-9]+)\s+([0-9]+)\s+[0-9.]+\s+[01]\s+[01]\s+"(EMAPA:[0-9]+ [^"]+)"', line)
        if match:
            number, red, green, blue = map(int, match.groups()[:4])
            label = match.group(5)
            index_records[label.split(" ", 1)[0]] = (number, f"#{red:02x}{green:02x}{blue:02x}", label)
    index_ids = list(index_records)
    if len(index_ids) != 76 or len(set(index_ids)) != 76:
        raise ValueError("EMA147 anatomy index does not have its exact identifier inventory")
    surface_ids = {"EMAPA:" + re.fullmatch(r"Surfaces/EMAPA([0-9]+)_[A-Za-z0-9_]+\.stl", filename).group(1)
                   for filename in files if filename != "Surfaces/reference.stl"}
    index_ids = set(index_ids)
    comparison = manifest.get("sourceInventoryComparison", {})
    if (comparison.get("anatomyIndexIdentifiers") != 76 or comparison.get("surfaceEMAPAIdentifiers") != 76
            or comparison.get("matchingIdentifiers") != sorted(index_ids & surface_ids)
            or comparison.get("indexOnlyIdentifiers") != sorted(index_ids - surface_ids)
            or comparison.get("surfaceOnlyIdentifiers") != sorted(surface_ids - index_ids)
            or comparison.get("unannotatedSourceFiles") != ["Surfaces/reference.stl"]):
        raise ValueError("EMA147 index and surface comparison cannot be silently substituted")
    specimen = manifest.get("specimen", {})
    if (specimen.get("sex") != "unknown" or any(specimen.get(key) is not None for key in ("age", "mass", "count", "scientificName", "taxonomyId"))
            or specimen.get("strain") != "C57BL6" or specimen.get("developmentalStage", {}).get("label") != "TS23"):
        raise ValueError("EMA147 undeclared specimen characteristics must remain unknown")
    claims = manifest.get("ageClaims")
    expected_claims = {
        "https://datashare.ed.ac.uk/items/5016a5d4-2017-4fdc-a934-964fc2b542ec/full": (15, "embryonic days", {"E15.0 (estimated)", "E15.0 estimated", "E15.0, estimated"}),
        "https://www.emouseatlas.org/eAtlasViewer_ema/application/ema/anatomy/EMA147.php": (15, "dpc", {"15 dpc"}),
        "https://emouseatlas.org/emap/ema/modelsummary/modelsummary.html": (14.5, "dpc", {"14.5 dpc"}),
    }
    if (not isinstance(claims, list) or len(claims) != 3
            or {claim.get("sourceReference") for claim in claims} != set(expected_claims)
            or any(type(claim.get("value")) not in {int, float}
                   or (claim["value"], claim.get("unit")) != expected_claims[claim["sourceReference"]][:2]
                   or claim.get("label") not in expected_claims[claim["sourceReference"]][2] for claim in claims)
            or manifest.get("ageConflictResolved") is not False):
        raise ValueError("EMA147 conflicting source age claims must remain separately attributed")
    regions = []
    vertex_offset = triangle_offset = 0
    for index, entry in enumerate(structures):
        filename = entry["sourceFile"]
        match = re.fullmatch(r"Surfaces/EMAPA([0-9]+)_([A-Za-z0-9_]+)\.stl", filename)
        identifier = f"ema147:EMAPA:{match.group(1)}" if match else "ema147:reference" if filename == "Surfaces/reference.stl" else None
        filename_label = match.group(2) if match else "reference"
        if (entry.get("id") != identifier or type(entry.get("sourceRegionIndex")) is not int or entry["sourceRegionIndex"] != index
                or entry.get("sourceLabel") != PurePosixPath(filename).stem
                or entry.get("sourceFilenameLabel") != filename_label or entry.get("systems") != []):
            raise ValueError("EMA147 source IDs, labels or region order differ from their filenames")
        anatomy_id = "EMAPA:" + match.group(1) if match else None
        if ((anatomy_id and entry.get("sourceEMAPAId") != anatomy_id)
                or anatomy_id is None and entry.get("sourceEMAPAId") is not None or entry.get("ontology")):
            raise ValueError("EMA147 filename anatomy identifiers were substituted")
        if anatomy_id in index_records:
            number, color, label = index_records[anatomy_id]
            if (entry.get("sourceVolumeLabelIndex") != number or entry.get("sourceIndexLabel") != label
                    or entry.get("color") != color or entry.get("colorProvenance") != "source-index exact EMAPA identifier"):
                raise ValueError("EMA147 source index correspondence differs from the exact identifier match")
        elif (any(key in entry for key in ("sourceVolumeLabelIndex", "sourceIndexLabel"))
              or entry.get("color") != "#aab4b5"
              or entry.get("colorProvenance") != "neutral display fallback; no exact source-index identifier match"):
            raise ValueError("EMA147 unmatched surfaces must not acquire a source index correspondence")
        geometry = entry["geometry"]
        vertices, triangles = geometry["vertices"], geometry["triangles"]
        bounds = geometry["boundsSourceUnits"]
        if (type(vertices) is not int or not 0 < vertices <= 10_000_000
                or type(triangles) is not int or not 0 < triangles <= 5_000_000
                or type(geometry.get("vertexOffset")) is not int or geometry["vertexOffset"] != vertex_offset
                or type(geometry.get("triangleOffset")) is not int or geometry["triangleOffset"] != triangle_offset
                or not isinstance(bounds, list) or len(bounds) != 2
                or any(not isinstance(vector, list) or len(vector) != 3
                       or any(type(value) not in {int, float} or not math.isfinite(value) for value in vector) for vector in bounds)
                or any(bounds[0][axis] > bounds[1][axis] for axis in range(3))):
            raise ValueError("EMA147 geometry ranges or source bounds are invalid")
        regions.append({"id": identifier, "sourceFile": filename, "vertices": vertices, "triangles": triangles,
                        "vertexOffset": vertex_offset, "triangleOffset": triangle_offset, "boundsSourceUnits": bounds})
        vertex_offset += vertices
        triangle_offset += triangles
    statistics = manifest["statistics"]
    topology_records = [{"sourceFile": entry["sourceFile"], "sourceTopology": entry["geometry"].get("sourceTopology")}
                        for entry in structures]
    if (hashlib.sha256(json.dumps(topology_records, sort_keys=True, separators=(",", ":")).encode()).hexdigest() != EMA147_TOPOLOGY_SHA256
            or statistics.get("closedManifoldSourceRegions") != 23
            or statistics.get("sourceTopology") != {"degenerateTriangles": 0, "duplicateTriangles": 0, "boundaryEdges": 1411,
                "nonmanifoldEdges": 2285, "inconsistentWindingEdges": 11, "noncyclicVertexLinks": 4139}):
        raise ValueError("EMA147 known source topology defects must remain disclosed")
    size, digest = statistics["assetBytes"], statistics["assetSha256"]
    if (type(size) is not int or not 20 <= size <= MAX_REGISTERED_GLB_BYTES
            or not isinstance(digest, str) or not re.fullmatch(r"[a-f0-9]{64}", digest)
            or statistics.get("vertices") != vertex_offset or statistics.get("triangles") != triangle_offset
            or statistics.get("structures") != 77 or any(key in statistics for key in ("glbBytes", "glbSha256"))):
        raise ValueError("EMA147 native asset statistics are inconsistent")
    processing = manifest.get("processing", {})
    if (type(processing.get("sourceToAssetScale")) not in {int, float} or processing["sourceToAssetScale"] != 1
            or any(processing.get(key) is not False for key in ("geometricSmoothing", "meshRepair", "decimation", "triangleRemoval", "windingRepair", "registration"))
            or processing.get("positionStorage") != "float32" or processing.get("normalFallbackVertices") != 0
            or processing.get("normalProcessing") != "Area-weighted unit vertex normals for display; original STL facet normals are not stored in the PLY."
            or processing.get("normalCancellationFallback") != "First incident nonzero triangle normal in original source order."):
        raise ValueError("EMA147 native geometry must retain source scale, triangles and defects")
    notice = read("public/atlas-ema147/LICENSE.md", MAX_GLB_JSON_BYTES)
    if (not notice or b"creativecommons.org/licenses/by/4.0" not in notice or b"10.7488/ds/2167" not in notice
            or any(author not in notice for author in (b"Ruffins", b"Jacobs", b"Armit", b"Burton", b"Hill", b"Baldock"))):
        raise ValueError("Registered EMA147 attribution is missing")
    path = anatomy_asset_path(manifest["assetUrl"], "atlas-ema147", ".ply")
    if path in registry:
        raise ValueError("Repeated EMA147 asset path")
    registry[path] = {"format": "ply-native-v1", "bytes": size, "sha256": digest,
                      "ids": [region["id"] for region in regions], "regions": regions,
                      "vertices": vertex_offset, "triangles": triangle_offset,
                      "atlasId": manifest["id"], "coordinateFrameId": EMA147_FRAME,
                      "manifestPath": "public/atlas-ema147/atlas.json", "licensePath": "public/atlas-ema147/LICENSE.md",
                      "sourcePaths": ["data/provenance/ema147-source-index.txt"]}


def anatomy_registry(read) -> dict[str, dict]:
    """Read only bounded declarations from the same working/index snapshot.

    Registration binds metadata inspection to exact asset bytes. It does not
    certify anatomical accuracy or inspect binary vertex values as private text.
    The callback returns None for paths absent from the selected snapshot.
    """
    registry: dict[str, dict] = {}
    volume = None
    for folder in ("atlas", "atlas-volume", "atlas-hindlimb"):
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
        if folder == "atlas-hindlimb":
            if (source.get("id") != "charles2016-hindlimb-s1-2016"
                    or source.get("pdfSha256") != HINDLIMB_PDF_SHA256
                    or source.get("decoderJsonSha256") != HINDLIMB_JSON_SHA256
                    or source.get("prcSha256") != HINDLIMB_PRC_SHA256
                    or source.get("decoderCommit") != HINDLIMB_DECODER_COMMIT
                    or source.get("figureDoi") != "10.1371/journal.pone.0147669.s002"
                    or source.get("license") != "CC-BY-4.0"
                    or source.get("licenseUrl") != "https://creativecommons.org/licenses/by/4.0/"
                    or frame != HINDLIMB_FRAME or identifier != "charles2016-hindlimb-v1"
                    or manifest["coordinateFrame"].get("sourceToAssetScale") != 0.001
                    or type(manifest["coordinateFrame"].get("sourceUnitMillimetres")) is not int
                    or manifest["coordinateFrame"]["sourceUnitMillimetres"] != 1
                    or manifest["coordinateFrame"].get("sourceUnits") != "PRC global millimetre multiple"
                    or manifest["coordinateFrame"].get("assetUnits") != "metres"
                    or manifest["coordinateFrame"].get("physicalCalibrationVerified") is not False
                    or manifest["coordinateFrame"].get("anatomicalOrientationVerified") is not False
                    or "registrationToDigimouse" not in manifest["coordinateFrame"]
                    or manifest["coordinateFrame"]["registrationToDigimouse"] is not None
                    or manifest.get("assetUrl") != "/atlas-hindlimb/charles2016-hindlimb.glb"
                    or set(expected_ids or []) != {f"charles2016-hindlimb:{index}" for index in range(44)}):
                raise ValueError("Hindlimb source, license, units, frame or inventory is not registered")
            for entry in manifest["structures"]:
                index = entry.get("sourceTessellationIndex")
                if (type(index) is not int or not 0 <= index < len(HINDLIMB_NAMES)
                        or entry.get("id") != f"charles2016-hindlimb:{index}"
                        or entry.get("sourceLabel") != HINDLIMB_NAMES[index]
                        or entry.get("name") != HINDLIMB_NAMES[index]):
                    raise ValueError("Hindlimb names and source tessellation indices do not match")
            license_bytes = read(f"public/{folder}/LICENSE.md", MAX_GLB_JSON_BYTES)
            if (not license_bytes or b"creativecommons.org/licenses/by/4.0" not in license_bytes
                    or b"10.1371/journal.pone.0147669.s002" not in license_bytes
                    or any(author.encode("ascii") not in license_bytes for author in HINDLIMB_AUTHORS)):
                raise ValueError("Registered hindlimb attribution is missing")
        path = anatomy_asset_path(manifest["assetUrl"], folder)
        size, digest = manifest["statistics"]["glbBytes"], manifest["statistics"]["glbSha256"]
        if (type(size) is not int or not 20 <= size <= MAX_REGISTERED_GLB_BYTES
                or not isinstance(digest, str) or not re.fullmatch(r"[a-f0-9]{64}", digest)
                or not isinstance(frame, str) or not frame or not isinstance(identifier, str) or not identifier):
            raise ValueError("Invalid registered anatomical asset binding")
        registry[path] = {"bytes": size, "sha256": digest, "ids": expected_ids, "atlasId": identifier,
                          "coordinateFrameId": frame, "manifestPath": manifest_path,
                          "licensePath": f"public/{folder}/LICENSE.md"}
        if folder == "atlas-hindlimb":
            registry[path]["sourceNames"] = {f"charles2016-hindlimb:{index}": name
                                             for index, name in enumerate(HINDLIMB_NAMES)}
    ema147_path = "public/atlas-ema147/atlas.json"
    raw = read(ema147_path, MAX_GLB_JSON_BYTES)
    if raw is not None:
        register_ema147(json.loads(raw), read, registry)
    neuron_path = "public/atlas-neuron/atlas.json"
    raw = read(neuron_path, MAX_GLB_JSON_BYTES)
    if raw is not None:
        register_neuromorpho(json.loads(raw), read, registry)
    for manifest_path in POLYLINE_SOURCES:
        raw = read(manifest_path, MAX_GLB_JSON_BYTES)
        if raw is not None:
            register_polyline(json.loads(raw), manifest_path, read, registry)
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
        nodes = [node for node in doc.get("nodes", []) if "mesh" in node]
        identifiers = [node.get("extras", {}).get("structureId") for node in nodes]
        if len(identifiers) != len(set(identifiers)) or set(identifiers) != set(binding["ids"]):
            raise ValueError("GLB source labels differ from the registered inventory")
        if "sourceNames" in binding:
            for node in nodes:
                extras = node.get("extras", {})
                identifier = extras.get("structureId")
                index = extras.get("sourceTessellationIndex")
                if (type(index) is not int or identifier != f"charles2016-hindlimb:{index}"
                        or extras.get("sourceName") != binding["sourceNames"].get(identifier)):
                    raise ValueError("GLB source names and tessellation identities differ from the registered inventory")
    return metadata


def ply_metadata(data: bytes) -> tuple[bytes, int, int]:
    """Accept only the bounded native, indexed triangle PLY representation."""
    marker = b"\nend_header\n"
    end = data.find(marker, 0, MAX_PLY_HEADER_BYTES)
    if end < 0:
        raise ValueError("Missing or unbounded PLY header")
    end += len(marker)
    metadata = data[:end]
    lines = metadata.decode("ascii").splitlines()
    if any(not line or any(ord(character) < 32 or ord(character) > 126 for character in line) for line in lines):
        raise ValueError("Invalid PLY header text")
    declarations = [line for line in lines if not line.startswith("comment ")]
    if len(declarations) != 13 or declarations[:2] != ["ply", "format binary_little_endian 1.0"]:
        raise ValueError("Unsupported PLY representation")
    vertex_match = re.fullmatch(r"element vertex ([1-9][0-9]*)", declarations[2])
    face_match = re.fullmatch(r"element face ([1-9][0-9]*)", declarations[10])
    if not vertex_match or not face_match or declarations[3:10] != [
            "property float x", "property float y", "property float z", "property float nx", "property float ny",
            "property float nz", "property uint source_region_index"] or declarations[11:] != [
                "property list uchar uint vertex_indices", "end_header"]:
        raise ValueError("Unsupported PLY properties")
    vertices, triangles = int(vertex_match.group(1)), int(face_match.group(1))
    if not 0 < vertices <= 10_000_000 or not 0 < triangles <= 5_000_000 or len(data) != end + vertices * 28 + triangles * 13:
        raise ValueError("PLY counts or byte length exceed their bounds")
    return metadata, vertices, triangles


def inspect_registered_ply(data: bytes, binding: dict) -> bytes:
    if len(data) != binding["bytes"] or hashlib.sha256(data).hexdigest() != binding["sha256"]:
        raise ValueError("Anatomical asset checksum mismatch")
    metadata, vertex_count, triangle_count = ply_metadata(data)
    if vertex_count != binding["vertices"] or triangle_count != binding["triangles"]:
        raise ValueError("PLY geometry inventory differs from its declaration")
    vertex_start = len(metadata)
    face_start = vertex_start + vertex_count * 28
    next_vertex = next_triangle = 0
    regions = binding["regions"]
    region_comments = [line for line in metadata.decode("ascii").splitlines() if line.startswith("comment region ")]
    if region_comments != [f"comment region {index} {region['id']} {region['sourceFile']}" for index, region in enumerate(regions)]:
        raise ValueError("PLY source identity comments differ from the registered inventory")
    if [line for line in metadata.decode("ascii").splitlines() if line.startswith("comment ")] != [
            "comment MouseBio_3D EMA147 native source coordinates; units unknown", *region_comments]:
        raise ValueError("PLY contains an unregistered metadata comment")
    for region_index, region in enumerate(regions):
        if region["vertexOffset"] != next_vertex or region["triangleOffset"] != next_triangle:
            raise ValueError("PLY regional ranges are not contiguous")
        vertices, triangles = region["vertices"], region["triangles"]
        lower, upper = [math.inf] * 3, [-math.inf] * 3
        for offset in range(next_vertex, next_vertex + vertices):
            values = struct.unpack_from("<6fI", data, vertex_start + offset * 28)
            if (values[6] != region_index or not all(math.isfinite(value) for value in values[:6])
                    or abs(math.sqrt(sum(value * value for value in values[3:6])) - 1) > 1e-5):
                raise ValueError("PLY vertex coordinates, normals or source region are invalid")
            for axis, value in enumerate(values[:3]):
                lower[axis], upper[axis] = min(lower[axis], value), max(upper[axis], value)
        if any(abs(value - region["boundsSourceUnits"][side][axis]) > max(1e-5, abs(value) * 1e-6)
               for side, bounds in enumerate((lower, upper)) for axis, value in enumerate(bounds)):
            raise ValueError("PLY source-coordinate bounds differ from the manifest")
        for offset in range(next_triangle, next_triangle + triangles):
            count, a, b, c = struct.unpack_from("<BIII", data, face_start + offset * 13)
            if count != 3 or any(index < next_vertex or index >= next_vertex + vertices for index in (a, b, c)):
                raise ValueError("PLY triangle indices cross a source region or exceed its vertices")
        next_vertex += vertices
        next_triangle += triangles
    if next_vertex != vertex_count or next_triangle != triangle_count:
        raise ValueError("PLY source ranges do not cover the complete asset")
    return metadata


def inspect_registered_asset(data: bytes, binding: dict) -> bytes:
    if binding.get("format", "glb") == "glb":
        return inspect_registered_glb(data, binding)
    if binding.get("format") == "ply-native-v1":
        return inspect_registered_ply(data, binding)
    if binding.get("format") == "swc-native-v1":
        return inspect_registered_source_trace(data, binding)
    if binding.get("format") == "polyline-native-v1":
        return inspect_registered_polyline(data, binding)
    raise ValueError("Unsupported registered anatomical asset format")


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


def private_input_path(path: str) -> bool:
    """Apply the same local-only path policy to snapshots and historical trees."""
    parts = PurePosixPath(path).parts
    name = PurePosixPath(path).name
    return bool(parts) and (parts[0] in {"research-data", ".aws"} or path.startswith("data/raw/")
                            or name.lower() == "agents.md"
                            or name.startswith(".env") and name != ".env.example")


def scan_text(text: str, path: str, scope: str) -> list[dict]:
    findings: list[dict] = []

    def add(kind: str, count: int, severity: str = "error") -> None:
        if count:
            findings.append({"path": safe_path(path), "scope": scope, "type": kind, "count": count, "severity": severity})

    # Every email candidate requires @. This exact precondition avoids costly
    # failed matches across large numeric JSON while inspecting the entire text.
    contacts = EMAIL.findall(text) if "@" in text else []
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
        findings.append({"path": "public", "scope": scope, "type": "invalid-anatomy-registry", "count": 1, "severity": "error"})

    def inspect(data: bytes, path: str, location: str, bindings: dict | None = None) -> None:
        nonlocal inspected, opaque, registered
        selected_registry = registry if bindings is None else bindings
        registered_text = is_registered_text_path(path, selected_registry.get(path))
        if path.lower().endswith((".glb", ".ply")) or registered_text:
            try:
                if path not in selected_registry:
                    raise ValueError("Unregistered anatomical asset")
                metadata = inspect_registered_asset(data, selected_registry[path])
                if not registered_text:
                    findings.extend(scan_text(metadata.decode("utf-8"), path, location))
                    inspected += 1
                registered += 1
            except (ValueError, TypeError, KeyError, AttributeError, UnicodeError):
                findings.append({"path": safe_path(path), "scope": location, "type": "unregistered-or-invalid-anatomy-asset", "count": 1, "severity": "error"})
            if not registered_text:
                return
            # Registered text receives the complete bounded text/privacy inspection
            # below, including when its source registration was rejected.
        if len(data) > (MAX_REGISTERED_GLB_BYTES if registered_text else MAX_FILE_BYTES):
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
        if private_input_path(path):
            findings.append({"path": safe_path(path), "scope": scope, "type": "private-input-path-tracked", "count": 1, "severity": "error"})
        if stage != "0":
            findings.append({"path": safe_path(path), "scope": scope, "type": "unmerged-index", "count": 1, "severity": "error"})
            continue
        if _mode not in {"100644", "100755"}:
            findings.append({"path": safe_path(path), "scope": scope, "type": "missing-or-symlink-input", "count": 1, "severity": "warning"})
            continue
        if scope == "staged":
            size = int(git(root, "cat-file", "-s", oid))
            if size > asset_scan_limit(path, registry):
                findings.append({"path": safe_path(path), "scope": scope, "type": "file-exceeds-scan-bound", "count": 1, "severity": "warning"})
                continue
            inspect(git(root, "cat-file", "blob", oid), path, scope)
        else:
            file = root / path
            if not file.is_file() or file.is_symlink():
                findings.append({"path": safe_path(path), "scope": scope, "type": "missing-or-symlink-input", "count": 1, "severity": "warning"})
                continue
            if file.stat().st_size > asset_scan_limit(path, registry):
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
        metadata_seen: set[str] = set()

        def read_git_metadata(kind: str, oid: str) -> bytes | None:
            # Object IDs identify findings without exposing tag names or messages.
            path = f".git/history/{'commits' if kind == 'commit' else 'tags'}/{oid}"
            if oid in metadata_seen:
                return None
            metadata_seen.add(oid)
            if len(metadata_seen) > MAX_HISTORY_BLOBS:
                return None
            if int(git(root, "cat-file", "-s", oid)) > MAX_FILE_BYTES:
                findings.append({"path": path, "scope": "git-metadata", "type": "file-exceeds-scan-bound", "count": 1, "severity": "warning"})
                return None
            data = git(root, "cat-file", kind, oid)
            matches, checked = inspect_content(data, path, "git-metadata")
            findings.extend(matches)
            if not checked:
                findings.append({"path": path, "scope": "git-metadata", "type": "opaque-git-metadata-not-reviewed", "count": 1, "severity": "warning"})
            return data

        for commit in commits:
            read_git_metadata("commit", commit)
        refs = git(root, "for-each-ref", "--format=%(objecttype) %(objectname)").decode().splitlines()
        pending_tags = [line.split(" ", 1)[1] for line in refs if line.startswith("tag ")]
        while pending_tags:
            oid = pending_tags.pop()
            data = read_git_metadata("tag", oid)
            if data is None:
                continue
            header = data.split(b"\n\n", 1)[0]
            tagger_emails = re.findall(rb"(?m)^tagger [^\r\n]*<([^<>\r\n]+)>[^\r\n]*$", header)
            non_noreply = sum(not email.strip().lower().endswith(b"@users.noreply.github.com") for email in tagger_emails)
            if non_noreply:
                findings.append({"path": f".git/history/tags/{oid}", "scope": "git-metadata", "type": "reachable-tag-non-noreply-email", "count": non_noreply, "severity": "error"})
            if re.search(rb"(?m)^type tag$", header):
                target = re.search(rb"(?m)^object ([0-9a-f]{40,64})$", header)
                if target:
                    pending_tags.append(target.group(1).decode("ascii"))
                else:
                    findings.append({"path": f".git/history/tags/{oid}", "scope": "git-metadata", "type": "unreadable-tag-target", "count": 1, "severity": "warning"})
        if len(metadata_seen) > MAX_HISTORY_BLOBS:
            findings.append({"path": ".git/history", "scope": "git-metadata", "type": "history-metadata-exceeds-scan-bound", "count": len(metadata_seen) - MAX_HISTORY_BLOBS, "severity": "warning"})
    historical_blobs = 0
    if history:
        seen: set[str] = set()
        for commit in commits:
            tree = git(root, "ls-tree", "-r", "-z", commit).decode().split("\0")
            history_snapshot = {}
            for entry in filter(None, tree):
                entry_metadata, path = entry.split("\t", 1)
                history_snapshot[path] = entry_metadata.split()
                historical_mode, historical_kind, _oid = history_snapshot[path]
                if historical_mode not in {"100644", "100755"} or historical_kind != "blob":
                    findings.append({"path": safe_path(path), "scope": "history", "type": "missing-or-symlink-input", "count": 1, "severity": "warning"})
                # A reused blob can occur at a forbidden path in another tree.
                if private_input_path(path):
                    findings.append({"path": safe_path(path), "scope": "history", "type": "private-input-path-tracked", "count": 1, "severity": "error"})

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
                if _mode not in {"100644", "100755"} or kind != "blob" or oid in seen:
                    continue
                seen.add(oid)
                if historical_blobs >= MAX_HISTORY_BLOBS:
                    continue
                historical_blobs += 1
                size = int(git(root, "cat-file", "-s", oid))
                if size > asset_scan_limit(path, history_registry):
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
