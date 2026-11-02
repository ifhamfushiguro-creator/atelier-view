import * as THREE from 'three';
import type { FloorSlice, Waypoint } from './simple-normalizer';

const DIRECTIONS_8 = [
  new THREE.Vector3(0, 0, -1),
  new THREE.Vector3(0.707, 0, -0.707),
  new THREE.Vector3(1, 0, 0),
  new THREE.Vector3(0.707, 0, 0.707),
  new THREE.Vector3(0, 0, 1),
  new THREE.Vector3(-0.707, 0, 0.707),
  new THREE.Vector3(-1, 0, 0),
  new THREE.Vector3(-0.707, 0, -0.707)
];

interface CandidateSpot {
  pos: THREE.Vector3;
  longestSightline: THREE.Vector3;
  sumClearance: number;
}

function collectCandidateSpots(model: THREE.Object3D, box: THREE.Box3): CandidateSpot[] {
  const size = new THREE.Vector3(); box.getSize(size);
  const min = box.min, max = box.max, spanMax = Math.max(size.x, size.z);
  const totalHeight = max.y - min.y;
  const meshes: THREE.Mesh[] = [];
  model.traverse((c) => {
    if (c instanceof THREE.Mesh && c.visible && c.geometry) {
      if (!c.geometry.boundingBox) c.geometry.computeBoundingBox();
      meshes.push(c);
    }
  });
  if (meshes.length === 0) return [];

  const raycaster = new THREE.Raycaster();
  const GRID_SIZE = 24;
  const stepX = (max.x - min.x) / (GRID_SIZE + 1), stepZ = (max.z - min.z) / (GRID_SIZE + 1);
  const probeStartY = max.y - 0.2, probeFar = totalHeight + 0.5;
  const spots: CandidateSpot[] = [];

  for (let ix = 1; ix <= GRID_SIZE; ix++) {
    for (let iz = 1; iz <= GRID_SIZE; iz++) {
      const rx = min.x + ix * stepX, rz = min.z + iz * stepZ;
      raycaster.set(new THREE.Vector3(rx, probeStartY, rz), new THREE.Vector3(0, -1, 0));
      raycaster.far = probeFar;
      const colHits = raycaster.intersectObjects(meshes, false);
      if (colHits.length === 0) continue;

      const upwardHits = colHits
        .filter((h) => {
          const n = h.face ? h.face.normal.clone().applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(h.object.matrixWorld)).normalize() : new THREE.Vector3(0, 1, 0);
          return n.y > 0.72;
        })
        .map((h) => ({ y: h.point.y, hit: h }))
        .sort((a, b) => a.y - b.y);

      for (let i = 0; i < upwardHits.length; i++) {
        const floorY = upwardHits[i].y;

        // RULE: Top 26% of building total height is exterior roof structure — reject immediately
        if (floorY > min.y + totalHeight * 0.74) continue;

        let isFurniture = false;
        for (let b = 0; b < i; b++) {
          if (floorY - upwardHits[b].y > 0.05 && floorY - upwardHits[b].y < 1.1) { isFurniture = true; break; }
        }
        if (isFurniture) continue;

        let hasHeadClearance = true;
        for (const h of colHits) {
          if (h.point.y > floorY && h.point.y - floorY < 1.75) { hasHeadClearance = false; break; }
        }
        if (!hasHeadClearance) continue;

        // RULE: A downward raycast hit is ONLY a valid interior walkable floor if casting UPWARD (0, 1, 0)
        // from (rx, floorY + 0.15, rz) hits an interior ceiling or roof underside above it within 1.6m to 6.0m
        raycaster.set(new THREE.Vector3(rx, floorY + 0.15, rz), new THREE.Vector3(0, 1, 0));
        raycaster.far = 6.0;
        const ceilHits = raycaster.intersectObjects(meshes, false);
        const validCeiling = ceilHits.find((h) => h.distance >= 1.6 && h.distance <= 6.0);
        if (!validCeiling) continue; // Open sky or exterior roof!

        let minWallDist = 999, interiorWallHits = 0;
        for (const dir of DIRECTIONS_8) {
          raycaster.set(new THREE.Vector3(rx, floorY + 1.0, rz), dir); raycaster.far = spanMax;
          const hHits = raycaster.intersectObjects(meshes, false);
          if (hHits.length > 0) {
            const d = hHits[0].distance;
            if (d < minWallDist) minWallDist = d;
            if (d <= spanMax) interiorWallHits++;
          }
        }
        if (minWallDist < 0.55 || interiorWallHits < 3) continue;

        let maxSightDist = 0, bestSightDir = new THREE.Vector3(0, 0, -1), sumClearance = 0;
        for (const dir of DIRECTIONS_8) {
          raycaster.set(new THREE.Vector3(rx, floorY + 1.50, rz), dir); raycaster.far = spanMax;
          const eHits = raycaster.intersectObjects(meshes, false);
          const d = eHits.length > 0 ? eHits[0].distance : spanMax;
          sumClearance += d;
          if (d > maxSightDist) { maxSightDist = d; bestSightDir = dir; }
        }

        spots.push({ pos: new THREE.Vector3(rx, floorY, rz), longestSightline: bestSightDir, sumClearance });
      }
    }
  }

  if (spots.length === 0) {
    spots.push({
      pos: new THREE.Vector3((min.x + max.x) / 2, min.y, (min.z + max.z) / 2),
      longestSightline: new THREE.Vector3(0, 0, -1),
      sumClearance: 10
    });
  }
  return spots;
}

