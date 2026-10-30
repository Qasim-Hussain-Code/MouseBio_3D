/** Simulated component state and local source reads, without WebGL rendering evidence. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, afterEach, beforeEach, test } from 'node:test';
import { Window } from 'happy-dom';
import type { Atlas } from '../src/domain/types';

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
const { SourcePolylineExplorer } = await import('../src/components/SourcePolylineExplorer');
const originalFetch = globalThis.fetch, originalConsoleError = console.error;
let errors: unknown[][] = [];
const nerveAtlas = JSON.parse(await readFile(new URL('../public/atlas-nerve/atlas.json', import.meta.url), 'utf8')) as Atlas;
const nerveBytes = await readFile(new URL('../public/atlas-nerve/mousemapper-patch0-lines.json', import.meta.url));
const nerveOriginal = JSON.parse(nerveBytes.toString()) as { points: number[][]; paths: number[][] };
const vascularAtlas = JSON.parse(await readFile(new URL('../public/atlas-vascular/atlas.json', import.meta.url), 'utf8')) as Atlas;

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
type View = ReturnType<typeof render>;
function field(view: View, label: string): string | null {
  return view.getByText(label, { selector: 'dt' }).nextElementSibling?.textContent ?? null;
}
function query(view: View, value: string) {
  fireEvent.change(view.getByRole('textbox', { name: 'Source path ID' }), { target: { value } });
  fireEvent.click(view.getByRole('button', { name: 'Inspect path' }));
}
function pointRows(view: View): (string | null)[][] {
  return Array.from(view.getByRole('table').querySelectorAll('tbody tr'), (row) =>
    Array.from(row.querySelectorAll('td'), (cell) => cell.textContent));
}
function originalPoints(path: number, offset: number, count: number): string[][] {
  return nerveOriginal.paths[path].slice(offset, offset + count).map((index) =>
    [String(index), ...nerveOriginal.points[index].map(String)]);
}
async function openNerve(view: View) {
  fireEvent.click(view.getByRole('button', { name: 'Inspect source paths' }));
  await waitFor(() => assert.equal(field(view, 'Source polyline index'), '0'), { timeout: 20000 });
}

test('nerve inspection makes one explicit local read and pages unchanged source point indices and coordinates', async () => {
  const atlas = structuredClone(nerveAtlas), requests: string[] = [];
  globalThis.fetch = (async (url, options) => {
    requests.push(String(url)); assert.equal(options?.credentials, 'same-origin'); assert.equal(options?.redirect, 'error');
    assert.equal(options?.body, undefined); return new Response(nerveBytes);
  }) as typeof fetch;
  const view = render(createElement(SourcePolylineExplorer, { atlas, viewerReady: false, onFocusPath: () => false }));
  assert.deepEqual(requests, []); assert.equal(view.queryByRole('textbox', { name: 'Source path ID' }), null);
  await openNerve(view);
  assert.deepEqual(requests, ['/atlas-nerve/mousemapper-patch0-lines.json']);
  assert.equal(view.queryByRole('button', { name: 'Inspect source paths' }), null);
  assert.equal(field(view, 'Source path row'), '1 of 84'); assert.equal(field(view, 'Path points'), '38');
  assert.equal(field(view, 'Consecutive segments'), '37');
  assert.equal(pointRows(view).length, 20); assert.deepEqual(pointRows(view), originalPoints(0, 0, 20));
  assert.ok(view.getByText('Showing 1 to 20 of 38. Coordinates use unknown source units.'));
  assert.equal((view.getByRole('button', { name: 'Previous points' }) as HTMLButtonElement).disabled, true);
  fireEvent.click(view.getByRole('button', { name: 'Next points' }));
  assert.equal(field(view, 'Source polyline index'), '0'); assert.equal(pointRows(view).length, 18);
  assert.deepEqual(pointRows(view), originalPoints(0, 20, 20));
  assert.ok(view.getByText('Showing 21 to 38 of 38. Coordinates use unknown source units.'));
  assert.equal((view.getByRole('button', { name: 'Next points' }) as HTMLButtonElement).disabled, true);
  fireEvent.click(view.getByRole('button', { name: 'Previous points' }));
  assert.deepEqual(pointRows(view), originalPoints(0, 0, 20));
  assert.deepEqual(requests, ['/atlas-nerve/mousemapper-patch0-lines.json']);
});

test('source path IDs include zero and the last row while invalid IDs retain selection and focus uses row identity', async () => {
  const atlas = structuredClone(nerveAtlas), calls: number[] = [];
  globalThis.fetch = (async () => new Response(nerveBytes)) as typeof fetch;
  const props = { atlas, viewerReady: false, onFocusPath: (row: number) => { calls.push(row); return row === 0; } };
  const view = render(createElement(SourcePolylineExplorer, props)); await openNerve(view);
  assert.equal((view.getByRole('button', { name: 'Focus source path' }) as HTMLButtonElement).disabled, true);
  fireEvent.click(view.getByRole('button', { name: 'Focus source path' })); assert.deepEqual(calls, []);
  view.rerender(createElement(SourcePolylineExplorer, { ...props, viewerReady: true }));
  query(view, '0'); fireEvent.click(view.getByRole('button', { name: 'Focus source path' }));
  assert.deepEqual(calls, [0]); assert.ok(view.getByText('Framed the retained source path.'));
  query(view, '83'); assert.equal(field(view, 'Source polyline index'), '83'); assert.equal(field(view, 'Source path row'), '84 of 84');
  assert.deepEqual(pointRows(view), originalPoints(83, 0, 20));
  assert.equal((view.getByRole('button', { name: 'Next path' }) as HTMLButtonElement).disabled, true);
  fireEvent.click(view.getByRole('button', { name: 'Focus source path' })); assert.deepEqual(calls, [0, 83]);
  assert.ok(view.getByText('This source path has no visible retained segments with a focusable extent.'));
  for (const value of ['', '-1', '1.2', '1e1', ' 0 ', '9007199254740992', '84']) {
    query(view, value); assert.equal(field(view, 'Source polyline index'), '83');
    assert.equal(field(view, 'Source path row'), '84 of 84');
    assert.equal(view.getByRole('alert').textContent, 'Enter a nonnegative source path ID present in this graph.');
  }
  fireEvent.click(view.getByRole('button', { name: 'Previous path' }));
  assert.equal(field(view, 'Source polyline index'), '82'); assert.equal(view.queryByRole('alert'), null);
  query(view, '0'); assert.equal((view.getByRole('button', { name: 'Previous path' }) as HTMLButtonElement).disabled, true);
});

test('actual vascular inspection retains original endpoint connectivity and incident path navigation with declared-only units', async () => {
  const atlas = structuredClone(vascularAtlas), requests: string[] = [];
  const bytes = await readFile(new URL('../public/atlas-vascular/schmid2021-mvn1-lines.json', import.meta.url));
  globalThis.fetch = (async (url, options) => {
    requests.push(String(url)); assert.equal(options?.credentials, 'same-origin'); assert.equal(options?.redirect, 'error');
    assert.equal(options?.body, undefined); return new Response(bytes);
  }) as typeof fetch;
  const view = render(createElement(SourcePolylineExplorer, { atlas, viewerReady: false, onFocusPath: () => false }));
  assert.deepEqual(requests, []); fireEvent.click(view.getByRole('button', { name: 'Inspect source paths' }));
  await waitFor(() => assert.equal(field(view, 'Original edge ID'), '0'), { timeout: 20000 });
  assert.deepEqual(requests, ['/atlas-vascular/schmid2021-mvn1-lines.json']);
  assert.equal(field(view, 'Source path row'), '1 of 12071');
  assert.ok(view.getByText(/Coordinates use source-declared micrometres without independent calibration/));
  const endpoints = Array.from(view.container.querySelectorAll('.polyline-endpoint button'), (button) => button.textContent);
  assert.deepEqual(endpoints, ['Inspect endpoint 6555', 'Inspect endpoint 6670']);
  fireEvent.click(view.getByRole('button', { name: 'Inspect endpoint 6555' }));
  assert.ok(view.getByRole('heading', { name: 'Original vertex 6555' }));
  assert.ok(view.getByRole('button', { name: 'Inspect incident path 0' }));
  fireEvent.click(view.getByRole('button', { name: 'Next path' })); assert.equal(field(view, 'Original edge ID'), '1');
  fireEvent.click(view.getByRole('button', { name: 'Inspect incident path 0' }));
  assert.equal(field(view, 'Original edge ID'), '0'); assert.equal(field(view, 'Source path row'), '1 of 12071');
  fireEvent.click(view.getByRole('button', { name: 'Inspect endpoint 6670' }));
  assert.ok(view.getByRole('heading', { name: 'Original vertex 6670' }));
  assert.ok(view.getByRole('button', { name: 'Inspect incident path 0' }));
  assert.deepEqual(requests, ['/atlas-vascular/schmid2021-mvn1-lines.json']);
});

test('failed and checksum-mismatched reads expose fixed errors and allow an independently verified retry', async () => {
  const atlas = structuredClone(nerveAtlas); let attempts = 0;
  const altered = Buffer.from(nerveBytes); altered[100] ^= 1;
  globalThis.fetch = (async () => {
    attempts++; if (attempts === 1) throw new Error('PRIVATE_SYNTHETIC_MARKER');
    return new Response(attempts === 2 ? altered : nerveBytes);
  }) as typeof fetch;
  const view = render(createElement(SourcePolylineExplorer, { atlas, viewerReady: false, onFocusPath: () => false }));
  for (let failure = 0; failure < 2; failure++) {
    fireEvent.click(view.getByRole('button', { name: 'Inspect source paths' }));
    await view.findByRole('alert');
    assert.equal(view.getByRole('alert').textContent, 'The source paths could not be read or verified. Try again.');
    assert.equal(view.container.textContent?.includes('PRIVATE_SYNTHETIC_MARKER'), false);
    assert.equal(view.queryByRole('textbox', { name: 'Source path ID' }), null);
    assert.equal(attempts, failure + 1);
  }
  await openNerve(view); assert.equal(attempts, 3); assert.equal(view.queryByRole('alert'), null);
  assert.deepEqual(pointRows(view), originalPoints(0, 0, 20));
});

test('manifest replacement and unmount abort pending reads without accepting stale source records', async () => {
  const resolvers: ((response: Response) => void)[] = [], signals: AbortSignal[] = [];
  globalThis.fetch = ((_: RequestInfo | URL, options?: RequestInit) => {
    signals.push(options!.signal!); return new Promise<Response>((resolve) => resolvers.push(resolve));
  }) as typeof fetch;
  const first = structuredClone(nerveAtlas), second = structuredClone(nerveAtlas);
  const props = { atlas: first, viewerReady: false, onFocusPath: () => false };
  const view = render(createElement(SourcePolylineExplorer, props));
  fireEvent.click(view.getByRole('button', { name: 'Inspect source paths' }));
  assert.equal(resolvers.length, 1); assert.equal(signals[0].aborted, false);
  view.rerender(createElement(SourcePolylineExplorer, { ...props, atlas: second })); assert.equal(signals[0].aborted, true);
  fireEvent.click(view.getByRole('button', { name: 'Inspect source paths' }));
  assert.equal(resolvers.length, 2); assert.equal(signals[1].aborted, false);
  await act(async () => { resolvers[0](new Response(nerveBytes)); await Promise.resolve(); });
  assert.equal(view.queryByRole('textbox', { name: 'Source path ID' }), null);
  view.unmount(); assert.equal(signals[1].aborted, true);
  await act(async () => { resolvers[1](new Response(nerveBytes)); await Promise.resolve(); });
  assert.equal(view.container.textContent, '');
});
