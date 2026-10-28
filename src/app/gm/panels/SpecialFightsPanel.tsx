'use client';

import React, { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import { FoeDoc } from '@/types/game';
import { SPECIAL_FIGHTS_LIST } from '@/app/play/components/specialFights/registry';
import SpecialFightModal from '@/app/play/components/specialFights/SpecialFightModal';
import {
  Swords,
  Play,
  Compass,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Palette,
  RotateCcw,
  Check,
  ChevronDown,
  ChevronUp,
  Image as ImageIcon,
  Sparkles,
} from 'lucide-react';
import {
  getLoc2SpriteConfig,
  saveLoc2SpriteConfig,
  resetLoc2SpriteConfig,
  LOC2_AVAILABLE_SPRITES,
  Loc2SpriteConfig,
  SpriteChoice,
} from '@/config/specialFightSprites';

export function SpecialFightsPanel() {
  const [foes, setFoes] = useState<FoeDoc[]>([]);
  const [selectedFoeId, setSelectedFoeId] = useState<string>('');
  const [activeModalFightId, setActiveModalFightId] = useState<string>('loc2_vieta_scales');
  const [autoPlayTransition, setAutoPlayTransition] = useState<boolean>(false);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);

  // Active Sprite Config for Location 2
  const [spriteConfig, setSpriteConfig] = useState<Loc2SpriteConfig>(() => getLoc2SpriteConfig());
  const [isCustomizerOpen, setIsCustomizerOpen] = useState<boolean>(true);
  const [savedFeedback, setSavedFeedback] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'foes'), (snap) => {
      const list = snap.docs.map((d) => ({ ...d.data(), id: d.id } as FoeDoc));
      setFoes(list);
      if (list.length > 0 && !selectedFoeId) {
        setSelectedFoeId(list[0].id || '');
      }
    });
    return () => unsub();
  }, [selectedFoeId]);

  const selectedFoe = foes.find((f) => f.id === selectedFoeId) || foes[0] || null;

  const handleOpenTest = (fightId: string, autoTransition: boolean) => {
    setActiveModalFightId(fightId);
    setAutoPlayTransition(autoTransition);
    setIsModalOpen(true);
  };

  const handleSpriteChoice = (
    key: keyof Loc2SpriteConfig,
    choiceId: string,
    customVal?: string
  ) => {
    const options = (LOC2_AVAILABLE_SPRITES as any)[key] as SpriteChoice[] | undefined;
    let chosen: SpriteChoice | undefined = options?.find((o) => o.id === choiceId);

    if (choiceId === 'custom') {
      chosen = {
        id: 'custom',
        name: 'Custom Asset Path / Emoji',
        type: 'custom',
        path: customVal || '',
        emoji: customVal || '🦉',
        description: 'User-specified asset path or emoji.',
      };
    }

    if (!chosen && options && options.length > 0) {
      chosen = options[0];
    }

    if (chosen) {
      const updated: Loc2SpriteConfig = {
        ...spriteConfig,
        [key]: chosen,
      };
      setSpriteConfig(updated);
      saveLoc2SpriteConfig(updated);
      setSavedFeedback(`${String(key)} updated!`);
      setTimeout(() => setSavedFeedback(null), 2500);
    }
  };

  const handleCustomTextChange = (key: keyof Loc2SpriteConfig, val: string) => {
    const current = spriteConfig[key];
    const updatedChoice: SpriteChoice = {
      ...current,
      id: 'custom',
      type: 'custom',
      path: val,
      emoji: val,
      name: `Custom (${val})`,
    };
    const updated: Loc2SpriteConfig = {
      ...spriteConfig,
      [key]: updatedChoice,
    };
    setSpriteConfig(updated);
    saveLoc2SpriteConfig(updated);
  };

  const handleResetToDefaults = () => {
    const def = resetLoc2SpriteConfig();
    setSpriteConfig(def);
    setSavedFeedback('Reset all Location 2 sprites to default settings!');
    setTimeout(() => setSavedFeedback(null), 3000);
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-6xl mx-auto">
      {/* 1. Header Banner */}
      <div className="bg-gradient-to-r from-indigo-900/60 via-slate-900 to-indigo-950 p-6 rounded-2xl border border-indigo-500/40 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 text-xs font-mono font-bold uppercase tracking-wider flex items-center gap-1.5">
              <Swords className="w-3.5 h-3.5" /> Special Battle Mechanics Lab
            </span>
            <span className="text-xs bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full font-bold">
              1 Active Fight
            </span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-white tracking-wide">
            Special Fights & Sprite Asset Manager
          </h2>
          <p className="text-sm text-gray-300 mt-1 max-w-2xl">
            Configure active sprites for each encounter, preview transition animations, and test the 2D arena battles in real-time.
          </p>
        </div>

        {/* Global Foe Selector */}
        <div className="bg-slate-900/90 border border-indigo-400/30 p-3.5 rounded-xl shadow-lg shrink-0">
          <label className="block text-[11px] font-black uppercase text-indigo-300 mb-1 tracking-wider">
            Test Opponent (Foe):
          </label>
          <div className="flex items-center gap-2">
            <select
              value={selectedFoeId}
              onChange={(e) => setSelectedFoeId(e.target.value)}
              className="bg-black/90 border border-indigo-500/50 text-white rounded-lg px-3 py-1.5 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-indigo-400"
            >
              {foes.length === 0 ? (
                <option value="">Default Guardian</option>
              ) : (
                foes.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.emoji || '👹'} {f.name} (HP: {f.maxHp || 100})
                  </option>
                ))
              )}
            </select>
            {selectedFoe && (
              <span className="text-xl" title={selectedFoe.name}>
                {selectedFoe.emoji || '👹'}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 2. Registered Special Fights List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-black text-white uppercase tracking-wider flex items-center gap-2">
            <span>⚔️</span> Registered Special Fights ({SPECIAL_FIGHTS_LIST.length})
          </h3>
          {savedFeedback && (
            <span className="text-xs font-bold text-emerald-400 bg-emerald-950/80 border border-emerald-500/40 px-3 py-1 rounded-full flex items-center gap-1.5 animate-in fade-in">
              <Check className="w-3.5 h-3.5" /> {savedFeedback}
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 gap-6">
          {SPECIAL_FIGHTS_LIST.map((fight) => (
            <div
              key={fight.id}
              className="bg-slate-900/90 border-2 border-indigo-500/40 rounded-2xl p-5 shadow-2xl transition-all duration-200"
            >
              {/* Fight Top Row */}
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5 pb-4 border-b border-white/10">
                {/* Left: Info */}
                <div className="space-y-2 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-md bg-amber-400/20 text-amber-300 border border-amber-400/30 text-[11px] font-mono font-bold">
                      ID: {fight.id}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-md bg-blue-500/20 text-blue-300 border border-blue-500/30 text-[11px] font-semibold flex items-center gap-1">
                      <Compass className="w-3 h-3" /> {fight.locationName}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-md bg-purple-500/20 text-purple-300 border border-purple-500/30 text-[11px] font-semibold flex items-center gap-1">
                      <BookOpen className="w-3 h-3" /> {fight.topicTitle}
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[11px] font-bold">
                      3 Rounds
                    </span>
                  </div>

                  <h4 className="text-xl font-black text-white">{fight.name}</h4>
                  <p className="text-xs text-gray-300 leading-relaxed max-w-3xl">
                    {fight.description}
                  </p>

                  <div className="flex flex-wrap items-center gap-4 text-xs text-gray-400 pt-1 font-mono">
                    <span className="flex items-center gap-1 text-cyan-300">
                      <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400" /> 2D Snowy Peak Canvas
                    </span>
                    <span className="flex items-center gap-1 text-yellow-300">
                      <CheckCircle2 className="w-3.5 h-3.5 text-yellow-400" /> Viète Sum & Product Altars
                    </span>
                    <span className="flex items-center gap-1 text-rose-300">
                      <CheckCircle2 className="w-3.5 h-3.5 text-rose-400" /> Monomial Projectiles & 3 Lives
                    </span>
                  </div>
                </div>

                {/* Right: Actions */}
                <div className="flex flex-row lg:flex-col gap-2.5 shrink-0 justify-end">
                  <button
                    onClick={() => handleOpenTest(fight.id, true)}
                    className="flex-1 lg:flex-none px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-gray-950 font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg transition-transform active:scale-95"
                    title="Preview disappearing menu, trembling foe, and right-to-left black wipe"
                  >
                    <span>🎬</span> Preview Intro Transition
                  </button>

                  <button
                    onClick={() => handleOpenTest(fight.id, false)}
                    className="flex-1 lg:flex-none px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg transition-transform active:scale-95"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" /> Play Special Battle
                  </button>
                </div>
              </div>

              {/* 3. SPRITE & ASSET CONFIGURATION SECTION (LOCATION 2) */}
              <div className="mt-4 pt-2">
                <div className="flex items-center justify-between mb-3">
                  <button
                    onClick={() => setIsCustomizerOpen((prev) => !prev)}
                    className="flex items-center gap-2 text-sm font-black text-indigo-300 hover:text-white transition-colors"
                  >
                    <Palette className="w-4 h-4 text-cyan-400" />
                    <span>Active Sprites & Assets Configuration</span>
                    <span className="text-[10px] font-mono text-gray-400 bg-slate-800 px-2 py-0.5 rounded-full border border-white/10">
                      Location 2 Specific
                    </span>
                    {isCustomizerOpen ? (
                      <ChevronUp className="w-4 h-4 text-gray-400" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-gray-400" />
                    )}
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleResetToDefaults}
                      className="text-xs px-2.5 py-1 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white border border-white/10 flex items-center gap-1 transition-colors"
                      title="Reset all sprites to default"
                    >
                      <RotateCcw className="w-3 h-3" /> Reset Defaults
                    </button>
                  </div>
                </div>

                {isCustomizerOpen && (
                  <div className="bg-slate-950/80 border border-indigo-500/30 rounded-2xl p-4 sm:p-5 space-y-4 animate-in fade-in duration-200">
                    <div className="text-xs text-gray-300 flex items-center justify-between pb-2 border-b border-white/10">
                      <p>
                        Select which sprite asset or emoji to render for each part of the special fight. Changes are automatically saved and applied instantly!
                      </p>
                      <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-500/30 shrink-0">
                        Live Auto-Sync Active
                      </span>
                    </div>

                    {/* 6 Sprite Selection Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {/* CARD 1: BACKGROUND */}
                      <div className="bg-slate-900 border border-white/10 rounded-xl p-3.5 space-y-2.5">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-bold text-cyan-300 uppercase tracking-wider flex items-center gap-1.5">
                            <ImageIcon className="w-3.5 h-3.5 text-cyan-400" /> Background
                          </label>
                          <span className="text-[10px] font-mono bg-cyan-950 text-cyan-300 px-1.5 py-0.5 rounded border border-cyan-500/30">
                            {spriteConfig.background.type}
                          </span>
                        </div>

                        {/* Thumbnail */}
                        <div className="w-full h-24 rounded-lg bg-black border border-white/10 overflow-hidden relative flex items-center justify-center">
                          {spriteConfig.background.previewUrl || spriteConfig.background.path ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={spriteConfig.background.previewUrl || spriteConfig.background.path}
                              alt="Background Preview"
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="text-[11px] text-gray-500 font-mono italic">
                              Canvas Twilight Gradient
                            </div>
                          )}
                        </div>

                        {/* Selector */}
                        <select
                          value={spriteConfig.background.id}
                          onChange={(e) => handleSpriteChoice('background', e.target.value)}
                          className="w-full bg-black/90 border border-white/20 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-cyan-400"
                        >
                          {LOC2_AVAILABLE_SPRITES.background.map((opt) => (
                            <option key={opt.id} value={opt.id}>
                              {opt.name}
                            </option>
                          ))}
                          <option value="custom">Custom Asset Path / URL...</option>
                        </select>

                        {spriteConfig.background.id === 'custom' && (
                          <input
                            type="text"
                            placeholder="Enter image URL or /Assets/... path"
                            value={spriteConfig.background.path || ''}
                            onChange={(e) => handleCustomTextChange('background', e.target.value)}
                            className="w-full bg-black/80 border border-cyan-500/40 rounded-lg px-2.5 py-1 text-xs text-cyan-200 font-mono focus:outline-none"
                          />
                        )}
                        <p className="text-[10px] text-gray-400 leading-tight">
                          {spriteConfig.background.description}
                        </p>
                      </div>

                      {/* CARD 2: STEP DAIS */}
                      <div className="bg-slate-900 border border-white/10 rounded-xl p-3.5 space-y-2.5">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-bold text-amber-300 uppercase tracking-wider flex items-center gap-1.5">
                            <Sparkles className="w-3.5 h-3.5 text-amber-400" /> Channel Dais
                          </label>
                          <span className="text-[10px] font-mono bg-amber-950 text-amber-300 px-1.5 py-0.5 rounded border border-amber-500/30">
                            {spriteConfig.dais.type}
                          </span>
                        </div>

                        {/* Thumbnail */}
                        <div className="w-full h-24 rounded-lg bg-black border border-white/10 overflow-hidden relative flex items-center justify-center p-2">
                          {spriteConfig.dais.previewUrl || spriteConfig.dais.path ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={spriteConfig.dais.previewUrl || spriteConfig.dais.path}
                              alt="Dais Preview"
                              className="max-h-full max-w-full object-contain"
                            />
                          ) : (
                            <div className="w-16 h-16 rounded-full border-2 border-dashed border-amber-400/60 flex items-center justify-center text-amber-300 text-xs">
                              ⚡ Pad
                            </div>
                          )}
                        </div>

                        {/* Selector */}
                        <select
                          value={spriteConfig.dais.id}
                          onChange={(e) => handleSpriteChoice('dais', e.target.value)}
                          className="w-full bg-black/90 border border-white/20 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-amber-400"
                        >
                          {LOC2_AVAILABLE_SPRITES.dais.map((opt) => (
                            <option key={opt.id} value={opt.id}>
                              {opt.name}
                            </option>
                          ))}
                          <option value="custom">Custom Asset Path / URL...</option>
                        </select>

                        {spriteConfig.dais.id === 'custom' && (
                          <input
                            type="text"
                            placeholder="Enter image URL or /Assets/... path"
                            value={spriteConfig.dais.path || ''}
                            onChange={(e) => handleCustomTextChange('dais', e.target.value)}
                            className="w-full bg-black/80 border border-amber-500/40 rounded-lg px-2.5 py-1 text-xs text-amber-200 font-mono focus:outline-none"
                          />
                        )}
                        <p className="text-[10px] text-gray-400 leading-tight">
                          {spriteConfig.dais.description}
                        </p>
                      </div>

                      {/* CARD 3: PLATFORM 1 (SUM) */}
                      <div className="bg-slate-900 border border-white/10 rounded-xl p-3.5 space-y-2.5">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-bold text-indigo-300 uppercase tracking-wider flex items-center gap-1.5">
                            <span>∑</span> Platform 1 (Sum Altar)
                          </label>
                          <span className="text-[10px] font-mono bg-indigo-950 text-indigo-300 px-1.5 py-0.5 rounded border border-indigo-500/30">
                            {spriteConfig.platformSum.type}
                          </span>
                        </div>

                        {/* Thumbnail */}
                        <div className="w-full h-24 rounded-lg bg-black border border-white/10 overflow-hidden relative flex items-center justify-center p-2">
                          {spriteConfig.platformSum.previewUrl || spriteConfig.platformSum.path ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={spriteConfig.platformSum.previewUrl || spriteConfig.platformSum.path}
                              alt="Sum Platform Preview"
                              className="max-h-full max-w-full object-contain"
                            />
                          ) : (
                            <div className="text-center">
                              <span className="text-xl font-serif text-yellow-300 font-bold">∑ αᵢ</span>
                              <div className="text-[10px] text-gray-500 font-mono">Procedural Stone</div>
                            </div>
                          )}
                        </div>

                        {/* Selector */}
                        <select
                          value={spriteConfig.platformSum.id}
                          onChange={(e) => handleSpriteChoice('platformSum', e.target.value)}
                          className="w-full bg-black/90 border border-white/20 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-indigo-400"
                        >
                          {LOC2_AVAILABLE_SPRITES.platformSum.map((opt) => (
                            <option key={opt.id} value={opt.id}>
                              {opt.name}
                            </option>
                          ))}
                          <option value="custom">Custom Asset Path / URL...</option>
                        </select>

                        {spriteConfig.platformSum.id === 'custom' && (
                          <input
                            type="text"
                            placeholder="Enter image URL or /Assets/... path"
                            value={spriteConfig.platformSum.path || ''}
                            onChange={(e) => handleCustomTextChange('platformSum', e.target.value)}
                            className="w-full bg-black/80 border border-indigo-500/40 rounded-lg px-2.5 py-1 text-xs text-indigo-200 font-mono focus:outline-none"
                          />
                        )}
                        <p className="text-[10px] text-gray-400 leading-tight">
                          {spriteConfig.platformSum.description}
                        </p>
                      </div>

                      {/* CARD 4: PLATFORM 2 (PRODUCT) */}
                      <div className="bg-slate-900 border border-white/10 rounded-xl p-3.5 space-y-2.5">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-bold text-indigo-300 uppercase tracking-wider flex items-center gap-1.5">
                            <span>∏</span> Platform 2 (Product Altar)
                          </label>
                          <span className="text-[10px] font-mono bg-indigo-950 text-indigo-300 px-1.5 py-0.5 rounded border border-indigo-500/30">
                            {spriteConfig.platformProduct.type}
                          </span>
                        </div>

                        {/* Thumbnail */}
                        <div className="w-full h-24 rounded-lg bg-black border border-white/10 overflow-hidden relative flex items-center justify-center p-2">
                          {spriteConfig.platformProduct.previewUrl || spriteConfig.platformProduct.path ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={spriteConfig.platformProduct.previewUrl || spriteConfig.platformProduct.path}
                              alt="Product Platform Preview"
                              className="max-h-full max-w-full object-contain"
                            />
                          ) : (
                            <div className="text-center">
                              <span className="text-xl font-serif text-yellow-300 font-bold">∏ αᵢ</span>
                              <div className="text-[10px] text-gray-500 font-mono">Procedural Stone</div>
                            </div>
                          )}
                        </div>

                        {/* Selector */}
                        <select
                          value={spriteConfig.platformProduct.id}
                          onChange={(e) => handleSpriteChoice('platformProduct', e.target.value)}
                          className="w-full bg-black/90 border border-white/20 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-indigo-400"
                        >
                          {LOC2_AVAILABLE_SPRITES.platformProduct.map((opt) => (
                            <option key={opt.id} value={opt.id}>
                              {opt.name}
                            </option>
                          ))}
                          <option value="custom">Custom Asset Path / URL...</option>
                        </select>

                        {spriteConfig.platformProduct.id === 'custom' && (
                          <input
                            type="text"
                            placeholder="Enter image URL or /Assets/... path"
                            value={spriteConfig.platformProduct.path || ''}
                            onChange={(e) => handleCustomTextChange('platformProduct', e.target.value)}
                            className="w-full bg-black/80 border border-indigo-500/40 rounded-lg px-2.5 py-1 text-xs text-indigo-200 font-mono focus:outline-none"
                          />
                        )}
                        <p className="text-[10px] text-gray-400 leading-tight">
                          {spriteConfig.platformProduct.description}
                        </p>
                      </div>

                      {/* CARD 5: OWL (PLAYER) */}
                      <div className="bg-slate-900 border-2 border-cyan-500/40 rounded-xl p-3.5 space-y-2.5 shadow-lg">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-black text-cyan-300 uppercase tracking-wider flex items-center gap-1.5">
                            <span>🦉</span> Owl (Player)
                          </label>
                          <span className="text-[10px] font-mono bg-cyan-900/60 text-cyan-200 px-1.5 py-0.5 rounded border border-cyan-400/40 font-bold">
                            {spriteConfig.owl.type === 'emoji' ? 'Default Emoji' : spriteConfig.owl.type}
                          </span>
                        </div>

                        {/* Thumbnail */}
                        <div className="w-full h-24 rounded-lg bg-black border border-white/10 overflow-hidden relative flex items-center justify-center p-2">
                          {spriteConfig.owl.type === 'emoji' ? (
                            <div className="text-5xl select-none filter drop-shadow-[0_2px_8px_rgba(255,255,255,0.2)]">
                              {spriteConfig.owl.emoji || '🦉'}
                            </div>
                          ) : spriteConfig.owl.previewUrl || spriteConfig.owl.path ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={spriteConfig.owl.previewUrl || spriteConfig.owl.path}
                              alt="Owl Sprite Preview"
                              className="max-h-full max-w-full object-contain"
                            />
                          ) : (
                            <div className="text-5xl select-none">🦉</div>
                          )}
                        </div>

                        {/* Selector */}
                        <select
                          value={spriteConfig.owl.id}
                          onChange={(e) => handleSpriteChoice('owl', e.target.value)}
                          className="w-full bg-black/90 border border-white/20 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-cyan-400"
                        >
                          {LOC2_AVAILABLE_SPRITES.owl.map((opt) => (
                            <option key={opt.id} value={opt.id}>
                              {opt.name}
                            </option>
                          ))}
                          <option value="custom">Custom Emoji / Image URL...</option>
                        </select>

                        {spriteConfig.owl.id === 'custom' && (
                          <input
                            type="text"
                            placeholder="Enter single emoji (e.g. 🦅) or image URL"
                            value={spriteConfig.owl.path || spriteConfig.owl.emoji || ''}
                            onChange={(e) => handleCustomTextChange('owl', e.target.value)}
                            className="w-full bg-black/80 border border-cyan-500/40 rounded-lg px-2.5 py-1 text-xs text-cyan-200 font-mono focus:outline-none"
                          />
                        )}
                        <p className="text-[10px] text-gray-400 leading-tight">
                          {spriteConfig.owl.description}
                        </p>
                      </div>

                      {/* CARD 6: FOE (OPPONENT) */}
                      <div className="bg-slate-900 border-2 border-rose-500/40 rounded-xl p-3.5 space-y-2.5 shadow-lg">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-black text-rose-300 uppercase tracking-wider flex items-center gap-1.5">
                            <span>👹</span> Foe (Opponent)
                          </label>
                          <span className="text-[10px] font-mono bg-rose-900/60 text-rose-200 px-1.5 py-0.5 rounded border border-rose-400/40 font-bold">
                            {spriteConfig.foe.type === 'emoji' ? 'Default Emoji' : spriteConfig.foe.type}
                          </span>
                        </div>

                        {/* Thumbnail */}
                        <div className="w-full h-24 rounded-lg bg-black border border-white/10 overflow-hidden relative flex items-center justify-center p-2">
                          {spriteConfig.foe.type === 'emoji' ? (
                            <div className="text-5xl select-none filter drop-shadow-[0_2px_8px_rgba(255,255,255,0.2)]">
                              {spriteConfig.foe.emoji || selectedFoe?.emoji || '👹'}
                            </div>
                          ) : (selectedFoe?.imageUrl || spriteConfig.foe.path) ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={spriteConfig.foe.path || selectedFoe?.imageUrl}
                              alt="Foe Sprite Preview"
                              className="max-h-full max-w-full object-contain"
                            />
                          ) : (
                            <div className="text-5xl select-none">
                              {selectedFoe?.emoji || '👹'}
                            </div>
                          )}
                        </div>

                        {/* Selector */}
                        <select
                          value={spriteConfig.foe.id}
                          onChange={(e) => handleSpriteChoice('foe', e.target.value)}
                          className="w-full bg-black/90 border border-white/20 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-rose-400"
                        >
                          {LOC2_AVAILABLE_SPRITES.foe.map((opt) => (
                            <option key={opt.id} value={opt.id}>
                              {opt.name}
                            </option>
                          ))}
                          <option value="custom">Custom Emoji / Image URL...</option>
                        </select>

                        {spriteConfig.foe.id === 'custom' && (
                          <input
                            type="text"
                            placeholder="Enter single emoji (e.g. 🐲) or image URL"
                            value={spriteConfig.foe.path || spriteConfig.foe.emoji || ''}
                            onChange={(e) => handleCustomTextChange('foe', e.target.value)}
                            className="w-full bg-black/80 border border-rose-500/40 rounded-lg px-2.5 py-1 text-xs text-rose-200 font-mono focus:outline-none"
                          />
                        )}
                        <p className="text-[10px] text-gray-400 leading-tight">
                          {spriteConfig.foe.description}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Placeholders for upcoming Location Fights */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
            <div className="p-4 rounded-xl bg-slate-900/40 border border-dashed border-gray-700/60 opacity-60">
              <span className="text-[10px] font-mono uppercase bg-gray-800 text-gray-400 px-2 py-0.5 rounded">
                Location 1 • In Development
              </span>
              <h5 className="font-bold text-sm text-gray-300 mt-2">Linear Balance Beam</h5>
              <p className="text-[11px] text-gray-500 mt-1">Pre-Algebra & Linear equations scale mechanic.</p>
            </div>
            <div className="p-4 rounded-xl bg-slate-900/40 border border-dashed border-gray-700/60 opacity-60">
              <span className="text-[10px] font-mono uppercase bg-gray-800 text-gray-400 px-2 py-0.5 rounded">
                Location 3 • In Development
              </span>
              <h5 className="font-bold text-sm text-gray-300 mt-2">Horner Division Chamber</h5>
              <p className="text-[11px] text-gray-500 mt-1">Synthetic division grid & root factorization puzzle.</p>
            </div>
            <div className="p-4 rounded-xl bg-slate-900/40 border border-dashed border-gray-700/60 opacity-60">
              <span className="text-[10px] font-mono uppercase bg-gray-800 text-gray-400 px-2 py-0.5 rounded">
                Location 4 • In Development
              </span>
              <h5 className="font-bold text-sm text-gray-300 mt-2">Coordinate System Portals</h5>
              <p className="text-[11px] text-gray-500 mt-1">2x2 & 3x3 linear system intersection matrix.</p>
            </div>
          </div>
        </div>
      </div>

      {/* 4. Instructions Guide for GM */}
      <div className="bg-slate-900/60 border border-white/10 rounded-2xl p-5 space-y-3 text-xs text-gray-300">
        <h4 className="font-black text-sm text-yellow-400 uppercase tracking-wider flex items-center gap-2">
          <span>💡</span> How Multiple Special Fights Work in MathQuest
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5 bg-black/40 p-3.5 rounded-xl border border-white/5">
            <span className="font-bold text-white flex items-center gap-1.5">
              <ChevronRight className="w-3.5 h-3.5 text-indigo-400" /> Choosing Fights for Encounters:
            </span>
            <p className="text-gray-400 leading-relaxed">
              When creating or editing any boss in the <strong className="text-white">Encounters</strong> panel, select the fight from the <strong className="text-indigo-300">Special Fight Mechanic (50% HP Phase Shift)</strong> dropdown. When the player reduces the boss to 50% HP, that specific mini-game automatically activates!
            </p>
          </div>
          <div className="space-y-1.5 bg-black/40 p-3.5 rounded-xl border border-white/5">
            <span className="font-bold text-white flex items-center gap-1.5">
              <ChevronRight className="w-3.5 h-3.5 text-indigo-400" /> Customizing Active Sprites:
            </span>
            <p className="text-gray-400 leading-relaxed">
              Use the <strong className="text-cyan-300">Active Sprites & Assets Configuration</strong> section above to choose which sprites are active for each part (dais, platforms, player owl, foe, and backdrop). Defaults to 100% opaque emojis with zero background transparency.
            </p>
          </div>
        </div>
      </div>

      {/* 5. Modal Runner */}
      <SpecialFightModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        initialFightId={activeModalFightId}
        initialFoeId={selectedFoeId}
        initialAutoPlayTransition={autoPlayTransition}
        foes={foes}
      />
    </div>
  );
}
