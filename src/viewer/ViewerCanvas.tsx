import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { evaluateIllustrativePhysiology, physiologyProcessesForAtlas, type Atlas, type ViewBackground } from '../domain';
import { defaultStructureOpacity } from '../domain/reference-display';
import { RegionDetailController, type RegionDetailAsset, type RegionDetailStatus } from './region-detail';
import { loadAtlasScene } from './atlas-loader';
import type { LocalTraceAsset } from '../domain/local-trace';
import { disposeRegion, prepareRegionMaterial, regionLabelCenter, linePickingThreshold, nearestClippedLineIntersection, type RenderRegion } from './region-objects';
import { renderDiagnostics, type ViewerDiagnostics } from './viewer-diagnostics';
import { traceSampleFocusBounds } from './trace-sample-focus';
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
  colors: Record<string, string>;
  labels: boolean;
  background: ViewBackground;
};
export type ViewerHandle = { reset: () => void; view: (axis: 'x' | 'y' | 'z') => void; focus: () => void; focusRegions: (ids: readonly string[]) => void; focusTraceSample: (sampleId: number) => boolean };
type Props = {
  atlas: Atlas;
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
};

const palette: Record<string, string> = {
  skeletal: '#e9dfc7', muscular: '#a36f6b', nervous: '#d2ac62', cardiovascular: '#c35e65',
  respiratory: '#b9bbd0', digestive: '#b98156', urinary: '#b97f73', reproductive: '#d4ad83',
  immune: '#937f9d', endocrine: '#bfaa6d', integumentary: '#8f9d9a',
};

