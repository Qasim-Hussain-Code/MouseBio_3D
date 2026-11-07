import { Fragment, lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { declaresEvidence, DIVISION_NOTE, EVIDENCE_NOTES, evidenceGroups, evidenceOf, toggledEvidence } from './domain/evidence';
import { EvidenceChip, EvidenceFilter } from './components/EvidenceControls';
import { LayerStack } from './components/LayerStack';
import { journeyTissueOf, type JourneyTissue } from './domain/scale-journey';
import { AllLayers } from './components/AllLayers';
import { LifeBadge, LifePanel } from './components/LifePanel';
import { lifeDescription, startingLife, type LifeSettings } from './domain/living-simulation';
import { dissectionAppliesTo, type DissectionPlaceId, type DissectionSettings } from './domain/dissection';
import { layerStops, matchingStop } from './domain/living-layers';
import {
  SYSTEMS, physiologyProcessesForAtlas, MAX_VIEW_STATE_BYTES, compareConditions, exportExperimentalCsv, exportExperimentalJson, exportViewState, parseViewState, parseExperimentalCsv,
  parseExperimentalJson, summarizeMeasurements, type Atlas, type DatasetMetadata,
  type ExperimentalMeasurement, type ExplorationMode, type ImportResult, type MeasurementSummary,
} from './domain';
import { MouseMark, useLivingTabIcon } from './components/MouseMark';
import { LabPanel } from './components/LabPanel';
import { LabChooser, LabTutorial } from './components/LabTutorial';
import { LAB_EXERCISES } from './domain/lab-exercises';
import type { LabReport } from './viewer/lab-session';
import type { CameraPose, DissectionReport, LabEvent, SectionImageStatus, ViewerHandle, ViewerSettings } from './viewer/ViewerCanvas';
import type { CoatId } from './viewer/fur';
import { sectionImagesApplyTo, type SectionImageChoice } from './domain/section-images';
import { measurementColors } from './domain/visualization';
import { DatasetDetails } from './components/DatasetDetails';
import { OntologyContext } from './components/OntologyContext';
import { getOntologyCandidate, parseOntologyCandidates } from './domain/ontology';
import ontologyCandidateData from '../data/ontology-candidates.json';
import { version as appVersion } from '../package.json';
import { buildReferenceCatalog, getReference, validateReferenceAtlas, createExperimentalBank, switchAtlasExperimentalData } from './domain/atlas-catalog';
import { defaultStructureOpacity, initialReferenceSelection, labOpacity, OPAQUE_SKIN, referenceOpacity, seeThroughSkinOpacity } from './domain/reference-display';
import { bodySurfaceIdFor } from './domain/display-pose';
import referenceCatalogData from '../data/anatomy-references.json';
import constructedCatalogData from '../data/constructed-references.json';
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
import { SourceSignalPanel } from './components/SourceSignalPanel';
import type { PathSignalDisplay } from './viewer/path-signal-display';
import { SelectionTools } from './components/SelectionTools';
import { SystemLayers } from './components/SystemLayers';
import { buildLivingCircuits, CIRCUIT_COLORS, CIRCUIT_DISPLAY_TIMING } from './domain/living-circuits';
import { CircuitConnections } from './components/CircuitConnections';
import { PrototypeStart } from './components/PrototypeStart';
import { CardiacCellPanel } from './components/CardiacCellPanel';
import { getPrototypeStarter, resolvePrototypeStarter } from './domain/prototype-starters';
import { createPrototypeExample } from './domain/prototype-example';
import { coverageRequests, resolveCoverageTarget, type AnatomyCoverageTopicId, type AnatomyCoverageRequest } from './domain/anatomy-coverage';
import { smoothingOptionsFor, type SurfaceDisplay } from './domain/display-smoothing';
import { displayColour, type ColourScheme } from './domain/tissue-palette';

const referenceCatalog = buildReferenceCatalog([...constructedCatalogData, ...referenceCatalogData]);
const DEFAULT_REFERENCE_ID = 'mousebio-living-v1';
/** A long constructed reference is listed by system. Source references keep the order of their manifests. */
function orderedStructures(atlas: Atlas, grouped: boolean) {
  if (!grouped) return atlas.structures;
  const rank = (structure: Atlas['structures'][number]) => { const at = SYSTEMS.findIndex((system) => system.id === structure.systems[0]); return at < 0 ? SYSTEMS.length : at; };
  return [...atlas.structures].map((structure, index) => ({ structure, index })).sort((a, b) => rank(a.structure) - rank(b.structure) || a.index - b.index).map((entry) => entry.structure);
}

const ViewerCanvas = lazy(() => import('./viewer/ViewerCanvas').then((module) => ({ default: module.ViewerCanvas })));
const ScaleJourney = lazy(() => import('./components/ScaleJourney'));
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
    scissors: <><circle cx="6" cy="18" r="2.6" /><circle cx="6" cy="6" r="2.6" /><path d="M8.2 7.5 20 17M8.2 16.5 20 7" /></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] ?? paths.layers}</svg>;
}

