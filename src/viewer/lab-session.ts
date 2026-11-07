import * as THREE from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { BONE_ONLY, canBeGrasped, canBeParted, canBeReflected, channelOfTier, cutReach, cutRefusal, labTool, type LabAction, type LabActionKind, type LabFacts, type LabPose, type LabSide, type LabToolId } from '../domain/dissection-lab';
import { LAB_EXERCISES, type DemoPlace, type DemoStep, type FlapKind, type LabGuide, type LabViewName, type OnStructure } from '../domain/lab-exercises';
import type { CutPoint } from '../domain/cut-field';
import type { DissectionTierId } from '../domain/dissection';
import { createCutVolume, type CutVolume } from './cut-volume';
import { CUT_SHARED, FLAP_HINGES } from './cut-uniforms';
import { createHand } from './lab-hands';
import { createInstrument, disposeInstrument, type Instrument } from './lab-instruments';
import { createLabPick, type LabHit, type LabPickEntry } from './lab-pick';
import { createSkinEdge } from './lab-skin-edge';
import { partFur, type PartedLine } from './fur';
import { createFlapSheet, createSurfaceProbe, flapLook, type FlapSheet } from './lab-flap-sheet';
import { FLAP_SLOTS, LIFE_SHARED } from './life-field';
import { surfaceShadingOf, type SurfaceShadingUniforms } from './surface-shading';

/**
 * A session of practice with the instruments. A pair of gloved hands holds them: the right hand follows the pointer, and the left steadies the tissue with forceps. The session keeps what has been done, shows what
 * the instruments leave behind and asks the drawing what lies under the tip, so that an instrument can only touch what can be seen. A layer that has been cut can be taken by its edge and drawn back as a flap.
 * Everything can be undone step by step, and nothing here changes the model itself. The hands, instruments, bleeding and the way tissue gives are illustrative: they are chosen for practice and model no tissue mechanics or physiology.
 */
export type LabView = LabViewName;

export interface LabReport {
  readonly facts: LabFacts;
  readonly canUndo: boolean;
  /** What has been lifted out and lies in the dish. */
  readonly taken: readonly string[];
  readonly demonstrating: boolean;
  readonly tool: LabToolId;
  readonly pose: LabPose;
}

export interface LabSessionOptions {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  readonly element: HTMLElement;
  readonly meshes: ReadonlyMap<string, THREE.Object3D>;
  readonly tierOf: (id: string) => DissectionTierId;
  readonly skinId: string;
  /** What can be touched now, as drawn, optionally only some structures. */
  readonly entries: (only?: (id: string) => boolean) => LabPickEntry[];
  /** What marks the removed part of the outer surface, so that the inside shows there. */
  readonly marks: () => THREE.Object3D[];
  /** What can be seen as a whole now, how much of it, and a point of it as shares of the view from the top left. */
  readonly seen: () => readonly { readonly id: string; readonly pixels: number; readonly x: number; readonly y: number }[];
  /** Is this structure a blood vessel? */
  readonly isVessel: (id: string) => boolean;
  /** Does blood go round? If not, nothing bleeds. */
  readonly circulating: () => boolean;
  readonly onReport: (report: LabReport) => void;
  readonly onHover: (hover: { readonly id: string; readonly x: number; readonly y: number } | null) => void;
  readonly onPicked: (id: string) => void;
  readonly onRefused: (message: string) => void;
  /** A line said during a demonstration, or nothing. */
  readonly onCaption: (text: string | null) => void;
  /** Which structures are shown or moved has changed. */
  readonly onChange: () => void;
  /** Move the view over about a second. */
  readonly moveView: (position: THREE.Vector3, target: THREE.Vector3, up: THREE.Vector3) => void;
  /** How much of the width of the view is covered at its right by the card of a tutorial, as a share. */
  readonly covered: () => number;
  readonly snip: () => void;
}

export interface LabSession {
  readonly volume: CutVolume;
  /** What has been lifted out of the body, which is no longer seen only through the opening. */
  readonly taken: ReadonlySet<string>;
  readonly tied: ReadonlySet<string>;
  setTool(tool: LabToolId): void;
  setPose(pose: LabPose): void;
  /** Draw a hind leg out and tape it down, for surgery on its inner side, towards the animal's left when 1, or let it go when nothing is named. */
  extendLeg(side: 1 | -1 | null): void;
  /** The camera for a view of the animal, as a position, target and way up. */
  viewOf(view: LabView): { position: THREE.Vector3; target: THREE.Vector3; up: THREE.Vector3 };
  /** What marks where a lid of bone has been lifted to, as openings in the skin do. */
  readonly plates: () => THREE.Object3D[];
  /** Lift out a structure and put it in the dish. */
  take(id: string): void;
  undo(): void;
  restart(): void;
  /** The hands do a whole exercise by themselves. */
  demonstrate(id: string): void;
  /** The hands do one step of an exercise by themselves, from where things stand. */
  showStep(steps: readonly DemoStep[], caption?: string): void;
  stopDemonstration(): void;
  /** What to mark on the animal, and whether a stroke keeps to a marked line. */
  setGuide(guide: LabGuide | null): void;
  setSteady(on: boolean): void;
  /** Look again, soon, at what can be seen. */
  look(): void;
  /** Advance by a time step, and by the time that has really passed, which a demonstration keeps to on a slow machine. True if anything in the view has changed. */
  update(delta: number, passed?: number): boolean;
  dispose(): void;
}

/** A sweep through the grid of cuts: all of them can be run again to rebuild it after a step is undone. */
interface Sweep {
  readonly channel: number;
  /** How far under the surface it runs. */
  readonly shift: number;
  readonly points: CutPoint[];
  radius: number;
  readonly restore: boolean;
}

interface BloodSpot { readonly mesh: THREE.Mesh; size: number; readonly most: number; readonly rate: number }

/** A layer on one side of a cut, which can be drawn back. */
interface Flap {
  readonly kind: FlapKind;
  /** On the animal's left when 1, or towards its head for a cut across the body. */
  readonly side: 1 | -1;
  readonly a: THREE.Vector3;
  readonly b: THREE.Vector3;
  readonly out: THREE.Vector3;
  readonly up: THREE.Vector3;
  /** How far from the cut it can fold, along the surface. For a lid, how far it reaches from the cut to where it turns. */
  readonly widest: number;
  readonly square: boolean;
  /** Its own drawing, for a layer that folds. */
  readonly sheet: FlapSheet | null;
  /** For a lid of bone: how deep it goes under the cut, where it has been freed from what lies round it, and a box that follows it, so that it is still drawn when it has been lifted out of the opening. */
  readonly depth: number;
  readonly freed: readonly (readonly [THREE.Vector3, THREE.Vector3])[];
  readonly plate: THREE.Mesh | null;
  open: number;
  goal: number;
}

interface Step {
  readonly action: LabAction;
  readonly sweeps: Sweep[];
  readonly objects: THREE.Object3D[];
  took?: string;
  moved?: { id: string; before: THREE.Vector3 };
  tied?: string;
  cleaned?: BloodSpot[];
  madeFlaps?: Flap[];
  /** Flaps of an earlier cut that this cut carried on, and so took the place of. */
  joinedFlaps?: Flap[];
  drewFlap?: { flap: Flap; before: number };
}

interface Stroke {
  readonly kind: LabActionKind;
  readonly tool: LabToolId;
  readonly tier: DissectionTierId;
  readonly filter: (id: string) => boolean;
  readonly radius: number;
  /** How wide the cut draws open once it has been made, if it does not open as flaps. */
  readonly openTo: number;
  readonly restore: boolean;
  readonly sweeps: Sweep[];
  /** The sweeps now being drawn on: one for each depth. A stroke that moves to another surface starts new ones. */
  live: Sweep[];
  pointerX: number;
  pointerY: number;
  readonly structures: Set<string>;
  length: number;
  aside: number;
  from: number;
  to: number;
  heights: number;
  asides: number;
  samples: number;
  lastGrasp: number;
  readonly lastNow: THREE.Vector3;
  readonly restLine: THREE.Vector3[];
  readonly normals: THREE.Vector3;
  readonly objects: THREE.Object3D[];
  bled: boolean;
  joinedFlaps?: Flap[];
}

const LONGEST_STEP = 0.012, SMALLEST_STEP = 0.00012, MOST_MOVED = 0.03, SPLAY = 1, BONE_UNDER = 0.007, MOVE_LIFT = 0.0012, SNAP_PIXELS = 34;
/** A quick movement between two pictures is gone over in short steps, of at most this many pixels, and this many of them, so that the cut has no gaps. */
const STROKE_PIXELS = 10, MOST_STROKE_STEPS = 8;
const toPoint = (vector: THREE.Vector3): CutPoint => [vector.x, vector.y, vector.z];
const FLAP_TYPE: Readonly<Record<FlapKind, number>> = { skin: 0, wall: 1, chest: 2, skull: 3 };
/** How far from what it looks at each view stands. Close views are near enough to work in, and leave the hands in view. */
const VIEW_REACH: Readonly<Record<LabViewName, number>> = { belly: 0.34, back: 0.34, left: 0.3, right: 0.3, 'left-close': 0.15, spleen: 0.11, close: 0.135, chest: 0.11, 'left-thigh': 0.09, femoral: 0.05, head: 0.1 };
/** How far a hind leg is drawn out for surgery on its inner side, in radians, on top of how it lies. Chosen so that the inner side of the thigh faces the view. */
const LEG_TAPED_DOWN = 0.95;
/** How far a lid of bone turns when it has been lifted right back, in radians: the front of the rib cage goes over towards the head, and a leaf of the skull lies out to the side. */
const lidTurn = (lid: { readonly kind: FlapKind }) => lid.kind === 'skull' ? 2.3 : 2.5;
/** How far a half of the top of the skull reaches from the middle to where it folds, in metres. Chosen for practice, about the width of the parietal bone of this model. */
const SKULL_HALF = 0.0052;
const LID_CHANNELS = [channelOfTier('skeleton'), channelOfTier('outer-muscle'), channelOfTier('inner-muscle'), channelOfTier('lining')];

const BLOOD_GEOMETRY = new THREE.SphereGeometry(1, 16, 10);
const BLOOD_MATERIAL = new THREE.MeshPhysicalMaterial({ color: '#6e0d10', roughness: 0.16, clearcoat: 0.8, clearcoatRoughness: 0.2 });
const STITCH_GEOMETRY = new THREE.CylinderGeometry(0.00005, 0.00005, 0.0017, 5);
const STITCH_MATERIAL = new THREE.MeshStandardMaterial({ color: '#223a8a', roughness: 0.7 });
const GUIDE_MATERIAL = new THREE.MeshBasicMaterial({ color: '#19c79a', transparent: true, opacity: 0.95, depthTest: false });
const GUIDE_DOT = new THREE.SphereGeometry(0.00034, 10, 8);

/** The way a tube runs near a point, and how thick it is, from the vertices of its surface. */
function tubeNear(mesh: THREE.Mesh, point: THREE.Vector3): { direction: THREE.Vector3; radius: number } | null {
  const position = mesh.geometry.getAttribute('position');
  if (!position) return null;
  const local = mesh.worldToLocal(point.clone()), reach = 0.0014, near: THREE.Vector3[] = [], at = new THREE.Vector3();
  for (let index = 0; index < position.count; index++) {
    at.fromBufferAttribute(position, index);
    if (at.distanceToSquared(local) < reach * reach) near.push(at.clone());
  }
  if (near.length < 6) return null;
  const middle = near.reduce((sum, value) => sum.add(value), new THREE.Vector3()).multiplyScalar(1 / near.length);
  const direction = new THREE.Vector3(0.3, 0.5, 0.8);
  for (let round = 0; round < 8; round++) {
    const next = new THREE.Vector3();
    for (const value of near) { const from = at.subVectors(value, middle); next.addScaledVector(from, from.dot(direction)); }
    if (next.lengthSq() < 1e-16) return null;
    direction.copy(next.normalize());
  }
  let radius = 0;
  for (const value of near) { const from = at.subVectors(value, middle); radius += from.addScaledVector(direction, -from.dot(direction)).length(); }
  return { direction: direction.clone().transformDirection(mesh.matrixWorld), radius: radius / near.length };
}

/** Which layers go with which kind of flap: skin with what is bound to it, the wall with its lining, and the front of the rib cage with what lies on it. Vessels and nerves go with the layer they lie in. */
const flapFlags = (tier: DissectionTierId): readonly [number, number, number] => {
  if (tier === 'skin' || tier === 'fat' || tier === 'panniculus') return [1, 0, 0];
  if (tier === 'outer-muscle' || tier === 'inner-muscle' || tier === 'lining') return [0, 1, 1];
  if (tier === 'skeleton') return [0, 0, 1];
  if (tier === 'vessels-nerves') return [1, 1, 0];
  return [0, 0, 0];
};

/** What belongs to the trunk and stays where it is when a leg beside it is laid out: the organs, the wall of the body with its lining, and the hip bones. Lymph nodes go with the limb they lie in, and the eyes do not come into it. */
const staysWithTrunk = (id: string, tier: DissectionTierId) => /abdominal-wall|peritoneum|bone-coxa|muscle-(obliques|perineal)|muscle-tail-base/.test(id) || (tier === 'organs' && !/lymph/.test(id));

