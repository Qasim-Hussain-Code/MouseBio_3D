const MAX_BYTES = 80 * 1024 * 1024;

export function isLocalAnatomyPath(value: unknown, extension: 'glb' | 'ply'): value is string {
  return typeof value === 'string' && new RegExp(`^/[A-Za-z0-9_./-]+\\.${extension}$`).test(value)
    && !value.startsWith('//') && value.slice(1).split('/').every((part) => part !== '' && part !== '.' && part !== '..');
}

/** Read one bounded same-origin asset, with no external redirects or research payload. */
export async function fetchBoundAnatomyBytes(url: string, expectedBytes: number, expectedHash: string,
  signal: AbortSignal, extension: 'glb' | 'ply', fetcher: typeof fetch = fetch): Promise<ArrayBuffer> {
  if (!isLocalAnatomyPath(url, extension) || !Number.isSafeInteger(expectedBytes) || expectedBytes < 28 || expectedBytes > MAX_BYTES
      || !/^[a-f0-9]{64}$/.test(expectedHash)) throw new Error('Invalid local anatomical asset binding.');
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
  const response = await fetcher(url, { signal, credentials: 'same-origin', redirect: 'error' });
  if (!response.ok || response.type === 'opaque' || !response.body) throw new Error('The local anatomical asset could not be read.');
  const bytes = new Uint8Array(expectedBytes);
  const reader = response.body.getReader();
  let offset = 0;
  try {
    while (true) {
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
      const { done, value } = await reader.read();
      if (done) break;
      if (offset + value.byteLength > expectedBytes) throw new Error('The anatomical asset exceeds its declared byte limit.');
      bytes.set(value, offset); offset += value.byteLength;
    }
  } catch (error) { await reader.cancel().catch(() => {}); throw error; }
  finally { reader.releaseLock(); }
  if (offset !== expectedBytes) throw new Error('The anatomical asset byte count does not match its registry.');
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((value) => value.toString(16).padStart(2, '0')).join('');
  if (hash !== expectedHash) throw new Error('The anatomical asset checksum does not match its registry.');
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
  return bytes.buffer;
}
