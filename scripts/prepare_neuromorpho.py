"""Prepare the reviewed NMO_130632 numeric SWC adaptation without downloading data.

Numeric token spelling, row order, sample IDs and parent IDs are retained. Source
comment headers remain in ignored storage. No physical units are assigned.
"""
from __future__ import annotations

import argparse
from collections import Counter
import hashlib
import json
import math
from pathlib import Path
import re
import struct

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'data/raw/neuromorpho-NMO_130632-standardized.swc'
OUTPUT = ROOT / 'public/atlas-neuron'
ASSET = 'nmo130632-standardized.swc.txt'
SOURCE_BYTES = 448329
SOURCE_SHA256 = 'a8340628eb02051416ad0607e72b60cba9241eb34c9be10b0c7df01771b5cfce'
ASSET_BYTES = 424092
ASSET_SHA256 = '0dd36d6518aacd6338d16c76318d6ed0fd24419a0551417fdf639a8323c6ede5'
ATLAS_ID = 'neuromorpho-nmo130632-standardized-v1'
FRAME_ID = 'neuromorpho-nmo130632-standardized-unknown-units-v1'
SOURCE_ID = 'neuromorpho-nmo130632-cng'
STRUCTURE_ID = 'neuromorpho:130632'
METADATA_URL = 'https://neuromorpho.org/api/neuron/id/130632'
DOWNLOAD_URL = 'https://neuromorpho.org/dableFiles/tolias/CNG%20version/2016-01-06-slice-D-cell-7-rotated.CNG.swc'
LICENSE_URL = 'https://creativecommons.org/licenses/by/4.0/'
MAX_BYTES, MAX_SAMPLES, MAX_LINE_BYTES = 2 * 1024 * 1024, 100000, 4096
MAX_SAFE_INTEGER = 9007199254740991
INTEGER = re.compile(r'[+-]?\d+\Z', re.ASCII)
DECIMAL = re.compile(r'[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?\Z', re.ASCII)
CITATIONS = [
    'Scala F, Kobak D, Shan S, et al. Layer 4 of mouse neocortex differs in cell types and circuit organization between sensory areas. Nature Communications. 2019;10:4174. doi:10.1038/s41467-019-12058-z.',
    'NeuroMorpho.Org (RRID:SCR_002145).',
    'Tecuatl C, Ljungquist B, Ascoli GA. Accelerating the continuous community sharing of digital neuromorphology data. FASEB Bioadv. 2024;6(7):207-221. doi:10.1096/fba.2024-00048.',
]


def require(condition, message):
    if not condition:
        raise ValueError(message)


def float32(value):
    try:
        result = struct.unpack('<f', struct.pack('<f', value))[0]
    except (OverflowError, struct.error):
        raise ValueError('A coordinate exceeds finite Float32 storage') from None
    require(math.isfinite(result), 'A coordinate exceeds finite Float32 storage')
    return result