export function createLabSession(options: LabSessionOptions): LabSession {
  const { renderer, scene, camera, controls, element, meshes, tierOf, skinId } = options;
  const dom = renderer.domElement;
  const skin = meshes.get(skinId)! as THREE.Mesh;
  const box = new THREE.Box3().setFromObject(skin).expandByScalar(0.003);
  const volume = createCutVolume(renderer, box);
  const pick = createLabPick();
  const started = performance.now();
  const secondsNow = () => (performance.now() - started) / 1000;
  const shadingOf = (id: string): SurfaceShadingUniforms | null => { const mesh = meshes.get(id); return mesh instanceof THREE.Mesh ? surfaceShadingOf(mesh.material as THREE.Material) : null; };

  // The frame of the body, from the motion, for describing where a cut lies.
  const origin = LIFE_SHARED.uLifeOrigin.value, axis = LIFE_SHARED.uLifeAxis.value, lateral = LIFE_SHARED.uLifeLateral.value, dorsal = LIFE_SHARED.uLifeDorsal.value;
  const forward = axis.clone().negate();
  const body = (): number[] => LIFE_SHARED.uLifeBody.value.toArray() as number[];
  const bodyMiddle = origin.clone().addScaledVector(axis, (body()[0] + body()[3]) / 2);
  const undersideOffset = LIFE_SHARED.uLifeSpine.value.y - LIFE_SHARED.uLifeTrunk.value.x;
  /** The middle of the height of the trunk, under which a place counts as on the underside. */
  const middleHeight = LIFE_SHARED.uLifeSpine.value.y - LIFE_SHARED.uLifeTrunk.value.x * 0.2;
  const halfWidth = Math.max(LIFE_SHARED.uLifeTrunk.value.y, 0.004);
  // Which way across the frame the animal's left lies, from its own bones.
  const centreOf = (id: string) => { const mesh = meshes.get(id); return mesh ? new THREE.Box3().setFromObject(mesh).getCenter(new THREE.Vector3()) : new THREE.Vector3(); };
  const toLeft = centreOf('living:bone-femur-l').sub(centreOf('living:bone-femur-r')).dot(lateral) >= 0 ? 1 : -1;
  const skinBounds = new THREE.Box3().setFromObject(skin);
  const corners = [skinBounds.min, skinBounds.max].flatMap((a) => [skinBounds.min, skinBounds.max].flatMap((b) => [skinBounds.min, skinBounds.max].map((c) => new THREE.Vector3(a.x, b.y, c.z))));
  const backLevel = Math.max(...corners.map((corner) => corner.dot(dorsal))) + 0.001;
  const feetLevel = origin.dot(dorsal) + LIFE_SHARED.uLifeGround.value - 0.0002;

  const root = new THREE.Group();
  root.name = 'practice-dissection';
  scene.add(root);
  const skinEdge = createSkinEdge(skin, volume.field);
  root.add(skinEdge.mesh);
  surfaceShadingOf(skinEdge.mesh.material as THREE.Material)?.uLifeFlapOf.value.set(1, 0, 0);
  let edgeWaited = 0, edgeStale = false;
  const left = new THREE.Group();
  root.add(left);

  // The bench: a wax board with a steel rim, a tray of instruments and a dish. They stand under the animal, whichever way it lies, and are seen from one side only, so that the view can still go round behind.
  const bench = new THREE.Group();
  root.add(bench);
  const boardMaterial = new THREE.MeshStandardMaterial({ color: '#2f3936', roughness: 0.62, metalness: 0.02 });
  const steelMaterial = new THREE.MeshStandardMaterial({ color: '#c6ccd1', roughness: 0.3, metalness: 0.85 });
  const addPlane = (width: number, height: number, material: THREE.Material, x: number, y: number, z: number) => {
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
    plane.position.set(x, y, z);
    plane.receiveShadow = true;
    bench.add(plane);
    return plane;
  };
  // In the bench's own frame, x runs along the body and y across it, and z out of the board.
  const fade = document.createElement('canvas');
  fade.width = fade.height = 256;
  const fading = fade.getContext('2d');
  if (fading) {
    const glow = fading.createRadialGradient(128, 128, 40, 128, 128, 128);
    glow.addColorStop(0, 'rgba(228,232,230,1)'); glow.addColorStop(0.65, 'rgba(232,235,233,0.9)'); glow.addColorStop(1, 'rgba(240,242,241,0)');
    fading.fillStyle = glow;
    fading.fillRect(0, 0, 256, 256);
  }
  const fadeTexture = new THREE.CanvasTexture(fade);
  fadeTexture.colorSpace = THREE.SRGBColorSpace;
  addPlane(1.1, 0.8, new THREE.MeshStandardMaterial({ map: fadeTexture, transparent: true, depthWrite: false, roughness: 0.85 }), 0, 0, -0.0024);
  addPlane(0.272, 0.142, steelMaterial, 0, 0, -0.0012);
  addPlane(0.26, 0.13, boardMaterial, 0, 0, 0);
  // A soft darkening on the wax under the animal.
  const under = document.createElement('canvas');
  under.width = 128; under.height = 64;
  const underContext = under.getContext('2d');
  if (underContext) {
    const soft = underContext.createRadialGradient(64, 32, 2, 64, 32, 62);
    soft.addColorStop(0, 'rgba(8,12,10,0.62)'); soft.addColorStop(0.6, 'rgba(8,12,10,0.3)'); soft.addColorStop(1, 'rgba(8,12,10,0)');
    underContext.setTransform(1, 0, 0, 0.5, 0, 16);
    underContext.fillStyle = soft;
    underContext.fillRect(0, -32, 128, 128);
  }
  const underTexture = new THREE.CanvasTexture(under);
  addPlane(0.15, 0.085, new THREE.MeshBasicMaterial({ map: underTexture, transparent: true, depthWrite: false }), 0, 0, 0.0008);
  const trayY = 0.112;
  addPlane(0.205, 0.075, steelMaterial, 0, trayY, -0.0012);
  addPlane(0.195, 0.065, new THREE.MeshStandardMaterial({ color: '#e7eaec', roughness: 0.42, metalness: 0.65 }), 0, trayY, 0);
  const dishAt = new THREE.Vector3(0.02, -0.112, 0);
  const dishBase = new THREE.Mesh(new THREE.CircleGeometry(0.04, 48), new THREE.MeshPhysicalMaterial({ color: '#f4f7f7', roughness: 0.1, clearcoat: 1, opacity: 0.9, transparent: true }));
  dishBase.position.copy(dishAt);
  dishBase.receiveShadow = true;
  bench.add(dishBase);
  const dishRim = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.0012, 8, 64), new THREE.MeshPhysicalMaterial({ color: '#dfe7e8', roughness: 0.08, clearcoat: 1, opacity: 0.75, transparent: true }));
  dishRim.position.copy(dishAt);
  bench.add(dishRim);

  let pose: LabPose = 'on-back';
  const benchNormal = () => pose === 'on-back' ? dorsal.clone().negate() : dorsal.clone();
  const placeBench = () => {
    const z = benchNormal(), x = axis.clone(), y = new THREE.Vector3().crossVectors(z, x).normalize();
    bench.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
    const level = pose === 'on-back' ? backLevel : feetLevel;
    bench.position.copy(bodyMiddle).addScaledVector(dorsal, level - bodyMiddle.dot(dorsal));
    bench.updateMatrixWorld(true);
  };
  const benchPoint = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).applyMatrix4(bench.matrixWorld);
  placeBench();

  const TRAY_TOOLS: readonly LabToolId[] = ['scalpel', 'scissors', 'forceps', 'probe', 'bone-cutter', 'ligature', 'suture', 'pin', 'swab', 'syringe'];
  const trayCopies = new Map<LabToolId, THREE.Object3D>();
  const trayPlace = (id: LabToolId) => new THREE.Vector3(-0.082 + 0.0182 * TRAY_TOOLS.indexOf(id), trayY - 0.027, 0.0016);
  TRAY_TOOLS.forEach((id) => {
    const copy = createInstrument(id)!;
    copy.group.position.copy(trayPlace(id));
    // Lying on the tray, tips towards the board, flat.
    copy.group.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 1, 0)));
    copy.group.scale.setScalar(0.9);
    bench.add(copy.group);
    trayCopies.set(id, copy.group);
  });

  // The hands.
  const rightHand = createHand('right'), leftHand = createHand('left');
  root.add(rightHand.holder, leftHand.holder);
  const leftForceps = createInstrument('forceps')!;
  root.add(leftForceps.group);
  const held = new Map<LabToolId, Instrument | null>();
  const makeCast = (object: THREE.Object3D) => object.traverse((part) => { if (part instanceof THREE.Mesh) part.castShadow = true; });
  const heldInstrument = (id: LabToolId) => {
    let made = held.get(id);
    if (made === undefined) { made = createInstrument(id); held.set(id, made); if (made) { made.group.visible = false; makeCast(made.group); root.add(made.group); } }
    return made ?? null;
  };
  makeCast(rightHand.holder); makeCast(leftHand.holder); makeCast(leftForceps.group);

  // A demonstration works the same controls as a person: it moves the pointer and presses.
  type RobotStep = DemoStep | { readonly kind: 'say'; readonly text: string };
  interface Robot { readonly steps: readonly RobotStep[]; index: number; seconds: number; stage: number; travelled: number; total: number; path: THREE.Vector3[]; ends: THREE.Vector3 | null; flap: Flap | null; from: number }
  let robot: Robot | null = null;
  let tool: LabToolId = 'hand';
  let instrument: Instrument | null = null;
  const history: Step[] = [];
  const spots: BloodSpot[] = [];
  const seenEver = new Set<string>();
  const taken = new Set<string>();
  const dishSlots = new Map<string, number>();
  const tied = new Set<string>();
  const flaps: Flap[] = [];
  const pointer = { x: 0, y: 0, moved: false, inside: false };
  let stroke: Stroke | null = null;
  let grasp: { id: string; before: THREE.Vector3; plane: THREE.Plane; from: THREE.Vector3; offset: THREE.Vector3 } | null = null;
  let pull: { flap: Flap; start: number; plane: THREE.Plane; from: THREE.Vector3; tier: DissectionTierId; id: string } | null = null;
  let waited = 0, changed = true, lookIn = 0.4, pressed = false, cutPhase = 0, snipAt = 0, clock = 0;
  let splay = 0, splayGoal = SPLAY, steady = true, steadyWanted = true;
  const legGoals = [0, 0, 0, 0];
  let swap: { t: number; next: LabToolId; done: boolean } | null = null;
  let carry: { id: string; from: THREE.Vector3; to: THREE.Vector3; t: number; step: Step } | null = null;
  let needle: { entry: THREE.Vector3; entryAtRest: THREE.Vector3; way: THREE.Vector3; wayAtRest: THREE.Vector3; depth: number; firstId: string; side: LabSide; out: number; spare: number; speed: number; stopsIn: THREE.Mesh[]; stopped: boolean } | null = null;
  const openings: { sweeps: Sweep[]; from: number; to: number; t: number }[] = [];
  // Where each tip is, and where it is going.
  const rightTip = new THREE.Vector3(), rightGoal = new THREE.Vector3(), leftTip = new THREE.Vector3(), leftGoal = new THREE.Vector3();
  let aimed = false, overBody = false, rightOpen = 0.6, leftOpen = 0.8;
  // Whether the pointer has said where the tip should go since the hands last lay at rest.
  let tipAsked = false;
  const leftHold = { active: false, at: new THREE.Vector3(), lift: 0, liftGoal: 0, normal: new THREE.Vector3() };
  const heldLayer: SurfaceShadingUniforms[] = [];
  const right = new THREE.Vector3(), up = new THREE.Vector3(), toEye = new THREE.Vector3();
  const reading = () => { camera.updateMatrixWorld(); right.setFromMatrixColumn(camera.matrixWorld, 0); up.setFromMatrixColumn(camera.matrixWorld, 1); toEye.setFromMatrixColumn(camera.matrixWorld, 2); };

  const report = () => options.onReport({
    facts: { actions: history.map((step) => step.action), seen: new Set(seenEver), removed: new Set(taken), ligated: new Set(tied), pose },
    canUndo: history.length > 0, taken: [...taken], demonstrating: !!robot, tool: swap?.next ?? tool, pose,
  });

  /** Which leg a point of the model at rest goes with now that the legs are laid out, and how. The same as mbLegOut in the program that draws it. */
  const smooth = (a: number, b: number, x: number) => { const k = Math.max(0, Math.min(1, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
  const legTurn = (p: THREE.Vector3) => {
    if (splay === 0) return null;
    const q = p.clone().sub(origin), along = q.dot(axis), across = q.dot(lateral), high = q.dot(dorsal), ground = LIFE_SHARED.uLifeGround.value;
    for (let leg = 0; leg < 4; leg++) {
      const hip = LIFE_SHARED.uLifeHip.value[leg], foot = LIFE_SHARED.uLifeFoot.value[leg];
      const out = hip.clone().sub(origin).dot(lateral) < 0 ? -1 : 1, inFrom = out * (across - foot.clone().sub(origin).dot(lateral));
      const here = leg < 2 ? smooth(-0.0042, -0.0016, inFrom) * smooth(-0.0135, -0.0105, along) * (1 - smooth(0.009, 0.014, along)) : smooth(-0.0072, -0.0022, inFrom) * smooth(0.029, 0.033, along);
      if (here <= 0) continue;
      const end = ground + 0.0025, top = hip.clone().sub(origin).dot(dorsal), down = Math.max(0, Math.min(1, (top - high) / (top - end)));
      const angle = -out * (splay * (leg < 2 ? 1.25 : 0.62) * down ** 1.6 + LIFE_SHARED.uLifeLegOut.value[leg] * smooth(0, 0.003, top - high)) * here;
      if (angle === 0) continue;
      const paw = 1 - smooth(ground + 0.0022, ground + 0.0044, high);
      const lever = p.clone().sub(hip).lerp(foot.clone().sub(hip).addScaledVector(dorsal, end - foot.clone().sub(origin).dot(dorsal)), paw);
      return { angle, turned: angle * (1 - paw), by: lever.clone().applyAxisAngle(axis, angle).sub(lever) };
    }
    return null;
  };
  /** The hind leg on one side of the animal, towards its left when 1. */
  const hindLeg = (side: 1 | -1) => [2, 3].find((leg) => LIFE_SHARED.uLifeHip.value[leg].clone().sub(origin).dot(lateral) * toLeft * side > 0) ?? 3;
  const nowOf = (p: THREE.Vector3) => { const turn = legTurn(p); return turn ? p.clone().add(turn.by) : p.clone(); };
  const nowWay = (p: THREE.Vector3, way: THREE.Vector3, back = false) => { const turn = legTurn(p); return turn ? way.clone().applyAxisAngle(axis, back ? -turn.turned : turn.turned) : way.clone(); };

  const size = () => { const out = new THREE.Vector2(); renderer.getDrawingBufferSize(out); return out; };
  const pickAt = (only?: (id: string) => boolean, wholeAgain = false): LabHit | null => {
    const view = size();
    return pick.at(renderer, scene, camera, options.entries(only), options.marks(), pointer.x, pointer.y, view.x, view.y, wholeAgain);
  };
  const viewSize = (at: THREE.Vector3) => { const height = 2 * at.distanceTo(camera.position) * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2); return { height, width: height * camera.aspect }; };
  /** Hands that are not working lie towards the lower corners of the view. */
  const restFor = (side: 1 | -1) => {
    const { width, height } = viewSize(controls.target);
    return controls.target.clone().addScaledVector(right, side * width * 0.42).addScaledVector(up, -height * 0.3).addScaledVector(toEye, height * 0.08);
  };
  const pointerRayHits = (plane: THREE.Plane) => {
    const view = size(), ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(pointer.x / view.x * 2 - 1, -(pointer.y / view.y) * 2 + 1), camera);
    return ray.ray.intersectPlane(plane, new THREE.Vector3());
  };
  const pointOnPlane = () => pointerRayHits(new THREE.Plane().setFromNormalAndCoplanarPoint(toEye, controls.target));

  /** Which way a handle runs from the tip, towards the near lower corner of the view on its own side, as a hand at the bench would hold it. */
  const handleWay = (side: 1 | -1) => new THREE.Vector3().addScaledVector(right, side * 0.84).addScaledVector(up, -0.33).addScaledVector(toEye, 0.43).normalize();
  /** Put an instrument at a point, with its handle that way, or along a way of its own, as a needle has. */
  const aim = (made: Instrument, tip: THREE.Vector3, side: 1 | -1, own?: THREE.Vector3) => {
    const z = own ?? handleWay(side);
    let y: THREE.Vector3;
    if (made.grip === 'rings') {
      const back = new THREE.Vector3().addScaledVector(right, side * 0.5).addScaledVector(toEye, 0.85);
      y = back.addScaledVector(z, -back.dot(z)).normalize().negate();
    } else {
      const outer = right.clone().multiplyScalar(side);
      y = outer.addScaledVector(z, -outer.dot(z)).normalize();
    }
    const x = new THREE.Vector3().crossVectors(y, z);
    made.group.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
    made.group.position.copy(tip);
    made.group.updateMatrixWorld(true);
  };
  const elbowFor = (tip: THREE.Vector3, side: 1 | -1) => tip.clone().addScaledVector(right, side * 0.42).addScaledVector(up, -0.34).addScaledVector(toEye, 0.02);

  const addTo = (object: THREE.Object3D, step: { objects: THREE.Object3D[] }) => { left.add(object); step.objects.push(object); };
  const addBlood = (at: THREE.Vector3, normal: THREE.Vector3, most: number, rate: number, step: { objects: THREE.Object3D[] }) => {
    const mesh = new THREE.Mesh(BLOOD_GEOMETRY, BLOOD_MATERIAL);
    mesh.position.copy(at).addScaledVector(normal, 0.00004);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
    mesh.scale.set(0.0002, 0.0002, 0.00006);
    addTo(mesh, step);
    spots.push({ mesh, size: 0.0002, most, rate });
  };
  const bleedIfCut = (hit: LabHit) => {
    if (!stroke || stroke.restore || (stroke.kind !== 'cut' && stroke.kind !== 'bone') || !options.circulating()) return;
    const heavy = options.isVessel(hit.id) && !tied.has(hit.id);
    const soaked = tierOf(hit.id) === 'organs' && /liver|spleen|kidney|heart/.test(hit.id);
    if (!heavy && !soaked) return;
    if (stroke.objects.length < 8) addBlood(hit.now, hit.normal, heavy ? 0.0026 : 0.0013, heavy ? 0.0009 : 0.0005, stroke);
    stroke.bled = true;
  };

  /** The left hand takes hold of the layer beside the cut and lifts it a little. */
  const takeHold = (hit: LabHit, filter: (id: string) => boolean) => {
    for (const shading of heldLayer) shading.uLifeHeld.value = 0;
    heldLayer.length = 0;
    for (const id of meshes.keys()) if (filter(id)) { const shading = shadingOf(id); if (shading) { shading.uLifeHeld.value = 1; heldLayer.push(shading); } }
    const made = new THREE.Vector3().crossVectors(hit.normal, toEye);
    const across = made.lengthSq() > 0.05 ? made.normalize() : right.clone();
    if (across.dot(right) > 0) across.negate();
    leftHold.active = true;
    leftHold.at.copy(hit.rest).addScaledVector(across, 0.0022);
    leftHold.normal.copy(hit.normal);
    leftHold.liftGoal = 0.0018;
    leftGoal.copy(hit.now).addScaledVector(across, 0.0022).addScaledVector(hit.normal, 0.0009);
    leftOpen = 0.12;
  };
  const letGo = () => { leftHold.active = false; leftHold.liftGoal = 0; leftOpen = 0.8; };

  const sampleOf = (s: Stroke, hit: LabHit) => {
    const offset = hit.rest.clone().sub(origin), along = offset.dot(axis) * 1000, across = offset.dot(lateral), height = offset.dot(dorsal);
    s.from = Math.min(s.from, along); s.to = Math.max(s.to, along);
    s.aside = Math.max(s.aside, Math.abs(across) * 1000);
    s.heights += height; s.asides += Math.abs(across); s.samples++;
    s.structures.add(hit.id);
    s.restLine.push(hit.rest.clone());
    s.normals.add(hit.restNormal);
  };

  // The line marked on the animal, as points at rest, and whether a stroke keeps to it.
  let guideLine: THREE.Vector3[] = [];
  const guideRoot = new THREE.Group();
  root.add(guideRoot);
  let guideFind: string[] = [];
  let guideEdge: FlapKind | null = null;

  /** Draw the pointer in to the marked line, so that a steady hand is not needed to follow it. */
  const steadyPointer = () => {
    if (!steady || guideLine.length < 2) return;
    let best = Infinity, bestX = 0, bestY = 0;
    const view = size();
    const a = new THREE.Vector2(), b = new THREE.Vector2(), project = (point: THREE.Vector3, out: THREE.Vector2) => { const p = nowOf(point).project(camera); out.set((p.x + 1) / 2 * view.x, (1 - p.y) / 2 * view.y); };
    project(guideLine[0], a);
    for (let index = 1; index < guideLine.length; index++) {
      project(guideLine[index], b);
      const dx = b.x - a.x, dy = b.y - a.y, t = Math.max(0, Math.min(1, ((pointer.x - a.x) * dx + (pointer.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
      const x = a.x + dx * t, y = a.y + dy * t, far = Math.hypot(pointer.x - x, pointer.y - y);
      if (far < best) { best = far; bestX = x; bestY = y; }
      a.copy(b);
    }
    if (best < SNAP_PIXELS * renderer.getPixelRatio()) { pointer.x = bestX; pointer.y = bestY; }
  };

  const beginStroke = (hit: LabHit, kind: LabActionKind, radius: number, restore = false) => {
    const tier = tierOf(hit.id);
    const reach = kind === 'suture' ? { channels: [0], depth: 0 } : cutReach(tool, tier);
    const sweeps: Sweep[] = [];
    const rest = toPoint(hit.rest);
    for (const channel of reach.channels) for (const share of reach.depth > 0.003 ? [0, 0.25, 0.5, 0.75, 1] : reach.depth > 0 ? [0, 0.5, 1] : [0]) {
      const shift = share * reach.depth;
      sweeps.push({ channel, shift, radius, restore, points: [[rest[0] - hit.normal.x * shift, rest[1] - hit.normal.y * shift, rest[2] - hit.normal.z * shift]] });
    }
    const channels = new Set(reach.channels);
    const filter = (id: string) => channels.has(channelOfTier(tierOf(id)));
    const openTo = kind === 'cut' ? (tool === 'scissors' ? Math.max(radius * 2.6, 0.0011) : Math.max(radius * 3, 0.0008)) : radius;
    stroke = { kind, tool, tier, filter, radius, openTo, restore, sweeps, live: [...sweeps], pointerX: pointer.x, pointerY: pointer.y, structures: new Set([hit.id]), length: 0, aside: 0, from: Infinity, to: -Infinity, heights: 0, asides: 0, samples: 0, lastGrasp: 0, lastNow: hit.now.clone(), restLine: [], normals: new THREE.Vector3(), objects: [], bled: false };
    sampleOf(stroke, hit);
    if (kind !== 'suture') for (const sweep of sweeps) volume.sweep(sweep.channel, sweep.points[0], sweep.points[0], radius, restore);
    bleedIfCut(hit);
    if ((kind === 'cut' || kind === 'bone') && !grasp) takeHold(hit, filter);
    // Stitching brings the edges of the skin back together.
    if (kind === 'suture') for (const flap of flaps) if (flap.kind === 'skin') flap.goal = 0;
    changed = true;
  };

  const continueStroke = () => {
    if (!stroke) return;
    const s = stroke;
    steadyPointer();
    const toX = pointer.x, toY = pointer.y, moved = Math.hypot(toX - s.pointerX, toY - s.pointerY);
    const steps = Math.min(MOST_STROKE_STEPS, Math.max(1, Math.ceil(moved / (STROKE_PIXELS * renderer.getPixelRatio()))));
    for (let step = 1; step <= steps; step++) {
      pointer.x = s.pointerX + (toX - s.pointerX) * step / steps;
      pointer.y = s.pointerY + (toY - s.pointerY) * step / steps;
      strokeStep(s, moved / steps);
    }
    pointer.x = toX; pointer.y = toY;
    s.pointerX = toX; s.pointerY = toY;
  };
  /** One short step of a stroke, to where the pointer is, which has come this many pixels. */
  const strokeStep = (s: Stroke, pixels: number) => {
    // The instrument stays on the layer it began on: what lies over or under it is not touched, and neither is the far side of the animal, seen through the hole just made.
    const hit = pickAt(s.filter, true);
    if (!hit) { const off = pointOnPlane(); if (off) rightGoal.copy(off); overBody = false; return; }
    rightGoal.copy(hit.now);
    overBody = true;
    const last = s.live[0].points[s.live[0].points.length - 1], first = s.live[0].shift;
    const rest = toPoint(hit.rest);
    const gap = Math.hypot(rest[0] - hit.normal.x * first - last[0], rest[1] - hit.normal.y * first - last[1], rest[2] - hit.normal.z * first - last[2]);
    if (gap < SMALLEST_STEP) return;
    // A surface runs on from where the pointer was. A much longer way than the pointer has come means another surface: over a gap between the leg and the body, say, which is not cut across.
    const viewHeight = viewSize(hit.now).height, reach = Math.max(0.0018, 4 * pixels * viewHeight / size().y);
    const whole = gap < Math.min(reach, LONGEST_STEP);
    const nextOf = (sweep: Sweep): CutPoint => [rest[0] - hit.normal.x * sweep.shift, rest[1] - hit.normal.y * sweep.shift, rest[2] - hit.normal.z * sweep.shift];
    if (whole) {
      s.length += gap;
      for (const sweep of s.live) {
        const end = sweep.points[sweep.points.length - 1], next = nextOf(sweep);
        volume.sweep(sweep.channel, end, next, s.radius, s.restore);
        sweep.points.push(next);
      }
    } else {
      // The stroke goes on from there as a new line.
      s.live = s.live.map((sweep) => { const next = nextOf(sweep), fresh: Sweep = { ...sweep, points: [next] }; volume.sweep(sweep.channel, next, next, s.radius, s.restore); s.sweeps.push(fresh); return fresh; });
    }
    if (s.kind === 'suture' && whole) {
      // A stitch across the line, every so often.
      if (Math.floor(s.length / 0.0016) > Math.floor((s.length - gap) / 0.0016)) {
        const across = new THREE.Vector3().crossVectors(hit.now.clone().sub(s.lastNow).normalize(), hit.normal).normalize();
        const stitch = new THREE.Mesh(STITCH_GEOMETRY, STITCH_MATERIAL);
        stitch.position.copy(hit.now).addScaledVector(hit.normal, 0.00012);
        stitch.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), across);
        addTo(stitch, s);
      }
    }
    cutPhase += gap * 1100;
    if (tool === 'scissors' || tool === 'bone-cutter') {
      rightOpen = 0.5 + 0.5 * Math.cos(cutPhase);
      if (Math.floor(cutPhase / (Math.PI * 2)) !== snipAt) { snipAt = Math.floor(cutPhase / (Math.PI * 2)); options.snip(); }
    }
    s.lastNow.copy(hit.now);
    sampleOf(s, hit);
    bleedIfCut(hit);
    // Bone cutters run over what lies on the bone, and go through it.
    if (s.kind === 'bone') { const bone = pickAt(isBone, true); if (bone && bone.rest.distanceTo(hit.rest) < BONE_UNDER) s.structures.add(bone.id); }
    // The marks on the line go as the blade passes them.
    for (const child of guideRoot.children) if (child.visible && !child.userData.face && (child.userData.rest as THREE.Vector3).distanceToSquared(hit.rest) < 2.6e-6) child.visible = false;
    // Every little way the left hand takes a fresh hold, nearer the blade.
    if (leftHold.active && s.length - s.lastGrasp > 0.008) { s.lastGrasp = s.length; takeHold(hit, s.filter); }
    changed = true;
  };

  const sideOf = (s: Stroke): LabSide => {
    const meanHeight = s.heights / Math.max(s.samples, 1), meanAside = s.asides / Math.max(s.samples, 1);
    if (meanHeight > middleHeight + 0.002) return 'dorsal';
    if (meanHeight < middleHeight && meanAside < halfWidth) return 'ventral';
    return 'side';
  };

  const writeFlaps = () => {
    flaps.forEach((flap, slot) => {
      LIFE_SHARED.uFlapA.value[slot].copy(flap.a);
      LIFE_SHARED.uFlapB.value[slot].copy(flap.b);
      LIFE_SHARED.uFlapOut.value[slot].copy(flap.out);
      LIFE_SHARED.uFlapUp.value[slot].copy(flap.up);
      if (flap.sheet) {
        flap.sheet.setOpen(flap.open);
        flap.sheet.writeHinge(FLAP_HINGES, slot);
        LIFE_SHARED.uFlapShape.value[slot].set(flap.widest * flap.open, 0, FLAP_TYPE[flap.kind], 0);
      } else {
        LIFE_SHARED.uFlapShape.value[slot].set(flap.open * lidTurn(flap), flap.widest, FLAP_TYPE[flap.kind], flap.depth * 1000);
        if (flap.plate) placePlate(flap);
      }
    });
    LIFE_SHARED.uFlapCount.value = flaps.length;
    CUT_SHARED.uFlapHinge.value.needsUpdate = true;
    CUT_SHARED.uLidsOpen.value = flaps.some((flap) => !flap.sheet && flap.open > 0.001) ? 1 : 0;
  };

  const surfaceRay = new THREE.Raycaster();
  /** What a flap of each kind follows. */
  const surfacesOf = (kind: FlapKind): THREE.Mesh[] => kind === 'skin' ? [skin] : [...meshes].filter(([id, mesh]) => mesh instanceof THREE.Mesh && mesh.visible && !taken.has(id) && (tierOf(id) === 'outer-muscle' || tierOf(id) === 'inner-muscle' || tierOf(id) === 'lining')).map(([, mesh]) => mesh as THREE.Mesh);
  /** The side of skin that bears the fur, or the outer side of the wall, as seen where a sheet rolls over. */
  const backOf = (kind: FlapKind): THREE.ColorRepresentation => kind === 'skin' ? (skin.material as THREE.MeshStandardMaterial).color.getHex() : '#b86a60';
  const removeSheets = (list: readonly Flap[]) => { for (const flap of list) { if (flap.sheet) root.remove(flap.sheet.mesh); if (flap.plate) root.remove(flap.plate); } };
  const addSheets = (list: readonly Flap[]) => { for (const flap of list) { if (flap.sheet) root.add(flap.sheet.mesh); if (flap.plate) root.add(flap.plate); } };

  /** A long straight cut opens as two flaps, one on each side of it. */
  const makeFlaps = (s: Stroke): Flap[] => {
    const kind: FlapKind | null = s.tier === 'skin' || s.tier === 'fat' || s.tier === 'panniculus' ? 'skin' : s.tier === 'outer-muscle' || s.tier === 'inner-muscle' || s.tier === 'lining' ? 'wall' : null;
    if (!kind || s.kind !== 'cut' || s.length < 0.006 || flaps.length + 2 > FLAP_SLOTS || s.restLine.length < 2) return [];
    let a = s.restLine[0].clone(), b = s.restLine[s.restLine.length - 1].clone();
    const line = b.clone().sub(a), length = line.length();
    if (length < 0.005) return [];
    const along = line.clone().normalize();
    for (const point of s.restLine) { const from = point.clone().sub(a); if (from.addScaledVector(along, -from.dot(along)).length() > Math.max(0.002, length * 0.2)) return []; }
    const upward = s.normals.clone().addScaledVector(along, -s.normals.dot(along)).normalize();
    // A cut that carries on along an earlier one opens with it, as one: scissors make a long cut in several snips.
    const carried = flaps.filter((flap) => {
      if (flap.kind !== kind || flap.square) return false;
      const line2 = flap.b.clone().sub(flap.a), reach = line2.length();
      if (reach < 1e-6 || Math.abs(line2.dot(along)) / reach < 0.93) return false;
      const near = (point: THREE.Vector3) => { const from = point.clone().sub(a); return from.addScaledVector(along, -from.dot(along)).length(); };
      if (near(flap.a) > 0.0035 || near(flap.b) > 0.0035) return false;
      const low = Math.min(flap.a.clone().sub(a).dot(along), flap.b.clone().sub(a).dot(along)), high = Math.max(flap.a.clone().sub(a).dot(along), flap.b.clone().sub(a).dot(along));
      return high > -0.004 && low < length + 0.004;
    });
    if (carried.length) {
      const ends = [a, b, ...carried.flatMap((flap) => [flap.a, flap.b])].sort((p, q) => p.dot(along) - q.dot(along));
      a = ends[0].clone(); b = ends[ends.length - 1].clone();
      for (const flap of carried) { const at = flaps.indexOf(flap); if (at >= 0) flaps.splice(at, 1); }
      removeSheets(carried);
      s.joinedFlaps = carried;
    }
    const whole = a.distanceTo(b);
    // The ends are carried a little beyond the cut, so that the flaps come to a point where it ends.
    const start = a.clone().addScaledVector(along, -0.0006), end = b.clone().addScaledVector(along, 0.0006);
    const region = new THREE.Box3().setFromPoints([start, end]).expandByScalar(0.036);
    const probe = createSurfaceProbe(surfacesOf(kind), region);
    const sheetKind = kind === 'skin' ? 'skin' : 'wall';
    const made = ([1, -1] as const).map((sign): Flap => {
      const out = new THREE.Vector3().crossVectors(upward, along).multiplyScalar(sign).normalize();
      const across = Math.abs(out.dot(lateral)) >= Math.abs(out.dot(axis));
      const towards = across ? lateral.clone().multiplyScalar(toLeft) : forward;
      const side: 1 | -1 = out.dot(towards) >= 0 ? 1 : -1, before = carried.find((flap) => flap.side === side);
      const widest = across ? Math.min(0.62 * whole, kind === 'wall' ? 0.0095 : 0.014) : Math.min(0.9 * whole, 0.018);
      const sheet = createFlapSheet(probe, { a: start, b: end, out, up: upward, widest }, sheetKind, backOf(kind), nowOf, flapLook(sheetKind));
      return { kind, side, a: start, b: end, out, up: upward, widest, square: false, sheet, depth: 0, freed: [], plate: null, open: before?.open ?? 0, goal: before ? Math.max(before.goal, 0.13) : 0.13 };
    });
    flaps.push(...made);
    addSheets(made);
    writeFlaps();
    return made;
  };

  /** Cut a lid of bone free along its edges, through the bone and the layers bound to it. */
  const freeLid = (lid: Flap, sweep: (channel: number, from: CutPoint, to: CutPoint, radius: number) => void) => {
    // A straight line runs under a curved body and over its hollows, so it goes through the whole depth of what can lie there.
    for (const [from, to] of lid.freed) for (const channel of LID_CHANNELS) for (let height = lid.depth * 0.75; height >= -lid.depth; height -= 0.0007) {
      sweep(channel, toPoint(from.clone().addScaledVector(lid.up, height)), toPoint(to.clone().addScaledVector(lid.up, height)), 0.0005);
    }
  };
  const PLATE_MATERIAL = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, depthTest: false, side: THREE.DoubleSide, stencilWrite: true, stencilFunc: THREE.AlwaysStencilFunc, stencilRef: 1, stencilZPass: THREE.ReplaceStencilOp });
  const createPlate = () => {
    const plate = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), PLATE_MATERIAL);
    plate.renderOrder = -1;
    plate.frustumCulled = false;
    plate.raycast = () => undefined;
    return plate;
  };
  /** Inner layers are drawn only on what is marked as opened, and a lid that has been lifted has left the opening, so its place is marked as well. Nothing further in shows there, because the skin lies over it. */
  const placePlate = (lid: Flap) => {
    const plate = lid.plate!, along = lid.b.clone().sub(lid.a), length = along.length();
    along.normalize();
    const hinge = lid.a.clone().addScaledVector(lid.out, lid.widest), axisOfTurn = new THREE.Vector3().crossVectors(lid.up, lid.out).normalize(), angle = lid.open * lidTurn(lid);
    const way = (vector: THREE.Vector3) => vector.clone().applyAxisAngle(axisOfTurn, angle);
    const size = new THREE.Vector3(length + 0.002, lid.widest + 0.002, lid.depth + 0.002);
    const middle = lid.a.clone().lerp(lid.b, 0.5).addScaledVector(lid.out, lid.widest / 2).addScaledVector(lid.up, 0.001 - lid.depth / 2);
    plate.position.copy(hinge).add(way(middle.clone().sub(hinge)));
    plate.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(way(along), way(lid.out), way(new THREE.Vector3().crossVectors(along, lid.out))));
    plate.scale.copy(size);
    plate.visible = lid.open > 0.001;
    plate.updateMatrixWorld(true);
  };

  /** Two cuts up the rib cage free its front, which can then be lifted like a lid. */
  const makeChestLid = (): Flap | null => {
    if (flaps.some((flap) => flap.kind === 'chest') || flaps.length + 1 > FLAP_SLOTS) return null;
    const cuts = history.filter((step) => step.action.kind === 'bone' && step.sweeps.length && (step.action.lengthMm ?? 0) > 6).slice(-2);
    if (cuts.length < 2) return null;
    // A cut can run in several stretches, where it passes from one surface to another: over the edge of the wall of the body, say. Its two ends are the furthest points of them all.
    const ends = cuts.map((step) => {
      const points = step.sweeps.filter((sweep) => sweep.shift === 0).flatMap((sweep) => sweep.points).map((point) => new THREE.Vector3(...point)).sort((p, q) => q.dot(axis) - p.dot(axis));
      return { low: points[0], high: points[points.length - 1] };
    });
    const a = ends[0].low, b = ends[1].low, width = a.distanceTo(b);
    if (width < 0.004) return null;
    const line = b.clone().sub(a).normalize();
    const reach = ends[0].high.clone().add(ends[1].high).multiplyScalar(0.5).sub(a.clone().add(b).multiplyScalar(0.5));
    const out = reach.clone().addScaledVector(line, -reach.dot(line));
    const height = out.length();
    out.normalize();
    const upward = new THREE.Vector3().crossVectors(line, out).normalize();
    if (upward.dot(toEye) < 0) upward.negate();
    // The lower edge is freed all the way across.
    const lid: Flap = { kind: 'chest', side: 1, a: a.clone(), b: b.clone(), out, up: upward, widest: height, square: true, sheet: null, depth: 0.006, freed: [[a.clone(), b.clone()]], plate: createPlate(), open: 0, goal: 0 };
    flaps.push(lid);
    freeLid(lid, (channel, from, to, radius) => volume.sweep(channel, from, to, radius));
    addSheets([lid]);
    writeFlaps();
    return lid;
  };

  /** A cut along the top of the skull leaves a half of it loose on each side, which can be folded out like the leaf of a book. */
  const makeSkullLids = (s: Stroke): Flap[] => {
    if (flaps.some((flap) => flap.kind === 'skull') || flaps.length + 2 > FLAP_SLOTS || s.restLine.length < 2) return [];
    const a = s.restLine[0].clone(), b = s.restLine[s.restLine.length - 1].clone(), along = b.clone().sub(a);
    if (along.length() < 0.004) return [];
    along.normalize();
    const upward = s.normals.clone().addScaledVector(along, -s.normals.dot(along)).normalize();
    const made = ([1, -1] as const).map((sign): Flap => {
      const out = new THREE.Vector3().crossVectors(upward, along).multiplyScalar(sign).normalize();
      // Rounded, as the program that draws it has it.
      const outline = Array.from({ length: 11 }, (_, index) => { const t = index / 10; return a.clone().lerp(b, t).addScaledVector(out, SKULL_HALF * Math.sqrt(Math.max(0, 1 - (2 * t - 1) ** 2))); });
      const lid: Flap = { kind: 'skull', side: out.dot(lateral) * toLeft >= 0 ? 1 : -1, a, b, out, up: upward, widest: SKULL_HALF, square: true, sheet: null, depth: 0.0018, freed: outline.slice(1).map((point, index) => [outline[index], point] as const), plate: createPlate(), open: 0, goal: 0 };
      freeLid(lid, (channel, from, to, radius) => volume.sweep(channel, from, to, radius));
      return lid;
    });
    flaps.push(...made);
    addSheets(made);
    writeFlaps();
    return made;
  };

  const endStroke = () => {
    if (!stroke) return;
    const s = stroke;
    stroke = null;
    letGo();
    const made = makeFlaps(s);
    if (s.openTo > s.radius && !made.length) openings.push({ sweeps: s.sweeps, from: s.radius, to: s.openTo, t: 0 });
    edgeStale = true;
    if (s.kind === 'cut' && s.tier === 'skin' && guideLine.length >= 2) { partedLines.push(linePart()); if (partedLines.length > 4) partedLines.shift(); }
    const action: LabAction = { kind: s.kind, tool: s.tool, at: secondsNow(), structures: [...s.structures], tier: s.tier, lengthMm: s.length * 1000, asideMm: s.aside, side: sideOf(s), fromMm: s.from, toMm: s.to, bled: s.bled || undefined };
    history.push({ action, sweeps: s.sweeps, objects: s.objects, madeFlaps: made.length ? made : undefined, joinedFlaps: s.joinedFlaps });
    if (s.kind === 'bone') {
      const lids = (s.from + s.to) / 2 < body()[0] * 1000 - 2 ? makeSkullLids(s) : [makeChestLid()].filter((lid): lid is Flap => !!lid);
      if (lids.length) history[history.length - 1].madeFlaps = [...(history[history.length - 1].madeFlaps ?? []), ...lids];
    }
    lookIn = 0.3;
    report();
  };

  const nearAnEdge = (rest: THREE.Vector3, channel: number) => {
    const reach = 0.0018;
    for (const dx of [-1, 0, 1]) for (const dy of [-1, 0, 1]) for (const dz of [-1, 0, 1]) {
      if (volume.field.sample(channel, [rest.x + dx * reach, rest.y + dy * reach, rest.z + dz * reach]) > 0.45) return true;
    }
    return false;
  };

  /** The flap that a press at this place takes hold of: one of the kind of layer pressed on, or the nearest drawn edge. */
  const flapAt = (hit: LabHit): Flap | null => {
    const tier = tierOf(hit.id);
    const order: readonly FlapKind[] = tier === 'skeleton' ? ['chest', 'skull', 'wall', 'skin'] : tier === 'outer-muscle' || tier === 'inner-muscle' || tier === 'lining' ? ['wall', 'chest', 'skull', 'skin'] : tier === 'organs' ? [] : ['skin', 'wall'];
    for (const kind of order) {
      let best: Flap | null = null, bestScore = Infinity;
      for (const flap of flaps) {
        if (flap.kind !== kind) continue;
        const line = flap.b.clone().sub(flap.a), from = hit.rest.clone().sub(flap.a);
        const t = from.dot(line) / line.dot(line);
        if (t < -0.08 || t > 1.08) continue;
        const outward = from.dot(flap.out), width = flap.widest * flap.open;
        if (outward < -0.0015 || outward > width + 0.006) continue;
        const score = Math.abs(outward - width * 0.4);
        if (score < bestScore) { bestScore = score; best = flap; }
      }
      if (best) return best;
    }
    return null;
  };

  const isBone = (id: string) => tierOf(id) === 'skeleton';
  /** Whether there is bone under a place: under the pointer or, on the rib cage, where the pointer may lie between two ribs. */
  const boneUnder = (hit: LabHit, wholeAgain: boolean) => {
    const bone = pickAt(isBone, wholeAgain);
    if (bone && bone.rest.distanceTo(hit.rest) < BONE_UNDER) return true;
    const along = hit.rest.clone().sub(origin).dot(axis);
    return along > body()[0] - 0.002 && along < body()[1] + 0.003;
  };

  /** Press the instrument down at the pointer. */
  const pressHere = (only?: (id: string) => boolean, wholeAgain = false) => {
    pressed = true;
    if (tool === 'forceps') rightOpen = 0.1;
    steadyPointer();
    const hit = pickAt(only, wholeAgain);
    if (!hit) return;
    const tier = tierOf(hit.id);
    const { radius } = labTool(tool);
    const refusal = cutRefusal(tool, tier);
    if (refusal) { options.onRefused(refusal); return; }
    rightGoal.copy(hit.now);
    tipAsked = true;
    switch (tool) {
      case 'scalpel': case 'scissors':
        beginStroke(hit, 'cut', radius);
        break;
      case 'bone-cutter':
        if (tier !== 'skeleton' && !boneUnder(hit, wholeAgain)) { options.onRefused(BONE_ONLY); return; }
        beginStroke(hit, 'bone', radius);
        if (stroke && tier !== 'skeleton') { const bone = pickAt(isBone, true); if (bone) stroke.structures.add(bone.id); }
        break;
      case 'forceps': {
        const flap = flapAt(hit);
        if (flap) {
          const facing = camera.position.clone().sub(hit.now).normalize();
          pull = { flap, start: flap.open, plane: new THREE.Plane().setFromNormalAndCoplanarPoint(facing, hit.now), from: hit.now.clone(), tier, id: hit.id };
        } else if (canBeGrasped(tier) && hit.id !== skinId) {
          const shading = shadingOf(hit.id);
          if (!shading) return;
          const facing = camera.position.clone().sub(hit.now).normalize();
          grasp = { id: hit.id, before: shading.uLifeShift.value.clone(), plane: new THREE.Plane().setFromNormalAndCoplanarPoint(facing, hit.now), from: hit.now.clone(), offset: shading.uLifeShift.value.clone() };
          options.onPicked(hit.id);
        } else if (canBeReflected(tier)) {
          if (!nearAnEdge(hit.rest, channelOfTier(tier))) { options.onRefused('Nothing is loose here. Make a cut, and draw back from its edge.'); return; }
          beginStroke(hit, 'reflect', radius);
        } else options.onRefused('Forceps cannot take hold of this.');
        break;
      }
      case 'probe':
        options.onPicked(hit.id);
        if (canBeParted(tier)) beginStroke(hit, 'part', radius);
        break;
      case 'ligature': {
        if (!options.isVessel(hit.id)) { options.onRefused('A ligature goes round a vessel. Find one with the probe.'); return; }
        const course = tubeNear(meshes.get(hit.id) as THREE.Mesh, hit.rest);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(Math.max(course?.radius ?? 0.0002, 0.00016) * 1.15, 0.00005, 5, 16), STITCH_MATERIAL);
        ring.position.copy(hit.now);
        ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), course?.direction ?? hit.normal);
        const step: Step = { action: { kind: 'ligate', tool, at: secondsNow(), structures: [hit.id], tier }, sweeps: [], objects: [], tied: hit.id };
        addTo(ring, step);
        tied.add(hit.id);
        history.push(step);
        options.onChange();
        lookIn = 0.3;
        report();
        changed = true;
        break;
      }
      case 'suture':
        if (volume.field.sample(0, toPoint(hit.rest)) < 0.05 && !nearAnEdge(hit.rest, 0) && !flaps.some((flap) => flap.kind === 'skin')) { options.onRefused('There is no cut in the skin here to close.'); return; }
        beginStroke(hit, 'suture', radius, true);
        break;
      case 'pin': {
        const made = createInstrument('pin')!;
        made.group.position.copy(hit.now);
        made.group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), hit.normal.clone().addScaledVector(right, 0.25).normalize());
        makeCast(made.group);
        const step: Step = { action: { kind: 'pin', tool, at: secondsNow(), structures: [hit.id], tier }, sweeps: [], objects: [] };
        addTo(made.group, step);
        history.push(step);
        report();
        changed = true;
        break;
      }
      case 'syringe': {
        reading();
        const asked = wantedGuide?.kind === 'spot' ? wantedGuide : null;
        let way = handleWay(1).negate();
        // At the angle the method asks for, keeping the hand on the side where it is.
        if (asked?.degrees !== undefined) {
          const flat = way.clone().addScaledVector(hit.normal, -way.dot(hit.normal));
          if (flat.lengthSq() > 1e-6) flat.normalize();
          const angle = THREE.MathUtils.degToRad(asked.degrees);
          way = flat.multiplyScalar(Math.cos(angle)).addScaledVector(hit.normal, -Math.sin(angle)).normalize();
        }
        // The needle goes in at its own angle to the surface; at rest the surface may lie a different way, on a limb that has been turned.
        const wayAtRest = way.clone().applyQuaternion(new THREE.Quaternion().setFromUnitVectors(hit.normal, hit.restNormal));
        const offset = hit.rest.clone().sub(origin);
        const height = offset.dot(dorsal), across = Math.abs(offset.dot(lateral));
        needle = { entry: hit.now.clone(), entryAtRest: hit.rest.clone(), way, wayAtRest, depth: 0, firstId: hit.id, side: height > middleHeight + 0.002 ? 'dorsal' : height < middleHeight && across < halfWidth ? 'ventral' : 'side', out: 0, spare: 0, speed: (asked?.mmPerSecond ?? 4) / 1000, stopsIn: (asked?.stopsIn ?? []).flatMap((id) => { const mesh = meshes.get(id); return mesh instanceof THREE.Mesh ? [mesh] : []; }), stopped: false };
        // Forceps in the left hand lift a fold of the skin, and the needle goes in beside them. What lifts the skin leaves that much more room under it before the tip reaches anything else.
        if (asked?.tent) {
          takeHold(hit, (id) => tierOf(id) === 'skin' || tierOf(id) === 'fat' || tierOf(id) === 'panniculus');
          needle.spare = leftHold.liftGoal / Math.max(0.25, -way.dot(hit.normal));
        }
        break;
      }
      case 'swab': {
        const cleaned: BloodSpot[] = [];
        for (let index = spots.length - 1; index >= 0; index--) {
          if (spots[index].mesh.position.distanceTo(hit.now) < radius + spots[index].size) { spots[index].mesh.visible = false; cleaned.push(spots[index]); spots.splice(index, 1); }
        }
        if (!cleaned.length) { options.onRefused('There is no blood here.'); return; }
        history.push({ action: { kind: 'swab', tool, at: secondsNow(), structures: [hit.id] }, sweeps: [], objects: [], cleaned });
        report();
        changed = true;
        break;
      }
      default: break;
    }
  };

  /** What a needle has passed through, and what its tip lies in, from the surfaces of the model at rest. A closed surface crossed an odd number of times on the way out has the tip inside it. */
  const inspectNeedle = (from: THREE.Vector3, way: THREE.Vector3, depth: number) => {
    const start = from.clone().addScaledVector(way, -0.0001), tip = from.clone().addScaledVector(way, depth);
    const passed: string[] = [], lying: string[] = [];
    const along = new THREE.Raycaster(start, way, 0, depth + 0.0001), out = new THREE.Raycaster(tip, new THREE.Vector3(0.31, 0.57, 0.76).normalize());
    for (const [id, mesh] of meshes) {
      if (!(mesh instanceof THREE.Mesh) || id === 'living:vibrissae') continue;
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      const bounds = mesh.geometry.boundingBox!.clone().applyMatrix4(mesh.matrixWorld);
      const hitsLine = along.ray.intersectsBox(bounds) && (bounds.containsPoint(start) || bounds.distanceToPoint(start) < depth + 0.0002);
      if (hitsLine && along.intersectObject(mesh, false).length > 0) passed.push(id);
      if (bounds.containsPoint(tip) && out.intersectObject(mesh, false).length % 2 === 1) lying.push(id);
    }
    return { passed, lying };
  };
  const finishNeedle = () => {
    if (!needle || needle.out > 0) return;
    const n = needle;
    n.out = 1;
    letGo();
    if (n.depth < 0.0002) { needle = null; return; }
    const { passed, lying } = inspectNeedle(n.entryAtRest, n.wayAtRest, Math.max(Math.min(n.depth, 0.0004), n.depth - n.spare));
    const offset = n.entryAtRest.clone().sub(origin), [, diaphragm, , sacrum] = body();
    const along = offset.dot(axis);
    const step: Step = { action: { kind: 'inject', tool: 'syringe', at: secondsNow(), structures: passed, tier: tierOf(n.firstId), tipIn: lying, depthMm: n.depth * 1000, leftMm: offset.dot(lateral) * toLeft * 1000, abdomenShare: (along - diaphragm) / (sacrum - diaphragm), side: n.side, asideMm: Math.abs(offset.dot(lateral)) * 1000, fromMm: along * 1000, toMm: along * 1000 }, sweeps: [], objects: [] };
    // It leaves a small mark where it went in.
    const dot = new THREE.Mesh(BLOOD_GEOMETRY, BLOOD_MATERIAL);
    dot.position.copy(n.entry);
    dot.scale.setScalar(0.00018);
    addTo(dot, step);
    history.push(step);
    lookIn = 0.3;
    report();
  };
  const finishPull = () => {
    if (!pull) return;
    const { flap, start, tier, id } = pull;
    pull = null;
    flap.goal = flap.open;
    if (Math.abs(flap.open - start) > 0.01) {
      history.push({ action: { kind: 'reflect', tool: 'forceps', at: secondsNow(), structures: [id], tier, flap: { kind: flap.kind, side: flap.side, open: flap.open }, lengthMm: flap.widest * Math.abs(flap.open - start) * 2000 }, sweeps: [], objects: [], drewFlap: { flap, before: start } });
      lookIn = 0.3;
      report();
    }
  };
  const liftOff = () => {
    if (!pressed) return;
    pressed = false;
    finishNeedle();
    finishPull();
    if (tool === 'forceps') rightOpen = 0.8;
    if (tool === 'scissors' || tool === 'bone-cutter' || tool === 'suture') rightOpen = 0.6;
    if (stroke) endStroke();
    if (grasp) {
      const hold = grasp;
      grasp = null;
      const shading = shadingOf(hold.id);
      if (shading && shading.uLifeShift.value.distanceTo(hold.before) > 0.0003) {
        history.push({ action: { kind: 'move', tool: 'forceps', at: secondsNow(), structures: [hold.id], lengthMm: shading.uLifeShift.value.distanceTo(hold.before) * 1000 }, sweeps: [], objects: [], moved: { id: hold.id, before: hold.before } });
        lookIn = 0.3;
        report();
      }
    }
  };

  const note = (event: PointerEvent) => {
    tipAsked = true;
    const rect = dom.getBoundingClientRect(), view = size();
    pointer.x = (event.clientX - rect.left) / rect.width * view.x;
    pointer.y = (event.clientY - rect.top) / rect.height * view.y;
    pointer.moved = true;
    pointer.inside = true;
  };
  const press = (event: PointerEvent) => {
    if (robot) return;
    note(event);
    if (event.button !== 0 || tool === 'hand' || swap) return;
    pressHere();
  };
  const move = (event: PointerEvent) => { if (!robot) note(event); };
  const leave = () => { if (robot) return; pointer.inside = false; tipAsked = false; overBody = false; options.onHover(null); };
  const release = () => { if (!robot) liftOff(); };
  const controlsEnd = () => { lookIn = 0.25; };
  dom.addEventListener('pointerdown', press);
  dom.addEventListener('pointermove', move);
  dom.addEventListener('pointerleave', leave);
  window.addEventListener('pointerup', release);
  controls.addEventListener('end', controlsEnd);
  const savedButtons = { ...controls.mouseButtons }, savedZoomToCursor = controls.zoomToCursor;
  controls.zoomToCursor = true;

  const rebuild = () => {
    volume.field.clear();
    for (const step of history) for (const sweep of step.sweeps) {
      if (sweep.points.length === 1) volume.field.sweep(sweep.channel, sweep.points[0], sweep.points[0], sweep.radius, sweep.restore);
      for (let index = 1; index < sweep.points.length; index++) {
        const a = sweep.points[index - 1], b = sweep.points[index];
        if (Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < LONGEST_STEP) volume.field.sweep(sweep.channel, a, b, sweep.radius, sweep.restore);
      }
    }
    // The freed edges of a lid belong to the lid.
    for (const flap of flaps) freeLid(flap, (channel, from, to, radius) => volume.field.sweep(channel, from, to, radius));
    volume.refresh();
  };

  const dishPlace = (id: string) => {
    let slot = dishSlots.get(id);
    if (slot === undefined) { slot = dishSlots.size; dishSlots.set(id, slot); }
    const angle = slot * 2.399963, reach = 0.0085 * Math.sqrt(slot);
    const mesh = meshes.get(id)!;
    const bounds = new THREE.Box3().setFromObject(mesh);
    const height = bounds.getSize(new THREE.Vector3()).dot(new THREE.Vector3(Math.abs(dorsal.x), Math.abs(dorsal.y), Math.abs(dorsal.z)));
    return benchPoint(dishAt.x + Math.cos(angle) * reach, dishAt.y + Math.sin(angle) * reach, height / 2 + 0.0006).sub(bounds.getCenter(new THREE.Vector3()));
  };

  const undoStep = (step: Step) => {
    for (const object of step.objects) {
      left.remove(object);
      const spot = spots.findIndex((item) => item.mesh === object);
      if (spot >= 0) spots.splice(spot, 1);
      if (object instanceof THREE.Group) disposeInstrument(object);
      else if (object instanceof THREE.Mesh && object.geometry !== BLOOD_GEOMETRY && object.geometry !== STITCH_GEOMETRY) object.geometry.dispose();
    }
    if (step.took) {
      taken.delete(step.took);
      dishSlots.delete(step.took);
      const shading = shadingOf(step.took);
      if (shading) { shading.uLifeShift.value.set(0, 0, 0); shading.uLifeTaken.value = 0; }
      options.onChange();
    }
    if (step.moved) shadingOf(step.moved.id)?.uLifeShift.value.copy(step.moved.before);
    if (step.tied) { if (!history.some((other) => other.tied === step.tied)) tied.delete(step.tied); options.onChange(); }
    if (step.cleaned) for (const spot of step.cleaned) { spot.mesh.visible = true; spots.push(spot); }
    if (step.drewFlap) step.drewFlap.flap.goal = step.drewFlap.before;
    if (step.madeFlaps) {
      for (const flap of step.madeFlaps) { const at = flaps.indexOf(flap); if (at >= 0) flaps.splice(at, 1); flap.sheet?.dispose(); flap.plate?.geometry.dispose(); }
      removeSheets(step.madeFlaps);
      if (step.joinedFlaps) { flaps.push(...step.joinedFlaps); addSheets(step.joinedFlaps); }
      writeFlaps();
    }
  };

  const flapOfRobot = (kind: FlapKind, side: 1 | -1) => [...flaps].reverse().find((flap) => flap.kind === kind && flap.side === side) ?? [...flaps].reverse().find((flap) => flap.kind === kind) ?? null;
  /** Where the cut edge of a flap lies now, in the middle of its length. */
  const flapEdge = (flap: Flap) => {
    if (flap.sheet) return flap.sheet.edge();
    const middle = flap.a.clone().lerp(flap.b, 0.5), hinge = middle.clone().addScaledVector(flap.out, flap.widest);
    return middle.sub(hinge).applyAxisAngle(new THREE.Vector3().crossVectors(flap.up, flap.out).normalize(), flap.open * lidTurn(flap)).add(hinge);
  };

  /** A place at some share of the length of a structure on one side of the animal, found from its surface. */
  const structureLines = new Map<string, THREE.Vector3[]>();
  const onStructure = (id: string, side: 1 | -1, at: number) => {
    const key = `${id}|${side}`;
    let line = structureLines.get(key);
    if (!line) {
      line = [];
      const mesh = meshes.get(id);
      if (mesh instanceof THREE.Mesh) {
        const position = mesh.geometry.getAttribute('position'), point = new THREE.Vector3(), near: THREE.Vector3[] = [];
        const paired = /arteries|veins|nerves|femoris|muscle-/.test(id);
        for (let index = 0; index < position.count; index++) {
          point.fromBufferAttribute(position, index).applyMatrix4(mesh.matrixWorld);
          if (!paired || point.clone().sub(origin).dot(lateral) * toLeft * side > 0) near.push(point.clone());
        }
        if (near.length) {
          // Along the longest way of what was found, from the end nearer the head.
          const middle = near.reduce((sum, value) => sum.add(value), new THREE.Vector3()).multiplyScalar(1 / near.length);
          const direction = new THREE.Vector3(0.3, 0.7, 0.2);
          for (let round = 0; round < 10; round++) {
            const next = new THREE.Vector3();
            for (const value of near) { const from = value.clone().sub(middle); next.addScaledVector(from, from.dot(direction)); }
            if (next.lengthSq() > 1e-18) direction.copy(next.normalize());
          }
          if (direction.dot(axis) < 0) direction.negate();
          const values = near.map((value) => value.clone().sub(middle).dot(direction));
          const low = Math.min(...values), high = Math.max(...values), bins = 16;
          const sums = Array.from({ length: bins }, () => ({ sum: new THREE.Vector3(), count: 0 }));
          near.forEach((value, index) => { const bin = sums[Math.min(bins - 1, Math.floor((values[index] - low) / (high - low || 1) * bins))]; bin.sum.add(value); bin.count++; });
          for (const bin of sums) if (bin.count) line.push(bin.sum.multiplyScalar(1 / bin.count));
        }
      }
      structureLines.set(key, line);
    }
    if (!line.length) return bodyMiddle.clone();
    // Beyond its ends a share goes on along the line, for a place over the same course.
    const position = at * (line.length - 1), low = Math.max(0, Math.min(line.length - 2, Math.floor(position))), high = Math.min(line.length - 1, low + 1);
    return line[low].clone().lerp(line[high], position - low);
  };
  const place = (spot: DemoPlace): THREE.Vector3 => {
    if ('of' in spot) { const on = spot as OnStructure; return onStructure(on.of, on.side, on.at); }
    const [mark, along, side, height = 0] = spot;
    const [chest, diaphragm, loin, sacrum] = body();
    const start = mark === 'chest' ? chest : mark === 'diaphragm' ? diaphragm : mark === 'loin' ? loin : sacrum;
    return origin.clone().addScaledVector(axis, start + along / 1000).addScaledVector(lateral, toLeft * side / 1000).addScaledVector(dorsal, undersideOffset + height / 1000);
  };
  /** The surface of the animal over a place, as seen from the eye. The place itself may lie under it. */
  const surfaceOver = (rest: THREE.Vector3) => {
    const eye = nowWay(rest, toEye, true).normalize();
    surfaceRay.set(rest.clone().addScaledVector(eye, 0.05), eye.clone().negate());
    surfaceRay.far = 0.1;
    return surfaceRay.intersectObject(skin, false)[0] ?? null;
  };
  const pointerTo = (point: THREE.Vector3) => {
    tipAsked = true;
    const view = size(), projected = nowOf(point).project(camera);
    pointer.x = (projected.x + 1) / 2 * view.x;
    pointer.y = (1 - projected.y) / 2 * view.y;
    pointer.moved = true;
    pointer.inside = true;
  };
  const pathPoint = (path: readonly THREE.Vector3[], distance: number) => {
    let remaining = distance;
    for (let index = 1; index < path.length; index++) {
      const length = path[index].distanceTo(path[index - 1]);
      if (remaining <= length) return path[index - 1].clone().lerp(path[index], remaining / (length || 1));
      remaining -= length;
    }
    return path[path.length - 1].clone();
  };
  const seenPointOf = (ids: readonly string[]) => {
    const view = size();
    const found = options.seen().filter((item) => ids.includes(item.id)).sort((a, b) => b.pixels - a.pixels)[0];
    return found ? { x: found.x * view.x, y: found.y * view.y } : null;
  };
  const driveRobot = (delta: number) => {
    if (!robot) return;
    const r = robot;
    r.seconds += delta;
    const advance = () => { r.index++; r.seconds = 0; r.stage = 0; r.travelled = 0; r.total = 0; r.path = []; r.ends = null; r.flap = null; };
    if (r.index < 0) advance();
    const step = r.steps[r.index];
    // When they have finished, the hands draw back and leave the view clear.
    if (!step) { robot = null; steady = steadyWanted; tipAsked = false; overBody = false; pointer.inside = false; options.onCaption(null); options.onHover(null); report(); return; }
    switch (step.kind) {
      case 'say': options.onCaption(step.text); advance(); break;
      case 'wait': if (r.seconds >= step.seconds) advance(); break;
      case 'pose': session.setPose(step.pose); advance(); break;
      case 'view': { const { position, target, up } = session.viewOf(step.view); options.moveView(position, target, up); advance(); break; }
      case 'stroke':
        if (r.stage === 0) {
          session.setTool(step.tool);
          r.path = step.points.map(place);
          r.total = r.path.reduce((sum, point, index) => index ? sum + point.distanceTo(r.path[index - 1]) : 0, 0);
          r.stage = 1; r.seconds = 0;
        } else if (r.stage === 1) {
          // Bring the tip to the start of the line.
          pointerTo(r.path[0]);
          if (!swap && r.seconds > 0.45) {
            const channels = new Set(step.tiers.map(channelOfTier));
            pressHere((id) => channels.has(channelOfTier(tierOf(id))), true);
            r.stage = 2; r.seconds = 0;
          }
        } else {
          r.travelled = Math.min(r.total, r.travelled + step.mmPerSecond / 1000 * delta);
          pointerTo(pathPoint(r.path, r.travelled));
          if (r.travelled >= r.total) { liftOff(); advance(); }
        }
        break;
      case 'pull':
        if (r.stage === 0) { session.setTool('forceps'); r.flap = flapOfRobot(step.flap, step.side); r.stage = 1; r.seconds = 0; if (!r.flap) advance(); }
        else if (r.stage === 1) {
          if (!r.flap) { advance(); break; }
          tipAsked = true;
          rightGoal.copy(flapEdge(r.flap));
          pointer.inside = true; overBody = true;
          if (!swap && r.seconds > 0.55) { r.stage = 2; r.seconds = 0; r.from = r.flap.open; rightOpen = 0.1; pressed = true; }
        } else {
          if (!r.flap) { advance(); break; }
          const share = Math.min(1, r.seconds / 1.5);
          r.flap.open = r.from + (step.open - r.from) * share * share * (3 - 2 * share);
          r.flap.goal = r.flap.open;
          writeFlaps();
          rightGoal.copy(flapEdge(r.flap));
          if (share >= 1) {
            pressed = false; rightOpen = 0.8;
            const flap = r.flap;
            history.push({ action: { kind: 'reflect', tool: 'forceps', at: secondsNow(), structures: [flap.kind === 'skin' ? skinId : flap.kind === 'wall' ? 'living:abdominal-wall' : flap.kind === 'chest' ? 'living:bone-xiphisternum' : 'living:bone-parietal'], tier: flap.kind === 'skin' ? 'skin' : flap.kind === 'wall' ? 'inner-muscle' : 'skeleton', flap: { kind: flap.kind, side: flap.side, open: flap.open }, lengthMm: flap.widest * Math.abs(flap.open - r.from) * 2000 }, sweeps: [], objects: [], drewFlap: { flap, before: r.from } });
            lookIn = 0.3;
            report();
            advance();
          }
        }
        break;
      case 'touch':
        if (r.stage === 0) { session.setTool(step.tool); r.path = [place(step.place)]; r.stage = 1; r.seconds = 0; }
        else if (r.stage === 1) {
          pointerTo(r.path[0]);
          if (!swap && r.seconds > 0.6) {
            const named = new Set(step.ids);
            pressHere(step.ids.length ? (id) => named.has(id) : undefined);
            r.stage = 2; r.seconds = 0;
          }
        } else if (step.depthMm ? (needle?.depth ?? 0) * 1000 >= step.depthMm || needle?.stopped || r.seconds > 8 || !needle : r.seconds >= 0.25) { liftOff(); advance(); }
        break;
      case 'move':
        if (r.stage === 0) { session.setTool('forceps'); r.stage = 1; r.seconds = 0; }
        else if (r.stage === 1) {
          if (swap || r.seconds < 0.5) break;
          const point = seenPointOf(step.ids);
          if (!point) { advance(); break; }
          pointer.x = point.x; pointer.y = point.y; pointer.moved = true; pointer.inside = true; tipAsked = true;
          const named = new Set(step.ids);
          pressHere((id) => named.has(id));
          r.stage = 2; r.seconds = 0;
          if (grasp) r.ends = grasp.from.clone().addScaledVector(axis, step.along / 1000).addScaledVector(lateral, toLeft * step.side / 1000);
        } else {
          if (!grasp || !r.ends) { liftOff(); advance(); break; }
          const share = Math.min(1, r.seconds / 1.3);
          pointerTo(grasp.from.clone().lerp(r.ends, share * share * (3 - 2 * share)));
          if (share >= 1) { liftOff(); advance(); }
        }
        break;
      case 'take':
        if (r.stage === 0) { session.setTool('forceps'); r.stage = 1; r.seconds = 0; }
        else if (r.stage === 1) {
          if (swap || r.seconds < 0.6) break;
          session.take(step.id);
          r.stage = 2;
        } else if (!carry) advance();
        break;
      default: advance();
    }
  };

  const clearGuide = () => {
    for (const child of [...guideRoot.children]) { guideRoot.remove(child); if (child instanceof THREE.Mesh && child.geometry !== GUIDE_DOT) child.geometry.dispose(); }
    for (const id of guideFind) { const shading = shadingOf(id); if (shading) shading.uRim.value = 0; }
    guideLine = []; guideFind = []; guideEdge = null;
  };
  let wantedGuide: LabGuide | null = null, guideDrawnFor = '', guideSettle = 0, findWaited = 0;
  // Where cuts have been made along marked lines, where the fur stays parted.
  const partedLines: PartedLine[] = [];
  /** The marked line, for parting the fur: its ends, and the way out of the skin. */
  const linePart = (): PartedLine => {
    const out = new THREE.Vector3();
    for (const point of [guideLine[0], guideLine[Math.floor(guideLine.length / 2)], guideLine[guideLine.length - 1]]) {
      const hit = surfaceOver(point);
      if (hit?.face) out.add(hit.face.normal.clone().transformDirection(skin.matrixWorld));
    }
    return [guideLine[0].clone(), guideLine[guideLine.length - 1].clone(), out.lengthSq() > 0 ? out.normalize() : toEye.clone()];
  };
  /** The point of the skin that is seen over a place, as the animal now lies, from where the eye now is. */
  const skinOver = (rest: THREE.Vector3) => {
    const view = size(), seen = nowOf(rest).project(camera), x = (seen.x + 1) / 2 * view.x, y = (1 - seen.y) / 2 * view.y;
    if (x >= 0 && y >= 0 && x < view.x && y < view.y) {
      const wasX = pointer.x, wasY = pointer.y;
      pointer.x = x; pointer.y = y;
      const hit = pickAt((id) => id === skinId, true);
      pointer.x = wasX; pointer.y = wasY;
      if (hit) return hit.rest;
    }
    return surfaceOver(rest)?.point ?? rest;
  };
  const drawGuide = () => {
    clearGuide();
    guideSettle = 0;
    const guide = wantedGuide;
    guideDrawnFor = JSON.stringify([guide, pose]);
    if (!guide) return;
    reading();
    if (guide.kind === 'line') {
      const stations = guide.points.map(place);
      const line: THREE.Vector3[] = [];
      for (let index = 1; index < stations.length; index++) {
        const length = stations[index].distanceTo(stations[index - 1]), parts = Math.max(1, Math.round(length / 0.0016));
        for (let part = 0; part <= parts; part++) line.push(stations[index - 1].clone().lerp(stations[index], part / parts));
      }
      for (const point of line) {
        const at = skinOver(point);
        guideLine.push(at.clone());
        const dot = new THREE.Mesh(GUIDE_DOT, GUIDE_MATERIAL);
        dot.renderOrder = 8;
        dot.userData.rest = at.clone();
        guideRoot.add(dot);
      }
      // The fur is parted along the line.
      const parted = [...partedLines];
      if (guideLine.length >= 2) parted.push(linePart());
      partFur(parted.slice(-4));
    } else if (guide.kind === 'spot') {
      const point = place(guide.place), at = skinOver(point);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(guide.radiusMm / 1000, 0.00022, 8, 40), GUIDE_MATERIAL);
      ring.renderOrder = 8;
      ring.userData.rest = at.clone();
      ring.userData.face = true;
      guideRoot.add(ring);
      guideLine = [at.clone(), at.clone().addScaledVector(axis, 0.00001)];
    } else if (guide.kind === 'find') guideFind = [...guide.ids];
    else guideEdge = guide.flap;
    changed = true;
  };
  const edgeMarks: THREE.Mesh[] = [];

  const session: LabSession = {
    volume,
    taken,
    tied,
    plates: () => flaps.flatMap((flap) => flap.plate && flap.plate.visible ? [flap.plate] : []),
    setTool(next) {
      if (next === (swap?.next ?? tool)) return;
      if (stroke) endStroke();
      liftOff();
      swap = { t: 0, next, done: false };
      const free = next === 'hand';
      // With an instrument in hand the left button is the hand holding it; the right button turns the view.
      controls.mouseButtons.LEFT = free ? THREE.MOUSE.ROTATE : (null as unknown as THREE.MOUSE);
      controls.mouseButtons.RIGHT = THREE.MOUSE.ROTATE;
      dom.style.cursor = free ? '' : 'crosshair';
      pointer.moved = true;
      changed = true;
      report();
    },
    setPose(next) {
      pose = next;
      splayGoal = next === 'on-back' ? SPLAY : 0;
      placeBench();
      for (const id of taken) shadingOf(id)?.uLifeShift.value.copy(dishPlace(id));
      changed = true;
      lookIn = 1.4;
      report();
    },
    extendLeg(side) {
      const leg = side === null ? -1 : hindLeg(side);
      for (let index = 0; index < 4; index++) legGoals[index] = index === leg ? LEG_TAPED_DOWN : 0;
      lookIn = 1.4;
      changed = true;
    },
    viewOf(view) {
      // Always from above the bench, looking towards the head from a little behind, as one stands at the bench. The way up turns over with the animal.
      const above = benchNormal();
      const reach = VIEW_REACH[view];
      const target = bodyMiddle.clone();
      const position = new THREE.Vector3();
      const fromAbove = (tilt: number) => position.copy(target).addScaledVector(above, reach).addScaledVector(axis, reach * tilt);
      const surface = pose === 'on-back' ? undersideOffset : LIFE_SHARED.uLifeSpine.value.y;
      if (view === 'belly' || view === 'close' || view === 'back') {
        target.copy(origin).addScaledVector(axis, (body()[0] + body()[3]) / 2 + (view === 'close' ? 0.004 : 0)).addScaledVector(dorsal, surface);
        fromAbove(0.1);
      } else if (view === 'chest') {
        target.copy(origin).addScaledVector(axis, (body()[0] + body()[1]) / 2 + 0.002).addScaledVector(dorsal, surface);
        fromAbove(0.1);
      } else if (view === 'left-thigh' || view === 'femoral') {
        target.copy(nowOf(onStructure('living:femoral-arteries', 1, 0.5)));
        fromAbove(0.1);
      } else if (view === 'spleen') {
        // Looking across from the middle of the body, under the edge of the wall.
        target.copy(origin).addScaledVector(axis, body()[1] + 0.005).addScaledVector(lateral, toLeft * 0.006).addScaledVector(dorsal, surface);
        position.copy(target).addScaledVector(above, reach * 0.86).addScaledVector(lateral, -toLeft * reach * 0.5).addScaledVector(axis, reach * 0.1);
      } else if (view === 'head') {
        target.copy(origin).addScaledVector(forward, 0.004).addScaledVector(dorsal, pose === 'on-back' ? -0.006 : 0.006);
        fromAbove(0.14);
      } else {
        // From the side and well above, so that the instruments on the tray do not come between.
        if (view === 'left-close') target.addScaledVector(axis, 0.012);
        position.copy(target).addScaledVector(lateral, reach * (view === 'left-close' ? 0.9 : 0.74) * toLeft * (view === 'right' ? -1 : 1)).addScaledVector(above, reach * (view === 'left-close' ? 0.42 : 0.66));
      }
      // A tutorial lies over the right of the view: what is being worked on comes to the middle of what can be seen.
      const covered = options.covered();
      if (covered > 0) {
        const look = target.clone().sub(position), side = new THREE.Vector3().crossVectors(look, above).normalize();
        const wide = 2 * look.length() * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * camera.aspect;
        position.addScaledVector(side, wide * covered / 2);
        target.addScaledVector(side, wide * covered / 2);
      }
      return { position, target, up: above };
    },
    take(id) {
      if (taken.has(id) || id === skinId || carry) return;
      const shading = shadingOf(id), mesh = meshes.get(id);
      if (!shading || !mesh) return;
      const step: Step = { action: { kind: 'remove', tool: 'forceps', at: secondsNow(), structures: [id], tier: tierOf(id) }, sweeps: [], objects: [], took: id };
      taken.add(id);
      shading.uLifeTaken.value = 1;
      history.push(step);
      carry = { id, from: shading.uLifeShift.value.clone(), to: dishPlace(id), t: 0, step };
      if ((swap?.next ?? tool) !== 'forceps') session.setTool('forceps');
      rightOpen = 0.12;
      options.onChange();
      lookIn = 0.3;
      report();
      changed = true;
    },
    undo() {
      if (robot) return;
      if (stroke) endStroke();
      openings.length = 0;
      const step = history.pop();
      if (!step) return;
      undoStep(step);
      if (step.sweeps.length || step.madeFlaps) { rebuild(); edgeStale = true; }
      drawGuide();
      report();
      changed = true;
    },
    restart() {
      stroke = null; grasp = null; pull = null; pressed = false; carry = null; needle = null;
      letGo();
      openings.length = 0;
      while (history.length) undoStep(history.pop()!);
      removeSheets(flaps);
      for (const flap of flaps) { flap.sheet?.dispose(); flap.plate?.geometry.dispose(); }
      for (const spot of [...spots]) left.remove(spot.mesh);
      spots.length = 0;
      tied.clear();
      seenEver.clear();
      flaps.length = 0;
      writeFlaps();
      partedLines.length = 0;
      partFur([]);
      for (const id of meshes.keys()) { const shading = shadingOf(id); if (shading) { shading.uLifeShift.value.set(0, 0, 0); shading.uLifeTaken.value = 0; } }
      rebuild();
      drawGuide();
      edgeStale = true;
      options.onChange();
      report();
      changed = true;
    },
    demonstrate(id) {
      const exercise = LAB_EXERCISES.find((item) => item.id === id);
      if (!exercise) return;
      session.restart();
      const steps: RobotStep[] = [];
      let lastView: LabView | null = null;
      for (const step of exercise.steps) {
        steps.push({ kind: 'say', text: step.text }, ...step.show.filter((part) => part.kind === 'pose'));
        if (step.view && step.view !== lastView) { steps.push({ kind: 'view', view: step.view }); lastView = step.view; }
        steps.push(...step.show.filter((part) => part.kind !== 'pose'));
      }
      steadyWanted = steady; steady = false;
      robot = { steps, index: -1, seconds: 0, stage: 0, travelled: 0, total: 0, path: [], ends: null, flap: null, from: 0 };
      tipAsked = false; overBody = false;
      pointer.inside = true;
      options.onHover(null);
      report();
    },
    showStep(steps, caption) {
      if (robot) return;
      steadyWanted = steady; steady = false;
      robot = { steps: caption ? [{ kind: 'say', text: caption }, ...steps, { kind: 'wait', seconds: 0.4 }] : steps, index: -1, seconds: 0, stage: 0, travelled: 0, total: 0, path: [], ends: null, flap: null, from: 0 };
      pointer.inside = true;
      options.onHover(null);
      report();
    },
    stopDemonstration() {
      if (!robot) return;
      robot = null;
      steady = steadyWanted;
      tipAsked = false; overBody = false; pointer.inside = false;
      liftOff();
      options.onCaption(null);
      report();
    },
    setGuide(guide) {
      wantedGuide = guide;
      drawGuide();
      // Once the view and the animal have come to rest, the marks are laid again from there.
      guideSettle = 1.2;
    },
    setSteady(on) { steady = on; steadyWanted = on; },
    look() { lookIn = 0.1; },
    update(delta, passed = delta) {
      waited += delta;
      clock += delta;
      let now = false;
      // On a slow machine the hands and instruments keep to the time that has really passed, and do not fall behind.
      const moment = Math.min(passed, 0.25);
      // What a pixel of the view measures at unit distance.
      CUT_SHARED.uCutPixel.value = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) / Math.max(1, size().y);
      reading();
      // The blood spreads slowly until it has found its size.
      for (const spot of spots) {
        if (spot.size < spot.most) {
          spot.size = Math.min(spot.most, spot.size + spot.rate * delta);
          spot.mesh.scale.set(spot.size, spot.size, Math.max(0.00006, spot.size * 0.22));
          now = true;
        }
      }
      if (splay !== splayGoal) {
        const reach = delta * 0.9;
        splay = Math.abs(splayGoal - splay) <= reach ? splayGoal : splay + Math.sign(splayGoal - splay) * reach;
        LIFE_SHARED.uLifeSplay.value = splay;
        for (const flap of flaps) flap.sheet?.invalidate();
        writeFlaps();
        now = true;
      }
      let legMoved = false;
      LIFE_SHARED.uLifeLegOut.value.forEach((angle, leg) => {
        if (angle === legGoals[leg]) return;
        const reach = delta * 0.9;
        LIFE_SHARED.uLifeLegOut.value[leg] = Math.abs(legGoals[leg] - angle) <= reach ? legGoals[leg] : angle + Math.sign(legGoals[leg] - angle) * reach;
        legMoved = true;
      });
      if (legMoved) {
        for (const flap of flaps) flap.sheet?.invalidate();
        writeFlaps();
        now = true;
      }
      // Flaps settle to where they have been left: a fresh cut draws apart by itself.
      let moved = false;
      for (const flap of flaps) if (flap.open !== flap.goal && !(pull && pull.flap === flap)) {
        const step = delta * 0.7;
        flap.open = Math.abs(flap.goal - flap.open) <= step ? flap.goal : flap.open + Math.sign(flap.goal - flap.open) * step;
        moved = true;
      }
      if (moved) { writeFlaps(); now = true; lookIn = Math.max(lookIn, 0.25); }
      // Cut edges draw apart once the cut is made.
      for (let index = openings.length - 1; index >= 0; index--) {
        const job = openings[index];
        job.t = Math.min(1, job.t + delta / 0.7);
        const radius = job.from + (job.to - job.from) * job.t * (2 - job.t);
        for (const sweep of job.sweeps) { sweep.radius = radius; volume.sweepPath(sweep.channel, sweep.points, radius, LONGEST_STEP); }
        if (job.t >= 1) openings.splice(index, 1);
        now = true;
      }
      // An instrument is put back on the tray and another taken from it.
      if (swap) {
        swap.t = Math.min(1, swap.t + moment / 0.85);
        if (swap.t >= 0.5 && !swap.done) {
          swap.done = true;
          const last = trayCopies.get(tool);
          if (last) last.visible = true;
          if (instrument) instrument.group.visible = false;
          tool = swap.next;
          instrument = heldInstrument(tool);
          if (instrument) { instrument.group.visible = true; rightOpen = instrument.grip === 'rings' ? 0.6 : 0.8; }
          const next = trayCopies.get(tool);
          if (next) next.visible = false;
        }
        if (swap.t >= 1) swap = null;
        now = true;
      }
      if (carry) {
        // The right hand lifts it out and carries it over, in an arc.
        carry.t = Math.min(1, carry.t + delta / 1.8);
        const shading = shadingOf(carry.id);
        const ease = carry.t * carry.t * (3 - 2 * carry.t);
        const shift = carry.from.clone().lerp(carry.to, ease).addScaledVector(benchNormal(), 0.03 * Math.sin(Math.PI * ease));
        shading?.uLifeShift.value.copy(shift);
        const bounds = new THREE.Box3().setFromObject(meshes.get(carry.id)!);
        rightGoal.copy(bounds.getCenter(new THREE.Vector3())).add(shift);
        overBody = true;
        if (carry.t >= 1) { carry = null; rightOpen = 0.8; lookIn = 0.3; report(); }
        now = true;
      } else if (stroke || grasp || pull) {
        if (pointer.moved && waited >= 1 / 40) {
          waited = 0;
          pointer.moved = false;
          if (stroke) continueStroke();
          else if (pull) {
            const at = pointerRayHits(pull.plane);
            if (at) {
              const flap = pull.flap;
              flap.open = Math.max(0, Math.min(1, pull.start + at.clone().sub(pull.from).dot(nowWay(flap.a, flap.out)) / (2 * flap.widest)));
              flap.goal = flap.open;
              writeFlaps();
              rightGoal.copy(at);
              changed = true;
            }
          } else if (grasp) {
            const at = pointerRayHits(grasp.plane);
            if (at) {
              const shift = grasp.offset.clone().add(at.clone().sub(grasp.from)).clampLength(0, MOST_MOVED);
              shadingOf(grasp.id)?.uLifeShift.value.copy(shift);
              rightGoal.copy(at);
              changed = true;
            }
          }
        }
      } else if (pointer.moved && pointer.inside && waited >= 1 / 14 && tool !== 'hand') {
        waited = 0;
        pointer.moved = false;
        const hit = pickAt();
        if (hit) {
          rightGoal.copy(hit.now).addScaledVector(hit.normal, MOVE_LIFT);
          overBody = true;
          if (!robot) options.onHover({ id: hit.id, x: pointer.x, y: pointer.y });
        } else {
          const off = pointOnPlane();
          if (off) rightGoal.copy(off);
          overBody = false;
          options.onHover(null);
        }
      }
      // Held down, the needle goes on in, and when let go it comes straight out.
      if (needle) {
        if (needle.out === 0) {
          if (!needle.stopped) needle.depth = Math.min(0.016, needle.depth + needle.speed * moment);
          rightGoal.copy(needle.entry).addScaledVector(needle.way, needle.depth);
          // A steady hand stops once the tip lies in what it was going for.
          if ((steadyWanted || robot) && !needle.stopped && needle.stopsIn.length && needle.depth > 0.0003) {
            const tip = needle.entryAtRest.clone().addScaledVector(needle.wayAtRest, needle.depth);
            surfaceRay.set(tip, new THREE.Vector3(0.31, 0.57, 0.76).normalize());
            surfaceRay.far = Infinity;
            needle.stopped = needle.stopsIn.some((mesh) => surfaceRay.intersectObject(mesh, false).length % 2 === 1);
          }
        } else {
          needle.depth = Math.max(0, needle.depth - 0.012 * moment);
          rightGoal.copy(needle.entry).addScaledVector(needle.way, needle.depth);
          if (needle.depth <= 0) needle = null;
        }
        element.dataset.needle = (needle?.depth ?? 0).toFixed(4);
        now = true;
      }
      driveRobot(Math.min(passed, 1));
      // The rolled edge of the skin follows the cut, a few times a second.
      edgeWaited += delta;
      if (stroke && stroke.sweeps.some((sweep) => sweep.channel === 0)) edgeStale = true;
      if (openings.length) edgeStale = true;
      if (edgeStale && edgeWaited > 0.2) { edgeWaited = 0; edgeStale = false; skinEdge.refresh(flaps.filter((flap) => flap.kind === 'skin').map((flap) => [flap.a, flap.b] as const)); now = true; }
      // What is marked on the animal: it pulses gently, and moves with the legs.
      if (wantedGuide && guideDrawnFor !== JSON.stringify([wantedGuide, pose])) { drawGuide(); guideSettle = 1.2; }
      if (guideSettle > 0) { guideSettle -= moment; if (guideSettle <= 0 && !stroke && !robot) drawGuide(); }
      if (guideRoot.children.length) {
        GUIDE_MATERIAL.opacity = 0.75 + 0.25 * Math.sin(clock * 3.5);
        for (const child of guideRoot.children) {
          const rest = child.userData.rest as THREE.Vector3;
          child.position.copy(nowOf(rest)).addScaledVector(toEye, 0.0016);
          if (child.userData.face) child.quaternion.copy(camera.quaternion);
        }
        now = true;
      }
      if (guideFind.length) {
        for (const id of guideFind) { const shading = shadingOf(id); if (shading) shading.uRim.value = 0.55 + 0.45 * Math.sin(clock * 3.5); }
        now = true;
        // While something is being looked for, look again every little while, whatever the hands are doing.
        findWaited += moment;
        if (findWaited > 1 && !stroke && !grasp && !pull && guideFind.some((id) => !seenEver.has(id))) { findWaited = 0; lookIn = Math.max(lookIn, 0.05); }
      }
      // The cut edges to take hold of are marked by a pulsing point on each that has not been drawn back.
      const edgesWanted = guideEdge ? flaps.filter((flap) => flap.kind === guideEdge && flap.open < 0.4) : [];
      while (edgeMarks.length < edgesWanted.length) { const mark = new THREE.Mesh(new THREE.SphereGeometry(0.0007, 12, 10), GUIDE_MATERIAL); mark.renderOrder = 8; edgeMarks.push(mark); root.add(mark); }
      edgeMarks.forEach((mark, index) => {
        const flap = edgesWanted[index];
        mark.visible = !!flap;
        if (flap) mark.position.copy(flapEdge(flap)).addScaledVector(toEye, 0.0016);
      });
      if (edgesWanted.length) now = true;
      // The hands follow, the right quickly and the left at its own pace.
      const hasHands = (swap?.next ?? tool) !== 'hand' || !!swap;
      if (!aimed) { rightTip.copy(restFor(1)); leftTip.copy(restFor(-1)); rightGoal.copy(rightTip); leftGoal.copy(leftTip); aimed = true; }
      const going = swap ? trayCopies.get(swap.t < 0.5 ? tool : swap.next) : null;
      const wantRight = going ? benchPoint(going.position.x, going.position.y, 0.006) : !tipAsked && !stroke && !grasp && !carry && !needle && !pull ? restFor(1) : rightGoal;
      const wantLeft = !leftHold.active && !stroke ? (pointer.inside && overBody && !swap ? rightTip.clone().addScaledVector(right, -0.024).addScaledVector(up, -0.012).addScaledVector(toEye, 0.008) : restFor(-1)) : leftGoal;
      if (rightTip.distanceToSquared(wantRight) > 1e-10) { rightTip.lerp(wantRight, 1 - Math.exp(-moment * (swap ? 9 : stroke || pull ? 40 : 24))); now = true; }
      if (leftTip.distanceToSquared(wantLeft) > 1e-10) { leftTip.lerp(wantLeft, 1 - Math.exp(-moment * (leftHold.active ? 14 : 5))); now = true; }
      if (leftHold.lift !== leftHold.liftGoal) {
        const reach = delta * 0.006;
        leftHold.lift = Math.abs(leftHold.liftGoal - leftHold.lift) <= reach ? leftHold.liftGoal : leftHold.lift + Math.sign(leftHold.liftGoal - leftHold.lift) * reach;
        LIFE_SHARED.uLifeHoldAt.value.copy(leftHold.at);
        LIFE_SHARED.uLifeHoldBy.value.copy(leftHold.normal).multiplyScalar(leftHold.lift);
        if (leftHold.lift === 0) { for (const shading of heldLayer) shading.uLifeHeld.value = 0; heldLayer.length = 0; }
        now = true;
      }
      // Hands are never quite still.
      const sway = new THREE.Vector3().addScaledVector(right, 0.00016 * Math.sin(clock * 1.3)).addScaledVector(up, 0.00013 * Math.sin(clock * 1.7 + 1));
      if (instrument) {
        instrument.setOpen(rightOpen);
        aim(instrument, stroke || pull || needle ? rightTip : rightTip.clone().add(sway), 1, needle ? needle.way.clone().negate() : undefined);
        rightHand.hold(instrument, instrument.grip, elbowFor(rightTip, 1));
      } else rightHand.rest();
      if (hasHands) {
        leftForceps.group.visible = true;
        leftForceps.setOpen(leftOpen);
        aim(leftForceps, leftHold.active ? leftTip : leftTip.clone().sub(sway), -1);
        leftHand.hold(leftForceps, leftForceps.grip, elbowFor(leftTip, -1));
        now = true;
      } else { leftForceps.group.visible = false; leftHand.rest(); }
      if (lookIn > 0) {
        lookIn -= delta;
        if (lookIn <= 0 && !stroke && !grasp && !pull) {
          let grew = false;
          // A vessel or a lymph node is small, and counts as seen with less of it in view.
          for (const item of options.seen()) if (item.pixels >= (options.isVessel(item.id) || /lymph/.test(item.id) ? 8 : 24) && !seenEver.has(item.id)) { seenEver.add(item.id); grew = true; }
          if (grew) report();
        }
      }
      element.dataset.lab = tool;
      if (changed) { changed = false; now = true; }
      return now;
    },
    dispose() {
      dom.removeEventListener('pointerdown', press);
      dom.removeEventListener('pointermove', move);
      dom.removeEventListener('pointerleave', leave);
      window.removeEventListener('pointerup', release);
      controls.removeEventListener('end', controlsEnd);
      controls.mouseButtons.LEFT = savedButtons.LEFT;
      controls.mouseButtons.RIGHT = savedButtons.RIGHT;
      controls.zoomToCursor = savedZoomToCursor;
      dom.style.cursor = '';
      clearGuide();
      for (const id of meshes.keys()) { const shading = shadingOf(id); if (shading) { shading.uLifeShift.value.set(0, 0, 0); shading.uLifeTaken.value = 0; shading.uLifeHeld.value = 0; shading.uLifeFlapOf.value.set(0, 0, 0); shading.uLifeStays.value = 0; } }
      LIFE_SHARED.uLifeSplay.value = 0;
      LIFE_SHARED.uLifeLegOut.value.fill(0);
      LIFE_SHARED.uLifeHoldBy.value.set(0, 0, 0);
      LIFE_SHARED.uFlapCount.value = 0;
      CUT_SHARED.uLidsOpen.value = 0;
      partFur([]);
      CUT_SHARED.uCutOn.value = 0;
      delete element.dataset.lab;
      rightHand.dispose(); leftHand.dispose();
      skinEdge.dispose();
      scene.remove(root);
      root.traverse((object) => {
        if (object instanceof THREE.Mesh && !(object instanceof THREE.SkinnedMesh) && object !== skinEdge.mesh && object.geometry !== BLOOD_GEOMETRY && object.geometry !== STITCH_GEOMETRY && object.geometry !== GUIDE_DOT) { object.geometry.dispose(); if (object.material !== BLOOD_MATERIAL && object.material !== STITCH_MATERIAL && object.material !== GUIDE_MATERIAL) (object.material as THREE.Material).dispose(); }
      });
      pick.dispose();
      volume.dispose();
    },
  };

  // Cuts in each layer, what goes with which flap, and the hands take up their first instruments.
  for (const [id, mesh] of meshes) {
    if (!(mesh instanceof THREE.Mesh)) continue;
    const shading = surfaceShadingOf(mesh.material as THREE.Material);
    if (!shading) continue;
    const channel = channelOfTier(tierOf(id));
    shading.uCutVolume.value = volume.textures[channel >> 2];
    shading.uCutChannel.value.set(channel % 4 === 0 ? 1 : 0, channel % 4 === 1 ? 1 : 0, channel % 4 === 2 ? 1 : 0, channel % 4 === 3 ? 1 : 0);
    shading.uCutInvert.value = 0;
    const flags = flapFlags(tierOf(id));
    shading.uLifeFlapOf.value.set(flags[0], flags[1], flags[2]);
    shading.uLifeStays.value = staysWithTrunk(id, tierOf(id)) ? 1 : 0;
  }
  CUT_SHARED.uCutToTexture.value.copy(volume.toTexture);
  CUT_SHARED.uCutOn.value = 1;
  LIFE_SHARED.uLifeHoldReach.value = 0.0065;
  session.setTool('scissors');
  session.setPose('on-back');
  return session;
}
