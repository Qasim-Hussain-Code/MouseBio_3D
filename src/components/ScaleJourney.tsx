import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  EVIDENCE_LABEL, EVIDENCE_SHORT, formatLength, JOURNEY_NOTICE, JOURNEY_PLAY, journeyLevels, levelAim, levelAt, levelFade, levelHome, ownWayOf, playStep, scaleBarLength,
  type JourneyLevel, type JourneyTail, type JourneyTissue,
} from '../domain/scale-journey';
import { disposeScene, isNucleosomeData, JOURNEY_BUILDERS, type JourneyScene, type NucleosomeData } from '../viewer/scale-journey-scenes';
import { TISSUE_BUILDERS } from '../viewer/tissue-scenes';
import { MORE_TISSUE_BUILDERS } from '../viewer/more-tissue-scenes';
import { DEEP_BUILDERS, HEMOGLOBIN_BUILDERS, isHemoglobinData, type HemoglobinData } from '../viewer/deep-scenes';
import { buildMoleculeAtoms, buildMoleculeWhole, isMoleculeData, type MoleculeData } from '../viewer/molecule-scenes';
import { ORGANELLE_BUILDERS, withWays } from '../viewer/organelle-scenes';
import { lifeAt, rateLabel, type LifeSettings } from '../domain/living-simulation';

const NUCLEOSOME_URL = '/scale-journey/nucleosome-5b1m.json';
const HEMOGLOBIN_URL = '/scale-journey/hemoglobin-3hrw.json';
const moleculeUrl = (key: string) => `/scale-journey/molecule-${key}.json`;
const FIELD_OF_VIEW = 30;

/** One step of the wheel changes the view by this factor per unit of wheel delta. */
const WHEEL_RATE = 0.0016;

