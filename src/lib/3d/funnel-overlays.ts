import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { FloorSlice, SpatialPinItem } from './simple-normalizer';

export interface LivingCityScene {
  group: THREE.Group;
  sunLight: THREE.DirectionalLight;
  hemiLight: THREE.HemisphereLight;
  fillLight: THREE.DirectionalLight;
  update: (delta: number, elapsed: number) => void;
}

/**
 * Module-level texture cache for PBR procedural textures.
 * Prevents redundant canvas creation, duplicate GPU uploads, and VRAM thrashing.
 */
const textureCache = new Map<string, THREE.CanvasTexture>();

function getCachedTexture(key: string, factory: () => THREE.CanvasTexture): THREE.CanvasTexture {
  if (typeof document === 'undefined') return new THREE.CanvasTexture({} as HTMLCanvasElement);
  let tex = textureCache.get(key);
  if (!tex) {
    tex = factory();
    textureCache.set(key, tex);
  }
  return tex;
}

/**
 * Procedural Crisp Noon Architectural Sky Dome Texture.
 * Zenith: #38BDF8 -> Mid-sky: #93C5FD -> Horizon: #E0F2FE.
 */
function createNoonSkyTexture(): THREE.CanvasTexture {
  return getCachedTexture('noon_sky', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const grad = ctx.createLinearGradient(0, 0, 0, 512);
      grad.addColorStop(0.0, '#38BDF8'); // Bright azure zenith
      grad.addColorStop(0.5, '#60A5FA'); // Mid-sky blue
      grad.addColorStop(0.82, '#93C5FD'); // Light atmospheric layer
      grad.addColorStop(0.95, '#DBEAFE'); // Soft horizon wash
      grad.addColorStop(1.0, '#E0F2FE');  // Crisp hazy daylight horizon
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 512, 512);

      ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
      for (let i = 0; i < 10; i++) {
        const cx = (i * 97) % 512;
        const cy = 280 + ((i * 41) % 130);
        const rx = 110 + (i % 4) * 30;
        const ry = 8 + (i % 3) * 4;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0.05, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  });
}

/**
 * 2048x2048 Procedural Manicured Daylight Turf Texture (#2B5B2E / #38723B).
 * High-resolution multi-frequency turf with micro-blades, sunlight flecks, and anisotropy = 16.
 */
function createTurfTexture(): THREE.CanvasTexture {
  return getCachedTexture('turf_pbr', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 2048;
    canvas.height = 2048;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#2B5B2E';
      ctx.fillRect(0, 0, 2048, 2048);

      for (let i = 0; i < 6000; i++) {
        const x = (i * 353) % 2048;
        const y = (i * 479) % 2048;
        const r = 3 + (i % 5);
        ctx.fillStyle = (i % 3 === 0) ? '#38723B' : (i % 3 === 1) ? '#488F4C' : '#1E4422';
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = 'rgba(100, 190, 90, 0.12)';
      for (let i = 0; i < 800; i++) {
        const x = (i * 701) % 2048;
        const y = (i * 911) % 2048;
        ctx.fillRect(x, y, 14, 8);
      }
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(4, 4);
    tex.anisotropy = 16;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    return tex;
  });
}

/**
 * 2048x2048 Procedural Honed Warm-Stone Driveway / Patio Texture (#E5DFD7).
 * Ashlar stone slabs with recessed mortar joints and travertine mineral flecks.
 */
function createStonePatioTexture(): THREE.CanvasTexture {
  return getCachedTexture('stone_patio_pbr', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 2048;
    canvas.height = 2048;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#E5DFD7';
      ctx.fillRect(0, 0, 2048, 2048);

      ctx.strokeStyle = '#B3ACA1';
      ctx.lineWidth = 6;
      for (let y = 0; y <= 2048; y += 256) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(2048, y); ctx.stroke();
        const offset = (y / 256) % 2 === 0 ? 0 : 192;
        for (let x = offset; x <= 2048; x += 384) {
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 256); ctx.stroke();
        }
      }

      for (let i = 0; i < 4000; i++) {
        const x = (i * 521) % 2048;
        const y = (i * 617) % 2048;
        ctx.fillStyle = (i % 2 === 0) ? 'rgba(170, 160, 150, 0.18)' : 'rgba(255, 255, 255, 0.22)';
        ctx.fillRect(x, y, 6, 4);
      }
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(3, 3);
    tex.anisotropy = 16;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    return tex;
  });
}

/**
 * 2048x2048 Micro-Grain PBR Asphalt Aggregate Texture (#22262E).
 * Dark-slate asphalt with multi-frequency aggregate quartz flecks and tire wear lanes.
 */
function createPbrAsphaltTexture(): THREE.CanvasTexture {
  return getCachedTexture('asphalt_pbr', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 2048;
    canvas.height = 2048;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#22262E';
      ctx.fillRect(0, 0, 2048, 2048);

      for (let i = 0; i < 8000; i++) {
        const x = (i * 379) % 2048;
        const y = (i * 563) % 2048;
        ctx.fillStyle = (i % 4 === 0) ? '#373D49' : (i % 4 === 1) ? '#181A20' : (i % 4 === 2) ? '#2B303A' : '#454C5B';
        ctx.fillRect(x, y, 4, 4);
      }
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(12, 12);
    tex.anisotropy = 16;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    return tex;
  });
}

/**
 * 2048x2048 Honed Ashlar Concrete Sidewalk Texture (#D6D1C7).
 * Ashlar paving slabs with expansion joints and micro-grain broom finish.
 */
function createPbrSidewalkTexture(): THREE.CanvasTexture {
  return getCachedTexture('sidewalk_pbr', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 2048;
    canvas.height = 2048;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#D6D1C7';
      ctx.fillRect(0, 0, 2048, 2048);

      ctx.strokeStyle = '#A8A297';
      ctx.lineWidth = 8;
      for (let y = 0; y <= 2048; y += 512) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(2048, y); ctx.stroke();
      }
      for (let x = 0; x <= 2048; x += 512) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 2048); ctx.stroke();
      }

      for (let i = 0; i < 5000; i++) {
        const x = (i * 419) % 2048;
        const y = (i * 733) % 2048;
        ctx.fillStyle = (i % 2 === 0) ? 'rgba(140, 134, 125, 0.12)' : 'rgba(255, 255, 255, 0.18)';
        ctx.fillRect(x, y, 6, 6);
      }
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(6, 6);
    tex.anisotropy = 16;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    return tex;
  });
}

/**
 * 2048x2048 Procedural Daytime Architectural Building Facade Textures.
 * Features realistic stone panels, window mullions, and sky gradient reflections.
 */
