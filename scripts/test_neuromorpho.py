"""Numerical and provenance checks for the NMO_130632 numeric adaptation."""
import hashlib
import json
from pathlib import Path
import tempfile
import unittest

from prepare_neuromorpho import (ASSET, ASSET_BYTES, ASSET_SHA256, ATLAS_ID, FRAME_ID,
                                MAX_BYTES, OUTPUT, SOURCE, SOURCE_BYTES, SOURCE_SHA256,
                                STRUCTURE_ID, convert, make_manifest, prepare_numeric_body,
                                validate_numeric_trace)


class NeuroMorphoTests(unittest.TestCase):
    def test_bundled_numeric_records_and_identity(self):
        body = (OUTPUT / ASSET).read_bytes()
        rows = [line.split(b' ') for line in body.splitlines()]
        self.assertEqual((len(body), hashlib.sha256(body).hexdigest()), (ASSET_BYTES, ASSET_SHA256))
        self.assertEqual(len(rows), 11650)
        self.assertEqual([int(row[0]) for row in rows], list(range(1, 11651)))
        self.assertEqual(sum(int(row[6]) != -1 for row in rows), 11649)
        self.assertEqual(sum(int(row[6]) == -1 for row in rows), 1)
        self.assertTrue(all(len(row) == 7 for row in rows))
        self.assertNotIn(b'#', body)
        self.assertNotIn(b'@', body)
        self.assertNotIn(b'\\', body)

    def test_bundled_diagnostics_are_recomputed(self):
        stats = validate_numeric_trace((OUTPUT / ASSET).read_bytes())
        self.assertEqual(stats['typeCounts'], {'1': 3, '2': 10394, '3': 1253})
        self.assertEqual(stats['boundsSourceUnits'], [[-204.54, -215.35, -31.03], [280.5, 311.23, 81.68]])
        self.assertEqual(stats['maxFloat32PositionError'], 1.464843751364242e-05)
        self.assertEqual([stats[key] for key in ('roots', 'components', 'isolatedSamples', 'zeroLengthEdges', 'float32CollapsedEdges')], [1, 1, 0, 0, 0])
        self.assertEqual(stats, json.loads((OUTPUT / 'atlas.json').read_text())['statistics'])

    def test_manifest_binds_original_derivative_and_unknown_frame(self):
        body = (OUTPUT / ASSET).read_bytes()
        manifest = json.loads((OUTPUT / 'atlas.json').read_text())
        self.assertEqual(manifest, make_manifest(body))
        self.assertEqual(manifest['id'], ATLAS_ID)
        self.assertEqual(manifest['structures'][0]['id'], STRUCTURE_ID)
        self.assertEqual(manifest['source']['sourceSha256'], SOURCE_SHA256)
        self.assertEqual(manifest['source']['sourceBytes'], SOURCE_BYTES)
        self.assertEqual(manifest['source']['license'], 'CC-BY-4.0')
        self.assertIn('RRID:SCR_002145', manifest['source']['citation'])
        self.assertIn('10.1096/fba.2024-00048', manifest['source']['citation'])
        self.assertIn('10.1038/s41467-019-12058-z', manifest['source']['citation'])
        frame = manifest['coordinateFrame']
        self.assertEqual([frame['id'], frame['sourceUnits'], frame['assetUnits'], frame['sourceToAssetScale']], [FRAME_ID, 'unknown', 'unknown', 1])
        for key in ('unitsVerified', 'anatomicalOrientationVerified', 'physicalCalibrationVerified'):
            self.assertIs(frame[key], False)
        for key in ('registration', 'registrationToDigimouse'):
            self.assertIsNone(frame[key])
        for key in ('age', 'mass', 'strain', 'count'):
            self.assertNotIn(key, manifest['specimen'])
        self.assertEqual(manifest['specimen']['sex'], 'unknown')

    @unittest.skipUnless(SOURCE.is_file(), 'Original is intentionally absent from source distributions')
    def test_original_numeric_token_spelling_and_order_preserved(self):
        original = SOURCE.read_bytes()
        source_rows = [line.split() for line in original.decode('utf-8').splitlines()
                       if line.strip() and not line.lstrip().startswith('#')]
        derivative = prepare_numeric_body(original)
        derivative_rows = [line.split() for line in derivative.decode('ascii').splitlines()]
        self.assertEqual(source_rows, derivative_rows)
        self.assertEqual(derivative, (OUTPUT / ASSET).read_bytes())
        self.assertEqual(hashlib.sha256(SOURCE.read_bytes()).hexdigest(), SOURCE_SHA256)

    @unittest.skipUnless(SOURCE.is_file(), 'Original is intentionally absent from source distributions')
    def test_deterministic_regeneration_and_verify_only(self):
        with tempfile.TemporaryDirectory(prefix='mousebio-neuron-test-') as temporary:
            output = Path(temporary) / 'adaptation'
            convert(SOURCE, output)
            asset_before = (output / ASSET).read_bytes()
            manifest_before = (output / 'atlas.json').read_bytes()
            convert(SOURCE, output, verify_existing=True)
            self.assertEqual((output / ASSET).read_bytes(), asset_before)
            self.assertEqual((output / 'atlas.json').read_bytes(), manifest_before)
            (output / ASSET).write_bytes(asset_before + b'\n')
            with self.assertRaisesRegex(ValueError, 'differs'):
                convert(SOURCE, output, verify_existing=True)
            self.assertEqual((output / ASSET).read_bytes(), asset_before + b'\n')

    def test_unreviewed_data_cannot_acquire_source_metadata(self):
        with self.assertRaisesRegex(ValueError, 'Reviewed original'):
            prepare_numeric_body(b'# changed original\n1 1 0 0 0 1 -1\n2 2 1 0 0 1 1\n')
        with self.assertRaisesRegex(ValueError, 'Unreviewed'):
            make_manifest(b'1 1 0 0 0 1 -1\n2 2 1 0 0 1 1\n')

    def test_forward_nonconsecutive_forest_and_isolated_records(self):
        body = b'10 3 1 0 0 0.3 90\n90 1 0 0 0 1 -1\n800 1 2 0 0 1 -1\n'
        stats = validate_numeric_trace(body)
        self.assertEqual([stats[key] for key in ('samples', 'parentLinks', 'roots', 'components', 'isolatedSamples')], [3, 1, 2, 2, 1])

    def test_source_zero_length_and_initial_float32_collapse_distinct(self):
        stats = validate_numeric_trace(b'1 1 0 0 0 1 -1\n2 2 0 0 0 1 1\n3 2 1000000000 0 0 1 2\n4 2 1000000001 0 0 1 3\n')
        self.assertEqual(stats['zeroLengthEdges'], 1)
        self.assertEqual(stats['float32CollapsedEdges'], 1)
        self.assertEqual(stats['maxFloat32PositionError'], 1)

    def test_rejects_graph_identity_failures(self):
        fixtures = (
            b'1 1 0 0 0 1 -1\n1 2 1 0 0 1 1\n',
            b'1 1 0 0 0 1 -1\n2 2 1 0 0 1 99\n',
            b'1 1 0 0 0 1 -1\n2 2 1 0 0 1 2\n',
            b'1 1 0 0 0 1 -1\n2 2 1 0 0 1 3\n3 2 2 0 0 1 2\n',
        )
        for body in fixtures:
            with self.subTest(body=body), self.assertRaises(ValueError):
                validate_numeric_trace(body)

    def test_rejects_noncanonical_headers_and_invalid_numeric_fields(self):
        valid = b'1 1 0 0 0 1 -1\n2 2 1 0 0 1 1\n'
        fixtures = (b'# source header\n' + valid, b'\n' + valid, valid[:-1], valid.replace(b' ', b'\t'),
                    valid.replace(b'\n', b'\v', 1), valid.replace(b'\n', b'\f', 1),
                    valid.replace(b'\n', b'\r\n'), valid.replace(b'2 2 1', b'2 2 NaN'),
                    valid.replace(b'2 2 1', b'2 2 1e40'), valid.replace(b'2 2 1', b'2 2 1e999'),
                    valid.replace(b'2 2 1', b'2 2.0 1'), valid.replace(b'2 2 1', b'9007199254740992 2 1'),
                    valid.replace(b'2 2 1 0 0 1', b'2 2 1 0 0 -1'), b'\xff' + valid)
        for index, body in enumerate(fixtures):
            with self.subTest(index=index), self.assertRaises(ValueError):
                validate_numeric_trace(body)

    def test_rejects_resource_and_empty_display_failures(self):
        fixtures = (b'', b'0' * (MAX_BYTES + 1), b'1 1 0 0 0 1 -1\n',
                    b'1 1 0 0 0 1 -1\n2 2 0 0 0 1 1\n',
                    b'1 1 0 0 0 1 -1\n2 2 1e-44 0 0 1 1\n',
                    b'1 1 0 0 0 1 -1\n' + b'2 2 ' + b'0' * 4097 + b' 0 0 1 1\n')
        for index, body in enumerate(fixtures):
            with self.subTest(index=index), self.assertRaises(ValueError):
                validate_numeric_trace(body)


if __name__ == '__main__':
    unittest.main()
