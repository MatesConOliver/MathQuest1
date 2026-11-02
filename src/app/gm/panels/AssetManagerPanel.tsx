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
  RotateCcw,
  CheckCircle2,
  Sliders,
  Search,
  Shield,
  AlertTriangle,
} from 'lucide-react';
import { SYSTEM_ICON_DEFINITIONS, useSystemIcons, SystemIconDef } from '@/context/SystemIconsContext';
import { optimizeIconImage } from '@/lib/imageOptimizer';

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
  const [category, setCategory] = useState<'locations' | 'general' | 'icons'>('locations');
  const [selectedLocation, setSelectedLocation] = useState<number>(2); // Default to location 2
  const [selectedGeneral, setSelectedGeneral] = useState<'gear' | 'consumables' | 'others'>('gear');

  // Active folder path
  const activeFolder =
    category === 'locations'
      ? `Assets/Location specific/location ${selectedLocation}`
      : category === 'general'
      ? `Assets/General/${selectedGeneral}`
      : 'Assets/Icons';

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

  // Modal to view/copy Firestore and Storage rules
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [copiedRules, setCopiedRules] = useState<'firestore' | 'storage' | null>(null);

  // System Icons & Custom Emoji Replacements State
  const { icons: systemIcons, updateIcon, resetIcon, hasPermissionNotice } = useSystemIcons();
  const [iconFilter, setIconFilter] = useState<'all' | 'navigation' | 'combat' | 'economy' | 'status' | 'meta'>('all');
  const [iconSearch, setIconSearch] = useState('');
  const [optimizingKey, setOptimizingKey] = useState<string | null>(null);
  const [iconFeedback, setIconFeedback] = useState<{ key: string; msg: string; type: 'success' | 'error' } | null>(null);
  const iconFileInputRef = useRef<HTMLInputElement | null>(null);
  const targetIconKeyRef = useRef<string | null>(null);

  // Helper to format bytes
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  // Single-click Icon Upload with automated client-side downscaling (max 128x128px PNG)
  const handleTriggerIconUpload = (key: string) => {
    targetIconKeyRef.current = key;
    iconFileInputRef.current?.click();
  };

  const handleIconFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const iconKey = targetIconKeyRef.current;
    if (!file || !iconKey) return;

    setOptimizingKey(iconKey);
    setIconFeedback(null);

    try {
      // 1. Auto-optimize client-side: resize to max 128x128px PNG with alpha transparency
      const { file: optimizedFile, width, height, originalSize, optimizedSize } = await optimizeIconImage(file, 128);
      const filename = `${iconKey}.png`;

      // Pre-compute lightweight Base64 Data URL as infallible zero-permission fallback
      const base64DataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(optimizedFile);
      });

      let iconPath = '';
      if (storageDestination === 'cloud') {
        try {
          const cloudPath = `Assets/Icons/${filename}`;
          const fileRef = storageRef(storage, cloudPath);
          await uploadBytes(fileRef, optimizedFile);
          iconPath = await getDownloadURL(fileRef);
        } catch (cloudErr) {
          console.warn('Firebase Storage upload failed, falling back to compact Base64 Data URL:', cloudErr);
          iconPath = base64DataUrl;
        }
      } else {
        try {
          const formData = new FormData();
          formData.append('file', optimizedFile);
          formData.append('folder', 'Assets/Icons');
          formData.append('customName', iconKey);

          const res = await fetch('/api/gm/assets', {
            method: 'POST',
            body: formData,
          });
          const data = await res.json();
          if (data.success) {
            iconPath = data.file.path;
          } else if (data.isReadOnly) {
            // Container filesystem is read-only (Cloud Run); try Firebase Storage with fallback to Base64
            try {
              const cloudPath = `Assets/Icons/${filename}`;
              const fileRef = storageRef(storage, cloudPath);
              await uploadBytes(fileRef, optimizedFile);
              iconPath = await getDownloadURL(fileRef);
            } catch (cloudErr) {
              console.warn('Firebase Storage fallback failed, using compact Data URL:', cloudErr);
              iconPath = base64DataUrl;
            }
          } else {
            // Fallback to Data URL
            iconPath = base64DataUrl;
          }
        } catch (fetchErr) {
          console.warn('Local asset API failed, using compact Data URL:', fetchErr);
          iconPath = base64DataUrl;
        }
      }

      if (!iconPath) {
        iconPath = base64DataUrl;
      }

      // 2. Persist in Firestore / local cache / user character doc
      const persistResult = await updateIcon(iconKey, iconPath);
      loadFiles();
      loadSummary();

      const savingsPct = originalSize > optimizedSize ? Math.round(((originalSize - optimizedSize) / originalSize) * 100) : 0;
      const isDataUrl = iconPath.startsWith('data:');

      if (persistResult?.permissionNotice) {
        setIconFeedback({
          key: iconKey,
          type: 'success',
          msg: `Saved locally & to your character profile (${width}×${height}px, ${formatBytes(optimizedSize)}). Live in game! (Deploy updated Firestore rules to broadcast to other players).`,
        });
      } else if (isDataUrl) {
        setIconFeedback({
          key: iconKey,
          type: 'success',
          msg: `Downscaled to ${width}×${height}px (${formatBytes(optimizedSize)}${savingsPct > 0 ? `, -${savingsPct}%` : ''}). Live in game! (Saved via compact sprite data).`,
        });
      } else {
        setIconFeedback({
          key: iconKey,
          type: 'success',
          msg: `Downscaled to ${width}×${height}px (${formatBytes(optimizedSize)}${savingsPct > 0 ? `, -${savingsPct}%` : ''}). Live in game!`,
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to optimize & upload icon';
      setIconFeedback({
        key: iconKey,
        type: 'error',
        msg: msg.includes('permission') || msg.includes('unauthorized')
          ? 'Cloud storage/database permission issue. Check the Firebase Rules button above.'
          : msg,
      });
    } finally {
      setOptimizingKey(null);
      if (iconFileInputRef.current) iconFileInputRef.current.value = '';
      targetIconKeyRef.current = null;
    }
  };

  const handleResetIcon = async (iconKey: string) => {
    try {
      await resetIcon(iconKey);
      setIconFeedback({
        key: iconKey,
        type: 'success',
        msg: 'Reset to original emoji default.',
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Reset failed';
      setIconFeedback({
        key: iconKey,
        type: 'error',
        msg,
      });
    }
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
          try {
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
          } catch (storageErr) {
            const msg = storageErr instanceof Error ? storageErr.message : 'Storage upload failed';
            if (msg.includes('permission') || msg.includes('unauthorized')) {
              setError(
                `Firebase Cloud Storage write permission denied. In Firebase Console → Storage → Rules, ensure GM email (oliveru1996@gmail.com) is authorized or click the "🛡️ Firebase Rules" button at top.`
              );
            } else {
              setError(msg);
            }
          }
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
        if (msg.includes('permission') || msg.includes('unauthorized')) {
          setError(
            `Firebase Cloud Storage write permission denied. Please publish storage.rules in Firebase Console (click "🛡️ Firebase Rules" button).`
          );
        } else {
          setError(msg);
        }
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

        {/* Current Active Path Indicator & Rules Button */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 shrink-0">
          <button
            onClick={() => setShowRulesModal(true)}
            className="px-3 py-2 bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-200 border border-indigo-500/40 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors"
            title="View Firebase Firestore & Storage Rules for GM"
          >
            <Shield className="w-3.5 h-3.5 text-amber-400" />
            <span>Firebase Rules</span>
          </button>
          <div className="bg-black/60 border border-indigo-500/30 p-3 rounded-xl shrink-0 font-mono text-xs">
            <span className="text-gray-400 block text-[10px] uppercase font-bold tracking-wider">Active Folder:</span>
            <span className="text-cyan-300 font-bold break-all flex items-center gap-1.5 mt-0.5">
              <Folder className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
              /{activeFolder}
            </span>
          </div>
        </div>
      </div>

      {/* Cloud Permission Notice Banner */}
      {hasPermissionNotice && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-amber-200 animate-in fade-in">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
            <div className="text-xs">
              <p className="font-bold text-amber-300">Firebase Cloud Permissions Notice</p>
              <p className="text-gray-300">
                Your custom sprites and icons are active in-game and saved to your character document. To broadcast icons globally across all players and enable Cloud Storage, publish the updated security rules in Firebase Console.
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowRulesModal(true)}
            className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-gray-950 font-black text-xs rounded-xl shrink-0 transition-colors shadow-sm"
          >
            View & Copy Rules
          </button>
        </div>
      )}

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
          <button
            onClick={() => setCategory('icons')}
            className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-all ${
              category === 'icons'
                ? 'bg-amber-500 text-gray-950 shadow-md shadow-amber-500/30 font-black'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:text-white'
            }`}
          >
            <Sparkles className="w-4 h-4 text-amber-500" />
            System Icons & Emojis
            <span
              className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-bold ${
                category === 'icons'
                  ? 'bg-black/20 text-gray-950'
                  : 'bg-amber-500/20 text-amber-300'
              }`}
            >
              {Object.keys(systemIcons).length}/{SYSTEM_ICON_DEFINITIONS.length} active
            </span>
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
        ) : category === 'general' ? (
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
        ) : (
          /* System Icons Filter & Search Bar */
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-1.5">
                {(['all', 'navigation', 'combat', 'economy', 'status', 'meta'] as const).map((filt) => {
                  const count = filt === 'all' 
                    ? SYSTEM_ICON_DEFINITIONS.length 
                    : SYSTEM_ICON_DEFINITIONS.filter(d => d.category === filt).length;
                  const isSelected = iconFilter === filt;
                  return (
                    <button
                      key={filt}
                      onClick={() => setIconFilter(filt)}
                      className={`px-3 py-1.5 rounded-xl font-bold text-xs uppercase tracking-wider capitalize flex items-center gap-1.5 transition-all ${
                        isSelected
                          ? 'bg-amber-500 text-gray-950 font-black shadow-sm'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:text-white'
                      }`}
                    >
                      <span>{filt}</span>
                      <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                        isSelected ? 'bg-black/20 text-gray-950' : 'bg-gray-200 dark:bg-gray-700 text-gray-400'
                      }`}>
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Search bar */}
              <div className="relative min-w-[220px]">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Filter icons by name or key..."
                  value={iconSearch}
                  onChange={(e) => setIconSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-xs text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:border-amber-400"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Hidden file input for single-click individual icon replacement */}
      <input
        ref={iconFileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleIconFileSelected}
      />

      {/* 2.5 SPECIAL VIEW: SYSTEM ICONS & EMOJI REPLACEMENT HUB */}
      {category === 'icons' && (
        <div className="space-y-5 animate-in fade-in duration-200">
          {/* Optimization Notice Banner */}
          <div className="bg-gradient-to-r from-amber-500/15 via-amber-500/5 to-slate-900 border border-amber-500/30 rounded-2xl p-5 shadow-lg flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 shrink-0">
                <Sparkles className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-black text-white text-base">Client-Side Auto Downscaling Active</h3>
                  <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded text-[10px] font-mono font-bold">Max 128×128px PNG</span>
                </div>
                <p className="text-xs text-gray-300 max-w-3xl leading-relaxed">
                  You can upload high-resolution artwork or photos without worrying about memory bloat. Images are automatically scaled down to 128×128px PNG sprites with alpha transparency before saving to <code className="text-amber-300 font-mono">/public/Assets/Icons/</code>, maintaining crisp sharpness, ~10KB file sizes, and 60fps game performance.
                </p>
              </div>
            </div>
          </div>

          {/* Icon Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {SYSTEM_ICON_DEFINITIONS
              .filter((def) => {
                const matchesFilter = iconFilter === 'all' || def.category === iconFilter;
                const matchesSearch =
                  !iconSearch.trim() ||
                  def.name.toLowerCase().includes(iconSearch.toLowerCase()) ||
                  def.key.toLowerCase().includes(iconSearch.toLowerCase()) ||
                  def.description.toLowerCase().includes(iconSearch.toLowerCase());
                return matchesFilter && matchesSearch;
              })
              .map((def) => {
                const currentCustomUrl = systemIcons[def.key];
                const isOptimizing = optimizingKey === def.key;
                const feedback = iconFeedback?.key === def.key ? iconFeedback : null;

                return (
                  <div
                    key={def.key}
                    className={`bg-white dark:bg-slate-900 rounded-2xl p-4 border transition-all flex flex-col justify-between gap-3 shadow-sm ${
                      currentCustomUrl
                        ? 'border-amber-500/40 shadow-[0_0_15px_rgba(245,158,11,0.1)]'
                        : 'border-gray-200 dark:border-gray-800'
                    }`}
                  >
                    {/* Card Header */}
                    <div>
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <div>
                          <h4 className="font-black text-sm text-gray-900 dark:text-white flex items-center gap-1.5">
                            {def.name}
                          </h4>
                          <span className="font-mono text-[10px] text-gray-400">
                            key: <strong className="text-amber-400 font-bold">&quot;{def.key}&quot;</strong>
                          </span>
                        </div>
                        <span className="px-2 py-0.5 rounded-full text-[10px] uppercase font-bold tracking-wider bg-gray-100 dark:bg-gray-800 text-gray-500">
                          {def.category}
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-snug line-clamp-2">
                        {def.description}
                      </p>
                    </div>

                    {/* Live Preview Center */}
                    <div className="bg-gray-50 dark:bg-black/50 border border-gray-200 dark:border-gray-800 rounded-xl p-3 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        {/* Checkerboard Icon Vessel */}
                        <div className="w-14 h-14 rounded-xl bg-gray-900 border border-white/10 flex items-center justify-center shrink-0 shadow-inner overflow-hidden relative">
                          {currentCustomUrl ? (
                            <img
                              src={currentCustomUrl}
                              alt={def.name}
                              className="w-10 h-10 object-contain drop-shadow"
                            />
                          ) : (
                            <span className="text-2xl select-none">{def.defaultEmoji}</span>
                          )}
                        </div>

                        {/* Status Label & Path */}
                        <div className="min-w-0">
                          {currentCustomUrl ? (
                            <div>
                              <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase text-emerald-400 bg-emerald-950/60 border border-emerald-500/30 px-2 py-0.5 rounded">
                                <CheckCircle2 className="w-3 h-3" /> Custom Sprite
                              </span>
                              <p className="text-[10px] text-gray-400 font-mono truncate max-w-[170px] mt-1" title={currentCustomUrl}>
                                {currentCustomUrl}
                              </p>
                            </div>
                          ) : (
                            <div>
                              <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase text-gray-400 bg-gray-800/80 border border-gray-700 px-2 py-0.5 rounded">
                                Default Emoji ({def.defaultEmoji})
                              </span>
                              <p className="text-[10px] text-gray-500 mt-1">No custom file assigned</p>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Path Copy Button (if custom) */}
                      {currentCustomUrl && (
                        <button
                          onClick={() => handleCopyPath(currentCustomUrl)}
                          title="Copy asset path"
                          className="p-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white transition-colors shrink-0"
                        >
                          {copiedPath === currentCustomUrl ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      )}
                    </div>

                    {/* Feedback Toast */}
                    {feedback && (
                      <div
                        className={`text-[10px] p-2 rounded-lg font-mono flex items-center gap-1.5 ${
                          feedback.type === 'success'
                            ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-500/40'
                            : 'bg-red-950/80 text-red-300 border border-red-500/40'
                        }`}
                      >
                        {feedback.type === 'success' ? (
                          <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
                        ) : (
                          <Info className="w-3.5 h-3.5 shrink-0 text-red-400" />
                        )}
                        <span>{feedback.msg}</span>
                      </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        onClick={() => handleTriggerIconUpload(def.key)}
                        disabled={isOptimizing}
                        className="flex-1 py-2 px-3 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-gray-950 font-black text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-sm transition-all active:scale-95"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <span>{isOptimizing ? 'Optimizing...' : currentCustomUrl ? 'Replace Sprite' : 'Upload Sprite'}</span>
                      </button>

                      {currentCustomUrl && (
                        <button
                          onClick={() => handleResetIcon(def.key)}
                          title="Reset to default emoji"
                          className="py-2 px-3 rounded-xl bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 hover:text-white text-xs font-bold transition-all flex items-center gap-1"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Reset</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

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
            <div className="space-y-3 bg-gray-50 dark:bg-gray-800/60 p-4 rounded-xl border border-gray-200 dark:border-gray-700">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Destination Folder Selector */}
                <div>
                  <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
                    Target Destination Folder:
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value as 'locations' | 'general')}
                      className="bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg px-2.5 py-1.5 text-xs text-gray-900 dark:text-white font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="locations">Location Specific</option>
                      <option value="general">General</option>
                    </select>

                    {category === 'locations' ? (
                      <select
                        value={selectedLocation}
                        onChange={(e) => setSelectedLocation(Number(e.target.value))}
                        className="bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg px-2.5 py-1.5 text-xs text-gray-900 dark:text-white font-bold font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        {Array.from({ length: 16 }, (_, i) => i + 1).map((loc) => (
                          <option key={loc} value={loc}>
                            Location {loc}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <select
                        value={selectedGeneral}
                        onChange={(e) => setSelectedGeneral(e.target.value as 'gear' | 'consumables' | 'others')}
                        className="bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg px-2.5 py-1.5 text-xs text-gray-900 dark:text-white font-medium capitalize focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="gear">Gear</option>
                        <option value="consumables">Consumables</option>
                        <option value="others">Others</option>
                      </select>
                    )}
                  </div>
                </div>

                {/* Custom File Name */}
                <div>
                  <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
                    Custom File Name (Optional):
                  </label>
                  <input
                    type="text"
                    value={customFileName}
                    onChange={(e) => setCustomFileName(e.target.value)}
                    placeholder="e.g. boss_sprite, new_summit"
                    className="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 text-xs text-gray-900 dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Exact Path Destination Preview */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-gray-200 dark:border-gray-700/60">
                <div className="text-xs">
                  <span className="text-gray-400 font-medium">Will be saved to: </span>
                  <code className="bg-black/30 dark:bg-black/60 text-cyan-300 px-2 py-0.5 rounded font-mono text-[11px] border border-cyan-500/20 break-all">
                    /public/{activeFolder}/
                    {customFileName.trim()
                      ? customFileName.trim().replace(/[^a-zA-Z0-9_\-\s]/g, '') +
                        (selectedUploadFile.name.substring(selectedUploadFile.name.lastIndexOf('.')) || '.png')
                      : selectedUploadFile.name}
                  </code>
                </div>

                <div className="flex items-center gap-2 shrink-0">
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
                    className="px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-md disabled:opacity-50"
                  >
                    {isUploading ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Uploading...
                      </>
                    ) : (
                      <>
                        <Upload className="w-3.5 h-3.5" /> Save Asset to Folder
                      </>
                    )}
                  </button>
                </div>
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

      {/* Firebase Rules Modal for GM */}
      {showRulesModal && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in"
          onClick={() => setShowRulesModal(false)}
        >
          <div
            className="bg-slate-900 border border-indigo-500/40 rounded-2xl max-w-2xl w-full p-6 space-y-5 shadow-2xl relative max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
                  <Shield className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Firebase Security Rules for GM</h3>
                  <p className="text-xs text-gray-400">Authorizes oliveru1996@gmail.com</p>
                </div>
              </div>
              <button
                onClick={() => setShowRulesModal(false)}
                className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center text-gray-400 hover:text-white transition-colors"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-gray-300 leading-relaxed">
              To allow uploading sprites, persisting custom system icons globally, and updating game content across devices on the live server, publish these rules in your{' '}
              <a
                href="https://console.firebase.google.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-amber-400 underline font-bold"
              >
                Firebase Console ↗
              </a>:
            </p>

            {/* Section 1: Firestore Rules */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-amber-400 uppercase tracking-wider font-mono">
                  1. Firestore Database → Rules
                </span>
                <button
                  onClick={() => {
                    const rulesText = `function isGM() {
  return signedIn() && request.auth.token.email == "oliveru1996@gmail.com";
}

// Allow system icons & global settings write by GM:
match /system_settings/{settingId} {
  allow read: if true;
  allow write: if isGM();
}

match /settings/{settingId} {
  allow read: if true;
  allow write: if isGM();
}`;
                    navigator.clipboard.writeText(rulesText);
                    setCopiedRules('firestore');
                    setTimeout(() => setCopiedRules(null), 2000);
                  }}
                  className="px-2.5 py-1 bg-gray-800 hover:bg-gray-700 text-white rounded-lg text-[10px] font-bold border border-gray-700 transition-colors flex items-center gap-1"
                >
                  {copiedRules === 'firestore' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  {copiedRules === 'firestore' ? 'Copied Firestore Snippet!' : 'Copy Firestore Rules'}
                </button>
              </div>
              <pre className="p-3 bg-black text-emerald-400 font-mono text-[11px] rounded-xl overflow-x-auto max-h-48 border border-gray-800 leading-relaxed">
{`function isGM() {
  return signedIn() && request.auth.token.email == "oliveru1996@gmail.com";
}

// System icons and settings:
match /system_settings/{settingId} {
  allow read: if true;
  allow write: if isGM();
}`}
              </pre>
            </div>

            {/* Section 2: Storage Rules */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-cyan-400 uppercase tracking-wider font-mono">
                  2. Storage → Rules (Assets Bucket)
                </span>
                <button
                  onClick={() => {
                    const storageRulesText = `rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    function signedIn() { return request.auth != null; }
    function isGM() {
      return signedIn() && request.auth.token.email == "oliveru1996@gmail.com";
    }

    match /Assets/{allPaths=**} {
      allow read: if true;
      allow write: if isGM();
    }

    match /{allPaths=**} {
      allow read: if true;
      allow write: if isGM();
    }
  }
}`;
                    navigator.clipboard.writeText(storageRulesText);
                    setCopiedRules('storage');
                    setTimeout(() => setCopiedRules(null), 2000);
                  }}
                  className="px-2.5 py-1 bg-gray-800 hover:bg-gray-700 text-white rounded-lg text-[10px] font-bold border border-gray-700 transition-colors flex items-center gap-1"
                >
                  {copiedRules === 'storage' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  {copiedRules === 'storage' ? 'Copied Storage Snippet!' : 'Copy Storage Rules'}
                </button>
              </div>
              <pre className="p-3 bg-black text-cyan-300 font-mono text-[11px] rounded-xl overflow-x-auto max-h-48 border border-gray-800 leading-relaxed">
{`rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    function signedIn() { return request.auth != null; }
    function isGM() {
      return signedIn() && request.auth.token.email == "oliveru1996@gmail.com";
    }

    match /Assets/{allPaths=**} {
      allow read: if true;
      allow write: if isGM();
    }
  }
}`}
              </pre>
            </div>

            <div className="flex justify-between items-center pt-2">
              <span className="text-[11px] text-gray-500">
                Note: In this app version, icons work immediately via local storage and character document fallback even if cloud rules are pending.
              </span>
              <button
                onClick={() => setShowRulesModal(false)}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-colors shrink-0"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
