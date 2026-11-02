import * as THREE from 'three';

export interface SculpturePedestal {
  group: THREE.Group;
  cube: THREE.Group;
  dust: THREE.Points;
}

/**
 * Creates a procedural high-contrast Nero Marquina marble texture with sharp branching veins.
 */
function createNeroMarquinaTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.CanvasTexture(canvas);

  // Deep obsidian charcoal base
  ctx.fillStyle = '#11100F';
  ctx.fillRect(0, 0, 1024, 1024);

  // Subtle natural stone clouding
  for (let i = 0; i < 60; i++) {
    const x = Math.random() * 1024;
    const y = Math.random() * 1024;
    const r = 80 + Math.random() * 160;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, 'rgba(28, 26, 24, 0.45)');
    grad.addColorStop(1, 'rgba(17, 16, 15, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Sharp organic branching white and warm-gold veins
  const drawVein = (startX: number, startY: number, color: string, width: number, branches: number) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    let curX = startX;
    let curY = startY;
    ctx.beginPath();
    ctx.moveTo(curX, curY);

    for (let step = 0; step < 28; step++) {
      curX += (Math.random() - 0.42) * 55;
      curY += (Math.random() * 45) + 10;
      ctx.lineTo(curX, curY);

      if (branches > 0 && Math.random() < 0.28) {
        ctx.stroke();
        drawVein(curX, curY, color, Math.max(0.6, width * 0.55), branches - 1);
        ctx.beginPath();
        ctx.moveTo(curX, curY);
      }
    }
    ctx.stroke();
  };

  // Primary white calcite veins
  for (let v = 0; v < 7; v++) {
    drawVein(Math.random() * 1024, (Math.random() - 0.2) * 400, 'rgba(242, 240, 235, 0.78)', 2.2, 2);
  }
  // Warm champagne-gold micro-veins
  for (let g = 0; g < 6; g++) {
    drawVein(Math.random() * 1024, (Math.random() - 0.2) * 400, 'rgba(224, 185, 115, 0.65)', 1.4, 1);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/**
 * Creates the vertical alpha-fade texture for the theatrical volumetric light cone.
 */
function createVolumetricConeTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0.0, 'rgba(255, 198, 112, 0.16)');
    grad.addColorStop(0.35, 'rgba(240, 175, 88, 0.09)');
    grad.addColorStop(0.75, 'rgba(220, 145, 55, 0.03)');
    grad.addColorStop(1.0, 'rgba(217, 130, 43, 0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 256);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

/**
 * Creates a soft radial glow particle sprite.
 */
function createDustParticleTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255, 230, 160, 1.0)');
    grad.addColorStop(0.35, 'rgba(235, 185, 95, 0.55)');
    grad.addColorStop(0.8, 'rgba(215, 140, 45, 0.12)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
  }
  return new THREE.CanvasTexture(canvas);
}

/**
 * Builds the idle 3D Sculpture Pedestal museum exhibition scene.
 */
