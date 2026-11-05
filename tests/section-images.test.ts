/**
 * The coregistered Digimouse images shown on a virtual section. Numerical and
 * packaging checks; actual pixels on the cut face need browser inspection.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import type { Atlas } from '../src/domain/types';
import { inflateRaw, parseSectionImages, sectionImagesApplyTo, sectionLayer, sectionTextureCoordinate, sectionTextureSize, setGreyVolume, setLabelMask,
  setPhotographPlane, SECTION_IMAGES_URL, type SectionGreyLayer, type SectionPhotographLayer } from '../src/domain/section-images';

const read = (path: string) => readFile(new URL(`../public${path}`, import.meta.url));
const raw = JSON.parse((await read(SECTION_IMAGES_URL)).toString('utf8'));
const atlas = JSON.parse((await read('/atlas-volume/atlas.json')).toString('utf8')) as Atlas;
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

test('the shipped manifest binds the registered-volume reference and rejects altered bindings', () => {
  const parsed = parseSectionImages(raw, atlas);
  assert.equal(parsed.ok, true, parsed.errors.join(' '));
  assert.deepEqual(parsed.manifest!.dimensions, [380, 992, 208]);
  assert.deepEqual(parsed.manifest!.layers.map((layer) => layer.id), ['cryosection', 'ct']);
  assert.ok(parsed.manifest!.limitations.some((limitation) => /frozen postmortem/.test(limitation)));
  for (const id of ['digimouse-tessellated-v1', 'charles2016-hindlimb-v1', 'rosenhain2018-m01-native-v1']) assert.equal(sectionImagesApplyTo({ id }), false);
  assert.equal(sectionImagesApplyTo(atlas), true);
  assert.equal(parseSectionImages(raw, { id: 'digimouse-tessellated-v1', coordinateFrame: atlas.coordinateFrame }).ok, false);
  assert.equal(parseSectionImages(raw, { id: atlas.id, coordinateFrame: { id: 'other-frame' } }).ok, false);
  for (const change of [
    (value: typeof raw) => { value.schemaVersion = 'other'; },
    (value: typeof raw) => { value.dimensions = [380, 992]; },
    (value: typeof raw) => { value.layers[0].assetUrl = 'https://example.org/a.bin'; },
    (value: typeof raw) => { value.layers[0].assetUrl = '/atlas-volume/sections/../../a.bin'; },
    (value: typeof raw) => { value.layers[0].assetSha256 = 'abc'; },
    (value: typeof raw) => { value.layers[0].slices[3][0] += 1; },
    (value: typeof raw) => { value.layers[0].slices.pop(); },
    (value: typeof raw) => { value.layers[0].assetBytes += 1; },
    (value: typeof raw) => { value.layers[1].expandedBytes = 10; },
    (value: typeof raw) => { value.labels.expandedSha256 = 'x'; },
    (value: typeof raw) => { value.layers.push(value.layers[0]); },
    (value: typeof raw) => { value.limitations = []; },
  ]) {
    const altered = structuredClone(raw); change(altered);
    assert.equal(parseSectionImages(altered, atlas).ok, false);
  }
});

test('the shipped streams match their bindings, and the slices are complete JPEGs without metadata segments', async () => {
  const manifest = parseSectionImages(raw, atlas).manifest!;
  const photograph = sectionLayer(manifest, 'cryosection') as SectionPhotographLayer, ct = sectionLayer(manifest, 'ct') as SectionGreyLayer;
  const stack = new Uint8Array(await read(photograph.assetUrl));
  assert.equal(stack.length, photograph.assetBytes);
  assert.equal(sha(stack), photograph.assetSha256);
  for (const [offset, length] of photograph.slices) {
    assert.deepEqual([stack[offset], stack[offset + 1], stack[offset + length - 2], stack[offset + length - 1]], [0xFF, 0xD8, 0xFF, 0xD9]);
    let cursor = offset + 2;
    while (stack[cursor + 1] !== 0xDA) {
      assert.equal(stack[cursor], 0xFF);
      assert.ok([0xE0, 0xDB, 0xC0, 0xC4, 0xDD].includes(stack[cursor + 1]), `marker ${stack[cursor + 1].toString(16)}`);
      cursor += 2 + (stack[cursor + 2] << 8 | stack[cursor + 3]);
    }
  }
  for (const entry of [ct, manifest.labels]) {
    const stream = await read(entry.assetUrl);
    assert.equal(sha(stream), entry.assetSha256);
    const expanded = await inflateRaw(stream.buffer.slice(stream.byteOffset, stream.byteOffset + stream.byteLength) as ArrayBuffer, entry.expandedBytes);
    assert.equal(sha(expanded), entry.expandedSha256);
  }
  await assert.rejects(inflateRaw(new Uint8Array(await read(manifest.labels.assetUrl)).buffer as ArrayBuffer, 10), /unexpected size/);
});

test('the recorded checks show the slice orientation and the CT value ranges of the source', () => {
  const [photograph, ct] = raw.layers;
  assert.equal(photograph.orientationCheck.length, 5);
  for (const row of photograph.orientationCheck) {
    assert.ok(row.identity > 0.99, `slice ${row.slice}`);
    assert.ok(row.identity > row.flippedX && row.identity > row.flippedY);
  }
  assert.ok(ct.meanValueByLabel['2'] > ct.meanValueByLabel['1'] && ct.meanValueByLabel['1'] > ct.meanValueByLabel['0']);
});

test('image texels and surfaces share the voxel-centre convention of the source grid', () => {
  const dimensions = [380, 992, 208] as const, spacing = [0.1, 0.1, 0.1] as const;
  assert.deepEqual(sectionTextureSize(dimensions), [190, 496, 208]);
  const centre = (index: number, size: number) => (index + 0.5) / size;
  const coordinate = sectionTextureCoordinate([0, 0.0991, 0.0207], spacing, dimensions);
  assert.ok(Math.abs(coordinate[0] - centre(0, 380)) < 1e-12);
  assert.ok(Math.abs(coordinate[1] - centre(991, 992)) < 1e-9);
  assert.ok(Math.abs(coordinate[2] - centre(207, 208)) < 1e-9);
  // Every extracted surface lies inside the image grid.
  for (const structure of atlas.structures as unknown as { geometry: { boundsMeters: number[][] } }[]) {
    for (const corner of structure.geometry.boundsMeters) {
      const uvw = sectionTextureCoordinate(corner as unknown as readonly [number, number, number], spacing, dimensions);
      assert.ok(uvw.every((value) => value >= 0 && value <= 1));
    }
  }
});

test('downsampling averages source values and marks only the labelled body', () => {
  const dimensions = [4, 2, 2] as const, size = sectionTextureSize(dimensions);
  assert.deepEqual(size, [2, 1, 2]);
  const volume = new Uint8Array(size[0] * size[1] * size[2] * 4);
  const values = Uint8Array.from([10, 20, 100, 100, 30, 40, 100, 100, 0, 0, 0, 0, 0, 0, 200, 200]);
  setGreyVolume(volume, values, dimensions);
  assert.deepEqual([...volume].filter((_, index) => index % 4 === 0), [25, 100, 0, 100]);
  const labels = Uint8Array.from([0, 0, 1, 1, 0, 3, 2, 2, 0, 0, 0, 0, 0, 0, 0, 0]);
  setLabelMask(volume, labels, dimensions);
  assert.deepEqual([...volume].filter((_, index) => index % 4 === 3), [64, 255, 0, 0]);
  const plane = new Uint8Array(2 * 4).fill(7);
  setPhotographPlane(volume, plane, 1, size);
  assert.deepEqual([...volume.subarray(8, 12)], [7, 7, 7, 0]);
  assert.deepEqual([...volume.subarray(0, 4)], [25, 25, 25, 64]);
});
