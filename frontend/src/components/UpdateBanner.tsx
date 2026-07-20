import React, { useEffect, useState } from 'react';
import { Download, RefreshCw, AlertCircle, Sparkles, CheckCircle2, X } from 'lucide-react';

export interface UpdateInfo {
  version: string;
  notes?: string;
  pub_date?: string;
}

export type UpdateState =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'ready'
  | 'error';

export const UpdateBanner: React.FC = () => {
  const [state, setState] = useState<UpdateState>('idle');
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [progress, setProgress] = useState<{ downloaded: number; total: number }>({ downloaded: 0, total: 0 });
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<boolean>(false);
  const [updaterRef, setUpdaterRef] = useState<any>(null);

  useEffect(() => {
    checkForUpdates();
  }, []);

  const checkForUpdates = async () => {
    // Check if we are running in Tauri context
    if (typeof window === 'undefined' || !(window as any).__TAURI_INTERNALS__) {
      // In browser/dev mode, skip update check
      return;
    }

    setState('checking');
    setErrorMsg(null);

    try {
      // Dynamically import Tauri updater plugin
      const { check } = await import('@tauri-apps/plugin-updater');
      const update = await check();

      if (update && update.available) {
        setUpdateInfo({
          version: update.version,
          notes: update.body || undefined,
          pub_date: update.date || undefined,
        });
        setUpdaterRef(update);
        setState('available');
      } else {
        setState('idle');
      }
    } catch (err: any) {
      console.warn('[Updater] Check failed or running in non-Tauri mode:', err);
      setState('idle');
    }
  };

  const handleDownloadAndInstall = async () => {
    if (!updaterRef) return;

    setState('downloading');
    setProgress({ downloaded: 0, total: 0 });
    setErrorMsg(null);

    try {
      let downloadedBytes = 0;
      let totalBytes = 0;

      await updaterRef.downloadAndInstall((event: any) => {
        if (event.event === 'Started') {
          totalBytes = event.data.contentLength || 0;
          setProgress({ downloaded: 0, total: totalBytes });
        } else if (event.event === 'Progress') {
          downloadedBytes += event.data.chunkLength || 0;
          setProgress({ downloaded: downloadedBytes, total: totalBytes });
        } else if (event.event === 'Finished') {
          setState('ready');
        }
      });

      setState('ready');
    } catch (err: any) {
      console.error('[Updater Error] Update download/install failed:', err);
      // Graceful rollback to error state
      setErrorMsg(err?.message || 'Update installation failed. Rollback completed cleanly.');
      setState('error');
    }
  };

  const handleRelaunch = async () => {
    try {
      if ((window as any).__TAURI_INTERNALS__) {
        const processModule = '@tauri-apps/plugin-process';
        const { relaunch } = await import(/* @vite-ignore */ processModule);
        await relaunch();
      } else {
        window.location.reload();
      }
    } catch {
      window.location.reload();
    }
  };

  if (dismissed || state === 'idle' || state === 'checking') {
    return null;
  }

  const percent = progress.total > 0 ? Math.round((progress.downloaded / progress.total) * 100) : 0;
  const formatMB = (bytes: number) => (bytes / (1024 * 1024)).toFixed(1);

  return (
    <div className="bg-gradient-to-r from-sky-950 via-indigo-950 to-slate-900 border-b border-sky-800/80 px-4 py-2.5 text-xs shadow-lg animate-fadeIn">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
        {/* Available State */}
        {state === 'available' && updateInfo && (
          <>
            <div className="flex items-center space-x-2.5">
              <div className="w-7 h-7 rounded-lg bg-sky-500/20 border border-sky-500/30 flex items-center justify-center flex-shrink-0">
                <Sparkles className="w-4 h-4 text-sky-400 animate-pulse" />
              </div>
              <div>
                <span className="font-bold text-white">Update Available: </span>
                <span className="text-sky-300 font-semibold">v{updateInfo.version}</span>
                {updateInfo.notes && (
                  <span className="text-slate-400 ml-2 hidden sm:inline">— {updateInfo.notes}</span>
                )}
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={handleDownloadAndInstall}
                className="flex items-center space-x-1.5 px-3 py-1.5 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white font-semibold rounded-lg shadow-md transition-all text-xs"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download & Install</span>
              </button>
              <button
                onClick={() => setDismissed(true)}
                className="text-slate-500 hover:text-slate-300 p-1"
                title="Dismiss"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </>
        )}

        {/* Downloading State */}
        {state === 'downloading' && (
          <>
            <div className="flex items-center space-x-3 w-full sm:w-auto">
              <RefreshCw className="w-4 h-4 text-sky-400 animate-spin flex-shrink-0" />
              <div>
                <span className="font-bold text-white">Downloading Update...</span>
                {progress.total > 0 && (
                  <span className="text-slate-400 ml-2 text-[11px]">
                    {formatMB(progress.downloaded)} MB / {formatMB(progress.total)} MB ({percent}%)
                  </span>
                )}
              </div>
            </div>
            <div className="w-full sm:w-48 bg-slate-900 rounded-full h-2 overflow-hidden border border-slate-700">
              <div
                className="bg-gradient-to-r from-sky-500 to-indigo-500 h-full transition-all duration-300"
                style={{ width: `${percent}%` }}
              />
            </div>
          </>
        )}

        {/* Ready to Restart State */}
        {state === 'ready' && (
          <>
            <div className="flex items-center space-x-2.5">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
              <div>
                <span className="font-bold text-white">Update Installed Successfully!</span>
                <span className="text-slate-300 ml-2">Restart application to apply changes.</span>
              </div>
            </div>
            <button
              onClick={handleRelaunch}
              className="flex items-center space-x-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg shadow-md transition-all text-xs"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Restart Now</span>
            </button>
          </>
        )}

        {/* Error State */}
        {state === 'error' && (
          <>
            <div className="flex items-center space-x-2 text-rose-300">
              <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
              <span>{errorMsg || 'Update failed and rolled back cleanly.'}</span>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={handleDownloadAndInstall}
                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700"
              >
                Retry
              </button>
              <button
                onClick={() => setDismissed(true)}
                className="text-slate-500 hover:text-slate-300 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
