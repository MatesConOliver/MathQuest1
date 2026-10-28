'use client';

import React, { useState, useEffect } from 'react';
import { SPECIAL_FIGHTS_LIST, getSpecialFightById } from './registry';
import { FoeDoc } from '@/types/game';
import { SpecialFightCompleteResult } from './types';
import { X, Swords, RefreshCw, CheckCircle2, AlertTriangle, ArrowRight } from 'lucide-react';
import { getLoc2SpriteConfig } from '@/config/specialFightSprites';

interface SpecialFightModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialFightId?: string;
  initialFoeId?: string;
  initialAutoPlayTransition?: boolean;
  foes?: FoeDoc[];
}

export default function SpecialFightModal({
  isOpen,
  onClose,
  initialFightId = 'loc2_vieta_scales',
  initialFoeId = '',
  initialAutoPlayTransition = false,
  foes = [],
}: SpecialFightModalProps) {
  const [selectedFightId, setSelectedFightId] = useState(initialFightId);
  const [selectedFoeId, setSelectedFoeId] = useState<string>(initialFoeId || foes[0]?.id || '');
  const [key, setKey] = useState(0); // For forcing reset
  const [testResult, setTestResult] = useState<SpecialFightCompleteResult | null>(null);
  const [transitionStage, setTransitionStage] = useState<'idle' | 'tremble' | 'wipe' | 'reveal' | 'active'>(
    initialAutoPlayTransition ? 'tremble' : 'active'
  );

  // Sync state whenever modal opens or props change
  useEffect(() => {
    if (isOpen) {
      setSelectedFightId(initialFightId || 'loc2_vieta_scales');
      if (initialFoeId) {
        setSelectedFoeId(initialFoeId);
      } else if (foes.length > 0) {
        setSelectedFoeId(foes[0].id || '');
      }
      setTestResult(null);
      if (initialAutoPlayTransition) {
        setTransitionStage('tremble');
        const timer1 = setTimeout(() => {
          setTransitionStage('wipe');
        }, 850);
        const timer2 = setTimeout(() => {
          setTransitionStage('reveal');
          setKey((prev) => prev + 1);
        }, 1600);
        const timer3 = setTimeout(() => {
          setTransitionStage('active');
        }, 2250);
        return () => {
          clearTimeout(timer1);
          clearTimeout(timer2);
          clearTimeout(timer3);
        };
      } else {
        setTransitionStage('active');
      }
    }
  }, [isOpen, initialFightId, initialFoeId, initialAutoPlayTransition, foes]);

  if (!isOpen) return null;

  const activeDef = getSpecialFightById(selectedFightId) || SPECIAL_FIGHTS_LIST[0];
  const activeFoe = foes.find((f) => f.id === selectedFoeId) || foes[0] || {
    id: 'test_guardian',
    name: 'Ancient Stone Guardian',
    maxHp: 150,
    attackDamage: 12,
    emoji: '🗿',
    imageUrl:
      'https://firebasestorage.googleapis.com/v0/b/pokematicos.firebasestorage.app/o/monster_sprites%2Fearth_golem.png?alt=media',
  };

  const FightComponent = activeDef.component;

  const handleReset = () => {
    setTestResult(null);
    setTransitionStage('active');
    setKey((prev) => prev + 1);
  };

  const handlePlayTransition = () => {
    setTestResult(null);
    setTransitionStage('tremble');
    const timer1 = setTimeout(() => {
      setTransitionStage('wipe');
    }, 850);
    const timer2 = setTimeout(() => {
      setTransitionStage('reveal');
      setKey((prev) => prev + 1);
    }, 1600);
    const timer3 = setTimeout(() => {
      setTransitionStage('active');
    }, 2250);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex flex-col p-2 sm:p-4">
      {/* Top Bar with selector and controls */}
      <div className="shrink-0 max-w-6xl w-full mx-auto flex flex-wrap items-center justify-between gap-3 bg-slate-900 border border-indigo-500/30 px-4 py-2.5 rounded-2xl mb-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white">
            <Swords className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
              Special Fight Test Lab
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-400/20 text-amber-300 border border-amber-400/30">
                GM ONLY
              </span>
            </h3>
          </div>
        </div>

        {/* Fight & Foe selectors */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-1.5 text-xs text-gray-300">
            <span className="font-bold">Fight:</span>
            <select
              value={selectedFightId}
              onChange={(e) => {
                setSelectedFightId(e.target.value);
                handleReset();
              }}
              className="bg-black/80 border border-indigo-500/40 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none focus:border-amber-400"
            >
              {SPECIAL_FIGHTS_LIST.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name} ({f.locationName.split(':')[0]})
                </option>
              ))}
            </select>
          </div>

          {foes.length > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-gray-300">
              <span className="font-bold">Foe:</span>
              <select
                value={selectedFoeId}
                onChange={(e) => {
                  setSelectedFoeId(e.target.value);
                  handleReset();
                }}
                className="bg-black/80 border border-indigo-500/40 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none focus:border-amber-400"
              >
                {foes.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.emoji || '👹'} {f.name} (Max HP: {f.maxHp})
                  </option>
                ))}
              </select>
            </div>
          )}

          <button
            type="button"
            onClick={handlePlayTransition}
            className="p-1.5 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition-all active:scale-95 flex items-center gap-1.5 text-xs shadow"
            title="Preview Special Fight Transition Animation"
          >
            <span>🎬</span> Preview Intro Transition
          </button>

          <button
            type="button"
            onClick={handleReset}
            className="p-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-600 transition-colors flex items-center gap-1 text-xs font-bold"
            title="Reset Test"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Reset
          </button>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg bg-red-950/80 hover:bg-red-900 border border-red-500/40 text-red-300 transition-colors"
            title="Close Lab"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Container */}
      <div className="flex-1 max-w-6xl w-full mx-auto rounded-3xl overflow-hidden border-2 border-indigo-500/40 shadow-2xl relative min-h-0 bg-slate-950 flex flex-col">
        {testResult ? (
          /* Test Result Summary Screen inside Lab */
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center animate-in fade-in zoom-in-95 duration-200">
            <div
              className={`w-20 h-20 rounded-3xl flex items-center justify-center mb-4 border-2 shadow-2xl ${
                testResult.success
                  ? 'bg-emerald-950/60 border-emerald-400 text-emerald-300 shadow-emerald-500/20'
                  : 'bg-rose-950/60 border-rose-400 text-rose-300 shadow-rose-500/20'
              }`}
            >
              {testResult.success ? (
                <CheckCircle2 className="w-10 h-10" />
              ) : (
                <AlertTriangle className="w-10 h-10" />
              )}
            </div>

            <h2 className="text-2xl sm:text-3xl font-black text-white uppercase tracking-wider mb-2">
              {testResult.success ? 'Special Fight Passed!' : 'Special Fight Failed!'}
            </h2>

            <p className="text-gray-300 text-sm max-w-md mb-6 leading-relaxed">
              {testResult.message || (testResult.success ? 'The encounter was completed successfully.' : 'The player was defeated.')}
            </p>

            <div className="bg-slate-900 border border-indigo-500/30 rounded-2xl p-4 max-w-md w-full mb-6 text-left text-xs space-y-1.5 text-gray-300">
              <div className="flex justify-between">
                <span className="text-gray-400">Fight ID:</span>
                <span className="font-mono text-cyan-300 font-bold">{selectedFightId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Opponent:</span>
                <span className="font-bold text-white">
                  {activeFoe.emoji} {activeFoe.name}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Outcome:</span>
                <span
                  className={`font-black uppercase ${
                    testResult.success ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {testResult.success ? 'VICTORY' : 'DEFEAT'}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                onClick={handleReset}
                className="px-6 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-sm uppercase tracking-wider shadow-lg flex items-center gap-2 transition-transform active:scale-95"
              >
                <RefreshCw className="w-4 h-4" />
                Run Test Again
              </button>

              <button
                onClick={onClose}
                className="px-6 py-3 rounded-2xl bg-gray-800 hover:bg-gray-700 text-gray-300 font-bold text-sm uppercase tracking-wider border border-white/10 transition-colors"
              >
                Back to GM Encounters
              </button>
            </div>
          </div>
        ) : (
          /* Running Fight or Intro Transition */
          <div className="relative w-full h-full flex flex-col flex-1 min-h-0 overflow-hidden">
            {/* 1. Special Fight Component (mounted when revealing or active) */}
            {(transitionStage === 'reveal' || transitionStage === 'active') && (
              <FightComponent
                key={key}
                foe={activeFoe}
                character={{
                  ownerUid: 'test',
                  name: 'Arch-Scholar Owl',
                  level: 15,
                  xp: 1200,
                  gold: 350,
                  maxHp: 100,
                  hp: 85,
                  stats: { a: 0, b: 0, c: 5, d: 10 },
                  skills: { algebra: 15, functions: 15, geometry: 0, probabilityAndStatistics: 0, calculus: 0 },
                  unspentPoints: 0,
                  inventory: [],
                  equipment: { mainHand: null, offHand: null, armor: null, head: null },
                  completedStoryEvents: [],
                  storyFlags: [],
                  unlockedContinents: [],
                  encounterWins: {},
                  imageUrl:
                    getLoc2SpriteConfig().owl.type === 'character'
                      ? 'https://firebasestorage.googleapis.com/v0/b/pokematicos.firebasestorage.app/o/The_Primordial_Equation_Owl_Sprites%2Fowl%20back.png?alt=media&token=bae93c5e-92ed-4958-9274-fb67a3f5f8c9'
                      : undefined,
                }}
                onComplete={(res) => {
                  setTestResult(res);
                }}
                isTestMode={true}
                onCloseTest={onClose}
              />
            )}

            {/* 2. Simulated Battle Scene during 'tremble' / 'wipe' */}
            {(transitionStage === 'tremble' || transitionStage === 'wipe') && (
              <div className="absolute inset-0 z-30 bg-gradient-to-b from-slate-900 via-indigo-950 to-slate-950 flex flex-col justify-between overflow-hidden select-none p-3 sm:p-5">
                {/* Simulated Top HUD */}
                <div className="flex justify-between items-center z-10 shrink-0">
                  <div className="bg-black/80 border border-blue-500/40 rounded-xl px-3 py-1.5 text-xs text-white flex items-center gap-2">
                    <span className="font-bold">Arch-Scholar Owl</span>
                    <span className="text-[10px] text-yellow-400 font-mono">Lv.15</span>
                  </div>
                  <div className="bg-black/80 border border-red-500/40 rounded-xl px-3 py-1.5 text-xs text-white flex items-center gap-2">
                    <span className="font-bold">{activeFoe.name}</span>
                    <span className="text-[10px] text-red-400 font-mono">HP: {activeFoe.maxHp}</span>
                  </div>
                </div>

                {/* Arena with Trembling Foe & Player Owl */}
                <div className="flex-1 relative w-full overflow-hidden">
                  {/* Trembling Foe in upper-right stage */}
                  <div className="absolute top-[10%] right-[12%] flex flex-col items-center">
                    <div className="relative animate-boss-tremble">
                      {getLoc2SpriteConfig().foe.type === 'emoji' ? (
                        <span className="text-7xl sm:text-8xl select-none filter drop-shadow-[0_12px_24px_rgba(0,0,0,0.8)]">
                          {getLoc2SpriteConfig().foe.emoji || activeFoe.emoji || '👹'}
                        </span>
                      ) : activeFoe.imageUrl ? (
                        <img
                          src={activeFoe.imageUrl}
                          alt={activeFoe.name}
                          className="w-48 h-48 sm:w-60 sm:h-60 object-contain drop-shadow-[0_12px_24px_rgba(0,0,0,0.8)]"
                        />
                      ) : (
                        <span className="text-7xl sm:text-8xl select-none">
                          {activeFoe.emoji || '👹'}
                        </span>
                      )}
                      <div className="absolute -inset-6 rounded-full bg-red-600/35 blur-2xl animate-ping pointer-events-none" />
                      <div className="absolute -inset-10 rounded-full bg-purple-600/30 blur-3xl animate-pulse pointer-events-none" />
                    </div>
                  </div>

                  {/* Player Owl in lower-left */}
                  <div className="absolute bottom-[8%] left-[10%] flex flex-col items-center">
                    {getLoc2SpriteConfig().owl.type === 'emoji' ? (
                      <span className="text-7xl sm:text-8xl select-none filter drop-shadow-[0_12px_24px_rgba(0,0,0,0.8)]">
                        {getLoc2SpriteConfig().owl.emoji || '🦉'}
                      </span>
                    ) : (
                      <img
                        src={
                          getLoc2SpriteConfig().owl.path ||
                          'https://firebasestorage.googleapis.com/v0/b/pokematicos.firebasestorage.app/o/The_Primordial_Equation_Owl_Sprites%2Fowl%20back.png?alt=media&token=bae93c5e-92ed-4958-9274-fb67a3f5f8c9'
                        }
                        alt="Player Owl"
                        className="w-36 h-36 sm:w-44 sm:h-44 object-contain drop-shadow-[0_12px_24px_rgba(0,0,0,0.8)]"
                      />
                    )}
                  </div>
                </div>

                {/* Bottom Disappearing Questions & Answers Menu */}
                <div className="shrink-0 z-10 transition-all duration-500 ease-in-out opacity-0 translate-y-28 pointer-events-none">
                  <div className="bg-black/90 border border-white/20 rounded-2xl p-4 flex items-center justify-between shadow-2xl">
                    <div className="space-y-1">
                      <div className="text-xs text-yellow-400 font-bold uppercase tracking-wider">Solve the algebraic seal:</div>
                      <div className="text-sm font-serif text-white">Find the sum of roots for $P(x) = 2x^3 - 8x^2 + 10x - 6$</div>
                    </div>
                    <div className="flex gap-2">
                      <span className="px-4 py-2 bg-yellow-400 text-gray-950 font-bold rounded-xl text-xs">⚔️ Answer</span>
                      <span className="px-4 py-2 bg-slate-800 text-white font-bold rounded-xl text-xs">🎒 Objects</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 3. Black Screen Wipe Curtain (Right to Left) */}
            {(transitionStage === 'wipe' || transitionStage === 'reveal') && (
              <div
                className={`absolute inset-0 z-40 pointer-events-auto bg-black overflow-hidden ${
                  transitionStage === 'wipe' ? 'animate-black-wipe-in' : 'animate-black-fade-out'
                }`}
              >
                {/* Soft gradient leading shadow on the left edge as it sweeps from right to left */}
                <div className="absolute top-0 bottom-0 -left-40 w-40 bg-gradient-to-r from-transparent to-black pointer-events-none" />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
