"""Prepare pinned MVN1 sampled paths with a bounded data-only pickle interpreter.

No pickle loader, NumPy import or serialized callable is executed.
"""
from __future__ import annotations
from dataclasses import dataclass
import hashlib
import json
import math
from pathlib import Path, PurePosixPath
import pickletools
import struct
import tarfile

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'data/raw/zenodo-5115640-baseline.tar.bz2'
SOURCE_BYTES = 23200621
SOURCE_SHA256 = '40d8a729e8bc977e4121a633da162d1e49f2e71e343454a04e18cc541965c627'
SOURCE_MD5 = 'a3e96da42b5c08ff724a2e922f5b01f9'
MEMBERS = {
    'vertices': ('SimulationResults_Baseline/MVN1/verticesDict_baseline.pkl', 1162408,
                 'e4bbd7467ec7febc34ac0a18c3d58d0e9e57c0a2e341498b8b74b589cf0a837d'),
    'edges': ('SimulationResults_Baseline/MVN1/edgesDict_baseline.pkl', 38640900,
              'f931bf3c4215fe9d95c7edbacd7a179371e578bdc120776f4d0b1da9c6fbb11b'),
}
OUTPUT = ROOT / 'public/atlas-vascular'
ASSET = 'schmid2021-mvn1-lines.json'
ATLAS_ID = 'schmid2021-mvn1-v1'
FRAME_ID = 'schmid2021-mvn1-source-micrometres-v1'
STRUCTURE_ID = 'schmid2021-mvn1:network'
MAX_INPUT_BYTES = 40 * 1024 * 1024
MAX_OPERATIONS = 16000000
MAX_STACK = 250000
MAX_MEMO = 1000000
MAX_CONTAINER_ITEMS = 2000000
MAX_ARRAY_ITEMS = 1000000
MAX_ARRAY_DEPTH = 4
MAX_DEPTH = 32
MAX_SAFE_INTEGER = 9007199254740991
MARK = object()
GLOBALS = frozenset({('numpy', 'dtype'), ('numpy', 'ndarray'),
                     ('numpy.core.multiarray', 'scalar'), ('numpy.core.multiarray', '_reconstruct')})
FORMATS = {'f8': 'd', 'f4': 'f', 'i8': 'q', 'i4': 'i', 'u8': 'Q', 'u4': 'I', 'b1': '?'}

def require(value, message):
    if not value: raise ValueError(message)

@dataclass(slots=True)
class DType:
    code: str
    order: str = ''
    built: bool = False

@dataclass(slots=True)
class NumericArray:
    values: tuple | None = None

def source_bytes(value):
    require(type(value) in (str, bytes), 'Numeric storage must be a byte string')
    try: return value.encode('latin1') if isinstance(value, str) else value
    except UnicodeEncodeError: raise ValueError('Numeric storage cannot be decoded as source bytes') from None

def numeric_values(dtype, raw, count):
    require(type(dtype) is DType and dtype.built and dtype.code in FORMATS, 'Unsupported numeric source dtype')
    require(type(count) is int and 0 <= count <= MAX_ARRAY_ITEMS, 'Numeric array size bound failed')
    body = source_bytes(raw)
    code = dtype.order + FORMATS[dtype.code]
    require(len(body) == struct.calcsize(code) * count, 'Numeric array byte count differs from its shape')
    values = tuple(value[0] for value in struct.iter_unpack(code, body))
    require(all(type(value) in (bool, int, float) and (type(value) is not float or math.isfinite(value)) for value in values), 'Nonfinite numeric source storage')
    return values

def reduce_data(symbol, args):
    require(type(symbol) is tuple and symbol in GLOBALS and type(args) is tuple, 'Only fixed symbolic numeric constructors are supported')
    if symbol == ('numpy', 'dtype'):
        require(len(args) == 3 and type(args[0]) is str and args[0] in FORMATS and type(args[1]) in (int, bool) and args[1] == 0 and type(args[2]) in (int, bool) and args[2] == 1, 'Unsupported dtype constructor state')
        return DType(args[0])
    if symbol == ('numpy.core.multiarray', 'scalar'):
        require(len(args) == 2, 'Unsupported numeric scalar constructor state')
        return numeric_values(args[0], args[1], 1)[0]
    if symbol == ('numpy.core.multiarray', '_reconstruct'):
        require(len(args) == 3 and args[0] == ('numpy', 'ndarray') and args[1] == (0,) and source_bytes(args[2]) == b'b', 'Unsupported numeric array constructor state')
        return NumericArray()
    raise ValueError('Serialized callables cannot be executed')

