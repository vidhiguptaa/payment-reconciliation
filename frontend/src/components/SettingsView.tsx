import React, { useEffect, useState } from 'react';
import {
  Settings2, FolderOpen, Eye, EyeOff, CheckCircle2, AlertTriangle,
  RefreshCw, Save, Zap, Bell, FileSpreadsheet, ShieldCheck,
  HardDrive, Palette, FolderCheck, Activity, Clock, Database,
  Archive, RotateCcw, Trash2, Check, XCircle
} from 'lucide-react';
import {
  AppSettings, FolderValidation, BackupItem, DetailedHealthInfo,
  getSettings, updateSettings, validateFolder, createFolder, getWatcherStatus,
  getDetailedHealth, getBackups, createBackup, restoreBackup, deleteBackup
} from '../services/api';

interface FolderFieldProps {
  label: string;
  value: string;
  onChange: (val: string) => void;
  validation: FolderValidation | null;
  onValidate: () => void;
  onCreate: () => void;
}

const FolderField: React.FC<FolderFieldProps> = ({ label, value, onChange, validation, onValidate, onCreate }) => (
  <div className="space-y-2">
    <label className="text-xs font-semibold text-slate-300">{label}</label>
    <div className="flex items-center space-x-2">
      <div className="relative flex-1">
        <FolderOpen className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded-lg pl-9 pr-3 py-2.5 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none transition-colors placeholder:text-slate-600"
          placeholder="/path/to/folder"
        />
      </div>
      <button
        onClick={onValidate}
        className="px-3 py-2.5 bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 rounded-lg border border-slate-700 transition-colors"
        title="Validate folder"
      >
        <FolderCheck className="w-4 h-4" />
      </button>
    </div>
    {validation && (
      <div className={`flex items-center space-x-1.5 text-[11px] ${validation.valid ? 'text-emerald-400' : 'text-amber-400'}`}>
        {validation.valid ? (
          <><CheckCircle2 className="w-3 h-3" /><span>Folder is valid and writable</span></>
        ) : (
          <>
            <AlertTriangle className="w-3 h-3" />
            <span>{!validation.exists ? 'Folder does not exist' : !validation.is_directory ? 'Path is not a directory' : 'Folder is not writable'}</span>
            {!validation.exists && (
              <button onClick={onCreate} className="ml-2 text-sky-400 hover:text-sky-300 underline">Create folder</button>
            )}
          </>
        )}
      </div>
    )}
  </div>
);

interface ToggleFieldProps {
  label: string;
  description: string;
  value: boolean;
  onChange: (val: boolean) => void;
  icon: React.ReactNode;
}

