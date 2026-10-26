import type { Atlas } from './types';

/** A proposed label association, never an exact or anatomically reviewed mapping. */
export interface OntologyCandidate {
  readonly sourceId: string;
  readonly sourceLabel: string;
  readonly termId: string;
  readonly termLabel: string;
  readonly termUrl: string;
  readonly verificationUrl: string;
  readonly classification: 'computational-inference';
  readonly relation: 'related';
  readonly status: 'proposed';
  readonly expertReviewed: false;
  readonly ontologyVersion: string;
  readonly retrievedOn: string;
  readonly assumptions: readonly string[];
  readonly limitations: readonly string[];
}

export interface OntologyCandidateResult {
  ok: boolean;
  candidates: readonly OntologyCandidate[];
  errors: string[];
}

const SCHEMA = 'mousebio.ontology-candidates.v1';
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const TOP_FIELDS = ['schemaVersion', 'atlasId', 'status', 'expertReviewed', 'retrievedOn', 'license',
  'licenseNote', 'sourceAtlas', 'ontology', 'method', 'candidates', 'unmapped'];
const CANDIDATE_FIELDS = ['structureId', 'sourceLabel', 'normalizedLabel', 'normalization', 'ontology',
  'termId', 'termLabel', 'termIri', 'termUrl', 'verificationUrl', 'ontologyVersion', 'retrievedOn',
  'sourceLicense', 'isObsolete', 'isDefiningOntology', 'definition', 'relation', 'status',
  'expertReviewed', 'evidence', 'laterality'];

function record(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function allowedFields(value: Record<string, unknown>, fields: readonly string[]): boolean {
  return Object.keys(value).every((name) => !UNSAFE_KEYS.has(name) && fields.includes(name));
}

function text(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 4096
    && value === value.trim() && !/[\u0000-\u001F\u007F]/.test(value);
}

function strings(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.length <= 100 && value.every(text);
}

function date(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function httpsUrl(value: unknown, hosts: readonly string[]): URL | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && hosts.includes(url.hostname) && !url.username && !url.password
      && !url.port && !url.hash ? url : null;
  } catch { return null; }
}

function termUrl(value: unknown, termId: string): boolean {
  const url = httpsUrl(value, ['www.informatics.jax.org', 'informatics.jax.org']);
  if (!url || url.search) return false;
  try { return decodeURIComponent(url.pathname) === `/vocab/gxd/ma_ontology/${termId}`; }
  catch { return false; }
}

function verificationUrl(value: unknown, termIri: string): boolean {
  const url = httpsUrl(value, ['www.ebi.ac.uk']);
  return !!url && url.pathname === '/ols4/api/ontologies/ma/terms'
    && [...url.searchParams.keys()].length === 1 && url.searchParams.get('iri') === termIri;
}

function fail(errors: string[]): OntologyCandidateResult {
  return { ok: false, candidates: Object.freeze([]), errors };
}

/**
 * Check the committed evidence table against its source inventory. This checks
 * provenance structure; it does not independently reverify live ontology terms.
 * No mesh, atlas record or experimental anatomical identifier is changed.
 */
