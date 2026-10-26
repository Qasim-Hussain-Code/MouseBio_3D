/** Shared scientific representation. Geometry resolution belongs to the asset, not the camera. */
export const SYSTEMS = [
  { id: 'skeletal', name: 'Skeletal' },
  { id: 'muscular', name: 'Muscular' },
  { id: 'nervous', name: 'Nervous' },
  { id: 'cardiovascular', name: 'Cardiovascular' },
  { id: 'arterial-venous', name: 'Arterial and venous' },
  { id: 'respiratory', name: 'Respiratory' },
  { id: 'digestive', name: 'Digestive' },
  { id: 'urinary', name: 'Urinary' },
  { id: 'reproductive', name: 'Reproductive' },
  { id: 'endocrine', name: 'Endocrine' },
  { id: 'lymphatic', name: 'Lymphatic' },
  { id: 'immune', name: 'Immune' },
  { id: 'integumentary', name: 'Integumentary' },
  { id: 'sensory', name: 'Sensory organs' },
] as const;

export type SystemId = (typeof SYSTEMS)[number]['id'];
export type ExplorationMode = 'anatomical' | 'living' | 'experimental' | 'comparative';
export type BiologicalScale = 'organism' | 'system' | 'organ' | 'tissue' | 'cellular';
export type ModelClassification = 'illustrative' | 'parameterized' | 'validated';

export interface SpecimenMetadata {
  scientificName: 'Mus musculus';
  taxonomyId: 'NCBITaxon:10090';
  sex: 'male' | 'female' | 'unknown';
  strain?: string;
  age?: { value: number; unit: string };
  developmentalStage?: { label: string; reference: string };
  sourceReference: string;
}

export interface ScientificReference {
  id: string;
  title: string;
  url: string;
  doi?: string;
}

export interface OntologyAssociation {
  ontology: 'UBERON' | 'EMAPA' | 'MA' | 'CL' | 'GO' | string;
  identifier: string;
  relationship: 'exact' | 'broader' | 'narrower' | 'related';
  reference: string;
}

export interface Structure {
  id: string;
  name: string;
  systems: string[];
  sourceLabel: string | number;
  meshNode: string;
  description?: string;
  ontology?: OntologyAssociation[];
  scale?: BiologicalScale;
  parentId?: string;
  sourceReference?: string;
  limitations?: string[];
}

/** Native orientation can remain unresolved; a display rotation is not anatomical validation. */
export interface CoordinateFrame {
  id?: string;
  units?: string;
  unit?: string;
  axes?: Record<string, unknown> | string;
  orientation?: string;
  orientationStatus?: string;
  handedness?: string;
  description?: string;
  sourceToDisplay?: number[] | number[][];
  [key: string]: unknown;
}

export interface Atlas {
  id: string;
  title: string;
  assetUrl: string;
  coordinateFrame: CoordinateFrame;
  source: Record<string, unknown>;
  structures: Structure[];
  statistics: Record<string, unknown>;
  limitations: string[];
  specimen?: SpecimenMetadata;
  [key: string]: unknown;
}

export type RelationshipEvidence =
  | { classification: 'observed'; references: ScientificReference[]; observation: string }
  | {
      classification: 'computational-inference';
      references: ScientificReference[];
      method: string;
      assumptions: string[];
    }
  | {
      classification: 'educational-simplification';
      references: ScientificReference[];
      simplification: string;
    };

export interface BiologicalRelationship {
  id: string;
  subjectId: string;
  predicate:
    | 'part-of'
    | 'blood-supply'
    | 'venous-drainage'
    | 'innervated-by'
    | 'function'
    | 'pathway'
    | 'cell-type'
    | 'disease-association'
    | 'measurement'
    | string;
  objectId: string;
  evidence: RelationshipEvidence;
}

export interface AnatomyState {
  atlasId: string;
  selectedStructureId: string | null;
  visibleStructureIds: string[];
  opacityByStructure: Record<string, number>;
  /** No higher resolution is implied by selecting a scale without its corresponding asset. */
  availableScales: BiologicalScale[];
}

export interface LivingState {
  classification: ModelClassification;
  playing: boolean;
  elapsedDisplaySeconds: number;
  displaySpeed: number;
  enabledProcessIds: string[];
}

export interface ComparativeState {
  leftStateId: string;
  rightStateId: string;
  synchronizeCamera: boolean;
  /** A comparison requires explicit source states; labels alone do not create differences. */
  sourceReferences: string[];
}

export interface MouseBioState {
  mode: ExplorationMode;
  anatomy: AnatomyState;
  living: LivingState;
  experimental: ExperimentalDataset | null;
  comparative: ComparativeState | null;
}

export interface ExperimentalMeasurement {
  structureId: string;
  measurement: string;
  value: number;
  unit: string;
  /** A biological subject identifier. Technical replicates must be resolved before import. */
  replicate: string;
  condition: string;
  /** An exact, explicitly labelled time point, for example baseline or 24 h. */
  timePoint: string;
}

export interface DatasetMetadata {
  title?: string;
  sourceReference?: string;
  license?: string;
  notes?: string;
  origin?: 'user-data' | 'synthetic-example';
}

export interface ExperimentalDataset {
  schemaVersion: 'mousebio.experimental.v1';
  dataset: DatasetMetadata;
  measurements: ExperimentalMeasurement[];
}

export interface ValidationIssue {
  code: string;
  message: string;
  row?: number;
  column?: string;
}

export interface ImportResult {
  ok: boolean;
  rows: ExperimentalMeasurement[];
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  metadata?: DatasetMetadata;
}

export interface MeasurementSummary {
  structureId: string;
  measurement: string;
  unit: string;
  condition: string;
  timePoint: string;
  n: number;
  mean: number;
  /** Sample standard deviation. Null for a single biological replicate. */
  sd: number | null;
  minimum: number;
  maximum: number;
  replicates: string[];
}
