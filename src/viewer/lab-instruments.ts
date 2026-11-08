import * as THREE from 'three';
import type { LabToolId } from '../domain/dissection-lab';
import type { FingerName } from './lab-hand-model';

/**
 * The instruments, drawn at about their real size beside a mouse: a scalpel, fine scissors, forceps and so on, each with its tip at the origin and its length along +z. Jaws open along x.
 * They are drawn for use and are not models of any particular maker's instruments.
 */
export type GripKind = 'rings' | 'pen' | 'pinch';
/** Where the pad of each finger rests on an instrument, in its own coordinates, with the thickness of the finger allowed for. A finger not named lies idle. */
export type GripTargets = Partial<Record<FingerName, readonly [number, number, number]>>;

export interface Instrument {
  readonly group: THREE.Group;
  readonly grip: GripKind;
  /** How far it is open or closed, from 0 to 1, for those that have jaws. */
  setOpen(open: number): void;
  /** For a syringe drawing blood: how full it is, from 0 to 1. Null puts it back as it was, ready to inject. */
  setDrawn?(share: number | null): void;
  holds(): GripTargets;
}

const STEEL = () => new THREE.MeshStandardMaterial({ color: '#d5dade', metalness: 0.92, roughness: 0.28 });
const DARK = () => new THREE.MeshStandardMaterial({ color: '#39424a', metalness: 0.5, roughness: 0.45 });

/** A long piece that narrows, from one point to another. */
function taper(from: THREE.Vector3, to: THREE.Vector3, startWidth: number, endWidth: number, thickness: number, material: THREE.Material) {
  const length = from.distanceTo(to);
  const geometry = new THREE.CylinderGeometry(endWidth / 2, startWidth / 2, length, 12, 1);
  geometry.scale(1, 1, thickness / Math.max(startWidth, 1e-6));
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(from).add(to).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
  return mesh;
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** A pen is held about here along its length: the hand is placed for this. */
const PEN_AT = 0.07;
const penHolds = (width: number): GripTargets => ({
  thumb: [width + 0.0085, -0.001, PEN_AT + 0.002],
  index: [-width - 0.0075, -0.002, PEN_AT],
  middle: [-width - 0.003, width + 0.008, PEN_AT - 0.012],
});

function scalpel(): Instrument {
  const group = new THREE.Group(), steel = STEEL();
  const blade = new THREE.Shape();
  blade.moveTo(0, 0);
  blade.bezierCurveTo(0.0018, 0.004, 0.0048, 0.009, 0.0048, 0.016);
  blade.lineTo(0, 0.022);
  blade.lineTo(-0.0002, 0.012);
  blade.closePath();
  const edge = new THREE.Mesh(new THREE.ExtrudeGeometry(blade, { depth: 0.0003, bevelEnabled: false }), new THREE.MeshStandardMaterial({ color: '#e6e9ec', metalness: 1, roughness: 0.16 }));
  edge.rotation.x = Math.PI / 2;
  edge.position.y = 0.00015;
  group.add(edge);
  group.add(taper(V(0, 0, 0.02), V(0, 0, 0.14), 0.006, 0.0095, 0.0026, steel));
  return { group, grip: 'pen', setOpen() {}, holds: () => penHolds(0.0038) };
}

function jaws(blade: number, reach: number, width: number, loops: boolean): Instrument {
  const group = new THREE.Group(), steel = STEEL(), dark = DARK();
  const pivot = V(0, 0, blade);
  const halves = [1, -1].map((side) => {
    const half = new THREE.Group();
    half.position.copy(pivot);
    half.position.y = side * 0.00035;
    // A blade from the pivot to the tip, and an arm from the pivot, across to the far side, to the ring. The ring on one side works the blade on the other, so that the rings part as the blades part.
    half.add(taper(V(0, 0, 0), V(0, 0, -blade), width, width * 0.2, 0.0008, steel));
    const end = V(side * 0.0072, 0, reach);
    half.add(taper(V(0, 0, 0), end, width * 1.25, width * 0.85, 0.0022, steel));
    if (loops) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.0088, 0.0015, 8, 26), steel);
      ring.rotation.x = Math.PI / 2;
      ring.scale.set(0.92, 1.18, 1);
      ring.position.copy(end).add(V(side * 0.0052, 0, 0.0098));
      half.add(ring);
    }
    group.add(half);
    return { half, side };
  });
  const screw = new THREE.Mesh(new THREE.CylinderGeometry(0.0021, 0.0021, 0.0032, 16), dark);
  screw.position.copy(pivot);
  group.add(screw);
  let opening = 0.6;
  const placeOf = (side: number) => {
    // The middle of a ring, as the arm carrying it is turned.
    const angle = side * 0.2 * opening;
    const x = side * (0.0072 + 0.0052), z = reach + 0.0098;
    return { x: x * Math.cos(angle) + z * Math.sin(angle), z: blade - x * Math.sin(angle) + z * Math.cos(angle) };
  };
  const instrument: Instrument = {
    group,
    grip: 'rings',
    setOpen(open) { opening = Math.max(0, Math.min(1, open)); for (const { half, side } of halves) half.rotation.y = side * 0.2 * opening; },
    holds() {
      const thumbRing = placeOf(1), fingerRing = placeOf(-1);
      return {
        thumb: [thumbRing.x, -0.0015, thumbRing.z - 0.002],
        ring: [fingerRing.x, -0.0005, fingerRing.z - 0.002],
        // The index lies along the shank and steadies it, and the middle finger lies beside the lower ring.
        index: [0.0015, -0.0098, reach + blade + 0.0098 - 0.064],
        middle: [fingerRing.x - 0.006, 0.0045, fingerRing.z - 0.019],
      };
    },
  };
  instrument.setOpen(0.6);
  return instrument;
}

