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
const hindlimbText = await readFile(new URL('../public/atlas-hindlimb/atlas.json', import.meta.url), 'utf8');
const ema147Text = await readFile(new URL('../public/atlas-ema147/atlas.json', import.meta.url), 'utf8');
const neuronText = await readFile(new URL('../public/atlas-neuron/atlas.json', import.meta.url), 'utf8');
const nerveText = await readFile(new URL('../public/atlas-nerve/atlas.json', import.meta.url), 'utf8');
const vascularText = await readFile(new URL('../public/atlas-vascular/atlas.json', import.meta.url), 'utf8');
const microctText = await readFile(new URL('../public/atlas-microct/atlas.json', import.meta.url), 'utf8');
const livingText = await readFile(new URL('../public/atlas-living/atlas.json', import.meta.url), 'utf8');
const nervePaths = await readFile(new URL('../public/atlas-nerve/mousemapper-patch0-lines.json', import.meta.url));
const neuronSamples = await readFile(new URL('../public/atlas-neuron/nmo130632-standardized.swc.txt', import.meta.url));

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
  window.history.replaceState(null, '', '/?reference=digimouse-tessellated-v1');
  requests = []; unexpectedErrors = []; expectedWebGLFailures = 0;
  exportedBlobs = []; downloads = [];
  expectedRequests = ['/atlas/atlas.json'];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    requests.push(url);
    assert.ok(['/atlas/atlas.json', '/atlas-volume/atlas.json', '/atlas-hindlimb/atlas.json', '/atlas-ema147/atlas.json', '/atlas-neuron/atlas.json', '/atlas-neuron/nmo130632-standardized.swc.txt', '/atlas-nerve/atlas.json', '/atlas-vascular/atlas.json', '/atlas-nerve/mousemapper-patch0-lines.json', '/atlas-microct/atlas.json', '/atlas-living/atlas.json'].includes(url), 'The tested workflow must not send research data to another endpoint.');
    if (url === '/atlas-nerve/mousemapper-patch0-lines.json') return new Response(nervePaths);
    if (url === '/atlas-neuron/nmo130632-standardized.swc.txt') return new Response(neuronSamples);
    if (url === '/atlas-vascular/atlas.json') return new Response(vascularText);
    if (url === '/atlas-nerve/atlas.json') return new Response(nerveText);
    if (url === '/atlas-microct/atlas.json') return new Response(microctText);
    if (url === '/atlas-living/atlas.json') return new Response(livingText);
    return new Response(url === '/atlas/atlas.json' ? atlasText : url === '/atlas-volume/atlas.json' ? volumeText : url === '/atlas-hindlimb/atlas.json' ? hindlimbText : url === '/atlas-neuron/atlas.json' ? neuronText : ema147Text, { status: 200, headers: { 'Content-Type': 'application/json' } });
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

test('a named place opens beside the mouse, declares itself a display, and closes again', async () => {
  window.history.replaceState(null, '', '/');
  expectedRequests = ['/atlas-living/atlas.json'];
  const view = render(createElement(App));
  await view.findByRole('heading', { name: 'Explore the mouse' }, { timeout: 10_000 });
  await view.findByText(/WebGL could not start/, undefined, { timeout: 10_000 });
  showTab(view, 'Layers');
  // Zooming opens the mouse; a named place is the secondary way, in the panel only.
  const start = view.getAllByRole('button', { name: /Open a named place/ });
  assert.equal(start.length, 1);
  assert.match(start[0].textContent ?? '', /Zooming opens the mouse where you point/);
  fireEvent.click(start[0]);
  const panel = await view.findByRole('region', { name: 'All layers together' });
  assert.equal((within(panel).getByRole('slider', { name: 'How far the layers are open' }) as HTMLInputElement).value, '100');
  assert.equal(within(panel).getByRole('button', { name: 'Whole side' }).getAttribute('aria-pressed'), 'true');
  assert.ok(within(panel).getByText(/not a dissection of an animal/));
  for (const place of ['Head', 'Neck', 'Chest', 'Abdomen', 'Hip', 'Shoulder', 'Fore limb', 'Thigh', 'Shank']) assert.ok(within(panel).getByRole('button', { name: place }), place);
  fireEvent.click(within(panel).getByRole('button', { name: 'Thigh' }));
  assert.equal(within(panel).getByRole('button', { name: 'Thigh' }).getAttribute('aria-pressed'), 'true');
  fireEvent.click(within(panel).getByRole('checkbox', { name: 'Fold the skin back' }));
  assert.equal((within(panel).getByRole('checkbox', { name: 'Fold the skin back' }) as HTMLInputElement).checked, true);
  assert.equal(view.queryAllByRole('button', { name: /Open a named place/ }).length, 0);
  fireEvent.click(within(panel).getByRole('button', { name: 'Close' }));
  assert.equal(view.queryByRole('region', { name: 'All layers together' }), null);
  assert.equal(view.getAllByRole('button', { name: /Open a named place/ }).length, 1);
});

test('the living mouse names its motion as illustrative where it can be seen, and it can be paused and turned off', async () => {
  window.history.replaceState(null, '', '/');
  expectedRequests = ['/atlas-living/atlas.json'];
  const view = render(createElement(App));
  await view.findByRole('heading', { name: 'Explore the mouse' }, { timeout: 10_000 });
  await view.findByText(/WebGL could not start/, undefined, { timeout: 10_000 });
  const badge = view.getByRole('group', { name: 'Illustrative motion' });
  assert.match(badge.textContent ?? '', /^Illustrative motion/);
  assert.match(badge.getAttribute('title') ?? '', /not a simulation of physiology/);
  fireEvent.click(view.getByRole('button', { name: 'Living' }));
  assert.equal(view.queryByText('No physiological motion is available for this reference.'), null);
  // One step further, what the rates come from and what was chosen for viewing.
  assert.ok(view.getByText('About this motion'));
  assert.ok(view.getByText(/^Illustrative motion, not a simulation of physiology/));
  assert.ok(view.getByText('Heart 600/min, breathing 240/min; shown at 1/10 of real rate, as 60/min and 24/min'));
  assert.ok(view.getByRole('link', { name: 'doi:10.1002/9780470942390.mo100159' }));
  assert.ok(view.getByRole('link', { name: 'doi:10.1098/rstb.2011.0156' }));
  assert.ok(view.getByText(/far larger than cells and far slower/));
  fireEvent.change(view.getByRole('combobox', { name: 'Share of real rate shown' }), { target: { value: '0.5' } });
  assert.ok(view.getByText('Heart 600/min, breathing 240/min; shown at 1/2 of real rate, as 300/min and 120/min'));
  const blood = view.getByRole('checkbox', { name: 'Blood' }) as HTMLInputElement;
  assert.equal(blood.checked, true);
  fireEvent.click(blood);
  assert.equal(blood.checked, false);
  fireEvent.click(within(badge).getByRole('button', { name: 'Walk' }));
  assert.equal(within(badge).getByRole('button', { name: 'Stand' }).getAttribute('aria-pressed'), 'true');
  fireEvent.click(within(badge).getByRole('button', { name: 'Stand' }));
  fireEvent.click(within(badge).getByRole('button', { name: 'Pause' }));
  assert.ok(within(badge).getByRole('button', { name: 'Play' }));
  const motion = view.getByRole('checkbox', { name: 'Motion' }) as HTMLInputElement;
  fireEvent.click(motion);
  assert.equal(motion.checked, false);
  assert.equal(view.queryByRole('group', { name: 'Illustrative motion' }), null, 'nothing moves, so nothing is named');
  assert.equal((view.getByRole('checkbox', { name: 'Heart' }) as HTMLInputElement).disabled, true);
  fireEvent.click(motion);
  assert.ok(view.getByRole('group', { name: 'Illustrative motion' }));
});

test('the living mouse opens first and marks the evidence of every structure', async () => {
  window.history.replaceState(null, '', '/');
  expectedRequests = ['/atlas-living/atlas.json'];
  const view = render(createElement(App));
  await view.findByRole('heading', { name: 'Explore the mouse' }, { timeout: 10_000 });
  await view.findByText(/WebGL could not start/, undefined, { timeout: 10_000 });
  assert.equal(requests[0], '/atlas-living/atlas.json');
  assert.ok(view.getAllByText('Simulated').length > 10);
  assert.ok(view.getAllByText('Traced').length >= 3);
  assert.ok(view.getAllByText('Traced, division estimated').length > 10);
  assert.ok(view.getAllByText('Source label').length > 5);
  assert.ok(view.getAllByText('Source label, division estimated').length > 5);
  assert.ok(view.getByText(/CONSTRUCTED MODEL: POSTURE, COAT AND STRUCTURES MARKED SIMULATED ARE NOT MEASURED/));
  assert.equal((view.getByRole('combobox', { name: 'Simulated coat' }) as HTMLSelectElement).value, 'agouti');
  assert.ok(view.getByText(/Constructed model/));
  assert.ok(view.getAllByText(/\d+ structures/).length >= 1);
  showTab(view, 'Layers');
  const simulated = view.getByRole('checkbox', { name: 'Simulated structures' }) as HTMLInputElement;
  assert.equal(simulated.checked, true);
  fireEvent.click(simulated);
  assert.equal(simulated.checked, false);
  // The coat is simulated, so it goes and returns with its class.
  assert.equal((view.getByRole('combobox', { name: 'Simulated coat' }) as HTMLSelectElement).value, 'none');
  const saved = await savedView(view);
  assert.ok(saved.hidden.includes('living:aorta'));
  assert.ok(!saved.hidden.includes('living:heart-lv'));
  fireEvent.click(view.getByRole('checkbox', { name: 'Simulated structures' }));
  assert.equal((view.getByRole('combobox', { name: 'Simulated coat' }) as HTMLSelectElement).value, 'agouti');
  // A step of the stack is highlighted, and a section can be opened and is closed by the next step.
  fireEvent.click(view.getByRole('button', { name: /^Skeleton/ }));
  assert.equal(view.getByRole('button', { name: /^Skeleton/ }).getAttribute('aria-pressed'), 'true');
  fireEvent.click(view.getByRole('button', { name: 'Cut through the body' }));
  assert.equal((view.getByRole('combobox', { name: 'Section axis' }) as HTMLSelectElement).value, 'y');
  fireEvent.click(view.getByRole('button', { name: /^Coat/ }));
  assert.equal((view.getByRole('combobox', { name: 'Section axis' }) as HTMLSelectElement).value, 'off');
});

