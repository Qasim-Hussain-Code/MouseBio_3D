import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as THREE from 'three';
import { DEFAULT_LIFE, flowKindOf, LIFE_DISPLAY_CHOICES, LIFE_NOTICE, LIFE_RATES, LIFE_RATE_CHOICES, LIFE_SOURCES, lifeAt, lifeBehaviourOf, lifeDescription, lifeRatesText, lookAngles, rateLabel, startingLife, walkAt, WHISK_BOUT } from '../src/domain/living-simulation';
import type { Atlas } from '../src/domain';
import { createFlowTokens, FLOW_BUDGET, FLOW_FILE_FORMAT, FLOW_STEP, flowLinesFrom, isFlowPathFile, tokenCounts, tokenSpeed, type FlowPathFile } from '../src/viewer/flow-tokens';
import { LIFE_DECLARATIONS, LIFE_KIND, LIFE_MOVE, LIFE_SHARED } from '../src/viewer/life-field';
import { windowVertex } from '../src/viewer/surface-shading';
import { tubeRadius } from '../src/viewer/life-runtime';

const atlas = JSON.parse(await readFile(new URL('../public/atlas-living/atlas.json', import.meta.url), 'utf8')) as Atlas;
const file = JSON.parse(await readFile(new URL('../public/atlas-living/flow-paths.json', import.meta.url), 'utf8')) as FlowPathFile & { notice: string };
const structure = (id: string) => { const found = atlas.structures.find((item) => item.id === `living:${id}`); assert.ok(found, id); return found; };
const ALL_ON = { heart: true, breathing: true, gut: true, movement: true };

