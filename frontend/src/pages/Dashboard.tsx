import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Upload, FileText, Image as ImageIcon, CheckCircle2, AlertTriangle, 
  Trash2, Play, Eye, Calendar, ArrowRight, Loader2, RefreshCw 
} from 'lucide-react';
import { api } from '../services/api';
import { ProcessingStatus } from '../shared/types';

export const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  
  const [screenshotFiles, setScreenshotFiles] = useState<File[]>([]);
  const [statementFile, setStatementFile] = useState<File | null>(null);
  const [reportName, setReportName] = useState('');
  const [isUploadingScreenshots, setIsUploadingScreenshots] = useState(false);
  const [isUploadingStatement, setIsUploadingStatement] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const screenshotInputRef = useRef<HTMLInputElement>(null);
  const statementInputRef = useRef<HTMLInputElement>(null);

  // 1. Queries
  const { data: screenshots = [], isLoading: isLoadingScreenshots } = useQuery({
    queryKey: ['screenshots'],
    queryFn: () => api.payments.list(),
  });

  const { data: statements = [], isLoading: isLoadingStatements } = useQuery({
    queryKey: ['statements'],
    queryFn: () => api.statements.list(),
  });

  const { data: reports = [], isLoading: isLoadingReports } = useQuery({
    queryKey: ['reports'],
    queryFn: () => api.reconciliation.listReports(),
  });

  // 2. Polling for Active OCR processing
  const hasProcessingScreenshots = screenshots.some(
    s => s.status === ProcessingStatus.PENDING || s.status === ProcessingStatus.PROCESSING
  );

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (hasProcessingScreenshots) {
      interval = setInterval(() => {
        queryClient.invalidateQueries({ queryKey: ['screenshots'] });
      }, 3000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [hasProcessingScreenshots, queryClient]);

  // 3. Mutations
  const deleteScreenshotMutation = useMutation({
    mutationFn: (id: string) => api.payments.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['screenshots'] });
    },
  });

  const deleteStatementMutation = useMutation({
    mutationFn: (id: string) => api.statements.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['statements'] });
    },
  });

  const runReconciliationMutation = useMutation({
    mutationFn: () => api.reconciliation.run(reportName),
    onSuccess: (newReport) => {
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      setReportName('');
      navigate(`/reports/${newReport.id}`);
    },
    onError: (err: any) => {
      alert(err.error || 'Failed to run reconciliation');
    }
  });

  const deleteReportMutation = useMutation({
    mutationFn: (id: string) => api.reconciliation.deleteReport(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reports'] });
    },
  });

  // 4. Handlers
  const handleScreenshotChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setScreenshotFiles(Array.from(e.target.files));
    }
  };

  const handleStatementChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setStatementFile(e.target.files[0]);
    }
  };

  const handleScreenshotUpload = async () => {
    if (screenshotFiles.length === 0) return;
    setIsUploadingScreenshots(true);
    setUploadError(null);

    try {
      const res = await api.payments.upload(screenshotFiles);
      if (res.failed.length > 0) {
        setUploadError(`Failed to upload ${res.failed.length} file(s). Some may be duplicates.`);
      }
      setScreenshotFiles([]);
      queryClient.invalidateQueries({ queryKey: ['screenshots'] });
    } catch (err: any) {
      setUploadError(err.error || 'Failed to upload payment screenshots.');
    } finally {
      setIsUploadingScreenshots(false);
    }
  };

  const handleStatementUpload = async () => {
    if (!statementFile) return;
    setIsUploadingStatement(true);
    setUploadError(null);

    try {
      await api.statements.upload(statementFile);
      setStatementFile(null);
      queryClient.invalidateQueries({ queryKey: ['statements'] });
    } catch (err: any) {
      setUploadError(err.error || 'Failed to upload statement file.');
    } finally {
      setIsUploadingStatement(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Page Heading */}
      <div className="md:flex md:items-center md:justify-between">
        <div className="flex-1 min-w-0">
          <h2 className="text-2xl font-bold text-slate-900 leading-7 sm:truncate">Reconciliation Dashboard</h2>
          <p className="text-sm text-slate-500 mt-1">Upload screenshots and statement documents to match transactions</p>
        </div>
      </div>

      {uploadError && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm p-4 rounded-xl flex items-start gap-2.5">
          <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <span>{uploadError}</span>
        </div>
      )}

      {/* Grid Panels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Panel 1: Payment Screenshots */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col">
          <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2 mb-4">
            <ImageIcon className="h-5 w-5 text-indigo-600" />
            <span>Payment Screenshots</span>
          </h3>

          <div className="border-2 border-dashed border-slate-200 hover:border-indigo-400 transition-colors rounded-xl p-6 flex flex-col items-center justify-center bg-slate-50/50">
            <Upload className="h-8 w-8 text-slate-400 mb-2" />
            <span className="text-sm text-slate-600 text-center">Drag and drop screenshots, or click browse</span>
            <input 
              type="file" 
              multiple 
              accept="image/*" 
              ref={screenshotInputRef}
              onChange={handleScreenshotChange}
              className="hidden" 
            />
            <button 
              onClick={() => screenshotInputRef.current?.click()}
              className="mt-3 text-xs font-semibold text-indigo-600 hover:text-indigo-800 bg-white border border-slate-200 hover:border-indigo-200 py-1.5 px-3 rounded-lg shadow-sm"
            >
              Browse Images
            </button>
          </div>

          {screenshotFiles.length > 0 && (
            <div className="mt-4 flex items-center justify-between bg-indigo-50 border border-indigo-100 rounded-xl p-3">
              <span className="text-xs text-indigo-800 font-medium">
                {screenshotFiles.length} file(s) selected
              </span>
              <button
                onClick={handleScreenshotUpload}
                disabled={isUploadingScreenshots}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs py-1.5 px-3 rounded-lg flex items-center gap-1 shadow-sm shadow-indigo-600/10"
              >
                {isUploadingScreenshots ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Uploading...</span>
                  </>
                ) : (
                  <>
                    <span>Upload</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </>
                )}
              </button>
            </div>
          )}

          {/* List of uploaded screenshots */}
          <div className="mt-6 flex-grow">
            <div className="flex justify-between items-center mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Uploaded Payments ({screenshots.length})</span>
              {hasProcessingScreenshots && (
                <span className="flex items-center gap-1 text-[11px] font-medium text-indigo-600 animate-pulse bg-indigo-50 px-2 py-0.5 rounded-full">
                  <RefreshCw className="h-3 w-3 animate-spin" />
                  <span>Parsing OCR...</span>
                </span>
              )}
            </div>
            
            {isLoadingScreenshots ? (
              <div className="flex justify-center py-6 text-slate-400 text-sm">Loading screenshots...</div>
            ) : screenshots.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-sm border border-slate-100 rounded-xl bg-slate-50/20">
                No payment images uploaded yet
              </div>
            ) : (
              <div className="max-h-[300px] overflow-y-auto space-y-2 border border-slate-100 p-2 rounded-xl">
                {screenshots.map((s) => (
                  <div key={s.id} className="flex items-center justify-between p-2.5 bg-slate-50 hover:bg-slate-100/70 border border-slate-200/60 rounded-xl transition-all">
                    <div className="flex items-center gap-3 overflow-hidden">
                      <img src={s.cloudinaryUrl} alt={s.filename} className="h-9 w-9 object-cover rounded-md border border-slate-200 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-slate-800 truncate" title={s.filename}>{s.filename}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {s.status === ProcessingStatus.PENDING && (
                            <span className="text-[10px] bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded-md font-medium">Pending</span>
                          )}
                          {s.status === ProcessingStatus.PROCESSING && (
                            <span className="text-[10px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-md font-medium flex items-center gap-0.5">
                              <Loader2 className="h-2.5 w-2.5 animate-spin" />
                              <span>Processing</span>
                            </span>
                          )}
                          {s.status === ProcessingStatus.PROCESSED && (
                            <span className="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded-md font-medium flex items-center gap-0.5">
                              <CheckCircle2 className="h-2.5 w-2.5 text-emerald-600" />
                              <span>Processed</span>
                            </span>
                          )}
                          {s.status === ProcessingStatus.FAILED && (
                            <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded-md font-medium">Failed</span>
                          )}
                          {s.amount && (
                            <span className="text-[10px] text-slate-500 font-semibold">₹{s.amount.toLocaleString()}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    <button
                      onClick={() => deleteScreenshotMutation.mutate(s.id)}
                      className="text-slate-400 hover:text-red-600 p-1.5 hover:bg-white rounded-lg border border-transparent hover:border-slate-200 transition-all shrink-0"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Panel 2: Bank Statements */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col">
          <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2 mb-4">
            <FileText className="h-5 w-5 text-indigo-600" />
            <span>Bank Statements</span>
          </h3>

          <div className="border-2 border-dashed border-slate-200 hover:border-indigo-400 transition-colors rounded-xl p-6 flex flex-col items-center justify-center bg-slate-50/50">
            <Upload className="h-8 w-8 text-slate-400 mb-2" />
            <span className="text-sm text-slate-600 text-center">Upload CSV or Excel statements</span>
            <input 
              type="file" 
              accept=".csv,.xlsx,.xls" 
              ref={statementInputRef}
              onChange={handleStatementChange}
              className="hidden" 
            />
            <button 
              onClick={() => statementInputRef.current?.click()}
              className="mt-3 text-xs font-semibold text-indigo-600 hover:text-indigo-800 bg-white border border-slate-200 hover:border-indigo-200 py-1.5 px-3 rounded-lg shadow-sm"
            >
              Browse Statement
            </button>
          </div>

          {statementFile && (
            <div className="mt-4 flex items-center justify-between bg-indigo-50 border border-indigo-100 rounded-xl p-3">
              <span className="text-xs text-indigo-800 font-medium truncate max-w-[200px]" title={statementFile.name}>
                {statementFile.name}
              </span>
              <button
                onClick={handleStatementUpload}
                disabled={isUploadingStatement}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs py-1.5 px-3 rounded-lg flex items-center gap-1 shadow-sm shadow-indigo-600/10"
              >
                {isUploadingStatement ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Importing...</span>
                  </>
                ) : (
                  <>
                    <span>Import</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </>
                )}
              </button>
            </div>
          )}

          {/* List of statement files */}
          <div className="mt-6 flex-grow">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block mb-3">Active Statements ({statements.length})</span>
            
            {isLoadingStatements ? (
              <div className="flex justify-center py-6 text-slate-400 text-sm">Loading statements...</div>
            ) : statements.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-sm border border-slate-100 rounded-xl bg-slate-50/20">
                No bank statements imported yet
              </div>
            ) : (
              <div className="max-h-[300px] overflow-y-auto space-y-2 border border-slate-100 p-2 rounded-xl">
                {statements.map((s) => (
                  <div key={s.id} className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-200/60 rounded-xl hover:bg-slate-100/70 transition-all">
                    <div className="flex items-center gap-3 overflow-hidden">
                      <div className="h-8 w-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0 border border-emerald-100">
                        <FileText className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-slate-800 truncate" title={s.filename}>{s.filename}</p>
                        <p className="text-[10px] text-slate-500 mt-0.5 flex items-center gap-2">
                          <span>{s.transactionCount} transactions</span>
                          <span className="h-1 w-1 bg-slate-300 rounded-full" />
                          <span>Imported {new Date(s.importedAt).toLocaleDateString()}</span>
                        </p>
                      </div>
                    </div>
                    
                    <button
                      onClick={() => deleteStatementMutation.mutate(s.id)}
                      className="text-slate-400 hover:text-red-600 p-1.5 hover:bg-white rounded-lg border border-transparent hover:border-slate-200 transition-all shrink-0"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Panel 3: Run Reconciliation */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2 mb-4">
          <Play className="h-5 w-5 text-indigo-600" />
          <span>Execute Reconciliation</span>
        </h3>

        <div className="md:flex md:items-end md:gap-4 space-y-4 md:space-y-0">
          <div className="flex-grow">
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
              Report Name (Optional)
            </label>
            <input 
              type="text" 
              value={reportName}
              onChange={(e) => setReportName(e.target.value)}
              placeholder="e.g. July Settlement Run" 
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 text-slate-900 transition-all text-sm"
            />
          </div>
          
          <button
            onClick={() => runReconciliationMutation.mutate()}
            disabled={runReconciliationMutation.isPending || screenshots.length === 0 || statements.length === 0}
            className="w-full md:w-auto bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2.5 px-6 rounded-xl transition-all shadow-md shadow-indigo-600/10 flex items-center justify-center gap-2 disabled:bg-slate-100 disabled:text-slate-400 disabled:shadow-none"
          >
            {runReconciliationMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Running Matching...</span>
              </>
            ) : (
              <>
                <span>Run Reconciliation</span>
                <Play className="h-4 w-4 fill-white" />
              </>
            )}
          </button>
        </div>
      </div>

      {/* Panel 4: Previous Reports */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2 mb-4">
          <Calendar className="h-5 w-5 text-indigo-600" />
          <span>Previous Reports</span>
        </h3>

        {isLoadingReports ? (
          <div className="flex justify-center py-6 text-slate-400 text-sm">Loading reports...</div>
        ) : reports.length === 0 ? (
          <div className="text-center py-8 text-slate-400 text-sm border border-slate-100 rounded-xl bg-slate-50/20">
            No reports generated yet. Add your screenshots, bank statements and click "Run Reconciliation" above.
          </div>
        ) : (
          <div className="space-y-4">
            {reports.map((report) => (
              <div key={report.id} className="border border-slate-200 rounded-xl p-4 hover:border-slate-300 transition-all md:flex md:items-center md:justify-between bg-slate-50/30">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-semibold text-slate-900 truncate" title={report.name}>{report.name}</h4>
                    <span className="text-[10px] text-slate-400 font-medium">
                      {new Date(report.createdAt).toLocaleDateString()} {new Date(report.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  
                  {/* Summary Badges */}
                  <div className="flex flex-wrap gap-2 mt-2">
                    <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full border border-slate-200/50">
                      Total: {report.totalCount}
                    </span>
                    <span className="text-[10px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full border border-emerald-100">
                      Matched: {report.matchedCount}
                    </span>
                    {report.possibleCount > 0 && (
                      <span className="text-[10px] bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full border border-amber-100">
                        Possible: {report.possibleCount}
                      </span>
                    )}
                    {report.needsReviewCount > 0 && (
                      <span className="text-[10px] bg-red-50 text-red-700 px-2 py-0.5 rounded-full border border-red-100">
                        Needs Review: {report.needsReviewCount}
                      </span>
                    )}
                    {report.unmatchedCount > 0 && (
                      <span className="text-[10px] bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full border border-slate-300/40">
                        Unmatched: {report.unmatchedCount}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 mt-4 md:mt-0 shrink-0">
                  <button
                    onClick={() => navigate(`/reports/${report.id}`)}
                    className="flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800 bg-white border border-slate-200 hover:border-indigo-200 py-1.5 px-3.5 rounded-lg shadow-sm"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    <span>View Report</span>
                  </button>
                  <button
                    onClick={() => deleteReportMutation.mutate(report.id)}
                    className="text-slate-400 hover:text-red-600 p-2 hover:bg-slate-100/80 rounded-lg border border-transparent"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
export default Dashboard;