def validate_numeric_trace(body: bytes) -> dict:
    """Return graph diagnostics without granting source identity, units or a license.

    Fixed error messages exclude source text, filenames and private matched values.
    """
    require(isinstance(body, bytes) and 0 < len(body) <= MAX_BYTES, 'Numeric trace byte bound failed')
    require(body.endswith(b'\n') and b'\r' not in body, 'Numeric trace requires final LF and LF line endings')
    try:
        lines = body.decode('ascii').split('\n')[:-1]
    except UnicodeDecodeError:
        raise ValueError('Numeric trace requires ASCII numeric rows') from None
    require(0 < len(lines) <= MAX_SAMPLES, 'Numeric trace sample bound failed')
    nodes, by_id, types = [], {}, Counter()
    bounds = [[math.inf] * 3, [-math.inf] * 3]
    maximum_error = 0.0
    for line in lines:
        require(0 < len(line) <= MAX_LINE_BYTES, 'Numeric trace line bound failed')
        fields = line.split(' ')
        require(len(fields) == 7 and all(fields), 'Numeric trace requires seven single-space-separated fields')
        require(all(INTEGER.fullmatch(fields[i]) for i in (0, 1, 6))
                and all(DECIMAL.fullmatch(fields[i]) for i in (2, 3, 4, 5)), 'Numeric trace field syntax failed')
        values = [int(fields[i]) if i in (0, 1, 6) else float(fields[i]) for i in range(7)]
        identifier, kind, x, y, z, radius, parent = values
        require(0 < identifier <= MAX_SAFE_INTEGER and 0 <= kind <= MAX_SAFE_INTEGER
                and (parent == -1 or 0 < parent <= MAX_SAFE_INTEGER), 'Numeric trace identifier range failed')
        require(identifier not in by_id and parent != identifier, 'Numeric trace duplicate or self-parent identity')
        require(all(math.isfinite(v) for v in (x, y, z, radius)) and radius >= 0, 'Numeric trace finite coordinate or radius failed')
        for axis, value in enumerate((x, y, z)):
            stored = float32(value)
            maximum_error = max(maximum_error, abs(stored - value))
            bounds[0][axis] = min(bounds[0][axis], value)
            bounds[1][axis] = max(bounds[1][axis], value)
        by_id[identifier] = len(nodes)
        nodes.append(values)
        types[str(kind)] += 1
    roots = links = zero_edges = collapsed_edges = drawable = 0
    referenced, parents = set(), []
    display_bounds = [[math.inf] * 3, [-math.inf] * 3]
    for index, node in enumerate(nodes):
        parent = node[6]
        if parent == -1:
            roots += 1
            parents.append(-1)
            continue
        require(parent in by_id, 'Numeric trace parent identity is absent')
        parent_index = by_id[parent]
        parents.append(parent_index)
        links += 1
        referenced.update((index, parent_index))
        position, ancestor = node[2:5], nodes[parent_index][2:5]
        rendered, rendered_ancestor = list(map(float32, position)), list(map(float32, ancestor))
        if position == ancestor:
            zero_edges += 1
        elif rendered == rendered_ancestor:
            collapsed_edges += 1
        if rendered != rendered_ancestor:
            drawable += 1
        for point in (rendered, rendered_ancestor):
            for axis in range(3):
                display_bounds[0][axis] = min(display_bounds[0][axis], point[axis])
                display_bounds[1][axis] = max(display_bounds[1][axis], point[axis])
    states = bytearray(len(nodes))
    for index in range(len(nodes)):
        if states[index]:
            continue
        current = index
        while current >= 0 and states[current] == 0:
            states[current] = 1
            current = parents[current]
        require(current < 0 or states[current] != 1, 'Numeric trace parent graph contains a cycle')
        current = index
        while current >= 0 and states[current] == 1:
            states[current] = 2
            current = parents[current]
    require(links > 0 and drawable > 0 and roots > 0, 'Numeric trace has no supported parent-linked display extent')
    radius = math.hypot(*(display_bounds[1][axis] - display_bounds[0][axis] for axis in range(3))) / 2
    near, far, offset = (float32(radius * scale) for scale in (1 / 2000, 100, 3.3))
    require(math.isfinite(radius) and near > 0 and far > near and offset > 0, 'Numeric trace camera range failed')
    return {'assetBytes': len(body), 'assetSha256': hashlib.sha256(body).hexdigest(),
            'samples': len(nodes), 'parentLinks': links, 'roots': roots, 'components': roots,
            'isolatedSamples': len(nodes) - len(referenced), 'zeroLengthEdges': zero_edges,
            'float32CollapsedEdges': collapsed_edges, 'typeCounts': dict(sorted(types.items())),
            'boundsSourceUnits': bounds, 'displayBoundsSourceUnits': display_bounds,
            'maxFloat32PositionError': maximum_error}


def prepare_numeric_body(raw: bytes) -> bytes:
    require(len(raw) == SOURCE_BYTES and hashlib.sha256(raw).hexdigest() == SOURCE_SHA256,
            'Reviewed original source byte count or checksum differs')
    try:
        rows = [line.split() for line in raw.decode('utf-8').splitlines()
                if line.strip() and not line.lstrip().startswith('#')]
        body = ('\n'.join(' '.join(row) for row in rows) + '\n').encode('ascii')
    except (UnicodeDecodeError, UnicodeEncodeError):
        raise ValueError('Reviewed source encoding differs') from None
    validate_numeric_trace(body)
    require(len(body) == ASSET_BYTES and hashlib.sha256(body).hexdigest() == ASSET_SHA256,
            'Reviewed numeric adaptation byte count or checksum differs')
    return body


