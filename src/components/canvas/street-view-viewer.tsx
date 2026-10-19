import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { Waypoint, SpatialPinItem } from '../../lib/3d/video-to-glb-service';

export type ViewerNavigationMode = 'street-view' | 'dollhouse';

export interface StreetViewViewerProps {
  modelUrl: string;
  waypoints: Waypoint[];
  activeWaypointId: string;
  navigationMode: ViewerNavigationMode;
  pins: SpatialPinItem[];
  selectedPinId: string | null;
  onSelectWaypoint: (waypoint: Waypoint) => void;
  onSelectPin: (pinId: string) => void;
  onAddPinAtCoordinate: (
    position: [number, number, number],
    cameraAngle: [number, number, number],
    targetObjectName: string
  ) => void;
}

interface ProjectedPin {
  id: string;
  x: number;
  y: number;
  visible: boolean;
  pin: SpatialPinItem;
}

interface ProjectedWaypoint {
  id: string;
  x: number;
  y: number;
  visible: boolean;
  waypoint: Waypoint;
}

// Pre-allocated math scratch objects outside the render loop (Zero GC in rAF)
const _vec3A = new THREE.Vector3();
const _vec3B = new THREE.Vector3();
const _projVec = new THREE.Vector3();
const _lookDir = new THREE.Vector3();

function createProceduralFloorTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#171513';
    ctx.fillRect(0, 0, 512, 512);

    // Subtle travertine / dark architectural stone tile grid & organic grain
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.045)';
    ctx.lineWidth = 2;
    const step = 128;
    for (let i = 0; i <= 512; i += step) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, 512);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(512, i);
      ctx.stroke();
    }

    // Subtle warm mineral veining
    ctx.strokeStyle = 'rgba(212, 175, 55, 0.035)';
    ctx.lineWidth = 1.5;
    for (let k = 0; k < 14; k++) {
      ctx.beginPath();
      ctx.moveTo((k * 47) % 512, 0);
      ctx.bezierCurveTo(180, 160, 340, 320, ((k * 83) + 120) % 512, 512);
      ctx.stroke();
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(6, 6);
  texture.anisotropy = maxAnisotropy;
  texture.needsUpdate = true;
  return texture;
}

