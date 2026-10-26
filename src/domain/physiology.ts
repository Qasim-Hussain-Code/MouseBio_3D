import { SYSTEMS, type ModelClassification, type SystemId } from './types';

export interface PhysiologyProcess {
  id: string;
  title: string;
  system: SystemId;
  classification: ModelClassification;
  implementation: 'illustrative-deformation' | 'extension-interface';
  atlasId?: string;
  /** Stable structure identifiers within atlasId, rather than display-name aliases. */
  requiredStructures: string[];
  limitations: string[];
  equations?: string[];
  parameterSources?: string[];
  validation?: { reference: string; independentDataset: string; outcome: string };
}

/** Extension records do not imply that a physiological process is implemented. */
export const PHYSIOLOGY_PROCESSES: readonly PhysiologyProcess[] = [
  {
    id: 'cardiac-contraction', title: 'Cardiac contraction', system: 'cardiovascular',
    classification: 'illustrative', implementation: 'illustrative-deformation',
    atlasId: 'digimouse-tessellated-v1', requiredStructures: ['digimouse:3'],
    equations: ['scale(t) = 1 - 0.035 * (0.5 + 0.5 * sin(2 * pi * t))^4'],
    parameterSources: ['Arbitrary display period of 1 s and amplitude of 3.5 percent; no physiological calibration.'],
    limitations: ['Uniform surface scaling does not represent chamber contraction, myocardial mechanics or cardiac output.',
      'The animation period is an educational display setting, not a measured mouse heart rate.'],
  },
  {
    id: 'respiratory-movement', title: 'Respiratory movement', system: 'respiratory',
    classification: 'illustrative', implementation: 'illustrative-deformation',
    atlasId: 'digimouse-tessellated-v1', requiredStructures: ['digimouse:9', 'digimouse:10'],
    equations: ['scale(t) = 1 + 0.025 * sin(2 * pi * t / 3)'],
    parameterSources: ['Arbitrary display period of 3 s and amplitude of 2.5 percent; no physiological calibration.'],
    limitations: ['Surface scaling does not model airway pressure, diaphragm movement, tidal volume or gas exchange.',
      'The animation period is an educational display setting, not a measured mouse respiratory rate.'],
  },
  ...SYSTEMS.filter((system) => system.id !== 'cardiovascular' && system.id !== 'respiratory').map((system) => ({
    id: `${system.id}-extension`, title: `${system.name} process interface`, system: system.id,
    classification: 'illustrative' as const, implementation: 'extension-interface' as const,
    requiredStructures: [], limitations: ['No physiological model or animation is implemented for this extension.'],
  })),
];

/** Explicit source-ID binding. This does not establish registration or model validity. */
export function physiologyProcessesForAtlas(atlasId: string): readonly PhysiologyProcess[] {
  if (atlasId === 'digimouse-volume-040-v1') return PHYSIOLOGY_PROCESSES
    .filter((process) => process.implementation === 'illustrative-deformation')
    .map((process) => ({ ...process, atlasId, requiredStructures: process.id === 'cardiac-contraction'
      ? ['digimouse-volume:9'] : ['digimouse-volume:21'] }));
  return PHYSIOLOGY_PROCESSES.filter((process) => process.atlasId === atlasId);
}

export interface IllustrativePhysiologyOptions {
  speed?: number;
  cardiac?: boolean;
  respiratory?: boolean;
}

export interface IllustrativePhysiologyState {
  cardiacScale: number;
  respiratoryScale: number;
  phase: number;
  cardiacPhase: number;
  respiratoryPhase: number;
}

/** Pure, deterministic deformations. The caller owns playback time, pause and process isolation. */
export function evaluateIllustrativePhysiology(
  elapsedSeconds: number, options: IllustrativePhysiologyOptions = {},
): IllustrativePhysiologyState {
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 0) throw new Error('Elapsed display time must be finite and nonnegative.');
  const speed = options.speed ?? 1;
  if (!Number.isFinite(speed) || speed < 0 || speed > 8) throw new Error('Display speed must be between 0 and 8.');
  const time = elapsedSeconds * speed;
  if (!Number.isFinite(time)) throw new Error('Elapsed display time exceeds the finite numeric range.');
  const cardiacPhase = time % 1;
  const respiratoryPhase = (time % 3) / 3;
  const pulse = Math.pow(0.5 + 0.5 * Math.sin(2 * Math.PI * cardiacPhase), 4);
  return {
    cardiacScale: options.cardiac === false ? 1 : 1 - 0.035 * pulse,
    respiratoryScale: options.respiratory === false ? 1 : 1 + 0.025 * Math.sin(2 * Math.PI * respiratoryPhase),
    phase: cardiacPhase, cardiacPhase, respiratoryPhase,
  };
}