def make_manifest(body: bytes) -> dict:
    statistics = validate_numeric_trace(body)
    require(statistics['assetBytes'] == ASSET_BYTES and statistics['assetSha256'] == ASSET_SHA256,
            'Unreviewed numeric adaptation cannot acquire source metadata')
    limitations = [
        'This is one source reconstruction record, not whole-brain cellular coverage or a measured cell surface.',
        'Source physical units, anatomical axes and independent calibration remain unverified; no physical unit conversion is applied.',
        'No original-to-standardized transform or registration to another application reference is verified.',
        'Source radii and type codes remain numeric metadata; line width is a display setting, not a calibrated diameter.',
        'Parent links and numerical graph components do not establish synapses, biological connectivity, cell counts or physiological validation.',
        'Source sex Male/Female and age range 50 to 330 days do not establish individual sex or exact age. Strain and mass remain unknown.',
        'The source reports 15 percent shrinkage without correction. No correction is applied.',
        'Initial Float32 diagnostics exclude later display recentering and GPU arithmetic and do not estimate physical accuracy.',
    ]
    return {
        'id': ATLAS_ID, 'title': 'Mouse V1 neuronal tracing NMO_130632',
        'assetFormat': 'swc-native-v1', 'assetUrl': f'/atlas-neuron/{ASSET}',
        'coordinateFrame': {'id': FRAME_ID, 'sourceUnits': 'unknown', 'assetUnits': 'unknown',
            'sourceToAssetScale': 1, 'unitsVerified': False, 'anatomicalOrientationVerified': False,
            'physicalCalibrationVerified': False, 'registration': None, 'registrationToDigimouse': None,
            'origin': 'NeuroMorpho.Org standardized-file origin; anatomical origin unverified',
            'axes': {axis: f'standardized source {axis}; anatomical direction unverified' for axis in ('x', 'y', 'z')}},
        'source': {'id': SOURCE_ID, 'displayName': 'NeuroMorpho.Org NMO_130632',
            'title': '2016-01-06-slice-D-cell-7-rotated', 'citationLabel': 'Scala et al., 2019; NeuroMorpho.Org',
            'citation': ' '.join(CITATIONS), 'referenceCitations': CITATIONS,
            'publicationYear': 2019, 'doi': '10.1038/s41467-019-12058-z',
            'url': METADATA_URL, 'downloadUrl': DOWNLOAD_URL,
            'license': 'CC-BY-4.0', 'licenseUrl': LICENSE_URL,
            'termsUrl': 'https://neuromorpho.org/useterm.jsp',
            'sourceBytes': SOURCE_BYTES, 'sourceSha256': SOURCE_SHA256,
            'metadataSha256': 'e33e82af3ee5abf870f39d168cb151b6b87823c49eb368e1e7bdb596e9b2c7f9',
            'originalDatasetDoi': '10.5281/zenodo.3336165',
            'originalDatasetUrl': 'https://zenodo.org/records/3336165',
            'attribution': ' '.join(CITATIONS) + ' Numeric-only SWC adaptation by Qasim Hussain for MouseBio_3D, CC BY 4.0.',
            'modifications': ['Removed all original comment headers and blank lines from the distributable adaptation.',
                'Retained numeric token spelling, original row order, sample IDs and parent IDs; normalized field separators and LF line endings.',
                'Retained original numeric coordinates, radii and type codes without repair, unit conversion or shrinkage correction.']},
        'specimen': {'sex': 'unknown', 'scope': 'independent source-declared adult mouse neuronal reconstruction',
            'description': 'Source metadata declare adult mouse primary visual cortex layer 4. Individual sex, exact age, strain and mass are unknown.',
            'sourceReference': METADATA_URL},
        'sourceDeclarations': {'species': 'mouse', 'ageClassification': 'adult',
            'brainRegion': ['neocortex', 'occipital', 'primary visual', 'layer 4'],
            'cellType': ['interneuron', 'basket', 'Large', 'Fast-spiking', 'Parvalbumin (PV)-positive'],
            'sexText': 'Male/Female', 'minimumAgeDays': 50, 'maximumAgeDays': 330,
            'protocol': 'in vitro', 'stain': 'biocytin', 'shrinkageReportedPercent': 15,
            'shrinkageCorrected': False, 'interpretation': 'Source declarations are not independently verified. Range and category fields do not identify an individual specimen.'},
        'structures': [{'id': STRUCTURE_ID, 'name': 'NMO_130632 neuronal trace',
            'sourceLabel': 'NMO_130632', 'meshNode': 'region_NMO_130632', 'systems': ['nervous'], 'scale': 'cellular',
            'description': 'One independently selectable source sample and parent-link reconstruction record from NeuroMorpho.Org.',
            'defaultOpacity': 1, 'color': '#8c718c', 'limitations': limitations}],
        'statistics': statistics,
        'processing': {'sourceToAssetScale': 1, 'coordinateConversion': False, 'radiusConversion': False,
            'parentRepair': False, 'sampleRemoval': False, 'registration': False,
            'shrinkageCorrection': False, 'positionStorage': 'float32 for display only',
            'sourceNumericTokenSpellingPreserved': True, 'sourceRowOrderPreserved': True,
            'originalCommentHeadersDistributed': False},
        'limitations': limitations,
    }


def convert(source=SOURCE, output=OUTPUT, verify_existing=False):
    source, output = Path(source), Path(output)
    require(source.is_file() and not source.is_symlink() and source.stat().st_size == SOURCE_BYTES,
            'Reviewed original source file is unavailable or differs')
    body = prepare_numeric_body(source.read_bytes())
    manifest = make_manifest(body)
    encoded = (json.dumps(manifest, indent=2) + '\n').encode('utf-8')
    require(not output.is_symlink(), 'Output directory cannot be a symbolic link')
    for filename in (ASSET, 'atlas.json'):
        require(not (output / filename).is_symlink(), 'Output file cannot be a symbolic link')
    if verify_existing:
        require((output / ASSET).read_bytes() == body and (output / 'atlas.json').read_bytes() == encoded,
                'Regenerated numeric adaptation or manifest differs')
    else:
        output.mkdir(parents=True, exist_ok=True)
        (output / ASSET).write_bytes(body)
        (output / 'atlas.json').write_bytes(encoded)
    print(json.dumps({'assetBytes': len(body), 'assetSha256': ASSET_SHA256,
                      'samples': manifest['statistics']['samples'], 'parentLinks': manifest['statistics']['parentLinks'],
                      'verifyExisting': verify_existing}))
    return manifest


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=SOURCE)
    parser.add_argument('--output', type=Path, default=OUTPUT)
    parser.add_argument('--verify-existing', action='store_true')
    args = parser.parse_args()
    convert(args.source, args.output, args.verify_existing)
