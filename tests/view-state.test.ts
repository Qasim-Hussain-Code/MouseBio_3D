import test from 'node:test';
import assert from 'node:assert/strict';
import { exportViewState, parseViewState, MAX_VIEW_STATE_BYTES, VIEW_STATE_SCHEMA_VERSION } from '../src/domain/view-state';
import type { ViewState } from '../src/domain/view-state';
import type { Atlas } from '../src/domain/types';

const atlas: Atlas = {
  id: 'fixture-atlas-v1', title: 'Synthetic schema fixture', assetUrl: '/fixture.glb',
  coordinateFrame: { id: 'fixture-frame-v1' }, source: {},
  structures: [
    { id: 'fixture:1', name: 'Fixture one', systems: ['skeletal'], sourceLabel: 'one', meshNode: 'fixture:1' },
    { id: 'fixture:2', name: 'Fixture two', systems: ['cardiovascular'], sourceLabel: 'two', meshNode: 'fixture:2' },
    { id: 'fixture:3', name: 'Fixture three', systems: ['respiratory'], sourceLabel: 'three', meshNode: 'fixture:3' },
  ],
  statistics: { glbSha256: 'a'.repeat(64) }, limitations: ['Synthetic test metadata only.'],
};
const state: ViewState = {
  mode: 'living', selected: 'fixture:2', hidden: ['fixture:3'], opacity: { 'fixture:1': 0.1, 'fixture:2': 0.75, 'fixture:3': 1 },
  clipAxis: 'x', clipPosition: 42, labels: true, background: 'dark',
  cameraPose: { position: [1, 2, 3], target: [0, 0, 0], up: [0, 0, 1] },
  living: { playing: false, speed: 0.5, cardiac: true, respiratory: false },
};
const saved = () => JSON.parse(exportViewState(state, atlas)) as Record<string, unknown>;
const parse = (document: Record<string, unknown>) => parseViewState(JSON.stringify(document), atlas);

test('view-state round trip preserves settings and camera roll with exact source binding', () => {
  const text = exportViewState(state, atlas);
  const document = JSON.parse(text);
  assert.equal(document.schemaVersion, VIEW_STATE_SCHEMA_VERSION);
  assert.equal(document.atlasId, atlas.id);
  assert.equal(document.assetSha256, atlas.statistics.glbSha256);
  assert.equal(document.coordinateFrameId, atlas.coordinateFrame.id);
  const result = parseViewState(text, atlas);
  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.state, state);
  assert.equal(exportViewState(result.state!, atlas), text);
});

test('view state can omit a camera before the renderer is ready and keep a null selection', () => {
  const withoutCamera: ViewState = { ...state, selected: null, hidden: [], opacity: {}, mode: 'anatomical' };
  delete withoutCamera.cameraPose;
  const result = parseViewState(exportViewState(withoutCamera, atlas), atlas);
  assert.equal(result.ok, true);
  assert.deepEqual(result.state, withoutCamera);
  assert.equal(Object.hasOwn(result.state!, 'cameraPose'), false);
  assert.throws(() => exportViewState({ ...state, cameraPose: undefined }, atlas), /cameraPose/);
});

test('all four modes and continuous supported display speeds round trip', () => {
  for (const mode of ['anatomical', 'living', 'experimental', 'comparative'] as const) {
    for (const speed of [0.25, 0.5, 1.125, 4]) {
      const input = { ...state, mode, living: { ...state.living, speed } };
      assert.deepEqual(parseViewState(exportViewState(input, atlas), atlas).state, input);
    }
  }
});

test('dark and white backgrounds round trip in every mode without changing anatomy or adding observations', () => {
  for (const background of ['dark', 'white'] as const) {
    for (const mode of ['anatomical', 'living', 'experimental', 'comparative'] as const) {
      const input: ViewState = { ...state, mode, background };
      const before = structuredClone(input);
      const text = exportViewState(input, atlas);
      const document = JSON.parse(text);
      assert.equal(document.background, background);
      assert.equal(document.atlasId, atlas.id);
      assert.equal(document.assetSha256, atlas.statistics.glbSha256);
      assert.equal(document.coordinateFrameId, atlas.coordinateFrame.id);
      assert.equal(Object.hasOwn(document, 'measurements'), false);
      assert.equal(Object.hasOwn(document, 'dataset'), false);
      assert.deepEqual(parseViewState(text, atlas).state, before);
      assert.deepEqual(input, before);
    }
  }
});