const ToggleField: React.FC<ToggleFieldProps> = ({ label, description, value, onChange, icon }) => (
  <div className="flex items-center justify-between p-3 bg-slate-900/60 rounded-xl border border-slate-800 hover:border-slate-700 transition-colors">
    <div className="flex items-center space-x-3">
      <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center text-slate-400">
        {icon}
      </div>
      <div>
        <h4 className="text-xs font-semibold text-slate-200">{label}</h4>
        <p className="text-[10px] text-slate-500">{description}</p>
      </div>
    </div>
    <button
      onClick={() => onChange(!value)}
      className={`relative w-10 h-5 rounded-full transition-colors ${value ? 'bg-sky-600' : 'bg-slate-700'}`}
    >
      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${value ? 'left-5.5 translate-x-0.5' : 'left-0.5'}`} />
    </button>
  </div>
);

export const SettingsView: React.FC = () => {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [watcherRunning, setWatcherRunning] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);

  const [screenshotValidation, setScreenshotValidation] = useState<FolderValidation | null>(null);
  const [statementValidation, setStatementValidation] = useState<FolderValidation | null>(null);
  const [backupValidation, setBackupValidation] = useState<FolderValidation | null>(null);

  // Health, Metrics & Backups state
  const [healthInfo, setHealthInfo] = useState<DetailedHealthInfo | null>(null);
  const [backups, setBackups] = useState<BackupItem[]>([]);
  const [creatingBackup, setCreatingBackup] = useState(false);
  const [restoringBackupName, setRestoringBackupName] = useState<string | null>(null);
  const [backupMsg, setBackupMsg] = useState<string | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const [s, ws, health, bList] = await Promise.all([
        getSettings(),
        getWatcherStatus(),
        getDetailedHealth().catch(() => null),
        getBackups().catch(() => [])
      ]);
      setSettings(s);
      setWatcherRunning(ws.running);
      if (health) setHealthInfo(health);
      setBackups(bList);
    } catch (err) {
      // Silently ignore if settings API unavailable during startup
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    setSaved(false);
    try {
      await updateSettings(settings);
      const ws = await getWatcherStatus();
      setWatcherRunning(ws.running);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      // Handle error silently
    } finally {
      setSaving(false);
    }
  };

  const updateField = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    if (settings) {
      setSettings({ ...settings, [key]: value });
    }
  };

  const handleValidateFolder = async (path: string, setter: (val: FolderValidation) => void) => {
    try {
      const result = await validateFolder(path);
      setter(result);
    } catch {
      setter({ path, exists: false, is_directory: false, is_writable: false, valid: false });
    }
  };

  const handleCreateFolder = async (path: string, setter: (val: FolderValidation) => void) => {
    try {
      await createFolder(path);
      const result = await validateFolder(path);
      setter(result);
    } catch {
      // Silently handle error
    }
  };

  const handleCreateBackup = async () => {
    setCreatingBackup(true);
    setBackupMsg(null);
    try {
      await createBackup();
      const list = await getBackups();
      setBackups(list);
      setBackupMsg('Database backup created successfully.');
      setTimeout(() => setBackupMsg(null), 3000);
    } catch (err: any) {
      setBackupMsg(`Backup failed: ${err.message}`);
    } finally {
      setCreatingBackup(false);
    }
  };

  const handleRestoreBackup = async (filename: string) => {
    if (!window.confirm(`Are you sure you want to restore database from backup '${filename}'? Active data will be updated.`)) return;
    setRestoringBackupName(filename);
    setBackupMsg(null);
    try {
      await restoreBackup(filename);
      setBackupMsg(`Successfully restored database from '${filename}'.`);
      setTimeout(() => setBackupMsg(null), 4000);
    } catch (err: any) {
      setBackupMsg(`Restore failed: ${err.message}`);
    } finally {
      setRestoringBackupName(null);
    }
  };

  const handleDeleteBackup = async (filename: string) => {
    try {
      await deleteBackup(filename);
      const list = await getBackups();
      setBackups(list);
    } catch (err: any) {
      setBackupMsg(`Delete failed: ${err.message}`);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  if (loading || !settings) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw className="w-5 h-5 text-sky-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
            <Settings2 className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Application Settings</h2>
            <p className="text-[11px] text-slate-400">Configure folders, OCR engine, health, backups, and preferences</p>
          </div>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all shadow-md ${
            saved
              ? 'bg-emerald-600 text-white'
              : 'bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white'
          } disabled:opacity-50`}
        >
          {saved ? <CheckCircle2 className="w-4 h-4" /> : saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          <span>{saved ? 'Saved' : saving ? 'Saving...' : 'Save Settings'}</span>
        </button>
      </div>

      {/* Section 1: Folder Paths */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5 space-y-5">
        <div className="flex items-center space-x-2 text-sm font-bold text-white">
          <FolderOpen className="w-4 h-4 text-sky-400" />
          <span>Folder Paths</span>
        </div>

        <FolderField
          label="Payment Screenshot Folder"
          value={settings.screenshots_dir}
          onChange={(v) => updateField('screenshots_dir', v)}
          validation={screenshotValidation}
          onValidate={() => handleValidateFolder(settings.screenshots_dir, setScreenshotValidation)}
          onCreate={() => handleCreateFolder(settings.screenshots_dir, setScreenshotValidation)}
        />

        <FolderField
          label="Bank Statement Folder"
          value={settings.statements_dir}
          onChange={(v) => updateField('statements_dir', v)}
          validation={statementValidation}
          onValidate={() => handleValidateFolder(settings.statements_dir, setStatementValidation)}
          onCreate={() => handleCreateFolder(settings.statements_dir, setStatementValidation)}
        />

        <FolderField
          label="Database Backup Location"
          value={settings.backup_dir}
          onChange={(v) => updateField('backup_dir', v)}
          validation={backupValidation}
          onValidate={() => handleValidateFolder(settings.backup_dir, setBackupValidation)}
          onCreate={() => handleCreateFolder(settings.backup_dir, setBackupValidation)}
        />

        {/* Watcher status badge */}
        <div className="flex items-center space-x-2 pt-1">
          <div className={`w-2 h-2 rounded-full ${watcherRunning ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
          <span className={`text-[11px] font-medium ${watcherRunning ? 'text-emerald-400' : 'text-slate-500'}`}>
            Folder watcher is {watcherRunning ? 'active' : 'stopped'}
          </span>
        </div>
      </div>

      {/* Section 2: OCR Configuration */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5 space-y-5">
        <div className="flex items-center space-x-2 text-sm font-bold text-white">
          <Zap className="w-4 h-4 text-amber-400" />
          <span>OCR Engine Configuration</span>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-semibold text-slate-300">OCR Provider</label>
          <div className="grid grid-cols-3 gap-2">
            {['paddleocr', 'gemini', 'tesseract'].map((provider) => (
              <button
                key={provider}
                onClick={() => updateField('ocr_provider', provider)}
                className={`px-3 py-2.5 rounded-lg text-xs font-semibold transition-all border ${
                  settings.ocr_provider === provider
                    ? 'bg-sky-600/20 border-sky-500 text-sky-300 shadow-sm shadow-sky-500/10'
                    : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-300'
                }`}
              >
                {provider === 'paddleocr' ? 'PaddleOCR (Default Local)' : provider === 'gemini' ? 'Gemini Vision' : 'Tesseract'}
              </button>
            ))}
          </div>
        </div>

        {settings.ocr_provider === 'gemini' ? (
          <div className="space-y-2 animate-fadeIn">
            <label className="text-xs font-semibold text-slate-300">Gemini API Key</label>
            <div className="relative">
              <input
                type={showApiKey ? 'text' : 'password'}
                value={settings.gemini_api_key}
                onChange={(e) => updateField('gemini_api_key', e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded-lg pl-3 pr-10 py-2.5 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none transition-colors placeholder:text-slate-600 font-mono"
                placeholder="Enter your Gemini API key..."
              />
              <button
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
              >
                {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-[10px] text-slate-500">Required for Gemini Vision cloud OCR provider. Key stays local.</p>
          </div>
        ) : (
          <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-emerald-400 flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            <span>Running 100% locally on device. No API keys or internet connection required.</span>
          </div>
        )}
      </div>

      {/* Section 3: Health Monitoring */}
      {healthInfo && (
        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 text-sm font-bold text-white">
              <Activity className="w-4 h-4 text-emerald-400" />
              <span>Internal System Health</span>
            </div>
            <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-800 rounded-full">
              Status: {healthInfo.status.toUpperCase()}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
            <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 flex items-center justify-between">
              <span className="text-slate-400">Backend</span>
              <span className="flex items-center space-x-1 text-emerald-400 font-semibold"><Check className="w-3.5 h-3.5" /><span>Running</span></span>
            </div>
            <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 flex items-center justify-between">
              <span className="text-slate-400">Database</span>
              <span className="flex items-center space-x-1 text-emerald-400 font-semibold"><Check className="w-3.5 h-3.5" /><span>Connected</span></span>
            </div>
            <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 flex items-center justify-between">
              <span className="text-slate-400">Watcher</span>
              <span className={`flex items-center space-x-1 font-semibold ${healthInfo.components.watcher_running ? 'text-emerald-400' : 'text-slate-500'}`}>
                {healthInfo.components.watcher_running ? <Check className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                <span>{healthInfo.components.watcher_running ? 'Active' : 'Idle'}</span>
              </span>
            </div>
            <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 flex items-center justify-between">
              <span className="text-slate-400">Gemini Key</span>
              <span className={`flex items-center space-x-1 font-semibold ${healthInfo.components.gemini_configured ? 'text-emerald-400' : 'text-amber-400'}`}>
                {healthInfo.components.gemini_configured ? <Check className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                <span>{healthInfo.components.gemini_configured ? 'Set' : 'Missing'}</span>
              </span>
            </div>
            <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 flex items-center justify-between col-span-2 sm:col-span-2">
              <span className="text-slate-400">OCR Provider</span>
              <span className="text-sky-400 font-semibold uppercase">{settings.ocr_provider}</span>
            </div>
          </div>
        </div>
      )}

      {/* Section 4: Performance Statistics */}
      {healthInfo && healthInfo.metrics && (
        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex items-center space-x-2 text-sm font-bold text-white">
            <Clock className="w-4 h-4 text-sky-400" />
            <span>Stage Performance Metrics</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-1">
              <div className="text-slate-500 font-medium">OCR Stage</div>
              <div className="text-white font-bold text-sm">{healthInfo.metrics.ocr.avg_ms} ms</div>
              <div className="text-[10px] text-slate-500">Runs: {healthInfo.metrics.ocr.total_runs}</div>
            </div>

            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-1">
              <div className="text-slate-500 font-medium">Extraction</div>
              <div className="text-white font-bold text-sm">{healthInfo.metrics.extraction.avg_ms} ms</div>
              <div className="text-[10px] text-slate-500">Runs: {healthInfo.metrics.extraction.total_runs}</div>
            </div>

            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-1">
              <div className="text-slate-500 font-medium">Statement Import</div>
              <div className="text-white font-bold text-sm">{healthInfo.metrics.import.avg_ms} ms</div>
              <div className="text-[10px] text-slate-500">Runs: {healthInfo.metrics.import.total_runs}</div>
            </div>

            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-1">
              <div className="text-slate-500 font-medium">Reconciliation</div>
              <div className="text-white font-bold text-sm">{healthInfo.metrics.reconciliation.avg_ms} ms</div>
              <div className="text-[10px] text-slate-500">Runs: {healthInfo.metrics.reconciliation.total_runs}</div>
            </div>
          </div>
        </div>
      )}

      {/* Section 5: Database Backups */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2 text-sm font-bold text-white">
            <Archive className="w-4 h-4 text-indigo-400" />
            <span>Database Backups & Restore</span>
          </div>
          <button
            onClick={handleCreateBackup}
            disabled={creatingBackup}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold text-xs rounded-lg transition-colors shadow-sm"
          >
            <Database className="w-3.5 h-3.5" />
            <span>{creatingBackup ? 'Creating...' : 'Create Backup'}</span>
          </button>
        </div>

        {backupMsg && (
          <div className="p-2.5 bg-slate-950 border border-indigo-800 rounded-lg text-xs text-indigo-300">
            {backupMsg}
          </div>
        )}

        <div className="space-y-2">
          {backups.length === 0 ? (
            <p className="text-xs text-slate-500 py-2">No backups created yet. Daily auto backups will appear here.</p>
          ) : (
            backups.slice(0, 10).map((b) => (
              <div key={b.filename} className="flex items-center justify-between p-3 bg-slate-950 rounded-xl border border-slate-800 hover:border-slate-700 transition-colors text-xs">
                <div className="space-y-0.5">
                  <div className="flex items-center space-x-2">
                    <span className="font-semibold text-slate-200">{b.filename}</span>
                    {b.is_auto && (
                      <span className="px-1.5 py-0.5 text-[9px] font-bold bg-slate-800 text-slate-400 rounded">
                        AUTO
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-slate-500">
                    {formatBytes(b.size_bytes)} • Created: {new Date(b.created_at).toLocaleString()}
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => handleRestoreBackup(b.filename)}
                    disabled={restoringBackupName === b.filename}
                    className="flex items-center space-x-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-sky-400 text-[11px] font-semibold rounded-md border border-slate-700 transition-colors"
                    title="Restore database from this backup"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>{restoringBackupName === b.filename ? 'Restoring...' : 'Restore'}</span>
                  </button>
                  <button
                    onClick={() => handleDeleteBackup(b.filename)}
                    className="p-1 text-slate-500 hover:text-rose-400 transition-colors"
                    title="Delete backup"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Section 6: Appearance */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5 space-y-4">
        <div className="flex items-center space-x-2 text-sm font-bold text-white">
          <Palette className="w-4 h-4 text-violet-400" />
          <span>Appearance</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {['dark', 'light'].map((t) => (
            <button
              key={t}
              onClick={() => updateField('theme', t)}
              className={`flex items-center justify-center space-x-2 px-4 py-3 rounded-xl text-xs font-semibold transition-all border ${
                settings.theme === t
                  ? 'bg-violet-600/20 border-violet-500 text-violet-300 shadow-sm shadow-violet-500/10'
                  : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-600'
              }`}
            >
              <span>{t === 'dark' ? '🌙 Dark Mode' : '☀️ Light Mode'}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Section 7: Automation Toggles */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5 space-y-3">
        <div className="flex items-center space-x-2 text-sm font-bold text-white mb-1">
          <Zap className="w-4 h-4 text-emerald-400" />
          <span>Automation</span>
        </div>

        <ToggleField
          label="Auto Start Folder Watcher"
          description="Automatically monitor folders for new files on startup"
          value={settings.auto_start_watcher}
          onChange={(v) => updateField('auto_start_watcher', v)}
          icon={<FolderOpen className="w-4 h-4" />}
        />

        <ToggleField
          label="Auto Reconcile"
          description="Automatically match extracted transactions against bank statements"
          value={settings.auto_reconcile}
          onChange={(v) => updateField('auto_reconcile', v)}
          icon={<ShieldCheck className="w-4 h-4" />}
        />

        <ToggleField
          label="Auto Import Statements"
          description="Automatically import new bank statement files when detected"
          value={settings.auto_import_statements}
          onChange={(v) => updateField('auto_import_statements', v)}
          icon={<FileSpreadsheet className="w-4 h-4" />}
        />

        <ToggleField
          label="Show Processing Notifications"
          description="Display toast notifications when files are auto-processed"
          value={settings.show_processing_notifications}
          onChange={(v) => updateField('show_processing_notifications', v)}
          icon={<Bell className="w-4 h-4" />}
        />
      </div>

      {/* Section 8: System Info */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5 space-y-2">
        <div className="flex items-center space-x-2 text-sm font-bold text-white mb-2">
          <HardDrive className="w-4 h-4 text-slate-400" />
          <span>System & Paths</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px]">
          <div className="bg-slate-950 rounded-lg px-3 py-2 border border-slate-800">
            <span className="text-slate-500">Database Path</span>
            <p className="text-slate-300 font-mono mt-0.5 truncate">{healthInfo?.components.db_path || 'SQLite'}</p>
          </div>
          <div className="bg-slate-950 rounded-lg px-3 py-2 border border-slate-800">
            <span className="text-slate-500">Config Path</span>
            <p className="text-slate-300 font-mono mt-0.5 truncate">{healthInfo?.components.config_path || 'config.json'}</p>
          </div>
        </div>
      </div>
    </div>
  );
};
