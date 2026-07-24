import React, { useEffect, useState } from 'react';
import { HealthStatus, getHealthCheck } from '../services/api';
import { Database, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';

export const HealthBadge: React.FC = () => {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const checkHealth = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getHealthCheck();
      setHealth(data);
    } catch (err: any) {
      setError(err.message || 'Backend connection failed');
      setHealth(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading && !health) {
    return (
      <div className="flex items-center space-x-2 bg-slate-800 border border-slate-700 text-slate-300 text-xs px-3 py-1.5 rounded-full shadow-sm">
        <RefreshCw className="w-3.5 h-3.5 animate-spin text-sky-400" />
        <span>Connecting to Backend...</span>
      </div>
    );
  }

  if (error || !health || (health.status !== 'ok' && health.status !== 'degraded')) {
    return (
      <div className="flex items-center space-x-2 bg-rose-950/60 border border-rose-800 text-rose-300 text-xs px-3 py-1.5 rounded-full shadow-sm">
        <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
        <span>Backend Offline</span>
        <button
          onClick={checkHealth}
          className="ml-1 hover:text-rose-100 transition-colors"
          title="Retry Connection"
        >
          <RefreshCw className="w-3 h-3" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center space-x-3 bg-slate-800/80 border border-slate-700/80 text-xs px-3.5 py-1.5 rounded-full shadow-sm">
      <div className="flex items-center space-x-1.5 text-emerald-400 font-medium">
        <CheckCircle2 className="w-3.5 h-3.5" />
        <span>API Online</span>
      </div>
      <span className="text-slate-600">|</span>
      <div className="flex items-center space-x-1.5 text-slate-300">
        <Database className="w-3.5 h-3.5 text-sky-400" />
        <span>SQLite {health.database === 'connected' ? 'Connected' : 'Disconnected'}</span>
      </div>
    </div>
  );
};
