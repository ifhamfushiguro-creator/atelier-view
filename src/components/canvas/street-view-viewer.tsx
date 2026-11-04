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
  const floorHitBoxesGroupRef = useRef<THREE.Group>(new THREE.Group());
  const ceilingPlaneRef = useRef<THREE.Mesh | null>(null);
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
  const orbitCenter = useRef(new THREE.Vector3(0, 1, 0));

  const isDragging = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });
  const startPointer = useRef({ x: 0, y: 0 });
  const hasDragged = useRef(false);
  const normMouse = useRef({ x: 0, y: 0 });

  const [hoveredFloor, setHoveredFloor] = useState<FloorSlice | null>(null);
  const hoveredFloorRef = useRef<FloorSlice | null>(null);
  hoveredFloorRef.current = hoveredFloor;

  const reticleCardRef = useRef<HTMLDivElement>(null);
  const roomTagRefs = useRef<{ [k: string]: HTMLButtonElement | null }>({});

  // Single model instance clipping planes
  const topClipPlane = useRef(new THREE.Plane(new THREE.Vector3(0, -1, 0), 100)).current;
  const bottomClipPlane = useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), -100)).current;
  const targetTopClipRef = useRef<number>(100);
  const targetBottomClipRef = useRef<number>(-100);

  // Smooth Room Dive Camera State
  const roomDiveRef = useRef<{
    active: boolean;
    startTime: number;
    duration: number;
    startCamPos: THREE.Vector3;
    targetCamPos: THREE.Vector3;
    targetYaw: number;
    targetPitch: number;
    floorPlankY: number;
    cutWorldY: number;
  }>({
    active: false,
    startTime: 0,
    duration: 1150,
    startCamPos: new THREE.Vector3(),
    targetCamPos: new THREE.Vector3(),
    targetYaw: 0,
    targetPitch: 0,
    floorPlankY: 0,
    cutWorldY: 100
  });

  const keys = useRef<{ [k: string]: boolean }>({});
  const [loading, setLoading] = useState({ active: false, progress: 0 });
  const curFloor = floors.find((f) => f.id === activeFloorId) || floors[0];

  // Helper: Trigger Smooth Floor Transition to 45° Dollhouse (No Model Cloning)
  const triggerFloorLiftTransition = useCallback((targetFloor: FloorSlice) => {
    onSelectFloor(targetFloor.id);
    if (targetFloor.rooms && targetFloor.rooms.length > 0) {
      onSelectRoom(targetFloor.rooms[0].id);
    }
    onFunnelStageChange('floorplan');

    const totalH = modelBounds.current.height || 3;
    const cutWorldY = targetFloor.cutY !== undefined ? targetFloor.cutY : (targetFloor.floorY + totalH * 0.24);
    const bottomCutY = targetFloor.bottomCutY !== undefined ? targetFloor.bottomCutY : (targetFloor.floorY - 0.25);

    targetTopClipRef.current = cutWorldY;
    targetBottomClipRef.current = -bottomCutY;

    // Adjust camera target to 45° Isometric Dollhouse Overview
    orbitAngle.current.pitch = Math.PI / 2 - 0.75; // ~0.82 rad (45° isometric angle)
    orbitAngle.current.dist = modelBounds.current.span * 1.15;
    orbitCenter.current.set(0, targetFloor.floorY + 0.35, 0);

    if (sceneRef.current) {
      sceneRef.current.background = new THREE.Color(0x060913);
      sceneRef.current.fog = new THREE.FogExp2(0x060913, 0.024);
    }
    if (livingCityRef.current) {
      livingCityRef.current.group.visible = false;
    }
    if (floorHighlightRef.current) {
      floorHighlightRef.current.visible = false;
    }
    if (reticleCardRef.current) {
      reticleCardRef.current.style.display = 'none';
    }
  }, [onSelectFloor, onSelectRoom, onFunnelStageChange]);

  // Helper: Trigger Smooth 1.1s Camera Dive into Room at Natural Human Eye Height
  const triggerRoomDive = useCallback((targetRoom: Waypoint) => {
    onSelectRoom(targetRoom.id);
    onFunnelStageChange('room-walk');

    const curF = floorsRef.current.find((f) => f.id === activeFloorIdRef.current) || floorsRef.current[0];
    const totalH = modelBounds.current.height || 3;
    const storyClearH = totalH * 0.27;
    const naturalEyeHeight = storyClearH * 0.44;
    const floorPlankY = curF ? curF.floorY : 0;
    const exactEyeY = floorPlankY + naturalEyeHeight;
    const cutWorldY = floorPlankY + storyClearH;

    const targetCamPos = new THREE.Vector3(targetRoom.position[0], exactEyeY, targetRoom.position[2]);

    let targetYaw = yawRef.current;
    if (targetRoom.targetLookAt) {
      const dx = targetRoom.targetLookAt[0] - targetRoom.position[0];
      const dz = targetRoom.targetLookAt[2] - targetRoom.position[2];
      targetYaw = Math.atan2(-dx, -dz);
    }

    roomCamTargetRef.current = null;
    targetYawRef.current = null;
    targetPitchRef.current = null;

    roomDiveRef.current = {
      active: true,
      startTime: performance.now(),
      duration: 1150,
      startCamPos: cameraRef.current ? cameraRef.current.position.clone() : targetCamPos.clone(),
      targetCamPos,
      targetYaw,
      targetPitch: 0,
      floorPlankY,
      cutWorldY
    };

    // Show soft architectural ceiling plane overhead
    if (ceilingPlaneRef.current && curF) {
      ceilingPlaneRef.current.position.set(0, curF.floorY + storyClearH, 0);
      ceilingPlaneRef.current.visible = true;
    }
  }, [onSelectRoom, onFunnelStageChange]);

  // 1. Initialize Scene, Lighting (3-Light Budget), Plinth Horizon & 60FPS Render Loop with Tab Visibility Pause
  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;

    const scene = new THREE.Scene();
    if (!modelUrlRef.current) {
      scene.background = null;
      scene.fog = null;
    } else {
      scene.background = new THREE.Color(0x235796);
      scene.fog = new THREE.FogExp2(0x235796, 0.0045);
    }
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(46, w / h, 0.15, 400);
    camera.position.set(0, 0.95, 2.85);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      logarithmicDepthBuffer: true,
      powerPreference: 'high-performance'
    });
    if (!modelUrlRef.current) {
      renderer.setClearColor(0x000000, 0);
    }
    renderer.setSize(w, h);
    // PDF Field Guide: setPixelRatio clamped to 1.5 for maximum GPU fillrate efficiency
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.localClippingEnabled = true;
    rendererRef.current = renderer;
    container.appendChild(renderer.domElement);

    // PDF Field Guide 3-Light Setup: Sun 2.0 (1024 shadow map), Sky 1.1, Cool Fill 0.5
    const sunLight = new THREE.DirectionalLight(0xffefd7, 2.0);
    sunLight.position.set(18, 28, 16);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 1024;
    sunLight.shadow.mapSize.height = 1024;
    sunLight.shadow.bias = -0.0001;
    sunLight.shadow.camera.near = 1;
    sunLight.shadow.camera.far = 80;

    const skyLight = new THREE.HemisphereLight(0xfff8eb, 0x2b303a, 1.1);

    const fillLight = new THREE.DirectionalLight(0x8ab4f8, 0.5);
    fillLight.position.set(-18, 14, -16);

    // Soft Matte Architectural Ceiling Plane for Interior Room View
    const ceilingPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(60, 60),
      new THREE.MeshStandardMaterial({
        color: 0xE8E6E1,
        roughness: 0.85,
        metalness: 0.05,
        side: THREE.DoubleSide
      })
    );
    ceilingPlane.rotation.x = Math.PI / 2;
    ceilingPlane.name = '__architectural_ceiling_plane__';
    ceilingPlane.visible = false;
    ceilingPlaneRef.current = ceilingPlane;

    const pedScene = buildSculpturePedestalScene();
    pedestalRef.current = pedScene;

    const livingCity = buildLivingCityScene();
    livingCityRef.current = livingCity;
    livingCity.group.visible = false;

    const floorHighlight = buildFloorStoryHighlight(new THREE.Vector3(10, 3, 10), new THREE.Vector3());
    floorHighlightRef.current = floorHighlight;

    floorHitBoxesGroupRef.current.name = '__floor_hit_boxes__';

    scene.add(
      skyLight,
      sunLight,
      fillLight,
      ceilingPlane,
      livingCity.group,
      floorHighlight,
      floorHitBoxesGroupRef.current,
      pedScene.group,
      modelGroup.current,
      pinsGroup.current
    );

    let resizeRaf = 0;
    const onResize = () => {
      cancelAnimationFrame(resizeRaf);
      resizeRaf = requestAnimationFrame(() => {
        if (!containerRef.current || !rendererRef.current || !cameraRef.current) return;
        cameraRef.current.aspect = containerRef.current.clientWidth / containerRef.current.clientHeight;
        cameraRef.current.updateProjectionMatrix();
        rendererRef.current.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
      });
    };
    window.addEventListener('resize', onResize);

    let animId: number;
    let isPaused = false;
    const clock = new THREE.Clock();
    const collisionRay = new THREE.Raycaster();

    const onVisibilityChange = () => {
      if (document.hidden) {
        isPaused = true;
      } else {
        isPaused = false;
        clock.getDelta();
        animId = requestAnimationFrame(animate);
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    const animate = () => {
      if (isPaused) return;
      animId = requestAnimationFrame(animate);
      const delta = Math.min(clock.getDelta(), 0.1);
      const elapsed = clock.getElapsedTime();
      const cam = cameraRef.current;
      if (!cam) return;

      const stage = funnelStageRef.current;

      if (!modelUrlRef.current && pedestalRef.current) {
        pedestalRef.current.update(delta, elapsed);
        cam.position.x = THREE.MathUtils.lerp(cam.position.x, normMouse.current.x * 0.25, 0.05);
        cam.position.y = THREE.MathUtils.lerp(cam.position.y, 0.95 + normMouse.current.y * 0.15, 0.05);
        cam.position.z = THREE.MathUtils.lerp(cam.position.z, 2.85, 0.05);
        cam.lookAt(0, 0.72, 0);
      } else {
        const bounds = modelBounds.current;

        // A. Room Dive Animation
        if (roomDiveRef.current.active) {
          const dive = roomDiveRef.current;
          const p = Math.min(1, (performance.now() - dive.startTime) / dive.duration);
          const easeP = 1 - Math.pow(1 - p, 3); // easeOutCubic

          cam.position.lerpVectors(dive.startCamPos, dive.targetCamPos, easeP);

          const dyaw = Math.atan2(Math.sin(dive.targetYaw - yawRef.current), Math.cos(dive.targetYaw - yawRef.current));
          yawRef.current += dyaw * 0.08;
          pitchRef.current = THREE.MathUtils.lerp(pitchRef.current, dive.targetPitch, 0.08);

          const look = new THREE.Vector3(
            Math.cos(pitchRef.current) * -Math.sin(yawRef.current),
            Math.sin(pitchRef.current),
            Math.cos(pitchRef.current) * -Math.cos(yawRef.current)
          );
          cam.lookAt(cam.position.clone().add(look));

          if (p >= 1) {
            dive.active = false;
            cam.position.copy(dive.targetCamPos);
            floorYRef.current = dive.floorPlankY;
          }

          renderer.render(scene, cam);
          return;
        }

        // B. Funnel Stages Handling
        if (stage === 'exterior') {
          if (livingCityRef.current) {
            livingCityRef.current.update(delta, elapsed);
          }

          if (!isDragging.current) {
            orbitAngle.current.yaw += delta * 0.035;
          }
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
          // Smooth auto-rotation in dollhouse mode when not dragging
          if (!isDragging.current) {
            orbitAngle.current.yaw += delta * 0.08;
          }

          // Smoothly damp clipping planes to target floor cut heights over ~0.8s
          topClipPlane.constant = THREE.MathUtils.damp(topClipPlane.constant, targetTopClipRef.current, 6, delta);
          bottomClipPlane.constant = THREE.MathUtils.damp(bottomClipPlane.constant, targetBottomClipRef.current, 6, delta);

          const { yaw, pitch, dist } = orbitAngle.current;
          const curF = floorsRef.current.find((f) => f.id === activeFloorIdRef.current) || floorsRef.current[0];
          orbitCenter.current.set(0, curF ? curF.floorY + 0.35 : 0, 0);
          const oc = orbitCenter.current;
          const target = new THREE.Vector3(
            oc.x + Math.sin(yaw) * Math.cos(pitch) * dist,
            oc.y + Math.sin(pitch) * dist,
            oc.z + Math.cos(yaw) * Math.cos(pitch) * dist
          );
          cam.position.lerp(target, 0.08);
          cam.lookAt(oc.x, oc.y, oc.z);

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
          // Inside Room Modes ('room-walk' or 'room-view'): Enable WASD / Arrow Walking
          const k = keys.current;
          const isWalkingKey = Boolean(
            k['KeyW'] || k['ArrowUp'] || k['KeyS'] || k['ArrowDown'] ||
            k['KeyD'] || k['ArrowRight'] || k['KeyA'] || k['ArrowLeft']
          );

          const curF = floorsRef.current.find((f) => f.id === activeFloorIdRef.current) || floorsRef.current[0];
          const totalH = modelBounds.current.height || 3;
          const storyClearH = totalH * 0.27;
          const dynamicEyeHeight = THREE.MathUtils.clamp(storyClearH * 0.44, 0.68, 1.25);

          if (isWalkingKey) {
            const moveSpeed = 3.6 * delta, yaw = yawRef.current;
            const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
            const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
            const move = new THREE.Vector3();
            if (k['KeyW'] || k['ArrowUp']) move.add(fwd);
            if (k['KeyS'] || k['ArrowDown']) move.sub(fwd);
            if (k['KeyD'] || k['ArrowRight']) move.add(right);
            if (k['KeyA'] || k['ArrowLeft']) move.sub(right);

            if (move.lengthSq() > 0) {
              roomCamTargetRef.current = null;
              targetYawRef.current = null;
              targetPitchRef.current = null;
              const curRoom = waypointsRef.current.find((w) => w.id === activeRoomIdRef.current);
              const camX = cam.position.x;
              const camZ = cam.position.z;
              const nearbyMeshes = interactableMeshesRef.current.filter((mesh) => {
                const box = mesh.userData.__worldBox as THREE.Box3 | undefined;
                if (!box) return true;
                const dx = Math.max(box.min.x - camX, 0, camX - box.max.x);
                const dz = Math.max(box.min.z - camZ, 0, camZ - box.max.z);
                return (dx * dx + dz * dz) <= 6.25;
              });

              const step = calculateWalkStep(
                cam.position,
                move.normalize().multiplyScalar(moveSpeed),
                floorYRef.current,
                nearbyMeshes.length > 0 ? nearbyMeshes : interactableMeshesRef.current,
                collisionRay,
                dynamicEyeHeight,
                {
                  center: curRoom ? curRoom.position : undefined,
                  radius: curRoom ? curRoom.roomRadius || 3.8 : 3.8,
                  lockFloorY: false,
                  storyClearHeight: storyClearH
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
      document.removeEventListener('visibilitychange', onVisibilityChange);
      cancelAnimationFrame(resizeRaf);
      window.removeEventListener('resize', onResize);
      clearAndDisposeGroup(floorHitBoxesGroupRef.current);
      clearAndDisposeGroup(modelGroup.current);
      clearAndDisposeGroup(pinsGroup.current);
      clearAndDisposeGroup(livingCityRef.current?.group || null);
      clearAndDisposeGroup(floorHighlightRef.current);
      clearAndDisposeGroup(pedestalRef.current?.group || null);
      if (ceilingPlaneRef.current) {
        ceilingPlaneRef.current.geometry.dispose();
        disposeMaterial(ceilingPlaneRef.current.material);
        ceilingPlaneRef.current = null;
      }
      renderer.dispose();
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
    };
  }, []);

  // 2. Funnel Stage Transitions & Dollhouse Slicing
  useEffect(() => {
    const renderer = rendererRef.current, scene = sceneRef.current;
    if (!renderer || !scene || !modelUrl) return;
    const curF = floors.find((f) => f.id === activeFloorId) || floors[0];
    const span = modelBounds.current.span, bHeight = modelBounds.current.height;
    const minY = modelBounds.current.center.y - bHeight / 2;

    if (funnelStage === 'exterior') {
      scene.background = new THREE.Color(0x235796);
      scene.fog = new THREE.FogExp2(0x235796, 0.0045);
      if (livingCityRef.current) livingCityRef.current.group.visible = true;
      if (floorHighlightRef.current) floorHighlightRef.current.visible = false;
      if (ceilingPlaneRef.current) ceilingPlaneRef.current.visible = false;

      // Restore all meshes & remove clipping planes in exterior mode
      renderer.clippingPlanes = [];
      modelGroup.current.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.visible = true;
          child.position.y = 0;
        }
      });

      orbitAngle.current = { yaw: 0.85, pitch: 0.52, dist: span * 2.1 };
    } else if (funnelStage === 'floorplan') {
      scene.background = new THREE.Color(0x060913);
      scene.fog = new THREE.FogExp2(0x060913, 0.024);
      if (livingCityRef.current) livingCityRef.current.group.visible = false;
      if (floorHighlightRef.current) floorHighlightRef.current.visible = false;
      if (ceilingPlaneRef.current) ceilingPlaneRef.current.visible = false;

      // Accurate Floor Slicing Heights:
      // Floor 01: cutY = minY + H * 0.24, bottomCutY = minY - 0.25
      // Floor 02: cutY = minY + H * 0.45, bottomCutY = minY + H * 0.28
      const cutWorldY = curF?.cutY !== undefined ? curF.cutY : (curF ? curF.floorY + (curF.maxY - curF.floorY) * 0.54 : bHeight * 0.54);
      const bottomCutY = curF?.bottomCutY !== undefined ? curF.bottomCutY : (curF ? curF.floorY - 0.25 : -0.25);

      targetTopClipRef.current = cutWorldY;
      targetBottomClipRef.current = -bottomCutY;

      // If initial switch, set constant directly
      topClipPlane.constant = cutWorldY;
      bottomClipPlane.constant = -bottomCutY;

      const planes = [topClipPlane, bottomClipPlane];
      renderer.clippingPlanes = planes;

      modelGroup.current.traverse((child) => {
        if (child instanceof THREE.Mesh && child.name !== '__floor_collider__') {
          if (!child.geometry.boundingBox) child.geometry.computeBoundingBox();
          const meshBox = new THREE.Box3().setFromObject(child);

          // Hide slanted pitched roof meshes and upper eave structures in floorplan mode
          const isPitchedRoof = meshBox.max.y > minY + bHeight * 0.62 && meshBox.min.y > minY + bHeight * 0.38;
          const isAboveCut = meshBox.min.y >= cutWorldY - 0.05;
          const isBelowCut = meshBox.max.y <= bottomCutY + 0.05;

          if (isPitchedRoof || isAboveCut || isBelowCut) {
            child.visible = false;
          } else {
            child.visible = true;
          }


        }
      });

      floorYRef.current = curF ? curF.floorY : 0;
      orbitAngle.current = { yaw: 0.78, pitch: Math.PI / 2 - 0.75, dist: span * 1.15 };
    } else {
      // 'room-view' or 'room-walk'
      scene.background = new THREE.Color(0x060913);
      scene.fog = new THREE.FogExp2(0x060913, 0.024);
      if (livingCityRef.current) livingCityRef.current.group.visible = false;
      if (floorHighlightRef.current) floorHighlightRef.current.visible = false;

      const storyClearH = bHeight * 0.27;
      const fBottom = curF?.bottomCutY !== undefined ? curF.bottomCutY : (curF ? curF.floorY - 0.25 : -0.25);
      const ceilingY = curF ? curF.floorY + storyClearH : storyClearH;

      // Soft architectural ceiling plane
      if (ceilingPlaneRef.current) {
        ceilingPlaneRef.current.position.set(0, ceilingY, 0);
        ceilingPlaneRef.current.visible = true;
      }

      // Keep bottomClipPlane active on this floor and topClipPlane at ceiling level
      topClipPlane.constant = ceilingY + 0.05;
      bottomClipPlane.constant = -fBottom;
      const planes = [topClipPlane, bottomClipPlane];
      renderer.clippingPlanes = planes;

      modelGroup.current.traverse((child) => {
        if (child instanceof THREE.Mesh && child.name !== '__floor_collider__') {
          if (!child.geometry.boundingBox) child.geometry.computeBoundingBox();
          const meshBox = new THREE.Box3().setFromObject(child);
          const isPitchedRoof = meshBox.max.y > minY + bHeight * 0.62 && meshBox.min.y > minY + bHeight * 0.38;
          const isAboveCeiling = meshBox.min.y >= ceilingY + 0.02;
          const isBelowCut = meshBox.max.y <= fBottom + 0.05;

          if (isPitchedRoof || isAboveCeiling || isBelowCut) {
            child.visible = false;
          } else {
            child.visible = true;
          }

        }
      });

      // Dive inside room at natural human eye level
      const targetRoom = waypoints.find((w) => w.id === activeRoomId) || waypoints[0];
      if (targetRoom && cameraRef.current) {
        const naturalEyeHeight = storyClearH * 0.44;
        if (cameraRef.current.position.y > ceilingY) {
          if (!roomDiveRef.current.active) {
            triggerRoomDive(targetRoom);
          }
        } else {
          floorYRef.current = curF ? curF.floorY : targetRoom.position[1];
          roomCamTargetRef.current = new THREE.Vector3(
            targetRoom.position[0],
            floorYRef.current + naturalEyeHeight,
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
    }
  }, [funnelStage, activeFloorId, activeRoomId, floors, waypoints, modelUrl, triggerRoomDive]);

  // 3. Load & Auto-Center .GLB Model + Extract Floors & Rooms + Fast Hit-Boxes
  useEffect(() => {
    clearAndDisposeGroup(modelGroup.current);
    clearAndDisposeGroup(floorHitBoxesGroupRef.current);
    const grp = modelGroup.current;

    const isIdle = !modelUrl;
    if (pedestalRef.current) pedestalRef.current.group.visible = isIdle;
    if (livingCityRef.current) livingCityRef.current.group.visible = !isIdle && funnelStage === 'exterior';
    pinsGroup.current.visible = !isIdle;

    if (isIdle) {
      if (sceneRef.current) {
        sceneRef.current.background = null;
        sceneRef.current.fog = null;
      }
      if (rendererRef.current) {
        rendererRef.current.setClearColor(0x000000, 0);
      }
      interactableMeshesRef.current = [];
      onWaypointsChange([]);
      onFloorsChange([]);
      if (cameraRef.current) cameraRef.current.position.set(0, 0.95, 2.85);
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
          // SACRED 3D INVARIANT 2: 180° X-Axis flip for computer-vision reconstructed meshes
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
            const vertCount = c.geometry.getAttribute('position')?.count || 0;
            if (vertCount > 2500) {
              c.castShadow = false;
              c.receiveShadow = false;
            } else {
              c.castShadow = true;
              c.receiveShadow = true;
            }
            c.userData.__worldBox = new THREE.Box3().setFromObject(c);
            interactables.push(c);
          }
        });

        // SACRED 3D INVARIANT 3: Invisible floor collider plane at Y = 0
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

        // SACRED 3D INVARIANT 1: Preserved vertexColors in applyVisualPolish
        applyVisualPolish(model, rendererRef.current, visualMode);

        const analyzedFloors = analyzeBuildingFloorsAndRooms(model);
        onFloorsChange(analyzedFloors);
        onWaypointsChange(analyzedFloors.flatMap((f) => f.rooms));
        if (analyzedFloors[0]) {
          onSelectFloor(analyzedFloors[0].id);
          if (analyzedFloors[0].rooms[0]) onSelectRoom(analyzedFloors[0].rooms[0].id);
        }

        // Build stacked non-overlapping hit-boxes for instant 0.005ms raycasting in exterior mode
        clearAndDisposeGroup(floorHitBoxesGroupRef.current);
        analyzedFloors.forEach((f) => {
          const fMinY = f.minY;
          const fMaxY = f.maxY;
          const boxH = Math.max(0.6, fMaxY - fMinY);
          const boxW = (size.x || 10) * 1.05;
          const boxD = (size.z || 10) * 1.05;
          const hitMesh = new THREE.Mesh(
            new THREE.BoxGeometry(boxW, boxH, boxD),
            new THREE.MeshBasicMaterial({ visible: false })
          );
          hitMesh.position.set(center.x, fMinY + boxH / 2, center.z);
          hitMesh.name = `__floor_hit_box_${f.floorNumber}__`;
          hitMesh.userData.floor = f;
          hitMesh.userData.floorId = f.id;
          floorHitBoxesGroupRef.current.add(hitMesh);
        });

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

  // 6. Fast Hit-Box Pointer Handling, Clamped Zoom, and Floor Hover Raycasting
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    isDragging.current = true;
    hasDragged.current = false;
    startPointer.current = { x: e.clientX, y: e.clientY };
    lastMouse.current = { x: e.clientX, y: e.clientY };
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      normMouse.current = {
        x: ((e.clientX - rect.left) / rect.width) * 2 - 1,
        y: -(((e.clientY - rect.top) / rect.height) * 2 - 1)
      };

      // Exterior Interactive Building Raycaster:
      if (funnelStage === 'exterior' && cameraRef.current && floors.length > 0) {
        const m = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
        const ray = new THREE.Raycaster();
        ray.setFromCamera(m, cameraRef.current);
        const targets = interactableMeshesRef.current.filter((m) => m.name !== '__floor_collider__');
        const candidateTargets = targets.length > 0 ? targets : floorHitBoxesGroupRef.current.children;
        const hits = ray.intersectObjects(candidateTargets, false);

        if (hits.length > 0 && !isDragging.current) {
          const hit = hits[0];
          let targetFloor: FloorSlice | null = null;
          if (floors.length === 2) {
            if (hit.point.y > floors[1].maxY) {
              // Hovering above roof eaves (red roof tiles) -> do not highlight as a floor
              targetFloor = null;
            } else if (hit.point.y >= floors[1].minY) {
              targetFloor = floors[1];
            } else {
              targetFloor = floors[0];
            }
          } else {
            targetFloor = floors.find((f) => hit.point.y >= f.minY && hit.point.y <= f.maxY)
              || (hit.object.userData.floor as FloorSlice)
              || null;
          }

          if (targetFloor) {
            setHoveredFloor(targetFloor);

            // Flush facade light ribbon highlight
            updateFloorStoryHighlight(
              floorHighlightRef.current,
              targetFloor,
              modelBounds.current.size,
              modelBounds.current.center
            );

            if (reticleCardRef.current) {
              const centerY = targetFloor.floorY + (targetFloor.maxY - targetFloor.floorY) / 2;
              const projPoint = new THREE.Vector3(hit.point.x, centerY, hit.point.z);
              const proj = projPoint.project(cameraRef.current);
              const sx = ((proj.x + 1) * 0.5) * rect.width, sy = ((-proj.y + 1) * 0.5) * rect.height;
              reticleCardRef.current.style.transform = `translate3d(${sx}px, ${sy}px, 0) translate(-14px, -14px)`;
              reticleCardRef.current.style.display = 'flex';
            }
            return;
          }
        } else if (!isDragging.current) {
          setHoveredFloor(null);
          if (floorHighlightRef.current) floorHighlightRef.current.visible = false;
          if (reticleCardRef.current) reticleCardRef.current.style.display = 'none';
        }
      }
    }

    if (!isDragging.current || !modelUrlRef.current) return;
    const totalDist = Math.hypot(e.clientX - startPointer.current.x, e.clientY - startPointer.current.y);
    if (totalDist > 8) {
      hasDragged.current = true;
      targetYawRef.current = null;
      targetPitchRef.current = null;
      if (reticleCardRef.current) reticleCardRef.current.style.display = 'none';
    }

    const dx = e.clientX - lastMouse.current.x, dy = e.clientY - lastMouse.current.y;
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
    const totalDist = Math.hypot(e.clientX - startPointer.current.x, e.clientY - startPointer.current.y);
    // Real click threshold: drag distance < 8px
    if (totalDist >= 8 || !containerRef.current || !cameraRef.current || !modelUrlRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const mouse = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, cameraRef.current);

    // FIX 1: Clicking Building in Exterior Mode Enters Floor & Smoothly Transitions (Instant Hit-Box Test)
    if (funnelStage === 'exterior') {
      const targets = interactableMeshesRef.current.filter((m) => m.name !== '__floor_collider__');
      const candidateTargets = targets.length > 0 ? targets : floorHitBoxesGroupRef.current.children;
      const hits = raycaster.intersectObjects(candidateTargets, false);
      let target: FloorSlice | null = null;
      if (hits.length > 0) {
        if (floors.length === 2) {
          if (hits[0].point.y <= floors[1].maxY) {
            target = hits[0].point.y >= floors[1].minY ? floors[1] : floors[0];
          }
        } else {
          target = floors.find((f) => hits[0].point.y >= f.minY && hits[0].point.y <= f.maxY)
            || (hits[0].object?.userData?.floor as FloorSlice);
        }
      }
      target = target || hoveredFloorRef.current || floors[0];
      if (target) {
        triggerFloorLiftTransition(target);
      }
      return;
    }

    // FIX 2 & 3: Clicking any room/floor in 3D Dollhouse dives smoothly inside that room!
    if (funnelStage === 'floorplan') {
      const hits = raycaster.intersectObjects(modelGroup.current.children, true);
      const hit = hits.find((h) => h.object.name !== '__living_city_context__' && h.object.name !== '__floor_collider__');
      if (hit && curFloor?.rooms && curFloor.rooms.length > 0) {
        let closest = curFloor.rooms[0];
        let minDist = Infinity;
        for (const r of curFloor.rooms) {
          const d = Math.hypot(r.position[0] - hit.point.x, r.position[2] - hit.point.z);
          if (d < minDist) {
            minDist = d;
            closest = r;
          }
        }
        triggerRoomDive(closest);
        return;
      }
    }

    // Specification Pin Selection
    const pinHits = raycaster.intersectObjects(pinsGroup.current.children, true);
    let pinObj: THREE.Object3D | null = pinHits[0]?.object;
    while (pinObj && !pinObj.userData.pinId && pinObj.parent) pinObj = pinObj.parent;
    if (pinObj?.userData.pinId) return onSelectPin(pinObj.userData.pinId);
  }, [funnelStage, floors, curFloor, onSelectPin, triggerFloorLiftTransition, triggerRoomDive]);

  const onWheel = useCallback((e: React.WheelEvent) => {
    if (funnelStage === 'exterior' || funnelStage === 'floorplan') {
      const span = modelBounds.current.span;
      orbitAngle.current.dist = THREE.MathUtils.clamp(
        orbitAngle.current.dist + e.deltaY * 0.018,
        span * 1.05,
        span * 3.5
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
    const down = (e: KeyboardEvent) => {
      // Ignore key events when typing inside inputs, textareas or modals
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      keys.current[e.code] = true;
    };
    const up = (e: KeyboardEvent) => {
      keys.current[e.code] = false;
    };
    const onBlur = () => {
      keys.current = {};
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', onBlur);
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
      {/* Centered Crosshair in Room Walk & View Modes */}
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
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            const target = hoveredFloorRef.current || floors[0];
            if (target) {
              triggerFloorLiftTransition(target);
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

          {/* Floating Dark Glass Floor Spec Card with Direct Explore & Walk Buttons */}
          <div className="bg-[#0B0F17]/95 backdrop-blur-xl border border-white/20 hover:border-[#E5C158]/80 px-5 py-3.5 shadow-2xl rounded-2xl flex items-center gap-5 text-left select-none transition-all">
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

      {/* Floating HTML Room Pins in Dollhouse Mode (Sleek Circular Dots Expanding on Hover) */}
      {funnelStage === 'floorplan' && curFloor?.rooms.map((r) => (
        <button
          key={r.id}
          ref={(el) => { roomTagRefs.current[r.id] = el; }}
          style={{ display: 'none', left: 0, top: 0, willChange: 'transform' }}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            triggerRoomDive(r);
          }}
          className="absolute pointer-events-auto group z-20 select-none cursor-pointer focus:outline-none"
        >
          <div className="flex items-center gap-2 bg-[#0A0A0A]/90 hover:bg-[#0A0A0A] backdrop-blur-md border border-white/20 hover:border-[#10B981] rounded-full p-1 group-hover:px-3.5 group-hover:py-1.5 shadow-2xl transition-all duration-200">
            <span className="w-5 h-5 rounded-full bg-[#10B981] border-2 border-white shadow-md flex items-center justify-center shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-white" />
            </span>
            <span className="hidden group-hover:inline-flex items-center gap-2 font-mono text-[11px] text-white whitespace-nowrap pr-1 animate-fade-in">
              <span className="font-semibold text-emerald-400">● {r.name.toUpperCase()}</span>
              <span className="text-[9px] text-[#E5C158] uppercase tracking-wider font-mono">DIVE →</span>
            </span>
          </div>
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