function createFacadeTexture(type: 'cream' | 'concrete' | 'terracotta' | 'glass'): THREE.CanvasTexture {
  return getCachedTexture('facade_' + type, () => {
    const canvas = document.createElement('canvas');
    canvas.width = 2048;
    canvas.height = 2048;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new THREE.CanvasTexture(canvas);

  if (type === 'cream') {
    // Warm French travertine limestone (#EAE3D5)
    ctx.fillStyle = '#EAE3D5';
    ctx.fillRect(0, 0, 2048, 2048);

    // Fine ashlar panel joint lines
    ctx.strokeStyle = '#C8BEAF';
    ctx.lineWidth = 3;
    for (let y = 0; y <= 2048; y += 256) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(2048, y); ctx.stroke();
    }

    // Ground floor luxury boutique storefront
    ctx.fillStyle = '#24211E';
    ctx.fillRect(0, 1640, 2048, 408);
    const storefrontGrad = ctx.createLinearGradient(0, 1696, 0, 2000);
    storefrontGrad.addColorStop(0, '#1E3A5F');
    storefrontGrad.addColorStop(1, '#0F1D30');
    ctx.fillStyle = storefrontGrad;
    ctx.fillRect(96, 1696, 840, 304);
    ctx.fillRect(1112, 1696, 840, 304);

    // Window grid with bronze frames and realistic sky gradient reflection
    for (let row = 0; row < 5; row++) {
      const y = 120 + row * 288;
      for (let col = 0; col < 6; col++) {
        const x = 96 + col * 320;
        // Dark bronze frame
        ctx.fillStyle = '#2B2621';
        ctx.fillRect(x - 8, y - 8, 192, 208);
        // Deep sky reflection gradient
        const wGrad = ctx.createLinearGradient(x, y, x, y + 192);
        wGrad.addColorStop(0.0, '#3B6898');
        wGrad.addColorStop(0.4, '#1E3A5F');
        wGrad.addColorStop(1.0, '#0F1D30');
        ctx.fillStyle = wGrad;
        ctx.fillRect(x, y, 176, 192);
        // Interior blinds / soft warmth
        ctx.fillStyle = 'rgba(240, 220, 180, 0.14)';
        ctx.fillRect(x + 12, y + 12, 152, 40);
      }
    }
  } else if (type === 'concrete') {
    // Board-formed architectural concrete (#CBD5E1)
    ctx.fillStyle = '#CBD5E1';
    ctx.fillRect(0, 0, 2048, 2048);

    // Horizontal concrete board courses
    ctx.strokeStyle = '#94A3B8';
    ctx.lineWidth = 4;
    for (let y = 0; y <= 2048; y += 128) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(2048, y); ctx.stroke();
    }

    // Wide modernist window bays with charcoal frames
    for (let row = 0; row < 6; row++) {
      const y = 80 + row * 320;
      for (let col = 0; col < 4; col++) {
        const x = 80 + col * 488;
        ctx.fillStyle = '#1E293B';
        ctx.fillRect(x - 6, y - 6, 392, 192);
        const cGrad = ctx.createLinearGradient(x, y, x, y + 180);
        cGrad.addColorStop(0.0, '#2D5884');
        cGrad.addColorStop(0.6, '#1E3048');
        cGrad.addColorStop(1.0, '#0E1724');
        ctx.fillStyle = cGrad;
        ctx.fillRect(x, y, 380, 180);
      }
    }
  } else if (type === 'terracotta') {
    // Terracotta brick masonry (#8C3A27)
    ctx.fillStyle = '#8C3A27';
    ctx.fillRect(0, 0, 2048, 2048);

    // Stone horizontal cornices
    ctx.fillStyle = '#D6CEBE';
    ctx.fillRect(0, 640, 2048, 32);
    ctx.fillRect(0, 1280, 2048, 32);

    for (let row = 0; row < 5; row++) {
      const y = 100 + row * 368;
      for (let col = 0; col < 5; col++) {
        const x = 128 + col * 384;
        // Stone lintel & frame
        ctx.fillStyle = '#D6CEBE';
        ctx.fillRect(x - 12, y - 12, 200, 248);
        const tGrad = ctx.createLinearGradient(x, y, x, y + 224);
        tGrad.addColorStop(0.0, '#284C72');
        tGrad.addColorStop(0.5, '#172B44');
        tGrad.addColorStop(1.0, '#0C1624');
        ctx.fillStyle = tGrad;
        ctx.fillRect(x, y, 176, 224);
      }
    }
  } else {
    // Reflective glass curtain wall (#0F2035)
    const glassGrad = ctx.createLinearGradient(0, 0, 0, 2048);
    glassGrad.addColorStop(0.0, '#254E78');
    glassGrad.addColorStop(0.5, '#152C46');
    glassGrad.addColorStop(1.0, '#0A1726');
    ctx.fillStyle = glassGrad;
    ctx.fillRect(0, 0, 2048, 2048);

    // Slim structural silicone glazing mullions
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 4;
    for (let y = 0; y <= 2048; y += 192) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(2048, y); ctx.stroke();
    }
    for (let x = 0; x <= 2048; x += 192) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 2048); ctx.stroke();
    }
  }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 16;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    return tex;
  });
}

/**
 * 2048x2048 Matching Procedural Bump Map for Facade Materials.
 */
function createFacadeBumpMap(type: 'cream' | 'concrete' | 'terracotta' | 'glass'): THREE.CanvasTexture {
  return getCachedTexture('facade_bump_' + type, () => {
    const canvas = document.createElement('canvas');
    canvas.width = 2048;
    canvas.height = 2048;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new THREE.CanvasTexture(canvas);

  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, 2048, 2048);

  if (type === 'cream') {
    // Recessed joint lines (darker = lower)
    ctx.strokeStyle = '#303030';
    ctx.lineWidth = 4;
    for (let y = 0; y <= 2048; y += 256) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(2048, y); ctx.stroke();
    }
    // Raised window frames (lighter = raised) and recessed glass
    for (let row = 0; row < 5; row++) {
      const y = 120 + row * 288;
      for (let col = 0; col < 6; col++) {
        const x = 96 + col * 320;
        ctx.fillStyle = '#D0D0D0';
        ctx.fillRect(x - 8, y - 8, 192, 208);
        ctx.fillStyle = '#202020';
        ctx.fillRect(x, y, 176, 192);
      }
    }
  } else if (type === 'concrete') {
    ctx.strokeStyle = '#404040';
    ctx.lineWidth = 6;
    for (let y = 0; y <= 2048; y += 128) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(2048, y); ctx.stroke();
    }
    for (let row = 0; row < 6; row++) {
      const y = 80 + row * 320;
      for (let col = 0; col < 4; col++) {
        const x = 80 + col * 488;
        ctx.fillStyle = '#C0C0C0';
        ctx.fillRect(x - 6, y - 6, 392, 192);
        ctx.fillStyle = '#202020';
        ctx.fillRect(x, y, 380, 180);
      }
    }
  } else if (type === 'terracotta') {
    ctx.fillStyle = '#F0F0F0';
    ctx.fillRect(0, 640, 2048, 32);
    ctx.fillRect(0, 1280, 2048, 32);
    for (let row = 0; row < 5; row++) {
      const y = 100 + row * 368;
      for (let col = 0; col < 5; col++) {
        const x = 128 + col * 384;
        ctx.fillStyle = '#E0E0E0';
        ctx.fillRect(x - 12, y - 12, 200, 248);
        ctx.fillStyle = '#202020';
        ctx.fillRect(x, y, 176, 224);
      }
    }
  } else {
    ctx.strokeStyle = '#B0B0B0';
    ctx.lineWidth = 4;
    for (let y = 0; y <= 2048; y += 192) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(2048, y); ctx.stroke();
    }
    for (let x = 0; x <= 2048; x += 192) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 2048); ctx.stroke();
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 16;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
  });
}

/**
 * 1024x1024 Procedural Tree Bark Texture (#4A3525).
 */
function createBarkTexture(): THREE.CanvasTexture {
  return getCachedTexture('bark_pbr', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#4A3525';
      ctx.fillRect(0, 0, 1024, 1024);

      for (let i = 0; i < 2000; i++) {
        const x = (i * 127) % 1024;
        const y = (i * 389) % 1024;
        ctx.fillStyle = (i % 2 === 0) ? '#38271A' : '#5A4230';
        ctx.fillRect(x, y, 3, 28);
      }
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(2, 4);
    return tex;
  });
}

/**
 * 1024x1024 Procedural Botanical Foliage Canopy Texture.
 */
function createFoliageTexture(): THREE.CanvasTexture {
  return getCachedTexture('foliage_pbr', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#1E4D2B';
      ctx.fillRect(0, 0, 1024, 1024);

      for (let i = 0; i < 3500; i++) {
        const x = (i * 241) % 1024;
        const y = (i * 397) % 1024;
        const r = 4 + (i % 6);
        ctx.fillStyle = (i % 4 === 0) ? '#2D6A32' : (i % 4 === 1) ? '#3E8E41' : (i % 4 === 2) ? '#58B35C' : '#EAB308';
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(4, 4);
    return tex;
  });
}

/**
 * High-Vertex Botanical Tree Geometry Prototype (Smooth Shaded, Zero Golf Balls!).
 * Merges tapered trunk, root flare, and 8 angled limbs with 36 smooth sub-canopy puffs.
 */
