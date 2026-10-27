import type { Atlas } from './types';

const UNKNOWN = 'Unknown';

export interface ReferenceSummary {
  specimen: {
    scientificName: string;
    sex: string;
    strain: string;
    age: string;
    mass: string;
    scope: string;
    count: string;
    description: string;
  };
  source: {
    displayName: string;
    citationLabel: string;
    authors: string;
    year: string;
    title: string;
    url: string | null;
    doi: string;
    doiUrl: string | null;
    license: string;
    licenseUrl: string | null;
    attribution: string;
  };
}

/** Read declared own data properties without invoking a metadata accessor. */
function field(record: unknown, key: string): unknown {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  return descriptor && 'value' in descriptor ? descriptor.value : undefined;
}

function text(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(trimmed)
    ? trimmed
    : null;
}

/** HTTPS links are declarations, not a verification of the remote resource. */
function httpsUrl(value: unknown): string | null {
  const declared = text(value);
  if (!declared || !/^https:\/\//iu.test(declared) || /[\s\\]/u.test(declared)) return null;
  try {
    const parsed = new URL(declared);
    if (parsed.protocol !== 'https:' || !parsed.hostname || parsed.username || parsed.password) return null;
    return parsed.href;
  } catch {
    return null;
  }
}

function authorsText(value: unknown): string | null {
  if (!Array.isArray(value)) return text(value);
  if (!value.length) return null;
  const names = value.map(text);
  return names.every((name): name is string => name !== null) ? names.join('; ') : null;
}

function yearText(value: unknown): string | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? String(value) : null;
}

function quantity(value: unknown, allowZero: boolean): string | null {
  const amount = field(value, 'value');
  const unit = text(field(value, 'unit'));
  if (typeof amount !== 'number' || !Number.isFinite(amount) || (allowZero ? amount < 0 : amount <= 0) || !unit) return null;
  return `${amount} ${unit}`;
}

function doiLink(value: string | null): string | null {
  if (!value) return null;
  if (/^10\.\d{4,9}\/\S+$/u.test(value)) {
    if (value.split('/').some(segment => segment === '.' || segment === '..')) return null;
    // Encode delimiters in the suffix so a DOI cannot introduce a query or fragment.
    try {
      return `https://doi.org/${value.split('/').map(encodeURIComponent).join('/')}`;
    } catch {
      return null;
    }
  }
  const link = httpsUrl(value);
  if (!link) return null;
  const parsed = new URL(link);
  return parsed.hostname === 'doi.org' && /^\/10\.\d{4,9}\/.+/u.test(parsed.pathname) ? link : null;
}

/**
 * Format only declared source metadata. No specimen attributes, licenses, source
 * names or population scope are inferred from atlas IDs, geometry or narrative.
 * All strings are plain display text; callers must render them as text, not HTML.
 */
export function buildReferenceSummary(atlas: Atlas): ReferenceSummary {
  const specimen = field(atlas, 'specimen');
  const source = field(atlas, 'source');
  const title = text(field(source, 'title'));
  const authors = authorsText(field(source, 'authors'));
  const year = yearText(field(source, 'year')) ?? yearText(field(source, 'publicationYear'));
  const citation = [authors, year, title].filter((value): value is string => value !== null).join('; ');
  const doi = text(field(source, 'doi'));
  const count = field(specimen, 'count');
  const sex = field(specimen, 'sex');

  return {
    specimen: {
      scientificName: text(field(specimen, 'scientificName')) ?? UNKNOWN,
      sex: sex === 'male' || sex === 'female' ? sex : UNKNOWN,
      strain: text(field(specimen, 'strain')) ?? UNKNOWN,
      age: quantity(field(specimen, 'age'), true) ?? UNKNOWN,
      mass: quantity(field(specimen, 'mass'), false) ?? UNKNOWN,
      scope: text(field(specimen, 'scope')) ?? UNKNOWN,
      count: typeof count === 'number' && Number.isSafeInteger(count) && count > 0 ? String(count) : UNKNOWN,
      description: text(field(specimen, 'description')) ?? UNKNOWN,
    },
    source: {
      displayName: text(field(source, 'displayName')) ?? title ?? UNKNOWN,
      citationLabel: text(field(source, 'citationLabel')) ?? (citation || UNKNOWN),
      authors: authors ?? UNKNOWN,
      year: year ?? UNKNOWN,
      title: title ?? UNKNOWN,
      url: httpsUrl(field(source, 'url')),
      doi: doi ?? UNKNOWN,
      doiUrl: doiLink(doi),
      license: text(field(source, 'license')) ?? UNKNOWN,
      licenseUrl: httpsUrl(field(source, 'licenseUrl')),
      attribution: text(field(source, 'attribution')) ?? UNKNOWN,
    },
  };
}
