import React, { useState } from 'react';
import { ScreenshotItem, getMediaUrl } from '../services/api';
import { Image as ImageIcon, Calendar, HardDrive, Search, ZoomIn, Inbox } from 'lucide-react';

interface ScreenshotGridProps {
  screenshots: ScreenshotItem[];
  loading: boolean;
  onSelect: (item: ScreenshotItem) => void;
  onScanClick: () => void;
}

export const ScreenshotGrid: React.FC<ScreenshotGridProps> = ({
  screenshots,
  loading,
  onSelect,
  onScanClick,
}) => {
  const [searchTerm, setSearchTerm] = useState('');

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const formatDate = (isoString: string): string => {
    if (!isoString) return '-';
    try {
      return new Date(isoString).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

  const filteredScreenshots = screenshots.filter((item) =>
    item.filename.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
      {/* Header bar */}
      <div className="px-6 py-4 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-white flex items-center gap-2">
            <ImageIcon className="w-4 h-4 text-sky-400" />
            <span>Discovered Payment Screenshots</span>
            <span className="text-xs font-normal text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full border border-slate-700">
              {screenshots.length} imported
            </span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Images discovered in <code className="text-sky-300 font-mono">data/payment-screenshots</code>
          </p>
        </div>

        {/* Search Input */}
        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by filename..."
            className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-sky-500 transition-colors"
          />
        </div>
      </div>

      {/* Grid view */}
      <div className="p-6">
        {loading ? (
          <div className="py-16 text-center text-slate-400 text-xs flex flex-col items-center">
            <div className="w-6 h-6 border-2 border-sky-400 border-t-transparent rounded-full animate-spin mb-3" />
            <span>Scanning payment screenshots directory...</span>
          </div>
        ) : filteredScreenshots.length === 0 ? (
          <div className="py-16 text-center">
            <div className="max-w-md mx-auto flex flex-col items-center">
              <div className="p-4 bg-slate-800/80 rounded-full border border-slate-700 mb-4 shadow-inner">
                <Inbox className="w-8 h-8 text-sky-400" />
              </div>
              <h3 className="text-sm font-semibold text-slate-200">
                {searchTerm ? 'No matching screenshots found' : 'No Screenshots Imported Yet'}
              </h3>
              <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                Save WhatsApp payment screenshots into <code className="bg-slate-800 border border-slate-700 text-sky-300 px-1.5 py-0.5 rounded font-mono text-[11px]">/data/payment-screenshots</code> and click <strong className="text-slate-300 font-medium">"Scan Folder"</strong>.
              </p>
              {!searchTerm && (
                <button
                  onClick={onScanClick}
                  className="mt-4 px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold rounded-lg shadow border border-sky-500 transition-all"
                >
                  Run Folder Scan Now
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
            {filteredScreenshots.map((item) => {
              const thumbUrl = getMediaUrl(item.thumbnail_url || item.image_url);
              return (
                <div
                  key={item.id}
                  onClick={() => onSelect(item)}
                  className="group bg-slate-950/70 border border-slate-800/80 hover:border-sky-500/50 rounded-xl overflow-hidden shadow-sm hover:shadow-sky-500/10 cursor-pointer transition-all duration-200 flex flex-col"
                >
                  {/* Thumbnail container */}
                  <div className="relative aspect-video bg-slate-900 overflow-hidden flex items-center justify-center border-b border-slate-800/80">
                    <img
                      src={thumbUrl}
                      alt={item.filename}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <div className="p-2 bg-sky-600/90 text-white rounded-full shadow-lg transform translate-y-2 group-hover:translate-y-0 transition-all">
                        <ZoomIn className="w-4 h-4" />
                      </div>
                    </div>
                    <span className="absolute top-2 right-2 px-2 py-0.5 text-[10px] font-semibold uppercase rounded bg-slate-900/90 border border-slate-700 text-sky-400">
                      {item.status}
                    </span>
                  </div>

                  {/* Metadata info */}
                  <div className="p-3.5 flex-1 flex flex-col justify-between space-y-2">
                    <h4 className="text-xs font-semibold text-slate-200 truncate group-hover:text-sky-300 transition-colors" title={item.filename}>
                      {item.filename}
                    </h4>

                    <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-900">
                      <span className="flex items-center gap-1 font-medium">
                        <HardDrive className="w-3 h-3 text-slate-500" />
                        {formatBytes(item.file_size)}
                      </span>
                      <span className="flex items-center gap-1 text-slate-500">
                        <Calendar className="w-3 h-3 text-slate-500" />
                        {formatDate(item.imported_at)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
