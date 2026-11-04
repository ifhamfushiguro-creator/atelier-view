import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import {
  Upload,
  Sparkles,
  CheckCircle2,
  Clock,
  X,
  FileCheck2,
  Layers,
  Terminal,
  Footprints,
  FolderOpen,
  Download,
  ChevronRight,
  ChevronLeft,
  Eye,
  Maximize2,
  ShieldCheck,
  KeyRound
} from 'lucide-react';
import {
  ClientPinGate,
  PinSetupModal,
  DesignerPinSettingsModal
} from '../components/security';
import StreetViewViewer, {
  type SpatialPinItem,
  type FunnelStage,
  type FloorSlice
} from '../components/canvas/street-view-viewer';
import type { VisualPolishMode, Waypoint } from '../lib/3d/simple-normalizer';

export default function SpatialWorkspacePage() {
  const [modelUrl, setModelUrl] = useState<string>('');
  const [modelFileName, setModelFileName] = useState<string>('');
  const [visualMode, setVisualMode] = useState<VisualPolishMode>('sweet-spot');
  const [funnelStage, setFunnelStage] = useState<FunnelStage>('exterior');

  const [floors, setFloors] = useState<FloorSlice[]>([]);
  const [activeFloorId, setActiveFloorId] = useState<string | null>(null);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);

  const [pins, setPins] = useState<SpatialPinItem[]>([]);
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null);
  const [waypoints, setWaypoints] = useState<Waypoint[]>([]);

  const [isSignOffOpen, setIsSignOffOpen] = useState<boolean>(false);
  const [isPinSetupOpen, setIsPinSetupOpen] = useState<boolean>(false);
  const [isDesignerSettingsOpen, setIsDesignerSettingsOpen] = useState<boolean>(false);
  const [isDraggingFile, setIsDraggingFile] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeBlobUrlRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (activeBlobUrlRef.current && activeBlobUrlRef.current.startsWith('blob:')) {
        URL.revokeObjectURL(activeBlobUrlRef.current);
        activeBlobUrlRef.current = null;
      }
    };
  }, []);

  const BASE_BUDGET = 120000;
  const approvedUpgrades = useMemo(() => {
    return pins
      .filter((p) => p.status === 'approved')
      .reduce((sum, p) => sum + p.priceDelta, 0);
  }, [pins]);
  const totalBudget = BASE_BUDGET + approvedUpgrades;

  const selectedPin = useMemo(() => {
    return pins.find((p) => p.id === selectedPinId) || null;
  }, [pins, selectedPinId]);

  const isModelLoaded = Boolean(modelUrl);

  const currentFloor = useMemo(() => {
    return floors.find((f) => f.id === activeFloorId) || floors[0] || null;
  }, [floors, activeFloorId]);

  const floorRooms = useMemo(() => {
    return currentFloor?.rooms || waypoints;
  }, [currentFloor, waypoints]);

  const currentRoomIndex = useMemo(() => {
    const idx = floorRooms.findIndex((r) => r.id === activeRoomId);
    return idx >= 0 ? idx : 0;
  }, [floorRooms, activeRoomId]);

  const currentRoom = useMemo(() => {
    return floorRooms[currentRoomIndex] || null;
  }, [floorRooms, currentRoomIndex]);

  const handlePrevRoom = () => {
    if (floorRooms.length === 0) return;
    const prevIdx = (currentRoomIndex - 1 + floorRooms.length) % floorRooms.length;
    setActiveRoomId(floorRooms[prevIdx].id);
  };

  const handleNextRoom = () => {
    if (floorRooms.length === 0) return;
    const nextIdx = (currentRoomIndex + 1) % floorRooms.length;
    setActiveRoomId(floorRooms[nextIdx].id);
  };

  const loadFileFromBlob = (url: string, fileName: string) => {
    if (activeBlobUrlRef.current && activeBlobUrlRef.current.startsWith('blob:') && activeBlobUrlRef.current !== url) {
      URL.revokeObjectURL(activeBlobUrlRef.current);
      activeBlobUrlRef.current = null;
    }
    if (url.startsWith('blob:')) {
      activeBlobUrlRef.current = url;
    }
    setModelUrl(url);
    setModelFileName(fileName);
    setSelectedPinId(null);
  };

  const loadFile = (file: File) => {
    const objectUrl = URL.createObjectURL(file);
    loadFileFromBlob(objectUrl, file.name);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) loadFile(file);
  };

  const handleCloseModel = () => {
    if (modelUrl.startsWith('blob:')) {
      const oldUrl = modelUrl;
      setTimeout(() => URL.revokeObjectURL(oldUrl), 1000);
    }
    setModelUrl('');
    setModelFileName('');
    setFloors([]);
    setActiveFloorId(null);
    setActiveRoomId(null);
    setWaypoints([]);
    setPins([]);
    setSelectedPinId(null);
    setFunnelStage('exterior');
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingFile(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingFile(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingFile(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    const name = file.name.toLowerCase();
    if (name.endsWith('.glb') || name.endsWith('.gltf')) loadFile(file);
  };

  const handleAddPin = useCallback((position: [number, number, number]) => {
    const newId = `pin-${Date.now().toString(36)}`;
    const newPin: SpatialPinItem = {
      id: newId,
      title: 'Custom Spatial Specification',
      targetObject: 'Interior Architectural Surface',
      prompt: 'Bespoke architectural fixture and luxury finish specification',
      position,
      priceDelta: 3800,
      status: 'pending',
      beforeLabel: 'Standard Builder Specification ($0)',
      afterLabel: 'Artisan Custom Finish (+$3,800)'
    };
    setPins((prev) => [...prev, newPin]);
    setSelectedPinId(newId);
  }, []);

  const togglePinApproval = (id: string, status: 'approved' | 'pending') => {
    setPins((prev) => prev.map((p) => (p.id === id ? { ...p, status } : p)));
  };

  const handleDownloadSchedule = () => {
    const approvedList = pins
      .filter((p) => p.status === 'approved')
      .map((p) => `  * ${p.title} (${p.targetObject}): +$${p.priceDelta.toLocaleString()}.00`)
      .join('\n');
    const scheduleText = [
      'ATELIER VIEW · 4-STAGE ARCHITECTURAL SPECIFICATION SCHEDULE',
      `Date Generated: ${new Date().toLocaleString()}`,
      `Client: Elena Vance`,
      '----------------------------------------------------------',
      `Base Construction & Fit-Out: $${BASE_BUDGET.toLocaleString()}.00`,
      `Approved Upgrades Total:     +$${approvedUpgrades.toLocaleString()}.00`,
      `Authorized Contract Total:   $${totalBudget.toLocaleString()}.00`,
      '----------------------------------------------------------',
      'Approved Specification Items:',
      approvedList || '  (No upgrade items selected)',
      '----------------------------------------------------------',
      'Status: Legally Binding Digital Approval Recorded'
    ].join('\n');

    const blob = new Blob([scheduleText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Atelier-View-Schedule-${Date.now()}.txt`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setIsSignOffOpen(false);
  };

  return (
    <ClientPinGate
      onModelUnlocked={(unlockedUrl, title) => {
        loadFileFromBlob(unlockedUrl, title || 'unlocked_space.glb');
        if (title) setModelFileName(title);
      }}
      onUnlock={(unlockedUrl, title) => {
        loadFileFromBlob(unlockedUrl, title || 'unlocked_space.glb');
      }}
    >
      <div
        className="relative w-screen h-screen overflow-hidden text-stone-100 font-sans select-none"
        style={{
          background: '#0A0A0A'
        }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
      <input ref={fileInputRef} type="file" accept=".glb,.gltf" onChange={handleFileChange} className="hidden" />

      {/* 3D WebGL Canvas */}
      <div className="absolute inset-0 z-0">
        <StreetViewViewer
          modelUrl={modelUrl}
          visualMode={visualMode}
          navMode="walk"
          funnelStage={funnelStage}
          onFunnelStageChange={setFunnelStage}
          floors={floors}
          onFloorsChange={setFloors}
          activeFloorId={activeFloorId}
          onSelectFloor={(id) => {
            setActiveFloorId(id);
            const fl = floors.find((f) => f.id === id);
            if (fl && fl.rooms.length > 0) setActiveRoomId(fl.rooms[0].id);
          }}
          activeRoomId={activeRoomId}
          onSelectRoom={setActiveRoomId}
          pins={pins}
          selectedPinId={selectedPinId}
          onSelectPin={setSelectedPinId}
          onAddPin={handleAddPin}
          waypoints={waypoints}
          onWaypointsChange={setWaypoints}
          activeWaypointId={activeRoomId}
          onSelectWaypoint={setActiveRoomId}
        />
      </div>

      {/* Full-Window Dragging Feedback Overlay */}
      {isDraggingFile && (
        <div className="absolute inset-0 pointer-events-none z-50 bg-[#070605]/80 backdrop-blur-md border-2 border-[#D4B483] shadow-[0_0_60px_rgba(212,180,131,0.25)_inset] m-6 rounded-3xl flex flex-col items-center justify-center gap-3">
          <Upload className="w-12 h-12 text-[#D4B483] animate-bounce" />
          <span className="text-sm font-light uppercase tracking-[0.25em] text-[#F5EFE6] font-mono">
            Release .GLB to Load Space
          </span>
        </div>
      )}

      {/* LANDING STATE (!modelUrl) */}
      {!isModelLoaded ? (
        <div className="absolute inset-0 pointer-events-none z-10 flex flex-col justify-between p-8">
          <header className="w-full flex items-center justify-between pointer-events-auto">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-[#D4B483] animate-pulse" />
              <span className="tracking-[0.28em] uppercase text-xs font-medium text-stone-200">
                ATELIER VIEW
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsDesignerSettingsOpen(true)}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border border-[#D4B483]/30 bg-[#14120e]/80 hover:bg-[#1a1712] hover:border-[#D4B483]/60 backdrop-blur-md text-[11px] font-mono tracking-wider text-[#D4B483] transition-all cursor-pointer shadow-[0_0_15px_rgba(212,180,131,0.12)]"
                title="View all saved models, access codes, and links"
              >
                <KeyRound className="w-3.5 h-3.5 text-[#E5C158]" />
                My Models &amp; PINs
              </button>
              <div className="px-3.5 py-1 rounded-full border border-white/10 bg-white/[0.03] backdrop-blur-md text-[10px] font-mono uppercase tracking-[0.2em] text-[#D4B483]/80">
                4-STAGE ARCHITECTURAL PORTAL
              </div>
            </div>
          </header>

          {/* Title Header Block positioned in upper 11–14% of viewport so it never collides with 3D sculpture cube */}
          <div className="absolute top-[12%] left-0 right-0 flex flex-col items-center justify-center text-center pointer-events-none px-4">
            <span className="text-[10px] font-mono uppercase tracking-[0.35em] text-amber-400/70 block mb-2">
              PRIVATE SPATIAL VIEWING ROOM
            </span>
            <h1 className="text-2xl md:text-3xl font-light tracking-[0.26em] uppercase text-[#F5EFE6] drop-shadow-[0_4px_24px_rgba(0,0,0,0.9)]">
              3D PLAYGROUND READY
            </h1>
            <p className="text-xs tracking-[0.20em] uppercase text-[#D4B483]/80 mt-2.5 font-mono drop-shadow-md">
              DROP A .GLB MODEL HERE TO BEGIN
            </p>
          </div>

          <div className="w-full flex flex-col items-center gap-3 pb-2 pointer-events-auto mt-auto">
            <div className="bg-[#110F0D]/80 backdrop-blur-xl border border-[#D4B483]/25 hover:border-[#D4B483]/60 rounded-full px-6 py-3 shadow-[0_20px_50px_rgba(0,0,0,0.85)] flex items-center gap-4 transition-all">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 text-xs font-medium tracking-[0.16em] uppercase text-[#F5EFE6] hover:text-[#D4B483] transition-colors cursor-pointer"
              >
                <FolderOpen className="w-4 h-4 text-[#D4B483]" />
                Select .GLB Model
              </button>
            </div>
            <span className="text-[10px] font-mono tracking-widest text-[#D4B483]/60 uppercase">
              Drag &amp; drop any .glb model anywhere on canvas
            </span>
          </div>
        </div>
      ) : (
        /* MODEL LOADED STATE: 4-STAGE ARCHITECTURAL FUNNEL */
        <>
          {/* 1. Minimal Luxury Header (The Solenne — Brickell Bay) */}
          <header className="absolute top-6 left-8 right-8 z-20 flex items-center justify-between pointer-events-none">
            {/* Left: Square Monogram [A] + Studio Title */}
            <div className="pointer-events-auto flex items-center gap-3">
              <div className="w-6 h-6 border border-[#D4B483]/60 bg-black/60 rounded flex items-center justify-center text-[11px] font-serif font-bold text-[#D4B483]">
                A
              </div>
              <span className="tracking-[0.22em] text-xs uppercase text-white/90 font-medium font-sans">
                ATELIER VIEW <span className="text-white/35 mx-1.5">|</span> PRIVATE DIGITAL SHOWROOM
              </span>
            </div>

            {/* Right: Minimal Action Pills */}
            <div className="pointer-events-auto flex items-center gap-2">
              {funnelStage === 'floorplan' && (
                <button
                  onClick={() => setFunnelStage('exterior')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-xs text-white transition-all font-mono cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5 text-[#D4B483]" />
                  Back to Building
                </button>
              )}
              {(funnelStage === 'room-view' || funnelStage === 'room-walk') && (
                <button
                  onClick={() => setFunnelStage('floorplan')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-xs text-white transition-all font-mono cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5 text-[#D4B483]" />
                  Back to Floorplan
                </button>
              )}
              <button
                onClick={() => setIsPinSetupOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#14120e]/95 backdrop-blur-xl border border-[#D4B483]/50 hover:border-[#D4B483] text-xs text-[#D4B483] hover:text-[#E5C158] transition-all font-mono cursor-pointer shadow-[0_0_20px_rgba(212,180,131,0.18)]"
                title="Protect this 3D model with a PIN and create client share link"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-[#E5C158]" />
                Share &amp; Set PIN
              </button>
              <button
                onClick={() => setIsDesignerSettingsOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#0a0a0a]/90 backdrop-blur-xl border border-white/10 hover:border-[#D4B483]/40 text-xs text-zinc-300 hover:text-white transition-all font-mono cursor-pointer"
                title="View all saved models, access codes, and links"
              >
                <KeyRound className="w-3.5 h-3.5 text-[#D4B483]" />
                My Models &amp; PINs
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#0a0a0a]/90 backdrop-blur-xl border border-white/10 hover:border-white/25 text-xs text-zinc-300 hover:text-white transition-all font-mono cursor-pointer"
              >
                <FolderOpen className="w-3.5 h-3.5 text-[#D4B483]" />
                Change .GLB
              </button>
              <button
                onClick={handleCloseModel}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#0a0a0a]/90 backdrop-blur-xl border border-white/10 hover:border-red-500/40 text-xs text-zinc-300 hover:text-red-300 transition-all font-mono cursor-pointer"
              >
                <X className="w-3.5 h-3.5 text-zinc-400" />
                Close Model
              </button>
            </div>
          </header>

          {/* Bottom-Left Status Prompt in Exterior Mode */}
          {funnelStage === 'exterior' && (
            <div className="pointer-events-none absolute bottom-8 left-8 z-20 flex items-center gap-2.5">
              <span className="w-2 h-2 rounded-full bg-[#E5C158] animate-ping" />
              <span className="text-[11px] tracking-[0.18em] uppercase text-white/80 font-mono">
                ● HOVER A FLOOR TO EXPLORE
              </span>
            </div>
          )}

          {/* 2. Right-Side Editorial Spec & Room Index Sheet (Stage 2 Floorplan Only) */}
          {funnelStage === 'floorplan' && (
            <aside className="absolute top-20 right-6 bottom-24 w-[340px] z-20 bg-[#0c0c0c]/90 backdrop-blur-2xl border border-white/10 rounded-2xl p-6 shadow-2xl flex flex-col justify-between overflow-y-auto animate-fade-in">
              <div className="flex flex-col gap-5">
                {/* Header */}
                <div className="border-b border-white/10 pb-4">
                  <span className="text-[10px] uppercase font-mono tracking-[0.25em] text-[#D4B483] block mb-1">
                    Architectural Monograph
                  </span>
                  <h2 className="text-xl font-serif tracking-tight text-white font-medium">
                    {currentFloor?.label || 'Residence Portfolio'}
                  </h2>
                  <p className="text-xs text-zinc-400 mt-0.5 font-mono">
                    {currentFloor?.subtitle || `${floorRooms.length} Curated Spatial Volumes`}
                  </p>
                </div>

                {/* Multi-Floor Selector Pills */}
                {floors.length > 1 && (
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[9px] uppercase font-mono tracking-widest text-zinc-500">
                      Select Story / Elevation
                    </span>
                    <div className="grid grid-cols-2 gap-1.5">
                      {floors.map((fl) => (
                        <button
                          key={fl.id}
                          onClick={() => {
                            setActiveFloorId(fl.id);
                            if (fl.rooms.length > 0) setActiveRoomId(fl.rooms[0].id);
                          }}
                          className={`py-2 px-3 rounded-xl text-left text-xs font-mono transition-all cursor-pointer ${
                            fl.id === activeFloorId
                              ? 'bg-[#D4B483]/20 border border-[#D4B483] text-[#D4B483] font-semibold'
                              : 'bg-white/5 border border-white/5 text-zinc-400 hover:text-white hover:bg-white/10'
                          }`}
                        >
                          <span className="block text-[10px] text-zinc-500">LEVEL 0{fl.floorNumber}</span>
                          <span className="truncate block">{fl.label.split('—')[1]?.trim() || fl.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Room Index List */}
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] uppercase font-mono tracking-widest text-zinc-500">
                      Curated Spatial Index
                    </span>
                    <span className="text-[10px] font-mono text-emerald-400">
                      Click to Dive →
                    </span>
                  </div>

                  <div className="flex flex-col gap-1.5 max-h-[300px] overflow-y-auto pr-1">
                    {floorRooms.map((room) => {
                      const isSel = room.id === activeRoomId;
                      return (
                        <button
                          key={room.id}
                          onClick={() => {
                            setActiveRoomId(room.id);
                            setFunnelStage('room-walk');
                          }}
                          className={`flex items-center justify-between p-3 rounded-xl border text-left transition-all cursor-pointer group ${
                            isSel
                              ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200'
                              : 'bg-white/5 border-white/5 text-zinc-300 hover:bg-white/10 hover:border-white/15 hover:text-white'
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <span className="w-5 h-5 rounded-full bg-[#10B981] border-2 border-white/90 shadow-sm flex items-center justify-center shrink-0">
                              <span className="w-1.5 h-1.5 rounded-full bg-white" />
                            </span>
                            <span className="text-xs font-medium tracking-wide">
                              {room.name.replace(/^\d+\.\s*/, '')}
                            </span>
                          </div>
                          <ChevronRight className="w-3.5 h-3.5 text-zinc-500 group-hover:text-white transition-transform group-hover:translate-x-0.5" />
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Project Budget Card */}
                <div className="p-4 rounded-xl bg-black/40 border border-white/5 flex items-center justify-between">
                  <div>
                    <span className="text-[9px] uppercase font-mono text-zinc-500 block">
                      Contract Schedule
                    </span>
                    <span className="text-xs font-mono text-zinc-300">Total Budget</span>
                  </div>
                  <span className="text-base font-serif font-bold text-[#D4B483] tabular-nums">
                    ${totalBudget.toLocaleString()}.00
                  </span>
                </div>
              </div>

              {/* Bottom Trigger */}
              <div className="pt-4 border-t border-white/10 flex flex-col gap-2">
                <button
                  onClick={() => {
                    const firstRoom = floorRooms[0] || waypoints[0];
                    if (firstRoom) setActiveRoomId(firstRoom.id);
                    setFunnelStage('room-view');
                  }}
                  className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-semibold text-xs transition-all shadow-lg shadow-emerald-500/20 cursor-pointer"
                >
                  <Eye className="w-4 h-4" />
                  Explore Waypoints & Rooms
                </button>
              </div>
            </aside>
          )}

          {/* 3. Bottom Waypoint Navigation Dock */}
          {(funnelStage === 'room-view' || funnelStage === 'room-walk') && (
            <footer className="absolute bottom-6 left-6 right-6 z-20 flex items-center justify-between gap-4 pointer-events-none">
              {/* Left: Back to Floorplan + Floor Switcher Pill */}
              <div className="pointer-events-auto flex items-center gap-2">
                <button
                  onClick={() => setFunnelStage('floorplan')}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-[#0a0a0a]/90 backdrop-blur-xl border border-white/10 hover:border-amber-400/40 text-xs font-mono uppercase tracking-wider text-white shadow-2xl transition-all cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4 text-[#D4B483]" />
                  Floorplan
                </button>
                <div className="flex bg-[#0a0a0a]/90 backdrop-blur-xl border border-white/10 rounded-2xl p-1 gap-1">
                  {floors.map((f) => {
                    const isCur = f.id === currentFloor?.id;
                    return (
                      <button
                        key={f.id}
                        onClick={() => {
                          setActiveFloorId(f.id);
                          if (f.rooms.length > 0) setActiveRoomId(f.rooms[0].id);
                        }}
                        className={`px-3 py-1.5 rounded-xl text-xs font-mono transition-all cursor-pointer ${
                          isCur
                            ? 'bg-amber-400/20 text-[#D4B483] border border-amber-400/30 font-semibold'
                            : 'text-zinc-400 hover:text-white'
                        }`}
                      >
                        {f.label.split('—')[0].trim()}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Center: Sleek Horizontal Scrollable Dock of Numbered Waypoints + Prev/Next Buttons */}
              <div className="relative pointer-events-auto bg-[#0a0a0a]/90 backdrop-blur-xl border border-white/10 rounded-2xl p-2 flex items-center gap-2 shadow-2xl max-w-[55vw]">
                {/* Floating Waypoint Hint */}
                <div className="absolute -top-9 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-[#0a0a0a]/95 backdrop-blur-md border border-[#D4B483]/30 text-[9px] font-mono text-[#D4B483] uppercase tracking-wider flex items-center gap-1.5 pointer-events-none shadow-xl whitespace-nowrap">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  Drag Mouse to Look 360° · Click Any Floor Waypoint or Dock to Glide
                </div>

                <button
                  onClick={handlePrevRoom}
                  title="Previous Waypoint"
                  className="p-2 rounded-xl bg-white/5 hover:bg-white/15 text-zinc-300 hover:text-white transition-all cursor-pointer shrink-0"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>

                {/* Horizontal Scrollable Waypoint Buttons */}
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 px-1 max-w-[42vw]">
                  {floorRooms.map((wp) => {
                    const isSel = wp.id === activeRoomId;
                    return (
                      <button
                        key={wp.id}
                        onClick={() => setActiveRoomId(wp.id)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-mono whitespace-nowrap transition-all cursor-pointer flex items-center gap-2 shrink-0 ${
                          isSel
                            ? 'bg-emerald-500/25 text-emerald-200 border border-emerald-500/50 shadow-sm font-semibold'
                            : 'bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white border border-transparent'
                        }`}
                      >
                        <span className={`w-2 h-2 rounded-full ${isSel ? 'bg-emerald-400 shadow-[0_0_8px_#10B981]' : 'bg-zinc-600'}`} />
                        {wp.name}
                      </button>
                    );
                  })}
                </div>

                <button
                  onClick={handleNextRoom}
                  title="Next Waypoint"
                  className="p-2 rounded-xl bg-white/5 hover:bg-white/15 text-zinc-300 hover:text-white transition-all cursor-pointer shrink-0"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              {/* Right: Visual Polish Selector + Budget */}
              <div className="pointer-events-auto bg-[#0a0a0a]/90 backdrop-blur-xl border border-white/10 rounded-2xl p-1.5 flex items-center gap-2 shadow-2xl">
                <div className="flex bg-black/40 p-0.5 rounded-xl border border-white/5 gap-1">
                  <button
                    onClick={() => setVisualMode('sweet-spot')}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                      visualMode === 'sweet-spot' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                    Sweet-Spot
                  </button>
                  <button
                    onClick={() => setVisualMode('white-clay')}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                      visualMode === 'white-clay' ? 'bg-white/20 text-white border border-white/30' : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    <Layers className="w-3.5 h-3.5 text-zinc-300" />
                    White Clay
                  </button>
                  <button
                    onClick={() => setVisualMode('cyber-blueprint')}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                      visualMode === 'cyber-blueprint' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    <Terminal className="w-3.5 h-3.5 text-emerald-400" />
                    Cyber CAD
                  </button>
                </div>

                <div className="px-3 border-l border-white/10 text-xs font-mono">
                  <span className="text-[9px] text-zinc-500 block uppercase">Budget</span>
                  <span className="font-serif font-bold text-[#D4B483] tabular-nums">
                    ${totalBudget.toLocaleString()}.00
                  </span>
                </div>
              </div>
            </footer>
          )}

          {/* Right-Hand Spatial Pin Inspector */}
          {selectedPin && (
            <aside className="absolute top-20 right-6 bottom-24 w-[340px] z-30 bg-[#0c0c0c]/95 backdrop-blur-2xl border border-white/10 rounded-2xl p-6 shadow-2xl flex flex-col justify-between overflow-y-auto animate-fade-in">
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <span
                    className={`text-[10px] uppercase font-mono px-2 py-0.5 rounded-full border ${
                      selectedPin.status === 'approved'
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                        : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                    }`}
                  >
                    {selectedPin.status === 'approved' ? 'Approved Upgrade' : 'Pending Client Review'}
                  </span>
                  <button
                    onClick={() => setSelectedPinId(null)}
                    className="p-1 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white transition-all cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div>
                  <h2 className="text-base font-semibold tracking-tight text-white mb-0.5">
                    {selectedPin.title}
                  </h2>
                  <p className="text-xs text-zinc-400 font-mono">{selectedPin.targetObject}</p>
                </div>

                <div className="p-3 rounded-xl bg-black/40 border border-white/5">
                  <span className="text-[9px] uppercase font-mono text-zinc-500 block mb-1">
                    Design Specification
                  </span>
                  <p className="text-xs text-zinc-300 leading-relaxed">{selectedPin.prompt}</p>
                </div>

                <div className="flex flex-col gap-2">
                  <div className="p-2.5 rounded-xl bg-white/5 border border-white/5">
                    <span className="text-[9px] uppercase font-mono text-zinc-400 block mb-0.5">
                      Baseline Spec
                    </span>
                    <span className="text-xs text-zinc-300 font-mono">{selectedPin.beforeLabel || 'Standard Spec ($0)'}</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                    <span className="text-[9px] uppercase font-mono text-emerald-400 block mb-0.5">
                      Bespoke Upgrade
                    </span>
                    <span className="text-xs text-emerald-200 font-mono">
                      {selectedPin.afterLabel || `Artisan Upgrade (+${selectedPin.priceDelta.toLocaleString()})`}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between p-3 rounded-xl bg-black/40 border border-white/5 font-mono">
                  <span className="text-xs text-zinc-400">Budget Impact</span>
                  <span className="text-sm font-semibold text-emerald-400">
                    +${selectedPin.priceDelta.toLocaleString()}
                  </span>
                </div>
              </div>

              <div className="flex gap-2 pt-4 border-t border-white/10">
                {selectedPin.status === 'pending' ? (
                  <button
                    onClick={() => togglePinApproval(selectedPin.id, 'approved')}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-semibold text-xs transition-all shadow-lg shadow-emerald-500/20 cursor-pointer"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Approve Upgrade
                  </button>
                ) : (
                  <button
                    onClick={() => togglePinApproval(selectedPin.id, 'pending')}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-zinc-300 font-semibold text-xs transition-all cursor-pointer"
                  >
                    <Clock className="w-4 h-4 text-amber-400" />
                    Mark as Pending
                  </button>
                )}
              </div>
            </aside>
          )}
        </>
      )}

      {/* Contract Sign-Off Modal */}
      {isSignOffOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-6">
          <div className="bg-[#121212] border border-white/15 rounded-3xl max-w-2xl w-full p-8 shadow-2xl flex flex-col gap-6 relative">
            <button
              onClick={() => setIsSignOffOpen(false)}
              className="absolute top-6 right-6 p-1.5 rounded-xl hover:bg-white/10 text-zinc-400 hover:text-white transition-all cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="border-b border-white/10 pb-4">
              <span className="text-[10px] uppercase font-mono tracking-widest text-emerald-400 block mb-1">
                Atelier Solana · Spatial Specification
              </span>
              <h3 className="text-xl font-bold tracking-tight text-white font-serif">
                Client Design Sign-Off &amp; Budget Authorization
              </h3>
              <p className="text-xs text-zinc-400 mt-1">
                Authorized spatial upgrades and revised architectural contract schedule.
              </p>
            </div>

            <div className="flex flex-col gap-2 max-h-60 overflow-y-auto pr-1">
              <span className="text-[10px] uppercase font-mono text-zinc-500">
                Approved Line Items
              </span>
              {pins
                .filter((p) => p.status === 'approved')
                .map((pin) => (
                  <div key={pin.id} className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5">
                    <div>
                      <span className="text-xs font-semibold text-zinc-200 block">{pin.title}</span>
                      <span className="text-[11px] text-zinc-400 font-mono">{pin.targetObject}</span>
                    </div>
                    <span className="text-xs font-mono font-semibold text-emerald-400">
                      +${pin.priceDelta.toLocaleString()}
                    </span>
                  </div>
                ))}
              {pins.filter((p) => p.status === 'approved').length === 0 && (
                <div className="p-4 rounded-xl bg-white/5 text-zinc-500 text-xs text-center font-mono">
                  No spatial upgrade items approved yet.
                </div>
              )}
            </div>

            <div className="p-4 rounded-2xl bg-black/50 border border-white/10 flex flex-col gap-2 text-xs font-mono">
              <div className="flex justify-between text-zinc-400">
                <span>Base Construction &amp; Fit-Out:</span>
                <span>${BASE_BUDGET.toLocaleString()}.00</span>
              </div>
              <div className="flex justify-between text-emerald-400 font-medium">
                <span>Approved Spatial Upgrades ({pins.filter((p) => p.status === 'approved').length} items):</span>
                <span>+${approvedUpgrades.toLocaleString()}.00</span>
              </div>
              <div className="border-t border-white/10 pt-2 flex justify-between text-sm font-bold text-white">
                <span>Revised Contract Total:</span>
                <span className="text-emerald-400">${totalBudget.toLocaleString()}.00</span>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <div className="text-[11px] text-zinc-400">
                <span className="block text-zinc-200 font-medium">Client: Elena Vance</span>
                <span className="block text-zinc-500 font-mono">Status: Legally Binding Digital Approval</span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setIsSignOffOpen(false)}
                  className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-medium text-zinc-300 transition-all cursor-pointer"
                >
                  Close
                </button>
                <button
                  onClick={handleDownloadSchedule}
                  className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-semibold transition-all shadow-lg shadow-emerald-500/20 cursor-pointer"
                >
                  Download Signed Schedule
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Security & Access Code Modals */}
      <PinSetupModal
        isOpen={isPinSetupOpen}
        onClose={() => setIsPinSetupOpen(false)}
        modelUrl={modelUrl}
        defaultTitle={modelFileName || 'Architectural Space'}
      />
      <DesignerPinSettingsModal
        isOpen={isDesignerSettingsOpen}
        onClose={() => setIsDesignerSettingsOpen(false)}
        onSelectModel={(url, title) => {
          loadFileFromBlob(url, title || 'saved_model.glb');
        }}
      />
    </div>
  </ClientPinGate>
);
}
