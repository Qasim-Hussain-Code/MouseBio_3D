import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, test } from 'node:test';
import { Window } from 'happy-dom';
import * as THREE from 'three';
import {
  EVIDENCE_LABEL, formatLength, formatMagnification, JOURNEY_LEVELS, JOURNEY_NARROWEST, JOURNEY_NOTICE, JOURNEY_WIDEST, levelAim, levelAt, levelFade, levelHome, magnification, scaleBarLength,
} from '../src/domain/scale-journey';
import {
  BOHR_RADIUS_METRES, buildAtom, buildAtomicNucleus, buildCell, buildChromatin, buildDnaAtoms, buildEmpty, buildEpidermis, buildNucleosome, buildNucleus, buildProton, buildSkinBlock, CARBON_ORBITALS, disposeScene,
  isNucleosomeData, JOURNEY_BUILDERS, sampleSlaterRadius, type JourneyScene, type NucleosomeData,
} from '../src/viewer/scale-journey-scenes';

const data = JSON.parse(await readFile(new URL('../public/scale-journey/nucleosome-5b1m.json', import.meta.url), 'utf8')) as NucleosomeData & {
  source: { entry: string; license: string; sourceSha256: string; citation: string; url: string; note: string; organisms: { histones: string }; resolutionAngstrom: number; depositedAtoms: number };
  units: string;
};

/** Every position in a scene, in the scene's own units, read back from its geometry. */
function fingerprint(scene: JourneyScene): string {
  const parts: string[] = [];
  scene.group.updateMatrixWorld(true);
  scene.group.traverse((object) => {
    if (object instanceof THREE.InstancedMesh) {
      parts.push(`i${object.count}`, Array.from(object.instanceMatrix.array).reduce((sum, value, index) => sum + value * (index % 13 + 1), 0).toFixed(6));
    } else if (object instanceof THREE.Mesh || object instanceof THREE.Points) {
      const position = (object.geometry as THREE.BufferGeometry).getAttribute('position');
      parts.push(`g${position.count}`, Array.from(position.array).reduce((sum, value, index) => sum + value * (index % 13 + 1), 0).toFixed(4));
    }
  });
  return parts.join(' ');
}

test('every view height from the widest to the narrowest shows at least one level', () => {
  for (const [index, level] of JOURNEY_LEVELS.entries()) {
    assert.ok(level.startMetres > level.endMetres, `${level.id} has a range`);
    const next = JOURNEY_LEVELS[index + 1];
    if (next) assert.ok(next.startMetres > level.endMetres, `${next.id} begins before ${level.id} has gone`);
  }
  const steps = 1200;
  const span = Math.log10(JOURNEY_WIDEST) - Math.log10(JOURNEY_NARROWEST);
  for (let i = 0; i <= steps; i++) {
    const view = 10 ** (Math.log10(JOURNEY_WIDEST) - span * i / steps);
    const total = JOURNEY_LEVELS.reduce((sum, level) => sum + levelFade(level, view), 0);
    assert.ok(total >= 0.5, `the view is nearly blank at ${view} m: ${total}`);
  }
  assert.ok(span > 12, 'the journey spans about thirteen orders of magnitude');
});

test('each level is fully visible at its best view and nothing else competes with it', () => {
  for (const level of JOURNEY_LEVELS) {
    const home = levelHome(level);
    assert.equal(levelFade(level, home), 1, `${level.id} is opaque at its best view`);
    assert.equal(levelAt(home), level, `${level.id} is the named level at its best view`);
    for (const other of JOURNEY_LEVELS) if (other !== level) assert.equal(levelFade(other, home), 0, `${other.id} has gone at the best view of ${level.id}`);
  }
});

test('the view holds a level still until it is seen and then reaches the part the next level enlarges', () => {
  for (const [index, level] of JOURNEY_LEVELS.entries()) {
    const next = JOURNEY_LEVELS[index + 1];
    assert.equal(levelAim(level, levelHome(level) * 1.5), next ? (levelHome(level) > next.startMetres ? 0 : 1) : 0, `${level.id} above its best view`);
    if (next) assert.equal(levelAim(level, next.startMetres), 1, `${level.id} has arrived where ${next.id} starts`);
  }
});

test('every level states its kind of evidence, its basis and a caption, and only the crystal levels claim measured positions', () => {
  for (const level of JOURNEY_LEVELS) {
    assert.ok(EVIDENCE_LABEL[level.evidence], level.id);
    assert.ok(level.basis.length > 0 && level.basis.every((item) => item.length > 20), `${level.id} has a basis`);
    assert.ok(level.caption.length > 40, `${level.id} has a caption`);
  }
  assert.deepEqual(JOURNEY_LEVELS.filter((level) => level.evidence === 'measured-elsewhere').map((level) => level.id), ['nucleosome', 'dna']);
  assert.match(EVIDENCE_LABEL['measured-elsewhere'], /not in this specimen/);
  assert.match(JOURNEY_NOTICE, /0\.1 mm/);
  assert.match(JOURNEY_NOTICE, /not seen in this mouse/);
  const everyBasis = JOURNEY_LEVELS.flatMap((level) => level.basis).join(' ');
  for (const doi of ['10.1038/nrm3175', '10.1038/nrm.2016.147', '10.1126/science.aag0025', '10.1038/38444', '10.1016/j.celrep.2016.12.065', '10.1063/1.1733573', '10.1016/j.adt.2011.12.006', '10.1103/PhysRevD.110.030001']) {
    assert.ok(everyBasis.includes(doi), `${doi} is cited`);
  }
});

