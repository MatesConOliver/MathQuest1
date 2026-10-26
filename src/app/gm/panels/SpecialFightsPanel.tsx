'use client';

import React, { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import { FoeDoc } from '@/types/game';
import { SPECIAL_FIGHTS_LIST, SPECIAL_FIGHTS } from '@/app/play/components/specialFights/registry';
import SpecialFightModal from '@/app/play/components/specialFights/SpecialFightModal';
import { Swords, Play, Sparkles, Shield, Compass, BookOpen, Layers, CheckCircle2, ChevronRight } from 'lucide-react';

export function SpecialFightsPanel() {
  const [foes, setFoes] = useState<FoeDoc[]>([]);
  const [selectedFoeId, setSelectedFoeId] = useState<string>('');
  const [activeModalFightId, setActiveModalFightId] = useState<string>('loc2_vieta_scales');
  const [autoPlayTransition, setAutoPlayTransition] = useState<boolean>(false);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);

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
            Special Fights & Boss Phase Shifts
          </h2>
          <p className="text-sm text-gray-300 mt-1 max-w-2xl">
            Test custom 2D arena encounters, preview the right-to-left transition animations, and choose which special fight to assign to each boss encounter.
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
          <span className="text-xs text-gray-400">
            Select a fight below to preview its transition or launch into the game arena.
          </span>
        </div>

        <div className="grid grid-cols-1 gap-4">
          {SPECIAL_FIGHTS_LIST.map((fight) => (
            <div
              key={fight.id}
              className="bg-slate-900/80 hover:bg-slate-900 border-2 border-indigo-500/40 rounded-2xl p-5 shadow-xl transition-all duration-200"
            >
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
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
                  {/* Button 1: Preview Intro Transition */}
                  <button
                    onClick={() => handleOpenTest(fight.id, true)}
                    className="flex-1 lg:flex-none px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-gray-950 font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg transition-transform active:scale-95"
                    title="Preview disappearing menu, trembling foe, and right-to-left black wipe"
                  >
                    <span>🎬</span> Preview Intro Transition
                  </button>

                  {/* Button 2: Direct Play Arena */}
                  <button
                    onClick={() => handleOpenTest(fight.id, false)}
                    className="flex-1 lg:flex-none px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg transition-transform active:scale-95"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" /> Play Special Battle
                  </button>
                </div>
              </div>
            </div>
          ))}

          {/* Placeholders for upcoming Location Fights */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
            <div className="p-4 rounded-xl bg-slate-900/40 border border-dashed border-gray-700/60 opacity-60">
              <span className="text-[10px] font-mono uppercase bg-gray-800 text-gray-400 px-2 py-0.5 rounded">Location 1 • In Development</span>
              <h5 className="font-bold text-sm text-gray-300 mt-2">Linear Balance Beam</h5>
              <p className="text-[11px] text-gray-500 mt-1">Pre-Algebra & Linear equations scale mechanic.</p>
            </div>
            <div className="p-4 rounded-xl bg-slate-900/40 border border-dashed border-gray-700/60 opacity-60">
              <span className="text-[10px] font-mono uppercase bg-gray-800 text-gray-400 px-2 py-0.5 rounded">Location 3 • In Development</span>
              <h5 className="font-bold text-sm text-gray-300 mt-2">Horner Division Chamber</h5>
              <p className="text-[11px] text-gray-500 mt-1">Synthetic division grid & root factorization puzzle.</p>
            </div>
            <div className="p-4 rounded-xl bg-slate-900/40 border border-dashed border-gray-700/60 opacity-60">
              <span className="text-[10px] font-mono uppercase bg-gray-800 text-gray-400 px-2 py-0.5 rounded">Location 4 • In Development</span>
              <h5 className="font-bold text-sm text-gray-300 mt-2">Coordinate System Portals</h5>
              <p className="text-[11px] text-gray-500 mt-1">2x2 & 3x3 linear system intersection matrix.</p>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Instructions Guide for GM */}
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
              <ChevronRight className="w-3.5 h-3.5 text-indigo-400" /> Adding More Special Fights:
            </span>
            <p className="text-gray-400 leading-relaxed">
              All special fights are registered in <code className="text-amber-300">src/app/play/components/specialFights/registry.ts</code>. As we build new ones, adding their definition to the registry automatically makes them appear in both this test lab and the Encounters dropdown.
            </p>
          </div>
        </div>
      </div>

      {/* 4. Modal Runner */}
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
