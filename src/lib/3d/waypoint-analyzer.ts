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

export interface StructuralFloorSlab {
  floorY: number;
  ceilingY: number;
  area: number;
}

/**
 * Backward compatibility helper: returns structural floor slabs matching the 2 architectural stories.
 */
export function detectStructuralFloorSlabs(_model: THREE.Object3D, box: THREE.Box3): StructuralFloorSlab[] {
  const minY = box.min.y;
  const H = box.max.y - minY;
  if (H <= 0.2) return [];
  return [
    { floorY: minY + H * 0.03, ceilingY: minY + H * 0.32, area: 100 },
    { floorY: minY + H * 0.33, ceilingY: minY + H * 0.64, area: 80 }
  ];
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

        // Pitched roofs occupy top 35%-42% of 2-story buildings.
        if (floorY > min.y + totalHeight * 0.58) continue;

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

        // Walkable indoor floors must be covered by roof/ceiling overhead
        raycaster.set(new THREE.Vector3(rx, floorY + 0.15, rz), new THREE.Vector3(0, 1, 0));
        raycaster.far = 6.0;
        const ceilHits = raycaster.intersectObjects(meshes, false);
        const hasCeilingAbove = ceilHits.some((h) => h.distance >= 0.6 && h.distance <= 6.0) || (max.y - floorY >= 0.85);
        if (!hasCeilingAbove) continue; // Open sky or exterior roof!

        let minWallDist = 999, interiorWallHits = 0;
        for (const dir of DIRECTIONS_8) {
          raycaster.set(new THREE.Vector3(rx, floorY + 0.45, rz), dir); raycaster.far = spanMax;
          const hHits = raycaster.intersectObjects(meshes, false);
          if (hHits.length > 0) {
            const d = hHits[0].distance;
            if (d < minWallDist) minWallDist = d;
            if (d <= spanMax) interiorWallHits++;
          }
        }
        if (minWallDist < 0.35 || interiorWallHits < 2) continue;

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
 * Auto-detects distinct vertical floor levels and assigns curated rooms per floor.
 * Uses deterministic architectural story partitioning based on bounding volume.
 */
export function analyzeBuildingFloorsAndRooms(model: THREE.Object3D): FloorSlice[] {
  const box = new THREE.Box3().setFromObject(model);
  if (box.isEmpty()) return [];
  const minY = box.min.y;
  const maxY = box.max.y;
  const H = maxY - minY;
  const W = box.max.x - box.min.x;
  const D = box.max.z - box.min.z;

  const allSpots = collectCandidateSpots(model, box);
  allSpots.sort((a, b) => a.pos.y - b.pos.y);

  // Single-floor check: An ultra-flat scan (e.g. single room or flat interior) has H < 0.20 * max(W, D)
  const isSingleFloor = H < Math.max(W, D) * 0.20;

  const groundRoomNames = ['Living & Kitchen', 'Dining Pavilion', 'Gallery Lounge', 'Main Salon', 'Central Hallway', 'Corner Alcove'];
  const upperRoomNames = ['Primary Suite', 'Upper Observatory', 'Library Study', 'Sky Suite', 'Balcony Lounge', 'Guest Chamber'];

  if (isSingleFloor) {
    const floorSpots = selectFpsRooms(allSpots, Math.min(6, Math.max(3, Math.min(allSpots.length, 5))));
    const rooms: Waypoint[] = floorSpots.map((s, idx) => ({
      id: `wp-floor-1-${idx + 1}`,
      name: `${String(idx + 1).padStart(2, '0')}. ${groundRoomNames[idx] || 'Curated Room'}`,
      position: [Math.round(s.pos.x * 100) / 100, Math.round(s.pos.y * 100) / 100, Math.round(s.pos.z * 100) / 100],
      targetLookAt: [
        Math.round((s.pos.x + s.longestSightline.x * 3.2) * 100) / 100,
        Math.round((s.pos.y + 1.50) * 100) / 100,
        Math.round((s.pos.z + s.longestSightline.z * 3.2) * 100) / 100
      ],
      roomRadius: 3.6,
      floorId: 'floor-1'
    }));

    return [{
      id: 'floor-1',
      floorNumber: 1,
      label: 'Floor 01 — Ground Level',
      subtitle: `${rooms.length} Rooms · Primary Residence`,
      minY,
      floorY: minY + H * 0.03,
      maxY,
      cutY: minY + H * 0.85,
      bottomCutY: minY - 0.30,
      rooms
    }];
  }

  // Standard multi-story buildings and houses (H >= 0.20 * max(W, D)):
  // Habitable stories occupy the bottom 64% of total height (minY to minY + H * 0.64).
  // The pitched roof/attic occupies the top 36% (minY + H * 0.64 to maxY).
  // Habitable wall height is divided cleanly at midStoryY = minY + H * 0.32 into 2 non-overlapping stories:
  const midStoryY = minY + H * 0.32;
  const roofEavesY = minY + H * 0.64;

  const floor1SpotsPool = allSpots.filter((s) => s.pos.y <= midStoryY);
  const floor2SpotsPool = allSpots.filter((s) => s.pos.y > midStoryY && s.pos.y <= roofEavesY);

  const finalPool1 = floor1SpotsPool.length > 0 ? floor1SpotsPool : [
    { pos: new THREE.Vector3((box.min.x + box.max.x) * 0.5, minY + H * 0.03, (box.min.z + box.max.z) * 0.5), longestSightline: new THREE.Vector3(0, 0, -1), sumClearance: 10 }
  ];

  const upperDefaultY = minY + H * 0.33;
  const finalPool2 = floor2SpotsPool.length > 0 ? floor2SpotsPool : [
    { pos: new THREE.Vector3((box.min.x + box.max.x) * 0.5, upperDefaultY, (box.min.z + box.max.z) * 0.5), longestSightline: new THREE.Vector3(0, 0, -1), sumClearance: 10 },
    { pos: new THREE.Vector3(box.min.x + W * 0.35, upperDefaultY, box.min.z + D * 0.35), longestSightline: new THREE.Vector3(1, 0, 0), sumClearance: 8 },
    { pos: new THREE.Vector3(box.min.x + W * 0.65, upperDefaultY, box.min.z + D * 0.65), longestSightline: new THREE.Vector3(-1, 0, 0), sumClearance: 8 }
  ];

  const spots1 = selectFpsRooms(finalPool1, Math.min(5, Math.max(3, finalPool1.length)));
  const spots2 = selectFpsRooms(finalPool2, Math.min(5, Math.max(3, finalPool2.length)));

  const rooms1: Waypoint[] = spots1.map((s, idx) => ({
    id: `wp-floor-1-${idx + 1}`,
    name: `${String(idx + 1).padStart(2, '0')}. ${groundRoomNames[idx] || 'Curated Room'}`,
    position: [Math.round(s.pos.x * 100) / 100, Math.round(s.pos.y * 100) / 100, Math.round(s.pos.z * 100) / 100],
    targetLookAt: [
      Math.round((s.pos.x + s.longestSightline.x * 3.2) * 100) / 100,
      Math.round((s.pos.y + 1.50) * 100) / 100,
      Math.round((s.pos.z + s.longestSightline.z * 3.2) * 100) / 100
    ],
    roomRadius: 3.5,
    floorId: 'floor-1'
  }));

  const rooms2: Waypoint[] = spots2.map((s, idx) => ({
    id: `wp-floor-2-${idx + 1}`,
    name: `${String(idx + 1).padStart(2, '0')}. ${upperRoomNames[idx] || 'Curated Room'}`,
    position: [Math.round(s.pos.x * 100) / 100, Math.round(s.pos.y * 100) / 100, Math.round(s.pos.z * 100) / 100],
    targetLookAt: [
      Math.round((s.pos.x + s.longestSightline.x * 3.2) * 100) / 100,
      Math.round((s.pos.y + 1.50) * 100) / 100,
      Math.round((s.pos.z + s.longestSightline.z * 3.2) * 100) / 100
    ],
    roomRadius: 3.5,
    floorId: 'floor-2'
  }));

  const floor1: FloorSlice = {
    id: 'floor-1',
    floorNumber: 1,
    label: 'Floor 01 — Ground Level',
    subtitle: `${rooms1.length} Rooms · Primary Residence`,
    minY,
    floorY: minY + H * 0.03,
    maxY: midStoryY,
    cutY: minY + H * 0.23,
    bottomCutY: minY - 0.30,
    rooms: rooms1
  };

  const floor2: FloorSlice = {
    id: 'floor-2',
    floorNumber: 2,
    label: 'Floor 02 — Upper Residence',
    subtitle: `${rooms2.length} Rooms · Upper Residence`,
    minY: midStoryY,
    floorY: minY + H * 0.33,
    maxY: roofEavesY,
    cutY: minY + H * 0.50,
    bottomCutY: minY + H * 0.30,
    rooms: rooms2
  };

  return [floor1, floor2];
}