function forceps(): Instrument {
  const group = new THREE.Group(), steel = STEEL();
  const length = 0.115;
  const halves = [1, -1].map((side) => {
    const half = new THREE.Group();
    half.position.set(0, 0, length);
    half.add(taper(V(side * 0.00022, 0, -length), V(side * 0.0036, 0, -0.04), 0.0009, 0.004, 0.0012, steel));
    half.add(taper(V(side * 0.0036, 0, -0.04), V(side * 0.0012, 0, 0), 0.004, 0.0062, 0.0014, steel));
    group.add(half);
    return { half, side };
  });
  let opening = 0.8;
  const instrument: Instrument = {
    group,
    grip: 'pen',
    setOpen(open) { opening = Math.max(0, Math.min(1, open)); for (const { half, side } of halves) half.rotation.y = -side * 0.016 * opening; },
    holds() { const spread = 0.0036 + 0.0009 * opening; return penHolds(spread); },
  };
  instrument.setOpen(0.8);
  return instrument;
}

function probe(): Instrument {
  const group = new THREE.Group(), steel = STEEL();
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.0005, 12, 10), steel);
  group.add(tip);
  group.add(taper(V(0, 0, 0), V(0, 0, 0.05), 0.0007, 0.0013, 0.0013, steel));
  group.add(taper(V(0, 0, 0.05), V(0, 0, 0.14), 0.0042, 0.0056, 0.0056, DARK()));
  return { group, grip: 'pen', setOpen() {}, holds: () => penHolds(0.0026) };
}

function needleHolder(): Instrument {
  const made = jaws(0.012, 0.09, 0.0034, true);
  const needle = new THREE.Mesh(new THREE.TorusGeometry(0.0034, 0.00014, 5, 14, Math.PI * 0.95), STEEL());
  needle.position.set(0.0025, 0, 0.0006);
  needle.rotation.y = Math.PI / 2;
  made.group.add(needle);
  const thread = new THREE.Mesh(new THREE.TorusGeometry(0.008, 0.00012, 4, 18, Math.PI * 0.8), new THREE.MeshStandardMaterial({ color: '#2a3f8c', roughness: 0.8 }));
  thread.position.set(-0.002, 0, 0.0076);
  thread.rotation.y = Math.PI / 2;
  made.group.add(thread);
  return made;
}

function pin(): Instrument {
  const group = new THREE.Group();
  group.add(taper(V(0, 0, 0), V(0, 0, 0.024), 0.00005, 0.0006, 0.0006, STEEL()));
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.0016, 12, 10), new THREE.MeshStandardMaterial({ color: '#c2453d', roughness: 0.3 }));
  head.position.z = 0.0245;
  group.add(head);
  return { group, grip: 'pinch', setOpen() {}, holds: () => ({ thumb: [0.0101, -0.001, 0.0245], index: [-0.0091, -0.002, 0.0225] }) };
}

/** Small electric clippers of the kind used on small animals, with a comb of fine teeth at the end. */
function clippers(): Instrument {
  const group = new THREE.Group(), steel = STEEL();
  const shell = new THREE.MeshStandardMaterial({ color: '#dfe2df', roughness: 0.45 });
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.0135, 0.0024, 0.0045), steel);
  head.position.z = 0.0028;
  group.add(head);
  for (let tooth = 0; tooth < 13; tooth++) {
    const made = new THREE.Mesh(new THREE.BoxGeometry(0.00062, 0.0011, 0.0022), steel);
    made.position.set(-0.0062 + tooth * 0.00103, 0, -0.00002);
    group.add(made);
  }
  group.add(taper(V(0, 0, 0.0048), V(0, 0, 0.02), 0.0145, 0.019, 0.0105, shell));
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.0095, 0.082, 8, 18), shell);
  body.rotation.x = Math.PI / 2;
  body.position.z = 0.066;
  body.scale.set(1, 1, 0.82);
  group.add(body);
  const button = new THREE.Mesh(new THREE.BoxGeometry(0.0042, 0.0014, 0.009), DARK());
  button.position.set(0, -0.0078, 0.05);
  group.add(button);
  return { group, grip: 'pen', setOpen() {}, holds: () => penHolds(0.0095) };
}

