/**
 * Simulated branching trees inside the source organ labels and traced gut. The trees fill the measured volumes, but
 * their courses are generated and not anatomical: see trees.ts. Roots are hand-placed at each hilum, and the short stems that join them
 * to the great vessels follow Cook figures 93 and 94 for the lungs. Low native x is the animal's right.
 */
import { mergeSurfaces, tube } from './extract';
import { curve } from './internal';
import type { Landmarks } from './landmarks';
import { add, type Vec3 } from './rig';
import type { Surface } from './surface-nets';
import { growTree, treeSurface, type TreeOptions } from './trees';
import { voxelIndex, type Grid } from './volume';

export type TreePart = 'bronchi' | 'pulmonary-arteries' | 'pulmonary-veins' | 'hepatic-arteries' | 'portal-branches' | 'hepatic-veins' | 'renal-arteries' | 'renal-veins' | 'cerebral-arteries' | 'mesenteric-arteries' | 'mesenteric-veins';

const BRAIN = new Set([4, 5, 6, 7, 8, 10]);

export function buildTrees(grid: Grid, labels: Uint8Array, lm: Landmarks, inGut: (index: number) => boolean): Record<TreePart, Surface> {
  const inLabels = (set: ReadonlySet<number>, side?: 'low' | 'high', middle = 172) => (x: number, y: number, z: number) => {
    if (x < 0 || y < 0 || z < 0 || x >= grid.nx || y >= grid.ny || z >= grid.nz) return false;
    if ((side === 'low' && x >= middle) || (side === 'high' && x < middle)) return false;
    return set.has(labels[voxelIndex(grid, x, y, z)]);
  };
  const boxOf = (ids: readonly number[], side?: 'low' | 'high'): [Vec3, Vec3] => {
    const records = ids.map((id) => lm.label(id, side));
    return [
      [Math.min(...records.map((r) => r.min[0])), Math.min(...records.map((r) => r.min[1])), Math.min(...records.map((r) => r.min[2]))],
      [Math.max(...records.map((r) => r.max[0])), Math.max(...records.map((r) => r.max[1])), Math.max(...records.map((r) => r.max[2]))],
    ];
  };
  const grow = (inside: (x: number, y: number, z: number) => boolean, box: [Vec3, Vec3], root: Vec3, direction: Vec3, options: Partial<TreeOptions>) => treeSurface(growTree(inside, box, root, direction, options).nodes, options.sides);
  const stem = (points: readonly Vec3[], r0: number, r1: number) => {
    const line = curve(points);
    return tube(line, line.map((_, i) => r0 + (r1 - r0) * i / (line.length - 1)), 7);
  };

  const lungs = new Set([21]);
  const rightHilum: Vec3 = [150, 412, 100], leftHilum: Vec3 = [213, 412, 108];
  const lungTree = (offset: Vec3, seed: number, options: Partial<TreeOptions>) => mergeSurfaces([
    grow(inLabels(lungs, 'low'), boxOf([21], 'low'), add(rightHilum, offset), [-1, 0.3, 0.1], { seed, ...options }),
    grow(inLabels(lungs, 'high'), boxOf([21], 'high'), add(leftHilum, offset), [1, 0.3, 0.1], { seed: seed + 1, ...options }),
  ]);
  const liver = new Set([18]);
  const liverTree = (root: Vec3, seed: number, options: Partial<TreeOptions>) => grow(inLabels(liver), boxOf([18]), root, [0, 0.4, -0.4], { seed, ...options });
  const kidneys = new Set([19]);
  const hilumR = add(lm.label(19, 'low').centroid, [16, 0, -3]), hilumL = add(lm.label(19, 'high').centroid, [-16, 0, -3]);
  const kidneyTree = (offset: Vec3, seed: number) => mergeSurfaces([
    grow(inLabels(kidneys, 'low'), boxOf([19], 'low'), add(hilumR, offset), [-1, 0, 0], { seed, points: 130, step: 3.5, influence: 18, killDistance: 5, terminalRadius: 0.26, maximumRadius: 1.4, sides: 4 }),
    grow(inLabels(kidneys, 'high'), boxOf([19], 'high'), add(hilumL, offset), [1, 0, 0], { seed: seed + 1, points: 130, step: 3.5, influence: 18, killDistance: 5, terminalRadius: 0.26, maximumRadius: 1.4, sides: 4 }),
  ]);
  const gutBox: [Vec3, Vec3] = [[50, 480, 15], [320, 880, 160]];
  const gutTest = (x: number, y: number, z: number) => x >= 0 && y >= 0 && z >= 0 && x < grid.nx && y < grid.ny && z < grid.nz && inGut(voxelIndex(grid, x, y, z));
  const gutTree = (root: Vec3, seed: number) => grow(gutTest, gutBox, root, [0, 0.2, -1], { seed, points: 380, step: 6, influence: 36, killDistance: 9, terminalRadius: 0.3, maximumRadius: 1.8, sides: 4 });

  const outflow: Vec3 = [183, 376, 92], leftAtrium: Vec3 = [212, 374, 90];
  return {
    bronchi: lungTree([0, 0, 0], 11, { points: 420, step: 3.5, influence: 26, killDistance: 6, terminalRadius: 0.32, maximumRadius: 2.4, sides: 4 }),
    'pulmonary-arteries': mergeSurfaces([
      stem([outflow, [168, 392, 96], add(rightHilum, [0, -4, 4])], 2.4, 1.8), stem([outflow, [198, 392, 100], add(leftHilum, [0, -4, 4])], 2.4, 1.8),
      lungTree([0, -4, 4], 21, { points: 300, step: 4, influence: 26, killDistance: 7, terminalRadius: 0.26, maximumRadius: 1.8, sides: 4 }),
    ]),
    'pulmonary-veins': mergeSurfaces([
      stem([leftAtrium, [186, 396, 92], add(rightHilum, [0, 5, -4])], 2, 1.6), stem([leftAtrium, [214, 392, 96], add(leftHilum, [0, 5, -4])], 2, 1.6),
      lungTree([0, 5, -4], 31, { points: 300, step: 4, influence: 26, killDistance: 7, terminalRadius: 0.26, maximumRadius: 1.8, sides: 4 }),
    ]),
    'hepatic-arteries': liverTree([185, 500, 98], 41, { points: 240, step: 6, influence: 34, killDistance: 9, terminalRadius: 0.24, maximumRadius: 1.1, sides: 4 }),
    'portal-branches': liverTree([176, 510, 104], 42, { points: 340, step: 6, influence: 34, killDistance: 9, terminalRadius: 0.32, maximumRadius: 2.2, sides: 4 }),
    'hepatic-veins': liverTree([172, 490, 118], 43, { points: 300, step: 6, influence: 34, killDistance: 9, terminalRadius: 0.3, maximumRadius: 2, sides: 4 }),
    'renal-arteries': kidneyTree([0, -3, 2], 51),
    'renal-veins': kidneyTree([0, 3, -2], 61),
    'cerebral-arteries': grow(inLabels(BRAIN), boxOf([...BRAIN]), [189, 205, 88], [0, 0, 1], { seed: 71, points: 420, step: 4, influence: 24, killDistance: 7, terminalRadius: 0.22, maximumRadius: 1.2, sides: 4 }),
    'mesenteric-arteries': gutTree([178, 615, 90], 81),
    'mesenteric-veins': gutTree([182, 622, 86], 82),
  };
}
