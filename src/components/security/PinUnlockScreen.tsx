import React, { useState, useRef, useEffect } from 'react';
import { Lock, Unlock, KeyRound, AlertCircle, ArrowRight, ShieldCheck, Sparkles } from 'lucide-react';
import { verifyProjectPin } from '../../lib/security/pin-client';

export interface PinUnlockScreenProps {
  projectId: string;
  projectTitle?: string;
  onUnlocked: (modelUrl: string, title?: string) => void;
  onCancel?: () => void;
}

export const PinUnlockScreen: React.FC<PinUnlockScreenProps> = ({
  projectId,
  projectTitle,
  onUnlocked,
  onCancel,
}) => {
  const [pin, setPin] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState<boolean>(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleVerify = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const clean = pin.trim();
    if (clean.length < 4 || clean.length > 6) {
      setErrorMessage('Access code must be 4 to 6 digits');
      return;
    }

    try {
      setIsLoading(true);
      setErrorMessage(null);
      const res = await verifyProjectPin(projectId, clean);

      if (res.verified && res.modelUrl) {
        setIsSuccess(true);
        try {
          sessionStorage.setItem(`atelier_unlocked_${projectId}`, 'true');
        } catch {
          // sessionStorage may fail in private mode
        }
        setTimeout(() => {
          onUnlocked(res.modelUrl!, res.title || projectTitle);
        }, 600);
      } else {
        setErrorMessage(res.error || 'Invalid access code. Please verify with your designer.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to verify access code';
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, '').slice(0, 6);
    setPin(val);
    if (errorMessage) setErrorMessage(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-[#070605]/95 backdrop-blur-2xl text-stone-100 select-none">
      {/* Background ambient lighting */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-[#D4B483]/10 rounded-full blur-[140px]" />
      </div>

      <div className="relative w-full max-w-md bg-[#0e0d0b]/90 border border-[#D4B483]/30 rounded-3xl p-8 shadow-[0_25px_70px_rgba(0,0,0,0.95)] flex flex-col items-center text-center">
        {/* Monogram / Header Icon */}
        <div className="w-14 h-14 rounded-2xl bg-[#14120e] border border-[#D4B483]/40 flex items-center justify-center shadow-[0_0_30px_rgba(212,180,131,0.2)] mb-5">
          {isSuccess ? (
            <Unlock className="w-6 h-6 text-[#E5C158] animate-bounce" />
          ) : (
            <Lock className="w-6 h-6 text-[#D4B483]" />
          )}
        </div>

        {/* Studio Branding */}
        <span className="text-[10px] font-mono uppercase tracking-[0.35em] text-[#D4B483]/80 mb-1">
          ATELIER VIEW · DIGITAL ACCESS GATE
        </span>
        <h2 className="text-xl md:text-2xl font-light tracking-[0.18em] uppercase text-[#F5EFE6] drop-shadow-md">
          {projectTitle || 'Private Spatial Monograph'}
        </h2>
        <p className="text-xs tracking-wider text-stone-400 mt-2 mb-6 font-sans">
          This 3D architectural showroom is password protected. Enter your confidential PIN code to view the space.
        </p>

        {/* PIN Entry Form */}
        <form onSubmit={handleVerify} className="w-full flex flex-col items-center gap-5">
          <div className="relative w-full">
            <input
              ref={inputRef}
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="one-time-code"
              placeholder="••••"
              value={pin}
              onChange={handleInputChange}
              maxLength={6}
              disabled={isLoading || isSuccess}
              className="w-full h-16 bg-[#070605] border border-white/15 focus:border-[#D4B483] focus:ring-2 focus:ring-[#D4B483]/30 rounded-2xl text-center text-2xl md:text-3xl font-mono tracking-[0.5em] text-[#F5EFE6] placeholder:text-stone-700 outline-none transition-all shadow-inner"
            />
            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-stone-500">
              <KeyRound className="w-5 h-5 text-[#D4B483]/40" />
            </div>
          </div>

          {/* Error Message */}
          {errorMessage && (
            <div className="flex items-center gap-2 text-xs font-mono text-rose-400 bg-rose-950/40 border border-rose-800/40 px-3.5 py-2 rounded-xl animate-shake">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Success Message */}
          {isSuccess && (
            <div className="flex items-center gap-2 text-xs font-mono text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 px-3.5 py-2 rounded-xl">
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <span>Access Verified · Opening 3D Showroom...</span>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={pin.length < 4 || isLoading || isSuccess}
            className="w-full h-12 bg-gradient-to-r from-[#D4B483] to-[#E5C158] hover:from-[#e0c192] hover:to-[#edd16f] disabled:opacity-40 disabled:cursor-not-allowed text-[#070605] font-semibold text-xs uppercase tracking-[0.2em] rounded-xl flex items-center justify-center gap-2 shadow-[0_10px_25px_rgba(212,180,131,0.25)] transition-all cursor-pointer"
          >
            {isLoading ? (
              <div className="w-4 h-4 border-2 border-[#070605] border-t-transparent rounded-full animate-spin" />
            ) : isSuccess ? (
              <>
                <Sparkles className="w-4 h-4 text-[#070605]" />
                Showroom Unlocked
              </>
            ) : (
              <>
                Open 3D Model
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Footer info / Cancel option */}
        <div className="mt-6 flex items-center justify-between w-full text-[11px] font-mono text-stone-500 pt-4 border-t border-white/5">
          <span>PROJECT: #{projectId.slice(0, 10)}</span>
          {onCancel && (
            <button
              onClick={onCancel}
              className="text-stone-400 hover:text-white transition-colors cursor-pointer"
            >
              Back to Studio
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