function swab(): Instrument {
  const group = new THREE.Group();
  const cotton = new THREE.Mesh(new THREE.SphereGeometry(0.0022, 12, 10), new THREE.MeshStandardMaterial({ color: '#fbfaf6', roughness: 1 }));
  cotton.scale.z = 1.8;
  cotton.position.z = 0.0032;
  group.add(cotton);
  group.add(taper(V(0, 0, 0.005), V(0, 0, 0.13), 0.0013, 0.0013, 0.0013, new THREE.MeshStandardMaterial({ color: '#d9c6a0', roughness: 0.7 })));
  return { group, grip: 'pen', setOpen() {}, holds: () => penHolds(0.0009) };
}

/** A small syringe with a fine needle. Sizes are of the usual kind and are not a recommendation. */
function syringe(): Instrument {
  const group = new THREE.Group();
  const steel = STEEL();
  group.add(taper(V(0, 0, 0), V(0, 0, 0.016), 0.00018, 0.0005, 0.0005, steel));
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.0015, 0.0022, 0.006, 14), new THREE.MeshStandardMaterial({ color: '#d7a12a', roughness: 0.4 }));
  hub.rotation.x = Math.PI / 2;
  hub.position.z = 0.019;
  group.add(hub);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.0034, 0.0034, 0.06, 20, 1, true), new THREE.MeshPhysicalMaterial({ color: '#f2f6f7', roughness: 0.12, clearcoat: 1, transparent: true, opacity: 0.55, side: THREE.DoubleSide }));
  barrel.rotation.x = Math.PI / 2;
  barrel.position.z = 0.052;
  group.add(barrel);
  const liquidLook = new THREE.MeshPhysicalMaterial({ color: '#bfe0ea', roughness: 0.1, transparent: true, opacity: 0.7 });
  const liquid = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.03, 16), liquidLook);
  liquid.rotation.x = Math.PI / 2;
  liquid.position.z = 0.038;
  group.add(liquid);
  const plunger = new THREE.Mesh(new THREE.CylinderGeometry(0.0031, 0.0031, 0.0028, 18), new THREE.MeshStandardMaterial({ color: '#32363a', roughness: 0.6 }));
  plunger.rotation.x = Math.PI / 2;
  plunger.position.z = 0.0545;
  const pulled = new THREE.Group();
  group.add(pulled);
  pulled.add(plunger);
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.0011, 0.0011, 0.05, 8), new THREE.MeshStandardMaterial({ color: '#eceeef', roughness: 0.5 }));
  rod.rotation.x = Math.PI / 2;
  rod.position.z = 0.0805;
  pulled.add(rod);
  const flange = new THREE.Mesh(new THREE.CylinderGeometry(0.0062, 0.0062, 0.0012, 20), new THREE.MeshStandardMaterial({ color: '#eceeef', roughness: 0.5 }));
  flange.rotation.x = Math.PI / 2;
  flange.position.z = 0.0815;
  pulled.add(flange);
  return {
    group, grip: 'pen', setOpen() {}, holds: () => penHolds(0.0034),
    setDrawn(share) {
      const full = share ?? 1;
      liquidLook.color.set(share === null ? '#bfe0ea' : '#5e0b12');
      liquidLook.opacity = share === null ? 0.7 : 0.96;
      liquid.scale.y = Math.max(full, 0.001);
      liquid.position.z = 0.023 + 0.015 * full;
      pulled.position.z = -0.03 * (1 - full);
    },
  };
}

function ligature(): Instrument {
  const made = forceps();
  const loop = new THREE.Mesh(new THREE.TorusGeometry(0.0018, 0.00014, 5, 16), new THREE.MeshStandardMaterial({ color: '#2a3f8c', roughness: 0.8 }));
  made.group.add(loop);
  return made;
}

export function createInstrument(id: LabToolId): Instrument | null {
  switch (id) {
    case 'clippers': return clippers();
    case 'scalpel': return scalpel();
    case 'scissors': return jaws(0.024, 0.08, 0.0046, true);
    case 'forceps': return forceps();
    case 'probe': return probe();
    case 'bone-cutter': return jaws(0.016, 0.085, 0.0078, true);
    case 'ligature': return ligature();
    case 'suture': return needleHolder();
    case 'pin': return pin();
    case 'swab': return swab();
    case 'syringe': return syringe();
    default: return null;
  }
}

/** Dispose everything drawn under a group. */
export function disposeInstrument(group: THREE.Object3D) {
  group.traverse((object) => {
    if (object instanceof THREE.Mesh) { object.geometry.dispose(); (object.material as THREE.Material).dispose(); }
  });
}
