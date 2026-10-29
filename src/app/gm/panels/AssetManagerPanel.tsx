'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { storage } from '@/lib/firebase';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import {
  Folder,
  FolderOpen,
  Upload,
  Trash2,
  Copy,
  Check,
  Eye,
  RefreshCw,
  Image as ImageIcon,
  MapPin,
  Package,
  Layers,
  Sparkles,
  ExternalLink,
  Info,
  X,
  Cloud,
  HardDrive,
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

export function AssetManagerPanel() {
  // Navigation State
  const [category, setCategory] = useState<'locations' | 'general'>('locations');
  const [selectedLocation, setSelectedLocation] = useState<number>(2); // Default to location 2
  const [selectedGeneral, setSelectedGeneral] = useState<'gear' | 'consumables' | 'others'>('gear');

  // Active folder path
  const activeFolder =
    category === 'locations'
      ? `Assets/Location specific/location ${selectedLocation}`
      : `Assets/General/${selectedGeneral}`;

  // Data State
  const [files, setFiles] = useState<AssetFile[]>([]);
  const [folderSummary, setFolderSummary] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Storage Target: 'local' (/public) or 'cloud' (Firebase Storage)
  const [storageDestination, setStorageDestination] = useState<'cloud' | 'local'>('local');

  // Upload State
  const [isUploading, setIsUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [selectedUploadFile, setSelectedUploadFile] = useState<File | null>(null);
  const [customFileName, setCustomFileName] = useState('');
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);

  // UI state
  const [copiedPath, setCopiedPath] = useState<string | null>(null);
  const [inspectImage, setInspectImage] = useState<AssetFile | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Helper to format bytes
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  // Upload to Firebase Storage helper with strict timeout to prevent endless hanging
  const uploadToFirebaseStorage = async (file: File, filename: string): Promise<string> => {
    const cloudPath = `${activeFolder}/${filename}`;
    const fileRef = storageRef(storage, cloudPath);
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(
        () =>
          reject(
            new Error(
              'Firebase Cloud Storage upload timed out (10s). Use the "Local Filesystem" option or verify Firebase Storage bucket configuration.'
            )
          ),
        10000
      )
    );
    await Promise.race([uploadBytes(fileRef, file), timeoutPromise]);
    return await getDownloadURL(fileRef);
  };

  // Fetch file list for current folder
  const loadFiles = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/gm/assets?folder=${encodeURIComponent(activeFolder)}`);
      const data = await res.json();
      if (data.success) {
        setFiles(data.files || []);
      } else {
        setError(data.error || 'Failed to load assets');
      }
    } catch {
      setError('Network error while loading files');
    } finally {
      setIsLoading(false);
    }
  }, [activeFolder]);

  // Fetch summary counts for all folders
  const loadSummary = useCallback(async () => {
    try {
      const res = await fetch('/api/gm/assets?action=summary');
      const data = await res.json();
      if (data.success) {
        setFolderSummary(data.summary || {});
      }
    } catch {
      // Quiet fail for summary
    }
  }, []);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  // Handle file selection for upload
  const handleFileChange = (file: File) => {
    setSelectedUploadFile(file);
    setUploadSuccess(null);
    setError(null);

    // Auto-fill custom name with original name without extension
    const base = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
    setCustomFileName(base);

    // Create thumbnail preview
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => setPreviewDataUrl(e.target?.result as string);
      reader.readAsDataURL(file);
    } else {
      setPreviewDataUrl(null);
    }
  };

  // Perform upload
  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUploadFile) return;

    setIsUploading(true);
    setError(null);
    setUploadSuccess(null);

    // Determine clean filename
    const originalExt = selectedUploadFile.name.substring(selectedUploadFile.name.lastIndexOf('.')).toLowerCase() || '.png';
    let safeBaseName = (customFileName && customFileName.trim() !== '') ? customFileName.trim() : selectedUploadFile.name.substring(0, selectedUploadFile.name.lastIndexOf('.'));
    safeBaseName = safeBaseName.replace(/[^a-zA-Z0-9_\-\s]/g, '').trim();
    if (!safeBaseName) safeBaseName = 'asset';
    const finalFilename = safeBaseName.endsWith(originalExt) ? safeBaseName : `${safeBaseName}${originalExt}`;

    try {
      if (storageDestination === 'cloud') {
        // Direct Firebase Storage Upload
        const downloadUrl = await uploadToFirebaseStorage(selectedUploadFile, finalFilename);
        setUploadSuccess(`Uploaded to Firebase Cloud Storage!`);
        // Add to active view
        const newAsset: AssetFile = {
          name: finalFilename,
          path: downloadUrl,
          size: selectedUploadFile.size,
          sizeFormatted: formatBytes(selectedUploadFile.size),
          modifiedAt: new Date().toISOString(),
          isImage: true,
          extension: originalExt,
        };
        setFiles((prev) => [newAsset, ...prev.filter((f) => f.name !== finalFilename)]);
        setSelectedUploadFile(null);
        setCustomFileName('');
        setPreviewDataUrl(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
      } else {
        // Attempt local public directory upload
        const formData = new FormData();
        formData.append('file', selectedUploadFile);
        formData.append('folder', activeFolder);
        if (customFileName.trim()) {
          formData.append('customName', customFileName.trim());
        }

        const res = await fetch('/api/gm/assets', {
          method: 'POST',
          body: formData,
        });

        const data = await res.json();
        if (data.success) {
          setUploadSuccess(`Successfully uploaded ${data.file.name} to /public!`);
          setSelectedUploadFile(null);
          setCustomFileName('');
          setPreviewDataUrl(null);
          if (fileInputRef.current) fileInputRef.current.value = '';
          loadFiles();
          loadSummary();
        } else if (data.isReadOnly) {
          // Seamless auto-fallback to Firebase Storage when serverless container has read-only filesystem!
          const downloadUrl = await uploadToFirebaseStorage(selectedUploadFile, finalFilename);
          setUploadSuccess(`Read-only server detected — auto-saved to Firebase Storage!`);
          const newAsset: AssetFile = {
            name: finalFilename,
            path: downloadUrl,
            size: selectedUploadFile.size,
            sizeFormatted: formatBytes(selectedUploadFile.size),
            modifiedAt: new Date().toISOString(),
            isImage: true,
            extension: originalExt,
          };
          setFiles((prev) => [newAsset, ...prev.filter((f) => f.name !== finalFilename)]);
          setSelectedUploadFile(null);
          setCustomFileName('');
          setPreviewDataUrl(null);
          if (fileInputRef.current) fileInputRef.current.value = '';
        } else {
          setError(data.error || 'Upload failed');
        }
      }
    } catch (err: unknown) {
      // In case of any network/CORS error uploading to local, try Firebase Storage
      try {
        const downloadUrl = await uploadToFirebaseStorage(selectedUploadFile, finalFilename);
        setUploadSuccess(`Auto-fallback: Uploaded to Firebase Cloud Storage!`);
        const newAsset: AssetFile = {
          name: finalFilename,
          path: downloadUrl,
          size: selectedUploadFile.size,
          sizeFormatted: formatBytes(selectedUploadFile.size),
          modifiedAt: new Date().toISOString(),
          isImage: true,
          extension: originalExt,
        };
        setFiles((prev) => [newAsset, ...prev.filter((f) => f.name !== finalFilename)]);
        setSelectedUploadFile(null);
        setCustomFileName('');
        setPreviewDataUrl(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
      } catch (cloudErr: unknown) {
        const msg = cloudErr instanceof Error ? cloudErr.message : 'Upload failed';
        setError(msg);
      }
    } finally {
      setIsUploading(false);
    }
  };

  // Delete file
  const handleDelete = async (fileName: string) => {
    if (!confirm(`Are you sure you want to delete ${fileName} from ${activeFolder}?`)) return;

    try {
      const res = await fetch(
        `/api/gm/assets?folder=${encodeURIComponent(activeFolder)}&filename=${encodeURIComponent(fileName)}`,
        { method: 'DELETE' }
      );
      const data = await res.json();
      if (data.success) {
        loadFiles();
        loadSummary();
      } else {
        alert(data.error || 'Could not delete file');
      }
    } catch {
      alert('Network error while deleting');
    }
  };

  // Copy path to clipboard
  const handleCopyPath = (path: string) => {
    navigator.clipboard.writeText(path);
    setCopiedPath(path);
    setTimeout(() => setCopiedPath(null), 2000);
  };

  // Drag and drop handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileChange(e.dataTransfer.files[0]);
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* 1. Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-6 rounded-2xl border border-indigo-500/40 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 text-xs font-mono font-bold uppercase tracking-wider flex items-center gap-1.5">
              <FolderOpen className="w-3.5 h-3.5" /> Static Game Asset Manager
            </span>
            <span className="text-xs bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full font-bold">
              Saved in /public/Assets
            </span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-white tracking-wide">
            Game Asset & Sprite Hub
          </h2>
          <p className="text-sm text-gray-300 mt-1 max-w-2xl">
            Upload and organize high-performance sprites, arena backdrops, items, and icons directly into the game&apos;s static filesystem.
          </p>
        </div>

        {/* Current Active Path Indicator */}
        <div className="bg-black/60 border border-indigo-500/30 p-3 rounded-xl shrink-0 font-mono text-xs">
          <span className="text-gray-400 block text-[10px] uppercase font-bold tracking-wider">Active Folder:</span>
          <span className="text-cyan-300 font-bold break-all flex items-center gap-1.5 mt-0.5">
            <Folder className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
            /{activeFolder}
          </span>
        </div>
      </div>

      {/* 2. Category Selector & Navigation Tabs */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm space-y-4">
        <div className="flex items-center gap-3 border-b border-gray-200 dark:border-gray-800 pb-3">
          <button
            onClick={() => setCategory('locations')}
            className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-all ${
              category === 'locations'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:text-white'
            }`}
          >
            <MapPin className="w-4 h-4" />
            Location Specific (1 - 16)
          </button>
          <button
            onClick={() => setCategory('general')}
            className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-all ${
              category === 'general'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:text-white'
            }`}
          >
            <Package className="w-4 h-4" />
            General (Gear, Consumables, Others)
          </button>
        </div>

        {/* Category Sub-Navigation */}
        {category === 'locations' ? (
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400 block mb-2">
              Select Location Folder:
            </span>
            <div className="grid grid-cols-4 sm:grid-cols-8 md:grid-cols-16 gap-1.5">
              {Array.from({ length: 16 }, (_, i) => i + 1).map((locNum) => {
                const count = folderSummary[`Assets/Location specific/location ${locNum}`] || 0;
                const isSelected = selectedLocation === locNum;
                return (
                  <button
                    key={locNum}
                    onClick={() => setSelectedLocation(locNum)}
                    className={`py-2 px-1 rounded-xl text-center flex flex-col items-center justify-center transition-all border ${
                      isSelected
                        ? 'bg-indigo-600 border-indigo-400 text-white shadow-md scale-105'
                        : 'bg-gray-100 dark:bg-gray-800/70 border-gray-200 dark:border-gray-700 hover:border-indigo-400/50 text-gray-700 dark:text-gray-300'
                    }`}
                  >
                    <span className="text-xs font-black">Loc {locNum}</span>
                    <span
                      className={`text-[10px] mt-0.5 px-1.5 py-0.2 rounded-full font-mono font-bold ${
                        count > 0
                          ? isSelected
                            ? 'bg-white/20 text-white'
                            : 'bg-indigo-500/20 text-indigo-400'
                          : 'text-gray-500'
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400 block mb-2">
              Select General Subfolder:
            </span>
            <div className="flex flex-wrap gap-2">
              {(['gear', 'consumables', 'others'] as const).map((sub) => {
                const count = folderSummary[`Assets/General/${sub}`] || 0;
                const isSelected = selectedGeneral === sub;
                return (
                  <button
                    key={sub}
                    onClick={() => setSelectedGeneral(sub)}
                    className={`px-4 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center gap-2 border transition-all ${
                      isSelected
                        ? 'bg-indigo-600 border-indigo-400 text-white shadow-md'
                        : 'bg-gray-100 dark:bg-gray-800/70 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-indigo-400/50'
                    }`}
                  >
                    <span className="capitalize">{sub}</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
                        count > 0 ? 'bg-indigo-500/20 text-indigo-400 font-bold' : 'text-gray-500'
                      }`}
                    >
                      {count} files
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* 3. Drag-and-Drop Uploader Card */}
      <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-black text-gray-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
              <Upload className="w-4 h-4 text-indigo-500" /> Upload Asset to /{activeFolder}
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">PNG, JPG, WEBP, SVG • Saved permanently for your game</p>
          </div>

          {/* Storage Destination Selector */}
          <div className="flex items-center gap-1.5 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl border border-gray-200 dark:border-gray-700 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setStorageDestination('cloud')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
                storageDestination === 'cloud'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-white'
              }`}
            >
              <Cloud className="w-3.5 h-3.5" /> Firebase Cloud
            </button>
            <button
              type="button"
              onClick={() => setStorageDestination('local')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
                storageDestination === 'local'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-white'
              }`}
            >
              <HardDrive className="w-3.5 h-3.5" /> Local Public
            </button>
          </div>
        </div>

        <form onSubmit={handleUpload} className="space-y-4">
          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-colors flex flex-col items-center justify-center gap-3 ${
              dragActive
                ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30'
                : 'border-gray-300 dark:border-gray-700 hover:border-indigo-400 dark:hover:border-indigo-500 bg-gray-50/50 dark:bg-gray-800/30'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  handleFileChange(e.target.files[0]);
                }
              }}
            />

            {previewDataUrl ? (
              <div className="flex items-center gap-4 text-left">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previewDataUrl}
                  alt="Preview"
                  className="w-16 h-16 object-contain rounded-xl bg-black/40 border border-indigo-500/40 shadow"
                />
                <div>
                  <span className="text-xs font-bold text-gray-900 dark:text-white block">
                    {selectedUploadFile?.name}
                  </span>
                  <span className="text-[11px] text-gray-500 font-mono">
                    {selectedUploadFile ? (selectedUploadFile.size / 1024).toFixed(1) : 0} KB
                  </span>
                  <span className="text-[11px] text-indigo-500 block mt-0.5">Click or drag another to replace</span>
                </div>
              </div>
            ) : (
              <>
                <div className="w-12 h-12 rounded-full bg-indigo-500/10 text-indigo-500 flex items-center justify-center">
                  <Upload className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-800 dark:text-gray-200">
                    Drag and drop your image file here, or <span className="text-indigo-500 underline">browse</span>
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Images are saved directly to <code className="font-mono text-indigo-400">/public/{activeFolder}/</code>
                  </p>
                </div>
              </>
            )}
          </div>

          {selectedUploadFile && (
            <div className="flex flex-col sm:flex-row items-center gap-3 bg-gray-50 dark:bg-gray-800/60 p-3 rounded-xl border border-gray-200 dark:border-gray-700">
              <div className="flex-1 w-full">
                <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
                  Custom File Name (Optional):
                </label>
                <div className="flex items-center">
                  <input
                    type="text"
                    value={customFileName}
                    onChange={(e) => setCustomFileName(e.target.value)}
                    placeholder="e.g. boss_sprite, potion_heal"
                    className="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 text-xs text-gray-900 dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedUploadFile(null);
                    setPreviewDataUrl(null);
                    setCustomFileName('');
                  }}
                  className="px-3 py-2 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs font-bold hover:bg-gray-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUploading}
                  className="flex-1 sm:flex-none px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-md disabled:opacity-50"
                >
                  {isUploading ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="w-3.5 h-3.5" /> Save Asset
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {error && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 text-rose-500 text-xs rounded-xl font-medium">
              {error}
            </div>
          )}

          {uploadSuccess && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-500 text-xs rounded-xl font-medium flex items-center gap-2">
              <Check className="w-4 h-4" /> {uploadSuccess}
            </div>
          )}
        </form>
      </div>

      {/* 4. Active Folder Asset Gallery */}
      <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h3 className="text-base font-black text-gray-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
              <ImageIcon className="w-4 h-4 text-indigo-500" /> Files in /{activeFolder} ({files.length})
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Click &quot;Copy Path&quot; to copy the exact URL reference for use in items, shop, or special fights.
            </p>
          </div>

          <button
            onClick={loadFiles}
            disabled={isLoading}
            className="px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs font-bold flex items-center gap-1.5 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>

        {isLoading ? (
          <div className="py-12 text-center text-gray-400 text-xs flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin text-indigo-500" /> Loading folder assets...
          </div>
        ) : files.length === 0 ? (
          <div className="py-12 text-center border border-dashed border-gray-300 dark:border-gray-700 rounded-2xl">
            <Folder className="w-10 h-10 text-gray-400 mx-auto mb-2 opacity-50" />
            <p className="text-sm font-bold text-gray-500">No assets in this folder yet</p>
            <p className="text-xs text-gray-400 mt-0.5">
              Drag and drop an image above to upload files into <code className="font-mono">/{activeFolder}</code>
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {files.map((file) => (
              <div
                key={file.name}
                className="group relative bg-gray-50 dark:bg-gray-800/70 border border-gray-200 dark:border-gray-700 hover:border-indigo-500/50 rounded-2xl p-3 flex flex-col justify-between transition-all hover:shadow-lg"
              >
                {/* Image Preview Container */}
                <div
                  onClick={() => setInspectImage(file)}
                  className="aspect-square w-full rounded-xl bg-black/40 border border-gray-200/50 dark:border-gray-700/50 overflow-hidden relative cursor-pointer flex items-center justify-center"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={file.path}
                    alt={file.name}
                    className="max-h-full max-w-full object-contain transition-transform group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <span className="p-2 bg-white/20 backdrop-blur rounded-full text-white">
                      <Eye className="w-4 h-4" />
                    </span>
                  </div>
                </div>

                {/* File Details */}
                <div className="mt-2.5 space-y-1">
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-bold text-xs text-gray-900 dark:text-white truncate block" title={file.name}>
                      {file.name}
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 uppercase">
                      {file.extension.replace('.', '')}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-gray-500 font-mono">
                    <span>{file.sizeFormatted}</span>
                    <span className="text-[10px] text-gray-400">
                      {new Date(file.modifiedAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                {/* Actions Footer */}
                <div className="mt-3 pt-2.5 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between gap-2">
                  <button
                    onClick={() => handleCopyPath(file.path)}
                    className="flex-1 py-1.5 px-2.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 text-[11px] font-bold flex items-center justify-center gap-1.5 transition-colors font-mono"
                    title="Copy path for code or item image input"
                  >
                    {copiedPath === file.path ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-500" /> Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" /> Copy Path
                      </>
                    )}
                  </button>

                  <button
                    onClick={() => handleDelete(file.name)}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-rose-500 hover:bg-rose-500/10 transition-colors"
                    title="Delete file"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 5. Instructions / Developer Reference */}
      <div className="bg-slate-900/60 border border-white/10 rounded-2xl p-5 space-y-3 text-xs text-gray-300">
        <h4 className="font-black text-sm text-yellow-400 uppercase tracking-wider flex items-center gap-2">
          <Info className="w-4 h-4" /> How to use these assets in the game
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-black/40 p-3.5 rounded-xl border border-white/5 space-y-1">
            <span className="font-bold text-white block">1. In Item Factory:</span>
            <p className="text-gray-400 leading-relaxed">
              When creating or editing an item in the <strong className="text-white">Item Factory</strong> tab, paste the copied path into the item&apos;s icon URL field (e.g. <code className="text-amber-300">/Assets/General/gear/sword.png</code>).
            </p>
          </div>
          <div className="bg-black/40 p-3.5 rounded-xl border border-white/5 space-y-1">
            <span className="font-bold text-white block">2. In Foes & Encounters:</span>
            <p className="text-gray-400 leading-relaxed">
              When configuring enemy sprites or boss portraits, paste the path into the foe&apos;s Image URL (e.g. <code className="text-cyan-300">/Assets/Location specific/location 2/boss.png</code>).
            </p>
          </div>
          <div className="bg-black/40 p-3.5 rounded-xl border border-white/5 space-y-1">
            <span className="font-bold text-white block">3. In Special 2D Fights:</span>
            <p className="text-gray-400 leading-relaxed">
              Special fights automatically look up their arena backdrops and altar props in <code className="text-indigo-300">/Assets/Location specific/location X/</code> without network delay.
            </p>
          </div>
        </div>
      </div>

      {/* 6. Fullscreen Image Inspector Modal */}
      {inspectImage && (
        <div
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setInspectImage(null)}
        >
          <div
            className="bg-slate-900 border border-indigo-500/40 rounded-2xl max-w-2xl w-full p-5 space-y-4 shadow-2xl relative"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-800 pb-3">
              <div>
                <h4 className="text-sm font-black text-white">{inspectImage.name}</h4>
                <p className="text-[11px] text-gray-400 font-mono">{inspectImage.path}</p>
              </div>
              <button
                onClick={() => setInspectImage(null)}
                className="p-1 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-black/60 rounded-xl p-4 flex items-center justify-center max-h-[60vh] overflow-hidden border border-gray-800">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={inspectImage.path}
                alt={inspectImage.name}
                className="max-h-[50vh] max-w-full object-contain rounded-lg"
              />
            </div>

            <div className="flex items-center justify-between text-xs pt-1">
              <span className="text-gray-400 font-mono">
                Size: <strong className="text-white">{inspectImage.sizeFormatted}</strong>
              </span>
              <button
                onClick={() => handleCopyPath(inspectImage.path)}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold flex items-center gap-1.5"
              >
                {copiedPath === inspectImage.path ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-300" /> Path Copied!
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" /> Copy Path URL
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
