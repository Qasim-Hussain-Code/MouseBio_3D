"""Data-only serialization, original identity and sampled vascular path checks."""
import contextlib
import hashlib
import io
import json
import pickle
import pickletools
import struct
import unittest
from unittest.mock import patch
from prepare_vascular import (SOURCE, SOURCE_SHA256, OUTPUT, ASSET, ASSET_BYTES, ASSET_SHA256,
    decode_data_only, inspect_payload, validate_polyline_body, make_manifest, convert)

def primitives(value):
    return pickle.dumps(value, protocol=2)

def scalar_body(code, raw):
    args = pickletools.optimize(primitives((code, False, True)))[2:-1]
    state = pickletools.optimize(primitives((3, '<', None, None, None, -1, -1, 0)))[2:-1]
    return b'\x80\x02cnumpy.core.multiarray\nscalar\ncnumpy\ndtype\n'+args+b'R'+state+b'bU'+bytes([len(raw)])+raw+b'\x86R.'

class VascularTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.body = (OUTPUT/ASSET).read_bytes()
        cls.data = json.loads(cls.body)

    def test_pinned_payload_and_original_graph_have_distinct_indexed_components(self):
        stats = validate_polyline_body(self.body)
        self.assertEqual((len(self.body),hashlib.sha256(self.body).hexdigest()), (ASSET_BYTES,ASSET_SHA256))
        self.assertEqual((stats['points'],stats['polylines'],stats['segments']), (575722,12071,563651))
        self.assertEqual((stats['components'],stats['sourceGraphComponents'],stats['sourceGraphCycleRank']), (12071,1,2904))
        self.assertEqual(stats['zeroLengthSegments'],62); self.assertEqual(stats['float32CollapsedSegments'],0)
        self.assertEqual(stats['sourceEndpointMismatchPaths'],1261)
        self.assertEqual(stats['maxFloat32PositionError'],0.00012100254662072985)
        graph=self.data['sourceGraph']
        self.assertEqual(len(graph['vertexIds']),9168);self.assertEqual(len(set(graph['vertexIds'])),9168)
        self.assertEqual(graph['edgeIds'],list(range(12071)))
        offset=0
        for path in self.data['paths']:
            self.assertEqual(path,list(range(offset,offset+len(path))));offset+=len(path)
        self.assertEqual(offset,575722)

    def test_source_manifest_keeps_units_declared_and_omits_simulated_fields(self):
        manifest=make_manifest(self.body)
        self.assertEqual(manifest,json.loads((OUTPUT/'atlas.json').read_text()))
        self.assertEqual(manifest['source']['sourceSha256'],SOURCE_SHA256)
        self.assertEqual(manifest['coordinateFrame']['sourceUnits'],'micrometres')
        self.assertFalse(manifest['coordinateFrame']['physicalCalibrationVerified'])
        self.assertIsNone(manifest['coordinateFrame']['registration'])
        self.assertEqual(manifest['specimen']['sex'],'unknown')
        self.assertNotIn('age',manifest['specimen']);self.assertNotIn('strain',manifest['specimen'])
        self.assertEqual(set(self.data),{'schemaVersion','points','paths','sourceGraph'})
        self.assertEqual(set(self.data['sourceGraph']),{'vertexIds','vertexCoordinates','edgeIds','connectivity'})
        self.assertFalse(manifest['processing']['simulatedFieldsDistributed'])

    def test_data_only_vm_reads_primitives_and_fixed_numeric_scalars_without_numpy(self):
        value={'indices':[0,2,7],'coordinates':(1.25,-3,0),'optional':None,'enabled':False}
        self.assertEqual(decode_data_only(primitives(value)),value)
        self.assertEqual(decode_data_only(scalar_body('f8',struct.pack('<d',9.125))),9.125)
        self.assertEqual(decode_data_only(scalar_body('i4',struct.pack('<i',-52))),-52)
        for body in (scalar_body('O8',b'12345678'),scalar_body('f8',b'1234')):
            with self.assertRaises(ValueError): decode_data_only(body)

    def test_serialized_callables_cycles_wrong_protocol_and_trailing_data_are_rejected(self):
        malicious=b'\x80\x02cos\nsystem\nU\x07fixture\x85R.'
        with patch('os.system', side_effect=AssertionError('A serialized callable must never run')):
            with self.assertRaises(ValueError):decode_data_only(malicious)
        cyclic=[];cyclic.append(cyclic)
        for body in (primitives(cyclic), pickle.dumps([1],protocol=0), primitives([1])+b'trailing', b'\x80\x02h\x00.'):
            with self.assertRaises(ValueError):decode_data_only(body)

    def test_vm_resource_bounds_do_not_require_large_allocations(self):
        with patch('prepare_vascular.MAX_OPERATIONS',2):
            with self.assertRaises(ValueError):decode_data_only(primitives([1,2,3]))
        with patch('prepare_vascular.MAX_INPUT_BYTES',3):
            with self.assertRaises(ValueError):decode_data_only(primitives([1,2,3]))
        with patch('prepare_vascular.MAX_CONTAINER_ITEMS',2):
            with self.assertRaises(ValueError):decode_data_only(primitives([1,2,3]))

    def test_invalid_numeric_body_or_source_endpoint_identity_cannot_acquire_metadata(self):
        changed=bytearray(self.body);changed[100]^=1
        with self.assertRaises(ValueError):make_manifest(bytes(changed))
        base={'schemaVersion':'mousebio.polyline.v1','points':[[0,0,0],[1,0,0]],'paths':[[0,1]],
              'sourceGraph':{'vertexIds':[12,29],'vertexCoordinates':[[0,0,0],[1,0,0]],'edgeIds':[701],'connectivity':[[12,29]]}}
        stats=inspect_payload(base);self.assertEqual(stats['sourceGraphCycleRank'],0)
        for alter in (lambda d:d['sourceGraph']['connectivity'][0].__setitem__(1,99),
                      lambda d:d['paths'][0].__setitem__(1,2),
                      lambda d:d['points'][0].__setitem__(0,float('nan')),
                      lambda d:d['sourceGraph']['vertexIds'].__setitem__(1,12)):
            changed=json.loads(json.dumps(base));alter(changed)
            with self.assertRaises(ValueError):inspect_payload(changed)

    @unittest.skipUnless(SOURCE.is_file(),'Ignored original vascular archive is unavailable; exact source conversion not executed.')
    def test_original_numeric_source_regenerates_all_samples_and_topology_without_modifying_original(self):
        before=hashlib.sha256(SOURCE.read_bytes()).hexdigest()
        with contextlib.redirect_stdout(io.StringIO()):convert(verify_existing=True)
        self.assertEqual(hashlib.sha256(SOURCE.read_bytes()).hexdigest(),before)
        self.assertEqual(before,SOURCE_SHA256)

if __name__=='__main__':unittest.main()
