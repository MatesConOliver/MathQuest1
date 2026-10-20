"use client";

import { Character, FoeDoc, QuestionDoc, GameItem, InventoryItem, ContentBlock, SubArea } from "@/types/game";
import { BlockMath, InlineMath } from 'react-katex';
import React, { useState, useEffect } from "react";
import { CombatEffect } from "../hooks/useBattle";

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
  combatEffect?: CombatEffect | null;
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
            className={`transition-all duration-1000 ease-linear ${
              isLowTime ? 'stroke-red-500 animate-pulse' : 'stroke-yellow-400'
            }`}
            strokeWidth="3.5"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            fill="transparent"
          />
        </svg>
        <span className={`absolute font-mono text-[10px] font-black ${isLowTime ? 'text-red-400' : 'text-yellow-300'}`}>
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
    skipQuestion, executeEscape, usePotion, subArea, combatEffect
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
      <header className="relative z-20 p-3 sm:p-4 flex items-start justify-between gap-2 pr-14">
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

      {/* 2. BATTLE STAGE (GROUND PEDESTALS & SPRITES) */}
      <div className="absolute inset-0 pointer-events-none z-10">
        
        {/* Foe Unit & Shadow (Upper Right Stage) */}
        {foe?.imageUrl && (
          <div className="absolute top-[16%] sm:top-[18%] right-[8%] sm:right-[14%] flex flex-col items-center">
            {/* Foe Sprite with Hit & Lunge Reactions */}
            <div className={`relative transition-transform duration-300 ${
              combatEffect?.target === 'foe' ? 'animate-sprite-hit' : combatEffect?.target === 'player' ? 'animate-foe-lunge' : ''
            }`}>
              <img
                src={foe.imageUrl}
                alt="Foe"
                className="w-[min(20rem,34vw)] h-[min(20rem,28vh)] object-contain object-bottom drop-shadow-[0_12px_24px_rgba(0,0,0,0.8)]"
              />
              {/* Floating Damage Text over Foe */}
              {combatEffect?.target === 'foe' && (
                <div
                  key={combatEffect.id}
                  className="animate-damage-float absolute -top-8 left-1/2 -translate-x-1/2 font-black text-3xl sm:text-4xl text-yellow-300 drop-shadow-[0_4px_14px_rgba(234,179,8,1)] whitespace-nowrap z-30"
                >
                  -{combatEffect.amount} HP
                </div>
              )}
            </div>

            {/* Dark Magical Shadow Pedestal Beneath Foe */}
            <div className="w-40 sm:w-56 h-6 sm:h-7 -mt-2 bg-black/60 rounded-[100%] blur-[2px] shadow-[0_0_20px_rgba(239,68,68,0.45)] border border-red-500/30" />
          </div>
        )}

        {/* Weapon Strike Slash Effect over Foe */}
        {combatEffect?.target === 'foe' && (
          <div className="animate-weapon-slash absolute top-[24%] right-[16%] sm:right-[20%] pointer-events-none z-30 flex items-center justify-center">
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

        {/* Player Owl Unit & Shadow (Lower Left Stage - elevated above grimoire!) */}
        <div className="absolute bottom-[36%] sm:bottom-[34%] left-[6%] sm:left-[12%] flex flex-col items-center">
          {/* Player Sprite with Hit & Lunge Reactions */}
          <div className={`relative transition-transform duration-300 ${
            combatEffect?.target === 'player' ? 'animate-sprite-hit' : combatEffect?.target === 'foe' ? 'animate-player-lunge' : ''
          }`}>
            <img
              src={character?.imageUrl || "https://firebasestorage.googleapis.com/v0/b/pokematicos.firebasestorage.app/o/The_Primordial_Equation_Owl_Sprites%2Fowl%20back.png?alt=media&token=bae93c5e-92ed-4958-9274-fb67a3f5f8c9"}
              alt="Character"
              className="w-[min(20rem,34vw)] h-[min(20rem,28vh)] object-contain object-bottom drop-shadow-[0_12px_24px_rgba(0,0,0,0.8)]"
            />
            {/* Floating Damage Text over Player */}
            {combatEffect?.target === 'player' && (
              <div
                key={combatEffect.id}
                className="animate-damage-float absolute -top-8 left-1/2 -translate-x-1/2 font-black text-3xl sm:text-4xl text-red-500 drop-shadow-[0_4px_14px_rgba(239,68,68,1)] whitespace-nowrap z-30"
              >
                -{combatEffect.amount} HP
              </div>
            )}
          </div>

          {/* Dark Magical Shadow Pedestal Beneath Player */}
          <div className="w-40 sm:w-56 h-6 sm:h-7 -mt-2 bg-black/60 rounded-[100%] blur-[2px] shadow-[0_0_20px_rgba(59,130,246,0.45)] border border-blue-500/30" />
        </div>
      </div>

      {/* 3. BOTTOM GRIMOIRE CONSOLE (PROBLEM PANEL + ACTION / CHOICES CONSOLE) */}
      <footer className="relative z-20 p-3 sm:p-4 bg-gradient-to-t from-black via-black/95 to-black/80 backdrop-blur-xl border-t-2 border-white/20 shadow-2xl">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-stretch gap-3">
          
          {/* LEFT: THE MATH PROBLEM CARD */}
          <div className={`${(showAnswers || isPaused) ? 'w-full md:w-5/12 lg:w-4/12' : 'flex-1'} bg-gray-900/80 rounded-2xl p-4 sm:p-5 border border-white/15 shadow-inner flex flex-col justify-between max-h-[38vh] min-h-[150px] overflow-hidden transition-all duration-200`}>
            <div className="overflow-y-auto pr-2 space-y-3 custom-scrollbar flex-1">
              
              {/* Question Header & Title */}
              <div className="flex items-center justify-between border-b border-gray-800 pb-1.5 text-xs text-gray-400 font-bold uppercase tracking-wider">
                <span className="truncate max-w-[200px]">📜 {currentQ.title || `Exercise #${currentQIndex + 1}`}</span>
                {currentQ.difficulty && (
                  <span className="text-yellow-400 font-mono text-[11px]">★ {currentQ.difficulty}</span>
                )}
              </div>

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
                    className="max-h-48 rounded-xl border border-white/20 mx-auto bg-black/40 p-1 block shadow-md"
                  />
                ) : (
                  <div>{renderLegacyMixedText(currentQ.promptText)}</div>
                )}
              </div>
            </div>

            {/* Hint or Note Footer */}
            {!isPaused && !showAnswers && (
              <div className="text-[11px] text-gray-400 italic pt-2 border-t border-gray-800/80 flex items-center justify-between">
                <span>✍️ Solve on scratch paper, then click <strong>ANSWER</strong> when ready.</span>
              </div>
            )}
            {showAnswers && !isPaused && (
              <div className="text-[11px] text-yellow-400/90 italic pt-2 border-t border-gray-800/80 flex items-center justify-between">
                <span>📖 Comparing with your scratchpad work...</span>
                <button
                  onClick={() => setShowAnswers(false)}
                  className="text-xs text-gray-300 hover:text-white underline font-semibold"
                >
                  Hide options
                </button>
              </div>
            )}
          </div>

          {/* RIGHT: COMMAND & CHOICE CONSOLE */}
          <div className={`${(showAnswers || isPaused) ? 'flex-1 w-full md:w-7/12 lg:w-8/12' : 'w-full md:w-80 lg:w-96'} flex flex-col justify-center transition-all duration-200`}>
            
            {/* MODE 1: POKEMON COMMAND MENU (FIGHT / BAG / SKIP / RUN) */}
            {!showAnswers && !isPaused && (
              <div className="grid grid-cols-2 gap-2.5 h-full">
                {/* 1. FIGHT / ANSWER (Primary yellow button) */}
                <button
                  onClick={() => setShowAnswers(true)}
                  className="bg-yellow-400 hover:bg-yellow-300 text-gray-950 font-black py-4 px-3 rounded-2xl shadow-lg border-2 border-yellow-200 transition-all hover:scale-[1.02] active:scale-95 flex flex-col items-center justify-center gap-1"
                >
                  <span className="text-2xl">⚔️</span>
                  <span className="text-sm tracking-wider uppercase font-black">Answer</span>
                  <span className="text-[10px] text-gray-800 font-semibold">Choose Option</span>
                </button>

                {/* 2. BAG / POTIONS */}
                <button
                  onClick={() => setShowInventory(true)}
                  className="bg-slate-800 hover:bg-slate-700 text-white font-bold py-4 px-3 rounded-2xl shadow-md border border-slate-600 transition-all hover:scale-[1.02] active:scale-95 flex flex-col items-center justify-center gap-1"
                >
                  <span className="text-2xl">🧪</span>
                  <span className="text-sm tracking-wider uppercase font-bold">Potions</span>
                  <span className="text-[10px] text-gray-400 font-normal">Use Inventory</span>
                </button>

                {/* 3. SKIP TURN */}
                <button
                  onClick={skipQuestion}
                  className="bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white font-bold py-3 px-3 rounded-xl shadow border border-gray-700 transition-all hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-1.5 text-xs"
                >
                  <span>⏭</span> Skip Turn
                </button>

                {/* 4. FLEE / RUN */}
                <button
                  onClick={() => setShowEscapeConfirm(true)}
                  className="bg-red-950/80 hover:bg-red-900 text-red-200 font-bold py-3 px-3 rounded-xl shadow border border-red-800/60 transition-all hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-1.5 text-xs"
                >
                  <span>🏃</span> Retreat
                </button>
              </div>
            )}

            {/* MODE 2: MULTIPLE CHOICE OPTIONS (A, B, C, D) - SPACIOUS & FULLY READABLE */}
            {showAnswers && !isPaused && (
              <div className="bg-gray-900/90 rounded-2xl p-3.5 border border-white/20 shadow-xl flex flex-col justify-between max-h-[38vh]">
                <div className="flex justify-between items-center mb-2 pb-1.5 border-b border-gray-800">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black text-yellow-400 uppercase tracking-wider">Select Final Answer:</span>
                    <span className="text-[11px] text-gray-400 hidden sm:inline">(Click an option to commit)</span>
                  </div>
                  <button
                    onClick={() => setShowAnswers(false)}
                    className="bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white text-xs font-bold py-1 px-3 rounded-lg border border-gray-700 transition-colors flex items-center gap-1"
                  >
                    <span>⏎</span> Back to Scratchpad
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 overflow-y-auto max-h-[28vh] pr-1 custom-scrollbar">
                  {(currentQ.choicesContent || currentQ.choices || []).map((_: any, idx: number) => {
                    const optionLetter = String.fromCharCode(65 + idx); // A, B, C, D
                    const content = renderChoiceContent(currentQ, idx);

                    return (
                      <button
                        key={idx}
                        onClick={() => handleAnswer(idx)}
                        className="bg-gray-800/95 hover:bg-yellow-400 text-white hover:text-gray-950 font-bold p-3 rounded-xl border border-white/20 hover:border-yellow-200 shadow-md transition-all hover:scale-[1.01] active:scale-95 text-xs sm:text-sm flex items-center gap-3 text-left justify-start group min-h-[58px]"
                      >
                        <span className="w-7 h-7 rounded-lg bg-black/80 text-yellow-400 group-hover:bg-black group-hover:text-yellow-300 font-black text-xs flex items-center justify-center shrink-0 border border-white/20">
                          {optionLetter}
                        </span>
                        <div className="flex-1 font-semibold overflow-x-auto py-0.5 break-words leading-snug">
                          {content}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* MODE 3: POST-ANSWER REVIEW CONSOLE (EXACTLY ONE LIGHTBULB, HIGHLIGHTED CHOICES, VICTORY/DEFEAT) */}
            {isPaused && (
              <div className="bg-gray-900/90 rounded-2xl p-3.5 border border-white/20 shadow-xl flex flex-col justify-between max-h-[38vh] space-y-2.5">
                {/* Outcome Header with EXACTLY ONE Solution Button */}
                <div className="flex flex-wrap justify-between items-center gap-2 pb-2 border-b border-gray-800">
                  <div className={`px-3 py-1.5 rounded-xl font-black text-xs sm:text-sm flex items-center gap-1.5 shadow ${
                    msg.startsWith('Correct')
                      ? 'bg-emerald-950/90 border border-emerald-500/60 text-emerald-300'
                      : 'bg-red-950/90 border border-red-500/60 text-red-300'
                  }`}>
                    <span>{msg.startsWith('Correct') ? '🎉' : '❌'}</span>
                    <span>{msg}</span>
                  </div>

                  {/* SINGLE SOLUTION BUTTON */}
                  {(currentQ.solutionUrl || currentQ.solutionText) && (
                    <button
                      onClick={() => setShowSolutionModal(true)}
                      className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow-lg transition-transform hover:scale-105 active:scale-95 flex items-center gap-1.5 border border-indigo-400/30"
                    >
                      <span>💡</span> View Solution Walkthrough
                    </button>
                  )}
                </div>

                {/* Choices in Review State: Highlight correct vs chosen */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 overflow-y-auto max-h-[20vh] pr-1 custom-scrollbar">
                  {(currentQ.choicesContent || currentQ.choices || []).map((_: any, idx: number) => {
                    const optionLetter = String.fromCharCode(65 + idx);
                    const isCorrectOption = idx === currentQ.correctIndex;
                    const isSelectedOption = idx === selectedChoice;
                    const content = renderChoiceContent(currentQ, idx);

                    let cardStyle = "bg-black/40 border border-gray-800 text-gray-400 opacity-60";
                    let badge = null;

                    if (isCorrectOption) {
                      cardStyle = "bg-emerald-950/90 border-2 border-emerald-400 text-emerald-100 shadow-[0_0_15px_rgba(52,211,153,0.35)]";
                      badge = <span className="text-[10px] font-black uppercase text-emerald-400 bg-emerald-900/60 px-2 py-0.5 rounded border border-emerald-500/40 shrink-0">✓ Correct</span>;
                    } else if (isSelectedOption) {
                      cardStyle = "bg-red-950/90 border-2 border-red-500 text-red-100 shadow-[0_0_15px_rgba(239,68,68,0.35)]";
                      badge = <span className="text-[10px] font-black uppercase text-red-400 bg-red-900/60 px-2 py-0.5 rounded border border-red-500/40 shrink-0">✗ Your Pick</span>;
                    }

                    return (
                      <div
                        key={idx}
                        className={`p-2.5 rounded-xl flex items-center gap-2.5 text-xs sm:text-sm min-h-[50px] transition-all ${cardStyle}`}
                      >
                        <span className="w-6 h-6 rounded-md bg-black text-white font-black text-xs flex items-center justify-center shrink-0">
                          {optionLetter}
                        </span>
                        <div className="flex-1 overflow-x-auto py-0.5 break-words font-medium leading-snug">
                          {content}
                        </div>
                        {badge}
                      </div>
                    );
                  })}
                </div>

                {/* Bottom Action Button (Next Question / Subquestion / Victory / Defeat) */}
                <div className="pt-1 border-t border-gray-800">
                  {showSubquestionMenu ? (
                    <div className="flex gap-2 w-full">
                      <button
                        onClick={continueSubquestion}
                        className="flex-1 bg-yellow-400 hover:bg-yellow-300 text-black font-black py-2.5 px-3 rounded-xl text-xs transition-all active:scale-95 shadow"
                      >
                        Continuar con el siguiente apartado ➡️
                      </button>
                      <button
                        onClick={abandonGroup}
                        className="bg-red-900 hover:bg-red-800 text-white font-bold py-2.5 px-3 rounded-xl text-xs transition-all active:scale-95 shadow"
                      >
                        Dejar ejercicio (-{abandonGroupTurnCost} turnos)
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
      </footer>

      {/* 4. MODALS (INVENTORY, ESCAPE, SOLUTION) */}
      {showInventory && (
        <InventoryPanel
          items={inventory}
          gameItems={gameItems}
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
          onClose={() => setShowSolutionModal(false)}
        />
      )}
    </main>
  );
}

// INVENTORY MODAL
function InventoryPanel({
  items,
  gameItems,
  onUse,
  onClose,
}: {
  items: InventoryItem[];
  gameItems: Record<string, GameItem>;
  onUse: (item: InventoryItem) => void;
  onClose: () => void;
}) {
  const potionItems = items.filter((item) => {
    const gameItem = gameItems[item.itemId];
    return gameItem && gameItem.type === 'potion';
  });

  const groupedInventory = potionItems.reduce(
    (acc: Record<string, { item: InventoryItem; quantity: number }>, currentItem) => {
      if (!acc[currentItem.itemId]) {
        acc[currentItem.itemId] = { item: currentItem, quantity: 0 };
      }
      acc[currentItem.itemId].quantity++;
      return acc;
    },
    {}
  );

  const displayItems = Object.values(groupedInventory);

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-in fade-in duration-150">
      <div className="bg-gray-900 border-2 border-white/30 rounded-2xl p-6 w-full max-w-md text-white shadow-2xl">
        <h2 className="text-2xl font-black mb-4 flex items-center gap-2">🧪 Battle Potions</h2>
        <div className="grid grid-cols-1 gap-3 max-h-80 overflow-y-auto pr-1">
          {displayItems.length > 0 ? (
            displayItems.map(({ item, quantity }) => {
              const gameItem = gameItems[item.itemId];
              return (
                <div
                  key={item.instanceId}
                  className="bg-gray-800 rounded-xl p-3 flex justify-between items-center border border-gray-700"
                >
                  <div>
                    <h3 className="font-bold text-sm">
                      {gameItem?.name || 'Unknown Item'}{' '}
                      <span className="text-yellow-400 font-mono text-xs">(x{quantity})</span>
                    </h3>
                    <p className="text-xs text-gray-400">{gameItem?.description}</p>
                  </div>
                  <button
                    onClick={() => onUse(item)}
                    className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-1.5 px-4 rounded-lg text-xs transition-all active:scale-95 shadow"
                  >
                    Use
                  </button>
                </div>
              );
            })
          ) : (
            <p className="text-gray-400 text-sm py-4 text-center">No usable potions in your backpack.</p>
          )}
        </div>
        <button
          onClick={onClose}
          className="mt-5 w-full bg-gray-700 hover:bg-gray-600 text-white font-bold py-2.5 px-4 rounded-xl transition-all active:scale-95"
        >
          Close
        </button>
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

// SOLUTION & WALKTHROUGH MODAL
function SolutionModal({ question, onClose }: { question: QuestionDoc; onClose: () => void }) {
  const embedUrl = question.solutionUrl ? getEmbeddableVideoUrl(question.solutionUrl) : null;
  const isDirectImage = question.solutionUrl ? /\.(jpeg|jpg|gif|png|svg|webp)($|\?)/i.test(question.solutionUrl) : false;
  const isDirectVideo = question.solutionUrl ? /\.(mp4|webm|ogg)($|\?)/i.test(question.solutionUrl) : false;

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
      <div className="bg-gray-900 border-2 border-indigo-500/60 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl text-white overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-800 flex justify-between items-center bg-gray-800/50">
          <div>
            <h2 className="text-lg font-black text-indigo-300 flex items-center gap-2">
              <span>💡</span> Solution Walkthrough
            </h2>
            <p className="text-xs text-gray-400">{question.title || "Math Problem Analysis"}</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-gray-800 hover:bg-gray-700 flex items-center justify-center text-gray-300 hover:text-white transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1 custom-scrollbar">
          {/* Problem Statement Reference */}
          <div className="bg-black/50 p-4 rounded-xl border border-gray-800 text-sm leading-relaxed text-gray-200 space-y-2">
            <div className="flex justify-between items-center text-[10px] font-bold text-gray-400 uppercase tracking-wider">
              <span>Problem Statement:</span>
              <span className="text-emerald-400 font-mono text-xs">
                Correct Option: ({String.fromCharCode(65 + question.correctIndex)})
              </span>
            </div>
            <div className="font-serif text-gray-100">
              {question.promptContent ? (
                renderStructuredContent(question.promptContent, true)
              ) : question.promptType === 'latex' ? (
                <div className="overflow-x-auto py-1">
                  <BlockMath math={question.promptLatex || ''} />
                </div>
              ) : question.promptType === 'image' && question.promptImageUrl ? (
                <img
                  src={question.promptImageUrl}
                  alt="Question"
                  className="max-h-48 rounded-xl border border-white/20 mx-auto bg-black/40 p-1 block shadow-md"
                />
              ) : (
                <div>{renderLegacyMixedText(question.promptText)}</div>
              )}
            </div>
          </div>

          {/* Explanation Text */}
          {question.solutionText && (
            <div className="bg-indigo-950/30 p-4 rounded-xl border border-indigo-800/40 text-sm leading-relaxed">
              <h4 className="text-xs font-bold text-indigo-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <span>📝</span> Step-by-step Solution:
              </h4>
              <div className="text-gray-200 font-sans">
                {renderLegacyMixedText(question.solutionText)}
              </div>
            </div>
          )}

          {/* Embedded YouTube / Vimeo Player */}
          {embedUrl && (
            <div className="aspect-video w-full rounded-xl overflow-hidden border border-gray-700 shadow-lg">
              <iframe
                src={embedUrl}
                title="Video Walkthrough"
                className="w-full h-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          )}

          {/* Direct Video File */}
          {isDirectVideo && question.solutionUrl && (
            <div className="w-full rounded-xl overflow-hidden border border-gray-700 shadow-lg">
              <video
                src={question.solutionUrl}
                controls
                className="w-full max-h-80 bg-black"
              />
            </div>
          )}

          {/* Direct Solution Image */}
          {isDirectImage && question.solutionUrl && (
            <div className="w-full flex justify-center bg-black/30 p-2 rounded-xl border border-gray-800">
              <img
                src={question.solutionUrl}
                alt="Solution Diagram"
                className="max-h-96 rounded-lg object-contain shadow"
              />
            </div>
          )}

          {/* External Web Link / Desmos / GeoGebra */}
          {question.solutionUrl && !embedUrl && !isDirectImage && !isDirectVideo && (
            <div className="bg-indigo-950/40 border border-indigo-800/60 p-4 rounded-xl text-center space-y-2">
              <p className="text-xs text-indigo-200">Interactive simulation or external walkthrough:</p>
              <a
                href={question.solutionUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-4 py-2 rounded-xl text-xs shadow-md transition-transform hover:scale-105"
              >
                <span>↗</span> Open Solution Resource in New Tab
              </a>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-800 bg-gray-900 flex justify-end">
          <button
            onClick={onClose}
            className="bg-gray-800 hover:bg-gray-700 text-white font-bold py-2 px-5 rounded-xl text-xs transition-colors"
          >
            Back to Battle
          </button>
        </div>
      </div>
    </div>
  );
}
