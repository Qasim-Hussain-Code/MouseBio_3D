"""Prepare pinned MouseMapper example polylines without downloading or executing source code."""
from __future__ import annotations
import argparse
import hashlib
import json
import math
from pathlib import Path
import re
import struct

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'data/raw/mousemapper-7fe04a9c-patch0.vtk'
OUTPUT = ROOT / 'public/atlas-nerve'
ASSET = 'mousemapper-patch0-lines.json'
SOURCE_BYTES = 60899
SOURCE_SHA256 = 'b35b59a1056d04e5992a0e463751ceb89a733d80837e66d951be810899ec3c27'
ASSET_BYTES = 55658
ASSET_SHA256 = 'e59fea98d4f41adab6149eee38e28ea6c3737dfa37013d5a2039e89c4c3ef0ce'
COMMIT = '7fe04a9ccf37664d76fe548ae226147c0023ceb7'
SOURCE_PATH = 'graph_module/example_data/4x_graph/patch_volume_4X_0_pred/patch_volume_4X_0_pred.vtk'
SOURCE_URL = 'https://github.com/erturklab/mouseMapper/blob/' + COMMIT + '/' + SOURCE_PATH
DOWNLOAD_URL = 'https://media.githubusercontent.com/media/erturklab/mouseMapper/' + COMMIT + '/' + SOURCE_PATH
LICENSE_URL = 'https://www.apache.org/licenses/LICENSE-2.0'
ATLAS_ID = 'mousemapper-nerve-patch0-v1'
FRAME_ID = 'mousemapper-nerve-patch0-native-unknown-units-v1'
SOURCE_ID = 'mousemapper-7fe04a9c-graph-patch0'
STRUCTURE_ID = 'mousemapper-nerve:patch0'
MAX_BYTES = 2 * 1024 * 1024
MAX_POINTS = 100000
MAX_PATHS = 100000
MAX_REFERENCES = 300000
INTEGER = re.compile(r'(?:0|[1-9][0-9]*)\Z', re.ASCII)
DECIMAL = re.compile(r'[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?\Z', re.ASCII)
CITATION = 'Kaltenecker D, Horvath I, Al-Maskari R, et al. A deep-learning framework reveals whole-body perturbations at cell level. Nature. 2026;655:1016-1026. doi:10.1038/s41586-026-10535-2.'
OMITTED_ATTRIBUTES = [
    {'association': 'POINT_DATA', 'declaredRecords': 1940, 'field': 'radius', 'components': 1, 'tuples': 2290},
    {'association': 'CELL_DATA', 'declaredRecords': 84, 'field': 'radius', 'components': 1, 'tuples': 145},
]

def require(value, message):
    if not value:
        raise ValueError(message)

def float32(value):
    try:
        result = struct.unpack('<f', struct.pack('<f', value))[0]
    except (OverflowError, struct.error):
        raise ValueError('A source coordinate exceeds finite Float32 storage') from None
    require(math.isfinite(result), 'A source coordinate exceeds finite Float32 storage')
    return result

def integer(token):
    require(isinstance(token, str) and INTEGER.fullmatch(token) is not None, 'A source integer field is invalid')
    return int(token)

def decimal(token):
    require(isinstance(token, str) and DECIMAL.fullmatch(token) is not None, 'A source numeric field is invalid')
    value = float(token)
    require(math.isfinite(value), 'A source numeric field is nonfinite')
    return value

def finite_number(value):
    if type(value) not in (int, float):
        return False
    try:
        return math.isfinite(value)
    except OverflowError:
        return False

