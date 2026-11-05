import { EVIDENCE_NAMES, EVIDENCE_NOTES, evidenceOf, type EvidenceGroup } from '../domain/evidence';
import type { Structure } from '../domain/types';

export function EvidenceChip({ structure }: { structure: Pick<Structure, 'evidence'> }) {
  const evidence = evidenceOf(structure);
  return <span className={`evidence-chip evidence-${evidence}`} title={EVIDENCE_NOTES[evidence]}>{EVIDENCE_NAMES[evidence]}</span>;
}

/** Shows or hides whole evidence classes, so that the measured model can be seen on its own. */
export function EvidenceFilter({ groups, onToggle }: { groups: readonly EvidenceGroup[]; onToggle: (group: EvidenceGroup) => void }) {
  return <fieldset className="evidence-filter"><legend>Show by evidence</legend>{groups.map((group) => <label key={group.evidence} title={EVIDENCE_NOTES[group.evidence]}>
    <input type="checkbox" aria-label={`${EVIDENCE_NAMES[group.evidence]} structures`} checked={group.visible === group.ids.length} onChange={() => onToggle(group)} />
    <span className={`evidence-chip evidence-${group.evidence}`}>{EVIDENCE_NAMES[group.evidence]}</span><small>{group.visible}/{group.ids.length}</small>
  </label>)}</fieldset>;
}
