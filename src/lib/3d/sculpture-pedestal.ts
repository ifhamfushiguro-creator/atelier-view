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
    // 1. Dark charcoal base (#0E0D0C)
    ctx.fillStyle = '#0E0D0C';
    ctx.fillRect(0, 0, 1024, 1024);

    // 2. Subtle smoky mineral clouds
    for (let i = 0; i < 28; i++) {
      const cx = (Math.sin(i * 1.7) * 0.5 + 0.5) * 1024;
      const cy = (Math.cos(i * 2.3) * 0.5 + 0.5) * 1024;
      const r = 90 + ((i * 19) % 180);
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      grad.addColorStop(0, 'rgba(42, 39, 36, 0.24)');
      grad.addColorStop(0.5, 'rgba(26, 24, 22, 0.12)');
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // 3. Delicate white and champagne-gold mineral hair veins
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let v = 0; v < 16; v++) {
      ctx.beginPath();
      let vx = ((v * 67) % 1024);
      let vy = ((v * 131) % 1024);
      ctx.moveTo(vx, vy);
      const steps = 7 + (v % 5);
      for (let s = 0; s < steps; s++) {
        vx += Math.sin(v + s) * 110 + 20;
        vy += Math.cos(v * 2 + s) * 90 - 15;
        ctx.lineTo(vx, vy);
      }
      ctx.strokeStyle = v % 3 === 0 ? 'rgba(235, 195, 125, 0.28)' : 'rgba(245, 245, 248, 0.32)';
      ctx.lineWidth = 0.8 + ((v * 3) % 4) * 0.35;
      ctx.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Creates a soft blurred radial contact shadow for the top face of the pedestal.
 * Smoothly feathers to zero opacity so there are NEVER any hard square edges.
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
  mesh.position.set(0, 0.676, 0); // Sits cleanly on the top surface of the pedestal
  return mesh;
}

/**
 * Generates a 64x64 radial glow firefly particle sprite
 * (bright #FFFDF5 core, warm #F59E0B halo fading to 0).
 */
function createGlowFireflyTexture(): THREE.CanvasTexture {
  if (typeof document === 'undefined') return new THREE.CanvasTexture({} as HTMLCanvasElement);
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0.0, '#FFFDF5');
    grad.addColorStop(0.18, 'rgba(255, 238, 185, 0.95)');
    grad.addColorStop(0.48, 'rgba(245, 158, 11, 0.48)');
    grad.addColorStop(0.78, 'rgba(215, 110, 15, 0.12)');
    grad.addColorStop(1.0, 'rgba(245, 158, 11, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
  }
  return new THREE.CanvasTexture(canvas);
}

/**
 * Builds the 6x6x6 3D architectural blueprint wireframe lattice grid (#FFE4A0)
 * offset to [0.14, -0.06, 0.14] inside the right quadrant of the cube.
 */
function createArchitecturalBlueprintGrid(): THREE.LineSegments {
  const size = 0.36;
  const divisions = 5; // 6 lines per axis
  const step = size / divisions;
  const half = size / 2;

  const points: number[] = [];

  // Lines parallel to X
  for (let iy = 0; iy <= divisions; iy++) {
    const y = -half + iy * step;
    for (let iz = 0; iz <= divisions; iz++) {
      const z = -half + iz * step;
      points.push(-half, y, z, half, y, z);
    }
  }

  // Lines parallel to Y
  for (let ix = 0; ix <= divisions; ix++) {
    const x = -half + ix * step;
    for (let iz = 0; iz <= divisions; iz++) {
      const z = -half + iz * step;
      points.push(x, -half, z, x, half, z);
    }
  }

  // Lines parallel to Z
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
    opacity: 0.55
  });
  const grid = new THREE.LineSegments(geo, mat);
  grid.position.set(0.14, -0.06, 0.14);
  return grid;
}

/**
 * Builds the Option 3: 3D Sculpture Pedestal museum exhibition scene:
 * 1. 45°-Angled Nero Marquina Charcoal Marble Pedestal with soft radial contact shadow
 * 2. Floating Isometric 24K Gold Cube with architectural blueprint grid & razor-sharp gold wireframe
 * 3. 220 glowing golden firefly particles swirling in a spherical cloud around the cube
 * 4. Theatrical warm spotlighting matching the reference photo
 */