def parse_vtk_geometry(raw: bytes):
    """Parse bounded ASCII POLYDATA and record attributes without interpreting radii."""
    require(isinstance(raw, bytes) and 0 < len(raw) <= MAX_BYTES, 'VTK input byte bound failed')
    try:
        text = raw.decode('ascii')
    except UnicodeDecodeError:
        raise ValueError('VTK input must be ASCII') from None
    lines = text.splitlines()
    require(len(lines) >= 5 and lines[0].startswith('# vtk DataFile Version ') and lines[2] == 'ASCII'
            and lines[3] == 'DATASET POLYDATA', 'Unsupported VTK header or representation')
    tokens = '\n'.join(lines[4:]).split()
    require(len(tokens) <= 1000000 and len(tokens) >= 3 and tokens[0] == 'POINTS' and tokens[2] == 'float',
            'Unsupported VTK coordinate declaration')
    count = integer(tokens[1])
    require(1 <= count <= MAX_POINTS and len(tokens) >= 3 + count * 3 + 3, 'VTK point count or payload is invalid')
    offset = 3
    points = [[decimal(v) for v in tokens[offset + row * 3:offset + row * 3 + 3]] for row in range(count)]
    offset += count * 3
    require(tokens[offset] == 'LINES', 'VTK input must provide explicit polylines')
    npaths, total = integer(tokens[offset + 1]), integer(tokens[offset + 2])
    require(1 <= npaths <= MAX_PATHS and npaths * 3 <= total <= MAX_REFERENCES + npaths,
            'VTK polyline count or payload bound failed')
    offset += 3
    start = offset
    paths = []
    for _ in range(npaths):
        require(offset < len(tokens), 'VTK polyline payload is truncated')
        length = integer(tokens[offset]); offset += 1
        require(2 <= length <= MAX_REFERENCES and offset + length <= len(tokens), 'VTK polyline length is invalid')
        path = [integer(v) for v in tokens[offset:offset + length]]
        require(all(v < count for v in path), 'VTK polyline references an absent source point')
        paths.append(path); offset += length
    require(offset - start == total and sum(map(len, paths)) <= MAX_REFERENCES, 'VTK polyline payload count differs')
    attributes = []
    while offset < len(tokens):
        require(offset + 5 < len(tokens) and tokens[offset] in {'POINT_DATA', 'CELL_DATA'}, 'Unsupported VTK attribute declaration')
        association = tokens[offset]; declared = integer(tokens[offset + 1]); offset += 2
        require(declared == (count if association == 'POINT_DATA' else npaths), 'VTK attribute association count differs')
        require(tokens[offset] == 'FIELD', 'Unsupported VTK attribute representation')
        nfields = integer(tokens[offset + 2]); offset += 3
        require(1 <= nfields <= 16, 'VTK attribute field bound failed')
        for _ in range(nfields):
            require(offset + 4 <= len(tokens), 'VTK attribute header is truncated')
            name = tokens[offset]; components = integer(tokens[offset + 1]); tuples = integer(tokens[offset + 2]); dtype = tokens[offset + 3]
            offset += 4
            require(name == 'radius' and dtype == 'float' and 1 <= components <= 4 and 1 <= tuples <= MAX_REFERENCES
                    and offset + components * tuples <= len(tokens), 'Unsupported or invalid VTK attribute field')
            values = [decimal(v) for v in tokens[offset:offset + components * tuples]]
            require(all(value >= 0 for value in values), 'A source radius field is negative')
            offset += components * tuples
            attributes.append({'association': association, 'declaredRecords': declared, 'field': name,
                               'components': components, 'tuples': tuples})
    geometry = {'schemaVersion': 'mousebio.polyline.v1', 'points': points, 'paths': paths}
    # Validate supported drawing arithmetic without assigning physical units.
    validate_polyline_body(encode_geometry(geometry))
    return geometry, attributes

def encode_geometry(geometry):
    return (json.dumps(geometry, separators=(',', ':'), allow_nan=False) + '\n').encode('ascii')

def unique_object(pairs):
    result = {}
    for key, value in pairs:
        require(key not in result, 'Polyline JSON contains duplicate fields')
        result[key] = value
    return result

