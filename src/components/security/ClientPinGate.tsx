import React, { useState, useEffect } from 'react';
import { AlertCircle, ArrowLeft } from 'lucide-react';
import { getPublicProjectMeta } from '../../lib/security/pin-client';
import { PinUnlockScreen } from './PinUnlockScreen';

export interface ClientPinGateProps {
  children: React.ReactNode | ((unlockedModelUrl: string | null) => React.ReactNode);
  projectId?: string;
  onModelUnlocked?: (modelUrl: string, title?: string) => void;
}

export const ClientPinGate: React.FC<ClientPinGateProps> = ({
  children,
  projectId: explicitProjectId,
  onModelUnlocked,
}) => {
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [projectTitle, setProjectTitle] = useState<string>('');
  const [isLoadingMeta, setIsLoadingMeta] = useState<boolean>(false);
  const [metaError, setMetaError] = useState<string | null>(null);

  const [isUnlocked, setIsUnlocked] = useState<boolean>(false);
  const [unlockedModelUrl, setUnlockedModelUrl] = useState<string | null>(null);

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
          setIsUnlocked(true);
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

  const handleUnlocked = (modelUrl: string, title?: string) => {
    setUnlockedModelUrl(modelUrl);
    setIsUnlocked(true);
    if (onModelUnlocked) {
      onModelUnlocked(modelUrl, title || projectTitle);
    }
  };

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
    if (typeof children === 'function') {
      return <>{children(unlockedModelUrl)}</>;
    }
    return <>{children}</>;
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

