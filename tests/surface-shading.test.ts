/** Display shading hooks: program rewriting and uniform wiring, without browser rendering evidence. */
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { installSurfaceShading, shadeFragment, surfaceShadingOf, SURFACE_PRESENTATION } from '../src/viewer/surface-shading';

test('shading hooks install once per material and attach their uniforms to the compiled program', () => {
  const material = new THREE.MeshPhysicalMaterial();
  const uniforms = installSurfaceShading(material);
  assert.equal(installSurfaceShading(material), uniforms);
  assert.equal(surfaceShadingOf(material), uniforms);
  assert.equal(surfaceShadingOf(new THREE.MeshBasicMaterial()), null);
  assert.deepEqual([uniforms.uGhost.value, uniforms.uRim.value, uniforms.uGhostPower.value], [0, 0, SURFACE_PRESENTATION.ghostPower]);
  assert.equal(uniforms.uRimColor.value.getHexString(), SURFACE_PRESENTATION.rimColor.slice(1));
  const shader = { uniforms: {} as Record<string, unknown>, vertexShader: 'void main(){}', fragmentShader: THREE.ShaderLib.physical.fragmentShader };
  material.onBeforeCompile(shader as never, null as never);
  assert.equal(shader.uniforms.uRim, uniforms.uRim);
  assert.equal(shader.uniforms.uGhost, uniforms.uGhost);
  assert.ok(shader.fragmentShader.includes('uniform float uGhost;'));
  assert.equal(shader.vertexShader, 'void main(){}');
  assert.equal(typeof material.customProgramCacheKey(), 'string');
});

test('fragment rewriting keeps unknown programs unchanged and inserts each display term exactly once', () => {
  assert.equal(shadeFragment('void main(){}'), 'void main(){}');
  const original = THREE.ShaderLib.physical.fragmentShader;
  const rewritten = shadeFragment(original);
  assert.notEqual(rewritten, original);
  for (const term of ['uniform float uGhost;', 'uniform float uGhostPower;', 'uniform float uRim;', 'uniform vec3 uRimColor;',
    'diffuseColor.a *= mix(1.0, pow(mbFacing, uGhostPower), uGhost);', 'outgoingLight += uRimColor * pow(mbFacing, 3.0) * uRim;']) {
    assert.equal(rewritten.split(term).length - 1, 1, term);
  }
  // Every original include directive is retained exactly once.
  for (const marker of ['#include <common>', '#include <normal_fragment_begin>', '#include <opaque_fragment>']) {
    assert.equal(rewritten.split(marker).length - 1, original.split(marker).length - 1, marker);
  }
  // The facing term is computed after the shading normal exists and the rim is added before the final colour.
  assert.ok(rewritten.indexOf('#include <normal_fragment_begin>') < rewritten.indexOf('float mbFacing'));
  assert.ok(rewritten.indexOf('float mbFacing') < rewritten.indexOf('outgoingLight += uRimColor'));
  assert.ok(rewritten.indexOf('outgoingLight += uRimColor') < rewritten.indexOf('#include <opaque_fragment>'));
  assert.ok(rewritten.indexOf('uniform float uGhost;') < rewritten.indexOf('void main'));
});
