import * as THREE from 'three';
import { CUT_DECLARATIONS, CUT_SHARED, CUT_TEST } from './cut-uniforms';
import { LIFE_DECLARATIONS, LIFE_MOVE, LIFE_SHARED } from './life-field';
import { WINDOW_DECLARATIONS, WINDOW_TEST } from './surface-shading';

/**
 * What an instrument touches: the structure seen at a point of the view, where that point is now and where it is in the model at rest. It draws a small piece of the view off screen,
 * with the same openings and cuts as the display, so that an instrument can only touch what can be seen, wherever that has moved to.
 */
const VERTEX = `
varying vec3 vWinWorld;
varying vec3 vNow;
${LIFE_DECLARATIONS}
${LIFE_MOVE}
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWinWorld = world.xyz;
  world.xyz += mbLifeMove(world.xyz, normalize(mat3(modelMatrix) * normal));
  vNow = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}`;
const FRAGMENT = `
precision highp float;
layout(location = 0) out highp vec4 pickRest;
layout(location = 1) out highp vec4 pickNow;
uniform float uPickId;
varying vec3 vWinWorld;
varying vec3 vNow;
float mbWinDistance = 1.0;
${WINDOW_DECLARATIONS}
${CUT_DECLARATIONS}
void main() {
  ${WINDOW_TEST}
  ${CUT_TEST}
  pickRest = vec4(vWinWorld, uPickId);
  pickNow = vec4(vNow, 1.0);
}`;

export interface LabPickEntry {
  readonly id: string;
  readonly mesh: THREE.Mesh;
  readonly uniforms: Readonly<Record<string, { value: unknown }>>;
  readonly masked: boolean;
  /** Whether it has been moved by a hand, and may lie away from where it lay. */
  readonly moved?: () => boolean;
}

export interface LabHit {
  readonly id: string;
  /** Where the point lies in the model at rest, in which the cuts are held. */
  readonly rest: THREE.Vector3;
  /** Where the point lies now. */
  readonly now: THREE.Vector3;
  /** Towards the viewer, as far as the points round it tell. */
  readonly normal: THREE.Vector3;
  /** The same direction in the model at rest. */
  readonly restNormal: THREE.Vector3;
}

export interface LabPick {
  /** What lies at a pixel of the view, measured from the top left, or null. With `wholeAgain`, cuts are passed over as if they had not been made, which keeps a stroke on its own layer when it comes to the hole it has just cut. */
  at(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, entries: readonly LabPickEntry[], marks: readonly THREE.Object3D[], x: number, y: number, width: number, height: number, wholeAgain?: boolean): LabHit | null;
  dispose(): void;
}

const TILE = 7;
/** How far from the line through a pixel a part can lie at rest and still be touched there, in metres. */
const NEAR_THE_LINE = 0.02;
const ray = new THREE.Raycaster(), centreOf = new THREE.Vector3();

