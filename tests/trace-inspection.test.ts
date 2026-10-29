import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { parseLocalTrace, type LocalTraceAsset } from '../src/domain/local-trace';
import { parseSourceTrace } from '../src/domain/source-trace';
import { createTraceInspection, inspectTraceSample, isTraceInspectionIndex, TRACE_CHILD_PAGE_SIZE,
  type TraceInspectionIndex } from '../src/domain/trace-inspection';
import type { Atlas } from '../src/domain/types';

async function local(text: string): Promise<LocalTraceAsset> {
  const result = await parseLocalTrace(new TextEncoder().encode(text).buffer as ArrayBuffer);
  assert.ok(result.ok && result.asset, result.errors.join(' ')); return result.asset;
}
function index(asset: unknown): TraceInspectionIndex {
  const result = createTraceInspection(asset);
  assert.ok(result.ok && result.index, result.errors.join(' ')); return result.index;
}
function record(value: unknown, id: unknown, offset = 0) {
  const result = inspectTraceSample(value, id, offset);
  assert.ok(result.ok && result.record, result.errors.join(' ')); return result.record;
}
const forest = '# private-header-fixture\n20 3 .1 .2 .3 9 10\n10 0 0 0 0 5 -1\n40 9 2 0 0 1 20\n30 3 1 1 0 2 20\n99 7 50 60 70 99 -1\n';

test('source identities, parent links and row navigation remain distinct in a nonsequential branching forest', async () => {
  const asset = await local(forest), source = index(asset);
  assert.equal(source.firstSampleId, 20);
  assert.deepEqual(source.summary, { samples: 5, parentLinks: 3, roots: 2, isolatedSamples: 1,
    samplesWithoutChildren: 3, branchSamples: 1 });
  assert.equal(source.atlasId, asset.atlas.id); assert.equal(source.coordinateFrameId, asset.atlas.coordinateFrame.id);
  assert.equal(source.structureId, asset.atlas.structures[0].id); assert.equal(source.assetSha256, asset.atlas.statistics.assetSha256);
  const first = record(source, 20);
  assert.deepEqual(first.sample, [20, 3, .1, .2, .3, 9, 10]);
  assert.deepEqual(first.parent, [10, 0, 0, 0, 0, 5, -1]);
  assert.deepEqual(first.children, [40, 30]); assert.equal(first.rowIndex, 0);
  assert.equal(first.previousSampleId, null); assert.equal(first.nextSampleId, 10); assert.equal(first.incidentLinks, 3);
  const root = record(source, 10);
  assert.equal(root.parent, null); assert.deepEqual(root.children, [20]);
  assert.equal(root.previousSampleId, 20); assert.equal(root.nextSampleId, 40); assert.equal(root.rowIndex, 1);
  const isolated = record(source, 99);
  assert.equal(isolated.parent, null); assert.deepEqual(isolated.children, []); assert.equal(isolated.incidentLinks, 0);
  assert.equal(isolated.nextSampleId, null); assert.equal(isolated.previousSampleId, 30);
});

test('coincident links, signed zero and radius fields retain original numeric values without adding measurements', async () => {
  const asset = await local('1 0 0 0 0 5 -1\n2 8 -0 0 0 0 1\n3 9 1 0 0 999 2\n');
  const source = index(asset), middle = record(source, 2);
  assert.equal(Object.is(middle.sample[2], -0), true);
  assert.deepEqual(middle.sample, asset.nodes[1]); assert.deepEqual(middle.parent, asset.nodes[0]);
  assert.equal(middle.sample[5], 0); assert.equal(record(source, 3).sample[5], 999);
  assert.deepEqual(middle.children, [3]); assert.equal(middle.incidentLinks, 2);
  for (const field of ['length', 'diameter', 'physicalUnits', 'cellType', 'synapses', 'coordinatesMm']) {
    assert.equal(Object.hasOwn(middle, field), false);
  }
});

