#!/usr/bin/env python3
"""Regenerate source-bound declarations from the checked anatomy manifests."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
references = []
for directory, title, source_spacing, processing_spacing, method in [
    ('atlas', 'Lightweight: 17 regions', None, [0.4] * 3, 'Upstream tetrahedral boundary extraction'),
    ('atlas-volume', 'Volume: 21 regions', [0.1] * 3, [0.4] * 3, 'Categorical subsampling and tetrahedral isosurface extraction'),
]:
    atlas = json.loads((ROOT / 'public' / directory / 'atlas.json').read_text())
    references.append({
        'id': atlas['id'], 'title': title, 'manifestUrl': f'/{directory}/atlas.json',
        'coordinateFrameId': atlas['coordinateFrame']['id'], 'assetSha256': atlas['statistics']['glbSha256'],
        'coverage': {'regionCount': len(atlas['structures']),
                     'systems': sorted({system for region in atlas['structures'] for system in region['systems']}),
                     'description': 'Source-labelled regions from one male Digimouse specimen; incomplete system coverage.'},
        'processingResolution': {'sourceVoxelSpacingMm': source_spacing,
                                 'processingVoxelSpacingMm': processing_spacing, 'method': method,
                                 'limitations': ['Processing spacing does not establish anatomical accuracy.',
                                                 'No accepted spatial registration between the two references.']},
        'licenses': [{'identifier': atlas['source']['license'], 'url': 'https://creativecommons.org/licenses/by-sa/4.0/'}],
    })
(ROOT / 'data' / 'anatomy-references.json').write_text(json.dumps(references, indent=2) + '\n')
