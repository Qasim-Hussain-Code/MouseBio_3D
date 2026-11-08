/**
 * The panel of dissection practice in a simulated DOM, and the rolled edge of the skin on a plain surface. These establish state and geometry and say nothing about how the bench looks when drawn.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, afterEach, test } from 'node:test';
import { Window } from 'happy-dom';
import * as THREE from 'three';
import { CutField } from '../src/domain/cut-field';
import { LAB_NOTICE, LAB_TOOLS, midlineCut, sessionSummary, type LabFacts } from '../src/domain/dissection-lab';
import { LAB_EXERCISES } from '../src/domain/lab-exercises';
import type { LabReport } from '../src/viewer/lab-session';
import { createSkinEdge } from '../src/viewer/lab-skin-edge';

const dom = new Window({ url: 'http://localhost:5173' });
const globals = {
  window: dom, document: dom.document, navigator: dom.navigator, HTMLElement: dom.HTMLElement, HTMLInputElement: dom.HTMLInputElement, HTMLTextAreaElement: dom.HTMLTextAreaElement, HTMLSelectElement: dom.HTMLSelectElement,
  Node: dom.Node, Event: dom.Event, MouseEvent: dom.MouseEvent, KeyboardEvent: dom.KeyboardEvent, MutationObserver: dom.MutationObserver, getComputedStyle: dom.getComputedStyle.bind(dom), IS_REACT_ACT_ENVIRONMENT: true,
};
for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
const { createElement } = await import('react');
const { cleanup, fireEvent, render } = await import('@testing-library/react');
const { LabPanel } = await import('../src/components/LabPanel');
const { LabChooser, LabTutorial } = await import('../src/components/LabTutorial');

afterEach(cleanup);
after(() => dom.close());

const facts = (more: Partial<LabFacts> = {}): LabFacts => ({ actions: [], seen: new Set(), removed: new Set(), ligated: new Set(), pose: 'on-back', ...more });
const report = (more: Partial<LabReport> = {}): LabReport => ({ facts: facts(), canUndo: false, taken: [], demonstrating: false, tool: 'scissors', pose: 'on-back', ...more });
const panel = (props: Record<string, unknown> = {}) => {
  const calls: Record<string, unknown[]> = {};
  const note = (name: string) => (...values: unknown[]) => { calls[name] = values; };
  const view = render(createElement(LabPanel, {
    report: report(), selected: null, modelId: 'mousebio-living-v1', exercise: null, nameOf: (id: string) => id.replace('living:', ''), canLookCloser: () => true,
    onExercise: note('exercise'), onTool: note('tool'), onPose: note('pose'), onView: note('view'), onTake: note('take'), onLookCloser: note('closer'), onUndo: note('undo'), onRestart: note('restart'), onDetails: note('details'), onDownload: note('download'),
    namesOn: false, onNames: note('names'), alive: true, onAlive: note('alive'), sound: true, onSound: note('sound'), steady: true, onSteady: note('steady'), ...props,
  } as never));
  return { ...view, calls };
};
const tutorial = (props: Record<string, unknown> = {}) => {
  const calls: Record<string, unknown[]> = {};
  const note = (name: string) => (...values: unknown[]) => { calls[name] = values; };
  const chosen = LAB_EXERCISES.find((item) => item.id === (props.id ?? 'open-abdomen'))!;
  const base = { exercise: chosen, facts: facts({ pose: 'standing' }), demonstrating: false, onStep: note('step'), onShow: note('show'), onWatchAll: note('all'), onStop: note('stop'), onClose: note('close'), onAct: note('act'), ...props };
  const view = render(createElement(LabTutorial, base as never));
  return { ...view, calls, base, chosen };
};

test('every instrument is offered and the one in hand is marked, and the notice says what this is', () => {
  const { getByRole, getByText, container } = panel({ report: report({ tool: 'forceps' }) });
  for (const tool of LAB_TOOLS) assert.ok(getByRole('radio', { name: tool.name }), tool.name);
  assert.equal(getByRole('radio', { name: 'Forceps' }).getAttribute('aria-checked'), 'true');
  assert.equal(getByRole('radio', { name: 'Scalpel' }).getAttribute('aria-checked'), 'false');
  assert.ok(getByText(LAB_NOTICE));
  assert.ok(container.querySelector('.lab-sim'), 'marked as simulated');
});

test('choosing an instrument, a key and undo reach the session', () => {
  const { getByRole, calls } = panel();
  fireEvent.click(getByRole('radio', { name: 'Scalpel' }));
  assert.deepEqual(calls.tool, ['scalpel']);
  fireEvent.keyDown(dom as never, { key: 'b' });
  assert.deepEqual(calls.tool, ['bone-cutter']);
  fireEvent.keyDown(dom as never, { key: 'z', ctrlKey: true });
  assert.ok(calls.undo);
});

test('every tutorial can be chosen, and a steady hand can be turned off', () => {
  const { getByRole, getByLabelText, calls } = panel();
  const select = getByLabelText('Tutorial') as HTMLSelectElement;
  assert.equal(select.options.length, LAB_EXERCISES.length + 1);
  fireEvent.change(select, { target: { value: 'collect-spleen' } });
  assert.deepEqual(calls.exercise, ['collect-spleen']);
  fireEvent.click(getByRole('button', { name: 'Steady hand' }));
  assert.deepEqual(calls.steady, [false]);
});

test('while the hands demonstrate, the instruments wait', () => {
  const { getByRole } = panel({ report: report({ demonstrating: true }) });
  assert.equal((getByRole('radio', { name: 'Scalpel' }) as HTMLButtonElement).disabled, true);
});

test('what lies in the dish can go under the microscope, and what was selected can be lifted out', () => {
  const { getByRole, getByText, calls } = panel({ report: report({ taken: ['living:spleen'] }), selected: { id: 'living:liver-left', name: 'Left lobe of the liver' } });
  assert.ok(getByText('spleen'));
  fireEvent.click(getByRole('button', { name: 'Under the microscope' }));
  assert.deepEqual(calls.closer, ['living:spleen']);
  fireEvent.click(getByRole('button', { name: 'Lift out' }));
  assert.deepEqual(calls.take, ['living:liver-left']);
});

test('a record can be taken once something has been done, and it holds what was done', () => {
  const action = { kind: 'cut', tool: 'scissors', at: 2, structures: ['living:skin'], tier: 'skin', lengthMm: 24, side: 'ventral', asideMm: 1 } as const;
  const { getByRole, calls, container } = panel({ report: report({ canUndo: true, facts: facts({ actions: [action] }) }) });
  assert.match(container.querySelector('.lab-log')!.textContent ?? '', /Cut skin, 24 mm/);
  fireEvent.click(getByRole('button', { name: 'Record' }));
  const record = JSON.parse(calls.download[0] as string);
  assert.equal(record.schemaVersion, 'mousebio.practice-record.v1');
  assert.equal(record.actions[0].kind, 'cut');
});

test('a tutorial lists its steps, says what to do and why, and names its source', () => {
  const { getByText, container, chosen } = tutorial();
  assert.equal(container.querySelectorAll('.lab-tutorial-steps li').length, chosen.steps.length);
  assert.ok(getByText(chosen.about));
  assert.ok(getByText(chosen.steps[0].how));
  assert.ok(container.querySelector('.lab-tutorial-why'));
  assert.ok(container.querySelector(".lab-source")?.textContent?.startsWith(`After ${chosen.source.citation}`));
  assert.equal(container.querySelector('.lab-source a')?.getAttribute('href'), `https://doi.org/${chosen.source.doi}`);
});

test('a step can be chosen, shown by the hands, and the whole can be watched', () => {
  const { getByRole, getByText, calls, chosen } = tutorial();
  assert.deepEqual(calls.step, [0], 'the first step is taken up at once');
  fireEvent.click(getByRole('button', { name: chosen.steps[1].text }));
  assert.deepEqual(calls.step, [1]);
  assert.ok(getByText(chosen.steps[1].how));
  fireEvent.click(getByRole('button', { name: 'Show me this step' }));
  assert.deepEqual(calls.show, [1]);
  fireEvent.click(getByRole('button', { name: 'Watch all of it' }));
  assert.ok(calls.all);
  fireEvent.click(getByRole('button', { name: 'Next' }));
  assert.deepEqual(calls.step, [2]);
  fireEvent.click(getByRole('button', { name: 'Back' }));
  assert.deepEqual(calls.step, [1]);
});

test('a card stands in the panel, the instruments shrink beside it, and the panel can be hidden', () => {
  let hidden = 0;
  const { container, getByRole } = panel({ card: createElement('section', { className: 'a-card' }), onHide: () => { hidden += 1; } });
  assert.ok(container.querySelector('.lab-panel .a-card'));
  assert.ok(container.querySelector('.lab-tools.is-compact'));
  assert.ok(getByRole('radio', { name: 'Scalpel' }), 'each still has its name');
  assert.equal(container.querySelector('.lab-more')?.hasAttribute('open'), false, 'how it lies and the views fold away');
  fireEvent.click(getByRole('button', { name: 'Hide the panel' }));
  assert.equal(hidden, 1);
});

test('without a card the panel shows everything, and while procedures are being chosen the rest of it waits', () => {
  const free = panel();
  assert.equal(free.container.querySelector('.lab-more')?.hasAttribute('open'), true);
  assert.equal(free.container.querySelector('.lab-tools.is-compact') === null, true);
  cleanup();
  const choosing = panel({ card: createElement('section', { className: 'a-card' }), choosing: true });
  assert.equal(choosing.container.querySelector('.lab-tools') === null, true);
});

test('nothing at the bench lies over the view', () => {
  const css = readFileSync('src/components/LabPanel.css', 'utf8');
  assert.doesNotMatch(css, /\.lab-tutorial\{[^}]*position:absolute/);
  assert.doesNotMatch(css, /\.lab-tutorial-fold\{[^}]*position:absolute/);
  assert.match(css, /\.app-shell\.workbench\.mode-dissection \.navigator\{position:relative/);
});

test('a step that no instrument does has a button of its own, until it has been done', () => {
  const { getByRole, container, calls, chosen, base, rerender } = tutorial({ id: 'perfuse-heart' });
  const flow = chosen.steps.findIndex((step) => step.act);
  const offered = () => container.querySelector('.lab-tutorial-step .lab-watch') as HTMLElement | null;
  assert.equal(offered() === null, true);
  fireEvent.click(getByRole('button', { name: chosen.steps[flow].text }));
  assert.equal(offered()?.textContent, 'Start the flow');
  fireEvent.click(offered()!);
  assert.deepEqual(calls.act, ['perfuse']);
  rerender(createElement(LabTutorial, { ...base, facts: facts({ pose: 'on-back', actions: [{ kind: 'perfuse', tool: 'syringe', at: 1, structures: ['living:heart-lv'] }] }) } as never));
  assert.equal(offered() === null, true);
});

test('a tutorial follows what is done, and goes on when a step has been done', () => {
  const { rerender, base, calls, container, chosen } = tutorial({ id: 'open-abdomen' });
  assert.deepEqual(calls.step, [0]);
  assert.equal(container.querySelectorAll('.lab-tutorial-steps .is-done').length, 0);
  // The animal is laid on its back, so the first step has been done and the card goes on to the next.
  rerender(createElement(LabTutorial, { ...base, facts: facts() } as never));
  assert.deepEqual(calls.step, [1]);
  assert.equal(container.querySelector('.lab-tutorial-step h3')?.textContent?.includes(chosen.steps[1].text), true);
  assert.equal(container.querySelectorAll('.lab-tutorial-steps .is-done').length, 1);
  // The skin is cut as the tutorial asks.
  const cut = { kind: 'cut', tool: 'scissors', at: 1, structures: ['living:skin'], tier: 'skin', lengthMm: 30, asideMm: 1, side: 'ventral' } as const;
  rerender(createElement(LabTutorial, { ...base, facts: facts({ actions: [cut] }) } as never));
  assert.deepEqual(calls.step, [2]);
});

test('damage and the end are reported, and the hands can be stopped', () => {
  const organ = { kind: 'cut', tool: 'scissors', at: 3, structures: ['living:small-intestine'], tier: 'organs', lengthMm: 2 } as const;
  const { getByText } = tutorial({ facts: facts({ actions: [organ] }) });
  assert.ok(getByText('An organ was cut'));
  cleanup();
  const { getByRole, calls } = tutorial({ demonstrating: true });
  fireEvent.click(getByRole('button', { name: 'Stop and take over' }));
  assert.ok(calls.stop);
});

const flatSkin = () => {
  // A flat sheet of skin, a little inside a grid of boxes of 1 mm.
  const geometry = new THREE.PlaneGeometry(0.04, 0.04, 40, 40);
  geometry.translate(0.02, 0.02, 0.02);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
  mesh.updateMatrixWorld(true);
  const field = new CutField({ origin: [0, 0, 0], cell: 0.001, nx: 40, ny: 40, nz: 40 });
  return { mesh, field };
};

test('the rolled edge is found along a cut in the skin and nowhere else, on the outside of it', () => {
  const { mesh, field } = flatSkin();
  const edge = createSkinEdge(mesh, field, 0.002, 0.001);
  edge.refresh();
  assert.equal(edge.mesh.geometry.drawRange.count, 0, 'no cut, no edge');
  field.sweep(0, [0.012, 0.02, 0.02], [0.028, 0.02, 0.02], 0.0015);
  edge.refresh();
  const count = edge.mesh.geometry.drawRange.count;
  assert.ok(count > 0, 'an edge along the cut');
  const position = edge.mesh.geometry.getAttribute('position');
  let highest = -Infinity, nearest = Infinity;
  for (let i = 0; i < count; i++) {
    const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
    assert.ok(x > 0.007 && x < 0.033, `x ${x}`);
    assert.ok(Math.abs(y - 0.02) < 0.0048, `y ${y}`);
    highest = Math.max(highest, z);
    // Away from the rounded ends of the cut, it lies beside the cut and not in it.
    if (x > 0.016 && x < 0.024) nearest = Math.min(nearest, Math.abs(y - 0.02));
  }
  assert.ok(highest > 0.0205 && highest <= 0.0211, `raised above the skin: ${highest}`);
  assert.ok(nearest > 0.0005, 'it starts at the edge of the cut, not in its middle');
  // Unbroken: each piece of the lip begins where the one before it ended, so it cannot show as separate strokes.
  const rows = 3, perPiece = rows * 6;
  let joined = 0, broken = 0;
  for (let piece = 0; piece + 1 < count / perPiece; piece++) {
    const end = piece * perPiece + 1, next = (piece + 1) * perPiece;
    const apart = Math.hypot(position.getX(end) - position.getX(next), position.getY(end) - position.getY(next), position.getZ(end) - position.getZ(next));
    if (apart < 1e-7) joined++; else broken++;
  }
  assert.ok(joined > 8 * broken && joined > 8, `joined ${joined}, broken ${broken}`);
  field.clear();
  edge.refresh();
  assert.equal(edge.mesh.geometry.drawRange.count, 0, 'gone again when the cut is undone');
  edge.dispose();
});

test('the chooser lists the procedures to choose from, by kind', () => {
  const chosen: string[] = [];
  let free = 0;
  const view = render(createElement(LabChooser, { onChoose: (id: string) => chosen.push(id), onFree: () => { free++; } }));
  for (const heading of ['Necropsy', 'Surgery', 'Blood sampling', 'Injection']) assert.ok(view.getByRole('heading', { name: heading }));
  for (const exercise of LAB_EXERCISES) assert.ok(view.getByRole('button', { name: new RegExp(exercise.name) }), exercise.name);
  fireEvent.click(view.getByRole('button', { name: /Tie the femoral artery/ }));
  assert.deepEqual(chosen, ['femoral-ligation']);
  fireEvent.click(view.getByRole('button', { name: 'Practise freely' }));
  assert.equal(free, 1);
});

test('the card says what has fallen short, and names the instruments and what is seen', () => {
  const exercise = LAB_EXERCISES.find((item) => item.id === 'open-abdomen')!;
  const short: LabFacts = facts({ actions: [{ kind: 'cut', tool: 'scissors', at: 3, structures: ['living:skin'], tier: 'skin', lengthMm: 11, asideMm: 0.4, side: 'ventral', fromMm: 20, toMm: 31 }] });
  const first = tutorial({ exercise, facts: facts({ pose: 'standing' }) });
  assert.ok(first.getByText(/Instruments:/).parentElement?.textContent?.includes('scissors'), 'at the first step, and then out of the way');
  cleanup();
  const view = tutorial({ exercise, facts: short });
  assert.ok(view.getByText(/The cut is 11 mm long so far/));
  assert.ok(view.getByText(/What you see/));
});

test('two snips along the middle add up, and a stray one does not count', () => {
  const snip = (lengthMm: number, asideMm = 0.5) => ({ kind: 'cut' as const, tool: 'scissors' as const, at: 1, structures: ['living:skin'], tier: 'skin' as const, lengthMm, asideMm, side: 'ventral' as const, fromMm: 0, toMm: lengthMm });
  assert.equal(midlineCut(facts({ actions: [snip(12), snip(12)] }), ['skin'], 20), true);
  assert.equal(midlineCut(facts({ actions: [snip(12), snip(12, 9)] }), ['skin'], 20), false);
});

test('a finished session is summed up from what was done', () => {
  assert.equal(sessionSummary(facts()), '');
  const done = facts({ actions: [{ kind: 'cut', tool: 'scissors', at: 10, structures: [], lengthMm: 30 }, { kind: 'reflect', tool: 'forceps', at: 85, structures: [] }] });
  assert.equal(sessionSummary(done), '2 actions in 1 min 15 s, 30 mm cut.');
});
