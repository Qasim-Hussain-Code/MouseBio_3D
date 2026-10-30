import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { Atlas } from '../domain/types';
import { isSourcePolylineAtlas, type SourcePolylineAsset } from '../domain/source-polyline';
import { createPolylineInspection, inspectPolylinePath, inspectPolylineVertex, POLYLINE_POINT_PAGE_SIZE, POLYLINE_INCIDENT_PAGE_SIZE, type PolylineInspectionIndex } from '../domain/polyline-inspection';
import { loadSourcePolylineAsset } from '../viewer/source-polyline-loader';

type Props = { atlas: Atlas; viewerReady: boolean; onFocusPath: (pathRowIndex: number) => boolean };
type PathSelection = { index: PolylineInspectionIndex; pathId: number; pointOffset: number };
type VertexSelection = { index: PolylineInspectionIndex; vertexId: number; pathOffset: number };

/** Inspect original numerical paths and explicit topology without inferred anatomy. */
export function SourcePolylineExplorer({ atlas, viewerReady, onFocusPath }: Props) {
  const heading = useId(), pathInput = useId();
  const [loaded, setLoaded] = useState<SourcePolylineAsset | null>(null);
  const [loading, setLoading] = useState(false), [loadError, setLoadError] = useState('');
  const [selection, setSelection] = useState<PathSelection | null>(null);
  const [vertexSelection, setVertexSelection] = useState<VertexSelection | null>(null);
  const [draft, setDraft] = useState<{ index: PolylineInspectionIndex; value: string } | null>(null);
  const [queryError, setQueryError] = useState(''), [focusStatus, setFocusStatus] = useState('');
  const pending = useRef<AbortController | null>(null), epoch = useRef(0);
  const asset = loaded?.atlas === atlas ? loaded : null;
  const checked = useMemo(() => asset ? createPolylineInspection(asset) : null, [asset]);
  const index = checked?.ok ? checked.index : undefined;
  const selected = index ? selection?.index === index ? selection : { index, pathId: index.firstPathId, pointOffset: 0 } : null;
  const inspected = useMemo(() => selected ? inspectPolylinePath(selected.index, selected.pathId, selected.pointOffset) : null,
    [selected?.index, selected?.pathId, selected?.pointOffset]);
  const record = inspected?.ok ? inspected.record : undefined;
  const vertex = useMemo(() => vertexSelection && vertexSelection.index === index ? inspectPolylineVertex(vertexSelection.index, vertexSelection.vertexId, vertexSelection.pathOffset) : null, [index, vertexSelection]);
  const vertexRecord = vertex?.ok ? vertex.record : undefined;
  const query = draft && draft.index === index ? draft.value : index ? String(index.firstPathId) : '';

  useEffect(() => {
    epoch.current++; pending.current?.abort(); pending.current = null;
    setLoaded(null); setLoading(false); setLoadError(''); setSelection(null); setVertexSelection(null);
    setDraft(null); setQueryError(''); setFocusStatus('');
    return () => { epoch.current++; pending.current?.abort(); pending.current = null; };
  }, [atlas]);
  if (!isSourcePolylineAtlas(atlas)) return null;
  const open = async () => {
    const attempt = ++epoch.current; pending.current?.abort();
    const controller = new AbortController(); pending.current = controller;
    setLoading(true); setLoadError('');
    try {
      const result = await loadSourcePolylineAsset(atlas, controller.signal);
      if (attempt === epoch.current && !controller.signal.aborted && result.atlas === atlas) setLoaded(result);
    } catch {
      if (attempt === epoch.current && !controller.signal.aborted) setLoadError('The source paths could not be read or verified. Try again.');
    } finally { if (attempt === epoch.current && !controller.signal.aborted) { setLoading(false); pending.current = null; } }
  };
  const show = (pathId: number, pointOffset = 0) => {
    if (!index) return;
    const next = inspectPolylinePath(index, pathId, pointOffset);
    if (!next.ok || !next.record) { setQueryError('Enter a nonnegative source path ID present in this graph.'); return; }
    setSelection({ index, pathId, pointOffset }); setDraft({ index, value: String(pathId) }); setQueryError(''); setFocusStatus('');
  };
  const submit = () => {
    if (!/^[0-9]+$/.test(query) || !Number.isSafeInteger(Number(query))) { setQueryError('Enter a nonnegative source path ID present in this graph.'); return; }
    show(Number(query));
  };
  const showVertex = (vertexId: number, pathOffset = 0) => {
    if (index && inspectPolylineVertex(index, vertexId, pathOffset).ok) setVertexSelection({ index, vertexId, pathOffset });
  };
  const focus = () => {
    if (!record || !viewerReady) return;
    let focused = false; try { focused = onFocusPath(record.pathRowIndex); } catch {}
    setFocusStatus(focused ? 'Framed the retained source path.' : 'This source path has no visible retained segments with a focusable extent.');
  };
  return <section className="inspector-section source-polyline-explorer" aria-labelledby={heading}><h3 id={heading}>Source path explorer</h3>
    <p>Inspect stored paths and points in source order. These numeric identities are not separate anatomical structures or experimental observation IDs.</p>
    {!asset && <button className="secondary-button" disabled={loading} onClick={() => void open()}>{loading ? 'Reading source paths' : 'Inspect source paths'}</button>}
    {!asset && <p>Reads the checksum-bound local reference ({Number(atlas.statistics.assetBytes).toLocaleString('en-US')} bytes). Research observations are not transmitted.</p>}
    {loading && <p role="status">Checking source path records.</p>}{loadError && <p role="alert">{loadError}</p>}
    {checked && !checked.ok && <p role="alert">The source paths could not be indexed for inspection.</p>}
    {index && record && <>
      <form className="trace-sample-query" onSubmit={(event) => { event.preventDefault(); submit(); }}><label htmlFor={pathInput}>Source path ID</label><input id={pathInput} inputMode="numeric" autoComplete="off" maxLength={16} value={query} onChange={(event) => setDraft({ index, value: event.target.value })} /><button className="secondary-button" type="submit">Inspect path</button></form>
      {queryError && <p role="alert">{queryError}</p>}
      <dl><dt>{index.pathIdBasis === 'source-edge-id' ? 'Original edge ID' : 'Source polyline index'}</dt><dd>{record.pathId}</dd><dt>Source path row</dt><dd>{record.pathRowIndex + 1} of {index.pathCount}</dd><dt>Path points</dt><dd>{record.pointCount}</dd><dt>Consecutive segments</dt><dd>{record.segmentCount}</dd></dl>
      <div className="trace-sample-actions"><button className="secondary-button" disabled={record.previousPathId === null} onClick={() => record.previousPathId !== null && show(record.previousPathId)}>Previous path</button><button className="secondary-button" disabled={record.nextPathId === null} onClick={() => record.nextPathId !== null && show(record.nextPathId)}>Next path</button><button className="secondary-button" disabled={!viewerReady} onClick={focus}>Focus source path</button></div>
      {focusStatus && <p role="status">{focusStatus}</p>}<p>Focus uses visible retained portions of existing paths and retains camera direction and roll. It adds no markers and does not change background, visibility, clipping or observations.</p>
      <h4>Ordered source points</h4><p>Showing {record.pointOffset + 1} to {record.pointOffset + record.points.length} of {record.pointCount}. Coordinates use {atlas.coordinateFrame.sourceUnits === 'unknown' ? 'unknown source units' : 'source-declared micrometres without independent calibration'}.</p>
      <div className="polyline-point-table"><table><thead><tr><th>Serialized point index</th><th>X</th><th>Y</th><th>Z</th></tr></thead><tbody>{record.points.map((point, row) => <tr key={`${record.pointOffset}-${row}`}><td>{point.sourcePointIndex}</td>{point.coordinates.map((value, axis) => <td key={axis}>{String(value)}</td>)}</tr>)}</tbody></table></div>
      <div className="trace-sample-actions"><button className="secondary-button" disabled={!record.hasPreviousPointPage} onClick={() => show(record.pathId, Math.max(0, record.pointOffset - POLYLINE_POINT_PAGE_SIZE))}>Previous points</button><button className="secondary-button" disabled={!record.hasNextPointPage} onClick={() => show(record.pathId, record.pointOffset + record.points.length)}>Next points</button></div>
      {record.originalTopology ? <><h4>Original topology endpoints</h4><p>Endpoint IDs retain the deposited connectivity order. This order may disagree with path order and does not establish blood flow or anatomical direction.</p>{record.originalTopology.endpoints.map((endpoint, row) => <div key={row} className="polyline-endpoint"><p>Vertex {endpoint.vertexId}: {endpoint.coordinates.map(String).join(', ')}; {endpoint.incidentPathCount} incident source paths.</p><button className="secondary-button" onClick={() => showVertex(endpoint.vertexId)}>Inspect endpoint {endpoint.vertexId}</button></div>)}</> : <p>This source has no separate original endpoint graph. Coincident coordinates do not create an inferred connection.</p>}
      {vertexRecord && <div className="polyline-vertex-record"><h4>Original vertex {vertexRecord.vertexId}</h4><p>Coordinates: {vertexRecord.coordinates.map(String).join(', ')}. Incident source paths: {vertexRecord.incidentPathCount}.</p><ul>{vertexRecord.incidentPathIds.map((id) => <li key={id}><button className="secondary-button" onClick={() => show(id)}>Inspect incident path {id}</button></li>)}</ul><div className="trace-sample-actions"><button className="secondary-button" disabled={!vertexRecord.hasPreviousPathPage} onClick={() => showVertex(vertexRecord.vertexId, Math.max(0, vertexRecord.pathOffset - POLYLINE_INCIDENT_PAGE_SIZE))}>Previous incident paths</button><button className="secondary-button" disabled={!vertexRecord.hasNextPathPage} onClick={() => showVertex(vertexRecord.vertexId, vertexRecord.pathOffset + vertexRecord.incidentPathIds.length)}>Next incident paths</button></div></div>}
      <p>Numeric paths and topology do not establish individual vessels, nerves, cells, synapses, functional connectivity, measured diameter or physiological behavior. Inspector selection and source records are excluded from saved views and observation exports.</p>
    </>}
  </section>;
}
