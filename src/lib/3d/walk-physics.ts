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
}

/**
 * Calculates human walk movement with horizontal wall sliding, stair climbing,
 * and optional bounded room radius containment.
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
  if (meshes.length === 0) {
    let nextX = camPos.x + resultMove.x, nextZ = camPos.z + resultMove.z;
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

  // 1. Horizontal wall collision check at chest (+1.0m) and knee (+0.55m)
  const moveDir = resultMove.clone().normalize();
  for (const h of [1.0, 0.55]) {
    raycaster.set(new THREE.Vector3(camPos.x, currentFootY + h, camPos.z), moveDir);
    raycaster.far = 0.55;
    const hits = raycaster.intersectObjects(meshes, false);
    if (hits.length > 0) {
      const norm = hits[0].face
        ? hits[0].face.normal.clone().applyNormalMatrix(
            new THREE.Matrix3().getNormalMatrix(hits[0].object.matrixWorld)
          ).normalize()
        : new THREE.Vector3(0, 0, 1);

      if (Math.abs(norm.y) < 0.55 && hits[0].distance < 0.48) {
        const wallXZ = new THREE.Vector3(norm.x, 0, norm.z).normalize();
        resultMove.addScaledVector(wallXZ, -resultMove.dot(wallXZ));
      }
    }
  }

  let nextX = camPos.x + resultMove.x;
  let nextZ = camPos.z + resultMove.z;

  if (bounds?.center && bounds?.radius) {
    const dx = nextX - bounds.center[0], dz = nextZ - bounds.center[2];
    const dist = Math.hypot(dx, dz);
    if (dist > bounds.radius) {
      const s = bounds.radius / dist;
      nextX = bounds.center[0] + dx * s;
      nextZ = bounds.center[2] + dz * s;
    }
  }

  // 2. Step-up / step-down stair climbing & foot height raycast
  const probeY = currentFootY + (bounds?.storyClearHeight ? bounds.storyClearHeight * 0.6 : 1.15);
  raycaster.set(new THREE.Vector3(nextX, probeY, nextZ), new THREE.Vector3(0, -1, 0));
  raycaster.far = probeY - currentFootY + 1.35;
  const downHits = raycaster.intersectObjects(meshes, false);

  let validStepY = bounds?.lockFloorY && bounds.center ? bounds.center[1] : currentFootY;
  if (!bounds?.lockFloorY) {
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