test('inspection accepts only parser-owned assets and opaque indexes, without retaining source headers', async () => {
  const asset = await local(forest), source = index(asset);
  assert.equal(isTraceInspectionIndex(source), true);
  assert.equal(createTraceInspection(asset).index, source);
  const serialized = JSON.stringify(source);
  for (const text of ['private-header-fixture', 'nodes', 'radius']) {
    assert.equal(serialized.includes(text), false);
  }
  const accessor = Object.defineProperty({}, 'nodes', { get() { assert.fail('An unowned getter must not run.'); } });
  for (const value of [null, undefined, [], accessor, structuredClone(asset), { ...asset }]) {
    const result = createTraceInspection(value); assert.equal(result.ok, false); assert.equal(result.index, undefined);
    assert.ok(Object.isFrozen(result) && Object.isFrozen(result.errors));
  }
  for (const value of [null, {}, structuredClone(source), JSON.parse(serialized)]) {
    assert.equal(isTraceInspectionIndex(value), false);
    const result = inspectTraceSample(value, 20); assert.equal(result.ok, false); assert.equal(result.record, undefined);
  }
  const again = index(await local(forest)); assert.notEqual(again, source); assert.equal(again.assetSha256, source.assetSha256);
});

test('returned records and capabilities are immutable defensive values and do not mutate source rows', async () => {
  const asset = await local(forest), before = JSON.stringify(asset), source = index(asset), first = record(source, 20);
  assert.notEqual(first.sample, asset.nodes[0]); assert.notEqual(first.parent, asset.nodes[1]);
  assert.ok(Object.isFrozen(source) && Object.isFrozen(source.summary) && Object.isFrozen(first)
    && Object.isFrozen(first.sample) && Object.isFrozen(first.parent) && Object.isFrozen(first.children));
  assert.throws(() => { (first.sample as unknown as number[])[2] = 77; });
  assert.throws(() => { (first.children as number[]).push(999); });
  assert.throws(() => { (source.summary as { roots: number }).roots = 99; });
  assert.equal(JSON.stringify(asset), before);
  assert.deepEqual(record(source, 20).children, [40, 30]);
});

test('invalid sample identities and child offsets fail without returning a guessed or partial record', async () => {
  const source = index(await local(forest));
  for (const id of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '20', null, {}, 20n, Symbol('fixture')]) {
    const result = inspectTraceSample(source, id); assert.equal(result.ok, false); assert.equal(result.record, undefined);
    assert.ok(Object.isFrozen(result.errors));
  }
  assert.equal(inspectTraceSample(source, 888).ok, false);
  for (const offset of [-1, .5, NaN, Infinity, Number.MAX_SAFE_INTEGER, '0' as unknown as number]) {
    assert.equal(inspectTraceSample(source, 20, offset).ok, false);
  }
  assert.equal(inspectTraceSample(source, 99, 1).ok, false);
  assert.equal(inspectTraceSample(source, 20, 2).ok, false);
  assert.deepEqual(record(source, 20).sample, [20, 3, .1, .2, .3, 9, 10]);
});

test('large child inventories paginate by source order with a fixed bounded result size', async () => {
  const ids = Array.from({ length: 47 }, (_, i) => 1000 - i * 7);
  const asset = await local(ids.map((id, i) => `${id} 2 ${i + 1} 0 0 1 400`).join('\n') + '\n400 1 0 0 0 8 -1\n');
  const source = index(asset), seen: number[] = [];
  assert.equal(TRACE_CHILD_PAGE_SIZE, 20); assert.equal(source.firstSampleId, ids[0]);
  for (const offset of [0, 20, 40]) {
    const page = record(source, 400, offset);
    assert.deepEqual(page.children, ids.slice(offset, offset + TRACE_CHILD_PAGE_SIZE));
    assert.ok(page.children.length <= TRACE_CHILD_PAGE_SIZE);
    assert.equal(page.totalChildren, 47); assert.equal(page.childOffset, offset);
    assert.equal(page.hasPreviousPage, offset > 0); assert.equal(page.hasNextPage, offset < 40);
    seen.push(...page.children);
  }
  assert.deepEqual(seen, ids);
  assert.deepEqual(record(source, 400, 5).children, ids.slice(5, 25));
  assert.equal(inspectTraceSample(source, 400, 47).ok, false);
  assert.equal(inspectTraceSample(source, 400, 60).ok, false);
});

