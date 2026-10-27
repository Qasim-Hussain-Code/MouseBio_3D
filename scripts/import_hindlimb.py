"""Convert the reviewed Charles et al. 2016 S1 hindlimb surfaces to glTF.

The input is a checksum-pinned JSON export from an external standalone PRC
decoder. Original source PDF, PRC and decoder output are read but never changed.
Only the Python standard library and the project's glTF writer are required.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
import struct

from import_digimouse import GlbWriter

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'data/raw/charles2016-hindlimb-s1.pdf'
INTERMEDIATE = ROOT / '.publication/hindlimb-source'
OUTPUT = ROOT / 'public/atlas-hindlimb'
PDF_SHA = 'aadb7a020f3f9ffc1c8b91f3d8e5f9f2a1eef95d24b0816b69ac4f878637ac47'
PRC_SHA = 'c300f38c7888b82b0c2e00548c8d2bb5b879b076872e5e44781da8a8477fc659'
JSON_SHA = '0eda5effc49a460fbc89de070baa5d48c940c5f5b0dab1319f5d4f1342629e8c'
DECODER_COMMIT = '24bfa43b7c29203c572892662ec8a5a8e8ae7b96'
FRAME = 'charles2016-hindlimb-prc-native-v1'
ATLAS_ID = 'charles2016-hindlimb-v1'
SOURCE_ID = 'charles2016-hindlimb-s1-2016'
SCALE = 0.001
BONE_IDS = {14, 16, 17, 18, 19, 20}
TENDON_ID = 15
ASSET = 'charles2016-hindlimb.glb'


def require(condition, message):
    if not condition:
        raise ValueError(message)


def file_digest(path, expected_bytes, expected_hash):
    require(path.is_file() and path.stat().st_size == expected_bytes, 'Source size differs from the reviewed file')
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        while block := stream.read(1024 * 1024):
            digest.update(block)
    require(digest.hexdigest() == expected_hash, 'Source checksum differs from the reviewed file')


def extract_source(pdf=SOURCE, target=INTERMEDIATE / 'charles2016-hindlimb.prc'):
    """Extract the pinned unfiltered PRC stream without modifying the PDF."""
    file_digest(pdf, 9_782_060, PDF_SHA)
    if target.exists():
        file_digest(target, 9_776_330, PRC_SHA)
        print('Existing PRC matches the reviewed source.')
        return
    with pdf.open('rb') as source:
        source.seek(1429)
        data = source.read(9_776_330)
    require(len(data) == 9_776_330 and data.startswith(b'PRC') and hashlib.sha256(data).hexdigest() == PRC_SHA,
            'The pinned PDF does not contain the reviewed PRC stream')
    target.parent.mkdir(parents=True, exist_ok=True)
    with target.open('xb') as output:
        output.write(data)
    print('The source PRC stream was extracted and checksum verified.')


def srgb_color(linear):
    """Represent the glTF linear diffuse colour as a display sRGB hex value."""
    require(len(linear) == 3 and all(isinstance(v, (int, float)) and math.isfinite(v) and 0 <= v <= 1 for v in linear), 'Invalid source colour')
    def convert(value):
        srgb = 12.92 * value if value <= 0.0031308 else 1.055 * value ** (1 / 2.4) - 0.055
        return max(0, min(255, round(srgb * 255)))
    return '#' + ''.join(f'{convert(value):02x}' for value in linear)


def read_header(stream):
    prefix = []
    size = 0
    for line in stream:
        if line.lstrip().startswith('"tessellations":'):
            break
        size += len(line)
        require(size <= 8 * 1024 * 1024, 'Decoder metadata exceeds its bound')
        prefix.append(line)
    else:
        raise ValueError('Decoder tessellation list is missing')
    return json.loads(''.join(prefix).rstrip().rstrip(',') + '}')


def tessellations(stream):
    decoder = json.JSONDecoder()
    pending = ''
    while True:
        pending = pending.lstrip().lstrip(',').lstrip()
        if pending.startswith(']'):
            return
        try:
            item, end = decoder.raw_decode(pending)
        except json.JSONDecodeError:
            chunk = stream.read(1024 * 1024)
            require(bool(chunk) and len(pending) + len(chunk) <= 40 * 1024 * 1024, 'Invalid or oversized tessellation')
            pending += chunk
            continue
        pending = pending[end:]
        yield item


def convert(verify_existing=False, pdf=SOURCE, prc=INTERMEDIATE / 'charles2016-hindlimb.prc',
            source_json=INTERMEDIATE / 'charles2016-hindlimb.json', output=OUTPUT):
    file_digest(pdf, 9_782_060, PDF_SHA)
    file_digest(prc, 9_776_330, PRC_SHA)
    file_digest(source_json, 99_950_221, JSON_SHA)
    writer = GlbWriter()
    writer.document['asset'] = {'version': '2.0', 'generator': 'MouseBio_3D Charles 2016 source surface converter',
        'copyright': 'Charles JP et al. 2016. CC BY 4.0. Source DOI 10.1371/journal.pone.0147669.s002.'}
    writer.document['extras'] = {'coordinateFrameId': FRAME, 'sourceToAssetScale': SCALE,
        'sourceUnits': 'PRC global millimetre multiple', 'assetUnits': 'metres', 'physicalCalibrationVerified': False,
        'anatomicalOrientationVerified': False, 'sourcePdfSha256': PDF_SHA, 'decoderCommit': DECODER_COMMIT}
    structures = []
    total_vertices = total_triangles = 0
    max_error = max_normal_error = 0.0
    with source_json.open(encoding='utf-8') as stream:
        metadata = read_header(stream)
        model = metadata['model_tree']
        require(set(model) == {'type', 'is_model', 'name', 'file_index', 'children'} and len(model['children']) == 1,
                'Unsupported model hierarchy or transform')
        parent = model['children'][0]
        require(set(parent) == {'type', 'is_model', 'name', 'file_index', 'children'}, 'Unsupported source grouping')
        nodes = parent['children']
        require(len(nodes) == 44 and metadata['num_tessellations'] == 44 and metadata['num_line_tessellations'] == 0,
                'Unexpected source inventory')
        for index, node in enumerate(nodes):
            require(set(node) == {'type', 'is_model', 'name', 'file_index', 'part', 'children'} and not node['children'],
                    'Unsupported source node or transform')
            part = node['part']
            require(part['tess_index'] is None and part['num_rep_items'] == 1
                    and part['rep_items'] == [{'name': 'Surface', 'tess_index': index}]
                    and part['name'] == node['name'] and node['file_index'] == 0, 'Unexpected surface binding')
        for index, tess in enumerate(tessellations(stream)):
            require(index < 44 and tess['tess_index'] == index and tess['type'] == '3D' and tess['num_faces'] == 1,
                    'Unexpected tessellation')
            face = tess['faces'][0]
            require(not face['is_texture'] and not face['disabled'] and not face['has_transparency']
                    and len(face['primitives']) == 1 and face['primitives'][0]['type'] == 'triangles',
                    'Unsupported source appearance or primitive')
            raw = face['vertices']
            positions, normals = [], []
            for vertex in raw:
                require(len(vertex['position']) == 3 and len(vertex['normal']) == 3
                        and all(math.isfinite(value) for value in vertex['position'] + vertex['normal']), 'Invalid source vertex')
                scaled = [value * SCALE for value in vertex['position']]
                quantized = struct.unpack('<3f', struct.pack('<3f', *scaled))
                max_error = max(max_error, max(abs(a - b) for a, b in zip(scaled, quantized)))
                positions.append(quantized)
                length = math.sqrt(sum(value * value for value in vertex['normal']))
                require(length > 0 and math.isfinite(length), 'Undefined source normal')
                max_normal_error = max(max_normal_error, abs(length - 1))
                normals.append([value / length for value in vertex['normal']])
            primitive = face['primitives'][0]
            indices = primitive['indices']
            require(len(indices) % 3 == 0 and len(indices) == primitive['num_indices']
                    and all(type(value) is int and 0 <= value < len(raw) for value in indices), 'Invalid source indices')
            bounds = ([min(v[a] for v in positions) for a in range(3)], [max(v[a] for v in positions) for a in range(3)])
            position_id = writer.accessor((v for vertex in positions for v in vertex), 'f', 5126, 'VEC3', len(positions), 34962, bounds)
            normal_id = writer.accessor((v for vertex in normals for v in vertex), 'f', 5126, 'VEC3', len(normals), 34962)
            index_id = writer.accessor(indices, 'I', 5125, 'SCALAR', len(indices), 34963)
            material = face['material']
            color = srgb_color(material['diffuse'])
            require(material['diffuse_alpha'] == 1, 'Unsupported source transparency')
            source_id = f'charles2016-hindlimb:{index}'
            name = nodes[index]['name']
            writer.document['materials'].append({'name': name, 'pbrMetallicRoughness': {
                'baseColorFactor': [*material['diffuse'], material['diffuse_alpha']], 'metallicFactor': 0, 'roughnessFactor': 0.72}, 'doubleSided': False})
            writer.document['meshes'].append({'name': source_id, 'primitives': [{'attributes': {'POSITION': position_id, 'NORMAL': normal_id},
                'indices': index_id, 'material': index, 'mode': 4}]})
            writer.document['nodes'].append({'name': source_id, 'mesh': index, 'extras': {'structureId': source_id,
                'sourceTessellationIndex': index, 'sourceName': name, 'sourceProductPath': [model['name'], parent['name'], name]}})
            writer.document['scenes'][0]['nodes'].append(index)
            system = 'skeletal' if index in BONE_IDS else 'muscular'
            description = ('Source-labelled bony or aggregate region from one right hindlimb. The source name is retained without subdividing aggregates.'
                           if index in BONE_IDS else 'Source-labelled patellar tendon from one right hindlimb.' if index == TENDON_ID
                           else 'Source-labelled muscle region from one right hindlimb. It is not a muscle activation or physiological model.')
            structures.append({'id': source_id, 'name': name, 'sourceLabel': name, 'sourceTessellationIndex': index,
                'systems': [system], 'meshNode': source_id, 'sourceId': SOURCE_ID, 'description': description,
                'scale': 'organ', 'color': color, 'sourceDiffuseLinear': material['diffuse'], 'defaultOpacity': 1,
                'geometry': {'vertices': len(positions), 'triangles': len(indices) // 3, 'boundsMeters': bounds}})
            total_vertices += len(positions)
            total_triangles += len(indices) // 3
    require(len(structures) == 44 and total_vertices == 540_165 and total_triangles == 664_210, 'Source geometry inventory mismatch')
    glb = writer.finish()
    require(len(glb) <= 80 * 1024 * 1024, 'Generated GLB exceeds the asset cap')
    digest = hashlib.sha256(glb).hexdigest()
    target = output / ASSET
    if verify_existing:
        require(target.is_file() and hashlib.sha256(target.read_bytes()).hexdigest() == digest, 'Regenerated GLB checksum differs')
    else:
        output.mkdir(parents=True, exist_ok=True)
        target.write_bytes(glb)
        limitations = [
            'One adult female C57BL/6 specimen with right hindlimb and pelvic coverage; not a whole-body or population reference.',
            'The source PDF contains 37 muscle-named surfaces, one tendon and six bony or aggregate surfaces; the publication describes 39 muscles and this discrepancy is unresolved.',
            'Foot, Tibia/Fibula and Fabellae are source-labelled aggregates; no additional individual bones are inferred.',
            'Source axes and physical calibration have not been independently verified; no accepted registration to Digimouse exists.',
            'Surface closure and source acquisition spacing do not establish anatomical accuracy, tissue layers, cellular detail or validated physiology.',
        ]
        manifest = {'id': ATLAS_ID, 'title': 'Charles et al. adult female right hindlimb and pelvis', 'assetUrl': f'/atlas-hindlimb/{ASSET}',
            'coordinateFrame': {'id': FRAME, 'sourceUnits': 'PRC global millimetre multiple', 'assetUnits': 'metres',
                'sourceUnitMillimetres': 1, 'sourceToAssetScale': SCALE, 'origin': 'Source PRC origin, preserved',
                'axes': {'x': 'source x, anatomical direction unverified', 'y': 'source y, anatomical direction unverified', 'z': 'source z, anatomical direction unverified'},
                'anatomicalOrientationVerified': False, 'physicalCalibrationVerified': False, 'registrationToDigimouse': None},
            'source': {'id': SOURCE_ID, 'displayName': 'Charles et al. hindlimb', 'citationLabel': 'Charles et al., 2016',
                'title': 'Musculoskeletal Geometry, Muscle Architecture and Functional Specialisations of the Mouse Hindlimb',
                'authors': ['James P. Charles', 'Ornella Cappellari', 'Andrew J. Spence', 'John R. Hutchinson', 'Dominic J. Wells'],
                'publicationYear': 2016, 'doi': '10.1371/journal.pone.0147669',
                'url': 'https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0147669',
                'figureDoi': '10.1371/journal.pone.0147669.s002', 'license': 'CC-BY-4.0', 'licenseUrl': 'https://creativecommons.org/licenses/by/4.0/',
                'pdfSha256': PDF_SHA, 'prcSha256': PRC_SHA, 'decoderJsonSha256': JSON_SHA, 'decoderCommit': DECODER_COMMIT,
                'attribution': 'Charles JP, Cappellari O, Spence AJ, Hutchinson JR and Wells DJ, 2016, S1 Figure, CC BY 4.0. Surfaces converted to glTF by Qasim Hussain for MouseBio_3D.',
                'modifications': ['Preserved source-labelled triangle surfaces and diffuse colours', 'Uniform PRC unit conversion to metres', 'Normalized existing vertex normals', 'Serialized indexed glTF geometry without smoothing, repair or registration']},
            'specimen': {'scientificName': 'Mus musculus', 'taxonomyId': 'NCBITaxon:10090', 'sex': 'female', 'strain': 'C57BL/6',
                'age': {'value': 117, 'unit': 'days'}, 'mass': {'value': 24.9, 'unit': 'g'}, 'scope': 'right hindlimb and pelvis',
                'count': 1, 'description': 'One adult female C57BL/6 mouse, aged 117 days and weighing 24.9 g.',
                'sourceReference': 'https://doi.org/10.1371/journal.pone.0147669'},
            'structures': structures, 'statistics': {'structures': len(structures), 'vertices': total_vertices, 'triangles': total_triangles,
                'glbBytes': len(glb), 'glbSha256': digest},
            'processing': {'sourceUnitMillimetres': 1, 'sourceToAssetScale': SCALE, 'normalProcessing': 'Normalize source vertex normals without changing direction',
                'maximumFloat32CoordinateErrorMetres': max_error, 'maximumSourceNormalLengthError': max_normal_error,
                'smoothing': False, 'meshRepair': False, 'decimation': False, 'registration': False}, 'limitations': limitations}
        (output / 'atlas.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'structures': len(structures), 'vertices': total_vertices, 'triangles': total_triangles,
        'glbBytes': len(glb), 'glbSha256': digest, 'verifyExisting': verify_existing}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--verify-existing', action='store_true')
    parser.add_argument('--extract-source', action='store_true', help='extract the reviewed PRC from the pinned PDF')
    parser.add_argument('--pdf', type=Path, default=SOURCE)
    parser.add_argument('--prc', type=Path, default=INTERMEDIATE / 'charles2016-hindlimb.prc')
    parser.add_argument('--json', type=Path, default=INTERMEDIATE / 'charles2016-hindlimb.json')
    parser.add_argument('--output', type=Path, default=OUTPUT)
    arguments = parser.parse_args()
    if arguments.extract_source:
        require(not arguments.verify_existing, 'Choose extraction or geometry verification')
        extract_source(arguments.pdf, arguments.prc)
    else:
        convert(arguments.verify_existing, arguments.pdf, arguments.prc, arguments.json, arguments.output)
