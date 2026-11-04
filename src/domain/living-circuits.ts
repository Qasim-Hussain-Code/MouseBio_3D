/** Original integration code: MIT, Qasim Hussain.
 *
 * Schematic circulation and nerve-signalling routes between existing source
 * regions. A route states an organ-level textbook relationship, such as renal
 * arterial supply. It does not describe vessel or nerve geometry, branching,
 * flow rate, conduction velocity or mouse-specific measurements. Every route is
 * an educational simplification, and its connector is a display curve between
 * two anchored source surfaces.
 */
import type { Atlas, BiologicalRelationship, ScientificReference } from './types';

export type CircuitLayer = 'circulation' | 'neural';
export type CircuitKind = 'pulmonary-arterial' | 'pulmonary-venous' | 'systemic-arterial' | 'systemic-venous'
  | 'hepatic-portal' | 'neural-efferent' | 'neural-afferent';
export type CircuitBlood = 'oxygen-poor' | 'oxygen-rich';
export type CircuitRole = 'heart' | 'lungs' | 'brain' | 'eye' | 'liver' | 'stomach' | 'spleen' | 'pancreas'
  | 'kidneys' | 'bladder' | 'testes' | 'masseter' | 'vagal-origin' | 'trigeminal-origin' | 'visual-target';

interface CircuitRoute {
  readonly id: string;
  readonly kind: CircuitKind;
  readonly from: CircuitRole;
  readonly to: CircuitRole;
  readonly basis: string;
  readonly referenceIds: readonly string[];
}

interface RoleBinding {
  /** Exact source structure IDs in the bound reference. */
  readonly structureIds: readonly string[];
  /** each: one connector per listed region. union: one anchor across all listed regions. */
  readonly mode: 'each' | 'union';
  /** Present when assigning the role to these source labels is our anatomical inference. */
  readonly inference?: string;
}

export interface CircuitEndpoint {
  readonly role: CircuitRole;
  readonly structureIds: readonly string[];
}

export interface CircuitEdge {
  readonly id: string;
  readonly routeId: string;
  readonly kind: CircuitKind;
  readonly layer: CircuitLayer;
  /** Conventional display state of the carried blood; absent for nerve routes. */
  readonly blood?: CircuitBlood;
  readonly from: CircuitEndpoint;
  readonly to: CircuitEndpoint;
  readonly basis: string;
  readonly relationship: BiologicalRelationship;
  readonly bindingInferences: readonly string[];
}

export interface OmittedCircuitRoute {
  readonly routeId: string;
  readonly reason: string;
}

export interface LivingCircuitsResult {
  readonly ok: boolean;
  readonly atlasId: string;
  readonly classification: 'illustrative';
  readonly evidence: 'educational-simplification';
  readonly edges: readonly CircuitEdge[];
  readonly omittedRoutes: readonly OmittedCircuitRoute[];
  readonly limitations: readonly string[];
  readonly references: readonly LivingCircuitReference[];
  readonly errors: readonly string[];
}

export interface LivingCircuitReference extends ScientificReference {
  readonly citation: string;
  readonly license: string;
}

const BOOK = 'Betts JG, Young KA, Wise JA, Johnson E, Poe B, Kruse DH, Korol O, Johnson JE, Womble M, DeSaix P. Anatomy and Physiology 2e. Houston (TX): OpenStax; 2022.';
const BOOK_LICENSE = 'CC BY-NC-SA 4.0. Cited for facts only; no text, figures or other material are reproduced.';

/** Verified 2026-11-04. Human-oriented textbook sections, used for general mammalian topology. */
export const LIVING_CIRCUIT_REFERENCES: readonly LivingCircuitReference[] = Object.freeze([
  { id: 'openstax-ap2e-20-5', title: 'Section 20.5 Circulatory Pathways', citation: `${BOOK} Section 20.5, Circulatory Pathways.`,
    url: 'https://openstax.org/books/anatomy-and-physiology-2e/pages/20-5-circulatory-pathways', license: BOOK_LICENSE },
  { id: 'openstax-ap2e-15-1', title: 'Section 15.1 Divisions of the Autonomic Nervous System', citation: `${BOOK} Section 15.1, Divisions of the Autonomic Nervous System.`,
    url: 'https://openstax.org/books/anatomy-and-physiology-2e/pages/15-1-divisions-of-the-autonomic-nervous-system', license: BOOK_LICENSE },
  { id: 'openstax-ap2e-13-4', title: 'Section 13.4 The Peripheral Nervous System', citation: `${BOOK} Section 13.4, The Peripheral Nervous System.`,
    url: 'https://openstax.org/books/anatomy-and-physiology-2e/pages/13-4-the-peripheral-nervous-system', license: BOOK_LICENSE },
  { id: 'openstax-ap2e-11-3', title: 'Section 11.3 Axial Muscles of the Head, Neck, and Back', citation: `${BOOK} Section 11.3, Axial Muscles of the Head, Neck, and Back.`,
    url: 'https://openstax.org/books/anatomy-and-physiology-2e/pages/11-3-axial-muscles-of-the-head-neck-and-back', license: BOOK_LICENSE },
].map((reference) => Object.freeze(reference)));