export function createLabPick(): LabPick {
  const target = new THREE.WebGLRenderTarget(TILE, TILE, { count: 2, type: THREE.FloatType, format: THREE.RGBAFormat, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true, stencilBuffer: true, colorSpace: THREE.NoColorSpace, generateMipmaps: false });
  const rest = new Float32Array(TILE * TILE * 4), now = new Float32Array(TILE * TILE * 4);
  const materials = new WeakMap<THREE.Mesh, THREE.ShaderMaterial>();
  const made: THREE.ShaderMaterial[] = [];
  const materialFor = (entry: LabPickEntry) => {
    let material = materials.get(entry.mesh);
    if (!material) {
      material = new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: VERTEX, fragmentShader: FRAGMENT, side: THREE.DoubleSide, blending: THREE.NoBlending, toneMapped: false, uniforms: { uPickId: { value: 0 }, ...entry.uniforms, ...LIFE_SHARED, ...CUT_SHARED } });
      materials.set(entry.mesh, material);
      made.push(material);
    }
    return material;
  };
  const centre = (TILE - 1) / 2;
  return {
    at(renderer, scene, camera, entries, marks, x, y, width, height, wholeAgain = false) {
      // With the cuts passed over the marks would cover the whole skin, and they are not wanted.
      const drawn = new Set<THREE.Object3D>([...entries.map((entry) => entry.mesh), ...(wholeAgain ? [] : marks)]);
      const hidden: THREE.Object3D[] = [];
      // A mark is drawn as a child of the surface it belongs to. If only something else is asked for, that surface is not drawn, and yet its marks must be.
      const carriers = new Set(wholeAgain ? [] : marks.map((mark) => mark.parent));
      const blank: THREE.Material[] = [];
      scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh || object instanceof THREE.LineSegments) || drawn.has(object) || !object.visible) return;
        if (carriers.has(object) && object.material instanceof THREE.Material) { blank.push(object.material); object.material.visible = false; }
        else { hidden.push(object); object.visible = false; }
      });
      // Only what lies near the line through the pixel can be touched, and leaving out the rest spares the drawing. Parts can have been moved by the legs lying out or by a hand, so the line is taken wide.
      ray.setFromCamera(new THREE.Vector2((x + 0.5) / width * 2 - 1, 1 - (y + 0.5) / height * 2), camera);
      for (const entry of entries) {
        if (!entry.mesh.visible) continue;
        if (!entry.mesh.geometry.boundingSphere) entry.mesh.geometry.computeBoundingSphere();
        const sphere = entry.mesh.geometry.boundingSphere!;
        centreOf.copy(sphere.center).applyMatrix4(entry.mesh.matrixWorld);
        if (ray.ray.distanceToPoint(centreOf) > sphere.radius * entry.mesh.matrixWorld.getMaxScaleOnAxis() + NEAR_THE_LINE && !entry.moved?.()) { hidden.push(entry.mesh); entry.mesh.visible = false; }
      }
      const saved = entries.map((entry) => entry.mesh.material);
      entries.forEach((entry, index) => {
        const material = materialFor(entry);
        material.uniforms.uPickId.value = index + 1;
        material.stencilWrite = entry.masked && !wholeAgain;
        material.stencilFunc = THREE.EqualStencilFunc;
        material.stencilRef = 1;
        entry.mesh.material = material;
      });
      const previousTarget = renderer.getRenderTarget(), previousAlpha = renderer.getClearAlpha(), previousEnvironment = scene.environment;
      scene.environment = null;
      camera.setViewOffset(width, height, x - centre, y - centre, TILE, TILE);
      const cutsWere = CUT_SHARED.uCutOn.value;
      if (wholeAgain) CUT_SHARED.uCutOn.value = 0;
      renderer.setRenderTarget(target);
      renderer.setClearAlpha(0);
      renderer.clear();
      renderer.render(scene, camera);
      CUT_SHARED.uCutOn.value = cutsWere;
      renderer.readRenderTargetPixels(target, 0, 0, TILE, TILE, rest, undefined, 0);
      renderer.readRenderTargetPixels(target, 0, 0, TILE, TILE, now, undefined, 1);
      camera.clearViewOffset();
      renderer.setRenderTarget(previousTarget);
      renderer.setClearAlpha(previousAlpha);
      scene.environment = previousEnvironment;
      entries.forEach((entry, index) => { entry.mesh.material = saved[index]; });
      for (const object of hidden) object.visible = true;
      for (const material of blank) material.visible = true;

      // The middle of the piece, or what lies nearest to it, so that a fine vessel can be touched.
      let best = -1, bestAway = Infinity;
      for (let row = 0; row < TILE; row++) for (let column = 0; column < TILE; column++) {
        const index = (row * TILE + column) * 4;
        if (rest[index + 3] < 0.5) continue;
        const away = (row - centre) ** 2 + (column - centre) ** 2;
        if (away < bestAway) { bestAway = away; best = index; }
      }
      if (best < 0) return null;
      const entry = entries[Math.round(rest[best + 3]) - 1];
      if (!entry) return null;
      const point = (buffer: Float32Array, index: number) => new THREE.Vector3(buffer[index], buffer[index + 1], buffer[index + 2]);
      const here = point(now, best), hereAtRest = point(rest, best);
      // The slope of the surface, from neighbouring points of the same piece of the view.
      const pixel = best / 4, column = pixel % TILE, row = Math.floor(pixel / TILE);
      const neighbour = (dx: number, dy: number, buffer: Float32Array) => {
        const nx = column + dx, ny = row + dy;
        if (nx < 0 || ny < 0 || nx >= TILE || ny >= TILE) return null;
        const index = (ny * TILE + nx) * 4;
        return rest[index + 3] === rest[best + 3] ? point(buffer, index) : null;
      };
      const right = neighbour(1, 0, now) ?? neighbour(-1, 0, now), up = neighbour(0, 1, now) ?? neighbour(0, -1, now);
      const toCamera = camera.position.clone().sub(here).normalize();
      let normal = toCamera.clone();
      if (right && up) {
        const made = right.clone().sub(here).cross(up.clone().sub(here));
        if (made.lengthSq() > 1e-16) { made.normalize(); normal = made.dot(toCamera) < 0 ? made.negate() : made; }
      }
      let restNormal = normal.clone();
      const restRight = neighbour(1, 0, rest) ?? neighbour(-1, 0, rest), restUp = neighbour(0, 1, rest) ?? neighbour(0, -1, rest);
      if (restRight && restUp) {
        const made = restRight.clone().sub(hereAtRest).cross(restUp.clone().sub(hereAtRest));
        // The two points chosen on each side keep their order at rest and now, so the sign agrees with that of the normal made from the same points.
        if (made.lengthSq() > 1e-16) { made.normalize(); restNormal = right && up && right.clone().sub(here).cross(up.clone().sub(here)).dot(toCamera) < 0 ? made.negate() : made; }
      }
      return { id: entry.id, rest: hereAtRest, now: here, normal, restNormal };
    },
    dispose() {
      target.dispose();
      for (const material of made) material.dispose();
    },
  };
}