test('earlier bound v1 documents without a background migrate to canonical dark views', () => {
  const legacy = saved();
  delete legacy.background;
  const original = structuredClone(legacy);
  const result = parse(legacy);
  assert.equal(result.ok, true);
  assert.deepEqual(result.state, state);
  assert.deepEqual(legacy, original);
  const canonical = JSON.parse(exportViewState(result.state!, atlas));
  assert.equal(canonical.schemaVersion, VIEW_STATE_SCHEMA_VERSION);
  assert.equal(canonical.background, 'dark');
  for (const [field, value] of [['atlasId', 'other-atlas'], ['assetSha256', 'b'.repeat(64)], ['coordinateFrameId', 'other-frame']]) {
    const invalid = parse({ ...legacy, [field]: value });
    assert.equal(invalid.ok, false, field);
    assert.equal(invalid.state, undefined);
  }
  const unbound = { ...legacy };
  delete unbound.assetSha256;
  assert.equal(parse(unbound).ok, false);
  assert.equal(parse({ ...legacy, selected: 'unknown:1' }).ok, false);
});

test('invalid explicit background values fail atomically instead of triggering legacy defaults', () => {
  for (const background of ['light', 'Dark', 'WHITE', '', '#ffffff', 0, true, null, {}, []]) {
    const result = parse({ ...saved(), background });
    assert.equal(result.ok, false);
    assert.equal(result.state, undefined);
    assert.ok(result.errors.some((message) => message.includes('background')));
  }
  const withoutBackground = { ...state } as Partial<ViewState>;
  delete withoutBackground.background;
  assert.throws(() => exportViewState(withoutBackground as ViewState, atlas), /background/);
  assert.throws(() => exportViewState({ ...state, background: undefined } as unknown as ViewState, atlas), /background/);
});

test('wrong atlas, asset checksum, frame and schema fail atomically', () => {
  for (const [field, value] of [
    ['atlasId', 'other-atlas'], ['assetSha256', 'b'.repeat(64)],
    ['coordinateFrameId', 'other-frame'], ['schemaVersion', 'mousebio.view.v2'],
  ]) {
    const result = parse({ ...saved(), [field]: value });
    assert.equal(result.ok, false, field);
    assert.equal(result.state, undefined);
    assert.ok(result.errors.length > 0);
  }
});

test('missing binding metadata cannot be silently inferred from the currently open anatomy', () => {
  for (const field of ['atlasId', 'assetSha256', 'coordinateFrameId', 'schemaVersion']) {
    const document = saved();
    delete document[field];
    assert.equal(parse(document).ok, false, field);
  }
  assert.throws(() => exportViewState(state, { ...atlas, statistics: {} }), /checksum/);
  assert.throws(() => exportViewState(state, { ...atlas, coordinateFrame: {} }), /coordinate-frame/);
});

test('malformed JSON, nonobjects and oversized UTF-8 documents are rejected', () => {
  for (const text of ['{', '[]', 'null', '1', '"view"', '', 'undefined']) {
    const result = parseViewState(text, atlas);
    assert.equal(result.ok, false, text);
    assert.equal(result.state, undefined);
  }
  assert.equal(parseViewState(' '.repeat(MAX_VIEW_STATE_BYTES + 1), atlas).ok, false);
  assert.match(parseViewState('é'.repeat(MAX_VIEW_STATE_BYTES / 2 + 1), atlas).errors[0], /1 MiB/);
  assert.equal(parseViewState(`\uFEFF${exportViewState(state, atlas)}`, atlas).ok, true);
});

test('unknown fields, research observations and unsafe prototype keys are rejected at every level', () => {
  for (const field of ['measurements', 'dataset', 'rows', 'note', '__proto__', 'constructor', 'prototype']) {
    const document = saved();
    Object.defineProperty(document, field, { enumerable: true, value: [] });
    assert.equal(parse(document).ok, false, field);
  }
  const unsafeOpacity = JSON.parse('{"__proto__":0.5}');
  const unsafeLiving = JSON.parse('{"playing":false,"speed":0.5,"cardiac":true,"respiratory":false,"constructor":{}}');
  const unsafeCamera = JSON.parse('{"position":[1,2,3],"target":[0,0,0],"up":[0,0,1],"__proto__":{}}');
  const nested = [
    { ...saved(), living: { ...state.living, dataset: [] } },
    { ...saved(), cameraPose: { ...state.cameraPose, extra: true } },
    { ...saved(), opacity: unsafeOpacity },
    { ...saved(), living: unsafeLiving },
    { ...saved(), cameraPose: unsafeCamera },
  ];
  for (const document of nested) assert.equal(parse(document).ok, false);
  assert.equal(Object.prototype.hasOwnProperty.call(Object.prototype, 'polluted'), false);
});

test('selection and hidden lists require unique known anatomical identifiers', () => {
  for (const selected of ['unknown:1', 2, {}, false]) assert.equal(parse({ ...saved(), selected }).ok, false);
  for (const hidden of [null, 'fixture:1', ['unknown:1'], ['fixture:1', 'fixture:1'], [1], ['fixture:1', 'fixture:2', 'fixture:3', 'fixture:1']]) {
    assert.equal(parse({ ...saved(), hidden }).ok, false);
  }
  const result = parse({ ...saved(), selected: 'fixture:1', hidden: ['fixture:3', 'fixture:1'] });
  assert.equal(result.ok, true);
  assert.deepEqual(result.state?.hidden, ['fixture:1', 'fixture:3']);
});

