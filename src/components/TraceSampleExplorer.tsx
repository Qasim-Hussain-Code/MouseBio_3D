import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { Atlas } from '../domain/types';
import { isLocalTraceAsset, type LocalTraceAsset } from '../domain/local-trace';
import { isSourceTraceAtlas, type SourceTraceAsset } from '../domain/source-trace';
import { createTraceInspection, inspectTraceSample, TRACE_CHILD_PAGE_SIZE, type TraceInspectionIndex } from '../domain/trace-inspection';
import { loadSourceTraceAsset } from '../viewer/source-trace-loader';

type Props = {
  atlas: Atlas;
  localTrace?: LocalTraceAsset;
  viewerReady: boolean;
  onFocusSample: (sampleId: number) => boolean;
};
type Selection = { index: TraceInspectionIndex; sampleId: number; childOffset: number };

/** Inspect retained numeric source records, without assigning biological meaning or units. */
export function TraceSampleExplorer({ atlas, localTrace, viewerReady, onFocusSample }: Props) {
  const heading = useId(), input = useId();
  const [loadedSource, setLoadedSource] = useState<SourceTraceAsset | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [query, setQuery] = useState('');
  const [queryError, setQueryError] = useState('');
  const [focusStatus, setFocusStatus] = useState('');
  const [selection, setSelection] = useState<Selection | null>(null);
  const epoch = useRef(0);
  const pending = useRef<AbortController | null>(null);
  const local = isLocalTraceAsset(localTrace) && localTrace.atlas === atlas ? localTrace : null;
  const bundled = isSourceTraceAtlas(atlas);
  const asset = local ?? (loadedSource?.atlas === atlas ? loadedSource : null);
  const checked = useMemo(() => asset ? createTraceInspection(asset) : null, [asset]);
  const index = checked?.ok ? checked.index : undefined;
  const selected = index ? selection?.index === index ? selection : { index, sampleId: index.firstSampleId, childOffset: 0 } : null;
  const inspected = useMemo(() => selected ? inspectTraceSample(selected.index, selected.sampleId, selected.childOffset) : null,
    [selected?.index, selected?.sampleId, selected?.childOffset]);
  const record = inspected?.ok ? inspected.record : undefined;

  useEffect(() => {
    epoch.current++;
    pending.current?.abort(); pending.current = null;
    setLoadedSource(null); setLoading(false); setLoadError(''); setSelection(null);
    setQuery(''); setQueryError(''); setFocusStatus('');
    return () => { epoch.current++; pending.current?.abort(); pending.current = null; };
  }, [atlas, localTrace]);
  useEffect(() => { setQuery(index ? String(index.firstSampleId) : ''); setQueryError(''); setFocusStatus(''); }, [index]);

  if (!local && !bundled) return null;
  const openSource = async () => {
    const attempt = ++epoch.current;
    pending.current?.abort();
    const controller = new AbortController(); pending.current = controller;
    setLoading(true); setLoadError('');
    try {
      const result = await loadSourceTraceAsset(atlas, controller.signal);
      if (attempt === epoch.current && !controller.signal.aborted && result.atlas === atlas) setLoadedSource(result);
    } catch {
      if (attempt === epoch.current && !controller.signal.aborted) setLoadError('The source samples could not be read or verified. Try again.');
    } finally {
      if (attempt === epoch.current && !controller.signal.aborted) { setLoading(false); pending.current = null; }
    }
  };
  const show = (sampleId: number, childOffset = 0) => {
    if (!index) return;
    const result = inspectTraceSample(index, sampleId, childOffset);
    if (!result.ok || !result.record) { setQueryError('Enter a positive source sample ID present in this trace.'); return; }
    setSelection({ index, sampleId, childOffset }); setQuery(String(sampleId)); setQueryError(''); setFocusStatus('');
  };
  const submit = () => {
    if (!/^[0-9]+$/.test(query) || !Number.isSafeInteger(Number(query)) || Number(query) <= 0) {
      setQueryError('Enter a positive source sample ID present in this trace.'); return;
    }
    show(Number(query));
  };
  const focus = () => {
    if (!record || !viewerReady) return;
    let focused = false;
    try { focused = onFocusSample(record.sample[0]); } catch {}
    setFocusStatus(focused ? 'Framed the retained incident links.' : 'No visible retained incident links have a focusable extent.');
  };

  return <section className="inspector-section trace-sample-explorer" aria-labelledby={heading}>
    <h3 id={heading}>Source sample explorer</h3>
    <p>Inspect original numeric sample IDs and explicit parent links. Sample IDs remain graph identities and are not separate experimental structures.</p>
    {!asset && bundled && <><button className="secondary-button" disabled={loading} onClick={() => void openSource()}>{loading ? 'Reading source samples' : 'Inspect source samples'}</button>
      <p>Reads the bundled, checksum-bound numeric reference on this device. No research observations are transmitted.</p></>}
    {loading && <p role="status">Checking source sample records.</p>}
    {loadError && <p role="alert">{loadError}</p>}
    {checked && !checked.ok && <p role="alert">The trace records could not be indexed for inspection.</p>}
    {index && record && <>
      <details><summary>Numerical graph counts</summary><dl>
        <dt>Samples</dt><dd>{index.summary.samples.toLocaleString('en-US')}</dd>
        <dt>Parent links</dt><dd>{index.summary.parentLinks.toLocaleString('en-US')}</dd>
        <dt>Roots</dt><dd>{index.summary.roots.toLocaleString('en-US')}</dd>
        <dt>Isolated samples</dt><dd>{index.summary.isolatedSamples.toLocaleString('en-US')}</dd>
        <dt>Samples without children</dt><dd>{index.summary.samplesWithoutChildren.toLocaleString('en-US')}</dd>
        <dt>Samples with multiple children</dt><dd>{index.summary.branchSamples.toLocaleString('en-US')}</dd>
      </dl></details>
      <form onSubmit={(event) => { event.preventDefault(); submit(); }} className="trace-sample-query">
        <label htmlFor={input}>Source sample ID</label><input id={input} inputMode="numeric" autoComplete="off" maxLength={16} value={query} onChange={(event) => setQuery(event.target.value)} />
        <button className="secondary-button" type="submit">Inspect sample</button>
      </form>
      {queryError && <p role="alert">{queryError}</p>}
      <dl className="trace-sample-record"><dt>Selected source ID</dt><dd>{String(record.sample[0])}</dd>
        <dt>Source row</dt><dd>{record.rowIndex + 1} of {index.summary.samples}</dd>
        <dt>Source type code</dt><dd>{String(record.sample[1])}</dd>
        <dt>Source X</dt><dd>{String(record.sample[2])}</dd><dt>Source Y</dt><dd>{String(record.sample[3])}</dd><dt>Source Z</dt><dd>{String(record.sample[4])}</dd>
        <dt>Source radius field</dt><dd>{String(record.sample[5])}</dd><dt>Parent source ID</dt><dd>{record.parent ? String(record.parent[0]) : 'None (-1 in source)'}</dd>
      </dl>
      <p>Coordinates and radius use unknown source units. The radius field is not a calibrated diameter or display thickness. Source type codes are not independently reviewed biological classifications.</p>
      <div className="trace-sample-actions"><button className="secondary-button" disabled={record.previousSampleId == null} onClick={() => record.previousSampleId != null && show(record.previousSampleId)}>Previous source row</button>
        <button className="secondary-button" disabled={record.nextSampleId == null} onClick={() => record.nextSampleId != null && show(record.nextSampleId)}>Next source row</button>
        <button className="secondary-button" disabled={!record.parent} onClick={() => record.parent && show(record.parent[0])}>Inspect parent</button></div>
      <h4>Declared children ({record.totalChildren})</h4>
      {record.totalChildren === 0 ? <p>No samples declare this ID as their parent.</p> : <>
        <p>Showing {record.childOffset + 1} to {record.childOffset + record.children.length} of {record.totalChildren}, in source row order.</p>
        <ul className="trace-child-list">{record.children.map((id) => <li key={id}><button className="secondary-button" onClick={() => show(id)} aria-label={`Inspect child sample ${id}`}>{String(id)}</button></li>)}</ul>
        <div className="trace-sample-actions"><button className="secondary-button" disabled={!record.hasPreviousPage} onClick={() => show(record.sample[0], Math.max(0, record.childOffset - TRACE_CHILD_PAGE_SIZE))}>Previous children</button>
          <button className="secondary-button" disabled={!record.hasNextPage} onClick={() => show(record.sample[0], record.childOffset + record.children.length)}>Next children</button></div>
      </>}
      <button className="secondary-button" disabled={!viewerReady} onClick={focus}>Focus incident links</button>
      {focusStatus && <p role="status">{focusStatus}</p>}
      <p>Focus frames existing retained incident links without adding markers or changing clipping, visibility, background or observations. Isolated, coincident, hidden or fully clipped links may have no focusable extent.</p>
      <p>Graph counts and parent relationships do not establish cells, synapses or functional connectivity. Inspection is transient and is not included in saved views.</p>
    </>}
  </section>;
}
