/**
 * Compresses, in place and for a static host, the registered model files of a built web bundle.
 *
 * Each GLB or PLY named by a reference or detail registry is read, and its byte count and SHA-256 must match the
 * registry before anything is written. It is replaced by a gzip stream only when that stream unpacks to identical
 * bytes and saves at least a tenth. The application unpacks such a file as it downloads and checks the unpacked
 * bytes against the same registry, so the model shown is unchanged. The plain `npm run build` output, the local
 * launcher and the release archives keep uncompressed files.
 *
 * Usage: tsx scripts/compress_models.ts dist
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { gunzipSync, gzipSync } from 'node:zlib';

export type CompressionRecord = { url: string; bytes: number; storedBytes: number; outcome: 'compressed' | 'already' | 'kept' };

type Binding = { url: string; bytes: number; sha256: string };

const SAFE_URL = /^\/[A-Za-z0-9_./-]+\.(glb|ply)$/;
const sha256 = (data: Uint8Array) => createHash('sha256').update(data).digest('hex');
const isGzip = (data: Uint8Array) => data.length >= 2 && data[0] === 0x1f && data[1] === 0x8b;

function readJson(file: string): Record<string, unknown> {
  const value: unknown = JSON.parse(readFileSync(file, 'utf8'));
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${file} is not a JSON object.`);
  return value as Record<string, unknown>;
}

function binding(url: unknown, bytes: unknown, hash: unknown, where: string): Binding {
  if (typeof url !== 'string' || !SAFE_URL.test(url) || url.split('/').some((part) => part === '..' || part === '.')
      || typeof bytes !== 'number' || !Number.isSafeInteger(bytes) || bytes <= 0
      || typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash)) throw new Error(`Invalid model binding in ${where}.`);
  return { url, bytes, sha256: hash };
}

/** The GLB and PLY files that the application fetches through its checked loader, with their registered sizes and digests. */
export function registeredModels(dist: string): Binding[] {
  const models: Binding[] = [];
  for (const entry of readdirSync(dist, { withFileTypes: true })) {
    const manifest = path.join(dist, entry.name, 'atlas.json');
    if (!entry.isDirectory() || !existsSync(manifest)) continue;
    const atlas = readJson(manifest), statistics = (atlas.statistics ?? {}) as Record<string, unknown>;
    const format = atlas.assetFormat ?? 'glb';
    if (format === 'glb') models.push(binding(atlas.assetUrl, statistics.glbBytes, statistics.glbSha256, manifest));
    else if (format === 'ply-native-v1') models.push(binding(atlas.assetUrl, statistics.assetBytes, statistics.assetSha256, manifest));
    // Text and JSON references are compressed by the host itself.
    const details = path.join(dist, entry.name, 'detail-index.json');
    if (existsSync(details)) {
      const assets = readJson(details).assets;
      if (!Array.isArray(assets)) throw new Error(`${details} has no asset list.`);
      for (const asset of assets as Record<string, unknown>[]) models.push(binding(asset.assetUrl, asset.glbBytes, asset.glbSha256, details));
    }
  }
  return models;
}

export function compressModels(dist: string): CompressionRecord[] {
  const root = path.resolve(dist);
  // Only a finished bundle is changed; the tracked public/ directory never is.
  const index = path.join(root, 'index.html');
  if (!existsSync(index) || !existsSync(path.join(root, 'assets')) || path.basename(root) === 'public'
      || !/src="\/assets\/[^"]+\.js"/.test(readFileSync(index, 'utf8'))) throw new Error('The target is not a built web bundle.');
  const records: CompressionRecord[] = [], unique = new Map<string, Binding>();
  for (const model of registeredModels(root)) {
    const earlier = unique.get(model.url);
    if (earlier && (earlier.bytes !== model.bytes || earlier.sha256 !== model.sha256)) throw new Error(`${model.url} has two different registrations.`);
    unique.set(model.url, model);
  }
  for (const model of unique.values()) {
    const file = path.join(root, ...model.url.slice(1).split('/'));
    if (!file.startsWith(root + path.sep) || !statSync(file).isFile()) throw new Error(`${model.url} is missing from the bundle.`);
    const stored = readFileSync(file);
    const plain = isGzip(stored) ? gunzipSync(stored) : stored;
    if (plain.length !== model.bytes || sha256(plain) !== model.sha256) throw new Error(`${model.url} does not match its registry.`);
    if (plain !== stored) { records.push({ url: model.url, bytes: model.bytes, storedBytes: stored.length, outcome: 'already' }); continue; }
    const packed = gzipSync(plain, { level: 9 });
    if (!gunzipSync(packed).equals(plain)) throw new Error(`${model.url} did not survive compression unchanged.`);
    if (packed.length > model.bytes * 0.9) { records.push({ url: model.url, bytes: model.bytes, storedBytes: model.bytes, outcome: 'kept' }); continue; }
    const temporary = `${file}.compressing`;
    writeFileSync(temporary, packed, { flag: 'wx' });
    renameSync(temporary, file);
    records.push({ url: model.url, bytes: model.bytes, storedBytes: packed.length, outcome: 'compressed' });
  }
  return records;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const records = compressModels(process.argv[2] ?? 'dist');
    const before = records.reduce((sum, record) => sum + record.bytes, 0), after = records.reduce((sum, record) => sum + record.storedBytes, 0);
    for (const record of records) console.log(`${record.outcome.padEnd(10)} ${String(record.bytes).padStart(10)} -> ${String(record.storedBytes).padStart(10)}  ${record.url}`);
    console.log(`${records.length} registered model files, ${before} bytes stored as ${after}.`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
