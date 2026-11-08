import { useMemo, useState } from 'react';
import { DIVISION_NOTE, EVIDENCE_NAMES, EVIDENCE_NOTES } from '../domain/evidence';
import { LAB_EXERCISES, LAB_GROUPS } from '../domain/lab-exercises';
import { EVIDENCE_LABEL, JOURNEY_NOTICE, type JourneyEvidence } from '../domain/scale-journey';
import { evidenceCounts, ILLUSTRATIVE_THINGS, levelRows, linkOfCitation, matchesSearch, noteOfCitation, NOT_CHECKED, structureRows, workRows, type StructureRow } from '../domain/sources-index';
import type { Atlas, StructureEvidence } from '../domain/types';

type SourcesTab = 'brief' | 'structures' | 'works' | 'levels' | 'procedures' | 'licences';
const TABS: readonly (readonly [SourcesTab, string])[] = [['brief', 'In brief'], ['structures', 'Structures'], ['works', 'Works cited'], ['levels', 'Deep levels'], ['procedures', 'Procedures'], ['licences', 'Licences']];
const EVIDENCE_ORDER: readonly StructureEvidence[] = ['source', 'traced', 'simulated'];
const LEVEL_ORDER: readonly JourneyEvidence[] = ['simulated', 'measured-elsewhere', 'calculated', 'schematic'];

/** The specimen and the source of the active reference, as the reference declares them. */
export interface SourcesSummary {
  readonly specimen: { readonly description: string; readonly scientificName: string; readonly sex: string; readonly strain: string; readonly age: string; readonly mass: string; readonly scope: string };
  readonly source: { readonly citationLabel: string; readonly license: string; readonly licenseUrl?: string | null; readonly attribution: string };
  readonly sourceLink?: string | null;
}

function Citation({ text }: { readonly text: string }) {
  const link = linkOfCitation(text);
  const note = noteOfCitation(text);
  return <>{link ? <a href={link} target="_blank" rel="noreferrer">{text}</a> : text}{note && <small className="sources-note">{note}</small>}</>;
}

const Basis = ({ works }: { readonly works: readonly string[] }) => works.length
  ? <ul className="sources-basis">{works.map((work) => <li key={work}><Citation text={work} /></li>)}</ul>
  : <p className="sources-none">No published work is declared for this entry beyond its source.</p>;

function Search({ value, onChange, label }: { readonly value: string; readonly onChange: (value: string) => void; readonly label: string }) {
  return <input className="sources-search" type="search" value={value} placeholder={label} aria-label={label} onChange={(event) => onChange(event.target.value)} />;
}

function Choice<T extends string>({ value, options, onChange, label }: { readonly value: T | 'all'; readonly options: readonly (readonly [T | 'all', string])[]; readonly onChange: (value: T | 'all') => void; readonly label: string }) {
  return <div className="sources-choice" role="group" aria-label={label}>{options.map(([id, words]) => <button key={id} type="button" aria-pressed={value === id} onClick={() => onChange(id)}>{words}</button>)}</div>;
}

function EvidenceShare({ rows }: { readonly rows: readonly StructureRow[] }) {
  const counts = evidenceCounts(rows);
  return <div className="sources-share">
    <div className="sources-share__bar" aria-hidden="true">{EVIDENCE_ORDER.map((kind) => counts[kind] > 0 && <span key={kind} className={`is-${kind}`} style={{ flexGrow: counts[kind] }} />)}</div>
    <dl className="sources-share__list">{EVIDENCE_ORDER.map((kind) => <div key={kind}><dt><i className={`is-${kind}`} /><strong>{counts[kind]}</strong> {EVIDENCE_NAMES[kind]}</dt><p>{EVIDENCE_NOTES[kind]}</p></div>)}</dl>
  </div>;
}

