import * as THREE from 'three';

export type VisualPolishMode = 'sweet-spot' | 'white-clay' | 'cyber-blueprint';
export type FunnelStage = 'exterior' | 'floorplan' | 'room-view' | 'room-walk';

export interface Waypoint {
  id: string; name: string; position: [number, number, number];
  targetLookAt?: [number, number, number]; roomRadius?: number; floorId?: string;
}

export interface FloorSlice {
  id: string; floorNumber: number; label: string; subtitle: string;
  minY: number; floorY: number; maxY: number; cutY: number; rooms: Waypoint[];
}

export interface SpatialPinItem {
  id: string; title: string; targetObject: string; prompt: string;
  position: [number, number, number]; priceDelta: number; status: 'approved' | 'pending';
  beforeLabel?: string; afterLabel?: string;
}

export interface StreetViewViewerProps {
  modelUrl?: string | null; visualMode: VisualPolishMode; navMode: 'walk' | 'drone';
  funnelStage: FunnelStage; onFunnelStageChange: (stage: FunnelStage) => void;
  floors: FloorSlice[]; onFloorsChange: (floors: FloorSlice[]) => void;
  activeFloorId: string | null; onSelectFloor: (id: string) => void;
  activeRoomId: string | null; onSelectRoom: (id: string) => void;
  pins: SpatialPinItem[]; selectedPinId: string | null;
  onSelectPin: (id: string) => void; onAddPin: (position: [number, number, number]) => void;
  waypoints: Waypoint[]; onWaypointsChange: (wps: Waypoint[]) => void;
  activeWaypointId: string | null; onSelectWaypoint: (id: string) => void;
  onCameraUpdate?: (pos: [number, number, number]) => void;
  onLoadingChange?: (loading: boolean, progress: number) => void;
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

    const activeMap = origMat.map || origMat.emissiveMap;
    if (activeMap) {
      activeMap.anisotropy = maxAnisotropy; activeMap.colorSpace = THREE.SRGBColorSpace;
      activeMap.minFilter = THREE.LinearMipmapLinearFilter; activeMap.generateMipmaps = true;
      activeMap.needsUpdate = true;
    }

    const hasVertexColors = Boolean(mesh.geometry?.getAttribute('color'));
    let wireChild = mesh.getObjectByName('__wireframe_child__') as THREE.Mesh | undefined;

    // Dispose old non-pristine runtime materials
    if (mesh.material && mesh.material !== pristine) {
      if (Array.isArray(mesh.material)) mesh.material.forEach((m) => m.dispose());
      else mesh.material.dispose();
    }

    // 3. Apply viewing mode using fresh material instances
    if (mode === 'sweet-spot') {
      if (wireChild) wireChild.visible = false;
      if (activeMap) {
        mesh.material = new THREE.MeshBasicMaterial({
          map: activeMap,
          color: origMat.color ? origMat.color.clone() : new THREE.Color(0xffffff),
          vertexColors: hasVertexColors, side: THREE.DoubleSide,
          transparent: Boolean(origMat.transparent), opacity: origMat.opacity ?? 1
        });
      } else if (hasVertexColors) {
        // MASt3R triangulated mesh vertex colors: MeshBasicMaterial for vivid photorealism
        mesh.material = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
      } else {
        mesh.material = new THREE.MeshStandardMaterial({
          color: origMat.color ? origMat.color.clone() : new THREE.Color(0xd4d4d8),
          emissive: origMat.emissive ? origMat.emissive.clone() : new THREE.Color(0x000000),
          roughness: origMat.roughness ?? 0.7, metalness: origMat.metalness ?? 0.1, side: THREE.DoubleSide
        });
      }
    } else if (mode === 'white-clay') {
      if (wireChild) wireChild.visible = false;
      mesh.material = new THREE.MeshStandardMaterial({ color: '#D6D3CD', roughness: 0.88, metalness: 0.05, side: THREE.DoubleSide });
    } else if (mode === 'cyber-blueprint') {
      mesh.material = new THREE.MeshStandardMaterial({
        color: '#0D131A', roughness: 0.8, metalness: 0.1, side: THREE.DoubleSide,
        polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1
      });
      if (!wireChild && mesh.geometry) {
        wireChild = new THREE.Mesh(mesh.geometry, new THREE.MeshBasicMaterial({ color: '#10B981', wireframe: true, transparent: true, opacity: 0.35 }));
        wireChild.name = '__wireframe_child__';
        mesh.add(wireChild);
      }
      if (wireChild) wireChild.visible = true;
    }
  });

  if (renderer) {
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = mode === 'white-clay' ? 1.15 : mode === 'cyber-blueprint' ? 1.0 : 1.05;
  }
}

/**
 * Geometric fallback waypoints inside model footprint.
 */
export function generateFloorWaypoints(model: THREE.Object3D): Waypoint[] {
  const b = new THREE.Box3().setFromObject(model), y = b.min.y;
  const cx = (b.min.x + b.max.x) / 2, cz = (b.min.z + b.max.z) / 2;
  const sx = Math.max((b.max.x - b.min.x) * 0.28, 1.8), sz = Math.max((b.max.z - b.min.z) * 0.28, 1.8);
  return [
    { id: 'wp-1', name: 'Room Center 01', position: [cx, y, cz] },
    { id: 'wp-2', name: 'Gallery Walk 02', position: [cx, y, cz + sz * 0.7] },
    { id: 'wp-3', name: 'North Alcove 03', position: [cx, y, cz - sz * 0.9] },
    { id: 'wp-4', name: 'South Salon 04', position: [cx, y, cz + sz * 0.9] },
    { id: 'wp-5', name: 'East Gallery 05', position: [cx + sx * 0.9, y, cz] },
    { id: 'wp-6', name: 'West Parlor 06', position: [cx - sx * 0.9, y, cz] }
  ];
}
