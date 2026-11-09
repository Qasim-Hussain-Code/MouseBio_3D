/** Byte-level checks of the bounded asset fetch, with plain and gzip-compressed bodies; no browser rendering is involved. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { gzipSync } from 'node:zlib';
import { fetchBoundAnatomyBytes, type AssetTransferProgress } from '../src/viewer/asset-fetch';

const URL_GLB = '/atlas-living/living-mouse.glb';
const digest = (data: Uint8Array) => createHash('sha256').update(data).digest('hex');

/** A GLB-like body: the binary glTF magic followed by repetitive, compressible bytes. */
function modelBytes(length = 300_000) {
  const data = new Uint8Array(length);
  data.set([0x67, 0x6c, 0x54, 0x46]);
  for (let index = 4; index < length; index++) data[index] = (index * 7) % 251 < 40 ? index % 13 : 0;
  return data;
}

/** A fetcher that streams the body in fixed chunks, as a network would. */
function serve(body: Uint8Array, headers: Record<string, string> = {}, chunk = 16_384): typeof fetch {
  return (async () => new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      for (let start = 0; start < body.length; start += chunk) controller.enqueue(body.slice(start, start + chunk));
      controller.close();
    },
  }), { status: 200, headers: { 'content-length': String(body.length), ...headers } })) as typeof fetch;
}

const fetchModel = (data: Uint8Array, fetcher: typeof fetch, onProgress?: (progress: AssetTransferProgress) => void, extension: 'glb' | 'json' = 'glb') =>
  fetchBoundAnatomyBytes(extension === 'glb' ? URL_GLB : '/atlas-vascular/lines.json', data.length, digest(data), new AbortController().signal, extension, fetcher, { onProgress });

test('a plain model is returned unchanged with progress to its registered size', async () => {
  const data = modelBytes(), events: AssetTransferProgress[] = [];
  const bytes = new Uint8Array(await fetchModel(data, serve(data), (event) => events.push(event)));
  assert.deepEqual(bytes, data);
  assert.ok(events.length > 1);
  assert.ok(events.every((event, index) => index === 0 || event.assetBytes >= events[index - 1].assetBytes));
  assert.deepEqual(events.at(-1), { assetBytes: data.length, assetTotal: data.length, transferred: data.length, transferTotal: data.length, compressed: false });
});

test('a gzip-compressed model unpacks to the identical registered bytes', async () => {
  const data = modelBytes(), packed = gzipSync(data, { level: 9 }), events: AssetTransferProgress[] = [];
  assert.ok(packed.length < data.length / 2);
  const bytes = new Uint8Array(await fetchModel(data, serve(packed), (event) => events.push(event)));
  assert.deepEqual(bytes, data);
  const last = events.at(-1)!;
  assert.equal(last.compressed, true);
  assert.equal(last.assetBytes, data.length);
  assert.equal(last.transferred, packed.length);
  assert.equal(last.transferTotal, packed.length);
});

test('a gzip stream split before its second byte is still recognized', async () => {
  const data = modelBytes(), packed = gzipSync(data);
  assert.deepEqual(new Uint8Array(await fetchModel(data, serve(packed, {}, 1))), data);
});

test('a compressed body whose content differs from the registry is refused', async () => {
  const data = modelBytes(), other = modelBytes(); other[1000] ^= 1;
  await assert.rejects(fetchModel(data, serve(gzipSync(other))), /checksum does not match/);
});

test('a compressed body that unpacks beyond the registered size is refused', async () => {
  const data = modelBytes(), larger = new Uint8Array(data.length * 4); larger.set(data);
  await assert.rejects(fetchModel(data, serve(gzipSync(larger))), /exceeds its declared byte limit/);
});

test('a truncated gzip stream is refused', async () => {
  const data = modelBytes(), packed = gzipSync(data);
  await assert.rejects(fetchModel(data, serve(packed.subarray(0, packed.length - 20))), /could not be unpacked|byte count does not match/);
});

test('a body already decoded by the host is read as the registered bytes, without a transfer size', async () => {
  const data = modelBytes(), events: AssetTransferProgress[] = [];
  const bytes = new Uint8Array(await fetchModel(data, serve(data, { 'content-encoding': 'gzip' }), (event) => events.push(event)));
  assert.deepEqual(bytes, data);
  assert.equal(events.at(-1)!.transferTotal, null);
  assert.equal(events.at(-1)!.compressed, false);
});

test('gzip bytes are unpacked only for model files', async () => {
  const data = modelBytes();
  await assert.rejects(fetchModel(data, serve(gzipSync(data)), undefined, 'json'), /byte count does not match|checksum does not match/);
});

test('a browser without DecompressionStream reports that it cannot unpack the model', async () => {
  const data = modelBytes(), saved = Object.getOwnPropertyDescriptor(globalThis, 'DecompressionStream');
  Object.defineProperty(globalThis, 'DecompressionStream', { configurable: true, writable: true, value: undefined });
  try { await assert.rejects(fetchModel(data, serve(gzipSync(data))), /cannot unpack/); }
  finally { if (saved) Object.defineProperty(globalThis, 'DecompressionStream', saved); }
});

test('an abort during a compressed download stops it as an abort', async () => {
  const data = modelBytes(), controller = new AbortController();
  const pending = fetchBoundAnatomyBytes(URL_GLB, data.length, digest(data), controller.signal, 'glb', serve(gzipSync(data), {}, 512),
    { onProgress: (event) => { if (event.assetBytes > 1000) controller.abort(); } });
  await assert.rejects(pending, (error: unknown) => error instanceof DOMException && error.name === 'AbortError');
});
