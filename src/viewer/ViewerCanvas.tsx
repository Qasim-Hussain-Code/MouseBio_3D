import { createPathSignalOverlay, type PathSignalOverlay } from './path-signal-overlay';
import { createLivingCircuitOverlay, type LivingCircuitOverlay } from './living-circuit-overlay';
import { buildLivingCircuits } from '../domain/living-circuits';
import type { PathSignalDisplay } from './path-signal-display';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { installSurfaceShading, surfaceShadingOf, SURFACE_PRESENTATION, SKIN_PRESENTATION, type SurfaceShadingUniforms } from './surface-shading';
import { DISSECTION_PLACES, DISSECTION_TIERS, dissectionAppliesTo, dissectionTier, namesToShow, orderHere, placeNameFromBone, placeNameOfSurface, tierFold, tierRadius, type DissectionPlaceId, type DissectionSettings, type DissectionTierId, type HereItem } from '../domain/dissection';
import { findInWindow, foldMatrix, insideWindow, throughSurface, type WindowShape } from './dissection-window';
import { createZoomUnfold, type ZoomUnfold } from './zoom-unfold';
import { createLifeRuntime, type LifeBinding, type LifeRuntime } from './life-runtime';
import { LIFE_SHARED } from './life-field';
import { createFlowTokens, flowLinesFrom, isFlowPathFile, type FlowTokens } from './flow-tokens';
import { createMouseVoice } from './mouse-voice';
import { createLabSession, type LabReport, type LabSession, type LabView } from './lab-session';
import { CUT_SHARED } from './cut-uniforms';
import { carried, goToFloor, paceOf, startle, stagePoint, stepWander, WANDER_START, wantsToSit, wantsToStep, type FloorPoint, type StagePose, type WanderState, type WanderView } from '../domain/mouse-walk';
import type { LifeSettings } from '../domain/living-simulation';
import { viewHeightAt } from '../domain/zoom-unfold';
import { UnfoldGuide, UnfoldHint, type UnfoldGuideRow, type UnfoldGuideState } from '../components/UnfoldGuide';
import { createIdPass, createOpeningMark, type SeenStructure } from './id-pass';
import { createContactShadow, type ContactShadow } from './contact-shadow';
import { COATS, createFur, fineHairOptions, hasFurAttribute, turnFurLights, type CoatId, type FurLayer } from './fur';
import { declaresEvidence, markedName } from '../domain/evidence';
import { createSectionImagePlane, cutFaceView, loadSectionVolume, type SectionImagePlane } from './section-image';
import { sectionImagesApplyTo, type SectionImageChoice, type SectionImageId } from '../domain/section-images';
import { bodySurfaceIdFor, displayPostureFor } from '../domain/display-pose';
import { smoothingOptionsFor, smoothSurfaceGeometries } from './surface-smoothing';
import type { SurfaceDisplay } from '../domain/display-smoothing';
import { displayColour, type ColourScheme } from '../domain/tissue-palette';
import { layoutLabels, layoutPlate, leaderEnd, type LabelCandidate, type PlacedLabel } from './label-layout';
import { evaluateIllustrativePhysiology, physiologyProcessesForAtlas, type Atlas } from '../domain';
import { coveredBySkin, defaultStructureOpacity, OPAQUE_SKIN } from '../domain/reference-display';
import { RegionDetailController, type RegionDetailAsset, type RegionDetailStatus } from './region-detail';
import { loadAtlasScene } from './atlas-loader';
import type { LocalTraceAsset } from '../domain/local-trace';
import { disposeRegion, prepareRegionMaterial, regionLabelCenter, linePickingThreshold, nearestClippedLineIntersection, type RenderRegion } from './region-objects';
import { renderDiagnostics, type ViewerDiagnostics } from './viewer-diagnostics';
import { traceSampleFocusBounds } from './trace-sample-focus';
import { sourcePolylinePathBounds } from './polyline-focus';
import { panViewerCamera, viewerNavigationKey, zoomViewerCamera } from './viewer-navigation';
import { applyCameraPose, captureCameraPose, clipPercentAt, createDisplayClipPlane, DISPLAY_ROTATION_Z, fitCameraToBounds, focusCameraOnRegions, isPointRetainedByClipPlane, recenterRegionGeometry, type CameraPose } from './scene-utils';

export type { CameraPose } from './scene-utils';
export type ViewerSettings = {
  selected: string | null;
  hidden: string[];
  opacity: Record<string, number>;
  clipAxis: 'off' | 'x' | 'y' | 'z';
  clipPosition: number;
  living: boolean;
  playing: boolean;
  speed: number;
  cardiac: boolean;
  respiratory: boolean;
  /** Schematic route layers in Living; absent means none are displayed. */
  circuits?: { circulation: boolean; neural: boolean; selectionOnly: boolean };
  colors: Record<string, string>;
  labels: boolean;
  /** Slow orbit around the target until the user takes over. Display only. */
  autoRotate?: boolean;
  /** Smoothed display copies of voxel-derived surfaces, or the source surfaces. Defaults to smoothed. */
  surfaceDisplay?: SurfaceDisplay;
  /** Tissue-like display colours or the manifest colours. Defaults to tissue. */
  colourScheme?: ColourScheme;
  /** Label every displayed region without overlaps, in addition to the selected label. */
  allLabels?: boolean;
  /** Source image shown on the cut face of a virtual section, where the reference has one. Defaults to none. */
  sectionImage?: SectionImageChoice;
  /** Simulated coat on a body surface that carries hair directions. Defaults to agouti. */
  coat?: CoatId;
  /** All layers shown together, opened at one place. Absent means closed. */
  dissection?: DissectionSettings | null;
  /** The illustrative motion of the living mouse. Absent where a reference has none. */
  life?: LifeSettings;
  /** Another view lies over this one, which then need not be drawn. */
  covered?: boolean;
  /** A session of practice with the instruments is open. */
  lab?: boolean;
};
/** What lies at the opened place, from the outside inwards. */
export type DissectionReport = { place: string; items: HereItem[] };
export type SectionImageStatus = { status: 'idle' | 'loading' | 'ready' | 'failed'; id?: SectionImageId };
/** What a session of practice tells the page. */
export type LabEvent = { kind: 'report'; report: LabReport } | { kind: 'picked'; id: string } | { kind: 'refused'; message: string } | { kind: 'caption'; text: string | null };
export type ViewerHandle = { reset: () => void; view: (axis: 'x' | 'y' | 'z') => void; focus: () => void; focusRegions: (ids: readonly string[]) => void; focusTraceSample: (sampleId: number) => boolean; focusPolylinePath: (pathRowIndex: number) => boolean; zoom: (factor: number) => boolean; pan: (dx: number, dy: number) => boolean; viewCutFace: (axis: 'x' | 'y' | 'z') => void; bodyCentrePercent: (axis: 'x' | 'y' | 'z') => number | null; placeDissection: (place: DissectionPlaceId) => void; lab: () => LabSession | null; labView: (view: LabView) => void; picture: () => string | null };
type Props = {
  atlas: Atlas;
  pathSignal?:PathSignalDisplay;
  settings: ViewerSettings;
  onSelect: (id: string) => void;
  onReady?: (details: ViewerDiagnostics) => void;
  localTrace?: LocalTraceAsset;
  onStatus?: (status: 'loading' | 'ready' | 'failed') => void;
  handle: React.RefObject<ViewerHandle | null>;
  cameraPose?: CameraPose;
  onCameraChange?: (pose: CameraPose) => void;
  title?: string;
  detailAsset?: RegionDetailAsset | null;
  onDetailStatus?: (status: RegionDetailStatus) => void;
  /** The user started a pointer interaction while the view was rotating automatically. */
  onAutoRotateEnd?: () => void;
  onSectionImageStatus?: (status: SectionImageStatus) => void;
  /** The user has zoomed on to the visible skin of a standing animal. */
  onZoomToSkin?: () => void;
  /** With the layers open, the user has zoomed right on to a structure in the middle of the view. */
  onZoomToStructure?: (id: string) => void;
  /** The opened place has changed. */
  onDissectionReport?: (report: DissectionReport | null) => void;
  /** The zoom has gone through the layers at a spot and goes on into the tissue of one of these structures, the first being the one in view. */
  onZoomThrough?: (ids: readonly string[], place?: string, playing?: boolean) => void;
  onLab?: (event: LabEvent) => void;
};

