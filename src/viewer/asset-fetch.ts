const MAX_BYTES = 80 * 1024 * 1024;
type AssetExtension = 'glb' | 'ply' | 'txt' | 'json' | 'bin';
/** Model files that a static host may store gzip-compressed; the registry always describes the unpacked bytes. */
const COMPRESSIBLE: ReadonlySet<AssetExtension> = new Set(['glb', 'ply']);

/** How far one asset has arrived. Sizes are byte counts; nothing here is a measurement of the specimen. */
export type AssetTransferProgress = {
  /** Registered bytes received so far, after any unpacking. */
  assetBytes: number;
  /** Registered size of the asset. */
  assetTotal: number;
  /** Bytes taken from the network so far. */
  transferred: number;
  /** Size of the transfer when the server states it and has not re-encoded the body; otherwise null. */
  transferTotal: number | null;
  /** True when the body was a gzip stream unpacked here. */
  compressed: boolean;
};

export type AssetFetchOptions = { onProgress?: (progress: AssetTransferProgress) => void };

export function isLocalAnatomyPath(value: unknown, extension: AssetExtension): value is string {
  return typeof value === 'string' && new RegExp(`^/[A-Za-z0-9_./-]+\\.${extension}$`).test(value)
    && !value.startsWith('//') && value.slice(1).split('/').every((part) => part !== '' && part !== '.' && part !== '..');
}

function declaredTransferSize(response: Response): number | null {
  if (response.headers.get('content-encoding')) return null;
  const value = Number(response.headers.get('content-length'));
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

/** Read one bounded same-origin asset, with no external redirects or research payload.
 * A model file may arrive gzip-compressed; it is unpacked as it streams, and the unpacked bytes must still match the
 * registered byte count and SHA-256 exactly, so compression cannot change what is shown. */
export async function fetchBoundAnatomyBytes(url: string, expectedBytes: number, expectedHash: string,
  signal: AbortSignal, extension: AssetExtension, fetcher: typeof fetch = fetch, options: AssetFetchOptions = {}): Promise<ArrayBuffer> {
  if (!isLocalAnatomyPath(url, extension) || !Number.isSafeInteger(expectedBytes) || expectedBytes < 28 || expectedBytes > MAX_BYTES
      || !/^[a-f0-9]{64}$/.test(expectedHash)) throw new Error('Invalid local anatomical asset binding.');
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
  const response = await fetcher(url, { signal, credentials: 'same-origin', redirect: 'error' });
  if (!response.ok || response.type === 'opaque' || !response.body) throw new Error('The local anatomical asset could not be read.');
  const transferTotal = declaredTransferSize(response);
  const network = response.body.getReader();
  let transferred = 0;
  const take = async () => {
    const chunk = await network.read();
    if (!chunk.done) {
      transferred += chunk.value.byteLength;
      // A compressed body is never larger than the registered bytes it holds.
      if (transferred > expectedBytes) throw new Error('The anatomical asset exceeds its declared byte limit.');
    }
    return chunk;
  };
  // The first two bytes tell a gzip stream (1f 8b) from the registered bytes themselves.
  const head: Uint8Array[] = [];
  let headBytes = 0, ended = false;
  try {
    while (headBytes < 2) {
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
      const { done, value } = await take();
      if (done) { ended = true; break; }
      head.push(value); headBytes += value.byteLength;
    }
  } catch (error) { await network.cancel().catch(() => {}); network.releaseLock(); throw error; }
  const lead = head.flatMap((chunk) => [...chunk.subarray(0, 2)]).slice(0, 2);
  const compressed = COMPRESSIBLE.has(extension) && lead[0] === 0x1f && lead[1] === 0x8b;
  if (compressed && typeof DecompressionStream !== 'function') {
    await network.cancel().catch(() => {}); network.releaseLock();
    throw new Error('This browser cannot unpack the compressed anatomical asset.');
  }
  const body = new ReadableStream<Uint8Array>({
    start(controller) { head.forEach((chunk) => controller.enqueue(chunk)); if (ended) controller.close(); },
    async pull(controller) {
      const { done, value } = await take();
      if (done) controller.close(); else controller.enqueue(value);
    },
    cancel(reason) { return network.cancel(reason); },
  });
  // The DOM typing of the writable side is any BufferSource; what is written here is always a Uint8Array.
  const stream: ReadableStream<Uint8Array> = compressed
    ? body.pipeThrough(new DecompressionStream('gzip') as unknown as ReadableWritablePair<Uint8Array, Uint8Array>) : body;
  const bytes = new Uint8Array(expectedBytes);
  const reader = stream.getReader();
  let offset = 0;
  try {
    while (true) {
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
      const { done, value } = await reader.read();
      if (done) break;
      if (offset + value.byteLength > expectedBytes) throw new Error('The anatomical asset exceeds its declared byte limit.');
      bytes.set(value, offset); offset += value.byteLength;
      options.onProgress?.({ assetBytes: offset, assetTotal: expectedBytes, transferred, transferTotal, compressed });
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    if (error instanceof Error && /declared byte limit|could not be read/.test(error.message)) throw error;
    throw compressed ? new Error('The compressed anatomical asset could not be unpacked.') : error;
  }
  finally { reader.releaseLock(); }
  if (offset !== expectedBytes) throw new Error('The anatomical asset byte count does not match its registry.');
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((value) => value.toString(16).padStart(2, '0')).join('');
  if (hash !== expectedHash) throw new Error('The anatomical asset checksum does not match its registry.');
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
  return bytes.buffer;
}
