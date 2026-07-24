import { useEffect, useState, useCallback } from 'react';
import { Header } from './components/Header';
import { StatsOverview } from './components/StatsOverview';
import { ScreenshotGrid } from './components/ScreenshotGrid';
import { TransactionTable } from './components/TransactionTable';
import { ImagePreviewModal } from './components/ImagePreviewModal';
import { BankStatementsView } from './components/BankStatementsView';
import { ReconciliationView } from './components/ReconciliationView';
import { SettingsView } from './components/SettingsView';
import { UpdateBanner } from './components/UpdateBanner';
import { AboutModal } from './components/AboutModal';
import { ToastNotification } from './components/ToastNotification';
import { wsService } from './services/websocket';
import {
  ScreenshotItem,
  ScanSummary,
  JobsListResponse,
  getScreenshots,
  processAllPending,
  getReconciliationMatches,
  checkHealth,
  getSettings,
  updateSettings
} from './services/api';
import { processScreenshotFolder, ProcessingProgress } from './services/folderPicker';
import { 
  CheckCircle2, 
  AlertCircle, 
  Sparkles, 
  Loader2, 
  Hash, 
  ArrowUpCircle
} from 'lucide-react';

type TabType = 'screenshots' | 'statements' | 'reconciliation' | 'settings';

