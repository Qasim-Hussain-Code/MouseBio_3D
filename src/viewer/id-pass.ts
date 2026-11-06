import * as THREE from 'three';
import { WINDOW_DECLARATIONS, WINDOW_TEST } from './surface-shading';

/**
 * Which structure is seen at each pixel of the view, drawn off screen with one flat colour per structure and the same
 * openings as the display. It answers what can actually be seen from here, so that a name can point at the part of a
 * structure in view. It is a record of the display and says nothing about the anatomy.
 */
const VERTEX = `
varying vec3 vWinWorld;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWinWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}`;
const FRAGMENT = `
precision highp float;
uniform vec3 uId;
varying vec3 vWinWorld;
float mbWinDistance = 1.0;
${WINDOW_DECLARATIONS}
void main() {
  ${WINDOW_TEST}
  gl_FragColor = vec4(uId, 1.0);
}`;

export interface SeenStructure {
  readonly id: string;
  /** Pixels of the off-screen view showing this structure. */
  readonly pixels: number;
  /** A pixel showing it, near the middle of what is shown, as a share of the width and height of the view from the top left. */
  readonly x: number;
  readonly y: number;
}

export interface IdPassEntry {
  readonly id: string;
  readonly mesh: THREE.Mesh;
  /** The uniforms of the display material, shared so that the opening is the same. */
  readonly uniforms: Readonly<Record<string, { value: unknown }>>;
  /** Drawn only through the opening, as in the display. */
  readonly masked: boolean;
}

export interface IdPass {
  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, entries: readonly IdPassEntry[], marks: readonly THREE.Object3D[], width: number, height: number): SeenStructure[];
  /** The structure shown at a point given as shares of the view, from the last rendering. */
  at(x: number, y: number): string | null;
  dispose(): void;
}

/** A second drawing of an outer surface that leaves no colour and no depth, only a mark in the stencil where the part taken out by the opening would have been seen. */
export function createOpeningMark(geometry: THREE.BufferGeometry, uniforms: Readonly<Record<string, { value: unknown }>>): THREE.Mesh {
  const material = new THREE.ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    side: THREE.DoubleSide,
    uniforms: { uId: { value: new THREE.Color() }, ...uniforms, uWinInvert: { value: 1 }, uWinBack: { value: new THREE.Matrix4() } },
    colorWrite: false,
    depthWrite: false,
    stencilWrite: true,
    stencilFunc: THREE.AlwaysStencilFunc,
    stencilRef: 1,
    stencilZPass: THREE.ReplaceStencilOp,
  });
  const mark = new THREE.Mesh(geometry, material);
  mark.renderOrder = -1;
  mark.frustumCulled = false;
  mark.raycast = () => undefined;
  return mark;
}

export function createIdPass(): IdPass {
  let target: THREE.WebGLRenderTarget | null = null;
  let pixels = new Uint8Array(0);
  let ids: string[] = [];
  const materials = new WeakMap<THREE.Mesh, THREE.ShaderMaterial>();
  const made: THREE.ShaderMaterial[] = [];
  const materialFor = (entry: IdPassEntry) => {
    let material = materials.get(entry.mesh);
    if (!material) {
      material = new THREE.ShaderMaterial({ vertexShader: VERTEX, fragmentShader: FRAGMENT, side: THREE.DoubleSide, blending: THREE.NoBlending, toneMapped: false, uniforms: { uId: { value: new THREE.Color() }, ...entry.uniforms } });
      materials.set(entry.mesh, material);
      made.push(material);
    }
    return material;
  };
  return {
    render(renderer, scene, camera, entries, marks, width, height) {
      if (!target || target.width !== width || target.height !== height) {
        target?.dispose();
        target = new THREE.WebGLRenderTarget(width, height, { depthBuffer: true, stencilBuffer: true, colorSpace: THREE.NoColorSpace });
        pixels = new Uint8Array(width * height * 4);
      }
      ids = entries.map((entry) => entry.id);
      const drawn = new Set<THREE.Object3D>([...entries.map((entry) => entry.mesh), ...marks]);
      const hidden: THREE.Object3D[] = [];
      scene.traverse((object) => {
        if ((object instanceof THREE.Mesh || object instanceof THREE.LineSegments) && !drawn.has(object) && object.visible) { hidden.push(object); object.visible = false; }
      });
      const saved = entries.map((entry) => entry.mesh.material);
      entries.forEach((entry, index) => {
        const material = materialFor(entry);
        (material.uniforms.uId.value as THREE.Color).setRGB(((index + 1) & 255) / 255, (((index + 1) >> 8) & 255) / 255, 0, THREE.NoColorSpace);
        material.stencilWrite = entry.masked;
        material.stencilFunc = THREE.EqualStencilFunc;
        material.stencilRef = 1;
        entry.mesh.material = material;
      });
      const previousTarget = renderer.getRenderTarget();
      const previousAlpha = renderer.getClearAlpha();
      const previousEnvironment = scene.environment;
      scene.environment = null;
      renderer.setRenderTarget(target);
      renderer.setClearAlpha(0);
      renderer.clear();
      renderer.render(scene, camera);
      renderer.readRenderTargetPixels(target, 0, 0, width, height, pixels);
      renderer.setRenderTarget(previousTarget);
      renderer.setClearAlpha(previousAlpha);
      scene.environment = previousEnvironment;
      entries.forEach((entry, index) => { entry.mesh.material = saved[index]; });
      for (const object of hidden) object.visible = true;

      const count = new Uint32Array(entries.length + 1), sumX = new Float64Array(entries.length + 1), sumY = new Float64Array(entries.length + 1);
      for (let row = 0; row < height; row++) for (let column = 0; column < width; column++) {
        const at = (row * width + column) * 4;
        const index = pixels[at] | (pixels[at + 1] << 8);
        if (index > 0 && index <= entries.length) { count[index]++; sumX[index] += column; sumY[index] += row; }
      }
      const best = new Float64Array(entries.length + 1).fill(Infinity), bestX = new Uint32Array(entries.length + 1), bestY = new Uint32Array(entries.length + 1);
      for (let row = 0; row < height; row++) for (let column = 0; column < width; column++) {
        const at = (row * width + column) * 4;
        const index = pixels[at] | (pixels[at + 1] << 8);
        if (index === 0 || index > entries.length) continue;
        const distance = (column - sumX[index] / count[index]) ** 2 + (row - sumY[index] / count[index]) ** 2;
        if (distance < best[index]) { best[index] = distance; bestX[index] = column; bestY[index] = row; }
      }
      const seen: SeenStructure[] = [];
      for (let index = 1; index <= entries.length; index++) if (count[index] > 0) seen.push({ id: ids[index - 1], pixels: count[index], x: (bestX[index] + 0.5) / width, y: 1 - (bestY[index] + 0.5) / height });
      return seen;
    },
    at(x, y) {
      if (!target || x < 0 || y < 0 || x >= 1 || y >= 1) return null;
      const column = Math.floor(x * target.width), row = Math.floor((1 - y) * target.height);
      const at = (Math.min(row, target.height - 1) * target.width + column) * 4;
      const index = pixels[at] | (pixels[at + 1] << 8);
      return index > 0 ? ids[index - 1] ?? null : null;
    },
    dispose() { target?.dispose(); for (const material of made) material.dispose(); },
  };
}