export function ViewerCanvas({ atlas, settings, onSelect, onReady, onStatus, handle, cameraPose, onCameraChange, title, detailAsset, onDetailStatus, localTrace }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const latest = useRef({ settings, onSelect, onCameraChange, cameraPose, detailAsset, onDetailStatus, onReady });
  latest.current = { settings, onSelect, onCameraChange, cameraPose, detailAsset, onDetailStatus, onReady };
  const engine = useRef<{ apply: () => void; setPose: (pose: CameraPose) => void; setDetail: () => void } | null>(null);
  const [status, setStatus] = useState('Loading reference geometry');
  const [failure, setFailure] = useState(false);
  const [label, setLabel] = useState<{ x: number; y: number; name: string } | null>(null);

  useEffect(() => {
    if (!host.current) return;
    setStatus('Loading reference geometry'); setFailure(false); setLabel(null);
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
    renderer.setClearColor(latest.current.settings.background === 'white' ? '#ffffff' : '#111d23', 1);
    renderer.domElement.setAttribute('aria-label', title ?? 'Interactive anatomical source model');
    renderer.domElement.setAttribute('role', 'img');
    renderer.domElement.setAttribute('tabindex', '0');
    element.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight('#e3f5f4', '#343e46', 2.7));
    const key = new THREE.DirectionalLight('#fff1da', 3.0);
    key.position.set(-2, 4, 6);
    scene.add(key);
    const fill = new THREE.DirectionalLight('#92c6ce', 1.5);
    fill.position.set(3, -2, -4);
    scene.add(fill);
    const camera = new THREE.PerspectiveCamera(36, 1, 0.00001, 100);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false;
    controls.enablePan = true;
    const display = new THREE.Group();
    display.rotation.z = DISPLAY_ROTATION_Z;
    scene.add(display);
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const meshes = new Map<string, RenderRegion>();
    const detailTargets = new Map<string, { mesh: THREE.Mesh<THREE.BufferGeometry>; sourceToLocal: THREE.Matrix4 }>();
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
    const clip = new THREE.Plane();
    const defaultOpacity = (id: string) => defaultStructureOpacity(atlas.structures.find((structure) => structure.id === id)!);
    const apply = () => {
      const current = latest.current.settings;
      renderer.setClearColor(current.background === 'white' ? '#ffffff' : '#111d23', 1);
      for (const [id, mesh] of meshes) {
        const structure = atlas.structures.find((item) => item.id === id)!;
        const opacity = current.opacity[id] ?? defaultOpacity(id);
        mesh.visible = !current.hidden.includes(id) && opacity > 0;
        mesh.material.opacity = opacity;
        mesh.material.transparent = opacity < 1;
        mesh.material.depthWrite = opacity >= 0.95;
        mesh.renderOrder = opacity < 1 ? 2 : 0;
        mesh.material.color.set(current.colors[id] ?? structure.color ?? palette[structure.systems[0]] ?? '#9ba5a1');
        if (mesh.material instanceof THREE.MeshStandardMaterial) {
          mesh.material.emissive.set(id === current.selected ? '#315b54' : '#000000');
          mesh.material.emissiveIntensity = id === current.selected ? 0.65 : 0;
        }
        mesh.material.clippingPlanes = current.clipAxis === 'off' ? [] : [clip];
      }
      if (current.clipAxis !== 'off') clip.copy(createDisplayClipPlane(current.clipAxis, current.clipPosition, radius));
      dirty = true;
    };
    const detailController = new RegionDetailController(atlas, (id) => detailTargets.get(id), () => {
      dirty = true;
      if (!disposed && loaded) latest.current.onReady?.(renderDiagnostics([...meshes.values()]));
    }, (state) => {
      const requested = latest.current.detailAsset;
      if (!disposed && (requested ? state.structureId === requested.structureId && state.assetSha256 === requested.glbSha256 : state.status === 'idle'))
        latest.current.onDetailStatus?.(state);
    });
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
      camera.up.set(0, 1, 0);
      camera.position.set(radius * 0.25, radius * 0.7, radius * 3.1);
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
    void loadAtlasScene(atlas, sourceAbort.signal, fetch, localTrace).then((sourceScene) => {
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
      const traceFormat = atlas.assetFormat === 'local-trace-v1' || atlas.assetFormat === 'swc-native-v1';
      gltf.scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh) && !(object instanceof THREE.LineSegments)) return;
        if (traceFormat !== (object instanceof THREE.LineSegments)) throw new Error('Unexpected render primitive for this reference.');
        sourceRegionCount++;
        const structure = atlas.structures.find((entry) => entry.meshNode === object.name || entry.id === object.userData.structureId);
        if (!structure || meshes.has(structure.id)) throw new Error('Reference region identity is missing or duplicated.');
        const { previousGeometry } = recenterRegionGeometry(object); previousGeometry.dispose();
        const region = prepareRegionMaterial(object);
        region.userData.structureId = structure.id;
        meshes.set(structure.id, region);
        region.updateWorldMatrix(true, false);
        if (region instanceof THREE.Mesh) detailTargets.set(structure.id, { mesh: region,
          sourceToLocal: region.matrixWorld.clone().invert().multiply(gltf.scene.matrixWorld) });
      });
      if (meshes.size !== atlas.structures.length || sourceRegionCount !== atlas.structures.length) throw new Error('Reference geometry count differs from its metadata.');
      bounds.setFromObject(display);
      radius = bounds.getSize(new THREE.Vector3()).length() / 2;
      camera.near = radius / 2000;
      camera.far = radius * 100;
      camera.updateProjectionMatrix();
      controls.minDistance = radius * 0.07;
      controls.maxDistance = radius * 12;
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
      if (event.key === 'Home') { event.preventDefault(); reset(); }
      if (event.key.toLowerCase() === 'f') handle.current?.focus();
      const offset = event.key === 'ArrowLeft' ? -0.1 : event.key === 'ArrowRight' ? 0.1 : 0;
      if (offset) {
        event.preventDefault();
        const delta = camera.position.clone().sub(controls.target).applyAxisAngle(new THREE.Vector3(0, 1, 0), offset);
        camera.position.copy(controls.target).add(delta);
        controls.update();
      }
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
      if (current.living && current.playing && !document.hidden) elapsed += delta * current.speed;
      const physiology = evaluateIllustrativePhysiology(elapsed, { cardiac: current.cardiac, respiratory: current.respiratory });
      for (const [id, mesh] of meshes) {
        if (!(mesh instanceof THREE.Mesh)) continue;
        const scale = !current.living ? 1 : cardiacRegions.has(id) ? physiology.cardiacScale : respiratoryRegions.has(id) ? physiology.respiratoryScale : 1;
        if (mesh.scale.x !== scale) { mesh.scale.setScalar(scale); dirty = true; }
      }
      if (dirty && !document.hidden) {
        renderer.render(scene, camera);
        dirty = false;
        const selected = meshes.get(current.selected ?? '');
        if (selected?.visible && current.labels) {
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
  return <div className="viewer-canvas" ref={host} data-background={settings.background}>
    {status && <div className={`viewer-status ${failure ? 'error' : ''}`} role="status">{!failure && <span className="loading-ring" />}{status}</div>}
    {label && !status && <div className="model-label" style={{ left: label.x, top: label.y }}>{label.name}</div>}
  </div>;
}
