import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

export interface SculpturePedestal {
  group: THREE.Group;
  holder: THREE.Group;
  cube: THREE.Group;
  dust: THREE.Points;
  update: (delta: number, elapsed: number) => void;
}

/**
 * Generates a 1024x1024 dark charcoal Nero Marquina marble texture
 * with smoky mineral clouds and delicate warm-gold/white hair veins.
 */
function createNeroMarquinaTexture(): THREE.CanvasTexture {
  if (typeof document === 'undefined') return new THREE.CanvasTexture({} as HTMLCanvasElement);
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    // 1. Dark charcoal obsidian base (#141210)
    ctx.fillStyle = '#141210';
    ctx.fillRect(0, 0, 1024, 1024);

    // 2. Subtle smoky mineral clouds
    for (let i = 0; i < 32; i++) {
      const cx = (Math.sin(i * 1.7) * 0.5 + 0.5) * 1024;
      const cy = (Math.cos(i * 2.3) * 0.5 + 0.5) * 1024;
      const r = 90 + ((i * 19) % 180);
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      grad.addColorStop(0, 'rgba(54, 49, 44, 0.35)');
      grad.addColorStop(0.5, 'rgba(32, 29, 26, 0.18)');
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // 3. Delicate white and champagne-gold mineral hair veins
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let v = 0; v < 18; v++) {
      ctx.beginPath();
      let vx = ((v * 67) % 1024);
      let vy = ((v * 131) % 1024);
      ctx.moveTo(vx, vy);
      const steps = 8 + (v % 5);
      for (let s = 0; s < steps; s++) {
        vx += Math.sin(v + s) * 110 + 20;
        vy += Math.cos(v * 2 + s) * 90 - 15;
        ctx.lineTo(vx, vy);
      }
      ctx.strokeStyle = v % 3 === 0 ? 'rgba(245, 205, 135, 0.45)' : 'rgba(255, 255, 255, 0.48)';
      ctx.lineWidth = 1.0 + ((v * 3) % 4) * 0.4;
      ctx.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Creates a soft blurred radial contact shadow for the top face of the pedestal.
 */
function createSoftPedestalContactShadow(): THREE.Mesh {
  if (typeof document === 'undefined') return new THREE.Mesh();
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(128, 128, 0, 128, 128, 124);
    grad.addColorStop(0.0, 'rgba(0, 0, 0, 0.88)');
    grad.addColorStop(0.35, 'rgba(0, 0, 0, 0.52)');
    grad.addColorStop(0.68, 'rgba(0, 0, 0, 0.18)');
    grad.addColorStop(0.92, 'rgba(0, 0, 0, 0.03)');
    grad.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);
  }
  const tex = new THREE.CanvasTexture(canvas);
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.95, 0.95),
    new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      depthWrite: false
    })
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(0, 0.58, 0); // Sits cleanly on the top surface of the pedestal
  return mesh;
}

/**
 * Generates a subtle, soft micro-mote particle texture.
 */
function createDustParticleTexture(): THREE.CanvasTexture {
  if (typeof document === 'undefined') return new THREE.CanvasTexture({} as HTMLCanvasElement);
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0.0, 'rgba(255, 240, 200, 0.95)');
    grad.addColorStop(0.35, 'rgba(245, 185, 80, 0.5)');
    grad.addColorStop(1.0, 'rgba(215, 140, 30, 0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 32, 32);
  }
  return new THREE.CanvasTexture(canvas);
}

/**
 * Builds the 6x6x6 3D architectural blueprint wireframe lattice grid.
 */
