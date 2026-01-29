
import { Character, FoeDoc, QuestionDoc, GameItem, InventoryItem, ContentBlock, SubArea } from "@/types/game";
import { HealthBar, TimeBar } from "@/app/play/components/shared/Bars";
import { BlockMath, InlineMath } from 'react-katex';
import React, { useState } from "react";

// RENDER HELPERS (remain unchanged)
const renderLegacyMixedText = (text: string | undefined): React.ReactNode => {
    if (!text) return null;
    if (!text.includes('$')) return text;
    const parts = text.split(/(\$.*?\$)/g);
    return <>{parts.map((part, index) => {
        if (part.startsWith('$') && part.endsWith('$')) {
            const math = part.slice(1, -1);
            try { return <InlineMath key={index} math={math} />; } catch (error) {
                return <span key={index} className="text-red-500 font-mono">{part}</span>;
            }
        }
        return <span key={index}>{part}</span>;
    })}</>;
};

const renderStructuredContent = (blocks: ContentBlock[] | undefined, isBlock = false) => {
    if (!blocks) return null;
    const MathComponent = isBlock ? BlockMath : InlineMath;
    return <>{blocks.map((block, index) => {
        switch (block.type) {
            case 'text': return <span key={index}>{block.value}</span>;
            case 'latex': try { return <MathComponent key={index} math={block.value} />; } catch (e) { return <span key={index} className="text-red-500 font-mono">{`$${block.value}$`}</span>; }
            case 'image': return <img key={index} src={block.value} alt="Question content" className="my-2 rounded-lg max-w-full h-auto inline-block" />;
            default: return null;
        }
    })}</>;
};

interface BattleScreenProps {
  character: Character | null;
  foe: FoeDoc | null;
  questions: QuestionDoc[];
  currentQIndex: number;
  playerHp: number;
  foeHp: number;
  msg: string;
  timeLeft: number;
  totalTime: number;
  isPaused: boolean;
  isEscaping: boolean;
  selectedChoice: number | null;
  gameItems: Record<string, GameItem>;
  showInventory: boolean;
  setShowInventory: (show: boolean) => void;
  showEscapeConfirm: boolean;
  setShowEscapeConfirm: (show: boolean) => void;
  handleAnswer: (choiceIndex: number) => void;
  nextQuestion: () => void;
  skipQuestion: () => void;
  executeEscape: () => void;
  usePotion: (item: InventoryItem) => void;
  subArea: SubArea | null;
}

interface InfoBoxProps {
  title: string;
  hp: number;
  maxHp: number;
  isFoe?: boolean;
}

export function BattleScreen(props: BattleScreenProps) {
  const {
    character, foe, questions, currentQIndex, playerHp, foeHp, msg, timeLeft, totalTime, 
    isPaused, isEscaping, selectedChoice, gameItems, showInventory, setShowInventory, showEscapeConfirm, 
    setShowEscapeConfirm, handleAnswer, nextQuestion, skipQuestion, executeEscape, usePotion, subArea
  } = props;

  const [showAnswers, setShowAnswers] = useState(false);
  const currentQ = questions[currentQIndex];

  if (!currentQ) {
    return <div className="p-10 text-center font-bold text-gray-500 dark:text-gray-400 animate-pulse">Loading Battle...</div>;
  }

  const QuestionPrompt = () => {
    if (currentQ.promptContent) return <>{renderStructuredContent(currentQ.promptContent, true)}</>;
    switch (currentQ.promptType) {
        case 'latex': return <div className="py-2 overflow-x-auto"><BlockMath math={currentQ.promptLatex || ''} /></div>;
        case 'image': return <img src={currentQ.promptImageUrl} alt="Question" className="max-h-48 rounded-lg shadow-md border bg-white" />;
        default: return <div className="whitespace-pre-wrap dark:text-gray-100 text-sm md:text-base">{renderLegacyMixedText(currentQ.promptText)}</div>;
    }
  };

  const getChoiceContent = (idx: number) => {
    if (currentQ.choicesContent && currentQ.choicesContent[idx]) return renderStructuredContent(currentQ.choicesContent[idx].content);
    const choiceText = currentQ.choices?.[idx];
    if (currentQ.choiceType === 'latex') {
        try { return <InlineMath math={choiceText || ""} />; } catch (e) { return <span className="text-red-500 font-mono">{choiceText}</span>; }
    }
    return renderLegacyMixedText(choiceText);
  };

  const defaultBg = "/backgrounds/default_battle_bg.png";
  const bgUrl = subArea?.imageUrl || defaultBg;

  return (
    <main style={{ backgroundImage: `url(${bgUrl})` }} className="h-screen bg-cover bg-center font-sans text-white relative flex flex-col justify-between p-4">
      {/* Sprites */}
      <div className="absolute inset-0">
        {character?.imageUrl && <img src={character.imageUrl} alt="Character" className="absolute bottom-1/4 left-1/4 w-48 h-48" />}
        {foe?.imageUrl && <img src={foe.imageUrl} alt="Foe" className="absolute top-1/4 right-1/4 w-48 h-48" />}
      </div>

      {/* Top Info Boxes */}
      <div className="flex justify-between items-start">
          <InfoBox title={character?.name || "Player"} hp={playerHp} maxHp={character?.maxHp || 100} />
          <InfoBox title={foe?.name || "Enemy"} hp={foeHp} maxHp={foe?.maxHp || 50} isFoe />
      </div>

      {/* Bottom Area */}
      <div className="flex justify-between items-end gap-4">
          {/* Question Bubble */}
          <div className="flex-1 bg-black/60 backdrop-blur-sm p-4 rounded-xl border-2 border-white/20 relative">
                <div className="absolute -top-4 right-1/2 bg-inherit w-8 h-8 transform rotate-45"></div>
                <QuestionPrompt />
          </div>

          {/* Controls */}
          <div className="w-1/3 grid grid-cols-2 gap-2 bg-black/60 backdrop-blur-sm p-3 rounded-xl border-2 border-white/20">
              {!showAnswers ? (
                  <>
                      <button onClick={() => setShowAnswers(true)} className="battle-btn">Answer</button>
                      <button onClick={() => setShowInventory(true)} disabled={isPaused} className="battle-btn">Items</button>
                      <button onClick={skipQuestion} disabled={isPaused} className="battle-btn">Skip</button>
                      <button onClick={() => setShowEscapeConfirm(true)} disabled={isPaused} className="battle-btn">Escape</button>
                  </>
              ) : (
                  (currentQ.choicesContent || currentQ.choices || []).map((_, idx) => (
                      <button key={idx} disabled={isPaused} onClick={() => { handleAnswer(idx); setShowAnswers(false); }} className={`battle-btn col-span-1`}>
                          {getChoiceContent(idx)}
                      </button>
                  ))
              )}
          </div>
      </div>

      {/* Other UI Elements (Modals, etc.) would go here, styled to fit the new theme */}
    </main>
  );
}

const InfoBox = ({ title, hp, maxHp, isFoe = false }: InfoBoxProps) => (
    <div className={`w-1/3 bg-black/60 backdrop-blur-sm p-3 rounded-lg border-2 ${isFoe ? 'border-red-500' : 'border-blue-500'}`}>
        <h3 className="font-bold text-lg truncate">{title}</h3>
        <HealthBar label={isFoe ? "" : ""} current={hp} max={hp} />
    </div>
);