function createArchitecturalTreeGeometries(): { trunkGeo: THREE.BufferGeometry; crownGeo: THREE.BufferGeometry } {
  // 1. Tapered Trunk, Root Flare, and 8 Angled Primary & Secondary Branches
  const trunkParts: THREE.BufferGeometry[] = [];
  const mainTrunk = new THREE.CylinderGeometry(0.18, 0.34, 2.8, 16, 6);
  mainTrunk.translate(0, 1.4, 0);
  trunkParts.push(mainTrunk);

  const rootFlare = new THREE.CylinderGeometry(0.34, 0.48, 0.4, 16, 2);
  rootFlare.translate(0, 0.2, 0);
  trunkParts.push(rootFlare);

  // 4 Primary branches radiating outward at 0, 90, 180, 270 deg
  const primaryAngles = [0, Math.PI * 0.5, Math.PI, Math.PI * 1.5];
  primaryAngles.forEach((ang) => {
    const bGeo = new THREE.CylinderGeometry(0.08, 0.16, 1.8, 12, 4);
    bGeo.translate(0, 0.9, 0);
    bGeo.rotateZ(0.56);
    bGeo.rotateY(ang);
    bGeo.translate(0, 2.2, 0);
    trunkParts.push(bGeo);
  });

  // 4 Secondary branches radiating at 45, 135, 225, 315 deg
  const secondaryAngles = [Math.PI * 0.25, Math.PI * 0.75, Math.PI * 1.25, Math.PI * 1.75];
  secondaryAngles.forEach((ang) => {
    const bGeo = new THREE.CylinderGeometry(0.04, 0.09, 1.4, 10, 4);
    bGeo.translate(0, 0.7, 0);
    bGeo.rotateZ(0.80);
    bGeo.rotateY(ang);
    bGeo.translate(0, 2.6, 0);
    trunkParts.push(bGeo);
  });

  const trunkGeo = BufferGeometryUtils.mergeGeometries(trunkParts);
  trunkGeo.computeVertexNormals();

  // 2. Realistic Multi-Tier Architectural Shade Tree Boughs (Wide flattened organic layers, zero bumpy broccoli!)
  const crownParts: THREE.BufferGeometry[] = [];
  const boughLayers = [
    // Bottom spreading shade tier (broad horizontal boughs)
    { pos: [0.0, 2.8, 0.0], scale: [2.6, 0.72, 2.4], rotY: 0.1 },
    { pos: [0.65, 3.1, 0.45], scale: [1.85, 0.62, 1.75], rotY: 0.7 },
    { pos: [-0.65, 3.2, -0.45], scale: [1.75, 0.62, 1.65], rotY: -0.6 },
    // Mid tier
    { pos: [0.35, 3.75, -0.35], scale: [2.15, 0.68, 2.05], rotY: 1.3 },
    { pos: [-0.35, 4.15, 0.35], scale: [1.85, 0.65, 1.75], rotY: 2.1 },
    // Upper apex layers
    { pos: [0.0, 4.75, 0.0], scale: [1.55, 0.68, 1.45], rotY: 0.4 },
    { pos: [0.1, 5.25, 0.0], scale: [1.15, 0.58, 1.05], rotY: -0.2 }
  ];

  boughLayers.forEach((bough) => {
    const sGeo = new THREE.SphereGeometry(1.0, 14, 10);
    sGeo.scale(bough.scale[0], bough.scale[1], bough.scale[2]);
    sGeo.rotateY(bough.rotY);
    sGeo.translate(bough.pos[0], bough.pos[1], bough.pos[2]);
    crownParts.push(sGeo);
  });

  const crownGeo = BufferGeometryUtils.mergeGeometries(crownParts);
  crownGeo.computeVertexNormals();

  // Smooth vertex-color ambient occlusion: deep forest green base to sunlit upper canopy
  const posAttr = crownGeo.attributes.position;
  const colors = new Float32Array(posAttr.count * 3);
  const darkAO = new THREE.Color(0x1B3D20);
  const midAO = new THREE.Color(0x2E6934);
  const lightAO = new THREE.Color(0x489650);
  const tempCol = new THREE.Color();
  for (let i = 0; i < posAttr.count; i++) {
    const y = posAttr.getY(i);
    const t = THREE.MathUtils.clamp((y - 2.1) / 3.4, 0, 1);
    if (t < 0.5) {
      tempCol.copy(darkAO).lerp(midAO, t * 2);
    } else {
      tempCol.copy(midAO).lerp(lightAO, (t - 0.5) * 2);
    }
    colors[i * 3] = tempCol.r;
    colors[i * 3 + 1] = tempCol.g;
    colors[i * 3 + 2] = tempCol.b;
  }
  crownGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  return { trunkGeo, crownGeo };
}

interface StraightVehicle {
  group: THREE.Group;
  wheels: THREE.Mesh[];
  axis: 'X' | 'Z';
  laneCoord: number; // constant coord on other axis
  pos: number;      // current position along movement axis (-160 to +160)
  direction: 1 | -1;
  speed: number;
  maxSpeed: number;
  isBus: boolean;
}

interface StraightPedestrian {
  root: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  axis: 'X' | 'Z';
  laneCoord: number;
  pos: number;
  direction: 1 | -1;
  speed: number;
  walkPhase: number;
}

/**
 * Builds the 400m x 400m Orthogonal GTA-Style Living World Scene.
 */
