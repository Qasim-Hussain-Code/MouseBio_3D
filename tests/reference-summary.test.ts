import assert from 'node:assert/strict';
import test from 'node:test';
import { buildReferenceSummary } from '../src/domain/reference-summary';
import type { Atlas } from '../src/domain/types';

function atlas(overrides: Partial<Atlas> = {}): Atlas {
  return {
    id: 'synthetic-reference', title: 'Synthetic software fixture', assetUrl: '/synthetic.glb',
    coordinateFrame: { id: 'synthetic-frame' }, source: {}, structures: [], statistics: {}, limitations: [],
    ...overrides,
  };
}

test('declared female specimen and source metadata are preserved without biological or unit conversion', () => {
  const summary = buildReferenceSummary(atlas({
    specimen: {
      scientificName: 'Mus musculus', taxonomyId: 'NCBITaxon:10090', sex: 'female',
      strain: 'Synthetic strain declaration', age: { value: 12, unit: 'weeks' },
      mass: { value: 0.023, unit: 'kg' }, scope: 'individual', count: 1,
      description: 'Synthetic female specimen metadata for a software test.', sourceReference: 'synthetic-source',
    },
    source: {
      displayName: 'Declared reference name', citationLabel: 'Declared short citation',
      authors: ['Example A', 'Example B'], year: 2024, title: 'Synthetic source title',
      url: 'https://example.org/source', doi: '10.1234/synthetic.1',
      license: 'Declared synthetic license', licenseUrl: 'https://example.org/license',
      attribution: 'Required synthetic attribution.',
    },
  }));
  assert.deepEqual(summary.specimen, {
    scientificName: 'Mus musculus', sex: 'female', strain: 'Synthetic strain declaration',
    age: '12 weeks', mass: '0.023 kg', scope: 'individual', count: '1',
    description: 'Synthetic female specimen metadata for a software test.',
  });
  assert.deepEqual(summary.source, {
    displayName: 'Declared reference name', citationLabel: 'Declared short citation',
    authors: 'Example A; Example B', year: '2024', title: 'Synthetic source title',
    url: 'https://example.org/source', doi: '10.1234/synthetic.1', doiUrl: 'https://doi.org/10.1234/synthetic.1',
    license: 'Declared synthetic license', licenseUrl: 'https://example.org/license',
    attribution: 'Required synthetic attribution.',
  });
});

test('missing metadata stays unknown even with a familiar atlas ID or descriptive title', () => {
  const summary = buildReferenceSummary(atlas({ id: 'digimouse-tessellated-v1', title: 'Male 28 g mouse' }));
  assert.ok(Object.values(summary.specimen).every(value => value === 'Unknown'));
  assert.deepEqual(summary.source, {
    displayName: 'Unknown', citationLabel: 'Unknown', authors: 'Unknown', year: 'Unknown',
    title: 'Unknown', url: null, doi: 'Unknown', doiUrl: null, license: 'Unknown', licenseUrl: null, attribution: 'Unknown',
  });
});

test('bibliographic fallback assembles only declared authors, year and title', () => {
  const summary = buildReferenceSummary(atlas({ source: {
    authors: ['First Example', 'Second Example'], publicationYear: 2020, title: 'Declared source title',
  } }));
  assert.equal(summary.source.displayName, 'Declared source title');
  assert.equal(summary.source.citationLabel, 'First Example; Second Example; 2020; Declared source title');
  assert.equal(summary.source.year, '2020');
  assert.equal(buildReferenceSummary(atlas({ source: { authors: 'Declared consortium', year: 2021 } })).source.citationLabel,
    'Declared consortium; 2021');
  assert.equal(buildReferenceSummary(atlas({ source: { year: 2022, publicationYear: 2020 } })).source.year, '2022');
  for (const year of ['2021', Infinity, 2021.5, -1]) {
    assert.equal(buildReferenceSummary(atlas({ source: { publicationYear: year } })).source.year, 'Unknown');
  }
});