test('specimen and citation UI uses declared metadata rather than a hardcoded Digimouse description', async () => {
  // Metadata-only software fixture. This does not represent a female geometry import.
  const fixture = structuredClone(atlas);
  fixture.specimen = { scientificName: 'Mus musculus', taxonomyId: 'NCBITaxon:10090', sex: 'female',
    strain: 'Synthetic metadata strain', age: { value: 117, unit: 'days' }, mass: { value: 24.9, unit: 'g' },
    scope: 'synthetic metadata coverage', count: 1, description: 'Synthetic specimen declaration for interface testing.',
    sourceReference: 'synthetic-metadata-fixture' };
  fixture.source.displayName = 'Synthetic declared reference';
  fixture.source.citationLabel = 'Synthetic declared citation';
  fixture.source.title = 'Synthetic declared source title';
  fixture.source.doi = 'not a DOI'; fixture.source.url = 'javascript:alert(1)';
  globalThis.fetch = (async (input: RequestInfo | URL) => { requests.push(String(input)); return new Response(JSON.stringify(fixture)); }) as typeof fetch;
  const view = await openApp();
  assert.ok(view.getByText('Mus musculus · female · 24.9 g'));
  assert.equal(view.queryByText('Mus musculus · male · 28 g'), null);
  assert.ok(view.getByText('Synthetic declared citation'));
  assert.equal(view.queryByRole('link', { name: /View publication/ }), null);
  fireEvent.click(view.getByRole('button', { name: 'Methods, sources and limitations' }));
  const methods = within(view.getByRole('dialog'));
  assert.ok(methods.getByText('Synthetic metadata strain'));
  assert.ok(methods.getByText('117 days'));
  assert.ok(methods.getByText('24.9 g'));
  assert.equal(methods.queryByText(/28 g male/), null);
});

test('missing specimen attributes are shown as unknown in the interface', async () => {
  const fixture = structuredClone(atlas);
  delete fixture.specimen;
  globalThis.fetch = (async (input: RequestInfo | URL) => { requests.push(String(input)); return new Response(JSON.stringify(fixture)); }) as typeof fetch;
  const view = await openApp();
  assert.ok(view.getByText('Unknown · Unknown · Unknown'));
  fireEvent.click(view.getByRole('button', { name: 'Methods, sources and limitations' }));
  const methods = view.getByRole('dialog');
  assert.ok([...methods.querySelectorAll('dd')].every((item) => item.textContent === 'Unknown'));
});

test('native gland sampling is explicit and resets on region selection and saved view loading', async () => {
  const view = await openApp(); expectedRequests.push('/atlas-volume/atlas.json');
  fireEvent.change(view.getByRole('combobox', { name: 'Anatomy reference' }), { target: { value: 'digimouse-volume-040-v1' } });
  await view.findByText('21 visible regions');
  fireEvent.click(view.getByRole('button', { name: /Lachrymal.*digimouse-volume:12/i }));
  const baseView = await savedView(view);
  const level = view.getByRole('combobox', { name: 'Selected surface processing level' }) as HTMLSelectElement;
  assert.equal(level.options.length, 2);
  assert.equal(level.value, 'fine-020');
  fireEvent.change(level, { target: { value: 'source-010' } });
  assert.ok(view.getByText('Finer selected surface (0.1 mm)'));
  fireEvent.click(view.getByRole('checkbox', { name: 'Finer selected surface' }));
  assert.equal((view.getByRole('checkbox', { name: 'Finer selected surface' }) as HTMLInputElement).checked, true);
  fireEvent.click(view.getByRole('button', { name: 'Compare' }));
  assert.equal((view.getByRole('combobox', { name: 'Selected surface processing level' }) as HTMLSelectElement).disabled, true);
  assert.equal((view.getByRole('checkbox', { name: 'Finer selected surface' }) as HTMLInputElement).checked, false);
  fireEvent.click(view.getByRole('button', { name: 'Anatomy' }));
  fireEvent.change(view.getByLabelText('Restore view state'), { target: { files: [inputFile(JSON.stringify(baseView), 'base-view.json')] } });
  await waitFor(() => assert.equal((view.getByRole('combobox', { name: 'Selected surface processing level' }) as HTMLSelectElement).value, 'fine-020'));
  assert.equal((view.getByRole('checkbox', { name: 'Finer selected surface' }) as HTMLInputElement).checked, false);
  fireEvent.change(view.getByRole('combobox', { name: 'Selected surface processing level' }), { target: { value: 'source-010' } });
  fireEvent.click(view.getByRole('button', { name: /Heart.*digimouse-volume:9/ }));
  assert.equal(view.queryByRole('combobox', { name: 'Selected surface processing level' }), null);
  assert.ok(view.getByText('Finer selected surface (0.2 mm)'));
});

test('regional female hindlimb uses its own anatomy, source groups, observations and unavailable physiology', async () => {
  const view = await openApp();
  fireEvent.click(view.getByRole('button', { name: 'Experiment' }));
  fireEvent.change(view.getByLabelText('Import experimental dataset'), { target: { files: [inputFile(syntheticCsv)] } });
  await view.findByText('Accepted 8 measurements. No data transmitted.');
  expectedRequests.push('/atlas-hindlimb/atlas.json');
  fireEvent.change(view.getByRole('combobox', { name: 'Anatomy reference' }), { target: { value: 'charles2016-hindlimb-v1' } });
  await view.findByText('44 visible regions');
  assert.ok(view.getByText(/Mus musculus · female · 24\.9 g/));
  assert.equal(view.queryByText('8 observations · 4 biological subject IDs · 4 groups'), null);
  assert.equal(view.queryByRole('button', { name: 'Organs visibility preset' }), null);
  assert.ok(view.getByText('No finer surface is bundled for this region.'));
  assert.ok(view.getAllByText('charles2016-hindlimb:0').length > 0);
  showTab(view, 'Layers');
  fireEvent.change(view.getByRole('combobox', { name: 'Source anatomy group' }), { target: { value: 'bones' } });
  assert.ok(view.getByText('6 visible regions'));
  fireEvent.change(view.getByRole('combobox', { name: 'Source anatomy group' }), { target: { value: 'muscles' } });
  assert.ok(view.getByText('37 visible regions'));
  fireEvent.click(view.getByRole('button', { name: 'Show all' }));
  fireEvent.click(view.getByRole('button', { name: 'Living' }));
  assert.ok(view.getByText('No physiological motion is available for this reference.'));
  assert.equal(view.queryByLabelText('Pause physiology'), null);
  fireEvent.click(view.getByRole('button', { name: 'Experiment' }));
  const hindlimbCsv = syntheticCsv.replaceAll('digimouse:3', 'charles2016-hindlimb:0').replaceAll('digimouse:4', 'charles2016-hindlimb:1');
  fireEvent.change(view.getByLabelText('Import experimental dataset'), { target: { files: [inputFile(hindlimbCsv)] } });
  await view.findByText('Accepted 8 measurements. No data transmitted.');
  fireEvent.click(view.getByRole('button', { name: 'Export JSON' }));
  const imported = JSON.parse(await exportedBlobs.at(-1)!.text());
  assert.ok(imported.measurements.every((row: { structureId: string }) => row.structureId.startsWith('charles2016-hindlimb:')));
  expectedRequests.push('/atlas/atlas.json');
  fireEvent.change(view.getByRole('combobox', { name: 'Anatomy reference' }), { target: { value: atlas.id } });
  await view.findByText('17 visible regions');
  assert.ok(view.getByText('8 observations · 4 biological subject IDs · 4 groups'));
  assert.equal((await savedView(view)).background, 'white');
  expectedRequests.push('/atlas-hindlimb/atlas.json');
  fireEvent.change(view.getByRole('combobox', { name: 'Anatomy reference' }), { target: { value: 'charles2016-hindlimb-v1' } });
  await view.findByText('44 visible regions');
  fireEvent.click(view.getByRole('button', { name: 'Export JSON' }));
  assert.deepEqual(JSON.parse(await exportedBlobs.at(-1)!.text()), imported);
});

test('EMA147 retains unknown units, conflicting age estimates and source-bound observations across reference switches', async () => {
  const view = await openApp(); expectedRequests.push('/atlas-ema147/atlas.json');
  fireEvent.change(view.getByRole('combobox', { name: 'Anatomy reference' }), { target: { value: 'ema147-native-v1' } });
  await view.findByText('77 visible regions');
  assert.ok(view.getByText(/^Native source coordinates/));
  assert.ok(view.getByText('TS23'));
  showTab(view, 'Source evidence');
  assert.ok(view.getByRole('link', { name: 'E15.0 (estimated)' }));
  assert.ok(view.getByRole('link', { name: '14.5 dpc' }));
  assert.ok(view.getByText('Unknown · Unknown · Unknown'));
  showTab(view, 'Layers');
  assert.ok(view.getByText(/^No system classifications are assigned to this source/));
  assert.ok(view.getByText(/77 source regions have no system classification/));
  fireEvent.change(view.getByRole('combobox', { name: 'Source anatomy group' }), { target: { value: 'vessels' } });
  assert.ok(view.getByText('3 visible regions'));
  const nativeView = await savedView(view);
  assert.equal(nativeView.assetSha256, JSON.parse(ema147Text).statistics.assetSha256);
  assert.equal(nativeView.coordinateFrameId, 'emouseatlas-ema147-stl-native-v1');
  fireEvent.click(view.getByRole('button', { name: 'Living' }));
  assert.ok(view.getByText('No physiological motion is available for this reference.'));
  fireEvent.click(view.getByRole('button', { name: 'Experiment' }));
  const nativeCsv = syntheticCsv.replaceAll('digimouse:3', 'ema147:EMAPA:16098').replaceAll('digimouse:4', 'ema147:EMAPA:16105');
  fireEvent.change(view.getByLabelText('Import experimental dataset'), { target: { files: [inputFile(nativeCsv)] } });
  await view.findByText('Accepted 8 measurements. No data transmitted.');
  fireEvent.click(view.getByRole('button', { name: 'Export JSON' }));
  const local = JSON.parse(await exportedBlobs.at(-1)!.text());
  assert.ok(local.measurements.every((row: { structureId: string }) => row.structureId.startsWith('ema147:EMAPA:')));
  expectedRequests.push('/atlas/atlas.json');
  fireEvent.change(view.getByRole('combobox', { name: 'Anatomy reference' }), { target: { value: atlas.id } });
  await view.findByText('17 visible regions');
  assert.equal(view.queryByText('8 observations · 4 biological subject IDs · 4 groups'), null);
  fireEvent.change(view.getByLabelText('Restore view state'), { target: { files: [inputFile(JSON.stringify(nativeView), 'native-view.json')] } });
  await view.findByRole('alert');
  assert.equal((await savedView(view)).atlasId, atlas.id);
  expectedRequests.push('/atlas-ema147/atlas.json');
  fireEvent.change(view.getByRole('combobox', { name: 'Anatomy reference' }), { target: { value: 'ema147-native-v1' } });
  await view.findByText('77 visible regions');
  fireEvent.click(view.getByRole('button', { name: 'Export JSON' }));
  assert.deepEqual(JSON.parse(await exportedBlobs.at(-1)!.text()), local);
});

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

/** Navigator tabs: Structures, Layers, Sources. Inspector tabs: Structure, Observations, Source evidence. */
function showTab(view: Awaited<ReturnType<typeof openApp>>, name: string) {
  fireEvent.click(view.getByRole('tab', { name }));
}

