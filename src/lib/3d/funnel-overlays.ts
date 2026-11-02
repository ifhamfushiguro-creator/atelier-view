import * as THREE from 'three';
import type { FloorSlice, SpatialPinItem } from './simple-normalizer';

export interface LivingCityScene {
  group: THREE.Group;
  update: (delta: number, elapsed: number) => void;
}

/**
 * Builds the complete dusk/twilight living city environment for Exterior mode:
 * 1. Twilight sky dome & drifting 3D clouds
 * 2. Animated flock of flying birds
 * 3. 4-way city street grid with asphalt roads, sidewalks, streetlights & moving vehicles
 * 4. 32 detailed surrounding city buildings with illuminated window grids and aviation beacons
 */
export function buildLivingCityScene(): LivingCityScene {
  const group = new THREE.Group();
  group.name = '__living_city_context__';

  // 1. Twilight Sky Dome with smooth vertical dusk gradient
  const skyCanvas = document.createElement('canvas');
  skyCanvas.width = 128;
  skyCanvas.height = 256;
  const ctx = skyCanvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0.0, '#070E1E');  // Zenith night sky
    grad.addColorStop(0.35, '#0B1528'); // Deep twilight blue
    grad.addColorStop(0.68, '#26235C'); // Twilight indigo
    grad.addColorStop(0.84, '#B45309'); // Warm dusk horizon amber
    grad.addColorStop(0.94, '#78350F'); // Low horizon glow
    grad.addColorStop(1.0, '#080C14');  // Base dark fade
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 256);
  }
  const skyTex = new THREE.CanvasTexture(skyCanvas);
  skyTex.colorSpace = THREE.SRGBColorSpace;
  const skyGeo = new THREE.SphereGeometry(160, 32, 24);
  const skyMat = new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, depthWrite: false });
  const skyMesh = new THREE.Mesh(skyGeo, skyMat);
  group.add(skyMesh);

  // 2. 14 Drifting Volumetric Cloud Clusters
  const cloudGroup = new THREE.Group();
  const cloudMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    roughness: 0.92,
    metalness: 0.1,
    transparent: true,
    opacity: 0.82
  });
  const clouds: THREE.Group[] = [];

  for (let i = 0; i < 14; i++) {
    const cg = new THREE.Group();
    const sphereCount = 3 + Math.floor(Math.random() * 3);
    for (let s = 0; s < sphereCount; s++) {
      const r = 2.4 + Math.random() * 2.8;
      const sMesh = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), cloudMat);
      sMesh.position.set((s - 1.5) * 2.6, (Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 2.4);
      cg.add(sMesh);
    }
    const angle = (i / 14) * Math.PI * 2 + Math.random() * 0.4;
    const dist = 35 + Math.random() * 45;
    cg.position.set(Math.cos(angle) * dist, 36 + Math.random() * 18, Math.sin(angle) * dist);
    cloudGroup.add(cg);
    clouds.push(cg);
  }
  group.add(cloudGroup);

  // 3. 18 Animated Flying Birds
  const birdGroup = new THREE.Group();
  const birdMat = new THREE.MeshBasicMaterial({ color: 0xE2E8F0, side: THREE.DoubleSide });
  interface BirdData {
    mesh: THREE.Group;
    leftWing: THREE.Mesh;
    rightWing: THREE.Mesh;
    baseY: number;
    orbitRadius: number;
    angleOffset: number;
    speed: number;
  }
  const birdList: BirdData[] = [];

  for (let i = 0; i < 18; i++) {
    const bRoot = new THREE.Group();

    // Body
    const bodyMesh = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.32), birdMat);
    bRoot.add(bodyMesh);

    // Left & Right Wings (Triangles pivoting on outer edge)
    const wingGeo = new THREE.BufferGeometry();
    const leftVerts = new Float32Array([
      0, 0, 0,
      -0.45, 0, -0.15,
      0, 0, -0.28
    ]);
    wingGeo.setAttribute('position', new THREE.BufferAttribute(leftVerts, 3));
    const leftWing = new THREE.Mesh(wingGeo, birdMat);
    leftWing.position.set(-0.06, 0, 0.1);

    const rightWingGeo = new THREE.BufferGeometry();
    const rightVerts = new Float32Array([
      0, 0, 0,
      0.45, 0, -0.15,
      0, 0, -0.28
    ]);
    rightWingGeo.setAttribute('position', new THREE.BufferAttribute(rightVerts, 3));
    const rightWing = new THREE.Mesh(rightWingGeo, birdMat);
    rightWing.position.set(0.06, 0, 0.1);

    bRoot.add(leftWing, rightWing);

    const orbitRadius = 26 + (i % 6) * 3.5;
    const baseY = 20 + (i % 5) * 1.8;
    const angleOffset = (i / 18) * Math.PI * 2;
    const speed = 0.22 + (i % 3) * 0.04;

    birdList.push({ mesh: bRoot, leftWing, rightWing, baseY, orbitRadius, angleOffset, speed });
    birdGroup.add(bRoot);
  }
  group.add(birdGroup);

  // 4. Central Landscaped Plaza (18m × 18m)
  const plazaGeo = new THREE.BoxGeometry(18, 0.12, 18);
  const plazaMat = new THREE.MeshStandardMaterial({ color: 0x1A202C, roughness: 0.8, metalness: 0.2 });
  const plazaMesh = new THREE.Mesh(plazaGeo, plazaMat);
  plazaMesh.position.y = -0.06;
  group.add(plazaMesh);

  // Grass / stone perimeter border
  const borderGeo = new THREE.BoxGeometry(18.8, 0.08, 18.8);
  const borderMat = new THREE.MeshStandardMaterial({ color: 0x14231E, roughness: 0.9 });
  const borderMesh = new THREE.Mesh(borderGeo, borderMat);
  borderMesh.position.y = -0.07;
  group.add(borderMesh);

  // 5. 4-Way City Street Grid & Sidewalks
  const roadMat = new THREE.MeshStandardMaterial({ color: 0x14171F, roughness: 0.85, metalness: 0.15 });
  const stripeMat = new THREE.MeshBasicMaterial({ color: 0xFBBF24 });
  const curbMat = new THREE.MeshStandardMaterial({ color: 0x2D3748, roughness: 0.7 });

  // North-South Avenues (x = -12 and x = +12)
  [-12, 12].forEach((xPos) => {
    const road = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 150), roadMat);
    road.rotation.x = -Math.PI / 2;
    road.position.set(xPos, -0.04, 0);
    group.add(road);

    // Centerline dashes
    const stripe = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 140), stripeMat);
    stripe.rotation.x = -Math.PI / 2;
    stripe.position.set(xPos, -0.038, 0);
    group.add(stripe);

    // Sidewalks
    [-3.6, 3.6].forEach((dx) => {
      const sw = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.14, 150), curbMat);
      sw.position.set(xPos + dx, 0.02, 0);
      group.add(sw);
    });
  });

  // East-West Boulevards (z = -12 and z = +12)
  [-12, 12].forEach((zPos) => {
    const road = new THREE.Mesh(new THREE.PlaneGeometry(150, 5.6), roadMat);
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, -0.04, zPos);
    group.add(road);

    const stripe = new THREE.Mesh(new THREE.PlaneGeometry(140, 0.14), stripeMat);
    stripe.rotation.x = -Math.PI / 2;
    stripe.position.set(0, -0.038, zPos);
    group.add(stripe);

    [-3.6, 3.6].forEach((dz) => {
      const sw = new THREE.Mesh(new THREE.BoxGeometry(150, 0.14, 1.6), curbMat);
      sw.position.set(0, 0.02, zPos + dz);
      group.add(sw);
    });
  });

  // Warm Glowing Streetlights along sidewalks
  const lampPoleGeo = new THREE.CylinderGeometry(0.04, 0.05, 3.2, 8);
  const lampPoleMat = new THREE.MeshStandardMaterial({ color: 0x1F2937, metalness: 0.8 });
  const bulbGeo = new THREE.SphereGeometry(0.14, 12, 8);
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xFDE68A });

  const lampCoords = [
    [-15.2, -15.2], [-8.8, -15.2], [8.8, -15.2], [15.2, -15.2],
    [-15.2, 15.2], [-8.8, 15.2], [8.8, 15.2], [15.2, 15.2],
    [-15.2, -32], [15.2, -32], [-15.2, 32], [15.2, 32],
    [-32, -15.2], [-32, 15.2], [32, -15.2], [32, 15.2]
  ];

  lampCoords.forEach(([lx, lz]) => {
    const pole = new THREE.Mesh(lampPoleGeo, lampPoleMat);
    pole.position.set(lx, 1.6, lz);
    const bulb = new THREE.Mesh(bulbGeo, bulbMat);
    bulb.position.set(lx, 3.2, lz);
    group.add(pole, bulb);
  });

  // 6. 16 Moving Stylized 3D Vehicles
  interface CarData {
    mesh: THREE.Group;
    dir: 'NS' | 'EW';
    lane: number;
    speed: number;
    forward: boolean;
  }
  const carList: CarData[] = [];
  const carColors = [0x1E293B, 0x475569, 0xF8FAFC, 0x0F172A, 0x334155, 0x1E3A8A];

  for (let i = 0; i < 16; i++) {
    const isNS = i < 8;
    const cRoot = new THREE.Group();
    const col = carColors[i % carColors.length];
    const carMat = new THREE.MeshStandardMaterial({ color: col, metalness: 0.6, roughness: 0.3 });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x0A0A0A, roughness: 0.1 });
    const headMat = new THREE.MeshBasicMaterial({ color: 0xFFFFFF });
    const tailMat = new THREE.MeshBasicMaterial({ color: 0xEF4444 });

    const w = isNS ? 1.5 : 3.0, l = isNS ? 3.0 : 1.5;
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, 0.6, l), carMat);
    body.position.y = 0.35;
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(w * 0.85, 0.45, l * 0.55), glassMat);
    cabin.position.y = 0.8;
    cRoot.add(body, cabin);

    // Headlights and Taillights
    if (isNS) {
      const hl1 = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.12, 0.05), headMat);
      hl1.position.set(-0.5, 0.35, -1.52);
      const hl2 = hl1.clone();
      hl2.position.x = 0.5;
      const tl1 = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.12, 0.05), tailMat);
      tl1.position.set(-0.5, 0.35, 1.52);
      const tl2 = tl1.clone();
      tl2.position.x = 0.5;
      cRoot.add(hl1, hl2, tl1, tl2);
    } else {
      const hl1 = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 0.25), headMat);
      hl1.position.set(-1.52, 0.35, -0.5);
      const hl2 = hl1.clone();
      hl2.position.z = 0.5;
      const tl1 = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 0.25), tailMat);
      tl1.position.set(1.52, 0.35, -0.5);
      const tl2 = tl1.clone();
      tl2.position.z = 0.5;
      cRoot.add(hl1, hl2, tl1, tl2);
    }

    const forward = i % 2 === 0;
    const laneX = isNS ? (forward ? 10.8 : -10.8) : 0;
    const laneZ = !isNS ? (forward ? 10.8 : -10.8) : 0;
    const speed = 7.0 + (i % 4) * 2.2;
    const startCoord = -60 + i * 16;

    if (isNS) {
      cRoot.position.set(laneX, 0, startCoord);
      if (!forward) cRoot.rotation.y = Math.PI;
    } else {
      cRoot.position.set(startCoord, 0, laneZ);
      if (forward) cRoot.rotation.y = Math.PI;
    }

    carList.push({ mesh: cRoot, dir: isNS ? 'NS' : 'EW', lane: isNS ? laneX : laneZ, speed, forward });
    group.add(cRoot);
  }

  // 7. 32 Detailed Surrounding City Buildings
  const bldgMat = new THREE.MeshStandardMaterial({ color: 0x131E32, roughness: 0.75, metalness: 0.25 });
  const bldgEdgeMat = new THREE.LineBasicMaterial({ color: 0x243550, transparent: true, opacity: 0.6 });
  const winMat = new THREE.MeshBasicMaterial({ color: 0xFFD27D, transparent: true, opacity: 0.28 });
  const beaconMat = new THREE.MeshBasicMaterial({ color: 0xEF4444 });

  const bldgSpecs = [
    // Inner perimeter ring (radius 22m - 30m)
    [15, 23, 7, 7, 24], [45, 26, 8, 8, 30], [75, 24, 7, 6, 20], [105, 27, 8, 7, 34],
    [135, 25, 7, 8, 22], [165, 28, 9, 8, 32], [195, 24, 8, 7, 18], [225, 27, 8, 8, 36],
    [255, 25, 7, 7, 26], [285, 29, 9, 8, 38], [315, 24, 8, 7, 21], [345, 27, 7, 8, 28],
    // Mid layer (radius 32m - 42m)
    [30, 36, 10, 10, 44], [60, 38, 9, 11, 48], [90, 35, 11, 10, 40], [120, 39, 12, 11, 52],
    [150, 37, 10, 10, 42], [180, 41, 11, 9, 46], [210, 36, 9, 12, 38], [240, 42, 12, 10, 54],
    [270, 38, 10, 11, 45], [300, 43, 11, 10, 50], [330, 37, 12, 9, 41], [360, 40, 10, 12, 49],
    // Outer skyline towers (radius 44m - 54m)
    [20, 48, 12, 12, 56], [65, 52, 11, 13, 62], [110, 49, 13, 12, 58], [155, 53, 12, 11, 64],
    [200, 47, 14, 12, 54], [245, 51, 12, 13, 66], [290, 48, 13, 12, 59], [335, 52, 11, 11, 63]
  ];

  bldgSpecs.forEach(([deg, dist, bw, bd, bh]) => {
    const rad = (deg * Math.PI) / 180;
    const bx = Math.cos(rad) * dist, bz = Math.sin(rad) * dist;
    const bGeo = new THREE.BoxGeometry(bw, bh, bd);
    const bMesh = new THREE.Mesh(bGeo, bldgMat);
    bMesh.position.set(bx, bh / 2 - 0.05, bz);
    bMesh.rotation.y = -rad + Math.PI / 4;

    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(bGeo), bldgEdgeMat);
    bMesh.add(edges);

    // Warm illuminated window grid plane on exterior facade
    const winGeo = new THREE.PlaneGeometry(bw * 0.74, bh * 0.7);
    const winMesh = new THREE.Mesh(winGeo, winMat);
    winMesh.position.set(0, 0, bd / 2 + 0.03);
    bMesh.add(winMesh);

    // Rooftop Mechanical Penthouse & Aviation Beacon on Tall Towers
    if (bh > 40) {
      const pent = new THREE.Mesh(new THREE.BoxGeometry(bw * 0.45, 3.2, bd * 0.45), bldgMat);
      pent.position.set(0, bh / 2 + 1.6, 0);
      const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.24, 8, 8), beaconMat);
      beacon.position.set(0, bh / 2 + 3.8, 0);
      bMesh.add(pent, beacon);
    }

    group.add(bMesh);
  });

  return {
    group,
    update: (delta: number, elapsed: number) => {
      // 1. Drift clouds smoothly
      clouds.forEach((cg) => {
        cg.position.x += delta * 0.6;
        if (cg.position.x > 80) cg.position.x = -80;
      });

      // 2. Animate flying flock of birds
      birdList.forEach((b, idx) => {
        const rad = b.angleOffset + elapsed * b.speed;
        b.mesh.position.set(
          Math.cos(rad) * b.orbitRadius,
          b.baseY + Math.sin(elapsed * 2.2 + idx) * 0.35,
          Math.sin(rad) * b.orbitRadius
        );
        b.mesh.rotation.y = -rad + Math.PI / 2;
        const flap = Math.sin(elapsed * 9.0 + idx) * 0.45;
        b.leftWing.rotation.z = flap;
        b.rightWing.rotation.z = -flap;
      });

      // 3. Move vehicles along city street avenues
      carList.forEach((car) => {
        const dist = car.speed * delta;
        if (car.dir === 'NS') {
          if (car.forward) {
            car.mesh.position.z += dist;
            if (car.mesh.position.z > 75) car.mesh.position.z = -75;
          } else {
            car.mesh.position.z -= dist;
            if (car.mesh.position.z < -75) car.mesh.position.z = 75;
          }
        } else {
          if (car.forward) {
            car.mesh.position.x += dist;
            if (car.mesh.position.x > 75) car.mesh.position.x = -75;
          } else {
            car.mesh.position.x -= dist;
            if (car.mesh.position.x < -75) car.mesh.position.x = 75;
          }
        }
      });
    }
  };
}

