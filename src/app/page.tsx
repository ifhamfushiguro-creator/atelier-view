import React, { useState, useMemo, useRef } from 'react';
import {
  Upload,
  Video,
  Compass,
  Box,
  Sparkles,
  CheckCircle2,
  Clock,
  ChevronDown,
  ChevronUp,
  MapPin,
  Plus,
  Lock,
  FileCheck2,
  SlidersHorizontal,
  Layers,
  Eye
} from 'lucide-react';
import StreetViewViewer, {
  type ViewerNavigationMode
} from '../components/canvas/street-view-viewer';
import {
  getDemoPenthouseWaypoints,
  calculateBudgetSummary,
  type Waypoint,
  type ModelStats,
  type PipelineStep,
  type SpatialPinItem,
  type Process3DResult
} from '../lib/3d/video-to-glb-service';

const INITIAL_PINS: SpatialPinItem[] = [
  {
    id: 'pin-sofa-emerald',
    title: 'Living Salon Sectional',
    targetObject: 'Living Salon Velvet Sectional Sofa',
    prompt: 'Replace charcoal bouclé upholstery with deep emerald green silk-velvet and brushed bronze plinth',
    position: [-1.15, 0.65, -0.45],
    cameraAngle: [-2.8, 1.65, 1.4],
    priceDelta: 4200,
    status: 'approved',
    author: 'Elena Vance (Client)',
    createdAt: 'Today · 14:20',
    beforeLabel: 'Standard Charcoal Bouclé ($0)',
    afterLabel: 'Emerald Silk Velvet (+$4,200)',
    materialPreset: 'emerald-velvet'
  },
  {
    id: 'pin-island-marble',
    title: 'Waterfall Kitchen Island',
    targetObject: 'Nero Marquina Waterfall Kitchen Island',
    prompt: 'Replace dark stone with bookmatched Calacatta Viola marble slab with mitered waterfall edge',
    position: [3.1, 0.98, -3.2],
    cameraAngle: [2.4, 1.65, -2.8],
    priceDelta: 6800,
    status: 'pending',
    author: 'Elena Vance (Client)',
    createdAt: 'Today · 14:32',
    beforeLabel: 'Honed Nero Marquina Stone ($0 Base)',
    afterLabel: 'Bookmatched Calacatta Viola (+$6,800)',
    materialPreset: 'calacatta-marble'
  },
  {
    id: 'pin-dining-chandelier',
    title: 'Alabaster Ring Luminaire',
    targetObject: 'Suspended Alabaster & Gold Ring Chandelier',
    prompt: 'Upgrade single pendant to dual-tier hand-carved Spanish alabaster & brushed 24k brass rings',
    position: [3.2, 2.55, 0.2],
    cameraAngle: [2.9, 1.65, 1.8],
    priceDelta: 3400,
    status: 'approved',
    author: 'Studio Architect',
    createdAt: 'Today · 13:55',
    beforeLabel: 'Standard Anodized Pendant ($0 Base)',
    afterLabel: 'Dual-Ring Spanish Alabaster (+$3,400)',
    materialPreset: 'brushed-gold'
  }
];

const RECONSTRUCTION_STAGE_LABELS = [
  'Extracting keyframes from 60fps walkthrough...',
  'Generating 3D sparse & dense point cloud...',
  'Meshing .GLB geometry & baking PBR normals...',
  'Seeding 6 Street View floor waypoints at 1.65m eye level...'
];

