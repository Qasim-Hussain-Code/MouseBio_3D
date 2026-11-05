/**
 * Simulated branching trees inside measured organ volumes, grown by space colonization (Runions et al., 2007):
 * attraction points fill the organ, and branches grow towards them until they are reached.
 * Radii follow Murray's law from the terminal branches back to the root. The branching is a plausible filling of
 * the organ, not the course of any real vessel or airway. A tree is a display of what lies there, not of how it lies.
 */
import { mergeSurfaces, tube } from './extract';
import type { Vec3 } from './rig';
import type { Surface } from './surface-nets';

export interface TreeOptions {
  /** Number of attraction points scattered in the volume. */
  readonly points: number;
  /** Length of a growth step, in voxels. */
  readonly step: number;
  /** A point attracts a branch within this distance, and is used up within killDistance. */
  readonly influence: number;
  readonly killDistance: number;
  readonly terminalRadius: number;
  /** Murray's law exponent. */
  readonly exponent: number;
  readonly maximumRadius: number;
  readonly sides: number;
  readonly seed: number;
}

export const TREE_DEFAULTS: TreeOptions = { points: 1200, step: 3, influence: 22, killDistance: 5, terminalRadius: 0.32, exponent: 2.8, maximumRadius: 3, sides: 5, seed: 7 };

function random(seed: number) {
  let state = seed >>> 0 || 1;
  return () => { state ^= state << 13; state >>>= 0; state ^= state >>> 17; state ^= state << 5; state >>>= 0; return state / 4294967296; };
}

interface Node { position: Vec3; parent: number; children: number[]; radius: number }

/** Grow a tree from the given root and initial direction inside a volume given by a membership test and its bounding box. */
export function growTree(
  inside: (x: number, y: number, z: number) => boolean,
  box: readonly [Vec3, Vec3],
  root: Vec3,
  direction: Vec3,
  options: Partial<TreeOptions> = {},
): { nodes: Node[] } {
  const o = { ...TREE_DEFAULTS, ...options };
  const rng = random(o.seed);
  const attractors: Vec3[] = [];
  let attempts = 0;
  while (attractors.length < o.points && attempts < o.points * 400) {
    attempts++;
    const p: Vec3 = [box[0][0] + rng() * (box[1][0] - box[0][0]), box[0][1] + rng() * (box[1][1] - box[0][1]), box[0][2] + rng() * (box[1][2] - box[0][2])];
    if (inside(Math.round(p[0]), Math.round(p[1]), Math.round(p[2]))) attractors.push(p);
  }
  const nodes: Node[] = [{ position: root, parent: -1, children: [], radius: 0 }];
  // A short trunk carries the tree into the attraction cloud.
  let last = 0;
  const norm = Math.hypot(direction[0], direction[1], direction[2]) || 1;
  const d: Vec3 = [direction[0] / norm, direction[1] / norm, direction[2] / norm];
  for (let i = 1; i <= 3; i++) {
    nodes.push({ position: [root[0] + d[0] * o.step * i, root[1] + d[1] * o.step * i, root[2] + d[2] * o.step * i], parent: last, children: [], radius: 0 });
    nodes[last].children.push(nodes.length - 1);
    last = nodes.length - 1;
  }
  const alive = new Uint8Array(attractors.length).fill(1);
  let remaining = attractors.length;
  const influence2 = o.influence ** 2, kill2 = o.killDistance ** 2;
  for (let iteration = 0; iteration < 400 && remaining > 0; iteration++) {
    // Each living point pulls on its nearest node, if near enough.
    const pulls = new Map<number, { x: number; y: number; z: number; n: number }>();
    for (let a = 0; a < attractors.length; a++) {
      if (!alive[a]) continue;
      const p = attractors[a];
      let best = -1, bestDistance = influence2;
      for (let n = 0; n < nodes.length; n++) {
        const q = nodes[n].position;
        const distance = (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2;
        if (distance < kill2) { alive[a] = 0; remaining--; best = -1; break; }
        if (distance < bestDistance) { bestDistance = distance; best = n; }
      }
      if (best < 0) continue;
      const q = nodes[best].position;
      const length = Math.sqrt(bestDistance) || 1;
      const pull = pulls.get(best) ?? { x: 0, y: 0, z: 0, n: 0 };
      pull.x += (p[0] - q[0]) / length; pull.y += (p[1] - q[1]) / length; pull.z += (p[2] - q[2]) / length; pull.n++;
      pulls.set(best, pull);
    }
    if (!pulls.size) break;
    for (const [n, pull] of pulls) {
      const length = Math.hypot(pull.x, pull.y, pull.z) || 1;
      const q = nodes[n].position;
      const next: Vec3 = [q[0] + o.step * pull.x / length, q[1] + o.step * pull.y / length, q[2] + o.step * pull.z / length];
      nodes.push({ position: next, parent: n, children: [], radius: 0 });
      nodes[n].children.push(nodes.length - 1);
    }
  }
  // Radii from the tips back to the root.
  for (let n = nodes.length - 1; n >= 0; n--) {
    const node = nodes[n];
    if (!node.children.length) { node.radius = o.terminalRadius; continue; }
    let sum = 0;
    for (const child of node.children) sum += nodes[child].radius ** o.exponent;
    node.radius = Math.min(o.maximumRadius, sum ** (1 / o.exponent));
  }
  return { nodes };
}

/** Turn a tree into tubes, one for each unbranched run. */
export function treeSurface(nodes: readonly Node[], sides = TREE_DEFAULTS.sides): Surface {
  const runs: Surface[] = [];
  const stack = [0];
  while (stack.length) {
    const from = stack.pop()!;
    for (const child of nodes[from].children) {
      const points: Vec3[] = [nodes[from].position];
      const radii: number[] = [nodes[child].radius];
      let current = child, kept = 0;
      for (;;) {
        // Every other node along a run is enough, because runs curve gently.
        const ending = nodes[current].children.length !== 1;
        if (ending || kept++ % 2 === 0) { points.push(nodes[current].position); radii.push(nodes[current].radius); }
        if (ending) break;
        current = nodes[current].children[0];
      }
      runs.push(tube(points, radii, radii[0] < 0.55 ? 3 : sides));
      if (nodes[current].children.length > 1) stack.push(current);
    }
  }
  return mergeSurfaces(runs);
}
