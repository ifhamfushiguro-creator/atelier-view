import * as THREE from 'three';

export type VisualPolishMode = 'sweet-spot' | 'white-clay' | 'cyber-blueprint';
export type FunnelStage = 'exterior' | 'floorplan' | 'room-view' | 'room-walk';

export interface Waypoint {
  id: string;
  name: string;
  position: [number, number, number];
  targetLookAt?: [number, number, number];
  roomRadius?: number;
  floorId?: string;
}

export interface FloorSlice {
  id: string;
  floorNumber: number;
  label: string;
  subtitle: string;
  minY: number;
  floorY: number;
  maxY: number;
  cutY: number;
  bottomCutY?: number;
  rooms: Waypoint[];
}

export interface SpatialPinItem {
  id: string;
  title: string;
  targetObject: string;
  prompt: string;
  position: [number, number, number];
  priceDelta: number;
  status: 'approved' | 'pending';
  beforeLabel?: string;
  afterLabel?: string;
}

export interface StreetViewViewerProps {
  modelUrl?: string | null;
  visualMode: VisualPolishMode;
  navMode: 'walk' | 'drone';
  funnelStage: FunnelStage;
  onFunnelStageChange: (stage: FunnelStage) => void;
  floors: FloorSlice[];
  onFloorsChange: (floors: FloorSlice[]) => void;
  activeFloorId: string | null;
  onSelectFloor: (id: string) => void;
  activeRoomId: string | null;
  onSelectRoom: (id: string) => void;
  pins: SpatialPinItem[];
  selectedPinId: string | null;
  onSelectPin: (id: string) => void;
  onAddPin: (position: [number, number, number]) => void;
  waypoints: Waypoint[];
  onWaypointsChange: (wps: Waypoint[]) => void;
  activeWaypointId: string | null;
  onSelectWaypoint: (id: string) => void;
  onCameraUpdate?: (pos: [number, number, number]) => void;
  onLoadingChange?: (loading: boolean, progress: number) => void;
}

/**
 * Helper to safely dispose textures and immediately close any underlying ImageBitmap data (Utsubo Tip #38).
 */
export function disposeTexture(tex: THREE.Texture | undefined | null): void {
  if (!tex) return;
  const sourceData = (tex.source as { data?: unknown } | undefined)?.data;
  if (sourceData && typeof (sourceData as ImageBitmap).close === 'function') {
    (sourceData as ImageBitmap).close();
  }
  tex.dispose();
}

/**
 * Normalizes visual rendering across modes without destructive vertex manipulation.
 * Caches pristine original materials and renders photorealistic vertex colors & point clouds.
 */