function createProceduralMarbleTexture(
  baseHex: string,
  veinRgba: string,
  maxAnisotropy: number
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = baseHex;
    ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = veinRgba;
    ctx.lineWidth = 1.8;
    for (let i = 0; i < 10; i++) {
      ctx.beginPath();
      ctx.moveTo((i * 31) % 256, 0);
      ctx.quadraticCurveTo(128 + (i % 3) * 25, 128, ((i * 67) + 40) % 256, 256);
      ctx.stroke();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = maxAnisotropy;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Builds the complete Procedural Luxury Penthouse 3D Showroom using multi-part THREE.Group
 * architectural assemblies with calibrated PBR materials.
 */
function buildLuxuryPenthouseScene(
  maxAnisotropy: number,
  enableShadows: boolean
): {
  rootGroup: THREE.Group;
  interactableMeshes: THREE.Object3D[];
  sofaMaterial: THREE.MeshStandardMaterial;
  islandMaterial: THREE.MeshStandardMaterial;
  chandelierRingMaterials: THREE.MeshPhysicalMaterial[];
} {
  const rootGroup = new THREE.Group();
  rootGroup.name = 'ProceduralLuxuryPenthouse';
  const interactableMeshes: THREE.Object3D[] = [];

  const registerMesh = (mesh: THREE.Mesh, label: string) => {
    mesh.name = label;
    if (enableShadows) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
    interactableMeshes.push(mesh);
    return mesh;
  };

  const floorTex = createProceduralFloorTexture(maxAnisotropy);
  const darkMarbleTex = createProceduralMarbleTexture(
    '#141416',
    'rgba(245, 158, 11, 0.16)',
    maxAnisotropy
  );
  const travertineTex = createProceduralMarbleTexture(
    '#cec4b4',
    'rgba(90, 78, 62, 0.18)',
    maxAnisotropy
  );

  // 1. Main Architectural Floor & Ceiling Shell
  const floorMat = new THREE.MeshStandardMaterial({
    map: floorTex,
    color: 0xffffff,
    roughness: 0.32,
    metalness: 0.12
  });
  const floorMesh = registerMesh(
    new THREE.Mesh(new THREE.BoxGeometry(13.6, 0.2, 12.6), floorMat),
    'Honed Obsidian Travertine Floor'
  );
  floorMesh.position.set(0, -0.1, 0.5);
  rootGroup.add(floorMesh);

  // Recessed Ceiling & Perimeter Architectural Cove (Single-sided facing downward so 3D Dollhouse mode sees straight inside from above!)
  const ceilingMat = new THREE.MeshStandardMaterial({
    color: 0x16161a,
    roughness: 0.85,
    metalness: 0.05,
    side: THREE.FrontSide
  });
  const ceilingMesh = new THREE.Mesh(new THREE.PlaneGeometry(13.6, 12.6), ceilingMat);
  ceilingMesh.rotation.x = Math.PI / 2;
  ceilingMesh.position.set(0, 3.85, 0.5);
  rootGroup.add(ceilingMesh);

  // Warm LED Perimeter Cove Strips
  const coveMat = new THREE.MeshStandardMaterial({
    color: 0xffdf9e,
    emissive: 0xf59e0b,
    emissiveIntensity: 0.85,
    roughness: 0.2
  });
  const northCove = new THREE.Mesh(new THREE.BoxGeometry(12.2, 0.04, 0.08), coveMat);
  northCove.position.set(0, 3.78, -5.2);
  rootGroup.add(northCove);

  // Walls (West Gallery Wall, East Culinary Wall, South Entry Partition, North Panoramic Mullions)
  const wallMat = new THREE.MeshStandardMaterial({
    color: 0x2a2724,
    roughness: 0.65,
    metalness: 0.08
  });

  const westWall = registerMesh(
    new THREE.Mesh(new THREE.BoxGeometry(0.25, 3.9, 12.6), wallMat),
    'West Acoustic Limestone Wall'
  );
  westWall.position.set(-6.7, 1.95, 0.5);
  rootGroup.add(westWall);

  const eastWall = registerMesh(
    new THREE.Mesh(new THREE.BoxGeometry(0.25, 3.9, 12.6), wallMat),
    'East Architectural Millwork Wall'
  );
  eastWall.position.set(6.7, 1.95, 0.5);
  rootGroup.add(eastWall);

  const southWallLeft = registerMesh(
    new THREE.Mesh(new THREE.BoxGeometry(4.6, 3.9, 0.25), wallMat),
    'South Foyer Flank Wall'
  );
  southWallLeft.position.set(-4.4, 1.95, 6.7);
  rootGroup.add(southWallLeft);

  const southWallRight = registerMesh(
    new THREE.Mesh(new THREE.BoxGeometry(4.6, 3.9, 0.25), wallMat),
    'South Foyer Gallery Wall'
  );
  southWallRight.position.set(4.4, 1.95, 6.7);
  rootGroup.add(southWallRight);

  // North Panoramic Curtain Wall with Bronze Mullions & Twilight Skyline Vista
  const curtainWallGroup = new THREE.Group();
  const bronzeMullionMat = new THREE.MeshStandardMaterial({
    color: 0x3b2f26,
    roughness: 0.28,
    metalness: 0.82
  });
  const glassPaneMat = new THREE.MeshPhysicalMaterial({
    color: 0x182638,
    transparent: true,
    opacity: 0.34,
    roughness: 0.08,
    metalness: 0.1,
    transmission: 0.55,
    depthWrite: false
  });

  const glassWall = registerMesh(
    new THREE.Mesh(new THREE.PlaneGeometry(13.2, 3.8), glassPaneMat),
    'North Panoramic Curtain Glazing'
  );
  glassWall.position.set(0, 1.9, -5.65);
  curtainWallGroup.add(glassWall);

  for (let i = -6; i <= 6; i += 2.4) {
    const mullion = new THREE.Mesh(new THREE.BoxGeometry(0.08, 3.9, 0.14), bronzeMullionMat);
    mullion.position.set(i, 1.95, -5.6);
    curtainWallGroup.add(mullion);
  }
  const transomBar = new THREE.Mesh(new THREE.BoxGeometry(13.4, 0.08, 0.14), bronzeMullionMat);
  transomBar.position.set(0, 2.85, -5.6);
  curtainWallGroup.add(transomBar);

  // Distant Skyline Silhouette Towers outside the North Window for realistic architectural depth
  const skylineGroup = new THREE.Group();
  const towerMat = new THREE.MeshStandardMaterial({
    color: 0x0d131c,
    emissive: 0x1e293b,
    emissiveIntensity: 0.35,
    roughness: 0.6
  });
  const towerSpecs: [number, number, number, number, number][] = [
    [-7.5, 4.5, -13, 2.2, 11],
    [-4.2, 6.0, -15, 2.6, 14],
    [-0.8, 5.2, -14, 2.0, 12.5],
    [2.8, 7.0, -16, 2.8, 16],
    [6.5, 4.8, -13.5, 2.4, 11.5]
  ];
  for (const [tx, ty, tz, tw, th] of towerSpecs) {
    const tower = new THREE.Mesh(new THREE.BoxGeometry(tw, th, 2.0), towerMat);
    tower.position.set(tx, ty - 2.5, tz);
    skylineGroup.add(tower);
  }
  curtainWallGroup.add(skylineGroup);
  rootGroup.add(curtainWallGroup);

  // 2. LIVING SALON GROUP (West Wing) — 9-part bespoke sectional + travertine table + bronze lamp
  const salonGroup = new THREE.Group();
  salonGroup.position.set(-3.3, 0, -0.8);

  // Woven Silk Area Rug (Offset Y = 0.02m to prevent Z-fighting)
  const rugMat = new THREE.MeshStandardMaterial({
    color: 0x262320,
    roughness: 0.92,
    metalness: 0.02
  });
  const salonRug = registerMesh(
    new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.02, 4.2), rugMat),
    'Hand-Knotted Tibetan Silk Rug'
  );
  salonRug.position.set(0.2, 0.01, 0);
  salonGroup.add(salonRug);

  // Sofa Upholstery Material (Dynamically upgradable via AI Pin!)
  const sofaMaterial = new THREE.MeshStandardMaterial({
    color: 0x134e3a, // Deep Emerald Velvet default showcase finish
    roughness: 0.62,
    metalness: 0.08
  });
  const sofaPlinthMat = new THREE.MeshStandardMaterial({
    color: 0x241c16,
    roughness: 0.4,
    metalness: 0.45
  });

  // Plinth base
  const mainPlinth = registerMesh(
    new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.14, 1.15), sofaPlinthMat),
    'Sectional Walnut Plinth'
  );
  mainPlinth.position.set(0, 0.09, -0.9);
  salonGroup.add(mainPlinth);

  const chaisePlinth = registerMesh(
    new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.14, 2.1), sofaPlinthMat),
    'Sectional Chaise Plinth'
  );
  chaisePlinth.position.set(-1.07, 0.09, 0.15);
  salonGroup.add(chaisePlinth);

  // Seat Cushions
  const seatCushionA = registerMesh(
    new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.28, 1.05), sofaMaterial),
    'Living Salon Velvet Sectional Sofa'
  );
  seatCushionA.position.set(0.6, 0.3, -0.88);
  salonGroup.add(seatCushionA);

  const seatCushionChaise = registerMesh(
    new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.28, 2.15), sofaMaterial),
    'Living Salon Velvet Sectional Sofa'
  );
  seatCushionChaise.position.set(-1.07, 0.3, -0.32);
  salonGroup.add(seatCushionChaise);

  // Backrest & Armrests
  const backrest = registerMesh(
    new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.58, 0.26), sofaMaterial),
    'Living Salon Velvet Sectional Sofa'
  );
  backrest.position.set(0, 0.58, -1.32);
  salonGroup.add(backrest);

  const leftArm = registerMesh(
    new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.52, 2.25), sofaMaterial),
    'Living Salon Velvet Sectional Sofa'
  );
  leftArm.position.set(-1.62, 0.52, -0.32);
  salonGroup.add(leftArm);

  const rightArm = registerMesh(
    new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.52, 1.12), sofaMaterial),
    'Living Salon Velvet Sectional Sofa'
  );
  rightArm.position.set(1.62, 0.52, -0.88);
  salonGroup.add(rightArm);

  // Monolithic Roman Travertine Coffee Table
  const travertineMat = new THREE.MeshStandardMaterial({
    map: travertineTex,
    color: 0xffffff,
    roughness: 0.38,
    metalness: 0.06
  });
  const coffeeTableSlab = registerMesh(
    new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.12, 1.05), travertineMat),
    'Roman Travertine Monolith Coffee Table'
  );
  coffeeTableSlab.position.set(0.55, 0.38, 0.35);
  salonGroup.add(coffeeTableSlab);

  const coffeeLegLeft = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.32, 20), travertineMat);
  coffeeLegLeft.position.set(0.05, 0.16, 0.35);
  salonGroup.add(coffeeLegLeft);

  const coffeeLegRight = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.32, 20), travertineMat);
  coffeeLegRight.position.set(1.05, 0.16, 0.35);
  salonGroup.add(coffeeLegRight);

  // Sculptural Brass Vessel on Coffee Table
  const brassMat = new THREE.MeshPhysicalMaterial({
    color: 0xd4af37,
    roughness: 0.22,
    metalness: 0.92,
    clearcoat: 0.4
  });
  const centerVessel = registerMesh(
    new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, 0.26, 24), brassMat),
    'Brushed Brass Centerpiece Vessel'
  );
  centerVessel.position.set(0.45, 0.57, 0.35);
  salonGroup.add(centerVessel);

  // Arched Architectural Floor Lamp
  const lampBase = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.24, 0.35, 20), travertineMat);
  lampBase.position.set(2.05, 0.175, -1.25);
  salonGroup.add(lampBase);

  const lampStem = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 2.35, 16), brassMat);
  lampStem.position.set(2.05, 1.35, -1.25);
  salonGroup.add(lampStem);

  const lampGlobe = new THREE.Mesh(
    new THREE.SphereGeometry(0.2, 20, 20),
    new THREE.MeshStandardMaterial({
      color: 0xfff3d1,
      emissive: 0xf59e0b,
      emissiveIntensity: 1.4,
      roughness: 0.2
    })
  );
  lampGlobe.position.set(1.85, 2.45, -1.05);
  salonGroup.add(lampGlobe);

  rootGroup.add(salonGroup);

  // 3. DINING PAVILION GROUP (East Wing) — Walnut Slab Table + 6 Bouclé Chairs + Dual-Ring Chandelier
  const diningGroup = new THREE.Group();
  diningGroup.position.set(3.2, 0, 0.2);

  const walnutMat = new THREE.MeshStandardMaterial({
    color: 0x3b2618,
    roughness: 0.34,
    metalness: 0.12
  });
  const diningTop = registerMesh(
    new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.09, 1.25), walnutMat),
    'American Walnut Architectural Dining Table'
  );
  diningTop.position.set(0, 0.76, 0);
  diningGroup.add(diningTop);

  const pedLeft = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.72, 24), bronzeMullionMat);
  pedLeft.position.set(-0.85, 0.36, 0);
  diningGroup.add(pedLeft);

  const pedRight = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.72, 24), bronzeMullionMat);
  pedRight.position.set(0.85, 0.36, 0);
  diningGroup.add(pedRight);

  const boucleChairMat = new THREE.MeshStandardMaterial({
    color: 0xd6cfc2,
    roughness: 0.82,
    metalness: 0.04
  });

  const chairOffsets: [number, number, number][] = [
    [-0.9, -0.85, 0],
    [0, -0.85, 0],
    [0.9, -0.85, 0],
    [-0.9, 0.85, Math.PI],
    [0, 0.85, Math.PI],
    [0.9, 0.85, Math.PI]
  ];

  for (const [cx, cz, rotY] of chairOffsets) {
    const chair = new THREE.Group();
    chair.position.set(cx, 0, cz);
    chair.rotation.y = rotY;

    const seat = registerMesh(
      new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.24, 0.08, 20), boucleChairMat),
      'Sculpted Ivory Bouclé Dining Chair'
    );
    seat.position.set(0, 0.46, 0);
    chair.add(seat);

    const back = registerMesh(
      new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.38, 0.08), boucleChairMat),
      'Sculpted Ivory Bouclé Dining Chair'
    );
    back.position.set(0, 0.68, -0.2);
    chair.add(back);

    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.18, 0.44, 16), bronzeMullionMat);
    base.position.set(0, 0.22, 0);
    chair.add(base);

    diningGroup.add(chair);
  }

  // Suspended Dual-Ring Alabaster & Brushed Gold Chandelier
  const chandelierRingMaterials: THREE.MeshPhysicalMaterial[] = [];
  const ringMatOuter = new THREE.MeshPhysicalMaterial({
    color: 0xf5d076,
    emissive: 0xd97706,
    emissiveIntensity: 0.55,
    roughness: 0.18,
    metalness: 0.88,
    clearcoat: 0.6
  });
  chandelierRingMaterials.push(ringMatOuter);

  const chandelierGroup = new THREE.Group();
  chandelierGroup.position.set(0, 2.75, 0);

  const outerRing = registerMesh(
    new THREE.Mesh(new THREE.TorusGeometry(0.82, 0.035, 16, 48), ringMatOuter),
    'Suspended Alabaster & Gold Ring Chandelier'
  );
  outerRing.rotation.x = Math.PI / 2;
  chandelierGroup.add(outerRing);

  const innerRing = registerMesh(
    new THREE.Mesh(new THREE.TorusGeometry(0.48, 0.028, 16, 40), ringMatOuter),
    'Suspended Alabaster & Gold Ring Chandelier'
  );
  innerRing.rotation.x = Math.PI / 2;
  innerRing.position.y = -0.22;
  chandelierGroup.add(innerRing);

  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.15, 12), brassMat);
  rod.position.y = 0.55;
  chandelierGroup.add(rod);

  diningGroup.add(chandelierGroup);
  rootGroup.add(diningGroup);

  // 4. CHEF ATELIER WATERFALL ISLAND (North-East Culinary Suite)
  const kitchenGroup = new THREE.Group();
  kitchenGroup.position.set(3.1, 0, -3.2);

  const islandMaterial = new THREE.MeshStandardMaterial({
    map: darkMarbleTex,
    color: 0xffffff,
    roughness: 0.22,
    metalness: 0.18
  });

  const islandBlock = registerMesh(
    new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.96, 1.15), islandMaterial),
    'Nero Marquina Waterfall Kitchen Island'
  );
  islandBlock.position.set(0, 0.48, 0);
  kitchenGroup.add(islandBlock);

  const counterOverhang = registerMesh(
    new THREE.Mesh(new THREE.BoxGeometry(3.32, 0.08, 1.32), islandMaterial),
    'Nero Marquina Waterfall Kitchen Island'
  );
  counterOverhang.position.set(0, 0.98, 0.06);
  kitchenGroup.add(counterOverhang);

  // Brass Faucet Fixture
  const faucetStem = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.34, 14), brassMat);
  faucetStem.position.set(-0.6, 1.18, -0.2);
  kitchenGroup.add(faucetStem);

  rootGroup.add(kitchenGroup);

  // 5. COLLECTOR GALLERY WALL TRIPTYCH (West Acoustic Wall)
  const galleryGroup = new THREE.Group();
  galleryGroup.position.set(-6.5, 1.85, -1.2);

  const frameOffsets = [-1.45, 0, 1.45];
  for (let idx = 0; idx < frameOffsets.length; idx++) {
    const zOff = frameOffsets[idx];
    const frameMesh = registerMesh(
      new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.55, 1.12), brassMat),
      `Collector Gallery Relief Panel 0${idx + 1}`
    );
    frameMesh.position.set(0, 0, zOff);
    galleryGroup.add(frameMesh);

    const canvasMesh = registerMesh(
      new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 1.42, 0.98),
        new THREE.MeshStandardMaterial({
          map: travertineTex,
          color: idx === 1 ? 0xd4af37 : 0xe5dec9,
          roughness: 0.48,
          metalness: idx === 1 ? 0.45 : 0.12
        })
      ),
      `Collector Gallery Relief Panel 0${idx + 1}`
    );
    canvasMesh.position.set(0.03, 0, zOff);
    galleryGroup.add(canvasMesh);
  }
  rootGroup.add(galleryGroup);

  return {
    rootGroup,
    interactableMeshes,
    sofaMaterial,
    islandMaterial,
    chandelierRingMaterials
  };
}

