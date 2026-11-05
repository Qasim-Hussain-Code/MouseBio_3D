import * as THREE from 'three';
import { HorizontalBlurShader } from 'three/addons/shaders/HorizontalBlurShader.js';
import { VerticalBlurShader } from 'three/addons/shaders/VerticalBlurShader.js';

/**
 * A soft ground shadow under a model displayed in an inferred posture. The
 * displayed regions are rendered from below into a small texture as
 * depth-weighted darkness, blurred twice and shown on a plane just beneath
 * the lowest displayed point. The shadow is a presentation cue for posture
 * and contact; it carries no measurement and ignores region opacity.
 */
export const CONTACT_SHADOW = Object.freeze({ resolution: 512, opacity: 0.38, darkness: 1.25, blur: 3.6, margin: 1.3 });

const DEPTH_LINE = 'gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );';

/** Turn the depth program's grey output into darkness that fades with height above the ground. */
export function shadowFragment(fragmentShader: string): string {
  if (!fragmentShader.includes(DEPTH_LINE)) return fragmentShader;
  return `uniform float darkness;\n${fragmentShader.replace(DEPTH_LINE, 'gl_FragColor = vec4( vec3( 0.0 ), ( 1.0 - fragCoordZ ) * darkness );')}`;
}

export interface ContactShadow {
  readonly group: THREE.Group;
  /** Render the shadow of the scene's currently visible objects. The plane is hidden while rendering. */
  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, clippingPlanes: THREE.Plane[]): void;
  dispose(): void;
}

/**
 * Create a shadow plane under display-frame bounds for a model whose dorsal
 * direction is the unit vector `up` (display +z by default). The shadow group's
 * local +z is `up`; the plane lies in its local xy plane beneath the bounds.
 */
export function createContactShadow(bounds: THREE.Box3, up = new THREE.Vector3(0, 0, 1)): ContactShadow | null {
  if (bounds.isEmpty() || ![...bounds.min.toArray(), ...bounds.max.toArray()].every(Number.isFinite)
      || !up.toArray().every(Number.isFinite) || Math.abs(up.length() - 1) > 1e-6) return null;
  const orientation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), up);
  const inverse = orientation.clone().invert();
  // The bounds expressed in the shadow frame.
  const local = new THREE.Box3();
  for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
    local.expandByPoint(new THREE.Vector3(x, y, z).applyQuaternion(inverse));
  }
  const size = local.getSize(new THREE.Vector3());
  const center = local.getCenter(new THREE.Vector3());
  const width = size.x * CONTACT_SHADOW.margin, depth = size.y * CONTACT_SHADOW.margin, height = Math.max(size.z, 1e-9);
  if (!(width > 0 && depth > 0)) return null;
  const ground = local.min.z - height * 0.01;
  const group = new THREE.Group();
  group.name = 'display-contact-shadow';
  group.quaternion.copy(orientation);
  group.position.set(center.x, center.y, ground).applyQuaternion(orientation);
  group.updateMatrixWorld(true);

  const target = new THREE.WebGLRenderTarget(CONTACT_SHADOW.resolution, CONTACT_SHADOW.resolution);
  target.texture.generateMipmaps = false;
  const blurTarget = new THREE.WebGLRenderTarget(CONTACT_SHADOW.resolution, CONTACT_SHADOW.resolution);
  blurTarget.texture.generateMipmaps = false;

  const planeGeometry = new THREE.PlaneGeometry(width, depth);
  const plane = new THREE.Mesh(planeGeometry, new THREE.MeshBasicMaterial({ map: target.texture, transparent: true, opacity: CONTACT_SHADOW.opacity, depthWrite: false, toneMapped: false }));
  // The shadow camera looks up from below, which mirrors display x in its image.
  plane.scale.x = -1;
  plane.renderOrder = -1;
  group.add(plane);

  // The blur plane fills the shadow camera frustum halfway between its near and far planes.
  const blurPlane = new THREE.Mesh(planeGeometry);
  blurPlane.position.z = height / 2;
  blurPlane.visible = false;
  group.add(blurPlane);

  const camera = new THREE.OrthographicCamera(-width / 2, width / 2, depth / 2, -depth / 2, 0, height);
  // Look along the shadow frame's +z, with its +y as image up.
  camera.up.set(0, 1, 0).applyQuaternion(orientation);
  group.add(camera);
  camera.lookAt(group.localToWorld(new THREE.Vector3(0, 0, 1)));

  const darkness = { value: CONTACT_SHADOW.darkness };
  const depthMaterial = new THREE.MeshDepthMaterial({ side: THREE.DoubleSide });
  depthMaterial.onBeforeCompile = (shader) => { shader.uniforms.darkness = darkness; shader.fragmentShader = shadowFragment(shader.fragmentShader); };
  depthMaterial.customProgramCacheKey = () => 'mousebio-contact-shadow-v1';
  depthMaterial.depthTest = false;
  depthMaterial.depthWrite = false;
  const horizontal = new THREE.ShaderMaterial({ ...HorizontalBlurShader, uniforms: THREE.UniformsUtils.clone(HorizontalBlurShader.uniforms), side: THREE.DoubleSide, depthTest: false });
  const vertical = new THREE.ShaderMaterial({ ...VerticalBlurShader, uniforms: THREE.UniformsUtils.clone(VerticalBlurShader.uniforms), side: THREE.DoubleSide, depthTest: false });

  const blur = (renderer: THREE.WebGLRenderer, amount: number) => {
    blurPlane.visible = true;
    blurPlane.material = horizontal;
    horizontal.uniforms.tDiffuse.value = target.texture;
    horizontal.uniforms.h.value = amount / CONTACT_SHADOW.resolution;
    renderer.setRenderTarget(blurTarget);
    renderer.render(blurPlane, camera);
    blurPlane.material = vertical;
    vertical.uniforms.tDiffuse.value = blurTarget.texture;
    vertical.uniforms.v.value = amount / CONTACT_SHADOW.resolution;
    renderer.setRenderTarget(target);
    renderer.render(blurPlane, camera);
    blurPlane.visible = false;
  };

  return {
    group,
    render(renderer, scene, clippingPlanes) {
      const previousTarget = renderer.getRenderTarget();
      const previousAlpha = renderer.getClearAlpha();
      const previousOverride = scene.overrideMaterial;
      const planeVisible = plane.visible;
      plane.visible = false;
      depthMaterial.clippingPlanes = clippingPlanes;
      scene.overrideMaterial = depthMaterial;
      renderer.setClearAlpha(0);
      renderer.setRenderTarget(target);
      renderer.clear();
      group.updateWorldMatrix(true, true);
      renderer.render(scene, camera);
      scene.overrideMaterial = previousOverride;
      blur(renderer, CONTACT_SHADOW.blur);
      blur(renderer, CONTACT_SHADOW.blur * 0.4);
      renderer.setRenderTarget(previousTarget);
      renderer.setClearAlpha(previousAlpha);
      plane.visible = planeVisible;
    },
    dispose() {
      target.dispose(); blurTarget.dispose(); planeGeometry.dispose();
      (plane.material as THREE.Material).dispose(); depthMaterial.dispose(); horizontal.dispose(); vertical.dispose();
      group.removeFromParent();
    },
  };
}