/** The selection toolbar uses a 0 to 1 display opacity scale. */
function selectionOpacity(view: Awaited<ReturnType<typeof openApp>>) {
  return view.getByRole('slider', { name: 'Display opacity of selected structure or source record' }) as HTMLInputElement;
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
  const opacity = selectionOpacity(view);
  fireEvent.change(opacity, { target: { value: '0' } });
  assert.equal(opacity.value, '0');
  assert.ok(view.getByText('16 visible regions'));
  fireEvent.change(opacity, { target: { value: '0.4' } });
  fireEvent.click(view.getByRole('button', { name: 'Hide selected structure or source record' }));
  assert.ok(view.getByText('16 visible regions'));
  fireEvent.click(view.getByRole('button', { name: 'Show selected structure or source record' }));
  assert.ok(view.getByText('17 visible regions'));
  fireEvent.change(search, { target: { value: '' } });
  fireEvent.click(view.getByRole('button', { name: 'Hide Brain' }));
  assert.ok(view.getByText('16 visible regions'));
  fireEvent.click(view.getByRole('button', { name: 'Isolate selected structure or source record' }));
  assert.ok(view.getByText('1 visible region'));
  fireEvent.click(view.getByRole('button', { name: 'Restore other structures or source records' }));
  assert.ok(view.getByText('16 visible regions'));
  assert.ok(view.getByRole('button', { name: 'Show Brain' }));
  showTab(view, 'Layers');
  // Unrepresented categories are listed without a control rather than offered as empty layers.
  assert.equal(view.queryByRole('checkbox', { name: /Arterial and venous/ }), null);
  assert.equal(view.queryByRole('checkbox', { name: /Sensory organs/ }), null);
  const missing = within(view.container.querySelector('.system-layers-missing') as HTMLElement);
  assert.ok(missing.getByText('Arterial and venous'));
  assert.ok(missing.getByText('Sensory organs'));
  const cardiovascular = view.getByRole('checkbox', { name: 'Cardiovascular visibility' }) as HTMLInputElement;
  assert.equal(cardiovascular.checked, true);
  fireEvent.click(cardiovascular);
  assert.equal(cardiovascular.checked, false);
  fireEvent.click(view.getByRole('button', { name: 'Show all' }));
  assert.equal(cardiovascular.checked, true);
});