const CIRCULATION = 'openstax-ap2e-20-5';
const AUTONOMIC = 'openstax-ap2e-15-1';
const PERIPHERAL = 'openstax-ap2e-13-4';
const AXIAL = 'openstax-ap2e-11-3';

/** Organ-level routes. Wording is original; intermediate vessels and ganglia are collapsed. */
const ROUTE_TABLE: CircuitRoute[] = [
  { id: 'pulmonary-supply', kind: 'pulmonary-arterial', from: 'heart', to: 'lungs', referenceIds: [CIRCULATION],
    basis: 'Pulmonary trunk and arteries carry blood from the right ventricle to the lungs. Heart chambers are not resolved in the source surface.' },
  { id: 'pulmonary-return', kind: 'pulmonary-venous', from: 'lungs', to: 'heart', referenceIds: [CIRCULATION],
    basis: 'Pulmonary veins return blood from the lungs to the left atrium.' },
  { id: 'brain-supply', kind: 'systemic-arterial', from: 'heart', to: 'brain', referenceIds: [CIRCULATION],
    basis: 'Internal carotid and vertebral arteries supply the brain; the aorta and its branches are collapsed into one connector.' },
  { id: 'brain-drainage', kind: 'systemic-venous', from: 'brain', to: 'heart', referenceIds: [CIRCULATION],
    basis: 'Internal jugular veins drain the brain toward the superior vena cava and right atrium.' },
  { id: 'eye-supply', kind: 'systemic-arterial', from: 'heart', to: 'eye', referenceIds: [CIRCULATION],
    basis: 'The ophthalmic artery supplies the eye. Its venous drainage is not represented because the cited section does not state it.' },
  { id: 'liver-arterial-supply', kind: 'systemic-arterial', from: 'heart', to: 'liver', referenceIds: [CIRCULATION],
    basis: 'The common hepatic artery, a branch of the celiac trunk, supplies the liver.' },
  { id: 'stomach-supply', kind: 'systemic-arterial', from: 'heart', to: 'stomach', referenceIds: [CIRCULATION],
    basis: 'The left gastric artery, a branch of the celiac trunk, supplies the stomach.' },
  { id: 'spleen-supply', kind: 'systemic-arterial', from: 'heart', to: 'spleen', referenceIds: [CIRCULATION],
    basis: 'The splenic artery, a branch of the celiac trunk, supplies the spleen.' },
  { id: 'pancreas-supply', kind: 'systemic-arterial', from: 'heart', to: 'pancreas', referenceIds: [CIRCULATION],
    basis: 'Superior mesenteric artery branches and a common hepatic artery branch supply the pancreas.' },
  { id: 'stomach-portal', kind: 'hepatic-portal', from: 'stomach', to: 'liver', referenceIds: [CIRCULATION],
    basis: 'Gastric veins drain into the hepatic portal vein, which carries blood to the liver.' },
  { id: 'spleen-portal', kind: 'hepatic-portal', from: 'spleen', to: 'liver', referenceIds: [CIRCULATION],
    basis: 'The splenic vein joins the hepatic portal vein, which carries blood to the liver.' },
  { id: 'pancreas-portal', kind: 'hepatic-portal', from: 'pancreas', to: 'liver', referenceIds: [CIRCULATION],
    basis: 'Pancreatic venous blood reaches the hepatic portal vein through the splenic vein.' },
  { id: 'liver-drainage', kind: 'systemic-venous', from: 'liver', to: 'heart', referenceIds: [CIRCULATION],
    basis: 'Hepatic veins drain the liver into the inferior vena cava and right atrium.' },
  { id: 'kidney-supply', kind: 'systemic-arterial', from: 'heart', to: 'kidneys', referenceIds: [CIRCULATION],
    basis: 'Renal arteries branch from the abdominal aorta to supply the kidneys.' },
  { id: 'kidney-drainage', kind: 'systemic-venous', from: 'kidneys', to: 'heart', referenceIds: [CIRCULATION],
    basis: 'Renal veins drain the kidneys into the inferior vena cava.' },
  { id: 'testis-supply', kind: 'systemic-arterial', from: 'heart', to: 'testes', referenceIds: [CIRCULATION],
    basis: 'Gonadal (testicular) arteries branch from the abdominal aorta.' },
  { id: 'testis-drainage', kind: 'systemic-venous', from: 'testes', to: 'heart', referenceIds: [CIRCULATION],
    basis: 'Gonadal veins drain to the inferior vena cava or, on the left, the renal vein; both are collapsed into one return connector.' },
  { id: 'bladder-supply', kind: 'systemic-arterial', from: 'heart', to: 'bladder', referenceIds: [CIRCULATION],
    basis: 'Branches of the internal iliac arteries supply the urinary bladder.' },
  { id: 'bladder-drainage', kind: 'systemic-venous', from: 'bladder', to: 'heart', referenceIds: [CIRCULATION],
    basis: 'Pelvic organs drain into the internal iliac veins; the remaining venous path is collapsed into one return connector.' },
  { id: 'vagal-heart', kind: 'neural-efferent', from: 'vagal-origin', to: 'heart', referenceIds: [AUTONOMIC, PERIPHERAL],
    basis: 'Parasympathetic fibres of the vagus nerve, from brain-stem vagal nuclei, influence the heart.' },
  { id: 'vagal-bronchi', kind: 'neural-efferent', from: 'vagal-origin', to: 'lungs', referenceIds: [AUTONOMIC],
    basis: 'Vagal parasympathetic fibres influence the bronchi. Bronchi are not resolved within the lung source surfaces.' },
  { id: 'vagal-stomach', kind: 'neural-efferent', from: 'vagal-origin', to: 'stomach', referenceIds: [AUTONOMIC],
    basis: 'Vagal parasympathetic fibres reach the stomach.' },
  { id: 'vagal-liver', kind: 'neural-efferent', from: 'vagal-origin', to: 'liver', referenceIds: [AUTONOMIC],
    basis: 'Vagal parasympathetic fibres reach the liver.' },
  { id: 'vagal-pancreas', kind: 'neural-efferent', from: 'vagal-origin', to: 'pancreas', referenceIds: [AUTONOMIC],
    basis: 'Vagal parasympathetic fibres reach the pancreas.' },
  { id: 'trigeminal-masseter', kind: 'neural-efferent', from: 'trigeminal-origin', to: 'masseter', referenceIds: [PERIPHERAL, AXIAL],
    basis: 'The trigeminal nerve controls the muscles of mastication, of which the masseter is the main chewing muscle.' },
  { id: 'optic-visual', kind: 'neural-afferent', from: 'eye', to: 'visual-target', referenceIds: [PERIPHERAL],
    basis: 'The optic nerve connects retinal ganglion cells with thalamic, hypothalamic and midbrain targets.' },
];
const ROUTES: readonly CircuitRoute[] = Object.freeze(ROUTE_TABLE.map((route) => Object.freeze({ ...route, referenceIds: Object.freeze([...route.referenceIds]) })));