def build_data(value, state):
    require(type(state) is tuple, 'Numeric constructor build state must be a tuple')
    if type(value) is DType:
        require(not value.built and len(state) == 8 and state[0] == 3 and state[1] in ('<', '>', '|') and state[2:5] == (None, None, None) and state[5:] == (-1, -1, 0), 'Unsupported numeric dtype build state')
        require(state[1] != '|' or struct.calcsize(FORMATS[value.code]) == 1, 'Unsupported byte order for multibyte numeric storage')
        value.order = '<' if state[1] == '|' else state[1]
        value.built = True
        return
    if type(value) is NumericArray:
        require(value.values is None and len(state) == 5 and state[0] == 1 and type(state[1]) is tuple and 1 <= len(state[1]) <= MAX_ARRAY_DEPTH and state[3] is False, 'Unsupported numeric array build state')
        shape = state[1]
        require(all(type(part) is int and 0 <= part <= MAX_ARRAY_ITEMS for part in shape), 'Unsupported numeric array shape')
        count = math.prod(shape)
        require(count <= MAX_ARRAY_ITEMS, 'Numeric array shape bound failed')
        flat = numeric_values(state[2], state[4], count)
        def arrange(parts, offset=0):
            if len(parts) == 1: return flat[offset:offset + parts[0]]
            step = math.prod(parts[1:])
            return tuple(arrange(parts[1:], offset + child * step) for child in range(parts[0]))
        value.values = arrange(shape)
        return
    raise ValueError('Serialized object restoration is not supported')

def validate_data_graph(root):
    """Bound actual container nesting, reject cycles and unfinished symbolic objects."""
    heights, active, pending = {}, set(), [(root, False)]
    visits = 0
    def children(value):
        if type(value) is dict: return list(value.values())
        if type(value) in (list, tuple): return value
        return ()
    for_check = (bool, int, float, str, type(None))
    while pending:
        value, closing = pending.pop()
        if type(value) in for_check: continue
        if type(value) is NumericArray:
            require(value.values is not None, 'Numeric array constructor is incomplete')
            continue
        require(type(value) in (dict, list, tuple), 'Symbolic constructor remains in source data')
        identity = id(value)
        if closing:
            height = 1 + max((heights.get(id(child), 0) for child in children(value)), default=0)
            require(height <= MAX_DEPTH, 'Source data nesting bound failed')
            heights[identity] = height; active.remove(identity)
        elif identity not in heights:
            require(identity not in active, 'Cyclic serialized containers are unsupported')
            visits += 1; require(visits <= MAX_CONTAINER_ITEMS, 'Source data container bound failed')
            active.add(identity); pending.append((value, True))
            pending.extend((child, False) for child in reversed(children(value)))