def validate_polyline_body(body: bytes) -> dict:
    require(isinstance(body, bytes) and 0 < len(body) <= MAX_BYTES, 'Polyline byte bound failed')
    try:
        data = json.loads(body.decode('ascii'), object_pairs_hook=unique_object,
                          parse_constant=lambda _: (_ for _ in ()).throw(ValueError('Polyline numeric fields must be finite')))
    except (UnicodeError, json.JSONDecodeError, RecursionError):
        raise ValueError('Polyline input must contain ASCII JSON') from None
    require(type(data) is dict and set(data) == {'schemaVersion', 'points', 'paths'}
            and data['schemaVersion'] == 'mousebio.polyline.v1', 'Unsupported polyline schema or fields')
    points, paths = data['points'], data['paths']
    require(type(points) is list and 1 <= len(points) <= MAX_POINTS
            and type(paths) is list and 1 <= len(paths) <= MAX_PATHS, 'Polyline point or path bound failed')
    source_bounds = [[math.inf] * 3, [-math.inf] * 3]
    display_points = []
    maximum_error = 0.0
    for point in points:
        require(type(point) is list and len(point) == 3 and all(finite_number(v) for v in point),
                'Polyline coordinates must contain three finite source numbers')
        stored = [float32(v) for v in point]; display_points.append(stored)
        for axis, value in enumerate(point):
            source_bounds[0][axis] = min(source_bounds[0][axis], value)
            source_bounds[1][axis] = max(source_bounds[1][axis], value)
            maximum_error = max(maximum_error, abs(stored[axis] - value))
    require(sum(len(path) for path in paths if type(path) is list) <= MAX_REFERENCES, 'Polyline reference bound failed')
    parents = list(range(len(points)))
    def find(value):
        while parents[value] != value:
            parents[value] = parents[parents[value]]; value = parents[value]
        return value
    referenced = set(); segments = zeros = collapsed = 0
    display_bounds = [[math.inf] * 3, [-math.inf] * 3]
    for path in paths:
        require(type(path) is list and 2 <= len(path) <= MAX_REFERENCES
                and all(type(v) is int and 0 <= v < len(points) for v in path), 'Polyline source point indices are invalid')
        referenced.update(path)
        for first, second in zip(path, path[1:]):
            segments += 1
            if points[first] == points[second]: zeros += 1
            elif display_points[first] == display_points[second]: collapsed += 1
            a, b = find(first), find(second)
            if a != b: parents[b] = a
        for vertex in path:
            for axis, value in enumerate(display_points[vertex]):
                display_bounds[0][axis] = min(display_bounds[0][axis], value)
                display_bounds[1][axis] = max(display_bounds[1][axis], value)
    diagonal = math.hypot(*(display_bounds[1][k] - display_bounds[0][k] for k in range(3)))
    require(math.isfinite(diagonal) and diagonal > 0, 'Polyline display has no finite extent')
    radius = diagonal / 2
    require(all(float32(v) > 0 for v in (radius / 2000, radius * 100, 1 / radius)), 'Polyline display camera range is unsupported')
    return {'assetBytes': len(body), 'assetSha256': hashlib.sha256(body).hexdigest(), 'points': len(points),
            'polylines': len(paths), 'segments': segments, 'components': len({find(i) for i in range(len(points))}),
            'isolatedPoints': len(points) - len(referenced), 'zeroLengthSegments': zeros,
            'float32CollapsedSegments': collapsed, 'boundsSourceUnits': source_bounds,
            'displayBoundsSourceUnits': display_bounds, 'maxFloat32PositionError': maximum_error}

def prepare_polyline_body(raw: bytes) -> bytes:
    require(len(raw) == SOURCE_BYTES and hashlib.sha256(raw).hexdigest() == SOURCE_SHA256,
            'Reviewed original VTK byte count or checksum differs')
    geometry, attributes = parse_vtk_geometry(raw)
    require(attributes == OMITTED_ATTRIBUTES, 'Original radius field diagnostics differ')
    body = encode_geometry(geometry)
    require(len(body) == ASSET_BYTES and hashlib.sha256(body).hexdigest() == ASSET_SHA256,
            'Reviewed polyline derivative byte count or checksum differs')
    return body

