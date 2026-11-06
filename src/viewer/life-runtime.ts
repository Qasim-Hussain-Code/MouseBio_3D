import * as THREE from 'three';
import { lifeAt, lifeBehaviourOf, lookAngles, walkAt, type LifeSettings } from '../domain/living-simulation';
import type { Atlas } from '../domain';
import { LIFE_KIND, LIFE_SHARED, type LifeMeshUniforms } from './life-field';

/** The sizes of the movements, chosen so that they can be seen. */
export const LIFE_DISPLAY = Object.freeze({
  /** Widening of the chest and abdomen when breathing in, as a share of their size. */
  breath: 0.035,
  /** How far the diaphragm pushes the organs, in metres. */
  push: 0.0006,
  /** Shortening of the atria and ventricles at full contraction, as a share of their size. */
  atria: 0.1, ventricles: 0.09,
  /** Widening of the lungs when breathing in, beyond the widening of the chest. */
  lung: 0.03,
  /** How far an artery wall moves, as a share of its radius. */
  arteryWall: 0.12,
  /** How far the wall of the gut moves, in metres. */
  gut: 0.00016,
  /** How far the tip of the nose moves, in metres. */
  nose: 0.00016,
  /** How far the tip of the tail moves, in metres. */
  tail: 0.007,
  /** Length along the arteries of one cycle of the pulse, in metres. */
  pulseLength: 0.3,
});

export interface LifeBinding {
  readonly id: string;
  readonly mesh: THREE.Mesh;
  readonly own: LifeMeshUniforms;
}

const centreOf = (mesh: THREE.Object3D | undefined) => mesh ? new THREE.Box3().setFromObject(mesh).getCenter(new THREE.Vector3()) : null;

/** The mean radius of a tube from its surface: two times volume over area. Only used to size the pulse of its wall. */
export function tubeRadius(geometry: THREE.BufferGeometry): number {
  const position = geometry.getAttribute('position'), index = geometry.getIndex();
  if (!position || !index) return 0;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), cross = new THREE.Vector3();
  let volume = 0, area = 0;
  for (let i = 0; i < index.count; i += 3) {
    a.fromBufferAttribute(position, index.getX(i)); b.fromBufferAttribute(position, index.getX(i + 1)); c.fromBufferAttribute(position, index.getX(i + 2));
    cross.crossVectors(b, c);
    volume += a.dot(cross) / 6;
    cross.subVectors(b, a).cross(c.clone().sub(a));
    area += cross.length() / 2;
  }
  return area > 0 ? Math.abs(2 * volume / area) : 0;
}

export interface LifeRuntime {
  /** Advance by the seconds shown. True if anything moved. */
  tick(delta: number, settings: LifeSettings | undefined): boolean;
  /** The pointer lies at this point, or has gone. The mouse looks towards it for a while, and whisks if it comes close. */
  lookAt(point: THREE.Vector3 | null): void;
  /** Something has touched the animal at this point of its surface. */
  poke(point: THREE.Vector3, normal: THREE.Vector3): void;
  /** The animal's own seconds and the heart cycles, for the tokens. */
  readonly beats: () => number;
  readonly animalSeconds: () => number;
  dispose(): void;
}

