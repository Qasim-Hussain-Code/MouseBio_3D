/** Where the site is served: '/' by default, or a subpath such as '/MouseBio_3D/' when the build sets MOUSEBIO_BASE.
 * Registry paths stay root-relative, as they are checked and recorded; only the request is placed under the subpath. */
const SAFE_BASE = /^\/(?:(?!\.\.?\/)[A-Za-z0-9_.-]+\/)*$/;

function buildBase(): string {
  try {
    const value: unknown = import.meta.env?.BASE_URL;
    return typeof value === 'string' && SAFE_BASE.test(value) ? value : '/';
  } catch {
    return '/';
  }
}

export const SITE_BASE = buildBase();

/** A request path for a root-relative registry path under the given base; anything else is returned as it is. */
export function deployedPathFor(base: string, path: string): string {
  if (!SAFE_BASE.test(base) || base === '/' || !path.startsWith('/') || path.startsWith('//')) return path;
  return base + path.slice(1);
}

export const deployedPath = (path: string) => deployedPathFor(SITE_BASE, path);