test('only absolute HTTPS links without credentials, controls or backslashes are exposed', () => {
  const unsafe = [
    'javascript:alert(1)', 'data:text/html,test', 'file:///tmp/source', 'http://example.org/source',
    '//example.org/source', 'https://user:secret@example.org/source', 'https://example.org/has space',
    'https://example.org/has\nnewline', 'https:\\example.org/source', 'https://example.org\\@other.example/source',
    'https://', 'not a URL',
  ];
  for (const value of unsafe) {
    const summary = buildReferenceSummary(atlas({ source: { url: value, licenseUrl: value, doi: value } }));
    assert.equal(summary.source.url, null, value);
    assert.equal(summary.source.licenseUrl, null, value);
    assert.equal(summary.source.doiUrl, null, value);
  }
  const safe = buildReferenceSummary(atlas({ source: {
    url: 'https://example.org/source?edition=2#methods', licenseUrl: 'https://example.org/license',
    doi: 'https://doi.org/10.1234/synthetic',
  } }));
  assert.equal(safe.source.url, 'https://example.org/source?edition=2#methods');
  assert.equal(safe.source.licenseUrl, 'https://example.org/license');
  assert.equal(safe.source.doiUrl, 'https://doi.org/10.1234/synthetic');
});

test('DOI text stays declared while invalid or path-normalizing DOI links are unavailable', () => {
  assert.equal(buildReferenceSummary(atlas({ source: { doi: '10.1234/item?query#section' } })).source.doiUrl,
    'https://doi.org/10.1234/item%3Fquery%23section');
  for (const doi of ['not a DOI', 'https://example.org/10.1234/item', '10.12/item', '10.1234/\ud800', '10.1234/../../other', '10.1234/./item']) {
    const summary = buildReferenceSummary(atlas({ source: { doi } }));
    assert.equal(summary.source.doi, doi);
    assert.equal(summary.source.doiUrl, null);
  }
});

test('invalid or incomplete specimen values stay unknown without invented population scope', () => {
  const specimen = {
    scientificName: 'Mus musculus', taxonomyId: 'NCBITaxon:10090', sex: 'unknown',
    sourceReference: 'synthetic-source', age: { value: -1, unit: 'weeks' },
    mass: { value: Infinity, unit: 'g' }, count: 1.5,
  } as const;
  const summary = buildReferenceSummary(atlas({ specimen }));
  assert.ok(Object.entries(summary.specimen).filter(([key]) => key !== 'scientificName').every(([, value]) => value === 'Unknown'));
  assert.equal(buildReferenceSummary(atlas({ specimen: { ...specimen, age: { value: 0, unit: 'days' } } })).specimen.age, '0 days');
  assert.equal(buildReferenceSummary(atlas({ specimen: { ...specimen, mass: { value: 0, unit: 'g' } } })).specimen.mass, 'Unknown');
  assert.equal(buildReferenceSummary(atlas({ source: { authors: ['Valid name', 5] } })).source.authors, 'Unknown');
});

test('formatting does not mutate frozen metadata or return experimental observations', () => {
  const input = atlas({
    source: Object.freeze({ title: 'Declared source', authors: Object.freeze(['Example author']) }),
    observations: [{ value: 42, condition: 'synthetic' }],
  });
  Object.freeze(input.structures);
  Object.freeze(input);
  const before = JSON.stringify(input);
  const summary = buildReferenceSummary(input);
  assert.equal(JSON.stringify(input), before);
  assert.equal(JSON.stringify(summary).includes('observations'), false);
  assert.equal(JSON.stringify(summary).includes('42'), false);
  summary.source.title = 'Edited local display';
  assert.equal(input.source.title, 'Declared source');
});

test('inherited fields and metadata accessors do not become declarations', () => {
  let calls = 0;
  const source = Object.create({ title: 'Inherited source', license: 'Inherited license' }) as Record<string, unknown>;
  Object.defineProperty(source, 'displayName', { get() { calls += 1; return 'Accessor source'; } });
  const summary = buildReferenceSummary(atlas({ source }));
  assert.equal(calls, 0);
  assert.equal(summary.source.displayName, 'Unknown');
  assert.equal(summary.source.title, 'Unknown');
  assert.equal(summary.source.license, 'Unknown');
});