test('four modes expose honest availability and retain pause, speed and process-control state', async () => {
  const view = await openApp();
  assert.equal(view.getByRole('button', { name: 'Anatomy' }).getAttribute('aria-pressed'), 'true');
  fireEvent.click(view.getByRole('button', { name: 'Living' }));
  assert.ok(view.getByRole('heading', { name: 'Physiology workspace' }));
  assert.ok(view.getByText('ILLUSTRATIVE MOTION · NOT A VALIDATED SIMULATION'));
  fireEvent.click(view.getByRole('button', { name: 'Pause physiology' }));
  assert.ok(view.getByRole('button', { name: 'Play physiology' }));
  const speed = view.getByRole('combobox', { name: 'Playback speed' }) as HTMLSelectElement;
  fireEvent.change(speed, { target: { value: '2' } });
  assert.equal(speed.value, '2');
  const cardiac = view.getByRole('checkbox', { name: 'Cardiac contraction' }) as HTMLInputElement;
  fireEvent.click(cardiac);
  assert.equal(cardiac.checked, false);
  assert.ok(view.getByText('Schematic tracers show route order only. No blood-flow simulation is implemented for this reference'));
  fireEvent.click(view.getByRole('button', { name: 'Experiment' }));
  assert.ok(view.getByRole('heading', { name: 'Map your observations' }));
  assert.ok(view.getByRole('button', { name: 'Import dataset' }));
  fireEvent.click(view.getByRole('button', { name: 'Compare' }));
  assert.ok(view.getByRole('heading', { name: 'Compare experimental states' }));
  assert.equal(view.getAllByText(/WebGL could not start/).length, 2);
  assert.ok(view.getByText(/Both panels use the same selected reference geometry/));
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
  fireEvent.change(selectionOpacity(view), { target: { value: '0.37' } });
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
  assert.equal(saved.opacity['digimouse:1'], 0.22);
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
  assert.ok(view.getByRole('heading', { name: 'Physiology workspace' }));
  assert.ok(within(view.container.querySelector('.inspector') as HTMLElement).getByRole('heading', { name: 'Bladder' }));
  assert.ok(view.getByRole('button', { name: 'Show Brain' }));
  assert.equal(selectionOpacity(view).value, '0.37');
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
  showTab(view, 'Source evidence');
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

test('the viewer keeps one white background in every mode and loads earlier dark or unspecified view files as white without changing observations', async () => {
  const view = await openApp();
  const assertWhite = (expectedCanvasCount = 1) => {
    assert.equal(view.queryByRole('group', { name: 'Viewer background' }), null);
    assert.equal(view.queryByRole('button', { name: 'Dark background' }), null);
    assert.equal(view.getByRole('region', { name: 'Anatomical viewer' }).hasAttribute('data-background'), false);
    assert.equal(view.container.querySelectorAll('.viewer-canvas').length, expectedCanvasCount);
  };
  assertWhite();
  fireEvent.click(view.getByRole('button', { name: 'Experiment' }));
  fireEvent.change(view.getByLabelText('Import experimental dataset'), { target: { files: [inputFile(syntheticCsv)] } });
  await view.findByText('Accepted 8 measurements. No data transmitted.');
  fireEvent.click(view.getByRole('button', { name: /Bladder.*digimouse:4/ }));
  fireEvent.click(view.getByRole('button', { name: 'Hide Brain' }));
  fireEvent.change(selectionOpacity(view), { target: { value: '0.37' } });
  const white = await savedView(view);
  assert.equal(white.background, 'white');
  for (const mode of ['Living', 'Compare', 'Anatomy', 'Experiment']) {
    fireEvent.click(view.getByRole('button', { name: mode }));
    assertWhite(mode === 'Compare' ? 2 : 1);
  }
  assert.ok(view.getByText('8 observations · 4 biological subject IDs · 4 groups'));
  assert.deepEqual([...view.container.querySelectorAll('.measurement-card strong')].map((element) => element.textContent?.trim()), ['2 AU', '6 AU']);
  assert.deepEqual(await savedView(view), white);

  const input = view.getByLabelText('Restore view state');
  const labelToggle = view.getByRole('button', { name: 'Toggle selected structure label' });
  const restoreAs = async (document: Record<string, unknown>, name: string) => {
    fireEvent.click(labelToggle);
    assert.equal(labelToggle.getAttribute('aria-pressed'), String(!white.labels));
    fireEvent.change(input, { target: { files: [inputFile(JSON.stringify(document), name)] } });
    await waitFor(() => assert.equal(labelToggle.getAttribute('aria-pressed'), String(white.labels)));
    assertWhite();
    assert.deepEqual(await savedView(view), white);
  };
  await restoreAs({ ...white, background: 'dark' }, 'dark-view.json');
  const legacy: Partial<ViewStateDocument> = { ...white };
  delete legacy.background;
  await restoreAs(legacy, 'legacy-view.json');
  fireEvent.change(input, { target: { files: [inputFile(JSON.stringify({ ...white, background: 'black' }), 'invalid-view.json')] } });
  await view.findByText(/View settings unchanged\. .*background must be white/);
  assert.ok(view.getByText('8 observations · 4 biological subject IDs · 4 groups'));
  assert.ok(view.getByRole('button', { name: 'Show Brain' }));
});

test('the body surface opens as opaque skin, becomes see-through for enclosed selections and data modes, and Show all restores it', async () => {
  const view = await openApp();
  const skin = () => view.getByRole('slider', { name: 'Skin opacity' }) as HTMLInputElement;
  assert.equal(skin().value, '100');
  assert.equal((await savedView(view)).opacity['digimouse:1'], 1);
  fireEvent.click(view.getByRole('button', { name: /Body envelope.*digimouse:1/ }));
  assert.equal(skin().value, '100');
  fireEvent.click(view.getByRole('button', { name: /Liver.*digimouse:12/ }));
  assert.equal(skin().value, '22');
  assert.ok(view.getByText('Skin made see-through to show the selected region.'));
  fireEvent.change(skin(), { target: { value: '0' } });
  assert.equal((await savedView(view)).opacity['digimouse:1'], 0);
  fireEvent.change(skin(), { target: { value: '100' } });
  fireEvent.click(view.getByRole('button', { name: 'Hide Body envelope / residual tissue' }));
  fireEvent.click(view.getByRole('button', { name: /Heart.*digimouse:3/ }));
  assert.equal(skin().value, '100');
  assert.ok((await savedView(view)).hidden.includes('digimouse:1'));
  fireEvent.change(skin(), { target: { value: '60' } });
  assert.equal((await savedView(view)).hidden.includes('digimouse:1'), false);
  fireEvent.click(view.getByRole('button', { name: 'Show all' }));
  assert.equal(skin().value, '100');
  fireEvent.click(view.getByRole('button', { name: 'Experiment' }));
  assert.equal(skin().value, '22');
  fireEvent.click(view.getByRole('button', { name: 'Anatomy' }));
  assert.equal(skin().value, '22');
  expectedRequests.push('/atlas-hindlimb/atlas.json');
  fireEvent.change(view.getByRole('combobox', { name: 'Anatomy reference' }), { target: { value: 'charles2016-hindlimb-v1' } });
  await view.findByText('44 visible regions');
  assert.equal(view.queryByRole('slider', { name: 'Skin opacity' }), null);
  expectedRequests.push('/atlas-volume/atlas.json');
  fireEvent.change(view.getByRole('combobox', { name: 'Anatomy reference' }), { target: { value: 'digimouse-volume-040-v1' } });
  await view.findByText('21 visible regions');
  assert.equal(skin().value, '100');
  fireEvent.click(view.getByRole('button', { name: /Kidneys.*digimouse-volume:19/ }));
  assert.equal(skin().value, '6');
});

test('the female micro-CT reference keeps its own classes, skin, groups and source-bound observations', async () => {
  const view = await openApp();
  fireEvent.click(view.getByRole('button', { name: 'Experiment' }));
  fireEvent.change(view.getByLabelText('Import experimental dataset'), { target: { files: [inputFile(syntheticCsv)] } });
  await view.findByText('Accepted 8 measurements. No data transmitted.');
  fireEvent.click(view.getByRole('button', { name: 'Anatomy' }));
  expectedRequests.push('/atlas-microct/atlas.json');
  fireEvent.change(view.getByRole('combobox', { name: 'Anatomy reference' }), { target: { value: 'rosenhain2018-m01-native-v1' } });
  await view.findByText('11 visible regions');
  assert.ok(view.getByText(/Mus musculus · female/));
  assert.equal(view.queryByText('8 observations · 4 biological subject IDs · 4 groups'), null);
  assert.equal((view.getByRole('slider', { name: 'Skin opacity' }) as HTMLInputElement).value, '8');
  assert.ok(view.getAllByText('rosenhain2018-m01:Organ1:5').length > 0);
  fireEvent.click(view.getByRole('button', { name: /Intestine.*rosenhain2018-m01:Organ1:5/ }));
  assert.equal((view.getByRole('slider', { name: 'Skin opacity' }) as HTMLInputElement).value, '8');
  showTab(view, 'Layers');
  fireEvent.change(view.getByRole('combobox', { name: 'Source anatomy group' }), { target: { value: 'digestive' } });
  assert.ok(view.getByText('3 visible regions'));
  fireEvent.click(view.getByRole('button', { name: 'Organs visibility preset' }));
  assert.ok(view.getByText('11 visible regions'));
  const saved = await savedView(view);
  assert.equal(saved.atlasId, 'rosenhain2018-m01-native-v1');
  assert.equal(saved.coordinateFrameId, 'rosenhain2018-m01-ct280-native-v1');
  assert.equal(saved.opacity['rosenhain2018-m01:Bed:1'], 0.06);
  assert.equal(saved.opacity['rosenhain2018-m01:Organ1:1'], 0.14);
  fireEvent.click(view.getByRole('button', { name: 'Experiment' }));
  const csv = syntheticCsv.replaceAll('digimouse:3', 'rosenhain2018-m01:Organ1:3').replaceAll('digimouse:4', 'rosenhain2018-m01:Organ1:6');
  fireEvent.change(view.getByLabelText('Import experimental dataset'), { target: { files: [inputFile(csv)] } });
  await view.findByText('Accepted 8 measurements. No data transmitted.');
  expectedRequests.push('/atlas/atlas.json');
  fireEvent.change(view.getByRole('combobox', { name: 'Anatomy reference' }), { target: { value: atlas.id } });
  await view.findByText('17 visible regions');
  await view.findByText('8 observations · 4 biological subject IDs · 4 groups');
});

test('the registered-volume reference offers source images on the cut face and other references do not', async () => {
  const view = await openApp();
  assert.equal(view.queryByRole('combobox', { name: 'Cut face image' }), null);
  showTab(view, 'Layers');
  assert.equal(view.queryByRole('button', { name: 'Cut through the specimen' }), null);
  expectedRequests.push('/atlas-volume/atlas.json');
  fireEvent.click(view.getByRole('button', { name: 'Open specimen photographs' }));
  await view.findByText('21 visible regions');
  await waitFor(() => assert.equal((view.getByRole('combobox', { name: 'Section axis' }) as HTMLSelectElement).value, 'y'));
  assert.equal((view.container.querySelector('.scene-display') as HTMLDetailsElement).open, true);
  assert.equal(view.queryByRole('button', { name: 'Open specimen photographs' }), null);
  const choice = () => view.getByRole('combobox', { name: 'Cut face image' }) as HTMLSelectElement;
  assert.equal(choice().value, 'cryosection');
  assert.deepEqual([...choice().options].map((option) => option.value), ['cryosection', 'ct', 'none']);
  fireEvent.click(view.getByRole('button', { name: 'Cut through the specimen' }));
  const axis = view.getByRole('combobox', { name: 'Section axis' }) as HTMLSelectElement;
  assert.equal(axis.value, 'y');
  assert.equal((view.getByRole('slider', { name: 'Section position' }) as HTMLInputElement).value, '50');
  let saved = await savedView(view);
  assert.equal(saved.clipAxis, 'y');
  assert.equal(Object.hasOwn(saved, 'sectionImage'), false);
  fireEvent.change(choice(), { target: { value: 'none' } });
  fireEvent.click(view.getByRole('button', { name: 'Cut through the specimen' }));
  assert.equal(choice().value, 'cryosection');
  // Nothing is requested in this harness, because the renderer never starts and images load only on demand.
  assert.equal(requests.some((url) => url.includes('/sections/')), false);
  fireEvent.click(view.getByRole('button', { name: 'Compare' }));
  assert.equal(choice().disabled, true);
  fireEvent.click(view.getByRole('button', { name: 'Anatomy' }));
  expectedRequests.push('/atlas/atlas.json');
  fireEvent.change(view.getByRole('combobox', { name: 'Anatomy reference' }), { target: { value: atlas.id } });
  await view.findByText('17 visible regions');
  assert.equal(view.queryByRole('combobox', { name: 'Cut face image' }), null);
  saved = await savedView(view);
  assert.equal(saved.clipAxis, 'off');
});

test('organs visibility preset preserves selection, background and data while the details shortcut focuses its inspector', async () => {
  const view = await openApp();
  fireEvent.click(view.getByRole('button', { name: 'Experiment' }));
  fireEvent.change(view.getByLabelText('Import experimental dataset'), { target: { files: [inputFile(syntheticCsv)] } });
  await view.findByText('Accepted 8 measurements. No data transmitted.');
  fireEvent.click(view.getByRole('button', { name: /Kidney, region 7.*digimouse:7/ }));
  fireEvent.change(selectionOpacity(view), { target: { value: '0.2' } });
  fireEvent.click(view.getByRole('button', { name: 'Isolate selected structure or source record' }));
  fireEvent.change(view.getByRole('combobox', { name: 'Section axis' }), { target: { value: 'x' } });
  fireEvent.change(view.getByRole('slider', { name: 'Section position' }), { target: { value: '61' } });
  const before = await savedView(view);
  fireEvent.click(view.getByRole('button', { name: 'Export JSON' }));
  const observationsBefore = JSON.parse(await exportedBlobs.at(-1)!.text());

  showTab(view, 'Layers');
  fireEvent.click(view.getByRole('button', { name: 'Organs visibility preset' }));
  const expectedOpacity = Object.fromEntries(atlas.structures.map((structure) => [structure.id,
    structure.id === 'digimouse:1' ? 0.06 : structure.id === 'digimouse:13' ? 0.14 : 1]));
  assert.deepEqual(await savedView(view), { ...before, hidden: [], opacity: expectedOpacity });
  assert.ok(view.getByRole('button', { name: 'Isolate selected structure or source record' }));
  assert.ok(view.getByText('17 visible regions'));
  assert.ok(view.getByText('8 observations · 4 biological subject IDs · 4 groups'));
  fireEvent.click(view.getByRole('button', { name: 'Export JSON' }));
  assert.deepEqual(JSON.parse(await exportedBlobs.at(-1)!.text()), observationsBefore);
  assert.equal(view.getByRole('button', { name: 'Details' }).getAttribute('aria-controls'), 'structure-inspector');
  const shortcut = view.getByRole('button', { name: 'Open details for selected structure or source record' });
  fireEvent.click(shortcut);
  assert.equal(document.activeElement, view.container.querySelector('#structure-inspector'));
  fireEvent.click(view.getByRole('button', { name: 'Show all' }));
  const shown = await savedView(view);
  assert.equal(shown.opacity['digimouse:1'], 1);
  assert.equal(shown.opacity['digimouse:13'], 1);
  assert.equal(shown.selected, 'digimouse:7');
  assert.equal(shown.background, 'white');
});

test('switching references isolates observations and restores each source-bound dataset', async () => {
  const view = await openApp();
  fireEvent.click(view.getByRole('button', { name: 'Experiment' }));
  fireEvent.change(view.getByLabelText('Import experimental dataset'), { target: { files: [inputFile(syntheticCsv)] } });
  await view.findByText('Accepted 8 measurements. No data transmitted.');
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
  assert.equal((view.getByRole('checkbox', { name: 'Finer selected surface' }) as HTMLInputElement).checked, false);
  assert.equal(view.queryAllByText('No finer surface is bundled for this region.').length, 0);
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
  assert.equal((await savedView(view)).background, 'white');
});

test('source groups isolate existing regions while retaining research data and background', async () => {
  const view = await openApp();
  fireEvent.click(view.getByRole('button', { name: 'Experiment' }));
  fireEvent.change(view.getByLabelText('Import experimental dataset'), { target: { files: [inputFile(syntheticCsv)] } });
  await view.findByText('Accepted 8 measurements. No data transmitted.');
  fireEvent.change(view.getByRole('combobox', { name: 'Section axis' }), { target: { value: 'z' } });
  showTab(view, 'Layers');
  fireEvent.change(view.getByRole('combobox', { name: 'Source anatomy group' }), { target: { value: 'brain' } });
  assert.ok(view.getByText('1 visible region'));
  const brain = await savedView(view);
  assert.equal(brain.selected, 'digimouse:2'); assert.equal(brain.clipAxis, 'off');
  assert.equal(brain.background, 'white'); assert.equal(brain.atlasId, atlas.id);
  assert.deepEqual(brain.hidden, atlas.structures.filter((region) => region.id !== 'digimouse:2').map((region) => region.id).sort());
  assert.ok(view.getByText('8 observations · 4 biological subject IDs · 4 groups'));
  fireEvent.click(view.getByRole('button', { name: 'Export JSON' }));
  const observations = JSON.parse(await exportedBlobs.at(-1)!.text());
  fireEvent.change(view.getByRole('combobox', { name: 'Source anatomy group' }), { target: { value: 'muscles' } });
  assert.ok(view.getByText('2 visible regions'));
  assert.deepEqual((await savedView(view)).hidden.filter((id) => ['digimouse:14', 'digimouse:15'].includes(id)), []);
  assert.ok((await savedView(view)).hidden.includes('digimouse:1'));
  fireEvent.click(view.getByRole('button', { name: 'Export JSON' }));
  assert.deepEqual(JSON.parse(await exportedBlobs.at(-1)!.text()), observations);
  fireEvent.click(view.getByRole('button', { name: 'Show all' }));
  assert.ok(view.getByText('17 visible regions'));
  assert.equal((view.getByRole('combobox', { name: 'Source anatomy group' }) as HTMLSelectElement).value, 'whole-mouse');
  showTab(view, 'Structures');
  fireEvent.click(view.getByRole('button', { name: 'Hide Brain' }));
  showTab(view, 'Layers');
  assert.equal((view.getByRole('combobox', { name: 'Source anatomy group' }) as HTMLSelectElement).value, '');
});

test('volume brain and head groups retain their own IDs across modes and view restoration', async () => {
  const view = await openApp(); expectedRequests.push('/atlas-volume/atlas.json');
  fireEvent.change(view.getByRole('combobox', { name: 'Anatomy reference' }), { target: { value: 'digimouse-volume-040-v1' } });
  await view.findByText('21 visible regions');
  showTab(view, 'Layers');
  fireEvent.change(view.getByRole('combobox', { name: 'Source anatomy group' }), { target: { value: 'brain' } });
  assert.ok(view.getByText('6 visible regions'));
  const brain = await savedView(view);
  const ids = ['digimouse-volume:4', 'digimouse-volume:5', 'digimouse-volume:6', 'digimouse-volume:7', 'digimouse-volume:8', 'digimouse-volume:10'];
  assert.ok(ids.every((id) => !brain.hidden.includes(id) && brain.opacity[id] === 1));
  assert.equal(brain.hidden.length, 15);
  for (const mode of ['Living', 'Compare', 'Anatomy']) {
    fireEvent.click(view.getByRole('button', { name: mode }));
    assert.ok(view.getByText('6 visible regions'));
  }
  fireEvent.change(view.getByRole('combobox', { name: 'Source anatomy group' }), { target: { value: 'head-organs' } });
  assert.ok(view.getByText('2 visible regions'));
  const head = await savedView(view);
  assert.equal(head.hidden.includes('digimouse-volume:3'), false);
  assert.equal(head.hidden.includes('digimouse-volume:12'), false);
  fireEvent.change(view.getByLabelText('Restore view state'), { target: { files: [inputFile(JSON.stringify(brain), 'brain-view.json')] } });
  await view.findByText('6 visible regions');
  assert.equal((view.getByRole('combobox', { name: 'Source anatomy group' }) as HTMLSelectElement).value, '');
  assert.equal((await savedView(view)).hidden.length, 15);
});


test('native source inspection follows selection without inferring index matches or changing the view background', async () => {
  const view = await openApp(); expectedRequests.push('/atlas-ema147/atlas.json');
  fireEvent.change(view.getByRole('combobox', { name: 'Anatomy reference' }), { target: { value: 'ema147-native-v1' } });
  await view.findByText('77 visible regions');
  fireEvent.click(view.getByRole('button', { name: /optic stalk.*ema147:EMAPA:16678/i }));
  showTab(view, 'Source evidence');
  let record = within(view.getByRole('region', { name: 'Native surface record' }));
  assert.ok(record.getByText('Surfaces/EMAPA16678_optic_stalk.stl'));
  assert.ok(record.getByText('EMAPA:16678'));
  assert.ok(record.getByText('Label 39 in source index'));
  assert.ok(record.getByText('Closed under executed numerical checks.'));
  fireEvent.click(record.getByText('Recorded topology counts'));
  assert.ok(record.getByText('Mesh components'));
  assert.ok(record.getByText('Physical mesh units are unknown. Numerical mesh checks do not establish anatomical accuracy.'));
  fireEvent.click(view.getByRole('button', { name: /midbrain ventricular layer.*ema147:EMAPA:16979/i }));
  record = within(view.getByRole('region', { name: 'Native surface record' }));
  assert.ok(record.getByText('EMAPA:16979'));
  assert.ok(record.getByText('No exact anatomy-index match'));
  assert.equal(record.queryByText('Label 39 in source index'), null);
  showTab(view, 'Layers');
  fireEvent.change(view.getByRole('combobox', { name: 'Source anatomy group' }), { target: { value: 'reference' } });
  record = within(view.getByRole('region', { name: 'Native surface record' }));
  assert.ok(record.getByText('Surfaces/reference.stl'));
  assert.ok(record.getByText('Unannotated in source filename'));
  assert.ok(record.getByText('No exact anatomy-index match'));
  assert.equal((await savedView(view)).background, 'white');
  assert.equal((await savedView(view)).selected, 'ema147:reference');
  expectedRequests.push('/atlas/atlas.json');
  fireEvent.change(view.getByRole('combobox', { name: 'Anatomy reference' }), { target: { value: atlas.id } });
  await view.findByText('17 visible regions');
  assert.equal(view.queryByRole('region', { name: 'Native surface record' }), null);
});


test('source layers preserve observations, background and saved display across faded and hidden contexts', async () => {
  const view = await openApp(); expectedRequests.push('/atlas-ema147/atlas.json');
  fireEvent.change(view.getByRole('combobox', { name: 'Anatomy reference' }), { target: { value: 'ema147-native-v1' } });
  await view.findByText('77 visible regions');
  fireEvent.click(view.getByRole('button', { name: 'Experiment' }));
  const csv = syntheticCsv.replaceAll('digimouse:3', 'ema147:EMAPA:16098').replaceAll('digimouse:4', 'ema147:EMAPA:16105');
  fireEvent.change(view.getByLabelText('Import experimental dataset'), { target: { files: [inputFile(csv)] } });
  await view.findByText('Accepted 8 measurements. No data transmitted.');
  fireEvent.click(view.getByRole('button', { name: 'Export JSON' }));
  const observations = JSON.parse(await exportedBlobs.at(-1)!.text());
  showTab(view, 'Layers');
  fireEvent.click(view.getByText('Compose source layers'));
  const controls = within(view.container.querySelector('.source-layer-controls')! as HTMLElement);
  const apply = () => fireEvent.click(controls.getByRole('button', { name: 'Apply source layers' }));
  const choose = () => { fireEvent.click(controls.getByRole('checkbox', { name: /Selected vessel-labelled surfaces/ })); fireEvent.click(controls.getByRole('checkbox', { name: /Trigeminal-labelled surfaces/ })); };
  assert.equal((controls.getByRole('button', { name: 'Apply source layers' }) as HTMLButtonElement).disabled, true);
  choose(); fireEvent.change(controls.getByRole('combobox', { name: 'Other source regions' }), { target: { value: 'faded' } }); apply();
  const faded = await savedView(view), ids = [16797, 17307, 17576, 18415, 18601].map((id) => `ema147:EMAPA:${id}`);
  assert.deepEqual(faded.hidden, []); for (const id of ids) assert.equal(faded.opacity[id], 1);
  assert.equal(faded.opacity['ema147:EMAPA:17525'], 0.15); assert.equal(faded.opacity['ema147:reference'], 0.08);
  assert.equal(faded.background, 'white'); assert.equal(faded.clipAxis, 'off');
  assert.equal((view.getByRole('combobox', { name: 'Source anatomy group' }) as HTMLSelectElement).value, '');
  fireEvent.click(view.getByRole('button', { name: 'Compare' })); assert.deepEqual((await savedView(view)).opacity, faded.opacity);
  choose(); fireEvent.change(controls.getByRole('combobox', { name: 'Other source regions' }), { target: { value: 'hidden' } }); apply();
  assert.ok(view.getByText('5 visible regions')); const hidden = await savedView(view);
  assert.equal(hidden.hidden.length, 72); assert.ok(ids.every((id) => !hidden.hidden.includes(id)));
  fireEvent.click(view.getByRole('button', { name: 'Show all' })); assert.ok(view.getByText('77 visible regions'));
  fireEvent.change(view.getByLabelText('Restore view state'), { target: { files: [inputFile(JSON.stringify(faded), 'layers-view.json')] } });
  await view.findByText('View settings restored.'); const restored = await savedView(view);
  assert.deepEqual(restored.opacity, faded.opacity); assert.deepEqual(restored.hidden, faded.hidden); assert.equal(restored.background, 'white');
  fireEvent.click(view.getByRole('button', { name: 'Export JSON' })); assert.deepEqual(JSON.parse(await exportedBlobs.at(-1)!.text()), observations);
});


// Synthetic SWC software input. It is not a biological reconstruction.
const localTraceFixture = ['# LOCAL_HEADER_PRIVATE_MARKER', '10 1 0 0 0 1 -1', '30 2 1 0 0 1 10',
  '20 3 1 1 0 2 30', '40 3 1 0 1 2 30', '99 0 10 10 10 0 -1'].join('\n');
function traceFile(text = localTraceFixture) {
  const bytes = new TextEncoder().encode(text);
  return { name: 'local-private-label.swc', size: bytes.byteLength, arrayBuffer: async () => bytes.slice().buffer } as File;
}
function pendingTraceFile() {
  let resolve!: (value: ArrayBuffer) => void;
  const promise = new Promise<ArrayBuffer>((done) => { resolve = done; });
  return { file: { name: 'pending.swc', size: new TextEncoder().encode(localTraceFixture).byteLength,
    arrayBuffer: () => promise } as File, resolve, promise };
}

test('local SWC remains in memory, supports source-bound observations and views, and switches without trace requests', async () => {
  const view = await openApp();
  showTab(view, 'Sources');
  fireEvent.change(view.getByLabelText('Open local SWC trace'), { target: { files: [traceFile()] } });
  await view.findByText('Local trace opened. No file data transmitted.');
  assert.ok(view.getByText('1 visible region'));
  showTab(view, 'Source evidence');
  const record = within(view.getByRole('region', { name: 'Local trace record' }));
  assert.ok(record.getByText('Samples stored')); assert.ok(record.getByText('Isolated samples'));
  assert.equal(view.queryByText('local-private-label.swc'), null);
  assert.equal(view.queryByText('LOCAL_HEADER_PRIVATE_MARKER'), null);
  assert.equal(view.queryByRole('heading', { name: 'Surface detail' }), null);
  const opened = await savedView(view); const id = opened.selected!;
  assert.match(id, /^local-trace:[a-f0-9]{64}:record$/); assert.equal(opened.background, 'white');
  assert.match(opened.coordinateFrameId, /^local-trace-native-[a-f0-9]{64}$/);
  fireEvent.click(view.getByRole('button', { name: 'Living' }));
  assert.ok(view.getByText('No physiological motion is available for this reference.'));
  fireEvent.click(view.getByRole('button', { name: 'Experiment' }));
  const csv = ['structure_id,measurement,value,unit,replicate,condition,time_point',
    `${id},synthetic marker,1,AU,subject-1,control,baseline`, `${id},synthetic marker,3,AU,subject-2,control,baseline`,
    `${id},synthetic marker,2,AU,subject-1,treated,baseline`, `${id},synthetic marker,4,AU,subject-2,treated,baseline`].join('\n');
  fireEvent.change(view.getByLabelText('Import experimental dataset'), { target: { files: [inputFile(csv)] } });
  await view.findByText('Accepted 4 measurements. No data transmitted.');
  fireEvent.click(view.getByRole('button', { name: 'Export JSON' })); const data = JSON.parse(await exportedBlobs.at(-1)!.text());
  const localView = await savedView(view);
  assert.equal(JSON.stringify(localView).includes('LOCAL_HEADER_PRIVATE_MARKER'), false);
  assert.equal(Object.hasOwn(localView, 'nodes'), false);
  fireEvent.click(view.getByRole('button', { name: 'Compare' })); assert.equal((await savedView(view)).atlasId, localView.atlasId);
  expectedRequests.push('/atlas/atlas.json');
  fireEvent.change(view.getByRole('combobox', { name: 'Anatomy reference' }), { target: { value: atlas.id } });
  await view.findByText('17 visible regions');
  fireEvent.change(view.getByLabelText('Restore view state'), { target: { files: [inputFile(JSON.stringify(localView), 'trace-view.json')] } });
  await view.findByRole('alert'); assert.equal((await savedView(view)).atlasId, atlas.id);
  fireEvent.change(view.getByRole('combobox', { name: 'Anatomy reference' }), { target: { value: localView.atlasId } });
  await view.findByText('1 visible region');
  assert.ok(view.getByText('4 observations · 2 biological subject IDs · 2 groups'));
  fireEvent.change(view.getByLabelText('Restore view state'), { target: { files: [inputFile(JSON.stringify(localView), 'trace-view.json')] } });
  await view.findByText('View settings restored.'); assert.deepEqual(await savedView(view), localView);
  fireEvent.click(view.getByRole('button', { name: 'Export JSON' })); assert.deepEqual(JSON.parse(await exportedBlobs.at(-1)!.text()), data);
});

test('invalid and oversized SWC imports retain the current local geometry, view and observations', async () => {
  const view = await openApp();
  showTab(view, 'Sources');
  fireEvent.change(view.getByLabelText('Open local SWC trace'), { target: { files: [traceFile()] } });
  await view.findByText('Local trace opened. No file data transmitted.');
  fireEvent.click(view.getByRole('button', { name: 'Experiment' }));
  const local = await savedView(view), id = local.selected!;
  const csv = ['structure_id,measurement,value,unit,replicate,condition,time_point',
    `${id},synthetic marker,1,AU,subject-1,control,baseline`, `${id},synthetic marker,3,AU,subject-2,control,baseline`].join('\n');
  fireEvent.change(view.getByLabelText('Import experimental dataset'), { target: { files: [inputFile(csv)] } });
  await view.findByText('Accepted 2 measurements. No data transmitted.');
  fireEvent.click(view.getByRole('button', { name: 'Export JSON' })); const observations = JSON.parse(await exportedBlobs.at(-1)!.text());
  const before = await savedView(view);
  fireEvent.change(view.getByLabelText('Open local SWC trace'), { target: { files: [traceFile('1 1 0 0 0 1 -1\n2 2 1 0 0 1 3')] } });
  await view.findByRole('alert'); assert.deepEqual(await savedView(view), before);
  let read = false;
  fireEvent.change(view.getByLabelText('Open local SWC trace'), { target: { files: [{ size: 2 * 1024 * 1024 + 1,
    arrayBuffer: async () => { read = true; return new ArrayBuffer(0); } } as File] } });
  await view.findByText(/Local SWC files must fit the 2 MiB input limit/);
  assert.equal(read, false); assert.deepEqual(await savedView(view), before);
  fireEvent.click(view.getByRole('button', { name: 'Export JSON' })); assert.deepEqual(JSON.parse(await exportedBlobs.at(-1)!.text()), observations);
});

test('pending local reads cannot replace a later successful trace or a selected reference', async () => {
  const view = await openApp(); const pending = pendingTraceFile();
  fireEvent.change(view.getByLabelText('Open local SWC trace'), { target: { files: [pending.file] } });
  fireEvent.change(view.getByLabelText('Open local SWC trace'), { target: { files: [traceFile(localTraceFixture + '\n# newer-source')] } });
  await view.findByText('Local trace opened. No file data transmitted.'); const latest = await savedView(view);
  await act(async () => { pending.resolve(new TextEncoder().encode(localTraceFixture).buffer); await pending.promise; });
  assert.deepEqual(await savedView(view), latest);
  const switching = pendingTraceFile();
  fireEvent.change(view.getByLabelText('Open local SWC trace'), { target: { files: [switching.file] } });
  expectedRequests.push('/atlas-volume/atlas.json');
  fireEvent.change(view.getByRole('combobox', { name: 'Anatomy reference' }), { target: { value: 'digimouse-volume-040-v1' } });
  await view.findByText('21 visible regions');
  await act(async () => { switching.resolve(new TextEncoder().encode(localTraceFixture).buffer); await switching.promise; });
  assert.equal((await savedView(view)).atlasId, 'digimouse-volume-040-v1');
});


test('local file read errors omit private error text and retain the current reference', async () => {
  const view = await openApp(); const before = await savedView(view);
  fireEvent.change(view.getByLabelText('Open local SWC trace'), { target: { files: [{ name: 'read-error.swc', size: 20,
    arrayBuffer: async (): Promise<ArrayBuffer> => { throw new Error('SYNTHETIC_PRIVATE_READ_MARKER'); } } as File] } });
  await view.findByText(/The local trace file could not be read/);
  assert.equal(view.container.textContent?.includes('SYNTHETIC_PRIVATE_READ_MARKER'), false);
  assert.deepEqual(await savedView(view), before);
});

test('replacing a local trace separates its observations and rejects another trace view, then restores the original file data', async () => {
  const view = await openApp();
  fireEvent.change(view.getByLabelText('Open local SWC trace'), { target: { files: [traceFile()] } });
  await view.findByText('Local trace opened. No file data transmitted.');
  fireEvent.click(view.getByRole('button', { name: 'Experiment' })); const traceA = await savedView(view), id = traceA.selected!;
  const csv = ['structure_id,measurement,value,unit,replicate,condition,time_point', `${id},synthetic marker,1,AU,subject-1,control,baseline`].join('\n');
  fireEvent.change(view.getByLabelText('Import experimental dataset'), { target: { files: [inputFile(csv)] } });
  await view.findByText('Accepted 1 measurements. No data transmitted.');
  fireEvent.click(view.getByRole('button', { name: 'Export JSON' })); const original = JSON.parse(await exportedBlobs.at(-1)!.text());
  fireEvent.change(view.getByLabelText('Open local SWC trace'), { target: { files: [traceFile(localTraceFixture + '\n# different-original-bytes')] } });
  await waitFor(async () => assert.notEqual((await savedView(view)).atlasId, traceA.atlasId));
  const traceB = await savedView(view); assert.equal((view.getByRole('button', { name: 'Export JSON' }) as HTMLButtonElement).disabled, true);
  fireEvent.change(view.getByLabelText('Restore view state'), { target: { files: [inputFile(JSON.stringify(traceA), 'trace-A-view.json')] } });
  await view.findByRole('alert'); assert.equal((await savedView(view)).atlasId, traceB.atlasId);
  fireEvent.change(view.getByLabelText('Open local SWC trace'), { target: { files: [traceFile()] } });
  await waitFor(async () => assert.equal((await savedView(view)).atlasId, traceA.atlasId));
  fireEvent.click(view.getByRole('button', { name: 'Export JSON' })); assert.deepEqual(JSON.parse(await exportedBlobs.at(-1)!.text()), original);
});


test('bundled neuronal reference retains source limits, background and source-bound observations and views', async () => {
  const view = await openApp();
  fireEvent.click(view.getByRole('button', { name: 'Experiment' }));
  fireEvent.change(view.getByLabelText('Import experimental dataset'), { target: { files: [inputFile(syntheticCsv)] } });
  await view.findByText('Accepted 8 measurements. No data transmitted.');
  fireEvent.click(view.getByRole('button', { name: 'Export JSON' }));
  const originalData = JSON.parse(await exportedBlobs.at(-1)!.text());
  showTab(view, 'Source evidence');
  expectedRequests.push('/atlas-neuron/atlas.json');
  fireEvent.change(view.getByRole('combobox', { name: 'Anatomy reference' }), { target: { value: 'neuromorpho-nmo130632-standardized-v1' } });
  await view.findByRole('heading', { name: 'Neuronal source trace' });
  assert.ok(view.getByText('11,650')); assert.ok(view.getByText('11,649'));
  assert.ok(view.getByText('Traced samples and parent links'));
  assert.equal(view.queryByRole('checkbox', { name: 'Finer selected surface' }), null);
  assert.equal(view.queryByRole('group', { name: 'Viewer background' }), null);
  assert.equal((view.getByRole('button', { name: 'Export JSON' }) as HTMLButtonElement).disabled, true);
  const saved = await savedView(view);
  assert.equal(saved.atlasId, 'neuromorpho-nmo130632-standardized-v1');
  assert.equal(saved.coordinateFrameId, 'neuromorpho-nmo130632-standardized-unknown-units-v1');
  assert.equal(saved.assetSha256, '0dd36d6518aacd6338d16c76318d6ed0fd24419a0551417fdf639a8323c6ede5');
  assert.equal(saved.background, 'white');
  const serialized = JSON.stringify(saved);
  assert.equal(serialized.includes('synthetic signal'), false);
  assert.equal(serialized.includes('parentLinks'), false);
  assert.equal(Object.hasOwn(saved, 'nodes'), false);
  fireEvent.change(view.getByLabelText('Restore view state'), { target: { files: [inputFile(JSON.stringify(saved), 'neuron-view.json')] } });
  await view.findByText('View settings restored.');
  assert.deepEqual(await savedView(view), saved);
  fireEvent.click(view.getByRole('button', { name: 'Compare' }));
  assert.equal((await savedView(view)).atlasId, saved.atlasId);
  fireEvent.click(view.getByRole('button', { name: 'Living' }));
  assert.ok(view.getByText('No physiological motion is available for this reference.'));
  assert.equal(view.queryByRole('button', { name: 'Pause physiology' }), null);
  expectedRequests.push('/atlas/atlas.json');
  fireEvent.change(view.getByRole('combobox', { name: 'Anatomy reference' }), { target: { value: atlas.id } });
  await view.findByText('17 visible regions');
  fireEvent.click(view.getByRole('button', { name: 'Experiment' }));
  assert.ok(view.getByText('8 observations · 4 biological subject IDs · 4 groups'));
  fireEvent.click(view.getByRole('button', { name: 'Export JSON' }));
  assert.deepEqual(JSON.parse(await exportedBlobs.at(-1)!.text()), originalData);
});


test('local sample navigation preserves source-bound views and observations without network reads', async () => {
  const view = await openApp();
  fireEvent.change(view.getByLabelText('Open local SWC trace'), { target: { files: [traceFile()] } });
  await view.findByRole('heading', { name: 'Source sample explorer' });
  fireEvent.click(view.getByRole('button', { name: 'Experiment' }));
  const saved = await savedView(view), id = saved.selected!;
  const csv = ['structure_id,measurement,value,unit,replicate,condition,time_point', `${id},synthetic marker,1,AU,subject-1,control,baseline`].join('\n');
  fireEvent.change(view.getByLabelText('Import experimental dataset'), { target: { files: [inputFile(csv)] } });
  await view.findByText('Accepted 1 measurements. No data transmitted.');
  const explorer = within(view.getByRole('region', { name: 'Source sample explorer' }));
  fireEvent.change(explorer.getByLabelText('Source sample ID'), { target: { value: '30' } });
  fireEvent.click(explorer.getByRole('button', { name: 'Inspect sample' }));
  assert.ok(explorer.getByRole('button', { name: 'Inspect child sample 40' }));
  fireEvent.click(explorer.getByRole('button', { name: 'Inspect child sample 40' }));
  assert.equal((explorer.getByLabelText('Source sample ID') as HTMLInputElement).value, '40');
  assert.equal((explorer.getByRole('button', { name: 'Focus incident links' }) as HTMLButtonElement).disabled, true);
  const beforeInvalid = await savedView(view);
  fireEvent.change(explorer.getByLabelText('Source sample ID'), { target: { value: '999999' } });
  fireEvent.click(explorer.getByRole('button', { name: 'Inspect sample' }));
  assert.ok(explorer.getByRole('alert'));
  assert.deepEqual(await savedView(view), beforeInvalid);
  fireEvent.click(view.getByRole('button', { name: 'Export JSON' }));
  const data = JSON.parse(await exportedBlobs.at(-1)!.text());
  assert.equal(data.measurements.length, 1);
  assert.equal(data.measurements[0].structureId, id);
  assert.equal(view.container.textContent?.includes('LOCAL_HEADER_PRIVATE_MARKER'), false);
  assert.equal(JSON.stringify(await savedView(view)).includes('sampleId'), false);
});

test('bundled sample inspection reads only its checked local derivative and keeps sample selection out of views', async () => {
  const view = await openApp(); expectedRequests.push('/atlas-neuron/atlas.json');
  fireEvent.change(view.getByRole('combobox', { name: 'Anatomy reference' }), { target: { value: 'neuromorpho-nmo130632-standardized-v1' } });
  await view.findByRole('heading', { name: 'Source sample explorer' });
  const explorer = within(view.getByRole('region', { name: 'Source sample explorer' }));
  assert.equal(explorer.queryByLabelText('Source sample ID'), null);
  const before = await savedView(view);
  expectedRequests.push('/atlas-neuron/nmo130632-standardized.swc.txt');
  fireEvent.click(explorer.getByRole('button', { name: 'Inspect source samples' }));
  const input = await explorer.findByLabelText('Source sample ID');
  fireEvent.change(input, { target: { value: '11650' } });
  fireEvent.click(explorer.getByRole('button', { name: 'Inspect sample' }));
  assert.equal((input as HTMLInputElement).value, '11650');
  fireEvent.click(explorer.getByRole('button', { name: 'Inspect parent' }));
  assert.notEqual((input as HTMLInputElement).value, '11650');
  assert.deepEqual(await savedView(view), before);
  assert.equal((explorer.getByRole('button', { name: 'Focus incident links' }) as HTMLButtonElement).disabled, true);
});

test('Find anatomy opens exact vessel and nerve references and restores observations without changing white background', async () => {
  const view = await openApp();
  fireEvent.click(view.getByRole('button', { name: 'Experiment' }));
  fireEvent.change(view.getByLabelText('Import experimental dataset'), { target: { files: [inputFile(syntheticCsv)] } });
  await view.findByText('Accepted 8 measurements. No data transmitted.');
  fireEvent.click(view.getByRole('button', { name: 'Export JSON' }));
  const observations = JSON.parse(await exportedBlobs.at(-1)!.text());
  showTab(view, 'Sources'); showTab(view, 'Source evidence');
  const panel = within(view.container.querySelector('.anatomy-coverage')! as HTMLElement);
  assert.equal(panel.getByRole('button', { name: 'Show source choices' }).getAttribute('aria-expanded'), 'false');
  fireEvent.click(panel.getByRole('button', { name: 'Blood vessels' }));
  expectedRequests.push('/atlas-ema147/atlas.json');
  fireEvent.click(panel.getByRole('button', { name: 'Show developmental vessel surfaces' }));
  await waitFor(() => assert.equal((view.getByRole('combobox', { name: 'Anatomy reference' }) as HTMLSelectElement).value, 'ema147-native-v1'));
  const vessels = await savedView(view);
  assert.equal(vessels.background, 'white'); assert.deepEqual(vessels.hidden, []);
  for (const id of [17307, 18415, 18601]) assert.equal(vessels.opacity[`ema147:EMAPA:${id}`], 1);
  assert.equal(vessels.opacity['ema147:EMAPA:17525'], 0.08);
  showTab(view, 'Sources');
  fireEvent.click(panel.getByRole('button', { name: 'Nerves' }));
  fireEvent.change(panel.getByRole('combobox', { name: 'Surrounding source anatomy' }), { target: { value: 'hidden' } });
  fireEvent.click(panel.getByRole('button', { name: 'Show developmental trigeminal nerve and ganglion' }));
  const nerves = await savedView(view); assert.equal(nerves.hidden.length, 75);
  for (const id of [16797, 17576]) { assert.equal(nerves.opacity[`ema147:EMAPA:${id}`], 1); assert.ok(!nerves.hidden.includes(`ema147:EMAPA:${id}`)); }
  expectedRequests.push('/atlas-nerve/atlas.json');
  showTab(view, 'Sources');
  fireEvent.click(panel.getByRole('button', { name: 'Nerves' }));
  fireEvent.click(panel.getByRole('button', { name: 'Show predicted regional nerve graph' }));
  await view.findByRole('heading', { name: 'Source polyline graph' });
  const record = within(view.container.querySelector('[aria-labelledby="source-polyline-heading"]')! as HTMLElement);
  assert.ok(record.getByText('1,940')); assert.ok(record.getByText('1,876'));
  assert.equal(view.queryByRole('heading', { name: 'Source sample explorer' }), null);
  assert.equal((await savedView(view)).background, 'white');
  showTab(view, 'Sources');
  fireEvent.click(panel.getByRole('button', { name: 'Blood vessels' }));
  expectedRequests.push('/atlas-vascular/atlas.json');
  fireEvent.click(panel.getByRole('button', { name: 'Show cortical vessel network' }));
  await waitFor(() => assert.equal((view.getByRole('combobox', { name: 'Anatomy reference' }) as HTMLSelectElement).value, 'schmid2021-mvn1-v1'));
  const vascularRecord = within(view.container.querySelector('[aria-labelledby="source-polyline-heading"]')! as HTMLElement);
  assert.ok(vascularRecord.getByText('575,722')); assert.ok(vascularRecord.getByText('563,651')); assert.ok(vascularRecord.getByText('2,904'));
  assert.ok(vascularRecord.getByText('micrometres'));
  assert.equal((await savedView(view)).background, 'white');
  expectedRequests.push('/atlas/atlas.json');
  fireEvent.change(view.getByRole('combobox', { name: 'Anatomy reference' }), { target: { value: atlas.id } });
  await view.findByText('17 visible regions');
  fireEvent.click(view.getByRole('button', { name: 'Export JSON' }));
  assert.deepEqual(JSON.parse(await exportedBlobs.at(-1)!.text()), observations);
  assert.equal((await savedView(view)).background, 'white');
});

test('a substituted coverage manifest leaves current reference, display and observations intact', async () => {
  const view = await openApp();
  const before = await savedView(view), previous = globalThis.fetch;
  const substituted = JSON.parse(vascularText); substituted.statistics.assetSha256 = 'a'.repeat(64);
  expectedRequests.push('/atlas-vascular/atlas.json');
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    if (String(input) !== '/atlas-vascular/atlas.json') return previous(input);
    requests.push(String(input)); return new Response(JSON.stringify(substituted));
  }) as typeof fetch;
  showTab(view, 'Sources');
  fireEvent.click(view.getByRole('button', { name: 'Blood vessels' }));
  fireEvent.click(view.getByRole('button', { name: 'Show cortical vessel network' }));
  await view.findByText(/The requested source anatomy could not be opened. The current reference and observations were retained/);
  assert.deepEqual(await savedView(view), before);
  assert.equal((view.getByRole('combobox', { name: 'Anatomy reference' }) as HTMLSelectElement).value, atlas.id);
});

