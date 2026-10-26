/**
 * DOM integration with the real App and the real viewer's WebGL failure path.
 * These tests establish UI state and local data workflows, not rendered WebGL
 * geometry, camera controls, animation playback, or visual appearance.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, afterEach, beforeEach, test } from 'node:test';
import { Window } from 'happy-dom';
import type { Atlas } from '../src/domain/types';
import type { ViewStateDocument } from '../src/domain/view-state';

const dom = new Window({ url: 'http://localhost:5173' });
const globals = {
  window: dom, document: dom.document, navigator: dom.navigator,
  HTMLElement: dom.HTMLElement, HTMLInputElement: dom.HTMLInputElement,
  HTMLTextAreaElement: dom.HTMLTextAreaElement, HTMLCanvasElement: dom.HTMLCanvasElement,
  HTMLAnchorElement: dom.HTMLAnchorElement, Node: dom.Node, Event: dom.Event,
  MouseEvent: dom.MouseEvent, KeyboardEvent: dom.KeyboardEvent,
  MutationObserver: dom.MutationObserver, getComputedStyle: dom.getComputedStyle.bind(dom),
  IS_REACT_ACT_ENVIRONMENT: true,
};
const previousDescriptors = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries(globals)) {
  previousDescriptors.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
  Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
// A DOM emulator does not implement WebGL. Exercise the actual failure fallback.
Object.defineProperty(dom.HTMLCanvasElement.prototype, 'getContext', { configurable: true, value: () => null });

// React DOM must detect the document only after the DOM globals exist.
const { createElement } = await import('react');
const { act, cleanup, fireEvent, render, waitFor, within } = await import('@testing-library/react');
const App = (await import('../src/App')).default;
const { parseExperimentalJson } = await import('../src/domain/experimental');
const atlasText = await readFile(new URL('../public/atlas/atlas.json', import.meta.url), 'utf8');
const atlas = JSON.parse(atlasText) as Atlas;
const volumeText = await readFile(new URL('../public/atlas-volume/atlas.json', import.meta.url), 'utf8');

const originalFetch = globalThis.fetch;
const originalConsoleError = console.error;
const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;
const originalAnchorClick = dom.HTMLAnchorElement.prototype.click;
let requests: string[] = [];
let unexpectedErrors: unknown[][] = [];
let expectedWebGLFailures = 0;
let exportedBlobs: Blob[] = [];
let downloads: { name: string; url: string }[] = [];
let expectedRequests = ['/atlas/atlas.json'];

beforeEach(() => {
  requests = []; unexpectedErrors = []; expectedWebGLFailures = 0;
  exportedBlobs = []; downloads = [];
  expectedRequests = ['/atlas/atlas.json'];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    requests.push(url);
    assert.ok(['/atlas/atlas.json', '/atlas-volume/atlas.json'].includes(url), 'The tested workflow must not send research data to another endpoint.');
    return new Response(url === '/atlas/atlas.json' ? atlasText : volumeText, { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;
  console.error = (...args: unknown[]) => {
    if (typeof args[0] === 'string' && /^THREE\.WebGLRenderer: (?:THREE\.WebGLRenderer: )?Error creating WebGL context/.test(args[0])) {
      expectedWebGLFailures++;
      return;
    }
    unexpectedErrors.push(args);
    originalConsoleError(...args);
  };
  URL.createObjectURL = (blob: Blob | MediaSource) => {
    assert.ok(blob instanceof Blob);
    exportedBlobs.push(blob);
    return `blob:mousebio-dom-test-${exportedBlobs.length}`;
  };
  URL.revokeObjectURL = () => {};
  dom.HTMLAnchorElement.prototype.click = function () {
    downloads.push({ name: this.download, url: this.href });
  };
});

afterEach(async () => {
  cleanup();
  await dom.happyDOM.cancelAsync();
  globalThis.fetch = originalFetch;
  console.error = originalConsoleError;
  URL.createObjectURL = originalCreateObjectURL;
  URL.revokeObjectURL = originalRevokeObjectURL;
  dom.HTMLAnchorElement.prototype.click = originalAnchorClick;
  assert.deepEqual(unexpectedErrors, [], 'Unexpected runtime or React errors were emitted.');
  assert.ok(expectedWebGLFailures > 0, 'The real Three.js renderer must attempt and fail to create WebGL in this DOM emulator.');
  assert.deepEqual(requests, expectedRequests);
});

after(async () => {
  await dom.happyDOM.close();
  for (const [key, descriptor] of previousDescriptors) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
});

async function openApp() {
  const view = render(createElement(App));
  await view.findByRole('heading', { name: 'Explore the mouse' }, { timeout: 10_000 });
  await view.findByText(/WebGL could not start/, undefined, { timeout: 10_000 });
  await view.findByText('3D viewer unavailable');
  assert.ok(view.container.querySelector('.workspace-footer .status-failed'));
  return view;
}

function inputFile(text: string, name = 'synthetic-dom-fixture.csv', size = new TextEncoder().encode(text).byteLength) {
  return { name, size, text: async () => text };
}

function deferredInputFile(name: string) {
  let resolve!: (text: string) => void;
  const read = new Promise<string>((resolveRead) => { resolve = resolveRead; });
  return { file: { name, size: 256, text: () => read }, read, resolve };
}

async function completeRead(pending: ReturnType<typeof deferredInputFile>, text: string) {
  await act(async () => { pending.resolve(text); await pending.read; });
}

async function savedView(view: Awaited<ReturnType<typeof openApp>>): Promise<ViewStateDocument> {
  fireEvent.click(view.getByRole('button', { name: 'Save view' }));
  assert.equal(downloads.at(-1)?.name, 'mousebio-view.json');
  return JSON.parse(await exportedBlobs.at(-1)!.text()) as ViewStateDocument;
}

const syntheticCsv = [
  'structure_id,measurement,value,unit,replicate,condition,time_point',
  'digimouse:3,synthetic marker,2,AU,control-1,control,baseline',
  'digimouse:3,synthetic marker,4,AU,control-2,control,baseline',
  'digimouse:3,synthetic marker,6,AU,treated-1,treated,baseline',
  'digimouse:3,synthetic marker,10,AU,treated-2,treated,baseline',
  'digimouse:4,synthetic marker,1,AU,control-1,control,baseline',
  'digimouse:4,synthetic marker,3,AU,control-2,control,baseline',
  'digimouse:4,synthetic marker,5,AU,treated-1,treated,baseline',
  'digimouse:4,synthetic marker,7,AU,treated-2,treated,baseline',
].join('\n');

test('anatomical inventory stays usable after WebGL failure, including selection, visibility and unavailable systems', async () => {
  const view = await openApp();
  assert.equal(view.container.querySelectorAll('.structure-name').length, 17);
  assert.ok(view.getByText('17 visible regions'));
  const search = view.getByRole('searchbox', { name: 'Find a structure or ID' });
  fireEvent.keyDown(window, { key: '/' });
  assert.equal(document.activeElement, search);
  fireEvent.change(search, { target: { value: 'bladder' } });
  assert.equal(view.container.querySelectorAll('.structure-name').length, 1);
  fireEvent.click(view.getByRole('button', { name: /Bladder.*digimouse:4/ }));
  const inspector = within(view.container.querySelector('.inspector') as HTMLElement);
  assert.ok(inspector.getByRole('heading', { name: 'Bladder' }));
  const opacity = inspector.getByRole('slider', { name: /^Opacity/ }) as HTMLInputElement;
  fireEvent.change(opacity, { target: { value: '0' } });
  assert.equal(opacity.value, '0');
  assert.ok(view.getByText('16 visible regions'));
  fireEvent.change(opacity, { target: { value: '40' } });
  fireEvent.click(inspector.getByRole('button', { name: 'Hide selected structure' }));
  assert.ok(view.getByText('16 visible regions'));
  fireEvent.click(inspector.getByRole('button', { name: 'Show selected structure' }));
  assert.ok(view.getByText('17 visible regions'));
  fireEvent.change(search, { target: { value: '' } });
  fireEvent.click(view.getByRole('button', { name: 'Hide Brain' }));
  assert.ok(view.getByText('16 visible regions'));
  fireEvent.click(inspector.getByRole('button', { name: 'Isolate' }));
  assert.ok(view.getByText('1 visible regions'));
  fireEvent.click(inspector.getByRole('button', { name: 'Restore' }));
  assert.ok(view.getByText('16 visible regions'));
  assert.ok(view.getByRole('button', { name: 'Show Brain' }));
  fireEvent.click(view.getByRole('button', { name: /^Systems/ }));
  assert.equal((view.getByRole('checkbox', { name: /Arterial and venous/ }) as HTMLInputElement).disabled, true);
  assert.equal((view.getByRole('checkbox', { name: /Sensory organs/ }) as HTMLInputElement).disabled, true);
  const cardiovascular = view.getByRole('checkbox', { name: /Cardiovascular/ }) as HTMLInputElement;
  assert.equal(cardiovascular.disabled, false);
  fireEvent.click(cardiovascular);
  assert.equal(cardiovascular.checked, false);
  fireEvent.click(view.getByRole('button', { name: 'Show all' }));
  assert.equal(cardiovascular.checked, true);
});

test('four modes expose honest availability and retain pause, speed and process-control state', async () => {
  const view = await openApp();
  assert.equal(view.getByRole('button', { name: 'Anatomy' }).getAttribute('aria-pressed'), 'true');
  fireEvent.click(view.getByRole('button', { name: 'Living' }));
  assert.ok(view.getByRole('heading', { name: 'Physiology in motion' }));
  assert.ok(view.getByText('ILLUSTRATIVE MOTION · NOT A VALIDATED SIMULATION'));
  fireEvent.click(view.getByRole('button', { name: 'Pause physiology' }));
  assert.ok(view.getByRole('button', { name: 'Play physiology' }));
  const speed = view.getByRole('combobox', { name: 'Playback speed' }) as HTMLSelectElement;
  fireEvent.change(speed, { target: { value: '2' } });
  assert.equal(speed.value, '2');
  const cardiac = view.getByRole('checkbox', { name: 'Cardiac contraction' }) as HTMLInputElement;
  fireEvent.click(cardiac);
  assert.equal(cardiac.checked, false);
  assert.ok(view.getByText('Vessel circulation: no source geometry'));
  fireEvent.click(view.getByRole('button', { name: 'Experiment' }));
  assert.ok(view.getByRole('heading', { name: 'Map your observations' }));
  assert.ok(view.getByRole('button', { name: 'Import dataset' }));
  fireEvent.click(view.getByRole('button', { name: 'Compare' }));
  assert.ok(view.getByRole('heading', { name: 'Compare experimental states' }));
  assert.equal(view.getAllByText(/WebGL could not start/).length, 2);
  assert.ok(view.getByText(/Both panels use the same male reference geometry/));
  assert.equal(view.container.querySelector('.quantitative-legend'), null);
  fireEvent.click(view.getByRole('button', { name: 'Living' }));
  assert.ok(view.getByRole('button', { name: 'Play physiology' }));
  assert.equal((view.getByRole('combobox', { name: 'Playback speed' }) as HTMLSelectElement).value, '2');
  assert.equal((view.getByRole('checkbox', { name: 'Cardiac contraction' }) as HTMLInputElement).checked, false);
  assert.ok(view.getByRole('combobox', { name: 'Section axis' }));
});

test('local imports drive means and common comparison legends, preserve accepted data on rejection, and export reproducibly', async () => {
  const view = await openApp();
  fireEvent.click(view.getByRole('button', { name: 'Experiment' }));
  const file = view.getByLabelText('Import experimental dataset');
  fireEvent.change(file, { target: { files: [inputFile(syntheticCsv)] } });
  await view.findByText('Accepted 8 measurements. No data transmitted.');
  assert.ok(view.getByText('8 observations · 4 biological subject IDs · 4 groups'));
  const inspector = view.container.querySelector('.inspector') as HTMLElement;
  const cards = [...inspector.querySelectorAll('.measurement-card')];
  assert.equal(cards.length, 2);
  assert.deepEqual(cards.map((card) => card.querySelector('strong')!.textContent?.trim()), ['3 AU', '8 AU']);
  assert.ok(cards.every((card) => card.textContent?.includes('n = 2')));
  assert.deepEqual([...view.container.querySelectorAll('.legend-numbers span')].map((span) => span.textContent), ['2', '3']);
  fireEvent.click(view.getByRole('button', { name: 'Compare' }));
  assert.deepEqual([...view.container.querySelectorAll('.legend-numbers span')].map((span) => span.textContent), ['2', '8']);
  assert.equal(view.container.querySelector('.comparison-result strong')?.textContent, '5 AU');
  const conditionB = view.getByRole('combobox', { name: 'Condition B' });
  fireEvent.change(conditionB, { target: { value: 'control' } });
  assert.ok(view.getByText('Choose two distinct experimental conditions.'));
  fireEvent.change(conditionB, { target: { value: 'treated' } });
  fireEvent.change(view.getByRole('combobox', { name: 'Condition A' }), { target: { value: 'treated' } });
  fireEvent.change(conditionB, { target: { value: 'control' } });
  assert.equal(view.container.querySelector('.comparison-result strong')?.textContent, '-5 AU');

  const invalid = syntheticCsv.replace('digimouse:3', 'missing:anatomy');
  fireEvent.change(view.getByLabelText('Import experimental dataset'), { target: { files: [inputFile(invalid, 'invalid.csv')] } });
  await view.findByText('Import rejected. Existing observations are retained.');
  assert.ok(view.getByText('8 observations · 4 biological subject IDs · 4 groups'));
  assert.equal(view.container.querySelector('.comparison-result strong')?.textContent, '-5 AU');
  fireEvent.click(view.getByRole('button', { name: 'Export JSON' }));
  assert.equal(downloads.at(-1)?.name, 'mousebio-dataset.json');
  const exported = await exportedBlobs.at(-1)!.text();
  const reimported = parseExperimentalJson(exported, atlas.structures);
  assert.equal(reimported.ok, true);
  assert.equal(reimported.rows.length, 8);
  assert.equal(reimported.metadata?.title, 'synthetic-dom-fixture.csv');

  fireEvent.click(view.getByRole('button', { name: 'Clear local data' }));
  assert.ok(view.getByText('Connect measurements to anatomy'));
  assert.equal(view.container.querySelector('.quantitative-legend'), null);
  assert.equal(view.container.querySelectorAll('.measurement-card').length, 0);
});

test('saved views restore complete display settings, retain private observations and reject incompatible files atomically', async () => {
  const view = await openApp();
  fireEvent.click(view.getByRole('button', { name: 'Experiment' }));
  fireEvent.change(view.getByLabelText('Import experimental dataset'), { target: { files: [inputFile(syntheticCsv)] } });
  await view.findByText('Accepted 8 measurements. No data transmitted.');
  fireEvent.click(view.getByRole('button', { name: /Bladder.*digimouse:4/ }));
  fireEvent.click(view.getByRole('button', { name: 'Hide Brain' }));
  fireEvent.change(view.getByRole('slider', { name: /^Opacity/ }), { target: { value: '37' } });
  fireEvent.change(view.getByRole('combobox', { name: 'Section axis' }), { target: { value: 'z' } });
  fireEvent.change(view.getByRole('slider', { name: 'Section position' }), { target: { value: '67' } });
  fireEvent.click(view.getByRole('button', { name: 'Toggle selected structure label' }));
  fireEvent.click(view.getByRole('button', { name: 'Living' }));
  fireEvent.click(view.getByRole('button', { name: 'Pause physiology' }));
  fireEvent.change(view.getByRole('combobox', { name: 'Playback speed' }), { target: { value: '2' } });
  fireEvent.click(view.getByRole('checkbox', { name: 'Respiratory motion' }));

  const saved = await savedView(view);
  assert.equal(saved.atlasId, atlas.id);
  assert.equal(saved.assetSha256, atlas.statistics.glbSha256);
  assert.equal(saved.coordinateFrameId, atlas.coordinateFrame.id);
  assert.equal(saved.selected, 'digimouse:4');
  assert.deepEqual(saved.hidden, ['digimouse:2']);
  assert.equal(saved.opacity['digimouse:1'], 0.1);
  assert.equal(saved.opacity['digimouse:4'], 0.37);
  assert.equal(saved.opacity['digimouse:3'], 1);
  assert.equal(Object.keys(saved.opacity).length, 17);
  assert.deepEqual(saved.living, { playing: false, speed: 2, cardiac: true, respiratory: false });
  for (const researchField of ['measurements', 'rows', 'dataset']) assert.equal(Object.hasOwn(saved, researchField), false);
  assert.equal(JSON.stringify(saved).includes('synthetic marker'), false);

  fireEvent.click(view.getByRole('button', { name: 'Show all' }));
  fireEvent.click(view.getByRole('button', { name: /Heart.*digimouse:3/ }));
  fireEvent.change(view.getByRole('combobox', { name: 'Section axis' }), { target: { value: 'off' } });
  fireEvent.click(view.getByRole('button', { name: 'Toggle selected structure label' }));
  fireEvent.click(view.getByRole('button', { name: 'Anatomy' }));
  const restoreInput = view.getByLabelText('Restore view state');
  const toRestore: ViewStateDocument = { ...saved, living: { ...saved.living, speed: 1.125 } };
  fireEvent.change(restoreInput, { target: { files: [inputFile(JSON.stringify(toRestore), 'saved-view.json')] } });
  await view.findByText('View settings restored.');
  assert.ok(view.getByRole('heading', { name: 'Physiology in motion' }));
  assert.ok(within(view.container.querySelector('.inspector') as HTMLElement).getByRole('heading', { name: 'Bladder' }));
  assert.ok(view.getByRole('button', { name: 'Show Brain' }));
  assert.equal((view.getByRole('slider', { name: /^Opacity/ }) as HTMLInputElement).value, '37');
  assert.equal((view.getByRole('combobox', { name: 'Section axis' }) as HTMLSelectElement).value, 'z');
  assert.equal((view.getByRole('slider', { name: 'Section position' }) as HTMLInputElement).value, '67');
  assert.equal(view.getByRole('button', { name: 'Toggle selected structure label' }).getAttribute('aria-pressed'), 'false');
  assert.ok(view.getByRole('button', { name: 'Play physiology' }));
  assert.equal((view.getByRole('combobox', { name: 'Playback speed' }) as HTMLSelectElement).value, '1.125');
  assert.equal((view.getByRole('checkbox', { name: 'Respiratory motion' }) as HTMLInputElement).checked, false);
  assert.deepEqual(await savedView(view), toRestore);

  const wrongHash = { ...toRestore, assetSha256: 'f'.repeat(64), mode: 'anatomical', selected: 'digimouse:12', hidden: [], labels: true };
  fireEvent.change(restoreInput, { target: { files: [inputFile(JSON.stringify(wrongHash), 'wrong-source-view.json')] } });
  await view.findByRole('alert');
  assert.match(view.getByRole('alert').textContent ?? '', /asset checksum does not match/);
  assert.deepEqual(await savedView(view), toRestore);
  let oversizedRead = false;
  fireEvent.change(restoreInput, { target: { files: [{ name: 'oversized-view.json', size: 1024 * 1024 + 1, text: async () => { oversizedRead = true; return '{}'; } }] } });
  assert.match(view.getByRole('alert').textContent ?? '', /must not exceed 1 MiB/);
  assert.equal(oversizedRead, false);
  assert.deepEqual(await savedView(view), toRestore);

  fireEvent.click(view.getByRole('button', { name: 'Experiment' }));
  assert.ok(view.getByText('8 observations · 4 biological subject IDs · 4 groups'));
  assert.ok(view.getByText('synthetic-dom-fixture.csv'));
  assert.deepEqual([...view.container.querySelectorAll('.measurement-card strong')].map((element) => element.textContent?.trim()), ['2 AU', '6 AU']);
});

test('a newer dataset import wins out-of-order reads and clearing observations cancels pending reads', async () => {
  const view = await openApp();
  fireEvent.click(view.getByRole('button', { name: 'Experiment' }));
  const input = view.getByLabelText('Import experimental dataset');
  const older = deferredInputFile('older.csv');
  fireEvent.change(input, { target: { files: [older.file] } });
  const newerCsv = syntheticCsv.replaceAll('synthetic marker', 'newer synthetic marker');
  fireEvent.change(input, { target: { files: [inputFile(newerCsv, 'newer.csv')] } });
  await view.findByText('Accepted 8 measurements. No data transmitted.');
  assert.ok(view.getByText('newer.csv'));
  await completeRead(older, syntheticCsv);
  assert.ok(view.getByText('newer.csv'));
  assert.equal(view.queryByText('older.csv'), null);
  assert.ok((view.getByRole('combobox', { name: 'Measurement series' }) as HTMLSelectElement).value.includes('newer synthetic marker'));

  const pending = deferredInputFile('cancelled.csv');
  fireEvent.change(input, { target: { files: [pending.file] } });
  fireEvent.click(view.getByRole('button', { name: 'Clear local data' }));
  assert.ok(view.getByText('Connect measurements to anatomy'));
  await completeRead(pending, syntheticCsv);
  assert.ok(view.getByText('Connect measurements to anatomy'));
  assert.equal(view.queryByText('cancelled.csv'), null);
  assert.equal(view.container.querySelector('.quantitative-legend'), null);
  assert.equal((view.getByRole('button', { name: 'Export JSON' }) as HTMLButtonElement).disabled, true);
});

test('view restoration honors the latest file attempt when earlier reads finish late', async () => {
  const view = await openApp();
  const baseline = await savedView(view);
  const olderDocument: ViewStateDocument = { ...baseline, mode: 'living', selected: 'digimouse:4', labels: false };
  const newerDocument: ViewStateDocument = { ...baseline, mode: 'anatomical', selected: 'digimouse:12', clipAxis: 'y', clipPosition: 22 };
  const input = view.getByLabelText('Restore view state');
  const older = deferredInputFile('older-view.json');
  fireEvent.change(input, { target: { files: [older.file] } });
  fireEvent.change(input, { target: { files: [inputFile(JSON.stringify(newerDocument), 'newer-view.json')] } });
  await view.findByText('View settings restored.');
  assert.deepEqual(await savedView(view), newerDocument);
  await completeRead(older, JSON.stringify(olderDocument));
  assert.deepEqual(await savedView(view), newerDocument);

  const superseded = deferredInputFile('superseded-view.json');
  fireEvent.change(input, { target: { files: [superseded.file] } });
  fireEvent.change(input, { target: { files: [inputFile(JSON.stringify({ ...olderDocument, assetSha256: 'f'.repeat(64) }), 'incompatible-latest-view.json')] } });
  await view.findByRole('alert');
  await completeRead(superseded, JSON.stringify(olderDocument));
  assert.match(view.getByRole('alert').textContent ?? '', /asset checksum does not match/);
  assert.deepEqual(await savedView(view), newerDocument);
});

test('declared dataset provenance and synthetic origin persist across comparison and local JSON round trips', async () => {
  const view = await openApp();
  fireEvent.click(view.getByRole('button', { name: 'Experiment' }));
  fireEvent.change(view.getByLabelText('Import experimental dataset'), { target: { files: [inputFile(syntheticCsv)] } });
  await view.findByText('Accepted 8 measurements. No data transmitted.');
  assert.ok(view.getByText('Source reference not supplied.'));
  fireEvent.click(view.getByText('Dataset provenance and notes'));
  const metadata = {
    title: 'Explicit synthetic provenance fixture',
    sourceReference: 'Local synthetic study MB3D-DOM-001',
    license: 'CC0-1.0 (synthetic fixture only)',
    notes: 'Two declared subjects per condition; no animal measurements.\nValues invented solely for software acceptance.',
    origin: 'synthetic-example',
  };
  fireEvent.change(view.getByLabelText('Dataset title'), { target: { value: metadata.title } });
  fireEvent.change(view.getByLabelText('Source reference'), { target: { value: metadata.sourceReference } });
  fireEvent.change(view.getByLabelText('Data license or permissions'), { target: { value: metadata.license } });
  fireEvent.change(view.getByLabelText('Sampling notes'), { target: { value: metadata.notes } });
  fireEvent.change(view.getByLabelText('Declared origin'), { target: { value: metadata.origin } });
  assert.ok(view.getByText(metadata.title));
  assert.ok(view.getByText(`Declared source: ${metadata.sourceReference}`));
  const banner = 'Synthetic example data. These values are not experimental observations.';
  assert.ok(view.getByText(banner));
  assert.ok(view.getByText(/These declarations are supplied by the user and are not independently verified/));
  assert.ok(view.getByText('8 observations · 4 biological subject IDs · 4 groups'));

  fireEvent.click(view.getByRole('button', { name: 'Compare' }));
  assert.ok(view.getByText(banner));
  assert.ok(view.getByText(`Declared source: ${metadata.sourceReference}`));
  assert.equal((view.getByLabelText('Sampling notes') as HTMLTextAreaElement).value, metadata.notes);
  assert.equal(view.container.querySelector('.comparison-result strong')?.textContent, '5 AU');
  fireEvent.click(view.getByRole('button', { name: 'Export JSON' }));
  assert.equal(downloads.at(-1)?.name, 'mousebio-dataset.json');
  const exported = await exportedBlobs.at(-1)!.text();
  const restored = parseExperimentalJson(exported, atlas.structures);
  assert.equal(restored.ok, true);
  assert.deepEqual(restored.metadata, metadata);
  assert.equal(restored.rows.length, 8);

  fireEvent.click(view.getByRole('button', { name: 'Clear local data' }));
  assert.equal(view.queryByText(banner), null);
  assert.equal(view.queryByText(`Declared source: ${metadata.sourceReference}`), null);
  fireEvent.change(view.getByLabelText('Import experimental dataset'), { target: { files: [inputFile(exported, 'reimported-provenance.json')] } });
  await view.findByText('Accepted 8 measurements. No data transmitted.');
  assert.ok(view.getByText(banner));
  assert.ok(view.getByText(metadata.title));
  assert.equal((view.getByLabelText('Dataset title') as HTMLInputElement).value, metadata.title);
  assert.equal((view.getByLabelText('Source reference') as HTMLInputElement).value, metadata.sourceReference);
  assert.equal((view.getByLabelText('Data license or permissions') as HTMLInputElement).value, metadata.license);
  assert.equal((view.getByLabelText('Sampling notes') as HTMLTextAreaElement).value, metadata.notes);
  assert.equal((view.getByLabelText('Declared origin') as HTMLSelectElement).value, metadata.origin);
  fireEvent.click(view.getByRole('button', { name: 'Experiment' }));
  assert.ok(view.getByText(banner));
  fireEvent.change(view.getByLabelText('Declared origin'), { target: { value: 'user-data' } });
  assert.equal(view.queryByText(banner), null);
});

test('ontology candidates expose limited evidence without inventing mappings or including research observations', async () => {
  const view = await openApp();
  let context = within(view.container.querySelector('.ontology-context') as HTMLElement);
  const heartTerm = context.getByRole('link', { name: /MA:0000072/ });
  assert.equal(heartTerm.getAttribute('href'), 'https://www.informatics.jax.org/vocab/gxd/ma_ontology/MA%3A0000072');
  assert.ok(context.getByText('Proposed · computational inference'));
  assert.ok(context.getByText(/A related term proposed from the source label/));
  assert.ok(context.getByText(/No expert review is claimed/));

  fireEvent.click(view.getByRole('button', { name: /Body envelope \/ residual tissue.*digimouse:1/ }));
  assert.ok(view.getByText('No candidate association'));
  assert.equal(view.container.querySelector('.ontology-context'), null);
  assert.equal(view.queryByRole('link', { name: /MA:0000072/ }), null);

  fireEvent.click(view.getByRole('button', { name: /Kidney, region 7.*digimouse:7/ }));
  const kidneySection = view.container.querySelector('.ontology-context') as HTMLElement;
  context = within(kidneySection);
  const kidneyTerm = context.getByRole('link', { name: /MA:0000368/ });
  assert.match(kidneyTerm.textContent ?? '', /kidney/);
  assert.equal(kidneyTerm.getAttribute('href'), 'https://www.informatics.jax.org/vocab/gxd/ma_ontology/MA%3A0000368');
  assert.ok(context.getByText(/A related term proposed from the source label/));
  assert.doesNotMatch(kidneySection.textContent ?? '', /\b(?:left|right) kidney\b/i);

  fireEvent.click(view.getByRole('button', { name: 'Experiment' }));
  fireEvent.change(view.getByLabelText('Import experimental dataset'), { target: { files: [inputFile(syntheticCsv)] } });
  await view.findByText('Accepted 8 measurements. No data transmitted.');
  fireEvent.click(view.getByRole('button', { name: /Heart.*digimouse:3/ }));
  context = within(view.container.querySelector('.ontology-context') as HTMLElement);
  fireEvent.click(context.getByText('Evidence and limitations'));
  assert.ok(context.getByText('No chamber, valve, vessel or exact boundary mapping is established.'));
  fireEvent.click(context.getByRole('button', { name: 'Download candidate registry' }));
  assert.equal(downloads.at(-1)?.name, 'ontology-candidates.json');
  const text = await exportedBlobs.at(-1)!.text();
  const registry = JSON.parse(text);
  const checkedInRegistry = JSON.parse(await readFile(new URL('../data/ontology-candidates.json', import.meta.url), 'utf8'));
  assert.deepEqual(registry, checkedInRegistry);
  assert.equal(registry.status, 'proposed-label-based-associations');
  assert.equal(registry.expertReviewed, false);
  assert.equal(registry.candidates.length, 13);
  assert.equal(registry.unmapped.length, 4);
  for (const researchField of ['measurements', 'rows', 'dataset']) assert.equal(Object.hasOwn(registry, researchField), false);
  assert.equal(text.includes('synthetic marker'), false);
  assert.ok(view.getByText('8 observations · 4 biological subject IDs · 4 groups'));
});

test('viewer background follows every mode, restores saved white and defaults legacy files to dark without changing observations', async () => {
  const view = await openApp();
  const assertBackground = (expected: 'dark' | 'white', expectedCanvasCount = 1) => {
    assert.equal(view.getByRole('region', { name: 'Anatomical viewer' }).getAttribute('data-background'), expected);
    const choices = within(view.getByRole('group', { name: 'Viewer background' }));
    assert.equal(choices.getByRole('button', { name: 'Dark background' }).getAttribute('aria-pressed'), String(expected === 'dark'));
    assert.equal(choices.getByRole('button', { name: 'White background' }).getAttribute('aria-pressed'), String(expected === 'white'));
    const canvases = [...view.container.querySelectorAll('.viewer-canvas')];
    assert.equal(canvases.length, expectedCanvasCount);
    assert.ok(canvases.every((canvas) => canvas.getAttribute('data-background') === expected));
  };
  assertBackground('dark');
  fireEvent.click(view.getByRole('button', { name: 'Experiment' }));
  fireEvent.change(view.getByLabelText('Import experimental dataset'), { target: { files: [inputFile(syntheticCsv)] } });
  await view.findByText('Accepted 8 measurements. No data transmitted.');
  fireEvent.click(view.getByRole('button', { name: /Bladder.*digimouse:4/ }));
  fireEvent.click(view.getByRole('button', { name: 'Hide Brain' }));
  fireEvent.change(view.getByRole('slider', { name: /^Opacity/ }), { target: { value: '37' } });
  const before = await savedView(view);
  assert.equal(before.background, 'dark');
  fireEvent.click(view.getByRole('button', { name: 'White background' }));
  assertBackground('white');
  const white = await savedView(view);
  assert.deepEqual({ ...white, background: 'dark' }, before);
  for (const mode of ['Living', 'Compare', 'Anatomy', 'Experiment']) {
    fireEvent.click(view.getByRole('button', { name: mode }));
    assertBackground('white', mode === 'Compare' ? 2 : 1);
  }
  assert.ok(view.getByText('8 observations · 4 biological subject IDs · 4 groups'));
  assert.deepEqual([...view.container.querySelectorAll('.measurement-card strong')].map((element) => element.textContent?.trim()), ['2 AU', '6 AU']);
  assert.deepEqual(await savedView(view), white);

  fireEvent.click(view.getByRole('button', { name: 'Dark background' }));
  assertBackground('dark');
  const input = view.getByLabelText('Restore view state');
  fireEvent.change(input, { target: { files: [inputFile(JSON.stringify(white), 'white-view.json')] } });
  await waitFor(() => assertBackground('white'));
  assert.deepEqual(await savedView(view), white);
  const legacy: Partial<ViewStateDocument> = { ...white };
  delete legacy.background;
  fireEvent.change(input, { target: { files: [inputFile(JSON.stringify(legacy), 'legacy-view.json')] } });
  await waitFor(() => assertBackground('dark'));
  assert.deepEqual(await savedView(view), { ...white, background: 'dark' });
  assert.ok(view.getByText('8 observations · 4 biological subject IDs · 4 groups'));
  assert.ok(view.getByRole('button', { name: 'Show Brain' }));
});

test('organs visibility preset preserves selection, background and data while the details shortcut focuses its inspector', async () => {
  const view = await openApp();
  fireEvent.click(view.getByRole('button', { name: 'Experiment' }));
  fireEvent.change(view.getByLabelText('Import experimental dataset'), { target: { files: [inputFile(syntheticCsv)] } });
  await view.findByText('Accepted 8 measurements. No data transmitted.');
  fireEvent.click(view.getByRole('button', { name: /Kidney, region 7.*digimouse:7/ }));
  fireEvent.change(view.getByRole('slider', { name: /^Opacity/ }), { target: { value: '20' } });
  fireEvent.click(view.getByRole('button', { name: 'Isolate' }));
  fireEvent.click(view.getByRole('button', { name: 'White background' }));
  fireEvent.change(view.getByRole('combobox', { name: 'Section axis' }), { target: { value: 'x' } });
  fireEvent.change(view.getByRole('slider', { name: 'Section position' }), { target: { value: '61' } });
  const before = await savedView(view);
  fireEvent.click(view.getByRole('button', { name: 'Export JSON' }));
  const observationsBefore = JSON.parse(await exportedBlobs.at(-1)!.text());

  fireEvent.click(view.getByRole('button', { name: 'Organs visibility preset' }));
  const expectedOpacity = Object.fromEntries(atlas.structures.map((structure) => [structure.id,
    structure.id === 'digimouse:1' ? 0.06 : structure.id === 'digimouse:13' ? 0.14 : 1]));
  assert.deepEqual(await savedView(view), { ...before, hidden: [], opacity: expectedOpacity });
  assert.ok(view.getByRole('button', { name: 'Isolate' }));
  assert.ok(view.getByText('17 visible regions'));
  assert.ok(view.getByText('8 observations · 4 biological subject IDs · 4 groups'));
  fireEvent.click(view.getByRole('button', { name: 'Export JSON' }));
  assert.deepEqual(JSON.parse(await exportedBlobs.at(-1)!.text()), observationsBefore);
  const shortcut = view.getByRole('button', { name: 'Structure details: Kidney, region 7' });
  assert.equal(shortcut.getAttribute('aria-controls'), 'structure-inspector');
  fireEvent.click(shortcut);
  assert.equal(document.activeElement, view.container.querySelector('#structure-inspector'));
  fireEvent.click(view.getByRole('button', { name: 'Show all' }));
  const shown = await savedView(view);
  assert.equal(shown.opacity['digimouse:1'], 0.1);
  assert.equal(shown.opacity['digimouse:13'], 1);
  assert.equal(shown.selected, 'digimouse:7');
  assert.equal(shown.background, 'white');
});

test('switching references isolates observations and restores each source-bound dataset', async () => {
  const view = await openApp();
  fireEvent.click(view.getByRole('button', { name: 'Experiment' }));
  fireEvent.change(view.getByLabelText('Import experimental dataset'), { target: { files: [inputFile(syntheticCsv)] } });
  await view.findByText('Accepted 8 measurements. No data transmitted.');
  fireEvent.click(view.getByRole('button', { name: 'White background' }));
  expectedRequests.push('/atlas-volume/atlas.json');
  fireEvent.change(view.getByRole('combobox', { name: 'Anatomy reference' }), { target: { value: 'digimouse-volume-040-v1' } });
  await view.findByText('21 visible regions');
  assert.equal(view.queryByText('8 observations · 4 biological subject IDs · 4 groups'), null);
  assert.ok(view.getByRole('checkbox', { name: 'Finer selected surface' }));
  fireEvent.click(view.getByRole('checkbox', { name: 'Finer selected surface' }));
  assert.equal((view.getByRole('checkbox', { name: 'Finer selected surface' }) as HTMLInputElement).checked, true);
  fireEvent.click(view.getByRole('button', { name: 'Compare' }));
  const compareDetailControl = view.getByRole('checkbox', { name: 'Finer selected surface' }) as HTMLInputElement;
  assert.equal(compareDetailControl.checked, false); assert.equal(compareDetailControl.disabled, true);
  assert.ok(view.getByText('Compare uses the same base surfaces in both panels.'));
  fireEvent.click(view.getByRole('button', { name: 'Experiment' }));
  const volumeView = await savedView(view);
  assert.equal(volumeView.atlasId, 'digimouse-volume-040-v1');
  assert.equal(volumeView.selected, 'digimouse-volume:9');
  assert.equal(volumeView.background, 'white');
  assert.equal(volumeView.opacity['digimouse-volume:1'], 0.06);
  assert.equal(volumeView.opacity['digimouse-volume:2'], 0.14);
  fireEvent.change(view.getByLabelText('Import experimental dataset'), { target: { files: [inputFile(syntheticCsv)] } });
  await view.findByText('Import rejected. Existing observations are retained.');
  const volumeCsv = syntheticCsv.replaceAll('digimouse:3', 'digimouse-volume:9').replaceAll('digimouse:4', 'digimouse-volume:13');
  fireEvent.change(view.getByLabelText('Import experimental dataset'), { target: { files: [inputFile(volumeCsv)] } });
  await view.findByText('Accepted 8 measurements. No data transmitted.');
  fireEvent.click(view.getByRole('button', { name: 'Export JSON' }));
  const volumeData = JSON.parse(await exportedBlobs.at(-1)!.text());
  assert.ok(volumeData.measurements.every((row: { structureId: string }) => row.structureId.startsWith('digimouse-volume:')));
  expectedRequests.push('/atlas/atlas.json');
  fireEvent.change(view.getByRole('combobox', { name: 'Anatomy reference' }), { target: { value: atlas.id } });
  await view.findByText('17 visible regions');
  await view.findByText('8 observations · 4 biological subject IDs · 4 groups');
  fireEvent.click(view.getByRole('button', { name: 'Export JSON' }));
  assert.ok(JSON.parse(await exportedBlobs.at(-1)!.text()).measurements.every((row: { structureId: string }) => row.structureId.startsWith('digimouse:')));
  expectedRequests.push('/atlas-volume/atlas.json');
  fireEvent.change(view.getByRole('combobox', { name: 'Anatomy reference' }), { target: { value: 'digimouse-volume-040-v1' } });
  await view.findByText('21 visible regions');
  fireEvent.click(view.getByRole('button', { name: 'Export JSON' }));
  assert.deepEqual(JSON.parse(await exportedBlobs.at(-1)!.text()), volumeData);
  fireEvent.click(view.getByRole('button', { name: /Skeleton.*digimouse-volume:2/ }));
  assert.equal(view.queryByRole('checkbox', { name: 'Finer selected surface' }), null);
  assert.ok(view.getByText('No finer surface is bundled for this region.'));
  fireEvent.click(view.getByRole('button', { name: 'Clear local data' }));
  expectedRequests.push('/atlas/atlas.json');
  fireEvent.change(view.getByRole('combobox', { name: 'Anatomy reference' }), { target: { value: atlas.id } });
  await view.findByText('17 visible regions');
  assert.ok(view.getByText('8 observations · 4 biological subject IDs · 4 groups'));
  expectedRequests.push('/atlas-volume/atlas.json');
  fireEvent.change(view.getByRole('combobox', { name: 'Anatomy reference' }), { target: { value: 'digimouse-volume-040-v1' } });
  await view.findByText('21 visible regions');
  assert.ok((view.getByRole('button', { name: 'Export JSON' }) as HTMLButtonElement).disabled);
});

test('a failed reference switch leaves anatomy, view and observations intact', async () => {
  const view = await openApp();
  fireEvent.click(view.getByRole('button', { name: 'Experiment' }));
  fireEvent.change(view.getByLabelText('Import experimental dataset'), { target: { files: [inputFile(syntheticCsv)] } });
  await view.findByText('Accepted 8 measurements. No data transmitted.');
  const before = await savedView(view);
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    requests.push(String(input));
    return new Response(atlasText, { status: 200 });
  }) as typeof fetch;
  expectedRequests.push('/atlas-volume/atlas.json');
  fireEvent.change(view.getByRole('combobox', { name: 'Anatomy reference' }), { target: { value: 'digimouse-volume-040-v1' } });
  await view.findByRole('alert');
  assert.equal((view.getByRole('combobox', { name: 'Anatomy reference' }) as HTMLSelectElement).value, atlas.id);
  assert.deepEqual(await savedView(view), before);
  assert.ok(view.getByText('8 observations · 4 biological subject IDs · 4 groups'));
});

test('a file read started in another reference cannot replace observations after switching', async () => {
  const view = await openApp();
  fireEvent.click(view.getByRole('button', { name: 'Experiment' }));
  const pending = deferredInputFile('pending.csv');
  fireEvent.change(view.getByLabelText('Import experimental dataset'), { target: { files: [pending.file] } });
  expectedRequests.push('/atlas-volume/atlas.json');
  fireEvent.change(view.getByRole('combobox', { name: 'Anatomy reference' }), { target: { value: 'digimouse-volume-040-v1' } });
  await view.findByText('21 visible regions');
  await completeRead(pending, syntheticCsv);
  assert.equal(view.queryByText('Accepted 8 measurements. No data transmitted.'), null);
  assert.ok((view.getByRole('button', { name: 'Export JSON' }) as HTMLButtonElement).disabled);
});

test('reads started during a delayed reference switch are canceled when the new reference commits', async () => {
  const view = await openApp();
  fireEvent.click(view.getByRole('button', { name: 'Experiment' }));
  const priorView = await savedView(view);
  let resolveReference!: (response: Response) => void;
  const response = new Promise<Response>((resolve) => { resolveReference = resolve; });
  globalThis.fetch = (async (input: RequestInfo | URL) => { requests.push(String(input)); return response; }) as typeof fetch;
  expectedRequests.push('/atlas-volume/atlas.json');
  fireEvent.change(view.getByRole('combobox', { name: 'Anatomy reference' }), { target: { value: 'digimouse-volume-040-v1' } });
  const pendingData = deferredInputFile('pending.csv');
  const pendingView = deferredInputFile('pending-view.json');
  fireEvent.change(view.getByLabelText('Import experimental dataset'), { target: { files: [pendingData.file] } });
  fireEvent.change(view.getByLabelText('Restore view state'), { target: { files: [pendingView.file] } });
  await act(async () => { resolveReference(new Response(volumeText, { status: 200 })); await response; });
  await view.findByText('21 visible regions');
  await completeRead(pendingData, syntheticCsv);
  await completeRead(pendingView, JSON.stringify({ ...priorView, background: 'white' }));
  assert.ok((view.getByRole('button', { name: 'Export JSON' }) as HTMLButtonElement).disabled);
  assert.equal((await savedView(view)).atlasId, 'digimouse-volume-040-v1');
  assert.equal((await savedView(view)).background, 'dark');
});