def make_manifest(body: bytes) -> dict:
    statistics = validate_polyline_body(body)
    require(statistics['assetBytes'] == ASSET_BYTES and statistics['assetSha256'] == ASSET_SHA256,
            'Unreviewed polyline bytes cannot acquire source metadata')
    limitations = [
        'This is a predicted regional nerve-graph example, not complete adult peripheral nerve coverage.',
        'The individual specimen, sex, age, diet, laterality and exact anatomical subregion remain unresolved.',
        'Source physical units, anatomical orientation and calibration remain unverified; no metric conversion or accepted registration is supplied.',
        'Source polyline cells and numerical components do not establish nerve, axon or cell counts, synapses or functional connectivity.',
        'Source point and cell radius fields have inconsistent tuple counts and are omitted without invented associations; no radius sets line thickness or creates a surface.',
        'Original source point order, polyline order and every consecutive link are retained without merging, repair, smoothing or missing-branch completion.',
        'Initial Float32 diagnostics exclude later recentering and GPU arithmetic and do not estimate physical accuracy.',
    ]
    return {'id': ATLAS_ID, 'title': 'MouseMapper predicted regional nerve graph, patch 0',
        'assetFormat': 'polyline-native-v1', 'assetUrl': '/atlas-nerve/' + ASSET,
        'coordinateFrame': {'id': FRAME_ID, 'sourceUnits': 'unknown', 'assetUnits': 'unknown', 'sourceToAssetScale': 1,
            'unitsVerified': False, 'anatomicalOrientationVerified': False, 'physicalCalibrationVerified': False,
            'registration': None, 'registrationToDigimouse': None,
            'origin': 'Source VTK origin; anatomical origin unverified',
            'axes': {axis: f'native graph {axis}; anatomical direction unverified' for axis in ('x', 'y', 'z')}},
        'source': {'id': SOURCE_ID, 'displayName': 'MouseMapper regional nerve example',
            'title': 'MouseMapper graph_module example_data: patch_volume_4X_0_pred',
            'citationLabel': 'Kaltenecker et al., 2026; MouseMapper', 'citation': CITATION,
            'publicationYear': 2026, 'doi': '10.1038/s41586-026-10535-2', 'url': SOURCE_URL, 'downloadUrl': DOWNLOAD_URL,
            'license': 'Apache-2.0', 'licenseUrl': LICENSE_URL,
            'licenseSourceUrl': 'https://github.com/erturklab/mouseMapper/blob/' + COMMIT + '/LICENSE',
            'repositoryCommit': COMMIT, 'sourceBytes': SOURCE_BYTES, 'sourceSha256': SOURCE_SHA256,
            'attribution': CITATION + ' Example graph distributed by the MouseMapper authors in erturklab/mouseMapper under Apache License 2.0. Geometry-only adaptation by Qasim Hussain for MouseBio_3D.',
            'modifications': ['Converted original VTK points and ordered polyline indices to compact numeric JSON, preserving parsed numeric coordinates and source array order.',
                'Omitted inconsistent radius attributes and VTK serialization headers; retained their record-count discrepancies in metadata.',
                'No coordinate scaling, registration, point merging, repair, smoothing, radius-based surface generation or new link was applied.']},
        'specimen': {'sex': 'unknown', 'scope': 'regional predicted nerve graph; individual specimen and anatomical subregion unresolved',
            'description': 'Mouse nerve context is declared by the repository and associated publication. Individual specimen characteristics and exact patch location are not established by the file.',
            'sourceReference': SOURCE_URL},
        'sourceDeclarations': {'species': 'mouse', 'representation': 'predicted regional nerve graph',
            'anatomicalSubregion': None, 'individualSpecimen': None, 'diet': None, 'laterality': None,
            'interpretation': 'Project context and source filenames are declarations, not independent anatomical review or a file-specific specimen assignment.'},
        'structures': [{'id': STRUCTURE_ID, 'name': 'Predicted regional nerve graph, patch 0',
            'sourceLabel': 'patch_volume_4X_0_pred', 'meshNode': 'region_mousemapper_patch0', 'systems': ['nervous'],
            'description': 'One selectable source graph record preserving its complete point and polyline inventory.',
            'defaultOpacity': 1, 'color': '#937047', 'limitations': limitations}],
        'statistics': statistics,
        'processing': {'sourceToAssetScale': 1, 'coordinateConversion': False, 'pointRemoval': False, 'pathRepair': False,
            'smoothing': False, 'registration': False, 'radiusUsed': False, 'positionStorage': 'float32 for display only',
            'sourcePointOrderPreserved': True, 'sourcePathOrderPreserved': True, 'sourceConnectivityPreserved': True},
        'sourceAttributesOmitted': [dict(row) for row in OMITTED_ATTRIBUTES], 'limitations': limitations}

def convert(source=SOURCE, output=OUTPUT, verify_existing=False):
    source, output = Path(source), Path(output)
    require(source.is_file() and not source.is_symlink() and source.stat().st_size == SOURCE_BYTES,
            'Reviewed original nerve graph is unavailable or differs')
    body = prepare_polyline_body(source.read_bytes())
    manifest = make_manifest(body)
    encoded = (json.dumps(manifest, indent=2) + '\n').encode('utf-8')
    require(not output.is_symlink() and all(not (output/name).is_symlink() for name in (ASSET, 'atlas.json')),
            'Output directory or files cannot be symbolic links')
    if verify_existing:
        require((output/ASSET).read_bytes() == body and (output/'atlas.json').read_bytes() == encoded,
                'Regenerated nerve geometry or manifest differs')
    else:
        output.mkdir(parents=True, exist_ok=True)
        (output/ASSET).write_bytes(body); (output/'atlas.json').write_bytes(encoded)
    return manifest

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=SOURCE)
    parser.add_argument('--output', type=Path, default=OUTPUT)
    parser.add_argument('--verify-existing', action='store_true')
    args = parser.parse_args(); manifest = convert(args.source, args.output, args.verify_existing)
    print(json.dumps({'assetBytes': ASSET_BYTES, 'assetSha256': ASSET_SHA256, 'points': manifest['statistics']['points'],
                      'polylines': manifest['statistics']['polylines'], 'segments': manifest['statistics']['segments'],
                      'verifyExisting': args.verify_existing}))