const each = (...structureIds: string[]): RoleBinding => Object.freeze({ structureIds: Object.freeze(structureIds), mode: 'each' });

/** Exact source-label bindings. Unbound roles omit their routes rather than approximating an organ. */
const BINDINGS: Readonly<Record<string, Readonly<Partial<Record<CircuitRole, RoleBinding>>>>> = Object.freeze({
  'digimouse-tessellated-v1': Object.freeze({
    heart: each('digimouse:3'), lungs: each('digimouse:9', 'digimouse:10'), brain: each('digimouse:2'),
    liver: each('digimouse:12'), stomach: each('digimouse:5'), spleen: each('digimouse:6'), pancreas: each('digimouse:11'),
    kidneys: each('digimouse:7', 'digimouse:8'), bladder: each('digimouse:4'), testes: each('digimouse:16', 'digimouse:17'),
    'vagal-origin': Object.freeze({ structureIds: Object.freeze(['digimouse:2']), mode: 'each',
      inference: 'Vagal brain-stem nuclei are assigned to the aggregate source Brain region. The source does not segment the brain stem or its nuclei.' }),
  }),
  'digimouse-volume-040-v1': Object.freeze({
    heart: each('digimouse-volume:9'), lungs: each('digimouse-volume:21'),
    brain: Object.freeze({ structureIds: Object.freeze(['digimouse-volume:4', 'digimouse-volume:5', 'digimouse-volume:6',
      'digimouse-volume:7', 'digimouse-volume:8', 'digimouse-volume:10']), mode: 'union' }),
    eye: each('digimouse-volume:3'), masseter: each('digimouse-volume:11'), liver: each('digimouse-volume:18'),
    stomach: each('digimouse-volume:15'), spleen: each('digimouse-volume:16'), pancreas: each('digimouse-volume:17'),
    kidneys: each('digimouse-volume:19'), bladder: each('digimouse-volume:13'), testes: each('digimouse-volume:14'),
    'vagal-origin': Object.freeze({ structureIds: Object.freeze(['digimouse-volume:4']), mode: 'each',
      inference: 'The dorsal vagal nucleus and nucleus ambiguus are assigned to the source Medulla label from standard neuroanatomy. The cited section names brain-stem nuclei without localizing them, and the source does not segment nuclei.' }),
    'trigeminal-origin': Object.freeze({ structureIds: Object.freeze(['digimouse-volume:10']), mode: 'each',
      inference: 'The trigeminal motor origin is assumed to lie within the undivided source label "rest of the brain". No nucleus or pontine boundary is segmented.' }),
    'visual-target': Object.freeze({ structureIds: Object.freeze(['digimouse-volume:10']), mode: 'each',
      inference: 'Thalamic, hypothalamic and midbrain visual targets are assumed to lie within the undivided source label "rest of the brain".' }),
  }),
});

