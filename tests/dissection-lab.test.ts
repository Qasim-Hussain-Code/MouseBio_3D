import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { canBeGrasped, canBeParted, canBeReflected, channelOfTier, cutReach, cutRefusal, describeAction, drawnBack, LAB_NOTICE, LAB_TOOLS, labRecord, labTool, ORGANS_TO_SPARE, type LabAction, type LabFacts } from '../src/domain/dissection-lab';
import { demonstrationOf, evaluateExercise, LAB_EXERCISES, nextStepOf, type DemoPlace, type LabExercise } from '../src/domain/lab-exercises';
import { DISSECTION_TIERS, dissectionTier } from '../src/domain/dissection';
import { CUT_CHANNELS } from '../src/domain/cut-field';

const facts = (actions: readonly LabAction[] = [], seen: readonly string[] = [], removed: readonly string[] = [], ligated: readonly string[] = [], pose: LabFacts['pose'] = 'on-back'): LabFacts => ({ actions, seen: new Set(seen.map((id) => 'living:' + id)), removed: new Set(removed.map((id) => 'living:' + id)), ligated: new Set(ligated.map((id) => 'living:' + id)), pose });
const skinCut: LabAction = { kind: 'cut', tool: 'scissors', at: 1, structures: ['living:skin'], tier: 'skin', lengthMm: 28, asideMm: 1.2, side: 'ventral' };
const wallCut: LabAction = { kind: 'cut', tool: 'scissors', at: 2, structures: ['living:muscle-obliques'], tier: 'outer-muscle', lengthMm: 22, asideMm: 2, side: 'ventral' };
const drew = (kind: 'skin' | 'wall' | 'chest', side: 1 | -1, open = 0.9): LabAction => ({ kind: 'reflect', tool: 'forceps', at: 3, structures: ['living:skin'], flap: { kind, side, open } });
const openBelly: readonly LabAction[] = [skinCut, drew('skin', 1), drew('skin', -1), wallCut, drew('wall', 1), drew('wall', -1)];
const exercise = (id: string): LabExercise => LAB_EXERCISES.find((item) => item.id === id)!;
const stepsDone = (id: string, done: LabFacts) => evaluateExercise(exercise(id), done).steps;

test('every layer has a channel of the grid of cuts, within the grid', () => {
  for (const tier of DISSECTION_TIERS) {
    const channel = channelOfTier(tier.id);
    assert.ok(Number.isInteger(channel) && channel >= 0 && channel < CUT_CHANNELS, tier.id);
  }
});

test('instruments refuse the wrong tissue', () => {
  assert.ok(cutRefusal('scalpel', 'skeleton'));
  assert.ok(cutRefusal('scissors', 'skeleton'));
  assert.equal(cutRefusal('scissors', 'skin'), null);
  assert.ok(cutRefusal('bone-cutter', 'organs'));
  assert.equal(cutRefusal('bone-cutter', 'skeleton'), null);
  // They go through muscle that lies on a bone, as on the rib cage.
  assert.equal(cutRefusal('bone-cutter', 'outer-muscle'), null);
  assert.ok(cutRefusal('bone-cutter', 'skin'));
});

test('forceps take hold of what lies free and draw back what lies in a sheet, and a probe parts only what is loose', () => {
  assert.ok(canBeGrasped('organs') && canBeGrasped('vessels-nerves') && !canBeGrasped('skin'));
  assert.ok(canBeReflected('skin') && canBeReflected('lining') && !canBeReflected('skeleton') && !canBeReflected('organs'));
  assert.ok(canBeParted('fat') && canBeParted('lining') && !canBeParted('skin') && !canBeParted('organs'));
});

test('a scalpel divides one layer, scissors take the wall of the body as a whole, and neither reaches the organs', () => {
  assert.deepEqual(cutReach('scalpel', 'skin').channels, [channelOfTier('skin')]);
  assert.equal(cutReach('scalpel', 'skin').depth, 0);
  assert.ok(cutReach('scissors', 'outer-muscle').channels.includes(channelOfTier('lining')));
  for (const tool of ['scalpel', 'scissors', 'forceps', 'bone-cutter'] as const) for (const tier of ['skin', 'outer-muscle', 'inner-muscle', 'lining', 'skeleton'] as const) {
    assert.ok(!cutReach(tool, tier).channels.includes(channelOfTier('organs')), `${tool} on ${tier}`);
  }
});

