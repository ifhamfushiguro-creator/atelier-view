import * as THREE from 'three';

export const EYE_HEIGHT = 1.50;

export interface WalkStepResult {
  nextPos: THREE.Vector3;
  floorY: number;
}

export interface WalkStepBounds {
  center?: [number, number, number];
  radius?: number;
  lockFloorY?: boolean;
  storyClearHeight?: number;
  buildingBox?: THREE.Box3;
}

/**
 * Calculates smooth human walking movement:
 * - 3-Ray sliding wall collision (0°, -30°, +30°) to prevent getting stuck or rubber-banding.
 * - Smooth vertical floor lock (prevents vertical jumping on furniture/chairs).
 * - Clamping inside room radius or building footprint.
 */
export function calculateWalkStep(
  camPos: THREE.Vector3,
  moveVec: THREE.Vector3,
  currentFootY: number,
  meshes: THREE.Mesh[],
  raycaster: THREE.Raycaster,
  eyeHeight: number = EYE_HEIGHT,
  bounds?: WalkStepBounds
): WalkStepResult {
  const resultMove = moveVec.clone();
  if (meshes.length === 0 || resultMove.lengthSq() < 0.000001) {
    let nextX = camPos.x + resultMove.x;
    let nextZ = camPos.z + resultMove.z;

    if (bounds?.buildingBox) {
      nextX = THREE.MathUtils.clamp(nextX, bounds.buildingBox.min.x + 0.35, bounds.buildingBox.max.x - 0.35);
      nextZ = THREE.MathUtils.clamp(nextZ, bounds.buildingBox.min.z + 0.35, bounds.buildingBox.max.z - 0.35);
    }
    if (bounds?.center && bounds?.radius) {
      const dx = nextX - bounds.center[0], dz = nextZ - bounds.center[2];
      const dist = Math.hypot(dx, dz);
      if (dist > bounds.radius) {
        const s = bounds.radius / dist;
        nextX = bounds.center[0] + dx * s;
        nextZ = bounds.center[2] + dz * s;
      }
    }
    const fy = bounds?.lockFloorY && bounds.center ? bounds.center[1] : currentFootY;
    return {
      nextPos: new THREE.Vector3(nextX, fy + eyeHeight, nextZ),
      floorY: fy
    };
  }

  // 1. 3-Ray Horizontal Wall Collision (0°, -30°, +30°)
  const moveLen = resultMove.length();
  const baseDir = resultMove.clone().normalize();
  const probeH = bounds?.storyClearHeight ? bounds.storyClearHeight * 0.35 : 0.65;
  const rayOrigin = new THREE.Vector3(camPos.x, currentFootY + probeH, camPos.z);
  const angles = [0, -Math.PI / 6, Math.PI / 6];

  for (const ang of angles) {
    const rayDir = baseDir.clone();
    if (ang !== 0) {
      rayDir.applyAxisAngle(new THREE.Vector3(0, 1, 0), ang);
    }
    raycaster.set(rayOrigin, rayDir);
    raycaster.far = Math.max(0.42, moveLen + 0.25);

    const hits = raycaster.intersectObjects(meshes, false);
    if (hits.length > 0) {
      const hit = hits[0];
      const norm = hit.face
        ? hit.face.normal.clone().applyNormalMatrix(
            new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld)
          ).normalize()
        : new THREE.Vector3(0, 0, 1);

      // Only slide against vertical walls (ignore horizontal floors/ceilings)
      if (Math.abs(norm.y) < 0.50 && hit.distance < 0.40) {
        const wallXZ = new THREE.Vector3(norm.x, 0, norm.z).normalize();
        const dot = resultMove.dot(wallXZ);
        if (dot < 0) {
          resultMove.addScaledVector(wallXZ, -dot);
        }
      }
    }
  }

  let nextX = camPos.x + resultMove.x;
  let nextZ = camPos.z + resultMove.z;

  // Clamp within building bounding box if provided
  if (bounds?.buildingBox) {
    nextX = THREE.MathUtils.clamp(nextX, bounds.buildingBox.min.x + 0.35, bounds.buildingBox.max.x - 0.35);
    nextZ = THREE.MathUtils.clamp(nextZ, bounds.buildingBox.min.z + 0.35, bounds.buildingBox.max.z - 0.35);
  }

  // Clamp within room radius if provided
  if (bounds?.center && bounds?.radius) {
    const dx = nextX - bounds.center[0], dz = nextZ - bounds.center[2];
    const dist = Math.hypot(dx, dz);
    if (dist > bounds.radius) {
      const s = bounds.radius / dist;
      nextX = bounds.center[0] + dx * s;
      nextZ = bounds.center[2] + dz * s;
    }
  }

  // 2. Vertical Floor Height
  // When lockFloorY is true, lock smoothly to active floor level (prevents climbing on furniture)
  let validStepY = bounds?.lockFloorY && bounds.center ? bounds.center[1] : currentFootY;

  if (!bounds?.lockFloorY) {
    // Step-up / step-down stair climbing for stair tests
    const probeY = currentFootY + (bounds?.storyClearHeight ? bounds.storyClearHeight * 0.6 : 1.15);
    raycaster.set(new THREE.Vector3(nextX, probeY, nextZ), new THREE.Vector3(0, -1, 0));
    raycaster.far = probeY - currentFootY + 1.35;
    const downHits = raycaster.intersectObjects(meshes, false);

    for (const dh of downHits) {
      const dNorm = dh.face
        ? dh.face.normal.clone().applyNormalMatrix(
            new THREE.Matrix3().getNormalMatrix(dh.object.matrixWorld)
          ).normalize()
        : new THREE.Vector3(0, 1, 0);

      const deltaY = dh.point.y - currentFootY;
      if (deltaY > 0.55) return { nextPos: camPos.clone(), floorY: currentFootY };
      if (dNorm.y > 0.58 && deltaY >= -0.65 && deltaY <= 0.55) {
        validStepY = dh.point.y;
        break;
      }
    }
  }

  return { nextPos: new THREE.Vector3(nextX, validStepY + eyeHeight, nextZ), floorY: validStepY };
}
