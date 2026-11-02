import React from 'react';
import { ShieldCheck, KeyRound, Lock } from 'lucide-react';

export interface DesignerPinBadgeProps {
  onClick?: () => void;
  hasActivePin?: boolean;
  className?: string;
}

export const DesignerPinBadge: React.FC<DesignerPinBadgeProps> = ({
  onClick,
  hasActivePin = false,
  className = '',
}) => {
  return (
    <button
      onClick={onClick}
      type="button"
      className={`group flex items-center gap-1.5 px-3 py-1.5 rounded-xl backdrop-blur-xl border transition-all text-xs font-mono cursor-pointer ${
        hasActivePin
          ? 'bg-[#14120e]/90 border-[#D4B483]/40 text-[#D4B483] hover:border-[#D4B483] hover:bg-[#1c1914]'
          : 'bg-[#0a0a0a]/90 border-white/10 hover:border-white/25 text-zinc-300 hover:text-white'
      } ${className}`}
      title={hasActivePin ? 'PIN Access Code Active' : 'Configure PIN Access Code'}
    >
      {hasActivePin ? (
        <>
          <ShieldCheck className="w-3.5 h-3.5 text-[#E5C158] group-hover:scale-110 transition-transform" />
          <span className="tracking-wider">PIN SECURED</span>
        </>
      ) : (
        <>
          <Lock className="w-3.5 h-3.5 text-[#D4B483] group-hover:scale-110 transition-transform" />
          <span className="tracking-wider">ACCESS CODE</span>
        </>
      )}
    </button>
  );
};