export function buildLivingCityScene(modelBounds?: { size: THREE.Vector3; center: THREE.Vector3 }): LivingCityScene {
  const group = new THREE.Group();
  group.name = '__living_city_context__';

  const bSize = modelBounds?.size || new THREE.Vector3(14, 4, 14);
  const bCenter = modelBounds?.center || new THREE.Vector3(0, 0, 0);

  // 1. PDF Page 9 Three-Light Setup (Calibrated Natural Warm Daylight):
  // Sun: Warm natural sunlight #fff4e0, intensity 1.35 at [22, 36, 18], 2048x2048 shadow map
  const sunLight = new THREE.DirectionalLight(0xfff4e0, 1.35);
  sunLight.position.set(22, 36, 18);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.width = 2048;
  sunLight.shadow.mapSize.height = 2048;
  sunLight.shadow.autoUpdate = false;
  sunLight.shadow.camera.near = 0.5;
  sunLight.shadow.camera.far = 160;
  sunLight.shadow.camera.left = -40;
  sunLight.shadow.camera.right = 40;
  sunLight.shadow.camera.top = 40;
  sunLight.shadow.camera.bottom = -40;
  sunLight.shadow.bias = -0.0005;

  // Sky: Warm sky #d8ecff + olive ground #3a4a38, intensity 0.55
  const hemiLight = new THREE.HemisphereLight(0xd8ecff, 0x3a4a38, 0.55);
  hemiLight.position.set(0, 60, 0);

  // Fill: Soft ambient sky fill #7da7d9, intensity 0.25 at [-18, 20, -16]
  const fillLight = new THREE.DirectionalLight(0x7da7d9, 0.25);
  fillLight.position.set(-18, 20, -16);
  fillLight.castShadow = false;

  // Do not add duplicate lights to group so scene lighting is never double-stacked!

  // 2. Noon Sky Dome & Clouds
  const skyTex = createNoonSkyTexture();
  const skyGeo = new THREE.SphereGeometry(280, 32, 20);
  const skyMat = new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, depthWrite: false, fog: false });
  const skyMesh = new THREE.Mesh(skyGeo, skyMat);
  group.add(skyMesh);

  // 16 Volumetric Clouds
  const cloudCount = 16;
  const cloudGeo = new THREE.DodecahedronGeometry(9, 1);
  const cloudMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.95,
    metalness: 0.05,
    transparent: true,
    opacity: 0.85
  });
  const cloudInstMesh = new THREE.InstancedMesh(cloudGeo, cloudMat, cloudCount);
  cloudInstMesh.userData.isDynamic = true;
  const cloudPositions: THREE.Vector3[] = [];
  const dummy = new THREE.Object3D();

  for (let i = 0; i < cloudCount; i++) {
    const cx = -180 + (i * 24) + (Math.sin(i * 1.7) * 20);
    const cy = 75 + (i % 4) * 8;
    const cz = -150 + ((i * 37) % 300);
    const scale = 1.0 + (i % 3) * 0.4;
    cloudPositions.push(new THREE.Vector3(cx, cy, cz));
    dummy.position.set(cx, cy, cz);
    dummy.scale.set(scale * 1.8, scale * 0.7, scale * 1.3);
    dummy.updateMatrix();
    cloudInstMesh.setMatrixAt(i, dummy.matrix);
  }
  cloudInstMesh.instanceMatrix.needsUpdate = true;
  group.add(cloudInstMesh);

  // 3. CENTRAL PROPERTY PARCEL [-12m to +12m on X and Z]
  const turfTex = createTurfTexture();
  const lawnGeo = new THREE.BoxGeometry(24, 0.16, 24);
  const lawnMat = new THREE.MeshStandardMaterial({ map: turfTex, color: 0x2e6631, roughness: 0.88, envMapIntensity: 0.2 });
  const lawnMesh = new THREE.Mesh(lawnGeo, lawnMat);
  lawnMesh.position.set(0, -0.08, 0);
  lawnMesh.receiveShadow = true;
  group.add(lawnMesh);

  // Paved Stone Entrance Driveway leading to South Sidewalk (Z = +12m)
  const patioTex = createStonePatioTexture();
  const drivewayGeo = new THREE.BoxGeometry(5.2, 0.18, 9.0);
  const drivewayMat = new THREE.MeshStandardMaterial({ map: patioTex, color: 0xc8c3ba, roughness: 0.85, envMapIntensity: 0.25 });
  const drivewayMesh = new THREE.Mesh(drivewayGeo, drivewayMat);
  drivewayMesh.position.set(0, -0.04, 7.5);
  drivewayMesh.receiveShadow = true;
  group.add(drivewayMesh);

  // Turquoise Swimming Pool with Teak Sun Deck
  const poolGroup = new THREE.Group();
  const poolBorder = new THREE.Mesh(
    new THREE.BoxGeometry(6.4, 0.19, 3.6),
    new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.4 })
  );
  poolBorder.position.set(0, -0.03, 0);

  const poolWaterGeo = new THREE.PlaneGeometry(5.8, 3.0);
  poolWaterGeo.rotateX(-Math.PI / 2);
  const poolWater = new THREE.Mesh(
    poolWaterGeo,
    new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.1, metalness: 0.8, transparent: true, opacity: 0.92 })
  );
  poolWater.position.set(0, 0.05, 0);

  const poolDeck = new THREE.Mesh(
    new THREE.BoxGeometry(2.4, 0.20, 3.6),
    new THREE.MeshStandardMaterial({ color: 0xd4b996, roughness: 0.7 })
  );
  poolDeck.position.set(4.4, -0.02, 0);
  poolGroup.add(poolBorder, poolWater, poolDeck);
  poolGroup.position.set(-6.8, 0, -4.5);
  group.add(poolGroup);

  // Low Architectural Boundary Hedge with South Opening for Driveway
  const hedgeMat = new THREE.MeshStandardMaterial({ color: 0x1b4324, roughness: 0.85 });
  const hedgeN = new THREE.Mesh(new THREE.BoxGeometry(23.6, 0.44, 0.45), hedgeMat);
  hedgeN.position.set(0, 0.14, -11.8);
  const hedgeW = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.44, 23.6), hedgeMat);
  hedgeW.position.set(-11.8, 0.14, 0);
  const hedgeE = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.44, 23.6), hedgeMat);
  hedgeE.position.set(11.8, 0.14, 0);
  const hedgeS_L = new THREE.Mesh(new THREE.BoxGeometry(8.5, 0.44, 0.45), hedgeMat);
  hedgeS_L.position.set(-7.2, 0.14, 11.8);
  const hedgeS_R = new THREE.Mesh(new THREE.BoxGeometry(8.5, 0.44, 0.45), hedgeMat);
  hedgeS_R.position.set(7.2, 0.14, 11.8);
  group.add(hedgeN, hedgeW, hedgeE, hedgeS_L, hedgeS_R);

  // 4. ORTHOGONAL 2-WAY ASPHALT AVENUES & CROSS-STREETS (-180m to +180m)
  // Road width: 8m. 2048x2048 PBR Asphalt aggregate grain with subtle wear lanes.
  const asphaltTex = createPbrAsphaltTexture();
  const asphaltMat = new THREE.MeshStandardMaterial({
    map: asphaltTex,
    bumpMap: asphaltTex,
    bumpScale: 0.015,
    roughness: 0.82,
    metalness: 0.08
  });
  const roadsGroup = new THREE.Group();

  // South Cross-Street (Z = +18m, span Z = 14m to 22m, length 360m along X)
  const southRoad = new THREE.Mesh(new THREE.BoxGeometry(360, 0.10, 8.0), asphaltMat);
  southRoad.position.set(0, -0.05, 18.0);
  southRoad.receiveShadow = true;

  // North Cross-Street (Z = -18m, span Z = -22m to -14m, length 360m along X)
  const northRoad = new THREE.Mesh(new THREE.BoxGeometry(360, 0.10, 8.0), asphaltMat);
  northRoad.position.set(0, -0.05, -18.0);
  northRoad.receiveShadow = true;

  // West Avenue (X = -18m, span X = -22m to -14m, length 360m along Z)
  const westRoad = new THREE.Mesh(new THREE.BoxGeometry(8.0, 0.10, 360), asphaltMat);
  westRoad.position.set(-18.0, -0.05, 0);
  westRoad.receiveShadow = true;

  // East Avenue (X = +18m, span X = 14m to 22m, length 360m along Z)
  const eastRoad = new THREE.Mesh(new THREE.BoxGeometry(8.0, 0.10, 360), asphaltMat);
  eastRoad.position.set(18.0, -0.05, 0);
  eastRoad.receiveShadow = true;

  roadsGroup.add(southRoad, northRoad, westRoad, eastRoad);
  group.add(roadsGroup);

  // Double Yellow Center Lines & Crisp White Dashed Lane Dividers
  const markingsGroup = new THREE.Group();
  const yellowLineMat = new THREE.MeshBasicMaterial({ color: 0xfacc15 });
  const whiteMarkMat = new THREE.MeshBasicMaterial({ color: 0xf8fafc });

  // Double Yellow on South Road (Z = +18m)
  const ySouth_L = new THREE.Mesh(new THREE.BoxGeometry(360, 0.01, 0.12), yellowLineMat);
  ySouth_L.position.set(0, 0.015, 17.92);
  const ySouth_R = new THREE.Mesh(new THREE.BoxGeometry(360, 0.01, 0.12), yellowLineMat);
  ySouth_R.position.set(0, 0.015, 18.08);

  // Double Yellow on North Road (Z = -18m)
  const yNorth_L = new THREE.Mesh(new THREE.BoxGeometry(360, 0.01, 0.12), yellowLineMat);
  yNorth_L.position.set(0, 0.015, -17.92);
  const yNorth_R = new THREE.Mesh(new THREE.BoxGeometry(360, 0.01, 0.12), yellowLineMat);
  yNorth_R.position.set(0, 0.015, -18.08);

  // Double Yellow on West Ave (X = -18m)
  const yWest_L = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.01, 360), yellowLineMat);
  yWest_L.position.set(-17.92, 0.015, 0);
  const yWest_R = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.01, 360), yellowLineMat);
  yWest_R.position.set(-18.08, 0.015, 0);

  // Double Yellow on East Ave (X = +18m)
  const yEast_L = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.01, 360), yellowLineMat);
  yEast_L.position.set(17.92, 0.015, 0);
  const yEast_R = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.01, 360), yellowLineMat);
  yEast_R.position.set(18.08, 0.015, 0);

  markingsGroup.add(ySouth_L, ySouth_R, yNorth_L, yNorth_R, yWest_L, yWest_R, yEast_L, yEast_R);

  // White Zebra Crosswalks at the 4 Intersections (±18m, ±18m)
  const zebraGeo = new THREE.BoxGeometry(0.6, 0.01, 2.8);
  const zebraGeoRot = new THREE.BoxGeometry(2.8, 0.01, 0.6);
  const intersectionCenters = [
    { x: -18, z: 18 },
    { x: 18, z: 18 },
    { x: -18, z: -18 },
    { x: 18, z: -18 }
  ];

  intersectionCenters.forEach((ic) => {
    // 4 crosswalk approaches per intersection
    [-4.8, 4.8].forEach((offset) => {
      // E-W approaches
      for (let s = -3; s <= 3; s++) {
        const zm = new THREE.Mesh(zebraGeo, whiteMarkMat);
        zm.position.set(ic.x + offset, 0.016, ic.z + s * 0.9);
        markingsGroup.add(zm);
      }
      // N-S approaches
      for (let s = -3; s <= 3; s++) {
        const zm = new THREE.Mesh(zebraGeoRot, whiteMarkMat);
        zm.position.set(ic.x + s * 0.9, 0.016, ic.z + offset);
        markingsGroup.add(zm);
      }
    });
  });
  group.add(markingsGroup);

  // Raised Concrete Sidewalks (2.2m wide) with 2048x2048 Honed Ashlar Paving Slabs
  const sidewalkTex = createPbrSidewalkTexture();
  const concreteMat = new THREE.MeshStandardMaterial({
    map: sidewalkTex,
    bumpMap: sidewalkTex,
    bumpScale: 0.015,
    roughness: 0.72,
    metalness: 0.05
  });
  const sidewalksGroup = new THREE.Group();

  // Inner Sidewalks bordering Central Parcel (12m to 14m)
  const swInnerS = new THREE.Mesh(new THREE.BoxGeometry(28, 0.12, 2.0), concreteMat);
  swInnerS.position.set(0, 0.02, 13.0);
  const swInnerN = new THREE.Mesh(new THREE.BoxGeometry(28, 0.12, 2.0), concreteMat);
  swInnerN.position.set(0, 0.02, -13.0);
  const swInnerW = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.12, 24), concreteMat);
  swInnerW.position.set(-13.0, 0.02, 0);
  const swInnerE = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.12, 24), concreteMat);
  swInnerE.position.set(13.0, 0.02, 0);

  // Outer Sidewalks bordering Outer Blocks (22m to 24.2m)
  const swOuterS = new THREE.Mesh(new THREE.BoxGeometry(360, 0.12, 2.2), concreteMat);
  swOuterS.position.set(0, 0.02, 23.1);
  const swOuterN = new THREE.Mesh(new THREE.BoxGeometry(360, 0.12, 2.2), concreteMat);
  swOuterN.position.set(0, 0.02, -23.1);
  const swOuterW = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.12, 360), concreteMat);
  swOuterW.position.set(-23.1, 0.02, 0);
  const swOuterE = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.12, 360), concreteMat);
  swOuterE.position.set(23.1, 0.02, 0);

  sidewalksGroup.add(swInnerS, swInnerN, swInnerW, swInnerE, swOuterS, swOuterN, swOuterW, swOuterE);
  group.add(sidewalksGroup);

  // 4 Traffic Light Poles at Intersections
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.6, metalness: 0.6 });
  const redSignalMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
  const greenSignalMat = new THREE.MeshBasicMaterial({ color: 0x22c55e });
  const yellowSignalMat = new THREE.MeshBasicMaterial({ color: 0xeab308 });
  const trafficLightGroup = new THREE.Group();

  intersectionCenters.forEach((ic) => {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 5.8, 8), poleMat);
    const px = ic.x > 0 ? ic.x + 4.8 : ic.x - 4.8;
    const pz = ic.z > 0 ? ic.z + 4.8 : ic.z - 4.8;
    pole.position.set(px, 2.9, pz);

    const mastArm = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.14, 0.14), poleMat);
    mastArm.position.set(ic.x > 0 ? -1.8 : 1.8, 2.5, 0);
    pole.add(mastArm);

    // Signal Box with 3 lights
    const sBox = new THREE.Mesh(new THREE.BoxGeometry(0.35, 1.0, 0.35), poleMat);
    sBox.position.set(ic.x > 0 ? -3.4 : 3.4, 2.2, 0);

    const rLight = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), redSignalMat);
    rLight.position.set(0, 0.32, 0.18);
    const yLight = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), yellowSignalMat);
    yLight.position.set(0, 0.0, 0.18);
    const gLight = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), greenSignalMat);
    gLight.position.set(0, -0.32, 0.18);
    sBox.add(rLight, yLight, gLight);
    pole.add(sBox);

    trafficLightGroup.add(pole);
  });
  group.add(trafficLightGroup);

  // 5. ZONE 5: REALISTIC ARCHITECTURAL DAYTIME BUILDINGS (|X| > 24m or |Z| > 24m)
  // 2048x2048 High-Resolution PBR Facade & Matching Bump Maps (anisotropy = 16)
  const facadeCream = createFacadeTexture('cream');
  const bumpCream = createFacadeBumpMap('cream');
  const facadeConcrete = createFacadeTexture('concrete');
  const bumpConcrete = createFacadeBumpMap('concrete');
  const facadeTerracotta = createFacadeTexture('terracotta');
  const bumpTerracotta = createFacadeBumpMap('terracotta');
  const facadeGlass = createFacadeTexture('glass');
  const bumpGlass = createFacadeBumpMap('glass');

  const bldgMatCream = new THREE.MeshStandardMaterial({
    map: facadeCream,
    bumpMap: bumpCream,
    bumpScale: 0.02,
    roughness: 0.35,
    metalness: 0.15
  });
  const bldgMatConcrete = new THREE.MeshStandardMaterial({
    map: facadeConcrete,
    bumpMap: bumpConcrete,
    bumpScale: 0.02,
    roughness: 0.35,
    metalness: 0.15
  });
  const bldgMatTerracotta = new THREE.MeshStandardMaterial({
    map: facadeTerracotta,
    bumpMap: bumpTerracotta,
    bumpScale: 0.02,
    roughness: 0.35,
    metalness: 0.15
  });
  const bldgMatGlass = new THREE.MeshStandardMaterial({
    map: facadeGlass,
    bumpMap: bumpGlass,
    bumpScale: 0.02,
    roughness: 0.25,
    metalness: 0.45
  });
  const roofCorniceMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.55 });
  const roofChillerMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.65, metalness: 0.45 });
  const balconyGlassMat = new THREE.MeshStandardMaterial({
    color: 0x93c5fd,
    roughness: 0.15,
    metalness: 0.75,
    transparent: true,
    opacity: 0.70
  });
  const pillarMat = new THREE.MeshStandardMaterial({ color: 0xe2ddd5, roughness: 0.65 });

  const bldgDefinitions: Array<[number, number, number, number, number, 'cream' | 'concrete' | 'terracotta' | 'glass']> = [
    // NW City Block (X <= -28m, Z <= -28m)
    [-38, -38, 18, 28, 18, 'cream'],
    [-60, -38, 20, 36, 18, 'glass'],
    [-38, -60, 18, 24, 20, 'terracotta'],
    [-62, -62, 22, 42, 22, 'concrete'],

    // NE City Block (X >= 28m, Z <= -28m)
    [38, -38, 18, 30, 18, 'concrete'],
    [60, -38, 20, 26, 18, 'cream'],
    [38, -60, 18, 38, 20, 'glass'],
    [62, -62, 22, 34, 22, 'terracotta'],

    // SW City Block (X <= -28m, Z >= 28m)
    [-38, 38, 18, 26, 18, 'terracotta'],
    [-60, 38, 20, 32, 18, 'cream'],
    [-38, 60, 18, 40, 20, 'glass'],
    [-62, 62, 22, 28, 22, 'concrete'],

    // SE City Block (X >= 28m, Z >= 28m)
    [38, 38, 18, 34, 18, 'glass'],
    [60, 38, 20, 28, 18, 'terracotta'],
    [38, 60, 18, 32, 20, 'concrete'],
    [62, 62, 22, 44, 22, 'cream'],

    // North Avenue Flank (X ~ 0, Z <= -34m)
    [-8, -44, 14, 24, 16, 'cream'],
    [8, -44, 14, 28, 16, 'concrete'],

    // South Avenue Flank (X ~ 0, Z >= 34m)
    [-8, 44, 14, 26, 16, 'concrete'],
    [8, 44, 14, 22, 16, 'terracotta'],

    // West Avenue Flank (X <= -34m, Z ~ 0)
    [-44, -8, 16, 30, 14, 'glass'],
    [-44, 8, 16, 24, 14, 'cream'],

    // East Avenue Flank (X >= 34m, Z ~ 0)
    [44, -8, 16, 26, 14, 'terracotta'],
    [44, 8, 16, 32, 14, 'glass']
  ];

  const buildingsGroup = new THREE.Group();
  bldgDefinitions.forEach(([bx, bz, bw, bh, bd, facadeType]) => {
    let mat = bldgMatCream;
    if (facadeType === 'concrete') mat = bldgMatConcrete;
    if (facadeType === 'terracotta') mat = bldgMatTerracotta;
    if (facadeType === 'glass') mat = bldgMatGlass;

    const bMesh = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), mat);
    bMesh.position.set(bx, bh / 2 - 0.05, bz);
    bMesh.castShadow = true;
    bMesh.receiveShadow = true;
    buildingsGroup.add(bMesh);

    // Projecting 3D floor slab cornices every story
    for (let cy = 4.0; cy < bh - 1.2; cy += 3.8) {
      const corniceStory = new THREE.Mesh(new THREE.BoxGeometry(bw + 0.36, 0.22, bd + 0.36), roofCorniceMat);
      corniceStory.position.set(bx, cy, bz);
      buildingsGroup.add(corniceStory);
    }

    // Projecting 3D glass balconies on street-facing facade
    const bBalcony1 = new THREE.Mesh(new THREE.BoxGeometry(bw * 0.45, 0.85, 1.1), balconyGlassMat);
    bBalcony1.position.set(bx, bh * 0.38, bz + bd * 0.5 + 0.5);
    const bBalcony2 = new THREE.Mesh(new THREE.BoxGeometry(bw * 0.45, 0.85, 1.1), balconyGlassMat);
    bBalcony2.position.set(bx, bh * 0.68, bz + bd * 0.5 + 0.5);
    buildingsGroup.add(bBalcony1, bBalcony2);

    // Ground-floor colonnade entrance pillars
    for (let p = -1; p <= 1; p++) {
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 4.4, 10), pillarMat);
      pillar.position.set(bx + p * (bw * 0.32), 2.2, bz + bd * 0.5 + 0.8);
      buildingsGroup.add(pillar);
    }

    // Stepped Rooftop Parapet Cornice
    const cornice = new THREE.Mesh(new THREE.BoxGeometry(bw * 1.03, 0.65, bd * 1.03), roofCorniceMat);
    cornice.position.set(bx, bh - 0.05, bz);

    // Rooftop Elevator Penthouse / AC Mechanical Unit
    const penthouse = new THREE.Mesh(new THREE.BoxGeometry(bw * 0.42, 2.4, bd * 0.42), roofChillerMat);
    penthouse.position.set(bx, bh + 1.2, bz);

    buildingsGroup.add(cornice, penthouse);
  });
  group.add(buildingsGroup);

  // Distant Hazy City Skyline at Radius 150m
  const skylineMat = new THREE.MeshBasicMaterial({ color: 0xbcd4e6, fog: true });
  const skylineGroup = new THREE.Group();
  for (let i = 0; i < 36; i++) {
    const ang = (i / 36) * Math.PI * 2;
    const sx = Math.cos(ang) * 155;
    const sz = Math.sin(ang) * 155;
    const sh = 25 + ((i * 19) % 35);
    const sw = 14 + (i % 3) * 6;
    const sm = new THREE.Mesh(new THREE.BoxGeometry(sw, sh, sw), skylineMat);
    sm.position.set(sx, sh / 2, sz);
    skylineGroup.add(sm);
  }
  group.add(skylineGroup);

  // 6. HIGH-DENSITY BOTANICAL TREES (SMOOTH-SHADED, ZERO GOLF BALLS!)
  const { trunkGeo, crownGeo } = createArchitecturalTreeGeometries();
  const treeCount = 80;

  const barkTex = createBarkTexture();
  const foliageTex = createFoliageTexture();

  const trunkMat = new THREE.MeshStandardMaterial({
    map: barkTex,
    bumpMap: barkTex,
    bumpScale: 0.02,
    roughness: 0.88
  });
  const trunkInst = new THREE.InstancedMesh(trunkGeo, trunkMat, treeCount);
  trunkInst.castShadow = true;

  const crownMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.85,
    metalness: 0.0,
    envMapIntensity: 0.15,
    flatShading: false
  });
  const crownInst = new THREE.InstancedMesh(crownGeo, crownMat, treeCount);
  crownInst.castShadow = true;

  const TREE_COLORS = [
    new THREE.Color(0x234F28), // Deep forest green
    new THREE.Color(0x2E6934), // Natural parkway green
    new THREE.Color(0x38783E), // Olive architectural green
    new THREE.Color(0x3F8244), // Sunlight foliage
    new THREE.Color(0x26532C), // Woodland pine green
    new THREE.Color(0x4D7C36)  // Olive golden green
  ];

  // Distribute trees along the four sidewalks and parkway verges
  let treeIdx = 0;
  // Along South Sidewalk (Z = 13m)
  for (let x = -26; x <= 26; x += 6.5) {
    if (Math.abs(x) < 3.5) continue; // clear driveway
    setTreeTransform(treeIdx++, x, 0, 13.0);
  }
  // Along North Sidewalk (Z = -13m)
  for (let x = -26; x <= 26; x += 6.5) {
    setTreeTransform(treeIdx++, x, 0, -13.0);
  }
  // Along West Sidewalk (X = -13m)
  for (let z = -26; z <= 26; z += 6.5) {
    setTreeTransform(treeIdx++, -13.0, 0, z);
  }
  // Along East Sidewalk (X = +13m)
  for (let z = -26; z <= 26; z += 6.5) {
    setTreeTransform(treeIdx++, 13.0, 0, z);
  }
  // Along Outer Blocks & Corners (filling remaining up to 80)
  for (let i = treeIdx; i < treeCount; i++) {
    const ang = ((i - treeIdx) / (treeCount - treeIdx)) * Math.PI * 2;
    const rad = 25.5 + ((i * 7) % 12);
    setTreeTransform(i, Math.cos(ang) * rad, 0, Math.sin(ang) * rad);
  }

  function setTreeTransform(idx: number, tx: number, ty: number, tz: number) {
    if (idx >= treeCount) return;
    const scale = 0.9 + (idx % 4) * 0.1;
    dummy.position.set(tx, ty, tz);
    dummy.rotation.set(0, (idx * 1.3) % (Math.PI * 2), 0);
    dummy.scale.set(scale, scale, scale);
    dummy.updateMatrix();

    trunkInst.setMatrixAt(idx, dummy.matrix);
    crownInst.setMatrixAt(idx, dummy.matrix);

    const c = TREE_COLORS[idx % TREE_COLORS.length];
    crownInst.setColorAt(idx, c);
  }

  trunkInst.instanceMatrix.needsUpdate = true;
  crownInst.instanceMatrix.needsUpdate = true;
  if (crownInst.instanceColor) crownInst.instanceColor.needsUpdate = true;
  trunkInst.matrixAutoUpdate = false;
  crownInst.matrixAutoUpdate = false;
  group.add(trunkInst, crownInst);

  // 7. STRAIGHT-LINE GTA TRAFFIC SYSTEM
  // Detailed Sedans / SUVs & Red City Buses
  const tireGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.22, 16);
  tireGeo.rotateZ(Math.PI / 2);
  const rimGeo = new THREE.CylinderGeometry(0.21, 0.21, 0.23, 12);
  rimGeo.rotateZ(Math.PI / 2);
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
  const rimMat = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.25, metalness: 0.85 });
  const glassCabinMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.08, metalness: 0.85 });
  const headlightMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const taillightMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });

  const carPaints = [
    new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.2, metalness: 0.75 }), // Pearl White
    new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.25, metalness: 0.85 }), // Silver Metallic
    new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.25, metalness: 0.8 }),  // Slate Grey
    new THREE.MeshStandardMaterial({ color: 0x1e3a8a, roughness: 0.2, metalness: 0.75 })  // Sapphire Blue
  ];

  function buildCarMesh(paint: THREE.Material): { group: THREE.Group; wheels: THREE.Mesh[] } {
    const cg = new THREE.Group();

    // Contoured multi-part body
    const hood = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.45, 1.4), paint);
    hood.position.set(0, 0.42, 1.3);
    const trunk = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.45, 1.0), paint);
    trunk.position.set(0, 0.42, -1.4);
    const mainBody = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.52, 1.8), paint);
    mainBody.position.set(0, 0.42, 0);

    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.68, 0.48, 2.0), glassCabinMat);
    cabin.position.set(0, 0.86, -0.15);

    // Front headlights
    const hl_L = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.12, 0.08), headlightMat);
    hl_L.position.set(0.68, 0.42, 2.02);
    const hl_R = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.12, 0.08), headlightMat);
    hl_R.position.set(-0.68, 0.42, 2.02);

    // Rear taillights
    const tl_L = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.12, 0.08), taillightMat);
    tl_L.position.set(0.68, 0.42, -1.92);
    const tl_R = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.12, 0.08), taillightMat);
    tl_R.position.set(-0.68, 0.42, -1.92);

    cg.add(hood, trunk, mainBody, cabin, hl_L, hl_R, tl_L, tl_R);

    const wheels: THREE.Mesh[] = [];
    [[-0.96, 0.35, 1.25], [0.96, 0.35, 1.25], [-0.96, 0.35, -1.25], [0.96, 0.35, -1.25]].forEach(([wx, wy, wz]) => {
      const wg = new THREE.Group();
      wg.position.set(wx, wy, wz);
      const tire = new THREE.Mesh(tireGeo, tireMat);
      const rim = new THREE.Mesh(rimGeo, rimMat);
      wg.add(tire, rim);
      cg.add(wg);
      wheels.push(tire);
    });
    return { group: cg, wheels };
  }

  function buildBusMesh(): { group: THREE.Group; wheels: THREE.Mesh[] } {
    const bg = new THREE.Group();
    const busMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.3, metalness: 0.5 });
    const busRoofMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });

    const body = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.2, 7.6), busMat);
    body.position.set(0, 1.45, 0);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(2.35, 0.35, 7.55), busRoofMat);
    roof.position.set(0, 2.65, 0);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(2.44, 0.85, 7.2), glassCabinMat);
    glass.position.set(0, 1.75, 0);

    const hl_L = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.20, 0.1), headlightMat);
    hl_L.position.set(0.85, 0.72, 3.82);
    const hl_R = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.20, 0.1), headlightMat);
    hl_R.position.set(-0.85, 0.72, 3.82);
    const tl_L = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.20, 0.1), taillightMat);
    tl_L.position.set(0.85, 0.72, -3.82);
    const tl_R = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.20, 0.1), taillightMat);
    tl_R.position.set(-0.85, 0.72, -3.82);

    bg.add(body, roof, glass, hl_L, hl_R, tl_L, tl_R);

    const wheels: THREE.Mesh[] = [];
    const bTireGeo = new THREE.CylinderGeometry(0.48, 0.48, 0.28, 16).rotateZ(Math.PI / 2);
    const bRimGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.29, 12).rotateZ(Math.PI / 2);
    [[-1.15, 0.48, 2.5], [1.15, 0.48, 2.5], [-1.15, 0.48, -2.5], [1.15, 0.48, -2.5]].forEach(([wx, wy, wz]) => {
      const wg = new THREE.Group();
      wg.position.set(wx, wy, wz);
      const tire = new THREE.Mesh(bTireGeo, tireMat);
      const rim = new THREE.Mesh(bRimGeo, rimMat);
      wg.add(tire, rim);
      bg.add(wg);
      wheels.push(tire);
    });
    return { group: bg, wheels };
  }

  const straightVehicles: StraightVehicle[] = [];
  const vehiclesGroup = new THREE.Group();

  // 10 Vehicles along 4 Straight Lanes (-160m to +160m):
  // Lane 1: East Ave Northbound (X = +19.8, traveling along +Z)
  // Lane 2: West Ave Southbound (X = -19.8, traveling along -Z)
  // Lane 3: South St Eastbound (Z = +19.8, traveling along +X)
  // Lane 4: North St Westbound (Z = -19.8, traveling along -X)
  const laneConfigs = [
    { axis: 'Z' as const, laneCoord: 19.8, direction: 1 as const, rotY: 0 },
    { axis: 'Z' as const, laneCoord: -19.8, direction: -1 as const, rotY: Math.PI },
    { axis: 'X' as const, laneCoord: 19.8, direction: 1 as const, rotY: Math.PI / 2 },
    { axis: 'X' as const, laneCoord: -19.8, direction: -1 as const, rotY: -Math.PI / 2 }
  ];

  for (let i = 0; i < 10; i++) {
    const isBus = i === 0 || i === 5;
    const v = isBus ? buildBusMesh() : buildCarMesh(carPaints[i % carPaints.length]);
    const cfg = laneConfigs[i % laneConfigs.length];

    // Initial position spaced across the 320m straight stretch (-150 to +150)
    const initPos = -140 + ((i * 32) % 280);

    if (cfg.axis === 'Z') {
      v.group.position.set(cfg.laneCoord, 0, initPos);
    } else {
      v.group.position.set(initPos, 0, cfg.laneCoord);
    }
    v.group.rotation.set(0, cfg.rotY, 0);
    v.group.userData.isDynamic = true;
    v.group.traverse((c) => { c.userData.isDynamic = true; });
    vehiclesGroup.add(v.group);

    straightVehicles.push({
      group: v.group,
      wheels: v.wheels,
      axis: cfg.axis,
      laneCoord: cfg.laneCoord,
      pos: initPos,
      direction: cfg.direction,
      speed: isBus ? 7.2 : 9.5,
      maxSpeed: isBus ? 8.0 : 10.5,
      isBus
    });
  }
  group.add(vehiclesGroup);

  // 8. SIDEWALK PEDESTRIANS WITH ARTICULATED WALKING ANIMATION
  const pedsGroup = new THREE.Group();
  const straightPedestrians: StraightPedestrian[] = [];

  const headGeo = new THREE.SphereGeometry(0.12, 10, 8);
  const hairGeo = new THREE.SphereGeometry(0.125, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.55);
  const torsoGeo = new THREE.BoxGeometry(0.38, 0.58, 0.22);
  const armGeo = new THREE.CylinderGeometry(0.048, 0.04, 0.54, 8).translate(0, -0.27, 0);
  const legGeo = new THREE.CylinderGeometry(0.068, 0.052, 0.76, 8).translate(0, -0.38, 0);
  const shoeGeo = new THREE.BoxGeometry(0.09, 0.07, 0.22).translate(0, -0.76, 0.04);

  const skinMaterials = [
    new THREE.MeshStandardMaterial({ color: 0xe5b895, roughness: 0.7 }),
    new THREE.MeshStandardMaterial({ color: 0xc68e68, roughness: 0.7 }),
    new THREE.MeshStandardMaterial({ color: 0x8d5524, roughness: 0.7 })
  ];
  const hairMaterials = [
    new THREE.MeshStandardMaterial({ color: 0x1c1917, roughness: 0.9 }),
    new THREE.MeshStandardMaterial({ color: 0x573b26, roughness: 0.9 })
  ];
  const shirtMaterials = [
    new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.8 }), // Cream white
    new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.75 }), // Navy
    new THREE.MeshStandardMaterial({ color: 0x52796f, roughness: 0.8 }),  // Sage green
    new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.8 }),  // Terracotta
    new THREE.MeshStandardMaterial({ color: 0x3b82f6, roughness: 0.75 })  // Summer blue
  ];
  const trouserMat = new THREE.MeshStandardMaterial({ color: 0x27272a, roughness: 0.85 });
  const shoeMat = new THREE.MeshStandardMaterial({ color: 0x09090b, roughness: 0.6 });

  // 12 Pedestrians on the 4 straight inner sidewalks (X = ±13.0m, Z = ±13.0m)
  const pedConfigs = [
    { axis: 'X' as const, laneCoord: 13.0, direction: 1 as const, rotY: Math.PI / 2 },
    { axis: 'X' as const, laneCoord: 13.0, direction: -1 as const, rotY: -Math.PI / 2 },
    { axis: 'X' as const, laneCoord: -13.0, direction: 1 as const, rotY: Math.PI / 2 },
    { axis: 'X' as const, laneCoord: -13.0, direction: -1 as const, rotY: -Math.PI / 2 },
    { axis: 'Z' as const, laneCoord: 13.0, direction: 1 as const, rotY: 0 },
    { axis: 'Z' as const, laneCoord: 13.0, direction: -1 as const, rotY: Math.PI },
    { axis: 'Z' as const, laneCoord: -13.0, direction: 1 as const, rotY: 0 },
    { axis: 'Z' as const, laneCoord: -13.0, direction: -1 as const, rotY: Math.PI }
  ];

  for (let i = 0; i < 12; i++) {
    const cfg = pedConfigs[i % pedConfigs.length];
    const root = new THREE.Group();

    const skin = skinMaterials[i % skinMaterials.length];
    const hair = hairMaterials[i % hairMaterials.length];
    const shirt = shirtMaterials[i % shirtMaterials.length];

    const head = new THREE.Mesh(headGeo, skin);
    head.position.set(0, 1.62, 0);
    const hairMesh = new THREE.Mesh(hairGeo, hair);
    hairMesh.position.set(0, 1.63, 0);
    const torso = new THREE.Mesh(torsoGeo, shirt);
    torso.position.set(0, 1.20, 0);

    const leftArm = new THREE.Group();
    leftArm.position.set(0.24, 1.44, 0);
    leftArm.add(new THREE.Mesh(armGeo, shirt));

    const rightArm = new THREE.Group();
    rightArm.position.set(-0.24, 1.44, 0);
    rightArm.add(new THREE.Mesh(armGeo, shirt));

    const leftLeg = new THREE.Group();
    leftLeg.position.set(0.11, 0.90, 0);
    leftLeg.add(new THREE.Mesh(legGeo, trouserMat), new THREE.Mesh(shoeGeo, shoeMat));

    const rightLeg = new THREE.Group();
    rightLeg.position.set(-0.11, 0.90, 0);
    rightLeg.add(new THREE.Mesh(legGeo, trouserMat), new THREE.Mesh(shoeGeo, shoeMat));

    root.add(head, hairMesh, torso, leftArm, rightArm, leftLeg, rightLeg);

    const initPos = -11.0 + (i * 2.0);
    if (cfg.axis === 'X') {
      root.position.set(initPos, 0, cfg.laneCoord);
    } else {
      root.position.set(cfg.laneCoord, 0, initPos);
    }
    root.rotation.set(0, cfg.rotY, 0);
    root.userData.isDynamic = true;
    root.traverse((c) => { c.userData.isDynamic = true; });
    pedsGroup.add(root);

    straightPedestrians.push({
      root,
      leftArm,
      rightArm,
      leftLeg,
      rightLeg,
      axis: cfg.axis,
      laneCoord: cfg.laneCoord,
      pos: initPos,
      direction: cfg.direction,
      speed: 1.15 + (i % 3) * 0.15,
      walkPhase: i * 1.5
    });
  }
  pedsGroup.userData.isDynamic = true;
  group.add(pedsGroup);

  // Anderson Mancini & Lusion rule: Freeze all static meshes in city (terrain, buildings, trees, street fixtures)
  group.traverse((obj) => {
    if (!obj.userData?.isDynamic) {
      obj.updateMatrix();
      obj.updateMatrixWorld(true);
      obj.matrixAutoUpdate = false;
    }
  });

  return {
    group,
    sunLight,
    hemiLight,
    fillLight,
    update: (delta: number) => {
      // 1. Drifting Clouds Overhead
      for (let i = 0; i < cloudCount; i++) {
        const cp = cloudPositions[i];
        cp.x += delta * (1.2 + (i % 3) * 0.4);
        if (cp.x > 180) cp.x = -180;
        dummy.position.copy(cp);
        const scale = 1.0 + (i % 3) * 0.4;
        dummy.scale.set(scale * 1.8, scale * 0.7, scale * 1.3);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        cloudInstMesh.setMatrixAt(i, dummy.matrix);
      }
      cloudInstMesh.instanceMatrix.needsUpdate = true;

      // 2. Straight-Line GTA Traffic Engine with Safe Distance & Intersection Yielding
      straightVehicles.forEach((v) => {
        // Look ahead in same lane
        let effectiveSpeed = v.speed;
        for (const other of straightVehicles) {
          if (other === v) continue;
          if (other.axis === v.axis && other.laneCoord === v.laneCoord && other.direction === v.direction) {
            const dist = (other.pos - v.pos) * v.direction;
            if (dist > 0 && dist < 12.0) {
              effectiveSpeed = Math.min(effectiveSpeed, other.speed * 0.8);
            }
          }
        }

        // Advance along axis
        v.pos += v.direction * effectiveSpeed * delta;

        // Wrap around when reaching edge of 320m grid
        if (v.direction === 1 && v.pos > 160) {
          v.pos = -160;
        } else if (v.direction === -1 && v.pos < -160) {
          v.pos = 160;
        }

        if (v.axis === 'Z') {
          v.group.position.set(v.laneCoord, 0, v.pos);
        } else {
          v.group.position.set(v.pos, 0, v.laneCoord);
        }

        // Spin wheels
        const wheelRot = (effectiveSpeed * delta) / 0.35;
        v.wheels.forEach((w) => {
          w.rotation.x += wheelRot;
        });
      });

      // 3. Articulated Walking Motion for Pedestrians
      straightPedestrians.forEach((p) => {
        p.pos += p.direction * p.speed * delta;
        if (p.pos > 12.0) {
          p.pos = 12.0;
          p.direction = -1;
          p.root.rotation.y += Math.PI;
        } else if (p.pos < -12.0) {
          p.pos = -12.0;
          p.direction = 1;
          p.root.rotation.y += Math.PI;
        }

        if (p.axis === 'X') {
          p.root.position.set(p.pos, 0, p.laneCoord);
        } else {
          p.root.position.set(p.laneCoord, 0, p.pos);
        }

        p.walkPhase += delta * p.speed * 4.8;
        const legAngle = Math.sin(p.walkPhase) * 0.44;
        const armAngle = -legAngle * 0.75;

        p.leftLeg.rotation.x = legAngle;
        p.rightLeg.rotation.x = -legAngle;
        p.leftArm.rotation.x = armAngle;
        p.rightArm.rotation.x = -armAngle;
      });
    }
  };
}