test('lengths, scale bars and magnification are written as they are', () => {
  assert.equal(formatLength(2.56e-3), '2.6 mm');
  assert.equal(formatLength(5e-7), '500 nm');
  assert.equal(formatLength(5e-6), '5 µm');
  assert.equal(formatLength(2.4e-15), '2.4 fm');
  assert.equal(formatLength(5e-16), '500 am');
  for (const [view, bar] of [[2.56e-3, 5e-4], [1e-9, 2e-10], [3e-10, 5e-11], [2.5e-15, 5e-16]] as const) {
    const length = scaleBarLength(view);
    assert.ok(Math.abs(length / bar - 1) < 1e-9, `${view} gives ${length}`);
  }
  assert.equal(formatMagnification(magnification(2.56e-3)), '78 times');
  assert.equal(formatMagnification(1.6e13), '1.6 × 10¹³ times');
});

test('the nucleosome file keeps its provenance and its atoms', () => {
  assert.ok(isNucleosomeData(data));
  assert.equal(data.source.entry, '5B1M');
  assert.equal(data.units, 'angstrom');
  assert.equal(data.source.resolutionAngstrom, 2.34);
  assert.equal(data.source.organisms.histones, 'Mus musculus');
  assert.match(data.source.license, /CC0/);
  assert.match(data.source.citation, /10\.1016\/j\.celrep\.2016\.12\.065/);
  assert.match(data.source.sourceSha256, /^[0-9a-f]{64}$/);
  assert.match(data.source.note, /not from the Digimouse specimen/);
  assert.equal(data.x.length, 11986);
  assert.ok(data.x.length <= data.source.depositedAtoms, 'no atom was added');
  assert.deepEqual([...data.elements], ['C', 'N', 'O', 'P', 'S']);
  assert.deepEqual(data.chains.map((chain) => chain.id), ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']);
  const focus = data.focusAtom;
  assert.equal(data.elements[data.element[focus]], 'C');
  assert.equal(data.chains[data.chain[focus]].name, 'DNA');
  assert.equal(data.names[data.name[focus]], 'C4');
  const span = Math.max(...data.x) - Math.min(...data.x);
  assert.ok(span > 80 && span < 130, `the particle measures ${span} angstrom across`);
});

test('a damaged file is refused, so that nothing is drawn in place of the atoms', () => {
  assert.equal(isNucleosomeData(null), false);
  assert.equal(isNucleosomeData({ ...data, source: { entry: 'other' } }), false);
  assert.equal(isNucleosomeData({ ...data, y: data.y.slice(1) }), false);
  assert.equal(isNucleosomeData({ ...data, focusAtom: data.x.length }), false);
  assert.equal(JOURNEY_BUILDERS.nucleosome(null), null);
  assert.equal(JOURNEY_BUILDERS.dna(null), null);
});

test('the crystal levels show the atoms of the file at their positions', () => {
  const nucleosome = buildNucleosome(data);
  const spheres = nucleosome.group.children.find((child) => child instanceof THREE.InstancedMesh) as THREE.InstancedMesh;
  assert.equal(spheres.count, data.x.length);
  const matrix = new THREE.Matrix4(), first = new THREE.Vector3(), second = new THREE.Vector3();
  spheres.getMatrixAt(0, matrix); first.setFromMatrixPosition(matrix);
  spheres.getMatrixAt(1, matrix); second.setFromMatrixPosition(matrix);
  const measured = Math.hypot(data.x[1] - data.x[0], data.y[1] - data.y[0], data.z[1] - data.z[0]);
  assert.ok(Math.abs(first.distanceTo(second) * 120 - measured) < 1e-4, 'distances in the scene are measured distances');
  const dna = buildDnaAtoms(data);
  const [atoms, bonds] = dna.group.children as THREE.InstancedMesh[];
  assert.ok(atoms.count > 60 && atoms.count < 400, `${atoms.count} atoms`);
  assert.ok(bonds.count > atoms.count * 0.8, `${bonds.count} bonds`);
  assert.deepEqual(dna.focus.toArray(), [0, 0, 0]);
});

test('scenes are the same every time they are built', () => {
  const makers = [buildSkinBlock, buildEpidermis, buildCell, buildNucleus, buildChromatin, () => buildNucleosome(data), () => buildDnaAtoms(data), buildAtom, buildEmpty, buildAtomicNucleus, buildProton];
  for (const make of makers) {
    const first = make(), second = make();
    assert.equal(fingerprint(first), fingerprint(second));
    assert.ok(first.labels.length > 0, 'every scene names what it shows');
    disposeScene(first); disposeScene(second);
  }
  assert.deepEqual(Object.keys(JOURNEY_BUILDERS), JOURNEY_LEVELS.map((level) => level.id));
});

test('neighbouring levels agree on the size of what they share', () => {
  const metres = (id: string, units: number) => units * JOURNEY_LEVELS.find((level) => level.id === id)!.referenceMetres;
  // The epidermis of the block is the epidermis of the next level.
  assert.ok(Math.abs(metres('skin', 0.019) / metres('epidermis', 0.42) - 1) < 0.05);
  // A spinous cell of the epidermis is the cell of the next level, and the nuclei agree.
  assert.ok(Math.abs(metres('epidermis', 0.064) / metres('cell', 0.42) - 1) < 0.05);
  assert.ok(Math.abs(metres('cell', 0.19) / metres('nucleus', 0.46) - 1) < 0.1);
  assert.ok(Math.abs(metres('epidermis', 0.03) / metres('nucleus', 0.46) - 1) < 0.05);
});

test('the sampled electrons follow the Slater radial density of carbon', () => {
  assert.deepEqual({ ...CARBON_ORBITALS }, { s1: 5.673, s2: 3.217 / 2, p2: 3.136 / 2 });
  let state = 12345;
  const next = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
  for (const [n, zeta] of [[1, CARBON_ORBITALS.s1], [2, CARBON_ORBITALS.s2], [2, CARBON_ORBITALS.p2]] as const) {
    let sum = 0;
    const count = 60000;
    for (let i = 0; i < count; i++) sum += sampleSlaterRadius(n, zeta, next);
    // The mean of r^(2n) exp(-2 zeta r) is (2n + 1) / (2 zeta) Bohr radii.
    const expected = (2 * n + 1) / (2 * zeta);
    assert.ok(Math.abs(sum / count / expected - 1) < 0.02, `n ${n}: mean ${sum / count}, expected ${expected}`);
  }
  assert.ok(Math.abs(BOHR_RADIUS_METRES - 5.29177e-11) < 1e-15);
});

test('the sketches of the nucleus and the proton hold the right particles at measured sizes', () => {
  const nucleus = buildAtomicNucleus();
  const counts = nucleus.group.children.filter((child): child is THREE.InstancedMesh => child instanceof THREE.InstancedMesh).map((mesh) => mesh.count);
  assert.deepEqual(counts, [6, 6], 'six protons and six neutrons');
  const proton = buildProton();
  assert.equal(proton.labels.filter((label) => label.text === 'Up quark').length, 2);
  assert.equal(proton.labels.filter((label) => label.text === 'Down quark').length, 1);
  assert.ok(proton.labels.some((label) => /0\.84 fm/.test(label.text)));
  assert.ok(nucleus.labels.some((label) => /2\.47 fm/.test(label.text)));
});

const dom = new Window({ url: 'http://localhost:5173' });
const previous = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({ window: dom, document: dom.document, navigator: dom.navigator, HTMLElement: dom.HTMLElement, Node: dom.Node, Event: dom.Event, MouseEvent: dom.MouseEvent, KeyboardEvent: dom.KeyboardEvent, IS_REACT_ACT_ENVIRONMENT: true })) {
  previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
  Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
after(() => {
  for (const [key, descriptor] of previous) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete (globalThis as Record<string, unknown>)[key];
  }
});

