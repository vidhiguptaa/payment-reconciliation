import React from 'react';
import { Clock, Eye, FileText, GitCompare, CheckCircle2, AlertCircle } from 'lucide-react';

interface PipelineStatusBadgeProps {
  stage?: string;
  status?: string;
}

export const PipelineStatusBadge: React.FC<PipelineStatusBadgeProps> = ({ stage }) => {
  const currentStage = stage || 'QUEUED';

  switch (currentStage) {
    case 'QUEUED':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-800 text-slate-300 border border-slate-700">
          <Clock className="w-3 h-3 text-slate-400" />
          <span>QUEUED</span>
        </span>
      );
    case 'OCR':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-950 text-indigo-300 border border-indigo-800">
          <Eye className="w-3 h-3 text-indigo-400 animate-pulse" />
          <span>OCR (STAGED)</span>
        </span>
      );
    case 'EXTRACTION':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-950 text-amber-300 border border-amber-800">
          <FileText className="w-3 h-3 text-amber-400 animate-pulse" />
          <span>EXTRACTION</span>
        </span>
      );
    case 'RECONCILIATION':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-purple-950 text-purple-300 border border-purple-800">
          <GitCompare className="w-3 h-3 text-purple-400 animate-pulse" />
          <span>RECONCILIATION</span>
        </span>
      );
    case 'COMPLETED':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-950 text-emerald-300 border border-emerald-800">
          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
          <span>COMPLETED</span>
        </span>
      );
    case 'FAILED':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-950 text-rose-300 border border-rose-800">
          <AlertCircle className="w-3 h-3 text-rose-400" />
          <span>FAILED</span>
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-800 text-slate-300 border border-slate-700">
          <span>{currentStage}</span>
        </span>
      );
  }
};