test('the rates that come from a source agree with what the source says', () => {
  const beatsPerMinute = LIFE_RATES.heart * 60;
  assert.ok(beatsPerMinute >= 500 && beatsPerMinute <= 700, 'Ho et al. 2011');
  assert.ok(LIFE_RATES.breathing >= 3 && LIFE_RATES.breathing <= 5, 'Wesson et al. 2008');
  assert.ok(LIFE_RATES.sniffing > 5 && LIFE_RATES.sniffing <= 12, 'Wesson et al. 2008');
  assert.equal(LIFE_RATES.whisking, 11.3, 'Mitchinson et al. 2011');
  for (const source of Object.values(LIFE_SOURCES)) {
    assert.match(source.doi, /^10\.\d{4,}\//);
    assert.match(source.citation, /\d{4}/);
    assert.ok(source.statement.length > 10);
  }
});

test('the motion is always named as an illustration and what was chosen is listed', () => {
  assert.match(LIFE_NOTICE, /^Illustrative motion, not a simulation of physiology/);
  assert.ok(LIFE_DISPLAY_CHOICES.length >= 4);
  assert.ok(LIFE_DISPLAY_CHOICES.some((choice) => /tokens/.test(choice) && /far larger/.test(choice) && /slower/.test(choice)));
  for (const text of [LIFE_NOTICE, ...LIFE_DISPLAY_CHOICES]) assert.doesNotMatch(text, /[–—]/);
  assert.equal(rateLabel(0.1), '1/10 of real rate');
  assert.equal(rateLabel(1), 'real rate');
  assert.equal(lifeRatesText({ rate: 0.1 }), 'Heart 600/min, breathing 240/min; shown at 1/10 of real rate, as 60/min and 24/min');
  assert.ok(LIFE_RATE_CHOICES.includes(DEFAULT_LIFE.rate));
});

test('motion starts on, unless the system has asked for less of it', () => {
  assert.equal(startingLife(false).on, true);
  assert.equal(startingLife(true).on, false);
});

test('the atria contract before the ventricles, on a cycle of one beat', () => {
  const period = 1 / LIFE_RATES.heart;
  let peakAtria = 0, peakVentricles = 0, atria = -1, ventricles = -1;
  for (let step = 0; step <= 200; step++) {
    const now = lifeAt(step / 200 * period, 0, ALL_ON);
    if (now.atria > atria) { atria = now.atria; peakAtria = step; }
    if (now.ventricles > ventricles) { ventricles = now.ventricles; peakVentricles = step; }
  }
  assert.ok(atria > 0.99 && ventricles > 0.99);
  assert.ok(peakAtria < peakVentricles);
  assert.ok(Math.abs(lifeAt(0.5, 0, ALL_ON).beats - 5) < 1e-9);
});

test('every rhythm is continuous: no jump between moments close together, through bouts of sniffing and whisking', () => {
  const step = 0.0005;
  const fields = ['breath', 'whisk', 'atria', 'ventricles', 'headYaw', 'headNod', 'earFlick', 'sniffing'] as const;
  let before = lifeAt(0, 0, ALL_ON);
  for (let at = step; at < 22; at += step) {
    const now = lifeAt(at, at * 10, ALL_ON);
    for (const field of fields) assert.ok(Math.abs(now[field] - before[field]) < 0.12, `${field} jumps at ${at}: ${before[field]} to ${now[field]}`);
    assert.ok(now.breath >= 0 && now.breath <= 1);
    before = now;
  }
});

test('breathing goes faster and shallower in a bout of sniffing', () => {
  const peaks = (from: number, to: number) => {
    let count = 0, deepest = 0, last = 0, rising = false;
    for (let at = from; at < to; at += 0.001) {
      const { breath } = lifeAt(at, 0, ALL_ON);
      if (breath < last && rising) { count++; deepest = Math.max(deepest, last); }
      rising = breath > last; last = breath;
    }
    return { rate: count / (to - from), deepest };
  };
  const quiet = peaks(2, 8), sniffing = peaks(0.3, 1.1);
  assert.ok(Math.abs(quiet.rate - LIFE_RATES.breathing) < 0.5);
  assert.ok(Math.abs(sniffing.rate - LIFE_RATES.sniffing) < 2);
  assert.ok(sniffing.deepest < quiet.deepest);
});

test('whisking comes in bouts, at the published rate, and is not tied to breathing', () => {
  assert.equal(lifeAt(WHISK_BOUT.period * 0.9, 0, ALL_ON).whisk, 0, 'still between bouts');
  let crossings = 0, last = lifeAt(0.3, 0, ALL_ON).whisk;
  for (let at = 0.3; at < 1.3; at += 0.0005) { const now = lifeAt(at, 0, ALL_ON).whisk; if (last < 0 && now >= 0) crossings++; last = now; }
  assert.ok(crossings >= 10 && crossings <= 13, `${crossings} cycles in a second`);
});

test('stepping moves diagonal legs together and stops when it is not asked for', () => {
  for (const seconds of [0, 0.2, 0.71, 3.3]) {
    const { swing, lift } = walkAt(seconds, 1);
    assert.ok(Math.abs(swing[0] / 0.2 - swing[3] / 0.24) < 1e-9, 'right fore with left hind');
    assert.ok(Math.abs(swing[1] / 0.2 - swing[2] / 0.24) < 1e-9, 'left fore with right hind');
    assert.ok(Math.abs(swing[0] / 0.2 + swing[1] / 0.2) < 1e-9, 'each pair against the other');
    for (const value of lift) assert.ok(value >= 0 && value <= 0.0011);
  }
  assert.deepEqual(walkAt(1.3, 0).swing.map(Math.abs), [0, 0, 0, 0]);
  assert.equal(DEFAULT_LIFE.walking, false);
});

test('the head turns towards what it looks at, within what a neck might do', () => {
  assert.ok(Math.abs(lookAngles(1, 0, 0).yaw) < 1e-9);
  assert.ok(lookAngles(1, 0.5, 0).yaw > 0, 'towards the side it lies on');
  assert.ok(lookAngles(1, -0.5, 0).yaw < 0);
  assert.ok(lookAngles(1, 0, 0.5).nod < 0, 'a positive nod lowers the nose, so a point above raises it');
  assert.ok(lookAngles(1, 0, -0.5).nod > 0);
  assert.equal(lookAngles(0.01, 5, 0).yaw, 0.6);
  assert.equal(lookAngles(-1, -5, 0).yaw, -0.6);
  assert.equal(lookAngles(0.01, 0, 9).nod, -0.3);
});

test('what is turned off keeps still', () => {
  const off = lifeAt(3.33, 7.7, { heart: false, breathing: false, gut: false, movement: false });
  for (const value of Object.values(off)) assert.equal(value, 0);
  assert.equal(lifeAt(3.33, 7.7, { ...ALL_ON, heart: false }).ventricles, 0);
  assert.notEqual(lifeAt(3.33, 7.7, ALL_ON).headYaw, 0);
});

test('each structure has the right part in the motion', () => {
  const motion = (id: string) => lifeBehaviourOf(structure(id)).motion;
  for (const id of ['heart-lv', 'heart-rv', 'left-heart-spaces', 'coronary-arteries']) assert.equal(motion(id), 'ventricle', id);
  for (const id of ['heart-la', 'heart-ra']) assert.equal(motion(id), 'atrium', id);
  for (const id of ['lung-left', 'bronchi', 'pulmonary-arteries', 'pulmonary-veins']) assert.equal(motion(id), 'lung', id);
  for (const id of ['small-intestine', 'caecum', 'colon', 'stomach-pyloric']) assert.equal(motion(id), 'gut', id);
  for (const id of ['tail', 'tail-vertebrae', 'tail-vessels']) assert.equal(motion(id), 'tail', id);
  for (const id of ['aorta', 'femoral-arteries', 'cerebral-base']) assert.equal(motion(id), 'artery', id);
  for (const id of ['femoral-veins', 'sciatic-nerves', 'bone-femur-r', 'skin', 'cerebrum']) assert.equal(motion(id), 'none', id);
  assert.equal(motion('vibrissae'), 'whisker');
  assert.equal(motion('pinnae'), 'ear');
  assert.equal(lifeBehaviourOf(structure('diaphragm')).axial, true);
  assert.equal(lifeBehaviourOf(structure('liver-left')).axial, true);
  assert.equal(lifeBehaviourOf(structure('skin')).axial, false);
  assert.equal(lifeBehaviourOf(structure('bone-femur-r')).axial, false);
  for (const item of atlas.structures) { const text = lifeDescription(item); if (text) assert.match(text, /Illustrative\.$/); }
  assert.match(lifeDescription(structure('aorta'))!, /larger and slower/);
  assert.equal(lifeDescription(structure('bone-femur-r')), null);
});

test('what moves along a line goes the right way', () => {
  assert.deepEqual(flowKindOf(structure('aorta')), { kind: 'artery', oxygenated: true, away: true });
  assert.deepEqual(flowKindOf(structure('femoral-veins')), { kind: 'vein', oxygenated: false, away: false });
  assert.deepEqual(flowKindOf(structure('caudal-vena-cava')), { kind: 'vein', oxygenated: false, away: false });
  assert.deepEqual(flowKindOf(structure('pulmonary-arteries')), { kind: 'artery', oxygenated: false, away: true });
  assert.deepEqual(flowKindOf(structure('pulmonary-veins')), { kind: 'vein', oxygenated: true, away: false });
  assert.deepEqual(flowKindOf(structure('portal-branches')), { kind: 'vein', oxygenated: false, away: true });
  assert.equal(flowKindOf(structure('lymph-vessels'))?.kind, 'lymph');
  assert.equal(flowKindOf(structure('sciatic-nerves'))?.kind, 'nerve');
  assert.equal(flowKindOf(structure('tail-vessels'), 0)?.kind, 'artery');
  assert.equal(flowKindOf(structure('tail-vessels'), 1)?.kind, 'vein');
  assert.equal(flowKindOf(structure('veins')), null, 'traced blood has no line');
  assert.equal(flowKindOf(structure('cerebrum')), null);
  assert.equal(flowKindOf(structure('bone-femur-r')), null);
});

test('the file of lines says what it is and lies where the surfaces lie', () => {
  assert.ok(isFlowPathFile(file));
  assert.equal(file.format, FLOW_FILE_FORMAT);
  assert.equal(file.referenceId, atlas.id);
  assert.equal(file.evidence, 'simulated');
  assert.match(file.notice, /^Simulated\./);
  assert.match(file.notice, /not measured/);
  const ids = new Set(file.lines.map((line) => line.structure));
  for (const line of file.lines) {
    const item = atlas.structures.find((entry) => entry.id === line.structure);
    assert.ok(item, line.structure);
    assert.notEqual(flowKindOf(item), null, line.structure);
  }
  // Every named artery, vein and large nerve carries lines.
  for (const id of ['aorta', 'caudal-vena-cava', 'femoral-arteries', 'femoral-veins', 'common-carotid-arteries', 'renal-arteries', 'pulmonary-arteries', 'sciatic-nerves', 'spinal-cord', 'paw-arteries', 'tail-vessels', 'lymph-vessels']) assert.ok(ids.has(`living:${id}`), id);
  for (const line of file.lines) {
    const bounds = (atlas.structures.find((entry) => entry.id === line.structure) as unknown as { geometry: { boundsMeters: number[][] } }).geometry.boundsMeters;
    for (let at = 0; at < line.points.length; at += 4) for (let axis = 0; axis < 3; axis++) {
      const value = line.points[at + axis] * file.unitMetres;
      assert.ok(value >= bounds[0][axis] - 1e-4 && value <= bounds[1][axis] + 1e-4, `${line.structure} outside its surface at ${value}`);
    }
  }
});

test('a damaged file is refused, so that no wrong flow is shown', () => {
  assert.equal(isFlowPathFile(null), false);
  assert.equal(isFlowPathFile({ ...file, format: 'other' }), false);
  assert.equal(isFlowPathFile({ ...file, evidence: 'measured' }), false);
  assert.equal(isFlowPathFile({ ...file, unitMetres: 0 }), false);
  assert.equal(isFlowPathFile({ ...file, lines: [{ structure: 'x', points: [1, 2, 3] }] }), false);
});

test('tokens go away from the heart in arteries, towards it in veins, along even steps', () => {
  const heart = new THREE.Vector3(0.019, 0.04, 0.008);
  const lines = flowLinesFrom(file, atlas, new THREE.Matrix4(), heart);
  assert.ok(lines.length > 1000);
  const ends = (line: typeof lines[number]) => {
    const last = line.samples.length - 4;
    return { start: heart.distanceTo(new THREE.Vector3(line.samples[0], line.samples[1], line.samples[2])), end: heart.distanceTo(new THREE.Vector3(line.samples[last], line.samples[last + 1], line.samples[last + 2])) };
  };
  for (const id of ['living:femoral-arteries', 'living:common-carotid-arteries']) for (const line of lines.filter((item) => item.structure === id)) {
    const { start, end } = ends(line);
    assert.equal(line.forward, start <= end, id);
  }
  for (const line of lines.filter((item) => item.structure === 'living:femoral-veins')) {
    const { start, end } = ends(line);
    assert.equal(line.forward, end <= start);
  }
  const sample = lines.find((line) => line.structure === 'living:aorta')!;
  const gap = Math.hypot(sample.samples[4] - sample.samples[0], sample.samples[5] - sample.samples[1], sample.samples[6] - sample.samples[2]);
  assert.ok(Math.abs(gap - FLOW_STEP) < FLOW_STEP * 0.3);
  assert.ok(sample.samples[3] > 0, 'the radius is kept');
});

test('the tokens stay within their budget and wide vessels get the closest tokens', () => {
  const lines = flowLinesFrom(file, atlas, new THREE.Matrix4(), new THREE.Vector3(0.019, 0.04, 0.008));
  const counts = tokenCounts(lines);
  const total = counts.reduce((sum, value) => sum + value, 0);
  assert.ok(total <= FLOW_BUDGET && total > FLOW_BUDGET * 0.5, String(total));
  const density = (id: string) => {
    let tokens = 0, length = 0;
    lines.forEach((line, index) => { if (line.structure === id) { tokens += counts[index]; length += line.length; } });
    return tokens / length;
  };
  assert.ok(density('living:aorta') > density('living:hepatic-arteries') * 2);
  assert.ok(density('living:aorta') > 1000, 'a wide artery is well filled');
  assert.ok(density('living:sciatic-nerves') > 0);
  assert.ok(tokenSpeed('artery', 0.0005) > tokenSpeed('artery', 0.0001));
  assert.ok(tokenSpeed('artery', 0.0005) > tokenSpeed('vein', 0.0005));
  assert.ok(tokenSpeed('lymph', 0.0005) < tokenSpeed('vein', 0.0001));
  // The drawn object needs no work on the main thread, and it is not picked or culled.
  const tokens = createFlowTokens(lines)!;
  assert.equal(tokens.count, total);
  assert.equal(tokens.mesh.frustumCulled, false);
  assert.equal(tokens.mesh.name, 'simulated-flow-tokens');
  tokens.dispose();
});

test('the field gives every point one displacement, with the cut held to the tissue at rest', () => {
  for (const name of Object.keys(LIFE_SHARED)) assert.ok(LIFE_DECLARATIONS.includes(` ${name};`) || LIFE_DECLARATIONS.includes(` ${name}[4];`), name);
  assert.deepEqual(LIFE_KIND, { none: 0, beat: 1, artery: 2, gut: 3, whisker: 4, ear: 5, tail: 6 });
  assert.match(LIFE_MOVE, /vec3 mbLifeMove\(vec3 p, vec3 n\)/);
  const vertex = windowVertex('#include <common>\nvoid main() {\n#include <begin_vertex>\n}');
  const atRest = vertex.indexOf('vWinWorld ='), moved = vertex.indexOf('transformed += transpose');
  assert.ok(atRest > 0 && moved > atRest, 'the cut is tested where the point lies at rest');
  assert.equal(LIFE_SHARED.uLifeOn.value, 0, 'off until a living reference turns it on');
});

test('the size of a pulse follows the radius of the tube', () => {
  const tube = new THREE.CylinderGeometry(0.0005, 0.0005, 0.04, 24, 1, false);
  const measured = tubeRadius(tube);
  assert.ok(Math.abs(measured - 0.0005) < 0.00005, String(measured));
});

test('a foot comes forward through the air with its leg bent, and goes back along the ground', () => {
  const step = 0.002;
  for (let seconds = 0; seconds < 2; seconds += 0.013) {
    const now = walkAt(seconds, 1), next = walkAt(seconds + step, 1);
    for (let leg = 0; leg < 4; leg++) {
      // A swing above zero has the foot towards the tail, so a foot coming forward has a falling swing.
      const movingForward = next.swing[leg] < now.swing[leg];
      if (now.lift[leg] > 1e-5) assert.ok(movingForward, 'a lifted foot comes forward at ' + seconds + ' leg ' + leg);
      if (!movingForward) { assert.ok(now.lift[leg] < 2e-5, 'a foot going back is on the ground'); assert.ok(Math.abs(now.bend[leg]) < 0.02, 'with its leg straight'); }
    }
    assert.ok(now.bend[0] <= 0 && now.bend[1] <= 0, 'the elbows bend one way');
    assert.ok(now.bend[2] >= 0 && now.bend[3] >= 0, 'and the knees the other');
  }
});

test('in a stride each foot is on the ground with its diagonal partner, and the walk starts and stops smoothly', () => {
  for (let seconds = 0; seconds < 2; seconds += 0.017) {
    const { lift } = walkAt(seconds, 1);
    assert.ok(Math.abs(lift[0] - lift[3]) < 1e-9, 'right fore with left hind');
    assert.ok(Math.abs(lift[1] - lift[2]) < 1e-9, 'left fore with right hind');
    assert.ok(Math.min(lift[0], lift[1]) < 1e-9, 'one pair is always on the ground');
  }
  const still = walkAt(1.3, 0);
  assert.equal(still.sway, 0);
  assert.deepEqual(still.bend.map(Math.abs), [0, 0, 0, 0]);
  assert.ok(Math.abs(walkAt(1.3, 0.01).sway) <= Math.abs(walkAt(1.3, 1).sway) * 0.0101);
});
