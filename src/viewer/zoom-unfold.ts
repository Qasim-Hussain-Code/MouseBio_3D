import * as THREE from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { DissectionTierId } from '../domain/dissection';
import { centringAt, columnStops, distanceForView, focusDepth, holeRadius, progressForStop, startAtDepth, stopIndexAt, stopSpacing, unfoldProgress, unfoldRange, viewHeightAt, ZOOM_UNFOLD, type UnfoldRange, type UnfoldStop } from '../domain/zoom-unfold';
import { findInWindow, type WindowShape } from './dissection-window';

/** What lies at the opened spot, for the guide beside the view. */
export interface UnfoldNearby { readonly id: string; readonly depth: number }

export interface ZoomUnfoldOptions {
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  /** Whether the animal is shown whole, so that zooming may open it. */
  readonly allowed: () => boolean;
  /** The outside of the animal as shown now. */
  readonly outerSurfaces: () => THREE.Mesh[];
  /** Everything that is shown or would be shown once the animal is opened. */
  readonly surfaces: () => Iterable<readonly [string, THREE.Mesh]>;
  readonly tierOf: (id: string) => DissectionTierId;
  /** The cut going in from a spot, and how thick the part is along the way. */
  readonly shapeAt: (point: THREE.Vector3, outward: THREE.Vector3, faceNormal: THREE.Vector3, surface: THREE.Mesh) => { shape: WindowShape; thickness: number } | null;
  readonly closest: () => number;
  readonly furthest: () => number;
  readonly onOpen: () => void;
  readonly onClose: () => void;
  /** The zoom has gone as far as this spot goes, and is still going in, by the user's hand or on its own. */
  readonly onThrough: (x: number, y: number, playing: boolean) => void;
}

export interface ZoomUnfold {
  readonly shape: () => WindowShape | null;
  readonly open: () => boolean;
  readonly progress: () => number;
  readonly stops: () => readonly UnfoldStop[];
  readonly nearby: () => readonly UnfoldNearby[];
  readonly currentStop: () => number;
  /** The structure of the outside on which this place was opened. */
  readonly surfaceId: () => string | null;
  /** Radius of the opening of a structure now, or 0 if it is not cut. */
  radiusOf(id: string): number;
  /** The radius anything is drawn from the camera, or 0 when closed. */
  nearCut(): number;
  /** No part of the opened outer layer can be in view. */
  skinOutOfView(): boolean;
  /** A step of the wheel, at a point of the view given from -1 to 1. */
  wheel(deltaY: number, x: number, y: number): void;
  /** Move to a stop of the column. */
  goToStop(id: string): void;
  /** Keep zooming in or out on its own, at an even pace, until the place is fully open or closed. */
  play(direction: 'in' | 'out' | null): void;
  readonly playing: () => 'in' | 'out' | null;
  /** Open at a spot that has been clicked, keeping the present view. */
  openAt(point: THREE.Vector3, faceNormal: THREE.Vector3, surface: THREE.Mesh): void;
  /** Stop any motion that was asked for, because the camera has been moved in another way. */
  cancelMotion(): void;
  /** Close at once, leaving the camera where it is. */
  forget(): void;
  /** Advance by a time step. True if anything in the view has changed. */
  update(delta: number): boolean;
}

/** How much the wheel changes the distance per unit of its delta, and how much further zooming in at the end goes on to the tissue. */
const WHEEL_RATE = 0.0011, THROUGH_PRESSURE = 50, WHEEL_MOST = 600;
/** Seconds in which a step of the wheel is taken, and in which the whole zoom plays by itself. */
const WHEEL_EASE = 0.09, PLAY_SECONDS = 20;