/**
 * Builds the interactive floor story hover highlight group.
 * Features:
 * - Thin yellow wireframe highlight box + warm translucent fill (Screenshot 2 style).
 * - 4 Corner focus brackets [  ] and flush contour lines.
 */
export function buildFloorStoryHighlight(size: THREE.Vector3, center: THREE.Vector3): THREE.Group {
  const group = new THREE.Group();
  group.name = '__floor_story_highlight__';

  const halfX = (size.x || 12) * 0.5 + 0.15;
  const halfZ = (size.z || 12) * 0.5 + 0.15;
  const bracketLen = 1.4;

  const lineMat = new THREE.LineBasicMaterial({ color: 0xffd479, linewidth: 2, transparent: true, opacity: 0.95 });

  // 1. Thin Yellow Wireframe Box + Warm Tint (Scoped strictly to floor elevation)
  const unitBoxGeo = new THREE.BoxGeometry(1, 1, 1);
  const wireGeo = new THREE.WireframeGeometry(unitBoxGeo);
  const wireMat = new THREE.LineBasicMaterial({ color: 0xffd479, transparent: true, opacity: 0.85 });
  const wireBox = new THREE.LineSegments(wireGeo, wireMat);
  wireBox.name = 'floor_wire_box';

  const fillMat = new THREE.MeshBasicMaterial({
    color: 0xffd479,
    transparent: true,
    opacity: 0.08,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  const fillBox = new THREE.Mesh(unitBoxGeo, fillMat);
  fillBox.name = 'floor_fill_box';

  group.add(wireBox, fillBox);

  // 2. 4 Corner Brackets at [±halfX, ±halfZ]
  const corners: Array<[number, number, number, number]> = [
    [-halfX, -halfZ, 1, 1],
    [halfX, -halfZ, -1, 1],
    [halfX, halfZ, -1, -1],
    [-halfX, halfZ, 1, -1]
  ];

  corners.forEach(([cx, cz, dx, dz], idx) => {
    const pts: THREE.Vector3[] = [
      new THREE.Vector3(cx + dx * bracketLen, 0, cz),
      new THREE.Vector3(cx, 0, cz),
      new THREE.Vector3(cx, 0, cz + dz * bracketLen)
    ];
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const lineBottom = new THREE.Line(geo, lineMat);
    lineBottom.name = `bracket_b_${idx}`;

    const lineTop = new THREE.Line(geo.clone(), lineMat);
    lineTop.name = `bracket_t_${idx}`;

    const vertGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(cx, 0, cz),
      new THREE.Vector3(cx, 1, cz)
    ]);
    const vertLine = new THREE.Line(vertGeo, lineMat);
    vertLine.name = `bracket_v_${idx}`;

    group.add(lineBottom, lineTop, vertLine);
  });

  // Perimeter bounding contour frame
  const contourPts: THREE.Vector3[] = [
    new THREE.Vector3(-halfX, 0, -halfZ),
    new THREE.Vector3(halfX, 0, -halfZ),
    new THREE.Vector3(halfX, 0, halfZ),
    new THREE.Vector3(-halfX, 0, halfZ),
    new THREE.Vector3(-halfX, 0, -halfZ)
  ];
  const contourGeo = new THREE.BufferGeometry().setFromPoints(contourPts);
  const contourBottom = new THREE.Line(contourGeo, lineMat);
  contourBottom.name = 'contour_bottom';
  const contourTop = new THREE.Line(contourGeo.clone(), lineMat);
  contourTop.name = 'contour_top';

  group.add(contourBottom, contourTop);
  group.position.set(center.x, 0, center.z);
  group.visible = false;
  return group;
}

