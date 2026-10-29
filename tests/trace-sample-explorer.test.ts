/** Simulated component state and source reads, without WebGL rendering evidence. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, afterEach, beforeEach, test } from 'node:test';
import { Window } from 'happy-dom';
import type { Atlas } from '../src/domain/types';
import type { LocalTraceAsset } from '../src/domain/local-trace';

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
const { act, cleanup, fireEvent, render, waitFor } = await import('@testing-library/react');
const { TraceSampleExplorer } = await import('../src/components/TraceSampleExplorer');
const { parseLocalTrace } = await import('../src/domain/local-trace');
const originalFetch = globalThis.fetch;
const originalConsoleError = console.error;
let errors: unknown[][] = [];
const sourceAtlas = JSON.parse(await readFile(new URL('../public/atlas-neuron/atlas.json', import.meta.url), 'utf8')) as Atlas;
const sourceBytes = await readFile(new URL('../public/atlas-neuron/nmo130632-standardized.swc.txt', import.meta.url));

beforeEach(() => {
  errors = [];
  globalThis.fetch = (async () => assert.fail('This workflow must not make an unexpected request.')) as typeof fetch;
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
async function local(text: string): Promise<LocalTraceAsset> {
  const result = await parseLocalTrace(new TextEncoder().encode(text).buffer);
  assert.ok(result.ok && result.asset); return result.asset;
}
const fixture = '50 2 1 0 0 0.25 10\n10 1 0 0 0 4 -1\n90 3 0 1 0 0.5 10\n5 7 2 1 0 0 -1\n';
type View = ReturnType<typeof render>;
function field(view: View, label: string): string | null {
  return view.getByText(label, { selector: 'dt' }).nextElementSibling?.textContent ?? null;
}
function query(view: View, value: string) {
  fireEvent.change(view.getByRole('textbox', { name: 'Source sample ID' }), { target: { value } });
  fireEvent.click(view.getByRole('button', { name: 'Inspect sample' }));
}

test('bundled inspection makes one explicit bounded read and exposes only original numeric records', async () => {
  const atlas = structuredClone(sourceAtlas); const requests: string[] = [];
  globalThis.fetch = (async (url, options) => {
    requests.push(String(url)); assert.equal(options?.credentials, 'same-origin'); assert.equal(options?.redirect, 'error');
    assert.equal(options?.body, undefined); return new Response(sourceBytes);
  }) as typeof fetch;
  const view = render(createElement(TraceSampleExplorer, { atlas, viewerReady: false, onFocusSample: () => false }));
  assert.deepEqual(requests, []); assert.equal(view.queryByRole('textbox', { name: 'Source sample ID' }), null);
  fireEvent.click(view.getByRole('button', { name: 'Inspect source samples' }));
  await waitFor(() => assert.equal(field(view, 'Selected source ID'), '1'));
  assert.deepEqual(requests, ['/atlas-neuron/nmo130632-standardized.swc.txt']);
  assert.equal(field(view, 'Source row'), '1 of 11650');
  assert.equal(field(view, 'Source type code'), '1');
  assert.ok(view.getByText('11,650')); assert.ok(view.getByText('11,649'));
  assert.equal(view.queryByRole('button', { name: 'Inspect source samples' }), null);
  assert.ok(view.getByText(/Coordinates and radius use unknown source units/));
  query(view, '11650'); assert.equal(field(view, 'Selected source ID'), '11650');
  assert.equal((view.getByRole('button', { name: 'Focus incident links' }) as HTMLButtonElement).disabled, true);
});

test('failed bundled reads hide error details and allow a separately verified retry', async () => {
  const atlas = structuredClone(sourceAtlas); let attempts = 0;
  globalThis.fetch = (async () => { attempts++; if (attempts === 1) throw new Error('fixture detail must stay private'); return new Response(sourceBytes); }) as typeof fetch;
  const view = render(createElement(TraceSampleExplorer, { atlas, viewerReady: false, onFocusSample: () => false }));
  fireEvent.click(view.getByRole('button', { name: 'Inspect source samples' }));
  await view.findByRole('alert');
  assert.equal(view.getByRole('alert').textContent, 'The source samples could not be read or verified. Try again.');
  assert.equal(view.container.textContent?.includes('fixture detail must stay private'), false);
  assert.equal(view.queryByRole('textbox', { name: 'Source sample ID' }), null);
  fireEvent.click(view.getByRole('button', { name: 'Inspect source samples' }));
  await waitFor(() => assert.equal(field(view, 'Selected source ID'), '1'));
  assert.equal(attempts, 2); assert.equal(view.queryByRole('alert'), null);
});

test('switching the manifest and unmounting abort pending inspections without accepting stale results', async () => {
  const resolvers: ((response: Response) => void)[] = []; const signals: AbortSignal[] = [];
  globalThis.fetch = ((_: RequestInfo | URL, options?: RequestInit) => {
    signals.push(options!.signal!); return new Promise<Response>((resolve) => resolvers.push(resolve));
  }) as typeof fetch;
  const first = structuredClone(sourceAtlas), second = structuredClone(sourceAtlas);
  const props = { atlas: first, viewerReady: false, onFocusSample: () => false };
  const view = render(createElement(TraceSampleExplorer, props));
  fireEvent.click(view.getByRole('button', { name: 'Inspect source samples' }));
  assert.equal(resolvers.length, 1); assert.equal(signals[0].aborted, false);
  view.rerender(createElement(TraceSampleExplorer, { ...props, atlas: second }));
  assert.equal(signals[0].aborted, true);
  fireEvent.click(view.getByRole('button', { name: 'Inspect source samples' }));
  assert.equal(resolvers.length, 2); assert.equal(signals[1].aborted, false);
  await act(async () => { resolvers[0](new Response(sourceBytes)); await Promise.resolve(); });
  assert.equal(view.queryByRole('textbox', { name: 'Source sample ID' }), null);
  view.unmount(); assert.equal(signals[1].aborted, true);
  await act(async () => { resolvers[1](new Response(sourceBytes)); await Promise.resolve(); });
  assert.equal(view.container.textContent, '');
});

test('local sample IDs, source rows and parent navigation stay distinct with original numeric values', async () => {
  const asset = await local(fixture);
  const view = render(createElement(TraceSampleExplorer, { atlas: asset.atlas, localTrace: asset, viewerReady: false, onFocusSample: () => false }));
  assert.equal(field(view, 'Selected source ID'), '50'); assert.equal(field(view, 'Source row'), '1 of 4');
  assert.equal(field(view, 'Source X'), '1'); assert.equal(field(view, 'Source radius field'), '0.25');
  assert.equal(field(view, 'Parent source ID'), '10');
  fireEvent.click(view.getByRole('button', { name: 'Inspect parent' }));
  assert.equal(field(view, 'Selected source ID'), '10'); assert.equal(field(view, 'Source row'), '2 of 4');
  assert.ok(view.getByRole('button', { name: 'Inspect child sample 50' }));
  assert.ok(view.getByRole('button', { name: 'Inspect child sample 90' }));
  fireEvent.click(view.getByRole('button', { name: 'Next source row' }));
  assert.equal(field(view, 'Selected source ID'), '90');
  fireEvent.click(view.getByRole('button', { name: 'Previous source row' }));
  assert.equal(field(view, 'Selected source ID'), '10');
  fireEvent.click(view.getByRole('button', { name: 'Inspect child sample 50' }));
  assert.equal(field(view, 'Selected source ID'), '50');
  for (const value of ['0', '-1', '1.2', '1e1', ' 10 ', '9007199254740992', '777']) {
    query(view, value); assert.equal(field(view, 'Selected source ID'), '50');
    assert.equal(view.getByRole('alert').textContent, 'Enter a positive source sample ID present in this trace.');
  }
  query(view, '5'); assert.equal(field(view, 'Selected source ID'), '5');
  assert.equal(field(view, 'Parent source ID'), 'None (-1 in source)');
  assert.equal((view.getByRole('button', { name: 'Next source row' }) as HTMLButtonElement).disabled, true);
  assert.equal((view.getByRole('button', { name: 'Inspect parent' }) as HTMLButtonElement).disabled, true);
  assert.ok(view.getByText('No samples declare this ID as their parent.'));
});

test('child pages retain source row order without changing the selected original root ID', async () => {
  const asset = await local(['100 1 0 0 0 1 -1', ...Array.from({ length: 21 }, (_, i) => `${1000 + i} 2 ${i + 1} 0 0 1 100`)].join('\n'));
  const view = render(createElement(TraceSampleExplorer, { atlas: asset.atlas, localTrace: asset, viewerReady: false, onFocusSample: () => false }));
  assert.equal(view.getAllByRole('button', { name: /Inspect child sample/ }).length, 20);
  assert.equal(view.queryByRole('button', { name: 'Inspect child sample 1020' }), null);
  assert.ok(view.getByText('Showing 1 to 20 of 21, in source row order.'));
  fireEvent.click(view.getByRole('button', { name: 'Next children' }));
  assert.equal(field(view, 'Selected source ID'), '100');
  assert.equal(view.getAllByRole('button', { name: /Inspect child sample/ }).length, 1);
  assert.ok(view.getByText('Showing 21 to 21 of 21, in source row order.'));
  fireEvent.click(view.getByRole('button', { name: 'Inspect child sample 1020' }));
  assert.equal(field(view, 'Selected source ID'), '1020'); assert.equal(field(view, 'Source row'), '22 of 22');
  fireEvent.click(view.getByRole('button', { name: 'Inspect parent' }));
  assert.ok(view.getByText('Showing 1 to 20 of 21, in source row order.'));
  assert.equal(field(view, 'Selected source ID'), '100');
});

test('focus is unavailable without a ready viewer and reports absence of retained extent safely', async () => {
  const asset = await local(fixture); const calls: number[] = [];
  const props = { atlas: asset.atlas, localTrace: asset, viewerReady: false, onFocusSample: (id: number) => { calls.push(id); return false; } };
  const view = render(createElement(TraceSampleExplorer, props));
  fireEvent.click(view.getByRole('button', { name: 'Focus incident links' })); assert.equal(calls.length, 0);
  query(view, '5'); view.rerender(createElement(TraceSampleExplorer, { ...props, viewerReady: true }));
  fireEvent.click(view.getByRole('button', { name: 'Focus incident links' }));
  assert.deepEqual(calls, [5]); assert.ok(view.getByText('No visible retained incident links have a focusable extent.'));
  view.rerender(createElement(TraceSampleExplorer, { ...props, viewerReady: true, onFocusSample: (id) => { calls.push(id); return true; } }));
  query(view, '50'); fireEvent.click(view.getByRole('button', { name: 'Focus incident links' }));
  assert.deepEqual(calls, [5, 50]); assert.ok(view.getByText('Framed the retained incident links.'));
});
