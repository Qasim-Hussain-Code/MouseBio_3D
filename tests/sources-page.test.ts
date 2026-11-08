import assert from 'node:assert/strict';
import fs from 'node:fs';
import { after, afterEach, test } from 'node:test';
import { Window } from 'happy-dom';
import { evidenceCounts, levelRows, linkOfCitation, matchesSearch, noteOfCitation, structureRows, workRows } from '../src/domain/sources-index';
import { everyJourneyLevel, journeyLevels, JOURNEY_TAILS, type JourneyTissue } from '../src/domain/scale-journey';
import type { Atlas } from '../src/domain/types';

const living = JSON.parse(fs.readFileSync('public/atlas-living/atlas.json', 'utf8')) as Atlas;

test('a citation links to its DOI without the punctuation after it', () => {
  assert.equal(linkOfCitation('Luger K. Crystal structure. Nature 1997. doi:10.1038/38444'), 'https://doi.org/10.1038/38444');
  assert.equal(linkOfCitation('Ueda J. Testis histone. Cell Rep 2017. doi:10.1016/j.celrep.2016.12.065. Coordinates from the Protein Data Bank.'), 'https://doi.org/10.1016/j.celrep.2016.12.065');
  assert.equal(linkOfCitation('Mutsaers SE. Int J Biochem 2004;36(1):9-16. doi:10.1016/s1357-2725(03)00242-5'), 'https://doi.org/10.1016/s1357-2725(03)00242-5');
  assert.equal(linkOfCitation('A book. McGraw-Hill, 1966; web edition at https://www.informatics.jax.org/greenbook/'), 'https://www.informatics.jax.org/greenbook/');
  assert.equal(linkOfCitation("O'Connell KE. Comp Med 2015;65(2):96-113. PMID 25926395"), 'https://pubmed.ncbi.nlm.nih.gov/25926395/');
  assert.equal(linkOfCitation('Greene EC. Anatomy of the Rat. 1935.'), null);
});

test('every structure of the living mouse is listed under one kind of evidence with what it follows', () => {
  const rows = structureRows(living.structures);
  assert.equal(rows.length, living.structures.length);
  const counts = evidenceCounts(rows);
  assert.equal(counts.source + counts.traced + counts.simulated, rows.length);
  assert.equal(new Set(rows.map((row) => row.id)).size, rows.length);
  for (const row of rows) assert.ok(row.basis.length > 0, `${row.name} follows nothing`);
  const simulated = rows.filter((row) => row.evidence === 'simulated');
  for (const row of simulated) assert.match(row.label, /^Simulated/, row.name);
});

test('every work cited can be followed or says why not, and none is listed twice', () => {
  const works = workRows(structureRows(living.structures), levelRows());
  assert.equal(new Set(works.map((work) => work.citation)).size, works.length);
  for (const work of works) {
    assert.ok(work.structures.length + work.levels.length > 0, work.citation);
    if (work.link === null) assert.ok(work.note !== null || /Transactions|Protein Data Bank|Academic Press|Wiley|Press/.test(work.citation), `No way to follow: ${work.citation}`);
    if (work.link) assert.doesNotThrow(() => new URL(work.link!), work.citation);
  }
  const rat = works.find((work) => work.citation.startsWith('Greene EC'));
  if (rat) assert.match(noteOfCitation(rat.citation)!, /could not be read/);
});

test('the deep levels are all listed, each with its kind of knowledge and what it follows', () => {
  const ids = new Set(everyJourneyLevel().map((level) => level.id));
  const tissues: JourneyTissue[] = ['skin', 'muscle', 'liver', 'whisker'];
  for (const tissue of tissues) for (const tail of JOURNEY_TAILS) for (const level of journeyLevels(tissue, tail)) assert.ok(ids.has(level.id), `${tissue} ${tail} ${level.id}`);
  for (const row of levelRows()) {
    assert.ok(row.label.length > 0, row.id);
    assert.ok(row.caption.length > 0, row.id);
  }
});

