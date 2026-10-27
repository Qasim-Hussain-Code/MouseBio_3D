"""Convert pinned EMA147 STL source to native-coordinate PLY, units unknown.

Every source triangle and winding is retained. Exact positions are indexed within
each surface and display normals are generated. MRI voxel spacing is not applied.
"""
from __future__ import annotations
import argparse
from collections import defaultdict
import hashlib
import io
import json
import math
from pathlib import Path, PurePosixPath
import re
import shlex
import stat
import struct
import zipfile

ROOT = Path(__file__).resolve().parents[1]
ARCHIVE = ROOT / 'data/raw/emouseatlas-ema147-surfaces.zip'
METADATA = ROOT / '.publication/ema147-source'
OUTPUT = ROOT / 'public/atlas-ema147'
ASSET, ATLAS_ID = 'ema147-native.ply', 'ema147-native-v1'
FRAME_ID, SOURCE_ID = 'emouseatlas-ema147-stl-native-v1', 'emouseatlas-ema147-2017'
ARCHIVE_SHA256 = 'efd5df6df9b69cf21a62d1f4245ecc5419ee4e5c4c72635f444ce3fba5b7971c'
TEXT_INPUTS = {
 'model_info.txt': (448, 'cf37ac2de4f7ce79cfeb912dda70257ee06a561511ef54a18a7d89fa69cbeb21'),
 'README.txt': (2203, '6e68704cf516682243460f835179124f84d93afae7e4ca7d5901f8c1d8c0c671'),
 'TS23_EMA147_anatomy.txt': (5324, '970f2870a1e56603b6be75225de1ec9c0a6f0ec91dfb16bea73849c0155bac1b')}
DEPOSIT = 'https://datashare.ed.ac.uk/items/5016a5d4-2017-4fdc-a934-964fc2b542ec/full'
TOPOLOGY_FIELDS = ('degenerateTriangles', 'duplicateTriangles', 'boundaryEdges', 'nonmanifoldEdges', 'inconsistentWindingEdges', 'noncyclicVertexLinks')

def require(condition, message):
    if not condition: raise ValueError(message)

def pinned_bytes(path, size, digest):
    path = Path(path)
    require(path.is_file() and not path.is_symlink() and path.stat().st_size == size, 'Reviewed input byte count differs')
    data = path.read_bytes()
    require(hashlib.sha256(data).hexdigest() == digest, 'Reviewed input checksum differs')
    return data

def source_identifier(filename):
    match = re.fullmatch(r'Surfaces/EMAPA(\d+)_(.+)\.stl', filename)
    if match: return f'ema147:EMAPA:{match[1]}', match[2], f'EMAPA:{match[1]}'
    require(filename == 'Surfaces/reference.stl', 'Unreviewed surface filename')
    return 'ema147:reference', 'reference', None

def parse_index(data):
    result, indices = {}, set()
    for line in data.decode('ascii').splitlines():
        if not line.strip() or line.lstrip().startswith('#'): continue
        fields = shlex.split(line)
        require(len(fields) == 8, 'Invalid index fields')
        number = int(fields[0]); require(number not in indices and 0 <= number <= 76, 'Invalid index identity'); indices.add(number)
        if number == 0:
            require(fields[-1] == 'Clear Label', 'Unexpected background'); continue
        match = re.fullmatch(r'(EMAPA:\d+) (.+)', fields[-1])
        require(match is not None and match[1] not in result, 'Invalid source EMAPA identity')
        rgb = list(map(int, fields[1:4])); alpha = float(fields[4])
        require(all(0 <= value <= 255 for value in rgb) and math.isfinite(alpha) and 0 <= alpha <= 1, 'Invalid colour')
        result[match[1]] = {'labelIndex': number, 'label': fields[-1], 'color': '#' + ''.join(f'{value:02x}' for value in rgb)}
    require(indices == set(range(77)) and len(result) == 76, 'Incomplete index')
    return result

