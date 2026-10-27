'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  X,
  Folder,
  MapPin,
  Package,
  Upload,
  RefreshCw,
  Check,
  Image as ImageIcon,
} from 'lucide-react';

interface AssetFile {
  name: string;
  path: string;
  size: number;
  sizeFormatted: string;
  modifiedAt: string;
  isImage: boolean;
  extension: string;
}

interface AssetPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectAsset: (path: string) => void;
  initialFolder?: string;
}

export function AssetPickerModal({
  isOpen,
  onClose,
  onSelectAsset,
  initialFolder = 'Assets/General/gear',
}: AssetPickerModalProps) {
  // Navigation
  const [category, setCategory] = useState<'locations' | 'general'>(
    initialFolder.includes('Location specific') ? 'locations' : 'general'
  );
  const [selectedLocation, setSelectedLocation] = useState<number>(() => {
    const match = initialFolder.match(/location (\d+)/);
    return match ? parseInt(match[1], 10) : 2;
  });
  const [selectedGeneral, setSelectedGeneral] = useState<'gear' | 'consumables' | 'others'>(() => {
    if (initialFolder.includes('consumables')) return 'consumables';
    if (initialFolder.includes('others')) return 'others';
    return 'gear';
  });

  const activeFolder =
    category === 'locations'
      ? `Assets/Location specific/location ${selectedLocation}`
      : `Assets/General/${selectedGeneral}`;

  // Data
  const [files, setFiles] = useState<AssetFile[]>([]);
  const [folderSummary, setFolderSummary] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadFiles = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/gm/assets?folder=${encodeURIComponent(activeFolder)}`);
      const data = await res.json();
      if (data.success) {
        setFiles(data.files || []);
      }
    } catch {
      // quiet fail
    } finally {
      setIsLoading(false);
    }
  }, [activeFolder]);

  const loadSummary = useCallback(async () => {
    try {
      const res = await fetch('/api/gm/assets?action=summary');
      const data = await res.json();
      if (data.success) {
        setFolderSummary(data.summary || {});
      }
    } catch {
      // quiet fail
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadFiles();
      loadSummary();
    }
  }, [isOpen, loadFiles, loadSummary]);

  // Quick upload handler
  const handleQuickUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0]) return;
    const file = e.target.files[0];

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('folder', activeFolder);

      const res = await fetch('/api/gm/assets', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (data.success) {
        loadFiles();
        loadSummary();
        // Automatically select the freshly uploaded asset!
        onSelectAsset(data.file.path);
        onClose();
      }
    } catch {
      // quiet fail
    } finally {
      setIsUploading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5"
      onClick={onClose}
    >
      <div
        className="bg-slate-900 border border-indigo-500/40 rounded-2xl max-w-4xl w-full p-5 sm:p-6 space-y-4 shadow-2xl relative flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-800 pb-3">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
              <ImageIcon className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-black text-white tracking-wide">
                Select Game Asset
              </h3>
              <p className="text-xs text-gray-400 font-mono">
                Click any asset to assign it immediately, or upload a new one.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Category Navigation */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-black/40 p-3 rounded-xl border border-gray-800">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCategory('general')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all ${
                category === 'general'
                  ? 'bg-indigo-600 text-white shadow'
                  : 'bg-gray-800 text-gray-400 hover:text-white'
              }`}
            >
              <Package className="w-3.5 h-3.5" /> General
            </button>
            <button
              onClick={() => setCategory('locations')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all ${
                category === 'locations'
                  ? 'bg-indigo-600 text-white shadow'
                  : 'bg-gray-800 text-gray-400 hover:text-white'
              }`}
            >
              <MapPin className="w-3.5 h-3.5" /> Locations (1 - 16)
            </button>
          </div>

          {/* Quick Upload Button */}
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleQuickUpload}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 transition-colors shadow disabled:opacity-50"
            >
              {isUploading ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Uploading...
                </>
              ) : (
                <>
                  <Upload className="w-3.5 h-3.5" /> + Upload to this folder
                </>
              )}
            </button>
          </div>
        </div>

        {/* Sub-Folder Selector */}
        {category === 'general' ? (
          <div className="flex items-center gap-2">
            {(['gear', 'consumables', 'others'] as const).map((sub) => {
              const count = folderSummary[`Assets/General/${sub}`] || 0;
              const isSelected = selectedGeneral === sub;
              return (
                <button
                  key={sub}
                  onClick={() => setSelectedGeneral(sub)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 border transition-all ${
                    isSelected
                      ? 'bg-indigo-600 border-indigo-400 text-white shadow'
                      : 'bg-gray-800/80 border-gray-700 text-gray-400 hover:text-white'
                  }`}
                >
                  <span className="capitalize">{sub}</span>
                  <span className="text-[10px] opacity-75 font-mono">({count})</span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="grid grid-cols-8 sm:grid-cols-16 gap-1">
            {Array.from({ length: 16 }, (_, i) => i + 1).map((locNum) => {
              const count = folderSummary[`Assets/Location specific/location ${locNum}`] || 0;
              const isSelected = selectedLocation === locNum;
              return (
                <button
                  key={locNum}
                  onClick={() => setSelectedLocation(locNum)}
                  className={`py-1.5 px-0.5 rounded-lg text-center flex flex-col items-center justify-center transition-all border ${
                    isSelected
                      ? 'bg-indigo-600 border-indigo-400 text-white shadow'
                      : 'bg-gray-800/70 border-gray-700 text-gray-400 hover:text-white'
                  }`}
                >
                  <span className="text-[10px] font-bold">L{locNum}</span>
                  <span className="text-[9px] font-mono">{count}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Current Folder Path Header */}
        <div className="text-[11px] font-mono text-cyan-300 flex items-center justify-between border-t border-gray-800 pt-2">
          <span className="flex items-center gap-1.5">
            <Folder className="w-3.5 h-3.5 text-indigo-400" /> /{activeFolder}
          </span>
          <span className="text-gray-400">{files.length} assets available</span>
        </div>

        {/* Assets Grid */}
        <div className="flex-1 overflow-y-auto pr-1 min-h-[280px]">
          {isLoading ? (
            <div className="py-20 text-center text-gray-400 text-xs flex items-center justify-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin text-indigo-500" /> Loading folder assets...
            </div>
          ) : files.length === 0 ? (
            <div className="py-16 text-center border border-dashed border-gray-800 rounded-2xl space-y-2">
              <Folder className="w-8 h-8 text-gray-600 mx-auto" />
              <p className="text-xs font-bold text-gray-400">No assets in /{activeFolder}</p>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold inline-flex items-center gap-1.5"
              >
                <Upload className="w-3.5 h-3.5" /> Upload an image here
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {files.map((file) => (
                <div
                  key={file.name}
                  onClick={() => {
                    onSelectAsset(file.path);
                    onClose();
                  }}
                  className="group relative bg-gray-800/80 hover:bg-indigo-950/60 border border-gray-700 hover:border-indigo-400 rounded-xl p-2.5 cursor-pointer transition-all hover:scale-102 flex flex-col justify-between shadow"
                >
                  <div className="aspect-square w-full rounded-lg bg-black/40 overflow-hidden flex items-center justify-center p-1 border border-gray-800 group-hover:border-indigo-500/40">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={file.path}
                      alt={file.name}
                      className="max-h-full max-w-full object-contain"
                    />
                  </div>

                  <div className="mt-2 space-y-0.5">
                    <span className="font-bold text-xs text-white truncate block group-hover:text-indigo-300">
                      {file.name}
                    </span>
                    <span className="text-[10px] text-gray-400 font-mono block">
                      {file.sizeFormatted}
                    </span>
                  </div>

                  <div className="mt-2 pt-1.5 border-t border-gray-700/60 flex items-center justify-center">
                    <span className="text-[10px] font-bold text-indigo-400 group-hover:text-white flex items-center gap-1">
                      <Check className="w-3 h-3" /> Select Asset
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-800 pt-3 flex justify-between items-center text-xs">
          <span className="text-gray-500 font-mono text-[11px]">
            Tip: You can also manually type any path in the URL input.
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 font-bold"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