def decode_data_only(body: bytes):
    """Interpret only closed numeric-data operations; production verifies member hashes first."""
    require(type(body) is bytes and 0 < len(body) <= MAX_INPUT_BYTES, 'Source byte bound failed')
    stack, memo, marks = [], {}, []
    operations = 0
    def push(value):
        require(len(stack) < MAX_STACK, 'Source stack bound failed'); stack.append(value)
    def pop():
        require(stack and stack[-1] is not MARK, 'Invalid source stack'); return stack.pop()
    def marked():
        require(marks, 'Missing source container mark')
        start = marks.pop()
        require(start < len(stack) and stack[start] is MARK, 'Invalid source container mark')
        values = stack[start + 1:]; del stack[start:]; return values
    try:
        for opcode, argument, position in pickletools.genops(body):
            operations += 1; require(operations <= MAX_OPERATIONS, 'Source operation bound failed')
            op = opcode.name
            if op == 'PROTO': require(operations == 1 and argument == 2, 'Only source protocol 2 is supported')
            elif operations == 1: raise ValueError('Source protocol declaration is required')
            elif op == 'STOP':
                require(position == len(body) - 1 and len(stack) == 1 and not marks, 'Source serialization has trailing or incomplete data')
                validate_data_graph(stack[0])
                return stack[0]
            elif op == 'MARK':
                require(len(marks) < MAX_DEPTH, 'Source container depth bound failed'); marks.append(len(stack)); push(MARK)
            elif op == 'NONE': push(None)
            elif op == 'NEWFALSE': push(False)
            elif op == 'NEWTRUE': push(True)
            elif op in ('BININT', 'BININT1', 'BININT2', 'LONG1', 'LONG4'):
                require(type(argument) is int and abs(argument) <= MAX_SAFE_INTEGER, 'Source integer range failed'); push(argument)
            elif op == 'BINFLOAT':
                require(math.isfinite(argument), 'Nonfinite source scalar'); push(argument)
            elif op in ('SHORT_BINSTRING', 'BINSTRING', 'BINUNICODE'):
                require(type(argument) is str and len(argument) <= MAX_INPUT_BYTES, 'Source string bound failed'); push(argument)
            elif op == 'EMPTY_DICT': push({})
            elif op == 'EMPTY_LIST': push([])
            elif op == 'EMPTY_TUPLE': push(())
            elif op == 'TUPLE': push(tuple(marked()))
            elif op in ('TUPLE1', 'TUPLE2', 'TUPLE3'):
                count = int(op[-1]); require(len(stack) >= count and all(x is not MARK for x in stack[-count:]), 'Invalid source tuple')
                values = tuple(stack[-count:]); del stack[-count:]; push(values)
            elif op == 'APPEND':
                value = pop(); require(stack and type(stack[-1]) is list and len(stack[-1]) < MAX_CONTAINER_ITEMS, 'Source list bound failed'); stack[-1].append(value)
            elif op == 'APPENDS':
                values = marked(); require(stack and type(stack[-1]) is list and len(stack[-1]) + len(values) <= MAX_CONTAINER_ITEMS, 'Source list bound failed'); stack[-1].extend(values)
            elif op in ('SETITEM', 'SETITEMS'):
                values = marked() if op == 'SETITEMS' else [None, None]
                if op == 'SETITEM': values[1] = pop(); values[0] = pop()
                require(stack and type(stack[-1]) is dict and len(values) % 2 == 0 and len(stack[-1]) + len(values) // 2 <= MAX_CONTAINER_ITEMS, 'Source dictionary bound failed')
                target = stack[-1]
                for offset in range(0, len(values), 2):
                    key = values[offset]; require(type(key) in (int, str) and key not in target, 'Source dictionary key is unsupported or duplicated'); target[key] = values[offset + 1]
            elif op in ('BINPUT', 'LONG_BINPUT'):
                require(type(argument) is int and 0 <= argument < MAX_MEMO and argument not in memo and stack and stack[-1] is not MARK, 'Source memo bound or identity failed'); memo[argument] = stack[-1]
            elif op in ('BINGET', 'LONG_BINGET'):
                require(argument in memo, 'Source memo identity is missing'); push(memo[argument])
            elif op == 'GLOBAL':
                symbol = tuple(argument.split(' ')); require(symbol in GLOBALS, 'Serialized global is not an approved numeric symbol'); push(symbol)
            elif op == 'REDUCE':
                args, symbol = pop(), pop(); push(reduce_data(symbol, args))
            elif op == 'BUILD':
                state = pop(); require(stack and stack[-1] is not MARK, 'Missing numeric build target'); build_data(stack[-1], state)
            else: raise ValueError('Unsupported data serialization opcode')
    except (ValueError, IndexError, TypeError, OverflowError, struct.error, UnicodeError):
        raise ValueError('The bounded numeric source serialization could not be decoded') from None
    raise ValueError('Source serialization did not end with STOP')

def pinned_members(source=SOURCE):
    source = Path(source)
    require(source.is_file() and not source.is_symlink() and source.stat().st_size == SOURCE_BYTES, 'Pinned source archive is unavailable or differs')
    body = source.read_bytes()
    require(hashlib.sha256(body).hexdigest() == SOURCE_SHA256 and hashlib.md5(body).hexdigest() == SOURCE_MD5, 'Pinned source archive checksum differs')
    selected, expanded, count = {}, 0, 0
    expected = {record[0]: (kind, record[1], record[2]) for kind, record in MEMBERS.items()}
    with tarfile.open(source, 'r:bz2') as archive:
        for member in archive:
            count += 1; path = PurePosixPath(member.name)
            require(count <= 200 and not path.is_absolute() and '..' not in path.parts and '\\' not in member.name and ':' not in member.name and (member.isdir() or member.isfile()), 'Source archive member type or path is unsupported')
            expanded += member.size
            require(0 <= member.size <= 128 * 1024 * 1024 and expanded <= 512 * 1024 * 1024, 'Source archive expansion bound failed')
            if member.name not in expected: continue
            kind, length, digest = expected[member.name]
            require(kind not in selected and member.isfile() and member.size == length, 'Pinned source member differs')
            stream = archive.extractfile(member); require(stream is not None, 'Pinned source member cannot be read')
            raw = stream.read(length + 1)
            require(len(raw) == length and hashlib.sha256(raw).hexdigest() == digest, 'Pinned source member checksum differs')
            selected[kind] = raw
    require(set(selected) == set(MEMBERS), 'Pinned source member inventory differs')
    return selected

def vector(value):
    values = value.values if type(value) is NumericArray else value
    require(type(values) in (list, tuple) and len(values) == 3 and all(type(x) in (int, float) and math.isfinite(x) for x in values), 'Source coordinate is not a finite triple')
    return list(values)

def source_payload(source=SOURCE):
    members = pinned_members(source)
    vertices = decode_data_only(members['vertices'])
    edges = decode_data_only(members['edges'])
    require(type(vertices) is dict and set(vertices) == {'index', 'nkind', 'inflowE', 'outflowE', 'pressure', 'coords', 'pBC', 'corticalDepth'}, 'Source vertex field inventory differs')
    require(type(edges) is dict and set(edges) == {'Lfactor_median', 'diameter', 'htd', 'mainAV', 'connectivity', 'mainDA', 'flow', 'length', 'tissueVolume', 'nkind', 'edgesFulfillingSelection', 'htt', 'RBCflux', 'sign', 'points'}, 'Source edge field inventory differs')
    require(all(type(x) is list and len(x) == 9168 for x in vertices.values()) and all(type(x) is list and len(x) == 12071 for x in edges.values()), 'Source field lengths differ')
    vertex_ids = list(vertices['index'])
    require(all(type(x) is int and 0 <= x <= MAX_SAFE_INTEGER for x in vertex_ids) and len(set(vertex_ids)) == len(vertex_ids), 'Source vertex identities differ')
    coordinates = [vector(value) for value in vertices['coords']]
    connectivity = []
    vertex_id_set = set(vertex_ids)
    for value in edges['connectivity']:
        require(type(value) in (tuple, list) and len(value) == 2 and all(type(x) is int and x in vertex_id_set for x in value), 'Source endpoint identities differ')
        connectivity.append(list(value))
    points, paths = [], []
    for source_path in edges['points']:
        require(type(source_path) is list and 2 <= len(source_path) <= 1000000, 'Source vessel path shape differs')
        first = len(points)
        points.extend(vector(value) for value in source_path)
        paths.append(list(range(first, len(points))))
        require(len(points) <= 1000000, 'Source vessel point bound failed')
    return {'schemaVersion': 'mousebio.polyline.v1', 'points': points, 'paths': paths,
            'sourceGraph': {'vertexIds': vertex_ids, 'vertexCoordinates': coordinates,
                            'edgeIds': list(range(len(paths))), 'connectivity': connectivity}}

def f32(value):
    try: result = struct.unpack('<f', struct.pack('<f', value))[0]
    except (struct.error, OverflowError): raise ValueError('Coordinate exceeds finite Float32 storage') from None
    require(math.isfinite(result), 'Coordinate exceeds finite Float32 storage')
    return result

def inspect_payload(payload):
    require(type(payload) is dict and set(payload) == {'schemaVersion', 'points', 'paths', 'sourceGraph'} and payload['schemaVersion'] == 'mousebio.polyline.v1', 'Source polyline layout differs')
    points, paths, graph = payload['points'], payload['paths'], payload['sourceGraph']
    require(type(points) is list and 0 < len(points) <= 1000000 and type(paths) is list and 0 < len(paths) <= 100000, 'Source polyline count bound failed')
    require(type(graph) is dict and set(graph) == {'vertexIds', 'vertexCoordinates', 'edgeIds', 'connectivity'}, 'Source graph layout differs')
    vertex_ids, coordinates, edge_ids, connections = (graph[key] for key in ('vertexIds', 'vertexCoordinates', 'edgeIds', 'connectivity'))
    require(all(type(x) is list for x in (vertex_ids, coordinates, edge_ids, connections)) and 0 < len(vertex_ids) <= 100000 and len(coordinates) == len(vertex_ids) and len(edge_ids) == len(paths) and len(connections) == len(paths), 'Source graph counts differ')
    require(all(type(x) is int and 0 <= x <= MAX_SAFE_INTEGER for x in vertex_ids + edge_ids) and len(set(vertex_ids)) == len(vertex_ids) and len(set(edge_ids)) == len(edge_ids), 'Source graph identities differ')
    by_id = {identity: row for row, identity in enumerate(vertex_ids)}
    bounds = [[math.inf]*3, [-math.inf]*3]; display_bounds = [[math.inf]*3, [-math.inf]*3]
    stored = []; error = 0.0
    for point in points:
        require(type(point) is list and len(point) == 3 and all(type(x) in (int, float) and math.isfinite(x) for x in point), 'Source point coordinates differ')
        display = [f32(x) for x in point]; stored.append(display)
        for axis, value in enumerate(point):
            bounds[0][axis] = min(bounds[0][axis], value); bounds[1][axis] = max(bounds[1][axis], value)
            error = max(error, abs(display[axis] - value))
    for coordinate in coordinates: vector(coordinate)
    seen = bytearray(len(points)); zero = collapsed = segments = 0
    representatives = list(range(len(vertex_ids)))
    def representative(row):
        while representatives[row] != row:
            representatives[row] = representatives[representatives[row]]; row = representatives[row]
        return row
    source_components = len(vertex_ids); mismatches = self_links = 0
    for path, connection in zip(paths, connections):
        require(type(path) is list and 2 <= len(path) <= 1000000 and all(type(index) is int and 0 <= index < len(points) for index in path), 'Source path index differs')
        require(type(connection) is list and len(connection) == 2 and all(type(identity) is int and identity in by_id for identity in connection), 'Source graph endpoint differs')
        if connection[0] == connection[1]: self_links += 1
        first_root, second_root = (representative(by_id[x]) for x in connection)
        if first_root != second_root: representatives[first_root] = second_root; source_components -= 1
        if points[path[0]] != coordinates[by_id[connection[0]]] or points[path[-1]] != coordinates[by_id[connection[1]]]: mismatches += 1
        for index in path:
            require(not seen[index], 'Edge-local serialized samples must retain distinct indices')
            seen[index] = 1
            for axis, value in enumerate(stored[index]):
                display_bounds[0][axis] = min(display_bounds[0][axis], value); display_bounds[1][axis] = max(display_bounds[1][axis], value)
        for first, second in zip(path, path[1:]):
            same = points[first] == points[second]
            zero += same; collapsed += not same and stored[first] == stored[second]; segments += 1
            require(segments <= 1000000, 'Source segment bound failed')
    require(all(seen), 'Source serialized points are missing from paths')
    extent = math.sqrt(sum((high-low)**2 for low,high in zip(display_bounds[0],display_bounds[1])))
    require(math.isfinite(extent) and extent > 0 and f32(extent/4000) > 0 and math.isfinite(f32(extent*100)), 'Source camera extent is unsupported')
    return {'points': len(points), 'polylines': len(paths), 'segments': segments, 'components': len(paths),
            'isolatedPoints': 0, 'zeroLengthSegments': zero, 'float32CollapsedSegments': collapsed,
            'boundsSourceUnits': bounds, 'displayBoundsSourceUnits': display_bounds, 'maxFloat32PositionError': error,
            'sourceGraphVertices': len(vertex_ids), 'sourceGraphEdges': len(edge_ids), 'sourceGraphComponents': source_components,
            'sourceGraphCycleRank': len(edge_ids)-len(vertex_ids)+source_components, 'sourceGraphSelfLinks': self_links,
            'sourceEndpointMismatchPaths': mismatches}

def encode_payload(payload):
    return (json.dumps(payload, separators=(',', ':'), allow_nan=False)+'\n').encode('ascii')


ASSET_BYTES = 38356364
ASSET_SHA256 = '8d9fb19e943a126562ab5a439d83590b5694d58b208f064a8140d556ed3e4652'

def validate_polyline_body(body):
    require(type(body) is bytes and len(body) == ASSET_BYTES and hashlib.sha256(body).hexdigest() == ASSET_SHA256,
            'Vascular numeric derivative differs from the reviewed source')
    payload = json.loads(body)
    require(encode_payload(payload) == body, 'Vascular numeric serialization differs')
    return inspect_payload(payload)

def make_manifest(body):
    stats = {'assetBytes': len(body), 'assetSha256': ASSET_SHA256, **validate_polyline_body(body)}
    citation = 'Schmid F, Conti G, Jenny P, Weber B. Time-averaged simulations results for bi-phasic blood flow simulations in realistic microvascular networks for various single- and multi-capillary occlusion scenarios. Zenodo. 2021. Version 1. doi:10.5281/zenodo.5115640.'
    limits = [
        'This is a regional cortical microvascular source, not a complete adult whole-body vascular network.',
        'Sampled paths originate from mouse cortical reconstructions reused in a simulation deposit. Vessel labels and diameter distributions were modified for modelling; no diameter or simulation field sets display thickness or motion.',
        'Individual specimen identity, sex, exact age and strain linkage remain unresolved and are not borrowed from a separate velocity-measurement cohort.',
        'Micrometres are source-declared units. Independent calibration, anatomical direction and registration to other application references remain unverified.',
        'The indexed rendering retains edge-local point records without merging coincident endpoints. Source connectivity and original vertex and edge IDs are retained separately; indexed path components differ from source topology components.',
        'Path endpoint ordering differs from connectivity ordering in 1261 paths. Two endpoint pairs retain small source coordinate differences after allowing reversal. No repair, reorientation or flow direction is inferred.',
        'All 62 zero-length source segments are retained. No missing branches, smoothing, vessel surfaces, calibrated diameters, synapses or physiological model are generated.',
        'Initial Float32 diagnostics exclude later recentering and GPU arithmetic and do not establish physical accuracy.',
    ]
    return {'id': ATLAS_ID, 'title': 'Mouse cortical microvascular network MVN1',
        'assetFormat': 'polyline-native-v1', 'assetUrl': '/atlas-vascular/'+ASSET,
        'coordinateFrame': {'id': FRAME_ID, 'sourceUnits': 'micrometres', 'assetUnits': 'micrometres',
            'sourceToAssetScale': 1, 'unitsVerified': False, 'unitsStatus': 'source-declared only',
            'anatomicalOrientationVerified': False, 'physicalCalibrationVerified': False,
            'registration': None, 'registrationToDigimouse': None,
            'origin': 'Source MVN1 numerical origin; anatomical origin unverified',
            'axes': {axis: 'source '+axis+'; anatomical direction unverified' for axis in ('x','y','z')}},
        'source': {'id': 'schmid2021-zenodo5115640-mvn1', 'displayName': 'MVN1 cortical vascular source',
            'title': 'MVN1 sampled paths from the Schmid et al. 2021 baseline deposit',
            'citationLabel': 'Schmid et al., 2021; Blinder et al., 2013', 'citation': citation,
            'publicationYear': 2021, 'doi': '10.5281/zenodo.5115640', 'url': 'https://zenodo.org/records/5115640',
            'downloadUrl': 'https://zenodo.org/api/records/5115640/files/SimulationResults_Baseline.tar.bz2/content',
            'license': 'CC-BY-4.0', 'licenseUrl': 'https://creativecommons.org/licenses/by/4.0/',
            'sourceBytes': SOURCE_BYTES, 'sourceSha256': SOURCE_SHA256,
            'sourceMembers': [{'path': path, 'bytes': size, 'sha256': digest} for path,size,digest in MEMBERS.values()],
            'referenceCitations': [citation,
                'Schmid F, Conti G, Jenny P, Weber B. The severity of microstrokes depends on local vascular topology and baseline perfusion. eLife. 2021;10:e60208. doi:10.7554/eLife.60208.',
                'Blinder P, Tsai PS, Kaufhold JP, Knutsen PM, Suhl H, Kleinfeld D. The cortical angiome: an interconnected vascular network with noncolumnar patterns of blood flow. Nature Neuroscience. 2013;16:889-897. doi:10.1038/nn.3426.',
                'Schmid F, Tsai PS, Kleinfeld D, Jenny P, Weber B. Depth-dependent flow and pressure characteristics in cortical microvascular networks. PLoS Computational Biology. 2017;13:e1005392. doi:10.1371/journal.pcbi.1005392.'],
            'attribution': citation+' Original geometry attributed to Blinder et al. 2013; model processing described by Schmid et al. 2017. Geometry-only adaptation by Qasim Hussain for MouseBio_3D, CC BY 4.0.',
            'modifications': ['Decoded only pinned numeric data through a bounded data-only interpreter without executing serialized callables or importing NumPy.',
                'Retained every edge-local path point, original path order and original source topology identifiers. No endpoint merging, repair, smoothing, scaling or registration.',
                'Omitted all simulated flow, pressure, hematocrit, effective diameters, model vessel categories and path-analysis fields from the distributed geometry.']},
        'specimen': {'sex': 'unknown', 'scope': 'regional mouse cortical microvascular reconstruction reused in a simulation deposit',
            'description': 'Individual specimen identity, exact age, sex and strain linkage are unresolved for the MVN1 file.', 'sourceReference': 'https://zenodo.org/records/5115640'},
        'structures': [{'id': STRUCTURE_ID, 'name': 'MVN1 cortical microvascular paths', 'sourceLabel': 'MVN1',
            'meshNode': 'region_MVN1', 'systems': ['cardiovascular'], 'defaultOpacity': 1, 'color': '#c75e62',
            'description': 'One independently selectable source record preserving 12071 sampled vessel paths and their original topology metadata.', 'limitations': limits}],
        'statistics': stats,
        'processing': {'sourceToAssetScale': 1, 'coordinateConversion': False, 'pointRemoval': False,
            'pathRepair': False, 'smoothing': False, 'registration': False, 'radiusUsed': False,
            'positionStorage': 'float32 for display only', 'sourcePointOrderPreserved': True,
            'sourcePathOrderPreserved': True, 'sourceConnectivityPreserved': True, 'endpointMerging': False,
            'simulatedFieldsDistributed': False, 'serializedCallablesExecuted': False},
        'sourceAttributesOmitted': [], 'limitations': limits}

def convert(source=SOURCE, output=OUTPUT, verify_existing=False):
    payload = source_payload(source)
    body = encode_payload(payload)
    manifest = make_manifest(body)
    output = Path(output)
    require(not output.is_symlink(), 'Output directory cannot be a symbolic link')
    encoded = (json.dumps(manifest, indent=2)+'\n').encode('utf-8')
    require(not (output/ASSET).is_symlink() and not (output/'atlas.json').is_symlink(), 'Output file cannot be a symbolic link')
    if verify_existing:
        require((output/ASSET).read_bytes() == body and (output/'atlas.json').read_bytes() == encoded, 'Regenerated vascular asset or manifest differs')
    else:
        output.mkdir(parents=True, exist_ok=True)
        (output/ASSET).write_bytes(body); (output/'atlas.json').write_bytes(encoded)
    print(json.dumps({'assetBytes':len(body),'assetSha256':ASSET_SHA256,'points':manifest['statistics']['points'],'polylines':manifest['statistics']['polylines'],'segments':manifest['statistics']['segments'],'verifyExisting':verify_existing}))
    return manifest

if __name__ == '__main__':
    import argparse
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=SOURCE)
    parser.add_argument('--output', type=Path, default=OUTPUT)
    parser.add_argument('--verify-existing', action='store_true')
    args=parser.parse_args();convert(args.source,args.output,args.verify_existing)
