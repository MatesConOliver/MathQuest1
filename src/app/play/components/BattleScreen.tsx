"use client";

import { Character, FoeDoc, QuestionDoc, GameItem, InventoryItem, ContentBlock, SubArea } from "@/types/game";
import { BlockMath, InlineMath } from 'react-katex';
import React, { useState, useEffect } from "react";
import { User } from "firebase/auth";
import { CombatEffect } from "../hooks/useBattle";
import { SolutionModal } from "@/components/SolutionModal";

// RENDER HELPERS
const renderLegacyMixedText = (text: string | undefined): React.ReactNode => {
  if (!text) return null;
  if (!text.includes('$')) return text;
  const parts = text.split(/(\$.*?\$)/g);
  return (
    <>
      {parts.map((part, index) => {
        if (part.startsWith('$') && part.endsWith('$')) {
          const math = part.slice(1, -1);
          try {
            return (
              <span key={index} className="inline-block mx-1">
                <InlineMath math={math} />
              </span>
            );
          } catch {
            return <span key={index} className="text-red-400 font-mono">{part}</span>;
          }
        }
        return <span key={index}>{part}</span>;
      })}
    </>
  );
};

const renderStructuredContent = (blocks: ContentBlock[] | undefined, isBlock = false) => {
  if (!blocks) return null;
  const MathComponent = isBlock ? BlockMath : InlineMath;
  return (
    <>
      {blocks.map((block, index) => {
        switch (block.type) {
          case 'text':
            return <span key={index}>{block.value}</span>;
          case 'latex':
            try {
              return (
                <span key={index} className="inline-block mx-1">
                  <MathComponent math={block.value} />
                </span>
              );
            } catch {
              return <span key={index} className="text-red-400 font-mono">{`$${block.value}$`}</span>;
            }
          case 'image':
            return (
              <img
                key={index}
                src={block.value}
                alt="Question diagram"
                className="my-2 rounded-xl max-h-56 max-w-full object-contain mx-auto bg-black/40 border border-white/20 p-1 block shadow-lg"
              />
            );
          default:
            return null;
        }
      })}
    </>
  );
};

const getChoiceImage = (question: QuestionDoc, idx: number): string | null => {
  if (question.choicesContent && question.choicesContent[idx]) {
    const imgBlock = question.choicesContent[idx].content.find((b) => b.type === 'image');
    if (imgBlock) return imgBlock.value;
  }
  if (question.choices && question.choices[idx]) {
    const raw = question.choices[idx];
    const match = raw.match(/!\[.*?\]\((.*?)\)/);
    if (match) return match[1];
  }
  return null;
};

const getChoiceTextOnly = (question: QuestionDoc, idx: number): React.ReactNode => {
  if (question.choicesContent && question.choicesContent[idx]) {
    const textBlocks = question.choicesContent[idx].content.filter((b) => b.type !== 'image');
    if (textBlocks.length > 0) return renderStructuredContent(textBlocks);
  }
  if (question.choices && question.choices[idx]) {
    const raw = question.choices[idx].replace(/!\[.*?\]\(.*?\)/g, '').trim();
    if (raw) return renderLegacyMixedText(raw);
  }
  return null;
};

const renderChoiceContent = (question: QuestionDoc, idx: number): React.ReactNode => {
  if (question.choicesContent && question.choicesContent[idx]) {
    return renderStructuredContent(question.choicesContent[idx].content);
  }
  if (question.choices && question.choices[idx]) {
    const text = question.choices[idx];
    if (question.choiceType === 'latex') {
      try {
        return <InlineMath math={text} />;
      } catch {
        return <span className="font-mono text-red-300">{text}</span>;
      }
    }
    return renderLegacyMixedText(text);
  }
  return <span className="text-gray-400 italic">Option {String.fromCharCode(65 + idx)}</span>;
};

function getEmbeddableVideoUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes('youtube.com')) {
      const v = parsed.searchParams.get('v');
      if (v) return `https://www.youtube-nocookie.com/embed/${v}`;
    }
    if (parsed.hostname.includes('youtu.be')) {
      const v = parsed.pathname.slice(1);
      if (v) return `https://www.youtube-nocookie.com/embed/${v}`;
    }
    if (parsed.hostname.includes('vimeo.com')) {
      const id = parsed.pathname.split('/').pop();
      if (id) return `https://player.vimeo.com/video/${id}`;
    }
    return null;
  } catch {
    return null;
  }
}

// PROP TYPES
interface BattleScreenProps {
  character: Character | null;
  foe: FoeDoc | null;
  currentQuestion: QuestionDoc | null;
  currentQIndex: number;
  totalQuestions: number;
  playerHp: number;
  playerMaxHp: number;
  foeHp: number;
  msg: string;
  timeLeft: number;
  totalTime: number;
  isPaused: boolean;
  isEscaping: boolean;
  selectedChoice: number | null;
  gameItems: Record<string, GameItem>;
  inventory: InventoryItem[];
  showInventory: boolean;
  setShowInventory: (show: boolean) => void;
  showEscapeConfirm: boolean;
  setShowEscapeConfirm: (show: boolean) => void;
  showSubquestionMenu: boolean;
  abandonGroupTurnCost: number;
  handleAnswer: (choiceIndex: number) => void;
  nextQuestion: () => void;
  continueSubquestion: () => void;
  abandonGroup: () => void;
  skipQuestion: () => void;
  executeEscape: () => void;
  usePotion: (item: InventoryItem) => void;
  subArea: SubArea | null;
  locationOrder?: number | null;
  locationName?: string;
  combatEffect?: CombatEffect | null;
  user?: User | null;
}

