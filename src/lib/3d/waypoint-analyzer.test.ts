import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { analyzeBuildingFloorsAndRooms } from './waypoint-analyzer';
import { calculateWalkStep, EYE_HEIGHT } from './walk-physics';

test('analyzeBuildingFloorsAndRooms detects floors and cuts diorama ceiling cleanly', () => {
  const root = new THREE.Group();
  const floor1 = new THREE.Mesh(new THREE.BoxGeometry(16, 0.2, 16), new THREE.MeshStandardMaterial());
  floor1.position.set(0, 0, 0);
  const wall1 = new THREE.Mesh(new THREE.BoxGeometry(16, 3, 0.2), new THREE.MeshStandardMaterial());
  wall1.position.set(0, 1.5, -8);
  const wall2 = new THREE.Mesh(new THREE.BoxGeometry(16, 3, 0.2), new THREE.MeshStandardMaterial());
  wall2.position.set(0, 1.5, 8);
  const wall3 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3, 16), new THREE.MeshStandardMaterial());
  wall3.position.set(8, 1.5, 0);
  const wall4 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3, 16), new THREE.MeshStandardMaterial());
  wall4.position.set(-8, 1.5, 0);
  const ceiling = new THREE.Mesh(new THREE.BoxGeometry(16, 0.2, 16), new THREE.MeshStandardMaterial());
  ceiling.position.set(0, 3.0, 0);

  root.add(floor1, wall1, wall2, wall3, wall4, ceiling);
  root.updateMatrixWorld(true);

  const slices = analyzeBuildingFloorsAndRooms(root);
  assert.equal(slices.length, 1);
  assert.equal(slices[0].floorNumber, 1);
  assert.ok(slices[0].cutY < 3.0);
  assert.ok(slices[0].rooms.length >= 1);
  assert.ok(slices[0].rooms[0].roomRadius! >= 2.8);
});

test('calculateWalkStep clamps position within room boundary radius', () => {
  const camPos = new THREE.Vector3(0, 1.50, 0);
  const moveVec = new THREE.Vector3(5, 0, 0); // Trying to walk 5m away
  const step = calculateWalkStep(camPos, moveVec, 0, [], new THREE.Raycaster(), EYE_HEIGHT, {
    center: [0, 0, 0],
    radius: 3.5,
    lockFloorY: true
  });

  const distFromCenter = Math.hypot(step.nextPos.x, step.nextPos.z);
  assert.ok(distFromCenter <= 3.51, `Player should be clamped to radius 3.5m, got ${distFromCenter}`);
  assert.equal(step.floorY, 0);
});

test('analyzeBuildingFloorsAndRooms spreads waypoints across rooms using FPS', () => {
  const root = new THREE.Group();

  // Create an enclosed room with 4 walls, floor and ceiling
  const floor = new THREE.Mesh(new THREE.BoxGeometry(16, 0.2, 16), new THREE.MeshStandardMaterial());
  floor.position.set(0, 0, 0);

  const northWall = new THREE.Mesh(new THREE.BoxGeometry(16, 4, 0.2), new THREE.MeshStandardMaterial());
  northWall.position.set(0, 2, -8);
  const southWall = new THREE.Mesh(new THREE.BoxGeometry(16, 4, 0.2), new THREE.MeshStandardMaterial());
  southWall.position.set(0, 2, 8);
  const eastWall = new THREE.Mesh(new THREE.BoxGeometry(0.2, 4, 16), new THREE.MeshStandardMaterial());
  eastWall.position.set(8, 2, 0);
  const westWall = new THREE.Mesh(new THREE.BoxGeometry(0.2, 4, 16), new THREE.MeshStandardMaterial());
  westWall.position.set(-8, 2, 0);
  const ceiling = new THREE.Mesh(new THREE.BoxGeometry(16, 0.2, 16), new THREE.MeshStandardMaterial());
  ceiling.position.set(0, 4.0, 0);

  root.add(floor, northWall, southWall, eastWall, westWall, ceiling);
  root.updateMatrixWorld(true);

  const floors = analyzeBuildingFloorsAndRooms(root);
  const waypoints = floors.flatMap((f) => f.rooms);
  assert.ok(waypoints.length >= 2, 'Should generate multiple spread waypoints');
  assert.ok(waypoints[0].name.includes('01.'));

  waypoints.forEach((wp) => {
    assert.ok(!Number.isNaN(wp.position[0]));
    assert.ok(!Number.isNaN(wp.position[1]));
    assert.ok(!Number.isNaN(wp.position[2]));
    assert.ok(wp.targetLookAt && !Number.isNaN(wp.targetLookAt[0]));
  });
});