export default function SpatialWorkspacePage() {
  const [modelUrl, setModelUrl] = useState<string>('procedural://luxury-penthouse');
  const [waypoints, setWaypoints] = useState<Waypoint[]>(() => getDemoPenthouseWaypoints());
  const [activeWaypointId, setActiveWaypointId] = useState<string>('wp-foyer');
  const [navigationMode, setNavigationMode] = useState<ViewerNavigationMode>('street-view');

  // Uploader & Pipeline state
  const [activeUploadTab, setActiveUploadTab] = useState<'glb' | 'video'>('glb');
  const [isStudioCardOpen, setIsStudioCardOpen] = useState<boolean>(true);
  const [isBottomDockOpen, setIsBottomDockOpen] = useState<boolean>(true);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [activeStageIndex, setActiveStageIndex] = useState<number>(0);
  const [pipelineModeBadge, setPipelineModeBadge] = useState<
    'optimized-glb' | 'kiri-photogrammetry' | 'local-fallback-demo'
  >('local-fallback-demo');

  const [projectTitle, setProjectTitle] = useState<string>('The Mercer Penthouse — Residence 42A');
  const [clientName, setClientName] = useState<string>('Vance & Sterling Private Collection');
  const [baseBudget, setBaseBudget] = useState<number>(120000);
  const [vipPasscode, setVipPasscode] = useState<string>('4829');
  const [sourceFileName, setSourceFileName] = useState<string>('mercer_penthouse_v4.glb');

  const [stats, setStats] = useState<ModelStats>({
    meshCount: 54,
    vertexCount: 164200,
    materialCount: 16,
    originalBytes: 28_450_000,
    optimizedBytes: 5_140_000,
    compressionRatio: 'Built-in Architectural Penthouse · 60fps PBR',
    bounds: {
      min: [-6.0, 0, -5.0],
      max: [6.0, 3.8, 6.0],
      size: [12.0, 3.8, 11.0],
      center: [0, 1.9, 0.5],
      floorY: 0
    },
    processingTimeMs: 18
  });

  const [pipelineSteps, setPipelineSteps] = useState<PipelineStep[]>([
    {
      id: 'init-1',
      label: 'Initialized Built-in Luxury Penthouse 3D Showroom',
      detail: '12.0m × 3.8m × 11.0m architectural volume with 6 Street View floor circles',
      durationMs: 18,
      status: 'completed'
    }
  ]);

  // 3D Spatial Pins & AI "Imagine" Split-Screen Preview state
  const [pins, setPins] = useState<SpatialPinItem[]>(INITIAL_PINS);
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null);
  const [splitSliderPct, setSplitSliderPct] = useState<number>(58);
  const [aiPromptDraft, setAiPromptDraft] = useState<string>('');
  const [isGeneratingAiPreview, setIsGeneratingAiPreview] = useState<boolean>(false);

  // Modals: VIP Passcode Gate & Sign-Off Contract
  const [isVipModalOpen, setIsVipModalOpen] = useState<boolean>(false);
  const [enteredPasscode, setEnteredPasscode] = useState<string>('4829');
  const [passcodeVerified, setPasscodeVerified] = useState<boolean>(true);
  const [passcodeError, setPasscodeError] = useState<string | null>(null);
  const [isContractModalOpen, setIsContractModalOpen] = useState<boolean>(false);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const activeWaypoint = useMemo(
    () => waypoints.find((w) => w.id === activeWaypointId) || waypoints[0],
    [waypoints, activeWaypointId]
  );

  const selectedPin = useMemo(
    () => pins.find((p) => p.id === selectedPinId) || null,
    [pins, selectedPinId]
  );

  const budgetSummary = useMemo(
    () => calculateBudgetSummary(baseBudget, pins),
    [baseBudget, pins]
  );

  const showTransientBanner = (msg: string) => {
    setStatusBanner(msg);
    window.setTimeout(() => {
      setStatusBanner((prev) => (prev === msg ? null : prev));
    }, 4500);
  };

  // Run multi-step progress animation while calling /api/3d/process
  const run3DProcessingPipeline = async (options: {
    file?: File;
    mode: 'glb' | 'video';
    generateSampleGlb?: boolean;
  }) => {
    setIsProcessing(true);
    setActiveStageIndex(0);

    const stageInterval = window.setInterval(() => {
      setActiveStageIndex((prev) => (prev < 3 ? prev + 1 : prev));
    }, 280);

    try {
      const formData = new FormData();
      if (options.file) {
        formData.append('file', options.file);
      }
      formData.append('mode', options.mode);
      formData.append('title', projectTitle);
      formData.append('clientName', clientName);
      formData.append('baseBudget', String(baseBudget));
      formData.append('vipPasscode', vipPasscode);
      if (options.generateSampleGlb) {
        formData.append('generateSampleGlb', 'true');
      }

      // Brief minimum step dwell so the 4-stage progress telemetry is clearly visible
      await new Promise((r) => setTimeout(r, 850));

      const response = await fetch('/api/3d/process', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error(`3D pipeline returned HTTP ${response.status}`);
      }

      const data = (await response.json()) as Process3DResult;
      setModelUrl(data.modelUrl);
      setWaypoints(data.waypoints);
      if (data.waypoints.length > 0) {
        setActiveWaypointId(data.waypoints[0].id);
      }
      setPipelineModeBadge(data.mode);
      setStats(data.stats);
      setPipelineSteps(data.pipelineSteps);
      setSourceFileName(data.projectMeta.sourceFileName);

      showTransientBanner(
        data.mode === 'optimized-glb'
          ? `Optimized ${data.projectMeta.sourceFileName} and seeded 6 Street View floor circles.`
          : `Reconstructed 3D Penthouse from ${data.projectMeta.sourceFileName} with 6 floor waypoints.`
      );
    } catch (err) {
      showTransientBanner(
        err instanceof Error ? err.message : 'Switched to Built-in Luxury Penthouse fallback.'
      );
    } finally {
      window.clearInterval(stageInterval);
      setActiveStageIndex(3);
      setIsProcessing(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const isGlb =
      file.name.toLowerCase().endsWith('.glb') ||
      file.name.toLowerCase().endsWith('.gltf');
    await run3DProcessingPipeline({
      file,
      mode: isGlb ? 'glb' : 'video'
    });
    e.target.value = '';
  };

  const handleLoadBuiltInPenthouse = () => {
    const demoWps = getDemoPenthouseWaypoints();
    setModelUrl('procedural://luxury-penthouse');
    setWaypoints(demoWps);
    setActiveWaypointId(demoWps[0].id);
    setNavigationMode('street-view');
    setPipelineModeBadge('local-fallback-demo');
    setSourceFileName('mercer_penthouse_v4.glb');
    showTransientBanner('Loaded Built-in Procedural Luxury Penthouse at 60fps.');
  };

  const handleSelectPin = (pinId: string) => {
    setSelectedPinId(pinId);
    const pin = pins.find((p) => p.id === pinId);
    if (pin) {
      setAiPromptDraft(pin.prompt);
    }
  };

  const handleAddPinAtCoordinate = (
    position: [number, number, number],
    cameraAngle: [number, number, number],
    targetObjectName: string
  ) => {
    const newPin: SpatialPinItem = {
      id: `pin-${Date.now()}`,
      title: targetObjectName.slice(0, 28),
      targetObject: targetObjectName,
      prompt: `Custom Italian travertine & brushed bronze finish on ${targetObjectName}`,
      position,
      cameraAngle,
      priceDelta: 3800,
      status: 'pending',
      author: 'VIP Client',
      createdAt: 'Just now',
      beforeLabel: 'Current Architectural Finish ($0)',
      afterLabel: 'AI-Inpainted Bespoke Finish (+$3,800)',
      materialPreset: 'emerald-velvet'
    };

    setPins((prev) => [...prev, newPin]);
    setSelectedPinId(newPin.id);
    setAiPromptDraft(newPin.prompt);
    showTransientBanner(
      `Anchored 3D Spatial Pin at [${position.join(', ')}] on ${targetObjectName}.`
    );
  };

  const handleRunAiImaginePreview = () => {
    if (!selectedPin) return;
    setIsGeneratingAiPreview(true);
    window.setTimeout(() => {
      setPins((prev) =>
        prev.map((p) =>
          p.id === selectedPin.id
            ? {
                ...p,
                prompt: aiPromptDraft.trim() || p.prompt,
                afterLabel: `AI Inpainted: ${(aiPromptDraft.trim() || p.prompt).slice(0, 32)} (+$${p.priceDelta.toLocaleString()})`
              }
            : p
        )
      );
      setIsGeneratingAiPreview(false);
      setSplitSliderPct(65);
      showTransientBanner('Flux Fill Pro / SAM 2 Before-After preview synthesized.');
    }, 600);
  };

  const handleTogglePinApproval = (pinId: string, nextStatus: 'approved' | 'pending') => {
    setPins((prev) =>
      prev.map((p) => (p.id === pinId ? { ...p, status: nextStatus } : p))
    );
    const target = pins.find((p) => p.id === pinId);
    if (target) {
      showTransientBanner(
        nextStatus === 'approved'
          ? `Approved "${target.title}" (+$${target.priceDelta.toLocaleString()}) — Live 3D material updated.`
          : `Moved "${target.title}" to Pending Architect Review.`
      );
    }
  };

  const handleConfirmAllApprovals = () => {
    setPins((prev) => prev.map((p) => ({ ...p, status: 'approved' })));
    setIsContractModalOpen(true);
    showTransientBanner('All spatial pins locked in Emerald Green (#10B981).');
  };

  const handleVerifyPasscode = (e: React.FormEvent) => {
    e.preventDefault();
    if (enteredPasscode.trim() === vipPasscode.trim()) {
      setPasscodeVerified(true);
      setPasscodeError(null);
      setIsVipModalOpen(false);
      showTransientBanner(`VIP Showroom unlocked for ${clientName}.`);
    } else {
      setPasscodeError(`Invalid VIP passcode. Hint: current project code is ${vipPasscode}.`);
    }
  };

  return (
    <div className="relative w-screen h-screen bg-[#0A0A0A] text-zinc-100 flex flex-col overflow-hidden">
      {/* Top Bar Contract: 3 Zones separated by gap-8 */}
      <header className="relative z-30 flex items-center justify-between gap-8 px-6 py-3.5 bg-[#0A0A0A]/95 border-b border-white/10 shrink-0">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            handleLoadBuiltInPenthouse();
          }}
          className="text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0"
        >
          Spatial
        </a>

        {/* Zone 2: 4 concise single-line navigation links */}
        <nav
          aria-label="Primary Workspace Navigation"
          className="hidden md:flex items-center gap-7 text-sm font-medium text-zinc-400"
        >
          <button
            type="button"
            onClick={() => setIsStudioCardOpen((v) => !v)}
            className="hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
          >
            Studio Ingestion
          </button>
          <button
            type="button"
            onClick={() => setNavigationMode('street-view')}
            className="hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
          >
            Street View
          </button>
          <button
            type="button"
            onClick={() => {
              const targetId = selectedPinId || pins[0]?.id;
              if (targetId) handleSelectPin(targetId);
            }}
            className="hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
          >
            Spatial Pins
          </button>
          <button
            type="button"
            onClick={() => setIsVipModalOpen(true)}
            className="hover:text-white hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
          >
            VIP Passcode
          </button>
        </nav>

        {/* Zone 3: 1 Primary Action */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={handleConfirmAllApprovals}
            className="px-4 py-2 text-xs font-semibold text-[#0A0A0A] bg-[#10B981] rounded-lg hover:bg-[#0ea572] transition-colors whitespace-nowrap shrink-0"
          >
            Confirm All Approvals
          </button>
        </div>
      </header>

      {/* Main 3D WebGL Showroom Viewport + Floating Luxury HUD */}
      <main className="relative flex-1 w-full h-full overflow-hidden">
        <StreetViewViewer
          modelUrl={modelUrl}
          waypoints={waypoints}
          activeWaypointId={activeWaypointId}
          navigationMode={navigationMode}
          pins={pins}
          selectedPinId={selectedPinId}
          onSelectWaypoint={(wp) => {
            setActiveWaypointId(wp.id);
            setNavigationMode('street-view');
          }}
          onSelectPin={handleSelectPin}
          onAddPinAtCoordinate={handleAddPinAtCoordinate}
        />

        {/* Transient Notification Toast */}
        {statusBanner && (
          <div
            role="status"
            className="absolute top-4 left-1/2 -translate-x-1/2 z-30 px-4 py-2 rounded-lg bg-[#121212] border border-[#10B981]/50 text-xs font-medium text-zinc-100 shadow-2xl whitespace-nowrap"
          >
            {statusBanner}
          </div>
        )}

        {/* TOP-LEFT FLOATING STUDIO INGESTION & 3D ENGINE UPLOADER CARD */}
        <section
          aria-label="3D Model and Video-to-GLB Ingestion Engine"
          className="absolute top-4 left-4 z-20 w-[min(365px,calc(100vw-2rem))] bg-[#121212]/95 border border-white/10 rounded-2xl shadow-2xl transition-all duration-200"
        >
          {/* Card Header with Collapse Toggle */}
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-white/10">
            <div className="min-w-0">
              <h1 className="text-sm font-semibold text-white truncate">
                {projectTitle}
              </h1>
              <p className="text-xs text-zinc-400 truncate">
                {clientName} · Code {vipPasscode}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsStudioCardOpen((prev) => !prev)}
              aria-label={isStudioCardOpen ? 'Collapse Studio Uploader' : 'Expand Studio Uploader'}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/5 transition-colors shrink-0"
            >
              {isStudioCardOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>

          {isStudioCardOpen && (
            <div className="p-4 space-y-3 max-h-[calc(100vh-14rem)] overflow-y-auto">
              {/* Two Uploader Mode Tabs */}
              <div
                role="tablist"
                aria-label="Ingestion Source Mode"
                className="grid grid-cols-2 gap-1 p-1 bg-[#0A0A0A] rounded-xl border border-white/10"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeUploadTab === 'glb'}
                  onClick={() => setActiveUploadTab('glb')}
                  className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                    activeUploadTab === 'glb'
                      ? 'bg-[#121212] text-white border border-white/15 shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <Box className="w-3.5 h-3.5 text-[#10B981]" />
                  <span>Upload .GLB Model</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeUploadTab === 'video'}
                  onClick={() => setActiveUploadTab('video')}
                  className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                    activeUploadTab === 'video'
                      ? 'bg-[#121212] text-white border border-white/15 shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <Video className="w-3.5 h-3.5 text-[#F59E0B]" />
                  <span>Video / Photos (.MP4)</span>
                </button>
              </div>

              {/* Hidden Native File Input */}
              <input
                ref={fileInputRef}
                id="spatial-3d-file-upload"
                type="file"
                accept={activeUploadTab === 'glb' ? '.glb,.gltf' : '.mp4,.mov,video/*,image/*'}
                onChange={handleFileChange}
                className="sr-only"
              />

              {/* Dropzone / Action Box */}
              <div className="p-4 rounded-xl bg-[#0A0A0A] border border-white/10 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-zinc-200">
                      {activeUploadTab === 'glb'
                        ? 'Input A: Direct .GLB Mesh Optimization'
                        : 'Input B: 60s Walkthrough Video to 3D .GLB'}
                    </p>
                    <p className="text-xs text-zinc-400 leading-relaxed">
                      {activeUploadTab === 'glb'
                        ? 'Runs @gltf-transform dedup/weld/prune and extracts floor bounding-box coordinates for 6 Street View circles.'
                        : 'Connects to KIRI Engine Photogrammetry API with automatic $0 Local Dev Fallback Mode when KIRI_API_KEY is unset.'}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <label
                    htmlFor="spatial-3d-file-upload"
                    className="cursor-pointer flex-1 inline-flex items-center justify-center gap-2 py-2 px-3.5 rounded-lg bg-white text-[#0A0A0A] hover:bg-zinc-200 text-xs font-semibold transition-colors whitespace-nowrap"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>
                      {activeUploadTab === 'glb' ? 'Choose .GLB File' : 'Upload .MP4 Video'}
                    </span>
                  </label>

                  {activeUploadTab === 'glb' ? (
                    <button
                      type="button"
                      disabled={isProcessing}
                      onClick={() =>
                        run3DProcessingPipeline({
                          mode: 'glb',
                          generateSampleGlb: true
                        })
                      }
                      className="py-2 px-3 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-xs font-medium text-zinc-200 transition-colors whitespace-nowrap"
                    >
                      Synthesize &amp; Optimize .GLB
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={isProcessing}
                      onClick={() =>
                        run3DProcessingPipeline({
                          mode: 'video'
                        })
                      }
                      className="py-2 px-3 rounded-lg bg-[#F59E0B]/15 hover:bg-[#F59E0B]/25 border border-[#F59E0B]/40 text-xs font-medium text-[#F59E0B] transition-colors whitespace-nowrap"
                    >
                      Simulate .MP4 Scan ($0)
                    </button>
                  )}
                </div>
              </div>

              {/* Animated Multi-Step Progress Indicator during upload/reconstruction */}
              {isProcessing && (
                <div
                  aria-live="polite"
                  className="p-3.5 rounded-xl bg-[#0A0A0A] border border-[#F59E0B]/40 space-y-2.5"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-[#F59E0B]">
                      3D Reconstruction Pipeline Active
                    </span>
                    <span className="font-mono tabular-nums text-zinc-400">
                      Step {activeStageIndex + 1} / 4
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {RECONSTRUCTION_STAGE_LABELS.map((stageLabel, idx) => {
                      const isDone = idx < activeStageIndex;
                      const isCurrent = idx === activeStageIndex;
                      return (
                        <div
                          key={stageLabel}
                          className={`flex items-center gap-2 text-xs ${
                            isDone
                              ? 'text-[#10B981]'
                              : isCurrent
                                ? 'text-white font-medium'
                                : 'text-zinc-600'
                          }`}
                        >
                          <span className="font-mono text-[11px]">
                            {isDone ? '[OK]' : isCurrent ? '[>>]' : '[..]'}
                          </span>
                          <span className="truncate">{stageLabel}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Built-In Demo Penthouse Reset Button + Spatial Pin Quick Drop */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleLoadBuiltInPenthouse}
                  className="flex-1 py-2 px-3 rounded-lg bg-[#10B981]/15 hover:bg-[#10B981]/25 border border-[#10B981]/40 text-xs font-semibold text-[#10B981] transition-colors whitespace-nowrap"
                >
                  Load Built-in Demo Penthouse
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const wp = activeWaypoint;
                    handleAddPinAtCoordinate(
                      [wp.lookAt[0], 1.1, wp.lookAt[2]],
                      [wp.position[0], 1.65, wp.position[2]],
                      `${wp.zone} Custom Element`
                    );
                  }}
                  className="inline-flex items-center gap-1.5 py-2 px-3 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-xs font-medium text-zinc-200 transition-colors whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5 text-[#F59E0B]" />
                  <span>Drop 3D Pin</span>
                </button>
              </div>

              {/* Scene Telemetry & Bounding Box Readout (Unboxed clean metadata) */}
              <div className="pt-3 border-t border-white/10 space-y-2">
                <div className="flex items-center justify-between text-xs text-zinc-400">
                  <span>Active Asset</span>
                  <span className="font-mono text-zinc-200 truncate max-w-[200px]">
                    {sourceFileName}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs text-zinc-400">
                  <span>Bounding Volume</span>
                  <span className="font-mono tabular-nums text-zinc-200">
                    {stats.bounds.size[0]}m × {stats.bounds.size[1]}m × {stats.bounds.size[2]}m · Floor Y={stats.bounds.floorY}m
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs text-zinc-400">
                  <span className="whitespace-nowrap">Geometry &amp; Mode</span>
                  <span className="font-mono tabular-nums text-zinc-300 whitespace-nowrap">
                    {stats.meshCount} meshes · {(stats.vertexCount / 1000).toFixed(1)}k verts ·{' '}
                    {pipelineModeBadge === 'optimized-glb' ? 'GLTF-Opt' : 'PBR'}
                  </span>
                </div>

                {/* Pipeline log summary */}
                <div className="pt-1 space-y-1">
                  {pipelineSteps.slice(0, 2).map((step) => (
                    <p key={step.id} className="text-[11px] text-zinc-400 truncate">
                      · {step.label} ({step.durationMs}ms)
                    </p>
                  ))}
                </div>
              </div>
            </div>
          )}
        </section>

        {/* SPATIAL PIN & 4-SECOND AI "IMAGINE" BEFORE/AFTER SPLIT-SCREEN SLIDER DRAWER */}
        {selectedPin && (
          <aside
            aria-label="Spatial Pin AI Imagine Inspector"
            className="absolute top-4 right-4 z-20 w-[min(420px,calc(100vw-2rem))] bg-[#121212]/95 border border-white/10 rounded-2xl shadow-2xl p-5 space-y-4 max-h-[calc(100vh-13rem)] overflow-y-auto"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs text-zinc-400">
                  3D Spatial Pin · [{selectedPin.position.join(', ')}]m
                </p>
                <h2 className="text-base font-semibold text-white">
                  {selectedPin.title}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPinId(null)}
                className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-xs text-zinc-300 transition-colors"
              >
                Close
              </button>
            </div>

            {/* Interactive Draggable Before / After Split-Screen Architectural Preview */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-zinc-400">
                <span>AI Imagine Split-Screen Preview</span>
                <span className="font-mono tabular-nums text-zinc-200">
                  Split: {splitSliderPct}%
                </span>
              </div>

              <div className="relative h-44 w-full rounded-xl overflow-hidden border border-white/15 bg-[#0A0A0A] select-none">
                {/* AFTER LAYER (Full width underneath: AI Inpainted Luxury Material) */}
                <div
                  className="absolute inset-0 flex flex-col justify-end items-end p-3.5"
                  style={{
                    background:
                      selectedPin.materialPreset === 'emerald-velvet'
                        ? 'radial-gradient(circle at 70% 35%, #10B981 0%, #064E3B 48%, #0A0A0A 100%)'
                        : selectedPin.materialPreset === 'calacatta-marble'
                          ? 'linear-gradient(135deg, #f5f0e6 0%, #d6cbb9 50%, #44382c 100%)'
                          : 'radial-gradient(circle at 65% 30%, #F59E0B 0%, #78350F 52%, #0A0A0A 100%)'
                  }}
                >
                  <div className="text-right space-y-1">
                    <span className="inline-block px-2.5 py-1 rounded bg-[#0A0A0A]/85 text-[11px] font-semibold text-[#10B981]">
                      AFTER · {selectedPin.afterLabel}
                    </span>
                    <p className="text-[11px] text-zinc-100 drop-shadow">
                      Flux Fill Pro + SAM 2 Lighting Match
                    </p>
                  </div>
                </div>

                {/* BEFORE LAYER (Clipped by splitSliderPct, anchored top-left so badges never collide) */}
                <div
                  className="absolute inset-y-0 left-0 overflow-hidden flex flex-col justify-start items-start p-3.5 border-r-2 border-white"
                  style={{
                    width: `${splitSliderPct}%`,
                    background:
                      'linear-gradient(135deg, #27272A 0%, #18181B 60%, #09090B 100%)'
                  }}
                >
                  <div className="space-y-1">
                    <span className="inline-block px-2.5 py-1 rounded bg-[#0A0A0A]/85 text-[11px] font-medium text-zinc-200 whitespace-nowrap">
                      BEFORE · {selectedPin.beforeLabel}
                    </span>
                    <p className="text-[11px] text-zinc-400 whitespace-nowrap">
                      Original Base Specification
                    </p>
                  </div>
                </div>

                {/* Center Split Handle Indicator */}
                <div
                  style={{ left: `${splitSliderPct}%` }}
                  className="pointer-events-none absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-6 h-6 rounded-full bg-white text-[#0A0A0A] flex items-center justify-center shadow-lg text-[10px] font-bold"
                >
                  ↔
                </div>
              </div>

              {/* Accessible Range Slider for Before/After Comparison */}
              <div className="flex items-center gap-3">
                <label
                  htmlFor="before-after-split-slider"
                  className="text-xs text-zinc-400 whitespace-nowrap"
                >
                  Compare Before / After
                </label>
                <input
                  id="before-after-split-slider"
                  type="range"
                  min={5}
                  max={95}
                  value={splitSliderPct}
                  onChange={(e) => setSplitSliderPct(Number(e.target.value))}
                  className="w-full accent-[#10B981] cursor-pointer"
                />
              </div>
            </div>

            {/* AI "Imagine" Prompt Input */}
            <div className="space-y-2">
              <label
                htmlFor="spatial-pin-prompt"
                className="block text-xs font-medium text-zinc-300"
              >
                AI Material / Furniture Modification Prompt
              </label>
              <div className="flex gap-2">
                <input
                  id="spatial-pin-prompt"
                  type="text"
                  value={aiPromptDraft}
                  onChange={(e) => setAiPromptDraft(e.target.value)}
                  placeholder="e.g., Replace with dark green velvet sofa"
                  className="flex-1 px-3 py-2 rounded-lg bg-[#0A0A0A] border border-white/15 text-xs text-white focus:outline-none focus:border-[#10B981]"
                />
                <button
                  type="button"
                  disabled={isGeneratingAiPreview}
                  onClick={handleRunAiImaginePreview}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-medium text-white transition-colors whitespace-nowrap"
                >
                  <Sparkles className="w-3.5 h-3.5 text-[#F59E0B]" />
                  <span>{isGeneratingAiPreview ? 'Synthesizing...' : 'Imagine (4s)'}</span>
                </button>
              </div>
            </div>

            {/* Architect Price Delta & Approval Controls */}
            <div className="pt-3 border-t border-white/10 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs text-zinc-400">Architect Price Delta</p>
                <p className="text-sm font-mono tabular-nums font-semibold text-white">
                  +${selectedPin.priceDelta.toLocaleString()}{' '}
                  <span
                    className={
                      selectedPin.status === 'approved' ? 'text-[#10B981]' : 'text-[#F59E0B]'
                    }
                  >
                    · {selectedPin.status === 'approved' ? 'Approved' : 'Pending Review'}
                  </span>
                </p>
              </div>

              <div className="flex items-center gap-2">
                {selectedPin.status !== 'approved' ? (
                  <button
                    type="button"
                    onClick={() => handleTogglePinApproval(selectedPin.id, 'approved')}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#10B981] text-[#0A0A0A] text-xs font-semibold hover:bg-[#0ea572] transition-colors whitespace-nowrap"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Approve Option</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleTogglePinApproval(selectedPin.id, 'pending')}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#F59E0B]/20 border border-[#F59E0B]/50 text-[#F59E0B] text-xs font-semibold hover:bg-[#F59E0B]/30 transition-colors whitespace-nowrap"
                  >
                    <Clock className="w-3.5 h-3.5" />
                    <span>Mark Pending</span>
                  </button>
                )}
              </div>
            </div>

            {/* Pin Switcher List */}
            <div className="pt-2 border-t border-white/10 space-y-1.5">
              <p className="text-xs text-zinc-400">All Anchored 3D Pins ({pins.length})</p>
              <div className="space-y-1">
                {pins.map((pin) => (
                  <button
                    key={pin.id}
                    type="button"
                    onClick={() => handleSelectPin(pin.id)}
                    className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-xs transition-colors ${
                      pin.id === selectedPin.id
                        ? 'bg-white/10 text-white font-medium'
                        : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-200'
                    }`}
                  >
                    <span className="truncate">{pin.title}</span>
                    <span
                      className={`font-mono tabular-nums whitespace-nowrap ${
                        pin.status === 'approved' ? 'text-[#10B981]' : 'text-[#F59E0B]'
                      }`}
                    >
                      +${pin.priceDelta.toLocaleString()} ({pin.status})
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </aside>
        )}

        {/* UNIFIED COLLAPSIBLE BOTTOM CONTROL DOCK */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 w-[min(940px,94vw)] flex flex-col items-center">
          {/* Collapse / Expand Cinema Mode Toggle */}
          <button
            type="button"
            onClick={() => setIsBottomDockOpen((prev) => !prev)}
            className="mb-1.5 inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-[#121212]/95 border border-white/10 text-xs font-medium text-zinc-300 hover:text-white transition-colors whitespace-nowrap shadow-lg"
          >
            {isBottomDockOpen ? (
              <>
                <ChevronDown className="w-3.5 h-3.5" />
                <span>Hide Controls</span>
              </>
            ) : (
              <>
                <ChevronUp className="w-3.5 h-3.5" />
                <span>Show Street View &amp; Budget Dock</span>
              </>
            )}
          </button>

          {isBottomDockOpen && (
            <div
              role="region"
              aria-label="Street View Navigation and Live Budget Dock"
              className="w-full bg-[#121212]/95 border border-white/10 rounded-2xl p-4 shadow-2xl space-y-3"
            >
              {/* Row 1: Camera Mode Switcher + Live Budget HUD */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
                {/* Mode Toggle Buttons */}
                <div className="grid grid-cols-2 sm:flex items-center gap-1.5 p-1 bg-[#0A0A0A] rounded-xl border border-white/10 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={() => setNavigationMode('street-view')}
                    className={`inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                      navigationMode === 'street-view'
                        ? 'bg-[#10B981] text-[#0A0A0A] font-semibold'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    <Compass className="w-3.5 h-3.5 shrink-0" />
                    <span className="hidden sm:inline">Street View Walk Mode (Floor Circles)</span>
                    <span className="sm:hidden">Street View Mode</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setNavigationMode('dollhouse')}
                    className={`inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                      navigationMode === 'dollhouse'
                        ? 'bg-[#F59E0B] text-[#0A0A0A] font-semibold'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    <Layers className="w-3.5 h-3.5 shrink-0" />
                    <span className="hidden sm:inline">3D Dollhouse Orbit Mode</span>
                    <span className="sm:hidden">3D Dollhouse</span>
                  </button>
                </div>

                {/* Live Budget Telemetry (Tabular Numerals, Unboxed Separators) */}
                <div className="flex flex-wrap items-center gap-2 text-xs font-mono tabular-nums">
                  <span className="text-zinc-400">
                    Base Budget: <strong className="text-zinc-100">${budgetSummary.baseBudget.toLocaleString()}</strong>
                  </span>
                  <span aria-hidden="true" className="text-zinc-600">
                    |
                  </span>
                  <span className="text-[#10B981]">
                    Approved Upgrades: +${budgetSummary.approvedUpgrades.toLocaleString()}
                  </span>
                  {budgetSummary.pendingUpgrades > 0 && (
                    <>
                      <span aria-hidden="true" className="text-zinc-600">
                        |
                      </span>
                      <span className="text-[#F59E0B]">
                        Pending: +${budgetSummary.pendingUpgrades.toLocaleString()}
                      </span>
                    </>
                  )}
                  <span aria-hidden="true" className="text-zinc-600">
                    |
                  </span>
                  <span className="text-white font-semibold">
                    Total: ${budgetSummary.totalApprovedBudget.toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Row 2: 6 Floor Waypoint Quick-Jump Controls */}
              <div className="flex items-center justify-between gap-1.5 overflow-x-auto pb-0.5">
                <span className="text-xs text-zinc-400 whitespace-nowrap shrink-0 flex items-center gap-1 mr-1">
                  <MapPin className="w-3.5 h-3.5 text-[#F59E0B]" />
                  <span>Waypoints:</span>
                </span>
                <div className="flex items-center gap-1.5 flex-1 justify-between">
                  {waypoints.map((wp) => {
                    const isActive = wp.id === activeWaypointId;
                    return (
                      <button
                        key={wp.id}
                        type="button"
                        onClick={() => {
                          setActiveWaypointId(wp.id);
                          setNavigationMode('street-view');
                        }}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                          isActive
                            ? 'bg-white text-[#0A0A0A] font-semibold'
                            : 'bg-[#0A0A0A] text-zinc-300 border border-white/10 hover:border-white/25 hover:text-white'
                        }`}
                      >
                        {wp.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* VIP 4-DIGIT PASSCODE GATE MODAL */}
      {isVipModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="vip-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
        >
          <div className="w-full max-w-md rounded-2xl bg-[#121212] border border-white/15 p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-[#F59E0B]" />
                <h2 id="vip-modal-title" className="text-base font-semibold text-white">
                  VIP Client Portal Passcode Gate
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setIsVipModalOpen(false)}
                className="text-xs text-zinc-400 hover:text-white"
              >
                Close
              </button>
            </div>

            <p className="text-xs text-zinc-400 leading-relaxed">
              Enter the 4-digit VIP Passcode for <strong className="text-zinc-200">{projectTitle}</strong> to unlock 60fps Street View walkthrough and AI Spatial Pin pricing.
            </p>

            <form onSubmit={handleVerifyPasscode} className="space-y-3">
              <div>
                <label
                  htmlFor="vip-passcode-input"
                  className="block text-xs font-medium text-zinc-300 mb-1"
                >
                  4-Digit VIP Passcode
                </label>
                <input
                  id="vip-passcode-input"
                  type="text"
                  maxLength={8}
                  value={enteredPasscode}
                  onChange={(e) => setEnteredPasscode(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg bg-[#0A0A0A] border border-white/15 font-mono text-base tracking-widest text-white focus:outline-none focus:border-[#10B981]"
                />
              </div>

              {passcodeError && (
                <p className="text-xs text-[#F59E0B]">{passcodeError}</p>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsVipModalOpen(false)}
                  className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-xs text-zinc-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-[#10B981] text-[#0A0A0A] text-xs font-semibold hover:bg-[#0ea572]"
                >
                  Unlock Showroom
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ONE-CLICK SIGN-OFF & ARCHITECTURAL APPROVAL CONTRACT MODAL */}
      {isContractModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="contract-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
        >
          <div className="w-full max-w-lg rounded-2xl bg-[#121212] border border-white/15 p-6 space-y-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-[#10B981] text-xs font-semibold">
                  <FileCheck2 className="w-4 h-4" />
                  <span>All Spatial Approvals Locked in Emerald Green</span>
                </div>
                <h2 id="contract-modal-title" className="text-lg font-bold text-white">
                  {projectTitle} — Client Sign-Off Summary
                </h2>
                <p className="text-xs text-zinc-400">
                  Prepared for {clientName} · VIP Passcode #{vipPasscode}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsContractModalOpen(false)}
                className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-xs text-zinc-300"
              >
                Close
              </button>
            </div>

            <div className="space-y-2.5">
              <p className="text-xs font-semibold text-zinc-300">
                Approved 3D Spatial Pin Upgrades ({pins.length})
              </p>
              <div className="divide-y divide-white/10 rounded-xl bg-[#0A0A0A] border border-white/10 px-4">
                {pins.map((pin) => (
                  <div
                    key={pin.id}
                    className="py-2.5 flex items-center justify-between gap-3 text-xs"
                  >
                    <div>
                      <p className="font-medium text-white">{pin.title}</p>
                      <p className="text-zinc-400">{pin.afterLabel}</p>
                    </div>
                    <span className="font-mono tabular-nums font-semibold text-[#10B981] whitespace-nowrap">
                      +${pin.priceDelta.toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-4 rounded-xl bg-[#0A0A0A] border border-white/10 space-y-1.5 font-mono text-xs tabular-nums">
              <div className="flex justify-between text-zinc-400">
                <span>Base Architectural Contract</span>
                <span>${budgetSummary.baseBudget.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-[#10B981]">
                <span>Approved Spatial Pin Upgrades ({budgetSummary.approvedPinCount})</span>
                <span>+${budgetSummary.approvedUpgrades.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm font-bold text-white pt-2 border-t border-white/10">
                <span>Total Approved Project Budget</span>
                <span>${budgetSummary.totalApprovedBudget.toLocaleString()}</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => window.print()}
                className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-medium text-white transition-colors"
              >
                Export 1-Page PDF Contract
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsContractModalOpen(false);
                  showTransientBanner(
                    `Signed off $${budgetSummary.totalApprovedBudget.toLocaleString()} contract for ${clientName}.`
                  );
                }}
                className="px-4 py-2 rounded-lg bg-[#10B981] text-[#0A0A0A] text-xs font-semibold hover:bg-[#0ea572] transition-colors"
              >
                Complete VIP Retainer Sign-Off
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