test('source path navigation keeps white background, observations and saved views separate from graph records', async () => {
  const view = await openApp(); fireEvent.click(view.getByRole('button', { name: 'Experiment' }));
  fireEvent.change(view.getByLabelText('Import experimental dataset'), { target: { files: [inputFile(syntheticCsv)] } }); await view.findByText('Accepted 8 measurements. No data transmitted.');
  fireEvent.click(view.getByRole('button', { name: 'Export JSON' })); const observations = JSON.parse(await exportedBlobs.at(-1)!.text());
  expectedRequests.push('/atlas-nerve/atlas.json'); fireEvent.change(view.getByRole('combobox', { name: 'Anatomy reference' }), { target: { value: 'mousemapper-nerve-patch0-v1' } });
  await view.findByRole('heading', { name: 'Source path explorer' }); const before = await savedView(view);
  expectedRequests.push('/atlas-nerve/mousemapper-patch0-lines.json'); fireEvent.click(view.getByRole('button', { name: 'Inspect source paths' }));
  await view.findByRole('textbox', { name: 'Source path ID' }); fireEvent.click(view.getByRole('button', { name: 'Next path' }));
  const after = await savedView(view); assert.deepEqual(after, before); assert.equal(after.background, 'white');
  for (const key of ['sourceGraph', 'sourcePointIndex', 'pathId', 'pathRowIndex']) assert.equal(JSON.stringify(after).includes(key), false);
  assert.equal((view.getByRole('button', { name: 'Focus source path' }) as HTMLButtonElement).disabled, true);
  expectedRequests.push('/atlas/atlas.json'); fireEvent.change(view.getByRole('combobox', { name: 'Anatomy reference' }), { target: { value: atlas.id } }); await view.findByText('17 visible regions');
  fireEvent.click(view.getByRole('button', { name: 'Export JSON' })); assert.deepEqual(JSON.parse(await exportedBlobs.at(-1)!.text()), observations);
  assert.equal((await savedView(view)).background, 'white'); assert.equal(view.queryByRole('heading', { name: 'Source path explorer' }), null);
});