export function buildSculpturePedestalScene(): SculpturePedestal {
  const group = new THREE.Group();

  // 1. Theatrical Overhead Spotlight & Volumetric Light Beam Cone
  const spot = new THREE.SpotLight(0xffcf87, 38, 12, Math.PI / 5, 0.85, 1.5);
  spot.position.set(0, 4.8, 0.6);
  spot.target.position.set(0, 0.35, 0);
  group.add(spot, spot.target);

  const overheadBeam = new THREE.SpotLight(0xffe0a3, 24, 14, Math.PI / 6, 0.9);
  overheadBeam.position.set(0, 5.8, 0);
  overheadBeam.target.position.set(0, 0, 0);
  group.add(overheadBeam, overheadBeam.target);

  const coneGeo = new THREE.ConeGeometry(2.4, 6.2, 48, 1, true);
  const coneMat = new THREE.MeshBasicMaterial({
    map: createVolumetricConeTexture(),
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending
  });
  const cone = new THREE.Mesh(coneGeo, coneMat);
  cone.position.set(0, 2.6, 0);
  group.add(cone);

  // Soft Radial Floor Pool beneath Pedestal
  const floorCanvas = document.createElement('canvas');
  floorCanvas.width = 128;
  floorCanvas.height = 128;
  const fctx = floorCanvas.getContext('2d');
  if (fctx) {
    const fgrad = fctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    fgrad.addColorStop(0, 'rgba(255, 205, 125, 0.14)');
    fgrad.addColorStop(0.5, 'rgba(215, 155, 65, 0.05)');
    fgrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    fctx.fillStyle = fgrad;
    fctx.fillRect(0, 0, 128, 128);
  }
  const floorPool = new THREE.Mesh(
    new THREE.PlaneGeometry(5.2, 5.2),
    new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(floorCanvas),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })
  );
  floorPool.rotation.x = -Math.PI / 2;
  floorPool.position.set(0, -1.02, 0);
  group.add(floorPool);

  // 2. High-Detail Veined Nero Marquina Marble Pedestal (1.45m x 1.35m x 1.45m at [0, -0.35, 0])
  const marbleTex = createNeroMarquinaTexture();
  const ped = new THREE.Mesh(
    new THREE.BoxGeometry(1.45, 1.35, 1.45),
    new THREE.MeshStandardMaterial({
      map: marbleTex,
      roughness: 0.22,
      metalness: 0.12
    })
  );
  ped.position.set(0, -0.35, 0);

  // Grounding Contact Shadow Inlay on Pedestal Top
  const contactShadow = new THREE.Mesh(
    new THREE.PlaneGeometry(0.85, 0.85),
    new THREE.MeshBasicMaterial({ color: 0x050505, transparent: true, opacity: 0.85 })
  );
  contactShadow.rotation.x = -Math.PI / 2;
  contactShadow.position.set(0, 0.328, 0);
  group.add(ped, contactShadow);

  // 3. Intricate Multi-Layer Revolving Architectural Cube ([0, 0.92, 0])
  const cube = new THREE.Group();
  cube.position.set(0, 0.92, 0);
  cube.rotation.set(Math.PI / 4, 0, Math.PI / 4);

  // Inner Core: Radiant brushed 24k gold solid cube (0.44m)
  const innerCore = new THREE.Mesh(
    new THREE.BoxGeometry(0.44, 0.44, 0.44),
    new THREE.MeshStandardMaterial({
      color: 0xffe094,
      emissive: 0xd97706,
      emissiveIntensity: 0.85,
      roughness: 0.16,
      metalness: 0.95
    })
  );
  const coreLight = new THREE.PointLight(0xffbe55, 3.2, 3.8);
  cube.add(innerCore, coreLight);

  // Architectural Sub-Grid Lattice
  const gridCube = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, 0.6, 0.6),
    new THREE.MeshBasicMaterial({
      color: 0xfde68a,
      wireframe: true,
      transparent: true,
      opacity: 0.45
    })
  );
  cube.add(gridCube);

  // Outer Glass & Glowing Double-Layered Champagne Edge Cage (0.74m)
  const outerGeo = new THREE.BoxGeometry(0.74, 0.74, 0.74);
  const glassShell = new THREE.Mesh(
    outerGeo,
    new THREE.MeshPhysicalMaterial({
      color: 0x161616,
      roughness: 0.05,
      transmission: 0.88,
      ior: 1.45,
      transparent: true,
      opacity: 0.18,
      depthWrite: false
    })
  );
  const edgesPrimary = new THREE.LineSegments(
    new THREE.EdgesGeometry(outerGeo),
    new THREE.LineBasicMaterial({ color: 0xfff3c4, transparent: true, opacity: 0.9 })
  );
  const edgesGlow = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(0.748, 0.748, 0.748)),
    new THREE.LineBasicMaterial({ color: 0xffd580, transparent: true, opacity: 0.45 })
  );
  cube.add(glassShell, edgesPrimary, edgesGlow);
  group.add(cube);

  // 4. Drifting Golden Dust Particles (160 motes)
  const particleCount = 160;
  const pts = new Float32Array(particleCount * 3);
  for (let i = 0; i < particleCount; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 0.25 + Math.random() * 1.4;
    pts[i * 3] = Math.cos(a) * r;
    pts[i * 3 + 1] = 0.4 + Math.random() * 1.8;
    pts[i * 3 + 2] = Math.sin(a) * r;
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(pts, 3));
  const dust = new THREE.Points(
    dustGeo,
    new THREE.PointsMaterial({
      map: createDustParticleTexture(),
      size: 0.045,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })
  );
  group.add(dust);

  return { group, cube, dust };
}
