import React, { useEffect, useState } from 'react';
import { ScreenshotItem, getMediaUrl, processScreenshot, ProcessingJobItem } from '../services/api';
import { PipelineStatusBadge } from './PipelineStatusBadge';
import { OCRResultView } from './OCRResultView';
import { ExtractedTransactionView } from './ExtractedTransactionView';
import { X, Calendar, FileText, HardDrive, Hash, ExternalLink, Play, RefreshCw } from 'lucide-react';

interface ImagePreviewModalProps {
  screenshot: ScreenshotItem | null;
  onClose: () => void;
  onProcessed?: () => void;
}

export const ImagePreviewModal: React.FC<ImagePreviewModalProps> = ({ screenshot, onClose, onProcessed }) => {
  const [processing, setProcessing] = useState(false);
  const [latestJob, setLatestJob] = useState<ProcessingJobItem | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!screenshot) return null;

  const handleRunPipeline = async () => {
    setProcessing(true);
    try {
      const job = await processScreenshot(screenshot.id);
      setLatestJob(job);
      if (onProcessed) onProcessed();
    } catch (err) {
      console.error('Pipeline execution failed:', err);
    } finally {
      setProcessing(false);
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (isoString: string): string => {
    if (!isoString) return '-';
    try {
      return new Date(isoString).toLocaleString('en-US', {
        dateStyle: 'medium',
        timeStyle: 'medium',
      });
    } catch {
      return isoString;
    }
  };

  const imageUrl = getMediaUrl(screenshot.image_url);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
      {/* Backdrop click */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* Modal Container */}
      <div className="relative z-10 w-full max-w-5xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col md:flex-row max-h-[92vh]">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-20 p-2 text-slate-400 hover:text-white bg-slate-800/80 hover:bg-slate-700 rounded-full border border-slate-700/80 transition-colors"
          title="Close (Esc)"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Left Column: Image Preview + Extracted Data + Raw OCR */}
        <div className="flex-1 bg-slate-950 p-5 flex flex-col items-center justify-between border-b md:border-b-0 md:border-r border-slate-800 overflow-y-auto space-y-4">
          <img
            src={imageUrl}
            alt={screenshot.filename}
            className="max-h-[35vh] w-auto max-w-full object-contain rounded-lg shadow-lg border border-slate-800/80"
          />

          {/* Extracted Structured Transaction View */}
          <div className="w-full">
            <ExtractedTransactionView screenshotId={screenshot.id} />
          </div>

          {/* Raw OCR Result View */}
          <div className="w-full">
            <OCRResultView screenshotId={screenshot.id} />
          </div>
        </div>

        {/* Right Sidebar: File Metadata & Action Buttons */}
        <div className="w-full md:w-80 p-6 flex flex-col justify-between space-y-6 overflow-y-auto">
          <div>
            <div className="flex items-center space-x-2">
              <span className="px-2.5 py-1 text-[11px] font-semibold tracking-wide uppercase rounded-md bg-sky-950 text-sky-400 border border-sky-800">
                {screenshot.status}
              </span>
              <PipelineStatusBadge stage={latestJob?.current_stage || (screenshot.status === 'PROCESSED' ? 'COMPLETED' : 'QUEUED')} />
            </div>

            <h3 className="mt-3 text-base font-bold text-white break-all leading-tight">
              {screenshot.filename}
            </h3>

            <div className="mt-6 space-y-4 text-xs text-slate-300">
              <div className="flex items-start space-x-3">
                <HardDrive className="w-4 h-4 text-slate-400 mt-0.5" />
                <div>
                  <div className="text-slate-500 font-medium">File Size</div>
                  <div className="font-semibold text-slate-200">{formatBytes(screenshot.file_size)}</div>
                </div>
              </div>

              <div className="flex items-start space-x-3">
                <Calendar className="w-4 h-4 text-slate-400 mt-0.5" />
                <div>
                  <div className="text-slate-500 font-medium">Imported At</div>
                  <div className="font-semibold text-slate-200">{formatDate(screenshot.imported_at)}</div>
                </div>
              </div>

              <div className="flex items-start space-x-3">
                <Hash className="w-4 h-4 text-slate-400 mt-0.5" />
                <div className="w-full min-w-0">
                  <div className="text-slate-500 font-medium">SHA256 Hash</div>
                  <div className="font-mono text-[11px] text-slate-300 break-all bg-slate-950 p-2 rounded border border-slate-800 mt-1">
                    {screenshot.file_hash}
                  </div>
                </div>
              </div>

              <div className="flex items-start space-x-3">
                <FileText className="w-4 h-4 text-slate-400 mt-0.5" />
                <div className="w-full min-w-0">
                  <div className="text-slate-500 font-medium">File Location</div>
                  <div className="font-mono text-[11px] text-slate-400 break-all bg-slate-950 p-2 rounded border border-slate-800 mt-1">
                    {screenshot.filepath}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-800 space-y-2">
            <button
              onClick={handleRunPipeline}
              disabled={processing}
              className="w-full py-2 px-3 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg shadow flex items-center justify-center space-x-2 transition-colors"
            >
              {processing ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Processing Pipeline...</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Execute Pipeline</span>
                </>
              )}
            </button>

            <a
              href={imageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-2 px-3 bg-slate-800 hover:bg-slate-700 text-sky-400 hover:text-sky-300 text-xs font-semibold rounded-lg border border-slate-700 flex items-center justify-center space-x-2 transition-colors"
            >
              <span>Open Original Image</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