test('analyzeBuildingFloorsAndRooms rejects outdoor roof and keeps only real stories', () => {
  const root = new THREE.Group();

  // Ground story: y = 0..3
  const floor1 = new THREE.Mesh(new THREE.BoxGeometry(14, 0.2, 14), new THREE.MeshStandardMaterial());
  floor1.position.set(0, 0, 0);
  const ceiling1 = new THREE.Mesh(new THREE.BoxGeometry(14, 0.2, 14), new THREE.MeshStandardMaterial());
  ceiling1.position.set(0, 3, 0);

  // Upper story: y = 3..6
  const ceiling2 = new THREE.Mesh(new THREE.BoxGeometry(14, 0.2, 14), new THREE.MeshStandardMaterial());
  ceiling2.position.set(0, 6, 0);

  // Exterior roof tiles: y = 7..8 (slanted roof with open sky above, y in top 26%)
  const roof = new THREE.Mesh(new THREE.ConeGeometry(10, 2.5, 4), new THREE.MeshStandardMaterial());
  roof.position.set(0, 7.25, 0);

  // Surrounding walls
  const wall = new THREE.Mesh(new THREE.BoxGeometry(14, 6, 0.2), new THREE.MeshStandardMaterial());
  wall.position.set(0, 3, -7);

  root.add(floor1, ceiling1, ceiling2, roof, wall);
  root.updateMatrixWorld(true);

  const floors = analyzeBuildingFloorsAndRooms(root);
  // Guarantee roof is never detected as a floor
  assert.ok(floors.length <= 2, `Expected at most 2 floors, got ${floors.length}`);
  const hasPenthouseRoof = floors.some(f => f.floorY > 6.0);
  assert.equal(hasPenthouseRoof, false, 'Roof peak must never be detected as a floor');
});

test('calculateWalkStep blocks movement into vertical walls', () => {
  const wall = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3, 10), new THREE.MeshStandardMaterial());
  wall.position.set(2, 1.5, 0); // Wall at x=2
  const floor = new THREE.Mesh(new THREE.BoxGeometry(10, 0.2, 10), new THREE.MeshStandardMaterial());
  floor.position.set(0, 0, 0);

  const meshes = [wall, floor];
  meshes.forEach((m) => m.updateMatrixWorld(true));

  const raycaster = new THREE.Raycaster();
  const camPos = new THREE.Vector3(1.7, 1.65, 0); // Player at x=1.7 (0.3m from wall face at x=1.9)
  const moveVec = new THREE.Vector3(0.5, 0, 0);   // Trying to walk forward into wall

  const step = calculateWalkStep(camPos, moveVec, 0, meshes, raycaster);
  assert.ok(step.nextPos.x <= 1.75, `Player should be blocked by wall, got x=${step.nextPos.x}`);
});

test('calculateWalkStep steps up onto stair treads within step threshold', () => {
  const stairTread = new THREE.Mesh(new THREE.BoxGeometry(2, 0.3, 2), new THREE.MeshStandardMaterial());
  stairTread.position.set(1, 0.15, 0); // Tread top at y=0.30m
  stairTread.updateMatrixWorld(true);
  const meshes = [stairTread];
  const raycaster = new THREE.Raycaster();

  const camPos = new THREE.Vector3(0, 1.65, 0); // Foot at y=0
  const moveVec = new THREE.Vector3(1, 0, 0);   // Step onto tread at x=1

  const step = calculateWalkStep(camPos, moveVec, 0, meshes, raycaster);
  assert.ok(step.floorY >= 0.25, `Should step up onto stair tread, got floorY=${step.floorY}`);
  assert.equal(step.nextPos.y, step.floorY + EYE_HEIGHT);
});
