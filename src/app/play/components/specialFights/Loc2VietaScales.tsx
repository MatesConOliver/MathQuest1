'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { InlineMath, BlockMath } from 'react-katex';
import 'katex/dist/katex.min.css';
import { SpecialFightProps } from './types';
import { Sparkles, ShieldAlert, CheckCircle2, RotateCcw, Zap, HelpCircle, X, Award } from 'lucide-react';

interface PolynomialRound {
  r1: number;
  r2: number;
  // ax^2 + bx + c = 0, assuming a = 1
  b: number; // - (r1 + r2)
  c: number; // r1 * r2
  distractors: number[];
  hint: string;
}

// 3 increasingly challenging pools of problems
const ROUND_1_POOL: PolynomialRound[] = [
  { r1: 2, r2: 3, b: -5, c: 6, distractors: [1, 5, -2, -3, 6], hint: "Both roots are positive integers." },
  { r1: 2, r2: 5, b: -7, c: 10, distractors: [1, 3, 7, -2, -5], hint: "Both roots are positive integers." },
  { r1: 3, r2: 4, b: -7, c: 12, distractors: [1, 2, 6, -3, -4], hint: "Both roots are positive integers." },
  { r1: 1, r2: 6, b: -7, c: 6, distractors: [2, 3, -1, -6, 5], hint: "Both roots are positive integers." },
];

const ROUND_2_POOL: PolynomialRound[] = [
  { r1: -2, r2: 5, b: -3, c: -10, distractors: [2, -5, 3, -3, 10], hint: "One root is positive and one is negative." },
  { r1: -3, r2: 4, b: -1, c: -12, distractors: [3, -4, 2, -6, 1], hint: "One root is positive and one is negative." },
  { r1: 2, r2: -6, b: 4, c: -12, distractors: [-2, 6, 3, -4, -8], hint: "One root is positive and one is negative." },
  { r1: -4, r2: 1, b: 3, c: -4, distractors: [4, -1, 2, -2, 5], hint: "One root is positive and one is negative." },
];

const ROUND_3_POOL: PolynomialRound[] = [
  { r1: -3, r2: -5, b: 8, c: 15, distractors: [3, 5, -1, -15, 8], hint: "Notice the positive product and positive middle coefficient." },
  { r1: -2, r2: -7, b: 9, c: 14, distractors: [2, 7, -1, 14, -9], hint: "Both roots are negative integers." },
  { r1: -4, r2: -6, b: 10, c: 24, distractors: [4, 6, -2, -12, 10], hint: "Both roots are negative integers." },
  { r1: -3, r2: 7, b: -4, c: -21, distractors: [3, -7, 4, -4, 21], hint: "Mixed signs with larger product magnitude." },
];

