import * as THREE from 'three';
import type { Atlas, Structure } from '../domain/types';
import { atlasAssetBytes } from '../domain/atlas-asset';

const ARCHIVE = 'efd5df6df9b69cf21a62d1f4245ecc5419ee4e5c4c72635f444ce3fba5b7971c';
const MAX_HEADER = 16 * 1024;
type Bounds = [number[], number[]];
interface Region {
  structure: Structure;
  index: number;
  vertexOffset: number;
  vertices: number;
  triangleOffset: number;
  triangles: number;
  bounds: Bounds;
}
function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
    && [Object.prototype, null].includes(Object.getPrototypeOf(value));
}
function natural(value: unknown): value is number { return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0; }
function vector(value: unknown): value is number[] { return Array.isArray(value) && value.length === 3 && value.every((item) => typeof item === 'number' && Number.isFinite(item)); }
function requireCondition(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

/** Decode the registered source-native PLY without assigning a physical scale. */
export function parseNativePly(bytes: ArrayBuffer, atlas: Atlas): THREE.Group {
  requireCondition(atlas.id === 'ema147-native-v1' && atlas.assetFormat === 'ply-native-v1'
    && atlas.assetUrl === '/atlas-ema147/ema147-native.ply'
    && atlas.coordinateFrame.id === 'emouseatlas-ema147-stl-native-v1'
    && atlas.coordinateFrame.sourceUnits === 'unknown' && atlas.coordinateFrame.assetUnits === 'unknown'
    && atlas.coordinateFrame.sourceToAssetScale === 1 && atlas.coordinateFrame.unitsVerified === false
    && atlas.coordinateFrame.anatomicalOrientationVerified === false && atlas.coordinateFrame.physicalCalibrationVerified === false
    && atlas.source.id === 'emouseatlas-ema147-2017' && atlas.source.archiveSha256 === ARCHIVE
    && atlas.source.license === 'CC-BY-4.0' && atlas.source.licenseUrl === 'https://creativecommons.org/licenses/by/4.0/'
    && atlas.structures.length === 77 && atlasAssetBytes(atlas) === bytes.byteLength,
  'The native surface does not match the reviewed source, unknown units or coordinate frame.');
  const raw = new Uint8Array(bytes);
  const end = new TextEncoder().encode('end_header\n');
  let headerBytes = -1;
  for (let offset = 0; offset + end.length <= Math.min(raw.length, MAX_HEADER); offset++) {
    if (offset > 0 && raw[offset - 1] !== 10) continue;
    if (end.every((value, index) => raw[offset + index] === value)) { headerBytes = offset + end.length; break; }
  }
  requireCondition(headerBytes > 0, 'Native PLY header is missing or exceeds its bound.');
  const header = new TextDecoder('ascii', { fatal: true }).decode(raw.subarray(0, headerBytes));
  requireCondition(!/[^\x20-\x7e\n]/u.test(header), 'Native PLY header must contain bounded ASCII lines.');
  const lines = header.trimEnd().split('\n');
  const identities = new Map<number, { id: string; file: string }>();
  const schema: string[] = [];
  let nativeComment = 0;
  for (const line of lines) {
    if (line.startsWith('comment region ')) {
      const match = /^comment region (0|[1-9]\d*) (ema147:(?:EMAPA:[1-9]\d*|reference)) (Surfaces\/[A-Za-z0-9_.-]+\.stl)$/.exec(line);
      requireCondition(match && Number(match[1]) < 77 && !identities.has(Number(match[1])), 'Native PLY region identity is invalid or duplicated.');
      identities.set(Number(match[1]), { id: match[2], file: match[3] });
    } else if (line.startsWith('comment ')) {
      requireCondition(line === 'comment MouseBio_3D EMA147 native source coordinates; units unknown' && ++nativeComment === 1,
        'Native PLY contains unregistered metadata.');
    } else schema.push(line);
  }
  requireCondition(identities.size === 77 && nativeComment === 1, 'Native PLY must bind every source region.');
  const vertexMatch = /^element vertex ([1-9]\d*)$/.exec(schema[2] ?? '');
  const faceMatch = /^element face ([1-9]\d*)$/.exec(schema[10] ?? '');
  requireCondition(vertexMatch && faceMatch, 'Native PLY element counts are invalid.');
  const vertexCount = Number(vertexMatch[1]), triangleCount = Number(faceMatch[1]);
  const expectedSchema = ['ply', 'format binary_little_endian 1.0', `element vertex ${vertexCount}`,
    'property float x', 'property float y', 'property float z', 'property float nx', 'property float ny', 'property float nz',
    'property uint source_region_index', `element face ${triangleCount}`, 'property list uchar uint vertex_indices', 'end_header'];
  requireCondition(schema.length === expectedSchema.length && schema.every((line, index) => line === expectedSchema[index]), 'Unsupported native PLY property layout.');
  requireCondition(natural(vertexCount) && vertexCount <= 10_000_000 && natural(triangleCount) && triangleCount <= 5_000_000
    && headerBytes + vertexCount * 28 + triangleCount * 13 === bytes.byteLength, 'Native PLY binary size or counts are invalid.');
  const regions: Region[] = [];
  const ids = new Set<string>();
  let vertices = 0, triangles = 0;
  for (const [index, structure] of atlas.structures.entries()) {
    const value = structure as Structure & Record<string, unknown>;
    const geometry = value.geometry;
    const identity = identities.get(index)!;
    requireCondition(!ids.has(structure.id) && structure.id === identity.id && value.sourceFile === identity.file
      && value.sourceRegionIndex === index && record(geometry) && geometry.vertexOffset === vertices
      && geometry.triangleOffset === triangles && natural(geometry.vertices) && geometry.vertices > 0
      && natural(geometry.triangles) && geometry.triangles > 0, 'Native PLY manifest region ranges or identities are inconsistent.');
    const bounds = geometry.boundsSourceUnits;
    requireCondition(Array.isArray(bounds) && bounds.length === 2 && vector(bounds[0]) && vector(bounds[1])
      && bounds[0].every((minimum, axis) => minimum < bounds[1][axis]), 'Native PLY source-coordinate bounds are invalid.');
    ids.add(structure.id);
    regions.push({ structure, index, vertexOffset: vertices, vertices: geometry.vertices, triangleOffset: triangles,
      triangles: geometry.triangles, bounds: bounds as Bounds });
    vertices += geometry.vertices; triangles += geometry.triangles;
  }
  requireCondition(vertices === vertexCount && triangles === triangleCount && atlas.statistics.vertices === vertexCount && atlas.statistics.triangles === triangleCount,
    'Native PLY manifest totals differ from the asset.');
  return decodeRegions(bytes, headerBytes, vertexCount, regions, identities);
}

function decodeRegions(bytes: ArrayBuffer, headerBytes: number, vertexCount: number, regions: Region[],
  identities: Map<number, { id: string; file: string }>): THREE.Group {
  const view = new DataView(bytes);
  const facesOffset = headerBytes + vertexCount * 28;
  const scene = new THREE.Group();
  try {
    for (const region of regions) {
      const positions = new Float32Array(region.vertices * 3), normals = new Float32Array(region.vertices * 3);
      const indices = new Uint32Array(region.triangles * 3), used = new Uint8Array(region.vertices);
      const minimum = [Infinity, Infinity, Infinity], maximum = [-Infinity, -Infinity, -Infinity];
      for (let index = 0; index < region.vertices; index++) {
        const offset = headerBytes + (region.vertexOffset + index) * 28;
        requireCondition(view.getUint32(offset + 24, true) === region.index, 'Native PLY vertex crosses a source-region boundary.');
        for (let axis = 0; axis < 3; axis++) {
          const position = view.getFloat32(offset + axis * 4, true), normal = view.getFloat32(offset + 12 + axis * 4, true);
          requireCondition(Number.isFinite(position) && Number.isFinite(normal), 'Native PLY has nonfinite coordinates or normals.');
          positions[index * 3 + axis] = position; normals[index * 3 + axis] = normal;
          minimum[axis] = Math.min(minimum[axis], position); maximum[axis] = Math.max(maximum[axis], position);
        }
        requireCondition(Math.abs(Math.hypot(normals[index * 3], normals[index * 3 + 1], normals[index * 3 + 2]) - 1) < 1e-5, 'Native PLY normals are not unit length.');
      }
      for (let index = 0; index < region.triangles; index++) {
        const offset = facesOffset + (region.triangleOffset + index) * 13;
        requireCondition(view.getUint8(offset) === 3, 'Native PLY contains a nontriangular face.');
        for (let corner = 0; corner < 3; corner++) {
          const vertex = view.getUint32(offset + 1 + corner * 4, true) - region.vertexOffset;
          requireCondition(vertex >= 0 && vertex < region.vertices, 'Native PLY face crosses a source-region boundary.');
          indices[index * 3 + corner] = vertex; used[vertex] = 1;
        }
        const a = indices[index * 3] * 3, b = indices[index * 3 + 1] * 3, c = indices[index * 3 + 2] * 3;
        const ab = [positions[b] - positions[a], positions[b + 1] - positions[a + 1], positions[b + 2] - positions[a + 2]];
        const ac = [positions[c] - positions[a], positions[c + 1] - positions[a + 1], positions[c + 2] - positions[a + 2]];
        const cross = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
        requireCondition(cross.every(Number.isFinite) && Math.hypot(...cross) > 0, 'Native PLY has a degenerate serialized triangle.');
      }
      requireCondition(used.every((value) => value === 1), 'Native PLY contains unreferenced source vertices.');
      for (let axis = 0; axis < 3; axis++) requireCondition(Math.abs(minimum[axis] - region.bounds[0][axis]) <= 1e-5
        && Math.abs(maximum[axis] - region.bounds[1][axis]) <= 1e-5, 'Native PLY source bounds differ from the manifest.');
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
      geometry.setIndex(new THREE.BufferAttribute(indices, 1)); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
      const color = typeof region.structure.color === 'string' && /^#[a-f0-9]{6}$/i.test(region.structure.color) ? region.structure.color : '#9ba5a1';
      const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, roughness: 0.7, side: THREE.DoubleSide }));
      mesh.name = region.structure.id;
      mesh.userData = { structureId: region.structure.id, sourceRegionIndex: region.index, sourceFile: identities.get(region.index)!.file };
      scene.add(mesh);
    }
    return scene;
  } catch (error) {
    scene.traverse((object) => { if (object instanceof THREE.Mesh) { object.geometry.dispose(); for (const material of [object.material].flat()) material.dispose(); } });
    throw error;
  }
}
