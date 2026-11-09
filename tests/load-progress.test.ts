/** The figures of the loading bar and its accessible state, without browser layout evidence. */
import assert from 'node:assert/strict';
import { after, afterEach, test } from 'node:test';
import { Window } from 'happy-dom';
import { describeTransfer } from '../src/domain/load-progress';

const MODEL = 50_891_580, PACKED = 32_754_122;

test('a compressed download counts what crossed the network and the share of the model received', () => {
  const view = describeTransfer({ assetBytes: MODEL / 4, assetTotal: MODEL, transferred: 8_200_000, transferTotal: PACKED }, 4000);
  assert.equal(view.percent, 25);
  assert.equal(view.fraction, 0.25);
  assert.equal(view.amount, '8.2 of 32.8 MB');
  assert.equal(view.remaining, 'about 12 s left');
});

test('without a stated transfer size the model bytes are counted', () => {
  const view = describeTransfer({ assetBytes: 10_000_000, assetTotal: MODEL, transferred: 6_000_000, transferTotal: null }, 500);
  assert.equal(view.amount, '10.0 of 50.9 MB');
  assert.equal(view.remaining, null, 'no estimate in the first second and a half');
});

test('the percentage never reads 100 before the last byte, and long waits are given in minutes', () => {
  assert.equal(describeTransfer({ assetBytes: MODEL - 1, assetTotal: MODEL, transferred: 0, transferTotal: null }, 9000).percent, 99);
  assert.equal(describeTransfer({ assetBytes: MODEL, assetTotal: MODEL, transferred: 0, transferTotal: null }, 9000).percent, 100);
  assert.equal(describeTransfer({ assetBytes: MODEL / 20, assetTotal: MODEL, transferred: 0, transferTotal: null }, 10_000).remaining, 'about 3 min left');
  assert.equal(describeTransfer({ assetBytes: MODEL * 0.99, assetTotal: MODEL, transferred: 0, transferTotal: null }, 20_000).remaining, 'almost done');
  assert.equal(describeTransfer({ assetBytes: 5, assetTotal: 0, transferred: 5, transferTotal: null }, 2000).fraction, 0);
});

const dom = new Window({ url: 'http://localhost:5173' });
const globals = { window: dom, document: dom.document, navigator: dom.navigator, HTMLElement: dom.HTMLElement, Node: dom.Node,
  MutationObserver: dom.MutationObserver, getComputedStyle: dom.getComputedStyle.bind(dom), IS_REACT_ACT_ENVIRONMENT: true };
const previous = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries(globals)) {
  previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
  Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
const { createElement } = await import('react');
const { cleanup, render } = await import('@testing-library/react');
const { LoadProgress } = await import('../src/components/LoadProgress');
afterEach(() => cleanup());
after(async () => {
  await dom.happyDOM.cancelAsync();
  for (const [key, descriptor] of previous) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete (globalThis as Record<string, unknown>)[key];
  }
});

test('the bar states its value to assistive technology and shows the figures', () => {
  const view = describeTransfer({ assetBytes: MODEL / 2, assetTotal: MODEL, transferred: 16_400_000, transferTotal: PACKED }, 8000);
  const { container, getByRole } = render(createElement(LoadProgress, { label: 'Downloading the model', view }));
  const bar = getByRole('progressbar');
  assert.equal(bar.getAttribute('aria-label'), 'Downloading the model');
  assert.equal(bar.getAttribute('aria-valuenow'), '50');
  assert.equal(bar.getAttribute('aria-valuetext'), '50 percent, 16.4 of 32.8 MB');
  assert.match(container.textContent ?? '', /50 %16.4 of 32.8 MBabout 8 s left/);
  assert.equal(container.querySelector('.load-progress-figures')?.getAttribute('aria-hidden'), 'true');
  assert.equal((container.querySelector('.load-progress-fill') as HTMLElement).style.transform, 'scaleX(0.5)');
});

test('while the model is built the bar is full and has no value', () => {
  const view = describeTransfer({ assetBytes: MODEL, assetTotal: MODEL, transferred: PACKED, transferTotal: PACKED }, 17_000);
  const { container, getByRole } = render(createElement(LoadProgress, { label: 'Building the model', view }));
  const bar = getByRole('progressbar');
  assert.equal(bar.hasAttribute('aria-valuenow'), false);
  assert.ok(container.querySelector('.load-progress.building'));
  assert.equal(container.querySelector('.load-progress-figures')?.textContent, '', 'the figures line stays, empty, so the bar does not move');
  assert.match(container.textContent ?? '', /^Building the model$/);
});