test('a search finds a row by any of its words, in any order', () => {
  assert.equal(matchesSearch('', 'anything'), true);
  assert.equal(matchesSearch('artery femoral', 'Femoral arteries', 'Along the thigh'), true);
  assert.equal(matchesSearch('femoral vein', 'Femoral arteries'), false);
});

const dom = new Window({ url: 'http://localhost:5173' });
const globals = {
  window: dom, document: dom.document, navigator: dom.navigator, HTMLElement: dom.HTMLElement, HTMLInputElement: dom.HTMLInputElement, HTMLTextAreaElement: dom.HTMLTextAreaElement,
  Node: dom.Node, Event: dom.Event, MouseEvent: dom.MouseEvent, KeyboardEvent: dom.KeyboardEvent, MutationObserver: dom.MutationObserver, getComputedStyle: dom.getComputedStyle.bind(dom),
};
for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
const { createElement } = await import('react');
const { cleanup, fireEvent, render } = await import('@testing-library/react');
const { SourcesPage } = await import('../src/components/SourcesPage');

afterEach(cleanup);
after(() => dom.close());

const summary = {
  specimen: { description: 'A specimen', scientificName: 'Mus musculus', sex: 'male', strain: 'A strain', age: 'Unknown', mass: 'Unknown', scope: 'One animal' },
  source: { citationLabel: 'A citation', license: 'CC BY-SA 4.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/', attribution: 'Attribution words.' },
  sourceLink: 'https://doi.org/10.1088/0031-9155/52/3/003',
};
const open = () => render(createElement(SourcesPage, { atlas: living, summary }));

test('the page opens on a summary that says how much is simulated and what is illustrative', () => {
  const view = open();
  assert.ok(view.getByRole('heading', { name: 'Sources and evidence' }));
  assert.ok(view.getByText('What is illustrative'));
  assert.ok(view.getAllByText(/^Simulated$/).length > 0 || view.container.textContent!.includes('Simulated'));
  assert.ok(view.container.textContent!.includes(String(living.structures.filter((structure) => structure.evidence === 'simulated').length)));
});

test('structures can be narrowed by kind of evidence and by words, and each shows its works with links', () => {
  const view = open();
  fireEvent.click(view.getByRole('tab', { name: 'Structures' }));
  const simulated = living.structures.filter((structure) => structure.evidence === 'simulated').length;
  fireEvent.click(view.getByRole('button', { name: new RegExp(`^Simulated ${simulated}$`) }));
  assert.equal(view.getByRole('status').textContent, `${simulated} of ${living.structures.length}`);
  fireEvent.change(view.getByRole('searchbox', { name: 'Search structures' }), { target: { value: 'femoral arteries' } });
  const row = view.getByText('Femoral arteries').closest('details')!;
  assert.ok(row.querySelector('a[href^="https://doi.org/"]'), 'A femoral artery follows a work that can be followed.');
  fireEvent.click(view.getByRole('button', { name: new RegExp(`^All ${living.structures.length}$`) }));
  fireEvent.change(view.getByRole('searchbox', { name: 'Search structures' }), { target: { value: 'no such structure' } });
  assert.match(view.getByRole('status').textContent!, /^0 of /);
});

test('the works, deep levels, procedures and licences each have a page', () => {
  const view = open();
  fireEvent.click(view.getByRole('tab', { name: 'Works cited' }));
  assert.ok(view.getAllByRole('link').some((link) => link.getAttribute('href') === 'https://doi.org/10.1088/0031-9155/52/3/003'));
  fireEvent.click(view.getByRole('tab', { name: 'Deep levels' }));
  assert.ok(view.getByRole('searchbox', { name: 'Search levels' }));
  assert.ok(view.getAllByText(/Measured in a crystal/).length > 0);
  fireEvent.click(view.getByRole('tab', { name: 'Procedures' }));
  for (const name of ['Necropsy', 'Surgery', 'Blood sampling', 'Injection']) assert.ok(view.getByRole('heading', { name }));
  assert.ok(view.getByText('Tie the femoral artery'));
  fireEvent.click(view.getByRole('tab', { name: 'Licences' }));
  assert.ok(view.getByRole('link', { name: 'CC BY-SA 4.0' }));
});
