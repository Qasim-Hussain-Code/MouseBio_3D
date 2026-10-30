import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import {
  SYSTEMS, physiologyProcessesForAtlas, MAX_VIEW_STATE_BYTES, compareConditions, exportExperimentalCsv, exportExperimentalJson, exportViewState, parseViewState, parseExperimentalCsv,
  parseExperimentalJson, summarizeMeasurements, type Atlas, type DatasetMetadata,
  type ExperimentalMeasurement, type ExplorationMode, type ImportResult, type MeasurementSummary, type ViewBackground,
} from './domain';
import type { CameraPose, ViewerHandle, ViewerSettings } from './viewer/ViewerCanvas';
import { measurementColors } from './domain/visualization';
import { DatasetDetails } from './components/DatasetDetails';
import { OntologyContext } from './components/OntologyContext';
import { getOntologyCandidate, parseOntologyCandidates } from './domain/ontology';
import ontologyCandidateData from '../data/ontology-candidates.json';
import { version as appVersion } from '../package.json';
import { buildReferenceCatalog, getReference, validateReferenceAtlas, createExperimentalBank, switchAtlasExperimentalData } from './domain/atlas-catalog';
import { defaultStructureOpacity, initialReferenceSelection, referenceOpacity } from './domain/reference-display';
import referenceCatalogData from '../data/anatomy-references.json';
import detailIndexData from '../public/atlas-volume/detail-index.json';
import { buildRegionDetailAssets, type RegionDetailStatus } from './viewer/region-detail-registry';
import { buildAnatomyGroups, type AnatomyGroup } from './domain/anatomy-groups';
import { buildReferenceSummary } from './domain/reference-summary';
import { SurfaceDetail } from './components/SurfaceDetail';
import { DevelopmentalContext } from './components/DevelopmentalContext';
import { NativeSurfaceRecord } from './components/NativeSurfaceRecord';
import { SourceLayerControls } from './components/SourceLayerControls';
import { composeSourceLayers } from './domain/source-layers';
import { parseLocalTrace, MAX_LOCAL_TRACE_BYTES, type LocalTraceAsset } from './domain/local-trace';
import type { ViewerDiagnostics } from './viewer/viewer-diagnostics';
import { LocalTraceRecord } from './components/LocalTraceRecord';
import { SourceTraceRecord } from './components/SourceTraceRecord';
import { TraceSampleExplorer } from './components/TraceSampleExplorer';
import { isSourceTraceAtlas } from './domain/source-trace';
import { AnatomyCoverage } from './components/AnatomyCoverage';
import { isSourcePolylineAtlas } from './domain/source-polyline';
import { SourcePolylineRecord } from './components/SourcePolylineRecord';
import { SourcePolylineExplorer } from './components/SourcePolylineExplorer';
import { coverageRequests, resolveCoverageTarget, type AnatomyCoverageTopicId, type AnatomyCoverageRequest, type AnatomyCoverageTarget } from './domain/anatomy-coverage';

const referenceCatalog = buildReferenceCatalog(referenceCatalogData);

const ViewerCanvas = lazy(() => import('./viewer/ViewerCanvas').then((module) => ({ default: module.ViewerCanvas })));
const viewerLoading = <div className="viewer-status" role="status">Loading the 3D renderer</div>;

function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const paths: Record<string, React.ReactNode> = {
    layers: <><path d="m3 8 9-5 9 5-9 5z" /><path d="m3 12 9 5 9-5M3 16l9 5 9-5" /></>,
    heart: <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z" />,
    flask: <><path d="M9 3h6M10 3v6L4 19a1 1 0 0 0 1 2h14a1 1 0 0 0 1-2L14 9V3M8 14h8" /></>,
    compare: <><rect x="3" y="4" width="7" height="16" rx="1" /><rect x="14" y="4" width="7" height="16" rx="1" /></>,
    search: <><circle cx="10.5" cy="10.5" r="6" /><path d="m15 15 5 5" /></>,
    eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>,
    hidden: <><path d="m3 3 18 18M9.5 5.3A12 12 0 0 1 12 5c6.5 0 10 7 10 7a19 19 0 0 1-3.3 4.3M6.3 6.3A19 19 0 0 0 2 12s3.5 7 10 7a12 12 0 0 0 5.5-1.3" /></>,
    reset: <><path d="M3 10a9 9 0 1 1 2 8M3 3v7h7" /></>,
    focus: <><path d="M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5" /><circle cx="12" cy="12" r="3" /></>,
    info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7v1" /></>,
    lock: <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" /></>,
    download: <><path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5" /></>,
    upload: <><path d="M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5" /></>,
    play: <path d="m8 4 12 8-12 8Z" />,
    pause: <><path d="M8 4v16M16 4v16" /></>,
    close: <path d="m5 5 14 14M19 5 5 19" />,
    arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] ?? paths.layers}</svg>;
}

