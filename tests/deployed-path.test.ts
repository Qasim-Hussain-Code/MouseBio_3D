/** Request paths for a site served from the root or from a subpath such as GitHub Pages; registry paths themselves never change. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deployedPath, deployedPathFor, SITE_BASE } from '../src/domain/deployed-path';

test('outside a build the site is served from the root and paths are unchanged', () => {
  assert.equal(SITE_BASE, '/');
  assert.equal(deployedPath('/atlas-living/living-mouse.glb'), '/atlas-living/living-mouse.glb');
});

test('under a subpath a root-relative registry path is requested below it', () => {
  assert.equal(deployedPathFor('/MouseBio_3D/', '/atlas-living/living-mouse.glb'), '/MouseBio_3D/atlas-living/living-mouse.glb');
  assert.equal(deployedPathFor('/MouseBio_3D/', '/scale-journey/molecule-insulin.json'), '/MouseBio_3D/scale-journey/molecule-insulin.json');
  assert.equal(deployedPathFor('/a/b/', '/atlas/atlas.json'), '/a/b/atlas/atlas.json');
});

test('other values are left alone and an unsafe base is ignored', () => {
  for (const path of ['atlas/atlas.json', '//example.org/x.glb', 'https://example.org/x.glb', '']) {
    assert.equal(deployedPathFor('/MouseBio_3D/', path), path);
  }
  for (const base of ['MouseBio_3D/', '/MouseBio_3D', '//evil/', '/../', '/a b/', 'https://example.org/']) {
    assert.equal(deployedPathFor(base, '/atlas/atlas.json'), '/atlas/atlas.json', base);
  }
});