test('guided views validate exact source selection and preserve background and observation banks',async()=>{
  const view=await openApp();
  fireEvent.click(view.getByRole('button',{name:'Experiment'}));
  fireEvent.change(view.getByLabelText('Import experimental dataset'),{target:{files:[inputFile(syntheticCsv)]}});
  await view.findByText('Accepted 8 measurements. No data transmitted.');
  fireEvent.click(view.getByRole('button',{name:'Start here'}));
  const guide=within(view.getByRole('dialog',{name:'Start with the available science'}));
  assert.equal(guide.getAllByRole('button',{name:/^Open /}).length,9);
  fireEvent.click(guide.getByRole('button',{name:'Open developmental vessel surfaces'}));
  expectedRequests.push('/atlas-ema147/atlas.json');
  await waitFor(()=>assert.equal((view.getByLabelText('Anatomy reference') as HTMLSelectElement).value,'ema147-native-v1'));
  assert.equal(view.queryByRole('dialog',{name:'Start with the available science'}),null);
  const saved=await savedView(view);
  assert.equal(saved.background,'white');assert.equal(saved.mode,'anatomical');assert.equal(77-saved.hidden.length,3);
  fireEvent.change(view.getByLabelText('Anatomy reference'),{target:{value:atlas.id}});expectedRequests.push('/atlas/atlas.json');
  await view.findByText('Reference switched. Its local observations were restored.');
  fireEvent.click(view.getByRole('button',{name:'Experiment'}));assert.ok(view.getByText('8 observations · 4 biological subject IDs · 4 groups'));
});
test('failed guided source read retains the guide, current source, data and display',async()=>{
  const view=await openApp();const previous=await savedView(view);
  const fetchBefore=globalThis.fetch;
  globalThis.fetch=(async(input:RequestInfo|URL)=>{if(String(input)==='/atlas-ema147/atlas.json'){requests.push(String(input));return new Response('{}');}return fetchBefore(input);}) as typeof fetch;
  fireEvent.click(view.getByRole('button',{name:'Start here'}));
  fireEvent.click(view.getByRole('button',{name:'Open developmental trigeminal nerve and ganglion'}));expectedRequests.push('/atlas-ema147/atlas.json');
  await view.findByText('The starting view could not be opened. The current reference and observations were retained.');
  fireEvent.click(view.getByRole('button',{name:'Close guide'}));assert.deepEqual(await savedView(view),previous);
});
test('fictional comparison is explicit, labeled, exportable and cannot replace current observations',async()=>{
  const view=await openApp();fireEvent.click(view.getByRole('button',{name:'Compare'}));
  assert.equal(view.queryByText('Synthetic example data. These values are not experimental observations.'),null);
  fireEvent.click(view.getByRole('button',{name:'Try synthetic comparison'}));
  assert.ok(view.getByText('Synthetic example data. These values are not experimental observations.'));
  assert.equal((view.getByLabelText('Condition A') as HTMLSelectElement).value,'control-example');
  assert.equal((view.getByLabelText('Condition B') as HTMLSelectElement).value,'treatment-example');
  assert.equal(view.queryByRole('button',{name:'Try synthetic comparison'}),null);
  fireEvent.click(view.getByRole('button',{name:'Export JSON'}));const exported=JSON.parse(await exportedBlobs.at(-1)!.text());
  assert.equal(exported.dataset.origin,'synthetic-example');assert.equal(exported.measurements.length,24);
  fireEvent.click(view.getByRole('button',{name:'Clear local data'}));
  fireEvent.change(view.getByLabelText('Import experimental dataset'),{target:{files:[inputFile(syntheticCsv)]}});
  await view.findByText('Accepted 8 measurements. No data transmitted.');assert.equal(view.queryByRole('button',{name:'Try synthetic comparison'}),null);
});
test('fictional comparison cannot displace an in-flight research import',async()=>{
  const view=await openApp();fireEvent.click(view.getByRole('button',{name:'Experiment'}));const pending=deferredInputFile('pending.csv');
  fireEvent.change(view.getByLabelText('Import experimental dataset'),{target:{files:[pending.file]}});
  fireEvent.click(view.getByRole('button',{name:'Try synthetic comparison'}));
  assert.equal(view.queryByText('Synthetic example data. These values are not experimental observations.'),null);
  await completeRead(pending,syntheticCsv);assert.ok(view.getByText('Accepted 8 measurements. No data transmitted.'));
});
test('cardiac workspace remains independent of anatomy and reports unavailable worker without losing data',async()=>{
  const view=await openApp();fireEvent.click(view.getByRole('button',{name:'Living'}));
  assert.ok(view.getByRole('heading',{name:'Mouse ventricular electrophysiology'}));
  assert.equal((view.getByLabelText('Cardiac equation variant') as HTMLSelectElement).value,'balanced-transition');
  assert.ok(view.getByText(/computationally inferred and has no independent physiological validation/));
  fireEvent.click(view.getByRole('button',{name:'Run cell simulation'}));
  assert.ok(view.getByText('A local Web Worker is required to run this model.'));
  assert.equal((await savedView(view)).atlasId,atlas.id);
});

