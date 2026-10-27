#!/usr/bin/env python3
"""Regenerate source-bound declarations from the checked anatomy manifests."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
references = []
for directory, title, source_spacing, processing_spacing, method, description, limitations in [
    ('atlas', 'Lightweight: 17 regions', None, [0.4] * 3, 'Upstream tetrahedral boundary extraction',
     'Source-labelled regions from one male Digimouse specimen; incomplete system coverage.',
     ['Processing spacing does not establish anatomical accuracy.', 'No accepted spatial registration between the two references.']),
    ('atlas-volume', 'Volume: 21 regions', [0.1] * 3, [0.4] * 3, 'Categorical subsampling and tetrahedral isosurface extraction',
     'Source-labelled regions from one male Digimouse specimen; incomplete system coverage.',
     ['Processing spacing does not establish anatomical accuracy.', 'No accepted spatial registration between the two references.']),
    ('atlas-hindlimb', 'Hindlimb: 44 source regions', None, None, 'Source-labelled PRC surfaces converted to glTF using the declared file unit',
     'Right hindlimb and pelvis from one adult female C57BL/6 specimen. This regional reference is separate from the whole-body Digimouse models.',
     ['Source acquisition resolution does not establish surface accuracy or a uniform surface sampling spacing.',
      'No accepted registration to either Digimouse reference exists.',
      'The source figure contains 37 muscle-named surfaces; the publication reports 39 muscles and the difference is unresolved.']),
]:
    atlas = json.loads((ROOT / 'public' / directory / 'atlas.json').read_text())
    references.append({
        'id': atlas['id'], 'title': title, 'manifestUrl': f'/{directory}/atlas.json',
        'coordinateFrameId': atlas['coordinateFrame']['id'], 'assetSha256': atlas['statistics']['glbSha256'],
        'coverage': {'regionCount': len(atlas['structures']),
                     'systems': sorted({system for region in atlas['structures'] for system in region['systems']}),
                     'description': description},
        'processingResolution': {'sourceVoxelSpacingMm': source_spacing,
                                 'processingVoxelSpacingMm': processing_spacing, 'method': method,
                                 'limitations': limitations},
        'licenses': [{'identifier': atlas['source']['license'], 'url': atlas['source']['licenseUrl']}],
    })
(ROOT / 'data' / 'anatomy-references.json').write_text(json.dumps(references, indent=2) + '\n')
