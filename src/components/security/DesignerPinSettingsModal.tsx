import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  Lock,
  KeyRound,
  Copy,
  Check,
  RefreshCw,
  ExternalLink,
  Edit2,
  Save,
  Eye,
  EyeOff,
  FolderOpen,
  Shield,
  Layers,
  CheckCircle2,
  Clock,
} from 'lucide-react';
import type { ProjectRecord } from '../../types/project';
import {
  getMyProjects,
  saveProjectWithPin,
  buildClientShareUrl,
  isValidPin,
  getOrCreateDesignerToken,
} from '../../lib/security/pin-client';

export interface DesignerPinSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectModel?: (modelUrl: string, title: string) => void;
}

export const DesignerPinSettingsModal: React.FC<DesignerPinSettingsModalProps> = ({
  isOpen,
  onClose,
  onSelectModel,
}) => {
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Inline editing state for changing PIN
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editedPin, setEditedPin] = useState<string>('');
  const [isSavingEdit, setIsSavingEdit] = useState<boolean>(false);

  // Copied feedback map: key is `${projectId}_${type}`
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Visible PINs toggle
  const [visiblePins, setVisiblePins] = useState<Record<string, boolean>>({});

  const designerToken = getOrCreateDesignerToken();

  const loadProjects = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await getMyProjects(designerToken);
      setProjects(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load projects';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [designerToken]);

  useEffect(() => {
    if (isOpen) {
      loadProjects();
    }
  }, [isOpen, loadProjects]);

  if (!isOpen) return null;

  const togglePinVisibility = (projectId: string) => {
    setVisiblePins((prev) => ({ ...prev, [projectId]: !prev[projectId] }));
  };

  const startEdit = (proj: ProjectRecord) => {
    setEditingProjectId(proj.projectId);
    setEditedPin(proj.pinCode);
  };

  const cancelEdit = () => {
    setEditingProjectId(null);
    setEditedPin('');
  };

  const handleSavePin = async (proj: ProjectRecord) => {
    if (!isValidPin(editedPin)) {
      alert('PIN must be 4 to 6 numeric digits');
      return;
    }

    try {
      setIsSavingEdit(true);
      await saveProjectWithPin({
        projectId: proj.projectId,
        title: proj.title,
        modelUrl: proj.modelUrl,
        pinCode: editedPin.trim(),
        designerToken,
      });

      // Update local state
      setProjects((prev) =>
        prev.map((p) =>
          p.projectId === proj.projectId
            ? { ...p, pinCode: editedPin.trim(), updatedAt: Date.now() }
            : p
        )
      );
      setEditingProjectId(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update PIN';
      alert(msg);
    } finally {
      setIsSavingEdit(false);
    }
  };

  const copyToClipboard = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2500);
    } catch (err) {
      console.error('Failed to copy', err);
    }
  };

  const handleCopyLinkAndPin = (proj: ProjectRecord) => {
    const shareUrl = buildClientShareUrl(proj.projectId);
    const text = [
      `ATELIER VIEW · 3D ARCHITECTURAL ACCESS`,
      `Project: ${proj.title}`,
      `Private Link: ${shareUrl}`,
      `Access PIN: ${proj.pinCode}`,
      `--------------------------------------`,
      `Confidential client access code. Do not redistribute.`,
    ].join('\n');

    copyToClipboard(text, `${proj.projectId}_all`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md text-stone-100 select-none">
      <div className="relative w-full max-w-2xl bg-[#0e0d0b] border border-[#D4B483]/30 rounded-3xl p-7 shadow-[0_30px_70px_rgba(0,0,0,0.95)] max-h-[85vh] flex flex-col overflow-hidden">
        {/* Glow ambient background */}
        <div className="absolute top-0 right-10 w-64 h-64 bg-[#D4B483]/10 rounded-full blur-[90px] pointer-events-none" />

        {/* Modal Header */}
        <div className="flex items-center justify-between pb-5 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#171512] border border-[#D4B483]/30 flex items-center justify-center">
              <KeyRound className="w-5 h-5 text-[#D4B483]" />
            </div>
            <div>
              <span className="text-[10px] font-mono uppercase tracking-[0.25em] text-[#D4B483]">
                DESIGNER CONTROL SUITE
              </span>
              <h3 className="text-base font-medium tracking-wide text-[#F5EFE6]">
                My Models &amp; Access Codes
              </h3>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={loadProjects}
              title="Refresh project list"
              disabled={isLoading}
              className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-stone-400 hover:text-white transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-[#D4B483]' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-stone-400 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Subheader / Designer identity bar */}
        <div className="py-3 px-4 bg-[#14120e] border-b border-white/5 flex items-center justify-between text-xs font-mono shrink-0">
          <div className="flex items-center gap-2 text-stone-400">
            <Shield className="w-3.5 h-3.5 text-[#D4B483]" />
            <span>DESIGNER KEY:</span>
            <span className="text-[#D4B483]">{designerToken.slice(0, 16)}...</span>
          </div>
          <span className="text-[11px] text-stone-400">
            {projects.length} {projects.length === 1 ? 'Model Secured' : 'Models Secured'}
          </span>
        </div>

        {/* Project List Content */}
        <div className="flex-1 overflow-y-auto py-4 space-y-3.5 pr-1">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-stone-400">
              <div className="w-8 h-8 border-2 border-[#D4B483]/30 border-t-[#D4B483] rounded-full animate-spin" />
              <span className="text-xs font-mono tracking-widest uppercase">
                Loading Protected Showrooms...
              </span>
            </div>
          ) : error ? (
            <div className="p-4 bg-rose-950/40 border border-rose-800/40 rounded-2xl text-xs font-mono text-rose-300">
              {error}
            </div>
          ) : projects.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-stone-500">
                <FolderOpen className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-medium text-stone-300">No Protected Models Yet</h4>
              <p className="text-xs text-stone-500 max-w-sm">
                When you load a 3D model, click "Set Access Code" to assign a PIN code and generate a private client link.
              </p>
            </div>
          ) : (
            projects.map((proj) => {
              const isEditing = editingProjectId === proj.projectId;
              const isPinVisible = Boolean(visiblePins[proj.projectId]);
              const shareUrl = buildClientShareUrl(proj.projectId);

              return (
                <div
                  key={proj.projectId}
                  className="bg-[#12100d] border border-white/10 hover:border-[#D4B483]/40 rounded-2xl p-4.5 transition-all flex flex-col gap-3 shadow-md"
                >
                  {/* Top row: Title + Actions */}
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-[#D4B483]/10 text-[#D4B483] border border-[#D4B483]/20">
                          #{proj.projectId.slice(0, 8)}
                        </span>
                        <span className="text-[11px] font-mono text-stone-500">
                          {new Date(proj.updatedAt || proj.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      <h4 className="text-sm font-medium text-[#F5EFE6] truncate tracking-wide">
                        {proj.title}
                      </h4>
                    </div>

                    {/* View in 3D Button */}
                    {onSelectModel && (
                      <button
                        onClick={() => {
                          onSelectModel(proj.modelUrl, proj.title);
                          onClose();
                        }}
                        className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-[#D4B483]/20 border border-white/10 hover:border-[#D4B483]/40 text-xs font-mono text-[#D4B483] transition-all cursor-pointer"
                      >
                        <Layers className="w-3.5 h-3.5" />
                        Load Viewport
                      </button>
                    )}
                  </div>

                  {/* Middle row: PIN Code Manager */}
                  <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-[#080706] rounded-xl border border-white/5">
                    <div className="flex items-center gap-2.5">
                      <Lock className="w-3.5 h-3.5 text-[#D4B483]" />
                      <span className="text-[11px] font-mono uppercase tracking-wider text-stone-400">
                        PIN:
                      </span>

                      {isEditing ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            inputMode="numeric"
                            value={editedPin}
                            onChange={(e) =>
                              setEditedPin(e.target.value.replace(/\D/g, '').slice(0, 6))
                            }
                            maxLength={6}
                            className="w-24 h-7 px-2 bg-[#14120e] border border-[#D4B483] rounded-lg text-sm font-mono tracking-widest text-[#E5C158] outline-none text-center"
                            autoFocus
                          />
                          <button
                            onClick={() => handleSavePin(proj)}
                            disabled={isSavingEdit || editedPin.length < 4}
                            className="flex items-center gap-1 px-2.5 py-1 bg-[#D4B483] text-[#070605] rounded-lg text-xs font-mono font-medium hover:bg-amber-300 transition-colors cursor-pointer"
                          >
                            <Save className="w-3 h-3" />
                            Save
                          </button>
                          <button
                            onClick={cancelEdit}
                            className="px-2 py-1 text-xs font-mono text-stone-400 hover:text-white transition-colors cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-mono font-bold tracking-[0.25em] text-[#E5C158]">
                            {isPinVisible ? proj.pinCode : '••••'}
                          </span>
                          <button
                            type="button"
                            onClick={() => togglePinVisibility(proj.projectId)}
                            className="text-stone-500 hover:text-stone-300 transition-colors cursor-pointer"
                            title={isPinVisible ? 'Hide PIN' : 'Reveal PIN'}
                          >
                            {isPinVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                          <button
                            onClick={() => startEdit(proj)}
                            className="text-stone-500 hover:text-[#D4B483] transition-colors ml-1 cursor-pointer"
                            title="Change PIN Code"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Copy Link + Code Button */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleCopyLinkAndPin(proj)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-mono text-stone-300 hover:text-white transition-colors cursor-pointer"
                      >
                        {copiedKey === `${proj.projectId}_all` ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                            <span className="text-emerald-400">Copied!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5 text-[#D4B483]" />
                            Copy Link + PIN
                          </>
                        )}
                      </button>
                      <a
                        href={shareUrl}
                        target="_blank"
                        rel="noreferrer"
                        title="Open client link"
                        className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-stone-400 hover:text-white transition-colors cursor-pointer"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  </div>

                  {/* Bottom row: Client Approval Status & Sign-off Receipt */}
                  {proj.approvals && proj.approvals.length > 0 ? (
                    <div className="flex flex-col gap-1.5 p-3 rounded-xl bg-emerald-950/25 border border-emerald-500/30">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          <span className="text-xs font-mono text-emerald-300 truncate">
                            ✅ Approved by <strong className="text-white font-semibold">{proj.approvals[proj.approvals.length - 1].clientName}</strong>
                          </span>
                        </div>
                        <span className="text-[10px] font-mono text-stone-400 shrink-0">
                          • {new Date(proj.approvals[proj.approvals.length - 1].approvedAt).toLocaleDateString()} {new Date(proj.approvals[proj.approvals.length - 1].approvedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      {proj.approvals[proj.approvals.length - 1].note && (
                        <p className="text-xs text-stone-300 italic bg-black/30 px-2.5 py-1.5 rounded-lg border border-white/5 break-words">
                          "{proj.approvals[proj.approvals.length - 1].note}"
                        </p>
                      )}
                      {proj.approvals.length > 1 && (
                        <span className="text-[10px] font-mono text-emerald-400/80">
                          +{proj.approvals.length - 1} prior {proj.approvals.length === 2 ? 'sign-off' : 'sign-offs'}
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center justify-between p-2.5 rounded-xl bg-[#080706] border border-white/5 text-xs font-mono">
                      <div className="flex items-center gap-2 text-stone-400">
                        <Clock className="w-3.5 h-3.5 text-amber-500/70" />
                        <span>⏳ Pending Client Approval</span>
                      </div>
                      <span className="text-[10px] text-stone-600 uppercase tracking-wider">
                        Awaiting Sign-off
                      </span>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Modal Footer */}
        <div className="pt-4 border-t border-white/10 flex items-center justify-between shrink-0">
          <span className="text-[11px] font-mono text-stone-500">
            Protected projects survive server restarts via persistent disk storage.
          </span>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs text-stone-300 hover:text-white transition-all font-mono cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