/**
 * Updates corner focus brackets, contour frame, and yellow wireframe box to fit the hovered floor elevation.
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

  const fMinY = floor.minY;
  const fMaxY = floor.maxY;
  const fH = Math.max(0.4, fMaxY - fMinY);
  const fW = (size.x || 12) * 1.04;
  const fD = (size.z || 12) * 1.04;
  const fY = fMinY + fH * 0.5;

  highlightGroup.position.set(center.x, 0, center.z);

  // Position and scale wireframe box & fill
  const wire = highlightGroup.getObjectByName('floor_wire_box') as THREE.LineSegments | null;
  const fill = highlightGroup.getObjectByName('floor_fill_box') as THREE.Mesh | null;
  if (wire) {
    wire.position.set(0, fY, 0);
    wire.scale.set(fW, fH, fD);
  }
  if (fill) {
    fill.position.set(0, fY, 0);
    fill.scale.set(fW, fH, fD);
  }

  const halfX = fW * 0.5;
  const halfZ = fD * 0.5;

  const corners: Array<[number, number, number, number]> = [
    [-halfX, -halfZ, 1, 1],
    [halfX, -halfZ, -1, 1],
    [halfX, halfZ, -1, -1],
    [-halfX, halfZ, 1, -1]
  ];

  corners.forEach(([cx, cz, dx, dz], idx) => {
    const lb = highlightGroup.getObjectByName(`bracket_b_${idx}`) as THREE.Line | null;
    const lt = highlightGroup.getObjectByName(`bracket_t_${idx}`) as THREE.Line | null;
    const lv = highlightGroup.getObjectByName(`bracket_v_${idx}`) as THREE.Line | null;

    if (lb) lb.position.set(0, fMinY, 0);
    if (lt) lt.position.set(0, fMaxY, 0);
    if (lv) {
      lv.position.set(0, fMinY, 0);
      lv.scale.set(1, fH, 1);
    }
  });

  const cb = highlightGroup.getObjectByName('contour_bottom') as THREE.Line | null;
  const ct = highlightGroup.getObjectByName('contour_top') as THREE.Line | null;
  if (cb) cb.position.set(0, fMinY, 0);
  if (ct) ct.position.set(0, fMaxY, 0);

  highlightGroup.visible = true;
}

/**
 * Builds interactive 3D specification pin marker.
 */