export function App() {
  const [activeTab, setActiveTab] = useState<TabType>('screenshots');
  const [screenshots, setScreenshots] = useState<ScreenshotItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [initialBooting, setInitialBooting] = useState<boolean>(true);
  const [scanning, setScanning] = useState<boolean>(false);
  const [processing, setProcessing] = useState<boolean>(false);
  const [selectedScreenshot, setSelectedScreenshot] = useState<ScreenshotItem | null>(null);
  const [isAboutOpen, setIsAboutOpen] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<ProcessingProgress | null>(null);

  const [scanSummary, setScanSummary] = useState<ScanSummary | null>(null);
  const [jobSummary, setJobSummary] = useState<JobsListResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [matchCounts, setMatchCounts] = useState<{ matched: number; possible: number; review: number; unmatched: number }>({
    matched: 0,
    possible: 0,
    review: 0,
    unmatched: 0
  });

  const handleTabChange = useCallback((tab: TabType) => {
    setActiveTab(tab);
    updateSettings({ last_tab: tab }).catch(() => {});
  }, []);

  const loadScreenshots = useCallback(async () => {
    setLoading(true);
    try {
      // First verify backend is connected via health check
      const health = await checkHealth();
      if (!health || (health.status !== 'ok' && health.status !== 'degraded')) {
        throw new Error('Backend health check returned invalid status');
      }

      setErrorMessage(null);

      // Backend is online, fetch app statistics and screenshots
      try {
        const [res, reconRes] = await Promise.all([
          getScreenshots(),
          getReconciliationMatches()
        ]);

        setScreenshots(res.items);
        setMatchCounts({
          matched: reconRes.matched_count,
          possible: reconRes.possible_count,
          review: reconRes.needs_review_count,
          unmatched: reconRes.unmatched_count
        });
      } catch (dataErr) {
        console.warn('Dashboard statistics failed to load, backend is connected:', dataErr);
      }
    } catch (err: any) {
      console.error('Failed to load dashboard data:', err);
      setErrorMessage('Unable to connect to the Payment Reconciliation backend. Please check your network connection.');
    } finally {
      setLoading(false);
      setInitialBooting(false);
    }
  }, []);

  // Restore last tab from user settings
  useEffect(() => {
    getSettings()
      .then((s) => {
        if (s && s.last_tab && ['screenshots', 'statements', 'reconciliation', 'settings'].includes(s.last_tab)) {
          setActiveTab(s.last_tab as TabType);
        }
      })
      .catch(() => {});
  }, []);

  // Dynamic Window Title Processing Indicator
  useEffect(() => {
    const isBusy = processing || scanning;
    const title = isBusy
      ? 'Payment Reconciliation System - ⚙️ Processing...'
      : 'Payment & Bank Statement Reconciliation';

    document.title = title;

    // Also update Tauri window title if running in desktop shell
    if ((window as any).__TAURI_INTERNALS__) {
      import('@tauri-apps/api/window')
        .then(({ getCurrentWindow }) => {
          getCurrentWindow().setTitle(title).catch(() => {});
        })
        .catch(() => {});
    }
  }, [processing, scanning]);

  // Prevent accidental close while processing files
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (processing || scanning) {
        e.preventDefault();
        e.returnValue = 'Background processing is in progress. Are you sure you want to exit?';
        return e.returnValue;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [processing, scanning]);

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isCmdOrCtrl = e.metaKey || e.ctrlKey;
      if (!isCmdOrCtrl) return;

      if (e.key.toLowerCase() === 's' && !e.shiftKey) {
        e.preventDefault();
        handleScanFolder();
      } else if (e.key.toLowerCase() === 'p' && !e.shiftKey) {
        e.preventDefault();
        handleProcessPending();
      } else if (e.key === ',') {
        e.preventDefault();
        handleTabChange('settings');
      } else if (e.key === '1') {
        e.preventDefault();
        handleTabChange('screenshots');
      } else if (e.key === '2') {
        e.preventDefault();
        handleTabChange('statements');
      } else if (e.key === '3') {
        e.preventDefault();
        handleTabChange('reconciliation');
      } else if (e.key === '4') {
        e.preventDefault();
        handleTabChange('settings');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleTabChange]);

  useEffect(() => {
    loadScreenshots();

    wsService.connect();
    const unsubscribe = wsService.subscribe((event) => {
      if (
        event === 'SCREENSHOT_IMPORTED' ||
        event === 'STATEMENT_IMPORTED' ||
        event === 'RECONCILIATION_COMPLETED'
      ) {
        loadScreenshots();
      }
    });

    return () => {
      unsubscribe();
    };
  }, [loadScreenshots]);

  const handleScanFolder = async () => {
    setErrorMessage(null);
    setScanSummary(null);
    try {
      const result = await processScreenshotFolder(
        (progress) => {
          setUploadProgress(progress);
        }
      );
      
      if (result.total === 0) {
        setUploadProgress(null);
        return;
      }
      
      setScanning(true);
      await loadScreenshots();
      
      // Start polling for processing status
      let attempts = 0;
      const interval = setInterval(async () => {
        attempts++;
        try {
          const res = await getScreenshots();
          const hasPending = res.items.some(
            (item) => item.status === 'PENDING' || item.status === 'PROCESSING'
          );
          if (!hasPending || attempts > 60) {
            clearInterval(interval);
            setScanning(false);
            setUploadProgress(null);
            await loadScreenshots();
            
            setScanSummary({
              total_scanned: result.total,
              new_imported: result.uploaded,
              skipped_duplicates: result.skipped,
              unsupported_ignored: 0,
              failed_errors: 0,
              details: []
            });
          }
        } catch (pollErr) {
          console.error('Error polling screenshot status:', pollErr);
        }
      }, 2000);
      
    } catch (err: any) {
      setErrorMessage(err.message || 'Scan folder operation failed.');
      setUploadProgress(null);
    }
  };

  const handleProcessPending = async () => {
    setProcessing(true);
    setJobSummary(null);
    setErrorMessage(null);
    try {
      const summary = await processAllPending();
      setJobSummary(summary);
      await loadScreenshots();
    } catch (err: any) {
      setErrorMessage(err.message || 'Processing pending screenshots failed.');
    } finally {
      setProcessing(false);
    }
  };

  if (initialBooting) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6 font-sans">
        <div className="flex flex-col items-center space-y-4 max-w-sm text-center">
          <div className="w-12 h-12 rounded-2xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center animate-pulse">
            <Sparkles className="w-6 h-6 text-sky-400" />
          </div>
          <h2 className="text-lg font-bold text-white tracking-wide">
            Initializing Payment Engine
          </h2>
          <p className="text-xs text-slate-400 leading-relaxed">
            Connecting to remote payment reconciliation engine...
          </p>
          <div className="w-32 h-1 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
            <div className="w-full h-full bg-sky-500 animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-sky-500 selection:text-white pb-16">
      <UpdateBanner />
      <ToastNotification />

      {uploadProgress && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl space-y-4">
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
                className="h-full bg-gradient-to-r from-sky-400 to-indigo-500 rounded-full transition-all duration-300"
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

      <Header
        onScanClick={handleScanFolder}
        onProcessPendingClick={handleProcessPending}
        onAboutClick={() => setIsAboutOpen(true)}
        scanning={scanning}
        processing={processing}
        activeTab={activeTab}
        onTabChange={handleTabChange}
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 space-y-6">
        {errorMessage && (
          <div className="p-4 bg-rose-950/80 border border-rose-800 rounded-xl text-xs text-rose-300 flex items-center justify-between shadow-lg">
            <div className="flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
              <span>{errorMessage}</span>
            </div>
            <button
              onClick={() => setErrorMessage(null)}
              className="text-rose-400 hover:text-white text-xs font-bold"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Tab Content 1: Payment Screenshots Dashboard */}
        {activeTab === 'screenshots' && (
          <>
            {scanSummary && (
              <div className="bg-slate-900 border border-sky-800/80 rounded-xl p-4 text-xs space-y-2 animate-fadeIn">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <span className="font-bold text-sky-400 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" /> Scan Folder Completed
                  </span>
                  <button onClick={() => setScanSummary(null)} className="text-slate-500 hover:text-slate-300">
                    ✕
                  </button>
                </div>
                <div className="flex flex-wrap gap-4 text-slate-300">
                  <div>Scanned: <span className="font-semibold text-white">{scanSummary.total_scanned}</span></div>
                  <div>New Imported: <span className="font-semibold text-emerald-400">{scanSummary.new_imported}</span></div>
                  <div>Duplicates Skipped: <span className="font-semibold text-amber-400">{scanSummary.skipped_duplicates}</span></div>
                  <div>Ignored: <span className="font-semibold text-slate-400">{scanSummary.unsupported_ignored}</span></div>
                </div>
              </div>
            )}

            {jobSummary && (
              <div className="bg-slate-900 border border-indigo-800/80 rounded-xl p-4 text-xs space-y-2 animate-fadeIn">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <span className="font-bold text-indigo-400 flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4" /> Pipeline Execution Completed
                  </span>
                  <button onClick={() => setJobSummary(null)} className="text-slate-500 hover:text-slate-300">
                    ✕
                  </button>
                </div>
                <p className="text-slate-300">
                  Successfully processed <span className="font-bold text-white">{jobSummary.total}</span> pending payment screenshots through the pipeline.
                </p>
              </div>
            )}

            <StatsOverview
              totalScreenshots={screenshots.length}
              matched={matchCounts.matched}
              possibleMatches={matchCounts.possible}
              needsReview={matchCounts.review}
              unmatched={matchCounts.unmatched}
            />

            <ScreenshotGrid
              screenshots={screenshots}
              loading={loading}
              onSelect={(sc) => setSelectedScreenshot(sc)}
              onScanClick={handleScanFolder}
            />

            <TransactionTable />
          </>
        )}

        {/* Tab Content 2: Bank Statements View */}
        {activeTab === 'statements' && (
          <BankStatementsView />
        )}

        {/* Tab Content 3: Reconciliation & Manual Review View */}
        {activeTab === 'reconciliation' && (
          <ReconciliationView />
        )}

        {/* Tab Content 4: Settings */}
        {activeTab === 'settings' && (
          <SettingsView />
        )}
      </main>

      <ImagePreviewModal
        screenshot={selectedScreenshot}
        onClose={() => setSelectedScreenshot(null)}
        onProcessed={loadScreenshots}
      />

      <AboutModal
        isOpen={isAboutOpen}
        onClose={() => setIsAboutOpen(false)}
      />
    </div>
  );
}

export default App;
