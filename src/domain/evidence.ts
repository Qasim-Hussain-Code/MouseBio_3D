import type { Atlas, Structure, StructureEvidence } from './types';

/** Anything without a declared class comes from a source-labelled reference that predates the field. */
export const evidenceOf = (structure: Pick<Structure, 'evidence'>): StructureEvidence => structure.evidence ?? 'source';

export const EVIDENCE_NAMES: Readonly<Record<StructureEvidence, string>> = Object.freeze({
  source: 'Source label',
  traced: 'Traced',
  simulated: 'Simulated',
});

export const EVIDENCE_NOTES: Readonly<Record<StructureEvidence, string>> = Object.freeze({
  source: 'Labelled by the source authors from their images of the specimen.',
  traced: 'Found in the source images of the specimen by automatic rules in this project. It has not been reviewed by an anatomist.',
  simulated: 'Constructed from published descriptions of mouse anatomy. It is not measured from this specimen or any other, and it may differ from a real mouse.',
});

/** Whether a reference mixes evidence classes, so that they must be shown. */
export function declaresEvidence(atlas: Pick<Atlas, 'structures'>): boolean {
  return atlas.structures.some((structure) => structure.evidence !== undefined);
}

/** A region label that cannot be mistaken for a measurement when read on its own. */
export function labelWithEvidence(structure: Pick<Structure, 'name' | 'evidence'>): string {
  return structure.evidence === 'simulated' ? `${structure.name} (simulated)` : structure.evidence === 'traced' ? `${structure.name} (traced)` : structure.name;
}

export interface EvidenceGroup { readonly evidence: StructureEvidence; readonly ids: readonly string[]; readonly visible: number }

export function evidenceGroups(atlas: Pick<Atlas, 'structures'>, hidden: readonly string[]): EvidenceGroup[] {
  return (['source', 'traced', 'simulated'] as const).map((evidence) => {
    const ids = atlas.structures.filter((structure) => evidenceOf(structure) === evidence).map((structure) => structure.id);
    return { evidence, ids, visible: ids.filter((id) => !hidden.includes(id)).length };
  }).filter((group) => group.ids.length > 0);
}

/** The hidden list after showing or hiding one evidence class. */
export function toggledEvidence(hidden: readonly string[], group: EvidenceGroup): string[] {
  const members = new Set(group.ids);
  const others = hidden.filter((id) => !members.has(id));
  return group.visible === group.ids.length ? [...others, ...group.ids] : others;
}
