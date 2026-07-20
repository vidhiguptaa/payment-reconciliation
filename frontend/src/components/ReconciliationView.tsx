import React, { useEffect, useState } from 'react';
import {
  TransactionMatchItem,
  getReconciliationMatches,
  runBatchReconciliation,
  rejectMatch
} from '../services/api';
import { ReconciliationDetailsModal } from './ReconciliationDetailsModal';
import {
  ShieldCheck,
  Play,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  XCircle,
  RefreshCw,
  Eye
} from 'lucide-react';

export const ReconciliationView: React.FC = () => {
  const [matches, setMatches] = useState<TransactionMatchItem[]>([]);
  const [counts, setCounts] = useState<{ matched: number; possible: number; review: number; unmatched: number }>({
    matched: 0,
    possible: 0,
    review: 0,
    unmatched: 0
  });
  const [loading, setLoading] = useState<boolean>(true);
  const [running, setRunning] = useState<boolean>(false);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [selectedMatchId, setSelectedMatchId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchMatches = async (filter?: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await getReconciliationMatches(filter || undefined);
      setMatches(res.items);
      setCounts({
        matched: res.matched_count,
        possible: res.possible_count,
        review: res.needs_review_count,
        unmatched: res.unmatched_count
      });
    } catch (err: any) {
      setError(err.message || 'Failed to fetch reconciliation matches.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMatches(statusFilter);
  }, [statusFilter]);

  const handleRunReconciliation = async () => {
    setRunning(true);
    setError(null);
    try {
      await runBatchReconciliation();
      await fetchMatches(statusFilter);
    } catch (err: any) {
      setError(err.message || 'Failed to run reconciliation engine.');
    } finally {
      setRunning(false);
    }
  };

  const handleReject = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await rejectMatch(id);
      fetchMatches(statusFilter);
    } catch (err: any) {
      console.error('Reject failed:', err);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Matched':
        return <span className="px-2.5 py-0.5 bg-emerald-950 text-emerald-400 border border-emerald-800 rounded-full text-[11px] font-bold flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Matched</span>;
      case 'Possible Match':
        return <span className="px-2.5 py-0.5 bg-amber-950 text-amber-400 border border-amber-800 rounded-full text-[11px] font-bold flex items-center gap-1"><HelpCircle className="w-3 h-3" /> Possible Match</span>;
      case 'Needs Review':
        return <span className="px-2.5 py-0.5 bg-orange-950 text-orange-400 border border-orange-800 rounded-full text-[11px] font-bold flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Needs Review</span>;
      default:
        return <span className="px-2.5 py-0.5 bg-rose-950 text-rose-400 border border-rose-800 rounded-full text-[11px] font-bold flex items-center gap-1"><XCircle className="w-3 h-3" /> Unmatched</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Action Header */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center space-x-2">
            <ShieldCheck className="w-5 h-5 text-sky-400" />
            <span>Transaction Reconciliation Engine</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Deterministic weighted matching & explainability analysis engine
          </p>
        </div>

        <button
          onClick={handleRunReconciliation}
          disabled={running}
          className="flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 disabled:opacity-50 text-white text-xs font-semibold rounded-xl shadow-lg transition-all"
        >
          {running ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            <Play className="w-4 h-4" />
          )}
          <span>{running ? 'Running Engine...' : 'Run Reconciliation Engine'}</span>
        </button>
      </div>

      {error && (
        <div className="p-4 bg-rose-950/60 border border-rose-800 rounded-xl text-xs text-rose-300 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Filter Tabs & Count Badges */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-900 border border-slate-800 rounded-xl p-2">
        <div className="flex flex-wrap items-center gap-1 text-xs font-semibold">
          <button
            onClick={() => setStatusFilter('')}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              statusFilter === '' ? 'bg-slate-800 text-white shadow' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            All Matches
          </button>
          <button
            onClick={() => setStatusFilter('Matched')}
            className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
              statusFilter === 'Matched' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>Matched</span>
            <span className="bg-emerald-900/80 px-1.5 py-0.2 rounded text-[10px]">{counts.matched}</span>
          </button>
          <button
            onClick={() => setStatusFilter('Possible Match')}
            className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
              statusFilter === 'Possible Match' ? 'bg-amber-950 text-amber-400 border border-amber-800' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>Possible</span>
            <span className="bg-amber-900/80 px-1.5 py-0.2 rounded text-[10px]">{counts.possible}</span>
          </button>
          <button
            onClick={() => setStatusFilter('Needs Review')}
            className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
              statusFilter === 'Needs Review' ? 'bg-orange-950 text-orange-400 border border-orange-800' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>Needs Review</span>
            <span className="bg-orange-900/80 px-1.5 py-0.2 rounded text-[10px]">{counts.review}</span>
          </button>
          <button
            onClick={() => setStatusFilter('Unmatched')}
            className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
              statusFilter === 'Unmatched' ? 'bg-rose-950 text-rose-400 border border-rose-800' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>Unmatched</span>
            <span className="bg-rose-900/80 px-1.5 py-0.2 rounded text-[10px]">{counts.unmatched}</span>
          </button>
        </div>

        <div className="text-xs text-slate-400 px-3">
          Showing <span className="font-bold text-white">{matches.length}</span> matches
        </div>
      </div>

      {/* Matches Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        {loading ? (
          <div className="py-16 text-center text-xs text-slate-400 flex items-center justify-center space-x-2">
            <RefreshCw className="w-4 h-4 animate-spin text-sky-400" />
            <span>Loading reconciliation matches...</span>
          </div>
        ) : matches.length === 0 ? (
          <div className="py-16 text-center text-xs text-slate-400 space-y-3">
            <ShieldCheck className="w-10 h-10 mx-auto text-slate-600" />
            <p>No reconciliation records found.</p>
            <p className="text-[11px] text-slate-500">Run the Reconciliation Engine after extracting payment screenshots and importing bank statements.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Match Status</th>
                  <th className="py-3 px-4">Score</th>
                  <th className="py-3 px-4">Extracted Amount</th>
                  <th className="py-3 px-4">Ref / UTR</th>
                  <th className="py-3 px-4">Matched Bank Statement Description</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {matches.map((item) => (
                  <tr
                    key={item.id}
                    onClick={() => setSelectedMatchId(item.id)}
                    className="hover:bg-slate-800/50 cursor-pointer transition-colors"
                  >
                    <td className="py-3 px-4">{getStatusBadge(item.match_status)}</td>
                    <td className="py-3 px-4">
                      <span className="font-bold text-white font-mono">{item.confidence_score}%</span>
                    </td>
                    <td className="py-3 px-4 font-semibold text-emerald-400">
                      {item.extracted_transaction?.amount ? `₹${item.extracted_transaction.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '-'}
                    </td>
                    <td className="py-3 px-4 font-mono text-sky-400 text-[11px]">
                      {item.extracted_transaction?.reference_number || item.extracted_transaction?.utr_number || '-'}
                    </td>
                    <td className="py-3 px-4 text-slate-300 max-w-xs truncate">
                      {item.statement_transaction?.description || '-'}
                    </td>
                    <td className="py-3 px-4 text-[10px] text-slate-400 font-mono">{item.match_type}</td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end space-x-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedMatchId(item.id);
                          }}
                          className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-sky-400 text-xs font-semibold rounded-lg border border-slate-700 transition-colors flex items-center gap-1"
                        >
                          <Eye className="w-3 h-3" />
                          <span>View</span>
                        </button>

                        <button
                          onClick={(e) => handleReject(item.id, e)}
                          className="px-2 py-1 bg-rose-950/60 hover:bg-rose-900 text-rose-400 text-[11px] font-semibold rounded-lg border border-rose-800 transition-colors"
                          title="Reject match"
                        >
                          Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ReconciliationDetailsModal
        matchId={selectedMatchId}
        onClose={() => setSelectedMatchId(null)}
        onUpdated={() => fetchMatches(statusFilter)}
      />
    </div>
  );
};