// CIRCULAR RING TIMER COMPONENT
function CircularTimer({ timeLeft, totalTime }: { timeLeft: number; totalTime: number }) {
  const radius = 22;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.max(0, Math.min(1, timeLeft / (totalTime || 30)));
  const strokeDashoffset = circumference - progress * circumference;

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const timeStr = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  const isLowTime = timeLeft <= 10;

  // Green down to 50%, then same orange-yellow color as health bars, then pulsing red
  const timerStroke = progress > 0.5
    ? 'stroke-green-500'
    : progress > 0.2 && !isLowTime
    ? 'stroke-yellow-400'
    : 'stroke-red-500 animate-pulse';

  const timerText = progress > 0.5
    ? 'text-green-400'
    : progress > 0.2 && !isLowTime
    ? 'text-yellow-300'
    : 'text-red-400 animate-pulse';

  return (
    <div className="flex items-center gap-2.5 bg-black/80 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-white/20 shadow-xl">
      <div className="relative w-12 h-12 flex items-center justify-center">
        <svg className="w-12 h-12 -rotate-90">
          <circle
            cx="24"
            cy="24"
            r={radius}
            className="stroke-gray-800"
            strokeWidth="3.5"
            fill="transparent"
          />
          <circle
            cx="24"
            cy="24"
            r={radius}
            className={`transition-all duration-1000 ease-linear ${timerStroke}`}
            strokeWidth="3.5"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            fill="transparent"
          />
        </svg>
        <span className={`absolute font-mono text-[10px] font-black ${timerText}`}>
          {timeStr}
        </span>
      </div>
      <div className="text-[10px] uppercase font-black tracking-wider text-gray-300 leading-tight">
        Time<br /><span className="text-gray-400 font-semibold">Limit</span>
      </div>
    </div>
  );
}

// STATUS PLATE COMPONENT (POKEMON-STYLE)
function StatusPlate({
  name,
  hp,
  maxHp,
  isFoe = false,
  level,
}: {
  name: string;
  hp: number;
  maxHp: number;
  isFoe?: boolean;
  level?: number;
}) {
  const percent = Math.max(0, Math.min(100, (hp / (maxHp || 1)) * 100));
  const hpColor = percent > 50 ? 'bg-green-500' : percent > 20 ? 'bg-yellow-500' : 'bg-red-500 animate-pulse';

  return (
    <div className={`p-2.5 sm:p-3 rounded-2xl bg-black/80 backdrop-blur-md border ${
      isFoe ? 'border-red-500/50 shadow-[0_0_20px_rgba(239,68,68,0.25)]' : 'border-blue-500/50 shadow-[0_0_20px_rgba(59,130,246,0.25)]'
    } w-52 sm:w-64 text-white shadow-xl`}>
      <div className="flex justify-between items-baseline mb-1">
        <span className="font-black text-xs sm:text-sm truncate max-w-[150px]">{name}</span>
        {level && <span className="text-[10px] font-bold text-yellow-400 font-mono">Lv.{level}</span>}
      </div>
      
      <div className="flex items-center gap-1.5">
        <span className="text-[9px] font-black text-yellow-400 uppercase tracking-tighter">HP</span>
        <div className="flex-1 h-2.5 bg-gray-900 rounded-full border border-white/20 overflow-hidden p-0.5">
          <div
            className={`h-full rounded-full transition-all duration-500 ${hpColor}`}
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      <div className="text-right text-[10px] font-mono text-gray-300 font-bold mt-0.5">
        {hp} / {maxHp}
      </div>
    </div>
  );
}

