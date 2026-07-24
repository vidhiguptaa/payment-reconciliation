import React, { useEffect, useState } from 'react';
import {
  StatementFileItem,
  StatementTransactionItem,
  StatementImportSummary,
  getStatements,
  getStatementTransactions
} from '../services/api';
import { processStatementFolder, ProcessingProgress } from '../services/folderPicker';
import {
  FileSpreadsheet,
  DownloadCloud,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Search,
  ChevronLeft,
  ChevronRight,
  X,
  Loader2,
  Hash,
  ArrowUpCircle
} from 'lucide-react';

export const BankStatementsView: React.FC = () => {
  const [statementFiles, setStatementFiles] = useState<StatementFileItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [importing, setImporting] = useState<boolean>(false);
  const [importSummary, setImportSummary] = useState<StatementImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<ProcessingProgress | null>(null);

  const [selectedFile, setSelectedFile] = useState<StatementFileItem | null>(null);
  const [transactions, setTransactions] = useState<StatementTransactionItem[]>([]);
  const [txLoading, setTxLoading] = useState<boolean>(false);
  const [search, setSearch] = useState<string>('');
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalTxs, setTotalTxs] = useState<number>(0);

  const fetchFiles = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getStatements();
      setStatementFiles(res.items);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch statement files');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFiles();
  }, []);

  const handleImport = async () => {
    setError(null);
    setImportSummary(null);
    try {
      const result = await processStatementFolder(
        (progress) => {
          setUploadProgress(progress);
        }
      );
      
      if (result.total === 0) {
        setUploadProgress(null);
        return;
      }
      
      setImporting(true);
      await fetchFiles();
      
      setImportSummary({
        total_scanned: result.total,
        new_imported: result.uploaded,
        skipped_duplicates: result.skipped,
        unsupported_ignored: 0,
        failed_errors: 0,
        details: []
      });
      
      setTimeout(async () => {
        setImporting(false);
        setUploadProgress(null);
        await fetchFiles();
      }, 2000);
      
    } catch (err: any) {
      setError(err.message || 'Import failed');
      setUploadProgress(null);
    }
  };

  const fetchTransactions = async (fileId: number, querySearch: string, pageNum: number) => {
    setTxLoading(true);
    try {
      const res = await getStatementTransactions(fileId, querySearch, pageNum, 50);
      setTransactions(res.transactions);
      setPage(res.page);
      setTotalPages(res.total_pages);
      setTotalTxs(res.total);
    } catch (err: any) {
      console.error('Failed to fetch statement transactions:', err);
    } finally {
      setTxLoading(false);
    }
  };

  const openFileDetails = (file: StatementFileItem) => {
    setSelectedFile(file);
    setSearch('');
    setPage(1);
    fetchTransactions(file.id, '', 1);
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearch(val);
    if (selectedFile) {
      fetchTransactions(selectedFile.id, val, 1);
    }
  };

  const handlePageChange = (newPage: number) => {
    if (selectedFile && newPage >= 1 && newPage <= totalPages) {
      fetchTransactions(selectedFile.id, search, newPage);
    }
  };

  const formatDate = (isoString: string): string => {
    if (!isoString) return '-';
    try {
      return new Date(isoString).toLocaleString('en-US', {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div className="space-y-6">
      {uploadProgress && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl space-y-4 animate-slideIn">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-white text-sm flex items-center gap-2">
                {uploadProgress.step === 'hashing' && <Hash className="w-4 h-4 text-sky-400 animate-pulse" />}
                {uploadProgress.step === 'checking_duplicates' && <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />}
                {uploadProgress.step === 'uploading' && <ArrowUpCircle className="w-4 h-4 text-emerald-400 animate-bounce" />}
                {uploadProgress.step === 'processing' && <Loader2 className="w-4 h-4 text-amber-400 animate-spin" />}
                <span className="capitalize">{uploadProgress.step.replace('_', ' ')}...</span>
              </h3>
              <span className="text-xs font-mono bg-slate-800 border border-slate-700 text-slate-300 px-2 py-0.5 rounded-full">
                {uploadProgress.progress}%
              </span>
            </div>

            {/* Progress Bar */}
            <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-emerald-500 to-teal-600 rounded-full transition-all duration-300"
                style={{ width: `${uploadProgress.progress}%` }}
              />
            </div>

            {/* Info Stats */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="bg-slate-950/45 p-3 rounded-lg border border-slate-800/40">
                <div className="text-slate-400">Total Scanned</div>
                <div className="text-base font-bold text-white mt-0.5">{uploadProgress.totalFiles}</div>
              </div>
              <div className="bg-slate-950/45 p-3 rounded-lg border border-slate-800/40">
                <div className="text-slate-400">Duplicates Skipped</div>
                <div className="text-base font-bold text-amber-400 mt-0.5">{uploadProgress.skippedCount}</div>
              </div>
            </div>
            
            {uploadProgress.uploadedCount > 0 && (
              <div className="text-[11px] text-slate-400 text-center">
                Uploading <span className="text-white font-medium">{uploadProgress.uploadedCount}</span> new files to the server
              </div>
            )}
          </div>
        </div>
      )}

      {/* Action Header */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center space-x-2">
            <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
            <span>Bank & Account Statements</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Monitor folder: <code className="bg-slate-950 px-2 py-0.5 rounded text-emerald-400 font-mono">data/account-statements/</code> (.csv, .xlsx)
          </p>
        </div>

        <button
          onClick={handleImport}
          disabled={importing}
          className="flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 text-white text-xs font-semibold rounded-xl shadow-lg transition-all"
        >
          {importing ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            <DownloadCloud className="w-4 h-4" />
          )}
          <span>{importing ? 'Importing Statements...' : 'Import Statements'}</span>
        </button>
      </div>

      {error && (
        <div className="p-4 bg-rose-950/60 border border-rose-800 rounded-xl text-xs text-rose-300 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Import Result Banner */}
      {importSummary && (
        <div className="bg-slate-900 border border-emerald-800/80 rounded-xl p-4 text-xs space-y-2">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <span className="font-bold text-emerald-400 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4" /> Statement Scan Completed
            </span>
            <button onClick={() => setImportSummary(null)} className="text-slate-500 hover:text-slate-300">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex flex-wrap gap-4 text-slate-300">
            <div>Scanned: <span className="font-semibold text-white">{importSummary.total_scanned}</span></div>
            <div>New Imported: <span className="font-semibold text-emerald-400">{importSummary.new_imported}</span></div>
            <div>Duplicates Skipped: <span className="font-semibold text-amber-400">{importSummary.skipped_duplicates}</span></div>
            <div>Ignored: <span className="font-semibold text-slate-400">{importSummary.unsupported_ignored}</span></div>
          </div>
        </div>
      )}

      {/* Statement Files Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
            Imported Statement Files ({statementFiles.length})
          </h3>
          <button
            onClick={fetchFiles}
            disabled={loading}
            className="p-1.5 text-slate-400 hover:text-white bg-slate-800 rounded-lg border border-slate-700 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {loading ? (
          <div className="py-12 text-center text-xs text-slate-400 flex items-center justify-center space-x-2">
            <RefreshCw className="w-4 h-4 animate-spin text-emerald-400" />
            <span>Loading statement files...</span>
          </div>
        ) : statementFiles.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-400 space-y-3">
            <FileSpreadsheet className="w-10 h-10 mx-auto text-slate-600" />
            <p>No bank statements imported yet.</p>
            <p className="text-[11px] text-slate-500">Add CSV or XLSX files into <code className="text-emerald-400 font-mono">data/account-statements/</code> and click Import.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Statement File</th>
                  <th className="py-3 px-4">Import Date</th>
                  <th className="py-3 px-4">Total Transactions</th>
                  <th className="py-3 px-4">Proc. Time</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {statementFiles.map((file) => (
                  <tr key={file.id} className="hover:bg-slate-800/50 transition-colors">
                    <td className="py-3 px-4 font-semibold text-white flex items-center space-x-2">
                      <FileSpreadsheet className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                      <span className="break-all">{file.filename}</span>
                    </td>
                    <td className="py-3 px-4 text-slate-400">{formatDate(file.imported_at)}</td>
                    <td className="py-3 px-4 font-semibold text-slate-200">{file.total_transactions} txs</td>
                    <td className="py-3 px-4 text-slate-400">{file.processing_time_ms} ms</td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        file.status === 'PROCESSED' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-rose-950 text-rose-400 border border-rose-800'
                      }`}>
                        {file.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => openFileDetails(file)}
                        className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-sky-400 hover:text-sky-300 text-xs font-semibold rounded-lg border border-slate-700 transition-colors"
                      >
                        View Transactions
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Transaction Details Modal / Drawer */}
      {selectedFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
          <div className="relative w-full max-w-6xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-slate-950 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center space-x-3">
                <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
                <div>
                  <h3 className="text-base font-bold text-white">{selectedFile.filename}</h3>
                  <p className="text-xs text-slate-400">Total {totalTxs} transactions imported</p>
                </div>
              </div>

              {/* Search Control */}
              <div className="flex items-center space-x-3">
                <div className="relative w-64">
                  <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
                  <input
                    type="text"
                    placeholder="Search narration, Ref, UTR..."
                    value={search}
                    onChange={handleSearchChange}
                    className="w-full bg-slate-900 border border-slate-700 text-xs text-slate-200 pl-9 pr-3 py-1.5 rounded-lg focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <button
                  onClick={() => setSelectedFile(null)}
                  className="p-1.5 text-slate-400 hover:text-white bg-slate-800 rounded-full border border-slate-700"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Transactions Table Body */}
            <div className="flex-1 overflow-y-auto p-6">
              {txLoading ? (
                <div className="py-12 text-center text-xs text-slate-400 flex items-center justify-center space-x-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-emerald-400" />
                  <span>Loading transactions...</span>
                </div>
              ) : transactions.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-400">
                  <p>No transactions found matching your search filter.</p>
                </div>
              ) : (
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] tracking-wider sticky top-0 border-b border-slate-800">
                    <tr>
                      <th className="py-3 px-3">Date</th>
                      <th className="py-3 px-3">Description / Narration</th>
                      <th className="py-3 px-3">Ref / UTR No</th>
                      <th className="py-3 px-3 text-right">Debit (₹)</th>
                      <th className="py-3 px-3 text-right">Credit (₹)</th>
                      <th className="py-3 px-3 text-right">Balance (₹)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80">
                    {transactions.map((tx) => (
                      <tr key={tx.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="py-2.5 px-3 font-semibold text-slate-300 whitespace-nowrap">{tx.transaction_date || '-'}</td>
                        <td className="py-2.5 px-3 text-slate-200 max-w-xs break-words">{tx.description || '-'}</td>
                        <td className="py-2.5 px-3 font-mono text-sky-400 text-[11px] whitespace-nowrap">{tx.reference_number || tx.utr_number || '-'}</td>
                        <td className="py-2.5 px-3 text-right font-medium text-rose-400 whitespace-nowrap">
                          {tx.debit ? `₹${tx.debit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '-'}
                        </td>
                        <td className="py-2.5 px-3 text-right font-medium text-emerald-400 whitespace-nowrap">
                          {tx.credit ? `₹${tx.credit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '-'}
                        </td>
                        <td className="py-2.5 px-3 text-right font-semibold text-slate-300 whitespace-nowrap">
                          {tx.balance ? `₹${tx.balance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Pagination Footer */}
            <div className="px-6 py-3 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
              <div>
                Page <span className="font-bold text-white">{page}</span> of <span className="font-bold text-white">{totalPages}</span>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  onClick={() => handlePageChange(page - 1)}
                  disabled={page <= 1}
                  className="px-3 py-1 bg-slate-800 disabled:opacity-40 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-700 flex items-center gap-1"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Previous</span>
                </button>
                <button
                  onClick={() => handlePageChange(page + 1)}
                  disabled={page >= totalPages}
                  className="px-3 py-1 bg-slate-800 disabled:opacity-40 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-700 flex items-center gap-1"
                >
                  <span>Next</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