test('separate source checksums keep overlapping sample identifiers and values independent', async () => {
  const first = index(await local('10 1 0 0 0 1 -1\n20 2 1 0 0 2 10\n'));
  const second = index(await local('10 1 100 0 0 5 -1\n20 2 200 0 0 9 10\n'));
  assert.notEqual(first.assetSha256, second.assetSha256); assert.notEqual(first.atlasId, second.atlasId);
  assert.equal(record(first, 20).sample[2], 1); assert.equal(record(second, 20).sample[2], 200);
  assert.equal(record(first, 20).parent?.[5], 1); assert.equal(record(second, 20).parent?.[5], 5);
});

test('the actual bundled reconstruction retains every original sample, parent and child identity', async () => {
  const atlas = JSON.parse(await readFile(new URL('../public/atlas-neuron/atlas.json', import.meta.url), 'utf8')) as Atlas;
  const bytes = await readFile(new URL('../public/atlas-neuron/nmo130632-standardized.swc.txt', import.meta.url));
  const parsed = await parseSourceTrace(Uint8Array.from(bytes).buffer, atlas); assert.ok(parsed.ok && parsed.asset);
  const source = index(parsed.asset), nodes = parsed.asset.nodes;
  const children = new Map(nodes.map((node) => [node[0], [] as number[]]));
  const byId = new Map(nodes.map((node) => [node[0], node]));
  for (const node of nodes) if (node[6] !== -1) children.get(node[6])!.push(node[0]);
  assert.equal(source.summary.samples, 11650); assert.equal(source.summary.parentLinks, 11649);
  assert.equal(source.summary.roots, 1); assert.equal(source.summary.isolatedSamples, 0);
  assert.equal(source.summary.samplesWithoutChildren, [...children.values()].filter((list) => list.length === 0).length);
  assert.equal(source.summary.branchSamples, [...children.values()].filter((list) => list.length > 1).length);
  for (const [row, node] of nodes.entries()) {
    const actual = record(source, node[0]); assert.deepEqual(actual.sample, node);
    assert.deepEqual(actual.parent, node[6] === -1 ? null : byId.get(node[6]));
    assert.deepEqual(actual.children, children.get(node[0])!.slice(0, TRACE_CHILD_PAGE_SIZE));
    assert.equal(actual.totalChildren, children.get(node[0])!.length); assert.equal(actual.rowIndex, row);
    assert.equal(actual.previousSampleId, nodes[row - 1]?.[0] ?? null); assert.equal(actual.nextSampleId, nodes[row + 1]?.[0] ?? null);
  }
});

test('a long forward-reference chain is indexed iteratively without ancestor expansion or recursion', async () => {
  const count = 20000;
  const text = Array.from({ length: count }, (_, i) => {
    const id = count - i;
    return `${id} 0 ${id % 1000} ${Math.floor(id / 1000)} 0 0 ${id === 1 ? -1 : id - 1}`;
  }).join('\n');
  const source = index(await local(text));
  assert.deepEqual(source.summary, { samples: count, parentLinks: count - 1, roots: 1, isolatedSamples: 0,
    samplesWithoutChildren: 1, branchSamples: 0 });
  assert.equal(source.firstSampleId, count);
  assert.deepEqual(record(source, 1).children, [2]); assert.equal(record(source, 1).parent, null);
  assert.equal(record(source, 1).rowIndex, count - 1); assert.equal(record(source, 1).nextSampleId, null);
  assert.equal(record(source, 10000).parent?.[0], 9999); assert.deepEqual(record(source, 10000).children, [10001]);
  assert.deepEqual(record(source, count).children, []); assert.equal(record(source, count).parent?.[0], count - 1);
});