export function createZoomUnfold(options: ZoomUnfoldOptions): ZoomUnfold {
  const { camera, controls } = options;
  const ray = new THREE.Raycaster();
  ray.layers.enableAll();
  let place: {
    shape: WindowShape; range: UnfoldRange; stops: UnfoldStop[]; spacing: number; nearby: UnfoldNearby[];
    starts: Map<string, number>; toSpot: THREE.Vector3; moved: THREE.Vector3; progress: number; surfaceId: string | null;
    /** The direction of the view when the place opened and as last set. The view turns to look along the way in, until the user turns it. */
    fromView: THREE.Vector3; lastView: THREE.Vector3; turned: boolean;
  } | null = null;
  let goal: number | null = null, auto: 'in' | 'out' | null = null;
  let pressure = 0, triedAt = Infinity;
  const pointer = new THREE.Vector2();
  /** The point of the animal under the pointer, which stays under it as the view narrows, as on a map. */
  let aim: THREE.Vector3 | null = null;
  /** Where Play goes first if the view is not on the animal when it is pressed. */
  let comeTo: THREE.Vector3 | null = null;

  const distance = () => camera.position.distanceTo(controls.target);
  const fov = () => camera.fov;
  const moveCamera = (by: THREE.Vector3) => { camera.position.add(by); controls.target.add(by); };

  /** The outer surface under a point of the view. */
  const outerUnder = (x: number, y: number) => {
    ray.setFromCamera(new THREE.Vector2(x, y), camera);
    return ray.intersectObjects(options.outerSurfaces(), false)[0] ?? null;
  };

  const openHere = (point: THREE.Vector3, faceNormal: THREE.Vector3, surface: THREE.Mesh, keepView: boolean): boolean => {
    const toCamera = camera.position.clone().sub(point).normalize();
    if (faceNormal.dot(toCamera) < 0) faceNormal = faceNormal.clone().negate();
    // Mostly straight in from the surface. The view turns to look along this line as the zoom goes on.
    const outward = faceNormal.clone().multiplyScalar(0.65).addScaledVector(toCamera, 0.35).normalize();
    const cut = options.shapeAt(point, outward, faceNormal, surface);
    if (!cut) return false;
    const { shape, thickness } = cut;
    const range = unfoldRange(thickness);
    const view = viewHeightAt(distance(), fov());
    if (!keepView && view > range.openAt) return false;
    // The stops are what lies on the straight line going in from the spot.
    const shown = [...options.surfaces()];
    const meshes = shown.map(([, mesh]) => mesh);
    const idOf = new Map(shown.map(([id, mesh]) => [mesh, id]));
    ray.set(point.clone().addScaledVector(shape.normal, Math.max(shape.front, 0.001)), shape.normal.clone().negate());
    const surfaceAt = Math.max(shape.front, 0.001);
    const hits = ray.intersectObjects(meshes, false).map((hit) => {
      const id = idOf.get(hit.object as THREE.Mesh)!;
      return { id, tier: options.tierOf(id), depth: hit.distance - surfaceAt };
    });
    const stops = columnStops(hits, shape.depth);
    if (!stops.length) return false;
    const spacing = stopSpacing(stops);
    // Everything else opens when the column reaches its depth, so that nothing stands in the way of what lies beyond it.
    const starts = new Map<string, number>();
    const reach = Math.max(range.openAt * 0.62, 0.002);
    for (const found of findInWindow(shape, reach, shown)) {
      if (options.tierOf(found.id) === 'vessels-nerves') continue;
      starts.set(found.id, startAtDepth(found.depth, stops));
    }
    for (const stop of stops) starts.set(stop.id, stop.start);
    const closeBy = Math.max(0.0012, thickness * 0.14);
    const nearby = findInWindow(shape, closeBy, shown.filter(([id]) => options.tierOf(id) === 'vessels-nerves'))
      .map((found) => ({ id: found.id, depth: found.depth })).filter((found) => found.depth >= -0.0005).sort((left, right) => left.depth - right.depth);
    const fromView = camera.position.clone().sub(controls.target).normalize();
    place = { shape, range, stops, spacing, nearby, starts, toSpot: shape.a.clone().sub(controls.target), moved: new THREE.Vector3(), progress: unfoldProgress(view, range), surfaceId: idOf.get(surface) ?? null, fromView, lastView: fromView.clone(), turned: false };
    pressure = 0;
    options.onOpen();
    return true;
  };

  const closeNow = () => { place = null; pressure = 0; options.onClose(); };

  const self: ZoomUnfold = {
    shape: () => place?.shape ?? null,
    open: () => !!place,
    progress: () => place?.progress ?? 0,
    stops: () => place?.stops ?? [],
    nearby: () => place?.nearby ?? [],
    currentStop: () => place ? stopIndexAt(place.progress, place.stops) : -1,
    surfaceId: () => place?.surfaceId ?? null,
    radiusOf(id) {
      if (!place) return 0;
      const start = place.starts.get(id);
      return start === undefined ? 0 : holeRadius(start, place.progress, place.spacing, place.range);
    },
    nearCut: () => place ? ZOOM_UNFOLD.nearShare * distance() : 0,
    skinOutOfView() {
      if (!place) return false;
      const { shape, stops } = place;
      const height = camera.position.clone().sub(shape.a).dot(shape.normal);
      if (height <= 0) return true;
      const outermost = stops[0]?.id;
      const open = outermost ? self.radiusOf(outermost) : 0;
      const halfHeight = height * Math.tan(fov() * Math.PI / 360);
      const axis = controls.target.clone().sub(camera.position).normalize();
      const down = axis.dot(shape.normal);
      // Where the middle of the view meets the plane of the spot.
      const middle = down < -0.05 ? camera.position.clone().addScaledVector(axis, height / -down) : shape.a;
      return middle.distanceTo(shape.a) + halfHeight * Math.hypot(1, camera.aspect) * 1.2 < open * 0.9;
    },
    wheel(deltaY, x, y) {
      auto = null; comeTo = null;
      pointer.set(x, y);
      if (!place) aim = outerUnder(x, y)?.point.clone() ?? null;
      const step = Math.max(-WHEEL_MOST, Math.min(WHEEL_MOST, deltaY));
      if (place && step < 0 && place.progress >= 0.995) {
        pressure += -step;
        if (pressure >= THROUGH_PRESSURE) { pressure = 0; options.onThrough(x, y, false); }
        return;
      }
      pressure = 0;
      const lowest = place ? distanceForView(place.range.fullAt, fov()) : options.closest();
      goal = Math.max(lowest, Math.min(options.furthest(), (goal ?? distance()) * Math.exp(step * WHEEL_RATE)));
    },
    goToStop(id) {
      if (!place) return;
      const stop = place.stops.find((item) => item.id === id);
      if (!stop) return;
      auto = null;
      const view = place.range.openAt * (place.range.fullAt / place.range.openAt) ** progressForStop(stop, place.stops);
      goal = distanceForView(view, fov());
    },
    play(direction) {
      auto = direction; goal = null; comeTo = null; pointer.set(0, 0);
      if (!place) aim = outerUnder(0, 0)?.point.clone() ?? null;
      if (!place && !aim && direction === 'in') {
        const whole = new THREE.Box3();
        for (const mesh of options.outerSurfaces()) whole.expandByObject(mesh);
        if (!whole.isEmpty()) comeTo = whole.getCenter(new THREE.Vector3());
      }
    },
    playing: () => auto,
    openAt(point, faceNormal, surface) {
      openHere(point, faceNormal, surface, true);
    },
    cancelMotion() { goal = null; auto = null; comeTo = null; },
    forget() {
      goal = null; auto = null; comeTo = null;
      if (place) closeNow();
    },
    update(delta) {
      let changed = false;
      if (place && !options.allowed()) { self.forget(); return true; }
      if (comeTo) {
        // Sideways to the animal, without zooming, so that it is in the middle of the view before the view narrows.
        const axis = controls.target.clone().sub(camera.position).normalize();
        const sideways = comeTo.clone().sub(controls.target);
        sideways.addScaledVector(axis, -sideways.dot(axis));
        moveCamera(sideways.clampLength(0, distance() * 2 * Math.min(delta, 0.25)));
        controls.update();
        aim = outerUnder(0, 0)?.point.clone() ?? null;
        if (aim || sideways.lengthSq() < 1e-10) comeTo = null;
        return true;
      }
      if (auto) {
        const range = place?.range ?? { openAt: ZOOM_UNFOLD.widestOpen, fullAt: ZOOM_UNFOLD.widestFull };
        const rate = Math.log(range.openAt / range.fullAt) / PLAY_SECONDS;
        const next = distance() * Math.exp((auto === 'in' ? -rate : rate) * Math.min(delta, 0.25));
        const lowest = place ? distanceForView(place.range.fullAt, fov()) : options.closest();
        goal = Math.max(lowest, Math.min(options.furthest(), next));
        if (auto === 'out' && !place && viewHeightAt(goal, fov()) > ZOOM_UNFOLD.widestOpen * 1.5) auto = null;
      }
      if (goal !== null) {
        const now = distance();
        const eased = auto ? goal : Math.exp(Math.log(now) + (Math.log(goal) - Math.log(now)) * (1 - Math.exp(-delta / WHEEL_EASE)));
        const next = Math.abs(goal / eased - 1) < 0.0015 ? goal : eased;
        const ratio = next / now;
        if (place) {
          camera.position.sub(controls.target).multiplyScalar(ratio).add(controls.target);
        } else {
          // Before a place has opened the zoom goes to the point under the pointer, as on a map. Off the animal it goes to that point at the depth of the centre of the view.
          let about = aim;
          if (!about) {
            ray.setFromCamera(pointer, camera);
            const axis = controls.target.clone().sub(camera.position).normalize();
            about = camera.position.clone().addScaledVector(ray.ray.direction, now / Math.max(ray.ray.direction.dot(axis), 0.1));
          }
          camera.position.sub(about).multiplyScalar(ratio).add(about);
          controls.target.sub(about).multiplyScalar(ratio).add(about);
        }
        if (next === goal) goal = null;
        changed = true;
      }
      const view = viewHeightAt(distance(), fov());
      if (!place && options.allowed() && view < ZOOM_UNFOLD.widestOpen && view !== triedAt) {
        triedAt = view;
        const hit = outerUnder(pointer.x, pointer.y) ?? outerUnder(0, 0);
        if (hit?.face && hit.object instanceof THREE.Mesh) {
          const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
          if (openHere(hit.point, normal, hit.object, false)) changed = true;
        }
      }
      // Nothing more can open at this spot and the zoom is as close as it goes: playing ends here and does not seem to go on for ever.
      if (!place && auto === 'in' && goal === null && distance() <= options.closest() * 1.001) auto = null;
      if (place) {
        const progress = unfoldProgress(view, place.range);
        const wanted = place.toSpot.clone().multiplyScalar(centringAt(progress)).addScaledVector(place.shape.normal, -focusDepth(progress, place.stops));
        // A place opened by a click is reached in a moment; what a step of the zoom asks for is well inside this limit.
        const move = wanted.clone().sub(place.moved).clampLength(0, distance() * 3 * Math.min(delta, 0.1));
        if (move.lengthSq() > 1e-16) { moveCamera(move); place.moved.add(move); changed = true; }
        // The view turns to look along the way in, so that it sees down the opening, and back again on the way out. Once the user has turned the view it is left alone.
        const offset = camera.position.clone().sub(controls.target), reach = offset.length();
        const facing = offset.clone().divideScalar(reach);
        if (!place.turned && facing.angleTo(place.lastView) > 0.012) place.turned = true;
        if (!place.turned) {
          const wantedView = place.fromView.clone().lerp(place.shape.normal, 0.92 * centringAt(progress)).normalize();
          const apart = facing.angleTo(wantedView), most = 1.6 * Math.min(delta, 0.1);
          if (apart > 1e-4) {
            facing.lerp(wantedView, Math.min(1, most / apart)).normalize();
            camera.position.copy(controls.target).addScaledVector(facing, reach);
            changed = true;
          }
          place.lastView.copy(facing);
        }
        if (progress !== place.progress) { place.progress = progress; changed = true; }
        if (view > place.range.openAt * 1.04) { closeNow(); changed = true; }
        // Playing does not stop at the last layer: it goes on down in the same way as the wheel.
        else if (auto === 'in' && progress >= 0.995) { auto = null; goal = null; options.onThrough(0, 0, true); }
      }
      if (changed) {
        controls.update();
        if (place && !place.turned) place.lastView.copy(camera.position).sub(controls.target).normalize();
      }
      return changed;
    },
  };
  return self;
}