export function buildSculpturePedestalScene(): SculpturePedestal {
  const group = new THREE.Group();

  // 1. Warm Theatrical Spotlights & Specular Lights
  const overheadSpot = new THREE.SpotLight(0xfff4d6, 90, 12, Math.PI / 4, 0.9, 1.2);
  overheadSpot.position.set(0.2, 4.2, 1.2);
  overheadSpot.target.position.set(0, 0.72, 0);
  overheadSpot.castShadow = true;
  group.add(overheadSpot, overheadSpot.target);

  const warmKeyLight = new THREE.PointLight(0xffdf8e, 12, 5);
  warmKeyLight.position.set(0.35, 1.45, 0.65);
  group.add(warmKeyLight);

  const rimLight = new THREE.DirectionalLight(0xd4af37, 1.8);
  rimLight.position.set(-3.0, 2.5, -2.0);
  group.add(rimLight);

  // 2. Nero Marquina Charcoal Marble Pedestal (Rotated 45° Corner-Forward)
  const pedestalGroup = new THREE.Group();
  pedestalGroup.position.set(0, -0.62, 0);
  pedestalGroup.rotation.y = Math.PI / 4; // 45° corner-forward viewing angle

  const marbleMat = new THREE.MeshStandardMaterial({
    map: createNeroMarquinaTexture(),
    roughness: 0.24,
    metalness: 0.1
  });
  const pedestalMesh = new THREE.Mesh(
    new RoundedBoxGeometry(1.38, 1.35, 1.38, 4, 0.02),
    marbleMat
  );
  pedestalGroup.add(pedestalMesh);

  // Soft blurred radial contact shadow on top face of pedestal (NEVER a hard black square!)
  const contactShadow = createSoftPedestalContactShadow();
  pedestalGroup.add(contactShadow);
  group.add(pedestalGroup);

  // 3. Option 3: Isometric Architectural Cube Assembly at [0, 0.72, 0]
  const holder = new THREE.Group();
  holder.position.set(0, 0.72, 0);

  const cubeGroup = new THREE.Group();
  // Corner points down toward the pedestal
  cubeGroup.rotation.x = 0.615;
  cubeGroup.rotation.z = Math.PI / 4;
  holder.add(cubeGroup);

  // A. Inner Solid 24K Mirror-Gold Cube (0.48m)
  const goldMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#FFD97D'),
    emissive: new THREE.Color('#B86B11'),
    emissiveIntensity: 0.35,
    metalness: 0.92,
    roughness: 0.14
  });
  const innerGoldCube = new THREE.Mesh(
    new RoundedBoxGeometry(0.48, 0.48, 0.48, 4, 0.015),
    goldMat
  );
  cubeGroup.add(innerGoldCube);

  // B. Fine Architectural Blueprint Grid inside the right quadrant
  const blueprintGrid = createArchitecturalBlueprintGrid();
  cubeGroup.add(blueprintGrid);

  // C. Clear Specular Glass Faces (0.82m) — zero blurry transmission artifacts
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0xffecb3,
    transparent: true,
    opacity: 0.09,
    roughness: 0.05,
    metalness: 0.1,
    clearcoat: 1.0,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const glassMesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.82, 0.82, 0.82),
    glassMat
  );
  cubeGroup.add(glassMesh);

  // D. Razor-Sharp Glowing Champagne-Gold Double Wireframe Lines
  const outerEdgeMat = new THREE.LineBasicMaterial({ color: 0xfff3c4, transparent: true, opacity: 0.95 });
  const outerEdges = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(0.82, 0.82, 0.82)),
    outerEdgeMat
  );
  cubeGroup.add(outerEdges);

  const innerEdgeMat = new THREE.LineBasicMaterial({ color: 0xf5b041, transparent: true, opacity: 0.55 });
  const innerEdges = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(0.79, 0.79, 0.79)),
    innerEdgeMat
  );
  cubeGroup.add(innerEdges);

  group.add(holder);

  // 4. 220 Glowing Golden Firefly / Dust Particles Swirling Around Cube
  const particleCount = 220;
  const particlePositions = new Float32Array(particleCount * 3);
  const particleInitCoords: Array<{ radius: number; phi: number; theta: number; speed: number; yOffset: number }> = [];

  for (let i = 0; i < particleCount; i++) {
    const radius = 0.42 + Math.random() * 1.03; // 0.42m to 1.45m spherical cloud
    const phi = Math.acos(2 * Math.random() - 1);
    const theta = Math.random() * Math.PI * 2;
    const speed = 0.25 + Math.random() * 0.45;
    const yOffset = (Math.random() - 0.5) * 0.3;

    particleInitCoords.push({ radius, phi, theta, speed, yOffset });

    const x = radius * Math.sin(phi) * Math.cos(theta);
    const y = 0.72 + radius * Math.cos(phi) + yOffset;
    const z = radius * Math.sin(phi) * Math.sin(theta);

    particlePositions[i * 3] = x;
    particlePositions[i * 3 + 1] = y;
    particlePositions[i * 3 + 2] = z;
  }

  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
  const glowTex = createGlowFireflyTexture();
  const dust = new THREE.Points(
    dustGeo,
    new THREE.PointsMaterial({
      map: glowTex,
      color: 0xffd571,
      size: 0.085,
      transparent: true,
      opacity: 0.92,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true
    })
  );
  group.add(dust);

  // 5. Dynamic Update Function
  const update = (delta: number, elapsed: number) => {
    // Gentle rotation and vertical breathing float
    holder.rotation.y += delta * 0.28;
    holder.position.y = 0.72 + Math.sin(elapsed * 1.8) * 0.035;

    // Swirl firefly particles in warm orbits
    const posAttr = dustGeo.getAttribute('position') as THREE.BufferAttribute;
    if (posAttr) {
      const arr = posAttr.array as Float32Array;
      for (let i = 0; i < particleCount; i++) {
        const c = particleInitCoords[i];
        const curTheta = c.theta + elapsed * c.speed * 0.45;
        const curPhi = c.phi + Math.sin(elapsed * 0.8 + i) * 0.05;
        arr[i * 3] = c.radius * Math.sin(curPhi) * Math.cos(curTheta);
        arr[i * 3 + 1] = 0.72 + c.radius * Math.cos(curPhi) + c.yOffset + Math.sin(elapsed * 1.5 + i) * 0.04;
        arr[i * 3 + 2] = c.radius * Math.sin(curPhi) * Math.sin(curTheta);
      }
      posAttr.needsUpdate = true;
    }
  };

  return { group, holder, cube: holder, dust, update };
}
