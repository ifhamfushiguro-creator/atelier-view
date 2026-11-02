import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { applyVisualPolish, generateFloorWaypoints } from './simple-normalizer.ts';

test('generateFloorWaypoints produces 6 valid walkable floor stations', () => {
  const root = new THREE.Group();
  const roomMesh = new THREE.Mesh(new THREE.BoxGeometry(10, 3, 10), new THREE.MeshStandardMaterial());
  roomMesh.position.set(0, 1.5, 0);
  root.add(roomMesh);

  const waypoints = generateFloorWaypoints(root);
  assert.equal(waypoints.length, 6);
  assert.equal(waypoints[0].name, 'Room Center 01');
  assert.equal(waypoints[0].position[1], 0);

  waypoints.forEach((wp) => {
    assert.ok(!Number.isNaN(wp.position[0]));
    assert.ok(!Number.isNaN(wp.position[1]));
    assert.ok(!Number.isNaN(wp.position[2]));
  });
});

test('applyVisualPolish assigns unlit MeshBasicMaterial for baked photogrammetry textures', () => {
  const root = new THREE.Group();
  const fakeTexture = new THREE.Texture();
  const texturedMesh = new THREE.Mesh(
    new THREE.BoxGeometry(2, 2, 2),
    new THREE.MeshStandardMaterial({ map: fakeTexture })
  );
  texturedMesh.position.set(0, 1, 0);
  root.add(texturedMesh);

  applyVisualPolish(root, null, 'sweet-spot');
  assert.ok(texturedMesh.material instanceof THREE.MeshBasicMaterial);
  assert.equal((texturedMesh.material as THREE.MeshBasicMaterial).map, fakeTexture);
  assert.equal(texturedMesh.material.side, THREE.DoubleSide);
});

test('applyVisualPolish modes white-clay and cyber-blueprint apply correct styling and wireframe', () => {
  const root = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshStandardMaterial());
  mesh.position.set(0, 1, 0);
  root.add(mesh);

  applyVisualPolish(root, null, 'white-clay');
  assert.ok(mesh.material instanceof THREE.MeshStandardMaterial);
  assert.equal((mesh.material as THREE.MeshStandardMaterial).roughness, 0.88);

  applyVisualPolish(root, null, 'cyber-blueprint');
  assert.ok(mesh.material instanceof THREE.MeshStandardMaterial);
  const wire = mesh.getObjectByName('__wireframe_child__') as THREE.Mesh;
  assert.ok(wire && wire.visible);
  assert.ok(wire.material instanceof THREE.MeshBasicMaterial);
  assert.equal((wire.material as THREE.MeshBasicMaterial).wireframe, true);
});

test('applyVisualPolish preserves colors after toggling white-clay -> cyber-blueprint -> sweet-spot', () => {
  const root = new THREE.Group();
  const colorMesh = new THREE.Mesh(
    new THREE.BoxGeometry(2, 2, 2),
    new THREE.MeshStandardMaterial({ color: new THREE.Color('#FF5500'), roughness: 0.45 })
  );
  colorMesh.position.set(0, 1, 0);
  root.add(colorMesh);

  // Initial sweet-spot
  applyVisualPolish(root, null, 'sweet-spot');
  assert.equal((colorMesh.material as THREE.MeshStandardMaterial).color.getHexString().toUpperCase(), 'FF5500');

  // Switch to white clay
  applyVisualPolish(root, null, 'white-clay');
  assert.equal((colorMesh.material as THREE.MeshStandardMaterial).color.getHexString().toUpperCase(), 'D6D3CD');

  // Switch to cyber blueprint
  applyVisualPolish(root, null, 'cyber-blueprint');
  assert.equal((colorMesh.material as THREE.MeshStandardMaterial).color.getHexString().toUpperCase(), '0D131A');

  // Switch back to sweet-spot: color must be 100% restored from pristine copy!
  applyVisualPolish(root, null, 'sweet-spot');
  assert.equal((colorMesh.material as THREE.MeshStandardMaterial).color.getHexString().toUpperCase(), 'FF5500');
  assert.equal((colorMesh.material as THREE.MeshStandardMaterial).roughness, 0.45);
});

test('applyVisualPolish hides floating debris meshes high in the air', () => {
  const root = new THREE.Group();
  const mainFloor = new THREE.Mesh(new THREE.BoxGeometry(8, 0.2, 8), new THREE.MeshStandardMaterial());
  mainFloor.position.set(0, 0, 0);
  root.add(mainFloor);

  const tinyFloatingDebris = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), new THREE.MeshStandardMaterial());
  tinyFloatingDebris.position.set(0, 2.5, 0);
  root.add(tinyFloatingDebris);

  applyVisualPolish(root, null, 'sweet-spot');
  assert.equal(mainFloor.visible, true);
  assert.equal(tinyFloatingDebris.visible, false);
});