export default function Loc2VietaScales({
  foe,
  character,
  onComplete,
  isTestMode = false,
  onCloseTest,
}: SpecialFightProps) {
  const [currentRoundIndex, setCurrentRoundIndex] = useState(0); // 0, 1, 2 (3 rounds)
  const [selectedRounds, setSelectedRounds] = useState<PolynomialRound[]>([]);
  
  // Placed stones on the 2 pedestals
  const [pedestal1, setPedestal1] = useState<number | null>(null);
  const [pedestal2, setPedestal2] = useState<number | null>(null);

  // FX & Animation states
  const [isCasting, setIsCasting] = useState(false);
  const [isLayerShattering, setIsLayerShattering] = useState(false);
  const [isVictory, setIsVictory] = useState(false);
  const [showHint, setShowHint] = useState(false);

  // Initialize randomized rounds on mount
  useEffect(() => {
    const pickRandom = (arr: PolynomialRound[]) => arr[Math.floor(Math.random() * arr.length)];
    setSelectedRounds([
      pickRandom(ROUND_1_POOL),
      pickRandom(ROUND_2_POOL),
      pickRandom(ROUND_3_POOL),
    ]);
  }, []);

  const currentRound = selectedRounds[currentRoundIndex] || ROUND_1_POOL[0];

  // Available stones pool (distinct values, shuffled)
  const stonePool = useMemo(() => {
    if (!currentRound) return [];
    const all = [currentRound.r1, currentRound.r2, ...currentRound.distractors];
    const unique = Array.from(new Set(all));
    // deterministic sort so they stay stable during selection
    return unique.sort((a, b) => a - b);
  }, [currentRound]);

  // Which stones are currently used
  const isStoneUsed = (val: number) => {
    return pedestal1 === val || pedestal2 === val;
  };

  // Calculations
  const targetSum = -currentRound.b;
  const targetProduct = currentRound.c;

  const currentSum = pedestal1 !== null && pedestal2 !== null ? pedestal1 + pedestal2 : null;
  const currentProduct = pedestal1 !== null && pedestal2 !== null ? pedestal1 * pedestal2 : null;

  const isSumBalanced = currentSum !== null && currentSum === targetSum;
  const isProductBalanced = currentProduct !== null && currentProduct === targetProduct;
  const isBothBalanced = isSumBalanced && isProductBalanced;

  // Handle stone click
  const handleStoneClick = (val: number) => {
    if (isCasting || isLayerShattering || isVictory) return;

    // If stone is already on pedestal 1, remove it
    if (pedestal1 === val) {
      setPedestal1(null);
      return;
    }
    // If stone is already on pedestal 2, remove it
    if (pedestal2 === val) {
      setPedestal2(null);
      return;
    }

    // Otherwise place into first empty pedestal
    if (pedestal1 === null) {
      setPedestal1(val);
    } else if (pedestal2 === null) {
      setPedestal2(val);
    } else {
      // Both full, replace pedestal 2
      setPedestal2(val);
    }
  };

  const clearPedestals = () => {
    if (isCasting || isLayerShattering || isVictory) return;
    setPedestal1(null);
    setPedestal2(null);
  };

  // Channel mana to shatter current layer
  const handleShatterLayer = () => {
    if (!isBothBalanced || isCasting || isLayerShattering) return;

    setIsCasting(true);

    setTimeout(() => {
      setIsLayerShattering(true);

      setTimeout(() => {
        setIsCasting(false);
        setIsLayerShattering(false);
        setPedestal1(null);
        setPedestal2(null);

        if (currentRoundIndex >= 2) {
          // All 3 rounds complete!
          setIsVictory(true);
          if (!isTestMode) {
            setTimeout(() => {
              onComplete({
                success: true,
                message: `The arcane barrier has completely collapsed! ${foe?.name || 'The foe'} is forced into Phase 2!`,
              });
            }, 1800);
          }
        } else {
          setCurrentRoundIndex(prev => prev + 1);
        }
      }, 900);
    }, 700);
  };

  const handleResetTest = () => {
    const pickRandom = (arr: PolynomialRound[]) => arr[Math.floor(Math.random() * arr.length)];
    setSelectedRounds([
      pickRandom(ROUND_1_POOL),
      pickRandom(ROUND_2_POOL),
      pickRandom(ROUND_3_POOL),
    ]);
    setCurrentRoundIndex(0);
    setPedestal1(null);
    setPedestal2(null);
    setIsVictory(false);
    setIsCasting(false);
    setIsLayerShattering(false);
  };

  // Polynomial string formatted in LaTeX
  const polynomialLatex = useMemo(() => {
    const b = currentRound.b;
    const c = currentRound.c;
    const bPart = b === 0 ? '' : b === 1 ? '+ x' : b === -1 ? '- x' : b > 0 ? `+ ${b}x` : `- ${Math.abs(b)}x`;
    const cPart = c === 0 ? '' : c > 0 ? `+ ${c}` : `- ${Math.abs(c)}`;
    return `x^2 ${bPart} ${cPart} = 0`;
  }, [currentRound]);

  const playerSprite = character?.imageUrl || "https://firebasestorage.googleapis.com/v0/b/pokematicos.firebasestorage.app/o/The_Primordial_Equation_Owl_Sprites%2Fowl%20back.png?alt=media&token=bae93c5e-92ed-4958-9274-fb67a3f5f8c9";
  const foeSprite = foe?.imageUrl;
  const foeEmoji = foe?.emoji || "👹";

  return (
    <div className="relative w-full h-full min-h-[620px] max-h-[92vh] overflow-y-auto bg-gradient-to-b from-indigo-950 via-slate-950 to-black text-white p-3 sm:p-5 flex flex-col justify-between select-none">
      
      {/* Background Magic Runes Grid & Atmosphere */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(99,102,241,0.15),transparent_70%)] pointer-events-none" />
      <div className="absolute inset-0 opacity-10 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />

      {/* TOP HEADER & ROUND PROGRESS */}
      <div className="relative z-10 flex flex-col sm:flex-row items-center justify-between gap-3 bg-black/60 backdrop-blur-md border border-indigo-500/30 px-4 py-2.5 rounded-2xl shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-indigo-600 flex items-center justify-center text-xl shadow-lg shadow-indigo-500/20">
            ⚖️
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-black tracking-wide bg-gradient-to-r from-amber-300 via-yellow-100 to-indigo-300 bg-clip-text text-transparent">
                VIETA&apos;S ARCANE ALTAR
              </h2>
              {isTestMode && (
                <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-purple-500/30 text-purple-300 rounded border border-purple-500/40">
                  GM Test Mode
                </span>
              )}
            </div>
            <p className="text-xs text-indigo-200/80">
              Harmonize the Sum and Product to shatter the foe&apos;s quadratic barrier
            </p>
          </div>
        </div>

        {/* 3 Barrier Layers Progress */}
        <div className="flex items-center gap-2">
          <div className="text-right mr-1">
            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block">Barrier Seal</span>
            <span className="text-xs font-mono font-bold text-amber-300">
              {currentRoundIndex + 1} of 3 Layers
            </span>
          </div>
          <div className="flex gap-1.5">
            {[0, 1, 2].map((idx) => {
              const isCleared = idx < currentRoundIndex || isVictory;
              const isCurrent = idx === currentRoundIndex && !isVictory;
              return (
                <div
                  key={idx}
                  className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold transition-all duration-300 ${
                    isCleared
                      ? 'bg-emerald-500/30 text-emerald-300 border border-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.5)]'
                      : isCurrent
                      ? 'bg-amber-500/30 text-amber-300 border border-amber-400 animate-pulse shadow-[0_0_12px_rgba(245,158,11,0.5)]'
                      : 'bg-gray-800/60 text-gray-500 border border-gray-700'
                  }`}
                >
                  {isCleared ? '✓' : idx + 1}
                </div>
              );
            })}
          </div>

          {isTestMode && onCloseTest && (
            <button
              onClick={onCloseTest}
              className="ml-3 p-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-600 transition-colors"
              title="Close Test"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* MIDDLE: THE BATTLE ARENA (SPRITES + BARRIER) */}
      <div className="relative z-10 my-3 flex-1 flex flex-col items-center justify-center min-h-[180px]">
        
        {/* Arena Stage */}
        <div className="w-full max-w-4xl grid grid-cols-12 gap-3 items-center">
          
          {/* Player Owl (Left) */}
          <div className="col-span-4 flex flex-col items-center">
            <div className={`relative transition-all duration-500 ${isCasting ? 'scale-110 translate-x-4' : 'animate-bounce'}`} style={{ animationDuration: '3s' }}>
              <img
                src={playerSprite}
                alt="Owl Scholar"
                className="w-28 sm:w-36 h-28 sm:h-36 object-contain drop-shadow-[0_0_25px_rgba(99,102,241,0.6)]"
              />
              {isCasting && (
                <div className="absolute -right-8 top-1/2 -translate-y-1/2 flex items-center pointer-events-none">
                  <div className="w-24 sm:w-48 h-3 bg-gradient-to-r from-amber-400 via-indigo-300 to-transparent rounded-full blur-[1px] animate-pulse" />
                  <Zap className="w-8 h-8 text-amber-300 animate-spin -ml-2" />
                </div>
              )}
            </div>
            <div className="mt-1 px-3 py-0.5 rounded-full bg-indigo-900/60 border border-indigo-400/40 text-[11px] font-bold text-indigo-200">
              🦉 Scholar of Vieta
            </div>
          </div>

          {/* Center: Inscribed Arcane Equation */}
          <div className="col-span-4 flex flex-col items-center">
            <div className="relative px-5 py-3 rounded-2xl bg-black/80 border-2 border-indigo-500/50 shadow-[0_0_30px_rgba(99,102,241,0.35)] text-center">
              <span className="text-[10px] font-bold uppercase tracking-widest text-amber-300/90 block mb-1">
                Barrier Inscription
              </span>
              <div className="text-xl sm:text-2xl font-bold text-yellow-100 py-1">
                <InlineMath math={polynomialLatex} />
              </div>
              <div className="mt-1 text-[11px] text-indigo-300 font-mono">
                Roots: <span className="text-emerald-400 font-bold">$r_1, r_2$</span>
              </div>
            </div>
          </div>

          {/* Foe with Quadratic Forcefield Bubble (Right) */}
          <div className="col-span-4 flex flex-col items-center">
            <div className={`relative transition-all duration-300 ${isLayerShattering ? 'scale-90 opacity-70 animate-ping' : ''}`}>
              
              {/* Outer Forcefield Shield */}
              <div className={`absolute -inset-4 rounded-full border-2 transition-all duration-300 pointer-events-none ${
                isLayerShattering
                  ? 'border-red-400 bg-red-500/20 shadow-[0_0_40px_rgba(239,68,68,0.8)]'
                  : 'border-purple-400/80 bg-purple-600/20 shadow-[0_0_35px_rgba(168,85,247,0.5)] animate-pulse'
              }`} />

              {/* Foe Sprite or Emoji */}
              {foeSprite ? (
                <img
                  src={foeSprite}
                  alt={foe?.name || "Foe"}
                  className="w-28 sm:w-36 h-28 sm:h-36 object-contain drop-shadow-[0_0_20px_rgba(239,68,68,0.5)] relative z-10"
                />
              ) : (
                <div className="w-28 sm:w-36 h-28 sm:h-36 flex items-center justify-center text-6xl relative z-10 drop-shadow-[0_0_20px_rgba(239,68,68,0.5)]">
                  {foeEmoji}
                </div>
              )}

              {/* Layer Shatter Sparkles Overlay */}
              {isLayerShattering && (
                <div className="absolute inset-0 flex items-center justify-center z-20">
                  <span className="text-3xl font-black text-amber-300 drop-shadow-[0_0_20px_rgba(245,158,11,1)] animate-bounce">
                    CRACK! 💥
                  </span>
                </div>
              )}
            </div>

            <div className="mt-1 px-3 py-0.5 rounded-full bg-purple-900/60 border border-purple-400/40 text-[11px] font-bold text-purple-200">
              {foe?.name || "Enemy Guardian"}
            </div>
          </div>

        </div>

      </div>

      {/* BOTTOM SECTION: SCALES OF SUM & PRODUCT + PEDESTALS + RUNES */}
      <div className="relative z-10 bg-slate-900/90 backdrop-blur-xl border border-indigo-500/30 rounded-3xl p-3.5 sm:p-5 shadow-2xl space-y-4">
        
        {/* ROW 1: THE TWO VIETA SCALES (SUM & PRODUCT) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
          
          {/* SCALE 1: SUM OF ROOTS */}
          <div className={`p-3 rounded-2xl border transition-all duration-300 flex items-center justify-between ${
            isSumBalanced
              ? 'bg-emerald-950/40 border-emerald-500/60 shadow-[0_0_20px_rgba(16,185,129,0.25)]'
              : 'bg-black/40 border-indigo-500/20'
          }`}>
            <div className="flex items-center gap-3">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg ${
                isSumBalanced ? 'bg-emerald-500 text-black shadow-md' : 'bg-indigo-900/70 text-indigo-300'
              }`}>
                ➕
              </div>
              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-gray-300">
                  Scale of Sum ($r_1 + r_2$)
                </div>
                <div className="text-xs font-mono text-gray-400">
                  Target: <span className="font-bold text-emerald-400">{targetSum}</span>
                </div>
              </div>
            </div>

            <div className="text-right">
              <div className="text-base sm:text-lg font-mono font-black">
                {pedestal1 !== null && pedestal2 !== null ? (
                  <span>
                    {pedestal1} + {pedestal2} = <span className={isSumBalanced ? 'text-emerald-400' : 'text-amber-400'}>{currentSum}</span>
                  </span>
                ) : (
                  <span className="text-gray-500 italic text-sm">Place 2 stones</span>
                )}
              </div>
              <div className="text-[11px]">
                {isSumBalanced ? (
                  <span className="text-emerald-400 font-bold flex items-center justify-end gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Balanced!
                  </span>
                ) : currentSum !== null ? (
                  <span className="text-amber-400/80 font-mono">
                    Diff: {currentSum - targetSum > 0 ? `+${currentSum - targetSum}` : currentSum - targetSum}
                  </span>
                ) : (
                  <span className="text-gray-500">Unbalanced</span>
                )}
              </div>
            </div>
          </div>

          {/* SCALE 2: PRODUCT OF ROOTS */}
          <div className={`p-3 rounded-2xl border transition-all duration-300 flex items-center justify-between ${
            isProductBalanced
              ? 'bg-amber-950/40 border-amber-500/60 shadow-[0_0_20px_rgba(245,158,11,0.25)]'
              : 'bg-black/40 border-indigo-500/20'
          }`}>
            <div className="flex items-center gap-3">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg ${
                isProductBalanced ? 'bg-amber-400 text-black shadow-md' : 'bg-indigo-900/70 text-indigo-300'
              }`}>
                ✖️
              </div>
              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-gray-300">
                  Scale of Product ($r_1 \\times r_2$)
                </div>
                <div className="text-xs font-mono text-gray-400">
                  Target: <span className="font-bold text-amber-400">{targetProduct}</span>
                </div>
              </div>
            </div>

            <div className="text-right">
              <div className="text-base sm:text-lg font-mono font-black">
                {pedestal1 !== null && pedestal2 !== null ? (
                  <span>
                    {pedestal1} × {pedestal2} = <span className={isProductBalanced ? 'text-amber-300' : 'text-amber-400'}>{currentProduct}</span>
                  </span>
                ) : (
                  <span className="text-gray-500 italic text-sm">Place 2 stones</span>
                )}
              </div>
              <div className="text-[11px]">
                {isProductBalanced ? (
                  <span className="text-amber-300 font-bold flex items-center justify-end gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Balanced!
                  </span>
                ) : currentProduct !== null ? (
                  <span className="text-amber-400/80 font-mono">
                    Diff: {currentProduct - targetProduct > 0 ? `+${currentProduct - targetProduct}` : currentProduct - targetProduct}
                  </span>
                ) : (
                  <span className="text-gray-500">Unbalanced</span>
                )}
              </div>
            </div>
          </div>

        </div>

        {/* ROW 2: ROOT PEDESTALS + ACTION BUTTON */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1 border-t border-indigo-500/20">
          
          {/* The 2 Root Pedestals */}
          <div className="flex items-center gap-3 sm:gap-4 w-full sm:w-auto">
            
            {/* Pedestal 1 */}
            <div className="flex-1 sm:flex-none flex items-center gap-2">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Root 1:</span>
              <button
                type="button"
                onClick={() => setPedestal1(null)}
                className={`w-14 h-14 sm:w-16 sm:h-16 rounded-2xl flex flex-col items-center justify-center font-mono font-black text-xl transition-all ${
                  pedestal1 !== null
                    ? 'bg-gradient-to-br from-indigo-600 to-indigo-800 text-white border-2 border-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.5)] hover:scale-95'
                    : 'bg-black/60 border-2 border-dashed border-indigo-500/40 text-gray-600 hover:border-indigo-400'
                }`}
                title={pedestal1 !== null ? "Click to remove stone" : "Click a rune stone below to place"}
              >
                {pedestal1 !== null ? (
                  <>
                    <span>{pedestal1}</span>
                    <span className="text-[9px] font-sans text-amber-300">Tap to remove</span>
                  </>
                ) : (
                  <span className="text-xs text-gray-500">Empty</span>
                )}
              </button>
            </div>

            <span className="text-indigo-400 text-xl font-bold">&</span>

            {/* Pedestal 2 */}
            <div className="flex-1 sm:flex-none flex items-center gap-2">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Root 2:</span>
              <button
                type="button"
                onClick={() => setPedestal2(null)}
                className={`w-14 h-14 sm:w-16 sm:h-16 rounded-2xl flex flex-col items-center justify-center font-mono font-black text-xl transition-all ${
                  pedestal2 !== null
                    ? 'bg-gradient-to-br from-indigo-600 to-indigo-800 text-white border-2 border-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.5)] hover:scale-95'
                    : 'bg-black/60 border-2 border-dashed border-indigo-500/40 text-gray-600 hover:border-indigo-400'
                }`}
                title={pedestal2 !== null ? "Click to remove stone" : "Click a rune stone below to place"}
              >
                {pedestal2 !== null ? (
                  <>
                    <span>{pedestal2}</span>
                    <span className="text-[9px] font-sans text-amber-300">Tap to remove</span>
                  </>
                ) : (
                  <span className="text-xs text-gray-500">Empty</span>
                )}
              </button>
            </div>

            {(pedestal1 !== null || pedestal2 !== null) && (
              <button
                type="button"
                onClick={clearPedestals}
                className="p-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
                title="Clear Pedestals"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Action / Channel Button */}
          <div className="w-full sm:w-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowHint(!showHint)}
              className="p-2.5 rounded-xl bg-indigo-900/40 hover:bg-indigo-800/60 border border-indigo-500/30 text-indigo-300 transition-colors"
              title="Toggle Hint"
            >
              <HelpCircle className="w-5 h-5" />
            </button>

            <button
              type="button"
              disabled={!isBothBalanced || isCasting || isLayerShattering}
              onClick={handleShatterLayer}
              className={`flex-1 sm:flex-none px-6 py-3.5 rounded-2xl font-black text-sm tracking-wide uppercase transition-all duration-300 flex items-center justify-center gap-2 ${
                isBothBalanced && !isCasting && !isLayerShattering
                  ? 'bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-500 text-black shadow-[0_0_25px_rgba(245,158,11,0.7)] hover:scale-105 active:scale-95 cursor-pointer animate-pulse'
                  : 'bg-gray-800/80 text-gray-500 border border-gray-700/60 cursor-not-allowed'
              }`}
            >
              <Zap className="w-4 h-4" />
              {isCasting ? 'Channeling Mana...' : isBothBalanced ? 'Shatter Barrier Layer! ⚡' : 'Balance Both Scales'}
            </button>
          </div>

        </div>

        {/* HINT POPUP IF REQUESTED */}
        {showHint && (
          <div className="p-3 rounded-xl bg-indigo-950/70 border border-indigo-500/40 text-xs text-indigo-200 flex items-start justify-between">
            <div>
              <span className="font-bold text-amber-300 block mb-0.5">Scholar Hint:</span>
              <span>{currentRound.hint} For $x^2 + bx + c = 0$, the sum of roots is $-b$ and their product is $c$.</span>
            </div>
            <button onClick={() => setShowHint(false)} className="text-gray-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* ROW 3: MANA RUNES POOL */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-indigo-300 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              Mana Stone Sanctuary (Choose 2 Runes):
            </span>
            <span className="text-[11px] text-gray-400">
              Click a rune to place or remove
            </span>
          </div>

          <div className="flex flex-wrap gap-2 sm:gap-2.5">
            {stonePool.map((val) => {
              const used = isStoneUsed(val);
              return (
                <button
                  key={val}
                  type="button"
                  onClick={() => handleStoneClick(val)}
                  className={`w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center font-mono font-black text-lg transition-all transform active:scale-90 ${
                    used
                      ? 'bg-amber-400/20 text-amber-300 border-2 border-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.3)] scale-105'
                      : 'bg-slate-800 hover:bg-slate-700 text-white border border-slate-600 hover:border-indigo-400 hover:scale-105'
                  }`}
                >
                  {val > 0 ? `+${val}` : val}
                </button>
              );
            })}
          </div>
        </div>

      </div>

      {/* VICTORY MODAL (TEST MODE OR TRANSITION) */}
      {isVictory && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-gradient-to-b from-indigo-950 to-slate-950 border-2 border-amber-400/70 rounded-3xl p-6 text-center shadow-[0_0_50px_rgba(245,158,11,0.5)] space-y-4 animate-in fade-in zoom-in-95">
            <div className="w-16 h-16 rounded-full bg-amber-400/20 border-2 border-amber-400 flex items-center justify-center mx-auto text-3xl shadow-[0_0_20px_rgba(245,158,11,0.4)]">
              🏆
            </div>
            <div>
              <h3 className="text-xl font-black text-amber-300 tracking-wide uppercase">
                Arcane Barrier Shattered!
              </h3>
              <p className="text-sm text-gray-300 mt-1">
                You successfully solved all 3 polynomial seals using Vieta&apos;s sum and product properties!
              </p>
            </div>

            <div className="bg-black/60 rounded-xl p-3 border border-indigo-500/30 text-xs text-indigo-200">
              {isTestMode ? (
                <span>In real battle, the foe restores 100% HP and awakens into Phase 2 with a 25% faster question countdown!</span>
              ) : (
                <span>Phase 2 Transition commencing...</span>
              )}
            </div>

            {isTestMode && (
              <div className="flex gap-2 justify-center pt-2">
                <button
                  type="button"
                  onClick={handleResetTest}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs uppercase tracking-wider transition-colors flex items-center gap-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Test Again
                </button>
                {onCloseTest && (
                  <button
                    type="button"
                    onClick={onCloseTest}
                    className="px-4 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 font-bold text-xs uppercase tracking-wider transition-colors"
                  >
                    Close Test
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
