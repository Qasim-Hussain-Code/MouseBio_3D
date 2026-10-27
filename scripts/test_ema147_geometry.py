"""Actual native PLY/source checks, without anatomical validation claims."""
from collections import defaultdict
import hashlib
import json
import math
from pathlib import Path
import re
import struct
import tempfile
import unittest
import zipfile
from import_ema147 import (ARCHIVE, ARCHIVE_SHA256, ASSET, ATLAS_ID, FRAME_ID, OUTPUT,
                           display_normals, pinned_bytes, ply_header, source_identifier)

ASSET_SHA = '8593f83eb1ebf05f17203b9b3b3257adcf04195b7d117ab312efa4ed1a38a75f'

class Ema147GeometryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.manifest = json.loads((OUTPUT/'atlas.json').read_text())
        cls.raw = (OUTPUT/ASSET).read_bytes()
        cls.offset = cls.raw.index(b'end_header\n') + len(b'end_header\n')
        cls.header = cls.raw[:cls.offset].decode('ascii')
        cls.vertices = list(struct.iter_unpack('<6fI',memoryview(cls.raw)[cls.offset:cls.offset+185779*28]))
        cls.faces = list(struct.iter_unpack('<B3I',memoryview(cls.raw)[cls.offset+185779*28:]))

    def test_source_identity_unknown_units_and_conflicting_claims(self):
        atlas = self.manifest
        self.assertEqual(atlas['id'],ATLAS_ID)
        self.assertEqual(atlas['assetFormat'],'ply-native-v1')
        frame = atlas['coordinateFrame']
        self.assertEqual((frame['id'],frame['sourceUnits'],frame['assetUnits'],frame['sourceToAssetScale']),(FRAME_ID,'unknown','unknown',1))
        self.assertFalse(frame['unitsVerified']); self.assertFalse(frame['physicalCalibrationVerified'])
        self.assertIsNone(frame['registrationToDigimouse'])
        self.assertEqual(atlas['source']['archiveSha256'],ARCHIVE_SHA256)
        self.assertEqual(atlas['source']['license'],'CC-BY-4.0')
        self.assertEqual(atlas['specimen']['sex'],'unknown')
        self.assertEqual(atlas['specimen']['strain'],'C57BL6')
        self.assertEqual(atlas['specimen']['developmentalStage']['label'],'TS23')
        for field in ('age','mass','count','scientificName','taxonomyId'): self.assertNotIn(field,atlas['specimen'])
        self.assertEqual([v['label'] for v in atlas['ageClaims']],['E15.0 (estimated)','15 dpc','14.5 dpc'])
        self.assertFalse(atlas['ageConflictResolved'])
        comparison = atlas['sourceInventoryComparison']
        self.assertEqual(tuple(len(comparison[k]) for k in ('matchingIdentifiers','indexOnlyIdentifiers','surfaceOnlyIdentifiers')),(68,8,8))
        self.assertTrue(all(region['systems']==[] for region in atlas['structures']))
        self.assertEqual(sum('sourceVolumeLabelIndex' in region for region in atlas['structures']),68)

    def test_actual_ply_bounds_normals_regions_and_retained_topology(self):
        atlas = self.manifest
        self.assertLessEqual(self.offset,16*1024)
        self.assertEqual(len(self.raw),10079275)
        self.assertEqual(hashlib.sha256(self.raw).hexdigest(),ASSET_SHA)
        self.assertEqual(atlas['statistics']['assetSha256'],ASSET_SHA)
        self.assertNotIn('glbSha256',atlas['statistics'])
        self.assertEqual((len(self.vertices),len(self.faces)),(185779,374725))
        self.assertEqual(self.raw,ply_header(atlas['structures'],185779,374725)+self.raw[self.offset:])
        self.assertEqual(sum(v.startswith('comment region ') for v in self.header.splitlines()),77)
        self.assertEqual([v['sourceFile'] for v in atlas['structures']],sorted(v['sourceFile'] for v in atlas['structures']))
        vertex_end = triangle_end = 0; totals = defaultdict(int)
        for number,region in enumerate(atlas['structures']):
            geometry = region['geometry']
            self.assertEqual(region['sourceRegionIndex'],number)
            self.assertEqual((geometry['vertexOffset'],geometry['triangleOffset']),(vertex_end,triangle_end))
            rows = self.vertices[vertex_end:vertex_end+geometry['vertices']]
            faces = self.faces[triangle_end:triangle_end+geometry['triangles']]
            self.assertEqual(len(rows),geometry['vertices'])
            for row in rows:
                self.assertEqual(row[6],number); self.assertTrue(all(math.isfinite(v) for v in row[:6]))
                self.assertAlmostEqual(math.hypot(*row[3:6]),1,places=6)
            for axis in range(3):
                self.assertEqual(min(v[axis] for v in rows),geometry['boundsSourceUnits'][0][axis])
                self.assertEqual(max(v[axis] for v in rows),geometry['boundsSourceUnits'][1][axis])
            edges = defaultdict(list)
            for face in faces:
                self.assertEqual(face[0],3); a,b,c = face[1:]
                self.assertTrue(all(vertex_end <= v < vertex_end+len(rows) for v in (a,b,c)))
                for left,right in ((a,b),(b,c),(c,a)): edges[tuple(sorted((left,right)))].append((left,right))
            observed = {'boundaryEdges':sum(len(v)==1 for v in edges.values()),'nonmanifoldEdges':sum(len(v)>2 for v in edges.values()),
                        'inconsistentWindingEdges':sum(len(v)==2 and v[0]!=tuple(reversed(v[1])) for v in edges.values())}
            for key,value in observed.items(): self.assertEqual(value,geometry['sourceTopology'][key]); totals[key]+=value
            vertex_end+=geometry['vertices']; triangle_end+=geometry['triangles']
        self.assertEqual((vertex_end,triangle_end),(185779,374725))
        self.assertEqual(dict(totals),{'boundaryEdges':1411,'nonmanifoldEdges':2285,'inconsistentWindingEdges':11})
        self.assertEqual(atlas['statistics']['closedManifoldSourceRegions'],23)
        self.assertEqual(atlas['processing']['normalFallbackVertices'],0)

    def test_every_original_triangle_and_winding_is_retained(self):
        self.assertEqual(hashlib.sha256(ARCHIVE.read_bytes()).hexdigest(),ARCHIVE_SHA256)
        with zipfile.ZipFile(ARCHIVE) as source:
            for region in self.manifest['structures']:
                text = source.read(region['sourceFile']).decode('ascii')
                values = re.findall(r'(?m)^\s*vertex\s+([^\s]+)\s+([^\s]+)\s+([^\s]+)\s*$',text)
                geometry = region['geometry']
                self.assertEqual(len(values),geometry['triangles']*3)
                for triangle in range(geometry['triangles']):
                    face = self.faces[geometry['triangleOffset']+triangle]
                    for corner in range(3):
                        expected = struct.unpack('<3f',struct.pack('<3f',*map(float,values[triangle*3+corner])))
                        self.assertEqual(self.vertices[face[corner+1]][:3],expected)

    def test_input_identity_header_safety_and_normal_cancellation(self):
        with tempfile.TemporaryDirectory() as directory:
            fake = Path(directory)/'source.zip'; fake.write_bytes(b'fake')
            with self.assertRaises(ValueError): pinned_bytes(fake,4,ARCHIVE_SHA256)
        for filename in ('Surfaces/not-reviewed.stl','../source.stl'):
            with self.assertRaises(ValueError): source_identifier(filename)
        with self.assertRaises(ValueError):
            ply_header([{'id':'ema147:EMAPA:1','sourceFile':'Surfaces/EMAPA1_bad name.stl','sourceRegionIndex':0}],3,1)
        normals,fallbacks = display_normals([(0,0,0),(1,0,0),(0,1,0)],[0,1,2,0,2,1])
        self.assertEqual(fallbacks,3)
        self.assertEqual(normals,[(0.,0.,1.)]*3)

if __name__ == '__main__':
    unittest.main()