function StructuresTab({ rows }: { readonly rows: readonly StructureRow[] }) {
  const [words, setWords] = useState('');
  const [kind, setKind] = useState<StructureEvidence | 'all'>('all');
  const counts = evidenceCounts(rows);
  const shown = rows.filter((row) => (kind === 'all' || row.evidence === kind) && matchesSearch(words, row.name, row.description));
  return <>
    <div className="sources-filter">
      <Search value={words} onChange={setWords} label="Search structures" />
      <Choice value={kind} onChange={setKind} label="Kind of evidence" options={[['all', `All ${rows.length}`], ...EVIDENCE_ORDER.map((id): readonly [StructureEvidence, string] => [id, `${EVIDENCE_NAMES[id]} ${counts[id]}`])]} />
    </div>
    <p className="sources-count" role="status">{shown.length} of {rows.length}</p>
    <ul className="sources-rows">{shown.map((row) => <li key={row.id}>
      <details><summary><span>{row.name}</span><em className={`is-${row.evidence}`}>{row.label}</em></summary>
        {row.description && <p>{row.description}</p>}
        {row.label.includes('division estimated') && <p>{DIVISION_NOTE}</p>}
        <Basis works={row.basis} />
      </details>
    </li>)}</ul>
  </>;
}

function WorksTab({ rows }: { readonly rows: readonly StructureRow[] }) {
  const [words, setWords] = useState('');
  const levels = useMemo(() => levelRows(), []);
  const works = useMemo(() => workRows(rows, levels), [rows, levels]);
  const shown = works.filter((work) => matchesSearch(words, work.citation, ...work.structures, ...work.levels));
  return <>
    <div className="sources-filter"><Search value={words} onChange={setWords} label="Search works, or what follows them" /></div>
    <p className="sources-count" role="status">{shown.length} of {works.length} works, the most used first</p>
    <ol className="sources-works">{shown.map((work) => <li key={work.citation}>
      <Citation text={work.citation} />
      <details><summary>{[work.structures.length ? `${work.structures.length} structure${work.structures.length === 1 ? '' : 's'}` : '', work.levels.length ? `${work.levels.length} deep level${work.levels.length === 1 ? '' : 's'}` : ''].filter(Boolean).join(', ')}</summary>
        <p>{[...work.structures, ...work.levels].join(', ')}.</p>
      </details>
    </li>)}</ol>
  </>;
}

function LevelsTab() {
  const [words, setWords] = useState('');
  const [kind, setKind] = useState<JourneyEvidence | 'all'>('all');
  const levels = useMemo(() => levelRows(), []);
  const shown = levels.filter((level) => (kind === 'all' || level.evidence === kind) && matchesSearch(words, level.name, level.caption));
  return <>
    <p>{JOURNEY_NOTICE}</p>
    <div className="sources-filter">
      <Search value={words} onChange={setWords} label="Search levels" />
      <Choice value={kind} onChange={setKind} label="Kind of knowledge" options={[['all', `All ${levels.length}`], ...LEVEL_ORDER.map((id): readonly [JourneyEvidence, string] => [id, `${EVIDENCE_LABEL[id]} ${levels.filter((level) => level.evidence === id).length}`])]} />
    </div>
    <p className="sources-count" role="status">{shown.length} of {levels.length}</p>
    <ul className="sources-rows">{shown.map((level) => <li key={level.id}>
      <details><summary><span>{level.name}</span><em className={`is-${level.evidence}`}>{level.label}</em></summary>
        <p>{level.caption}</p>
        <Basis works={level.basis} />
      </details>
    </li>)}</ul>
  </>;
}

function ProceduresTab() {
  return <>
    <p>Each tutorial follows the outline of the published procedure named beside it. The practice model differs from the procedure in the ways each one states, and its instruments, hands and tissue responses are illustrative. {NOT_CHECKED[2]}</p>
    {LAB_GROUPS.map((group) => <section key={group}><h3>{group}</h3>
      <ul className="sources-rows">{LAB_EXERCISES.filter((exercise) => exercise.group === group).map((exercise) => <li key={exercise.id}>
        <details><summary><span>{exercise.name}</span><em>{exercise.alive ? 'Living animal in the source' : 'After death in the source'}</em></summary>
          <p>{exercise.about}</p>
          {[exercise.source, ...(exercise.also ?? [])].map((source) => <p key={source.doi}><a href={`https://doi.org/${source.doi}`} target="_blank" rel="noreferrer">{source.citation}, doi:{source.doi}</a></p>)}
          <ol className="sources-steps">{exercise.steps.map((step) => <li key={step.text}>{step.text}</li>)}</ol>
        </details>
      </li>)}</ul>
    </section>)}
  </>;
}

