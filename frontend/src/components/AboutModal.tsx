import React from 'react';
import { Layers, ShieldCheck, HardDrive, Cpu, X, CheckCircle2 } from 'lucide-react';

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AboutModal: React.FC<AboutModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-6 relative overflow-hidden">
        {/* Background glow gradient */}
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-sky-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-500 hover:text-slate-300 p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-center space-x-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-sky-500 via-indigo-600 to-violet-600 flex items-center justify-center shadow-lg shadow-sky-500/20 flex-shrink-0">
            <Layers className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white tracking-tight">Payment & Bank Reconciliation</h2>
            <div className="flex items-center space-x-2 mt-0.5">
              <span className="text-xs text-sky-400 font-semibold">v0.1.0 Desktop Edition</span>
              <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-800 rounded-full">
                Production Ready
              </span>
            </div>
          </div>
        </div>

        {/* Description */}
        <p className="text-xs text-slate-300 leading-relaxed bg-slate-950/60 border border-slate-800/80 rounded-xl p-3.5">
          Local-first, privacy-focused payment screenshot scanner, multi-provider OCR extractor, and deterministic bank statement reconciliation desktop application.
        </p>

        {/* System & Architecture Highlights */}
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="bg-slate-950/80 border border-slate-800/80 rounded-xl p-3 space-y-1">
            <div className="flex items-center space-x-1.5 text-slate-400 font-medium">
              <Cpu className="w-3.5 h-3.5 text-sky-400" />
              <span>Core Engine</span>
            </div>
            <p className="text-slate-200 font-semibold text-[11px]">FastAPI + Tauri v2</p>
          </div>

          <div className="bg-slate-950/80 border border-slate-800/80 rounded-xl p-3 space-y-1">
            <div className="flex items-center space-x-1.5 text-slate-400 font-medium">
              <HardDrive className="w-3.5 h-3.5 text-emerald-400" />
              <span>Database</span>
            </div>
            <p className="text-slate-200 font-semibold text-[11px]">SQLite (OS AppData)</p>
          </div>

          <div className="bg-slate-950/80 border border-slate-800/80 rounded-xl p-3 space-y-1">
            <div className="flex items-center space-x-1.5 text-slate-400 font-medium">
              <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
              <span>Reconciliation</span>
            </div>
            <p className="text-slate-200 font-semibold text-[11px]">Deterministic Weighted Matcher</p>
          </div>

          <div className="bg-slate-950/80 border border-slate-800/80 rounded-xl p-3 space-y-1">
            <div className="flex items-center space-x-1.5 text-slate-400 font-medium">
              <CheckCircle2 className="w-3.5 h-3.5 text-amber-400" />
              <span>Data Privacy</span>
            </div>
            <p className="text-slate-200 font-semibold text-[11px]">100% Offline Capable</p>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-slate-800 pt-4 flex items-center justify-between text-[11px] text-slate-500">
          <span>© 2026 Payment Reconciliation Team</span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold rounded-lg border border-slate-700 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
