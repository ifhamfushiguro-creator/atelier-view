import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import {
  applyVisualPolish,
  type VisualPolishMode,
  type FunnelStage,
  type FloorSlice,
  type Waypoint,
  type SpatialPinItem,
  type StreetViewViewerProps
} from '../../lib/3d/simple-normalizer';
import { analyzeBuildingFloorsAndRooms } from '../../lib/3d/waypoint-analyzer';
import { buildSculpturePedestalScene, type SculpturePedestal } from '../../lib/3d/sculpture-pedestal';
import { calculateWalkStep, EYE_HEIGHT } from '../../lib/3d/walk-physics';
import {
  buildLivingCityScene,
  buildFloorStoryHighlight,
  updateFloorStoryHighlight,
  buildPinMeshGroup,
  type LivingCityScene
} from '../../lib/3d/funnel-overlays';

export { type SpatialPinItem, type StreetViewViewerProps, type FunnelStage, type FloorSlice };

function disposeMaterial(mat: THREE.Material | THREE.Material[] | undefined): void {
  if (!mat) return;
  const list = Array.isArray(mat) ? mat : [mat];
  for (const m of list) {
    if (!m) continue;
    for (const val of Object.values(m)) {
      if (val && typeof val === 'object' && 'isTexture' in val && (val as THREE.Texture).isTexture) {
        (val as THREE.Texture).dispose();
      }
    }
    m.dispose();
  }
}

function clearAndDisposeGroup(group: THREE.Group | null): void {
  if (!group) return;
  group.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    disposeMaterial(mesh.material);
    if (child.userData?.__pristineOriginalMaterial) {
      disposeMaterial(child.userData.__pristineOriginalMaterial);
      delete child.userData.__pristineOriginalMaterial;
    }
  });
  group.clear();
}

