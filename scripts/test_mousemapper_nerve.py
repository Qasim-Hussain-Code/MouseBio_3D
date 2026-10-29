"""Source-identity and numerical checks without anatomical or browser-validation claims."""
import hashlib
import json
from pathlib import Path
import struct
import tempfile
import unittest

from prepare_mousemapper_nerve import (ASSET, ASSET_BYTES, ASSET_SHA256, ATLAS_ID, FRAME_ID, SOURCE,
    SOURCE_BYTES, SOURCE_SHA256, MAX_BYTES, MAX_POINTS, MAX_PATHS, MAX_REFERENCES, OUTPUT,
    OMITTED_ATTRIBUTES, convert, encode_geometry, make_manifest, parse_vtk_geometry,
    prepare_polyline_body, validate_polyline_body)

def body(points, paths):
    return encode_geometry({'schemaVersion': 'mousebio.polyline.v1', 'points': points, 'paths': paths})

def vtk(points='0 0 0 1 0 0 1 1 0', paths='2 0 1 2 1 2', point_count=3, path_count=2, references=6, attributes=''):
    return (f'# vtk DataFile Version 4.2\nSYNTHETIC_PRIVATE_HEADER_MARKER\nASCII\nDATASET POLYDATA\nPOINTS {point_count} float\n{points}\nLINES {path_count} {references}\n{paths}\n{attributes}').encode()