def parse_ascii_stl(data):
    require(len(data) <= 4 * 1024 * 1024, 'Source surface exceeds bound')
    lines = [line.strip() for line in data.decode('ascii').splitlines() if line.strip()]
    require(len(lines) >= 9 and lines[0] == 'solid ascii' and lines[-1] == 'endsolid', 'Unexpected STL envelope')
    require((len(lines)-2) % 7 == 0 and (len(lines)-2)//7 <= 20_000, 'Unexpected triangle inventory')
    positions, indices, lookup = [], [], {}
    for offset in range(1, len(lines)-1, 7):
        block = lines[offset:offset+7]; normal = block[0].split()
        require(normal[:2] == ['facet', 'normal'] and len(normal) == 5, 'Invalid facet normal')
        normal = tuple(map(float, normal[2:])); require(all(math.isfinite(v) for v in normal) and math.hypot(*normal) > 0, 'Invalid normal values')
        require(block[1] == 'outer loop' and block[5:] == ['endloop', 'endfacet'], 'Invalid facet grammar')
        for line in block[2:5]:
            value = line.split(); require(len(value) == 4 and value[0] == 'vertex', 'Invalid vertex')
            point = tuple(map(float, value[1:])); require(all(math.isfinite(v) and abs(v) < 1e6 for v in point), 'Invalid coordinates')
            if point not in lookup: lookup[point] = len(positions); positions.append(point)
            indices.append(lookup[point])
    return positions, indices

def cross(positions, a, b, c):
    pa, pb, pc = positions[a], positions[b], positions[c]
    x = [pb[i]-pa[i] for i in range(3)]; y = [pc[i]-pa[i] for i in range(3)]
    return (x[1]*y[2]-x[2]*y[1], x[2]*y[0]-x[0]*y[2], x[0]*y[1]-x[1]*y[0])

def topology(positions, indices):
    edges, links, faces = defaultdict(list), defaultdict(list), set()
    parents = list(range(len(positions)))
    def find(i):
        while parents[i] != i: parents[i] = parents[parents[i]]; i = parents[i]
        return i
    degenerate = duplicate = 0
    for offset in range(0, len(indices), 3):
        a,b,c = indices[offset:offset+3]; key = tuple(sorted((a,b,c)))
        duplicate += key in faces; faces.add(key); degenerate += math.hypot(*cross(positions,a,b,c)) == 0
        for left,right in ((a,b),(b,c),(c,a)):
            edges[tuple(sorted((left,right)))].append((left,right)); parents[find(left)] = find(right)
        links[a].append((b,c)); links[b].append((c,a)); links[c].append((a,b))
    bad = 0
    for pairs in links.values():
        graph = defaultdict(list)
        for left,right in pairs: graph[left].append(right); graph[right].append(left)
        if any(len(v) != 2 for v in graph.values()): bad += 1; continue
        seen, pending = set(), [next(iter(graph))]
        while pending:
            item = pending.pop()
            if item not in seen: seen.add(item); pending.extend(graph[item])
        bad += len(seen) != len(graph)
    return dict(zip(TOPOLOGY_FIELDS, (degenerate,duplicate,sum(len(v)==1 for v in edges.values()),sum(len(v)>2 for v in edges.values()),sum(len(v)==2 and v[0] != tuple(reversed(v[1])) for v in edges.values()),bad)), components=len({find(i) for i in range(len(positions))}))

def display_normals(positions, indices):
    sums, first = [[0.,0.,0.] for _ in positions], [None] * len(positions)
    for offset in range(0,len(indices),3):
        ids = indices[offset:offset+3]; value = cross(positions,*ids)
        require(math.hypot(*value)>0, 'Unexpected degenerate source triangle')
        for vertex in ids:
            for axis in range(3): sums[vertex][axis] += value[axis]
            if first[vertex] is None: first[vertex] = value
    normals, fallbacks = [], 0
    for vertex,value in enumerate(sums):
        length = math.hypot(*value)
        if length == 0: value = first[vertex]; length = math.hypot(*value); fallbacks += 1
        require(math.isfinite(length) and length > 0, 'No finite display normal fallback')
        normals.append(tuple(v/length for v in value))
    return normals, fallbacks

def ply_header(structures, vertices, triangles):
    lines = ['ply', 'format binary_little_endian 1.0',
             'comment MouseBio_3D EMA147 native source coordinates; units unknown']
    for region in structures:
        identifier, filename = region['id'], region['sourceFile']
        require(re.fullmatch(r'[A-Za-z0-9:._-]+', identifier) is not None
                and re.fullmatch(r'Surfaces/[A-Za-z0-9_.-]+\.stl', filename) is not None, 'Unsafe PLY region annotation')
        lines.append(f"comment region {region['sourceRegionIndex']} {identifier} {filename}")
    lines += [f'element vertex {vertices}', 'property float x', 'property float y', 'property float z',
              'property float nx', 'property float ny', 'property float nz', 'property uint source_region_index',
              f'element face {triangles}', 'property list uchar uint vertex_indices', 'end_header']
    header = ('\n'.join(lines) + '\n').encode('ascii')
    require(len(header) <= 16*1024, 'PLY header exceeds bound')
    return header

def convert(archive=ARCHIVE, metadata=METADATA, output=OUTPUT, verify_existing=False):
    raw = pinned_bytes(archive, 11_393_742, ARCHIVE_SHA256)
    texts = {name: pinned_bytes(Path(metadata)/name, *binding) for name,binding in TEXT_INPUTS.items()}
    index = parse_index(texts['TS23_EMA147_anatomy.txt'])
    vertex_data, face_data, structures = bytearray(), bytearray(), []
    vertex_offset = triangle_offset = 0
    maximum_error, surface_ids = 0., set()
    with zipfile.ZipFile(io.BytesIO(raw)) as bundle:
        inventory = bundle.infolist()
        require(len(inventory) <= 128 and len({v.filename for v in inventory}) == len(inventory), 'Invalid archive inventory')
        require(sum(v.file_size for v in inventory) <= 80*1024*1024, 'Expanded source exceeds bound')
        files = []
        for item in inventory:
            path = PurePosixPath(item.filename)
            require(not path.is_absolute() and all(v not in ('', '.', '..') for v in path.parts), 'Unsafe source path')
            require(not stat.S_ISLNK(item.external_attr >> 16), 'Source symlinks are unsupported')
            if not item.is_dir(): source_identifier(item.filename); files.append(item)
        require(len(files) == 77, 'Unexpected source surface count')
        for number,item in enumerate(sorted(files, key=lambda item: item.filename)):
            identifier,label,emapa = source_identifier(item.filename)
            if emapa: surface_ids.add(emapa)
            positions,indices = parse_ascii_stl(bundle.read(item))
            defects = topology(positions,indices)
            normals,fallbacks = display_normals(positions,indices)
            rounded_positions = []
            for point,normal in zip(positions,normals):
                packed = struct.pack('<6fI', *point, *normal, number); vertex_data.extend(packed)
                rounded = struct.unpack_from('<3f',packed); rounded_positions.append(rounded)
                maximum_error = max(maximum_error, *(abs(point[i]-rounded[i]) for i in range(3)))
            require(len(set(rounded_positions)) == len(positions), 'Float32 merges distinct source positions')
            for offset in range(0,len(indices),3):
                a,b,c = indices[offset:offset+3]
                require(math.hypot(*cross(rounded_positions,a,b,c)) > 0, 'Float32 creates a degenerate triangle')
                face_data.extend(struct.pack('<B3I',3,a+vertex_offset,b+vertex_offset,c+vertex_offset))
            bounds = [[min(point[i] for point in rounded_positions) for i in range(3)],
                      [max(point[i] for point in rounded_positions) for i in range(3)]]
            declared = index.get(emapa)
            region = {'id':identifier, 'name':label.replace('_',' ') if emapa else 'Unannotated reference surface',
                      'sourceLabel':PurePosixPath(item.filename).stem, 'sourceFile':item.filename,
                      'sourceFilenameLabel':label, 'sourceRegionIndex':number, 'systems':[], 'meshNode':identifier,
                      'description':'Deposited EMA147 source surface. Coordinate units and anatomical orientation remain unverified; source topology defects are retained.',
                      'color':declared['color'] if declared else '#aab4b5', 'defaultOpacity':1 if emapa else 0.08,
                      'colorProvenance':'source-index exact EMAPA identifier' if declared else 'neutral display fallback; no exact source-index identifier match',
                      'geometry':{'vertexOffset':vertex_offset,'vertices':len(positions),'triangleOffset':triangle_offset,
                                  'triangles':len(indices)//3,'boundsSourceUnits':bounds,'sourceTopology':defects,'normalFallbackVertices':fallbacks}}
            if emapa: region['sourceEMAPAId'] = emapa
            if declared: region['sourceVolumeLabelIndex'] = declared['labelIndex']; region['sourceIndexLabel'] = declared['label']
            structures.append(region); vertex_offset += len(positions); triangle_offset += len(indices)//3
    require((vertex_offset,triangle_offset,len(surface_ids)) == (185779,374725,76), 'Reviewed geometry inventory differs')
    totals = {field:sum(v['geometry']['sourceTopology'][field] for v in structures) for field in TOPOLOGY_FIELDS}
    require(totals == dict(zip(TOPOLOGY_FIELDS,(0,0,1411,2285,11,4139))), 'Reviewed topology differs')
    ply = ply_header(structures,vertex_offset,triangle_offset) + vertex_data + face_data
    manifest = make_manifest(structures,index,surface_ids,totals,maximum_error,ply)
    encoded = (json.dumps(manifest,indent=2)+'\n').encode('utf-8'); output = Path(output)
    if verify_existing:
        require((output/ASSET).read_bytes() == ply, 'Regenerated PLY differs')
        require((output/'atlas.json').read_bytes() == encoded, 'Regenerated manifest differs')
    else:
        output.mkdir(parents=True,exist_ok=True); (output/ASSET).write_bytes(ply); (output/'atlas.json').write_bytes(encoded)
    print(json.dumps({'structures':77,'vertices':vertex_offset,'triangles':triangle_offset,
                     'assetBytes':len(ply),'assetSha256':manifest['statistics']['assetSha256'],
                     'headerBytes':len(ply_header(structures,vertex_offset,triangle_offset)),
                     'normalFallbackVertices':manifest['processing']['normalFallbackVertices'],'verifyExisting':verify_existing}))
    return manifest

def make_manifest(structures,index,surface_ids,totals,maximum_error,ply):
    comparison = {'anatomyIndexIdentifiers':76,'surfaceEMAPAIdentifiers':76,
                  'matchingIdentifiers':sorted(surface_ids & index.keys()),
                  'indexOnlyIdentifiers':sorted(index.keys()-surface_ids),
                  'surfaceOnlyIdentifiers':sorted(surface_ids-index.keys()),
                  'unannotatedSourceFiles':['Surfaces/reference.stl'],
                  'limitations':['Equal inventory counts do not establish equal identities. File order is not a label-volume mapping.',
                                 'Colours transfer only for exact source EMAPA identifiers; no anatomical substitutions are made.']}
    require(tuple(map(len,(comparison['matchingIdentifiers'],comparison['indexOnlyIdentifiers'],comparison['surfaceOnlyIdentifiers']))) == (68,8,8), 'Reviewed identity discrepancy differs')
    return {
      'id':ATLAS_ID,'title':'eMouseAtlas EMA147 native-coordinate developmental surfaces',
      'assetUrl':f'/atlas-ema147/{ASSET}','assetFormat':'ply-native-v1',
      'coordinateFrame':{'id':FRAME_ID,'sourceUnits':'unknown','assetUnits':'unknown','sourceToAssetScale':1,
                         'unitsVerified':False,'anatomicalOrientationVerified':False,'physicalCalibrationVerified':False,
                         'registrationToDigimouse':None,'origin':'Deposited STL origin, unchanged; anatomical origin unverified',
                         'axes':{axis:f'deposited STL {axis}; anatomical direction unverified' for axis in ('x','y','z')}},
      'source':{'id':SOURCE_ID,'displayName':'eMouseAtlas EMA147','citationLabel':'Ruffins et al., 2017',
                'title':'3D mouse embryo model: EMA147, Stage TS23, Age E15.0 (est)',
                'authors':['Seth Ruffins','Russell Jacobs','Chris Armit','Nick Burton','Bill Hill','Richard Baldock'],
                'publicationYear':2017,'doi':'10.7488/ds/2167','url':DEPOSIT,
                'downloadUrl':'https://datashare.ed.ac.uk/server/api/core/bitstreams/7829c9db-bf18-4d69-af2b-5d10be9afa18/content',
                'license':'CC-BY-4.0','licenseUrl':'https://creativecommons.org/licenses/by/4.0/',
                'archiveBytes':11393742,'archiveSha256':ARCHIVE_SHA256,
                'modelInfoSha256':TEXT_INPUTS['model_info.txt'][1],'readmeSha256':TEXT_INPUTS['README.txt'][1],
                'anatomyIndexSha256':TEXT_INPUTS['TS23_EMA147_anatomy.txt'][1],
                'sourceSurfaceInventorySha256':hashlib.sha256(('\n'.join(v['sourceFile'] for v in structures)+'\n').encode('ascii')).hexdigest(),
                'attribution':'Ruffins S, Jacobs R, Armit C, Burton N, Hill B and Baldock R, 2017, University of Edinburgh, doi:10.7488/ds/2167, CC BY 4.0. Native-coordinate PLY adaptation by Qasim Hussain for MouseBio_3D.',
                'modifications':['Exact-position indexing within each source surface','Float32 native-coordinate storage without a physical scale conversion',
                                 'Generated area-weighted vertex normals for display','Original source triangles, winding and topology defects retained'],
                'reportedImageVoxelSpacingMicrometres':[80,80,80]},
      'specimen':{'sex':'unknown','strain':'C57BL6',
                  'developmentalStage':{'label':'TS23','reference':DEPOSIT},'scope':'embryonic anatomical reference',
                  'description':'Source-declared C57BL6 mouse model at Theiler stage TS23. Age claims conflict; sex and mass are not declared.',
                  'sourceReference':'https://doi.org/10.7488/ds/2167'},
      'ageClaims':[{'value':15,'unit':'embryonic days','label':'E15.0 (estimated)','sourceReference':DEPOSIT},
                   {'value':15,'unit':'dpc','label':'15 dpc','sourceReference':'https://www.emouseatlas.org/eAtlasViewer_ema/application/ema/anatomy/EMA147.php'},
                   {'value':14.5,'unit':'dpc','label':'14.5 dpc','sourceReference':'https://emouseatlas.org/emap/ema/modelsummary/modelsummary.html'}],
      'ageConflictResolved':False,'sourceInventoryComparison':comparison,'structures':structures,
      'statistics':{'structures':77,'vertices':185779,'triangles':374725,'assetBytes':len(ply),
                    'assetSha256':hashlib.sha256(ply).hexdigest(),'sourceTopology':totals,
                    'closedManifoldSourceRegions':sum(not any(v['geometry']['sourceTopology'][f] for f in TOPOLOGY_FIELDS) for v in structures)},
      'processing':{'sourceToAssetScale':1,'geometricSmoothing':False,'meshRepair':False,'decimation':False,
                    'triangleRemoval':False,'windingRepair':False,'registration':False,'positionStorage':'float32',
                    'maximumFloat32CoordinateErrorSourceUnits':maximum_error,
                    'vertexReuse':'Only exactly equal positions within one source surface share an index.',
                    'normalProcessing':'Area-weighted unit vertex normals for display; original STL facet normals are not stored in the PLY.',
                    'normalCancellationFallback':'First incident nonzero triangle normal in original source order.',
                    'normalFallbackVertices':sum(v['geometry']['normalFallbackVertices'] for v in structures)},
      'limitations':['Deposited STL units are unknown. Image voxel spacing is not a surface scale; calibrated measurements are unavailable.',
                     'Source ages E15.0 estimated, 15 dpc and 14.5 dpc remain unresolved; TS23 is consistently declared.',
                     'The anatomy index and STL inventory share only 68 of 76 EMAPA identifiers. No mapping by file order or substituted anatomy is made.',
                     'The unannotated reference.stl surface has no asserted anatomical identity. Its low opacity is a display setting.',
                     'Open/nonmanifold edges, winding conflicts and noncyclic vertex links are retained. Numerical checks do not establish anatomical accuracy.',
                     'The embryonic source is separate from adult references. No physiological validation, adult anatomy or accepted registration is inferred.',
                     'Anatomical directions, physical calibration and unreviewed system categories remain unavailable. Magnification adds no biological detail.']}

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--archive',type=Path,default=ARCHIVE)
    parser.add_argument('--metadata',type=Path,default=METADATA)
    parser.add_argument('--output',type=Path,default=OUTPUT)
    parser.add_argument('--verify-existing',action='store_true')
    args = parser.parse_args()
    convert(args.archive,args.metadata,args.output,args.verify_existing)
