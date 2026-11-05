import { createPathSignalOverlay, type PathSignalOverlay } from './path-signal-overlay';
import { createLivingCircuitOverlay, type LivingCircuitOverlay } from './living-circuit-overlay';
import { buildLivingCircuits } from '../domain/living-circuits';
import type { PathSignalDisplay } from './path-signal-display';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { surfaceShadingOf, SURFACE_PRESENTATION, SKIN_PRESENTATION } from './surface-shading';
import { createContactShadow, type ContactShadow } from './contact-shadow';
import { bodySurfaceIdFor, displayPostureFor } from '../domain/display-pose';
import { smoothingOptionsFor, smoothSurfaceGeometries } from './surface-smoothing';
import type { SurfaceDisplay } from '../domain/display-smoothing';
import { displayColour, type ColourScheme } from '../domain/tissue-palette';
import { layoutLabels, leaderEnd, type LabelCandidate, type PlacedLabel } from './label-layout';
import { evaluateIllustrativePhysiology, physiologyProcessesForAtlas, type Atlas } from '../domain';
import { defaultStructureOpacity, OPAQUE_SKIN } from '../domain/reference-display';
import { RegionDetailController, type RegionDetailAsset, type RegionDetailStatus } from './region-detail';
import { loadAtlasScene } from './atlas-loader';
import type { LocalTraceAsset } from '../domain/local-trace';
import { disposeRegion, prepareRegionMaterial, regionLabelCenter, linePickingThreshold, nearestClippedLineIntersection, type RenderRegion } from './region-objects';
import { renderDiagnostics, type ViewerDiagnostics } from './viewer-diagnostics';
import { traceSampleFocusBounds } from './trace-sample-focus';
import { sourcePolylinePathBounds } from './polyline-focus';
import { panViewerCamera, viewerNavigationKey, zoomViewerCamera } from './viewer-navigation';
import { applyCameraPose, captureCameraPose, createDisplayClipPlane, DISPLAY_ROTATION_Z, fitCameraToBounds, focusCameraOnRegions, isPointRetainedByClipPlane, recenterRegionGeometry, type CameraPose } from './scene-utils';

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
};
export type ViewerHandle = { reset: () => void; view: (axis: 'x' | 'y' | 'z') => void; focus: () => void; focusRegions: (ids: readonly string[]) => void; focusTraceSample: (sampleId: number) => boolean; focusPolylinePath: (pathRowIndex: number) => boolean; zoom: (factor: number) => boolean; pan: (dx: number, dy: number) => boolean };
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
};