const MODES: { id: ExplorationMode; label: string; icon: string }[] = [
  { id: 'anatomical', label: 'Anatomy', icon: 'layers' }, { id: 'living', label: 'Living', icon: 'heart' },
  { id: 'dissection', label: 'Dissect', icon: 'scissors' }, { id: 'experimental', label: 'Experiment', icon: 'flask' }, { id: 'comparative', label: 'Compare', icon: 'compare' },
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
  useLivingTabIcon();
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
  const [navigatorTab, setNavigatorTab] = useState<'structures' | 'systems' | 'sources'>('structures');
  const [labels, setLabels] = useState(true);
  const [autoRotate,setAutoRotate]=useState(false);
  const [allLabels,setAllLabels]=useState(false);
  const [surfaceDisplay,setSurfaceDisplay]=useState<SurfaceDisplay>('smoothed');
  const [colourScheme,setColourScheme]=useState<ColourScheme>('tissue');
  const [labReport,setLabReport]=useState<LabReport|null>(null);
  const [labCaption,setLabCaption]=useState<string|null>(null);
  const [labPicked,setLabPicked]=useState<string|null>(null);
  const [labAlive,setLabAlive]=useState(true);
  const [labSteady,setLabSteady]=useState(true);
  const [labExerciseId,setLabExerciseId]=useState('');
  const [labChooser,setLabChooser]=useState(true);
  const [labPanelOpen,setLabPanelOpen]=useState(true);
  const [life,setLife]=useState<LifeSettings>(()=>startingLife(typeof window.matchMedia==='function'&&window.matchMedia('(prefers-reduced-motion: reduce)').matches));
  const [picked,setPicked]=useState(false);
  const [detailsAsked,setDetailsAsked]=useState(false);
  const [journeyOpen,setJourneyOpen]=useState(false);
  const [journeyFrom,setJourneyFrom]=useState<{tissue:JourneyTissue;name:string;place?:string;playing?:boolean}|null>(null);
  const [dissection,setDissection]=useState<DissectionSettings|null>(null);
  const [dissectionPlace,setDissectionPlace]=useState<DissectionPlaceId|null>('side');
  const [dissectionReport,setDissectionReport]=useState<DissectionReport|null>(null);
  const [sectionImage,setSectionImage]=useState<SectionImageChoice>('cryosection');
  const [sectionStatus,setSectionStatus]=useState<SectionImageStatus>({status:'idle'});
  const [displayOpen,setDisplayOpen]=useState(false);
  const [coat,setCoat]=useState<CoatId>('agouti');
  const pendingCut = useRef(false);
  const [navigatorOpen,setNavigatorOpen]=useState(false);
  // A side column on wide screens; below 901 px the inspector is an overlay drawer.
  const [inspectorOpen,setInspectorOpen]=useState(()=>typeof window.matchMedia!=='function'||window.matchMedia('(min-width: 901px)').matches);
  const [inspectorFocus,setInspectorFocus]=useState(0);
  const [inspectorTab,setInspectorTab]=useState<'structure'|'observations'|'source'>('structure');
  const [focusOnSelection,setFocusOnSelection]=useState(false);
  const [dataPanelOpen,setDataPanelOpen]=useState(true);
  const [pathSignal,setPathSignal]=useState<PathSignalDisplay|null>(null);
  const [clipAxis, setClipAxis] = useState<'off' | 'x' | 'y' | 'z'>('off');
  const [clipPosition, setClipPosition] = useState(50);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [cardiac, setCardiac] = useState(true);
  const [respiratory, setRespiratory] = useState(true);
  const [circulation, setCirculation] = useState(true);
  const [neuralSignals, setNeuralSignals] = useState(true);
  const [circuitSelectionOnly, setCircuitSelectionOnly] = useState(false);
  const [methods, setMethods] = useState(false);
  const [startOpen,setStartOpen]=useState(false);
  const [startError,setStartError]=useState('');
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
  const isolationOpacity=useRef<Record<string,number>|null>(null);
  const pendingGroupFocus = useRef<{ atlasId: string; ids: readonly string[] } | null>(null);
  const experimentalBank = useRef(createExperimentalBank());
  const currentData = useRef({ atlas, rows, metadata });
  currentData.current = { atlas, rows, metadata };
  const referenceRequest = useRef<AbortController | null>(null);
  const referenceSequence = useRef(0);
  const traceImportSequence = useRef(0);
  const dataImportSequence = useRef(0);
  const dataImportPending=useRef(0);
  const [dataImportBusy,setDataImportBusy]=useState(false);
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
    // The living mouse opens first. Any reference can be opened directly by its catalog identifier, for example ?reference=digimouse-volume-040-v1.
    const requested = new URLSearchParams(window.location.search).get('reference') ?? DEFAULT_REFERENCE_ID;
    const reference = getReference(referenceCatalog.catalog, requested) ?? referenceCatalog.catalog[0];
    if (!referenceCatalog.ok || !reference) { setLoadError('The local reference catalog is invalid.'); return; }
    fetch(reference.manifestUrl, { signal: abort.signal }).then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    }).then((loaded: Atlas) => {
      if (!validateReferenceAtlas(reference, loaded).ok) throw new Error('Reference binding mismatch.');
      setAtlas(loaded); setSelected(initialReferenceSelection(loaded)); setOpacity(referenceOpacity(loaded));
      if (layerStops(loaded).length) setNavigatorTab('systems');
    }).catch((error) => { if (error.name !== 'AbortError') setLoadError('The local anatomical manifest could not be loaded.'); });
    return () => { abort.abort(); referenceRequest.current?.abort(); };
  }, []);
  useEffect(() => { if (methods) dialog.current?.showModal(); else dialog.current?.close(); }, [methods]);
  useEffect(()=>{if(inspectorFocus&&inspectorOpen)inspector.current?.focus({preventScroll:true});},[inspectorFocus]);
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
  const evidenceShown = atlas ? declaresEvidence(atlas) : false;
  const layerStack = useMemo(() => atlas ? layerStops(atlas) : [], [atlas]);
  const ontologyCandidate = getOntologyCandidate(ontologyCandidates?.candidates ?? [], selected ?? '');
  const availableMotion = physiologyProcessesForAtlas(atlas?.id ?? '');
  const selectedMotion = availableMotion.find((process) => process.requiredStructures.includes(selected ?? ''));
  const hasCardiacMotion = availableMotion.some((process) => process.id === 'cardiac-contraction');
  const hasRespiratoryMotion = availableMotion.some((process) => process.id === 'respiratory-movement');
  const livingCircuits = useMemo(() => buildLivingCircuits(atlas ?? { id: '', structures: [] }), [atlas]);
  const circuitsShown = mode === 'living' && livingCircuits.ok && (circulation || neuralSignals);
  const exportCircuits = () => {
    if (!atlas || !livingCircuits.ok) return;
    download('mousebio-schematic-circuits.json', JSON.stringify({ schemaVersion: 'mousebio.schematic-circuits.v1',
      atlasId: atlas.id, assetSha256: atlas.statistics.glbSha256 ?? atlas.statistics.assetSha256 ?? null, coordinateFrameId: atlas.coordinateFrame.id,
      classification: livingCircuits.classification, evidence: livingCircuits.evidence, connectorsAreAnatomicalGeometry: false,
      displayTiming: CIRCUIT_DISPLAY_TIMING, displayColors: CIRCUIT_COLORS, edges: livingCircuits.edges, omittedRoutes: livingCircuits.omittedRoutes,
      limitations: livingCircuits.limitations, references: livingCircuits.references }, null, 2));
  };
  const selectedSummaries = compatible.filter((group) => group.structureId === selected);
  const first = compatible[0];
  const comparison = mode === 'comparative' && selected && first && activeA && activeB ? compareConditions(rows, {
    structureId: selected, measurement: first.measurement, unit: first.unit, timePoint: first.timePoint,
    conditionA: activeA, conditionB: activeB,
  }) : null;
  const inLab = mode === 'dissection' && !!atlas && dissectionAppliesTo(atlas);
  const settings: ViewerSettings = { lab: inLab, life: atlas && dissectionAppliesTo(atlas) ? (inLab ? { ...life, on: true, playing: true, movement: false, walking: false, heart: labAlive, breathing: labAlive, blood: labAlive, gut: labAlive, nerves: false } : mode === 'comparative' ? { ...life, walking: false } : life) : undefined, covered: journeyOpen, selected, hidden, opacity, clipAxis, clipPosition, living: mode === 'living', playing, speed, cardiac, respiratory, circuits: { circulation, neural: neuralSignals, selectionOnly: circuitSelectionOnly }, colors: colorA, labels, autoRotate: autoRotate && mode !== 'comparative', surfaceDisplay, colourScheme, allLabels, sectionImage: mode === 'comparative' ? 'none' : sectionImage, coat, dissection: mode === 'comparative' ? null : dissection };
  const openAllLayers = () => {
    if (!atlas) return;
    setHidden([]); setOpacity(referenceOpacity(atlas)); setClipAxis('off'); setAutoRotate(false); setActiveGroup(''); setAllLabels(true);
    setDissection({ opening: 1, folded: false, cutOrgans: false }); setDissectionPlace('side'); viewer.current?.placeDissection('side');
    setNavigatorTab('systems'); setInspectorOpen(false);
  };
  /** Go on from a structure to the cells of its tissue, where a route has been made for that tissue. */
  const zoomIntoStructure = (id: string, place?: string, playing?: boolean) => {
    const structure = atlas?.structures.find((item) => item.id === id);
    const tissue = structure ? journeyTissueOf(structure) : null;
    if (!structure || !tissue) { if (structure) setNotice(`No zoom into the tissue of ${structure.name} has been made yet.`); return; }
    setJourneyFrom({ tissue, name: structure.name, place, playing }); setJourneyOpen(true);
  };
  /** The zoom has gone through the layers: on into the first of these structures for whose tissue a route has been made. */
  const zoomThrough = (ids: readonly string[], place?: string, playing?: boolean) => {
    const structures = ids.flatMap((id) => atlas?.structures.find((item) => item.id === id) ?? []);
    const found = structures.find((item) => journeyTissueOf(item));
    if (found) zoomIntoStructure(found.id, place, playing);
    else if (structures[0]) setNotice(`No zoom into the tissue of ${structures[0].name} has been made yet.`);
  };
  /** The bench for practising with instruments is set up on the whole living mouse, with nothing else open. */
  const enterLab = async () => {
    let onto = atlas;
    if (onto && !dissectionAppliesTo(onto)) onto = (await switchReference(DEFAULT_REFERENCE_ID), null);
    setDissection(null); setDissectionReport(null); setAllLabels(false); setAutoRotate(false); setClipAxis('off'); setJourneyOpen(false); setJourneyFrom(null); setActiveGroup('');
    setHidden([]); if (onto) setOpacity(labOpacity(onto));
    setInspectorOpen(false); setDetailsAsked(false); setNavigatorOpen(true); setLabCaption(null); setLabPicked(null);
  };
  const labExercise = LAB_EXERCISES.find((item) => item.id === labExerciseId) ?? null;
  /** A tutorial starts from the whole animal, lying as the procedure has it. */
  const chooseLabExercise = (id: string) => {
    setLabExerciseId(id);
    setLabChooser(false);
    setLabPicked(null);
    const chosen = LAB_EXERCISES.find((item) => item.id === id);
    const session = viewer.current?.lab();
    if (!session) return;
    session.setGuide(null);
    if (!chosen) { session.extendLeg(null); return; }
    session.restart();
    session.setPose(chosen.pose);
    session.extendLeg(chosen.extendLeg ?? null);
    setLabAlive(chosen.alive);
  };
  const labEvent = (event: LabEvent) => {
    if (event.kind === 'report') setLabReport(event.report);
    else if (event.kind === 'picked') { setLabPicked(event.id); setSelected(event.id); setPicked(true); }
    else if (event.kind === 'refused') setNotice(event.message);
    else if (event.kind === 'alive') setLabAlive(event.alive);
    else setLabCaption(event.text);
  };
  const closeAllLayers = () => { setDissection(null); setDissectionReport(null); setAllLabels(false); viewer.current?.reset(); };
  const toggleHidden = (id: string) => { isolation.current = null; setActiveGroup(''); pendingGroupFocus.current = null; setHidden((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]); };
  /** Make opaque skin see-through so that regions inside the body can be seen. Returns whether it changed. */
  const peelSkin = () => {
    const skin = atlas ? bodySurfaceIdFor(atlas) : null, seeThrough = atlas ? seeThroughSkinOpacity(atlas) : null;
    if (!atlas || !skin || seeThrough === null || hidden.includes(skin)) return false;
    const skinStructure = atlas.structures.find((structure) => structure.id === skin)!;
    if ((opacity[skin] ?? defaultStructureOpacity(skinStructure)) < OPAQUE_SKIN) return false;
    setOpacity((previous) => ({ ...previous, [skin]: seeThrough }));
    return true;
  };
  const select = (id: string) => {
    if(!atlas?.structures.some(region=>region.id===id))return;
    setPicked(true);
    // At the bench the skin stays as it has been cut, and a name only says which part is meant.
    if(mode==='dissection'){setLabPicked(id);setSelected(id);return;}
    if(id!==bodySurfaceIdFor(atlas)&&peelSkin())setNotice('Skin made see-through to show the selected region.');
    setSelected(id);setHidden(previous=>previous.filter(value=>value!==id));
    if((opacity[id]??1)===0)setOpacity(previous=>({...previous,[id]:1}));
    setFineEnabled(false);setDetailLevel('fine-020');setDetailStatus({status:'idle',structureId:null});
    if(focusOnSelection)focusRegions([id]);setNavigatorOpen(false);
  };
  const openInspector=(tab:'structure'|'observations'|'source'='structure')=>{setDetailsAsked(true);setPicked(true);setInspectorTab(tab);setInspectorOpen(true);setInspectorFocus(value=>value+1);};
  const openNavigator=(tab:'structures'|'systems'|'sources')=>{setNavigatorTab(tab);setNavigatorOpen(true);};
  const toggleSystem=(id:string)=>{
    if(!atlas)return;const members=atlas.structures.filter(region=>region.systems.some(system=>system===id));if(!members.length)return;
    const allVisible=members.every(region=>!hidden.includes(region.id)&&(opacity[region.id]??defaultStructureOpacity(region))>0);
    const ids=new Set(members.map(region=>region.id));isolation.current=null;setActiveGroup('');pendingGroupFocus.current=null;
    setHidden(previous=>allVisible?[...new Set([...previous,...ids])]:previous.filter(value=>!ids.has(value)));
    if(!allVisible)setOpacity(previous=>({...previous,...Object.fromEntries(members.filter(region=>(previous[region.id]??defaultStructureOpacity(region))<=0).map(region=>[region.id,1]))}));
  };
  const isolateSystem=(id:string)=>{
    if(!atlas)return;const members=atlas.structures.filter(region=>region.systems.some(system=>system===id));if(!members.length)return;
    if(!isolation.current){isolation.current=[...hidden];isolationOpacity.current={...opacity};}
    const ids=new Set(members.map(region=>region.id));setHidden(atlas.structures.filter(region=>!ids.has(region.id)).map(region=>region.id));
    setOpacity(previous=>({...previous,...Object.fromEntries(members.map(region=>[region.id,1]))}));
    if(!selected||!ids.has(selected))setSelected(members[0].id);setActiveGroup('');setClipAxis('off');focusRegions([...ids]);
  };
  const focusRegions = (ids: readonly string[]) => {
    if (!atlas || !ids.length) return;
    pendingGroupFocus.current = { atlasId: atlas.id, ids };
    if (viewerState.primary === 'ready' && viewer.current) {
      viewer.current.focusRegions(ids); pendingGroupFocus.current = null;
    }
  };
  /** Open the source images on a central section through the specimen, facing the camera towards the cut. */
  const cutSpecimen = () => {
    setSectionImage((previous) => previous === 'none' ? 'cryosection' : previous);
    // On a model that stands in a posture, the middle of its bounds is not the middle of the body, because the tail and limbs reach to one side.
    setClipPosition(viewer.current?.bodyCentrePercent('y') ?? 50); setClipAxis('y'); if (!layerStack.length) setDisplayOpen(true); setNavigatorOpen(false);
    viewer.current?.viewCutFace('y');
  };
  const viewerReady = (details: ViewerDiagnostics) => {
    setDiagnostics(details);
    if (pendingCut.current) { pendingCut.current = false; viewer.current?.viewCutFace('y'); }
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
      dataImportSequence.current++; dataImportPending.current=0; setDataImportBusy(false); viewImportSequence.current++;
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
    dataImportSequence.current++; dataImportPending.current=0; setDataImportBusy(false); viewImportSequence.current++;
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
  const applyCoverageTarget = (loaded: Atlas, target: AnatomyGroup, context: 'hidden' | 'faded') => {
    const members = new Set(target.structureIds);
    setHidden(context === 'hidden' ? loaded.structures.filter((region) => !members.has(region.id)).map((region) => region.id) : []);
    setOpacity(Object.fromEntries(loaded.structures.map((region) => [region.id, members.has(region.id) ? 1 : Math.min(defaultStructureOpacity(region), 0.08)])));
    setSelected(target.structureIds[0]); setActiveGroup(target.id); setQuery(''); setNavigatorTab('structures');
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
  const switchReference = async (id: string, coverageTopic?: AnatomyCoverageTopicId, context: 'hidden' | 'faded' = 'faded', starterId?: string) => {
    const next = getReference(referenceCatalog.catalog, id);
    const cachedTrace = localTrace?.atlas.id === id ? localTrace : null;
    if ((!next && !cachedTrace) || (id === atlas?.id && !coverageTopic && !starterId)) return;
    traceImportSequence.current++; setTraceLoading(false); setTraceError('');
    const sequence = ++referenceSequence.current;
    referenceRequest.current?.abort();
    const abort = new AbortController(); referenceRequest.current = abort;
    setReferenceLoading(true); setReferenceError(''); setStartError('');
    dataImportSequence.current++; dataImportPending.current=0; setDataImportBusy(false); viewImportSequence.current++;
    try {
      let loaded: Atlas;
      if (id === atlas?.id && (coverageTopic || starterId)) loaded = atlas;
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
      const starter=starterId ? resolvePrototypeStarter(loaded,starterId):null;
      if(starter && (!starter.ok || !starter.target))throw new Error('The starting view does not match the reviewed source.');
      const restored = loaded === atlas ? false : adoptReference(loaded);
      if(starter?.target){applyCoverageTarget(loaded,starter.target,'hidden');setMode('anatomical');setStartOpen(false);setNotice('Starting view opened in its source coordinate frame.');return;}
      if (coverage?.target) {
        applyCoverageTarget(loaded, coverage.target, context);
        setNotice('Source anatomy opened. Other references retain their observations and coordinate frames.');
      } else setNotice(restored ? 'Reference switched. Its local observations were restored.' : 'Reference switched. Previous observations remain in this browser session.');
    } catch (error) {
      if (sequence === referenceSequence.current && !abort.signal.aborted && starterId)setStartError('The starting view could not be opened. The current reference and observations were retained.');
      else if (sequence === referenceSequence.current && !abort.signal.aborted)
        setReferenceError(coverageTopic ? 'The requested source anatomy could not be opened. The current reference and observations were retained.' : error instanceof Error ? error.message : 'Reference switch failed.');
    } finally { if (sequence === referenceSequence.current) setReferenceLoading(false); }
  };
  const openStarter=(id:string)=>{const starter=getPrototypeStarter(id);if(starter)void switchReference(starter.referenceId,undefined,'hidden',id);};
  const tryExample=()=>{
    const current=currentData.current;
    if(current.rows.length || dataImportPending.current || referenceLoading || traceLoading){setNotice('Existing observations or an active import must be cleared before loading a fictional example.');return;}
    const example=createPrototypeExample(current.atlas);
    if(!example.ok || !example.data){setNotice('The fictional example is unavailable for this reference.');return;}
    dataImportSequence.current++; dataImportPending.current=0; setDataImportBusy(false);setRows(example.data.rows);setMetadata(example.data.metadata);
    currentData.current={...current,rows:example.data.rows,metadata:example.data.metadata};
    setImportResult(null);setSeries('');setConditionA('control-example');setConditionB('treatment-example');setMode('comparative');setFineEnabled(false);setDataPanelOpen(true);
    const targets=[...new Set(example.data.rows.map(row=>row.structureId))],members=new Set(targets);
    if(current.atlas){setHidden(current.atlas.structures.filter(region=>!members.has(region.id)).map(region=>region.id));setOpacity(Object.fromEntries(current.atlas.structures.map(region=>[region.id,members.has(region.id)?1:defaultStructureOpacity(region)])));}
    setSelected(targets[0]??null);setClipAxis('off');setActiveGroup('');isolation.current=null;focusRegions(targets);
    setNotice('Fictional software example loaded. These values are not experimental observations.');
  };
  const isolate = () => {
    if (!atlas || !selected) return;
    setActiveGroup(''); pendingGroupFocus.current = null;
    if (isolation.current) { setHidden(isolation.current);if(isolationOpacity.current)setOpacity(isolationOpacity.current);isolation.current=null;isolationOpacity.current=null; }
    else { isolation.current = [...hidden]; isolationOpacity.current={...opacity}; setHidden(atlas.structures.filter((structure) => structure.id !== selected).map((structure) => structure.id)); setOpacity(previous=>({...previous,[selected]:1})); }
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
    setDataPanelOpen(true);
    const sequence = ++dataImportSequence.current; dataImportPending.current=0; setDataImportBusy(false);
    if (fileInput.current) fileInput.current.value = '';
    if (file.size > 5 * 1024 * 1024) { setImportResult({ ok: false, rows: [], errors: [{ code: 'file-size', message: 'Maximum file size is 5 MiB.' }], warnings: [] }); return; }
    dataImportPending.current=sequence;setDataImportBusy(true);
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
    } catch { if (sequence === dataImportSequence.current) setImportResult({ ok: false, rows: [], errors: [{ code: 'file-read', message: 'The local file could not be read.' }], warnings: [] }); } finally {if(dataImportPending.current===sequence){dataImportPending.current=0;setDataImportBusy(false);}}
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
      download('mousebio-view.json', exportViewState({ mode, selected, hidden, opacity: effectiveOpacity, clipAxis, clipPosition, labels, background: 'white', ...(cameraPose ? { cameraPose } : {}), living: { playing, speed, cardiac, respiratory } }, atlas));
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
      setClipAxis(state.clipAxis); setClipPosition(state.clipPosition); setLabels(state.labels);
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
    const visibleCount = atlas.structures.filter((structure) => !hidden.includes(structure.id) && (opacity[structure.id] ?? 1) > 0).length;
  const activeTrace = localTrace?.atlas === atlas ? localTrace : undefined;
  const sourceTrace = isSourceTraceAtlas(atlas);
  const parentLinkedTrace = !!activeTrace || sourceTrace;
  const sourcePolyline = isSourcePolylineAtlas(atlas);
  const lineReference = parentLinkedTrace || sourcePolyline;
  const skinId = bodySurfaceIdFor(atlas);
  const hasBodyEnvelope = !!skinId;
  const skinOpacity = skinId ? opacity[skinId] ?? defaultStructureOpacity(atlas.structures.find((structure) => structure.id === skinId)!) : 0;
  const smoothing = smoothingOptionsFor(atlas);
  const sectionImages = sectionImagesApplyTo(atlas);
  const cutFaceShown = sectionImages && mode !== 'comparative' && clipAxis !== 'off' && sectionImage !== 'none' && sectionStatus.status === 'ready' && sectionStatus.id === sectionImage;
  const chooseSectionAxis = (axis: typeof clipAxis) => { setClipAxis(axis); if (axis !== 'off' && sectionImages && sectionImage !== 'none') viewer.current?.viewCutFace(axis); };
  const viewerFailed = viewerState.primary === 'failed' || (mode === 'comparative' && viewerState.secondary === 'failed');
  const labCard = !inLab ? null : labExercise ? <LabTutorial key={labExercise.id} exercise={labExercise} facts={labReport?.facts??null} demonstrating={!!labReport?.demonstrating} shown={labCaption} onStep={(index)=>{const step=labExercise.steps[index];const session=viewer.current?.lab();if(!step||!session)return;session.setGuide(step.guide??null);if(labReport?.demonstrating)return;if(step.tool)session.setTool(step.tool);if(step.view)viewer.current?.labView(step.view);}} onShow={(index)=>{const step=labExercise.steps[index];if(step){if(step.view)viewer.current?.labView(step.view);viewer.current?.lab()?.showStep(step.show,step.text,step.done);}}} onWatchAll={()=>{setLabPicked(null);viewer.current?.lab()?.demonstrate(labExercise.id);}} onStop={()=>viewer.current?.lab()?.stopDemonstration()} onClose={()=>chooseLabExercise('')} onAct={()=>viewer.current?.lab()?.perfuse()}/> : labChooser ? <LabChooser onChoose={chooseLabExercise} onFree={()=>setLabChooser(false)}/> : null;
  return <div className={`app-shell workbench mode-${mode} ${inspectorOpen&&detailsAsked?'inspector-open':''} ${navigatorOpen?'navigator-open':''} ${picked?'picked':''} ${journeyOpen?'journey-open':''} ${inLab&&!labPanelOpen?'lab-panel-closed':''}`}>
    <header className="app-header">
      <a className="brand" href="/" aria-label="MouseBio_3D home"><span className="brand-mark"><MouseMark height={54} /></span><span><strong>Mouse<span className="brand-bio">Bio</span><span className="brand-suffix">_3D</span></strong><small>DIGITAL MOUSE LABORATORY</small></span></a>
      <nav className="mode-nav" aria-label="Exploration mode">{MODES.map((item) => <button key={item.id} className={mode === item.id ? 'active' : ''} aria-pressed={mode === item.id} onClick={() => { const wasLab = mode === 'dissection'; setMode(item.id); if (item.id === 'dissection') { if (!wasLab) void enterLab(); return; } if (wasLab && atlas) { setHidden([]); setOpacity(referenceOpacity(atlas)); setLabReport(null); setLabCaption(null); } if (item.id === 'comparative') setFineEnabled(false); if (item.id !== 'anatomical' && !wasLab) peelSkin(); }}><Icon name={item.icon} /><span>{item.label}</span></button>)}</nav>
      <div className="header-actions"><button className="secondary-button" onClick={()=>{setStartError('');setStartOpen(true);}}>Start here</button><span className="local-badge"><Icon name="lock" size={13} /> Local session</span><button className="icon-button" onClick={() => setMethods(true)} title="Methods, sources and limitations" aria-label="Methods, sources and limitations"><Icon name="info" /></button></div>
    </header>

    <aside className={`navigator panel ${navigatorOpen?'drawer-open':''}`} aria-label="Anatomy navigator">
      {inLab && <LabPanel card={labCard} choosing={!labExercise&&labChooser} onHide={()=>setLabPanelOpen(false)} report={labReport} exercise={labExercise} selected={labPicked ? { id: labPicked, name: atlas.structures.find((structure) => structure.id === labPicked)?.name ?? labPicked } : null} modelId={atlas.id} canLookCloser={(id) => { const found = atlas.structures.find((structure) => structure.id === id); return !!found && !!journeyTissueOf(found); }} nameOf={(id) => atlas.structures.find((structure) => structure.id === id)?.name ?? id} onExercise={chooseLabExercise} onTool={(tool) => viewer.current?.lab()?.setTool(tool)} onPose={(pose) => viewer.current?.lab()?.setPose(pose)} onView={(view) => viewer.current?.labView(view)} onTake={(id) => viewer.current?.lab()?.take(id)} onLookCloser={(id) => zoomIntoStructure(id)} onUndo={() => viewer.current?.lab()?.undo()} onRestart={() => { viewer.current?.lab()?.restart(); setLabPicked(null); }} onDetails={() => openInspector('structure')} onDownload={(text) => download('mousebio-practice-record.json', text)} namesOn={allLabels} onNames={(on) => { setAllLabels(on); viewer.current?.lab()?.look(); }} alive={labAlive} onAlive={setLabAlive} sound={life.sound} onSound={(sound) => setLife((previous) => ({ ...previous, sound }))} steady={labSteady} onSteady={(on) => { setLabSteady(on); viewer.current?.lab()?.setSteady(on); }} />}
      <div className="panel-heading"><span className="eyebrow">ANATOMY EXPLORER</span><span className="version-tag">v{appVersion}</span><button className="drawer-close icon-button" aria-label="Close anatomy navigator" onClick={()=>setNavigatorOpen(false)}>×</button></div>
      <h1>Explore the mouse</h1>
      <div className="active-source-button"><span className="reference-dot"/><span><strong>{referenceSummary.source.displayName}</strong><small>{referenceSummary.specimen.scientificName} · {referenceSummary.specimen.sex} · {referenceSummary.specimen.mass}</small></span><span className="tiny-tag">{referenceSummary.source.license}</span></div>
      <label className="reference-selector">Anatomy reference<select aria-label="Anatomy reference" value={atlas.id} disabled={referenceLoading} onChange={(event) => void switchReference(event.target.value)}>{referenceCatalog.catalog.map((entry) => <option key={entry.id} value={entry.id}>{entry.title}</option>)}{localTrace && <option value={localTrace.atlas.id}>Local morphology trace</option>}</select></label>
      {referenceError && <p role="alert" className="view-import-error">Reference unchanged. {referenceError}</p>}
      <div className="navigator-tabs" role="tablist" aria-label="Anatomy navigation">
        {([['structures','Structures'],['systems','Layers'],['sources','Sources']] as const).map(([id,label])=><button key={id} role="tab" aria-selected={navigatorTab===id} aria-controls={`navigator-${id}`} id={`navigator-tab-${id}`} onClick={()=>setNavigatorTab(id)}>{label}</button>)}
      </div>
      <div id="navigator-structures" role="tabpanel" aria-labelledby="navigator-tab-structures" hidden={navigatorTab!=='structures'} className="navigator-pane">
        <label className="search-field"><Icon name="search" size={16}/><input ref={searchInput} type="search" placeholder="Search structures or source IDs" aria-label="Find a structure or ID" value={query} onChange={event=>setQuery(event.target.value)}/><kbd>/</kbd></label>
        <div className="structure-toolbar"><span><span>{visibleCount} visible {evidenceShown ? (visibleCount === 1 ? 'structure' : 'structures') : (visibleCount === 1 ? 'region' : 'regions')}</span> <small>of {atlas.structures.length}</small></span><button className="text-button" onClick={showAll}>Show all</button></div>
        <div className="structure-list">{orderedStructures(atlas, evidenceShown).filter((structure) => `${structure.name} ${structure.id} ${structure.sourceLabel}`.toLowerCase().includes(query.toLowerCase())).map((structure, index, list) => <Fragment key={structure.id}>{evidenceShown && (index === 0 || list[index - 1].systems[0] !== structure.systems[0]) && <h4 className="structure-group">{SYSTEMS.find((system) => system.id === structure.systems[0])?.name ?? structure.systems[0]}</h4>}<div className={`structure-row ${selected === structure.id ? 'selected' : ''} ${hidden.includes(structure.id) ? 'is-hidden' : ''}`}>
          <button className="structure-name" onClick={() => select(structure.id)} aria-pressed={selected === structure.id}><span className={`structure-dot system-${structure.systems[0]}`} style={{ backgroundColor: displayColour(structure, colourScheme) }} /><span>{structure.name}<small>{structure.id}</small>{evidenceShown&&<EvidenceChip structure={structure}/>}</span></button>
          <button className="visibility-button" aria-label={`${hidden.includes(structure.id) ? 'Show' : 'Hide'} ${structure.name}`} onClick={() => toggleHidden(structure.id)}><Icon name={hidden.includes(structure.id) ? 'hidden' : 'eye'} size={15} /></button>
        </div></Fragment>)}
        {!atlas.structures.some(region=>`${region.name} ${region.id} ${region.sourceLabel}`.toLowerCase().includes(query.toLowerCase()))&&<p className="empty-small">No matching source record.</p>}
        </div>
      </div>
      <div id="navigator-systems" role="tabpanel" aria-labelledby="navigator-tab-systems" hidden={navigatorTab!=='systems'} className="navigator-pane">
        {dissectionAppliesTo(atlas)&&mode!=='comparative'&&<AllLayers settings={dissection} place={dissectionPlace} report={dissectionReport} selected={selected} namesShown={allLabels} onOpen={openAllLayers} onClose={closeAllLayers} onChange={setDissection} onPlace={(place)=>{setDissectionPlace(place);viewer.current?.placeDissection(place);}} onNames={setAllLabels} onSelect={setSelected}/>}
        {layerStack.length>0&&<LayerStack stops={layerStack} active={matchingStop(layerStack,hidden,opacity,coat!=='none')} onChoose={(stop)=>{setDissection(null);setDissectionReport(null);setHidden([...stop.hidden]);setOpacity({...stop.opacity});setCoat((previous)=>stop.coat?(previous==='none'?'agouti':previous):'none');setClipAxis('off');setActiveGroup('');}}/>}
        {layerStack.length>0&&<button className="secondary-button section-cut-button layer-cut" onClick={cutSpecimen}>Cut through the body</button>}
        {evidenceShown&&<EvidenceFilter groups={evidenceGroups(atlas,hidden)} onToggle={(group)=>{setHidden((current)=>toggledEvidence(current,group));if(group.evidence==='simulated')setCoat(group.visible===group.ids.length?'none':'agouti');}}/>}
        <SystemLayers atlas={atlas} hidden={hidden} opacity={opacity} onToggleSystem={toggleSystem} onIsolateSystem={isolateSystem} onShowAll={showAll} unit={evidenceShown?'structures':'source regions'}/>
        {hasBodyEnvelope&&<button className="secondary-button" onClick={showOrgans} aria-label="Organs visibility preset">Reveal organs</button>}
        {sectionImages&&<button className="secondary-button section-cut-button" onClick={cutSpecimen}>Cut through the specimen</button>}
        {atlas.id==='digimouse-tessellated-v1'&&<button className="secondary-button section-cut-button" disabled={referenceLoading} onClick={()=>{pendingCut.current=true;void switchReference('digimouse-volume-040-v1').then(cutSpecimen);}} title="Opens the registered-volume reference of this specimen, whose grid the source images share">Open specimen photographs</button>}
              <div className="anatomy-group-bar"><label>Isolate a source group<select aria-label="Source anatomy group" value={selectedGroup ? activeGroup : ''} disabled={!anatomyGroups?.ok} onChange={(event) => { const group = anatomyGroups?.groups.find((entry) => entry.id === event.target.value); if (group) exploreGroup(group); }}><option value="" disabled>Current view</option>{anatomyGroups?.groups.map((group) => <option key={group.id} value={group.id}>{group.title} ({group.structureIds.length})</option>)}</select></label><button className="secondary-button" disabled={visibleCount === 0 || viewerState.primary !== 'ready'} onClick={() => focusRegions(atlas.structures.filter((structure) => !hidden.includes(structure.id) && (opacity[structure.id] ?? defaultStructureOpacity(structure)) > 0).map((structure) => structure.id))}><Icon name="focus" size={15} /> Fit visible regions</button>{selectedGroup && <details className="group-limitations"><summary>Group limits</summary><p>{selectedGroup.description}</p><ul>{selectedGroup.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}</ul></details>}</div>
      {anatomyGroups?.ok && <SourceLayerControls key={atlas.id} groups={anatomyGroups.groups} onApply={applySourceLayers} />}

      </div>
      <div id="navigator-sources" role="tabpanel" aria-labelledby="navigator-tab-sources" hidden={navigatorTab!=='sources'} className="navigator-pane source-pane">
      <div className="local-trace-input"><input ref={traceFileInput} type="file" accept=".swc,text/plain" aria-label="Open local SWC trace" onChange={(event) => void openLocalTrace(event.target.files?.[0])} /><button className="secondary-button" onClick={() => traceFileInput.current?.click()}>Open local SWC</button><small>Local files stay in browser memory. Reload clears them.</small></div>
      {traceError && <p role="alert" className="view-import-error">Local trace unchanged. {traceError}</p>}

      <p className="reference-description">{traceLoading ? 'Reading local trace. Current reference and observations are retained.' : referenceLoading ? 'Loading reference. Current observations are retained.' : activeTrace ? 'User-supplied source samples and parent links. Physical units, biological identity and provenance are unverified.' : reference?.coverage.description ?? 'Coverage description unavailable.'}</p>

              <AnatomyCoverage referenceId={atlas.id} busy={referenceLoading || traceLoading} onOpen={openCoverage} />
        <button className="secondary-button" onClick={()=>{setStartError('');setStartOpen(true);}}>Guided source views</button>
      </div>
      <div className="navigator-footer"><span>{referenceSummary.source.license}</span><button className="text-button" onClick={()=>openInspector('source')}>Source and scientific limits</button></div>
    </aside>

    <main className="workspace">
      <div className="workspace-heading"><div><span className="eyebrow">{MODES.find((item) => item.id === mode)?.label.toUpperCase()} WORKSPACE</span><h2>{mode === 'anatomical' ? 'Anatomical reference' : mode === 'living' ? 'Physiology workspace' : mode === 'experimental' ? 'Map your observations' : 'Compare experimental states'}</h2></div></div>
      <div className="workspace-toolbar"><div><button className="secondary-button" onClick={()=>openNavigator('structures')} aria-label="Browse structures"><Icon name="layers"/> Structures</button><button className="secondary-button" onClick={()=>openNavigator('systems')} aria-label="Browse anatomical layers">Layers</button><button className="secondary-button" onClick={()=>openNavigator('sources')} aria-label="Choose anatomical reference">Sources</button></div><div><button className="secondary-button structure-details-shortcut" aria-controls="structure-inspector" aria-expanded={inspectorOpen&&detailsAsked} onClick={()=>{setInspectorOpen(detailsAsked?!inspectorOpen:true);setDetailsAsked(true);}}>Details</button>{(mode==='experimental'||mode==='comparative')&&<button className="secondary-button" aria-expanded={dataPanelOpen} onClick={()=>setDataPanelOpen(!dataPanelOpen)}>Dataset {rows.length?`(${rows.length})`:''}</button>}</div></div>
      <div className="source-scope-strip"><span>{referenceSummary.source.displayName} · {referenceSummary.specimen.scope}</span><button className="text-button" onClick={()=>openInspector('source')}>{atlas.assetFormat==='ply-native-v1'||parentLinkedTrace?'Units unknown':'Calibration unverified'}</button></div>
      {(atlas.assetFormat === 'ply-native-v1' || parentLinkedTrace) && <p className="source-frame-note" role="status">Native source coordinates. Physical units are unknown; no calibrated measurements or cross-reference registration are available.</p>}
      {sourcePolyline && <p className="source-frame-note" role="status">Source graph coordinates. Physical calibration, anatomical direction and registration remain unverified.</p>}


      {viewError && <p className="view-import-error" role="alert">View settings unchanged. {viewError}</p>}


      {(mode === 'experimental' || mode === 'comparative') && <div className="data-toolbar">
        <label>Measurement<select aria-label="Measurement series" value={activeSeries} onChange={(event) => setSeries(event.target.value)} disabled={!seriesOptions.length}><option value="" disabled>No observations imported</option>{seriesOptions.map((group) => <option key={seriesKey(group)} value={seriesKey(group)}>{group.measurement} ({group.unit}) · {group.timePoint}</option>)}</select></label>
        <label>{mode === 'comparative' ? 'Condition A' : 'Condition'}<select aria-label="Condition A" value={activeA} onChange={(event) => setConditionA(event.target.value)} disabled={!conditions.length}>{!conditions.length && <option value="">No condition</option>}{conditions.map((condition) => <option key={condition}>{condition}</option>)}</select></label>
        {mode === 'comparative' && <label>Condition B<select aria-label="Condition B" value={activeB} onChange={(event) => setConditionB(event.target.value)} disabled={!conditions.length}>{!conditions.length && <option value="">No condition</option>}{conditions.map((condition) => <option key={condition}>{condition}</option>)}</select></label>}
      </div>}
      {rows.length > 0 && metadata.origin === 'synthetic-example' && (mode === 'experimental' || mode === 'comparative') && <p className="synthetic-banner" role="status">Synthetic example data. These values are not experimental observations.</p>}
      {mode === 'comparative' && rows.length > 0 && (conditions.length < 2 || activeA === activeB) && <p className="view-import-error" role="status">Choose two distinct conditions in this measurement series.</p>}
      <div className="viewer-stage"><section className={`viewport ${mode === 'comparative' ? 'comparison-viewport' : ''}`} aria-label="Anatomical viewer">
        <div className="viewport-top"><span className="viewport-breadcrumb">{referenceSummary.source.displayName.toUpperCase()} <span>/</span> {mode === 'comparative' ? 'SYNCHRONIZED REFERENCE' : referenceSummary.specimen.scope.toUpperCase()}</span><div className="viewport-top-actions"><span className="viewport-chip"><span /> {atlas.structures.length} {evidenceShown?'structures':'source regions'}</span></div></div>
        <details className="scene-display" open={displayOpen} onToggle={event=>setDisplayOpen((event.target as HTMLDetailsElement).open)}><summary>Display controls</summary>
          <label><input type="checkbox" checked={focusOnSelection} onChange={event=>setFocusOnSelection(event.target.checked)}/> Focus on selection</label>
          <label><input type="checkbox" checked={autoRotate} disabled={mode==='comparative'} onChange={event=>setAutoRotate(event.target.checked)}/> Auto-rotate</label>
          {smoothing&&<label title={`Taubin smoothing, ${smoothing.iterations} iterations; removes the processing-grid staircase and adds no resolution`}><input type="checkbox" checked={surfaceDisplay==='smoothed'} onChange={event=>setSurfaceDisplay(event.target.checked?'smoothed':'source')}/> Smooth voxel surfaces (display only)</label>}
          <label>Colours <select aria-label="Display colour scheme" value={colourScheme} onChange={event=>setColourScheme(event.target.value as ColourScheme)}><option value="tissue">Tissue-like display colours</option><option value="source">Manifest colours</option><option value="contrast">Contrasting colours</option></select></label>{atlas.id==='mousebio-living-v1'&&<label className="coat-choice">Coat<select aria-label="Simulated coat" value={coat} onChange={(event)=>setCoat(event.target.value as CoatId)}><option value="agouti">Agouti, simulated</option><option value="black">Black, simulated</option><option value="albino">Albino, simulated</option><option value="none">None, skin only</option></select></label>}
                <div className="section-bar"><Icon name="layers" size={18} /><div><strong>Virtual section</strong><small>{sectionImages&&sectionImage!=='none'&&mode!=='comparative'?'Source images of this specimen on the cut':'Surface clipping, without tissue reconstruction'}</small></div><select aria-label="Section axis" value={clipAxis} onChange={(event) => chooseSectionAxis(event.target.value as typeof clipAxis)}><option value="off">No section</option><option value="x">Display X</option><option value="y">Display Y</option><option value="z">Display Z</option></select><input type="range" aria-label="Section position" min="0" max="100" value={clipPosition} disabled={clipAxis === 'off'} onChange={(event) => setClipPosition(+event.target.value)} /><span>{clipPosition}%</span>{sectionImages&&<label className="section-image-choice">Cut face <select aria-label="Cut face image" value={sectionImage} disabled={mode==='comparative'} onChange={event=>setSectionImage(event.target.value as SectionImageChoice)}><option value="cryosection">Specimen photograph</option><option value="ct">CT</option><option value="none">None</option></select>{clipAxis!=='off'&&sectionImage!=='none'&&sectionStatus.status==='loading'&&<small>Loading images</small>}{clipAxis!=='off'&&sectionImage!=='none'&&sectionStatus.status==='failed'&&<small role="alert">Images unavailable</small>}</label>}</div>
        {skinId&&<label className="skin-control" title="Opacity of the body surface shown as skin; display only">Skin <input type="range" min="0" max="100" aria-label="Skin opacity" value={Math.round(skinOpacity*100)} onChange={event=>{const value=+event.target.value/100;setOpacity(previous=>({...previous,[skinId]:value}));if(value>0)setHidden(previous=>previous.filter(id=>id!==skinId));setActiveGroup('');}}/><span>{Math.round(skinOpacity*100)}%</span></label>}<div className="view-controls"><span className="control-divider" />{(['x', 'y', 'z'] as const).map((axis) => <button className="viewer-button axis-button" key={axis} aria-label={`View along display ${axis} axis`} title={`Display ${axis.toUpperCase()} axis; not an anatomical direction`} onClick={() => viewer.current?.view(axis)}>{axis.toUpperCase()}</button>)}<span className="control-divider" /><button className={`viewer-button ${labels ? 'active' : ''}`} aria-label="Toggle selected structure label" aria-pressed={labels} onClick={() => setLabels(!labels)}>Aa</button><button className={`viewer-button label-all-button ${allLabels ? 'active' : ''}`} aria-label="Label all displayed regions" title="Label all displayed regions without overlaps" aria-pressed={allLabels} onClick={() => setAllLabels(!allLabels)}>All</button></div><div className="display-actions"><button className="secondary-button" onClick={()=>focusRegions(atlas.structures.filter(region=>!hidden.includes(region.id)&&(opacity[region.id]??defaultStructureOpacity(region))>0).map(region=>region.id))}>Fit visible</button><div className="view-file-actions"><input ref={viewFileInput} type="file" className="view-file-input" accept=".json,application/json" aria-label="Restore view state" onChange={(event) => void restoreView(event.target.files?.[0])} /><button className="secondary-button save-view" onClick={() => viewFileInput.current?.click()} title="Load view settings"><Icon name="upload" size={15} /><span>Load view</span></button><button className="secondary-button save-view" onClick={exportView} title="Save view settings"><Icon name="download" size={15} /><span>Save view</span></button></div></div></details><div className="canvas-pair">
          <div className="canvas-cell">{mode === 'comparative' && <div className="condition-label"><span>A</span>{activeA || 'Reference anatomy'}</div>}<Suspense fallback={viewerLoading}><ViewerCanvas key={`primary-${mode === 'comparative'}`} onLab={labEvent} onZoomToSkin={()=>setJourneyOpen(true)} onZoomToStructure={zoomIntoStructure} onZoomThrough={zoomThrough} onDissectionReport={setDissectionReport} atlas={atlas} localTrace={activeTrace} detailAsset={detailAsset} onDetailStatus={setDetailStatus} settings={settings} pathSignal={mode==='living'&&pathSignal?.referenceId===atlas.id?pathSignal:undefined} onSelect={select} handle={viewer} onReady={viewerReady} onStatus={(status) => setViewerState((previous) => ({ ...previous, primary: status }))} cameraPose={cameraPose} onCameraChange={setCameraPose} onAutoRotateEnd={()=>setAutoRotate(false)} onSectionImageStatus={setSectionStatus} /></Suspense></div>
          {mode === 'comparative' && <div className="canvas-cell"><div className="condition-label"><span>B</span>{activeB || 'Reference anatomy'}</div><Suspense fallback={viewerLoading}><ViewerCanvas atlas={atlas} localTrace={activeTrace} detailAsset={detailAsset} settings={{ ...settings, colors: colorB }} onSelect={select} handle={compareViewer} onStatus={(status) => setViewerState((previous) => ({ ...previous, secondary: status }))} cameraPose={cameraPose} onCameraChange={setCameraPose} /></Suspense></div>}
        </div>
        {dissectionAppliesTo(atlas)&&!inLab&&<LifeBadge life={life} onChange={setLife}/>}
        {inLab&&labCaption&&<p className="lab-caption" role="status">{labCaption}</p>}
        {inLab&&!labPanelOpen&&<button type="button" className="lab-panel-show" onClick={()=>setLabPanelOpen(true)}>Show the steps and instruments</button>}
        {journeyOpen&&layerStack.length>0&&<Suspense fallback={null}><ScaleJourney life={life} tissue={journeyFrom?.tissue} from={journeyFrom?.name} place={journeyFrom?.place} autoplay={journeyFrom?.playing} onExit={()=>{setJourneyOpen(false);setJourneyFrom(null);viewer.current?.zoom(1.12);}}/></Suspense>}
        <div className="camera-pad" role="group" aria-label="Camera controls"><button aria-label="Pan display up" onClick={()=>viewer.current?.pan(0,.1)}>↑</button><button aria-label="Zoom in" onClick={()=>viewer.current?.zoom(.8)}>+</button><button aria-label="Pan display left" onClick={()=>viewer.current?.pan(-.1,0)}>←</button><button aria-label="Reset camera" onClick={()=>viewer.current?.reset()}>⌖</button><button aria-label="Pan display right" onClick={()=>viewer.current?.pan(.1,0)}>→</button><button aria-label="Pan display down" onClick={()=>viewer.current?.pan(0,-.1)}>↓</button><button aria-label="Zoom out" onClick={()=>viewer.current?.zoom(1.25)}>−</button><button aria-label="Save a picture of the view" title="Save a picture of the view" onClick={()=>{const picture=viewer.current?.picture();if(picture){const anchor=document.createElement('a');anchor.href=picture;anchor.download='mousebio-view.png';anchor.click();}}}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z"/><circle cx="12" cy="13" r="3.4"/></svg></button></div>
        {shownGroups.length > 0 && (mode === 'experimental' || mode === 'comparative') && <div className="quantitative-legend"><strong>Mean {first?.measurement}</strong><span>{first?.unit} · {first?.timePoint}</span><div className="color-ramp" /><div className="legend-numbers"><span>{format(min)}</span><span>{format(max)}</span></div><small>Unmapped regions keep their display colours</small></div>}
        <div className="viewport-bottom"><span>Drag to rotate <i /> Scroll to zoom <i /> Click to select</span><span className="display-frame">Display axes · orientation unverified</span></div>
        {evidenceShown && !cutFaceShown && <span className="section-image-label constructed-label">CONSTRUCTED MODEL: POSTURE, COAT AND STRUCTURES MARKED SIMULATED ARE NOT MEASURED</span>}
        {cutFaceShown && <span className="section-image-label">{sectionImage === 'ct' ? 'CUT FACE: SOURCE CT OF THIS SPECIMEN' : 'CUT FACE: SOURCE PHOTOGRAPH OF THIS SPECIMEN, FROZEN AND POSTMORTEM'}</span>}
        {mode === 'living' && availableMotion.length > 0 && <span className="illustrative-label">ILLUSTRATIVE MOTION · NOT A VALIDATED SIMULATION</span>}
        {circuitsShown && <><span className="circuit-label">SCHEMATIC ROUTES · CONNECTORS ARE NOT VESSEL OR NERVE GEOMETRY</span>
          <div className="circuit-legend" role="note" aria-label="Schematic route legend"><strong>SCHEMATIC ROUTES</strong>
            {circulation && <><span><i style={{ background: CIRCUIT_COLORS['systemic-arterial'] }} />Oxygen-rich blood</span><span><i style={{ background: CIRCUIT_COLORS['systemic-venous'] }} />Oxygen-poor blood</span><span><i style={{ background: CIRCUIT_COLORS['hepatic-portal'] }} />Hepatic portal blood</span></>}
            {neuralSignals && <><span><i style={{ background: CIRCUIT_COLORS['neural-efferent'] }} />Efferent nerve signal</span>{livingCircuits.edges.some((edge) => edge.kind === 'neural-afferent') && <span><i style={{ background: CIRCUIT_COLORS['neural-afferent'] }} />Afferent nerve signal</span>}</>}
            <small>Teaching colours. Tracer and pulse speeds are arbitrary display rates.</small></div></>}
      </section>
        {!inLab&&<SelectionTools onZoomIn={selectedStructure&&layerStack.length>0&&journeyTissueOf(selectedStructure)?()=>zoomIntoStructure(selectedStructure.id):undefined} selected={selectedStructure??null} hidden={!!selectedStructure&&(hidden.includes(selectedStructure.id)||(opacity[selectedStructure.id]??defaultStructureOpacity(selectedStructure))<=0)} opacity={selectedStructure?(opacity[selectedStructure.id]??defaultStructureOpacity(selectedStructure)):1} isolated={!!isolation.current} onFocus={()=>viewer.current?.focus()} onToggleHidden={()=>{if(!selectedStructure)return;if(!hidden.includes(selectedStructure.id)&&(opacity[selectedStructure.id]??1)<=0)setOpacity(previous=>({...previous,[selectedStructure.id]:1}));else toggleHidden(selectedStructure.id);}} onIsolate={isolate} onOpacityChange={value=>{if(!selectedStructure)return;setActiveGroup('');pendingGroupFocus.current=null;setOpacity(previous=>({...previous,[selectedStructure.id]:value}));}} onOpenDetails={()=>openInspector('structure')}/>}
      </div>

      {mode === 'living' && dissectionAppliesTo(atlas) && <LifePanel life={life} onChange={setLife} />}
      {mode === 'living' && !dissectionAppliesTo(atlas) && (availableMotion.length > 0 ? <div className="living-panel"><div className="living-controls"><button className="play-button" aria-label={playing ? 'Pause physiology' : 'Play physiology'} onClick={() => setPlaying(!playing)}><Icon name={playing ? 'pause' : 'play'} size={17} /></button><div><strong>Educational playback</strong><small>Arbitrary display timing and amplitude</small></div><label className="speed-control">Speed<select value={speed} onChange={(event) => setSpeed(+event.target.value)} aria-label="Playback speed">{[...new Set([0.25, 0.5, 1, 2, 4, speed])].sort((a, b) => a - b).map((value) => <option key={value} value={value}>{value}x</option>)}</select></label></div><div className="process-options"><label><input type="checkbox" checked={cardiac && hasCardiacMotion} disabled={!hasCardiacMotion} onChange={() => setCardiac(!cardiac)} /> Cardiac contraction</label><label><input type="checkbox" checked={respiratory && hasRespiratoryMotion} disabled={!hasRespiratoryMotion} onChange={() => setRespiratory(!respiratory)} /> Respiratory motion</label><span>{livingCircuits.ok ? 'Schematic tracers show route order only. No blood-flow simulation is implemented for this reference' : 'No blood-flow simulation is implemented for this reference'}</span></div>
        {livingCircuits.ok && <div className="circuit-options" role="group" aria-label="Schematic circulation and nerve routes">
          <label><input type="checkbox" checked={circulation} onChange={() => setCirculation(!circulation)} /> Blood circulation routes</label>
          <label><input type="checkbox" checked={neuralSignals} onChange={() => setNeuralSignals(!neuralSignals)} /> Nerve signalling routes</label>
          <label><input type="checkbox" checked={circuitSelectionOnly} onChange={() => setCircuitSelectionOnly(!circuitSelectionOnly)} /> Selected region only</label>
          <button className="text-button" onClick={exportCircuits}>Download route table</button>
          <p className="circuit-note">{livingCircuits.edges.length} schematic connectors between existing source regions, from cited textbook topology. Connectors are not vessel or nerve geometry. {livingCircuits.omittedRoutes.length > 0 ? `${livingCircuits.omittedRoutes.length} routes are omitted because their organs are not segmented in this reference.` : ''}</p>
        </div>}</div> :<div className="living-panel"><p>No physiological motion is available for this reference.</p></div>)}
      <SourceSignalPanel key={atlas.id} atlas={atlas} active={mode==='living'} onSignal={setPathSignal} onFocus={row=>viewer.current?.focusPolylinePath(row)??false} onOpenReference={id=>void switchReference(id)}/>
      <CardiacCellPanel active={mode==='living'} />
      {(mode === 'experimental' || mode === 'comparative') && <div className="data-panel" hidden={!dataPanelOpen}><div className="data-panel-heading"><div><strong>{rows.length ? metadata.title || 'Local experimental dataset' : 'Connect measurements to anatomy'}</strong><p>{rows.length ? `${rows.length} observations · ${new Set(rows.map((row) => row.replicate)).size} biological subject IDs · ${summaries.length} groups` : 'Import CSV or JSON with explicit structure IDs, units and biological replicates.'}</p></div>{rows.length > 0 && <button className="text-button" onClick={() => { dataImportSequence.current++; dataImportPending.current=0; setDataImportBusy(false); setRows([]); setImportResult(null); setMetadata({ origin: 'user-data' }); }}>Clear local data</button>}</div>
        <div className="import-actions"><input ref={fileInput} id="dataset-file" type="file" accept=".csv,.json,text/csv,application/json" aria-label="Import experimental dataset" onChange={(event) => void importFile(event.target.files?.[0])} /><button className="primary-button" onClick={() => fileInput.current?.click()}><Icon name="upload" size={15} /> Import dataset</button><button className="secondary-button" onClick={() => download('mousebio-template.csv', exportExperimentalCsv([]), 'text/csv')}>CSV template</button><button className="secondary-button" disabled={!rows.length} onClick={exportDataset}><Icon name="download" size={15} /> Export JSON</button>{!rows.length&&<button className="secondary-button" disabled={referenceLoading||traceLoading||dataImportBusy} onClick={tryExample}>Try synthetic comparison</button>}<span className="privacy-note"><Icon name="lock" size={13} /> Files stay in this browser session</span></div>
        {importResult && <div className={`import-result ${importResult.ok ? 'success' : 'invalid'}`} role="status">{importResult.ok ? `Accepted ${importResult.rows.length} measurements. No data transmitted.` : <><strong>Import rejected. Existing observations are retained.</strong><ul>{importResult.errors.slice(0, 6).map((error, index) => <li key={index}>{error.row ? `Row ${error.row}: ` : ''}{error.message}</li>)}</ul>{importResult.errors.length > 6 && <span>{importResult.errors.length - 6} additional errors. Correct these rows and reimport.</span>}</>}{importResult.warnings.map((warning, index) => <p key={index}>{warning.message}</p>)}</div>}
        {!rows.length && <p className="schema-hint"><code>structure_id, measurement, value, unit, replicate, condition, time_point</code><br />Use IDs from this reference, such as <code>{initialReferenceSelection(atlas)}</code>. One row per biological subject, structure, measurement, condition and time point. Maximum 5 MiB. Observations stay attached to their original reference.</p>}
        {rows.length > 0 && <><p className="dataset-source">{metadata.sourceReference ? `Declared source: ${metadata.sourceReference}` : 'Source reference not supplied.'}</p><DatasetDetails metadata={metadata} onChange={setMetadata} /></>}
        {mode === 'comparative' && <p className="comparison-note">Both panels use the same selected reference geometry. Only imported measurements change. Condition labels do not generate anatomical differences.</p>}
      </div>}
      <footer className="workspace-footer"><span><span className={`status-dot ${viewerFailed ? 'status-failed' : ''}`} /> {viewerFailed ? '3D viewer unavailable' : diagnostics ? diagnostics.traces ? sourcePolyline ? `${diagnostics.traces} line reference · ${diagnostics.samples.toLocaleString()} source points · ${diagnostics.segments.toLocaleString()} polyline segments` : `${diagnostics.traces} trace · ${diagnostics.samples.toLocaleString()} samples · ${diagnostics.segments.toLocaleString()} parent links` : `${diagnostics.meshes} meshes loaded · ${diagnostics.triangles.toLocaleString()} triangles` : 'Loading anatomy'}</span><span>{evidenceShown?'Constructed model':'Source-derived geometry'} · no expert review</span></footer>
    </main>

    <aside className="inspector panel" id="structure-inspector" ref={inspector} tabIndex={-1} hidden={!inspectorOpen} aria-label="Structure details">
      <div className="panel-heading"><span className="eyebrow">STRUCTURE DETAILS</span><button className="icon-button" aria-label="Close structure details" onClick={()=>setInspectorOpen(false)}>×</button></div>
      {selectedStructure?<>
              <div className="structure-type">{selectedStructure.systems.map((id) => SYSTEMS.find((system) => system.id === id)?.name).filter(Boolean).join(' / ') || (activeTrace ? 'Local trace; biological identity unverified' : 'Source surface; system classification unreviewed')}</div><h2>{selectedStructure.name}</h2><code className="structure-id">{selectedStructure.id}</code>{evidenceShown&&<EvidenceChip structure={selectedStructure}/>}

        <div className="inspector-tabs" role="tablist" aria-label="Structure detail sections">{([['structure','Structure'],['observations','Observations'],['source','Source evidence']] as const).map(([id,label])=><button key={id} role="tab" id={`inspector-tab-${id}`} aria-selected={inspectorTab===id} aria-controls={`inspector-${id}`} onClick={()=>setInspectorTab(id)}>{label}</button>)}</div>
        <div id="inspector-structure" role="tabpanel" aria-labelledby="inspector-tab-structure" hidden={inspectorTab!=='structure'}>      {evidenceShown&&<section className={`inspector-section evidence-note evidence-note-${evidenceOf(selectedStructure)}`}><h3>Evidence</h3><p>{EVIDENCE_NOTES[evidenceOf(selectedStructure)]}{selectedStructure.division?` ${DIVISION_NOTE}`:''}</p>{selectedStructure.basis?.length?<ul className="evidence-basis">{selectedStructure.basis.map((item)=><li key={item}>{item}</li>)}</ul>:null}</section>}<section className="inspector-section"><h3>{evidenceShown?'Description':'Source annotation'}</h3><p>{selectedStructure.description}</p><dl><dt>Original label</dt><dd>{String(selectedStructure.sourceLabel)}</dd><dt>Biological detail</dt><dd>{parentLinkedTrace ? 'Traced samples and parent links' : sourcePolyline ? 'Source points and polylines' : evidenceShown && selectedStructure.evidence !== 'source' ? (selectedStructure.evidence === 'simulated' ? 'Simulated, not measured' : 'Traced, not reviewed') : 'Source segmented region'}</dd><dt>Ontology review</dt><dd>{ontologyCandidate ? 'Proposed association only' : 'No candidate association'}</dd></dl></section>
       {!lineReference && <SurfaceDetail baseSpacing={reference?.processingResolution.processingVoxelSpacingMm?.[0]} levels={selectedLevels} levelId={detailLevel} asset={availableDetail} enabled={fineActive} comparative={mode === 'comparative'} viewerFailed={viewerFailed} status={detailStatus} onLevelChange={(id) => { setDetailLevel(id); setDetailStatus({ status: 'idle', structureId: null }); }} onEnabledChange={(enabled) => { setFineEnabled(enabled); setDetailStatus({ status: 'idle', structureId: null }); }} />}
       {parentLinkedTrace && <TraceSampleExplorer key={atlas.id} atlas={atlas} localTrace={activeTrace} viewerReady={viewerState.primary === 'ready'} onFocusSample={(sampleId) => viewer.current?.focusTraceSample(sampleId) ?? false} />}
      {sourcePolyline && <><SourcePolylineExplorer key={atlas.id} atlas={atlas} viewerReady={viewerState.primary === 'ready'} onFocusPath={(row) => viewer.current?.focusPolylinePath(row) ?? false} /></>}
       {mode === 'living' && <section className="inspector-section"><h3>Motion model</h3><p>{dissectionAppliesTo(atlas)&&selectedStructure ? lifeDescription(selectedStructure) ?? 'Moves only with the body it lies in. Illustrative.' : selectedMotion?.limitations[0] ?? 'No physiological animation is implemented for this region.'}</p>{selectedMotion && <span className="status-tag">Illustrative classification</span>}</section>}
       {mode === 'living' && livingCircuits.ok && <CircuitConnections result={livingCircuits} structureId={selectedStructure.id} structures={atlas.structures} />}
</div>
        <div id="inspector-observations" role="tabpanel" aria-labelledby="inspector-tab-observations" hidden={inspectorTab!=='observations'}>{mode!=='experimental'&&mode!=='comparative'&&<p className="inspector-hint">Open Experiment or Compare to inspect mapped observations.</p>}      {(mode === 'experimental' || mode === 'comparative') && <section className="inspector-section"><h3>Mapped observations</h3>{selectedSummaries.length ? <><p className="muted compact">Mean and sample standard deviation, in {first?.unit}. No inferential statistics.</p>{selectedSummaries.map((group) => <div className="measurement-card" key={group.condition}><span>{group.condition} <small>n = {group.n}</small></span><strong>{format(group.mean)} <small>{group.unit}</small></strong><p>SD {format(group.sd)} · {group.timePoint}</p></div>)}{comparison && <div className="comparison-result">{comparison.ok ? <><span>Mean B minus mean A</span><strong>{format(comparison.difference)} {first?.unit}</strong></> : comparison.errors.map((error) => <p key={error.code}>{error.message}</p>)}{comparison.warnings.map((warning) => <p key={warning.code}>{warning.message}</p>)}</div>}</> : <p>No observations match this structure and the selected series.</p>}</section>}
</div>
        <div id="inspector-source" role="tabpanel" aria-labelledby="inspector-tab-source" hidden={inspectorTab!=='source'}>      <DevelopmentalContext summary={referenceSummary} />
      {activeTrace && <LocalTraceRecord asset={activeTrace} />}
      {sourceTrace && <SourceTraceRecord atlas={atlas} />}
       <NativeSurfaceRecord atlas={atlas} structureId={selectedStructure.id} />
 {sourcePolyline&&<SourcePolylineRecord atlas={atlas}/>}       {ontologyCandidate && <OntologyContext candidate={ontologyCandidate} onDownload={() => download('ontology-candidates.json', JSON.stringify(ontologyCandidateData, null, 2))} />}
       <section className="inspector-section provenance-section"><h3>Scientific provenance</h3><div className="source-reference"><span>01</span><div><strong>{referenceSummary.source.citationLabel}</strong><p>{referenceSummary.source.title}</p>{sourceLink && <a href={sourceLink} target="_blank" rel="noreferrer">View publication ↗</a>}</div></div><div className="license-line">Anatomical geometry {referenceSummary.source.licenseUrl ? <a href={referenceSummary.source.licenseUrl} target="_blank" rel="noreferrer">{referenceSummary.source.license}</a> : <span>{referenceSummary.source.license}</span>}</div><button className="text-button" onClick={() => download('mousebio-reference-manifest.json', JSON.stringify(atlas, null, 2))}>Download provenance manifest <Icon name="download" size={13} /></button></section>
      <div className="scientific-note"><Icon name="info" size={17} /><p>Source coverage is limited. Anatomical orientation and physical calibration need independent verification.</p></div>
</div>
      </>:<p>Select a structure or source record.</p>}
    </aside>
    <PrototypeStart open={startOpen} busy={referenceLoading||traceLoading} error={startError} onClose={()=>setStartOpen(false)} onOpen={openStarter} onPhysiology={()=>{setMode('living');setStartOpen(false);}} />
    {notice && <div className="toast" role="status">{notice}</div>}
    <dialog ref={dialog} className="methods-dialog" onCancel={() => setMethods(false)} onClick={(event) => { if (event.target === event.currentTarget) setMethods(false); }}><div className="dialog-header"><span className="eyebrow">METHODS AND PROVENANCE</span><button className="icon-button" onClick={() => setMethods(false)} aria-label="Close methods"><Icon name="close" /></button></div><h2>A source-grounded starting point</h2><p>MouseBio_3D is an incremental digital laboratory mouse maintained by Qasim Hussain. The active reference contains {atlas.structures.length} source regions. Each reference retains its own source identifiers and coordinate frame. Switching references does not register their anatomies.</p><div className="method-stats"><div><strong>{atlas.structures.length}</strong><span>source regions</span></div><div><strong>{SYSTEMS.length}</strong><span>system categories</span></div><div><strong>{referenceSummary.specimen.count}</strong><span>declared specimens</span></div></div><h3>Declared specimen</h3><p>{referenceSummary.specimen.description}</p><dl><dt>Species</dt><dd>{referenceSummary.specimen.scientificName}</dd><dt>Sex</dt><dd>{referenceSummary.specimen.sex}</dd><dt>Strain</dt><dd>{referenceSummary.specimen.strain}</dd><dt>Age</dt><dd>{referenceSummary.specimen.age}</dd><dt>Mass</dt><dd>{referenceSummary.specimen.mass}</dd><dt>Coverage</dt><dd>{referenceSummary.specimen.scope}</dd></dl><h3>What the data support</h3><ul>{atlas.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}</ul><p>Magnification changes the view only. Available cellular traces, regional vessel graphs and nerve sources retain their stated scope. No microscopic geometry is generated by zoom. Surface motion is illustrative; the independent cardiac cell model in Living has its own equation variant, protocol and limitations. Experimental comparisons use your imported observations on identical reference geometry.</p><h3>Coordinates and transformations</h3><p>Declared source units: {typeof atlas.coordinateFrame.sourceUnits === 'string' ? atlas.coordinateFrame.sourceUnits : 'Unknown'}. Declared asset units: {typeof atlas.coordinateFrame.assetUnits === 'string' ? atlas.coordinateFrame.assetUnits : 'Unknown'}. The viewer centers the object and rotates it 90 degrees about display Z for presentation. Anatomical axis labels, calibrated measurements and spatial registration remain disabled.</p><h3>Sources and licenses</h3><p>{referenceSummary.source.citationLabel}. {sourceLink && <a href={sourceLink} target="_blank" rel="noreferrer">Publication</a>} {referenceSummary.source.licenseUrl && <a href={referenceSummary.source.licenseUrl} target="_blank" rel="noreferrer">{referenceSummary.source.license}</a>}</p><p>Declared anatomical license: {referenceSummary.source.license}. {referenceSummary.source.attribution} Original source code is MIT; original documentation is CC BY 4.0. Automated geometry checks are not independent anatomical review.</p><p className="privacy-method"><Icon name="lock" size={16} /> Imported research files stay in memory on this device. Reloading clears them. No analytics, remote data service or automatic upload is used.</p><button className="primary-button" onClick={() => setMethods(false)}>Return to laboratory <Icon name="arrow" size={15} /></button></dialog>
  </div>;
}
