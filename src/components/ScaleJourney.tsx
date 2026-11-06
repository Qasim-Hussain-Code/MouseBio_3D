import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import * as THREE from 'three';
import {
  EVIDENCE_LABEL, formatLength, formatMagnification, JOURNEY_NOTICE, journeyLevels, levelAim, levelAt, levelFade, levelHome, magnification, scaleBarLength,
  type JourneyLevel, type JourneyTissue,
} from '../domain/scale-journey';
import { disposeScene, isNucleosomeData, JOURNEY_BUILDERS, type JourneyScene, type NucleosomeData } from '../viewer/scale-journey-scenes';
import { TISSUE_BUILDERS } from '../viewer/tissue-scenes';

const NUCLEOSOME_URL = '/scale-journey/nucleosome-5b1m.json';
const FIELD_OF_VIEW = 30;

/** One step of the wheel changes the view by this factor per unit of wheel delta. */
const WHEEL_RATE = 0.0016;

type DataState = 'loading' | 'ready' | 'failed';
interface ShownLabel { readonly text: string; readonly x: number; readonly y: number }

/** Moves labels upward until none covers another. The widths are estimates from the length of the text. */
function separateLabels(labels: readonly ShownLabel[]): ShownLabel[] {
  const placed: ShownLabel[] = [];
  for (const label of [...labels].sort((a, b) => b.y - a.y)) {
    const half = label.text.length * 3.2 + 12;
    let y = label.y;
    for (let tries = 0; tries < 8; tries++) {
      const clash = placed.find((other) => Math.abs(other.x - label.x) < half + other.text.length * 3.2 + 12 && Math.abs(other.y - y) < 24);
      if (!clash) break;
      y = clash.y - 24;
    }
    placed.push({ ...label, y });
  }
  return placed;
}

/**
 * A continuous zoom from a block of skin to the quarks of a proton. Each level is its own scene and is scaled from its reference length to the height of the view, so that
 * no single coordinate has to span the thirteen orders of magnitude. None of it is part of an anatomical reference.
 */