export function ViewerCanvas({ atlas, settings, onSelect, onReady, onStatus, handle, cameraPose, onCameraChange, title, detailAsset, onDetailStatus, localTrace, pathSignal, onAutoRotateEnd, onSectionImageStatus , onZoomToSkin, onZoomToStructure, onDissectionReport, onZoomThrough, onLab }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const latest = useRef({ pathSignal, settings, onSelect, onCameraChange, cameraPose, detailAsset, onDetailStatus, onReady, onAutoRotateEnd, onSectionImageStatus, onZoomToSkin, onZoomToStructure, onDissectionReport, onZoomThrough, onLab });
  latest.current = { pathSignal, settings, onSelect, onCameraChange, cameraPose, detailAsset, onDetailStatus, onReady, onAutoRotateEnd, onSectionImageStatus, onZoomToSkin, onZoomToStructure, onDissectionReport, onZoomThrough, onLab };
  const engine = useRef<{ apply: () => void; setPose: (pose: CameraPose) => void; setDetail: () => void } | null>(null);
  const [status, setStatus] = useState('Loading reference geometry');
  const [failure, setFailure] = useState(false);
  const [label, setLabel] = useState<{ x: number; y: number; name: string } | null>(null);
  const [labelSet, setLabelSet] = useState<{ labels: PlacedLabel[]; width: number; height: number }>({ labels: [], width: 0, height: 0 });
  const [hovered, setHovered] = useState<{ x: number; y: number; name: string } | null>(null);
  const [guide, setGuide] = useState<UnfoldGuideState | null>(null);
  const [namesOn, setNamesOn] = useState(false);
  const [everOpened, setEverOpened] = useState(false);
  const namesOnRef = useRef(namesOn);
  namesOnRef.current = namesOn;
  const unfoldRef = useRef<ZoomUnfold | null>(null);

  useEffect(() => {
    if (!host.current) return;
    setStatus('Loading reference geometry'); setFailure(false); setLabel(null); setLabelSet({ labels: [], width: 0, height: 0 });
    latest.current.onDetailStatus?.({ status: 'idle', structureId: null });
    onStatus?.('loading');
    const element = host.current;
    let disposed = false;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance', stencil: true });
    } catch {
      setFailure(true);
      onStatus?.('failed');
      setStatus('WebGL could not start. Enable browser hardware acceleration or use a WebGL 2 compatible browser. The anatomical inventory and data tools remain available.');
      if (latest.current.detailAsset) latest.current.onDetailStatus?.({ status: 'failed', structureId: latest.current.detailAsset.structureId, assetSha256: latest.current.detailAsset.glbSha256, message: 'The 3D renderer is unavailable; regional detail was not loaded.' });
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.localClippingEnabled = true;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    // Neutral tone mapping keeps region hues close to their declared display colours.
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 1;
    // The page paints the white background; the canvas stays transparent.
    renderer.setClearColor('#000000', 0);
    renderer.domElement.setAttribute('aria-label', title ?? 'Interactive anatomical source model');
    renderer.domElement.setAttribute('role', 'img');
    renderer.domElement.setAttribute('tabindex', '0');
    renderer.domElement.setAttribute('aria-description', 'Arrow keys pan the view. Plus and minus zoom. Home resets the view. F focuses the selected source record.');
    element.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    // Image-based studio lighting with a warm key, cool fill and back rim. Light
    // directions are display choices in the display frame, not anatomical axes.
    const pmrem = new THREE.PMREMGenerator(renderer);
    const environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    scene.environment = environment;
    scene.environmentIntensity = 0.7;
    const hemisphere = new THREE.HemisphereLight('#dfe9ea', '#2b333a', 1.1);
    scene.add(hemisphere);
    // The lights stand in the room, so they turn about the mouse as it turns on the floor.
    const lights = new THREE.Group();
    scene.add(lights);
    const key = new THREE.DirectionalLight('#fff4e4', 2.4);
    key.position.set(-2.5, 4, 5.5);
    lights.add(key);
    const fill = new THREE.DirectionalLight('#9fc3cc', 0.7);
    fill.position.set(3, -1, -3);
    lights.add(fill);
    const rim = new THREE.DirectionalLight('#ffffff', 1.1);
    rim.position.set(1.5, 2.5, -5);
    lights.add(rim);
    const camera = new THREE.PerspectiveCamera(36, 1, 0.00001, 100);
    // A reference with an inferred dorsal direction orbits about it, like a turntable.
    const posture = displayPostureFor(atlas);
    const skinId = bodySurfaceIdFor(atlas);
    if (posture) camera.up.set(...posture.up);
    const controls = new OrbitControls(camera, renderer.domElement);
    // Which way the view turns about. Controls read the way up only when they are made, and an animal lying on its back turns it over.
    const orbitUp = camera.up.clone();
    const orbitAbout = (up: THREE.Vector3) => {
      orbitUp.copy(up);
      const held = controls as unknown as { _quat: THREE.Quaternion; _quatInverse: THREE.Quaternion };
      held._quat.setFromUnitVectors(orbitUp, new THREE.Vector3(0, 1, 0));
      held._quatInverse.copy(held._quat).invert();
    };
    controls.enableDamping = false;
    controls.enablePan = true;
    controls.autoRotateSpeed = 1.2;
    controls.addEventListener('start', () => {
      if (controls.autoRotate) { controls.autoRotate = false; latest.current.onAutoRotateEnd?.(); }
    });
    const display = new THREE.Group();
    display.rotation.z = DISPLAY_ROTATION_Z;
    // Nothing is drawn until the camera has been placed for the loaded regions.
    display.visible = false;
    scene.add(display);
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const meshes = new Map<string, RenderRegion>();
    const detailTargets = new Map<string, { mesh: THREE.Mesh<THREE.BufferGeometry>; sourceToLocal: THREE.Matrix4 }>();
    // Voxel-derived references keep both the source surface and its smoothed display copy.
    const surfaceCopies = new Map<string, { source: THREE.BufferGeometry; smoothed: THREE.BufferGeometry }>();
    const smoothingOptions = smoothingOptionsFor(atlas);
    const smoothedDisplay = () => smoothingOptions !== null && latest.current.settings.surfaceDisplay !== 'source';
    let lastSurfaceDisplay: SurfaceDisplay | undefined;
    /** Run with every base surface temporarily showing its source geometry. */
    const withSourceSurfaces = <T,>(run: () => T): T => {
      const swapped: [THREE.Mesh, THREE.BufferGeometry][] = [];
      for (const [id, copies] of surfaceCopies) {
        const mesh = meshes.get(id);
        if (mesh instanceof THREE.Mesh && mesh.geometry === copies.smoothed) { swapped.push([mesh, mesh.geometry]); mesh.geometry = copies.source; }
      }
      try { return run(); } finally { for (const [mesh, geometry] of swapped) mesh.geometry = geometry; }
    };
    const processes = physiologyProcessesForAtlas(atlas.id);
    const cardiacRegions = new Set(processes.find((process) => process.id === 'cardiac-contraction')?.requiredStructures ?? []);
    const respiratoryRegions = new Set(processes.find((process) => process.id === 'respiratory-movement')?.requiredStructures ?? []);
    const bounds = new THREE.Box3();
    let radius = 0.1;
    let frame = 0;
    let dirty = true;
    let lastFrame = 0;
    let elapsed = 0;
    let syncing = false;
    let loaded = false;
    let lastLabel = '';
    let lastLabelSet = '', lastLabelSetAt = 0;
    let shadow: ContactShadow | null = null, shadowDirty = true;
    let fur: FurLayer | null = null, coatShown = false;
    const fineHair: FurLayer[] = [], fineHairOf = new Map<FurLayer, string>();
    let interacting = false, slowFrames = 0, quickFrames = 0, lastFrameAt = 0;
    let sectionRoot: THREE.Object3D | null = null, sectionPlane: SectionImagePlane | null = null;
    let sectionShown: SectionImageId | null = null, sectionFailed: SectionImageId | null = null;
    let sectionRequest: { id: SectionImageId; abort: AbortController } | null = null;
    /** Show the chosen source image on the cut face, loading it once on first use. The plane matches the clip plane. */
    const syncSectionImage = (current: ViewerSettings) => {
      const wanted = loaded && sectionRoot && sectionImagesApplyTo(atlas) && current.clipAxis !== 'off' && current.sectionImage && current.sectionImage !== 'none' ? current.sectionImage : null;
      if (wanted !== sectionFailed) sectionFailed = null;
      if (wanted && wanted !== sectionShown && wanted !== sectionFailed && sectionRequest?.id !== wanted) {
        sectionRequest?.abort.abort();
        const request = { id: wanted, abort: new AbortController() };
        sectionRequest = request;
        latest.current.onSectionImageStatus?.({ status: 'loading', id: wanted });
        void loadSectionVolume(atlas, wanted, request.abort.signal).then((volume) => {
          if (disposed || sectionRequest !== request || !sectionRoot) return;
          sectionRequest = null;
          if (!sectionPlane) {
            sectionRoot.updateWorldMatrix(true, false);
            sectionPlane = createSectionImagePlane(bounds, sectionRoot.matrixWorld.clone().invert());
            scene.add(sectionPlane.mesh);
          }
          sectionPlane.setVolume(volume);
          sectionShown = volume.id;
          latest.current.onSectionImageStatus?.({ status: 'ready', id: volume.id });
          apply();
        }).catch((error) => {
          if (error instanceof DOMException && error.name === 'AbortError') return;
          if (disposed || sectionRequest !== request) return;
          console.error('Section images could not be prepared', error);
          sectionRequest = null; sectionFailed = wanted;
          latest.current.onSectionImageStatus?.({ status: 'failed', id: wanted });
        });
      }
      if (sectionPlane) {
        const show = wanted !== null && wanted === sectionShown;
        sectionPlane.mesh.visible = show;
        // One source voxel in front of the clip plane, on the removed side, so that the cut edges of regions cannot show through.
        if (show) sectionPlane.place(current.clipAxis as 'x' | 'y' | 'z', (current.clipPosition / 100 * 2 - 1) * radius + 0.0001);
      }
    };
    /** True when the opaque body surface covers the regions inside it. */
    const skinCovers = (current: ViewerSettings) => {
      const skin = skinId ? meshes.get(skinId) : undefined;
      return !!skin?.visible && (current.opacity[skinId!] ?? defaultOpacity(skinId!)) >= OPAQUE_SKIN;
    };
    /** Place a label for every displayed region; refreshed at most about twenty times per second. */
    const syncAllLabels = (current: ViewerSettings, timestamp: number) => {
      const zoomOpen = !!unfolder?.open();
      if (zoomOpen ? !namesOnRef.current : !current.allLabels) { if (lastLabelSet) { lastLabelSet = ''; setLabelSet({ labels: [], width: 0, height: 0 }); } return; }
      if (timestamp - lastLabelSetAt < 50) return;
      lastLabelSetAt = timestamp;
      const width = element.clientWidth, height = element.clientHeight;
      const candidates: LabelCandidate[] = [];
      if (windowActive() || lab) {
        // On the opened animal the names stand beside it, and each line ends on a part of the structure that can be seen. They wait while the view moves.
        const here = new Set(lastFound.map((item) => item.id));
        const rows = seenNow && !seenStale ? namesToShow(seenNow.filter((item) => lab ? tierOf(item.id) !== 'skin' : zoomOpen || here.has(item.id)).map((item) => ({ ...item, tier: tierOf(item.id) })), current.selected) : [];
        const plate = rows.map((item) => ({ id: item.id, name: markedName(atlas.structures.find((entry) => entry.id === item.id)!), x: item.x * width, y: item.y * height, depth: 0, priority: item.rank }));
        // The guide stands on the left while zooming, so the names go to the right.
        const placed = layoutPlate(plate.slice(0, zoomOpen ? 14 : 26), { width, height, columnWidth: Math.min(205, width * 0.2), topLeft: 104, topRight: 176, bottomLeft: zoomOpen ? height : 206, bottomRight: 190 });
        const signature = `${width}x${height}|plate|${placed.map((item) => `${item.id}:${item.left},${item.top}`).join('|')}`;
        if (signature !== lastLabelSet) { lastLabelSet = signature; setLabelSet({ labels: placed, width, height }); }
        return;
      }
      const covered = skinCovers(current);
      for (const [id, mesh] of meshes) {
        if (!mesh.visible || (covered && id !== skinId)) continue;
        const selected = id === current.selected;
        if (!selected && (current.opacity[id] ?? defaultOpacity(id)) < 0.3) continue;
        const anchor = regionLabelCenter(mesh); if (!anchor) continue;
        const point = anchor.project(camera);
        const structure = atlas.structures.find((item) => item.id === id)!;
        // Larger displayed regions are placed first; the selection always comes first.
        const extent = mesh.geometry.boundingSphere?.radius ?? 0;
        candidates.push({ id, name: markedName(structure), x: (point.x + 1) / 2 * width, y: (-point.y + 1) / 2 * height, depth: point.z, priority: selected ? Number.MAX_SAFE_INTEGER : extent * mesh.scale.x });
      }
      const labels = layoutLabels(candidates, { width, height });
      const signature = `${width}x${height}|${labels.map((item) => `${item.id}:${item.left},${item.top}`).join('|')}`;
      if (signature !== lastLabelSet) { lastLabelSet = signature; setLabelSet({ labels, width, height }); }
    };
    let pathOverlay:PathSignalOverlay|null=null,pathOverlayKey='',lastPathSignal:PathSignalDisplay|undefined,signalElapsedMs=0;
    const syncPathSignal=()=>{
      const requested=latest.current.pathSignal,current=latest.current.settings;
      const signal=current.living&&requested?.referenceId===atlas.id?requested:undefined;
      const region=atlas.structures.length===1?meshes.get(atlas.structures[0].id):undefined;
      const key=signal&&region instanceof THREE.LineSegments?`${signal.kind}/${signal.pathRowIndex}/${current.clipAxis}/${current.clipPosition}/${region.visible}/${current.opacity[atlas.structures[0].id]??1}/${region.geometry.drawRange.start}/${region.geometry.drawRange.count}`:'';
      const modelChanged=!signal||!lastPathSignal||signal.kind!==lastPathSignal.kind||signal.pathRowIndex!==lastPathSignal.pathRowIndex||signal.kind==='flow'&&lastPathSignal.kind==='flow'&&(signal.transitMs!==lastPathSignal.transitMs||signal.direction!==lastPathSignal.direction)||signal.kind==='activity'&&lastPathSignal.kind==='activity'&&signal.result!==lastPathSignal.result;
      if(modelChanged)signalElapsedMs=0;
      if(key!==pathOverlayKey){pathOverlay?.dispose();pathOverlay=null;pathOverlayKey=key;if(signal&&region instanceof THREE.LineSegments){region.updateWorldMatrix(true,false);pathOverlay=createPathSignalOverlay(region,signal.pathRowIndex);}}
      lastPathSignal=signal;
    };

    const circuits = buildLivingCircuits(atlas);
    let circuitOverlay: LivingCircuitOverlay | null = null, circuitOverlayFailed = false;
    // Anchors are computed once, after the source regions are loaded and recentered.
    const syncCircuits = () => {
      const current = latest.current.settings, layers = current.circuits;
      const wanted = loaded && current.living && circuits.ok && !!layers && (layers.circulation || layers.neural);
      if (wanted && !circuitOverlay && !circuitOverlayFailed) {
        // Anchors are source vertices even while smoothed display copies are shown.
        circuitOverlay = withSourceSurfaces(() => createLivingCircuitOverlay(circuits.edges, meshes));
        if (circuitOverlay) scene.add(circuitOverlay.group); else circuitOverlayFailed = true;
      }
      if (circuitOverlay && circuitOverlay.group.visible !== wanted) { circuitOverlay.group.visible = wanted; dirty = true; }
    };

    const clip = new THREE.Plane();
    // All layers together: the shape of the opening, how far it is open now, and the folded copies of the outer layers.
    const dissectable = dissectionAppliesTo(atlas) && !!posture && !!skinId;
    const tiers = new Map<string, DissectionTierId>();
    const tierOf = (id: string): DissectionTierId => {
      let tier = tiers.get(id);
      if (!tier) { tier = dissectionTier(atlas.structures.find((item) => item.id === id)!); tiers.set(id, tier); }
      return tier;
    };
    let windowShape: WindowShape | null = null, windowOpening = 0;
    let unfolder: ZoomUnfold | null = null, lastGuide = '', guideRows: UnfoldGuideRow[] = [], guidePlace = '';
    let life: LifeRuntime | null = null, flow: FlowTokens | null = null, lifeWaited = 0;
    let lab: LabSession | null = null;
    const voice = createMouseVoice();
    // The mouse walks on the floor of the room. The model stays where it is and the camera, its target and the lights move the other way, so nothing in the model needs to know.
    let wander: WanderState = WANDER_START, walkHold = 0;
    let floor: { origin: THREE.Vector3; forward: THREE.Vector3; side: THREE.Vector3; up: THREE.Vector3; plane: THREE.Plane; body: THREE.Sphere } | null = null;
    const stageTurn = new THREE.Quaternion(), frustum = new THREE.Frustum(), frustumMatrix = new THREE.Matrix4();
    const floorOf = (point: THREE.Vector3): FloorPoint => { const offset = point.clone().sub(floor!.origin); return [offset.dot(floor!.forward), offset.dot(floor!.side)]; };
    /** Move the view for a change of the mouse's place on the floor. */
    const moveStage = (from: StagePose, to: StagePose) => {
      if (!floor) return;
      const { origin, forward, side, up } = floor;
      const carry = (point: THREE.Vector3) => {
        const offset = point.clone().sub(origin), rise = offset.dot(up);
        const [ahead, across] = carried(from, to, offset.dot(forward), offset.dot(side));
        point.copy(origin).addScaledVector(forward, ahead).addScaledVector(side, across).addScaledVector(up, rise);
      };
      carry(camera.position);
      carry(controls.target);
      syncing = true; controls.update(); syncing = false;
      stageTurn.setFromAxisAngle(up, -to.heading);
      lights.quaternion.copy(stageTurn);
      scene.environmentRotation.setFromQuaternion(stageTurn);
      turnFurLights(stageTurn);
      dirty = true;
    };
    /** Where a point of the view meets the floor, no further off than the mouse can be seen, as a point of the model. */
    const floorAtView = (x: number, y: number): THREE.Vector3 | null => {
      if (!floor) return null;
      raycaster.setFromCamera(new THREE.Vector2(x, y), camera);
      const hit = raycaster.ray.intersectPlane(floor.plane, new THREE.Vector3());
      if (!hit) return null;
      const centre = new THREE.Vector3();
      raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
      if (!raycaster.ray.intersectPlane(floor.plane, centre)) return hit;
      const reach = camera.position.distanceTo(centre) * 1.5;
      return hit.distanceTo(centre) > reach ? centre.addScaledVector(hit.clone().sub(centre).normalize(), reach) : hit;
    };
    const stageOf = (point: THREE.Vector3): FloorPoint => { const [ahead, across] = floorOf(point); return stagePoint(wander.pose, ahead, across); };
    /** Would the body, standing at this point of the floor, be out of the view? */
    const outOfView = (point: THREE.Vector3) => {
      if (!floor) return true;
      const centre = floor.body.center.clone().add(point).sub(floor.origin);
      return !frustum.intersectsSphere(new THREE.Sphere(centre, floor.body.radius));
    };
    const wanderView = (): WanderView => {
      camera.updateMatrixWorld();
      frustum.setFromProjectionMatrix(frustumMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
      const here = floor!.origin;
      const fallback = (): FloorPoint => stageOf(here);
      const inside = (): FloorPoint => {
        const point = floorAtView((Math.random() - 0.5) * 1.1, (Math.random() - 0.5) * 0.6);
        return point ? stageOf(point) : fallback();
      };
      return {
        inView: !outOfView(here),
        random: Math.random,
        inside,
        outside() {
          // Out by either side or by the near edge, rather than on and on into the distance.
          const way = Math.random();
          const [x, y] = way < 0.45 ? [-1.9, Math.random() * 0.8 - 0.4] : way < 0.9 ? [1.9, Math.random() * 0.8 - 0.4] : [(Math.random() - 0.5) * 1.6, -1.9];
          const point = floorAtView(x, y);
          return point ? stageOf(point) : fallback();
        },
        entry() {
          const signX = Math.random() < 0.5 ? -1 : 1, signY = Math.random() < 0.5 ? -1 : 1;
          let at: THREE.Vector3 | null = null;
          for (let out = 1.15; out < 5; out *= 1.25) {
            const point = floorAtView(signX * out, signY * Math.min(out, 1.1));
            if (point && outOfView(point)) { at = point; break; }
          }
          return { at: at ? stageOf(at) : fallback(), goal: inside() };
        },
      };
    };
    const flowVessels = new Set<string>();
    const idPass = createIdPass();
    let lastWindowSettings = '', lastSeenIds = '';
    let seenNow: SeenStructure[] | null = null, seenStale = true, seenChangedAt = 0, lastFound: HereItem[] = [], lastPlace = '';
    /** Something that changes what is seen has happened; it is looked at again when the view has been still for a moment. */
    const markSeenStale = () => { seenStale = true; seenChangedAt = performance.now(); };
    let cameraMove: { from: CameraPose; to: CameraPose; t: number } | null = null;
    const foldRoots = new Map<DissectionTierId, THREE.Group>();
    const folds = new Map<string, THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>>();
    const reducedMotion = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    function windowActive() { return dissectable && !!windowShape && windowOpening > 0.001; }
    const skinIsOpaque = (current: ViewerSettings) => !!skinId && !current.hidden.includes(skinId) && (current.opacity[skinId] ?? defaultOpacity(skinId)) >= OPAQUE_SKIN;
    /** Radius of the opening in a layer as it stands now. */
    const openRadius = (id: string, current: ViewerSettings) => unfolder?.open() ? unfolder.radiusOf(id) : windowShape && current.dissection && windowActive() ? tierRadius(tierOf(id), windowShape.radius, { ...current.dissection, opening: windowOpening }) : 0;
    const foldedCopy = (id: string, mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>) => {
      let copy = folds.get(id);
      if (copy) { if (copy.geometry !== mesh.geometry) copy.geometry = mesh.geometry; return copy; }
      const material = mesh.material.clone();
      material.userData = {};
      installSurfaceShading(material);
      copy = new THREE.Mesh(mesh.geometry, material);
      copy.userData.structureId = id;
      copy.matrixAutoUpdate = false;
      folds.set(id, copy);
      return copy;
    };
    const foldRootFor = (tier: DissectionTierId) => {
      let root = foldRoots.get(tier);
      if (!root) { root = new THREE.Group(); root.matrixAutoUpdate = false; scene.add(root); foldRoots.set(tier, root); }
      return root;
    };
    const INNER_OF_SKIN = new THREE.Color('#ecc9bb');
    // Inside the animal is seen only through the opening: where the part of an outer surface that was taken out would have been, a mark is left, and everything further in is drawn only on that mark.
    // So a soft part or a measured bone that reaches the skin of a slender simulated limb stays hidden, as it would under whole skin.
    const openingMarks = new Map<string, THREE.Mesh>();
    // The eyes belong to the layer of the organs, and yet they are seen from outside.
    const seenFromOutside = new Set(atlas.structures.filter((item) => item.exterior).map((item) => item.id));
    const openingMarkFor = (id: string, mesh: THREE.Mesh, shading: SurfaceShadingUniforms) => {
      let mark = openingMarks.get(id);
      if (!mark) {
        mark = createOpeningMark(mesh.geometry, windowUniforms(shading));
        openingMarks.set(id, mark);
        mesh.add(mark);
      }
      if (mark.geometry !== mesh.geometry) mark.geometry = mesh.geometry;
      return mark;
    };
    /** Set every layer's opening, and fold back what has been taken out. */
    const syncWindow = (current: ViewerSettings) => {
      const shape = windowShape, on = windowActive();
      const roots = new Map<DissectionTierId, THREE.Matrix4>();
      // Once the view is wholly inside the opening of the outer layer there is no coat to keep the inside behind, and hairs need not be drawn.
      const pastSkin = !!unfolder?.skinOutOfView(), nearCut = unfolder?.nearCut() ?? 0;
      if (flow) {
        const lifeNow = current.life;
        flow.mesh.visible = !!lifeNow?.on && (lifeNow.blood || lifeNow.nerves) && (on || !!lab || !skinIsOpaque(current));
        flow.show(!!lifeNow?.blood, !!lifeNow?.nerves);
        flow.setMasked(!!lab || (on && !!shape && skinIsOpaque(current) && !pastSkin));
        flow.setNear(nearCut);
      }
      for (const root of foldRoots.values()) root.visible = false;
      for (const [id, mesh] of meshes) {
        if (!(mesh instanceof THREE.Mesh)) continue;
        const shading = surfaceShadingOf(mesh.material);
        if (!shading) continue;
        const radius = on ? openRadius(id, current) : 0;
        const tier = tierOf(id);
        shading.uWinOn.value = radius > 0 ? 1 : 0;
        shading.uWinNear.value = nearCut;
        const covering = !!lab || (on && !!shape && skinIsOpaque(current) && !pastSkin);
        const outer = tier === 'skin' || seenFromOutside.has(id);
        // What has been lifted out of the body is seen wherever it lies.
        mesh.material.stencilWrite = covering && !outer && !lab?.taken.has(id);
        mesh.material.stencilFunc = THREE.EqualStencilFunc;
        mesh.material.stencilRef = 1;
        if (outer) mesh.renderOrder = covering ? -2 : mesh.renderOrder;
        const fold = folds.get(id);
        if (fold) fold.visible = false;
        const existingMark = openingMarks.get(id);
        if (existingMark) existingMark.visible = false;
        if (lab) {
          if (outer) openingMarkFor(id, mesh, shading).visible = true;
          shading.uSolidCut.value = 1;
          shading.uInner.value.copy(outer ? INNER_OF_SKIN : mesh.material.color).multiplyScalar(outer ? 1 : 0.78); shading.uInnerOn.value = 1;
          continue;
        }
        if (radius <= 0 || !shape) continue;
        if (covering && outer) openingMarkFor(id, mesh, shading).visible = true;
        shading.uWinA.value.copy(shape.a); shading.uWinB.value.copy(shape.b); shading.uWinN.value.copy(shape.normal);
        shading.uWinDepth.value = shape.depth; shading.uWinFront.value = shape.front; shading.uWinRadius.value = radius; shading.uWinInvert.value = 0;
        shading.uSolidCut.value = 1;
        shading.uInner.value.copy(tier === 'skin' ? INNER_OF_SKIN : mesh.material.color).multiplyScalar(tier === 'skin' ? 1 : 0.78); shading.uInnerOn.value = 1;
        const degrees = current.dissection ? tierFold(tier, { ...current.dissection, opening: windowOpening }) : 0;
        if (radius <= 0 || degrees <= 0 || !mesh.visible || mesh.layers.mask !== 1) continue;
        // A folded layer is a second drawing of the same surface, keeping only what was taken out and turned about the top of its opening.
        const base = DISSECTION_TIERS.find((item) => item.id === tier)!.width * shape.radius;
        let matrix = roots.get(tier);
        if (!matrix) { matrix = foldMatrix(shape, base, degrees); roots.set(tier, matrix); const root = foldRootFor(tier); root.matrix.copy(matrix); root.matrixWorldNeedsUpdate = true; root.visible = true; }
        const copy = foldedCopy(id, mesh);
        const root = foldRootFor(tier);
        if (copy.parent !== root) root.add(copy);
        mesh.updateWorldMatrix(true, false);
        copy.matrix.copy(mesh.matrixWorld);
        copy.matrixWorldNeedsUpdate = true;
        copy.visible = true;
        copy.material.color.copy(mesh.material.color);
        copy.material.opacity = mesh.material.opacity;
        copy.material.transparent = mesh.material.transparent;
        copy.material.depthWrite = mesh.material.depthWrite;
        copy.renderOrder = mesh.renderOrder;
        const own = surfaceShadingOf(copy.material)!;
        own.uWinOn.value = 1; own.uWinA.value.copy(shape.a); own.uWinB.value.copy(shape.b); own.uWinN.value.copy(shape.normal);
        own.uWinDepth.value = shape.depth; own.uWinFront.value = shape.front; own.uWinRadius.value = radius; own.uWinInvert.value = 1;
        own.uWinBack.value.copy(matrix).invert();
        own.uSolidCut.value = 1;
        own.uRim.value = shading.uRim.value;
        own.uCoatOn.value = shading.uCoatOn.value; own.uUnderBelly.value.copy(shading.uUnderBelly.value);
        own.uInner.value.copy(shading.uInner.value); own.uInnerOn.value = 1;
      }
      if (fur) {
        const whole = on && shape && current.dissection && !unfolder?.open() ? tierRadius('skin', shape.radius, { ...current.dissection, opening: windowOpening }) : 0;
        for (const layer of [fur, ...fineHair]) {
          const radius = unfolder?.open() ? unfolder.radiusOf(fineHairOf.get(layer) ?? skinId!) : whole;
          layer.setWindow(radius > 0 && shape ? { a: shape.a, b: shape.b, normal: shape.normal, depth: shape.depth, front: shape.front, radius } : null);
          layer.mesh.visible = coatShown && !pastSkin;
        }
      }
    };
    const windowUniforms = (uniforms: SurfaceShadingUniforms) => ({ uWinOn: uniforms.uWinOn, uWinA: uniforms.uWinA, uWinB: uniforms.uWinB, uWinN: uniforms.uWinN, uWinDepth: uniforms.uWinDepth, uWinFront: uniforms.uWinFront, uWinRadius: uniforms.uWinRadius, uWinInvert: uniforms.uWinInvert, uWinBack: uniforms.uWinBack, uWinNear: uniforms.uWinNear, uLifeKind: uniforms.uLifeKind, uLifeAmount: uniforms.uLifeAmount, uLifePivot: uniforms.uLifePivot, uLifeAxial: uniforms.uLifeAxial, uLifeShift: uniforms.uLifeShift, uLifeTaken: uniforms.uLifeTaken, uLifeHeld: uniforms.uLifeHeld, uLifeFlapOf: uniforms.uLifeFlapOf, uLifeStays: uniforms.uLifeStays, uCutVolume: uniforms.uCutVolume, uCutChannel: uniforms.uCutChannel, uCutInvert: uniforms.uCutInvert });
    const shownSurfaces = function* (current: ViewerSettings) {
      for (const [id, mesh] of meshes) if (mesh instanceof THREE.Mesh && !current.hidden.includes(id) && (current.opacity[id] ?? defaultOpacity(id)) > 0) yield [id, mesh] as const;
    };
    const placeNameNear = (point: THREE.Vector3) => {
      let nearest = Infinity, bone = '', boneName = '';
      for (const structure of atlas.structures) {
        if (!structure.systems.includes('skeletal')) continue;
        const mesh = meshes.get(structure.id); if (!mesh) continue;
        const distance = new THREE.Box3().setFromObject(mesh).distanceToPoint(point);
        if (distance < nearest) { nearest = distance; bone = structure.id; boneName = structure.name; }
      }
      return placeNameFromBone(bone, boneName);
    };
    /** Say what lies at the place, from the structures themselves, and keep a point of each for its label. */
    const reportWindow = (placeName: string | null, limbName?: string) => {
      const current = latest.current.settings;
      if (!windowShape) { latest.current.onDissectionReport?.(null); return; }
      const found = findInWindow(windowShape, windowShape.radius, shownSurfaces(current));
      const items = orderHere(found.map((item) => {
        const structure = atlas.structures.find((entry) => entry.id === item.id)!;
        return { id: item.id, name: structure.name, tier: tierOf(item.id), evidence: structure.evidence, depth: item.depth };
      }));
      let place = placeName;
      if (!place) {
        place = placeNameNear(new THREE.Vector3().addVectors(windowShape.a, windowShape.b).multiplyScalar(0.5));
        // A limb that was asked for by name keeps that name, with the side it lies on.
        if (limbName) { const side = /^(Right|Left) /.exec(place)?.[1]; place = side ? `${side} ${limbName}` : limbName[0].toUpperCase() + limbName.slice(1); }
      }
      lastFound = items; lastPlace = place;
      markSeenStale();
      latest.current.onDissectionReport?.({ place, items });
    };
    /** Draw once off screen to learn what can be seen, then say so and place the names. */
    const lookAtWhatIsSeen = (current: ViewerSettings) => {
      const entries = [...meshes].flatMap(([id, mesh]) => {
        if (!(mesh instanceof THREE.Mesh) || !mesh.visible || mesh.layers.mask !== 1 || mesh.material.opacity < 0.5) return [];
        const uniforms = surfaceShadingOf(mesh.material);
        if (!uniforms) return [];
        const own = { id, mesh: mesh as THREE.Mesh, uniforms: windowUniforms(uniforms), masked: mesh.material.stencilWrite };
        const fold = folds.get(id);
        return fold?.visible && fold.parent?.visible ? [own, { id, mesh: fold as THREE.Mesh, uniforms: windowUniforms(surfaceShadingOf(fold.material)!), masked: false }] : [own];
      });
      const size = new THREE.Vector2();
      renderer.getSize(size);
      const seen = idPass.render(renderer, scene, camera, entries, [...openingMarks.values()].filter((mark) => mark.visible), Math.max(1, Math.floor(size.x / 2)), Math.max(1, Math.floor(size.y / 2)));
      // A structure drawn twice, folded and in place, is one structure: the larger part in view stands for it.
      const merged = new Map<string, SeenStructure>();
      for (const item of seen) { const other = merged.get(item.id); merged.set(item.id, other ? { ...(item.pixels > other.pixels ? item : other), pixels: item.pixels + other.pixels } : item); }
      seenNow = [...merged.values()];
      seenStale = false;
      element.dataset.dissection = 'settled';
      lastLabelSetAt = 0;
      syncAllLabels(current, performance.now());
      const seenIds = new Set(merged.keys());
      const signature = lastFound.filter((item) => seenIds.has(item.id)).map((item) => item.id).join('|') + '@' + lastPlace;
      if (lastFound.length && signature !== lastSeenIds) {
        lastSeenIds = signature;
        latest.current.onDissectionReport?.({ place: lastPlace, items: lastFound.map((item) => ({ ...item, seen: seenIds.has(item.id) })) });
      }
    };
    /** Build the opening from a middle point, an outward direction and a radius, on this animal's own surface. */
    const makeWindow = (middle: THREE.Vector3, outward: THREE.Vector3, halfAlong: THREE.Vector3, wanted: number, limb: boolean, axis: THREE.Vector3, surfaceMesh?: THREE.Mesh): WindowShape | null => {
      const skin = surfaceMesh ?? (skinId ? meshes.get(skinId) : undefined);
      if (!(skin instanceof THREE.Mesh) || !posture) return null;
      const dorsal = new THREE.Vector3(...posture.up);
      const normal = outward.clone().normalize();
      const up = dorsal.clone().addScaledVector(normal, -dorsal.dot(normal));
      if (up.lengthSq() < 0.04) up.copy(axis).addScaledVector(normal, -axis.dot(normal));
      up.normalize();
      const across = new THREE.Vector3().crossVectors(up, normal).normalize();
      const reach = radius * 3;
      const at = (point: THREE.Vector3) => throughSurface(skin, point.clone().addScaledVector(normal, reach), normal.clone().negate());
      const centre = at(middle);
      if (!centre) return null;
      const surface = centre.entry.dot(normal);
      const place = (point: THREE.Vector3) => point.clone().addScaledVector(normal, surface - point.dot(normal));
      const segment = halfAlong.clone().addScaledVector(normal, -halfAlong.dot(normal));
      const a = place(middle.clone().sub(segment)), b = place(middle.clone().add(segment));
      const direction = segment.lengthSq() > 1e-10 ? segment.clone().normalize() : across;
      // The folded layers turn on a line parallel to the back, so that they stand clear of the animal.
      const hingeUp = limb ? up.clone().addScaledVector(direction, -up.dot(direction)).normalize() : up;
      // The opening must lie on the body; find how far the surface reaches towards the back.
      const mid = place(middle);
      let top = 0;
      for (const step of [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4, 1.5]) { if (!at(mid.clone().addScaledVector(hingeUp, wanted * step))) break; top = wanted * step; }
      const size = limb ? wanted : Math.min(wanted, Math.max(top * 0.92, wanted * 0.5));
      const hinges = new Map<number, number>();
      const hinge = (open: number) => {
        let depth = hinges.get(open);
        if (depth === undefined) { const rim = at(mid.clone().addScaledVector(hingeUp, open)); depth = rim ? surface - rim.entry.dot(normal) : 0; hinges.set(open, depth); }
        return depth;
      };
      const spine = meshes.get('living:bone-t10');
      const midline = spine ? new THREE.Box3().setFromObject(spine).getCenter(new THREE.Vector3()).dot(normal) : surface - centre.exit / 2;
      // A limb is opened to about its middle, even where it lies against the trunk; the trunk and head to just short of the midline.
      const depth = limb ? Math.min(Math.max(centre.exit * 0.56, 0.0015), 0.0055) : Math.max(surface - midline - 0.0012, centre.exit * 0.42);
      return { a, b, normal, up: hingeUp, along: direction.clone().addScaledVector(hingeUp, -direction.dot(hingeUp)).normalize(), radius: size, depth, front: limb ? 0.006 : radius, hinge };
    };
    /** The cut going in from a spot of the outside: to about the middle of a limb, and to just short of the midline in the trunk and head. */
    let thicknessAt: { point: THREE.Vector3; value: number } | null = null;
    const zoomCut = (point: THREE.Vector3, outward: THREE.Vector3, faceNormal: THREE.Vector3, surface: THREE.Mesh) => {
      const normal = outward.clone().normalize();
      // How thick the part is here: the middle of five measures round the spot, so that a fold in the skin or the edge of a limb does not count as the whole part.
      if (!thicknessAt || thicknessAt.point.distanceToSquared(point) > 4e-8) {
        const across = new THREE.Vector3(1, 0, 0).cross(faceNormal);
        if (across.lengthSq() < 0.04) across.set(0, 1, 0).cross(faceNormal);
        across.normalize();
        const other = new THREE.Vector3().crossVectors(faceNormal, across);
        const measures = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].map(([x, y]) => {
          const start = point.clone().addScaledVector(across, x * 0.0015).addScaledVector(other, y * 0.0015).addScaledVector(faceNormal, 0.003);
          return throughSurface(surface, start, faceNormal.clone().negate())?.exit ?? 0;
        }).sort((left, right) => left - right);
        thicknessAt = { point: point.clone(), value: measures[2] || 0.006 };
      }
      const thickness = thicknessAt.value;
      const slender = thickness < 0.012;
      const level = point.dot(normal);
      const spine = meshes.get('living:bone-t10');
      const midline = spine ? new THREE.Box3().setFromObject(spine).getCenter(new THREE.Vector3()).dot(normal) : level - thickness / 2;
      const depth = slender ? Math.min(Math.max(thickness * 0.56, 0.0015), 0.0055) : Math.min(Math.max(level - midline - 0.0012, thickness * 0.42), 0.018);
      const up = new THREE.Vector3(...(posture?.up ?? [0, 0, 1])).addScaledVector(normal, -new THREE.Vector3(...(posture?.up ?? [0, 0, 1])).dot(normal));
      if (up.lengthSq() < 0.04) up.set(1, 0, 0).addScaledVector(normal, -normal.x);
      up.normalize();
      const shape: WindowShape = { a: point.clone(), b: point.clone(), normal, up, along: new THREE.Vector3().crossVectors(up, normal).normalize(), radius: 0.012, depth, front: slender ? 0.006 : radius, hinge: () => 0 };
      return { shape, thickness };
    };
    /** What the guide beside the view shows. The rows are worked out when a place opens, and the rest as the zoom moves. */
    const guideOpened = () => {
      if (!unfolder) return;
      const row = (id: string, depth: number, passing: boolean): UnfoldGuideRow => {
        const structure = atlas.structures.find((item) => item.id === id)!;
        return { id, name: structure.name, evidence: structure.evidence, depthMm: depth * 1000, passing, systems: structure.systems };
      };
      guideRows = [...unfolder.stops().map((stop) => row(stop.id, stop.depth, false)), ...unfolder.nearby().map((item) => row(item.id, item.depth, true))].sort((left, right) => left.depthMm - right.depthMm);
      const shape = unfolder.shape();
      const opened = unfolder.surfaceId();
      guidePlace = placeNameOfSurface(opened ?? '') ?? (shape ? placeNameNear(shape.a) : '');
      lastGuide = '';
    };
    const syncGuide = () => {
      if (unfolder) element.dataset.viewMm = (viewHeightAt(camera.position.distanceTo(controls.target), camera.fov) * 1000).toFixed(1);
      if (!unfolder?.open()) { if (lastGuide !== 'closed') { lastGuide = 'closed'; setGuide(null); delete element.dataset.unfold; } return; }
      const stopAt = unfolder.currentStop(), stops = unfolder.stops();
      const view = viewHeightAt(camera.position.distanceTo(controls.target), camera.fov);
      const key = [stopAt, Math.round(unfolder.progress() * 60), unfolder.playing(), guideRows.length, guidePlace].join('|');
      element.dataset.unfold = unfolder.progress().toFixed(3);
      if (key === lastGuide) return;
      lastGuide = key;
      setEverOpened(true);
      setGuide({ place: guidePlace, rows: guideRows, current: stops[stopAt]?.id ?? null, viewMetres: view, progress: unfolder.progress(), playing: unfolder.playing() });
    };
    /** On from the structure in view, or from the stops passed so far if that one has no way on. */
    const zoomThrough = (x = 0.5, y = 0.5, playing = false) => {
      if (!unfolder?.open()) return;
      const stops = unfolder.stops(), at = unfolder.currentStop();
      // What is in view at the pointer is looked at again if the view has moved since, so that the zoom goes on into exactly that.
      if (seenStale) lookAtWhatIsSeen(latest.current.settings);
      const seen = idPass.at(x, y);
      const ids = [...(seen ? [seen] : []), ...stops.slice(0, Math.max(at, 0) + 1).reverse().map((stop) => stop.id)];
      latest.current.onZoomThrough?.([...new Set(ids)], guidePlace, playing);
    };
    const bodyFrame = () => {
      const centre = (id: string) => { const mesh = meshes.get('living:' + id); return mesh ? new THREE.Box3().setFromObject(mesh).getCenter(new THREE.Vector3()) : null; };
      const dorsal = new THREE.Vector3(...(posture?.up ?? [0, 0, 1]));
      const head = centre('bone-c2'), tail = centre('bone-l6');
      const axis = head && tail ? tail.clone().sub(head) : new THREE.Vector3(0, 1, 0);
      axis.addScaledVector(dorsal, -axis.dot(dorsal)).normalize();
      const lateral = new THREE.Vector3().crossVectors(axis, dorsal).normalize();
      const toCamera = camera.position.clone().sub(controls.target);
      return { centre, dorsal, axis, outward: toCamera.dot(lateral) >= 0 ? lateral : lateral.clone().negate() };
    };
    /** Look at the opening a little from above, with room for the folded layers. */
    const lookAtWindow = (shape: WindowShape, folded: boolean, whole: boolean) => {
      const middle = new THREE.Vector3().addVectors(shape.a, shape.b).multiplyScalar(0.5).addScaledVector(shape.normal, -Math.min(shape.depth, shape.radius) * 0.4);
      const span = Math.max(shape.radius, shape.a.distanceTo(shape.b) / 2 + shape.radius * 0.6);
      const target = middle.clone().addScaledVector(shape.up, folded ? shape.radius * (whole ? 0.72 : 0.3) : 0);
      const direction = shape.normal.clone().multiplyScalar(0.93).addScaledVector(shape.up, 0.3).normalize();
      const position = target.clone().addScaledVector(direction, span * (whole ? (folded ? 6.8 : 5.8) : folded ? 5 : 4.6));
      const from = captureCameraPose(camera, controls.target);
      const to: CameraPose = { ...from, position: position.toArray() as CameraPose['position'], target: target.toArray() as CameraPose['target'], up: [...(posture?.up ?? [0, 0, 1])] as CameraPose['up'] };
      if (reducedMotion) setPose(to); else cameraMove = { from, to, t: 0 };
    };
    const placeWindow = (place: DissectionPlaceId) => {
      const definition = DISSECTION_PLACES.find((item) => item.id === place);
      if (!definition || !dissectable) return;
      unfolder?.forget();
      const frame = bodyFrame();
      const nearer = (id: string) => {
        const candidates = [frame.centre(id + '-r'), frame.centre(id + '-l')].filter((value): value is THREE.Vector3 => !!value);
        if (candidates.length) return candidates.sort((left, right) => right.dot(frame.outward) - left.dot(frame.outward))[0];
        return frame.centre(id);
      };
      let middle: THREE.Vector3 | null = null, half = new THREE.Vector3(), wanted = definition.width * 0.012;
      if (place === 'side') {
        const front = frame.centre('heart-lv'), back = frame.centre('bladder');
        if (!front || !back) return;
        middle = new THREE.Vector3().addVectors(front, back).multiplyScalar(0.5);
        half = back.clone().sub(front).multiplyScalar(0.46);
        wanted = 0.0115;
      } else {
        const anchors = (place === 'chest' ? ['lung-left', 'lung-r-middle', 'heart-lv'] : place === 'abdomen' ? ['small-intestine', 'caecum', 'colon'] : place === 'neck' ? ['bone-c3', 'bone-c5', 'larynx', 'thyroid'] : definition.bones)
          .map(nearer).filter((value): value is THREE.Vector3 => !!value);
        if (!anchors.length) return;
        middle = anchors.reduce((sum, value) => sum.add(value), new THREE.Vector3()).multiplyScalar(1 / anchors.length);
        if (definition.limb) {
          // The named bones on the side nearer the camera, or the one piece if a bone is not paired.
          const boxOf = (id: string) => {
            const single = meshes.get('living:' + id);
            if (single) return new THREE.Box3().setFromObject(single);
            const pair = (['-r', '-l'] as const).map((end) => new THREE.Box3().setFromObject(meshes.get('living:' + id + end)!));
            return pair.sort((left, right) => right.getCenter(new THREE.Vector3()).dot(frame.outward) - left.getCenter(new THREE.Vector3()).dot(frame.outward))[0];
          };
          const whole = boxOf(definition.bones[0]).union(boxOf(definition.bones[definition.bones.length - 1])), size = whole.getSize(new THREE.Vector3());
          middle = whole.getCenter(new THREE.Vector3());
          // Along the longest extent of the limb, seen from the side.
          const extents: [THREE.Vector3, number][] = [[new THREE.Vector3(1, 0, 0), size.x], [new THREE.Vector3(0, 1, 0), size.y], [new THREE.Vector3(0, 0, 1), size.z]];
          const flat = extents.filter(([axis]) => Math.abs(axis.dot(frame.outward)) < 0.7).sort((left, right) => right[1] - left[1])[0];
          half = flat[0].clone().multiplyScalar(Math.min(flat[1] * 0.34, wanted * 3));
          // A curved part, whose bounds lie outside it, is opened at its own point nearest their middle.
          const curved = definition.id === 'tail' ? meshes.get('living:' + definition.bones[0]) : undefined;
          if (curved instanceof THREE.Mesh) {
            const position = curved.geometry.getAttribute('position'), point = new THREE.Vector3(), best = new THREE.Vector3();
            let nearest = Infinity;
            curved.updateWorldMatrix(true, false);
            for (let index = 0; index < position.count; index++) {
              point.fromBufferAttribute(position, index).applyMatrix4(curved.matrixWorld);
              const distance = point.distanceToSquared(middle);
              if (distance < nearest) { nearest = distance; best.copy(point); }
            }
            middle = best;
            half = new THREE.Vector3();
          }
        }
      }
      if (!middle) return;
      const surface = definition.surface ? meshes.get('living:' + definition.surface) : undefined;
      windowShape = makeWindow(middle, frame.outward, half, wanted, !!definition.limb, frame.axis, surface instanceof THREE.Mesh ? surface : undefined);
      if (!windowShape) return;
      syncWindow(latest.current.settings);
      lookAtWindow(windowShape, !!latest.current.settings.dissection?.folded, place === 'side');
      reportWindow(definition.limb ? null : definition.name, definition.limb ? definition.name.toLowerCase() : undefined);
      dirty = true; shadowDirty = true;
    };
    /** Open at the point clicked on the outside of the animal. */
    const placeWindowAt = (point: THREE.Vector3, faceNormal: THREE.Vector3, surface: THREE.Mesh) => {
      const frame = bodyFrame();
      const toCamera = camera.position.clone().sub(point).normalize();
      const outward = faceNormal.clone().multiplyScalar(0.55).addScaledVector(toCamera, 0.45).normalize();
      const through = throughSurface(surface, point.clone().addScaledVector(outward, radius), outward.clone().negate());
      const slender = !!through && through.exit < 0.012;
      // An opening is no wider than the part it is made in, so that a paw is not opened as if it were the flank.
      const wanted = Math.max(slender ? 0.0018 : 0.004, Math.min(slender && through ? through.exit * 1.1 : 0.012, camera.position.distanceTo(point) * 0.1));
      const shape = makeWindow(point, outward, new THREE.Vector3(), wanted, slender, frame.axis, surface);
      if (!shape) return;
      windowShape = shape;
      syncWindow(latest.current.settings);
      reportWindow(null);
      dirty = true; shadowDirty = true;
    };
    const defaultOpacity =(id: string) => defaultStructureOpacity(atlas.structures.find((structure) => structure.id === id)!);
    /** The hands and the bench of a practice dissection, and how the rest of the view changes for them: the light comes from where the viewer stands, as from a lamp at the bench. */
    const syncLab = (current: ViewerSettings) => {
      const wanted = !!current.lab && dissectable && loaded && !!skinId;
      if (wanted && !lab) {
        unfolder?.forget();
        windowShape = null; windowOpening = 0;
        walkHold = 0;
        const flowLineKinds = () => flowVessels;
        lab = createLabSession({
          renderer, scene, camera, controls, element, meshes, tierOf, skinId: skinId!,
          entries: (only) => [...meshes].flatMap(([id, mesh]) => {
            if (!(mesh instanceof THREE.Mesh) || !mesh.visible || mesh.layers.mask !== 1 || mesh.material.opacity < 0.5 || id === 'living:vibrissae' || lab?.taken.has(id) || (only && !only(id))) return [];
            const uniforms = surfaceShadingOf(mesh.material);
            return uniforms ? [{ id, mesh: mesh as THREE.Mesh, uniforms: windowUniforms(uniforms), masked: mesh.material.stencilWrite, moved: () => uniforms.uLifeShift.value.lengthSq() > 0 }] : [];
          }),
          marks: () => [...[...openingMarks.values()].filter((mark) => mark.visible), ...(lab?.plates() ?? [])],
          seen: () => {
            const entries = [...meshes].flatMap(([id, mesh]) => {
              if (!(mesh instanceof THREE.Mesh) || !mesh.visible || mesh.layers.mask !== 1 || mesh.material.opacity < 0.5) return [];
              const uniforms = surfaceShadingOf(mesh.material);
              return uniforms ? [{ id, mesh: mesh as THREE.Mesh, uniforms: windowUniforms(uniforms), masked: mesh.material.stencilWrite }] : [];
            });
            const size = new THREE.Vector2();
            renderer.getSize(size);
            const found = idPass.render(renderer, scene, camera, entries, [...[...openingMarks.values()].filter((mark) => mark.visible), ...(lab?.plates() ?? [])], Math.max(1, Math.floor(size.x / 2)), Math.max(1, Math.floor(size.y / 2)));
            seenNow = found; seenStale = false; lastLabelSetAt = 0;
            return found;
          },
          isVessel: (id) => flowLineKinds().has(id) || atlas.structures.find((item) => item.id === id)?.systems.includes('arterial-venous') === true,
          circulating: () => { const now = latest.current.settings.life; return !!now?.on && now.heart; },
          onReport: (report) => latest.current.onLab?.({ kind: 'report', report }),
          onHover: (hover) => {
            const structure = hover ? atlas.structures.find((item) => item.id === hover.id) : undefined;
            const scale = renderer.getPixelRatio();
            setHovered(structure && hover ? { x: hover.x / scale, y: hover.y / scale, name: markedName(structure) } : null);
          },
          onPicked: (id) => latest.current.onLab?.({ kind: 'picked', id }),
          onRefused: (message) => latest.current.onLab?.({ kind: 'refused', message }),
          onCaption: (text) => latest.current.onLab?.({ kind: 'caption', text }),
          onChange: () => apply(),
          moveView: (position, target, up) => {
            const from = captureCameraPose(camera, controls.target);
            cameraMove = { from, to: { ...from, position: position.toArray() as CameraPose['position'], target: target.toArray() as CameraPose['target'], up: up.toArray() as CameraPose['up'] }, t: 0 };
          },
          covered: () => {
            const card = document.querySelector('.lab-tutorial:not(.lab-chooser)'), view = renderer.domElement.getBoundingClientRect();
            return card && view.width ? Math.max(0, view.right - card.getBoundingClientRect().left) / view.width : 0;
          },
          snip: () => { if (latest.current.settings.life?.sound) voice.snip(); },
        });
        for (const layer of fur ? [fur, ...fineHair] : []) layer.setCut(lab.volume.textures[0]);
        if (shadow) shadow.group.visible = false;
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.autoUpdate = false;
        key.castShadow = true;
        key.shadow.mapSize.set(2048, 2048);
        Object.assign(key.shadow.camera, { left: -0.32, right: 0.32, top: 0.32, bottom: -0.32, near: 6, far: 8.5 });
        key.shadow.camera.updateProjectionMatrix();
        key.shadow.bias = -0.0002; key.shadow.normalBias = 0.0009;
        for (const [id, mesh] of meshes) {
          mesh.receiveShadow = true;
          // Tissue that has been laid open is wet, and shines under the lamp. A display choice, not a measured property.
          if (mesh instanceof THREE.Mesh && mesh.material instanceof THREE.MeshPhysicalMaterial && tierOf(id) !== 'skin' && tierOf(id) !== 'skeleton') {
            mesh.material.userData.dry = { roughness: mesh.material.roughness, clearcoat: mesh.material.clearcoat, clearcoatRoughness: mesh.material.clearcoatRoughness };
            mesh.material.roughness = 0.4; mesh.material.clearcoat = 0.75; mesh.material.clearcoatRoughness = 0.22;
          }
        }
        // Things lie close together on the bench, and nothing comes nearer to the eye than the hands, so that the depth can be finer.
        camera.near = 0.004;
        camera.updateProjectionMatrix();
        controls.minDistance = 0.014;
        const { position, target, up } = lab.viewOf('belly');
        lab.update(0);
        latest.current.onLab?.({ kind: 'caption', text: null });
        const from = captureCameraPose(camera, controls.target);
        cameraMove = { from, to: { ...from, position: position.toArray() as CameraPose['position'], target: target.toArray() as CameraPose['target'], up: up.toArray() as CameraPose['up'] }, t: 0 };
      } else if (!wanted && lab) {
        lab.dispose();
        lab = null;
        setHovered(null);
        for (const layer of fur ? [fur, ...fineHair] : []) layer.setCut(null);
        for (const mesh of meshes.values()) {
          mesh.receiveShadow = false;
          const shading = mesh instanceof THREE.Mesh ? surfaceShadingOf(mesh.material) : null;
          if (shading) shading.uCutVolume.value = null;
          const dry = mesh instanceof THREE.Mesh && mesh.material instanceof THREE.MeshPhysicalMaterial ? mesh.material.userData.dry as { roughness: number; clearcoat: number; clearcoatRoughness: number } | undefined : undefined;
          if (dry && mesh.material instanceof THREE.MeshPhysicalMaterial) { Object.assign(mesh.material, dry); delete mesh.material.userData.dry; }
        }
        CUT_SHARED.uCutOn.value = 0;
        if (shadow) shadow.group.visible = true;
        key.castShadow = false;
        renderer.shadowMap.enabled = false;
        // The lights go back to the room.
        hemisphere.position.set(0, 1, 0);
        stageTurn.setFromAxisAngle(floor?.up ?? new THREE.Vector3(0, 1, 0), floor ? -wander.pose.heading : 0);
        lights.quaternion.copy(stageTurn);
        scene.environmentRotation.setFromQuaternion(stageTurn);
        turnFurLights(stageTurn);
        latest.current.onLab?.({ kind: 'caption', text: null });
        camera.near = radius / 2000;
        camera.updateProjectionMatrix();
        controls.minDistance = radius * 0.02;
        cameraMove = null;
        if (posture) { camera.up.set(...posture.up); orbitAbout(camera.up); }
        reset();
      }
    };
    const apply = () => {
      const current = latest.current.settings;
      syncLab(current);
      const bloodShown = !!flow && !!current.life?.on && current.life.blood;
      for (const [id, mesh] of meshes) {
        const structure = atlas.structures.find((item) => item.id === id)!;
        const opacity = current.opacity[id] ?? defaultOpacity(id);
        mesh.visible = !current.hidden.includes(id) && opacity > 0;
        mesh.material.opacity = opacity;
        const glassy = bloodShown && flowVessels.has(id);
        const transparent = opacity < 1 || glassy;
        // Whether a material is opaque is part of its program.
        if (mesh.material.transparent !== transparent) mesh.material.needsUpdate = true;
        mesh.material.transparent = transparent;
        mesh.material.depthWrite = opacity >= 0.95 && !glassy;
        mesh.renderOrder = opacity < 1 ? 2 : glassy ? 1 : 0;
        mesh.material.color.set(current.colors[id] ?? displayColour(structure, current.colourScheme ?? 'tissue'));
        const shading = surfaceShadingOf(mesh.material);
        if (shading) {
          shading.uRim.value = id === current.selected ? 1 : 0;
          shading.uSolidCut.value = current.clipAxis !== 'off' && declaresEvidence(atlas) ? 1 : 0;
          // A translucent envelope fades where it faces the camera and keeps its silhouette.
          shading.uGhost.value = opacity < 1 && structure.systems.includes('integumentary') ? SURFACE_PRESENTATION.ghostStrength : glassy ? 0.45 : 0;
        }
        mesh.material.clippingPlanes = current.clipAxis === 'off' ? [] : [clip];
      }
      flow?.showLines((structure) => !!meshes.get(structure)?.visible && !lab?.tied.has(structure));
      // Covered regions leave the rendered and picked layer only, so that overlays and Fit visible still treat them as shown.
      const skinMesh = skinId ? meshes.get(skinId) : undefined;
      const skinOpacity = skinId ? current.opacity[skinId] ?? defaultOpacity(skinId) : 0;
      const coverClip = windowActive() || lab ? 'opened' : current.clipAxis;
      for (const [id, mesh] of meshes) mesh.layers.set(coveredBySkin(id, skinId, !!skinMesh?.visible, skinOpacity, coverClip, atlas.structures.find((item) => item.id === id)?.exterior) ? 1 : 0);
      if (fur) {
        const coat = current.coat ?? 'agouti';
        const shown = coat !== 'none' && !!skinMesh?.visible && skinOpacity >= OPAQUE_SKIN;
        coatShown = shown;
        for (const layer of [fur, ...fineHair]) {
          layer.mesh.visible = shown;
          if (coat !== 'none') layer.setCoat(coat);
          layer.setClipping(current.clipAxis === 'off' ? [] : [clip]);
        }
        const skinShading = skinMesh instanceof THREE.Mesh ? surfaceShadingOf(skinMesh.material) : null;
        if (skinShading) skinShading.uCoatOn.value = shown ? 1 : 0;
        // Skin under a coat lies in its shade, and has no shine of its own.
        if (skinMesh instanceof THREE.Mesh && skinMesh.material instanceof THREE.MeshPhysicalMaterial) skinMesh.material.sheen = shown ? 0 : SKIN_PRESENTATION.sheen;
        if (coat !== 'none' && shown) {
          if (skinMesh instanceof THREE.Mesh) skinMesh.material.color.set(COATS[coat].under);
          skinShading?.uUnderBelly.value.set(COATS[coat].underBelly);
          // Ears, tail, paws and nose take the skin colour that goes with the coat, unless a colour has been chosen for them.
          if ((current.colourScheme ?? 'tissue') === 'tissue') for (const [id, colour] of Object.entries(COATS[coat].parts)) {
            const part = meshes.get(id);
            if (part instanceof THREE.Mesh && !current.colors[id]) part.material.color.set(colour);
          }
        }
      }
      if (current.clipAxis !== 'off') clip.copy(createDisplayClipPlane(current.clipAxis, current.clipPosition, radius));
      applySurfaceDisplay();
      if (dissectable) {
        syncWindow(current);
        const wanted = JSON.stringify([current.hidden, current.opacity, current.dissection, current.colors]);
        if (wanted !== lastWindowSettings) { lastWindowSettings = wanted; markSeenStale(); }
      }
      syncSectionImage(current);
      dirty = true; shadowDirty = true;
    };
    const detailController = new RegionDetailController(atlas, (id) => detailTargets.get(id), () => {
      dirty = true;
      if (!disposed && loaded) latest.current.onReady?.(renderDiagnostics([...meshes.values()]));
      shadowDirty = true;
    }, (state) => {
      const requested = latest.current.detailAsset;
      if (!disposed && (requested ? state.structureId === requested.structureId && state.assetSha256 === requested.glbSha256 : state.status === 'idle'))
        latest.current.onDetailStatus?.(state);
    }, undefined, async (geometry, signal) => smoothingOptions && smoothedDisplay() ? (await smoothSurfaceGeometries([geometry], smoothingOptions, signal))[0] : geometry);
    /** Show the smoothed or source copy of each base surface; a displayed fine surface is reloaded instead. */
    function applySurfaceDisplay() {
      const wanted: SurfaceDisplay = smoothedDisplay() ? 'smoothed' : 'source';
      const changed = lastSurfaceDisplay !== undefined && lastSurfaceDisplay !== wanted;
      lastSurfaceDisplay = wanted;
      for (const [id, copies] of surfaceCopies) {
        const mesh = meshes.get(id);
        if (!(mesh instanceof THREE.Mesh)) continue;
        const geometry = wanted === 'smoothed' ? copies.smoothed : copies.source;
        if (detailController.activeStructureId() === id) detailController.setCoarse(id, geometry);
        else if (mesh.geometry !== geometry) mesh.geometry = geometry;
      }
      if (changed && loaded && detailController.activeStructureId()) void detailController.reload(latest.current.detailAsset, latest.current.settings.selected);
    }
    const announcePose = () => {
      dirty = true;
      if (dissectable) markSeenStale();
      if (!syncing && loaded) latest.current.onCameraChange?.(captureCameraPose(camera, controls.target));
    };
    controls.addEventListener('change', announcePose);
    const setPose = (pose: CameraPose) => {
      syncing = true;
      applyCameraPose(camera, controls.target, pose);
      if (!orbitUp.equals(camera.up)) orbitAbout(camera.up);
      controls.update();
      syncing = false;
      dirty = true;
    };
    engine.current = { apply, setPose, setDetail: () => { if (loaded) void detailController.request(latest.current.detailAsset, latest.current.settings.selected); } };
    const reset = () => {
      unfolder?.forget();
      controls.target.set(0, 0, 0);
      if (posture) {
        // A raised lateral view with the inferred dorsal side up.
        const bodyMesh = posture.frameOnBody && skinId ? meshes.get(skinId) : undefined;
        if (bodyMesh) new THREE.Box3().setFromObject(bodyMesh).getCenter(controls.target);
        camera.up.set(...posture.up);
        camera.position.set(...posture.view).multiplyScalar(radius * posture.distance).add(controls.target);
      } else {
        camera.up.set(0, 1, 0);
        // A raised three-quarter display pose; the display axes carry no anatomical direction.
        camera.position.set(radius * 1.35, radius * 1.05, radius * 2.55);
      }
      controls.update();
      dirty = true;
    };
    const focusRegions = (ids: readonly string[]) => {
      unfolder?.forget();
      if (!loaded || !focusCameraOnRegions(camera, controls.target, meshes, ids)) return;
      const distance = camera.position.distanceTo(controls.target);
      controls.minDistance = Math.min(controls.minDistance, distance * 0.9);
      controls.maxDistance = Math.max(controls.maxDistance, distance * 1.1);
      controls.update();
      dirty = true;
    };
    handle.current = {
      reset,
      focusRegions,
      zoom(factor) {
        unfolder?.cancelMotion();
        if (!loaded || !zoomViewerCamera(camera, controls.target, factor, controls.minDistance, controls.maxDistance)) return false;
        controls.update(); dirty = true; return true;
      },
      pan(dx, dy) {
        if (!loaded || !panViewerCamera(camera, controls.target, dx, dy)) return false;
        controls.update(); dirty = true; return true;
      },
      focusPolylinePath(pathRowIndex) {
        if (!loaded || atlas.assetFormat !== 'polyline-native-v1' || atlas.structures.length !== 1) return false;
        const current = latest.current.settings, id = atlas.structures[0].id;
        if (current.hidden.includes(id) || (current.opacity[id] ?? defaultOpacity(id)) <= 0) return false;
        const region = meshes.get(id); if (!(region instanceof THREE.LineSegments)) return false;
        region.updateWorldMatrix(true, false);
        const planes = current.clipAxis === 'off' ? [] : [createDisplayClipPlane(current.clipAxis, current.clipPosition, radius)];
        const pathBounds = sourcePolylinePathBounds(region, pathRowIndex, planes);
        if (!pathBounds || !fitCameraToBounds(camera, controls.target, pathBounds)) return false;
        const distance = camera.position.distanceTo(controls.target);
        controls.minDistance = Math.min(controls.minDistance, distance * 0.9);
        controls.maxDistance = Math.max(controls.maxDistance, distance * 1.1);
        controls.update(); dirty = true; return true;
      },
      focusTraceSample(sampleId) {
        if (!loaded || atlas.structures.length !== 1
            || (atlas.assetFormat !== 'local-trace-v1' && atlas.assetFormat !== 'swc-native-v1')) return false;
        const current = latest.current.settings, id = atlas.structures[0].id;
        if (current.hidden.includes(id) || (current.opacity[id] ?? defaultOpacity(id)) <= 0) return false;
        const region = meshes.get(id);
        if (!(region instanceof THREE.LineSegments)) return false;
        region.updateWorldMatrix(true, false);
        const plane = current.clipAxis === 'off' ? null : createDisplayClipPlane(current.clipAxis, current.clipPosition, radius);
        const sampleBounds = traceSampleFocusBounds(region, sampleId, plane);
        if (!sampleBounds || !fitCameraToBounds(camera, controls.target, sampleBounds)) return false;
        const distance = camera.position.distanceTo(controls.target);
        controls.minDistance = Math.min(controls.minDistance, distance * 0.9);
        controls.maxDistance = Math.max(controls.maxDistance, distance * 1.1);
        controls.update();
        dirty = true;
        return true;
      },
      bodyCentrePercent(axis) {
        const body = loaded && posture?.frameOnBody && skinId ? meshes.get(skinId) : undefined;
        if (!body) return null;
        const centre = new THREE.Box3().setFromObject(body).getCenter(new THREE.Vector3());
        return Math.round(clipPercentAt(centre[axis], radius) * 10) / 10;
      },
      placeDissection(place) {
        if (loaded) placeWindow(place);
      },
      lab: () => lab,
      picture() {
        if (!loaded) return null;
        // What is drawn lies on a clear background, and the page behind it is white.
        renderer.render(scene, camera);
        const copy = document.createElement('canvas');
        copy.width = renderer.domElement.width; copy.height = renderer.domElement.height;
        const context = copy.getContext('2d');
        if (!context) return null;
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, copy.width, copy.height);
        context.drawImage(renderer.domElement, 0, 0);
        return copy.toDataURL('image/png');
      },
      labView(view) {
        if (!lab) return;
        setHovered(null);
        const { position, target, up } = lab.viewOf(view);
        const from = captureCameraPose(camera, controls.target);
        cameraMove = { from, to: { ...from, position: position.toArray() as CameraPose['position'], target: target.toArray() as CameraPose['target'], up: up.toArray() as CameraPose['up'] }, t: 0 };
      },
      viewCutFace(axis) {
        unfolder?.forget();
        if (!loaded || !posture) return;
        controls.target.set(0, 0, 0);
        const framedBody = posture.frameOnBody && skinId ? meshes.get(skinId) : undefined;
        if (framedBody) new THREE.Box3().setFromObject(framedBody).getCenter(controls.target);
        camera.up.set(...posture.up);
        camera.position.copy(cutFaceView(axis)).multiplyScalar(radius * posture.distance).add(controls.target);
        controls.update(); dirty = true;
      },
      view(axis) {
        unfolder?.forget();
        controls.target.set(0, 0, 0);
        const framedBody = posture?.frameOnBody && skinId ? meshes.get(skinId) : undefined;
        if (framedBody) new THREE.Box3().setFromObject(framedBody).getCenter(controls.target);
        const reach = framedBody ? radius * 1.9 : radius * 3.3;
        camera.position.set(axis === 'x' ? reach : 0, axis === 'y' ? reach : 0, axis === 'z' ? reach : 0).add(controls.target);
        if (framedBody && axis !== 'z') camera.up.set(0, 0, 1);
        else camera.up.set(0, axis === 'y' ? 0 : 1, axis === 'y' ? -1 : 0);
        controls.update();
        dirty = true;
      },
      focus() {
        focusRegions(latest.current.settings.selected ? [latest.current.settings.selected] : []);
      },
    };
    const sourceAbort = new AbortController();
    void loadAtlasScene(atlas, sourceAbort.signal, fetch, localTrace).then(async (sourceScene) => {
      const gltf = { scene: sourceScene };
      if (disposed) {
        gltf.scene.traverse((object) => {
          if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) disposeRegion(object);
        });
        return;
      }
      try {
      const sourceBounds = new THREE.Box3().setFromObject(gltf.scene);
      gltf.scene.position.sub(sourceBounds.getCenter(new THREE.Vector3()));
      display.add(gltf.scene);
      gltf.scene.updateWorldMatrix(true, true);
      sectionRoot = gltf.scene;
      let sourceRegionCount = 0;
      const traceFormat = atlas.assetFormat === 'local-trace-v1' || atlas.assetFormat === 'swc-native-v1' || atlas.assetFormat === 'polyline-native-v1';
      gltf.scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh) && !(object instanceof THREE.LineSegments)) return;
        if (traceFormat !== (object instanceof THREE.LineSegments)) throw new Error('Unexpected render primitive for this reference.');
        sourceRegionCount++;
        const structure = atlas.structures.find((entry) => entry.meshNode === object.name || entry.id === object.userData.structureId);
        if (!structure || meshes.has(structure.id)) throw new Error('Reference region identity is missing or duplicated.');
        const { previousGeometry } = recenterRegionGeometry(object); previousGeometry.dispose();
        const region = prepareRegionMaterial(object);
        if (structure.id === skinId && region.material instanceof THREE.MeshPhysicalMaterial) {
          Object.assign(region.material, SKIN_PRESENTATION, { sheenColor: new THREE.Color(SKIN_PRESENTATION.sheenColor) });
          if (region.geometry.getAttribute('_coat')) region.material.defines = { ...region.material.defines, USE_COAT: 1 };
        }
        region.userData.structureId = structure.id;
        meshes.set(structure.id, region);
        region.updateWorldMatrix(true, false);
        if (region instanceof THREE.Mesh) detailTargets.set(structure.id, { mesh: region,
          sourceToLocal: region.matrixWorld.clone().invert().multiply(gltf.scene.matrixWorld) });
      });
      if (meshes.size !== atlas.structures.length || sourceRegionCount !== atlas.structures.length) throw new Error('Reference geometry count differs from its metadata.');
      if (smoothingOptions) {
        // Display copies are prepared off the main thread where possible; the source surfaces stay in memory.
        setStatus('Preparing display surfaces');
        const surfaces = [...meshes].filter((entry): entry is [string, THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>] => entry[1] instanceof THREE.Mesh);
        const smoothed = await smoothSurfaceGeometries(surfaces.map(([, mesh]) => mesh.geometry), smoothingOptions, sourceAbort.signal, surfaces.map(([id]) => id === skinId));
        if (disposed) { smoothed.forEach((geometry) => geometry.dispose()); return; }
        surfaces.forEach(([id, mesh], slot) => {
          surfaceCopies.set(id, { source: mesh.geometry, smoothed: smoothed[slot] });
          if (smoothedDisplay()) mesh.geometry = smoothed[slot];
        });
      }
      bounds.setFromObject(display);
      radius = bounds.getSize(new THREE.Vector3()).length() / 2;
      camera.near = radius / 2000;
      camera.far = radius * 100;
      camera.updateProjectionMatrix();
      // On an animal that opens as it is zoomed, the view can go in further than the whole animal needs.
      controls.minDistance = radius * (dissectable ? 0.02 : 0.07);
      controls.maxDistance = radius * 12;
      if (posture) { shadow = createContactShadow(bounds, new THREE.Vector3(...posture.up)); if (shadow) scene.add(shadow.group); }
      controls.addEventListener('start', () => { interacting = true; });
      controls.addEventListener('end', () => { interacting = false; if (fur && fur.detail() < 1) { for (const layer of [fur, ...fineHair]) layer.setDetail(1); dirty = true; } });
      // Zooming on to the visible skin of a standing animal hands over to the scale journey. Everything below this point is representative and comes from no reference.
      const surfaceRay = new THREE.Raycaster();
      if (dissectable) {
        const coatlessOuter = () => [...meshes].flatMap(([id, mesh]) => mesh instanceof THREE.Mesh && id !== 'living:vibrissae' && mesh.visible && mesh.layers.mask === 1 && (id === skinId || atlas.structures.find((item) => item.id === id)?.exterior) ? [mesh as THREE.Mesh] : []);
        unfolder = createZoomUnfold({
          camera, controls,
          allowed: () => { const current = latest.current.settings; return !current.lab && !current.dissection && current.clipAxis === 'off' && skinIsOpaque(current); },
          outerSurfaces: coatlessOuter,
          surfaces: () => shownSurfaces(latest.current.settings),
          tierOf, shapeAt: zoomCut,
          closest: () => radius * 0.06, furthest: () => radius * 12,
          onOpen: () => { windowShape = unfolder!.shape(); windowOpening = 1; lastFound = []; lastPlace = ''; guideOpened(); markSeenStale(); apply(); },
          onClose: () => { windowShape = null; windowOpening = 0; seenNow = null; guideRows = []; apply(); },
          onThrough: (x, y, playing) => zoomThrough((x + 1) / 2, (1 - y) / 2, playing),
        });
        unfoldRef.current = unfolder;
        // The wheel is taken here, ahead of the orbit controls, so that a step is a smooth move, towards the pointer, that opens the place it arrives at.
        renderer.domElement.addEventListener('wheel', (event) => {
          const current = latest.current.settings;
          if (current.lab || current.dissection || current.clipAxis !== 'off' || !skinIsOpaque(current)) return;
          event.preventDefault();
          event.stopImmediatePropagation();
          walkHold = 3;
          const rect = renderer.domElement.getBoundingClientRect();
          unfolder!.wheel(event.deltaY * (event.deltaMode === 1 ? 33 : 1), (event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
        }, { capture: true, passive: false });
      }
      renderer.domElement.addEventListener('wheel', (event) => {
        if (lab) return;
        // With the layers open, zooming right on to a structure goes on to the cells of its tissue.
        if (event.deltaY < 0 && windowActive() && !seenStale && camera.position.distanceTo(controls.target) < radius * 0.12) {
          const inMiddle = idPass.at(0.5, 0.5);
          if (inMiddle && inMiddle !== skinId) latest.current.onZoomToStructure?.(inMiddle);
          return;
        }
        const body = skinId ? meshes.get(skinId) : undefined;
        const onSkin = latest.current.onZoomToSkin;
        if (event.deltaY >= 0 || !posture || !onSkin || !(body instanceof THREE.Mesh) || !body.visible || body.layers.mask !== 1 || latest.current.settings.clipAxis !== 'off' || windowActive()) return;
        surfaceRay.set(camera.position, controls.target.clone().sub(camera.position).normalize());
        surfaceRay.layers.mask = 1;
        const nearest = surfaceRay.intersectObject(body, false)[0];
        if (nearest && nearest.distance < radius * 0.14) onSkin();
      }, { passive: true });
      const skinForCoat = skinId ? meshes.get(skinId) : undefined;
      if (posture && skinForCoat instanceof THREE.Mesh) {
        fur = createFur(skinForCoat, { life: surfaceShadingOf(skinForCoat.material) ?? undefined });
        if (fur) for (const [id, mesh] of meshes) {
          if (id === skinId || !(mesh instanceof THREE.Mesh) || !hasFurAttribute(mesh.geometry)) continue;
          const layer = createFur(mesh, { ...fineHairOptions(id), life: surfaceShadingOf(mesh.material) ?? undefined });
          if (layer) { fineHair.push(layer); fineHairOf.set(layer, id); }
        }
      }
      if (dissectable && posture) {
        const bindings: LifeBinding[] = [...meshes].flatMap(([id, mesh]) => { const own = mesh instanceof THREE.Mesh ? surfaceShadingOf(mesh.material) : null; return own && mesh instanceof THREE.Mesh ? [{ id, mesh: mesh as THREE.Mesh, own }] : []; });
        life = createLifeRuntime(atlas, meshes, bindings, new THREE.Vector3(...posture.up));
        const skinForBody = skinId ? meshes.get(skinId) : undefined;
        if (life && skinForBody) {
          const up = LIFE_SHARED.uLifeDorsal.value.clone(), forward = LIFE_SHARED.uLifeAxis.value.clone().negate(), side = LIFE_SHARED.uLifeLateral.value.clone();
          const body = new THREE.Box3().setFromObject(skinForBody), sphere = body.getBoundingSphere(new THREE.Sphere());
          const level = LIFE_SHARED.uLifeOrigin.value.dot(up) + LIFE_SHARED.uLifeGround.value;
          const origin = sphere.center.clone().addScaledVector(up, level - sphere.center.dot(up));
          floor = { origin, forward, side, up, plane: new THREE.Plane().setFromNormalAndCoplanarPoint(up, origin), body: sphere };
        }
        const heart = meshes.get('living:heart-lv');
        const sourceToWorld = gltf.scene.matrixWorld.clone();
        void fetch(atlas.assetUrl.replace(/[^/]+$/, 'flow-paths.json'), { signal: sourceAbort.signal }).then((response) => response.ok ? response.json() : null).then((value: unknown) => {
          if (disposed || !isFlowPathFile(value) || !heart) return;
          const lines = flowLinesFrom(value, atlas, sourceToWorld, new THREE.Box3().setFromObject(heart).getCenter(new THREE.Vector3()));
          flow = createFlowTokens(lines);
          if (!flow) return;
          scene.add(flow.mesh);
          // The walls of the vessels that hold blood become glassy while it is shown. Nerves stay as they are.
          for (const line of lines) if (line.kind === 'artery' || line.kind === 'vein') flowVessels.add(line.structure);
          element.dataset.flowTokens = String(flow.count);
          apply();
        }).catch(() => { /* The motion goes on without tokens. */ });
      }
      display.visible = true;
      loaded = true;
      if (latest.current.cameraPose) setPose(latest.current.cameraPose);
      else reset();
      apply();
      setStatus('');
      onStatus?.('ready');
      onReady?.(renderDiagnostics([...meshes.values()]));
      void detailController.request(latest.current.detailAsset, latest.current.settings.selected);
      } catch (error) {
        console.error('Anatomical geometry rejected', error);
        display.visible = false;
        setFailure(true);
        onStatus?.('failed');
        setStatus('The anatomical geometry could not be verified against its manifest. Check the local asset and provenance files.');
      }
    }).catch((error) => {
      if (disposed) return;
      console.error('Anatomical asset failed to load', error);
      setFailure(true);
      onStatus?.('failed');
      setStatus(atlas.assetFormat === 'local-trace-v1' ? 'The local trace could not be prepared for display. Check its source records and numeric range.' : 'The anatomical asset could not be loaded. Check the local server and the selected reference asset and provenance files.');
    });
    let pointerDown: { x: number; y: number } | null = null, unfoldMoving = false;
    const down = (event: PointerEvent) => { pointerDown = { x: event.clientX, y: event.clientY }; };
    const up = (event: PointerEvent) => {
      if (lab) return;
      if (!pointerDown || Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y) > 5 || event.button !== 0) return;
      pointerDown = null;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      const candidates = [...meshes.values()].filter((mesh) => mesh.visible && mesh.material.opacity > 0.15);
      raycaster.near = camera.near; raycaster.far = camera.far;
      const activeClip = latest.current.settings.clipAxis === 'off' ? null : clip;
      const opened = windowActive() ? windowShape : null;
      // With the layers open, what was seen at that point is already known, so the click needs no search unless it opens a new place.
      if (opened && !seenStale && !cameraMove) {
        const id = idPass.at((event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height);
        if (id && tierOf(id) !== 'skin') { latest.current.onSelect(id); return; }
        if (!id) return;
      }
      const shownFolds = opened ? [...folds.values()].filter((fold) => fold.visible && fold.parent?.visible) : [];
      const hits: THREE.Intersection[] = raycaster.intersectObjects([...candidates.filter((region) => region instanceof THREE.Mesh), ...shownFolds], false)
        .filter((hit) => !activeClip || isPointRetainedByClipPlane(hit.point, activeClip))
        .filter((hit) => {
          if (!opened) return true;
          const id = hit.object.userData.structureId as string, current = latest.current.settings;
          if (folds.get(id) === hit.object) return insideWindow(opened, hit.point.clone().applyMatrix4(hit.object.parent!.matrix.clone().invert()), openRadius(id, current));
          return !insideWindow(opened, hit.point, openRadius(id, current));
        });
      const threshold = linePickingThreshold(camera, controls.target, rect.height);
      if (threshold !== null) {
        raycaster.params.Line.threshold = threshold;
        for (const region of candidates) if (region instanceof THREE.LineSegments) {
          region.updateWorldMatrix(true, false);
          const hit = nearestClippedLineIntersection(region, raycaster, activeClip); if (hit) hits.push(hit);
        }
      }
      hits.sort((left, right) => left.distance - right.distance);
      const hit = hits[0];
      // The closed animal answers a touch, and is not selected by it. Its parts can be chosen from the list.
      if (hit?.face && !opened && life && latest.current.settings.life?.on && latest.current.settings.life.movement && dissectable && skinIsOpaque(latest.current.settings) && !latest.current.settings.dissection) {
        life.poke(hit.point, hit.face.normal.clone().transformDirection(hit.object.matrixWorld));
        if (latest.current.settings.life.sound) voice.touched();
        if (wander.mode === 'going') wander = startle(wander);
        return;
      }
      // A click on the floor: it walks there and stops, whether it was walking or not.
      if (!hit && !opened && life && floor && latest.current.settings.life?.on && latest.current.settings.life.movement && dissectable && !latest.current.settings.dissection && latest.current.settings.clipAxis === 'off') {
        const point = floorAtView(pointer.x, pointer.y);
        if (point) wander = goToFloor(wander, stageOf(point));
        return;
      }
      // On the outside of the animal a click opens the layers there; on anything inside it names what was clicked.
      if (hit && opened && hit.face && hit.object instanceof THREE.Mesh && folds.get(hit.object.userData.structureId) !== hit.object && tierOf(hit.object.userData.structureId) === 'skin') {
        const faceNormal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
        if (unfolder?.open()) unfolder.openAt(hit.point, faceNormal, hit.object);
        else placeWindowAt(hit.point, faceNormal, hit.object);
        return;
      }
      if (hit) latest.current.onSelect(hit.object.userData.structureId);
    };
    const keydown = (event: KeyboardEvent) => {
      if (event.target !== renderer.domElement || event.defaultPrevented || !loaded) return;
      const command = viewerNavigationKey(event); if (!command) return;
      event.preventDefault();
      if (command.kind === 'reset') reset();
      else if (command.kind === 'focus') handle.current?.focus();
      else if (command.kind === 'zoom') handle.current?.zoom(command.factor);
      else handle.current?.pan(command.dx, command.dy);
    };
    const hover = (event: PointerEvent) => {
      if (lab) return;
      if (life && latest.current.settings.life?.on && !event.buttons && !windowActive()) {
        // The mouse looks towards the point on the line of the pointer that passes nearest its head.
        const box = renderer.domElement.getBoundingClientRect();
        pointer.set((event.clientX - box.left) / box.width * 2 - 1, -(event.clientY - box.top) / box.height * 2 + 1);
        raycaster.setFromCamera(pointer, camera);
        const neck = LIFE_SHARED.uLifeOrigin.value;
        life.lookAt(raycaster.ray.closestPointToPoint(neck, new THREE.Vector3()));
      }
      if (!windowActive() || seenStale || event.buttons) { setHovered((value) => value ? null : value); return; }
      const rect = renderer.domElement.getBoundingClientRect();
      const id = idPass.at((event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height);
      const structure = id ? atlas.structures.find((item) => item.id === id) : undefined;
      setHovered(structure ? { x: event.clientX - rect.left, y: event.clientY - rect.top, name: markedName(structure) } : null);
    };
    renderer.domElement.addEventListener('pointermove', hover);
    renderer.domElement.addEventListener('pointerdown', down);
    renderer.domElement.addEventListener('pointerup', up);
    renderer.domElement.addEventListener('keydown', keydown);
    const observer = new ResizeObserver(() => {
      const width = Math.max(element.clientWidth, 1);
      const height = Math.max(element.clientHeight, 1);
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      dirty = true;
    });
    observer.observe(element);
    const loop = (timestamp: number) => {
      frame = requestAnimationFrame(loop);
      const realDelta = Math.max((timestamp - lastFrame) / 1000, 0);
      const delta = Math.min(realDelta, 0.1);
      lastFrame = timestamp;
      const current = latest.current.settings;
      if (current.covered) return;
      if (controls.autoRotate !== !!current.autoRotate) controls.autoRotate = !!current.autoRotate;
      if (unfolder && loaded && !document.hidden) {
        // Poses are announced when the zoom comes to rest, because the app gives back what it is told and would pull a moving view back.
        syncing = true;
        const moved = unfolder.update(realDelta);
        syncing = false;
        if (moved) {
          syncWindow(current); dirty = true; markSeenStale(); unfoldMoving = true;
        } else if (unfoldMoving && performance.now() - seenChangedAt > 200) { unfoldMoving = false; announcePose(); }
        syncGuide();
      }
      if (dissectable && loaded) {
        const wantedOpening = unfolder?.open() ? 1 : current.dissection?.opening ?? 0;
        if (wantedOpening > 0 && !windowShape) placeWindow('side');
        if (windowOpening !== wantedOpening) {
          const reach = reducedMotion ? 1 : realDelta * 0.5;
          const wasActive = windowActive();
          windowOpening = Math.abs(wantedOpening - windowOpening) <= reach ? wantedOpening : windowOpening + Math.sign(wantedOpening - windowOpening) * reach;
          if (windowActive() !== wasActive) apply(); else syncWindow(current);
          dirty = true; shadowDirty = true; markSeenStale();
        }
        if (cameraMove) {
          cameraMove.t = Math.min(1, cameraMove.t + realDelta / 0.9);
          const ease = cameraMove.t * cameraMove.t * (3 - 2 * cameraMove.t);
          const blend = (from: readonly number[], to: readonly number[]) => from.map((value, index) => value + (to[index] - value) * ease);
          const fromUp = new THREE.Vector3(...cameraMove.from.up), toUp = new THREE.Vector3(...cameraMove.to.up), target = blend(cameraMove.from.target, cameraMove.to.target), position = new THREE.Vector3(...blend(cameraMove.from.position, cameraMove.to.position));
          const way = fromUp.clone().lerp(toUp, ease);
          // An animal turned over: the view goes round it, and does not pass through it.
          if (fromUp.dot(toUp) < -0.9) {
            const round = new THREE.Vector3(...cameraMove.from.position).sub(new THREE.Vector3(...cameraMove.from.target)).cross(fromUp).normalize();
            const across = position.distanceTo(new THREE.Vector3(...cameraMove.to.position)) + position.distanceTo(new THREE.Vector3(...cameraMove.from.position));
            position.addScaledVector(round, 0.5 * across * Math.sin(Math.PI * ease));
            way.copy(fromUp).multiplyScalar(Math.cos(Math.PI * ease)).addScaledVector(round, Math.sin(Math.PI * ease));
          }
          setPose({ ...cameraMove.to, position: position.toArray() as CameraPose['position'], target: target as CameraPose['target'], up: way.normalize().toArray() as CameraPose['up'] });
          markSeenStale();
          if (cameraMove.t >= 1) { cameraMove = null; announcePose(); }
        }
      }
      if (controls.autoRotate && loaded && !document.hidden) {
        // Automatic rotation does not report poses; the last pose is announced when the user takes over.
        syncing = true; controls.update(delta); syncing = false; dirty = true;
      }
      if (current.living && current.playing && !document.hidden) elapsed += delta * current.speed;
      const physiology = evaluateIllustrativePhysiology(elapsed, { cardiac: current.cardiac, respiratory: current.respiratory });
      syncPathSignal();
      const signal=lastPathSignal;
      if(signal&&pathOverlay){
        if(signal.playing&&!document.hidden)signalElapsedMs+=delta*1000*signal.playbackRate;
        if(signal.kind==='flow')pathOverlay.updateFlow(signal.transitMs===null?0:signalElapsedMs/signal.transitMs,signal.direction);
        else{
          const modelTime=(signalElapsedMs/1000)%signal.result.parameters.duration;
          const frames=signal.result.snapshots,left=Math.min(frames.length-2,Math.floor(modelTime));const fraction=modelTime-frames[left].time;
          const values=frames[left].v.map((value,index)=>value+(frames[left+1].v[index]-value)*fraction);
          pathOverlay.updateActivity(values,-2.2,2.2);
        }
        dirty=true;
      }
      if(atlas.structures.length===1){const region=meshes.get(atlas.structures[0].id);if(region instanceof THREE.LineSegments){const normal=current.opacity[atlas.structures[0].id]??defaultOpacity(atlas.structures[0].id);const desired=pathOverlay?Math.min(normal,.18):normal;if(region.material.opacity!==desired){region.material.opacity=desired;dirty=true;}}}
      syncCircuits();
      if (circuitOverlay?.group.visible && current.circuits) {
        // The shared illustrative clock applies pause and speed to the routes as well.
        const routeFrame = circuitOverlay.update({ timeS: elapsed, circulation: current.circuits.circulation, neural: current.circuits.neural,
          selectedId: current.selected, selectionOnly: current.circuits.selectionOnly, isVisible: (id) => !!meshes.get(id)?.visible,
          clippingPlanes: current.clipAxis === 'off' ? [] : [clip] });
        if (routeFrame.changed) dirty = true;
      }

      for (const [id, mesh] of meshes) {
        if (!(mesh instanceof THREE.Mesh)) continue;
        const scale = !current.living ? 1 : cardiacRegions.has(id) ? physiology.cardiacScale : respiratoryRegions.has(id) ? physiology.respiratoryScale : 1;
        if (mesh.scale.x !== scale) { mesh.scale.setScalar(scale); dirty = true; }
      }
      if (windowActive() && seenStale && !dirty && !cameraMove && !interacting && performance.now() - seenChangedAt > 240 && !document.hidden) lookAtWhatIsSeen(current);
      if (life && loaded && !document.hidden) {
        // The motion asks for a new drawing at most this often, and the frames between are left to the rest of the page.
        lifeWaited += realDelta;
        if (lifeWaited >= 1 / 45) {
          const step = Math.min(lifeWaited, 0.2);
          lifeWaited = 0;
          walkHold = Math.max(0, walkHold - step);
          const looking = !!lab || windowActive() || !!current.dissection || current.clipAxis !== 'off' || !!unfolder?.playing() || !!cameraMove || walkHold > 0 || viewHeightAt(camera.position.distanceTo(controls.target), camera.fov) < 0.05;
          const stepping = !!floor && !looking && wantsToStep(wander);
          if (life.tick(step, current.life, { stepping, pace: paceOf(wander), turning: stepping ? wander.turning : 0, sitting: !!floor && !looking && wantsToSit(wander) })) dirty = true;
          if (floor && !looking && current.life?.on && current.life.playing && current.life.movement) {
            const before = wander.pose;
            wander = stepWander(wander, step, life.travelled(), !!current.life.walking, wanderView());
            if (wander.pose !== before) moveStage(before, wander.pose);
            element.dataset.walk = wander.mode;
            element.dataset.stage = [wander.pose.x, wander.pose.y, wander.pose.heading, camera.position.x, camera.position.y, camera.position.z, controls.target.x, controls.target.y, controls.target.z].map((value) => value.toFixed(3)).join(' ');
          }
          if (flow && current.life?.on && current.life.playing) flow.advance(step, current.life.rate);
          element.dataset.life = current.life?.on ? (current.life.playing ? 'playing' : 'paused') : 'off';
        }
      }
      if (lab && loaded && !document.hidden) {
        if (lab.update(Math.min(realDelta, 0.1), realDelta)) dirty = true;
        if (interacting || cameraMove) seenStale = true;
        lights.quaternion.copy(camera.quaternion);
        scene.environmentRotation.setFromQuaternion(camera.quaternion);
        turnFurLights(camera.quaternion);
        hemisphere.position.setFromMatrixColumn(camera.matrixWorld, 1);
        if (dirty) renderer.shadowMap.needsUpdate = true;
      }
      if (dirty && !document.hidden) {
        if (shadow && shadowDirty && !lab) {
          const sectionVisible = sectionPlane?.mesh.visible ?? false;
          const coatVisible = fur?.mesh.visible ?? false;
          const tokensVisible = flow?.mesh.visible ?? false;
          if (flow) flow.mesh.visible = false;
          if (sectionPlane) sectionPlane.mesh.visible = false;
          for (const layer of fur ? [fur, ...fineHair] : []) layer.mesh.visible = false;
          const foldedShown = [...foldRoots.values(), ...openingMarks.values()].filter((item) => item.visible);
          for (const item of foldedShown) item.visible = false;
          shadow.render(renderer, scene, current.clipAxis === 'off' ? [] : [clip]);
          for (const item of foldedShown) item.visible = true;
          if (sectionPlane) sectionPlane.mesh.visible = sectionVisible;
          for (const layer of fur ? [fur, ...fineHair] : []) layer.mesh.visible = coatVisible;
          if (flow) flow.mesh.visible = tokensVisible;
          shadowDirty = false;
        }
        // A machine that struggles draws fewer hairs while the view moves, and the full coat once it stops.
        if (fur?.mesh.visible) {
          const moving = interacting || !!current.autoRotate || !!(current.life?.on && current.life.playing);
          const now = performance.now();
          if (moving && lastFrameAt && now - lastFrameAt < 500) {
            slowFrames = now - lastFrameAt > 50 ? slowFrames + 1 : Math.max(0, slowFrames - 1);
            quickFrames = now - lastFrameAt < 28 ? quickFrames + 1 : 0;
            if (slowFrames >= 6) { const detail = Math.max(0.3, fur.detail() * 0.75); for (const layer of [fur, ...fineHair]) layer.setDetail(detail); slowFrames = 0; quickFrames = 0; }
            else if (quickFrames >= 90 && fur.detail() < 1) { const detail = Math.min(1, fur.detail() * 1.15); for (const layer of [fur, ...fineHair]) layer.setDetail(detail); quickFrames = 0; }
          }
          lastFrameAt = now;
        }
        renderer.render(scene, camera);
        dirty = false;
        if (dissectable && windowActive() && seenStale) { element.dataset.dissection = 'moving'; if (lastLabelSet) { lastLabelSet = ''; setLabelSet({ labels: [], width: 0, height: 0 }); } }
        else syncAllLabels(current, timestamp);
        const selected = meshes.get(current.selected ?? '');
        // On a model standing as a whole animal, the body surface is the animal itself, and a label at its middle would only cover it.
        if (selected?.visible && current.labels && !current.allLabels && !(skinCovers(current) && current.selected !== skinId) && !(posture && current.selected === skinId)) {
          const anchor = regionLabelCenter(selected);
          if (!anchor) { setLabel(null); lastLabel = ""; return; }
          const point = anchor.project(camera);
          const projected = { x: (point.x + 1) / 2 * element.clientWidth, y: (-point.y + 1) / 2 * element.clientHeight, name: markedName(atlas.structures.find((item) => item.id === current.selected)!) };
          const signature = `${Math.round(projected.x)},${Math.round(projected.y)},${projected.name}`;
          if (signature !== lastLabel) { setLabel(point.z < 1 ? projected : null); lastLabel = signature; }
        } else if (lastLabel) { setLabel(null); lastLabel = ''; }
      }
    };
    frame = requestAnimationFrame(loop);
    return () => {
      disposed = true;
      lab?.dispose();
      voice.dispose();
      life?.dispose();
      flow?.dispose();
      sourceAbort.abort();
      pathOverlay?.dispose();
      circuitOverlay?.dispose();
      shadow?.dispose();
      sectionRequest?.abort.abort();
      sectionPlane?.dispose();
      detailController.dispose();
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      idPass.dispose();
      renderer.domElement.removeEventListener('pointermove', hover);
      renderer.domElement.removeEventListener('pointerdown', down);
      renderer.domElement.removeEventListener('pointerup', up);
      renderer.domElement.removeEventListener('keydown', keydown);
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) disposeRegion(object);
      });
      for (const copies of surfaceCopies.values()) { copies.source.dispose(); copies.smoothed.dispose(); }
      environment.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
      engine.current = null;
      handle.current = null;
    };
  }, [atlas]);

  useEffect(() => { engine.current?.apply(); }, [settings]);
  useEffect(() => { if (cameraPose) engine.current?.setPose(cameraPose); }, [cameraPose]);
  useLayoutEffect(() => { engine.current?.setDetail(); }, [detailAsset, settings.selected]);
  return <div className="viewer-canvas" ref={host}>
    {status && <div className={`viewer-status ${failure ? 'error' : ''}`} role="status">{!failure && <span className="loading-ring" />}{status}</div>}
    {label && !status && <div className="model-label" style={{ left: label.x, top: label.y }}>{label.name}</div>}
    {labelSet.labels.length > 0 && !status && <>
      <svg className="label-leaders" width={labelSet.width} height={labelSet.height} aria-hidden="true">
        {labelSet.labels.map((item) => { const end = leaderEnd(item); return <line key={item.id} x1={item.anchorX} y1={item.anchorY} x2={end.x} y2={end.y} />; })}
      </svg>
      {labelSet.labels.map((item) => settings.dissection || settings.lab || guide
        ? <button type="button" key={item.id} className={`model-label--plate ${item.id === settings.selected ? 'is-selected' : ''}`} style={{ left: item.left, top: item.top, width: item.width, height: item.height }} onClick={() => onSelect(item.id)}>{item.name}</button>
        : <div key={item.id} className={`model-label model-label--placed ${item.id === settings.selected ? 'is-selected' : ''}`}
        style={{ left: item.left, top: item.top, width: item.width, height: item.height }}>{item.name}</div>)}
    </>}
    {hovered && !status && <div className="model-label model-label--hover" style={{ left: hovered.x, top: hovered.y }}>{hovered.name}</div>}
    {guide && !status && <UnfoldGuide state={guide} selected={settings.selected === bodySurfaceIdFor(atlas) ? null : settings.selected} namesOn={namesOn} onNames={setNamesOn} onRow={(id, passing) => { onSelect(id); if (!passing) unfoldRef.current?.goToStop(id); }} onInto={() => { const stops = unfoldRef.current?.stops() ?? [], at = unfoldRef.current?.currentStop() ?? -1; onZoomThrough?.(stops.slice(0, Math.max(at, 0) + 1).reverse().map((stop) => stop.id), guide.place); }} onPlay={(direction) => unfoldRef.current?.play(direction)} />}
    {!guide && !everOpened && !status && dissectionAppliesTo(atlas) && !settings.lab && !settings.dissection && !settings.hidden.includes(bodySurfaceIdFor(atlas) ?? '') && settings.clipAxis === 'off' && <UnfoldHint onPlay={() => unfoldRef.current?.play('in')} />}
  </div>;
}
