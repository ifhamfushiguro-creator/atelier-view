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

        // RULE: Pitched roofs occupy top 35%-42% of 2-story buildings.
        // Strictly discard any candidate floor in top 42% of total height (y > minY + totalHeight * 0.58).
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

        // RULE: Walkable indoor floors must be covered by roof/ceiling overhead
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
 * Strictly splits Floor 01 Ground Level and Floor 02 Upper Residence with accurate
 * elevation bounds and cut heights (FIX 2).
 */
export function analyzeBuildingFloorsAndRooms(model: THREE.Object3D): FloorSlice[] {
  const box = new THREE.Box3().setFromObject(model);
  if (box.isEmpty()) return [];
  const totalHeight = box.max.y - box.min.y;
  const allSpots = collectCandidateSpots(model, box);
  allSpots.sort((a, b) => a.pos.y - b.pos.y);

  // Group candidate spots into distinct floor elevation clusters separated by >= 0.45m
  const clusterThreshold = 0.45;
  const rawClusters: CandidateSpot[][] = [];
  for (const s of allSpots) {
    const existing = rawClusters.find((c) => Math.abs(c[0].pos.y - s.pos.y) < clusterThreshold);
    if (existing) existing.push(s);
    else rawClusters.push([s]);
  }

  // Reject any cluster located in the upper 42% of building height (exterior roofline)
  const validClusters = rawClusters.filter((c) => {
    const avgY = c.reduce((sum, s) => sum + s.pos.y, 0) / c.length;
    return avgY <= box.min.y + totalHeight * 0.58;
  });

  // Multi-Story residential buildings have at least Ground Level and Upper Level if multiple clusters exist
  const clusters = validClusters.slice(0, 2);

  const isSingleStory = clusters.length <= 1;
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
      label: 'Floor 01 — Ground Level',
      subtitle: `${rooms.length} Rooms · Primary Residence`,
      minY: box.min.y,
      floorY: clusters[0]?.[0]?.pos.y ?? box.min.y,
      maxY: box.max.y,
      cutY: box.min.y + totalHeight * 0.24,
      bottomCutY: box.min.y - 0.25,
      rooms
    }];
  }

  // Multi-Story Residence: FIX 2 Exact Elevations & Clean Cuts
  return clusters.map((cluster, fIdx) => {
    const floorNumber = fIdx + 1;
    const floorId = `floor-${String(floorNumber).padStart(2, '0')}`;
    const roomPoolNames = fIdx === 0 ? groundRoomNames : upperRoomNames;

    let floorY: number;
    let bottomCutY: number;
    let cutY: number;
    let minY: number;
    let maxY: number;

    if (fIdx === 0) {
      // Floor 01 — Ground Level:
      // floorY = minY, bottomCutY = minY - 0.25 (keeps ground base)
      // cutY = minY + H * 0.24 (slices cleanly through 1st-floor walls well below 1st-floor ceiling)
      floorY = cluster[0]?.pos.y ?? box.min.y;
      bottomCutY = box.min.y - 0.25;
      cutY = box.min.y + totalHeight * 0.24;
      minY = box.min.y;
      maxY = clusters.length > 1 ? clusters[1][0].pos.y : box.min.y + totalHeight * 0.31;
    } else {
      // Floor 02 — Upper Residence:
      // floorY = minY + H * 0.31 (the actual 2nd-floor floorboards)
      // bottomCutY = minY + H * 0.28 (slices off the entire Ground Floor, brick base, and front stairs underneath Floor 02)
      // cutY = minY + H * 0.45 (slices cleanly through 2nd-floor walls BELOW the giant flat white ceiling slab and BELOW the red pitched roof)
      floorY = cluster[0]?.pos.y ?? (box.min.y + totalHeight * 0.31);
      bottomCutY = box.min.y + totalHeight * 0.28;
      cutY = box.min.y + totalHeight * 0.45;
      minY = bottomCutY;
      maxY = box.max.y;
    }

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
      : 'Floor 02 — Upper Residence';

    return {
      id: floorId,
      floorNumber,
      label,
      subtitle: `${rooms.length} Rooms · Curated Suite`,
      minY,
      floorY,
      maxY,
      cutY,
      bottomCutY,
      rooms
    };
  });
}
