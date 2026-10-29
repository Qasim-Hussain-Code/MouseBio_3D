import * as THREE from 'three';
import { isLocalTraceAsset, type LocalTraceAsset, type LocalTraceNode } from '../domain/local-trace';
import type { Atlas } from '../domain/types';

function requireCondition(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
function natural(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}
function sameBounds(value: unknown, bounds: THREE.Box3): boolean {
  return Array.isArray(value) && value.length === 2 && value.every((vector, side) => Array.isArray(vector)
    && vector.length === 3 && vector.every((coordinate, axis) => typeof coordinate === 'number' && Number.isFinite(coordinate)
      && coordinate === (side === 0 ? bounds.min : bounds.max).getComponent(axis)));
}

/** Build local parent-linked centerlines only; source radii and type codes generate no geometry. */
export function buildLocalTraceScene(atlas: Atlas, asset: LocalTraceAsset): THREE.Group {
  requireCondition(isLocalTraceAsset(asset) && atlas === asset.atlas, 'A parser-produced local trace and its exact atlas are required.');
  const frame = atlas.coordinateFrame, statistics = atlas.statistics;
  const digest = statistics.assetSha256;
  requireCondition(typeof digest === 'string' && /^[a-f0-9]{64}$/.test(digest)
    && atlas.id === `local-trace-${digest}` && atlas.assetFormat === 'local-trace-v1' && atlas.assetUrl === 'local-memory:trace'
    && frame.id === `local-trace-native-${digest}` && frame.sourceUnits === 'unknown' && frame.assetUnits === 'unknown'
    && frame.sourceToAssetScale === 1 && frame.unitsVerified === false && frame.anatomicalOrientationVerified === false
    && frame.physicalCalibrationVerified === false && frame.registration === null && frame.registrationToDigimouse === null
    && natural(statistics.assetBytes) && statistics.assetBytes > 0 && atlas.structures.length === 1,
  'The local trace source binding or unknown coordinate frame is inconsistent.');
  requireCondition(atlas.structures[0].id === `local-trace:${digest}:record`, 'The local trace record identity is inconsistent.');
  return buildParentLinkedTraceScene(atlas, asset.nodes);
}

/** Geometry preparation shared by source-specific parser guards; this is not an import or identity validator. */
export function buildParentLinkedTraceScene(atlas: Atlas, nodes: readonly LocalTraceNode[]): THREE.Group {
  const statistics = atlas.statistics;
  requireCondition(atlas.structures.length === 1, 'A parent-linked trace must have one selectable source record.');
  const structure = atlas.structures[0];
  requireCondition(typeof structure.meshNode === 'string' && structure.meshNode.length > 0
    && natural(statistics.samples) && statistics.samples === nodes.length && nodes.length > 0
    && natural(statistics.parentLinks) && statistics.parentLinks > 0 && natural(statistics.roots) && statistics.roots > 0
    && statistics.components === statistics.roots && natural(statistics.zeroLengthEdges) && natural(statistics.float32CollapsedEdges)
    && natural(statistics.isolatedSamples),
  'The local trace region or sample statistics are inconsistent.');

  const sourcePositions = new Float32Array(nodes.length * 3);
  const sourceBounds = new THREE.Box3();
  const sourcePoint = new THREE.Vector3();
  const nodeIndices = new Map<number, number>();
  let maximumError = 0;
  for (const [index, node] of nodes.entries()) {
    requireCondition(node.length === 7 && node.every(Number.isFinite) && Number.isSafeInteger(node[0])
      && Number.isSafeInteger(node[6]) && !nodeIndices.has(node[0]), 'Local trace sample identity or coordinates are invalid.');
    nodeIndices.set(node[0], index);
    for (let axis = 0; axis < 3; axis++) {
      const original = node[axis + 2], stored = Math.fround(original);
      requireCondition(Number.isFinite(stored), 'A source coordinate cannot be represented as a finite float32 value.');
      sourcePositions[index * 3 + axis] = stored;
      maximumError = Math.max(maximumError, Math.abs(stored - original));
    }
    sourceBounds.expandByPoint(sourcePoint.set(node[2], node[3], node[4]));
  }
  requireCondition(statistics.maxFloat32PositionError === maximumError && sameBounds(statistics.boundsSourceUnits, sourceBounds),
    'The local trace source-coordinate or serialization diagnostics are inconsistent.');

  const sourceIndices = new Uint32Array(statistics.parentLinks * 2);
  const referenced = new Uint8Array(nodes.length);
  const renderBounds = new THREE.Box3();
  const first = new THREE.Vector3(), second = new THREE.Vector3();
  let parentLinks = 0, roots = 0, zeroLengthEdges = 0, float32CollapsedEdges = 0;
  for (const [childIndex, child] of nodes.entries()) {
    if (child[6] === -1) { roots++; continue; }
    const parentIndex = nodeIndices.get(child[6]);
    requireCondition(parentIndex !== undefined && parentIndex !== childIndex && parentLinks < statistics.parentLinks,
      'A local trace parent link is missing or inconsistent.');
    // Each source child->parent relation appears once, in source child-row order.
    sourceIndices[parentLinks * 2] = childIndex; sourceIndices[parentLinks * 2 + 1] = parentIndex;
    referenced[childIndex] = 1; referenced[parentIndex] = 1;
    const parent = nodes[parentIndex];
    const sourceCoincident = child[2] === parent[2] && child[3] === parent[3] && child[4] === parent[4];
    if (sourceCoincident) zeroLengthEdges++;
    first.fromArray(sourcePositions, childIndex * 3); second.fromArray(sourcePositions, parentIndex * 3);
    if (!sourceCoincident && first.equals(second)) float32CollapsedEdges++;
    renderBounds.expandByPoint(first).expandByPoint(second);
    parentLinks++;
  }
  requireCondition(parentLinks === statistics.parentLinks && roots === statistics.roots
    && zeroLengthEdges === statistics.zeroLengthEdges && float32CollapsedEdges === statistics.float32CollapsedEdges
    && sameBounds(statistics.displayBoundsSourceUnits, renderBounds),
  'The local trace parent-link or rendered-coordinate diagnostics are inconsistent.');
  const displayedSamples = referenced.reduce((total, value) => total + value, 0);
  requireCondition(statistics.isolatedSamples === nodes.length - displayedSamples,
    'The local trace isolated-sample count is inconsistent.');
  const positions = new Float32Array(displayedSamples * 3), indices = new Uint32Array(sourceIndices.length);
  const sourceToVertex = new Uint32Array(nodes.length), vertexSourceIds: number[] = [];
  for (const [sourceIndex, node] of nodes.entries()) if (referenced[sourceIndex]) {
    const vertexIndex = vertexSourceIds.length;
    positions.set(sourcePositions.subarray(sourceIndex * 3, sourceIndex * 3 + 3), vertexIndex * 3);
    sourceToVertex[sourceIndex] = vertexIndex; vertexSourceIds.push(node[0]);
  }
  for (const [index, sourceIndex] of sourceIndices.entries()) indices[index] = sourceToVertex[sourceIndex];
  const center = renderBounds.getCenter(new THREE.Vector3());
  let radiusSquared = 0;
  for (const index of indices) radiusSquared = Math.max(radiusSquared, first.fromArray(positions, index * 3).distanceToSquared(center));
  const radius = Math.sqrt(radiusSquared);
  // The parser gates camera arithmetic using the box diagonal. This culling
  // sphere may be smaller and must not introduce a second camera-scale gate.
  requireCondition(Number.isFinite(radius) && radius > 0, 'The local trace has no drawable extent.');

  const geometry = new THREE.BufferGeometry();
  let material: THREE.LineBasicMaterial | undefined;
  try {
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    // Only referenced rows become vertices, in source-file order. Isolated
    // samples remain in the immutable asset and acquire no point glyphs.
    geometry.boundingBox = renderBounds;
    geometry.boundingSphere = new THREE.Sphere(center, radius);
    material = new THREE.LineBasicMaterial();
    const line = new THREE.LineSegments(geometry, material);
    line.name = structure.meshNode;
    line.userData = { structureId: structure.id, sourceSampleCount: nodes.length, sourceParentLinks: parentLinks,
      isolatedSourceSamples: nodes.length - displayedSamples, vertexSourceIds: Object.freeze(vertexSourceIds) };
    const scene = new THREE.Group();
    scene.add(line);
    return scene;
  } catch (error) {
    geometry.dispose(); material?.dispose(); throw error;
  }
}
