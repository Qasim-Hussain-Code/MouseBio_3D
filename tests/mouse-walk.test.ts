import assert from 'node:assert/strict';
import test from 'node:test';
import { bodyPoint, carried, goToFloor, stagePoint, startle, stepWander, WANDER, WANDER_START, wantsToSit, wantsToStep, paceOf, type FloorPoint, type WanderState, type WanderView } from '../src/domain/mouse-walk';
import { WALK_SPEED } from '../src/domain/living-simulation';
import { callsForTouch, VOICE_RANGE } from '../src/domain/mouse-voice';

function seeded(seed: number) { let state = seed >>> 0 || 1; return () => { state ^= state << 13; state >>>= 0; state ^= state >>> 17; state ^= state << 5; state >>>= 0; return state / 4294967296; }; }

/** A square view of the floor, from -half to half each way, with what the viewer would answer. */
function room(half: number, random: () => number) {
  const entries: FloorPoint[] = [];
  const view = (state: WanderState): WanderView => ({
    inView: Math.abs(state.pose.x) < half && Math.abs(state.pose.y) < half,
    random,
    inside: () => [(random() - 0.5) * half, (random() - 0.5) * half],
    outside: () => { const side = random() < 0.5 ? -1 : 1; return random() < 0.5 ? [side * half * 1.5, (random() - 0.5) * half] : [(random() - 0.5) * half, side * half * 1.5]; },
    entry: () => { const at: FloorPoint = [(random() < 0.5 ? -1 : 1) * half * 1.2, (random() < 0.5 ? -1 : 1) * half * 1.2]; entries.push(at); return { at, goal: [(random() - 0.5) * half, (random() - 0.5) * half] }; },
  });
  return { view, entries };
}

test('a point of the room stays where it is in the room as the mouse moves, whichever way it has turned', () => {
  const from = { x: 0.03, y: -0.02, heading: 0.7 }, to = { x: 0.05, y: 0.04, heading: -1.1 };
  const [ahead, across] = carried(from, to, 0.11, -0.06);
  const before = stagePoint(from, 0.11, -0.06), after = stagePoint(to, ahead, across);
  assert.ok(Math.abs(before[0] - after[0]) < 1e-12 && Math.abs(before[1] - after[1]) < 1e-12);
  const [f, s] = bodyPoint(to, ...after);
  assert.ok(Math.abs(f - ahead) < 1e-12 && Math.abs(s - across) < 1e-12);
});

test('walking it wanders in view, leaves the view, stays away for a while and comes back from each corner in turn', () => {
  const random = seeded(4242), { view, entries } = room(0.15, random);
  let state: WanderState = WANDER_START, seconds = 0, awayFor = 0, timesAway = 0, stops = 0;
  const step = 1 / 30;
  while (seconds < 1500) {
    const before = state;
    const speed = wantsToStep(state) ? WALK_SPEED * paceOf(state) : 0;
    state = stepWander(state, step, speed * step, true, view(state));
    seconds += step;
    if (state.mode === 'stopped' && before.mode !== 'stopped') stops++;
    if (state.mode === 'away') { if (before.mode !== 'away') timesAway++; awayFor += step; assert.ok(!view(state).inView, 'away means out of view'); }
    assert.ok(Math.abs(state.turning) <= WANDER.turnRate + 1e-9, 'it does not spin');
  }
  assert.ok(timesAway >= 8, 'it left the view ' + timesAway + ' times');
  assert.ok(stops >= 5, 'it stopped ' + stops + ' times');
  assert.ok(awayFor / timesAway >= WANDER.away[0] - 0.1 && awayFor / timesAway <= WANDER.away[0] + WANDER.away[1] + 0.1);
  const corners = new Set(entries.map(([x, y]) => (x > 0 ? 'right' : 'left') + (y > 0 ? ' top' : ' bottom')));
  assert.equal(corners.size, 4, 'it came back from every corner: ' + [...corners].join());
});

test('told to stand it stops where it is, or if it is out of view it comes back into view first and is never left out of sight', () => {
  const random = seeded(77), { view } = room(0.15, random);
  const going: WanderState = { ...WANDER_START, mode: 'going', goal: [0.1, 0], visitsLeft: 1 };
  const stood = stepWander(going, 1 / 30, 0, false, view(going));
  assert.equal(stood.mode, 'still');
  assert.equal(wantsToStep(stood), false);
  let away: WanderState = { ...WANDER_START, mode: 'away', pose: { x: 0.4, y: 0.4, heading: 0 }, wait: 3 };
  away = stepWander(away, 1 / 30, 0, false, view(away));
  assert.equal(away.mode, 'going');
  assert.equal(away.restAfter, true);
  let state = away, seconds = 0;
  while (state.mode !== 'still' && seconds < 60) { state = stepWander(state, 1 / 30, WALK_SPEED / 30, false, view(state)); seconds += 1 / 30; }
  assert.equal(state.mode, 'still');
  assert.ok(view(state).inView, 'it stops in view');
});