export default function StreetViewViewer({
  modelUrl, visualMode, funnelStage, onFunnelStageChange, floors, onFloorsChange,
  activeFloorId, onSelectFloor, activeRoomId, onSelectRoom, pins, selectedPinId,
  onSelectPin, onAddPin, waypoints, onWaypointsChange, onLoadingChange
}: StreetViewViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);

  const modelGroup = useRef(new THREE.Group());
  const pinsGroup = useRef(new THREE.Group());
  const livingCityRef = useRef<LivingCityScene | null>(null);
  const floorHighlightRef = useRef<THREE.Group | null>(null);
  const pedestalRef = useRef<SculpturePedestal | null>(null);
  const interactableMeshesRef = useRef<THREE.Mesh[]>([]);

  // Keep live references synced to prevent closure traps in requestAnimationFrame
  const modelUrlRef = useRef(modelUrl);
  modelUrlRef.current = modelUrl;
  const funnelStageRef = useRef(funnelStage);
  funnelStageRef.current = funnelStage;
  const activeFloorIdRef = useRef(activeFloorId);
  activeFloorIdRef.current = activeFloorId;
  const activeRoomIdRef = useRef(activeRoomId);
  activeRoomIdRef.current = activeRoomId;
  const floorsRef = useRef(floors);
  floorsRef.current = floors;
  const waypointsRef = useRef(waypoints);
  waypointsRef.current = waypoints;

  const modelBounds = useRef({
    center: new THREE.Vector3(),
    size: new THREE.Vector3(10, 3, 10),
    span: 10,
    height: 3
  });

  const yawRef = useRef(0);
  const pitchRef = useRef(0);
  const floorYRef = useRef(0);
  const targetYawRef = useRef<number | null>(null);
  const targetPitchRef = useRef<number | null>(null);
  const roomCamTargetRef = useRef<THREE.Vector3 | null>(null);
  const orbitAngle = useRef({ yaw: 0.85, pitch: 0.52, dist: 24 });

  const isDragging = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });
  const hasDragged = useRef(false);
  const normMouse = useRef({ x: 0, y: 0 });

  const [hoveredFloor, setHoveredFloor] = useState<FloorSlice | null>(null);
  const reticleCardRef = useRef<HTMLDivElement>(null);
  const roomTagRefs = useRef<{ [k: string]: HTMLButtonElement | null }>({});

  const topClipPlane = useRef(new THREE.Plane(new THREE.Vector3(0, -1, 0), 100)).current;
  const bottomClipPlane = useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), -100)).current;

  const keys = useRef<{ [k: string]: boolean }>({});
  const [loading, setLoading] = useState({ active: false, progress: 0 });
  const curFloor = floors.find((f) => f.id === activeFloorId) || floors[0];

  // 1. Initialize Scene, Lighting, Living City Diorama, and 60FPS Render Loop
  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0B1628);
    scene.fog = new THREE.FogExp2(0x0B1628, 0.016);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(46, w / h, 0.1, 1000);
    camera.position.set(0, 1.45, 3.4);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.localClippingEnabled = true;
    rendererRef.current = renderer;
    container.appendChild(renderer.domElement);

    // Architectural Lighting
    const dirLight = new THREE.DirectionalLight(0xFFF3DB, 1.45);
    dirLight.position.set(18, 28, 16);
    const uplight = new THREE.PointLight(0xFFDDA6, 2.2, 22);
    uplight.position.set(0, 0.2, 0);

    const pedScene = buildSculpturePedestalScene();
    pedestalRef.current = pedScene;

    const livingCity = buildLivingCityScene();
    livingCityRef.current = livingCity;
    livingCity.group.visible = false;

    const floorHighlight = buildFloorStoryHighlight(new THREE.Vector3(10, 3, 10), new THREE.Vector3());
    floorHighlightRef.current = floorHighlight;

    scene.add(
      new THREE.HemisphereLight(0xC4D7ED, 0x070E1A, 0.85),
      dirLight,
      uplight,
      livingCity.group,
      floorHighlight,
      pedScene.group,
      modelGroup.current,
      pinsGroup.current
    );

    const onResize = () => {
      if (!containerRef.current || !rendererRef.current || !cameraRef.current) return;
      cameraRef.current.aspect = containerRef.current.clientWidth / containerRef.current.clientHeight;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    };
    window.addEventListener('resize', onResize);

    let animId: number;
    const clock = new THREE.Clock();
    const collisionRay = new THREE.Raycaster();

    const animate = () => {
      animId = requestAnimationFrame(animate);
      const delta = Math.min(clock.getDelta(), 0.1);
      const elapsed = clock.getElapsedTime();
      const cam = cameraRef.current;
      if (!cam) return;

      const stage = funnelStageRef.current;

      if (!modelUrlRef.current && pedestalRef.current) {
        pedScene.cube.rotation.y += delta * 0.35;
        pedScene.cube.position.y = 0.92 + Math.sin(elapsed * 1.8) * 0.04;
        pedScene.dust.rotation.y += delta * 0.05;
        cam.position.x = THREE.MathUtils.lerp(cam.position.x, normMouse.current.x * 0.4, 0.05);
        cam.position.y = THREE.MathUtils.lerp(cam.position.y, 1.45 + normMouse.current.y * 0.25, 0.05);
        cam.position.z = THREE.MathUtils.lerp(cam.position.z, 3.4, 0.05);
        cam.lookAt(0, 0.88, 0);
      } else {
        const bounds = modelBounds.current;

        if (stage === 'exterior') {
          // Living city update: clouds drift, birds circle, cars drive
          if (livingCityRef.current) {
            livingCityRef.current.update(delta, elapsed);
          }

          if (!isDragging.current) orbitAngle.current.yaw += delta * 0.035;
          const { yaw, pitch, dist } = orbitAngle.current;
          const orbitCenter = new THREE.Vector3(0, bounds.height * 0.38, 0);
          const target = new THREE.Vector3(
            orbitCenter.x + Math.sin(yaw) * Math.cos(pitch) * dist,
            orbitCenter.y + Math.sin(pitch) * dist,
            orbitCenter.z + Math.cos(yaw) * Math.cos(pitch) * dist
          );
          cam.position.lerp(target, 0.08);
          cam.lookAt(orbitCenter.x, orbitCenter.y, orbitCenter.z);
        } else if (stage === 'floorplan') {
          const { yaw, pitch, dist } = orbitAngle.current;
          const curF = floorsRef.current.find((f) => f.id === activeFloorIdRef.current) || floorsRef.current[0];
          const orbitCenter = new THREE.Vector3(0, curF ? curF.floorY + 0.8 : 0, 0);
          const target = new THREE.Vector3(
            orbitCenter.x + Math.sin(yaw) * Math.cos(pitch) * dist,
            orbitCenter.y + Math.sin(pitch) * dist,
            orbitCenter.z + Math.cos(yaw) * Math.cos(pitch) * dist
          );
          cam.position.lerp(target, 0.08);
          cam.lookAt(orbitCenter.x, orbitCenter.y, orbitCenter.z);

          // Project Clean HTML Room Tags directly without triggering React re-renders
          if (containerRef.current) {
            const cw = containerRef.current.clientWidth, ch = containerRef.current.clientHeight;
            if (curF) {
              curF.rooms.forEach((r) => {
                const el = roomTagRefs.current[r.id];
                if (!el) return;
                const v = new THREE.Vector3(r.position[0], r.position[1] + 0.55, r.position[2]).project(cam);
                if (v.z < 1) {
                  const sx = ((v.x + 1) * 0.5) * cw, sy = ((-v.y + 1) * 0.5) * ch;
                  el.style.transform = `translate3d(${sx}px, ${sy}px, 0) translate(-50%, -50%)`;
                  el.style.display = 'flex';
                } else {
                  el.style.display = 'none';
                }
              });
            }
          }
        } else {
          // CRITICAL BUG 4 FIX: When in 'room-view' or 'room-walk', NEVER run spherical orbit math!
          if (stage === 'room-walk') {
            const moveSpeed = 3.6 * delta, yaw = yawRef.current;
            const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
            const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
            const move = new THREE.Vector3();
            const k = keys.current;
            if (k['KeyW'] || k['ArrowUp']) move.add(fwd);
            if (k['KeyS'] || k['ArrowDown']) move.sub(fwd);
            if (k['KeyD'] || k['ArrowRight']) move.add(right);
            if (k['KeyA'] || k['ArrowLeft']) move.sub(right);
            if (move.lengthSq() > 0) {
              roomCamTargetRef.current = null;
              targetYawRef.current = null;
              const curRoom = waypointsRef.current.find((w) => w.id === activeRoomIdRef.current);
              const step = calculateWalkStep(
                cam.position,
                move.normalize().multiplyScalar(moveSpeed),
                floorYRef.current,
                interactableMeshesRef.current,
                collisionRay,
                EYE_HEIGHT,
                {
                  center: curRoom ? curRoom.position : undefined,
                  radius: curRoom ? curRoom.roomRadius || 3.8 : 3.8,
                  lockFloorY: true
                }
              );
              cam.position.copy(step.nextPos);
              floorYRef.current = step.floorY;
            }
          }

          if (roomCamTargetRef.current) {
            cam.position.lerp(roomCamTargetRef.current, 0.08);
            if (cam.position.distanceTo(roomCamTargetRef.current) < 0.03) {
              roomCamTargetRef.current = null;
            }
          }

          if (targetYawRef.current !== null && targetPitchRef.current !== null) {
            const dyaw = Math.atan2(
              Math.sin(targetYawRef.current - yawRef.current),
              Math.cos(targetYawRef.current - yawRef.current)
            );
            yawRef.current += dyaw * 0.08;
            pitchRef.current = THREE.MathUtils.lerp(pitchRef.current, targetPitchRef.current, 0.08);
            if (Math.abs(dyaw) < 0.01 && Math.abs(pitchRef.current - targetPitchRef.current) < 0.01) {
              targetYawRef.current = null;
              targetPitchRef.current = null;
            }
          }

          const look = new THREE.Vector3(
            Math.cos(pitchRef.current) * -Math.sin(yawRef.current),
            Math.sin(pitchRef.current),
            Math.cos(pitchRef.current) * -Math.cos(yawRef.current)
          );
          cam.lookAt(cam.position.clone().add(look));
        }
      }

      renderer.render(scene, cam);
    };
    animate();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', onResize);
      clearAndDisposeGroup(modelGroup.current);
      clearAndDisposeGroup(pinsGroup.current);
      clearAndDisposeGroup(livingCityRef.current?.group || null);
      clearAndDisposeGroup(floorHighlightRef.current);
      clearAndDisposeGroup(pedestalRef.current?.group || null);
      renderer.dispose();
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
    };
  }, []);

  // 2. 4-Stage Architectural Funnel Transitions, Atmospheric Lighting, and Dollhouse Slicing
  useEffect(() => {
    const renderer = rendererRef.current, scene = sceneRef.current;
    if (!renderer || !scene || !modelUrl) return;
    const curF = floors.find((f) => f.id === activeFloorId) || floors[0];
    const span = modelBounds.current.span, bHeight = modelBounds.current.height;

    if (funnelStage === 'exterior') {
      scene.background = new THREE.Color(0x0B1628);
      scene.fog = new THREE.FogExp2(0x0B1628, 0.016);
      if (livingCityRef.current) livingCityRef.current.group.visible = true;
      if (floorHighlightRef.current) floorHighlightRef.current.visible = false;

      // Restore all meshes & remove clipping planes
      renderer.clippingPlanes = [];
      modelGroup.current.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.visible = true;
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          mats.forEach((m) => {
            if (m) { m.clippingPlanes = []; m.needsUpdate = true; }
          });
        }
      });

      orbitAngle.current = { yaw: 0.85, pitch: 0.52, dist: span * 2.1 };
    } else if (funnelStage === 'floorplan') {
      scene.background = new THREE.Color(0x080A0F);
      scene.fog = new THREE.FogExp2(0x080A0F, 0.032);
      if (livingCityRef.current) livingCityRef.current.group.visible = false;
      if (floorHighlightRef.current) floorHighlightRef.current.visible = false;

      // BUG 3 FIX: Slicing of Upper Floors & Roof into Dollhouse
      const storyH = curF ? curF.maxY - curF.floorY : bHeight;
      const cutWorldY = curF ? curF.floorY + storyH * 0.68 : bHeight * 0.68;

      topClipPlane.set(new THREE.Vector3(0, -1, 0), cutWorldY);
      bottomClipPlane.set(new THREE.Vector3(0, 1, 0), -(curF ? curF.floorY - 0.15 : -0.15));

      const planes = curF && curF.floorNumber > 1 ? [topClipPlane, bottomClipPlane] : [topClipPlane];
      renderer.clippingPlanes = planes;

      modelGroup.current.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          if (!child.geometry.boundingBox) child.geometry.computeBoundingBox();
          const meshBox = new THREE.Box3().setFromObject(child);
          // If the mesh is completely above cut height (roof or upper floor), hide it
          if (meshBox.min.y >= cutWorldY - 0.05) {
            child.visible = false;
          } else {
            child.visible = true;
          }
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          mats.forEach((m) => {
            if (m) {
              m.clippingPlanes = planes;
              m.clipShadows = true;
              m.needsUpdate = true;
            }
          });
        }
      });

      floorYRef.current = curF ? curF.floorY : 0;
      orbitAngle.current = { yaw: 0.78, pitch: 0.72, dist: span * 1.35 };
    } else {
      // 'room-view' or 'room-walk'
      scene.background = new THREE.Color(0x080A0F);
      scene.fog = new THREE.FogExp2(0x080A0F, 0.032);
      if (livingCityRef.current) livingCityRef.current.group.visible = false;
      if (floorHighlightRef.current) floorHighlightRef.current.visible = false;

      // Remove clipping planes & restore full ceiling/roof overhead
      renderer.clippingPlanes = [];
      modelGroup.current.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.visible = true;
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          mats.forEach((m) => {
            if (m) { m.clippingPlanes = []; m.needsUpdate = true; }
          });
        }
      });

      // BUG 4 FIX: Dive inside room and stay inside room
      const targetRoom = waypoints.find((w) => w.id === activeRoomId) || waypoints[0];
      if (targetRoom) {
        floorYRef.current = targetRoom.position[1];
        roomCamTargetRef.current = new THREE.Vector3(
          targetRoom.position[0],
          targetRoom.position[1] + EYE_HEIGHT,
          targetRoom.position[2]
        );
        if (targetRoom.targetLookAt) {
          const dx = targetRoom.targetLookAt[0] - targetRoom.position[0];
          const dz = targetRoom.targetLookAt[2] - targetRoom.position[2];
          targetYawRef.current = Math.atan2(-dx, -dz);
          targetPitchRef.current = 0;
        }
      }
    }
  }, [funnelStage, activeFloorId, activeRoomId, floors, waypoints, modelUrl]);

  // 3. Load & Auto-Center .GLB Model + Extract Floors & Rooms
  useEffect(() => {
    clearAndDisposeGroup(modelGroup.current);
    const grp = modelGroup.current;

    const isIdle = !modelUrl;
    if (pedestalRef.current) pedestalRef.current.group.visible = isIdle;
    if (livingCityRef.current) livingCityRef.current.group.visible = !isIdle && funnelStage === 'exterior';
    pinsGroup.current.visible = !isIdle;

    if (isIdle) {
      interactableMeshesRef.current = [];
      onWaypointsChange([]);
      onFloorsChange([]);
      if (cameraRef.current) cameraRef.current.position.set(0, 1.45, 3.4);
      return;
    }

    setLoading({ active: true, progress: 10 });
    onLoadingChange?.(true, 10);
    const loader = new GLTFLoader(), draco = new DRACOLoader();
    draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
    loader.setDRACOLoader(draco);

    loader.load(
      modelUrl,
      (gltf) => {
        const model = gltf.scene;
        if (modelUrl.includes('reconstructed_') || gltf.scene.userData?.isVideoReconstructed) {
          model.rotation.x = Math.PI;
          model.updateMatrixWorld(true);
        }
        const rawBox = new THREE.Box3().setFromObject(model);
        const rawSize = new THREE.Vector3();
        rawBox.getSize(rawSize);
        const span = Math.max(rawSize.x, rawSize.z);
        if (span < 4) model.scale.setScalar(14 / (span || 1));
        else if (span > 65) model.scale.setScalar(28 / span);

        const box = new THREE.Box3().setFromObject(model), center = new THREE.Vector3();
        box.getCenter(center);
        model.position.x -= center.x;
        model.position.z -= center.z;
        model.position.y -= box.min.y;
        model.updateMatrixWorld(true);

        const size = new THREE.Vector3();
        new THREE.Box3().setFromObject(model).getSize(size);
        const finalSpan = Math.max(size.x, size.z);
        modelBounds.current = {
          center: new THREE.Vector3(0, size.y / 2, 0),
          size,
          span: finalSpan,
          height: size.y
        };
        grp.add(model);
        grp.visible = true;
        floorYRef.current = 0;

        const interactables: THREE.Mesh[] = [];
        let pointsCount = 0;
        model.traverse((c) => {
          if (c instanceof THREE.Points) pointsCount++;
          if (c instanceof THREE.Mesh && c.visible && c.geometry) {
            if (!c.geometry.boundingBox) c.geometry.computeBoundingBox();
            interactables.push(c);
          }
        });
        if (pointsCount > 0 || interactables.length === 0) {
          const collider = new THREE.Mesh(
            new THREE.PlaneGeometry(finalSpan + 4, finalSpan + 4),
            new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide })
          );
          collider.rotation.x = -Math.PI / 2;
          collider.name = '__floor_collider__';
          collider.updateMatrixWorld(true);
          grp.add(collider);
          interactables.push(collider);
        }
        interactableMeshesRef.current = interactables;
        applyVisualPolish(model, rendererRef.current, visualMode);

        const analyzedFloors = analyzeBuildingFloorsAndRooms(model);
        onFloorsChange(analyzedFloors);
        onWaypointsChange(analyzedFloors.flatMap((f) => f.rooms));
        if (analyzedFloors[0]) {
          onSelectFloor(analyzedFloors[0].id);
          if (analyzedFloors[0].rooms[0]) onSelectRoom(analyzedFloors[0].rooms[0].id);
        }
        onFunnelStageChange('exterior');
        setLoading({ active: false, progress: 100 });
        onLoadingChange?.(false, 100);
      },
      (xhr) => {
        const pct = xhr.total ? Math.round((xhr.loaded / xhr.total) * 100) : 50;
        setLoading({ active: true, progress: pct });
        onLoadingChange?.(true, pct);
      },
      (err) => {
        console.error('Error loading .glb:', err);
        setLoading({ active: false, progress: 0 });
        onLoadingChange?.(false, 0);
      }
    );
    return () => { draco.dispose(); };
  }, [modelUrl]);

  // 4. Reactively Apply Visual Polish Switcher
  useEffect(() => {
    if (modelGroup.current.children.length > 0) {
      applyVisualPolish(modelGroup.current, rendererRef.current, visualMode);
    }
  }, [visualMode]);

  // 5. Update Specification Pins with Resource Disposal
  useEffect(() => {
    clearAndDisposeGroup(pinsGroup.current);
    pins.forEach((p) => pinsGroup.current.add(buildPinMeshGroup(p, p.id === selectedPinId)));
  }, [pins, selectedPinId]);

  // 6. Pointer Handling, Clamped Zoom, and Floor Hover Raycasting
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    isDragging.current = true;
    hasDragged.current = false;
    lastMouse.current = { x: e.clientX, y: e.clientY };
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      normMouse.current = {
        x: ((e.clientX - rect.left) / rect.width) * 2 - 1,
        y: -(((e.clientY - rect.top) / rect.height) * 2 - 1)
      };

      // Exterior Interactive Building Stacker Raycaster (Full-Floor Height Highlight)
      if (funnelStage === 'exterior' && cameraRef.current && modelGroup.current.children.length > 0 && floors.length > 0) {
        const m = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
        const ray = new THREE.Raycaster();
        ray.setFromCamera(m, cameraRef.current);
        const hits = ray.intersectObjects(modelGroup.current.children, true);
        const validHit = hits.find((h) => h.object.name !== '__living_city_context__' && h.object.name !== '__floor_collider__');

        if (validHit && !isDragging.current) {
          const hitY = validHit.point.y;
          const targetFloor = floors.find((f) => hitY >= f.minY && hitY <= f.maxY) || floors[floors.length - 1];
          setHoveredFloor(targetFloor);

          // BUG 2 FIX: Highlight the ENTIRE vertical story height of that floor
          updateFloorStoryHighlight(
            floorHighlightRef.current,
            targetFloor,
            modelBounds.current.size,
            modelBounds.current.center
          );

          if (reticleCardRef.current) {
            const centerY = targetFloor.floorY + (targetFloor.maxY - targetFloor.floorY) / 2;
            const projPoint = new THREE.Vector3(validHit.point.x, centerY, validHit.point.z);
            const proj = projPoint.project(cameraRef.current);
            const sx = ((proj.x + 1) * 0.5) * rect.width, sy = ((-proj.y + 1) * 0.5) * rect.height;
            reticleCardRef.current.style.transform = `translate3d(${sx}px, ${sy}px, 0) translate(-14px, -14px)`;
            reticleCardRef.current.style.display = 'flex';
          }
          return;
        } else if (!isDragging.current) {
          setHoveredFloor(null);
          if (floorHighlightRef.current) floorHighlightRef.current.visible = false;
          if (reticleCardRef.current) reticleCardRef.current.style.display = 'none';
        }
      }
    }

    if (!isDragging.current || !modelUrlRef.current) return;
    const dx = e.clientX - lastMouse.current.x, dy = e.clientY - lastMouse.current.y;
    if (Math.hypot(dx, dy) > 4) {
      hasDragged.current = true;
      targetYawRef.current = null;
      targetPitchRef.current = null;
      if (reticleCardRef.current) reticleCardRef.current.style.display = 'none';
    }
    lastMouse.current = { x: e.clientX, y: e.clientY };

    if (funnelStage === 'exterior') {
      orbitAngle.current.yaw -= dx * 0.005;
      orbitAngle.current.pitch = Math.max(0.22, Math.min(1.28, orbitAngle.current.pitch + dy * 0.005));
    } else if (funnelStage === 'floorplan') {
      orbitAngle.current.yaw -= dx * 0.006;
      orbitAngle.current.pitch = Math.max(0.35, Math.min(1.35, orbitAngle.current.pitch + dy * 0.005));
    } else {
      yawRef.current -= dx * 0.003;
      pitchRef.current = Math.max(-1.45, Math.min(1.45, pitchRef.current - dy * 0.003));
    }
  }, [funnelStage, floors]);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    isDragging.current = false;
    if (hasDragged.current || !containerRef.current || !cameraRef.current || !modelUrlRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const mouse = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, cameraRef.current);

    if (funnelStage === 'exterior') {
      const hits = raycaster.intersectObjects(modelGroup.current.children, true);
      const hit = hits.find((h) => h.object.name !== '__living_city_context__' && h.object.name !== '__floor_collider__');
      if (hit) {
        const f = floors.find((fl) => hit.point.y >= fl.minY && hit.point.y <= fl.maxY) || floors[floors.length - 1];
        if (f) {
          onSelectFloor(f.id);
          onFunnelStageChange('floorplan');
        }
      }
      return;
    }

    const pinHits = raycaster.intersectObjects(pinsGroup.current.children, true);
    let pinObj: THREE.Object3D | null = pinHits[0]?.object;
    while (pinObj && !pinObj.userData.pinId && pinObj.parent) pinObj = pinObj.parent;
    if (pinObj?.userData.pinId) return onSelectPin(pinObj.userData.pinId);
  }, [funnelStage, floors, onSelectFloor, onSelectPin, onFunnelStageChange]);

  const onWheel = useCallback((e: React.WheelEvent) => {
    if (funnelStage === 'exterior') {
      const span = modelBounds.current.span;
      orbitAngle.current.dist = THREE.MathUtils.clamp(
        orbitAngle.current.dist + e.deltaY * 0.018,
        span * 1.5,
        span * 3.2
      );
    }
  }, [funnelStage]);

  const onDoubleClick = useCallback((e: React.MouseEvent) => {
    if (!containerRef.current || !cameraRef.current || modelGroup.current.children.length === 0) return;
    const rect = containerRef.current.getBoundingClientRect();
    const mouse = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, cameraRef.current);
    const hits = raycaster.intersectObjects(modelGroup.current.children, true);
    if (hits.length > 0) onAddPin([hits[0].point.x, hits[0].point.y, hits[0].point.z]);
  }, [onAddPin]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => { keys.current[e.code] = true; };
    const up = (e: KeyboardEvent) => { keys.current[e.code] = false; };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full cursor-grab active:cursor-grabbing select-none overflow-hidden"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onWheel={onWheel}
      onDoubleClick={onDoubleClick}
    >
      {/* Minecraft-Style Centered Crosshair in Room Modes */}
      {Boolean(modelUrl) && (funnelStage === 'room-view' || funnelStage === 'room-walk') && (
        <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 flex items-center justify-center">
          <div className="w-[16px] h-[2px] bg-white/90 mix-blend-difference shadow-[0_0_2px_rgba(0,0,0,0.9)] absolute" />
          <div className="w-[2px] h-[16px] bg-white/90 mix-blend-difference shadow-[0_0_2px_rgba(0,0,0,0.9)] absolute" />
        </div>
      )}

      {/* Golden Reticle + Floating Spec Tooltip Card in Exterior Mode */}
      {funnelStage === 'exterior' && (
        <div
          ref={reticleCardRef}
          style={{ display: 'none', left: 0, top: 0, willChange: 'transform' }}
          className="pointer-events-auto absolute z-30 items-center transition-opacity duration-150 cursor-pointer"
          onClick={() => {
            if (hoveredFloor) {
              onSelectFloor(hoveredFloor.id);
              onFunnelStageChange('floorplan');
            }
          }}
        >
          {/* Golden Target Reticle */}
          <div className="relative flex items-center justify-center">
            <div className="w-7 h-7 rounded-full bg-[#E5C158]/90 border-2 border-white shadow-[0_0_24px_#E5C158] animate-pulse flex items-center justify-center">
              <div className="w-2 h-2 rounded-full bg-white" />
            </div>
            <div className="w-12 h-[1px] bg-white/60 ml-0.5" />
          </div>

          {/* Floating Dark Glass Floor Spec Card */}
          <div className="bg-[#0B0F17]/92 backdrop-blur-xl border border-white/15 px-5 py-3.5 shadow-2xl rounded-2xl flex items-center gap-5 text-left select-none hover:border-[#E5C158]/60 transition-colors">
            <div className="pr-4 border-r border-white/10 flex flex-col items-center justify-center">
              <span className="text-[9px] uppercase font-mono tracking-widest text-[#E5C158] block">FLOOR</span>
              <span className="text-3xl font-serif font-light text-white leading-none mt-0.5">
                {hoveredFloor ? String(hoveredFloor.floorNumber).padStart(2, '0') : '01'}
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium tracking-wide text-white">
                  {hoveredFloor ? (hoveredFloor.label.split('—')[1]?.trim() || hoveredFloor.label) : 'Residence'}
                </span>
                <span className="px-2 py-0.5 rounded-full text-[9px] font-mono tracking-wider text-[#E5C158] bg-[#E5C158]/10 border border-[#E5C158]/30 uppercase">
                  Available · Click to Explore
                </span>
              </div>
              <span className="text-xs text-zinc-400 font-mono">
                {hoveredFloor ? hoveredFloor.rooms.length : 4} Curated Rooms · 1,680 SQ FT
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Floating HTML Room Pills in Dollhouse Mode */}
      {funnelStage === 'floorplan' && curFloor?.rooms.map((r) => (
        <button
          key={r.id}
          ref={(el) => { roomTagRefs.current[r.id] = el; }}
          style={{ display: 'none', left: 0, top: 0, willChange: 'transform' }}
          onClick={() => {
            onSelectRoom(r.id);
            onFunnelStageChange('room-view');
          }}
          className="absolute pointer-events-auto px-3 py-1.5 rounded-full bg-[#0A0A0A]/90 backdrop-blur-md border border-white/20 hover:border-[#E5C158] text-[11px] font-mono text-white/95 hover:text-[#E5C158] shadow-2xl transition-transform hover:scale-105 cursor-pointer flex items-center gap-1.5 z-20 select-none group"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-[#E5C158] group-hover:scale-125 transition-transform" />
          <span>{r.name}</span>
        </button>
      ))}

      {loading.active && (
        <div className="absolute inset-0 bg-[#070605]/85 backdrop-blur-md flex flex-col items-center justify-center z-50 pointer-events-none">
          <div className="w-12 h-12 rounded-full border-2 border-amber-400/20 border-t-amber-400 animate-spin mb-4" />
          <span className="text-xs uppercase tracking-[0.2em] text-[#D4B483] font-mono">
            Spatial Room Study · {loading.progress}%
          </span>
        </div>
      )}
    </div>
  );
}