function selectFpsRooms(pool: CandidateSpot[], count: number): CandidateSpot[] {
  if (pool.length <= count) return pool;
  const sorted = [...pool].sort((a, b) => b.sumClearance - a.sumClearance);
  const selected: CandidateSpot[] = [sorted[0]];
  while (selected.length < count) {
    let best: CandidateSpot | null = null, maxDist = -1;
    for (const cand of pool) {
      let minDist = 9999;
      for (const sel of selected) {
        const d = Math.hypot(cand.pos.x - sel.pos.x, (cand.pos.y - sel.pos.y) * 2, cand.pos.z - sel.pos.z);
        if (d < minDist) minDist = d;
      }
      if (minDist > maxDist) { maxDist = minDist; best = cand; }
    }
    if (best) selected.push(best);
    else break;
  }
  return selected;
}

/**
 * 4-Stage Luxury Architectural Funnel:
 * Auto-detects distinct vertical floor levels and assigns 3-6 curated rooms per floor.
 */
export function analyzeBuildingFloorsAndRooms(model: THREE.Object3D): FloorSlice[] {
  const box = new THREE.Box3().setFromObject(model);
  if (box.isEmpty()) return [];
  const totalHeight = box.max.y - box.min.y;
  const allSpots = collectCandidateSpots(model, box);
  allSpots.sort((a, b) => a.pos.y - b.pos.y);

  // Group candidate spots into distinct floor elevation clusters separated by >= 1.8m
  const rawClusters: CandidateSpot[][] = [];
  for (const s of allSpots) {
    const existing = rawClusters.find((c) => Math.abs(c[0].pos.y - s.pos.y) < 1.0);
    if (existing) existing.push(s);
    else rawClusters.push([s]);
  }

  // Reject any cluster located in the top 26% of building height (exterior roofline)
  const clusters = rawClusters.filter((c) => {
    const avgY = c.reduce((sum, s) => sum + s.pos.y, 0) / c.length;
    return avgY <= box.min.y + totalHeight * 0.74;
  });

  const isSingleStory = totalHeight <= 4.2 || clusters.length <= 1;
  const groundRoomNames = ['Living & Kitchen', 'Dining Pavilion', 'Gallery Lounge', 'Main Salon', 'Central Hallway', 'Corner Alcove'];
  const upperRoomNames = ['Primary Suite', 'Upper Observatory', 'Library Study', 'Sky Suite', 'Balcony Lounge', 'Guest Chamber'];

  if (isSingleStory) {
    const floorSpots = selectFpsRooms(allSpots, Math.min(6, Math.max(3, Math.min(allSpots.length, 5))));
    const rooms: Waypoint[] = floorSpots.map((s, idx) => ({
      id: `wp-floor-01-${idx + 1}`,
      name: `${String(idx + 1).padStart(2, '0')}. ${groundRoomNames[idx] || 'Curated Room'}`,
      position: [Math.round(s.pos.x * 100) / 100, Math.round(s.pos.y * 100) / 100, Math.round(s.pos.z * 100) / 100],
      targetLookAt: [
        Math.round((s.pos.x + s.longestSightline.x * 3.2) * 100) / 100,
        Math.round((s.pos.y + 1.50) * 100) / 100,
        Math.round((s.pos.z + s.longestSightline.z * 3.2) * 100) / 100
      ],
      roomRadius: 3.6,
      floorId: 'floor-01'
    }));

    return [{
      id: 'floor-01',
      floorNumber: 1,
      label: 'Floor 01 — Main Residence',
      subtitle: `${rooms.length} Rooms · Primary Level`,
      minY: box.min.y,
      floorY: clusters[0]?.[0]?.pos.y ?? box.min.y,
      maxY: box.max.y,
      cutY: box.max.y - 0.35,
      rooms
    }];
  }

  // Multi-Story Residence
  return clusters.map((cluster, fIdx) => {
    const floorNumber = fIdx + 1;
    const floorId = `floor-${String(floorNumber).padStart(2, '0')}`;
    const floorY = cluster[0].pos.y;
    const minY = fIdx === 0 ? box.min.y : floorY - 0.15;
    const maxY = fIdx < clusters.length - 1 ? clusters[fIdx + 1][0].pos.y : box.max.y;
    const storyHeight = maxY - minY;
    const cutY = fIdx === clusters.length - 1 ? box.max.y - 0.35 : minY + storyHeight * 0.78;
    const roomPoolNames = fIdx === 0 ? groundRoomNames : upperRoomNames;

    const floorSpots = selectFpsRooms(cluster, Math.min(5, Math.max(3, cluster.length)));
    const rooms: Waypoint[] = floorSpots.map((s, idx) => ({
      id: `wp-${floorId}-${idx + 1}`,
      name: `${String(idx + 1).padStart(2, '0')}. ${roomPoolNames[idx] || 'Curated Room'}`,
      position: [Math.round(s.pos.x * 100) / 100, Math.round(s.pos.y * 100) / 100, Math.round(s.pos.z * 100) / 100],
      targetLookAt: [
        Math.round((s.pos.x + s.longestSightline.x * 3.2) * 100) / 100,
        Math.round((s.pos.y + 1.50) * 100) / 100,
        Math.round((s.pos.z + s.longestSightline.z * 3.2) * 100) / 100
      ],
      roomRadius: 3.5,
      floorId
    }));

    const label = fIdx === 0
      ? 'Floor 01 — Ground Level'
      : fIdx === 1
        ? 'Floor 02 — Upper Residence'
        : `Floor ${String(floorNumber).padStart(2, '0')} — Penthouse Level`;

    return {
      id: floorId,
      floorNumber,
      label,
      subtitle: `${rooms.length} Rooms · Curated Suite`,
      minY,
      floorY,
      maxY,
      cutY,
      rooms
    };
  });
}