test('a layer counts as drawn back on a side only when it has been drawn well back', () => {
  assert.equal(drawnBack(facts([drew('skin', 1, 0.2)]), 'skin', 1), false);
  assert.equal(drawnBack(facts([drew('skin', 1)]), 'skin', 1), true);
  assert.equal(drawnBack(facts([drew('skin', 1)]), 'skin', 2), false, 'one side only');
  assert.equal(drawnBack(facts([drew('skin', 1), drew('skin', -1)]), 'skin', 2), true);
  assert.equal(drawnBack(facts([drew('wall', 1), drew('wall', -1)]), 'skin', 1), false, 'another layer');
});

test('opening the abdomen goes step by step: on its back, the skin, drawn back, the wall, drawn back, and the organs seen', () => {
  const open = exercise('open-abdomen');
  assert.deepEqual(stepsDone('open-abdomen', facts([], [], [], [], 'standing')), [false, false, false, false, false, false]);
  assert.deepEqual(stepsDone('open-abdomen', facts()), [true, false, false, false, false, false]);
  assert.deepEqual(stepsDone('open-abdomen', facts([skinCut])), [true, true, false, false, false, false]);
  assert.deepEqual(stepsDone('open-abdomen', facts(openBelly.slice(0, 3))), [true, true, true, false, false, false]);
  assert.deepEqual(stepsDone('open-abdomen', facts(openBelly)), [true, true, true, true, true, false]);
  const done = evaluateExercise(open, facts(openBelly, ['small-intestine', 'liver-median']));
  assert.ok(done.finished);
  assert.deepEqual(done.errors, []);
  assert.equal(stepsDone('open-abdomen', facts([{ ...skinCut, lengthMm: 6 }]))[1], false, 'too short');
  assert.equal(stepsDone('open-abdomen', facts([{ ...skinCut, asideMm: 9 }]))[1], false, 'too far from the middle');
  assert.equal(stepsDone('open-abdomen', facts([{ ...skinCut, side: 'dorsal' }]))[1], false, 'on the back');
});

test('a tutorial goes on to the first step that has not been done', () => {
  assert.equal(nextStepOf(evaluateExercise(exercise('open-abdomen'), facts())), 1);
  assert.equal(nextStepOf(evaluateExercise(exercise('open-abdomen'), facts([skinCut]))), 2);
  const finished = evaluateExercise(exercise('open-abdomen'), facts(openBelly, ['small-intestine', 'liver-median']));
  assert.equal(nextStepOf(finished), exercise('open-abdomen').steps.length - 1, 'and stays on the last when all are done');
});

test('damage is noted when an organ that should be spared is cut', () => {
  const organCut: LabAction = { kind: 'cut', tool: 'scissors', at: 3, structures: ['living:small-intestine'], tier: 'organs', lengthMm: 2 };
  assert.deepEqual(evaluateExercise(exercise('open-abdomen'), facts([organCut])).errors, ['An organ was cut']);
  assert.ok(ORGANS_TO_SPARE.includes('small-intestine'));
});

test('collecting the spleen is finished only when it has been lifted out, and tying the femoral artery only when it has been tied and closed', () => {
  const spleen = exercise('collect-spleen');
  const moved: LabAction = { kind: 'move', tool: 'forceps', at: 4, structures: ['living:small-intestine'] };
  assert.ok(!evaluateExercise(spleen, facts([...openBelly, moved], ['spleen'])).finished);
  assert.ok(evaluateExercise(spleen, facts([...openBelly, moved], ['spleen'], ['spleen'])).finished);
  const femoral = exercise('femoral-ligation');
  const thighCut: LabAction = { kind: 'cut', tool: 'scissors', at: 1, structures: ['living:skin'], tier: 'skin', lengthMm: 10, asideMm: 9, side: 'side' };
  const closed: LabAction = { kind: 'suture', tool: 'suture', at: 8, structures: ['living:skin'], tier: 'skin', lengthMm: 10 };
  assert.ok(!evaluateExercise(femoral, facts([thighCut, drew('skin', 1)], ['femoral-arteries'])).finished);
  assert.ok(!evaluateExercise(femoral, facts([thighCut, drew('skin', 1)], ['femoral-arteries'], [], ['femoral-arteries'])).finished, 'not closed');
  assert.ok(evaluateExercise(femoral, facts([thighCut, drew('skin', 1), closed], ['femoral-arteries'], [], ['femoral-arteries'])).finished);
  const artery: LabAction = { kind: 'cut', tool: 'scissors', at: 1, structures: ['living:femoral-arteries'], tier: 'vessels-nerves' };
  assert.deepEqual(evaluateExercise(femoral, facts([artery])).errors, ['The femoral artery was cut before it was tied']);
  assert.deepEqual(evaluateExercise(femoral, facts([artery], [], [], ['femoral-arteries'])).errors, []);
});

