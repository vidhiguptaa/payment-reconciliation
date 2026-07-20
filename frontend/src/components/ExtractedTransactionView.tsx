import React, { useEffect, useState } from 'react';
import {
  ExtractedTransactionItem,
  getExtractedTransaction,
  runExtraction,
  updateExtractedTransaction,
  ExtractedTransactionUpdatePayload
} from '../services/api';
import {
  DollarSign,
  Calendar,
  Clock,
  Hash,
  User,
  Building2,
  CheckCircle2,
  Edit3,
  Save,
  X,
  Sparkles,
  RefreshCw,
  AlertCircle
} from 'lucide-react';

interface ExtractedTransactionViewProps {
  screenshotId: number;
}

export const ExtractedTransactionView: React.FC<ExtractedTransactionViewProps> = ({ screenshotId }) => {
  const [tx, setTx] = useState<ExtractedTransactionItem | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [running, setRunning] = useState<boolean>(false);
  const [editing, setEditing] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState<ExtractedTransactionUpdatePayload>({});

  const fetchExtraction = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getExtractedTransaction(screenshotId);
      setTx(data);
    } catch (err: any) {
      if (err.response?.status === 404) {
        setTx(null);
      } else {
        setError(err.message || 'Failed to load extracted transaction');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExtraction();
  }, [screenshotId]);

  const handleRunExtraction = async () => {
    setRunning(true);
    setError(null);
    try {
      const data = await runExtraction(screenshotId);
      setTx(data);
    } catch (err: any) {
      setError(err.message || 'Extraction Execution Failed');
    } finally {
      setRunning(false);
    }
  };

  const startEditing = () => {
    if (!tx) return;
    setFormData({
      amount: tx.amount,
      currency: tx.currency || 'INR',
      transaction_date: tx.transaction_date || '',
      transaction_time: tx.transaction_time || '',
      reference_number: tx.reference_number || '',
      utr_number: tx.utr_number || '',
      sender_name: tx.sender_name || '',
      receiver_name: tx.receiver_name || '',
      bank_name: tx.bank_name || '',
      ifsc: tx.ifsc || '',
      transaction_type: tx.transaction_type || 'UPI',
      payment_status: tx.payment_status || 'SUCCESS',
      remarks: tx.remarks || '',
    });
    setEditing(true);
  };

  const handleSaveEdits = async () => {
    if (!tx) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await updateExtractedTransaction(tx.id, formData);
      setTx(updated);
      setEditing(false);
    } catch (err: any) {
      setError(err.message || 'Failed to save transaction edits');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="py-6 text-center text-xs text-slate-400 flex items-center justify-center space-x-2">
        <RefreshCw className="w-4 h-4 animate-spin text-sky-400" />
        <span>Loading structured transaction data...</span>
      </div>
    );
  }

  return (
    <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-4 space-y-4">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
        <div className="flex items-center space-x-2">
          <Sparkles className="w-4 h-4 text-emerald-400" />
          <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
            Extracted Payment Transaction
          </h4>
          {tx?.is_manually_edited && (
            <span className="px-2 py-0.5 text-[10px] font-semibold bg-amber-950/80 text-amber-300 border border-amber-800 rounded">
              Manually Corrected
            </span>
          )}
        </div>

        <div className="flex items-center space-x-2">
          {!editing ? (
            <>
              {tx && (
                <button
                  onClick={startEditing}
                  className="flex items-center space-x-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-sky-400 text-xs font-medium rounded-lg border border-slate-700 transition-colors"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Edit Values</span>
                </button>
              )}
              <button
                onClick={handleRunExtraction}
                disabled={running}
                className="flex items-center space-x-1.5 px-3 py-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg shadow transition-colors"
              >
                {running ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                <span>Extract Again</span>
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setEditing(false)}
                className="flex items-center space-x-1 px-2.5 py-1 bg-slate-800 text-slate-300 text-xs rounded-lg border border-slate-700"
              >
                <X className="w-3.5 h-3.5" />
                <span>Cancel</span>
              </button>
              <button
                onClick={handleSaveEdits}
                disabled={saving}
                className="flex items-center space-x-1 px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg shadow"
              >
                {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                <span>Save Changes</span>
              </button>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="p-3 bg-rose-950/60 border border-rose-800 rounded-lg text-xs text-rose-300 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {!tx ? (
        <div className="py-6 text-center text-xs text-slate-400">
          <p>No extracted transaction data available for this screenshot yet.</p>
          <button
            onClick={handleRunExtraction}
            disabled={running}
            className="mt-3 px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-emerald-400 text-xs font-medium rounded-lg border border-slate-700 transition-colors"
          >
            Run Transaction Extraction Now
          </button>
        </div>
      ) : editing ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div>
            <label className="text-[10px] text-slate-400 block mb-1 uppercase font-medium">Amount (₹)</label>
            <input
              type="number"
              step="0.01"
              value={formData.amount ?? ''}
              onChange={(e) => setFormData({ ...formData, amount: e.target.value ? parseFloat(e.target.value) : null })}
              className="w-full bg-slate-900 border border-slate-700 text-emerald-400 font-bold px-3 py-1.5 rounded-lg focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="text-[10px] text-slate-400 block mb-1 uppercase font-medium">Payment Status</label>
            <select
              value={formData.payment_status || 'SUCCESS'}
              onChange={(e) => setFormData({ ...formData, payment_status: e.target.value })}
              className="w-full bg-slate-900 border border-slate-700 text-slate-200 px-3 py-1.5 rounded-lg focus:outline-none focus:border-emerald-500"
            >
              <option value="SUCCESS">SUCCESS</option>
              <option value="PENDING">PENDING</option>
              <option value="FAILED">FAILED</option>
            </select>
          </div>

          <div>
            <label className="text-[10px] text-slate-400 block mb-1 uppercase font-medium">Transaction Date (YYYY-MM-DD)</label>
            <input
              type="text"
              value={formData.transaction_date || ''}
              onChange={(e) => setFormData({ ...formData, transaction_date: e.target.value })}
              className="w-full bg-slate-900 border border-slate-700 text-slate-200 px-3 py-1.5 rounded-lg focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="text-[10px] text-slate-400 block mb-1 uppercase font-medium">Transaction Time (HH:MM:SS)</label>
            <input
              type="text"
              value={formData.transaction_time || ''}
              onChange={(e) => setFormData({ ...formData, transaction_time: e.target.value })}
              className="w-full bg-slate-900 border border-slate-700 text-slate-200 px-3 py-1.5 rounded-lg focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="text-[10px] text-slate-400 block mb-1 uppercase font-medium">Reference Number</label>
            <input
              type="text"
              value={formData.reference_number || ''}
              onChange={(e) => setFormData({ ...formData, reference_number: e.target.value })}
              className="w-full bg-slate-900 border border-slate-700 text-slate-200 font-mono px-3 py-1.5 rounded-lg focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="text-[10px] text-slate-400 block mb-1 uppercase font-medium">UTR Number</label>
            <input
              type="text"
              value={formData.utr_number || ''}
              onChange={(e) => setFormData({ ...formData, utr_number: e.target.value })}
              className="w-full bg-slate-900 border border-slate-700 text-slate-200 font-mono px-3 py-1.5 rounded-lg focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="text-[10px] text-slate-400 block mb-1 uppercase font-medium">Beneficiary / Receiver Name</label>
            <input
              type="text"
              value={formData.receiver_name || ''}
              onChange={(e) => setFormData({ ...formData, receiver_name: e.target.value })}
              className="w-full bg-slate-900 border border-slate-700 text-slate-200 px-3 py-1.5 rounded-lg focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="text-[10px] text-slate-400 block mb-1 uppercase font-medium">Sender Name</label>
            <input
              type="text"
              value={formData.sender_name || ''}
              onChange={(e) => setFormData({ ...formData, sender_name: e.target.value })}
              className="w-full bg-slate-900 border border-slate-700 text-slate-200 px-3 py-1.5 rounded-lg focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="text-[10px] text-slate-400 block mb-1 uppercase font-medium">Bank Name</label>
            <input
              type="text"
              value={formData.bank_name || ''}
              onChange={(e) => setFormData({ ...formData, bank_name: e.target.value })}
              className="w-full bg-slate-900 border border-slate-700 text-slate-200 px-3 py-1.5 rounded-lg focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="text-[10px] text-slate-400 block mb-1 uppercase font-medium">IFSC Code</label>
            <input
              type="text"
              value={formData.ifsc || ''}
              onChange={(e) => setFormData({ ...formData, ifsc: e.target.value })}
              className="w-full bg-slate-900 border border-slate-700 text-slate-200 font-mono px-3 py-1.5 rounded-lg focus:outline-none focus:border-emerald-500"
            />
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="bg-gradient-to-r from-slate-900 to-slate-950 border border-slate-800 p-3.5 rounded-xl flex items-center justify-between">
            <div>
              <span className="text-[10px] text-slate-500 font-medium uppercase tracking-wider block">Normalized Amount</span>
              <div className="text-xl font-black text-emerald-400 flex items-center">
                <DollarSign className="w-5 h-5 mr-0.5 text-emerald-500" />
                {tx.amount !== null && tx.amount !== undefined ? tx.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '-'}
                <span className="text-xs font-semibold ml-1.5 text-slate-400">{tx.currency}</span>
              </div>
            </div>

            <div className="text-right">
              <span className="text-[10px] text-slate-500 font-medium uppercase tracking-wider block">Payment Status</span>
              <span className={`inline-flex items-center gap-1 font-bold text-xs ${
                tx.payment_status === 'SUCCESS' ? 'text-emerald-400' : 'text-rose-400'
              }`}>
                <CheckCircle2 className="w-3.5 h-3.5" />
                {tx.payment_status}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5 text-xs">
            <div className="bg-slate-900/90 border border-slate-800 p-2.5 rounded-lg">
              <span className="text-[10px] text-slate-500 font-medium uppercase block flex items-center gap-1">
                <Calendar className="w-3 h-3 text-slate-400" /> Date
              </span>
              <span className="font-semibold text-slate-200">{tx.transaction_date || '-'}</span>
            </div>

            <div className="bg-slate-900/90 border border-slate-800 p-2.5 rounded-lg">
              <span className="text-[10px] text-slate-500 font-medium uppercase block flex items-center gap-1">
                <Clock className="w-3 h-3 text-slate-400" /> Time
              </span>
              <span className="font-semibold text-slate-200">{tx.transaction_time || '-'}</span>
            </div>

            <div className="bg-slate-900/90 border border-slate-800 p-2.5 rounded-lg">
              <span className="text-[10px] text-slate-500 font-medium uppercase block flex items-center gap-1">
                <Hash className="w-3 h-3 text-slate-400" /> Ref / UTR No
              </span>
              <span className="font-semibold text-sky-400 font-mono break-all">{tx.reference_number || tx.utr_number || '-'}</span>
            </div>

            <div className="bg-slate-900/90 border border-slate-800 p-2.5 rounded-lg">
              <span className="text-[10px] text-slate-500 font-medium uppercase block flex items-center gap-1">
                <User className="w-3 h-3 text-slate-400" /> Beneficiary / Receiver
              </span>
              <span className="font-semibold text-slate-200">{tx.receiver_name || '-'}</span>
            </div>

            <div className="bg-slate-900/90 border border-slate-800 p-2.5 rounded-lg">
              <span className="text-[10px] text-slate-500 font-medium uppercase block flex items-center gap-1">
                <User className="w-3 h-3 text-slate-400" /> Sender / Payer
              </span>
              <span className="font-semibold text-slate-200">{tx.sender_name || '-'}</span>
            </div>

            <div className="bg-slate-900/90 border border-slate-800 p-2.5 rounded-lg">
              <span className="text-[10px] text-slate-500 font-medium uppercase block flex items-center gap-1">
                <Building2 className="w-3 h-3 text-slate-400" /> Bank & IFSC
              </span>
              <span className="font-semibold text-slate-200">
                {tx.bank_name || '-'} {tx.ifsc ? `(${tx.ifsc})` : ''}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
