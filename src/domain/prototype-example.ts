import type { Atlas, DatasetMetadata, ExperimentalMeasurement } from './types';
import { validateExperimentalRows } from './experimental';
import { PROTOTYPE_STARTER_GROUPS, resolvePrototypeStarter } from './prototype-starters';

export interface PrototypeExampleResult {
  readonly ok: boolean;
  readonly data?: { rows: ExperimentalMeasurement[]; metadata: DatasetMetadata };
  readonly errors: readonly string[];
}

const CONDITIONS = ['control-example', 'treatment-example'] as const;
const TIME_POINTS = ['baseline', '24 h'] as const;
const PREFERRED_IDS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  'digimouse-tessellated-v1': Object.freeze(['digimouse:3', 'digimouse:7']),
  'digimouse-volume-040-v1': Object.freeze(['digimouse-volume:9', 'digimouse-volume:19']),
});
const METADATA: Readonly<DatasetMetadata> = Object.freeze({
  title: 'Fictional software walkthrough',
  origin: 'synthetic-example',
  sourceReference: 'MouseBio_3D synthetic walkthrough; not a source experiment.',
  notes: 'All values, condition labels and subject identifiers are fictional. AU denotes arbitrary walkthrough units. These numbers are not observed biology, physiological validation or evidence of a treatment effect. Existing source records are mapping targets only; the values are not derived from their source publications. Fictional subject identifiers recur at both time points.',
});

function rejected(): PrototypeExampleResult {
  return Object.freeze({ ok: false, errors: Object.freeze(['The example requires an unchanged reviewed bundled source reference.']) });
}

/** Create fresh fictional observations after validating the exact existing source. No network reads or source changes occur here. */
export function createPrototypeExample(value: unknown): PrototypeExampleResult {
  try {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return rejected();
    const atlas = value as Atlas;
    const starter = PROTOTYPE_STARTER_GROUPS.flatMap((group) => group.starters)
      .find((candidate) => candidate.referenceId === atlas.id);
    if (!starter) return rejected();
    const source = resolvePrototypeStarter(atlas, starter.id);
    if (!source.ok || !source.target) return rejected();
    const preferred = Object.hasOwn(PREFERRED_IDS, starter.referenceId) ? PREFERRED_IDS[starter.referenceId] : undefined;
    const ids = [...(preferred ?? source.target.structureIds.slice(0, 2))];
    if (ids.length < 1 || ids.length > 2 || new Set(ids).size !== ids.length
      || ids.some((id) => !atlas.structures.some((structure) => structure.id === id))) return rejected();
    const rows: ExperimentalMeasurement[] = [];
    ids.forEach((structureId, structureIndex) => CONDITIONS.forEach((condition, conditionIndex) =>
      TIME_POINTS.forEach((timePoint, timeIndex) => {
        for (let subjectIndex = 0; subjectIndex < 3; subjectIndex++) {
          rows.push({ structureId, measurement: 'fictional walkthrough signal',
            value: 100 + structureIndex * 50 + conditionIndex * 20 + timeIndex * 10 + subjectIndex * 2,
            unit: 'AU', replicate: `${condition}-subject-${subjectIndex + 1}`, condition, timePoint });
        }
      })));
    const validated = validateExperimentalRows(rows, atlas.structures);
    if (!validated.ok) return rejected();
    // Normalized rows and a fresh metadata record have no shared mutable state
    // with the atlas, module constants or any earlier walkthrough invocation.
    return { ok: true, data: { rows: validated.rows, metadata: { ...METADATA } }, errors: Object.freeze([]) };
  } catch { return rejected(); }
}