function createArchitecturalBlueprintGrid(): THREE.LineSegments {
  const size = 0.38;
  const divisions = 5;
  const step = size / divisions;
  const half = size / 2;

  const points: number[] = [];

  for (let iy = 0; iy <= divisions; iy++) {
    const y = -half + iy * step;
    for (let iz = 0; iz <= divisions; iz++) {
      const z = -half + iz * step;
      points.push(-half, y, z, half, y, z);
    }
  }

  for (let ix = 0; ix <= divisions; ix++) {
    const x = -half + ix * step;
    for (let iz = 0; iz <= divisions; iz++) {
      const z = -half + iz * step;
      points.push(x, -half, z, x, half, z);
    }
  }

  for (let ix = 0; ix <= divisions; ix++) {
    const x = -half + ix * step;
    for (let iy = 0; iy <= divisions; iy++) {
      const y = -half + iy * step;
      points.push(x, y, -half, x, y, half);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  const mat = new THREE.LineBasicMaterial({
    color: 0xFFE4A0,
    transparent: true,
    opacity: 0.65
  });
  const grid = new THREE.LineSegments(geo, mat);
  grid.position.set(0.12, -0.04, 0.12);
  return grid;
}

/**
 * Builds the clean 3D Sculpture Pedestal museum exhibition scene:
 * 1. Pitch-black #0A0A0A obsidian environment with subtle overhead theatrical spotlight
 * 2. Solid, grounded dark veined Nero Marquina marble pedestal clearly framed in the lower third
 * 3. Solid, gleaming warm-gold inner cube inside clean translucent glass & golden wireframe outer cube
 * 4. Only subtle, tiny dust specks drifting closely around the cube (zero giant yellow blobs!)
 */
export function buildSculpturePedestalScene(): SculpturePedestal {
  const group = new THREE.Group();

  // 1. Ambient & Theatrical Spotlighting
  const ambient = new THREE.AmbientLight(0xfff5e6, 1.4);
  group.add(ambient);

  const overheadSpot = new THREE.SpotLight(0xfff4d6, 35, 12, Math.PI / 4, 0.8, 1.2);
  overheadSpot.position.set(0.2, 4.5, 1.2);
  overheadSpot.target.position.set(0, 0.35, 0);
  overheadSpot.castShadow = true;
  group.add(overheadSpot, overheadSpot.target);

  const keyLight = new THREE.DirectionalLight(0xffecd0, 2.2);
  keyLight.position.set(1.5, 3.0, 2.5);
  group.add(keyLight);

  const rimLight = new THREE.DirectionalLight(0xd4af37, 1.4);
  rimLight.position.set(-2.5, 2.0, -1.8);
  group.add(rimLight);

  // Soft Radial Floor Pool beneath Pedestal
  const floorCanvas = document.createElement('canvas');
  floorCanvas.width = 128;
  floorCanvas.height = 128;
  const fctx = floorCanvas.getContext('2d');
  if (fctx) {
    const fgrad = fctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    fgrad.addColorStop(0, 'rgba(255, 205, 125, 0.15)');
    fgrad.addColorStop(0.5, 'rgba(215, 155, 65, 0.05)');
    fgrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    fctx.fillStyle = fgrad;
    fctx.fillRect(0, 0, 128, 128);
  }
  const floorPool = new THREE.Mesh(
    new THREE.PlaneGeometry(4.8, 4.8),
    new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(floorCanvas),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })
  );
  floorPool.rotation.x = -Math.PI / 2;
  floorPool.position.set(0, -0.76, 0);
  group.add(floorPool);

  // 2. Nero Marquina Charcoal Marble Pedestal (Positioned in Lower Third of Viewport)
  const pedestalGroup = new THREE.Group();
  pedestalGroup.position.set(0, -0.18, 0);
  pedestalGroup.rotation.y = Math.PI / 4; // 45° corner-forward viewing angle

  const marbleMat = new THREE.MeshStandardMaterial({
    map: createNeroMarquinaTexture(),
    roughness: 0.30,
    metalness: 0.08
  });
  const pedestalMesh = new THREE.Mesh(
    new RoundedBoxGeometry(1.35, 1.15, 1.35, 4, 0.02),
    marbleMat
  );
  pedestalGroup.add(pedestalMesh);

  // Soft blurred radial contact shadow on top face of pedestal
  const contactShadow = createSoftPedestalContactShadow();
  pedestalGroup.add(contactShadow);
  group.add(pedestalGroup);

  // 3. Isometric Architectural Cube Assembly hovering above the pedestal at [0, 0.88, 0]
  const holder = new THREE.Group();
  holder.position.set(0, 0.88, 0);

  const cubeGroup = new THREE.Group();
  cubeGroup.rotation.x = 0.615;
  cubeGroup.rotation.z = Math.PI / 4;
  holder.add(cubeGroup);

  // A. Solid, Gleaming Warm 24K Gold Inner Cube (0.48m)
  const goldMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#FFD97D'),
    emissive: new THREE.Color('#D97706'),
    emissiveIntensity: 0.65,
    metalness: 0.65,
    roughness: 0.16
  });
  const innerGoldCube = new THREE.Mesh(
    new RoundedBoxGeometry(0.48, 0.48, 0.48, 4, 0.015),
    goldMat
  );
  const coreLight = new THREE.PointLight(0xffbe55, 3.0, 3.5);
  cubeGroup.add(innerGoldCube, coreLight);

  // B. Fine Architectural Blueprint Grid inside the right quadrant
  const blueprintGrid = createArchitecturalBlueprintGrid();
  cubeGroup.add(blueprintGrid);

  // C. Clear Specular Glass Faces (0.80m)
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0xfff0c4,
    transparent: true,
    opacity: 0.14,
    roughness: 0.05,
    metalness: 0.1,
    clearcoat: 1.0,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const glassMesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.80, 0.80, 0.80),
    glassMat
  );
  cubeGroup.add(glassMesh);

  // D. Razor-Sharp Glowing Champagne-Gold Double Wireframe Lines
  const outerEdgeMat = new THREE.LineBasicMaterial({ color: 0xfff3c4, transparent: true, opacity: 0.95 });
  const outerEdges = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(0.80, 0.80, 0.80)),
    outerEdgeMat
  );
  cubeGroup.add(outerEdges);

  const innerEdgeMat = new THREE.LineBasicMaterial({ color: 0xf5b041, transparent: true, opacity: 0.55 });
  const innerEdges = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(0.77, 0.77, 0.77)),
    innerEdgeMat
  );
  cubeGroup.add(innerEdges);

  group.add(holder);

  // 4. Subtle, Tiny Golden Dust Specks (only 36 motes closely orbiting within 0.35m - 0.95m)
  const particleCount = 36;
  const particlePositions = new Float32Array(particleCount * 3);
  const particleInitCoords: Array<{ radius: number; phi: number; theta: number; speed: number; yOffset: number }> = [];

  for (let i = 0; i < particleCount; i++) {
    const radius = 0.35 + Math.random() * 0.60;
    const phi = Math.acos(2 * Math.random() - 1);
    const theta = Math.random() * Math.PI * 2;
    const speed = 0.20 + Math.random() * 0.30;
    const yOffset = (Math.random() - 0.5) * 0.18;

    particleInitCoords.push({ radius, phi, theta, speed, yOffset });

    const x = radius * Math.sin(phi) * Math.cos(theta);
    const y = 0.88 + radius * Math.cos(phi) + yOffset;
    const z = radius * Math.sin(phi) * Math.sin(theta);

    particlePositions[i * 3] = x;
    particlePositions[i * 3 + 1] = y;
    particlePositions[i * 3 + 2] = z;
  }

  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
  const dustTex = createDustParticleTexture();
  const dust = new THREE.Points(
    dustGeo,
    new THREE.PointsMaterial({
      map: dustTex,
      color: 0xffdf80,
      size: 0.024,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true
    })
  );
  group.add(dust);

  // 5. Dynamic Update Function
  const update = (delta: number, elapsed: number) => {
    // Gentle rotation and subtle vertical breathing float
    holder.rotation.y += delta * 0.24;
    holder.position.y = 0.88 + Math.sin(elapsed * 1.6) * 0.025;

    // Swirl subtle dust particles
    const posAttr = dustGeo.getAttribute('position') as THREE.BufferAttribute;
    if (posAttr) {
      const arr = posAttr.array as Float32Array;
      for (let i = 0; i < particleCount; i++) {
        const c = particleInitCoords[i];
        const curTheta = c.theta + elapsed * c.speed * 0.35;
        const curPhi = c.phi + Math.sin(elapsed * 0.6 + i) * 0.04;
        arr[i * 3] = c.radius * Math.sin(curPhi) * Math.cos(curTheta);
        arr[i * 3 + 1] = 0.88 + c.radius * Math.cos(curPhi) + c.yOffset + Math.sin(elapsed * 1.2 + i) * 0.025;
        arr[i * 3 + 2] = c.radius * Math.sin(curPhi) * Math.sin(curTheta);
      }
      posAttr.needsUpdate = true;
    }
  };

  return { group, holder, cube: holder, dust, update };
}