class MouseMapperNerveTests(unittest.TestCase):
    def test_bundled_numeric_derivative_retains_exact_identity_and_layout(self):
        raw = (OUTPUT / ASSET).read_bytes()
        self.assertEqual((len(raw), hashlib.sha256(raw).hexdigest()), (ASSET_BYTES, ASSET_SHA256))
        decoded = json.loads(raw)
        self.assertEqual(set(decoded), {'schemaVersion', 'points', 'paths'})
        self.assertEqual(len(decoded['points']), 1940)
        self.assertEqual(len(decoded['paths']), 84)
        self.assertEqual(sum(len(path)-1 for path in decoded['paths']), 1876)
        self.assertEqual(encode_geometry(decoded), raw)
        self.assertNotIn(b'radius', raw)
        self.assertNotIn(b'SYNTHETIC_PRIVATE_HEADER_MARKER', raw)

    def test_every_bundled_coordinate_and_polyline_has_recomputed_numerical_diagnostics(self):
        raw = (OUTPUT / ASSET).read_bytes(); decoded = json.loads(raw)
        stats = validate_polyline_body(raw)
        self.assertEqual({key: stats[key] for key in ('points', 'polylines', 'segments', 'components', 'isolatedPoints', 'zeroLengthSegments', 'float32CollapsedSegments')},
            {'points': 1940, 'polylines': 84, 'segments': 1876, 'components': 64, 'isolatedPoints': 0, 'zeroLengthSegments': 0, 'float32CollapsedSegments': 0})
        self.assertEqual(stats['boundsSourceUnits'], [[1, 1, 101], [298, 298, 298]])
        self.assertEqual(stats['displayBoundsSourceUnits'], stats['boundsSourceUnits'])
        errors = [abs(struct.unpack('<f', struct.pack('<f', value))[0] - value) for point in decoded['points'] for value in point]
        self.assertEqual(stats['maxFloat32PositionError'], max(errors))
        self.assertEqual(stats['maxFloat32PositionError'], 1.5136718729991117e-05)
        self.assertEqual(stats, json.loads((OUTPUT/'atlas.json').read_text())['statistics'])

    @unittest.skipUnless(SOURCE.is_file(), 'Ignored original VTK is unavailable; original geometry comparison not executed.')
    def test_original_points_paths_and_source_condition_are_preserved_without_repair(self):
        raw = SOURCE.read_bytes(); before = hashlib.sha256(raw).hexdigest()
        self.assertEqual((len(raw), before), (SOURCE_BYTES, SOURCE_SHA256))
        geometry, attributes = parse_vtk_geometry(raw)
        self.assertEqual(attributes, OMITTED_ATTRIBUTES)
        derivative = json.loads((OUTPUT/ASSET).read_bytes())
        self.assertEqual(derivative['points'], geometry['points'])
        self.assertEqual(derivative['paths'], geometry['paths'])
        self.assertEqual(prepare_polyline_body(raw), (OUTPUT/ASSET).read_bytes())
        self.assertEqual(hashlib.sha256(SOURCE.read_bytes()).hexdigest(), before)

    def test_unknown_units_source_binding_and_omitted_inconsistent_radius_attributes_are_explicit(self):
        manifest = make_manifest((OUTPUT/ASSET).read_bytes())
        self.assertEqual(manifest, json.loads((OUTPUT/'atlas.json').read_text()))
        self.assertEqual(manifest['id'], ATLAS_ID)
        frame = manifest['coordinateFrame']
        self.assertEqual((frame['id'], frame['sourceUnits'], frame['assetUnits'], frame['sourceToAssetScale']), (FRAME_ID, 'unknown', 'unknown', 1))
        for key in ('unitsVerified', 'anatomicalOrientationVerified', 'physicalCalibrationVerified'):
            self.assertIs(frame[key], False)
        self.assertIsNone(frame['registration']); self.assertIsNone(frame['registrationToDigimouse'])
        self.assertEqual(manifest['source']['sourceSha256'], SOURCE_SHA256)
        self.assertEqual(manifest['source']['license'], 'Apache-2.0')
        self.assertEqual(manifest['sourceAttributesOmitted'], OMITTED_ATTRIBUTES)
        self.assertNotIn('scale', manifest['structures'][0])
        self.assertNotIn('age', manifest['specimen']); self.assertNotIn('count', manifest['specimen'])
        self.assertEqual(manifest['specimen']['sex'], 'unknown')
        manifest['sourceAttributesOmitted'][0]['tuples'] = 1
        self.assertEqual(make_manifest((OUTPUT/ASSET).read_bytes())['sourceAttributesOmitted'][0]['tuples'], 2290)

    def test_explicit_polyline_order_zero_based_indices_cycles_and_isolated_points_are_not_repaired(self):
        raw = body([[0.,0.,0.], [1.,0.,0.], [1.,1.,0.], [99.,99.,99.]], [[2,0,1,2], [0,0]])
        stats = validate_polyline_body(raw)
        self.assertEqual((stats['polylines'], stats['segments'], stats['components'], stats['isolatedPoints']), (2,4,2,1))
        self.assertEqual(stats['zeroLengthSegments'], 1)
        self.assertEqual(stats['boundsSourceUnits'][1], [99,99,99])
        self.assertEqual(stats['displayBoundsSourceUnits'][1], [1,1,0])
        self.assertEqual(json.loads(raw)['paths'], [[2,0,1,2], [0,0]])

    def test_source_zero_links_and_initial_float32_collapse_are_distinct(self):
        raw = body([[16777216.,0.,0.], [16777217.,0.,0.], [16777220.,0.,0.], [16777220.,0.,0.]], [[0,1,2,3]])
        stats = validate_polyline_body(raw)
        self.assertEqual((stats['zeroLengthSegments'], stats['float32CollapsedSegments'], stats['maxFloat32PositionError']), (1,1,1))

    def test_unreviewed_bytes_do_not_acquire_source_identity_or_grant_inferred_radius_associations(self):
        for raw in (body([[0.,0.,0.],[1.,0.,0.]],[[0,1]]), (OUTPUT/ASSET).read_bytes()+b' '):
            with self.assertRaises(ValueError): make_manifest(raw)
        geometry, fields = parse_vtk_geometry(vtk(attributes='POINT_DATA 3\nFIELD FieldData 1\nradius 1 4 float\n1 2 3 4\nCELL_DATA 2\nFIELD FieldData 1\nradius 1 3 float\n1 2 3\n'))
        self.assertEqual(geometry['paths'], [[0,1],[1,2]])
        self.assertEqual([(f['declaredRecords'],f['tuples']) for f in fields], [(3,4),(2,3)])
        self.assertNotIn('radius', encode_geometry(geometry).decode())
        self.assertNotIn('SYNTHETIC_PRIVATE_HEADER_MARKER', encode_geometry(geometry).decode())
        with self.assertRaises(ValueError): prepare_polyline_body(vtk())

    def test_json_rejects_ambiguous_nonfinite_unsupported_or_out_of_range_data(self):
        valid = {'schemaVersion':'mousebio.polyline.v1','points':[[0.,0.,0.],[1.,0.,0.]],'paths':[[0,1]]}
        bad = [b'{}', b'[]', b'{"schemaVersion":"mousebio.polyline.v1","points":[],"points":[],"paths":[]}',
               b'{"schemaVersion":"mousebio.polyline.v1","points":[[NaN,0,0],[1,0,0]],"paths":[[0,1]]}', b'\xff']
        for value in (True, '1', None, 1e100, 10**400):
            data = json.loads(json.dumps(valid)); data['points'][0][0] = value; bad.append(json.dumps(data).encode())
        for path in ([0,-1], [0,2], [True,1], [0], 'not-a-path'):
            data = json.loads(json.dumps(valid)); data['paths'] = [path]; bad.append(json.dumps(data).encode())
        data = dict(valid, headers='not geometry'); bad.append(json.dumps(data).encode())
        bad.append(body([[0.,0.,0.],[0.,0.,0.]],[[0,1]]))
        for raw in bad:
            with self.subTest(length=len(raw)), self.assertRaises(ValueError): validate_polyline_body(raw)

    def test_vtk_requires_complete_bounded_finite_geometry_and_preserves_title_only_in_original(self):
        for raw in (b'not-vtk', vtk().replace(b'ASCII',b'BINARY'), vtk(points='nan 0 0 1 0 0 1 1 0'),
                    vtk(paths='2 0 3 2 1 2'), vtk(references=5), vtk(point_count=MAX_POINTS+1), vtk(path_count=MAX_PATHS+1),
                    vtk().replace(b'POINTS 3 float',b'POINTS 3 double'), vtk(attributes='CELL_DATA 2\nFIELD FieldData 1\nradius 1 4 float\n1 2\n')):
            with self.subTest(length=len(raw)), self.assertRaises(ValueError): parse_vtk_geometry(raw)
        geometry, fields = parse_vtk_geometry(vtk())
        self.assertEqual(geometry['points'], [[0,0,0],[1,0,0],[1,1,0]])
        self.assertEqual(fields, [])
        self.assertNotIn('SYNTHETIC_PRIVATE_HEADER_MARKER', encode_geometry(geometry).decode())

    def test_resource_and_camera_bounds_fail_before_unsupported_rendering(self):
        for raw in (b' '*(MAX_BYTES+1), body([[0.,0.,0.]]*(MAX_POINTS+1),[[0,1]]),
                    body([[0.,0.,0.],[1.,0.,0.]],[[0,1]]*(MAX_PATHS+1)),
                    body([[0.,0.,0.],[1.,0.,0.]],[[0,1]*(MAX_REFERENCES//2+1)]),
                    body([[0.,0.,0.],[1e38,0.,0.]],[[0,1]]),body([[0.,0.,0.],[1e-40,0.,0.]],[[0,1]])):
            with self.subTest(length=len(raw)), self.assertRaises(ValueError): validate_polyline_body(raw)

    def test_long_source_polyline_is_validated_iteratively(self):
        count = 20000
        raw = body([[float(i),float(i%2),0.] for i in range(count)],[list(range(count))])
        stats = validate_polyline_body(raw)
        self.assertEqual((stats['points'],stats['segments'],stats['components'],stats['isolatedPoints']),(count,count-1,1,0))

    @unittest.skipUnless(SOURCE.is_file(), 'Ignored original VTK is unavailable; converter regeneration not executed.')
    def test_converter_regenerates_exact_bytes_without_changing_original_or_existing_outputs(self):
        original = SOURCE.read_bytes()
        with tempfile.TemporaryDirectory() as temporary:
            folder=Path(temporary); source=folder/'source.vtk'; source.write_bytes(original); output=folder/'result'
            convert(source,output)
            self.assertEqual((output/ASSET).read_bytes(),(OUTPUT/ASSET).read_bytes())
            self.assertEqual((output/'atlas.json').read_bytes(),(OUTPUT/'atlas.json').read_bytes())
            convert(source,output,verify_existing=True)
            self.assertEqual(source.read_bytes(),original)
            (output/ASSET).write_bytes(b'changed')
            with self.assertRaises(ValueError): convert(source,output,verify_existing=True)
            self.assertEqual((output/ASSET).read_bytes(),b'changed')
        self.assertEqual(SOURCE.read_bytes(),original)

if __name__ == '__main__':
    unittest.main(verbosity=2)