test('a click on the floor sends it there, and it stops there whether it was walking or not', () => {
  const random = seeded(5), { view } = room(0.2, random);
  let state = goToFloor(WANDER_START, [0.06, 0.04]), seconds = 0;
  assert.equal(wantsToStep(state), true);
  while (state.mode === 'going' && seconds < 30) { state = stepWander(state, 1 / 30, WALK_SPEED / 30, false, view(state)); seconds += 1 / 30; }
  assert.equal(state.mode, 'still');
  assert.ok(Math.hypot(state.pose.x - 0.06, state.pose.y - 0.04) < WANDER.arrival * 1.5, 'it got there');
});

test('a mouse brought back into view by the viewer does not wait out of view or jump away', () => {
  const random = seeded(9), { view } = room(0.2, random);
  const brought: WanderState = { ...WANDER_START, mode: 'away', wait: 3, pose: { x: 0, y: 0, heading: 0 } };
  const next = stepWander(brought, 1 / 30, 0, true, view(brought));
  assert.equal(next.pose, brought.pose, 'it stays where it is seen');
  assert.notEqual(next.mode, 'away');
});

test('a touch hurries it for a while, and its voice lies within the published ranges', () => {
  const random = seeded(31), { view } = room(0.2, random);
  let state = startle({ ...WANDER_START, mode: 'going', goal: [0.1, 0] });
  assert.ok(paceOf(state) > 1);
  for (let i = 0; i < 30 * (WANDER.startledSeconds + 0.5); i++) state = stepWander(state, 1 / 30, 0, true, view(state));
  assert.equal(paceOf(state), 1);
  for (const alarm of [0, 0.34, 0.68, 1]) for (let trial = 0; trial < 200; trial++) {
    const calls = callsForTouch(alarm, random);
    assert.ok(calls.some((call) => call.kind === 'low-harmonic'));
    for (const call of calls) {
      assert.ok(call.at >= 0 && call.seconds > 0 && call.level > 0 && call.level <= 1);
      const [low, high] = call.kind === 'low-harmonic' ? VOICE_RANGE.lowFundamental : VOICE_RANGE.midFrequency;
      for (const pitch of [call.from, call.peak, call.to]) assert.ok(pitch >= low && pitch <= high, call.kind + ' at ' + pitch);
      if (call.kind === 'mid-frequency') assert.ok(call.seconds <= VOICE_RANGE.midSeconds[1]);
    }
  }
  const length = (alarm: number) => { let sum = 0; for (let i = 0; i < 300; i++) { const calls = callsForTouch(alarm, random); const last = calls[calls.length - 1]; sum += last.at + last.seconds; } return sum / 300; };
  assert.ok(length(1) > length(0) * 1.3, 'a stronger answer is longer');
});

test('at rest it sits up to wash now and then, for a while, and a touch ends it', () => {
  let state: WanderState = WANDER_START;
  const view: WanderView = { inView: true, random: () => 0.5, inside: () => [0, 0], outside: () => [1, 1], entry: () => ({ at: [1, 1], goal: [0, 0] }) };
  assert.equal(wantsToSit(state), false);
  let sat = 0;
  for (let i = 0; i < 400 && !wantsToSit(state); i++, sat += 0.1) state = stepWander(state, 0.1, 0, false, view);
  assert.ok(wantsToSit(state), 'it sits up in the end');
  assert.ok(sat >= WANDER_START.nextSit - 0.2, 'and not at once');
  assert.equal(state.mode, 'still');
  assert.equal(wantsToStep(state), false);
  assert.equal(wantsToSit(startle(state)), false, 'a touch ends it');
  let left = 0;
  while (wantsToSit(state) && left < 100) { state = stepWander(state, 0.1, 0, false, view); left++; }
  assert.ok(left * 0.1 >= WANDER.sit[0] - 0.2 && left * 0.1 <= WANDER.sit[0] + WANDER.sit[1] + 0.2, `${left * 0.1} seconds`);
});

test('walking, it does not sit up while going anywhere, and a stop may be a wash that ends before it goes on', () => {
  const view: WanderView = { inView: true, random: () => 0, inside: () => [0.001, 0], outside: () => [1, 1], entry: () => ({ at: [1, 1], goal: [0, 0] }) };
  const going: WanderState = { ...WANDER_START, mode: 'going', goal: [0.001, 0], visitsLeft: 2, sitLeft: 2 };
  assert.equal(wantsToSit(going), false);
  const stopped = stepWander(going, 0.1, 0.002, true, view);
  assert.equal(stopped.mode, 'stopped');
  assert.ok(stopped.sitLeft > 0);
  assert.ok(stopped.wait > stopped.sitLeft, 'it comes down again before it goes on');
  assert.ok(wantsToSit(stopped));
});
