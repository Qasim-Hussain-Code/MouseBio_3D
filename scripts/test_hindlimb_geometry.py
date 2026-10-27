"""Numerical checks for the distributed Charles et al. regional surface model."""
import hashlib
import json
import math
import os
from array import array
from pathlib import Path
import tempfile
import unittest

from import_hindlimb import (ASSET, ATLAS_ID, BONE_IDS, FRAME, JSON_SHA, OUTPUT as DEFAULT_OUTPUT, PDF_SHA,
                             SCALE, SOURCE_ID, TENDON_ID, file_digest, srgb_color)
from test_volume_geometry import geometry_report, read_glb, values

OUTPUT = Path(os.environ.get('MOUSEBIO_HINDLIMB_TEST_OUTPUT', DEFAULT_OUTPUT))


class HindlimbGeometryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.manifest = json.loads((OUTPUT / 'atlas.json').read_text())
        cls.raw, cls.document, cls.binary = read_glb(OUTPUT / ASSET)

    def test_source_binding_units_licenses_and_specimen(self):
        atlas = self.manifest
        self.assertEqual(atlas['id'], ATLAS_ID)
        self.assertEqual(atlas['assetUrl'], f'/atlas-hindlimb/{ASSET}')
        self.assertEqual(atlas['coordinateFrame']['id'], FRAME)
        self.assertEqual(atlas['coordinateFrame']['sourceUnitMillimetres'], 1)
        self.assertEqual(atlas['coordinateFrame']['sourceToAssetScale'], SCALE)
        self.assertFalse(atlas['coordinateFrame']['physicalCalibrationVerified'])
        self.assertFalse(atlas['coordinateFrame']['anatomicalOrientationVerified'])
        self.assertIsNone(atlas['coordinateFrame']['registrationToDigimouse'])
        self.assertEqual(atlas['source']['id'], SOURCE_ID)
        self.assertEqual(atlas['source']['license'], 'CC-BY-4.0')
        self.assertEqual(atlas['source']['licenseUrl'], 'https://creativecommons.org/licenses/by/4.0/')
        self.assertEqual(atlas['source']['pdfSha256'], PDF_SHA)
        self.assertEqual(atlas['source']['decoderJsonSha256'], JSON_SHA)
        self.assertEqual(atlas['source']['authors'], ['James P. Charles', 'Ornella Cappellari',
                         'Andrew J. Spence', 'John R. Hutchinson', 'Dominic J. Wells'])
        self.assertEqual(atlas['specimen']['sex'], 'female')
        self.assertEqual(atlas['specimen']['strain'], 'C57BL/6')
        self.assertEqual(atlas['specimen']['age'], {'value': 117, 'unit': 'days'})
        self.assertEqual(atlas['specimen']['mass'], {'value': 24.9, 'unit': 'g'})
        self.assertIn('right hindlimb', atlas['specimen']['scope'])
        self.assertEqual(hashlib.sha256(self.raw).hexdigest(), atlas['statistics']['glbSha256'])
        self.assertEqual(len(self.raw), atlas['statistics']['glbBytes'])

    def test_all_44_source_surfaces_and_welded_topology(self):
        atlas, document, binary = self.manifest, self.document, self.binary
        self.assertEqual(len(document['nodes']), 44)
        self.assertEqual(len(atlas['structures']), 44)
        self.assertEqual(atlas['statistics']['vertices'], 540_165)
        self.assertEqual(atlas['statistics']['triangles'], 664_210)
        triangles = vertices = 0
        for index, node in enumerate(document['nodes']):
            region = atlas['structures'][index]
            identifier = f'charles2016-hindlimb:{index}'
            self.assertEqual(region['id'], identifier)
            self.assertEqual(region['sourceLabel'], region['name'])
            self.assertEqual(region['sourceTessellationIndex'], index)
            self.assertEqual(node['extras']['structureId'], identifier)
            self.assertEqual(node['extras']['sourceName'], region['name'])
            self.assertEqual(node['extras']['sourceTessellationIndex'], index)
            self.assertFalse(any(key in node for key in ('translation', 'rotation', 'scale', 'matrix')))
            self.assertEqual(region['systems'], ['skeletal' if index in BONE_IDS else 'muscular'])
            primitive = document['meshes'][node['mesh']]['primitives'][0]
            positions = values(document, binary, primitive['attributes']['POSITION'])
            normals = values(document, binary, primitive['attributes']['NORMAL'])
            indices = values(document, binary, primitive['indices'])
            self.assertEqual(len(positions) // 3, region['geometry']['vertices'])
            self.assertEqual(len(indices) // 3, region['geometry']['triangles'])
            self.assertEqual(region['color'], srgb_color(region['sourceDiffuseLinear']))
            self.assertEqual(document['materials'][primitive['material']]['pbrMetallicRoughness']['baseColorFactor'][:3], region['sourceDiffuseLinear'])
            self.assertTrue(all(math.isfinite(value) for value in positions))
            self.assertEqual(len(normals), len(positions))
            self.assertTrue(all(0 <= value < len(positions) // 3 for value in indices))
            for axis in range(3):
                self.assertAlmostEqual(min(positions[axis::3]), region['geometry']['boundsMeters'][0][axis], places=8)
                self.assertAlmostEqual(max(positions[axis::3]), region['geometry']['boundsMeters'][1][axis], places=8)
            # Weld coincident positions only for topology analysis; retain original normal seams in the GLB.
            mapping, unique_positions, unique_normals, weld = {}, array('f'), array('f'), []
            for offset in range(0, len(positions), 3):
                position = tuple(positions[offset:offset + 3])
                if position not in mapping:
                    mapping[position] = len(mapping)
                    unique_positions.extend(position)
                    unique_normals.extend(normals[offset:offset + 3])
                weld.append(mapping[position])
            report = geometry_report(unique_positions, unique_normals, array('I', (weld[value] for value in indices)))
            self.assertTrue(report['closedVertexLinks'])
            triangles += len(indices) // 3
            vertices += len(positions) // 3
        self.assertEqual((vertices, triangles), (540_165, 664_210))
        self.assertEqual(atlas['structures'][TENDON_ID]['sourceLabel'], 'Patellar tendon')
        self.assertEqual({atlas['structures'][i]['sourceLabel'] for i in BONE_IDS},
                         {'Fabellae', 'Pelvis', 'Femur', 'Patella', 'Foot', 'Tibia/Fibula'})

    def test_pinned_input_and_source_color_validation_fail_closed(self):
        with tempfile.TemporaryDirectory() as directory:
            fake = Path(directory) / 'source.pdf'
            fake.write_bytes(b'not the reviewed data')
            with self.assertRaises(ValueError):
                file_digest(fake, fake.stat().st_size, PDF_SHA)
        self.assertEqual(srgb_color([0, 0.5, 1]), '#00bcff')
        for color in ([0, -1, 1], [0, 1.1, 0], [0, float('nan'), 0], [0, 1]):
            with self.assertRaises(ValueError):
                srgb_color(color)


if __name__ == '__main__':
    unittest.main()
