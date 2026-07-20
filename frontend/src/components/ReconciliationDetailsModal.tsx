import React, { useEffect, useState } from 'react';
import {
  ReconciliationDetailResponse,
  getReconciliationDetail,
  getMediaUrl,
  rejectMatch
} from '../services/api';
import {
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  XCircle,
  X,
  FileText,
  Image as ImageIcon,
  FileSpreadsheet,
  ShieldCheck,
  RefreshCw
} from 'lucide-react';

interface Props {
  matchId: number | null;
  onClose: () => void;
  onUpdated: () => void;
}

export const ReconciliationDetailsModal: React.FC<Props> = ({ matchId, onClose, onUpdated }) => {
  const [data, setData] = useState<ReconciliationDetailResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<boolean>(false);

  const fetchDetail = async (id: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await getReconciliationDetail(id);
      setData(res);
    } catch (err: any) {
      setError(err.message || 'Failed to load reconciliation details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (matchId) {
      fetchDetail(matchId);
    }
  }, [matchId]);

  if (!matchId) return null;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Matched':
        return <span className="px-3 py-1 bg-emerald-950/80 text-emerald-400 border border-emerald-800 rounded-full text-xs font-bold flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5" /> Matched</span>;
      case 'Possible Match':
        return <span className="px-3 py-1 bg-amber-950/80 text-amber-400 border border-amber-800 rounded-full text-xs font-bold flex items-center gap-1.5"><HelpCircle className="w-3.5 h-3.5" /> Possible Match</span>;
      case 'Needs Review':
        return <span className="px-3 py-1 bg-orange-950/80 text-orange-400 border border-orange-800 rounded-full text-xs font-bold flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> Needs Review</span>;
      default:
        return <span className="px-3 py-1 bg-rose-950/80 text-rose-400 border border-rose-800 rounded-full text-xs font-bold flex items-center gap-1.5"><XCircle className="w-3.5 h-3.5" /> Unmatched</span>;
    }
  };

  const getFieldTag = (status: string) => {
    switch (status) {
      case 'MATCH':
        return <span className="px-2 py-0.5 bg-emerald-950 text-emerald-400 border border-emerald-800 rounded text-[10px] font-bold">MATCH</span>;
      case 'PARTIAL MATCH':
        return <span className="px-2 py-0.5 bg-amber-950 text-amber-400 border border-amber-800 rounded text-[10px] font-bold">PARTIAL</span>;
      case 'MISMATCH':
        return <span className="px-2 py-0.5 bg-rose-950 text-rose-400 border border-rose-800 rounded text-[10px] font-bold">MISMATCH</span>;
      default:
        return <span className="px-2 py-0.5 bg-slate-800 text-slate-400 border border-slate-700 rounded text-[10px] font-bold">N/A</span>;
    }
  };

  const handleReject = async () => {
    if (!matchId) return;
    setActionLoading(true);
    try {
      await rejectMatch(matchId);
      await fetchDetail(matchId);
      onUpdated();
    } catch (err: any) {
      setError(err.message || 'Failed to reject match.');
    } finally {
      setActionLoading(false);
    }
  };

  const parseReasons = (jsonStr: string): string[] => {
    try {
      return JSON.parse(jsonStr);
    } catch {
      return [];
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-6xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <ShieldCheck className="w-5 h-5 text-sky-400" />
            <div>
              <h3 className="text-base font-bold text-white">Reconciliation Analysis & Verification</h3>
              <p className="text-xs text-slate-400">Transaction Match ID #{matchId}</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white bg-slate-800 rounded-full border border-slate-700"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {loading ? (
            <div className="py-20 text-center text-xs text-slate-400 flex flex-col items-center justify-center space-y-3">
              <RefreshCw className="w-6 h-6 animate-spin text-sky-400" />
              <span>Analyzing transaction match breakdown...</span>
            </div>
          ) : error || !data ? (
            <div className="p-4 bg-rose-950/60 border border-rose-800 rounded-xl text-xs text-rose-300">
              {error || 'Failed to load details.'}
            </div>
          ) : (
            <>
              {/* Summary Bar */}
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center space-x-3">
                  {getStatusBadge(data.match.match_status)}
                  <span className="text-xs text-slate-400">
                    Type: <strong className="text-white font-mono">{data.match.match_type}</strong>
                  </span>
                </div>

                {/* Score Gauge */}
                <div className="flex items-center space-x-3">
                  <span className="text-xs font-semibold text-slate-300">Confidence Score:</span>
                  <div className="flex items-center space-x-2">
                    <div className="w-32 bg-slate-800 h-2.5 rounded-full overflow-hidden border border-slate-700">
                      <div
                        className={`h-full transition-all duration-500 ${
                          data.match.confidence_score >= 90
                            ? 'bg-emerald-500'
                            : data.match.confidence_score >= 70
                            ? 'bg-amber-500'
                            : 'bg-rose-500'
                        }`}
                        style={{ width: `${data.match.confidence_score}%` }}
                      />
                    </div>
                    <span className="text-sm font-bold text-white font-mono">{data.match.confidence_score}%</span>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center space-x-2">
                  <button
                    onClick={handleReject}
                    disabled={actionLoading}
                    className="px-3 py-1.5 bg-rose-950/80 hover:bg-rose-900 border border-rose-800 text-rose-300 text-xs font-semibold rounded-lg transition-colors"
                  >
                    Reject Match
                  </button>
                </div>
              </div>

              {/* 3-Column Comparison Layout */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                {/* COLUMN 1: Original Screenshot */}
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex flex-col space-y-3 shadow-md">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <span className="text-xs font-bold text-sky-400 flex items-center gap-1.5 uppercase">
                      <ImageIcon className="w-4 h-4" /> 1. Payment Screenshot
                    </span>
                  </div>
                  <div className="relative aspect-[3/4] bg-slate-900 rounded-lg overflow-hidden border border-slate-800 flex items-center justify-center">
                    <img
                      src={getMediaUrl(data.screenshot_image_url)}
                      alt="Screenshot"
                      className="w-full h-full object-contain"
                    />
                  </div>
                </div>

                {/* COLUMN 2: Extracted Transaction */}
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex flex-col space-y-3 shadow-md">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <span className="text-xs font-bold text-indigo-400 flex items-center gap-1.5 uppercase">
                      <FileText className="w-4 h-4" /> 2. Extracted Receipt
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">ID #{data.extracted_transaction.id}</span>
                  </div>
                  <div className="space-y-2 text-xs divide-y divide-slate-800/60">
                    <div className="pt-1 flex justify-between">
                      <span className="text-slate-400">Amount:</span>
                      <span className="font-bold text-emerald-400">{data.extracted_transaction.amount ? `₹${data.extracted_transaction.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '-'}</span>
                    </div>
                    <div className="pt-2 flex justify-between">
                      <span className="text-slate-400">Date:</span>
                      <span className="font-semibold text-slate-200">{data.extracted_transaction.transaction_date || '-'}</span>
                    </div>
                    <div className="pt-2 flex justify-between">
                      <span className="text-slate-400">Reference:</span>
                      <span className="font-mono text-sky-400 text-[11px]">{data.extracted_transaction.reference_number || '-'}</span>
                    </div>
                    <div className="pt-2 flex justify-between">
                      <span className="text-slate-400">UTR:</span>
                      <span className="font-mono text-sky-400 text-[11px]">{data.extracted_transaction.utr_number || '-'}</span>
                    </div>
                    <div className="pt-2 flex justify-between">
                      <span className="text-slate-400">Receiver / Ben.:</span>
                      <span className="font-semibold text-slate-200 text-right max-w-[150px] truncate">{data.extracted_transaction.receiver_name || '-'}</span>
                    </div>
                    <div className="pt-2 flex justify-between">
                      <span className="text-slate-400">Sender:</span>
                      <span className="font-semibold text-slate-200 text-right max-w-[150px] truncate">{data.extracted_transaction.sender_name || '-'}</span>
                    </div>
                  </div>
                </div>

                {/* COLUMN 3: Matched Statement Transaction */}
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex flex-col space-y-3 shadow-md">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5 uppercase">
                      <FileSpreadsheet className="w-4 h-4" /> 3. Bank Statement Tx
                    </span>
                    {data.statement_transaction && (
                      <span className="text-[10px] text-slate-400 font-mono">ID #{data.statement_transaction.id}</span>
                    )}
                  </div>

                  {!data.statement_transaction ? (
                    <div className="flex-1 flex flex-col items-center justify-center py-12 text-slate-500 text-xs space-y-2">
                      <XCircle className="w-8 h-8 text-slate-600" />
                      <p>No matched statement transaction assigned.</p>
                    </div>
                  ) : (
                    <div className="space-y-2 text-xs divide-y divide-slate-800/60">
                      <div className="pt-1 flex justify-between">
                        <span className="text-slate-400">Amount:</span>
                        <span className="font-bold text-emerald-400">
                          {data.statement_transaction.amount ? `₹${data.statement_transaction.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '-'}
                        </span>
                      </div>
                      <div className="pt-2 flex justify-between">
                        <span className="text-slate-400">Date:</span>
                        <span className="font-semibold text-slate-200">{data.statement_transaction.transaction_date || '-'}</span>
                      </div>
                      <div className="pt-2 flex justify-between">
                        <span className="text-slate-400">Reference:</span>
                        <span className="font-mono text-sky-400 text-[11px]">{data.statement_transaction.reference_number || '-'}</span>
                      </div>
                      <div className="pt-2 flex justify-between">
                        <span className="text-slate-400">UTR:</span>
                        <span className="font-mono text-sky-400 text-[11px]">{data.statement_transaction.utr_number || '-'}</span>
                      </div>
                      <div className="pt-2 flex flex-col space-y-1">
                        <span className="text-slate-400">Narration / Description:</span>
                        <span className="font-semibold text-slate-300 text-xs bg-slate-900 p-2 rounded border border-slate-800 break-words">{data.statement_transaction.description || '-'}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Field Comparison Table */}
              <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
                <div className="px-5 py-3 border-b border-slate-800">
                  <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                    Field-by-Field Breakdown Analysis
                  </h4>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-slate-300">
                    <thead className="bg-slate-900 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                      <tr>
                        <th className="py-2.5 px-4">Field</th>
                        <th className="py-2.5 px-4">Extracted Value</th>
                        <th className="py-2.5 px-4">Statement Value</th>
                        <th className="py-2.5 px-4 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/80">
                      {Object.entries(data.field_comparison).map(([field, item]) => (
                        <tr key={field} className="hover:bg-slate-800/40 transition-colors">
                          <td className="py-2.5 px-4 font-semibold text-slate-300 capitalize">{field.replace('_', ' ')}</td>
                          <td className="py-2.5 px-4 font-mono text-slate-200">{item.extracted ? String(item.extracted) : '-'}</td>
                          <td className="py-2.5 px-4 font-mono text-slate-200">{item.statement ? String(item.statement) : '-'}</td>
                          <td className="py-2.5 px-4 text-center">{getFieldTag(item.status)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Match Reasons List */}
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-2">
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Match Rationale & Reasons</h4>
                <ul className="space-y-1 text-xs text-slate-300 list-disc list-inside">
                  {parseReasons(data.match.match_reason_json).map((reason, idx) => (
                    <li key={idx} className="text-emerald-400/90 font-medium">{reason}</li>
                  ))}
                </ul>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
