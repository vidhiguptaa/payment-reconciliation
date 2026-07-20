import React, { useEffect, useState } from 'react';
import { wsService } from '../services/websocket';
import { CheckCircle2, AlertTriangle, FileSpreadsheet, X } from 'lucide-react';

export interface ToastMessage {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message: string;
}

export const ToastNotification: React.FC = () => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = (type: ToastMessage['type'], title: string, message: string) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev.slice(-4), { id, type, title, message }]);

    // Auto dismiss after 5s
    setTimeout(() => {
      removeToast(id);
    }, 5000);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  useEffect(() => {
    wsService.connect();

    const unsubscribe = wsService.subscribe((event, data) => {
      switch (event) {
        case 'SCREENSHOT_IMPORTED':
          addToast(
            'success',
            'New Screenshot Processed',
            `File '${data.filename}' was automatically imported & processed through OCR/Extraction.`
          );
          break;

        case 'STATEMENT_IMPORTED':
          addToast(
            'info',
            'Bank Statement Imported',
            `File '${data.filename}' imported with ${data.new_imported || 0} transactions.`
          );
          break;

        case 'RECONCILIATION_COMPLETED':
          addToast(
            'success',
            'Reconciliation Complete',
            `Reconciliation engine finished. Matched ${data.reconciled_matches || 0} transactions.`
          );
          break;

        case 'PROCESSING_FAILED':
          addToast(
            'error',
            'Processing Error',
            `File '${data.filename}' failed: ${data.error || 'Unknown error'}`
          );
          break;
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-20 right-6 z-50 flex flex-col space-y-3 max-w-sm pointer-events-none">
      {toasts.map((toast) => {
        let borderBg = 'bg-slate-900 border-slate-700 text-slate-200';
        let Icon = CheckCircle2;
        let iconColor = 'text-sky-400';

        if (toast.type === 'success') {
          borderBg = 'bg-slate-900/95 border-emerald-800/90 text-emerald-300 shadow-emerald-950/20';
          Icon = CheckCircle2;
          iconColor = 'text-emerald-400';
        } else if (toast.type === 'info') {
          borderBg = 'bg-slate-900/95 border-sky-800/90 text-sky-300 shadow-sky-950/20';
          Icon = FileSpreadsheet;
          iconColor = 'text-sky-400';
        } else if (toast.type === 'warning') {
          borderBg = 'bg-slate-900/95 border-amber-800/90 text-amber-300 shadow-amber-950/20';
          Icon = AlertTriangle;
          iconColor = 'text-amber-400';
        } else if (toast.type === 'error') {
          borderBg = 'bg-slate-900/95 border-rose-800/90 text-rose-300 shadow-rose-950/20';
          Icon = AlertTriangle;
          iconColor = 'text-rose-400';
        }

        return (
          <div
            key={toast.id}
            className={`pointer-events-auto p-4 rounded-xl border ${borderBg} shadow-2xl backdrop-blur-md flex items-start space-x-3 animate-slideIn transition-all`}
          >
            <Icon className={`w-5 h-5 ${iconColor} flex-shrink-0 mt-0.5`} />
            <div className="flex-1 text-xs space-y-0.5">
              <h4 className="font-bold text-white leading-snug">{toast.title}</h4>
              <p className="text-slate-300 leading-relaxed">{toast.message}</p>
            </div>
            <button
              onClick={() => removeToast(toast.id)}
              className="text-slate-500 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