const MODES: { id: ExplorationMode; label: string; icon: string }[] = [
  { id: 'anatomical', label: 'Anatomy', icon: 'layers' }, { id: 'living', label: 'Living', icon: 'heart' },
  { id: 'experimental', label: 'Experiment', icon: 'flask' }, { id: 'comparative', label: 'Compare', icon: 'compare' },
];
const format = (value: number | null) => value === null ? 'unavailable' : Number.isFinite(value) ? Number(value.toPrecision(4)).toLocaleString() : 'out of range';
const seriesKey = (summary: MeasurementSummary) => JSON.stringify([summary.measurement, summary.unit, summary.timePoint]);
const download = (name: string, text: string, type = 'application/json') => {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = name; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
export default function App() {
  const [atlas, setAtlas] = useState<Atlas | null>(null);
  const [loadError, setLoadError] = useState('');
  const [referenceLoading, setReferenceLoading] = useState(false);
  const [referenceError, setReferenceError] = useState('');
  const [localTrace, setLocalTrace] = useState<LocalTraceAsset | null>(null);
  const [traceLoading, setTraceLoading] = useState(false);
  const [traceError, setTraceError] = useState('');
  const [fineEnabled, setFineEnabled] = useState(false);
  const [detailLevel, setDetailLevel] = useState('fine-020');
  const [activeGroup, setActiveGroup] = useState('whole-mouse');
  const [detailStatus, setDetailStatus] = useState<RegionDetailStatus>({ status: 'idle', structureId: null });
  const [mode, setMode] = useState<ExplorationMode>('anatomical');
  const [selected, setSelected] = useState<string | null>('digimouse:3');
  const [hidden, setHidden] = useState<string[]>([]);
  const [opacity, setOpacity] = useState<Record<string, number>>({ 'digimouse:1': 0.1 });
  const [query, setQuery] = useState('');
  const [navigatorTab, setNavigatorTab] = useState<'structures' | 'systems'>('structures');
  const [labels, setLabels] = useState(true);
  const [background, setBackground] = useState<ViewBackground>('dark');
  const [clipAxis, setClipAxis] = useState<'off' | 'x' | 'y' | 'z'>('off');
  const [clipPosition, setClipPosition] = useState(50);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [cardiac, setCardiac] = useState(true);
  const [respiratory, setRespiratory] = useState(true);
  const [methods, setMethods] = useState(false);
  const [diagnostics, setDiagnostics] = useState<ViewerDiagnostics | null>(null);
  const [viewerState, setViewerState] = useState<Record<string, 'loading' | 'ready' | 'failed'>>({ primary: 'loading', secondary: 'loading' });
  const [rows, setRows] = useState<ExperimentalMeasurement[]>([]);
  const [metadata, setMetadata] = useState<DatasetMetadata>({ origin: 'user-data' });
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [series, setSeries] = useState('');
  const [conditionA, setConditionA] = useState('');
  const [conditionB, setConditionB] = useState('');
  const [cameraPose, setCameraPose] = useState<CameraPose>();
  const [notice, setNotice] = useState('');
  const [viewError, setViewError] = useState('');
  const isolation = useRef<string[] | null>(null);
  const pendingGroupFocus = useRef<{ atlasId: string; ids: readonly string[] } | null>(null);
  const experimentalBank = useRef(createExperimentalBank());
  const currentData = useRef({ atlas, rows, metadata });
  currentData.current = { atlas, rows, metadata };
  const referenceRequest = useRef<AbortController | null>(null);
  const referenceSequence = useRef(0);
  const traceImportSequence = useRef(0);
  const dataImportSequence = useRef(0);
  const viewImportSequence = useRef(0);
  const viewer = useRef<ViewerHandle | null>(null);
  const compareViewer = useRef<ViewerHandle | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const traceFileInput = useRef<HTMLInputElement>(null);
  const viewFileInput = useRef<HTMLInputElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const inspector = useRef<HTMLElement>(null);
  useEffect(() => {
    const abort = new AbortController();
    const reference = referenceCatalog.catalog[0];
    if (!referenceCatalog.ok || !reference) { setLoadError('The local reference catalog is invalid.'); return; }
    fetch(reference.manifestUrl, { signal: abort.signal }).then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    }).then((loaded: Atlas) => {
      if (!validateReferenceAtlas(reference, loaded).ok) throw new Error('Reference binding mismatch.');
      setAtlas(loaded); setSelected(initialReferenceSelection(loaded)); setOpacity(referenceOpacity(loaded));
    }).catch((error) => { if (error.name !== 'AbortError') setLoadError('The local anatomical manifest could not be loaded.'); });
    return () => { abort.abort(); referenceRequest.current?.abort(); };
  }, []);
  useEffect(() => { if (methods) dialog.current?.showModal(); else dialog.current?.close(); }, [methods]);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 5000); return () => clearTimeout(timer); }, [notice]);
  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || document.querySelector('dialog[open]')) return;
      event.preventDefault(); searchInput.current?.focus();
    };
    window.addEventListener('keydown', focusSearch);
    return () => window.removeEventListener('keydown', focusSearch);
  }, []);
  const summaries = useMemo(() => summarizeMeasurements(rows), [rows]);
  const referenceSummary = useMemo(() => atlas ? buildReferenceSummary(atlas) : null, [atlas]);
  const reference = atlas ? getReference(referenceCatalog.catalog, atlas.id) : undefined;
  const anatomyGroups = useMemo(() => atlas ? buildAnatomyGroups(atlas) : null, [atlas]);
  const selectedGroup = anatomyGroups?.groups.find((group) => group.id === activeGroup);
  const detailAssets = useMemo(() => atlas ? buildRegionDetailAssets(detailIndexData, atlas) : null, [atlas]);
  const selectedDetails = detailAssets?.assets.filter((asset) => asset.structureId === selected) ?? [];
  const selectedLevels = detailAssets?.levels.filter((level) => selectedDetails.some((asset) => asset.levelId === level.id)) ?? [];
  const availableDetail = selectedDetails.find((asset) => asset.levelId === detailLevel);
  const fineActive = fineEnabled && mode !== 'comparative';
  const detailAsset = fineActive ? availableDetail : undefined;
  const ontologyCandidates = useMemo(() => atlas ? parseOntologyCandidates(ontologyCandidateData, atlas) : null, [atlas]);
  const seriesOptions = [...new Map(summaries.map((group) => [seriesKey(group), group])).values()];
  const activeSeries = series || (seriesOptions[0] ? seriesKey(seriesOptions[0]) : '');
  const compatible = summaries.filter((group) => seriesKey(group) === activeSeries);
  const conditions = [...new Set(compatible.map((group) => group.condition))];
  const activeA = conditions.includes(conditionA) ? conditionA : conditions[0] ?? '';
  const activeB = conditions.includes(conditionB) ? conditionB : conditions[1] ?? conditions[0] ?? '';
  const groupA = compatible.filter((group) => group.condition === activeA);
  const groupB = compatible.filter((group) => group.condition === activeB);
  const shownGroups = mode === 'comparative' ? [...groupA, ...groupB] : groupA;
  const min = shownGroups.length ? Math.min(...shownGroups.map((group) => group.mean)) : 0;
  const max = shownGroups.length ? Math.max(...shownGroups.map((group) => group.mean)) : 0;
  const colorA = mode === 'experimental' || mode === 'comparative' ? measurementColors(groupA, min, max) : {};
  const colorB = measurementColors(groupB, min, max);
  const selectedStructure = atlas?.structures.find((structure) => structure.id === selected);
  const ontologyCandidate = getOntologyCandidate(ontologyCandidates?.candidates ?? [], selected ?? '');
  const availableMotion = physiologyProcessesForAtlas(atlas?.id ?? '');
  const selectedMotion = availableMotion.find((process) => process.requiredStructures.includes(selected ?? ''));
  const hasCardiacMotion = availableMotion.some((process) => process.id === 'cardiac-contraction');
  const hasRespiratoryMotion = availableMotion.some((process) => process.id === 'respiratory-movement');
  const selectedSummaries = compatible.filter((group) => group.structureId === selected);
  const first = compatible[0];
  const comparison = mode === 'comparative' && selected && first && activeA && activeB ? compareConditions(rows, {
    structureId: selected, measurement: first.measurement, unit: first.unit, timePoint: first.timePoint,
    conditionA: activeA, conditionB: activeB,
  }) : null;
  const settings: ViewerSettings = { selected, hidden, opacity, clipAxis, clipPosition, living: mode === 'living', playing, speed, cardiac, respiratory, colors: colorA, labels, background };
  const toggleHidden = (id: string) => { isolation.current = null; setActiveGroup(''); pendingGroupFocus.current = null; setHidden((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]); };
  const select = (id: string) => { setSelected(id); setFineEnabled(false); setDetailLevel('fine-020'); setDetailStatus({ status: 'idle', structureId: null }); };
  const focusRegions = (ids: readonly string[]) => {
    if (!atlas || !ids.length) return;
    pendingGroupFocus.current = { atlasId: atlas.id, ids };
    if (viewerState.primary === 'ready' && viewer.current) {
      viewer.current.focusRegions(ids); pendingGroupFocus.current = null;
    }
  };
  const viewerReady = (details: ViewerDiagnostics) => {
    setDiagnostics(details);
    const pending = pendingGroupFocus.current;
    if (pending && pending.atlasId === atlas?.id && viewer.current) {
      viewer.current.focusRegions(pending.ids); pendingGroupFocus.current = null;
    }
  };
  const exploreGroup = (group: AnatomyGroup) => {
    if (!atlas) return;
    const members = new Set(group.structureIds);
    setHidden(atlas.structures.filter((structure) => !members.has(structure.id)).map((structure) => structure.id));
    setOpacity(group.id === 'whole-mouse' ? referenceOpacity(atlas) : Object.fromEntries(atlas.structures.map((structure) =>
      [structure.id, members.has(structure.id) ? 1 : defaultStructureOpacity(structure)])));
    setSelected(selected && members.has(selected) ? selected : group.id === 'whole-mouse' ? initialReferenceSelection(atlas) : group.structureIds[0] ?? null);
    setFineEnabled(false); setDetailLevel('fine-020'); setDetailStatus({ status: 'idle', structureId: null });
    setClipAxis('off'); isolation.current = null; setActiveGroup(group.id);
    focusRegions(group.structureIds);
  };
  const applySourceLayers = (ids: readonly string[], context: 'hidden' | 'faded') => {
    if (!atlas) return { ok: false, error: 'The anatomical reference is unavailable.' };
    const result = composeSourceLayers(atlas, ids, context);
    if (!result.ok) return { ok: false, error: result.errors.join(' ') };
    setHidden([...result.hidden]); setOpacity({ ...result.opacity });
    setSelected(selected && result.structureIds.includes(selected) ? selected : result.structureIds[0] ?? null);
    setFineEnabled(false); setDetailLevel('fine-020'); setDetailStatus({ status: 'idle', structureId: null });
    setClipAxis('off'); isolation.current = null; setActiveGroup('');
    focusRegions(result.structureIds);
    setNotice(`${result.structureIds.length} source regions selected. Other regions ${context === 'hidden' ? 'hidden' : 'faded'}.`);
    return { ok: true };
  };
  const adoptReference = (loaded: Atlas) => {
      const current = currentData.current;
      if (!current.atlas) throw new Error('The current reference is unavailable.');
      const switched = switchAtlasExperimentalData(experimentalBank.current, current.atlas,
        { rows: current.rows, metadata: current.metadata }, loaded);
      if (!switched.ok || !switched.data) throw new Error(switched.errors.join(' '));
      experimentalBank.current = switched.bank;
      dataImportSequence.current++; viewImportSequence.current++;
      setRows(switched.data.rows); setMetadata(switched.data.metadata); setAtlas(loaded);
      setActiveGroup('whole-mouse'); pendingGroupFocus.current = null;
      setSelected(initialReferenceSelection(loaded)); setHidden([]); setOpacity(referenceOpacity(loaded));
      setFineEnabled(false); setDetailLevel('fine-020'); setDetailStatus({ status: 'idle', structureId: null }); setCameraPose(undefined); setDiagnostics(null);
      setClipAxis('off'); setClipPosition(50); setQuery(''); setSeries(''); setConditionA(''); setConditionB('');
      setImportResult(null); setViewError(''); setTraceError(''); isolation.current = null;
      return switched.restored;
  };
  const openLocalTrace = async (file?: File) => {
    if (!file) return;
    const sequence = ++traceImportSequence.current;
    referenceSequence.current++; referenceRequest.current?.abort();
    dataImportSequence.current++; viewImportSequence.current++;
    setReferenceLoading(false); setTraceLoading(true); setTraceError(''); setReferenceError(''); setViewError('');
    try {
      if (!Number.isSafeInteger(file.size) || file.size <= 0 || file.size > MAX_LOCAL_TRACE_BYTES) throw new Error('Local SWC files must fit the 2 MiB input limit.');
      let bytes: ArrayBuffer;
      try { bytes = await file.arrayBuffer(); } catch { throw new Error('The local trace file could not be read.'); }
      if (sequence !== traceImportSequence.current) return;
      if (bytes.byteLength !== file.size) throw new Error('The local file byte count changed while reading.');
      const result = await parseLocalTrace(bytes);
      if (sequence !== traceImportSequence.current) return;
      if (!result.ok || !result.asset) throw new Error(result.errors.join(' '));
      adoptReference(result.asset.atlas);
      setLocalTrace(result.asset);
      setNotice('Local trace opened. No file data transmitted.');
    } catch (error) {
      if (sequence === traceImportSequence.current) setTraceError(error instanceof Error ? error.message : 'The local trace could not be read.');
    } finally {
      if (sequence === traceImportSequence.current) { setTraceLoading(false); if (traceFileInput.current) traceFileInput.current.value = ''; }
    }
  };
  const applyCoverageTarget = (loaded: Atlas, target: AnatomyCoverageTarget, context: 'hidden' | 'faded') => {
    const members = new Set(target.structureIds);
    setHidden(context === 'hidden' ? loaded.structures.filter((region) => !members.has(region.id)).map((region) => region.id) : []);
    setOpacity(Object.fromEntries(loaded.structures.map((region) => [region.id, members.has(region.id) ? 1 : Math.min(defaultStructureOpacity(region), 0.08)])));
    setSelected(target.structureIds[0]); setActiveGroup(target.groupId); setQuery(''); setNavigatorTab('structures');
    setFineEnabled(false); setDetailLevel('fine-020'); setDetailStatus({ status: 'idle', structureId: null }); setClipAxis('off'); isolation.current = null;
    pendingGroupFocus.current = { atlasId: loaded.id, ids: target.structureIds };
    if (loaded === atlas && viewerState.primary === 'ready' && viewer.current) {
      viewer.current.focusRegions(target.structureIds); pendingGroupFocus.current = null;
    }
  };
  const openCoverage = (request: AnatomyCoverageRequest, context: 'hidden' | 'faded') => {
    if (!coverageRequests(request.topicId).some((candidate) => candidate === request)) return;
    void switchReference(request.referenceId, request.topicId, context);
  };
  const switchReference = async (id: string, coverageTopic?: AnatomyCoverageTopicId, context: 'hidden' | 'faded' = 'faded') => {
    const next = getReference(referenceCatalog.catalog, id);
    const cachedTrace = localTrace?.atlas.id === id ? localTrace : null;
    if ((!next && !cachedTrace) || (id === atlas?.id && !coverageTopic)) return;
    traceImportSequence.current++; setTraceLoading(false); setTraceError('');
    const sequence = ++referenceSequence.current;
    referenceRequest.current?.abort();
    const abort = new AbortController(); referenceRequest.current = abort;
    setReferenceLoading(true); setReferenceError('');
    dataImportSequence.current++; viewImportSequence.current++;
    try {
      let loaded: Atlas;
      if (id === atlas?.id && coverageTopic) loaded = atlas;
      else if (cachedTrace) loaded = cachedTrace.atlas;
      else {
        const response = await fetch(next!.manifestUrl, { signal: abort.signal });
        if (!response.ok) throw new Error('The selected reference could not be loaded.');
        loaded = await response.json() as Atlas;
        if (!validateReferenceAtlas(next!, loaded).ok) throw new Error('Reference binding mismatch.');
      }
      if (sequence !== referenceSequence.current || abort.signal.aborted) return;
      const coverage = coverageTopic ? resolveCoverageTarget(loaded, coverageTopic) : null;
      if (coverage && (!coverage.ok || !coverage.target)) throw new Error('The requested anatomy is unavailable in this source.');
      const restored = loaded === atlas ? false : adoptReference(loaded);
      if (coverage?.target) {
        applyCoverageTarget(loaded, coverage.target, context);
        setNotice('Source anatomy opened. Other references retain their observations and coordinate frames.');
      } else setNotice(restored ? 'Reference switched. Its local observations were restored.' : 'Reference switched. Previous observations remain in this browser session.');
    } catch (error) {
      if (sequence === referenceSequence.current && !abort.signal.aborted)
        setReferenceError(coverageTopic ? 'The requested source anatomy could not be opened. The current reference and observations were retained.' : error instanceof Error ? error.message : 'Reference switch failed.');
    } finally { if (sequence === referenceSequence.current) setReferenceLoading(false); }
  };
  const isolate = () => {
    if (!atlas || !selected) return;
    setActiveGroup(''); pendingGroupFocus.current = null;
    if (isolation.current) { setHidden(isolation.current); isolation.current = null; }
    else { isolation.current = hidden; setHidden(atlas.structures.filter((structure) => structure.id !== selected).map((structure) => structure.id)); }
  };
  const showAll = () => { setHidden([]); isolation.current = null; setActiveGroup('whole-mouse'); pendingGroupFocus.current = null; if (atlas) setOpacity(referenceOpacity(atlas)); };
  const showOrgans = () => {
    setHidden([]); isolation.current = null;
    setActiveGroup('whole-mouse'); pendingGroupFocus.current = null;
    if (atlas) setOpacity(referenceOpacity(atlas, true));
    setNotice('Body envelope and skeleton made translucent.');
  };
  const importFile = async (file: File | undefined) => {
    if (!file || !atlas) return;
    const sequence = ++dataImportSequence.current;
    if (fileInput.current) fileInput.current.value = '';
    if (file.size > 5 * 1024 * 1024) { setImportResult({ ok: false, rows: [], errors: [{ code: 'file-size', message: 'Maximum file size is 5 MiB.' }], warnings: [] }); return; }
    try {
      const text = await file.text();
      if (sequence !== dataImportSequence.current) return;
      const result = file.name.toLowerCase().endsWith('.json') ? parseExperimentalJson(text, atlas.structures) : parseExperimentalCsv(text, atlas.structures);
      setImportResult(result);
      if (result.ok) {
        setRows(result.rows);
        setMetadata({ title: file.name, origin: 'user-data', ...result.metadata });
        setSeries(''); setConditionA(''); setConditionB('');
        setNotice(`Imported ${result.rows.length} observations locally.`);
      }
    } catch { if (sequence === dataImportSequence.current) setImportResult({ ok: false, rows: [], errors: [{ code: 'file-read', message: 'The local file could not be read.' }], warnings: [] }); }
    if (sequence === dataImportSequence.current && fileInput.current) fileInput.current.value = '';
  };
  const exportDataset = () => {
    try { download('mousebio-dataset.json', exportExperimentalJson(rows, metadata)); setNotice('Dataset exported to your downloads.'); }
    catch (error) { setNotice(error instanceof Error ? error.message : 'The dataset could not be exported.'); }
  };
  const exportView = () => {
    if (!atlas) return;
    try {
      const effectiveOpacity = Object.fromEntries(atlas.structures.map((structure) => [structure.id, opacity[structure.id] ?? defaultStructureOpacity(structure)]));
      download('mousebio-view.json', exportViewState({ mode, selected, hidden, opacity: effectiveOpacity, clipAxis, clipPosition, labels, background, ...(cameraPose ? { cameraPose } : {}), living: { playing, speed, cardiac, respiratory } }, atlas));
      setNotice('View state exported.');
    } catch (error) { setViewError(error instanceof Error ? error.message : 'The view could not be exported.'); }
  };
  const restoreView = async (file: File | undefined) => {
    if (!file || !atlas) return;
    const sequence = ++viewImportSequence.current;
    if (viewFileInput.current) viewFileInput.current.value = '';
    try {
      if (file.size > MAX_VIEW_STATE_BYTES) throw new Error('View-state files must not exceed 1 MiB.');
      const text = await file.text();
      if (sequence !== viewImportSequence.current) return;
      const result = parseViewState(text, atlas);
      if (!result.ok || !result.state) throw new Error(result.errors.join(' '));
      const state = result.state;
      setFineEnabled(false);
      setDetailLevel('fine-020');
      setActiveGroup(''); pendingGroupFocus.current = null;
      setMode(state.mode); setSelected(state.selected); setHidden(state.hidden); setOpacity(state.opacity);
      setClipAxis(state.clipAxis); setClipPosition(state.clipPosition); setLabels(state.labels); setBackground(state.background);
      setPlaying(state.living.playing); setSpeed(state.living.speed); setCardiac(state.living.cardiac); setRespiratory(state.living.respiratory);
      if (state.cameraPose) setCameraPose(state.cameraPose);
      isolation.current = null;
      setViewError(''); setNotice('View settings restored.');
    } catch (error) { if (sequence === viewImportSequence.current) setViewError(error instanceof Error ? error.message : 'The view-state file could not be read.'); }
    if (sequence === viewImportSequence.current && viewFileInput.current) viewFileInput.current.value = '';
  };
  if (loadError) return <main className="startup-message"><h1>MouseBio_3D</h1><p role="alert">{loadError}</p><button onClick={() => location.reload()}>Retry</button></main>;
  if (!atlas || !referenceSummary) return <main className="startup-message"><span className="loading-ring" /><h1>MouseBio_3D</h1><p>Opening the local anatomical registry</p></main>;
  const sourceLink = referenceSummary.source.doiUrl ?? referenceSummary.source.url;
  const represented = SYSTEMS.filter((system) => atlas.structures.some((structure) => structure.systems.includes(system.id))).length;
  const visibleCount = atlas.structures.filter((structure) => !hidden.includes(structure.id) && (opacity[structure.id] ?? 1) > 0).length;
  const activeTrace = localTrace?.atlas === atlas ? localTrace : undefined;
  const sourceTrace = isSourceTraceAtlas(atlas);
  const parentLinkedTrace = !!activeTrace || sourceTrace;
  const sourcePolyline = isSourcePolylineAtlas(atlas);
  const lineReference = parentLinkedTrace || sourcePolyline;
  const hasBodyEnvelope = atlas.structures.some((structure) => structure.id === 'digimouse:1' || structure.id === 'digimouse-volume:1');
  const viewerFailed = viewerState.primary === 'failed' || (mode === 'comparative' && viewerState.secondary === 'failed');
  return <div className="app-shell">
    <header className="app-header">
      <a className="brand" href="/" aria-label="MouseBio_3D home"><span className="brand-mark"><Icon name="layers" size={25} /></span><span><strong>MouseBio<span className="brand-suffix">_3D</span></strong><small>DIGITAL MOUSE LABORATORY</small></span></a>
      <nav className="mode-nav" aria-label="Exploration mode">{MODES.map((item) => <button key={item.id} className={mode === item.id ? 'active' : ''} aria-pressed={mode === item.id} onClick={() => { setMode(item.id); if (item.id === 'comparative') setFineEnabled(false); }}><Icon name={item.icon} /><span>{item.label}</span></button>)}</nav>
      <div className="header-actions"><span className="local-badge"><Icon name="lock" size={13} /> Local session</span><button className="icon-button" onClick={() => setMethods(true)} title="Methods, sources and limitations" aria-label="Methods, sources and limitations"><Icon name="info" /></button></div>
    </header>

    <aside className="navigator panel">
      <div className="panel-heading"><span className="eyebrow">REFERENCE ATLAS</span><span className="version-tag">v{appVersion}</span></div>
      <h1>Explore the mouse</h1><p className="muted compact">Anatomy and local observations.</p>
      <div className="reference-card"><span className="reference-dot" /><div><strong>{referenceSummary.source.displayName}</strong><small>{referenceSummary.specimen.scientificName} · {referenceSummary.specimen.sex} · {referenceSummary.specimen.mass}</small></div><span className="tiny-tag">{referenceSummary.source.license}</span></div>
      <label className="reference-selector">Anatomy reference<select aria-label="Anatomy reference" value={atlas.id} disabled={referenceLoading} onChange={(event) => void switchReference(event.target.value)}>{referenceCatalog.catalog.map((entry) => <option key={entry.id} value={entry.id}>{entry.title}</option>)}{localTrace && <option value={localTrace.atlas.id}>Local morphology trace</option>}</select></label>
      <div className="local-trace-input"><input ref={traceFileInput} type="file" accept=".swc,text/plain" aria-label="Open local SWC trace" onChange={(event) => void openLocalTrace(event.target.files?.[0])} /><button className="secondary-button" onClick={() => traceFileInput.current?.click()}>Open local SWC</button><small>Local files stay in browser memory. Reload clears them.</small></div>
      {traceError && <p role="alert" className="view-import-error">Local trace unchanged. {traceError}</p>}

      <p className="reference-description">{traceLoading ? 'Reading local trace. Current reference and observations are retained.' : referenceLoading ? 'Loading reference. Current observations are retained.' : activeTrace ? 'User-supplied source samples and parent links. Physical units, biological identity and provenance are unverified.' : reference?.coverage.description ?? 'Coverage description unavailable.'}</p>
      {referenceError && <p role="alert" className="view-import-error">Reference unchanged. {referenceError}</p>}
      <label className="search-field"><Icon name="search" size={16} /><input ref={searchInput} type="search" placeholder="Find a structure or ID" aria-label="Find a structure or ID" value={query} onChange={(event) => { setQuery(event.target.value); setNavigatorTab('structures'); }} /><kbd>/</kbd></label>
      <div className="segmented" role="group" aria-label="Atlas navigation"><button className={navigatorTab === 'structures' ? 'active' : ''} onClick={() => setNavigatorTab('structures')}>Structures <span>{atlas.structures.length}</span></button><button className={navigatorTab === 'systems' ? 'active' : ''} onClick={() => setNavigatorTab('systems')}>Systems <span>{SYSTEMS.length}</span></button></div>
      <div className="structure-toolbar"><span>{navigatorTab === 'structures' ? `${visibleCount} visible ${visibleCount === 1 ? 'region' : 'regions'}` : `${represented} categories represented`}</span><div className="visibility-presets">{hasBodyEnvelope && <button className="text-button" onClick={showOrgans} title="Make the body envelope and skeleton translucent" aria-label="Organs visibility preset">Organs</button>}<button className="text-button" onClick={showAll}>Show all</button></div></div>
      <div className="structure-list">
        {navigatorTab === 'systems' && represented === 0 && <p className="empty-small">{activeTrace ? 'System classifications are not reviewed for this local trace.' : 'Anatomical system classifications are not reviewed for this source. Use its named surface list.'}</p>}
        {navigatorTab === 'structures' ? atlas.structures.filter((structure) => `${structure.name} ${structure.id} ${structure.sourceLabel}`.toLowerCase().includes(query.toLowerCase())).map((structure) => <div key={structure.id} className={`structure-row ${selected === structure.id ? 'selected' : ''} ${hidden.includes(structure.id) ? 'is-hidden' : ''}`}>
          <button className="structure-name" onClick={() => select(structure.id)} aria-pressed={selected === structure.id}><span className={`structure-dot system-${structure.systems[0]}`} style={structure.color ? { backgroundColor: structure.color } : undefined} /><span>{structure.name}<small>{structure.id}</small></span></button>
          <button className="visibility-button" aria-label={`${hidden.includes(structure.id) ? 'Show' : 'Hide'} ${structure.name}`} onClick={() => toggleHidden(structure.id)}><Icon name={hidden.includes(structure.id) ? 'hidden' : 'eye'} size={15} /></button>
        </div>) : SYSTEMS.map((system) => {
          const structures = atlas.structures.filter((structure) => structure.systems.includes(system.id));
          const shown = structures.some((structure) => !hidden.includes(structure.id));
          return <label key={system.id} className={`system-row ${structures.length ? '' : 'unavailable'}`}><input type="checkbox" checked={structures.length > 0 && shown} disabled={!structures.length} onChange={() => { isolation.current = null; setActiveGroup(''); pendingGroupFocus.current = null; setHidden((current) => shown ? [...new Set([...current, ...structures.map((structure) => structure.id)])] : current.filter((id) => !structures.some((structure) => structure.id === id))); }} /><span>{system.name}</span><small>{structures.length || (represented === 0 ? 'Unclassified' : 'Not represented')}</small></label>;
        })}
        {navigatorTab === 'structures' && !atlas.structures.some((structure) => `${structure.name} ${structure.id} ${structure.sourceLabel}`.toLowerCase().includes(query.toLowerCase())) && <p className="empty-small">No matching source region. Missing anatomy is not generated.</p>}
      </div>
      <div className="navigator-footer"><Icon name="info" size={15} /><p>Source region detail only.<br /><button className="text-button" onClick={() => setMethods(true)}>Coverage and scientific limits <span>↗</span></button></p></div>
    </aside>

    <main className="workspace">
      <div className="workspace-heading"><div><span className="eyebrow">{MODES.find((item) => item.id === mode)?.label.toUpperCase()} WORKSPACE</span><h2>{mode === 'anatomical' ? 'Anatomical reference' : mode === 'living' ? availableMotion.length ? 'Physiology in motion' : 'Physiology availability' : mode === 'experimental' ? 'Map your observations' : 'Compare experimental states'}</h2></div><div className="view-file-actions"><input ref={viewFileInput} type="file" className="view-file-input" accept=".json,application/json" aria-label="Restore view state" onChange={(event) => void restoreView(event.target.files?.[0])} /><button className="secondary-button save-view" onClick={() => viewFileInput.current?.click()} title="Load view settings"><Icon name="upload" size={15} /><span>Load view</span></button><button className="secondary-button save-view" onClick={exportView} title="Save view settings"><Icon name="download" size={15} /><span>Save view</span></button></div></div>
      <button className="structure-details-shortcut secondary-button" aria-controls="structure-inspector" onClick={() => { inspector.current?.scrollIntoView({ block: 'start' }); inspector.current?.focus({ preventScroll: true }); }}><Icon name="info" size={15} /> Structure details{selectedStructure ? `: ${selectedStructure.name}` : ''}</button>
      <AnatomyCoverage referenceId={atlas.id} busy={referenceLoading || traceLoading} onOpen={openCoverage} />
      {viewError && <p className="view-import-error" role="alert">View settings unchanged. {viewError}</p>}
      {(atlas.assetFormat === 'ply-native-v1' || parentLinkedTrace) && <p className="view-import-error" role="status">Native source coordinates. Physical units are unknown; no calibrated measurements or cross-reference registration are available.</p>}
        {sourcePolyline && <p className="view-import-error" role="status">Source graph coordinates. Physical calibration, anatomical direction and registration remain unverified.</p>}
      <div className="anatomy-group-bar"><label>Isolate a source group<select aria-label="Source anatomy group" value={selectedGroup ? activeGroup : ''} disabled={!anatomyGroups?.ok} onChange={(event) => { const group = anatomyGroups?.groups.find((entry) => entry.id === event.target.value); if (group) exploreGroup(group); }}><option value="" disabled>Current view</option>{anatomyGroups?.groups.map((group) => <option key={group.id} value={group.id}>{group.title} ({group.structureIds.length})</option>)}</select></label><button className="secondary-button" disabled={visibleCount === 0 || viewerState.primary !== 'ready'} onClick={() => focusRegions(atlas.structures.filter((structure) => !hidden.includes(structure.id) && (opacity[structure.id] ?? defaultStructureOpacity(structure)) > 0).map((structure) => structure.id))}><Icon name="focus" size={15} /> Fit visible regions</button>{selectedGroup && <details className="group-limitations"><summary>Group limits</summary><p>{selectedGroup.description}</p><ul>{selectedGroup.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}</ul></details>}</div>
      {anatomyGroups?.ok && <SourceLayerControls key={atlas.id} groups={anatomyGroups.groups} onApply={applySourceLayers} />}
      {(mode === 'experimental' || mode === 'comparative') && <div className="data-toolbar">
        <label>Measurement<select aria-label="Measurement series" value={activeSeries} onChange={(event) => setSeries(event.target.value)} disabled={!seriesOptions.length}><option value="" disabled>No observations imported</option>{seriesOptions.map((group) => <option key={seriesKey(group)} value={seriesKey(group)}>{group.measurement} ({group.unit}) · {group.timePoint}</option>)}</select></label>
        <label>{mode === 'comparative' ? 'Condition A' : 'Condition'}<select aria-label="Condition A" value={activeA} onChange={(event) => setConditionA(event.target.value)} disabled={!conditions.length}>{!conditions.length && <option value="">No condition</option>}{conditions.map((condition) => <option key={condition}>{condition}</option>)}</select></label>
        {mode === 'comparative' && <label>Condition B<select aria-label="Condition B" value={activeB} onChange={(event) => setConditionB(event.target.value)} disabled={!conditions.length}>{!conditions.length && <option value="">No condition</option>}{conditions.map((condition) => <option key={condition}>{condition}</option>)}</select></label>}
      </div>}
      {rows.length > 0 && metadata.origin === 'synthetic-example' && (mode === 'experimental' || mode === 'comparative') && <p className="synthetic-banner" role="status">Synthetic example data. These values are not experimental observations.</p>}
      {mode === 'comparative' && rows.length > 0 && (conditions.length < 2 || activeA === activeB) && <p className="view-import-error" role="status">Choose two distinct conditions in this measurement series.</p>}
      <section className={`viewport ${mode === 'comparative' ? 'comparison-viewport' : ''}`} aria-label="Anatomical viewer" data-background={background}>
        <div className="viewport-top"><span className="viewport-breadcrumb">{referenceSummary.source.displayName.toUpperCase()} <span>/</span> {mode === 'comparative' ? 'SYNCHRONIZED REFERENCE' : referenceSummary.specimen.scope.toUpperCase()}</span><div className="viewport-top-actions"><span className="viewport-chip"><span /> {atlas.structures.length} source regions</span><div className="background-switch" role="group" aria-label="Viewer background"><button aria-label="Dark background" aria-pressed={background === 'dark'} onClick={() => setBackground('dark')}><span className="background-swatch swatch-dark" />Dark</button><button aria-label="White background" aria-pressed={background === 'white'} onClick={() => setBackground('white')}><span className="background-swatch swatch-white" />White</button></div></div></div>
        <div className="canvas-pair">
          <div className="canvas-cell">{mode === 'comparative' && <div className="condition-label"><span>A</span>{activeA || 'Reference anatomy'}</div>}<Suspense fallback={viewerLoading}><ViewerCanvas key={`primary-${mode === 'comparative'}`} atlas={atlas} localTrace={activeTrace} detailAsset={detailAsset} onDetailStatus={setDetailStatus} settings={settings} onSelect={select} handle={viewer} onReady={viewerReady} onStatus={(status) => setViewerState((previous) => ({ ...previous, primary: status }))} cameraPose={cameraPose} onCameraChange={setCameraPose} /></Suspense></div>
          {mode === 'comparative' && <div className="canvas-cell"><div className="condition-label"><span>B</span>{activeB || 'Reference anatomy'}</div><Suspense fallback={viewerLoading}><ViewerCanvas atlas={atlas} localTrace={activeTrace} detailAsset={detailAsset} settings={{ ...settings, colors: colorB }} onSelect={select} handle={compareViewer} onStatus={(status) => setViewerState((previous) => ({ ...previous, secondary: status }))} cameraPose={cameraPose} onCameraChange={setCameraPose} /></Suspense></div>}
        </div>
        <div className="view-controls"><button className="viewer-button" aria-label="Reset camera" title="Reset camera (Home)" onClick={() => viewer.current?.reset()}><Icon name="reset" size={17} /></button><span className="control-divider" />{(['x', 'y', 'z'] as const).map((axis) => <button className="viewer-button axis-button" key={axis} aria-label={`View along display ${axis} axis`} title={`Display ${axis.toUpperCase()} axis; not an anatomical direction`} onClick={() => viewer.current?.view(axis)}>{axis.toUpperCase()}</button>)}<span className="control-divider" /><button className={`viewer-button ${labels ? 'active' : ''}`} aria-label="Toggle selected structure label" aria-pressed={labels} onClick={() => setLabels(!labels)}>Aa</button></div>
        {shownGroups.length > 0 && (mode === 'experimental' || mode === 'comparative') && <div className="quantitative-legend"><strong>Mean {first?.measurement}</strong><span>{first?.unit} · {first?.timePoint}</span><div className="color-ramp" /><div className="legend-numbers"><span>{format(min)}</span><span>{format(max)}</span></div><small>Unmapped regions retain atlas colors</small></div>}
        <div className="viewport-bottom"><span>Drag to rotate <i /> Scroll to zoom <i /> Click to select</span><span className="display-frame">Display axes · orientation unverified</span></div>
        {mode === 'living' && availableMotion.length > 0 && <span className="illustrative-label">ILLUSTRATIVE MOTION · NOT A VALIDATED SIMULATION</span>}
      </section>
      <div className="section-bar"><Icon name="layers" size={18} /><div><strong>Virtual section</strong><small>Surface clipping, without tissue reconstruction</small></div><select aria-label="Section axis" value={clipAxis} onChange={(event) => setClipAxis(event.target.value as typeof clipAxis)}><option value="off">No section</option><option value="x">Display X</option><option value="y">Display Y</option><option value="z">Display Z</option></select><input type="range" aria-label="Section position" min="0" max="100" value={clipPosition} disabled={clipAxis === 'off'} onChange={(event) => setClipPosition(+event.target.value)} /><span>{clipPosition}%</span></div>
      {mode === 'living' && (availableMotion.length > 0 ? <div className="living-panel"><div className="living-controls"><button className="play-button" aria-label={playing ? 'Pause physiology' : 'Play physiology'} onClick={() => setPlaying(!playing)}><Icon name={playing ? 'pause' : 'play'} size={17} /></button><div><strong>Educational playback</strong><small>Arbitrary display timing and amplitude</small></div><label className="speed-control">Speed<select value={speed} onChange={(event) => setSpeed(+event.target.value)} aria-label="Playback speed">{[...new Set([0.25, 0.5, 1, 2, 4, speed])].sort((a, b) => a - b).map((value) => <option key={value} value={value}>{value}x</option>)}</select></label></div><div className="process-options"><label><input type="checkbox" checked={cardiac && hasCardiacMotion} disabled={!hasCardiacMotion} onChange={() => setCardiac(!cardiac)} /> Cardiac contraction</label><label><input type="checkbox" checked={respiratory && hasRespiratoryMotion} disabled={!hasRespiratoryMotion} onChange={() => setRespiratory(!respiratory)} /> Respiratory motion</label><span>Vessel circulation: no source geometry</span></div></div> : <div className="living-panel"><p>No physiological motion is available for this reference.</p></div>)}
      {(mode === 'experimental' || mode === 'comparative') && <div className="data-panel"><div className="data-panel-heading"><div><strong>{rows.length ? metadata.title || 'Local experimental dataset' : 'Connect measurements to anatomy'}</strong><p>{rows.length ? `${rows.length} observations · ${new Set(rows.map((row) => row.replicate)).size} biological subject IDs · ${summaries.length} groups` : 'Import CSV or JSON with explicit structure IDs, units and biological replicates.'}</p></div>{rows.length > 0 && <button className="text-button" onClick={() => { dataImportSequence.current++; setRows([]); setImportResult(null); setMetadata({ origin: 'user-data' }); }}>Clear local data</button>}</div>
        <div className="import-actions"><input ref={fileInput} id="dataset-file" type="file" accept=".csv,.json,text/csv,application/json" aria-label="Import experimental dataset" onChange={(event) => void importFile(event.target.files?.[0])} /><button className="primary-button" onClick={() => fileInput.current?.click()}><Icon name="upload" size={15} /> Import dataset</button><button className="secondary-button" onClick={() => download('mousebio-template.csv', exportExperimentalCsv([]), 'text/csv')}>CSV template</button><button className="secondary-button" disabled={!rows.length} onClick={exportDataset}><Icon name="download" size={15} /> Export JSON</button><span className="privacy-note"><Icon name="lock" size={13} /> Files stay in this browser session</span></div>
        {importResult && <div className={`import-result ${importResult.ok ? 'success' : 'invalid'}`} role="status">{importResult.ok ? `Accepted ${importResult.rows.length} measurements. No data transmitted.` : <><strong>Import rejected. Existing observations are retained.</strong><ul>{importResult.errors.slice(0, 6).map((error, index) => <li key={index}>{error.row ? `Row ${error.row}: ` : ''}{error.message}</li>)}</ul>{importResult.errors.length > 6 && <span>{importResult.errors.length - 6} additional errors. Correct these rows and reimport.</span>}</>}{importResult.warnings.map((warning, index) => <p key={index}>{warning.message}</p>)}</div>}
        {!rows.length && <p className="schema-hint"><code>structure_id, measurement, value, unit, replicate, condition, time_point</code><br />Use IDs from this reference, such as <code>{initialReferenceSelection(atlas)}</code>. One row per biological subject, structure, measurement, condition and time point. Maximum 5 MiB. Observations stay attached to their original reference.</p>}
        {rows.length > 0 && <><p className="dataset-source">{metadata.sourceReference ? `Declared source: ${metadata.sourceReference}` : 'Source reference not supplied.'}</p><DatasetDetails metadata={metadata} onChange={setMetadata} /></>}
        {mode === 'comparative' && <p className="comparison-note">Both panels use the same selected reference geometry. Only imported measurements change. Condition labels do not generate anatomical differences.</p>}
      </div>}
      <footer className="workspace-footer"><span><span className={`status-dot ${viewerFailed ? 'status-failed' : ''}`} /> {viewerFailed ? '3D viewer unavailable' : diagnostics ? diagnostics.traces ? sourcePolyline ? `${diagnostics.traces} line reference · ${diagnostics.samples.toLocaleString()} source points · ${diagnostics.segments.toLocaleString()} polyline segments` : `${diagnostics.traces} trace · ${diagnostics.samples.toLocaleString()} samples · ${diagnostics.segments.toLocaleString()} parent links` : `${diagnostics.meshes} meshes loaded · ${diagnostics.triangles.toLocaleString()} triangles` : 'Loading anatomy'}</span><span>Source-derived geometry · no expert review</span></footer>
    </main>

    <aside className="inspector panel" id="structure-inspector" ref={inspector} tabIndex={-1}><div className="panel-heading"><span className="eyebrow">STRUCTURE INSPECTOR</span><Icon name="focus" size={16} /></div>{selectedStructure ? <>
      <div className="structure-type">{selectedStructure.systems.map((id) => SYSTEMS.find((system) => system.id === id)?.name).filter(Boolean).join(' / ') || (activeTrace ? 'Local trace; biological identity unverified' : 'Source surface; system classification unreviewed')}</div><h2>{selectedStructure.name}</h2><code className="structure-id">{selectedStructure.id}</code>
      <DevelopmentalContext summary={referenceSummary} />
      {activeTrace && <LocalTraceRecord asset={activeTrace} />}
      {sourceTrace && <SourceTraceRecord atlas={atlas} />}
      {parentLinkedTrace && <TraceSampleExplorer key={atlas.id} atlas={atlas} localTrace={activeTrace} viewerReady={viewerState.primary === 'ready'} onFocusSample={(sampleId) => viewer.current?.focusTraceSample(sampleId) ?? false} />}
      {sourcePolyline && <><SourcePolylineExplorer key={atlas.id} atlas={atlas} viewerReady={viewerState.primary === 'ready'} onFocusPath={(row) => viewer.current?.focusPolylinePath(row) ?? false} /><SourcePolylineRecord atlas={atlas} /></>}
      {!lineReference && <SurfaceDetail baseSpacing={reference?.processingResolution.processingVoxelSpacingMm?.[0]} levels={selectedLevels} levelId={detailLevel} asset={availableDetail} enabled={fineActive} comparative={mode === 'comparative'} viewerFailed={viewerFailed} status={detailStatus} onLevelChange={(id) => { setDetailLevel(id); setDetailStatus({ status: 'idle', structureId: null }); }} onEnabledChange={(enabled) => { setFineEnabled(enabled); setDetailStatus({ status: 'idle', structureId: null }); }} />}
      <div className="inspector-actions"><button className="primary-button" onClick={() => viewer.current?.focus()}><Icon name="focus" size={15} /> Focus</button><button className="secondary-button" onClick={isolate}>{isolation.current ? 'Restore' : 'Isolate'}</button><button className="icon-button" aria-label={`${hidden.includes(selectedStructure.id) ? 'Show' : 'Hide'} selected structure`} onClick={() => toggleHidden(selectedStructure.id)}><Icon name={hidden.includes(selectedStructure.id) ? 'hidden' : 'eye'} size={17} /></button></div>
      <div className="opacity-control"><label htmlFor="structure-opacity">Opacity <strong>{Math.round((opacity[selectedStructure.id] ?? defaultStructureOpacity(selectedStructure)) * 100)}%</strong></label><input id="structure-opacity" type="range" min="0" max="100" value={(opacity[selectedStructure.id] ?? defaultStructureOpacity(selectedStructure)) * 100} onChange={(event) => { setActiveGroup(''); pendingGroupFocus.current = null; setOpacity({ ...opacity, [selectedStructure.id]: +event.target.value / 100 }); }} /></div>
      <NativeSurfaceRecord atlas={atlas} structureId={selectedStructure.id} />
      <section className="inspector-section"><h3>Source annotation</h3><p>{selectedStructure.description}</p><dl><dt>Original label</dt><dd>{String(selectedStructure.sourceLabel)}</dd><dt>Biological detail</dt><dd>{parentLinkedTrace ? 'Traced samples and parent links' : sourcePolyline ? 'Source points and polylines' : 'Source segmented region'}</dd><dt>Ontology review</dt><dd>{ontologyCandidate ? 'Proposed association only' : 'No candidate association'}</dd></dl></section>
      {ontologyCandidate && <OntologyContext candidate={ontologyCandidate} onDownload={() => download('ontology-candidates.json', JSON.stringify(ontologyCandidateData, null, 2))} />}
      {mode === 'living' && <section className="inspector-section"><h3>Motion model</h3><p>{selectedMotion?.limitations[0] ?? 'No physiological animation is implemented for this region.'}</p>{selectedMotion && <span className="status-tag">Illustrative classification</span>}</section>}
      {(mode === 'experimental' || mode === 'comparative') && <section className="inspector-section"><h3>Mapped observations</h3>{selectedSummaries.length ? <><p className="muted compact">Mean and sample standard deviation, in {first?.unit}. No inferential statistics.</p>{selectedSummaries.map((group) => <div className="measurement-card" key={group.condition}><span>{group.condition} <small>n = {group.n}</small></span><strong>{format(group.mean)} <small>{group.unit}</small></strong><p>SD {format(group.sd)} · {group.timePoint}</p></div>)}{comparison && <div className="comparison-result">{comparison.ok ? <><span>Mean B minus mean A</span><strong>{format(comparison.difference)} {first?.unit}</strong></> : comparison.errors.map((error) => <p key={error.code}>{error.message}</p>)}{comparison.warnings.map((warning) => <p key={warning.code}>{warning.message}</p>)}</div>}</> : <p>No observations match this structure and the selected series.</p>}</section>}
      <section className="inspector-section provenance-section"><h3>Scientific provenance</h3><div className="source-reference"><span>01</span><div><strong>{referenceSummary.source.citationLabel}</strong><p>{referenceSummary.source.title}</p>{sourceLink && <a href={sourceLink} target="_blank" rel="noreferrer">View publication ↗</a>}</div></div><div className="license-line">Anatomical geometry {referenceSummary.source.licenseUrl ? <a href={referenceSummary.source.licenseUrl} target="_blank" rel="noreferrer">{referenceSummary.source.license}</a> : <span>{referenceSummary.source.license}</span>}</div><button className="text-button" onClick={() => download('mousebio-reference-manifest.json', JSON.stringify(atlas, null, 2))}>Download provenance manifest <Icon name="download" size={13} /></button></section>
      <div className="scientific-note"><Icon name="info" size={17} /><p>Source coverage is limited. Anatomical orientation and physical calibration need independent verification.</p></div>
    </> : <p>Select a region in the viewer or anatomical inventory.</p>}</aside>
    {notice && <div className="toast" role="status">{notice}</div>}
    <dialog ref={dialog} className="methods-dialog" onCancel={() => setMethods(false)} onClick={(event) => { if (event.target === event.currentTarget) setMethods(false); }}><div className="dialog-header"><span className="eyebrow">METHODS AND PROVENANCE</span><button className="icon-button" onClick={() => setMethods(false)} aria-label="Close methods"><Icon name="close" /></button></div><h2>A source-grounded starting point</h2><p>MouseBio_3D is an incremental digital laboratory mouse maintained by Qasim Hussain. The active reference contains {atlas.structures.length} source regions. Each reference retains its own source identifiers and coordinate frame. Switching references does not register their anatomies.</p><div className="method-stats"><div><strong>{atlas.structures.length}</strong><span>source regions</span></div><div><strong>{SYSTEMS.length}</strong><span>system categories</span></div><div><strong>{referenceSummary.specimen.count}</strong><span>declared specimens</span></div></div><h3>Declared specimen</h3><p>{referenceSummary.specimen.description}</p><dl><dt>Species</dt><dd>{referenceSummary.specimen.scientificName}</dd><dt>Sex</dt><dd>{referenceSummary.specimen.sex}</dd><dt>Strain</dt><dd>{referenceSummary.specimen.strain}</dd><dt>Age</dt><dd>{referenceSummary.specimen.age}</dd><dt>Mass</dt><dd>{referenceSummary.specimen.mass}</dd><dt>Coverage</dt><dd>{referenceSummary.specimen.scope}</dd></dl><h3>What the data support</h3><ul>{atlas.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}</ul><p>Magnification changes the view only. No tissue, cellular, vessel or peripheral nerve detail has been generated. Motion is illustrative surface deformation with arbitrary display periods. Experimental comparisons use your imported observations on identical reference geometry.</p><h3>Coordinates and transformations</h3><p>Declared source units: {typeof atlas.coordinateFrame.sourceUnits === 'string' ? atlas.coordinateFrame.sourceUnits : 'Unknown'}. Declared asset units: {typeof atlas.coordinateFrame.assetUnits === 'string' ? atlas.coordinateFrame.assetUnits : 'Unknown'}. The viewer centers the object and rotates it 90 degrees about display Z for presentation. Anatomical axis labels, calibrated measurements and spatial registration remain disabled.</p><h3>Sources and licenses</h3><p>{referenceSummary.source.citationLabel}. {sourceLink && <a href={sourceLink} target="_blank" rel="noreferrer">Publication</a>} {referenceSummary.source.licenseUrl && <a href={referenceSummary.source.licenseUrl} target="_blank" rel="noreferrer">{referenceSummary.source.license}</a>}</p><p>Declared anatomical license: {referenceSummary.source.license}. {referenceSummary.source.attribution} Original source code is MIT; original documentation is CC BY 4.0. Automated geometry checks are not independent anatomical review.</p><p className="privacy-method"><Icon name="lock" size={16} /> Imported research files stay in memory on this device. Reloading clears them. No analytics, remote data service or automatic upload is used.</p><button className="primary-button" onClick={() => setMethods(false)}>Return to laboratory <Icon name="arrow" size={15} /></button></dialog>
  </div>;
}