export default function ScaleJourney({ onExit, tissue = 'skin', from }: { readonly onExit: () => void; readonly tissue?: JourneyTissue; readonly from?: string }) {
  const levels = useMemo(() => journeyLevels(tissue), [tissue]);
  const widest = levels[0].startMetres, narrowest = levels[levels.length - 1].endMetres;
  const dialog = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const view = useRef(levelHome(levels[0], levels));
  const target = useRef<number | null>(null);
  const dirty = useRef(true);
  const [viewMetres, setViewMetres] = useState(view.current);
  const [stageHeight, setStageHeight] = useState(0);
  const [webglFailed, setWebglFailed] = useState(false);
  const [dataState, setDataState] = useState<DataState>('loading');
  const [labels, setLabels] = useState<readonly ShownLabel[]>([]);
  const [showBasis, setShowBasis] = useState(false);
  const exitPressure = useRef(0);
  const exit = useRef(onExit);
  exit.current = onExit;
  const level = levelAt(viewMetres, levels);

  const zoomBy = useCallback((factor: number) => {
    target.current = null;
    const next = Math.max(narrowest, Math.min(widest, view.current * factor));
    if (next === view.current && factor > 1) {
      // Zooming out past the block of skin goes back to the mouse.
      exitPressure.current += 1;
      if (exitPressure.current >= 2) exit.current();
      return;
    }
    exitPressure.current = 0;
    view.current = next;
    dirty.current = true;
    setViewMetres(next);
  }, []);
  const goTo = useCallback((destination: JourneyLevel) => { target.current = levelHome(destination, levels); dirty.current = true; }, [levels]);

  useEffect(() => { dialog.current?.focus(); }, []);

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      setWebglFailed(true);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.localClippingEnabled = true;
    renderer.setClearColor('#000000', 0);
    renderer.domElement.setAttribute('role', 'img');
    renderer.domElement.setAttribute('aria-label', 'Representative view at the current scale');
    element.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight('#ffffff', '#cfc6be', 1.45));
    const key = new THREE.DirectionalLight('#ffffff', 1.7);
    key.position.set(-0.5, 0.7, 1);
    scene.add(key);
    const camera = new THREE.PerspectiveCamera(FIELD_OF_VIEW, 1, 0.002, 400);
    camera.position.z = 0.5 / Math.tan(THREE.MathUtils.degToRad(FIELD_OF_VIEW) / 2);
    const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.26, -0.42, 0));

    let nucleosome: NucleosomeData | null = null;
    let disposed = false;
    fetch(NUCLEOSOME_URL).then((response) => {
      if (!response.ok) throw new Error('The measured structure could not be loaded.');
      return response.json();
    }).then((value: unknown) => {
      if (disposed) return;
      if (!isNucleosomeData(value)) throw new Error('The measured structure is not valid.');
      nucleosome = value;
      setDataState('ready');
      dirty.current = true;
    }).catch(() => { if (!disposed) setDataState('failed'); });

    // Scenes are built when they come near, and kept.
    const built = new Map<string, JourneyScene>();
    const worldCuts = new Map<THREE.Plane, THREE.Plane>();
    const baseOpacity = new Map<THREE.Material, number>();
    const materialsOf = (item: JourneyScene) => {
      const out: THREE.Material[] = [];
      item.group.traverse((object) => { if (object instanceof THREE.Mesh || object instanceof THREE.Points) out.push(...[object.material].flat()); });
      return out;
    };
    const ensure = (entry: JourneyLevel): JourneyScene | null => {
      const existing = built.get(entry.id);
      if (existing) return existing;
      const tissueScene = TISSUE_BUILDERS[entry.id];
      const made = tissueScene ? tissueScene() : JOURNEY_BUILDERS[entry.id]?.(nucleosome) ?? null;
      if (!made) return null;
      if (made.cut) {
        const world = new THREE.Plane();
        worldCuts.set(made.cut, world);
        for (const item of materialsOf(made)) if (item.clippingPlanes?.length) item.clippingPlanes = [world];
      }
      for (const item of materialsOf(made)) baseOpacity.set(item, item.opacity);
      made.group.visible = false;
      scene.add(made.group);
      built.set(entry.id, made);
      return made;
    };

    const resize = () => {
      const width = element.clientWidth || 800, height = element.clientHeight || 600;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      dirty.current = true;
      setStageHeight(height);
    };
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null;
    observer?.observe(element);
    resize();

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      zoomBy(10 ** (event.deltaY * WHEEL_RATE * (event.deltaMode === 1 ? 30 : 1)));
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    let dragging: { x: number; y: number } | null = null;
    const onDown = (event: PointerEvent) => { dragging = { x: event.clientX, y: event.clientY }; element.setPointerCapture?.(event.pointerId); };
    const onMove = (event: PointerEvent) => {
      if (!dragging) return;
      const yaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (event.clientX - dragging.x) * 0.006);
      const pitch = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), (event.clientY - dragging.y) * 0.006);
      rotation.premultiply(yaw).premultiply(pitch);
      dragging = { x: event.clientX, y: event.clientY };
      dirty.current = true;
    };
    const onUp = () => { dragging = null; };
    element.addEventListener('pointerdown', onDown);
    element.addEventListener('pointermove', onMove);
    element.addEventListener('pointerup', onUp);

    const anchor = new THREE.Vector3();
    let frame = 0, last = 0;
    const loop = (time: number) => {
      frame = requestAnimationFrame(loop);
      if (target.current !== null) {
        // Moving to a chosen level takes about a second, whatever the distance in orders of magnitude.
        const step = Math.min(0.2, (time - last) / 1000);
        const here = Math.log10(view.current), there = Math.log10(target.current);
        const gap = there - here;
        const move = Math.sign(gap) * Math.min(Math.abs(gap), Math.max(0.6, Math.abs(gap) * 2.4) * step);
        view.current = 10 ** (here + move);
        if (Math.abs(there - Math.log10(view.current)) < 0.002) { view.current = target.current; target.current = null; }
        dirty.current = true;
        setViewMetres(view.current);
      }
      last = time;
      if (!dirty.current || document.hidden) return;
      dirty.current = false;
      const metres = view.current;
      let leading: JourneyScene | null = null, leadingFade = 0;
      for (const entry of levels) {
        const fade = levelFade(entry, metres, levels);
        const item = fade > 0.001 ? ensure(entry) : built.get(entry.id) ?? null;
        if (!item) continue;
        item.group.visible = fade > 0.001;
        if (!item.group.visible) continue;
        const scale = entry.referenceMetres / metres;
        const centre = item.start.clone().lerp(item.focus, levelAim(entry, metres, levels));
        item.group.scale.setScalar(scale);
        item.group.quaternion.copy(rotation);
        item.group.position.copy(centre).applyQuaternion(rotation).multiplyScalar(-scale);
        item.group.updateMatrixWorld(true);
        if (item.cut) worldCuts.get(item.cut)?.copy(item.cut).applyMatrix4(item.group.matrixWorld);
        for (const made of materialsOf(item)) {
          made.opacity = (baseOpacity.get(made) ?? 1) * fade;
          made.depthWrite = fade > 0.55 && (baseOpacity.get(made) ?? 1) >= 1;
        }
        if (fade >= leadingFade) { leading = item; leadingFade = fade; }
      }
      renderer.render(scene, camera);
      const width = element.clientWidth, height = element.clientHeight;
      const shown: ShownLabel[] = [];
      if (leading && leadingFade > 0.7) for (const label of leading.labels) {
        anchor.copy(label.at).applyMatrix4(leading.group.matrixWorld).project(camera);
        const x = (anchor.x + 1) / 2 * width, y = (1 - anchor.y) / 2 * height;
        if (anchor.z < 1 && x > 40 && x < width - 40 && y > 36 && y < height - 8) shown.push({ text: label.text, x: Math.round(x), y: Math.round(y) });
      }
      const placed = separateLabels(shown);
      setLabels((previous) => (previous.length === placed.length && previous.every((item, i) => item.text === placed[i].text && Math.abs(item.x - placed[i].x) < 2 && Math.abs(item.y - placed[i].y) < 2) ? previous : placed));
    };
    frame = requestAnimationFrame(loop);
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer?.disconnect();
      element.removeEventListener('wheel', onWheel);
      element.removeEventListener('pointerdown', onDown);
      element.removeEventListener('pointermove', onMove);
      element.removeEventListener('pointerup', onUp);
      for (const item of built.values()) { scene.remove(item.group); disposeScene(item); }
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [zoomBy]);

  useEffect(() => { dirty.current = true; }, [dataState]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') exit.current();
      else if (event.key === '+' || event.key === '=') zoomBy(0.7);
      else if (event.key === '-') zoomBy(1 / 0.7);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [zoomBy]);

  const bar = scaleBarLength(viewMetres);
  const index = levels.indexOf(level);
  const needsData = level.id === 'nucleosome' || level.id === 'dna';
  return createPortal(<div className="scale-journey" ref={dialog} role="dialog" aria-modal="true" aria-label={`Zoom from ${from ?? 'skin'} to the smallest known structure`} tabIndex={-1} data-view-metres={viewMetres}>
    <header className="scale-journey-head">
      <div className="scale-journey-title">
        <h2>{level.name}</h2>
        <span className={`scale-journey-chip evidence-${level.evidence}`}>{EVIDENCE_LABEL[level.evidence]}</span>
      </div>
      <p className="scale-journey-notice">{from ? `Zooming into: ${from}. A representative example of this tissue, not this part of this mouse. ` : ''}{JOURNEY_NOTICE}</p>
    </header>
    <div className="scale-journey-stage">
      <div className="scale-journey-canvas" ref={host} />
      {labels.map((label) => <span key={`${label.text}-${label.x}`} className="scale-journey-label" style={{ left: label.x, top: label.y }}>{label.text}</span>)}
      <div className="scale-journey-scale">
        <span className="scale-journey-bar" style={{ width: stageHeight * bar / viewMetres }} />
        <strong>{formatLength(bar)}</strong>
        <small>Height of view {formatLength(viewMetres)}, about {formatMagnification(magnification(viewMetres))} life size</small>
      </div>
      <p className="scale-journey-hint">Scroll to zoom. Drag to turn.</p>
    </div>
    <footer className="scale-journey-foot">
      <div className="scale-journey-caption">
        <p>{level.caption}</p>
        {needsData && dataState === 'loading' && <p role="status">Loading the measured atoms.</p>}
        {needsData && dataState === 'failed' && <p role="alert">The measured atoms could not be loaded, so this level is empty. Nothing is drawn in their place.</p>}
        {webglFailed && <p role="alert">This browser could not start WebGL, so the views are not shown. The levels and their sources remain here.</p>}
        <button className="scale-journey-link" aria-expanded={showBasis} onClick={() => setShowBasis((open) => !open)}>{showBasis ? 'Hide sources' : 'Sources'}</button>
        {showBasis && <ul>{level.basis.map((item) => <li key={item}>{item}</li>)}</ul>}
      </div>
      <div className="scale-journey-actions">
        <button disabled={index === 0 && viewMetres >= widest} onClick={() => goTo(levels[Math.max(0, index - 1)])}>Out</button>
        <button disabled={index === levels.length - 1} onClick={() => goTo(levels[Math.min(levels.length - 1, index + 1)])}>Deeper</button>
        <button className="scale-journey-exit" onClick={onExit}>Back to the mouse</button>
      </div>
    </footer>
    <nav className="scale-journey-ladder" aria-label="Levels of the zoom">
      {levels.map((entry) => <button key={entry.id} aria-pressed={entry === level} onClick={() => goTo(entry)}><span>{entry.name}</span><small>{formatLength(levelHome(entry, levels))}</small></button>)}
    </nav>
  </div>, document.body);
}
