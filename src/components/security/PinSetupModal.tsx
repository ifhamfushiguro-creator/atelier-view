import React, { useState, useEffect } from 'react';
import {
  X,
  Lock,
  Sparkles,
  Copy,
  Check,
  ShieldCheck,
  ExternalLink,
  Eye,
  EyeOff,
} from 'lucide-react';
import {
  generateRandomPin,
  isValidPin,
  saveProjectWithPin,
  buildClientShareUrl,
} from '../../lib/security/pin-client';

export interface PinSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  modelUrl: string;
  defaultTitle?: string;
  projectId?: string;
  onSaved?: (savedProject: {
    projectId: string;
    title: string;
    pinCode: string;
    shareUrl: string;
  }) => void;
}

export const PinSetupModal: React.FC<PinSetupModalProps> = ({
  isOpen,
  onClose,
  modelUrl,
  defaultTitle = 'Architectural Model',
  projectId: initialProjectId,
  onSaved,
}) => {
  const [title, setTitle] = useState<string>(defaultTitle);
  const [pinCode, setPinCode] = useState<string>('');
  const [showPin, setShowPin] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Result state after saving
  const [savedData, setSavedData] = useState<{
    projectId: string;
    title: string;
    pinCode: string;
    shareUrl: string;
  } | null>(null);

  const [copiedType, setCopiedType] = useState<'all' | 'link' | 'code' | null>(null);

  useEffect(() => {
    if (isOpen) {
      setTitle(defaultTitle || 'Architectural Model');
      setError(null);
      setCopiedType(null);
      if (!pinCode) {
        setPinCode(generateRandomPin(4));
      }
    }
  }, [isOpen, defaultTitle]);

  if (!isOpen) return null;

  const handleGeneratePin = () => {
    setPinCode(generateRandomPin(4));
    setError(null);
  };

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanPin = pinCode.trim();

    if (!isValidPin(cleanPin)) {
      setError('PIN must be 4 to 6 numeric digits');
      return;
    }

    if (!modelUrl) {
      setError('No active 3D model found to protect');
      return;
    }

    try {
      setIsSaving(true);
      setError(null);

      const res = await saveProjectWithPin({
        projectId: initialProjectId,
        title: title.trim() || 'Untitled Architectural Space',
        modelUrl,
        pinCode: cleanPin,
      });

      const shareUrl = buildClientShareUrl(res.projectId);
      const output = {
        projectId: res.projectId,
        title: res.title,
        pinCode: res.pinCode,
        shareUrl,
      };

      setSavedData(output);
      if (onSaved) onSaved(output);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save access code';
      setError(msg);
    } finally {
      setIsSaving(false);
    }
  };

  const copyToClipboard = async (text: string, type: 'all' | 'link' | 'code') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedType(type);
      setTimeout(() => setCopiedType(null), 2500);
    } catch (err) {
      console.error('Failed to copy to clipboard', err);
    }
  };

  const handleCopyAll = () => {
    if (!savedData) return;
    const clientMessage = [
      `ATELIER VIEW · 3D ARCHITECTURAL ACCESS`,
      `Project: ${savedData.title}`,
      `Private Link: ${savedData.shareUrl}`,
      `Access PIN: ${savedData.pinCode}`,
      `--------------------------------------`,
      `Confidential client access code. Do not redistribute.`,
    ].join('\n');

    copyToClipboard(clientMessage, 'all');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md text-stone-100 select-none">
      <div className="relative w-full max-w-lg bg-[#0e0d0b] border border-[#D4B483]/30 rounded-3xl p-7 shadow-[0_25px_60px_rgba(0,0,0,0.9)] overflow-hidden">
        {/* Glow corner */}
        <div className="absolute top-0 right-0 w-44 h-44 bg-[#D4B483]/10 rounded-full blur-[70px] pointer-events-none" />

        {/* Modal Header */}
        <div className="flex items-center justify-between pb-5 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#171512] border border-[#D4B483]/30 flex items-center justify-center">
              <Lock className="w-5 h-5 text-[#D4B483]" />
            </div>
            <div>
              <span className="text-[10px] font-mono uppercase tracking-[0.25em] text-[#D4B483]">
                PROJECT ACCESS CONTROL
              </span>
              <h3 className="text-base font-medium tracking-wide text-[#F5EFE6]">
                {savedData ? 'Access Code Active' : 'Set Project Access Code (PIN)'}
              </h3>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-stone-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        {!savedData ? (
          <form onSubmit={handleSave} className="flex flex-col gap-5 mt-6">
            {/* Project Title Field */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-mono uppercase tracking-[0.16em] text-stone-400">
                Project / Room Title
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. The Solenne Brickell Bay · Penthouse 42"
                className="w-full h-11 px-4 bg-[#070605] border border-white/10 focus:border-[#D4B483] rounded-xl text-xs font-sans text-stone-100 outline-none transition-all placeholder:text-stone-600"
              />
            </div>

            {/* PIN Code Field */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-mono uppercase tracking-[0.16em] text-stone-400">
                  Access Code (4–6 Digits)
                </label>
                <button
                  type="button"
                  onClick={handleGeneratePin}
                  className="flex items-center gap-1 text-[11px] font-mono text-[#D4B483] hover:text-amber-300 transition-colors cursor-pointer"
                >
                  <Sparkles className="w-3 h-3 text-[#D4B483]" />
                  Auto-Generate Code
                </button>
              </div>

              <div className="relative">
                <input
                  type={showPin ? 'text' : 'password'}
                  inputMode="numeric"
                  value={pinCode}
                  onChange={(e) => {
                    const clean = e.target.value.replace(/\D/g, '').slice(0, 6);
                    setPinCode(clean);
                    if (error) setError(null);
                  }}
                  maxLength={6}
                  placeholder="e.g. 8492"
                  className="w-full h-13 px-4 bg-[#070605] border border-white/10 focus:border-[#D4B483] rounded-xl text-xl font-mono tracking-[0.3em] text-[#F5EFE6] outline-none transition-all placeholder:text-stone-700"
                />
                <button
                  type="button"
                  onClick={() => setShowPin(!showPin)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-stone-500 hover:text-stone-300 cursor-pointer"
                >
                  {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <span className="text-[10px] font-mono text-stone-500">
                Clients will only be granted access to the 3D model after entering this exact code.
              </span>
            </div>

            {/* Error Message */}
            {error && (
              <div className="text-xs font-mono text-rose-400 bg-rose-950/40 border border-rose-800/40 px-3 py-2 rounded-xl">
                {error}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/5">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl border border-white/10 hover:border-white/25 text-xs text-stone-300 hover:text-white transition-all font-mono cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving || pinCode.length < 4}
                className="px-6 py-2.5 bg-gradient-to-r from-[#D4B483] to-[#E5C158] hover:from-[#dfc091] hover:to-[#ebcf6c] disabled:opacity-40 disabled:cursor-not-allowed text-[#070605] font-semibold text-xs uppercase tracking-[0.16em] rounded-xl flex items-center gap-2 shadow-[0_10px_25px_rgba(212,180,131,0.25)] transition-all cursor-pointer"
              >
                {isSaving ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-[#070605] border-t-transparent rounded-full animate-spin" />
                    <span>Persisting 3D Model...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4 text-[#070605]" />
                    <span>Save &amp; Generate Link</span>
                  </>
                )}
              </button>
            </div>
          </form>
        ) : (
          /* RESULT SCREEN ONCE SAVED */
          <div className="flex flex-col gap-5 mt-6">
            <div className="bg-[#14120e] border border-[#D4B483]/30 rounded-2xl p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-[#D4B483]">
                  ACCESS CODE SECURED
                </span>
                <span className="text-[11px] font-mono text-emerald-400 flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Protected
                </span>
              </div>

              {/* PIN Code Box */}
              <div className="flex items-center justify-between bg-[#070605] border border-white/10 rounded-xl px-4 py-3">
                <div>
                  <span className="text-[9px] font-mono uppercase tracking-widest text-stone-400 block mb-0.5">
                    Client PIN Code
                  </span>
                  <span className="text-2xl font-mono font-bold tracking-[0.35em] text-[#E5C158]">
                    {savedData.pinCode}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => copyToClipboard(savedData.pinCode, 'code')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-mono text-stone-300 hover:text-white transition-colors cursor-pointer"
                >
                  {copiedType === 'code' ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-400">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-[#D4B483]" />
                      Copy PIN
                    </>
                  )}
                </button>
              </div>

              {/* Sharable Link Box */}
              <div className="flex items-center justify-between bg-[#070605] border border-white/10 rounded-xl px-4 py-3">
                <div className="overflow-hidden mr-3">
                  <span className="text-[9px] font-mono uppercase tracking-widest text-stone-400 block mb-0.5">
                    Client Access Link
                  </span>
                  <span className="text-xs font-mono text-stone-300 truncate block">
                    {savedData.shareUrl}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => copyToClipboard(savedData.shareUrl, 'link')}
                  className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-mono text-stone-300 hover:text-white transition-colors cursor-pointer"
                >
                  {copiedType === 'link' ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-400">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-[#D4B483]" />
                      Copy Link
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Big Action: Copy Client Link + Code */}
            <button
              type="button"
              onClick={handleCopyAll}
              className="w-full h-12 bg-gradient-to-r from-[#D4B483] to-[#E5C158] hover:from-[#dfc091] hover:to-[#ebcf6c] text-[#070605] font-semibold text-xs uppercase tracking-[0.18em] rounded-xl flex items-center justify-center gap-2 shadow-[0_10px_25px_rgba(212,180,131,0.25)] transition-all cursor-pointer"
            >
              {copiedType === 'all' ? (
                <>
                  <Check className="w-4 h-4 text-[#070605]" />
                  Copied Link + PIN to Clipboard!
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 text-[#070605]" />
                  Copy Client Link + Code
                </>
              )}
            </button>

            <div className="flex items-center justify-between pt-2">
              <a
                href={savedData.shareUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs font-mono text-[#D4B483] hover:text-amber-200 flex items-center gap-1 transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Test Client Gate in New Tab
              </a>
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-xs text-stone-300 hover:text-white transition-all font-mono cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

