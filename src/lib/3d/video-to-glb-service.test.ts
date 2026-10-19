import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateWaypointsFromBounds,
  getDemoPenthouseWaypoints,
  calculateBudgetSummary,
  reconstructVideoToGlb,
  createProceduralSampleGlbBuffer,
  optimizeAndAnalyzeGlb
} from './video-to-glb-service.ts';

test('generateWaypointsFromBounds produces 6 floor waypoints at minY with 1.65m eye height lookAt', () => {
  const min: [number, number, number] = [-6, 0.25, -5];
  const max: [number, number, number] = [6, 3.8, 5];
  const waypoints = generateWaypointsFromBounds(min, max);

  assert.equal(waypoints.length, 6);
  for (const wp of waypoints) {
    assert.equal(wp.position[1], 0.25, 'Waypoint Y must sit flush on floorY');
    assert.ok(wp.position[0] >= min[0] && wp.position[0] <= max[0], 'X within bounds');
    assert.ok(wp.position[2] >= min[2] && wp.position[2] <= max[2], 'Z within bounds');
    assert.ok(wp.label.length > 0);
  }
});

test('getDemoPenthouseWaypoints returns 6 curated luxury penthouse zones', () => {
  const waypoints = getDemoPenthouseWaypoints();
  assert.equal(waypoints.length, 6);
  assert.equal(waypoints[0].id, 'wp-foyer');
  assert.deepEqual(waypoints[0].position, [-0.6, 0, 5.2]);
});

test('calculateBudgetSummary aggregates approved and pending spatial pin upgrades accurately', () => {
  const summary = calculateBudgetSummary(120000, [
    { priceDelta: 4200, status: 'approved' },
    { priceDelta: 6800, status: 'pending' },
    { priceDelta: 3100, status: 'approved' }
  ]);

  assert.equal(summary.baseBudget, 120000);
  assert.equal(summary.approvedUpgrades, 7300);
  assert.equal(summary.pendingUpgrades, 6800);
  assert.equal(summary.totalApprovedBudget, 127300);
  assert.equal(summary.totalProjectedBudget, 134100);
  assert.equal(summary.approvedPinCount, 2);
  assert.equal(summary.pendingPinCount, 1);
});

test('reconstructVideoToGlb falls back cleanly to Local Dev Fallback Mode when KIRI_API_KEY is unset', async () => {
  const res = await reconstructVideoToGlb({
    fileName: 'penthouse_scan.mp4',
    fileSize: 15_000_000
  });

  assert.equal(res.mode, 'local-fallback-demo');
  assert.equal(res.modelUrl, 'procedural://luxury-penthouse');
  assert.equal(res.waypoints.length, 6);
  assert.equal(res.pipelineSteps.length, 4);
});

test('optimizeAndAnalyzeGlb optimizes a real binary GLB buffer and extracts bounding box waypoints', async () => {
  const sampleGlb = await createProceduralSampleGlbBuffer();
  assert.ok(sampleGlb.byteLength > 100, 'Sample GLB binary has bytes');

  const result = await optimizeAndAnalyzeGlb(
    sampleGlb,
    'sample-room.glb',
    '/uploads/sample-room.glb'
  );

  assert.ok(result.optimizedBuffer.byteLength > 0);
  assert.equal(result.waypoints.length, 6);
  assert.equal(result.stats.bounds.floorY, 0);
  assert.equal(result.stats.bounds.size[0], 12);
  assert.equal(result.stats.bounds.size[2], 12);
});
