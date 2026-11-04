/** Standalone DOM controls test; this does not establish rendered anatomical visibility. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, afterEach, test } from 'node:test';
import { Window } from 'happy-dom';
import type { Atlas } from '../src/domain/types';

const dom = new Window({ url: 'http://localhost:5173' });
const previous = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({ window: dom, document: dom.document, navigator: dom.navigator,
  HTMLElement: dom.HTMLElement, HTMLInputElement: dom.HTMLInputElement, Node: dom.Node,
  Event: dom.Event, MouseEvent: dom.MouseEvent, IS_REACT_ACT_ENVIRONMENT: true })) {
  previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
  Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
const { createElement } = await import('react');
const { cleanup, fireEvent, render, within } = await import('@testing-library/react');
const { SystemLayers } = await import('../src/components/SystemLayers');
const volume = JSON.parse(await readFile(new URL('../public/atlas-volume/atlas.json', import.meta.url), 'utf8')) as Atlas;
const embryo = JSON.parse(await readFile(new URL('../public/atlas-ema147/atlas.json', import.meta.url), 'utf8')) as Atlas;
afterEach(async () => { cleanup(); await dom.happyDOM.cancelAsync(); });
after(async () => {
  await dom.happyDOM.close();
  for (const [key, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); }
});

test('represented rows provide mixed-state checkboxes and source-specific counts with separate isolate callbacks', () => {
  const toggled: string[] = [], isolated: string[] = []; let showAll = 0;
  const view = render(createElement(SystemLayers, { atlas: volume, hidden: ['digimouse-volume:4'], opacity: { 'digimouse-volume:5': 0 },
    onToggleSystem: (id) => toggled.push(id), onIsolateSystem: (id) => isolated.push(id), onShowAll: () => { showAll++; } }));
  assert.ok(view.getByRole('heading', { name: 'System layers' }));
  assert.equal(view.getAllByRole('checkbox').length, 13);
  const nervous = view.getByRole('checkbox', { name: 'Nervous visibility' }) as HTMLInputElement;
  assert.equal(nervous.checked, false); assert.equal(nervous.indeterminate, true); assert.equal(nervous.getAttribute('aria-checked'), 'mixed');
  const row = within(nervous.closest('li')!);
  assert.ok(row.getByText('4/6 source regions visible'));
  fireEvent.click(nervous); assert.deepEqual(toggled, ['nervous']); assert.equal(isolated.length, 0);
  fireEvent.click(row.getByRole('button', { name: 'Isolate nervous source regions' }));
  assert.deepEqual(isolated, ['nervous']); assert.deepEqual(toggled, ['nervous']);
  fireEvent.click(view.getByRole('button', { name: 'Show all' })); assert.equal(showAll, 1);
});

test('controlled visibility changes reset checkbox state and native indeterminate state', () => {
  const props = { atlas: volume, hidden: ['digimouse-volume:4'], opacity: {}, onToggleSystem: () => {}, onIsolateSystem: () => {}, onShowAll: () => {} };
  const view = render(createElement(SystemLayers, props));
  let nervous = view.getByRole('checkbox', { name: 'Nervous visibility' }) as HTMLInputElement;
  assert.equal(nervous.indeterminate, true);
  view.rerender(createElement(SystemLayers, { ...props, hidden: [] }));
  nervous = view.getByRole('checkbox', { name: 'Nervous visibility' }) as HTMLInputElement;
  assert.equal(nervous.indeterminate, false); assert.equal(nervous.checked, true); assert.equal(nervous.getAttribute('aria-checked'), 'true');
  view.rerender(createElement(SystemLayers, { ...props, hidden: [4, 5, 6, 7, 8, 10].map((id) => `digimouse-volume:${id}`) }));
  nervous = view.getByRole('checkbox', { name: 'Nervous visibility' }) as HTMLInputElement;
  assert.equal(nervous.indeterminate, false); assert.equal(nervous.checked, false); assert.equal(nervous.getAttribute('aria-checked'), 'false');
});

test('missing systems are collapsed descriptive categories rather than geometry controls', () => {
  const view = render(createElement(SystemLayers, { atlas: volume, hidden: [], opacity: {}, onToggleSystem: () => {}, onIsolateSystem: () => {}, onShowAll: () => {} }));
  const details = view.getByText('Other systems (1)').closest('details')!;
  assert.equal(details.open, false);
  assert.equal(view.queryByRole('checkbox', { name: 'Arterial and venous visibility' }), null);
  assert.equal(view.queryByRole('button', { name: 'Isolate arterial and venous source regions' }), null);
  assert.ok(within(details).getByText('Arterial and venous'));
  assert.match(details.textContent!, /does not establish their absence from the animal or supply missing geometry/);
});

test('EMA147 remains unclassified and never acquires inferred vascular or neural system toggles', () => {
  const view = render(createElement(SystemLayers, { atlas: embryo, hidden: ['ema147:reference'], opacity: {}, onToggleSystem: () => {}, onIsolateSystem: () => {}, onShowAll: () => {} }));
  assert.equal(view.queryAllByRole('checkbox').length, 0);
  assert.ok(view.getByText('77 source regions have no system classification (76 visible). No classification is inferred.'));
  assert.ok(view.getByText('Other systems (14)'));
  assert.ok(view.getByText(/No system classifications are assigned to this source/));
});

test('malformed input produces a fixed error and no partial layer controls', () => {
  const view = render(createElement(SystemLayers, { atlas: {} as Atlas, hidden: [], opacity: {}, onToggleSystem: () => {}, onIsolateSystem: () => {}, onShowAll: () => {} }));
  assert.equal(view.getByRole('alert').textContent, 'System layers are unavailable for the current source or display settings.');
  assert.equal(view.queryAllByRole('checkbox').length, 0);
  assert.equal((view.getByRole('button', { name: 'Show all' }) as HTMLButtonElement).disabled, true);
});