export function applyVisualPolish(
  model: THREE.Object3D,
  renderer: THREE.WebGLRenderer | null,
  mode: VisualPolishMode
): void {
  const box = new THREE.Box3().setFromObject(model), floorY = box.min.y;
  const modelSpan = Math.max(box.max.x - box.min.x, box.max.z - box.min.z);
  const maxAnisotropy = renderer ? renderer.capabilities.getMaxAnisotropy() : 16;
  const sharedMaterials = new Map<string, THREE.Material>();

  function getSharedMaterial<T extends THREE.Material>(key: string, creator: () => T): T {
    let m = sharedMaterials.get(key) as T | undefined;
    if (!m) {
      m = creator();
      sharedMaterials.set(key, m);
    }
    return m;
  }

  model.traverse((child) => {
    if (child instanceof THREE.Points) {
      child.material = new THREE.PointsMaterial({ size: 0.04, vertexColors: true, sizeAttenuation: true });
      return;
    }
    if (!(child instanceof THREE.Mesh) || child.name === '__wireframe_child__') return;
    const mesh = child;

    // 1. Cull camera frustum cone artifacts (< 24 verts) and floating debris
    const vertCount = mesh.geometry?.getAttribute('position')?.count || 0;
    if (vertCount > 0 && vertCount < 24) { mesh.visible = false; return; }

    const meshBox = new THREE.Box3().setFromObject(mesh), size = new THREE.Vector3();
    meshBox.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);
    if (maxDim < 0.25 && meshBox.min.y > floorY + 0.9) { mesh.visible = false; return; }
    if (size.y < 0.05 && (size.x > modelSpan * 0.9 || size.z > modelSpan * 0.9)) { mesh.visible = false; return; }

    // Utsubo Tip #23 & #34: Strip unused vertex attributes and freeze mesh matrix
    if (mesh.geometry) {
      if (mesh.geometry.hasAttribute('tangent')) mesh.geometry.deleteAttribute('tangent');
      if (mesh.geometry.hasAttribute('uv1')) mesh.geometry.deleteAttribute('uv1');
      if (mesh.geometry.hasAttribute('uv2')) mesh.geometry.deleteAttribute('uv2');
    }
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();

    // 2. Cache pristine original material clone on first visit (never mutate in-place)
    if (!mesh.userData.__pristineOriginalMaterial) {
      mesh.userData.__pristineOriginalMaterial = Array.isArray(mesh.material)
        ? mesh.material.map((m) => m.clone())
        : mesh.material.clone();
    }

    const pristine = mesh.userData.__pristineOriginalMaterial;
    const origMat = (Array.isArray(pristine) ? pristine[0] : pristine) as THREE.Material & {
      map?: THREE.Texture | null; emissiveMap?: THREE.Texture | null; color?: THREE.Color;
      emissive?: THREE.Color; roughness?: number; metalness?: number; transparent?: boolean; opacity?: number;
    };

    // Enforce 16x anisotropic filtering and linear mipmaps across all textures
    for (const val of Object.values(origMat)) {
      if (val && typeof val === 'object' && 'isTexture' in val && (val as THREE.Texture).isTexture) {
        const tex = val as THREE.Texture;
        tex.anisotropy = maxAnisotropy;
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.generateMipmaps = true;
        tex.needsUpdate = true;
      }
    }

    const activeMap = origMat.map || origMat.emissiveMap;
    if (activeMap) {
      activeMap.anisotropy = maxAnisotropy;
      activeMap.colorSpace = THREE.SRGBColorSpace;
      activeMap.minFilter = THREE.LinearMipmapLinearFilter;
      activeMap.magFilter = THREE.LinearFilter;
      activeMap.generateMipmaps = true;
      activeMap.needsUpdate = true;
    }

    const hasVertexColors = Boolean(mesh.geometry?.getAttribute('color'));
    const oldWireChild = mesh.getObjectByName('__wireframe_child__');
    if (oldWireChild) {
      mesh.remove(oldWireChild);
    }

    // Dispose old non-pristine runtime materials if not shared
    if (mesh.material && mesh.material !== pristine && !Array.from(sharedMaterials.values()).includes(mesh.material)) {
      if (Array.isArray(mesh.material)) mesh.material.forEach((m) => m.dispose());
      else mesh.material.dispose();
    }

    // 3. Apply viewing mode using deduplicated shared material instances (Utsubo Tip #33)
    if (mode === 'sweet-spot') {
      if (activeMap) {
        mesh.material = new THREE.MeshBasicMaterial({
          map: activeMap,
          color: origMat.color ? origMat.color.clone() : new THREE.Color(0xffffff),
          vertexColors: hasVertexColors, side: THREE.DoubleSide,
          transparent: Boolean(origMat.transparent), opacity: origMat.opacity ?? 1,
          polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1
        });
      } else if (hasVertexColors) {
        // MASt3R triangulated mesh vertex colors: MeshBasicMaterial for vivid photorealism (SACRED INVARIANT 1)
        mesh.material = getSharedMaterial('sweet_vertex_colors', () => new THREE.MeshBasicMaterial({
          vertexColors: true, side: THREE.DoubleSide,
          polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1
        }));
      } else {
        const colHex = origMat.color ? origMat.color.getHexString() : 'd4d4d8';
        const emHex = origMat.emissive ? origMat.emissive.getHexString() : '000000';
        const r = origMat.roughness ?? 0.65;
        const m = origMat.metalness ?? 0.1;
        const key = `std_${colHex}_${emHex}_${r}_${m}`;

        mesh.material = getSharedMaterial(key, () => new THREE.MeshStandardMaterial({
          color: origMat.color ? origMat.color.clone() : new THREE.Color(0xd4d4d8),
          emissive: origMat.emissive ? origMat.emissive.clone() : new THREE.Color(0x000000),
          roughness: r,
          metalness: m,
          envMapIntensity: 0.28,
          side: THREE.DoubleSide,
          polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1
        }));
      }
    } else if (mode === 'white-clay') {
      mesh.material = getSharedMaterial('white_clay', () => new THREE.MeshStandardMaterial({
        color: '#D6D3CD', roughness: 0.88, metalness: 0.05, envMapIntensity: 0.28, side: THREE.DoubleSide,
        polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1
      }));
    } else if (mode === 'cyber-blueprint') {
      // Direct obsidian wireframe material on mesh without duplicate child meshes
      mesh.material = getSharedMaterial('cyber_blueprint', () => new THREE.MeshBasicMaterial({
        color: '#10B981',
        wireframe: true,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1
      }));
    }
  });

  if (renderer) {
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = mode === 'white-clay' ? 1.15 : mode === 'cyber-blueprint' ? 1.0 : 0.86;
  }
}
