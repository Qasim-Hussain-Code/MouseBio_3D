/** Original integration code: MIT, Qasim Hussain.
 * Display connectors, blood tracers and nerve pulses for schematic circuit
 * routes. Anchors are existing source surface vertices; connectors between them
 * are display curves, not vessel or nerve geometry.
 */
import * as THREE from 'three';
import { bloodTracerFraction, CIRCUIT_COLORS, CIRCUIT_DISPLAY_TIMING, nervePulseFractions, type CircuitEdge, type CircuitKind } from '../domain/living-circuits';

export interface CircuitAnchor {
  /** World position of an existing source vertex, excluding illustrative motion scale. */
  readonly point: THREE.Vector3;
  readonly structureIds: readonly string[];
  readonly sampledVertices: number;
}

export interface LivingCircuitOverlayState {
  readonly timeS: number;
  readonly circulation: boolean;
  readonly neural: boolean;
  readonly selectedId: string | null;
  readonly selectionOnly: boolean;
  /** Whether an anchored source region is currently displayed. */
  readonly isVisible: (structureId: string) => boolean;
  readonly clippingPlanes: readonly THREE.Plane[];
}

export interface LivingCircuitOverlayFrame {
  readonly changed: boolean;
  readonly visibleEdgeIds: readonly string[];
  readonly tracers: number;
  readonly pulses: number;
}

export interface LivingCircuitOverlay {
  readonly group: THREE.Group;
  readonly edgeIds: readonly string[];
  readonly omittedEdgeIds: readonly string[];
  anchor(edgeId: string, end: 'from' | 'to'): CircuitAnchor | null;
  /** Sampled connector points from source anchor to target anchor. */
  samples(edgeId: string): readonly THREE.Vector3[] | null;
  update(state: LivingCircuitOverlayState): LivingCircuitOverlayFrame;
  dispose(): void;
}

/** Opposite signs separate supply and return connectors drawn between the same anchors. */
const BEND: Readonly<Record<CircuitKind, number>> = Object.freeze({
  'pulmonary-arterial': 0.2, 'pulmonary-venous': -0.2, 'systemic-arterial': 0.14, 'systemic-venous': -0.14,
  'hepatic-portal': -0.1, 'neural-efferent': 0.3, 'neural-afferent': -0.3,
});

const SAMPLES = 48, MAX_ANCHOR_VERTICES = 80000, MAX_PULSES_PER_EDGE = 2, PULSE_TAIL = 3, PULSE_TAIL_STEP = 0.035;

function baselineMatrix(region: THREE.Object3D): THREE.Matrix4 {
  // Illustrative motion overwrites region scale; anchors use the unscaled source transform.
  const local = new THREE.Matrix4().compose(region.position, region.quaternion, new THREE.Vector3(1, 1, 1));
  if (!region.parent) return local;
  region.parent.updateWorldMatrix(true, false);
  return region.parent.matrixWorld.clone().multiply(local);
}

/**
 * Select the existing source vertex nearest to the mean of the anchored regions'
 * vertices. Large surfaces are sampled with a fixed stride. The returned point
 * always lies on a source surface; no interior or centroid point is created.
 */
export function regionAnchor(regions: readonly THREE.Object3D[], structureIds: readonly string[]): CircuitAnchor | null {
  const points: THREE.Vector3[] = [];
  for (const region of regions) {
    if (!(region instanceof THREE.Mesh) && !(region instanceof THREE.LineSegments)) return null;
    const position = region.geometry?.getAttribute('position');
    if (!position || position.count === 0) return null;
    const matrix = baselineMatrix(region);
    if (!matrix.elements.every(Number.isFinite)) return null;
    const stride = Math.max(1, Math.ceil(position.count / MAX_ANCHOR_VERTICES));
    for (let index = 0; index < position.count; index += stride) {
      const point = new THREE.Vector3().fromBufferAttribute(position, index).applyMatrix4(matrix);
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || !Number.isFinite(point.z)) return null;
      points.push(point);
    }
  }
  if (!points.length) return null;
  const mean = new THREE.Vector3();
  for (const point of points) mean.add(point);
  mean.divideScalar(points.length);
  let nearest = points[0], distance = Infinity;
  for (const point of points) {
    const candidate = point.distanceToSquared(mean);
    if (candidate < distance) { distance = candidate; nearest = point; }
  }
  return Object.freeze({ point: nearest.clone(), structureIds: Object.freeze([...structureIds]), sampledVertices: points.length });
}