export function ViewerCanvas({ atlas, settings, onSelect, onReady, onStatus, handle, cameraPose, onCameraChange, title, detailAsset, onDetailStatus, localTrace, pathSignal, onAutoRotateEnd }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const latest = useRef({ pathSignal, settings, onSelect, onCameraChange, cameraPose, detailAsset, onDetailStatus, onReady, onAutoRotateEnd });
  latest.current = { pathSignal, settings, onSelect, onCameraChange, cameraPose, detailAsset, onDetailStatus, onReady, onAutoRotateEnd };
  const engine = useRef<{ apply: () => void; setPose: (pose: CameraPose) => void; setDetail: () => void } | null>(null);
  const [status, setStatus] = useState('Loading reference geometry');
  const [failure, setFailure] = useState(false);
  const [label, setLabel] = useState<{ x: number; y: number; name: string } | null>(null);
  const [labelSet, setLabelSet] = useState<{ labels: PlacedLabel[]; width: number; height: number }>({ labels: [], width: 0, height: 0 });

  useEffect(() => {
    if (!host.current) return;
    setStatus('Loading reference geometry'); setFailure(false); setLabel(null); setLabelSet({ labels: [], width: 0, height: 0 });
    latest.current.onDetailStatus?.({ status: 'idle', structureId: null });
    onStatus?.('loading');
    const element = host.current;
    let disposed = false;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
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
    scene.add(new THREE.HemisphereLight('#dfe9ea', '#2b333a', 1.1));
    const key = new THREE.DirectionalLight('#fff4e4', 2.4);
    key.position.set(-2.5, 4, 5.5);
    scene.add(key);
    const fill = new THREE.DirectionalLight('#9fc3cc', 0.7);
    fill.position.set(3, -1, -3);
    scene.add(fill);
    const rim = new THREE.DirectionalLight('#ffffff', 1.1);
    rim.position.set(1.5, 2.5, -5);
    scene.add(rim);
    const camera = new THREE.PerspectiveCamera(36, 1, 0.00001, 100);
    // A reference with an inferred dorsal direction orbits about it, like a turntable.
    const posture = displayPostureFor(atlas);
    const skinId = bodySurfaceIdFor(atlas);
    if (posture) camera.up.set(...posture.up);
    const controls = new OrbitControls(camera, renderer.domElement);
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
    /** True when the opaque body surface covers the regions inside it. */
    const skinCovers = (current: ViewerSettings) => {
      const skin = skinId ? meshes.get(skinId) : undefined;
      return !!skin?.visible && (current.opacity[skinId!] ?? defaultOpacity(skinId!)) >= OPAQUE_SKIN;
    };
    /** Place a label for every displayed region; refreshed at most about twenty times per second. */
    const syncAllLabels = (current: ViewerSettings, timestamp: number) => {
      if (!current.allLabels) { if (lastLabelSet) { lastLabelSet = ''; setLabelSet({ labels: [], width: 0, height: 0 }); } return; }
      if (timestamp - lastLabelSetAt < 50) return;
      lastLabelSetAt = timestamp;
      const width = element.clientWidth, height = element.clientHeight;
      const candidates: LabelCandidate[] = [];
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
        candidates.push({ id, name: structure.name, x: (point.x + 1) / 2 * width, y: (-point.y + 1) / 2 * height, depth: point.z, priority: selected ? Number.MAX_SAFE_INTEGER : extent * mesh.scale.x });
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
    const defaultOpacity =(id: string) => defaultStructureOpacity(atlas.structures.find((structure) => structure.id === id)!);
    const apply = () => {
      const current = latest.current.settings;
      for (const [id, mesh] of meshes) {
        const structure = atlas.structures.find((item) => item.id === id)!;
        const opacity = current.opacity[id] ?? defaultOpacity(id);
        mesh.visible = !current.hidden.includes(id) && opacity > 0;
        mesh.material.opacity = opacity;
        mesh.material.transparent = opacity < 1;
        mesh.material.depthWrite = opacity >= 0.95;
        mesh.renderOrder = opacity < 1 ? 2 : 0;
        mesh.material.color.set(current.colors[id] ?? displayColour(structure, current.colourScheme ?? 'tissue'));
        const shading = surfaceShadingOf(mesh.material);
        if (shading) {
          shading.uRim.value = id === current.selected ? 1 : 0;
          // A translucent envelope fades where it faces the camera and keeps its silhouette.
          shading.uGhost.value = opacity < 1 && structure.systems.includes('integumentary') ? SURFACE_PRESENTATION.ghostStrength : 0;
        }
        mesh.material.clippingPlanes = current.clipAxis === 'off' ? [] : [clip];
      }
      if (current.clipAxis !== 'off') clip.copy(createDisplayClipPlane(current.clipAxis, current.clipPosition, radius));
      applySurfaceDisplay();
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
      if (!syncing && loaded) latest.current.onCameraChange?.(captureCameraPose(camera, controls.target));
    };
    controls.addEventListener('change', announcePose);
    const setPose = (pose: CameraPose) => {
      syncing = true;
      applyCameraPose(camera, controls.target, pose);
      controls.update();
      syncing = false;
      dirty = true;
    };
    engine.current = { apply, setPose, setDetail: () => { if (loaded) void detailController.request(latest.current.detailAsset, latest.current.settings.selected); } };
    const reset = () => {
      controls.target.set(0, 0, 0);
      if (posture) {
        // A raised lateral view with the inferred dorsal side up.
        camera.up.set(...posture.up);
        camera.position.set(...posture.view).multiplyScalar(radius * posture.distance);
      } else {
        camera.up.set(0, 1, 0);
        // A raised three-quarter display pose; the display axes carry no anatomical direction.
        camera.position.set(radius * 1.35, radius * 1.05, radius * 2.55);
      }
      controls.update();
      dirty = true;
    };
    const focusRegions = (ids: readonly string[]) => {
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
      view(axis) {
        controls.target.set(0, 0, 0);
        camera.position.set(axis === 'x' ? radius * 3.3 : 0, axis === 'y' ? radius * 3.3 : 0, axis === 'z' ? radius * 3.3 : 0);
        camera.up.set(0, axis === 'y' ? 0 : 1, axis === 'y' ? -1 : 0);
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
        if (structure.id === skinId && region.material instanceof THREE.MeshPhysicalMaterial) Object.assign(region.material, SKIN_PRESENTATION, { sheenColor: new THREE.Color(SKIN_PRESENTATION.sheenColor) });
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
      controls.minDistance = radius * 0.07;
      controls.maxDistance = radius * 12;
      if (posture) { shadow = createContactShadow(bounds, new THREE.Vector3(...posture.up)); if (shadow) scene.add(shadow.group); }
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
    let pointerDown: { x: number; y: number } | null = null;
    const down = (event: PointerEvent) => { pointerDown = { x: event.clientX, y: event.clientY }; };
    const up = (event: PointerEvent) => {
      if (!pointerDown || Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y) > 5 || event.button !== 0) return;
      pointerDown = null;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      const candidates = [...meshes.values()].filter((mesh) => mesh.visible && mesh.material.opacity > 0.15);
      raycaster.near = camera.near; raycaster.far = camera.far;
      const activeClip = latest.current.settings.clipAxis === 'off' ? null : clip;
      const hits: THREE.Intersection[] = raycaster.intersectObjects(candidates.filter((region) => region instanceof THREE.Mesh), false)
        .filter((hit) => !activeClip || isPointRetainedByClipPlane(hit.point, activeClip));
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
      const delta = Math.min(Math.max((timestamp - lastFrame) / 1000, 0), 0.1);
      lastFrame = timestamp;
      const current = latest.current.settings;
      if (controls.autoRotate !== !!current.autoRotate) controls.autoRotate = !!current.autoRotate;
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
      if (dirty && !document.hidden) {
        if (shadow && shadowDirty) { shadow.render(renderer, scene, current.clipAxis === 'off' ? [] : [clip]); shadowDirty = false; }
        renderer.render(scene, camera);
        dirty = false;
        syncAllLabels(current, timestamp);
        const selected = meshes.get(current.selected ?? '');
        if (selected?.visible && current.labels && !current.allLabels && !(skinCovers(current) && current.selected !== skinId)) {
          const anchor = regionLabelCenter(selected);
          if (!anchor) { setLabel(null); lastLabel = ""; return; }
          const point = anchor.project(camera);
          const projected = { x: (point.x + 1) / 2 * element.clientWidth, y: (-point.y + 1) / 2 * element.clientHeight, name: atlas.structures.find((item) => item.id === current.selected)!.name };
          const signature = `${Math.round(projected.x)},${Math.round(projected.y)},${projected.name}`;
          if (signature !== lastLabel) { setLabel(point.z < 1 ? projected : null); lastLabel = signature; }
        } else if (lastLabel) { setLabel(null); lastLabel = ''; }
      }
    };
    frame = requestAnimationFrame(loop);
    return () => {
      disposed = true;
      sourceAbort.abort();
      pathOverlay?.dispose();
      circuitOverlay?.dispose();
      shadow?.dispose();
      detailController.dispose();
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
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
      {labelSet.labels.map((item) => <div key={item.id} className={`model-label model-label--placed ${item.id === settings.selected ? 'is-selected' : ''}`}
        style={{ left: item.left, top: item.top, width: item.width, height: item.height }}>{item.name}</div>)}
    </>}
  </div>;
}