test('every tutorial names a real source, says what it is for, and teaches at each step', () => {
  for (const item of LAB_EXERCISES) {
    assert.match(item.source.doi, /^10\.\d+\//, item.id);
    assert.ok(item.about.length > 40, item.id);
    assert.ok(item.steps.length >= 2, item.id);
    for (const step of item.steps) {
      assert.ok(step.text.length > 5, `${item.id}: ${step.text}`);
      assert.ok(step.how.length > 30, `${item.id}: ${step.text} says what to do`);
      assert.ok(step.show.length > 0, `${item.id}: ${step.text} can be shown`);
    }
    assert.ok(item.steps.some((step) => step.why), `${item.id} says why`);
  }
  assert.equal(new Set(LAB_EXERCISES.map((item) => item.id)).size, LAB_EXERCISES.length);
});

test('tutorials name only structures of the living mouse, and lines and places are sound', () => {
  const atlas = JSON.parse(readFileSync('public/atlas-living/atlas.json', 'utf8')) as { structures: { id: string; systems: string[] }[] };
  const ids = new Set(atlas.structures.map((structure) => structure.id));
  for (const id of ORGANS_TO_SPARE) assert.ok(ids.has('living:' + id), id);
  const placeOK = (place: DemoPlace) => { if ('of' in place) { assert.ok(ids.has(place.of), place.of); assert.ok(place.at >= -0.5 && place.at <= 1.5); } else assert.ok(['chest', 'diaphragm', 'loin', 'sacrum'].includes(place[0])); };
  for (const item of LAB_EXERCISES) {
    for (const step of item.steps) {
      if (step.guide?.kind === 'line') { assert.ok(step.guide.points.length >= 2); step.guide.points.forEach(placeOK); }
      if (step.guide?.kind === 'spot') placeOK(step.guide.place);
      if (step.guide?.kind === 'find') for (const id of step.guide.ids) assert.ok(ids.has(id), id);
      for (const shown of step.show) {
        if (shown.kind === 'take') assert.ok(ids.has(shown.id), shown.id);
        if (shown.kind === 'move') for (const id of shown.ids) assert.ok(ids.has(id), id);
        if (shown.kind === 'stroke') { assert.ok(shown.points.length >= 2 && shown.mmPerSecond > 0); shown.points.forEach(placeOK); }
        if (shown.kind === 'touch') { placeOK(shown.place); for (const id of shown.ids) assert.ok(ids.has(id), id); }
      }
    }
  }
  const tierOf = (id: string) => dissectionTier(atlas.structures.find((structure) => structure.id === id)!);
  assert.equal(tierOf('living:spleen'), 'organs');
  assert.equal(tierOf('living:bone-rib-7-l'), 'skeleton');
  const named = readFileSync('src/domain/lab-exercises.ts', 'utf8');
  for (const [, id] of named.matchAll(/cutThrough\(facts, '([a-z0-9-]+)'\)/g)) assert.ok(ids.has('living:' + id), id);
  for (const [, list] of named.matchAll(/FIND\([^\n]*\[((?:'[a-z0-9-]+'(?:, )?)+)\]/g)) for (const [, id] of list.matchAll(/'([a-z0-9-]+)'/g)) assert.ok(ids.has('living:' + id), id);
});

test('a demonstration opens the skin before the wall, and takes nothing out before the body is open', () => {
  for (const item of LAB_EXERCISES) {
    const steps = demonstrationOf(item);
    assert.ok(steps.length > 0, item.id);
    const firstSkin = steps.findIndex((step) => step.kind === 'stroke' && step.tiers.includes('skin'));
    const firstDeep = steps.findIndex((step) => step.kind === 'stroke' && !step.tiers.includes('skin'));
    const firstTake = steps.findIndex((step) => step.kind === 'take' || step.kind === 'move');
    if (firstDeep >= 0) assert.ok(firstSkin >= 0 && firstSkin < firstDeep, item.id);
    if (firstTake >= 0) assert.ok(firstDeep < firstTake, item.id);
    const pull = steps.findIndex((step) => step.kind === 'pull');
    if (pull >= 0) assert.ok(firstSkin < pull, `${item.id}: a cut comes before anything is drawn back`);
    assert.equal(steps[0].kind, 'pose', item.id);
  }
});

test('the words for an action say what was done, and the record holds only what was done on the model', () => {
  const nameOf = (id: string) => id.replace('living:', '');
  assert.equal(describeAction(skinCut, nameOf), 'Cut skin, 28 mm');
  assert.equal(describeAction({ ...skinCut, bled: true, lengthMm: 4.2 }, nameOf), 'Cut skin, 4.2 mm, and it bled');
  const chosen = exercise('open-abdomen');
  const done = facts([skinCut], ['skin']);
  const record = labRecord(done, 'mousebio-living-v1', { id: chosen.id, name: chosen.name, source: chosen.source, result: evaluateExercise(chosen, done) }, '2026-11-07T00:00:00.000Z');
  assert.equal(record.classification, 'practice on a simulated model; not a procedure on an animal');
  assert.equal(record.notice, LAB_NOTICE);
  assert.equal(record.exercise?.finished, false);
  const text = JSON.stringify(record);
  assert.ok(!/user|email|name"|device|address/i.test(text.replace(/"name":"Open the abdomen"/, '')), text.slice(0, 200));
});

test('every instrument has a key of its own, and the tool list is complete', () => {
  const keys = LAB_TOOLS.map((tool) => tool.key);
  assert.equal(new Set(keys).size, keys.length);
  assert.equal(labTool('scalpel').id, 'scalpel');
  assert.ok(labTool('scalpel').radius < labTool('scissors').radius);
});

const needle = (structures: readonly string[], tipIn: readonly string[], more: Partial<LabAction> = {}): LabAction => ({ kind: 'inject', tool: 'syringe', at: 1, structures: structures.map((id) => 'living:' + id), tipIn: tipIn.map((id) => 'living:' + id), depthMm: 5, leftMm: -4, abdomenShare: 0.75, side: 'ventral', ...more });

test('an injection into the abdomen goes through a lower quadrant and the wall, with the tip in no organ', () => {
  const inject = exercise('inject-abdomen');
  assert.deepEqual(evaluateExercise(inject, facts()).steps, [true, false]);
  const good = evaluateExercise(inject, facts([needle(['skin', 'muscle-rectus', 'peritoneum'], ['skin'])]));
  assert.ok(good.finished);
  assert.deepEqual(good.errors, []);
  assert.deepEqual(evaluateExercise(inject, facts([needle(['skin'], ['skin'])])).steps, [true, false], 'not through the wall');
  assert.deepEqual(evaluateExercise(inject, facts([needle(['skin', 'muscle-rectus', 'peritoneum', 'caecum'], ['skin', 'caecum'])])).errors, ['The needle entered an organ']);
  assert.deepEqual(evaluateExercise(inject, facts([needle(['skin', 'muscle-rectus'], ['skin'], { abdomenShare: 0.2 })])).errors, ['The needle went in above the lower quadrants']);
  assert.deepEqual(evaluateExercise(inject, facts([needle(['skin', 'muscle-rectus'], ['skin'], { leftMm: 0.2 })])).steps, [true, false], 'on the midline');
});

test('an injection under the skin stays above the muscle, on the flank or rump', () => {
  const inject = exercise('inject-under-skin');
  const standing = (done: readonly LabAction[]) => facts(done, [], [], [], 'standing');
  assert.ok(evaluateExercise(inject, standing([needle(['skin'], ['skin'], { side: 'side', abdomenShare: 0.6 })])).finished);
  assert.deepEqual(evaluateExercise(inject, standing([needle(['skin'], ['skin'], { side: 'ventral' })])).steps, [true, false], 'on the belly');
  assert.deepEqual(evaluateExercise(inject, standing([needle(['skin', 'muscle-obliques'], ['skin', 'muscle-obliques'], { side: 'side' })])).errors, ['The needle went through into muscle or deeper']);
});

test('an injection into the thigh goes into the front of it, and a needle in the back of it is noted', () => {
  const inject = exercise('inject-thigh');
  const standing = (done: readonly LabAction[]) => facts(done, [], [], [], 'standing');
  assert.ok(evaluateExercise(inject, standing([needle(['skin', 'muscle-rectus-femoris'], ['skin', 'muscle-rectus-femoris'])])).finished);
  assert.deepEqual(evaluateExercise(inject, standing([needle(['skin', 'muscle-biceps-femoris'], ['skin', 'muscle-biceps-femoris'])])).errors, ['The needle entered the back of the thigh, near the sciatic nerve']);
  assert.deepEqual(evaluateExercise(inject, standing([needle(['skin', 'muscle-vasti', 'sciatic-nerves'], ['skin', 'muscle-vasti'])])).errors, ['The needle entered the back of the thigh, near the sciatic nerve']);
});

test('a needle is described by how deep it went and where its tip lies', () => {
  const nameOf = (id: string) => id.replace('living:', '');
  assert.equal(describeAction(needle(['skin', 'caecum'], ['skin', 'caecum'], { depthMm: 6.2 }), nameOf), 'Needle 6.2 mm deep: tip in caecum');
  assert.equal(describeAction(needle(['skin'], ['skin'], { depthMm: 3 }), nameOf), 'Needle 3.0 mm deep: tip in no structure');
});