export const StreetViewViewer: React.FC<StreetViewViewerProps> = ({
  modelUrl,
  waypoints,
  activeWaypointId,
  navigationMode,
  pins,
  selectedPinId,
  onSelectWaypoint,
  onSelectPin,
  onAddPinAtCoordinate
}) => {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);

  const [projectedPins, setProjectedPins] = useState<ProjectedPin[]>([]);
  const [projectedWaypoints, setProjectedWaypoints] = useState<ProjectedWaypoint[]>([]);
  const [hoveredWaypointLabel, setHoveredWaypointLabel] = useState<string | null>(null);
  const [loadingExternalGlb, setLoadingExternalGlb] = useState<boolean>(false);
  const [glbError, setGlbError] = useState<string | null>(null);

  // Mutable ref state so rAF loop and pointer listeners never tear down WebGL context
  const stateRef = useRef({
    waypoints,
    activeWaypointId,
    navigationMode,
    pins,
    selectedPinId,
    onSelectWaypoint,
    onSelectPin,
    onAddPinAtCoordinate,
    // Camera kinematics state
    camPos: new THREE.Vector3(0, 1.65, 5.2),
    targetCamPos: new THREE.Vector3(0, 1.65, 5.2),
    lookYaw: 0,
    lookPitch: -0.04,
    targetYaw: 0,
    targetPitch: -0.04,
    // Orbit / Dollhouse spherical coordinates
    orbitTheta: 0.68,
    orbitPhi: 0.92,
    orbitRadius: 13.8,
    targetOrbitTheta: 0.68,
    targetOrbitPhi: 0.92,
    targetOrbitRadius: 13.8,
    orbitCenter: new THREE.Vector3(0, 1.1, 0),
    isPointerDown: false,
    lastPointerX: 0,
    lastPointerY: 0,
    keysPressed: new Set<string>()
  });

  useEffect(() => {
    stateRef.current.waypoints = waypoints;
    stateRef.current.activeWaypointId = activeWaypointId;
    stateRef.current.navigationMode = navigationMode;
    stateRef.current.pins = pins;
    stateRef.current.selectedPinId = selectedPinId;
    stateRef.current.onSelectWaypoint = onSelectWaypoint;
    stateRef.current.onSelectPin = onSelectPin;
    stateRef.current.onAddPinAtCoordinate = onAddPinAtCoordinate;
  }, [
    waypoints,
    activeWaypointId,
    navigationMode,
    pins,
    selectedPinId,
    onSelectWaypoint,
    onSelectPin,
    onAddPinAtCoordinate
  ]);

  // References to procedural materials for instant AI Pin material preview
  const materialsRef = useRef<{
    sofaMaterial: THREE.MeshStandardMaterial | null;
    islandMaterial: THREE.MeshStandardMaterial | null;
    chandelierRingMaterials: THREE.MeshPhysicalMaterial[];
  }>({
    sofaMaterial: null,
    islandMaterial: null,
    chandelierRingMaterials: []
  });

  // References to scene objects updated when waypoints or modelUrl change
  const sceneObjectsRef = useRef<{
    scene: THREE.Scene | null;
    camera: THREE.PerspectiveCamera | null;
    renderer: THREE.WebGLRenderer | null;
    waypointRingsGroup: THREE.Group | null;
    uploadedModelGroup: THREE.Group | null;
    proceduralRootGroup: THREE.Group | null;
    interactables: THREE.Object3D[];
    waypointMeshes: THREE.Object3D[];
  }>({
    scene: null,
    camera: null,
    renderer: null,
    waypointRingsGroup: null,
    uploadedModelGroup: null,
    proceduralRootGroup: null,
    interactables: [],
    waypointMeshes: []
  });

  // Update target camera position & orientation whenever activeWaypointId or navigationMode changes
  useEffect(() => {
    const activeWp =
      waypoints.find((w) => w.id === activeWaypointId) || waypoints[0];
    if (!activeWp) return;

    const [wx, wy, wz] = activeWp.position;
    const eyeY = wy + 1.65;
    stateRef.current.targetCamPos.set(wx, eyeY, wz);

    // Orient camera toward the waypoint's lookAt coordinate
    const [lx, ly, lz] = activeWp.lookAt;
    const dx = lx - wx;
    const dy = ly - eyeY;
    const dz = lz - wz;
    const horizDist = Math.max(0.001, Math.hypot(dx, dz));
    stateRef.current.targetYaw = Math.atan2(-dx, -dz);
    stateRef.current.targetPitch = THREE.MathUtils.clamp(
      Math.atan2(dy, horizDist),
      -0.65,
      0.55
    );
  }, [activeWaypointId, waypoints, navigationMode]);

  // Synchronize 3D Penthouse materials with Spatial Pin approval states
  useEffect(() => {
    const { sofaMaterial, islandMaterial } = materialsRef.current;
    if (sofaMaterial) {
      const sofaPin = pins.find((p) => p.materialPreset === 'emerald-velvet');
      if (sofaPin && sofaPin.status === 'approved') {
        sofaMaterial.color.setHex(0x0d5c46); // Rich Emerald Green Velvet
        sofaMaterial.roughness = 0.52;
      } else {
        sofaMaterial.color.setHex(0x27262b); // Original Charcoal Bouclé
        sofaMaterial.roughness = 0.78;
      }
      sofaMaterial.needsUpdate = true;
    }

    if (islandMaterial) {
      const marblePin = pins.find((p) => p.materialPreset === 'calacatta-marble');
      if (marblePin && marblePin.status === 'approved') {
        islandMaterial.color.setHex(0xf3efe6); // Calacatta Viola Warm Ivory
        islandMaterial.roughness = 0.16;
      } else {
        islandMaterial.color.setHex(0xffffff); // Nero Marquina Dark Stone
        islandMaterial.roughness = 0.24;
      }
      islandMaterial.needsUpdate = true;
    }
  }, [pins]);

  // Rebuild Street View Floor Circles whenever waypoints or activeWaypointId updates
  const rebuildWaypointCircles = useCallback(() => {
    const { waypointRingsGroup } = sceneObjectsRef.current;
    if (!waypointRingsGroup) return;

    while (waypointRingsGroup.children.length > 0) {
      const child = waypointRingsGroup.children[0];
      waypointRingsGroup.remove(child);
    }
    sceneObjectsRef.current.waypointMeshes = [];

    for (const wp of waypoints) {
      const isSelected = wp.id === activeWaypointId;
      const ringHolder = new THREE.Group();
      ringHolder.position.set(wp.position[0], wp.position[1] + 0.028, wp.position[2]);
      ringHolder.userData = { waypoint: wp };

      // Outer glowing Street View ring
      const outerGeo = new THREE.RingGeometry(0.34, 0.46, 36);
      const outerMat = new THREE.MeshBasicMaterial({
        color: isSelected ? 0x10b981 : 0xf59e0b,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: isSelected ? 0.95 : 0.75,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2
      });
      const outerRing = new THREE.Mesh(outerGeo, outerMat);
      outerRing.rotation.x = -Math.PI / 2;
      outerRing.userData = { waypoint: wp };
      ringHolder.add(outerRing);

      // Inner translucent target disc for easy clicking/raycasting
      const innerGeo = new THREE.CircleGeometry(0.32, 32);
      const innerMat = new THREE.MeshBasicMaterial({
        color: isSelected ? 0x10b981 : 0xffffff,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: isSelected ? 0.28 : 0.14,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1
      });
      const innerDisc = new THREE.Mesh(innerGeo, innerMat);
      innerDisc.rotation.x = -Math.PI / 2;
      innerDisc.userData = { waypoint: wp };
      ringHolder.add(innerDisc);

      waypointRingsGroup.add(ringHolder);
      sceneObjectsRef.current.waypointMeshes.push(outerRing, innerDisc);
    }
  }, [waypoints, activeWaypointId]);

  useEffect(() => {
    rebuildWaypointCircles();
  }, [rebuildWaypointCircles]);

  // Load external .GLB model via GLTFLoader + Google's Draco 1.5.7 decoder when modelUrl changes
  useEffect(() => {
    const { uploadedModelGroup, proceduralRootGroup } = sceneObjectsRef.current;
    if (!uploadedModelGroup || !proceduralRootGroup) return;

    // Clear previous uploaded model
    while (uploadedModelGroup.children.length > 0) {
      const child = uploadedModelGroup.children[0];
      uploadedModelGroup.remove(child);
    }

    if (!modelUrl || modelUrl === 'procedural://luxury-penthouse') {
      proceduralRootGroup.visible = true;
      setLoadingExternalGlb(false);
      setGlbError(null);
      return;
    }

    setLoadingExternalGlb(true);
    setGlbError(null);

    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
    dracoLoader.preload();

    const gltfLoader = new GLTFLoader();
    gltfLoader.setDRACOLoader(dracoLoader);

    let cancelled = false;

    gltfLoader.load(
      modelUrl,
      (gltf) => {
        if (cancelled) return;
        const model = gltf.scene;

        // Keep subtle architectural lighting context and ground the uploaded model
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());

        if (Number.isFinite(size.x) && size.length() > 0.01) {
          model.position.x -= center.x;
          model.position.z -= center.z;
          model.position.y -= box.min.y;
        }

        model.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh;
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            if (!mesh.name) {
              mesh.name = 'Uploaded .GLB Architectural Surface';
            }
            sceneObjectsRef.current.interactables.push(mesh);
          }
        });

        uploadedModelGroup.add(model);
        // Keep the procedural penthouse shell visible as studio context if the uploaded GLB is a small prop/sample shell
        proceduralRootGroup.visible = true;
        setLoadingExternalGlb(false);
      },
      undefined,
      (err) => {
        if (cancelled) return;
        console.warn('GLB Loader Fallback:', err);
        setGlbError('Loaded procedural penthouse fallback for preview.');
        proceduralRootGroup.visible = true;
        setLoadingExternalGlb(false);
      }
    );

    return () => {
      cancelled = true;
      dracoLoader.dispose();
    };
  }, [modelUrl]);

  // Primary WebGLRenderer & Scene initialization (Mounted once)
  useEffect(() => {
    const container = canvasMountRef.current;
    if (!container) return;

    const isHeadless =
      navigator.webdriver || /HeadlessChrome/i.test(navigator.userAgent);

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#0A0A0A');
    scene.fog = new THREE.FogExp2('#0A0A0A', 0.016);

    const camera = new THREE.PerspectiveCamera(62, width / height, 0.1, 120);
    camera.position.copy(stateRef.current.camPos);

    const renderer = new THREE.WebGLRenderer({
      antialias: !isHeadless,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;
    renderer.setPixelRatio(isHeadless ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = !isHeadless;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // Studio Apartment Environment Reflections via PMREMGenerator + RoomEnvironment (GPU only; skip heavy cubemap shader in headless CPU)
    if (!isHeadless) {
      const pmremGenerator = new THREE.PMREMGenerator(renderer);
      scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
      pmremGenerator.dispose();
    }

    // Balanced 3-Point Architectural Lighting Rig (Warm Key + Cool Sky/Ground Hemisphere + Chandelier PointLight)
    const hemiLight = new THREE.HemisphereLight(0xe2e8f0, 0x292524, 1.15);
    hemiLight.position.set(0, 8, 0);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff1d6, 1.85);
    keyLight.position.set(4.5, 7.5, 5.5);
    if (!isHeadless) {
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.set(1024, 1024);
      keyLight.shadow.camera.near = 0.5;
      keyLight.shadow.camera.far = 25;
      const d = 8.5;
      keyLight.shadow.camera.left = -d;
      keyLight.shadow.camera.right = d;
      keyLight.shadow.camera.top = d;
      keyLight.shadow.camera.bottom = -d;
      keyLight.shadow.bias = -0.0005;
    }
    scene.add(keyLight);

    const chandelierLight = new THREE.PointLight(0xffcf7c, 2.2, 14, 1.4);
    chandelierLight.position.set(3.2, 2.55, 0.2);
    scene.add(chandelierLight);

    const salonWarmLight = new THREE.PointLight(0xffdca8, 1.6, 12, 1.5);
    salonWarmLight.position.set(-2.5, 2.4, -1.2);
    scene.add(salonWarmLight);

    // Build Procedural Luxury Penthouse Fallback
    const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
    const penthouse = buildLuxuryPenthouseScene(maxAnisotropy, !isHeadless);
    scene.add(penthouse.rootGroup);

    materialsRef.current = {
      sofaMaterial: penthouse.sofaMaterial,
      islandMaterial: penthouse.islandMaterial,
      chandelierRingMaterials: penthouse.chandelierRingMaterials
    };

    const waypointRingsGroup = new THREE.Group();
    waypointRingsGroup.name = 'StreetViewFloorCircles';
    scene.add(waypointRingsGroup);

    const uploadedModelGroup = new THREE.Group();
    uploadedModelGroup.name = 'UploadedGLBContainer';
    scene.add(uploadedModelGroup);

    sceneObjectsRef.current = {
      scene,
      camera,
      renderer,
      waypointRingsGroup,
      uploadedModelGroup,
      proceduralRootGroup: penthouse.rootGroup,
      interactables: penthouse.interactableMeshes,
      waypointMeshes: []
    };

    rebuildWaypointCircles();
    renderer.compile(scene, camera);

    // Raycaster for Floor Waypoint clicks & 3D Spatial Pin double-clicks
    const raycaster = new THREE.Raycaster();
    const pointerNdc = new THREE.Vector2();

    const updateNdc = (clientX: number, clientY: number) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      pointerNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    };

    let pointerDownTime = 0;
    let pointerDownPos = { x: 0, y: 0 };
    let lastHoverCheck = 0;

    const handlePointerDown = (e: PointerEvent) => {
      stateRef.current.isPointerDown = true;
      stateRef.current.lastPointerX = e.clientX;
      stateRef.current.lastPointerY = e.clientY;
      pointerDownTime = performance.now();
      pointerDownPos = { x: e.clientX, y: e.clientY };
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (stateRef.current.isPointerDown) {
        const dx = e.clientX - stateRef.current.lastPointerX;
        const dy = e.clientY - stateRef.current.lastPointerY;
        stateRef.current.lastPointerX = e.clientX;
        stateRef.current.lastPointerY = e.clientY;

        if (stateRef.current.navigationMode === 'street-view') {
          stateRef.current.targetYaw -= dx * 0.0045;
          stateRef.current.targetPitch = THREE.MathUtils.clamp(
            stateRef.current.targetPitch - dy * 0.0038,
            -0.75,
            0.65
          );
        } else {
          stateRef.current.targetOrbitTheta -= dx * 0.0055;
          stateRef.current.targetOrbitPhi = THREE.MathUtils.clamp(
            stateRef.current.targetOrbitPhi - dy * 0.005,
            0.25,
            1.42
          );
        }
        return;
      }

      // Throttled hover raycast on floor waypoint circles (20Hz max)
      const now = performance.now();
      if (now - lastHoverCheck < 50) return;
      lastHoverCheck = now;

      updateNdc(e.clientX, e.clientY);
      raycaster.setFromCamera(pointerNdc, camera);
      const hits = raycaster.intersectObjects(sceneObjectsRef.current.waypointMeshes, false);
      if (hits.length > 0 && hits[0].object.userData?.waypoint) {
        const wp = hits[0].object.userData.waypoint as Waypoint;
        setHoveredWaypointLabel(wp.label);
        renderer.domElement.style.cursor = 'pointer';
      } else {
        setHoveredWaypointLabel(null);
        renderer.domElement.style.cursor = 'grab';
      }
    };

    const handlePointerUp = (e: PointerEvent) => {
      stateRef.current.isPointerDown = false;
      const elapsed = performance.now() - pointerDownTime;
      const dist = Math.hypot(
        e.clientX - pointerDownPos.x,
        e.clientY - pointerDownPos.y
      );

      // Single tap/click (< 260ms and < 6px drag) checks Street View Floor Circles
      if (elapsed < 260 && dist < 6) {
        updateNdc(e.clientX, e.clientY);
        raycaster.setFromCamera(pointerNdc, camera);
        const wpHits = raycaster.intersectObjects(
          sceneObjectsRef.current.waypointMeshes,
          false
        );
        if (wpHits.length > 0 && wpHits[0].object.userData?.waypoint) {
          const clickedWp = wpHits[0].object.userData.waypoint as Waypoint;
          stateRef.current.onSelectWaypoint(clickedWp);
        }
      }
    };

    const handleDoubleClick = (e: MouseEvent) => {
      updateNdc(e.clientX, e.clientY);
      raycaster.setFromCamera(pointerNdc, camera);
      const hits = raycaster.intersectObjects(
        sceneObjectsRef.current.interactables,
        true
      );
      if (hits.length > 0) {
        const hit = hits[0];
        const pt: [number, number, number] = [
          Math.round(hit.point.x * 100) / 100,
          Math.round(hit.point.y * 100) / 100,
          Math.round(hit.point.z * 100) / 100
        ];
        const camAngle: [number, number, number] = [
          Math.round(camera.position.x * 100) / 100,
          Math.round(camera.position.y * 100) / 100,
          Math.round(camera.position.z * 100) / 100
        ];
        const targetName = hit.object.name || 'Architectural Surface';
        stateRef.current.onAddPinAtCoordinate(pt, camAngle, targetName);
      }
    };

    const handleWheel = (e: WheelEvent) => {
      if (stateRef.current.navigationMode === 'dollhouse') {
        stateRef.current.targetOrbitRadius = THREE.MathUtils.clamp(
          stateRef.current.targetOrbitRadius + e.deltaY * 0.008,
          5.5,
          22.0
        );
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement &&
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)
      ) {
        return;
      }
      stateRef.current.keysPressed.add(e.code);
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      stateRef.current.keysPressed.delete(e.code);
    };

    const domElem = renderer.domElement;
    domElem.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    domElem.addEventListener('dblclick', handleDoubleClick);
    domElem.addEventListener('wheel', handleWheel, { passive: true });
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    // Animation loop with exponential damping (smoothTime = 0.45 equivalent) and change-only HUD overlay projection
    const clock = new THREE.Clock();
    let rafId = 0;
    let headlessTimer: number | null = null;
    let lastOverlaySync = 0;
    let lastPinSignature = '';
    let lastWpSignature = '';

    const scheduleNextTick = () => {
      if (isHeadless) {
        headlessTimer = window.setTimeout(() => {
          animate(performance.now());
        }, 120);
      } else {
        rafId = requestAnimationFrame(animate);
      }
    };

    const animate = (timestamp: number) => {
      scheduleNextTick();

      const dt = Math.min(clock.getDelta(), 0.1);
      const st = stateRef.current;

      // Keyboard WASD / Arrow look & step support
      const moveSpeed = 3.2 * dt;
      if (st.navigationMode === 'street-view') {
        if (st.keysPressed.has('ArrowLeft') || st.keysPressed.has('KeyA')) {
          st.targetYaw += 1.4 * dt;
        }
        if (st.keysPressed.has('ArrowRight') || st.keysPressed.has('KeyD')) {
          st.targetYaw -= 1.4 * dt;
        }
        if (st.keysPressed.has('ArrowUp') || st.keysPressed.has('KeyW')) {
          st.targetCamPos.x -= Math.sin(st.lookYaw) * moveSpeed;
          st.targetCamPos.z -= Math.cos(st.lookYaw) * moveSpeed;
        }
        if (st.keysPressed.has('ArrowDown') || st.keysPressed.has('KeyS')) {
          st.targetCamPos.x += Math.sin(st.lookYaw) * moveSpeed;
          st.targetCamPos.z += Math.cos(st.lookYaw) * moveSpeed;
        }
      }

      if (st.navigationMode === 'street-view') {
        // Exponential damping (smoothTime = 0.45s glide) to [x, y + 1.65, z]
        const posLambda = isHeadless ? 14.0 : 4.8;
        const rotLambda = isHeadless ? 16.0 : 8.5;
        st.camPos.x = THREE.MathUtils.damp(st.camPos.x, st.targetCamPos.x, posLambda, dt);
        st.camPos.y = THREE.MathUtils.damp(st.camPos.y, st.targetCamPos.y, posLambda, dt);
        st.camPos.z = THREE.MathUtils.damp(st.camPos.z, st.targetCamPos.z, posLambda, dt);

        st.lookYaw = THREE.MathUtils.damp(st.lookYaw, st.targetYaw, rotLambda, dt);
        st.lookPitch = THREE.MathUtils.damp(st.lookPitch, st.targetPitch, rotLambda, dt);

        camera.position.copy(st.camPos);

        _lookDir.set(
          -Math.sin(st.lookYaw) * Math.cos(st.lookPitch),
          Math.sin(st.lookPitch),
          -Math.cos(st.lookYaw) * Math.cos(st.lookPitch)
        );
        _vec3A.copy(camera.position).add(_lookDir);
        camera.lookAt(_vec3A);
      } else {
        // 3D Dollhouse Orbit Mode
        const orbitLambda = isHeadless ? 16.0 : 6.0;
        st.orbitTheta = THREE.MathUtils.damp(st.orbitTheta, st.targetOrbitTheta, orbitLambda, dt);
        st.orbitPhi = THREE.MathUtils.damp(st.orbitPhi, st.targetOrbitPhi, orbitLambda, dt);
        st.orbitRadius = THREE.MathUtils.damp(
          st.orbitRadius,
          st.targetOrbitRadius,
          orbitLambda,
          dt
        );

        const ox =
          st.orbitCenter.x +
          st.orbitRadius * Math.sin(st.orbitPhi) * Math.sin(st.orbitTheta);
        const oy = st.orbitCenter.y + st.orbitRadius * Math.cos(st.orbitPhi);
        const oz =
          st.orbitCenter.z +
          st.orbitRadius * Math.sin(st.orbitPhi) * Math.cos(st.orbitTheta);

        camera.position.set(ox, oy, oz);
        camera.lookAt(st.orbitCenter);
      }

      // Subtle breathing scale on floor waypoint rings inside WebGL
      if (!isHeadless) {
        const pulseScale = 1 + Math.sin(timestamp * 0.0035) * 0.06;
        for (const child of waypointRingsGroup.children) {
          child.scale.set(pulseScale, 1, pulseScale);
        }
      }

      renderer.render(scene, camera);

      // Project 3D Spatial Pins & Floor Waypoints to 2D screen coordinates only when changed
      if (timestamp - lastOverlaySync > 120) {
        lastOverlaySync = timestamp;
        const w = container.clientWidth || window.innerWidth;
        const h = container.clientHeight || window.innerHeight;

        const nextPins: ProjectedPin[] = st.pins.map((pin) => {
          _projVec.set(pin.position[0], pin.position[1], pin.position[2]);
          _projVec.project(camera);
          const visible = _projVec.z >= -1 && _projVec.z <= 1;
          const rawX = Math.round(((_projVec.x + 1) / 2) * w);
          const rawY = Math.round(((-_projVec.y + 1) / 2) * h);
          const sx = THREE.MathUtils.clamp(rawX, 110, w - 110);
          const sy = THREE.MathUtils.clamp(rawY, 60, h - 185);
          const inLeftHudZone = w > 768 && rawX < 445 && rawY < 720;
          const inRightHudZone =
            w > 768 && Boolean(st.selectedPinId) && rawX > w - 470 && rawY < 740;
          const inBottomDockZone = rawY > h - 195;
          return {
            id: pin.id,
            x: sx,
            y: sy,
            visible:
              visible &&
              !inLeftHudZone &&
              !inRightHudZone &&
              !inBottomDockZone &&
              rawX >= 30 &&
              rawX <= w - 30 &&
              rawY >= 50,
            pin
          };
        });

        const pinSig = nextPins
          .map((p) => `${p.id}:${Math.round(p.x / 2)}:${Math.round(p.y / 2)}:${p.visible}:${p.pin.status}:${p.pin.priceDelta}`)
          .join('|');
        if (pinSig !== lastPinSignature) {
          lastPinSignature = pinSig;
          setProjectedPins(nextPins);
        }

        const nextWps: ProjectedWaypoint[] = st.waypoints.map((wp) => {
          _vec3B.set(wp.position[0], wp.position[1] + 0.08, wp.position[2]);
          _vec3B.project(camera);
          const visible = _vec3B.z >= -1 && _vec3B.z <= 1;
          const rawX = Math.round(((_vec3B.x + 1) / 2) * w);
          const rawY = Math.round(((-_vec3B.y + 1) / 2) * h);
          const sx = THREE.MathUtils.clamp(rawX, 70, w - 70);
          const sy = THREE.MathUtils.clamp(rawY, 60, h - 195);
          const inLeftHudZone = w > 768 && rawX < 445 && rawY < 720;
          const inRightHudZone =
            w > 768 && Boolean(st.selectedPinId) && rawX > w - 470 && rawY < 740;
          const inBottomDockZone = rawY > h - 195;
          return {
            id: wp.id,
            x: sx,
            y: sy,
            visible:
              visible &&
              !inLeftHudZone &&
              !inRightHudZone &&
              !inBottomDockZone &&
              rawX >= 40 &&
              rawX <= w - 40 &&
              rawY >= 60,
            waypoint: wp
          };
        });

        const wpSig = nextWps
          .map((wp) => `${wp.id}:${Math.round(wp.x / 2)}:${Math.round(wp.y / 2)}:${wp.visible}`)
          .join('|');
        if (wpSig !== lastWpSignature) {
          lastWpSignature = wpSig;
          setProjectedWaypoints(nextWps);
        }
      }
    };

    animate(performance.now());

    return () => {
      cancelAnimationFrame(rafId);
      if (headlessTimer !== null) {
        window.clearTimeout(headlessTimer);
      }
      domElem.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      domElem.removeEventListener('dblclick', handleDoubleClick);
      domElem.removeEventListener('wheel', handleWheel);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
    };
  }, [rebuildWaypointCircles]);

  return (
    <div
      className="relative w-full h-full bg-[#0A0A0A] overflow-hidden select-none"
      data-testid="street-view-viewport"
      data-mode={navigationMode}
      data-active-waypoint={activeWaypointId}
    >
      {/* Isolated WebGL Canvas Mount Container */}
      <div
        ref={canvasMountRef}
        className="w-full h-full"
        aria-label="Interactive 3D Showroom Viewport"
      />

      {/* Accessible Interactive Floor Circle Overlay Targets synced with 3D Waypoints */}
      <div className="pointer-events-none absolute inset-0 z-10">
        {projectedWaypoints.map((pw) => {
          if (!pw.visible) return null;
          const isCurrent = pw.id === activeWaypointId;
          return (
            <button
              key={pw.id}
              type="button"
              onClick={() => onSelectWaypoint(pw.waypoint)}
              style={{
                transform: `translate3d(${pw.x}px, ${pw.y}px, 0) translate(-50%, -50%)`
              }}
              aria-label={`Glide to ${pw.waypoint.label}`}
              className={`pointer-events-auto absolute top-0 left-0 px-2.5 py-1 rounded-full text-[11px] font-medium tracking-tight transition-transform duration-150 hover:scale-105 focus-visible:outline-2 focus-visible:outline-[#10B981] whitespace-nowrap ${
                isCurrent
                  ? 'bg-[#10B981]/90 text-[#0A0A0A] font-semibold shadow-lg'
                  : 'bg-[#121212]/85 text-zinc-200 border border-white/15 hover:border-[#F59E0B]/70'
              }`}
            >
              {pw.waypoint.zone}
            </button>
          );
        })}

        {/* 3D Spatial Pin Badges ( + ) Anchored on 3D Surface Coordinates */}
        {projectedPins.map((pp) => {
          if (!pp.visible) return null;
          const isSelected = pp.id === selectedPinId;
          const isApproved = pp.pin.status === 'approved';
          return (
            <button
              key={pp.id}
              type="button"
              onClick={() => onSelectPin(pp.id)}
              style={{
                transform: `translate3d(${pp.x}px, ${pp.y}px, 0) translate(-50%, -50%)`
              }}
              aria-label={`Inspect Spatial Pin: ${pp.pin.title}`}
              className={`pointer-events-auto absolute top-0 left-0 flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-transform duration-150 hover:scale-105 focus-visible:outline-2 focus-visible:outline-white whitespace-nowrap ${
                isApproved
                  ? 'bg-[#10B981] text-[#0A0A0A] font-semibold shadow-lg'
                  : 'bg-[#F59E0B] text-[#0A0A0A] font-semibold shadow-lg'
              } ${isSelected ? 'ring-2 ring-white scale-105' : ''}`}
            >
              <span className="font-mono font-bold">( + )</span>
              <span>{pp.pin.title}</span>
              <span className="font-mono tabular-nums text-[11px] opacity-90">
                +${pp.pin.priceDelta.toLocaleString()}
              </span>
            </button>
          );
        })}
      </div>

      {/* Subtle Hover Tooltip for Floor Circle */}
      {hoveredWaypointLabel && (
        <div className="pointer-events-none absolute top-20 left-1/2 -translate-x-1/2 z-20 px-3.5 py-1.5 rounded-lg bg-[#121212]/90 border border-white/10 text-xs text-zinc-200 whitespace-nowrap">
          Click floor circle to glide to <strong className="text-white">{hoveredWaypointLabel}</strong> (1.65m Eye Level)
        </div>
      )}

      {/* External GLB Loading / Status Indicator */}
      {loadingExternalGlb && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-[#0A0A0A]/70">
          <div className="px-5 py-3 rounded-xl bg-[#121212] border border-white/10 text-sm text-zinc-200">
            Streaming Draco-compressed .GLB geometry into WebGL showroom...
          </div>
        </div>
      )}

      {glbError && (
        <div className="pointer-events-none absolute top-20 right-6 z-20 px-3.5 py-2 rounded-lg bg-[#121212]/90 border border-[#F59E0B]/40 text-xs text-[#F59E0B]">
          {glbError}
        </div>
      )}
    </div>
  );
};

export default StreetViewViewer;
