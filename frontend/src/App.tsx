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
  scanScreenshots,
  processAllPending,
  getReconciliationMatches,
  checkHealth,
  getSettings,
  updateSettings
} from './services/api';
import { CheckCircle2, AlertCircle, Sparkles } from 'lucide-react';

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
    let attempts = 0;
    let connected = false;

    // Retry health check during startup before displaying offline warning
    while (attempts < 15 && !connected) {
      try {
        const health = await checkHealth();
        if (health && (health.status === 'ok' || health.status === 'degraded')) {
          connected = true;
          break;
        }
      } catch {
        attempts++;
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }

    setLoading(true);
    try {
      const res = await getScreenshots();
      setScreenshots(res.items);

      const reconRes = await getReconciliationMatches();
      setMatchCounts({
        matched: reconRes.matched_count,
        possible: reconRes.possible_count,
        review: reconRes.needs_review_count,
        unmatched: reconRes.unmatched_count
      });

      setErrorMessage(null);
    } catch (err: any) {
      console.error('Failed to load dashboard data:', err);
      setErrorMessage('Connecting to backend engine... Make sure local server is initialized.');
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
    setScanning(true);
    setScanSummary(null);
    setErrorMessage(null);
    try {
      const summary = await scanScreenshots();
      setScanSummary(summary);
      await loadScreenshots();
    } catch (err: any) {
      setErrorMessage(err.message || 'Scan folder operation failed.');
    } finally {
      setScanning(false);
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
            Starting local backend and initializing reconciliation databases...
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
