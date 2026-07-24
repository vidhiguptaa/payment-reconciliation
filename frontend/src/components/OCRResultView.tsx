import React, { useEffect, useState } from 'react';
import { OCRResultItem, getOCRResult, runOCR } from '../services/api';
import { Cpu, Clock, CheckCircle2, AlertTriangle, RefreshCw, Copy, Check, Code, FileText } from 'lucide-react';

interface OCRResultViewProps {
  screenshotId: number;
}

export const OCRResultView: React.FC<OCRResultViewProps> = ({ screenshotId }) => {
  const [ocrResult, setOcrResult] = useState<OCRResultItem | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [running, setRunning] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'text' | 'json'>('text');

  const fetchOCR = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getOCRResult(screenshotId);
      setOcrResult(data);
    } catch (err: any) {
      if (err.response?.status === 404) {
        setOcrResult(null);
      } else {
        setError(err.message || 'Failed to fetch OCR result');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOCR();
  }, [screenshotId]);

  const handleRunOCRAgain = async (provider?: string) => {
    setRunning(true);
    setError(null);
    try {
      const res = await runOCR(screenshotId, provider);
      setOcrResult(res);
    } catch (err: any) {
      setError(err.message || 'OCR Execution Failed');
    } finally {
      setRunning(false);
    }
  };

  const handleCopyText = () => {
    if (ocrResult?.raw_text) {
      navigator.clipboard.writeText(ocrResult.raw_text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (loading) {
    return (
      <div className="py-6 text-center text-xs text-slate-400 flex items-center justify-center space-x-2">
        <RefreshCw className="w-4 h-4 animate-spin text-sky-400" />
        <span>Loading OCR details...</span>
      </div>
    );
  }

  return (
    <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 space-y-4">
      {/* OCR Control Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
        <div className="flex items-center space-x-2">
          <Cpu className="w-4 h-4 text-sky-400" />
          <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
            Raw OCR Engine Extraction
          </h4>
        </div>

        <div className="flex items-center space-x-2">
          <select
            onChange={(e) => handleRunOCRAgain(e.target.value)}
            disabled={running}
            value={ocrResult?.provider || 'paddle'}
            className="bg-slate-900 border border-slate-700 text-xs text-slate-300 rounded-lg px-2.5 py-1 focus:outline-none focus:border-sky-500"
          >
            <option value="paddle">PaddleOCR (Default)</option>
            <option value="tesseract">PyTesseract (Local)</option>
          </select>

          <button
            onClick={() => handleRunOCRAgain()}
            disabled={running}
            className="flex items-center space-x-1.5 px-3 py-1 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg shadow transition-colors"
          >
            {running ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
            <span>Run OCR Again</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-rose-950/60 border border-rose-800 rounded-lg text-xs text-rose-300 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {!ocrResult ? (
        <div className="py-6 text-center text-xs text-slate-400">
          <p>No OCR result stored for this screenshot yet.</p>
          <button
            onClick={() => handleRunOCRAgain()}
            disabled={running}
            className="mt-3 px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-sky-400 text-xs font-medium rounded-lg border border-slate-700 transition-colors"
          >
            Run OCR Engine Now
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Metadata Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
            <div className="bg-slate-900/90 border border-slate-800 p-2.5 rounded-lg">
              <span className="text-[10px] text-slate-500 font-medium block uppercase">Provider</span>
              <span className="font-semibold text-sky-400 capitalize">{ocrResult.provider}</span>
            </div>

            <div className="bg-slate-900/90 border border-slate-800 p-2.5 rounded-lg">
              <span className="text-[10px] text-slate-500 font-medium block uppercase">Status</span>
              <span className="font-semibold flex items-center gap-1">
                {ocrResult.status === 'SUCCESS' ? (
                  <span className="text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> SUCCESS
                  </span>
                ) : (
                  <span className="text-rose-400 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> FAILED
                  </span>
                )}
              </span>
            </div>

            <div className="bg-slate-900/90 border border-slate-800 p-2.5 rounded-lg">
              <span className="text-[10px] text-slate-500 font-medium block uppercase">Proc. Time</span>
              <span className="font-semibold text-slate-300 flex items-center gap-1">
                <Clock className="w-3 h-3 text-slate-400" /> {ocrResult.processing_time_ms} ms
              </span>
            </div>

            <div className="bg-slate-900/90 border border-slate-800 p-2.5 rounded-lg">
              <span className="text-[10px] text-slate-500 font-medium block uppercase">Confidence</span>
              <span className="font-semibold text-amber-400">{ocrResult.confidence}%</span>
            </div>
          </div>

          {ocrResult.error_message && (
            <div className="p-3 bg-amber-950/40 border border-amber-800/60 rounded-lg text-xs text-amber-300">
              <strong>Provider Warning/Error:</strong> {ocrResult.error_message}
            </div>
          )}

          {/* Raw Text vs Raw JSON Tabs */}
          <div className="border border-slate-800 rounded-lg overflow-hidden bg-slate-900/50">
            <div className="bg-slate-900 px-3 py-2 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center space-x-2 text-xs">
                <button
                  onClick={() => setActiveTab('text')}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md font-medium transition-colors ${
                    activeTab === 'text' ? 'bg-slate-800 text-sky-400 border border-slate-700' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>Raw Text</span>
                </button>
                <button
                  onClick={() => setActiveTab('json')}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md font-medium transition-colors ${
                    activeTab === 'json' ? 'bg-slate-800 text-sky-400 border border-slate-700' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Code className="w-3.5 h-3.5" />
                  <span>Raw JSON</span>
                </button>
              </div>

              {activeTab === 'text' && ocrResult.raw_text && (
                <button
                  onClick={handleCopyText}
                  className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-white px-2 py-0.5 rounded bg-slate-800 border border-slate-700 transition-colors"
                >
                  {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copied ? 'Copied' : 'Copy'}</span>
                </button>
              )}
            </div>

            <div className="p-3 max-h-60 overflow-y-auto font-mono text-xs text-slate-300 whitespace-pre-wrap leading-relaxed">
              {activeTab === 'text' ? (
                ocrResult.raw_text ? (
                  ocrResult.raw_text
                ) : (
                  <span className="text-slate-500 italic">No text extracted by provider.</span>
                )
              ) : (
                <pre className="text-[11px] text-sky-300 font-mono overflow-x-auto">
                  {(() => {
                    try {
                      return JSON.stringify(JSON.parse(ocrResult.raw_json), null, 2);
                    } catch {
                      return ocrResult.raw_json;
                    }
                  })()}
                </pre>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
