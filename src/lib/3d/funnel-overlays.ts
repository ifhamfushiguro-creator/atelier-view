import * as THREE from 'three';
import type { FloorSlice, SpatialPinItem } from './simple-normalizer';

export interface LivingCityScene {
  group: THREE.Group;
  update: (delta: number, elapsed: number) => void;
}

/**
 * Procedural 512x512 Blue-Hour Twilight Sky Dome Texture with soft wispy clouds.
 * Zenith: rich twilight royal blue (#15427E) -> azure (#2E6FBE/#5A9CE2)
 * -> pastel blue mist (#90CDF4) with warm sunset-gold horizon glow (#F6E05E).
 */
function createMiamiTwilightSkyTexture(): THREE.CanvasTexture {
  if (typeof document === 'undefined') return new THREE.CanvasTexture({} as HTMLCanvasElement);
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0.0, '#15427E');
    grad.addColorStop(0.32, '#20549A');
    grad.addColorStop(0.55, '#2E6FBE');
    grad.addColorStop(0.72, '#5A9CE2');
    grad.addColorStop(0.85, '#90CDF4');
    grad.addColorStop(0.92, '#F6E05E');
    grad.addColorStop(1.0, '#235796');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 512);

    // Soft wispy twilight clouds
    ctx.fillStyle = 'rgba(210, 230, 255, 0.22)';
    for (let i = 0; i < 18; i++) {
      const cx = (i * 97) % 512;
      const cy = 250 + ((i * 41) % 170);
      const rx = 70 + (i % 5) * 20;
      const ry = 14 + (i % 3) * 6;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Procedural Soft Radial Contact Shadow Texture for the presentation plinth.
 */
function createRadialShadowTexture(): THREE.CanvasTexture {
  if (typeof document === 'undefined') return new THREE.CanvasTexture({} as HTMLCanvasElement);
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(128, 128, 0, 128, 128, 126);
    grad.addColorStop(0.0, 'rgba(0, 0, 0, 0.72)');
    grad.addColorStop(0.45, 'rgba(0, 0, 0, 0.42)');
    grad.addColorStop(0.78, 'rgba(0, 0, 0, 0.12)');
    grad.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);
  }
  return new THREE.CanvasTexture(canvas);
}

/**
 * FIX 1: Ultra-Clean, High-Craft Architectural Presentation Plinth & Twilight Horizon.
 * Strictly under 6 draw calls total:
 * 1. Smooth Twilight Sky Dome (SphereGeometry(220, 32, 24))
 * 2. Dark Honed Architectural Podium Base under house (BoxGeometry(26, 0.4, 26)) at Y = -0.2
 * 3. Subtle Chamfered Bezel (BoxGeometry(26.6, 0.44, 26.6)) at Y = -0.24
 * 4. Soft Ground Shadow / Reflection Ring (PlaneGeometry(36, 36))
 * 5. Four subtle warm corner uplights (PointLight)
 * ZERO cartoon palm trees, ZERO per-frame loops, ZERO giant city boxes.
 */
export function buildLivingCityScene(): LivingCityScene {
  const group = new THREE.Group();
  group.name = '__living_city_context__';

  // 1. Vibrant Blue-Hour Twilight Sky Dome
  const skyTex = createMiamiTwilightSkyTexture();
  const skyGeo = new THREE.SphereGeometry(220, 32, 24);
  const skyMat = new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, depthWrite: false, fog: false });
  const skyMesh = new THREE.Mesh(skyGeo, skyMat);
  group.add(skyMesh);

  // 2. Dark Honed Architectural Podium Base (#141416)
  const podiumGeo = new THREE.BoxGeometry(26, 0.4, 26);
  const podiumMat = new THREE.MeshStandardMaterial({
    color: 0x141416,
    roughness: 0.88,
    metalness: 0.1
  });
  const podiumMesh = new THREE.Mesh(podiumGeo, podiumMat);
  podiumMesh.position.set(0, -0.2, 0); // Top surface sits flush with Y = 0
  podiumMesh.receiveShadow = true;
  group.add(podiumMesh);

  // 3. Subtle Chamfered Bezel (#0A0A0C)
  const bezelGeo = new THREE.BoxGeometry(26.6, 0.44, 26.6);
  const bezelMat = new THREE.MeshStandardMaterial({
    color: 0x0A0A0C,
    roughness: 0.95
  });
  const bezelMesh = new THREE.Mesh(bezelGeo, bezelMat);
  bezelMesh.position.set(0, -0.24, 0);
  group.add(bezelMesh);

  // 4. Subtle Ground Shadow / Reflection Ring (38m x 38m)
  const shadowGeo = new THREE.PlaneGeometry(38, 38);
  shadowGeo.rotateX(-Math.PI / 2);
  const shadowMat = new THREE.MeshBasicMaterial({
    map: createRadialShadowTexture(),
    transparent: true,
    depthWrite: false
  });
  const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
  shadowMesh.position.set(0, -0.47, 0);
  group.add(shadowMesh);

  // 5. Four subtle warm corner accent uplights
  const cornerCoords: Array<[number, number]> = [[-11, -11], [11, -11], [-11, 11], [11, 11]];
  cornerCoords.forEach(([cx, cz]) => {
    const light = new THREE.PointLight(0xffdf8e, 2.5, 6.5);
    light.position.set(cx, 0.25, cz);
    group.add(light);
  });

  return {
    group,
    update: (_delta: number, _elapsed: number) => {
      // Zero per-frame geometry loops: Rock-solid 60 FPS
    }
  };
}

/**
 * Creates two warm golden interior THREE.PointLight(0xffd27d, 6, 8) lights inside the building footprint
 * so windows and balconies glow warmly from within when hovering a floor in exterior mode.
 */
export function buildFloorStoryHighlight(_size: THREE.Vector3, _center: THREE.Vector3): THREE.Group {
  const group = new THREE.Group();
  group.name = '__floor_story_highlight__';

  const light1 = new THREE.PointLight(0xffd27d, 6, 8);
  light1.name = 'interior_glow_1';
  const light2 = new THREE.PointLight(0xffd27d, 6, 8);
  light2.name = 'interior_glow_2';

  group.add(light1, light2);
  group.visible = false;
  return group;
}

/**
 * Updates the warm golden interior lights to sit inside the hovered floor elevation
 * (y = floor.floorY + (floor.maxY - floor.floorY) * 0.5) so windows glow from within.
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
  const midY = floor.floorY + (floor.maxY - floor.floorY) * 0.5;
  const l1 = highlightGroup.getObjectByName('interior_glow_1') as THREE.PointLight | null;
  const l2 = highlightGroup.getObjectByName('interior_glow_2') as THREE.PointLight | null;
  const offsetX = size.x * 0.16;
  const offsetZ = size.z * 0.16;

  if (l1) l1.position.set(center.x - offsetX, midY, center.z - offsetZ);
  if (l2) l2.position.set(center.x + offsetX, midY, center.z + offsetZ);

  highlightGroup.visible = true;
}

/**
 * Backward compatibility facade highlight band - returns an empty hidden mesh (zero yellow box slab).
 */
export function buildFacadeHighlightBand(_size: THREE.Vector3, _center: THREE.Vector3): THREE.Mesh {
  const mesh = new THREE.Mesh();
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
