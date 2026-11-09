/** The host build step that stores registered model files gzip-compressed, on a synthetic bundle in a temporary folder. */
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, test } from 'node:test';
import { gunzipSync } from 'node:zlib';
import { compressModels, registeredModels } from '../scripts/compress_models';

const digest = (data: Uint8Array) => createHash('sha256').update(data).digest('hex');
const folders: string[] = [];
afterEach(() => { folders.splice(0).forEach((folder) => rmSync(folder, { recursive: true, force: true })); });

function compressible(length: number) {
  const data = Buffer.alloc(length);
  data.write('glTF');
  for (let index = 4; index < length; index++) data[index] = index % 97 < 30 ? index % 11 : 0;
  return data;
}

/** A built bundle with one GLB reference, one PLY reference, one detail surface and one JSON reference. */
function bundle(options: { living?: Buffer; registeredLiving?: Buffer; detail?: Buffer } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'mousebio-compress-')); folders.push(root);
  const living = options.living ?? compressible(200_000), registered = options.registeredLiving ?? living;
  const ply = Buffer.concat([Buffer.from('ply\nformat binary_little_endian 1.0\n'), compressible(80_000)]);
  const detail = options.detail ?? compressible(50_000);
  mkdirSync(path.join(root, 'assets'));
  writeFileSync(path.join(root, 'index.html'), '<script type="module" crossorigin src="/assets/index-abc.js"></script>');
  for (const folder of ['atlas-living', 'atlas-ema147', 'atlas-volume/detail', 'atlas-vascular']) mkdirSync(path.join(root, folder), { recursive: true });
  writeFileSync(path.join(root, 'atlas-living/living-mouse.glb'), living);
  writeFileSync(path.join(root, 'atlas-living/atlas.json'), JSON.stringify({ assetUrl: '/atlas-living/living-mouse.glb',
    statistics: { glbBytes: registered.length, glbSha256: digest(registered) } }));
  writeFileSync(path.join(root, 'atlas-ema147/ema147-native.ply'), ply);
  writeFileSync(path.join(root, 'atlas-ema147/atlas.json'), JSON.stringify({ assetUrl: '/atlas-ema147/ema147-native.ply', assetFormat: 'ply-native-v1',
    statistics: { assetBytes: ply.length, assetSha256: digest(ply) } }));
  writeFileSync(path.join(root, 'atlas-volume/detail/region-2.glb'), detail);
  writeFileSync(path.join(root, 'atlas-volume/atlas.json'), JSON.stringify({ assetUrl: '/atlas-volume/detail/region-2.glb',
    statistics: { glbBytes: detail.length, glbSha256: digest(detail) } }));
  writeFileSync(path.join(root, 'atlas-volume/detail-index.json'), JSON.stringify({ assets: [{ assetUrl: '/atlas-volume/detail/region-2.glb',
    glbBytes: detail.length, glbSha256: digest(detail) }] }));
  writeFileSync(path.join(root, 'atlas-vascular/lines.json'), '{"lines":[]}');
  writeFileSync(path.join(root, 'atlas-vascular/atlas.json'), JSON.stringify({ assetUrl: '/atlas-vascular/lines.json', assetFormat: 'polyline-native-v1',
    statistics: { assetBytes: 12, assetSha256: digest(Buffer.from('{"lines":[]}')) } }));
  return { root, living, ply, detail };
}

test('registered GLB and PLY files are stored as gzip streams that unpack to the registered bytes', () => {
  const { root, living, ply } = bundle();
  const records = compressModels(root);
  assert.deepEqual(registeredModels(root).map((model) => model.url).sort(),
    ['/atlas-ema147/ema147-native.ply', '/atlas-living/living-mouse.glb', '/atlas-volume/detail/region-2.glb', '/atlas-volume/detail/region-2.glb']);
  const stored = readFileSync(path.join(root, 'atlas-living/living-mouse.glb'));
  assert.deepEqual([stored[0], stored[1]], [0x1f, 0x8b]);
  assert.ok(gunzipSync(stored).equals(living));
  assert.ok(gunzipSync(readFileSync(path.join(root, 'atlas-ema147/ema147-native.ply'))).equals(ply));
  assert.equal(readFileSync(path.join(root, 'atlas-vascular/lines.json'), 'utf8'), '{"lines":[]}', 'text references are left to the host');
  assert.equal(records.length, 3, 'a file registered twice is compressed once');
  assert.ok(records.every((record) => record.outcome === 'compressed' && record.storedBytes < record.bytes));
});

test('a second run finds the files already compressed and changes nothing', () => {
  const { root } = bundle();
  compressModels(root);
  const before = readFileSync(path.join(root, 'atlas-living/living-mouse.glb'));
  assert.ok(compressModels(root).every((record) => record.outcome === 'already'));
  assert.ok(readFileSync(path.join(root, 'atlas-living/living-mouse.glb')).equals(before));
});

test('a file that differs from its registry is refused and left as it was', () => {
  const living = compressible(200_000), registered = Buffer.from(living); registered[500] ^= 1;
  const { root } = bundle({ living, registeredLiving: registered });
  assert.throws(() => compressModels(root), /does not match its registry/);
  assert.ok(readFileSync(path.join(root, 'atlas-living/living-mouse.glb')).equals(living));
});

test('a file that compresses by less than a tenth is kept as it is', () => {
  const detail = Buffer.concat([Buffer.from('glTF'), randomBytes(40_000)]);
  const { root } = bundle({ detail });
  const records = compressModels(root);
  assert.equal(records.find((record) => record.url === '/atlas-volume/detail/region-2.glb')?.outcome, 'kept');
  assert.ok(readFileSync(path.join(root, 'atlas-volume/detail/region-2.glb')).equals(detail));
});

test('one file registered with two different digests is refused', () => {
  const { root, detail } = bundle();
  const other = Buffer.from(detail); other[100] ^= 1;
  writeFileSync(path.join(root, 'atlas-volume/detail-index.json'), JSON.stringify({ assets: [{ assetUrl: '/atlas-volume/detail/region-2.glb',
    glbBytes: other.length, glbSha256: digest(other) }] }));
  assert.throws(() => compressModels(root), /two different registrations/);
});

test('a bundle built under a subpath, as for GitHub Pages, is recognized', () => {
  const { root, living } = bundle();
  writeFileSync(path.join(root, 'index.html'), '<script type="module" crossorigin src="/MouseBio_3D/assets/index-abc.js"></script>');
  compressModels(root);
  assert.ok(gunzipSync(readFileSync(path.join(root, 'atlas-living/living-mouse.glb'))).equals(living));
});

test('only a built bundle is changed, never the source folder', () => {
  const { root } = bundle();
  writeFileSync(path.join(root, 'index.html'), '<script type="module" src="/src/main.tsx"></script>');
  assert.throws(() => compressModels(root), /not a built web bundle/);
  const publicFolder = path.join(root, 'public'); mkdirSync(path.join(publicFolder, 'assets'), { recursive: true });
  writeFileSync(path.join(publicFolder, 'index.html'), '<script src="/assets/index-abc.js"></script>');
  assert.throws(() => compressModels(publicFolder), /not a built web bundle/);
});