test('cell worker cancellation discards late results and exports complete independent model provenance',async()=>{
  const descriptor=Object.getOwnPropertyDescriptor(globalThis,'Worker');
  const workers:MockWorker[]=[];
  class MockWorker {
    onmessage:((event:{data:unknown})=>void)|null=null;onerror:(()=>void)|null=null;terminated=false;request:unknown;
    constructor(){workers.push(this);}postMessage(value:unknown){this.request=value;}terminate(){this.terminated=true;}
  }
  Object.defineProperty(globalThis,'Worker',{value:MockWorker,configurable:true});
  try {
    const {simulateCardiacCell}=await import('../src/domain/cardiac-cell');const result=simulateCardiacCell({durationMs:1});
    const view=await openApp();fireEvent.click(view.getByRole('button',{name:'Living'}));
    fireEvent.click(view.getByRole('button',{name:'Run cell simulation'}));
    assert.deepEqual(workers[0].request,{type:'run',options:{variant:'balanced-transition',durationMs:250,pacingPeriodMs:71.43}});
    fireEvent.click(view.getByRole('button',{name:'Cancel simulation'}));assert.equal(workers[0].terminated,true);
    await act(async()=>workers[0].onmessage?.({data:{type:'result',result}}));
    assert.equal(view.queryByLabelText('Cardiac simulation result'),null);
    fireEvent.click(view.getByRole('button',{name:'Run cell simulation'}));
    await act(async()=>workers[1].onmessage?.({data:{type:'progress',progress:{fraction:0.5}}}));
    assert.equal((view.getByLabelText('Cell simulation progress') as HTMLProgressElement).value,0.5);
    await act(async()=>workers[1].onmessage?.({data:{type:'result',result}}));
    assert.equal(view.getAllByRole('img',{name:/against model time/}).length,3);
    fireEvent.click(view.getByRole('button',{name:'Export result and provenance'}));
    assert.deepEqual(JSON.parse(await exportedBlobs.at(-1)!.text()),result);
    fireEvent.click(view.getByRole('button',{name:'Run cell simulation'}));
    fireEvent.click(view.getByRole('button',{name:'Anatomy'}));assert.equal(workers[2].terminated,true);
    assert.equal(view.queryByLabelText('Cardiac simulation result'),null);
    fireEvent.click(view.getByRole('button',{name:'Living'}));assert.ok(view.getByLabelText('Cardiac simulation result'));
    assert.equal((await savedView(view)).atlasId,atlas.id);
  } finally {if(descriptor)Object.defineProperty(globalThis,'Worker',descriptor);else Reflect.deleteProperty(globalThis,'Worker');}
});