/** One quadratic display curve. Its bend direction does not depend on route direction. */
export function circuitCurve(from: THREE.Vector3, to: THREE.Vector3, kind: CircuitKind, canonicalForward: boolean): THREE.QuadraticBezierCurve3 | null {
  const span = to.clone().sub(from), length = span.length();
  if (!Number.isFinite(length) || length === 0) return null;
  const canonical = canonicalForward ? span.clone() : span.clone().negate();
  let normal = new THREE.Vector3().crossVectors(canonical, new THREE.Vector3(0, 0, 1));
  if (normal.lengthSq() < 1e-12 * length * length) normal = new THREE.Vector3().crossVectors(canonical, new THREE.Vector3(1, 0, 0));
  normal.normalize();
  const control = from.clone().add(to).multiplyScalar(0.5).addScaledVector(normal, BEND[kind] * length);
  return new THREE.QuadraticBezierCurve3(from.clone(), control, to.clone());
}

function discTexture(): THREE.DataTexture {
  const size = 32, data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const radius = Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2) / (size / 2);
    const alpha = Math.max(0, Math.min(1, (1 - radius) / 0.25));
    data.set([255, 255, 255, Math.round(alpha * 255)], (y * size + x) * 4);
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.needsUpdate = true;
  return texture;
}

function pointAt(samples: readonly THREE.Vector3[], u: number, target: THREE.Vector3): THREE.Vector3 {
  const scaled = Math.max(0, Math.min(1, u)) * (samples.length - 1);
  const left = Math.min(samples.length - 2, Math.floor(scaled));
  return target.copy(samples[left]).lerp(samples[left + 1], scaled - left);
}

interface PreparedEdge {
  readonly edge: CircuitEdge;
  readonly from: CircuitAnchor;
  readonly to: CircuitAnchor;
  readonly samples: readonly THREE.Vector3[];
  readonly tracers: number;
  readonly pulsePhaseS: number;
  readonly lineStart: number;
}

/**
 * Prepare connectors for the edges whose anchored regions are available. Edges
 * with a missing region or coincident anchors are omitted and reported, never
 * substituted with another location.
 */
