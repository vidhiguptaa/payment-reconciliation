import React from 'react';
import { HealthBadge } from './HealthBadge';
import { Scan, RefreshCw, Layers, FileSpreadsheet, ShieldCheck, Settings2, Info } from 'lucide-react';

interface HeaderProps {
  onScanClick: () => void;
  onProcessPendingClick: () => void;
  onAboutClick?: () => void;
  scanning: boolean;
  processing: boolean;
  activeTab: 'screenshots' | 'statements' | 'reconciliation' | 'settings';
  onTabChange: (tab: 'screenshots' | 'statements' | 'reconciliation' | 'settings') => void;
}

export const Header: React.FC<HeaderProps> = ({
  onScanClick,
  onProcessPendingClick,
  onAboutClick,
  scanning,
  processing,
  activeTab,
  onTabChange,
}) => {
  return (
    <header className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center space-x-6">
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-sky-500/20">
                <Layers className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-sm font-bold text-white tracking-tight leading-tight">
                  Payment Reconciliation
                </h1>
                <p className="text-[10px] text-slate-400 font-medium">Local-First Bank & Receipt Matcher</p>
              </div>
            </div>

            <nav className="hidden md:flex items-center space-x-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs font-semibold">
              <button
                onClick={() => onTabChange('screenshots')}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg transition-all ${
                  activeTab === 'screenshots'
                    ? 'bg-sky-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Scan className="w-3.5 h-3.5" />
                <span>Payment Screenshots</span>
              </button>

              <button
                onClick={() => onTabChange('statements')}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg transition-all ${
                  activeTab === 'statements'
                    ? 'bg-emerald-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Bank Statements</span>
              </button>

              <button
                onClick={() => onTabChange('reconciliation')}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg transition-all ${
                  activeTab === 'reconciliation'
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Reconciliation & Review</span>
              </button>

              <button
                onClick={() => onTabChange('settings')}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg transition-all ${
                  activeTab === 'settings'
                    ? 'bg-violet-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Settings2 className="w-3.5 h-3.5" />
                <span>Settings</span>
              </button>
            </nav>
          </div>

          <div className="flex items-center space-x-3">
            <HealthBadge />

            {onAboutClick && (
              <button
                onClick={onAboutClick}
                className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-lg border border-slate-700 transition-colors"
                title="About Application"
              >
                <Info className="w-4 h-4" />
              </button>
            )}

            {activeTab === 'screenshots' && (
              <>
                <button
                  onClick={onScanClick}
                  disabled={scanning}
                  className="hidden sm:flex items-center space-x-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 hover:text-white text-xs font-semibold rounded-lg border border-slate-700 transition-colors shadow-sm"
                >
                  <Scan className={`w-3.5 h-3.5 text-sky-400 ${scanning ? 'animate-spin' : ''}`} />
                  <span>{scanning ? 'Scanning...' : 'Scan Folder'}</span>
                </button>

                <button
                  onClick={onProcessPendingClick}
                  disabled={processing}
                  className="flex items-center space-x-1.5 px-3.5 py-1.5 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg shadow-md transition-all"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${processing ? 'animate-spin' : ''}`} />
                  <span>{processing ? 'Processing...' : 'Process Pending'}</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