export function buildPinMeshGroup(pin: SpatialPinItem, isSelected: boolean): THREE.Group {
  const isApp = pin.status === 'approved', g = new THREE.Group();
  g.name = `__pin_${pin.id}__`;
  const [px, py, pz] = pin.position;
  g.position.set(px, py, pz);

  const col = isSelected ? 0xffffff : isApp ? 0x22c55e : 0xeab308;
  const pinMat = new THREE.MeshStandardMaterial({
    color: col,
    emissive: isSelected ? 0x666666 : isApp ? 0x052e16 : 0x422006,
    roughness: 0.25,
    metalness: 0.85
  });

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.08, 16, 16), pinMat);
  head.position.set(0, 0.42, 0);

  const stemGeo = new THREE.CylinderGeometry(0.015, 0.005, 0.38, 8);
  stemGeo.translate(0, 0.19, 0);
  const stem = new THREE.Mesh(stemGeo, pinMat);

  const haloMat = new THREE.MeshBasicMaterial({
    color: col,
    transparent: true,
    opacity: isSelected ? 0.35 : 0.18,
    side: THREE.DoubleSide
  });
  const halo = new THREE.Mesh(new THREE.RingGeometry(0.12, 0.22, 24), haloMat);
  halo.rotateX(-Math.PI / 2);
  halo.position.set(0, 0.01, 0);

  g.add(head, stem, halo);
  return g;
}
