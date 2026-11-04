/** Accessible component state and callbacks, without browser layout evidence. */
import assert from 'node:assert/strict';
import { after, afterEach, beforeEach, test } from 'node:test';
import { Window } from 'happy-dom';
import type { Structure } from '../src/domain/types';
import type { SelectionToolsProps } from '../src/components/SelectionTools';

const dom = new Window({ url: 'http://localhost:5173' });
const globals = { window: dom, document: dom.document, navigator: dom.navigator, HTMLElement: dom.HTMLElement,
  HTMLInputElement: dom.HTMLInputElement, Node: dom.Node, Event: dom.Event, MouseEvent: dom.MouseEvent,
  MutationObserver: dom.MutationObserver, getComputedStyle: dom.getComputedStyle.bind(dom), IS_REACT_ACT_ENVIRONMENT: true };
const previous = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries(globals)) {
  previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
  Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
const { createElement } = await import('react');
const { cleanup, fireEvent, render } = await import('@testing-library/react');
const { SelectionTools } = await import('../src/components/SelectionTools');
const originalFetch = globalThis.fetch, originalConsoleError = console.error;
let errors: unknown[][] = [];
beforeEach(() => {
  errors = [];
  globalThis.fetch = (async () => assert.fail('Selection controls must not make requests.')) as typeof fetch;
  console.error = (...args: unknown[]) => { errors.push(args); originalConsoleError(...args); };
});
afterEach(async () => {
  cleanup(); await dom.happyDOM.cancelAsync(); globalThis.fetch = originalFetch; console.error = originalConsoleError;
  assert.deepEqual(errors, [], 'No unexpected component or React errors.');
});
after(async () => {
  await dom.happyDOM.close();
  for (const [key, descriptor] of previous) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key);
});
const selected: Structure = { id: 'mousemapper-nerve:patch0', name: 'Predicted regional nerve graph',
  systems: ['nervous'], sourceLabel: 'patch_volume_4X_0_pred', meshNode: 'region_mousemapper_patch0' };
function props(calls: (string | number)[]): SelectionToolsProps {
  return { selected, hidden: false, opacity: 0.8, isolated: false,
    onFocus: () => { calls.push('focus'); }, onToggleHidden: () => { calls.push('visibility'); },
    onIsolate: () => { calls.push('isolation'); }, onOpacityChange: (value) => { calls.push(value); },
    onOpenDetails: () => { calls.push('details'); } };
}

test('empty selection exposes a compact selection hint without actionable controls or requests', () => {
  const calls: (string | number)[] = [];
  const view = render(createElement(SelectionTools, { ...props(calls), selected: null }));
  assert.ok(view.getByRole('region', { name: 'Selection tools' }));
  assert.ok(view.getByText('Select a structure or source record.'));
  assert.equal(view.queryByRole('button'), null); assert.equal(view.queryByRole('slider'), null);
  assert.deepEqual(calls, []);
});

test('exact source identity and accessible controls delegate actions without changing the supplied record', () => {
  const calls: (string | number)[] = [], initial = structuredClone(selected);
  let submissions = 0;
  const view = render(createElement('form', { onSubmit: (event) => { event.preventDefault(); submissions++; } },
    createElement(SelectionTools, props(calls))));
  assert.ok(view.getByText(selected.name)); assert.ok(view.getByText(selected.id, { selector: 'code' }));
  for (const name of ['Focus selected structure or source record', 'Hide selected structure or source record',
    'Isolate selected structure or source record', 'Open details for selected structure or source record']) {
    const button = view.getByRole('button', { name }); assert.equal(button.getAttribute('type'), 'button'); fireEvent.click(button);
  }
  assert.deepEqual(calls, ['focus', 'visibility', 'isolation', 'details']); assert.equal(submissions, 0);
  const slider = view.getByRole('slider', { name: 'Display opacity of selected structure or source record' }) as HTMLInputElement;
  assert.equal(slider.type, 'range'); assert.equal(slider.min, '0'); assert.equal(slider.max, '1'); assert.equal(slider.step, '0.01');
  assert.equal(slider.value, '0.8'); assert.equal(slider.getAttribute('aria-valuetext'), '80% display opacity');
  slider.focus(); assert.equal(document.activeElement, slider);
  fireEvent.change(slider, { target: { value: '0.35' } });
  assert.deepEqual(calls, ['focus', 'visibility', 'isolation', 'details', 0.35]);
  assert.ok(view.getByText('80%', { selector: 'output' }));
  assert.deepEqual(selected, initial);
});

test('controlled visibility, isolation and opacity update their actions and keep trace/source wording', () => {
  const calls: (string | number)[] = [];
  const initial = props(calls), view = render(createElement(SelectionTools, initial));
  const trace: Structure = { id: 'local-trace:sample', name: 'Local source trace', systems: ['nervous'], sourceLabel: 0, meshNode: 'region_trace' };
  view.rerender(createElement(SelectionTools, { ...initial, selected: trace, hidden: true, isolated: true, opacity: 0 }));
  assert.ok(view.getByText(trace.name)); assert.ok(view.getByText(trace.id, { selector: 'code' }));
  assert.equal(view.queryByText(selected.name), null); assert.ok(view.getByText('Hidden')); assert.ok(view.getByText('Isolated'));
  fireEvent.click(view.getByRole('button', { name: 'Show selected structure or source record' }));
  fireEvent.click(view.getByRole('button', { name: 'Restore other structures or source records' }));
  assert.deepEqual(calls, ['visibility', 'isolation']); assert.ok(view.getByText('0%', { selector: 'output' }));
  view.rerender(createElement(SelectionTools, { ...initial, selected: trace, opacity: 1 }));
  assert.equal(view.queryByText('Hidden'), null); assert.equal(view.queryByText('Isolated'), null);
  assert.ok(view.getByText('100%', { selector: 'output' }));
  assert.equal(view.getByRole('slider').getAttribute('aria-valuetext'), '100% display opacity');
});