test('fictional comparison reveals its mapped regions after a brain-only view and clears a canceled import guard',async()=>{
  const view=await openApp();fireEvent.click(view.getByRole('button',{name:'Experiment'}));
  const pending=deferredInputFile('never-finishes-until-after-switch.csv');
  fireEvent.change(view.getByLabelText('Import experimental dataset'),{target:{files:[pending.file]}});
  assert.equal((view.getByRole('button',{name:'Try synthetic comparison'}) as HTMLButtonElement).disabled,true);
  fireEvent.click(view.getByRole('button',{name:'Start here'}));
  fireEvent.click(view.getByRole('button',{name:'Open six brain regions'}));expectedRequests.push('/atlas-volume/atlas.json');
  await waitFor(()=>assert.equal((view.getByLabelText('Anatomy reference') as HTMLSelectElement).value,'digimouse-volume-040-v1'));
  fireEvent.click(view.getByRole('button',{name:'Compare'}));
  assert.equal((view.getByRole('button',{name:'Try synthetic comparison'}) as HTMLButtonElement).disabled,false);
  fireEvent.click(view.getByRole('button',{name:'Try synthetic comparison'}));
  fireEvent.click(view.getByRole('button',{name:'Export JSON'}));const dataset=JSON.parse(await exportedBlobs.at(-1)!.text());
  const saved=await savedView(view);const targets=[...new Set<string>(dataset.measurements.map((row:{structureId:string})=>row.structureId))];
  assert.equal(targets.length,2);assert.ok(saved.selected && targets.includes(saved.selected));assert.equal(saved.clipAxis,'off');
  for(const target of targets){assert.ok(!saved.hidden.includes(target));assert.equal(saved.opacity[target as string],1);}
  await completeRead(pending,syntheticCsv);assert.ok(view.getByText('Synthetic example data. These values are not experimental observations.'));
  assert.equal(view.queryByText('Accepted 8 measurements. No data transmitted.'),null);
});

test('a rejected newer file cancels an older pending read without leaving the example button disabled',async()=>{
  const view=await openApp();fireEvent.click(view.getByRole('button',{name:'Experiment'}));const pending=deferredInputFile('older-pending.csv');
  const input=view.getByLabelText('Import experimental dataset');fireEvent.change(input,{target:{files:[pending.file]}});
  fireEvent.change(input,{target:{files:[inputFile('', 'too-large.csv',5*1024*1024+1)]}});
  assert.equal((view.getByRole('button',{name:'Try synthetic comparison'}) as HTMLButtonElement).disabled,false);
  fireEvent.click(view.getByRole('button',{name:'Try synthetic comparison'}));await completeRead(pending,syntheticCsv);
  assert.ok(view.getByText('Synthetic example data. These values are not experimental observations.'));assert.equal(view.queryByText('Accepted 8 measurements. No data transmitted.'),null);
});

test('Living schematic routes are labelled, filterable, exportable and limited to bound references', async () => {
  const view = await openApp();
  fireEvent.click(view.getByRole('button', { name: 'Living' }));
  const options = within(view.getByRole('group', { name: 'Schematic circulation and nerve routes' }));
  const circulation = options.getByRole('checkbox', { name: 'Blood circulation routes' }) as HTMLInputElement;
  const neural = options.getByRole('checkbox', { name: 'Nerve signalling routes' }) as HTMLInputElement;
  assert.equal(circulation.checked, true); assert.equal(neural.checked, true);
  assert.equal((options.getByRole('checkbox', { name: 'Selected region only' }) as HTMLInputElement).checked, false);
  assert.ok(options.getByText(/^30 schematic connectors between existing source regions.*3 routes are omitted/));
  assert.ok(view.getByText('SCHEMATIC ROUTES · CONNECTORS ARE NOT VESSEL OR NERVE GEOMETRY'));
  const legend = within(view.getByRole('note', { name: 'Schematic route legend' }));
  for (const label of ['Oxygen-rich blood', 'Oxygen-poor blood', 'Hepatic portal blood', 'Efferent nerve signal']) assert.ok(legend.getByText(label));
  // The tetrahedral reference has no eye surface, so no afferent route is bound.
  assert.equal(legend.queryByText('Afferent nerve signal'), null);

  fireEvent.click(view.getByRole('button', { name: /Kidney, region 7.*digimouse:7/ }));
  const routes = within(view.getByRole('region', { name: 'Schematic routes' }));
  assert.ok(routes.getByText('Receives oxygen-rich blood from Heart'));
  assert.ok(routes.getByText('Sends oxygen-poor blood to Heart'));
  assert.equal(routes.getAllByText('Educational simplification').length, 2);
  assert.equal(routes.getAllByRole('link', { name: 'Section 20.5 Circulatory Pathways' })[0].getAttribute('href'),
    'https://openstax.org/books/anatomy-and-physiology-2e/pages/20-5-circulatory-pathways');
  fireEvent.click(view.getByRole('button', { name: /Brain.*digimouse:2/ }));
  assert.ok(view.getAllByText(/^Binding inference: Vagal brain-stem nuclei are assigned to the aggregate source Brain region/).length > 0);

  const before = await savedView(view);
  fireEvent.click(circulation); fireEvent.click(neural);
  assert.equal(view.queryByRole('note', { name: 'Schematic route legend' }), null);
  assert.equal(view.queryByText('SCHEMATIC ROUTES · CONNECTORS ARE NOT VESSEL OR NERVE GEOMETRY'), null);
  // Route layers are display choices and are not written into view files.
  assert.deepEqual(await savedView(view), before);
  assert.equal(JSON.stringify(before).includes('circuit'), false);

  fireEvent.click(options.getByRole('button', { name: 'Download route table' }));
  assert.equal(downloads.at(-1)?.name, 'mousebio-schematic-circuits.json');
  const table = JSON.parse(await exportedBlobs.at(-1)!.text());
  assert.equal(table.schemaVersion, 'mousebio.schematic-circuits.v1');
  assert.equal(table.atlasId, atlas.id); assert.equal(table.coordinateFrameId, atlas.coordinateFrame.id);
  assert.equal(table.connectorsAreAnatomicalGeometry, false);
  assert.equal(table.classification, 'illustrative'); assert.equal(table.evidence, 'educational-simplification');
  assert.equal(table.edges.length, 30); assert.equal(table.omittedRoutes.length, 3);
  assert.ok(table.limitations.length > 0 && table.references.length === 4);

  expectedRequests.push('/atlas-hindlimb/atlas.json');
  fireEvent.change(view.getByRole('combobox', { name: 'Anatomy reference' }), { target: { value: 'charles2016-hindlimb-v1' } });
  await view.findByText('44 visible regions');
  assert.equal(view.queryByRole('group', { name: 'Schematic circulation and nerve routes' }), null);
  assert.equal(view.queryByRole('region', { name: 'Schematic routes' }), null);
});