test('opacity, clipping and boolean controls cannot be coerced from unsafe values', () => {
  for (const opacity of [null, [], { unknown: 0.5 }, { 'fixture:1': -0.01 }, { 'fixture:1': 1.01 }, { 'fixture:1': '0.5' }, { 'fixture:1': null }]) {
    assert.equal(parse({ ...saved(), opacity }).ok, false);
  }
  for (const clipPosition of [-1, 101, '50', null]) assert.equal(parse({ ...saved(), clipPosition }).ok, false);
  for (const clipAxis of ['anterior', 'X', 1, null]) assert.equal(parse({ ...saved(), clipAxis }).ok, false);
  for (const labels of [0, 'true', null]) assert.equal(parse({ ...saved(), labels }).ok, false);
  assert.throws(() => exportViewState({ ...state, opacity: { 'fixture:1': NaN } }, atlas), /opacity/);
  assert.throws(() => exportViewState({ ...state, clipPosition: Infinity }, atlas), /clipPosition/);
});

test('living settings are complete, strictly typed and bounded', () => {
  for (const living of [null, [], {}, { ...state.living, speed: 0 }, { ...state.living, speed: 4.1 },
    { ...state.living, speed: '1' }, { ...state.living, playing: 1 }, { ...state.living, cardiac: 'false' },
    { ...state.living, respiratory: null }]) assert.equal(parse({ ...saved(), living }).ok, false);
  const document = saved();
  delete document.labels;
  assert.equal(parse(document).ok, false);
  assert.equal(parse({ ...saved(), mode: 'invented' }).ok, false);
});

test('camera validation rejects nonfinite coordinates and degenerate or parallel directions', () => {
  for (const cameraPose of [
    null, {}, { ...state.cameraPose, up: [0, 1] }, { ...state.cameraPose, position: [1, 2, '3'] },
    { position: [0, 0, 0], target: [0, 0, 0], up: [0, 1, 0] },
    { position: [0, 0, 1], target: [0, 0, 0], up: [0, 0, 0] },
    { position: [0, 0, 1], target: [0, 0, 0], up: [0, 0, 1] },
    { position: [0, 0, 1], target: [0, 0, 0], up: [0, 0, -1] },
    { position: [0, 0, 1], target: [0, 0, 0], up: [0, 1e-14, 1] },
    { position: [1.7e308, 0, 0], target: [-1.7e308, 0, 0], up: [0, 1, 0] },
    { position: [0, 0, 1], target: [0, 0, 0], up: [1.7e308, 1.7e308, 1.7e308] },
    { position: [0, 0, 1e-320], target: [0, 0, 0], up: [0, 1, 0] },
    { position: [0, 0, 1e308], target: [0, 0, 0], up: [0, 1, 0] },
    { position: [0, 0, 1], target: [0, 0, 0], up: [0, 1e-320, 0] },
    { position: [0, 0, 1], target: [0, 0, 0], up: [0, 1e308, 0] },
    { position: [0, 0, 1], target: [0, 0, 0], up: [1e-170, 0, 1e-160] },
    { position: [1e100, 0, 1], target: [1e100, 0, 0], up: [0, 1, 0] },
  ]) assert.equal(parse({ ...saved(), cameraPose }).ok, false);
  assert.throws(() => exportViewState({ ...state, cameraPose: { position: [Infinity, 0, 0], target: [0, 0, 0], up: [0, 1, 0] } }, atlas), /finite/);
  assert.equal(parse({ ...saved(), cameraPose: { position: [0, 0, 1], target: [0, 0, 0], up: [0, 2, 0] } }).ok, true);
});

test('normalization does not mutate caller settings and exports contain no experimental data fields', () => {
  const input: ViewState = { ...state, hidden: ['fixture:3', 'fixture:1'], opacity: { 'fixture:3': 1, 'fixture:1': 0.1 } };
  const original = structuredClone(input);
  const text = exportViewState(input, atlas);
  assert.deepEqual(input, original);
  const document = JSON.parse(text);
  assert.deepEqual(document.hidden, ['fixture:1', 'fixture:3']);
  for (const name of ['measurements', 'dataset', 'replicate', 'condition', 'value', 'sourceReference']) assert.equal(Object.hasOwn(document, name), false);
  const result = parseViewState(text, atlas);
  result.state!.hidden.push('fixture:2');
  result.state!.cameraPose!.up[0] = 1;
  assert.deepEqual(input, original);
});