export const LIVING_CIRCUIT_LIMITATIONS: readonly string[] = Object.freeze([
  'Connectors are display curves between anchored source surfaces. They are not vessel or nerve geometry, and their paths, lengths and curvature carry no anatomical meaning.',
  'Routes are organ-level educational simplifications of general mammalian anatomy from a human-oriented textbook. Mouse-specific branching, laterality and variation are not represented.',
  'Tracer number, spacing and speed are arbitrary display settings. They do not represent regional blood flow, cardiac output, transit time or vessel diameter.',
  'Arterial tracer pulsation follows the illustrative cardiac display period, not a measured mouse heart rate. Oxygen colours are a teaching convention, not computed oxygen content.',
  'Nerve pulses travel at an arbitrary display rate and show the route direction only. They do not represent conduction velocity, firing frequency, afferent vagal fibres or synaptic relay.',
  'Intermediate vessels, venae cavae, ganglia and heart chambers are collapsed. Routes absent from the cited sections, or whose organs are not segmented in the reference, are omitted rather than approximated.',
]);

const PREDICATE: Record<CircuitKind, BiologicalRelationship['predicate']> = {
  'pulmonary-arterial': 'blood-supply', 'pulmonary-venous': 'venous-drainage', 'systemic-arterial': 'blood-supply',
  'systemic-venous': 'venous-drainage', 'hepatic-portal': 'venous-drainage', 'neural-efferent': 'innervated-by', 'neural-afferent': 'innervated-by',
};
const BLOOD: Partial<Record<CircuitKind, CircuitBlood>> = {
  'pulmonary-arterial': 'oxygen-poor', 'pulmonary-venous': 'oxygen-rich', 'systemic-arterial': 'oxygen-rich',
  'systemic-venous': 'oxygen-poor', 'hepatic-portal': 'oxygen-poor',
};

function freezeResult(result: LivingCircuitsResult): LivingCircuitsResult { return Object.freeze(result); }
function unavailable(atlasId: string, errors: readonly string[]): LivingCircuitsResult {
  return freezeResult({ ok: false, atlasId, classification: 'illustrative', evidence: 'educational-simplification', edges: Object.freeze([]),
    omittedRoutes: Object.freeze([]), limitations: LIVING_CIRCUIT_LIMITATIONS, references: LIVING_CIRCUIT_REFERENCES, errors: Object.freeze([...errors]) });
}

/** References with schematic circuit bindings. */
export const LIVING_CIRCUIT_ATLAS_IDS: readonly string[] = Object.freeze(Object.keys(BINDINGS));

