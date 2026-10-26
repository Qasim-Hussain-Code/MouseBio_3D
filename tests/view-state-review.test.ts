import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { exportViewState, parseViewState, type ViewState } from '../src/domain/view-state';
import type { Atlas } from '../src/domain/types';

const atlas = JSON.parse(readFileSync(new URL('../public/atlas/atlas.json', import.meta.url), 'utf8')) as Atlas;
const state: ViewState = {
  mode: 'anatomical', selected: null, hidden: [], opacity: {}, clipAxis: 'off', clipPosition: 50,
  labels: true, background: 'dark', living: { playing: false, speed: 1, cardiac: true, respiratory: true },
};

test('translated camera poses must remain finite in the renderer Float32 coordinate range', () => {
  for (const translation of [1e100, -1e100]) {
    const cameraPose = { position: [translation, 0, 1], target: [translation, 0, 0], up: [0, 1, 0] };
    const document = JSON.parse(exportViewState(state, atlas));
    document.cameraPose = cameraPose;
    const result = parseViewState(JSON.stringify(document), atlas);
    assert.equal(result.ok, false);
    assert.equal(result.state, undefined);
    assert.ok(result.errors.length);
  }
});

test('ordinary translated camera poses preserve their position and viewing direction', () => {
  const input: ViewState = { ...state,
    cameraPose: { position: [0.1, 0.2, 0.3], target: [0.1, 0.2, 0.2], up: [0, 1, 0] } };
  const result = parseViewState(exportViewState(input, atlas), atlas);
  assert.equal(result.ok, true);
  assert.deepEqual(result.state?.cameraPose, input.cameraPose);
});