test('the dialog names its evidence and every level, states its limits without WebGL, and closes', async () => {
  const { createElement, act } = await import('react');
  const { createRoot } = await import('react-dom/client');
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({ broken: true }))) as typeof fetch;
  const { default: ScaleJourney } = await import('../src/components/ScaleJourney');
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host as unknown as Element);
  let exits = 0;
  try {
    await act(async () => { root.render(createElement(ScaleJourney, { onExit: () => { exits += 1; } })); });
    const dialog = document.querySelector('.scale-journey');
    assert.ok(dialog, 'the dialog is open');
    assert.equal(dialog.getAttribute('role'), 'dialog');
    assert.match(dialog.textContent ?? '', /Data from this specimen end at about 0\.1 mm/);
    assert.match(dialog.textContent ?? '', /Simulated from published descriptions/);
    assert.match(dialog.textContent ?? '', /could not start WebGL/, 'the failure is stated');
    assert.equal(document.querySelectorAll('.scale-journey-ladder button').length, JOURNEY_LEVELS.length);
    const sources = [...document.querySelectorAll('button')].find((button) => button.textContent === 'Sources');
    await act(async () => { (sources as unknown as HTMLButtonElement).click(); });
    assert.match(dialog.textContent ?? '', /Hummel KP/);
    await act(async () => { window.dispatchEvent(new (dom.KeyboardEvent)('keydown', { key: 'Escape' }) as unknown as Event); });
    assert.equal(exits, 1, 'Escape leaves');
    const back = [...document.querySelectorAll('button')].find((button) => button.textContent === 'Back to the mouse');
    await act(async () => { (back as unknown as HTMLButtonElement).click(); });
    assert.equal(exits, 2, 'the button leaves');
  } finally {
    await act(async () => { root.unmount(); });
    globalThis.fetch = originalFetch;
    host.remove();
  }
  assert.equal(document.querySelector('.scale-journey'), null, 'nothing is left behind');
});