/**
 * Resolve the route table against one reference. Every bound ID must exist in
 * the reference exactly once; otherwise no route is returned. Each binding in
 * "each" mode produces one connector per listed region, so two kidney regions
 * receive two separate connectors without a laterality claim.
 */
export function buildLivingCircuits(atlas: Pick<Atlas, 'id' | 'structures'>): LivingCircuitsResult {
  const atlasId = typeof atlas?.id === 'string' ? atlas.id : '';
  const bindings = Object.hasOwn(BINDINGS, atlasId) ? BINDINGS[atlasId] : undefined;
  if (!bindings) return unavailable(atlasId, ['No schematic circuit bindings exist for this reference.']);
  if (!Array.isArray(atlas.structures)) return unavailable(atlasId, ['Reference structures are unavailable.']);
  const counts = new Map<string, number>();
  for (const structure of atlas.structures) {
    const id = structure?.id;
    if (typeof id === 'string') counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  for (const binding of Object.values(bindings)) {
    for (const id of binding!.structureIds) {
      if (counts.get(id) !== 1) return unavailable(atlasId, [`Circuit binding ${id} is absent or duplicated in this reference.`]);
    }
  }
  const references = new Map(LIVING_CIRCUIT_REFERENCES.map((reference) => [reference.id, reference]));
  const edges: CircuitEdge[] = [], omitted: OmittedCircuitRoute[] = [];
  const endpoints = (binding: RoleBinding, role: CircuitRole): CircuitEndpoint[] => binding.mode === 'union'
    ? [Object.freeze({ role, structureIds: binding.structureIds })]
    : binding.structureIds.map((id) => Object.freeze({ role, structureIds: Object.freeze([id]) }));
  for (const route of ROUTES) {
    const from = bindings[route.from], to = bindings[route.to];
    if (!from || !to) {
      const missing = [!from ? route.from : null, !to ? route.to : null].filter(Boolean).join(' and ');
      omitted.push(Object.freeze({ routeId: route.id, reason: `No source region is bound to ${missing} in this reference.` }));
      continue;
    }
    const pairs: [CircuitEndpoint, CircuitEndpoint][] = [];
    for (const source of endpoints(from, route.from)) for (const target of endpoints(to, route.to)) pairs.push([source, target]);
    pairs.forEach(([source, target], index) => {
      const id = `${route.id}:${index}`;
      const sourceReferences: ScientificReference[] = route.referenceIds.map((referenceId) => references.get(referenceId)!)
        .map(({ id: referenceId, title, url }) => Object.freeze({ id: referenceId, title, url }));
      Object.freeze(sourceReferences);
      const inferences = [from.inference, to.inference].filter((value): value is string => !!value);
      // The supplied, drained or innervated organ is the relationship subject.
      const organIsTarget = route.kind === 'systemic-arterial' || route.kind === 'pulmonary-arterial' || route.kind === 'neural-efferent';
      const subjectId = (organIsTarget ? target : source).structureIds.join('+');
      const objectId = (organIsTarget ? source : target).structureIds.join('+');
      edges.push(Object.freeze({
        id, routeId: route.id, kind: route.kind, layer: route.kind.startsWith('neural') ? 'neural' : 'circulation',
        ...(BLOOD[route.kind] ? { blood: BLOOD[route.kind] } : {}),
        from: source, to: target, basis: route.basis,
        relationship: Object.freeze({ id: `schematic:${atlasId}:${id}`, subjectId, predicate: PREDICATE[route.kind], objectId,
          evidence: Object.freeze({ classification: 'educational-simplification' as const, references: sourceReferences,
            simplification: 'Organ-level textbook relationship drawn as one schematic connector; intermediate structures are collapsed.' }) }),
        bindingInferences: Object.freeze([...new Set(inferences)]),
      }));
    });
  }
  return freezeResult({ ok: true, atlasId, classification: 'illustrative', evidence: 'educational-simplification',
    edges: Object.freeze(edges), omittedRoutes: Object.freeze(omitted), limitations: LIVING_CIRCUIT_LIMITATIONS,
    references: LIVING_CIRCUIT_REFERENCES, errors: Object.freeze([]) });
}

export interface CircuitConnection {
  readonly edge: CircuitEdge;
  /** Direction relative to the inspected region. */
  readonly direction: 'outgoing' | 'incoming';
  readonly partner: CircuitEndpoint;
}

/** Connectors whose anchored endpoint includes the structure, in route-table order. */
export function circuitConnectionsForStructure(result: LivingCircuitsResult, structureId: string): readonly CircuitConnection[] {
  if (!result.ok || typeof structureId !== 'string') return Object.freeze([]);
  const connections: CircuitConnection[] = [];
  for (const edge of result.edges) {
    if (edge.from.structureIds.includes(structureId)) connections.push(Object.freeze({ edge, direction: 'outgoing', partner: edge.to }));
    if (edge.to.structureIds.includes(structureId)) connections.push(Object.freeze({ edge, direction: 'incoming', partner: edge.from }));
  }
  return Object.freeze(connections);
}

/** Conventional teaching colours; they are not computed oxygen content or measured activity. */
export const CIRCUIT_COLORS: Readonly<Record<CircuitKind, string>> = Object.freeze({
  'pulmonary-arterial': '#4f7fe0', 'pulmonary-venous': '#e2474f', 'systemic-arterial': '#e2474f',
  'systemic-venous': '#4f7fe0', 'hepatic-portal': '#8a63d2', 'neural-efferent': '#f1c84b', 'neural-afferent': '#52d1c2',
});

/** Arbitrary display timing in display seconds. None of these values is a physiological rate. */
export const CIRCUIT_DISPLAY_TIMING = Object.freeze({
  /** Matches the illustrative cardiac deformation period. */
  cardiacPeriodS: 1,
  /** Phase of maximal illustrative contraction within the cardiac display period. */
  ejectionPhase: 0.25,
  arterialPathsPerS: 0.32,
  /** Relative pulsation of arterial tracer speed; below 1, so tracers never reverse. */
  arterialPulsation: 0.65,
  venousPathsPerS: 0.2,
  portalPathsPerS: 0.16,
  nervePulseIntervalS: 1.5,
  nerveTravelS: 0.6,
});

function fraction(value: number): number { return value - Math.floor(value); }

/**
 * Position of one blood tracer along its connector, from 0 at the source end to
 * just below 1 at the target end. Arterial and pulmonary-arterial tracers follow
 * u(t) = r t + (r a T / 2 pi) sin(2 pi (t / T - phase)) + offset, whose speed
 * r (1 + a cos(...)) peaks at the illustrative contraction and stays positive.
 */
export function bloodTracerFraction(kind: CircuitKind, timeS: number, offset: number): number {
  if (!Number.isFinite(timeS) || timeS < 0 || !Number.isFinite(offset)) throw new RangeError('Tracer time and offset must be finite, with nonnegative time.');
  const timing = CIRCUIT_DISPLAY_TIMING;
  if (kind === 'systemic-arterial' || kind === 'pulmonary-arterial') {
    const rate = timing.arterialPathsPerS, period = timing.cardiacPeriodS;
    return fraction(rate * timeS + rate * timing.arterialPulsation * period / (2 * Math.PI)
      * Math.sin(2 * Math.PI * (timeS / period - timing.ejectionPhase)) + offset);
  }
  if (kind === 'systemic-venous' || kind === 'pulmonary-venous') return fraction(timing.venousPathsPerS * timeS + offset);
  if (kind === 'hepatic-portal') return fraction(timing.portalPathsPerS * timeS + offset);
  throw new RangeError('Blood tracers apply only to circulation connectors.');
}

/**
 * Positions of the nerve pulses currently travelling along one connector, each
 * from 0 at the route origin to 1 at its target. A pulse starts every interval
 * after the connector's phase offset and remains visible for the travel time.
 */
export function nervePulseFractions(timeS: number, phaseOffsetS: number): readonly number[] {
  if (!Number.isFinite(timeS) || timeS < 0 || !Number.isFinite(phaseOffsetS)) throw new RangeError('Pulse time and phase must be finite, with nonnegative time.');
  const { nervePulseIntervalS: interval, nerveTravelS: travel } = CIRCUIT_DISPLAY_TIMING;
  const local = timeS - phaseOffsetS;
  const pulses: number[] = [];
  const newest = Math.floor(local / interval);
  for (let index = newest; index >= newest - Math.ceil(travel / interval); index--) {
    const age = local - index * interval;
    if (age >= 0 && age <= travel) pulses.push(age / travel);
  }
  return Object.freeze(pulses);
}