/** The page behind the information button. The working views stay free of it, so everything they leave unsaid is said here. */
export function SourcesPage({ atlas, summary }: { readonly atlas: Atlas; readonly summary: SourcesSummary }) {
  const [tab, setTab] = useState<SourcesTab>('brief');
  const rows = useMemo(() => structureRows(atlas.structures), [atlas.structures]);
  return <div className="sources-page">
    <h2>Sources and evidence</h2>
    <div className="sources-tabs" role="tablist" aria-label="Sources and evidence">{TABS.map(([id, words]) => <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{words}</button>)}</div>

    {tab === 'brief' && <div role="tabpanel" aria-label="In brief">
      <p>MouseBio_3D is a digital laboratory mouse maintained by Qasim Hussain. Each reference keeps its own source identifiers and coordinate frame, and switching references does not register their anatomies. The reference now open is <strong>{atlas.title}</strong>, with {rows.length} structures.</p>
      <EvidenceShare rows={rows} />
      <h3>Declared specimen</h3>
      <p>{summary.specimen.description}</p>
      <dl className="sources-specimen"><dt>Species</dt><dd>{summary.specimen.scientificName}</dd><dt>Sex</dt><dd>{summary.specimen.sex}</dd><dt>Strain</dt><dd>{summary.specimen.strain}</dd><dt>Age</dt><dd>{summary.specimen.age}</dd><dt>Mass</dt><dd>{summary.specimen.mass}</dd><dt>Coverage</dt><dd>{summary.specimen.scope}</dd></dl>
      <h3>What is illustrative</h3>
      <ul>{ILLUSTRATIVE_THINGS.map((thing) => <li key={thing}>{thing}</li>)}</ul>
      <h3>What the data support</h3>
      <ul>{atlas.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}</ul>
      <p>Magnification changes the view only, and no microscopic geometry is generated by zoom. Below the layers of the model the levels are representative, and each says what kind of knowledge it shows. Experimental comparisons use your imported observations on identical reference geometry.</p>
      <h3>What has not been checked</h3>
      <ul>{NOT_CHECKED.map((thing) => <li key={thing}>{thing}</li>)}</ul>
      <h3>Coordinates</h3>
      <p>Declared source units: {typeof atlas.coordinateFrame.sourceUnits === 'string' ? atlas.coordinateFrame.sourceUnits : 'Unknown'}. Declared asset units: {typeof atlas.coordinateFrame.assetUnits === 'string' ? atlas.coordinateFrame.assetUnits : 'Unknown'}. The viewer centres the object and turns it for presentation. Anatomical axis labels, calibrated measurements and spatial registration remain disabled.</p>
      <h3>Privacy</h3>
      <p className="privacy-method">Imported research files stay in memory on this device, and reloading clears them. No analytics, remote data service or automatic upload is used.</p>
    </div>}

    {tab === 'structures' && <div role="tabpanel" aria-label="Structures"><StructuresTab rows={rows} /></div>}
    {tab === 'works' && <div role="tabpanel" aria-label="Works cited"><WorksTab rows={rows} /></div>}
    {tab === 'levels' && <div role="tabpanel" aria-label="Deep levels"><LevelsTab /></div>}
    {tab === 'procedures' && <div role="tabpanel" aria-label="Procedures"><ProceduresTab /></div>}
    {tab === 'licences' && <div role="tabpanel" aria-label="Licences">
      <h3>This reference</h3>
      <p>{summary.source.citationLabel}. {summary.sourceLink && <a href={summary.sourceLink} target="_blank" rel="noreferrer">Publication</a>} {summary.source.licenseUrl && <a href={summary.source.licenseUrl} target="_blank" rel="noreferrer">{summary.source.license}</a>}</p>
      <p>Declared anatomical license: {summary.source.license}. {summary.source.attribution}</p>
      <h3>The application</h3>
      <p>Original source code is MIT, and original documentation is CC BY 4.0. Digimouse-derived geometry and metadata remain CC BY-SA 4.0, and other references keep the licenses they declare. The full notices are in <a href="THIRD_PARTY_NOTICES.txt" target="_blank" rel="noreferrer">the distribution notices</a>.</p>
    </div>}
  </div>;
}