// MAIN BATTLE SCREEN COMPONENT
export function BattleScreen(props: BattleScreenProps) {
  const {
    character, foe, currentQuestion, currentQIndex, totalQuestions, playerHp, playerMaxHp, foeHp, msg, timeLeft, totalTime,
    isPaused, selectedChoice, gameItems, inventory, showInventory, setShowInventory, showEscapeConfirm,
    setShowEscapeConfirm, showSubquestionMenu, abandonGroupTurnCost, handleAnswer, nextQuestion, continueSubquestion, abandonGroup,
    skipQuestion, executeEscape, usePotion, subArea, locationOrder, locationName, combatEffect, user
  } = props;

  const [showAnswers, setShowAnswers] = useState(false);
  const [showSolutionModal, setShowSolutionModal] = useState(false);
  const currentQ = currentQuestion;

  useEffect(() => {
    setShowAnswers(false);
    setShowSolutionModal(false);
  }, [currentQIndex]);

  if (!currentQ) {
    return (
      <div className="w-full h-screen flex items-center justify-center font-bold text-gray-400 animate-pulse bg-gray-950">
        Preparing Encounter...
      </div>
    );
  }

  // Equipped main hand weapon for attack animation
  const mainHandEquippedId = character?.equipment?.mainHand;
  const mainHandInstance = mainHandEquippedId ? inventory.find(i => i.instanceId === mainHandEquippedId) : null;
  const mainHandWeapon = mainHandInstance ? gameItems[mainHandInstance.itemId] : null;

  // Background styling with dynamic fallback
  const bgStyle: React.CSSProperties = subArea?.imageUrl
    ? { backgroundImage: `url(${subArea.imageUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : {
        background: 'radial-gradient(ellipse at 50% 35%, #1e1b4b 0%, #0f172a 55%, #020617 100%)',
      };

  return (
    <main style={bgStyle} className="h-screen w-screen bg-cover bg-center font-sans text-white relative flex flex-col justify-between overflow-hidden select-none">
      
      {/* 1. TOP HUD (Pokemon Style Status Plates + Center Ring Timer) */}
      <header className="relative z-20 shrink-0 p-3 sm:p-4 flex items-start justify-between gap-2 pr-14">
        {/* Player Status Plate */}
        <StatusPlate
          name={character?.name || "Player"}
          hp={playerHp}
          maxHp={playerMaxHp}
          level={character?.level || 1}
        />

        {/* Center: Turn Indicator & Circular Ring Timer */}
        <div className="flex flex-col sm:flex-row items-center gap-2">
          <div className="bg-black/80 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/20 shadow-xl text-center">
            <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Turn </span>
            <span className="text-sm font-black text-white">{currentQIndex + 1}</span>
            <span className="text-xs text-gray-400 font-bold"> / {totalQuestions}</span>
          </div>
          <CircularTimer timeLeft={timeLeft} totalTime={totalTime} />
        </div>

        {/* Enemy Status Plate */}
        <StatusPlate
          name={foe?.name || "Enemy"}
          hp={foeHp}
          maxHp={foe?.maxHp || 50}
          isFoe
        />
      </header>

      {/* 2. BATTLE STAGE (GROUND PEDESTALS & SPRITES - DYNAMICALLY OCCUPIES THE ARENA) */}
      <div className="flex-1 relative w-full pointer-events-none z-10 min-h-0 overflow-hidden">
        
        {/* Foe Unit & Shadow (Upper Right Stage) */}
        {foe?.imageUrl && (
          <div className="absolute top-[8%] sm:top-[10%] right-[8%] sm:right-[14%] flex flex-col items-center">
            {/* Foe Sprite with Hit & Lunge Reactions */}
            <div className={`relative transition-transform duration-300 ${
              combatEffect?.target === 'foe' ? 'animate-sprite-hit' : combatEffect?.target === 'player' ? 'animate-foe-lunge' : ''
            }`}>
              <img
                src={foe.imageUrl}
                alt="Foe"
                className="w-[min(19rem,32vw)] h-[min(19rem,28vh)] object-contain object-bottom drop-shadow-[0_12px_24px_rgba(0,0,0,0.8)]"
              />
              {/* Floating Damage Text over Foe */}
              {combatEffect?.target === 'foe' && (
                <div
                  key={combatEffect.id}
                  className="animate-damage-float absolute -top-8 left-1/2 -translate-x-1/2 font-extrabold text-base sm:text-lg text-yellow-300 bg-black/80 px-3 py-1 rounded-full border border-yellow-400/40 shadow-[0_4px_16px_rgba(234,179,8,0.45)] whitespace-nowrap z-30 font-mono flex items-center gap-1.5"
                >
                  <span className="text-sm">⚔️</span>
                  <span>-{combatEffect.amount} HP</span>
                </div>
              )}
            </div>

            {/* Dark Magical Shadow Pedestal Beneath Foe */}
            <div className="w-40 sm:w-56 h-6 sm:h-7 -mt-2 bg-black/60 rounded-[100%] blur-[2px] shadow-[0_0_20px_rgba(239,68,68,0.45)] border border-red-500/30" />
          </div>
        )}

        {/* Weapon Strike Slash Effect over Foe */}
        {combatEffect?.target === 'foe' && (
          <div className="animate-weapon-slash absolute top-[16%] sm:top-[18%] right-[16%] sm:right-[20%] pointer-events-none z-30 flex items-center justify-center">
            {mainHandWeapon?.imageUrl ? (
              <img
                src={mainHandWeapon.imageUrl}
                alt={mainHandWeapon.name}
                className="w-20 h-20 sm:w-24 sm:h-24 drop-shadow-[0_0_20px_rgba(255,255,255,1)] object-contain"
              />
            ) : (
              <span className="text-6xl sm:text-7xl drop-shadow-[0_0_25px_rgba(255,255,255,1)]">⚔️</span>
            )}
          </div>
        )}

        {/* Player Owl Unit & Shadow (Lower Left Stage - resting right on ground above footer) */}
        <div className="absolute bottom-[4%] sm:bottom-[6%] left-[6%] sm:left-[12%] flex flex-col items-center">
          {/* Player Sprite with Hit & Lunge Reactions */}
          <div className={`relative transition-transform duration-300 ${
            combatEffect?.target === 'player' ? 'animate-sprite-hit' : combatEffect?.target === 'foe' ? 'animate-player-lunge' : ''
          }`}>
            <img
              src={character?.imageUrl || "https://firebasestorage.googleapis.com/v0/b/pokematicos.firebasestorage.app/o/The_Primordial_Equation_Owl_Sprites%2Fowl%20back.png?alt=media&token=bae93c5e-92ed-4958-9274-fb67a3f5f8c9"}
              alt="Character"
              className="w-[min(19rem,32vw)] h-[min(19rem,28vh)] object-contain object-bottom drop-shadow-[0_12px_24px_rgba(0,0,0,0.8)]"
            />
            {/* Floating Damage Text over Player */}
            {combatEffect?.target === 'player' && (
              <div
                key={combatEffect.id}
                className="animate-damage-float absolute -top-8 left-1/2 -translate-x-1/2 font-extrabold text-base sm:text-lg text-red-400 bg-black/80 px-3 py-1 rounded-full border border-red-500/40 shadow-[0_4px_16px_rgba(239,68,68,0.45)] whitespace-nowrap z-30 font-mono flex items-center gap-1.5"
              >
                <span className="text-sm">💥</span>
                <span>-{combatEffect.amount} HP</span>
              </div>
            )}
          </div>

          {/* Dark Magical Shadow Pedestal Beneath Player */}
          <div className="w-40 sm:w-56 h-6 sm:h-7 -mt-2 bg-black/60 rounded-[100%] blur-[2px] shadow-[0_0_20px_rgba(59,130,246,0.45)] border border-blue-500/30" />
        </div>
      </div>

      {/* 3. BOTTOM GRIMOIRE CONSOLE (PROBLEM PANEL + ACTION / CHOICES CONSOLE) */}
      <footer className="relative z-20 shrink-0 p-2.5 sm:p-3.5 bg-gradient-to-t from-black via-black/95 to-black/80 backdrop-blur-xl border-t-2 border-white/20 shadow-2xl">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-12 gap-2.5 sm:gap-3 items-stretch">
          
          {/* LEFT: THE MATH PROBLEM CARD (Fixed 5 columns on desktop, constant bounds) */}
          <div className="md:col-span-5 bg-gray-900/85 rounded-2xl p-3.5 sm:p-4 border border-white/15 shadow-inner flex flex-col justify-center min-h-[140px] sm:min-h-[160px] max-h-[38vh] sm:max-h-[44vh] overflow-hidden">
            <div className="overflow-y-auto pr-2 space-y-2.5 custom-scrollbar max-h-full">
              {/* The Actual Question Content */}
              <div className="leading-relaxed text-sm sm:text-base font-serif text-gray-100">
                {currentQ.promptContent ? (
                  renderStructuredContent(currentQ.promptContent, true)
                ) : currentQ.promptType === 'latex' ? (
                  <div className="overflow-x-auto py-1">
                    <BlockMath math={currentQ.promptLatex || ''} />
                  </div>
                ) : currentQ.promptType === 'image' && currentQ.promptImageUrl ? (
                  <img
                    src={currentQ.promptImageUrl}
                    alt="Question"
                    className="max-h-40 sm:max-h-48 rounded-xl border border-white/20 mx-auto bg-black/40 p-1 block shadow-md"
                  />
                ) : (
                  <div>{renderLegacyMixedText(currentQ.promptText)}</div>
                )}
              </div>
            </div>
          </div>

          {/* RIGHT: COMMAND & CHOICE CONSOLE (Fixed 7 columns on desktop, stable container) */}
          <div className="md:col-span-7 flex flex-col justify-center min-h-[140px] sm:min-h-[160px] max-h-[38vh] sm:max-h-[44vh]">
            <div className="bg-gray-900/90 rounded-2xl p-2.5 sm:p-3 border border-white/20 shadow-xl flex flex-col h-full min-h-[140px] sm:min-h-[160px] max-h-[38vh] sm:max-h-[44vh] overflow-hidden">
              
              {/* MODE 1: POKEMON COMMAND MENU (FIGHT / BAG / SKIP / RUN) */}
              {!showAnswers && !isPaused && (
                <div className="flex flex-col h-full justify-between gap-2">
                  <div className="shrink-0 flex justify-between items-center pb-1 border-b border-gray-800">
                    <span className="text-xs font-black text-yellow-400 uppercase tracking-wider">Battle Commands:</span>
                    <span className="text-[10px] text-gray-400 font-bold">Choose action</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:gap-2.5 flex-1 items-stretch">
                    {/* 1. FIGHT / ANSWER (Primary yellow button) */}
                    <button
                      onClick={() => setShowAnswers(true)}
                      className="bg-yellow-400 hover:bg-yellow-300 text-gray-950 font-black py-2.5 sm:py-3 px-3 rounded-xl shadow-lg border-2 border-yellow-200 transition-transform hover:scale-[1.01] active:scale-95 flex flex-col items-center justify-center gap-0.5"
                    >
                      <span className="text-xl sm:text-2xl">⚔️</span>
                      <span className="text-xs sm:text-sm tracking-wider uppercase font-black">Answer</span>
                      <span className="text-[10px] text-gray-800 font-semibold">Choose Option</span>
                    </button>

                    {/* 2. BAG / OBJECTS */}
                    <button
                      onClick={() => setShowInventory(true)}
                      className="bg-slate-800 hover:bg-slate-700 text-white font-bold py-2.5 sm:py-3 px-3 rounded-xl shadow-md border border-slate-600 transition-transform hover:scale-[1.01] active:scale-95 flex flex-col items-center justify-center gap-0.5"
                    >
                      <span className="text-xl sm:text-2xl">🎒</span>
                      <span className="text-xs sm:text-sm tracking-wider uppercase font-bold">Objects</span>
                      <span className="text-[10px] text-gray-400 font-normal">Gear & Items</span>
                    </button>

                    {/* 3. SKIP TURN */}
                    <button
                      onClick={skipQuestion}
                      className="bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white font-bold py-2 px-3 rounded-xl shadow border border-gray-700 transition-transform hover:scale-[1.01] active:scale-95 flex items-center justify-center gap-1.5 text-xs"
                    >
                      <span>⏭</span> Skip Turn
                    </button>

                    {/* 4. FLEE / RUN */}
                    <button
                      onClick={() => setShowEscapeConfirm(true)}
                      className="bg-red-950/80 hover:bg-red-900 text-red-200 font-bold py-2 px-3 rounded-xl shadow border border-red-800/60 transition-transform hover:scale-[1.01] active:scale-95 flex items-center justify-center gap-1.5 text-xs"
                    >
                      <span>🏃</span> Retreat
                    </button>
                  </div>
                </div>
              )}

              {/* MODE 2: MULTIPLE CHOICE OPTIONS (A, B, C, D) - CRISP, FRAMED IMAGES & READABLE MATH */}
              {showAnswers && !isPaused && (
                <div className="flex flex-col h-full overflow-hidden">
                  <div className="shrink-0 flex justify-between items-center mb-1.5 pb-1 border-b border-gray-800">
                    <span className="text-xs font-black text-yellow-400 uppercase tracking-wider">Select Option:</span>
                    <button
                      onClick={() => setShowAnswers(false)}
                      className="bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white text-xs font-bold py-1 px-3 rounded-lg border border-gray-700 transition-colors flex items-center gap-1 active:scale-95"
                    >
                      <span>⏎</span> Back to Menu
                    </button>
                  </div>

                  <div className="flex-1 min-h-0 overflow-y-auto pr-1 custom-scrollbar">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {(currentQ.choicesContent || currentQ.choices || []).map((_: any, idx: number) => {
                        const optionLetter = String.fromCharCode(65 + idx); // A, B, C, D
                        const choiceImgUrl = getChoiceImage(currentQ, idx);
                        const choiceText = getChoiceTextOnly(currentQ, idx);

                        if (choiceImgUrl) {
                          return (
                            <button
                              key={idx}
                              onClick={() => handleAnswer(idx)}
                              className="relative flex flex-col items-center justify-center p-2 rounded-xl bg-gray-800/90 border border-white/20 hover:border-yellow-400 hover:ring-2 hover:ring-yellow-400/40 shadow-md transition-all active:scale-95 group overflow-hidden min-h-[110px] max-h-[135px]"
                            >
                              <span className="absolute top-2 left-2 w-6 h-6 rounded-md bg-black/90 text-yellow-300 font-black text-xs flex items-center justify-center border border-white/20 z-10 shadow">
                                {optionLetter}
                              </span>
                              <div className="w-full flex-1 flex items-center justify-center p-1 bg-white rounded-lg overflow-hidden shadow-inner my-auto">
                                <img
                                  src={choiceImgUrl}
                                  alt={`Option ${optionLetter}`}
                                  className="max-h-20 sm:max-h-24 max-w-full object-contain pointer-events-none"
                                />
                              </div>
                              {choiceText && (
                                <div className="text-[11px] font-semibold text-gray-200 mt-1 truncate max-w-full">
                                  {choiceText}
                                </div>
                              )}
                            </button>
                          );
                        }

                        return (
                          <button
                            key={idx}
                            onClick={() => handleAnswer(idx)}
                            className="bg-gray-800/95 hover:bg-yellow-400 text-white hover:text-gray-950 font-bold p-3 rounded-xl border border-white/20 hover:border-yellow-200 shadow-md transition-all hover:scale-[1.01] active:scale-95 text-xs sm:text-sm flex items-center gap-3 text-left justify-start group min-h-[56px]"
                          >
                            <span className="w-7 h-7 rounded-lg bg-black/80 text-yellow-400 group-hover:bg-black group-hover:text-yellow-300 font-black text-xs flex items-center justify-center shrink-0 border border-white/20">
                              {optionLetter}
                            </span>
                            <div className="flex-1 font-semibold overflow-x-auto py-0.5 break-words leading-snug">
                              {renderChoiceContent(currentQ, idx)}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* MODE 3: POST-ANSWER REVIEW CONSOLE (EXACTLY ONE LIGHTBULB, HIGHLIGHTED CHOICES, PINNED NON-OVERLAPPING FOOTER) */}
              {isPaused && (
                <div className="flex flex-col h-full overflow-hidden">
                  {/* Outcome Header with Ask for Explanation Button */}
                  <div className="shrink-0 flex justify-end items-center pb-2 border-b border-gray-800">
                    {/* SINGLE EXPLANATION BUTTON */}
                    <button
                      onClick={() => setShowSolutionModal(true)}
                      className="px-3.5 py-1.5 bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-700 hover:from-indigo-500 hover:to-purple-500 text-white font-black text-xs rounded-xl shadow-lg transition-transform hover:scale-105 active:scale-95 flex items-center gap-1.5 border border-indigo-400/40"
                    >
                      <span>💡</span>
                      <span>Ask for Explanation</span>
                    </button>
                  </div>

                  {/* Choices in Review State: Scrollable middle area */}
                  <div className="flex-1 min-h-0 overflow-y-auto pr-1 custom-scrollbar my-2">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {(currentQ.choicesContent || currentQ.choices || []).map((_: any, idx: number) => {
                        const optionLetter = String.fromCharCode(65 + idx);
                        const isCorrectOption = idx === currentQ.correctIndex;
                        const isSelectedOption = idx === selectedChoice;
                        const choiceImgUrl = getChoiceImage(currentQ, idx);
                        const choiceText = getChoiceTextOnly(currentQ, idx);

                        if (choiceImgUrl) {
                          return (
                            <div
                              key={idx}
                              className={`relative flex flex-col items-center justify-center p-2 rounded-xl transition-all overflow-hidden min-h-[110px] max-h-[135px] ${
                                isCorrectOption
                                  ? 'bg-emerald-950/80 border-2 border-emerald-400 ring-2 ring-emerald-400/40 shadow-[0_0_15px_rgba(52,211,153,0.35)]'
                                  : isSelectedOption
                                  ? 'bg-red-950/80 border-2 border-red-500 ring-2 ring-red-500/40 shadow-[0_0_15px_rgba(239,68,68,0.35)]'
                                  : 'bg-black/50 border border-gray-800 opacity-60'
                              }`}
                            >
                              <span className="absolute top-2 left-2 w-6 h-6 rounded-md bg-black text-white font-black text-xs flex items-center justify-center shrink-0 z-10 shadow">
                                {optionLetter}
                              </span>
                              {isCorrectOption && (
                                <span className="absolute top-2 right-2 px-2 py-0.5 rounded bg-emerald-500 text-black text-[10px] font-black uppercase shadow z-10">
                                  ✓ Correct
                                </span>
                              )}
                              {isSelectedOption && !isCorrectOption && (
                                <span className="absolute top-2 right-2 px-2 py-0.5 rounded bg-red-500 text-white text-[10px] font-black uppercase shadow z-10">
                                  ✗ Your Pick
                                </span>
                              )}
                              <div className="w-full flex-1 flex items-center justify-center p-1 bg-white rounded-lg overflow-hidden shadow-inner my-auto">
                                <img
                                  src={choiceImgUrl}
                                  alt={`Option ${optionLetter}`}
                                  className="max-h-20 sm:max-h-24 max-w-full object-contain pointer-events-none"
                                />
                              </div>
                              {choiceText && (
                                <div className="text-[11px] font-semibold text-gray-200 mt-1 truncate max-w-full">
                                  {choiceText}
                                </div>
                              )}
                            </div>
                          );
                        }

                        return (
                          <div
                            key={idx}
                            className={`p-2.5 rounded-xl flex items-center gap-2.5 text-xs sm:text-sm min-h-[50px] transition-all ${
                              isCorrectOption
                                ? 'bg-emerald-950/90 border-2 border-emerald-400 text-emerald-100 shadow-[0_0_15px_rgba(52,211,153,0.35)]'
                                : isSelectedOption
                                ? 'bg-red-950/90 border-2 border-red-500 text-red-100 shadow-[0_0_15px_rgba(239,68,68,0.35)]'
                                : 'bg-black/40 border border-gray-800 text-gray-400 opacity-60'
                            }`}
                          >
                            <span className="w-6 h-6 rounded-md bg-black text-white font-black text-xs flex items-center justify-center shrink-0">
                              {optionLetter}
                            </span>
                            <div className="flex-1 overflow-x-auto py-0.5 break-words font-medium leading-snug">
                              {renderChoiceContent(currentQ, idx)}
                            </div>
                            {isCorrectOption && (
                              <span className="text-[10px] font-black uppercase text-emerald-400 bg-emerald-900/60 px-2 py-0.5 rounded border border-emerald-500/40 shrink-0">
                                ✓ Correct
                              </span>
                            )}
                            {isSelectedOption && !isCorrectOption && (
                              <span className="text-[10px] font-black uppercase text-red-400 bg-red-900/60 px-2 py-0.5 rounded border border-red-500/40 shrink-0">
                                ✗ Your Pick
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Bottom Action Button: Pinned to bottom, NEVER overlaps choices */}
                  <div className="shrink-0 pt-2 border-t border-gray-800">
                    {showSubquestionMenu ? (
                      <div className="flex gap-2 w-full">
                        <button
                          onClick={continueSubquestion}
                          className="flex-1 bg-yellow-400 hover:bg-yellow-300 text-black font-black py-2.5 px-3 rounded-xl text-xs transition-all active:scale-95 shadow"
                        >
                          Continue to Next Part ➡️
                        </button>
                        <button
                          onClick={abandonGroup}
                          className="bg-red-900 hover:bg-red-800 text-white font-bold py-2.5 px-3 rounded-xl text-xs transition-all active:scale-95 shadow"
                        >
                          Abandon Exercise (-{abandonGroupTurnCost} Turns)
                        </button>
                      </div>
                    ) : foeHp <= 0 ? (
                      <button
                        onClick={nextQuestion}
                        className="w-full bg-gradient-to-r from-yellow-400 via-amber-400 to-yellow-500 hover:from-yellow-300 hover:to-amber-300 text-black font-black py-3 px-4 rounded-xl shadow-xl text-sm sm:text-base tracking-wider uppercase transition-all hover:scale-[1.01] active:scale-95 flex items-center justify-center gap-2"
                      >
                        <span>🏆 Claim Victory!</span>
                        <span className="text-xl">🎉</span>
                      </button>
                    ) : playerHp <= 0 ? (
                      <button
                        onClick={nextQuestion}
                        className="w-full bg-red-700 hover:bg-red-600 text-white font-black py-3 px-4 rounded-xl shadow-xl text-sm sm:text-base tracking-wider uppercase transition-all hover:scale-[1.01] active:scale-95 flex items-center justify-center gap-2"
                      >
                        <span>💀 You Have Fallen... Continue</span>
                        <span className="text-xl">➡️</span>
                      </button>
                    ) : (
                      <button
                        onClick={nextQuestion}
                        className="w-full bg-yellow-400 hover:bg-yellow-300 text-black font-black py-3 px-4 rounded-xl shadow-xl text-sm sm:text-base tracking-wider uppercase transition-all hover:scale-[1.01] active:scale-95 flex items-center justify-center gap-2"
                      >
                        <span>Next Question</span>
                        <span className="text-xl">➡️</span>
                      </button>
                    )}
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>
      </footer>

      {/* 4. MODALS (OBJECTS, ESCAPE, SOLUTION) */}
      {showInventory && (
        <ObjectsModal
          character={character}
          inventory={inventory}
          gameItems={gameItems}
          playerHp={playerHp}
          playerMaxHp={playerMaxHp}
          onUse={usePotion}
          onClose={() => setShowInventory(false)}
        />
      )}

      {showEscapeConfirm && (
        <EscapeConfirm
          onConfirm={executeEscape}
          onCancel={() => setShowEscapeConfirm(false)}
        />
      )}

      {showSolutionModal && (
        <SolutionModal
          question={currentQ}
          selectedChoice={selectedChoice}
          user={user || null}
          character={character}
          subArea={subArea}
          locationOrder={locationOrder ?? subArea?.order ?? null}
          onClose={() => setShowSolutionModal(false)}
        />
      )}
    </main>
  );
}

// Durability Bar for Battle Screen (follows Health Bar color palette & logic)
function BattleDurabilityBar({ current, max }: { current: number; max: number }) {
  const safeMax = max > 0 ? max : 1;
  const pct = Math.max(0, Math.min(100, (current / safeMax) * 100));
  const isBroken = current <= 0;

  // Exact health bar palette: >50% green, 20-50% orange/yellow, <=20% red/pulsing, 0% dark red
  let colorClass = "bg-green-500";
  if (pct <= 50) colorClass = "bg-yellow-500";
  if (pct <= 20) colorClass = "bg-red-500 animate-pulse";
  if (isBroken) colorClass = "bg-red-700";

  return (
    <div className="w-full space-y-0.5">
      <div className="flex justify-between items-center text-[9px] font-bold">
        <span className="text-gray-400 uppercase tracking-tighter">Durability</span>
        <span className={isBroken ? "text-red-400 font-black animate-pulse" : "text-gray-300 font-mono"}>
          {current}/{max} {isBroken ? "• BROKEN" : ""}
        </span>
      </div>
      <div className="w-full h-1.5 bg-gray-950 rounded-full overflow-hidden border border-white/10">
        <div 
          className={`h-full ${colorClass} transition-all duration-300`} 
          style={{ width: `${pct}%` }} 
        />
      </div>
    </div>
  );
}

// OBJECTS MODAL: EQUIPPED GEAR (LEFT) + CONSUMABLES & OTHER ITEMS (RIGHT)
function ObjectsModal({
  character,
  inventory,
  gameItems,
  playerHp,
  playerMaxHp,
  onUse,
  onClose,
}: {
  character: Character | null;
  inventory: InventoryItem[];
  gameItems: Record<string, GameItem>;
  playerHp: number;
  playerMaxHp: number;
  onUse: (item: InventoryItem) => void;
  onClose: () => void;
}) {
  const equipSlots: Array<{ key: 'mainHand' | 'offHand' | 'armor' | 'head'; label: string; icon: string }> = [
    { key: 'mainHand', label: 'Main Hand', icon: '⚔️' },
    { key: 'offHand', label: 'Off Hand', icon: '🛡️' },
    { key: 'armor', label: 'Armor', icon: '🥋' },
    { key: 'head', label: 'Head', icon: '👑' },
  ];

  // Helper: detect consumable potions / food
  const isConsumable = (def?: GameItem) => {
    if (!def) return false;
    return def.type === 'potion' || !!def.stats?.heal || def.name.toLowerCase().includes('potion');
  };

  // Consumables in backpack (not equipped)
  const consumableInstances = inventory.filter((item) => {
    const isEquipped = Object.values(character?.equipment || {}).includes(item.instanceId);
    if (isEquipped) return false;
    const def = gameItems[item.itemId];
    return isConsumable(def);
  });

  const groupedConsumables = consumableInstances.reduce(
    (acc: Record<string, { item: InventoryItem; quantity: number }>, currentItem) => {
      if (!acc[currentItem.itemId]) {
        acc[currentItem.itemId] = { item: currentItem, quantity: 0 };
      }
      acc[currentItem.itemId].quantity++;
      return acc;
    },
    {}
  );
  const displayConsumables = Object.values(groupedConsumables);

  // Other items (passives, charms, collectibles in backpack)
  const otherItems = inventory.filter((item) => {
    const isEquipped = Object.values(character?.equipment || {}).includes(item.instanceId);
    if (isEquipped) return false;
    const def = gameItems[item.itemId];
    return def && !isConsumable(def);
  });

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center z-50 p-3 sm:p-5 animate-in fade-in duration-150">
      <div className="bg-gray-900 border-2 border-white/20 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl text-white overflow-hidden">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-gray-800 flex justify-between items-center bg-gray-800/40">
          <div>
            <h2 className="text-xl sm:text-2xl font-black flex items-center gap-2">
              <span>🎒</span> Objects & Equipment
            </h2>
            <p className="text-[11px] text-gray-400">
              Equipped gear is fixed during battle. Use potions and consumables from your bag.
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white flex items-center justify-center font-bold transition-colors"
          >
            ✕
          </button>
        </div>

        {/* 2-Column Content */}
        <div className="p-4 sm:p-5 overflow-y-auto custom-scrollbar flex-1 grid grid-cols-1 md:grid-cols-2 gap-5 min-h-0">
          
          {/* LEFT COLUMN: EQUIPPED GEAR (FIXED DURING BATTLE) */}
          <div className="space-y-3">
            <div className="flex justify-between items-center pb-1.5 border-b border-gray-800">
              <h3 className="text-sm font-black uppercase tracking-wider text-yellow-400 flex items-center gap-1.5">
                <span>⚔️</span> Equipped Gear
              </h3>
              <span className="text-[10px] font-bold bg-yellow-500/20 text-yellow-300 border border-yellow-500/30 px-2 py-0.5 rounded-full">
                🔒 Fixed in Battle
              </span>
            </div>

            <div className="space-y-2.5">
              {equipSlots.map((slot) => {
                const equippedId = character?.equipment?.[slot.key];
                const instance = equippedId ? inventory.find((i) => i.instanceId === equippedId) : null;
                const def = instance ? gameItems[instance.itemId] : null;
                const isWeapon = slot.key === "mainHand" || slot.key === "offHand";
                const isBroken = isWeapon && instance && (instance.maxDurability || 0) > 0 && (instance.durability || 0) <= 0;
                const s = def?.stats || {};

                if (!def || !instance) {
                  return (
                    <div
                      key={slot.key}
                      className="p-3 rounded-xl bg-gray-800/30 border border-dashed border-gray-700/70 flex items-center gap-3 text-gray-500"
                    >
                      <span className="text-2xl opacity-40">{slot.icon}</span>
                      <div>
                        <div className="text-[10px] font-black uppercase tracking-wider text-gray-400">
                          {slot.label}
                        </div>
                        <div className="text-xs italic text-gray-500">Empty Slot</div>
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={slot.key}
                    className={`p-3 rounded-xl transition-all ${
                      isBroken
                        ? 'bg-red-950/40 border-2 border-red-600/70 shadow-[0_0_12px_rgba(220,38,38,0.25)]'
                        : 'bg-gray-800/80 border border-white/15'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      {/* Image / Thumbnail */}
                      <div className="w-11 h-11 rounded-lg bg-gray-900 border border-white/20 shrink-0 flex items-center justify-center overflow-hidden shadow-inner">
                        {def.imageUrl ? (
                          <img src={def.imageUrl} alt={def.name} className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-xl">{slot.icon}</span>
                        )}
                      </div>

                      {/* Info & Stats */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] font-black bg-gray-700/80 text-gray-300 px-1.5 py-0.5 rounded uppercase">
                            {slot.label}
                          </span>
                          <span className={`text-xs font-bold truncate ${isBroken ? 'text-red-400 font-black' : 'text-white'}`}>
                            {def.name}
                          </span>
                        </div>

                        {/* Durability bar with health bar palette (only for weapons) */}
                        {isWeapon && instance.maxDurability ? (
                          <div className="mt-1.5 max-w-[200px]">
                            <BattleDurabilityBar current={instance.durability || 0} max={instance.maxDurability} />
                          </div>
                        ) : null}

                        {/* Stats Badges */}
                        <div className="flex flex-wrap gap-1 mt-2 text-[10px]">
                          {s.a ? <span className="px-1.5 py-0.5 rounded bg-red-950/60 border border-red-500/40 text-red-300 font-bold">A +{s.a}</span> : null}
                          {s.b ? <span className="px-1.5 py-0.5 rounded bg-orange-950/60 border border-orange-500/40 text-orange-300 font-bold">B +{s.b}</span> : null}
                          {s.c ? <span className="px-1.5 py-0.5 rounded bg-blue-950/60 border border-blue-500/40 text-blue-300 font-bold">C +{s.c}</span> : null}
                          {s.d ? <span className="px-1.5 py-0.5 rounded bg-green-950/60 border border-green-500/40 text-green-300 font-bold">D +{s.d}</span> : null}
                          {s.xBonus ? <span className="px-1.5 py-0.5 rounded bg-indigo-950/60 border border-indigo-500/40 text-indigo-300 font-bold">X +{s.xBonus}</span> : null}
                          {s.damage?.mult ? (
                            <span className="px-1.5 py-0.5 rounded bg-purple-950/60 border border-purple-500/40 text-purple-300 font-bold">
                              💥 Dmg +{Math.round((s.damage.mult > 1 ? s.damage.mult - 1 : s.damage.mult) * 100)}%
                            </span>
                          ) : null}
                          {s.maxHp?.flat ? <span className="px-1.5 py-0.5 rounded bg-pink-950/60 border border-pink-500/40 text-pink-300 font-bold">❤️ +{s.maxHp.flat} HP</span> : null}
                          {s.time?.flat ? <span className="px-1.5 py-0.5 rounded bg-yellow-950/60 border border-yellow-500/40 text-yellow-300 font-bold">⏳ +{s.time.flat}s</span> : null}
                          {s.time?.mult ? (
                            <span className="px-1.5 py-0.5 rounded bg-yellow-950/60 border border-yellow-500/40 text-yellow-300 font-bold">
                              ⏳ +{Math.round((s.time.mult > 1 ? s.time.mult - 1 : s.time.mult) * 100)}%
                            </span>
                          ) : null}
                        </div>

                        {isBroken && (
                          <div className="text-[10px] text-red-400 font-bold uppercase mt-1 animate-pulse">
                            ⚠️ Item broken • stats deactivated
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="p-2.5 rounded-lg bg-gray-800/40 border border-gray-700/60 text-[10px] text-gray-400 text-center">
              Gear setup is locked during encounters. Swap or repair gear anytime in the Character page.
            </div>
          </div>

          {/* RIGHT COLUMN: CONSUMABLES & OTHER OBJECTS */}
          <div className="space-y-3">
            <div className="flex justify-between items-center pb-1.5 border-b border-gray-800">
              <h3 className="text-sm font-black uppercase tracking-wider text-green-400 flex items-center gap-1.5">
                <span>🧪</span> Consumables & Bag Items
              </h3>
              <span className="text-[10px] text-gray-400 font-bold font-mono">
                HP: {playerHp}/{playerMaxHp}
              </span>
            </div>

            {/* Consumables List */}
            <div className="space-y-2.5">
              {displayConsumables.length > 0 ? (
                displayConsumables.map(({ item, quantity }) => {
                  const gameItem = gameItems[item.itemId];
                  const healFlat = gameItem?.stats?.heal?.flat;
                  const healMult = gameItem?.stats?.heal?.mult;
                  const isHpFull = playerHp >= playerMaxHp;

                  return (
                    <div
                      key={item.instanceId}
                      className="bg-gray-800/80 rounded-xl p-3 flex justify-between items-center border border-white/10 hover:border-white/20 transition-all gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-lg bg-gray-900 border border-white/10 shrink-0 flex items-center justify-center overflow-hidden">
                          {gameItem?.imageUrl ? (
                            <img src={gameItem.imageUrl} alt={gameItem.name} className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-xl">🧪</span>
                          )}
                        </div>
                        <div className="min-w-0">
                          <h4 className="font-bold text-xs sm:text-sm text-white truncate">
                            {gameItem?.name || 'Item'}{' '}
                            <span className="text-yellow-400 font-mono text-xs">(x{quantity})</span>
                          </h4>
                          <p className="text-[11px] text-green-300 font-semibold mt-0.5">
                            {healFlat ? `Restores +${healFlat} HP` : healMult ? `Restores +${Math.round(healMult * 100)}% HP` : 'Restores HP'}
                          </p>
                          {gameItem?.description && (
                            <p className="text-[10px] text-gray-400 truncate max-w-xs">{gameItem.description}</p>
                          )}
                        </div>
                      </div>

                      <button
                        onClick={() => onUse(item)}
                        disabled={isHpFull}
                        className={`font-bold py-1.5 px-4 rounded-xl text-xs transition-all active:scale-95 shrink-0 ${
                          isHpFull
                            ? 'bg-gray-700 text-gray-400 cursor-not-allowed opacity-60'
                            : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg'
                        }`}
                      >
                        {isHpFull ? 'Full HP' : 'Drink'}
                      </button>
                    </div>
                  );
                })
              ) : (
                <div className="p-6 text-center text-gray-400 text-xs italic bg-gray-800/30 rounded-xl border border-gray-700/60">
                  No usable potions in your backpack.
                </div>
              )}
            </div>

            {/* Other Bag Items (Passives, Relics, Unused Gear) */}
            {otherItems.length > 0 && (
              <div className="pt-3 border-t border-gray-800 space-y-2">
                <div className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                  <span>✨</span> Other Bag Items
                </div>
                <div className="space-y-1.5 max-h-36 overflow-y-auto custom-scrollbar pr-1">
                  {otherItems.map((item) => {
                    const gameItem = gameItems[item.itemId];
                    if (!gameItem) return null;
                    return (
                      <div
                        key={item.instanceId}
                        className="p-2 rounded-lg bg-gray-800/50 border border-gray-700/50 flex items-center justify-between text-xs"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-sm">📦</span>
                          <span className="font-semibold text-gray-300 truncate">{gameItem.name}</span>
                        </div>
                        <span className="text-[10px] text-gray-500 uppercase font-mono shrink-0">
                          {gameItem.type}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-800 bg-gray-800/40 flex justify-end">
          <button
            onClick={onClose}
            className="w-full sm:w-auto bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-6 rounded-xl text-xs transition-all active:scale-95 shadow"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ESCAPE CONFIRM MODAL
function EscapeConfirm({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-in fade-in duration-150">
      <div className="bg-gray-900 border-2 border-red-500/50 rounded-2xl p-6 w-full max-w-sm text-center text-white shadow-2xl space-y-4">
        <div className="text-4xl">🏃💨</div>
        <h2 className="text-2xl font-black">Flee Battle?</h2>
        <p className="text-xs text-gray-300">You will retreat to the map. Any potions consumed will remain spent.</p>
        <div className="flex justify-around gap-3 pt-2">
          <button
            onClick={onConfirm}
            className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2.5 px-4 rounded-xl transition-all active:scale-95"
          >
            Yes, Escape
          </button>
          <button
            onClick={onCancel}
            className="w-full bg-gray-700 hover:bg-gray-600 text-white font-bold py-2.5 px-4 rounded-xl transition-all active:scale-95"
          >
            Keep Fighting
          </button>
        </div>
      </div>
    </div>
  );
}