/**
 * Builds the full vertical floor story highlight volume wrapping slab to ceiling.
 */
export function buildFloorStoryHighlight(size: THREE.Vector3, center: THREE.Vector3): THREE.Group {
  const group = new THREE.Group();
  group.name = '__floor_story_highlight__';

  const boxGeo = new THREE.BoxGeometry(size.x + 0.16, 1.0, size.z + 0.16);
  const boxMat = new THREE.MeshBasicMaterial({
    color: 0xF5D076,
    transparent: true,
    opacity: 0.18,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const volMesh = new THREE.Mesh(boxGeo, boxMat);
  volMesh.name = 'highlight_volume';
  group.add(volMesh);

  // Top and bottom perimeter golden hairline borders
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(boxGeo),
    new THREE.LineBasicMaterial({ color: 0xFFE082, transparent: true, opacity: 0.95 })
  );
  edges.name = 'highlight_edges';
  group.add(edges);

  group.position.set(center.x, 0, center.z);
  group.visible = false;
  return group;
}

/**
 * Updates the floor story highlight volume to hug the active floor slab-to-ceiling.
 */
export function updateFloorStoryHighlight(
  highlightGroup: THREE.Group | null,
  floor: FloorSlice | null,
  size: THREE.Vector3,
  center: THREE.Vector3
): void {
  if (!highlightGroup) return;
  if (!floor) {
    highlightGroup.visible = false;
    return;
  }
  const storyHeight = Math.max(0.6, floor.maxY - floor.floorY);
  const centerY = floor.floorY + storyHeight / 2;

  highlightGroup.scale.set(1, storyHeight, 1);
  highlightGroup.position.set(center.x, centerY, center.z);
  highlightGroup.visible = true;
}

/**
 * Backward compatibility facade highlight band.
 */
export function buildFacadeHighlightBand(size: THREE.Vector3, center: THREE.Vector3): THREE.Mesh {
  const bandGeo = new THREE.BoxGeometry(size.x + 0.16, 0.18, size.z + 0.16);
  const bandMat = new THREE.MeshBasicMaterial({
    color: 0xF5D076,
    transparent: true,
    opacity: 0.45,
    side: THREE.DoubleSide
  });
  const mesh = new THREE.Mesh(bandGeo, bandMat);
  mesh.position.set(center.x, 0, center.z);
  mesh.visible = false;
  return mesh;
}

/**
 * Backward compatibility city diorama context.
 */
export function buildCityDioramaContext(): THREE.Group {
  return buildLivingCityScene().group;
}

/**
 * Builds interactive 3D specification pin marker.
 */
export function buildPinMeshGroup(pin: SpatialPinItem, isSelected: boolean): THREE.Group {
  const isApp = pin.status === 'approved', g = new THREE.Group();
  g.position.set(pin.position[0], pin.position[1], pin.position[2]);
  g.userData.pinId = pin.id;

  const stemGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.4, 8);
  stemGeo.translate(0, 0.2, 0);
  const headMesh = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.12, 0),
    new THREE.MeshStandardMaterial({
      color: isApp ? '#10B981' : '#F59E0B',
      emissive: isApp ? '#065F46' : '#78350F',
      roughness: 0.2,
      metalness: 0.8
    })
  );
  headMesh.name = 'pin_head';
  headMesh.position.y = 0.42;

  g.add(
    new THREE.Mesh(stemGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 })),
    headMesh
  );

  if (isSelected) {
    const ringGeo = new THREE.RingGeometry(0.18, 0.22, 24);
    ringGeo.rotateX(-Math.PI / 2);
    const selMesh = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }));
    selMesh.position.y = 0.42;
    g.add(selMesh);
  }
  return g;
}