/** Find the places the motion is measured from on this animal, and give each mesh its part. */
export function createLifeRuntime(atlas: Atlas, meshes: ReadonlyMap<string, THREE.Object3D>, bindings: readonly LifeBinding[], dorsal: THREE.Vector3): LifeRuntime | null {
  const at = (id: string) => centreOf(meshes.get('living:' + id));
  const neck = at('bone-c1'), neck2 = at('bone-c2'), chest = at('bone-t1'), mid = at('bone-t13'), loin = at('bone-l6'), sacrum = at('bone-s1');
  const heartParts = ['heart-lv', 'heart-rv', 'heart-la', 'heart-ra'].map(at);
  const lv = heartParts[0], rv = heartParts[1];
  if (!neck || !neck2 || !chest || !mid || !loin || !sacrum || !lv || !rv || heartParts.some((part) => !part)) return null;
  const shared = LIFE_SHARED;
  const axis = loin.clone().sub(neck);
  axis.addScaledVector(dorsal, -axis.dot(dorsal)).normalize();
  const lateral = new THREE.Vector3().crossVectors(axis, dorsal).normalize();
  const origin = neck.clone().add(neck2).multiplyScalar(0.5);
  const along = (point: THREE.Vector3) => point.clone().sub(origin).dot(axis);
  const height = (point: THREE.Vector3) => point.clone().sub(origin).dot(dorsal);
  shared.uLifeOrigin.value.copy(origin);
  shared.uLifeAxis.value.copy(axis); shared.uLifeDorsal.value.copy(dorsal); shared.uLifeLateral.value.copy(lateral);
  const diaphragm = meshes.get('living:diaphragm');
  const box = diaphragm ? new THREE.Box3().setFromObject(diaphragm) : null;
  const size = box ? box.getSize(new THREE.Vector3()) : new THREE.Vector3(0.024, 0.024, 0.014);
  const middle = box ? box.getCenter(new THREE.Vector3()) : mid;
  shared.uLifeBody.value.set(along(chest), along(middle), along(loin), along(sacrum));
  shared.uLifeSpine.value.set(height(chest), height(mid), height(loin));
  shared.uLifeTrunk.value.set(Math.abs(size.dot(dorsal)) * 1.25, Math.abs(size.dot(lateral)) * 0.58);
  let ground = Infinity;
  for (const id of ['forepaws', 'hindpaws']) {
    const paw = meshes.get('living:' + id);
    if (!paw) continue;
    const bounds = new THREE.Box3().setFromObject(paw);
    for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) ground = Math.min(ground, height(new THREE.Vector3(x, y, z)));
  }
  shared.uLifeGround.value = Number.isFinite(ground) ? ground : -0.02;
  const heart = heartParts.reduce<THREE.Vector3>((sum, part) => sum.add(part!), new THREE.Vector3()).multiplyScalar(0.25);
  shared.uLifeHeart.value.copy(heart);
  shared.uLifePulseLength.value = LIFE_DISPLAY.pulseLength;

  const tail = meshes.get('living:tail');
  if (tail instanceof THREE.Mesh) {
    // The point of the tail furthest from the body is its tip.
    const position = tail.geometry.getAttribute('position'), point = new THREE.Vector3(), tip = new THREE.Vector3(), base = new THREE.Vector3();
    tail.updateWorldMatrix(true, false);
    let furthest = -Infinity, nearest = Infinity;
    for (let index = 0; index < position.count; index++) {
      point.fromBufferAttribute(position, index).applyMatrix4(tail.matrixWorld);
      const reach = point.distanceTo(origin);
      if (reach > furthest) { furthest = reach; tip.copy(point); }
      if (reach < nearest) { nearest = reach; base.copy(point); }
    }
    const line = tip.clone().sub(base);
    shared.uLifeTailBase.value.copy(base);
    shared.uLifeTailLength.value = Math.max(line.length(), 0.01);
    shared.uLifeTailLine.value.copy(line.normalize());
  }
  const nose = meshes.get('living:nose');
  if (nose) shared.uLifeNose.value.copy(centreOf(nose)!);
  const ears = meshes.get('living:pinnae');
  const carina = at('bronchi') ?? mid;
  // The legs, from the top of the long bone to the middle of the paw, on each side.
  const legEnds: readonly (readonly [string, string])[] = [['bone-humerus-r', 'bone-manus-r'], ['bone-humerus-l', 'bone-manus-l'], ['bone-femur-r', 'bone-pes-r'], ['bone-femur-l', 'bone-pes-l']];
  let canWalk = true;
  legEnds.forEach(([top, bottom], index) => {
    const upper = meshes.get('living:' + top), foot = at(bottom);
    if (!upper || !foot) { canWalk = false; return; }
    const box = new THREE.Box3().setFromObject(upper), centre = box.getCenter(new THREE.Vector3());
    shared.uLifeHip.value[index].copy(centre).addScaledVector(dorsal, Math.abs(box.getSize(new THREE.Vector3()).dot(dorsal)) / 2);
    shared.uLifeFoot.value[index].copy(foot);
  });

  const ownBeat: { own: LifeMeshUniforms; rhythm: 'atria' | 'ventricles' | 'lungs' }[] = [];
  const atria = at('heart-la')!.clone().add(at('heart-ra')!).multiplyScalar(0.5);
  const ventricles = lv.clone().add(rv).multiplyScalar(0.5);
  const base = ventricles.clone().lerp(atria, 0.45);
  for (const { id, mesh, own } of bindings) {
    const structure = atlas.structures.find((item) => item.id === id);
    if (!structure) continue;
    const behaviour = lifeBehaviourOf(structure);
    own.uLifeAxial.value = behaviour.axial ? 1 : 0;
    switch (behaviour.motion) {
      case 'ventricle': own.uLifeKind.value = LIFE_KIND.beat; own.uLifePivot.value.copy(base); ownBeat.push({ own, rhythm: 'ventricles' }); break;
      case 'atrium': own.uLifeKind.value = LIFE_KIND.beat; own.uLifePivot.value.copy(atria); ownBeat.push({ own, rhythm: 'atria' }); break;
      case 'lung': own.uLifeKind.value = LIFE_KIND.beat; own.uLifePivot.value.copy(carina); ownBeat.push({ own, rhythm: 'lungs' }); break;
      case 'artery': own.uLifeKind.value = LIFE_KIND.artery; own.uLifeAmount.value = LIFE_DISPLAY.arteryWall * tubeRadius(mesh.geometry); break;
      case 'gut': own.uLifeKind.value = LIFE_KIND.gut; own.uLifeAmount.value = LIFE_DISPLAY.gut; break;
      case 'whisker': {
        own.uLifeKind.value = LIFE_KIND.whisker;
        const muzzle = nose ? centreOf(nose)!.clone().addScaledVector(axis, 0.005) : origin;
        own.uLifePivot.value.copy(muzzle); own.uLifeAmount.value = 0.0035;
        break;
      }
      case 'ear': {
        own.uLifeKind.value = LIFE_KIND.ear;
        const bounds = ears ? new THREE.Box3().setFromObject(ears) : null;
        if (bounds) {
          const c = bounds.getCenter(new THREE.Vector3());
          own.uLifePivot.value.copy(c).addScaledVector(dorsal, -Math.abs(bounds.getSize(new THREE.Vector3()).dot(dorsal)) * 0.45);
          // The roots of the ears lie about a third of the way out.
          own.uLifeAmount.value = Math.abs(bounds.getSize(new THREE.Vector3()).dot(lateral)) * 0.33;
        }
        break;
      }
      case 'tail': own.uLifeKind.value = LIFE_KIND.tail; own.uLifeAmount.value = LIFE_DISPLAY.tail; break;
      default: break;
    }
  }

  let animal = 0, shown = 0, signature = '', walkAmount = 0;
  let alert = 0, looking = 0, lookYaw = 0, lookNod = 0, lookedAt: THREE.Vector3 | null = null, sinceLook = Infinity, sincePoke = Infinity;
  const pokedBy = new THREE.Vector3(), from = new THREE.Vector3();
  return {
    lookAt(point) {
      if (!point) { lookedAt = null; return; }
      lookedAt = (lookedAt ?? new THREE.Vector3()).copy(point);
      sinceLook = 0;
      if (point.distanceTo(origin) < 0.022) alert = Math.max(alert, 0.45);
    },
    poke(point, normal) {
      shared.uLifePoke.value.copy(point);
      pokedBy.copy(normal).multiplyScalar(-0.0012);
      alert = 1; sincePoke = 0; sinceLook = 0;
      lookedAt = (lookedAt ?? new THREE.Vector3()).copy(point);
    },
    beats: () => shared.uLifeBeats.value,
    animalSeconds: () => animal,
    tick(delta, settings) {
      const on = !!settings?.on;
      if (!on) {
        if (shared.uLifeOn.value) { shared.uLifeOn.value = 0; return true; }
        return false;
      }
      shared.uLifeOn.value = 1;
      if (settings.playing) { animal += delta * settings.rate * (1 + 0.5 * alert); shown += delta * (1 + 0.5 * alert); sinceLook += delta; sincePoke += delta; alert *= Math.exp(-delta / 1.6); }
      const now = lifeAt(animal, shown, settings);
      // Attention is held for a few seconds after the pointer has stopped moving, and then the head goes back to its own movements.
      const wanted = settings.movement && lookedAt && sinceLook < 3.5 ? 1 : 0;
      looking += (wanted - looking) * (1 - Math.exp(-delta * 3));
      if (lookedAt && wanted) {
        from.copy(lookedAt).sub(origin);
        const turn = lookAngles(-from.dot(axis), from.dot(lateral), from.dot(dorsal));
        lookYaw += (turn.yaw - lookYaw) * (1 - Math.exp(-delta * 5));
        lookNod += (turn.nod - lookNod) * (1 - Math.exp(-delta * 5));
      }
      walkAmount += ((settings.walking && canWalk ? 1 : 0) - walkAmount) * (1 - Math.exp(-delta * 4));
      if (walkAmount < 0.002 && !settings.walking) walkAmount = 0;
      if (settings.movement && walkAmount > 0) {
        const pose = walkAt(shown, walkAmount);
        for (let leg = 0; leg < 4; leg++) { shared.uLifeSwing.value[leg] = pose.swing[leg]; shared.uLifeLift.value[leg] = pose.lift[leg]; }
        shared.uLifeBob.value = pose.bob;
        shared.uLifeWalk.value = walkAmount;
      } else shared.uLifeWalk.value = 0;
      // A poke presses the surface for a moment, and the whole animal starts and settles.
      const shock = settings.movement && sincePoke < 1.6 ? Math.exp(-sincePoke * 3.2) : 0;
      shared.uLifeStart.value = shock > 0.004 ? 0.0024 * shock * Math.abs(Math.cos(sincePoke * 9)) : 0;
      shared.uLifePokeBy.value.copy(pokedBy).multiplyScalar(shock);
      shared.uLifeBreath.value = LIFE_DISPLAY.breath * now.breath;
      shared.uLifePush.value = LIFE_DISPLAY.push * now.breath;
      shared.uLifeHeadYaw.value = now.headYaw * (1 - 0.7 * looking) + lookYaw * looking;
      shared.uLifeHeadNod.value = now.headNod * (1 - 0.7 * looking) + lookNod * looking;
      shared.uLifeBeats.value = now.beats;
      shared.uLifeGutPhase.value = now.gutPhase;
      // Close attention or a poke sets the whiskers going, and the ears and tail with them.
      shared.uLifeWhisk.value = settings.movement ? now.whisk + 0.2 * alert * Math.sin(animal * 2 * Math.PI * 11.3) : 0;
      shared.uLifeEar.value = now.earFlick + (settings.movement ? 0.3 * alert * Math.abs(Math.sin(shown * 11)) : 0);
      shared.uLifeTailPhase.value = now.tailPhase * (1 + 0.8 * alert) + (settings.movement ? 2 * shown * walkAmount : 0);
      shared.uLifeNoseMove.value = LIFE_DISPLAY.nose * (Math.sin(now.breath * Math.PI) * now.sniffing + (settings.movement ? alert * Math.sin(animal * 2 * Math.PI * 10) : 0));
      for (const { own, rhythm } of ownBeat) own.uLifeAmount.value = rhythm === 'atria' ? LIFE_DISPLAY.atria * now.atria : rhythm === 'ventricles' ? LIFE_DISPLAY.ventricles * now.ventricles : -LIFE_DISPLAY.lung * now.breath;
      const key = [settings.playing, settings.heart, settings.breathing, settings.gut, settings.movement, settings.on].join();
      const changed = settings.playing || key !== signature;
      signature = key;
      return changed;
    },
    dispose() { shared.uLifeOn.value = 0; },
  };
}
