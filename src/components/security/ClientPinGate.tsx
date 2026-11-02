import React, { useState, useEffect } from 'react';
import { AlertCircle, ArrowLeft, Check, CheckCircle2, X, Sparkles, MessageSquare, Plus } from 'lucide-react';
import {
  getPublicProjectMeta,
  approveProject,
  getProjectApprovals,
  verifyProjectPin,
  type ProjectApproval,
} from '../../lib/security/pin-client';
import { PinUnlockScreen } from './PinUnlockScreen';

export interface ClientPinGateProps {
  children: React.ReactNode | ((unlockedModelUrl: string | null) => React.ReactNode);
  projectId?: string;
  onModelUnlocked?: (modelUrl: string, title?: string) => void;
  onUnlock?: (modelUrl: string, title?: string) => void;
}

interface ClientApprovalHudProps {
  projectId: string;
  projectTitle?: string;
}

const ClientApprovalHud: React.FC<ClientApprovalHudProps> = ({ projectId, projectTitle }) => {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [approvals, setApprovals] = useState<ProjectApproval[]>([]);
  const [clientName, setClientName] = useState<string>('');
  const [note, setNote] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isAddingNew, setIsAddingNew] = useState<boolean>(false);

  useEffect(() => {
    let mounted = true;
    getProjectApprovals(projectId).then((list) => {
      if (mounted) setApprovals(list);
    });
    return () => {
      mounted = false;
    };
  }, [projectId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = clientName.trim();
    if (!cleanName) {
      setError('Please enter your name for sign-off verification');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      const res = await approveProject({
        projectId,
        clientName: cleanName,
        note: note.trim() || undefined,
      });

      setApprovals(res.approvals);
      setClientName('');
      setNote('');
      setIsAddingNew(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to record approval';
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const isApproved = approvals.length > 0;
  const latestApproval = isApproved ? approvals[approvals.length - 1] : null;

  return (
    <div className="fixed bottom-6 right-6 z-50 select-none font-sans">
      {/* Compact Sign-off Popover */}
      {isOpen && (
        <div className="absolute bottom-full right-0 mb-3 w-80 sm:w-88 max-w-[calc(100vw-2.5rem)] bg-[#0e0d0b]/95 border border-[#D4B483]/30 rounded-2xl p-5 shadow-[0_20px_60px_rgba(0,0,0,0.95)] backdrop-blur-xl flex flex-col gap-3.5">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <div>
              <span className="text-[10px] font-mono uppercase tracking-[0.25em] text-[#D4B483] block">
                CLIENT SIGN-OFF HUD
              </span>
              <h4 className="text-sm font-medium text-[#F5EFE6] truncate max-w-[220px]">
                {projectTitle || 'Architectural Review'}
              </h4>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 text-stone-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Body: Either Receipt View or Form View */}
          {isApproved && !isAddingNew && latestApproval ? (
            <div className="flex flex-col gap-3">
              <div className="p-3.5 rounded-xl bg-emerald-950/30 border border-emerald-500/30 flex flex-col gap-2">
                <div className="flex items-center gap-2 text-emerald-400 text-xs font-mono font-medium">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>Design Sign-Off Recorded</span>
                </div>
                <div className="text-xs text-stone-300 font-sans">
                  Approved by <strong className="text-white font-semibold">{latestApproval.clientName}</strong>
                </div>
                <div className="text-[10px] font-mono text-stone-400">
                  {new Date(latestApproval.approvedAt).toLocaleDateString()} at{' '}
                  {new Date(latestApproval.approvedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
                {latestApproval.note && (
                  <p className="text-xs text-stone-300 italic bg-black/40 px-2.5 py-1.5 rounded-lg border border-white/5 break-words">
                    "{latestApproval.note}"
                  </p>
                )}
              </div>

              {approvals.length > 1 && (
                <span className="text-[11px] font-mono text-stone-500 text-center">
                  Total approvals logged: {approvals.length}
                </span>
              )}

              <button
                onClick={() => setIsAddingNew(true)}
                className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-mono text-stone-300 hover:text-white transition-colors cursor-pointer border border-white/5"
              >
                <Plus className="w-3.5 h-3.5 text-[#D4B483]" />
                Add Another Sign-Off
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <div>
                <label className="text-[10px] font-mono uppercase tracking-wider text-stone-400 block mb-1">
                  Your Full Name *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Jane Doe (Client)"
                  value={clientName}
                  onChange={(e) => {
                    setClientName(e.target.value);
                    if (error) setError(null);
                  }}
                  autoFocus
                  disabled={isSubmitting}
                  className="w-full px-3 py-2 bg-[#070605] border border-white/15 focus:border-[#D4B483] focus:ring-1 focus:ring-[#D4B483] rounded-xl text-xs font-mono text-[#F5EFE6] placeholder:text-stone-600 outline-none transition-all"
                />
              </div>

              <div>
                <label className="text-[10px] font-mono uppercase tracking-wider text-stone-400 block mb-1">
                  Note / Comments (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Approved layout & finish selections"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  disabled={isSubmitting}
                  className="w-full px-3 py-2 bg-[#070605] border border-white/15 focus:border-[#D4B483] focus:ring-1 focus:ring-[#D4B483] rounded-xl text-xs font-mono text-[#F5EFE6] placeholder:text-stone-600 outline-none transition-all"
                />
              </div>

              {error && (
                <div className="text-[11px] font-mono text-rose-400 bg-rose-950/40 border border-rose-800/40 px-3 py-1.5 rounded-lg">
                  {error}
                </div>
              )}

              <div className="flex items-center gap-2 pt-1">
                {isApproved && isAddingNew && (
                  <button
                    type="button"
                    onClick={() => setIsAddingNew(false)}
                    className="py-2.5 px-3 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-mono text-stone-400 hover:text-white transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                )}
                <button
                  type="submit"
                  disabled={isSubmitting || !clientName.trim()}
                  className="flex-1 py-2.5 bg-gradient-to-r from-[#D4B483] to-[#E5C158] hover:from-[#e0c192] hover:to-[#edd16f] disabled:opacity-40 disabled:cursor-not-allowed text-[#070605] font-semibold text-xs uppercase tracking-[0.18em] rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md"
                >
                  {isSubmitting ? (
                    <div className="w-3.5 h-3.5 border-2 border-[#070605] border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      Confirm Approval
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* Floating Pill Button */}
      {isApproved ? (
        <button
          onClick={() => setIsOpen((prev) => !prev)}
          title="Click to view client design sign-off"
          className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-[#0e0d0b]/90 hover:bg-[#161410] border border-emerald-500/40 hover:border-emerald-500/70 text-emerald-300 text-xs font-mono shadow-[0_10px_35px_rgba(0,0,0,0.85)] backdrop-blur-md transition-all cursor-pointer group"
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-400 group-hover:scale-110 transition-transform" />
          <span className="font-medium tracking-wide text-white">✅ Design Approved</span>
          {approvals.length > 1 && (
            <span className="px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px]">
              {approvals.length}
            </span>
          )}
        </button>
      ) : (
        <button
          onClick={() => setIsOpen((prev) => !prev)}
          title="Sign off and approve this 3D design"
          className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-[#0e0d0b]/90 hover:bg-[#161410] border border-[#D4B483]/50 hover:border-[#D4B483] text-[#F5EFE6] text-xs font-mono shadow-[0_10px_35px_rgba(0,0,0,0.85)] backdrop-blur-md transition-all cursor-pointer group"
        >
          <Check className="w-4 h-4 text-[#D4B483] group-hover:scale-110 transition-transform" />
          <span className="tracking-wide">Approve Design</span>
        </button>
      )}
    </div>
  );
};

export const ClientPinGate: React.FC<ClientPinGateProps> = ({
  children,
  projectId: explicitProjectId,
  onModelUnlocked,
  onUnlock,
}) => {
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [projectTitle, setProjectTitle] = useState<string>('');
  const [isLoadingMeta, setIsLoadingMeta] = useState<boolean>(false);
  const [metaError, setMetaError] = useState<string | null>(null);

  const [isUnlocked, setIsUnlocked] = useState<boolean>(false);
  const [unlockedModelUrl, setUnlockedModelUrl] = useState<string | null>(null);

  const notifyUnlocked = (url: string, title?: string) => {
    if (onModelUnlocked) {
      onModelUnlocked(url, title || projectTitle);
    }
    if (onUnlock) {
      onUnlock(url, title || projectTitle);
    }
  };

  const handleUnlocked = (modelUrl: string, title?: string) => {
    setUnlockedModelUrl(modelUrl);
    setIsUnlocked(true);
    notifyUnlocked(modelUrl, title);
  };

  useEffect(() => {
    let id = explicitProjectId;
    if (!id && typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      id = params.get('project') || undefined;
    }

    if (!id) {
      setActiveProjectId(null);
      setIsUnlocked(true);
      return;
    }

    setActiveProjectId(id);
    setIsLoadingMeta(true);
    setMetaError(null);

    getPublicProjectMeta(id)
      .then((meta) => {
        setProjectTitle(meta.title);
        if (!meta.requiresPin) {
          verifyProjectPin(id, '')
            .then((res) => {
              if (res.verified && res.modelUrl) {
                handleUnlocked(res.modelUrl, res.title || meta.title);
              } else {
                setIsUnlocked(true);
              }
            })
            .catch(() => {
              setIsUnlocked(true);
            });
        }
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : 'Project not found';
        setMetaError(msg);
      })
      .finally(() => {
        setIsLoadingMeta(false);
      });
  }, [explicitProjectId]);

  const handleClearProject = () => {
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.delete('project');
      window.history.pushState({}, '', url.toString());
    }
    setActiveProjectId(null);
    setIsUnlocked(true);
    setUnlockedModelUrl(null);
  };

  // If there's no project in URL, or project has been unlocked, render children
  if (!activeProjectId || isUnlocked) {
    return (
      <>
        {typeof children === 'function' ? children(unlockedModelUrl) : children}
        {activeProjectId && isUnlocked && (
          <ClientApprovalHud
            projectId={activeProjectId}
            projectTitle={projectTitle}
          />
        )}
      </>
    );
  }

  // Loading public metadata
  if (isLoadingMeta) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#070605] text-stone-100 select-none">
        <div className="w-12 h-12 rounded-full border-2 border-[#D4B483]/20 border-t-[#D4B483] animate-spin mb-4" />
        <span className="text-xs font-mono uppercase tracking-[0.25em] text-[#D4B483]">
          Connecting to Atelier View Showroom...
        </span>
      </div>
    );
  }

  // Error loading metadata (e.g. invalid project ID)
  if (metaError) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-[#070605] text-stone-100 select-none">
        <div className="w-full max-w-md bg-[#0e0d0b] border border-rose-800/40 rounded-3xl p-8 flex flex-col items-center text-center shadow-2xl">
          <div className="w-12 h-12 rounded-2xl bg-rose-950/50 border border-rose-800/40 flex items-center justify-center text-rose-400 mb-4">
            <AlertCircle className="w-6 h-6" />
          </div>
          <span className="text-[10px] font-mono uppercase tracking-[0.25em] text-rose-400 mb-1">
            ACCESS ERROR
          </span>
          <h2 className="text-lg font-light tracking-wide uppercase text-white mb-2">
            Showroom Not Found
          </h2>
          <p className="text-xs text-stone-400 mb-6">
            The requested 3D project ID (#{activeProjectId}) does not exist or has expired.
          </p>
          <button
            onClick={handleClearProject}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-mono text-stone-200 hover:text-white transition-all cursor-pointer border border-white/10"
          >
            <ArrowLeft className="w-4 h-4 text-[#D4B483]" />
            Return to Studio
          </button>
        </div>
      </div>
    );
  }

  // Display the PIN unlock screen
  return (
    <PinUnlockScreen
      projectId={activeProjectId}
      projectTitle={projectTitle}
      onUnlocked={handleUnlocked}
      onCancel={handleClearProject}
    />
  );
};