export function parseOntologyCandidates(input: unknown, atlas: Atlas): OntologyCandidateResult {
  if (!record(input) || !allowedFields(input, TOP_FIELDS)) return fail(['Ontology candidates must use the supported object schema.']);
  const errors: string[] = [];
  if (input.schemaVersion !== SCHEMA || input.atlasId !== atlas.id) errors.push('Ontology candidate schema or source atlas does not match.');
  if (input.status !== 'proposed-label-based-associations' || input.expertReviewed !== false) {
    errors.push('Only proposed, unreviewed label associations are supported.');
  }
  if (!date(input.retrievedOn)) errors.push('A valid ontology retrieval date is required.');
  if (input.license !== 'CC-BY-SA-4.0') errors.push('The combined candidate table must retain its declared ShareAlike license.');

  const ontology = input.ontology;
  if (!record(ontology) || ontology.id !== 'MA' || !text(ontology.version)
      || ontology.license !== 'CC-BY-4.0'
      || ontology.licenseEvidenceUrl !== 'https://www.informatics.jax.org/mgihome/other/copyright.shtml'
      || ontology.versionEvidenceUrl !== 'https://www.ebi.ac.uk/ols4/api/ontologies/ma') {
    errors.push('The supported MA source version and licensing evidence are required.');
  }
  const method = input.method;
  if (!record(method) || !allowedFields(method, ['id', 'classification', 'description', 'limitations'])
      || !text(method.id) || method.classification !== 'computational-inference'
      || !text(method.description) || !strings(method.limitations)) {
    errors.push('Candidate evidence requires an explicit computational method and limitations.');
  }
  if (!record(input.sourceAtlas) || input.sourceAtlas.license !== 'CC-BY-SA-4.0'
      || input.sourceAtlas.licenseEvidenceUrl !== 'https://neuroimage.usc.edu/neuro/Digimouse_license') {
    errors.push('Digimouse source-label licensing evidence is required.');
  }
  if (!Array.isArray(input.candidates) || !Array.isArray(input.unmapped)) {
    return fail([...errors, 'Candidate and explicitly unmapped region arrays are required.']);
  }
  const known = new Map(atlas.structures.map((structure) => [structure.id, structure]));
  if (known.size !== atlas.structures.length || [...known.keys()].some((id) => !text(id))) {
    return fail([...errors, 'The source atlas must contain unique, nonempty region identifiers.']);
  }
  if (input.candidates.length + input.unmapped.length !== known.size) {
    errors.push('Every source region must appear once as a candidate or an explicitly unmapped region.');
  }
  const seen = new Set<string>();
  const takeSource = (entry: Record<string, unknown>, location: string): boolean => {
    const id = entry.structureId;
    if (typeof id !== 'string' || !known.has(id)) { errors.push(`${location} contains an unknown source identifier.`); return false; }
    if (seen.has(id)) { errors.push(`${location} repeats a source identifier.`); return false; }
    seen.add(id);
    if (entry.sourceLabel !== known.get(id)!.sourceLabel) { errors.push(`${location} changes its exact source label.`); return false; }
    return true;
  };
  const candidates: OntologyCandidate[] = [];
  for (let index = 0; index < Math.min(input.candidates.length, known.size + 1); index++) {
    const entry = input.candidates[index];
    const location = `Candidate ${index + 1}`;
    if (!record(entry) || !allowedFields(entry, CANDIDATE_FIELDS)) { errors.push(`${location} contains unsupported fields.`); continue; }
    const validSource = takeSource(entry, location);
    const termId = entry.termId;
    const iri = typeof termId === 'string' ? `http://purl.obolibrary.org/obo/${termId.replace(':', '_')}` : '';
    if (!text(termId) || !/^MA:\d{7}$/.test(termId) || entry.ontology !== 'MA'
        || entry.termIri !== iri || !termUrl(entry.termUrl, termId)
        || !verificationUrl(entry.verificationUrl, iri)) errors.push(`${location} requires a matching MA identifier and primary HTTPS term references.`);
    if (!text(entry.sourceLabel) || !text(entry.termLabel) || !text(entry.normalizedLabel)
        || entry.termLabel !== entry.normalizedLabel || !text(entry.normalization)) {
      errors.push(`${location} requires explicit source-label normalization and an equal target term label.`);
    }
    if (!record(ontology) || entry.ontologyVersion !== ontology.version || !text(entry.ontologyVersion)
        || entry.retrievedOn !== input.retrievedOn || !date(entry.retrievedOn) || entry.sourceLicense !== 'CC-BY-4.0') {
      errors.push(`${location} disagrees with its ontology version, retrieval date or source license.`);
    }
    if (entry.isObsolete !== false || entry.isDefiningOntology !== true || entry.relation !== 'related'
        || entry.status !== 'proposed' || entry.expertReviewed !== false || entry.laterality !== null
        || entry.definition !== null) errors.push(`${location} asserts unsupported certainty, detail or term status.`);
    const evidence = entry.evidence;
    if (!record(evidence) || !allowedFields(evidence, ['classification', 'methodId', 'assumptions', 'limitations'])
        || evidence.classification !== 'computational-inference' || !record(method) || evidence.methodId !== method.id
        || !strings(evidence.assumptions) || !strings(evidence.limitations)) {
      errors.push(`${location} requires computational-inference evidence, assumptions and limitations.`);
    }
    if (validSource && typeof termId === 'string' && record(evidence) && strings(evidence.assumptions)
        && strings(evidence.limitations) && record(method) && strings(method.limitations)) {
      candidates.push(Object.freeze({
        sourceId: entry.structureId as string, sourceLabel: entry.sourceLabel as string,
        termId, termLabel: entry.termLabel as string, termUrl: entry.termUrl as string,
        verificationUrl: entry.verificationUrl as string, classification: 'computational-inference' as const,
        relation: 'related' as const, status: 'proposed' as const, expertReviewed: false as const,
        ontologyVersion: entry.ontologyVersion as string, retrievedOn: entry.retrievedOn as string,
        assumptions: Object.freeze([...evidence.assumptions]),
        limitations: Object.freeze([...method.limitations, ...evidence.limitations]),
      }));
    }
  }
  for (let index = 0; index < Math.min(input.unmapped.length, known.size + 1); index++) {
    const entry = input.unmapped[index];
    const location = `Unmapped region ${index + 1}`;
    if (!record(entry) || !allowedFields(entry, ['structureId', 'sourceLabel', 'termId', 'relation', 'reason'])) {
      errors.push(`${location} contains unsupported fields.`); continue;
    }
    takeSource(entry, location);
    if (entry.termId !== null || entry.relation !== null || !text(entry.reason)) {
      errors.push(`${location} must retain null mapping and an explicit reason.`);
    }
  }
  if ([...known.keys()].some((id) => !seen.has(id))) errors.push('The candidate table omits source regions.');
  if (errors.length) return fail(errors);
  return { ok: true, candidates: Object.freeze(candidates), errors };
}

export function getOntologyCandidate(
  candidates: readonly OntologyCandidate[], structureId: string,
): OntologyCandidate | undefined {
  return candidates.find((candidate) => candidate.sourceId === structureId);
}
