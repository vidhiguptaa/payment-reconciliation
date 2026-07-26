import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  ArrowLeft, CheckCircle2, AlertTriangle, HelpCircle, XCircle, Search, 
  Layers, ExternalLink, X, ChevronRight, AlertCircle 
} from 'lucide-react';
import { api } from '../services/api';
import { MatchStatus, MatchType } from '../shared/types';

export const ReportDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<'all' | 'unmatched_images' | 'unmatched_txs'>('all');
  const [selectedMatchForVerification, setSelectedMatchForVerification] = useState<any | null>(null);
  const [selectedMatchForManual, setSelectedMatchForManual] = useState<any | null>(null);
  
  const [manualSearchQuery, setManualSearchQuery] = useState('');

  // 1. Fetch Report Detail
  const { data: reportData, isLoading, error } = useQuery({
    queryKey: ['report', id],
    queryFn: () => api.reconciliation.getReport(id!),
    enabled: !!id,
  });

  // 2. Mutations
  const manualMatchMutation = useMutation({
    mutationFn: ({ matchId, statementTxId }: { matchId: string; statementTxId: string }) => 
      api.reconciliation.manualMatch(matchId, statementTxId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['report', id] });
      setSelectedMatchForManual(null);
      setSelectedMatchForVerification(null);
    },
  });

  const rejectMatchMutation = useMutation({
    mutationFn: (matchId: string) => api.reconciliation.rejectMatch(matchId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['report', id] });
      setSelectedMatchForVerification(null);
    },
  });

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-500">
        <Loader className="h-8 w-8 animate-spin text-indigo-600 mb-2" />
        <span>Loading report details...</span>
      </div>
    );
  }

  if (error || !reportData) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-800 p-6 rounded-2xl max-w-xl mx-auto text-center">
        <AlertCircle className="h-8 w-8 text-red-500 mx-auto mb-3" />
        <h3 className="font-bold text-lg">Report Not Found</h3>
        <p className="text-sm mt-1 mb-4">The requested reconciliation report could not be loaded.</p>
        <button onClick={() => navigate('/')} className="bg-red-600 text-white font-semibold text-xs py-2 px-4 rounded-xl">
          Back to Dashboard
        </button>
      </div>
    );
  }

  const { report, matches, unmatchedImages, unmatchedTransactions } = reportData;

  // Filter matches based on active tab
  const filteredMatches = matches.filter(m => {
    if (activeTab === 'unmatched_images') {
      return m.matchStatus === MatchStatus.UNMATCHED;
    }
    return true;
  });

  // Filter statement transactions based on manual search query
  const filteredUnmatchedTxs = unmatchedTransactions.filter(tx => {
    if (!manualSearchQuery) return true;
    const q = manualSearchQuery.toLowerCase();
    return (
      tx.description.toLowerCase().includes(q) ||
      (tx.referenceNumber && tx.referenceNumber.toLowerCase().includes(q)) ||
      (tx.amount && String(tx.amount).includes(q))
    );
  });

  return (
    <div className="space-y-6">
      {/* Back link */}
      <button 
        onClick={() => navigate('/')}
        className="flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        <span>Dashboard</span>
      </button>

      {/* Header */}
      <div className="md:flex md:items-center md:justify-between border-b border-slate-200 pb-5">
        <div className="flex-1 min-w-0">
          <h2 className="text-2xl font-bold text-slate-900 leading-7 truncate">{report.name}</h2>
          <p className="text-xs text-slate-400 mt-1">
            Generated {new Date(report.createdAt).toLocaleDateString()} {new Date(report.createdAt).toLocaleTimeString()}
          </p>
        </div>
      </div>

      {/* Stats Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex items-center gap-4">
          <div className="h-10 w-10 bg-emerald-50 rounded-lg flex items-center justify-center text-emerald-600 border border-emerald-100">
            <CheckCircle2 className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Matched</p>
            <p className="text-xl font-bold text-slate-800">{report.matchedCount}</p>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex items-center gap-4">
          <div className="h-10 w-10 bg-amber-50 rounded-lg flex items-center justify-center text-amber-600 border border-amber-100">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Possible Match</p>
            <p className="text-xl font-bold text-slate-800">{report.possibleCount}</p>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex items-center gap-4">
          <div className="h-10 w-10 bg-red-50 rounded-lg flex items-center justify-center text-red-600 border border-red-100">
            <HelpCircle className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Needs Review</p>
            <p className="text-xl font-bold text-slate-800">{report.needsReviewCount}</p>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex items-center gap-4">
          <div className="h-10 w-10 bg-slate-100 rounded-lg flex items-center justify-center text-slate-600 border border-slate-200">
            <XCircle className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Unmatched</p>
            <p className="text-xl font-bold text-slate-800">{report.unmatchedCount}</p>
          </div>
        </div>
      </div>

      {/* Tabs Control */}
      <div className="border-b border-slate-200">
        <nav className="flex space-x-6">
          <button
            onClick={() => setActiveTab('all')}
            className={`pb-4 text-sm font-semibold border-b-2 transition-all ${
              activeTab === 'all'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            All Matches ({matches.length})
          </button>
          
          <button
            onClick={() => setActiveTab('unmatched_images')}
            className={`pb-4 text-sm font-semibold border-b-2 transition-all ${
              activeTab === 'unmatched_images'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Unmatched Screenshots ({unmatchedImages.length})
          </button>

          <button
            onClick={() => setActiveTab('unmatched_txs')}
            className={`pb-4 text-sm font-semibold border-b-2 transition-all ${
              activeTab === 'unmatched_txs'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Unmatched Statements ({unmatchedTransactions.length})
          </button>
        </nav>
      </div>

      {/* Tab: Matches */}
      {activeTab !== 'unmatched_txs' && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          {filteredMatches.length === 0 ? (
            <div className="text-center py-16 text-slate-400 text-sm">
              No matching records in this view
            </div>
          ) : (
            <div className="divide-y divide-slate-200">
              {filteredMatches.map((m) => (
                <div key={m.id} className="p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6 hover:bg-slate-50/50 transition-colors">
                  {/* Left Side: Screenshot & Extracted Data */}
                  <div className="flex items-start gap-4 min-w-0 flex-1">
                    <img 
                      src={m.paymentImage.cloudinaryUrl} 
                      alt={m.paymentImage.filename} 
                      className="h-16 w-16 object-cover border border-slate-200 rounded-xl cursor-pointer shrink-0 hover:opacity-90 transition-opacity"
                      onClick={() => setSelectedMatchForVerification(m)}
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-slate-800 text-sm truncate" title={m.paymentImage.filename}>
                          {m.paymentImage.filename}
                        </span>
                        {/* Status Badge */}
                        <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${
                          m.matchStatus === MatchStatus.MATCHED
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                            : m.matchStatus === MatchStatus.POSSIBLE_MATCH
                            ? 'bg-amber-50 text-amber-700 border-amber-100'
                            : m.matchStatus === MatchStatus.NEEDS_REVIEW
                            ? 'bg-red-50 text-red-700 border-red-100'
                            : 'bg-slate-100 text-slate-600 border-slate-200'
                        }`}>
                          {m.matchStatus}
                        </span>
                      </div>
                      
                      {/* Extracted Details */}
                      <p className="text-xs text-slate-500 mt-1.5 flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-slate-800">Extracted:</span>
                        <span>₹{m.paymentImage.amount?.toLocaleString() || 'None'}</span>
                        <span className="h-1 w-1 bg-slate-300 rounded-full" />
                        <span>Date: {m.paymentImage.transactionDate || 'N/A'}</span>
                        <span className="h-1 w-1 bg-slate-300 rounded-full" />
                        <span>UTR: {m.paymentImage.utrNumber || 'N/A'}</span>
                      </p>

                      {/* Matched Row details (if any) */}
                      {m.statementTransaction ? (
                        <div className="mt-3 bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-600 space-y-1">
                          <p className="font-semibold text-slate-700 flex items-center gap-1">
                            <Layers className="h-3.5 w-3.5 text-slate-400" />
                            <span>Matched Bank Statement Entry:</span>
                          </p>
                          <p className="truncate"><span className="font-medium text-slate-800">Desc:</span> {m.statementTransaction.description}</p>
                          <div className="flex flex-wrap items-center gap-3 mt-1 text-[11px] text-slate-500">
                            <span>Amount: <span className="font-bold text-slate-700">₹{Math.abs(m.statementTransaction.amount).toLocaleString()}</span></span>
                            <span>Date: {m.statementTransaction.transactionDate}</span>
                            <span>Ref: {m.statementTransaction.referenceNumber || 'N/A'}</span>
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-red-600 italic mt-2 flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" />
                          <span>No statement entry matched automatically.</span>
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Right Side: Score, Reason & Action */}
                  <div className="flex flex-row lg:flex-col items-center lg:items-end justify-between lg:justify-center gap-4 shrink-0 border-t border-slate-100 pt-3 lg:border-0 lg:pt-0">
                    <div className="text-left lg:text-right">
                      {m.statementTransaction && (
                        <div className="flex items-center lg:justify-end gap-1.5">
                          <span className="text-xs text-slate-400">Match Confidence:</span>
                          <span className={`text-xs font-bold ${
                            m.confidenceScore >= 90 
                              ? 'text-emerald-600' 
                              : m.confidenceScore >= 70 
                              ? 'text-amber-600' 
                              : 'text-red-500'
                          }`}>
                            {m.confidenceScore}%
                          </span>
                        </div>
                      )}
                      
                      {m.matchType === MatchType.MANUALLY_MATCHED && (
                        <span className="inline-block text-[9px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 rounded px-1.5 py-0.5 mt-0.5">
                          MANUAL OVERRIDE
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setSelectedMatchForVerification(m)}
                        className="bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold py-1.5 px-3 rounded-lg shadow-sm flex items-center gap-1"
                      >
                        Compare & Verify
                      </button>
                      <button
                        onClick={() => setSelectedMatchForManual(m)}
                        className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold py-1.5 px-3 rounded-lg flex items-center gap-1 border border-indigo-100"
                      >
                        Re-match
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab: Unmatched Transactions */}
      {activeTab === 'unmatched_txs' && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-semibold text-slate-900 text-sm">Orphan Statement Transactions</h3>
            <span className="text-xs text-slate-400">{unmatchedTransactions.length} entries found</span>
          </div>

          {unmatchedTransactions.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-sm">
              All bank statement transactions have matching payments!
            </div>
          ) : (
            <div className="overflow-x-auto border border-slate-100 rounded-xl">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider">
                    <th className="p-3">Date</th>
                    <th className="p-3">Description</th>
                    <th className="p-3">Reference/UTR</th>
                    <th className="p-3 text-right">Debit / Credit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {unmatchedTransactions.map((tx) => (
                    <tr key={tx.id} className="hover:bg-slate-50/50">
                      <td className="p-3 whitespace-nowrap">{tx.transactionDate}</td>
                      <td className="p-3 max-w-xs truncate" title={tx.description}>{tx.description}</td>
                      <td className="p-3 font-mono shrink-0">{tx.referenceNumber || tx.utrNumber || 'N/A'}</td>
                      <td className={`p-3 text-right font-bold ${tx.amount > 0 ? 'text-emerald-600' : 'text-slate-900'}`}>
                        {tx.amount > 0 ? `+₹${tx.amount}` : `-₹${Math.abs(tx.amount)}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Side-by-Side Comparison Verification Modal */}
      {selectedMatchForVerification && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-5xl h-[85vh] flex flex-col shadow-2xl overflow-hidden border border-slate-200">
            {/* Modal Header */}
            <div className="border-b border-slate-200 px-6 py-4 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-slate-900 text-base">Verify Match Details</h3>
                <p className="text-xs text-slate-400 mt-0.5">{selectedMatchForVerification.paymentImage.filename}</p>
              </div>
              <button 
                onClick={() => setSelectedMatchForVerification(null)}
                className="text-slate-400 hover:text-slate-600 p-1 bg-slate-50 hover:bg-slate-100 rounded-lg"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body: Split Layout */}
            <div className="flex-grow flex flex-col md:flex-row overflow-hidden">
              {/* Left pane: Image Viewer */}
              <div className="w-full md:w-1/2 bg-slate-100 p-4 flex items-center justify-center border-r border-slate-200 overflow-hidden relative group">
                <img 
                  src={selectedMatchForVerification.paymentImage.cloudinaryUrl} 
                  alt="Receipt Screenshot" 
                  className="max-w-full max-h-full object-contain rounded shadow-lg"
                />
                <a 
                  href={selectedMatchForVerification.paymentImage.cloudinaryUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="absolute bottom-4 right-4 bg-white/95 text-slate-800 border border-slate-200 hover:bg-white text-xs font-semibold py-1.5 px-3 rounded-lg flex items-center gap-1.5 shadow"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  <span>Open Full Image</span>
                </a>
              </div>

              {/* Right pane: Fields and Verification */}
              <div className="w-full md:w-1/2 p-6 overflow-y-auto space-y-6">
                <div>
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Field-Level Verification</h4>
                  
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold">
                          <th className="p-3">Parameter</th>
                          <th className="p-3">Extracted from Receipt</th>
                          <th className="p-3">Bank Statement Entry</th>
                          <th className="p-3 text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {/* Amount comparison */}
                        <tr>
                          <td className="p-3 font-medium text-slate-500">Amount</td>
                          <td className="p-3 font-semibold text-slate-800">
                            ₹{selectedMatchForVerification.paymentImage.amount?.toLocaleString() || 'N/A'}
                          </td>
                          <td className="p-3 font-semibold text-slate-800">
                            {selectedMatchForVerification.statementTransaction 
                              ? `₹${Math.abs(selectedMatchForVerification.statementTransaction.amount).toLocaleString()}` 
                              : 'N/A'}
                          </td>
                          <td className="p-3 text-center">
                            {selectedMatchForVerification.statementTransaction && 
                            Math.abs((selectedMatchForVerification.paymentImage.amount || 0) - Math.abs(selectedMatchForVerification.statementTransaction.amount)) <= 1.0 ? (
                              <span className="bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded text-[10px] font-bold border border-emerald-100">MATCH</span>
                            ) : (
                              <span className="bg-red-50 text-red-700 px-2 py-0.5 rounded text-[10px] font-bold border border-red-100">MISMATCH</span>
                            )}
                          </td>
                        </tr>

                        {/* Date comparison */}
                        <tr>
                          <td className="p-3 font-medium text-slate-500">Transaction Date</td>
                          <td className="p-3 text-slate-800">{selectedMatchForVerification.paymentImage.transactionDate || 'N/A'}</td>
                          <td className="p-3 text-slate-800">{selectedMatchForVerification.statementTransaction?.transactionDate || 'N/A'}</td>
                          <td className="p-3 text-center">
                            {selectedMatchForVerification.statementTransaction && 
                            selectedMatchForVerification.paymentImage.transactionDate === selectedMatchForVerification.statementTransaction.transactionDate ? (
                              <span className="bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded text-[10px] font-bold border border-emerald-100">MATCH</span>
                            ) : (
                              <span className="bg-amber-50 text-amber-700 px-2 py-0.5 rounded text-[10px] font-bold border border-amber-100">DIFF</span>
                            )}
                          </td>
                        </tr>

                        {/* UTR reference comparison */}
                        <tr>
                          <td className="p-3 font-medium text-slate-500">Reference / UTR</td>
                          <td className="p-3 text-slate-800 font-mono text-[11px] shrink-0">{selectedMatchForVerification.paymentImage.utrNumber || 'N/A'}</td>
                          <td className="p-3 text-slate-800 font-mono text-[11px] shrink-0">{selectedMatchForVerification.statementTransaction?.referenceNumber || 'N/A'}</td>
                          <td className="p-3 text-center">
                            {selectedMatchForVerification.statementTransaction && 
                            selectedMatchForVerification.paymentImage.utrNumber === selectedMatchForVerification.statementTransaction.referenceNumber ? (
                              <span className="bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded text-[10px] font-bold border border-emerald-100">MATCH</span>
                            ) : (
                              <span className="bg-red-50 text-red-700 px-2 py-0.5 rounded text-[10px] font-bold border border-red-100">MISMATCH</span>
                            )}
                          </td>
                        </tr>

                        {/* Receiver name comparison */}
                        <tr>
                          <td className="p-3 font-medium text-slate-500">Payee / Narratives</td>
                          <td className="p-3 text-slate-800 truncate max-w-[150px]" title={selectedMatchForVerification.paymentImage.receiverName || ''}>
                            {selectedMatchForVerification.paymentImage.receiverName || 'N/A'}
                          </td>
                          <td className="p-3 text-slate-800 truncate max-w-[150px]" title={selectedMatchForVerification.statementTransaction?.description || ''}>
                            {selectedMatchForVerification.statementTransaction?.description || 'N/A'}
                          </td>
                          <td className="p-3 text-center">
                            {selectedMatchForVerification.statementTransaction && 
                            selectedMatchForVerification.paymentImage.receiverName ? (
                              <span className="bg-slate-50 text-slate-600 px-2 py-0.5 rounded text-[10px] font-semibold border border-slate-200">
                                {Math.round(fuzzyRatio(selectedMatchForVerification.paymentImage.receiverName, selectedMatchForVerification.statementTransaction.description) * 100)}% Match
                              </span>
                            ) : (
                              <span className="text-slate-400">-</span>
                            )}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Score and reasons explanation */}
                {selectedMatchForVerification.statementTransaction && (
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="font-semibold text-slate-700 text-sm">Matching Verdict Explanations</span>
                      <span className="font-mono bg-indigo-50 border border-indigo-100 text-indigo-800 font-bold px-2 py-0.5 rounded">
                        Score: {selectedMatchForVerification.confidenceScore}%
                      </span>
                    </div>
                    
                    <ul className="space-y-1.5 text-slate-600 list-disc list-inside">
                      {JSON.parse(selectedMatchForVerification.matchReasonJson || '[]').map((reason: string, rIdx: number) => (
                        <li key={rIdx}>{reason}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Match Operations */}
                <div className="border-t border-slate-200 pt-5 space-y-3">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Modify Reconciliation Status</h4>
                  
                  <div className="flex flex-wrap gap-3">
                    {selectedMatchForVerification.statementTransaction && (
                      <button
                        onClick={() => rejectMatchMutation.mutate(selectedMatchForVerification.id)}
                        disabled={rejectMatchMutation.isPending}
                        className="bg-red-50 hover:bg-red-100 border border-red-100 text-red-700 text-xs font-semibold py-2.5 px-4 rounded-xl flex items-center gap-1.5 transition-colors"
                      >
                        {rejectMatchMutation.isPending ? 'Rejecting...' : 'Reject Auto-Match'}
                      </button>
                    )}
                    
                    <button
                      onClick={() => {
                        setSelectedMatchForManual(selectedMatchForVerification);
                      }}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold py-2.5 px-4 rounded-xl shadow shadow-indigo-600/10 flex items-center gap-1.5 transition-colors"
                    >
                      Manually Re-Link Statement Transaction
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Manual Rematch Search List Modal */}
      {selectedMatchForManual && (
        <div className="fixed inset-0 z-[60] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-xl max-h-[80vh] flex flex-col shadow-2xl overflow-hidden border border-slate-200">
            {/* Header */}
            <div className="border-b border-slate-200 px-6 py-4 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-slate-900 text-base">Manually Match Statement</h3>
                <p className="text-xs text-slate-400 mt-0.5">Select a bank transaction matching this payment screenshot</p>
              </div>
              <button 
                onClick={() => setSelectedMatchForManual(null)}
                className="text-slate-400 hover:text-slate-600 p-1 bg-slate-50 hover:bg-slate-100 rounded-lg"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Match info detail */}
            <div className="bg-indigo-50/50 border-b border-indigo-100 p-4 text-xs text-slate-600">
              <span className="font-bold text-slate-800">Target Payment:</span> {selectedMatchForManual.paymentImage.filename}
              <div className="flex gap-4 mt-1 font-semibold text-indigo-900">
                <span>Amount: ₹{selectedMatchForManual.paymentImage.amount || 'N/A'}</span>
                <span>Date: {selectedMatchForManual.paymentImage.transactionDate || 'N/A'}</span>
                <span>UTR: {selectedMatchForManual.paymentImage.utrNumber || 'N/A'}</span>
              </div>
            </div>

            {/* Search inputs */}
            <div className="p-4 border-b border-slate-200">
              <div className="relative">
                <Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-400 pointer-events-none" />
                <input 
                  type="text" 
                  value={manualSearchQuery}
                  onChange={(e) => setManualSearchQuery(e.target.value)}
                  placeholder="Search description, reference UTR, amount..."
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 rounded-xl text-sm"
                />
              </div>
            </div>

            {/* Search list results */}
            <div className="flex-grow overflow-y-auto p-4 space-y-2">
              {filteredUnmatchedTxs.length === 0 ? (
                <div className="text-center py-12 text-slate-400 text-xs">
                  No matching unmatched statement entries found.
                </div>
              ) : (
                filteredUnmatchedTxs.map((tx) => (
                  <div 
                    key={tx.id} 
                    onClick={() => manualMatchMutation.mutate({ matchId: selectedMatchForManual.id, statementTxId: tx.id })}
                    className="p-3 border border-slate-200 hover:border-indigo-400 rounded-xl hover:bg-indigo-50/10 cursor-pointer transition-all flex justify-between items-center text-xs group"
                  >
                    <div className="min-w-0 pr-4">
                      <p className="font-semibold text-slate-800 truncate" title={tx.description}>{tx.description}</p>
                      <p className="text-[10px] text-slate-400 mt-1 flex items-center gap-1.5">
                        <span>Date: {tx.transactionDate}</span>
                        <span>•</span>
                        <span>Ref: {tx.referenceNumber || 'N/A'}</span>
                      </p>
                    </div>
                    
                    <div className="text-right shrink-0 flex items-center gap-2">
                      <span className={`font-bold ${tx.amount > 0 ? 'text-emerald-600' : 'text-slate-800'}`}>
                        {tx.amount > 0 ? `+₹${tx.amount.toLocaleString()}` : `-₹${Math.abs(tx.amount).toLocaleString()}`}
                      </span>
                      <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-indigo-600 group-hover:translate-x-0.5 transition-all" />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Small helpers
function Loader(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      width="24" 
      height="24" 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      {...props}
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

/**
 * Gestalt character fuzzy overlap matching calculations helper matching backend logic.
 */
function fuzzyRatio(s1: string, s2: string): number {
  if (!s1 || !s2) return 0.0;
  const str1 = s1.toLowerCase().trim();
  const str2 = s2.toLowerCase().trim();
  if (str1.includes(str2) || str2.includes(str1)) return 1.0;

  const words1 = str1.match(/\w+/g) || [];
  const words2 = str2.match(/\w+/g) || [];
  const stopWords = new Set(['pvt', 'ltd', 'inc', 'corp', 'co', 'limited', 'upi', 'imps', 'neft', 'rtgs', 'ach', 'transfer', 'pay', 'vendor']);
  
  const w1Clean = words1.filter(w => !stopWords.has(w));
  const w2Clean = words2.filter(w => !stopWords.has(w));

  if (w1Clean.length && w2Clean.length) {
    const w1Set = new Set(w1Clean);
    const overlap = w2Clean.filter(w => w1Set.has(w));
    if (overlap.length) {
      return overlap.length / Math.min(w1Clean.length, w2Clean.length);
    }
  }

  // Fallback Sorensen bigrams
  const getBigrams = (str: string) => {
    const bigrams = new Set<string>();
    for (let i = 0; i < str.length - 1; i++) {
      bigrams.add(str.substring(i, i + 2));
    }
    return bigrams;
  };
  const b1 = getBigrams(str1);
  const b2 = getBigrams(str2);
  if (b1.size === 0 || b2.size === 0) return 0;
  let matches = 0;
  b1.forEach(bg => {
    if (b2.has(bg)) matches++;
  });
  return (2 * matches) / (b1.size + b2.size);
}

export default ReportDetail;