export function createLivingCircuitOverlay(edges: readonly CircuitEdge[], regions: ReadonlyMap<string, THREE.Object3D>): LivingCircuitOverlay | null {
  const anchors = new Map<string, CircuitAnchor | null>();
  const anchorFor = (ids: readonly string[]) => {
    const key = ids.join('+');
    if (!anchors.has(key)) {
      const objects = ids.map((id) => regions.get(id));
      anchors.set(key, objects.every((object): object is THREE.Object3D => !!object) ? regionAnchor(objects, ids) : null);
    }
    return anchors.get(key)!;
  };
  const prepared: PreparedEdge[] = [], omitted: string[] = [];
  const lengths: number[] = [];
  const pending: { edge: CircuitEdge; from: CircuitAnchor; to: CircuitAnchor; samples: THREE.Vector3[]; length: number }[] = [];
  for (const edge of edges) {
    const from = anchorFor(edge.from.structureIds), to = anchorFor(edge.to.structureIds);
    const forward = edge.from.structureIds.join('+') < edge.to.structureIds.join('+');
    const curve = from && to ? circuitCurve(from.point, to.point, edge.kind, forward) : null;
    if (!from || !to || !curve) { omitted.push(edge.id); continue; }
    const samples = curve.getSpacedPoints(SAMPLES - 1);
    const length = curve.getLength();
    if (!samples.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z)) || !Number.isFinite(length)) {
      omitted.push(edge.id); continue;
    }
    pending.push({ edge, from, to, samples, length }); lengths.push(length);
  }
  if (!pending.length) return null;
  const median = [...lengths].sort((a, b) => a - b)[Math.floor(lengths.length / 2)];
  pending.forEach((entry, index) => prepared.push(Object.freeze({ edge: entry.edge, from: entry.from, to: entry.to,
    samples: Object.freeze(entry.samples),
    tracers: entry.edge.layer === 'circulation' ? Math.max(4, Math.min(16, Math.round(8 * entry.length / median))) : 0,
    // Deterministic stagger so nerve routes do not pulse in unison.
    pulsePhaseS: (index * 0.37) % CIRCUIT_DISPLAY_TIMING.nervePulseIntervalS,
    lineStart: index * (SAMPLES - 1) * 2 })));

  const group = new THREE.Group();
  group.name = 'Schematic circuit connectors, not vessel or nerve geometry';
  group.userData.isDisplayOverlay = true;

  const segmentVertices = prepared.length * (SAMPLES - 1) * 2;
  const linePositions = new Float32Array(segmentVertices * 3), lineColors = new Float32Array(segmentVertices * 3);
  prepared.forEach((entry) => {
    for (let segment = 0; segment < SAMPLES - 1; segment++) {
      entry.samples[segment].toArray(linePositions, (entry.lineStart + segment * 2) * 3);
      entry.samples[segment + 1].toArray(linePositions, (entry.lineStart + segment * 2 + 1) * 3);
    }
  });
  const lineGeometry = new THREE.BufferGeometry();
  lineGeometry.setAttribute('position', new THREE.BufferAttribute(linePositions, 3));
  lineGeometry.setAttribute('color', new THREE.BufferAttribute(lineColors, 3));
  lineGeometry.setIndex([]);
  const lineMaterial = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.55, depthWrite: false });
  const lines = new THREE.LineSegments(lineGeometry, lineMaterial);
  lines.name = 'Schematic route connectors'; lines.renderOrder = 4; lines.raycast = () => {};

  const disc = discTexture();
  const tracerCapacity = prepared.reduce((total, entry) => total + entry.tracers, 0);
  const tracerGeometry = new THREE.BufferGeometry();
  const tracerPositions = new Float32Array(Math.max(1, tracerCapacity) * 3), tracerColors = new Float32Array(Math.max(1, tracerCapacity) * 3);
  tracerGeometry.setAttribute('position', new THREE.BufferAttribute(tracerPositions, 3));
  tracerGeometry.setAttribute('color', new THREE.BufferAttribute(tracerColors, 3));
  tracerGeometry.setDrawRange(0, 0);
  const tracerMaterial = new THREE.PointsMaterial({ size: 7, sizeAttenuation: false, map: disc, vertexColors: true,
    transparent: true, alphaTest: 0.05, depthWrite: false });
  const tracers = new THREE.Points(tracerGeometry, tracerMaterial);
  tracers.name = 'Schematic blood tracers, not blood cells'; tracers.renderOrder = 5; tracers.raycast = () => {};

  const neuralCount = prepared.filter((entry) => entry.edge.layer === 'neural').length;
  const pulseCapacity = Math.max(1, neuralCount * MAX_PULSES_PER_EDGE);
  const headGeometry = new THREE.BufferGeometry(), tailGeometry = new THREE.BufferGeometry();
  const headPositions = new Float32Array(pulseCapacity * 3), headColors = new Float32Array(pulseCapacity * 3);
  const tailPositions = new Float32Array(pulseCapacity * PULSE_TAIL * 3), tailColors = new Float32Array(pulseCapacity * PULSE_TAIL * 3);
  headGeometry.setAttribute('position', new THREE.BufferAttribute(headPositions, 3));
  headGeometry.setAttribute('color', new THREE.BufferAttribute(headColors, 3));
  tailGeometry.setAttribute('position', new THREE.BufferAttribute(tailPositions, 3));
  tailGeometry.setAttribute('color', new THREE.BufferAttribute(tailColors, 3));
  headGeometry.setDrawRange(0, 0); tailGeometry.setDrawRange(0, 0);
  const headMaterial = new THREE.PointsMaterial({ size: 9, sizeAttenuation: false, map: disc, vertexColors: true, transparent: true, alphaTest: 0.05, depthWrite: false });
  const tailMaterial = new THREE.PointsMaterial({ size: 5, sizeAttenuation: false, map: disc, vertexColors: true, transparent: true, alphaTest: 0.05, depthWrite: false, opacity: 0.6 });
  const heads = new THREE.Points(headGeometry, headMaterial), tails = new THREE.Points(tailGeometry, tailMaterial);
  heads.name = 'Schematic nerve pulses, not measured activity'; tails.name = 'Schematic nerve pulse trails';
  heads.renderOrder = 6; tails.renderOrder = 5; heads.raycast = () => {}; tails.raycast = () => {};

  group.add(lines, tracers, tails, heads);
  const materials = [lineMaterial, tracerMaterial, headMaterial, tailMaterial];
  const colors = new Map(Object.entries(CIRCUIT_COLORS).map(([kind, value]) => [kind, new THREE.Color(value)]));
  const scratch = new THREE.Vector3(), color = new THREE.Color();
  let disposed = false, lastVisibility = '', lastTime = NaN, lastClip = '';
  let visible: PreparedEdge[] = [];
  const byId = new Map(prepared.map((entry) => [entry.edge.id, entry]));

  const touches = (entry: PreparedEdge, id: string | null) => !!id && (entry.from.structureIds.includes(id) || entry.to.structureIds.includes(id));
  const shown = (entry: PreparedEdge, state: LivingCircuitOverlayState) =>
    (entry.edge.layer === 'circulation' ? state.circulation : state.neural)
    && entry.from.structureIds.some(state.isVisible) && entry.to.structureIds.some(state.isVisible)
    && (!state.selectionOnly || touches(entry, state.selectedId));

  return Object.freeze({
    group,
    edgeIds: Object.freeze(prepared.map((entry) => entry.edge.id)),
    omittedEdgeIds: Object.freeze(omitted),
    anchor(edgeId: string, end: 'from' | 'to') { const entry = byId.get(edgeId); return entry ? entry[end] : null; },
    samples(edgeId: string) { return byId.get(edgeId)?.samples ?? null; },
    update(state: LivingCircuitOverlayState): LivingCircuitOverlayFrame {
      if (disposed || !Number.isFinite(state.timeS) || state.timeS < 0) return Object.freeze({ changed: false, visibleEdgeIds: Object.freeze([]), tracers: 0, pulses: 0 });
      const filtered = prepared.filter((entry) => shown(entry, state));
      const signature = `${filtered.map((entry) => entry.edge.id).join(',')}|${state.selectedId ?? ''}`;
      const clipSignature = state.clippingPlanes.map((plane) => `${plane.normal.toArray().join(',')},${plane.constant}`).join(';');
      const visibilityChanged = signature !== lastVisibility, clipChanged = clipSignature !== lastClip;
      if (!visibilityChanged && !clipChanged && state.timeS === lastTime) {
        return Object.freeze({ changed: false, visibleEdgeIds: Object.freeze(visible.map((entry) => entry.edge.id)), tracers: tracerGeometry.drawRange.count, pulses: headGeometry.drawRange.count });
      }
      if (clipChanged) {
        for (const material of materials) material.clippingPlanes = state.clippingPlanes.map((plane) => plane.clone());
        lastClip = clipSignature;
      }
      if (visibilityChanged) {
        visible = filtered; lastVisibility = signature;
        const index: number[] = [];
        for (const entry of visible) {
          const emphasis = !state.selectedId || touches(entry, state.selectedId) ? 1 : 0.45;
          color.copy(colors.get(entry.edge.kind)!).multiplyScalar(emphasis);
          for (let vertex = 0; vertex < (SAMPLES - 1) * 2; vertex++) {
            index.push(entry.lineStart + vertex);
            color.toArray(lineColors, (entry.lineStart + vertex) * 3);
          }
        }
        lineGeometry.setIndex(index);
        lineGeometry.getAttribute('color').needsUpdate = true;
      }
      let tracerCount = 0, pulseCount = 0, tailCount = 0;
      for (const entry of visible) {
        const entryColor = colors.get(entry.edge.kind)!;
        if (entry.edge.layer === 'circulation') {
          for (let tracer = 0; tracer < entry.tracers; tracer++) {
            const u = bloodTracerFraction(entry.edge.kind, state.timeS, tracer / entry.tracers);
            pointAt(entry.samples, u, scratch).toArray(tracerPositions, tracerCount * 3);
            entryColor.toArray(tracerColors, tracerCount * 3);
            tracerCount++;
          }
        } else {
          for (const u of nervePulseFractions(state.timeS, entry.pulsePhaseS).slice(0, MAX_PULSES_PER_EDGE)) {
            pointAt(entry.samples, u, scratch).toArray(headPositions, pulseCount * 3);
            color.copy(entryColor).lerp(new THREE.Color('#ffffff'), 0.35).toArray(headColors, pulseCount * 3);
            pulseCount++;
            for (let step = 1; step <= PULSE_TAIL; step++) {
              if (u - step * PULSE_TAIL_STEP < 0) break;
              pointAt(entry.samples, u - step * PULSE_TAIL_STEP, scratch).toArray(tailPositions, tailCount * 3);
              entryColor.toArray(tailColors, tailCount * 3);
              tailCount++;
            }
          }
        }
      }
      tracerGeometry.setDrawRange(0, tracerCount);
      headGeometry.setDrawRange(0, pulseCount); tailGeometry.setDrawRange(0, tailCount);
      for (const geometry of [tracerGeometry, headGeometry, tailGeometry]) {
        geometry.getAttribute('position').needsUpdate = true; geometry.getAttribute('color').needsUpdate = true;
      }
      lastTime = state.timeS;
      return Object.freeze({ changed: true, visibleEdgeIds: Object.freeze(visible.map((entry) => entry.edge.id)), tracers: tracerCount, pulses: pulseCount });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      for (const geometry of [lineGeometry, tracerGeometry, headGeometry, tailGeometry]) geometry.dispose();
      for (const material of materials) material.dispose();
      disc.dispose();
    },
  });
}