type DataState = 'loading' | 'ready' | 'failed';
interface ShownLabel { readonly text: string; readonly x: number; readonly y: number; readonly way?: JourneyTail }

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
export default function ScaleJourney({ onExit, tissue = 'skin', from, place, life, autoplay = false }: { readonly onExit: () => void; readonly tissue?: JourneyTissue; readonly from?: string; readonly place?: string; readonly life?: LifeSettings; readonly autoplay?: boolean }) {
  const [playing, setPlaying] = useState<'in' | 'out' | null>(autoplay ? 'in' : null);
  const playingRef = useRef(playing);
  playingRef.current = playing;
  const lifeRef = useRef(life);
  lifeRef.current = life;
  const [moving, setMoving] = useState(false);
  // Playing from a tissue goes on to the molecule that belongs to it. Otherwise the way is the one the pointer chooses.
  const [tail, setTail] = useState<JourneyTail>(autoplay ? ownWayOf(tissue) : 'nucleus');
  const levels = useMemo(() => journeyLevels(tissue, tail), [tissue, tail]);
  const levelsRef = useRef(levels), tailRef = useRef(tail);
  levelsRef.current = levels; tailRef.current = tail;
  const dialog = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLDivElement>(null);
  // The zoom arrives from the mouse at the view it was at, so the level starts at its widest.
  const view = useRef(levels[0].startMetres);
  /** The point under the pointer, in view heights from the middle, and how far the user has moved off the way on, in metres. */
  const pointer = useRef({ x: 0, y: 0 }), pan = useRef({ x: 0, y: 0 });
  const target = useRef<number | null>(null);
  const dirty = useRef(true);
  const [viewMetres, setViewMetres] = useState(view.current);
  const [speed, setSpeed] = useState(1);
  const speedRef = useRef(speed);
  speedRef.current = speed;
  const [stageHeight, setStageHeight] = useState(0);
  const [webglFailed, setWebglFailed] = useState(false);
  const [dataState, setDataState] = useState<DataState>('loading');
  const [labels, setLabels] = useState<readonly ShownLabel[]>([]);
  const [showBasis, setShowBasis] = useState(false);
  /** The ways on from the level in view, listed so that one can be chosen even when its place is out of view. */
  const [ways, setWays] = useState<readonly { readonly tail: JourneyTail; readonly text: string }[]>([]);
  const exit = useRef(onExit);
  exit.current = onExit;
  const level = levelAt(viewMetres, levels);

  const zoomBy = useCallback((factor: number) => {
    target.current = null;
    const route = levelsRef.current;
    const next = Math.max(route[route.length - 1].endMetres, Math.min(route[0].startMetres, view.current * factor));
    if (next === view.current && factor > 1) {
      // Zooming out past the first level goes back to the mouse.
      exit.current();
      return;
    }
    // The point under the pointer stays there as the view narrows, as on a map.
    const moved = view.current - next;
    const reach = levelAt(next, route).referenceMetres * 0.8;
    pan.current.x = Math.max(-reach, Math.min(reach, pan.current.x + pointer.current.x * moved));
    pan.current.y = Math.max(-reach, Math.min(reach, pan.current.y + pointer.current.y * moved));
    view.current = next;
    dirty.current = true;
    setViewMetres(next);
  }, []);
  const goTo = useCallback((destination: JourneyLevel) => { pan.current = { x: 0, y: 0 }; target.current = levelHome(destination, levelsRef.current); dirty.current = true; }, []);
  const togglePlay = () => {
    if (playing) { setPlaying(null); return; }
    target.current = null;
    // A way not yet chosen becomes the tissue's own, as long as that way still passes through the level in view.
    const own = ownWayOf(tissue);
    if (tailRef.current === 'nucleus' && own !== 'nucleus' && journeyLevels(tissue, own).some((entry) => entry.id === levelAt(view.current, levelsRef.current).id)) { tailRef.current = own; setTail(own); }
    // From the very bottom it plays back up. From anywhere else it plays on down.
    setPlaying(view.current <= levelsRef.current[levelsRef.current.length - 1].endMetres * 1.01 ? 'out' : 'in');
  };

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

    let nucleosome: NucleosomeData | null = null, hemoglobin: HemoglobinData | null = null, hemoglobinAsked = false;
    let disposed = false;
    const molecules = new Map<string, MoleculeData>(), moleculesAsked = new Set<string>();
    const askForMolecule = (key: string) => {
      if (moleculesAsked.has(key)) return;
      moleculesAsked.add(key);
      fetch(moleculeUrl(key)).then((response) => {
        if (!response.ok) throw new Error('The measured structure could not be loaded.');
        return response.json();
      }).then((value: unknown) => {
        if (disposed) return;
        if (!isMoleculeData(value, key)) throw new Error('The measured structure is not valid.');
        molecules.set(key, value);
        setDataState('ready');
        dirty.current = true;
      }).catch(() => { if (!disposed) setDataState('failed'); });
    };
    const askForHemoglobin = () => {
      if (hemoglobinAsked) return;
      hemoglobinAsked = true;
      setDataState('loading');
      fetch(HEMOGLOBIN_URL).then((response) => {
        if (!response.ok) throw new Error('The measured structure could not be loaded.');
        return response.json();
      }).then((value: unknown) => {
        if (disposed) return;
        if (!isHemoglobinData(value)) throw new Error('The measured structure is not valid.');
        hemoglobin = value;
        setDataState('ready');
        dirty.current = true;
      }).catch(() => { if (!disposed) setDataState('failed'); });
    };
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
      const tissueScene = TISSUE_BUILDERS[entry.id] ?? MORE_TISSUE_BUILDERS[entry.id] ?? DEEP_BUILDERS[entry.id] ?? ORGANELLE_BUILDERS[entry.id];
      if (HEMOGLOBIN_BUILDERS[entry.id] && !hemoglobin) askForHemoglobin();
      const atoms = entry.molecule ? molecules.get(entry.molecule) : undefined;
      const drawn = entry.molecule ? (atoms ? (entry.moleculeView === 'atoms' ? buildMoleculeAtoms(atoms) : buildMoleculeWhole(atoms, entry.referenceMetres * 1e10)) : null) : tissueScene ? tissueScene() : HEMOGLOBIN_BUILDERS[entry.id] ? (hemoglobin ? HEMOGLOBIN_BUILDERS[entry.id](hemoglobin) : null) : JOURNEY_BUILDERS[entry.id]?.(nucleosome) ?? null;
      if (!drawn) return null;
      const made = withWays(entry.id, drawn);
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

    const notePointer = (event: { clientX: number; clientY: number }) => {
      const box = element.getBoundingClientRect();
      if (box.height > 0) pointer.current = { x: (event.clientX - box.left - box.width / 2) / box.height, y: -(event.clientY - box.top - box.height / 2) / box.height };
    };
    const place3 = new THREE.Vector3();
    /** At a level with more than one way on, the one nearest the pointer is taken. */
    const chooseWay = () => {
      const entry = levelAt(view.current, levelsRef.current), item = built.get(entry.id);
      if (!item?.branches?.length) return;
      const options: { tail: JourneyTail; at: THREE.Vector3 }[] = [{ tail: item.homeTail ?? 'nucleus', at: item.focus }, ...item.branches];
      let best = options[0], closest = Infinity;
      for (const option of options) {
        place3.copy(option.at).applyMatrix4(item.group.matrixWorld).project(camera);
        const away = Math.hypot(place3.x * camera.aspect / 2 - pointer.current.x, place3.y / 2 - pointer.current.y);
        if (away < closest) { closest = away; best = option; }
      }
      if (best.tail !== tailRef.current) { tailRef.current = best.tail; setTail(best.tail); dirty.current = true; }
    };
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      notePointer(event);
      if (playingRef.current) { playingRef.current = null; setPlaying(null); }
      if (event.deltaY < 0) chooseWay();
      zoomBy(10 ** (event.deltaY * WHEEL_RATE * (event.deltaMode === 1 ? 30 : 1)));
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    let dragging: { x: number; y: number; moving: boolean } | null = null;
    const onDown = (event: PointerEvent) => { dragging = { x: event.clientX, y: event.clientY, moving: event.shiftKey || event.button === 2 }; element.setPointerCapture?.(event.pointerId); };
    const onMove = (event: PointerEvent) => {
      notePointer(event);
      if (!dragging) return;
      if (dragging.moving) {
        // Dragging with shift or the right button moves the view across this level.
        const box = Math.max(element.clientHeight, 1);
        pan.current.x -= (event.clientX - dragging.x) / box * view.current;
        pan.current.y += (event.clientY - dragging.y) / box * view.current;
        dragging = { ...dragging, x: event.clientX, y: event.clientY };
        dirty.current = true;
        return;
      }
      const yaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (event.clientX - dragging.x) * 0.006);
      const pitch = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), (event.clientY - dragging.y) * 0.006);
      rotation.premultiply(yaw).premultiply(pitch);
      dragging = { ...dragging, x: event.clientX, y: event.clientY };
      dirty.current = true;
    };
    const onUp = () => { dragging = null; };
    const onMenu = (event: Event) => event.preventDefault();
    element.addEventListener('contextmenu', onMenu);
    element.addEventListener('pointerdown', onDown);
    element.addEventListener('pointermove', onMove);
    element.addEventListener('pointerup', onUp);

    const anchor = new THREE.Vector3();
    let frame = 0, last = 0, motionWaited = 0, animalSeconds = 0, shownSeconds = 0, motionClock = 0, lastLevel: JourneyLevel | null = null;
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
      const passed = Math.min(0.2, (time - last) / 1000);
      if (playingRef.current && target.current === null && !document.hidden) {
        // Playing goes on at an even pace down to the last level, or back up to the first.
        const step = playStep(view.current, playingRef.current, passed, levelsRef.current, speedRef.current);
        if (step.ended) { playingRef.current = null; setPlaying(null); }
        view.current = step.view;
        dirty.current = true;
        setViewMetres(step.view);
      }
      last = time;
      // Levels with an illustrative motion move on their own, at most about thirty times a second, and only while they are in view.
      const lifeNow = lifeRef.current;
      const inMotion = lifeNow?.on && lifeNow.playing && !document.hidden ? [...built.values()].filter((item) => item.animate && item.group.visible) : [];
      motionWaited += passed;
      if (inMotion.length && motionWaited >= 1 / 30) {
        animalSeconds += motionWaited * lifeNow!.rate; shownSeconds += motionWaited; motionClock += motionWaited * lifeNow!.rate / 0.1; motionWaited = 0;
        const now = lifeAt(animalSeconds, shownSeconds, lifeNow!);
        for (const item of inMotion) item.animate!({ seconds: motionClock, beats: now.beats, ventricles: now.ventricles, breath: now.breath });
        dirty.current = true;
      }
      if (!dirty.current || document.hidden) return;
      dirty.current = false;
      const metres = view.current;
      let leading: JourneyScene | null = null, leadingFade = 0;
      const levels = levelsRef.current;
      const here = levelAt(metres, levels);
      if (here !== lastLevel) { lastLevel = here; pan.current = { x: 0, y: 0 }; }
      // The atoms of a way are fetched as soon as the way is taken, so that they are there when the zoom arrives.
      for (const entry of levels) if (entry.molecule) askForMolecule(entry.molecule);
      for (const [id, item] of built) if (!levels.some((entry) => entry.id === id)) item.group.visible = false;
      for (const entry of levels) {
        const fade = levelFade(entry, metres, levels);
        const item = fade > 0.001 ? ensure(entry) : built.get(entry.id) ?? null;
        if (!item) continue;
        item.group.visible = fade > 0.001;
        if (!item.group.visible) continue;
        const scale = entry.referenceMetres / metres;
        const aim = levelAim(entry, metres, levels);
        const centre = item.start.clone().lerp(item.branches?.find((branch) => branch.tail === tailRef.current)?.at ?? item.focus, aim);
        item.group.scale.setScalar(scale);
        item.group.quaternion.copy(rotation);
        item.group.position.copy(centre).applyQuaternion(rotation).multiplyScalar(-scale);
        // Off the way on while the level is being looked at, and back on it by the time the next one comes.
        if (entry === here) { item.group.position.x -= pan.current.x / metres * (1 - aim); item.group.position.y -= pan.current.y / metres * (1 - aim); }
        item.group.updateMatrixWorld(true);
        if (item.cut) worldCuts.get(item.cut)?.copy(item.cut).applyMatrix4(item.group.matrixWorld);
        for (const made of materialsOf(item)) {
          made.opacity = (baseOpacity.get(made) ?? 1) * fade;
          made.depthWrite = fade > 0.55 && (baseOpacity.get(made) ?? 1) >= 1;
        }
        if (fade >= leadingFade) { leading = item; leadingFade = fade; }
      }
      renderer.render(scene, camera);
      setMoving(!!(leading as JourneyScene | null)?.animate && !!lifeRef.current?.on);
      const shownScene = leading as JourneyScene | null, shownWays = shownScene?.branches?.length ? [{ tail: shownScene.homeTail ?? 'nucleus', text: shownScene.homeTail ? 'Its DNA' : here.id.endsWith('-block') ? 'Its cells' : 'A cell nucleus' }, ...shownScene.branches.map((branch) => ({ tail: branch.tail, text: branch.text }))] : [];
      setWays((previous) => (previous.length === shownWays.length && previous.every((item, i) => item.tail === shownWays[i].tail) ? previous : shownWays));
      const width = element.clientWidth, height = element.clientHeight;
      const shown: ShownLabel[] = [];
      if (leading && leadingFade > 0.7) {
        const scene: JourneyScene = leading;
        const ways = (scene.branches ?? []).map((branch) => ({ text: branch.text, at: branch.at, way: branch.tail as JourneyTail | undefined }));
        for (const label of [...ways, ...scene.labels.map((item) => ({ text: item.text, at: item.at, way: undefined as JourneyTail | undefined }))]) {
          anchor.copy(label.at).applyMatrix4(scene.group.matrixWorld).project(camera);
          const x = (anchor.x + 1) / 2 * width, y = (1 - anchor.y) / 2 * height;
          // A label that would lie under the list of levels is left out, since the list would cover it.
          const panel = element.closest('.scale-journey')?.querySelector('.scale-journey-ladder')?.getBoundingClientRect(), box = element.getBoundingClientRect();
          const covered = !!panel && x + box.left < panel.right + 60 && y + box.top < panel.bottom + 12;
          if (anchor.z < 1 && x > 40 && x < width - 40 && y > 36 && y < height - 8 && !covered) shown.push({ text: label.text, x: Math.round(x), y: Math.round(y), way: label.way });
        }
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
      element.removeEventListener('contextmenu', onMenu);
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
  const needsData = !!level.molecule || ['nucleosome', 'dna', 'hemoglobin', 'heme'].includes(level.id);
  return <div className="scale-journey" ref={dialog} role="region" aria-label={`Zoom from ${from ?? 'skin'} to the smallest known structure`} tabIndex={-1} data-view-metres={viewMetres}>
    <div className="scale-journey-stage">
      <div className="scale-journey-canvas" ref={host} />
      {labels.map((label) => label.way
        ? <button type="button" key={`${label.text}-${label.x}`} className={`scale-journey-label is-way ${label.way === tail ? 'is-chosen' : ''}`} style={{ left: label.x, top: label.y }} onClick={() => setTail(label.way!)}>{label.text}</button>
        : <span key={`${label.text}-${label.x}`} className="scale-journey-label" style={{ left: label.x, top: label.y }}>{label.text}</span>)}
      <div className="scale-journey-scale">
        <span className="scale-journey-bar" style={{ width: stageHeight * bar / viewMetres }} />
        <strong>{formatLength(bar)}</strong>
      </div>
    </div>
    <header className="scale-journey-head">
      <div className="scale-journey-title">
        <h2>{level.name}</h2>
        <span className={`scale-journey-chip evidence-${level.evidence}`} title={EVIDENCE_LABEL[level.evidence]}>{EVIDENCE_SHORT[level.evidence]}</span>
      </div>
    </header>
    <footer className="scale-journey-foot">
      {needsData && dataState === 'loading' && <p role="status">Loading the measured atoms.</p>}
      {needsData && dataState === 'failed' && <p role="alert">The measured atoms could not be loaded, so this level is empty. Nothing is drawn in their place.</p>}
      {webglFailed && <p role="alert">This browser could not start WebGL, so the views are not shown. The levels and their sources remain here.</p>}
      <div className="scale-journey-about" hidden={!showBasis}>
        <p>{level.caption}</p>
        <p>{EVIDENCE_LABEL[level.evidence]}. {from ? `Zooming into: ${from}. A representative example of this tissue, not this part of this mouse. ` : ''}{JOURNEY_NOTICE}{moving && life ? ` The motion here is illustrative, at ${rateLabel(life.rate)} where it follows the heart or breathing, and its sizes are chosen for viewing.` : ''}</p>
        {showBasis && <ul>{level.basis.map((item) => <li key={item}>{item}</li>)}</ul>}
      </div>
      <button className="scale-journey-link" aria-expanded={showBasis} onClick={() => setShowBasis((open) => !open)}>{showBasis ? 'Hide sources' : 'Sources'}</button>
    </footer>
    <nav className="scale-journey-ladder" aria-label="Levels of the zoom">
      <button className="scale-journey-exit" onClick={onExit}>Back to the mouse</button>
      <div className="scale-journey-play-row">
        <button className="scale-journey-play" onClick={togglePlay}>{playing ? 'Pause' : 'Play'}</button>
        <div className="scale-journey-speeds" role="group" aria-label="Speed of playing">{JOURNEY_PLAY.speeds.map((choice) => <button key={choice} aria-pressed={speed === choice} onClick={() => setSpeed(choice)}>{choice === 0.5 ? '½' : choice}×</button>)}</div>
      </div>
      {place && <small className="scale-journey-place">{place}</small>}
      {from && <strong className="scale-journey-from">{from}</strong>}
      {levels.map((entry) => <button key={entry.id} aria-pressed={entry === level} onClick={() => goTo(entry)}><span>{entry.name}</span><small>{formatLength(levelHome(entry, levels))}</small></button>)}
      {ways.length > 0 && <div className="scale-journey-ways" role="group" aria-label="Ways on from this level">{ways.map((way) => <button key={way.tail} className="scale-journey-way" aria-pressed={way.tail === tail} onClick={() => { tailRef.current = way.tail; setTail(way.tail); dirty.current = true; }}>{way.text}</button>)}</div>}
    </nav>
  </div>;
}
