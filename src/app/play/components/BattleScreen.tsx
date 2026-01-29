
import { Character, FoeDoc, QuestionDoc, GameItem, InventoryItem, ContentBlock, SubArea } from "@/types/game";
import { HealthBar, TimeBar } from "@/app/play/components/shared/Bars";
import 'katex/dist/katex.min.css'; 
import { BlockMath, InlineMath } from 'react-katex';
import React, { useState, useEffect } from "react";

// RENDER HELPERS
const renderLegacyMixedText = (text: string | undefined): React.ReactNode => {
    if (!text) return null;
    if (!text.includes('$')) return text;
    const parts = text.split(/(\$.*?\$)/g);
    return <>{parts.map((part, index) => {
        if (part.startsWith('$') && part.endsWith('$')) {
            const math = part.slice(1, -1);
            try { 
                return <span key={index} className="inline-block mx-1"><InlineMath math={math} /></span>;
            } catch (error) { 
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
            case 'text': 
                return <span key={index}>{block.value}</span>;
            case 'latex': 
                try { 
                    return <span key={index} className="inline-block mx-1"><MathComponent math={block.value} /></span>;
                } catch (e) { 
                    return <span key={index} className="text-red-500 font-mono">{`$${block.value}$`}</span>; 
                }
            case 'image': 
                return <img key={index} src={block.value} alt="Question content" className="my-2 rounded-lg max-w-full h-auto inline-block" />;
            default: return null;
        }
    })}</>;
};

// PROP TYPES
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

// MAIN COMPONENT
export function BattleScreen(props: BattleScreenProps) {
  const {
    character, foe, questions, currentQIndex, playerHp, foeHp, msg, timeLeft, totalTime, 
    isPaused, selectedChoice, gameItems, showInventory, setShowInventory, showEscapeConfirm, 
    setShowEscapeConfirm, handleAnswer, nextQuestion, skipQuestion, executeEscape, usePotion, subArea
  } = props;

  const [showAnswers, setShowAnswers] = useState(false);
  const currentQ = questions[currentQIndex];

  useEffect(() => {
      setShowAnswers(false);
  }, [currentQIndex]);

  if (!currentQ) {
    return <div className="p-10 text-center font-bold text-gray-500 dark:text-gray-400 animate-pulse">Loading Battle...</div>;
  }

  const bgUrl = subArea?.imageUrl || "/backgrounds/default_battle_bg.png";

  return (
    <main style={{ backgroundImage: `url(${bgUrl})` }} className="h-screen bg-cover bg-center font-sans text-white relative flex flex-col justify-between">
      {/* Sprites */}
      <Sprites character={character} foe={foe} />

      {/* Top Area */}
      <TopArea character={character} playerHp={playerHp} foe={foe} foeHp={foeHp} timeLeft={timeLeft} totalTime={totalTime} />

      {/* Bottom Area */}
      <BottomArea 
        currentQ={currentQ}
        showAnswers={showAnswers}
        setShowAnswers={setShowAnswers}
        isPaused={isPaused}
        handleAnswer={handleAnswer}
        skipQuestion={skipQuestion}
        setShowInventory={setShowInventory}
        setShowEscapeConfirm={setShowEscapeConfirm}
        selectedChoice={selectedChoice}
        msg={msg}
        nextQuestion={nextQuestion}
      />

      {/* Modals */}
      {showInventory && <InventoryPanel items={character?.inventory || []} gameItems={gameItems} onUse={usePotion} onClose={() => setShowInventory(false)} />}
      {showEscapeConfirm && <EscapeConfirm onConfirm={executeEscape} onCancel={() => setShowEscapeConfirm(false)} />}
    </main>
  );
}

// SUB-COMPONENTS
const Sprites = ({ character, foe }: { character: Character | null, foe: FoeDoc | null }) => {
    const playerImage = character?.imageUrl || "https://firebasestorage.googleapis.com/v0/b/pokematicos.firebasestorage.app/o/The_Primordial_Equation_Owl_Sprites%2Fowl%20back.png?alt=media&token=bae93c5e-92ed-4958-9274-fb67a3f5f8c9";
    
    return (
        <div className="absolute inset-0 pointer-events-none">
            <img src={playerImage} alt="Character" className="absolute bottom-1/12 left-1/12 w-96 h-96 object-contain" />
            {foe?.imageUrl && <img src={foe.imageUrl} alt="Foe" className="absolute top-1/12 right-1/12 w-96 h-96 object-contain" />}
        </div>
    );
};

const TopArea = ({ character, playerHp, foe, foeHp, timeLeft, totalTime }: any) => (
    <div className="relative z-10 p-4 space-y-2">
        <div className="flex justify-between items-start gap-4">
            <InfoBox title={character?.name || "Player"} hp={playerHp} maxHp={character?.maxHp || 100} />
            <InfoBox title={foe?.name || "Enemy"} hp={foeHp} maxHp={foe?.maxHp || 50} isFoe />
        </div>
        <div className="bg-black/60 backdrop-blur-sm p-2 rounded-lg border-2 border-white/20">
            <TimeBar current={timeLeft} max={totalTime} />
        </div>
    </div>
);

const BottomArea = ({ currentQ, showAnswers, setShowAnswers, isPaused, handleAnswer, skipQuestion, setShowInventory, setShowEscapeConfirm, selectedChoice, msg, nextQuestion }: any) => {

    const QuestionPrompt = () => {
        // New Unified Prompt Style
        const promptContainerClasses = "leading-relaxed text-lg font-serif text-gray-800 dark:text-gray-100 text-center";

        if (currentQ.promptContent) {
            return <div className={promptContainerClasses}>{renderStructuredContent(currentQ.promptContent, true)}</div>;
        }
        
        // Legacy Fallbacks
        switch (currentQ.promptType) {
            case 'latex': 
                return <div className={promptContainerClasses}><BlockMath math={currentQ.promptLatex || ''} /></div>;
            case 'image': 
                return <img src={currentQ.promptImageUrl} alt="Question" className="max-h-48 rounded-lg shadow-md border bg-white" />;
            default: 
                return <div className={promptContainerClasses}>{renderLegacyMixedText(currentQ.promptText)}</div>;
        }
    };

    const getChoiceContent = (idx: number) => {
        if (currentQ.choicesContent && currentQ.choicesContent[idx]) {
            return renderStructuredContent(currentQ.choicesContent[idx].content);
        }
        // Legacy Fallback for choices
        const choiceText = currentQ.choices?.[idx];
        if (currentQ.choiceType === 'latex') {
            try { return <InlineMath math={choiceText || ""} />; } catch (e) { return <span className="text-red-500 font-mono">{choiceText}</span>; }
        }
        return renderLegacyMixedText(choiceText);
    };
    
    const getButtonClass = (idx: number) => {
        if (isPaused && selectedChoice === idx) {
            return selectedChoice === currentQ.correctIndex ? 'bg-green-500' : 'bg-red-500';
        }
        return '';
    };

    return (
        <div className="relative z-10 p-4">
            <div className="flex justify-between items-end gap-4">
                <div className="flex-1 bg-black/60 backdrop-blur-sm p-4 rounded-xl border-2 border-white/20 relative min-h-[100px] flex items-center justify-center">
                    <div className="absolute -top-3 right-1/2 bg-inherit w-6 h-6 transform rotate-45"></div>
                    {isPaused && msg ? <p className="text-center text-lg font-bold animate-pulse">{msg}</p> : <QuestionPrompt />}
                </div>

                <div className="w-1/3 grid grid-cols-2 gap-2 bg-black/60 backdrop-blur-sm p-3 rounded-xl border-2 border-white/20">
                    {isPaused ? (
                        <button onClick={nextQuestion} className="battle-btn col-span-2">Next</button>
                    ) : !showAnswers ? (
                        <>
                            <button onClick={() => setShowAnswers(true)} disabled={isPaused} className="battle-btn">Answer</button>
                            <button onClick={() => setShowInventory(true)} disabled={isPaused} className="battle-btn">Items</button>
                            <button onClick={skipQuestion} disabled={isPaused} className="battle-btn">Skip</button>
                            <button onClick={() => setShowEscapeConfirm(true)} disabled={isPaused} className="battle-btn">Escape</button>
                        </>
                    ) : (
                        (currentQ.choices || []).map((_: any, idx: number) => (
                            <button key={idx} disabled={isPaused} onClick={() => handleAnswer(idx)} className={`battle-btn col-span-1 ${getButtonClass(idx)}`}>
                                {getChoiceContent(idx)}
                            </button>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
};

const InfoBox = ({ title, hp, maxHp, isFoe = false }: InfoBoxProps) => (
    <div className={`w-1/3 bg-black/60 backdrop-blur-sm p-3 rounded-lg border-2 ${isFoe ? 'border-red-500' : 'border-blue-500'}`}>
        <h3 className="font-bold text-lg truncate">{title}</h3>
        <HealthBar label={isFoe ? "" : ""} current={hp} max={maxHp} />
    </div>
);

const InventoryPanel = ({ items, gameItems, onUse, onClose }: { items: InventoryItem[], gameItems: Record<string, GameItem>, onUse: (item: InventoryItem) => void, onClose: () => void }) => {

  const potionItems = items.filter(item => {
    const gameItem = gameItems[item.itemId];
    return gameItem && gameItem.type === 'potion';
  });

  const groupedInventory = potionItems.reduce((acc: Record<string, { item: InventoryItem, quantity: number }>, currentItem) => {
    if (!acc[currentItem.itemId]) {
      acc[currentItem.itemId] = { item: currentItem, quantity: 0 };
    }
    acc[currentItem.itemId].quantity++;
    return acc;
  }, {});

  const displayItems = Object.values(groupedInventory);

  return (
    <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-gray-800 border-2 border-white/30 rounded-xl p-6 w-full max-w-md m-4 text-white">
        <h2 className="text-2xl font-bold mb-4">Inventory</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-96 overflow-y-auto">
          {displayItems.length > 0 ? displayItems.map(({ item, quantity }) => {
            const gameItem = gameItems[item.itemId];
            return (
              <div key={item.instanceId} className="bg-gray-700 rounded-lg p-4 flex flex-col">
                <div className="flex-1">
                  <h3 className="font-bold text-lg">{gameItem?.name || 'Unknown Item'} (x{quantity})</h3>
                  <p className="text-sm text-gray-400">{gameItem?.description}</p>
                </div>
                <button onClick={() => onUse(item)} className="mt-4 w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded transition-all active:scale-95">Use</button>
              </div>
            );
          }) : <p className="text-gray-400 col-span-full">Your inventory is empty.</p>}
        </div>
        <button onClick={onClose} className="mt-6 w-full bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded transition-all active:scale-95">Close</button>
      </div>
    </div>
  );
}

const EscapeConfirm = ({ onConfirm, onCancel }: { onConfirm: () => void, onCancel: () => void }) => (
    <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-50">
        <div className="bg-gray-800 border-2 border-white/30 rounded-xl p-8 w-full max-w-sm m-4 text-center text-white">
            <h2 className="text-2xl font-bold mb-4">Escape?</h2>
            <p className="mb-6">Are you sure you want to escape? This will count as a loss.</p>
            <div className="flex justify-around gap-4">
                <button onClick={onConfirm} className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-6 rounded-lg transition-all active:scale-95">Confirm</button>
                <button onClick={onCancel} className="w-full bg-gray-600 hover:bg-gray-700 text-white font-bold py-3 px-6 rounded-lg transition-all active:scale-95">Cancel</button>
            </div>
        </div>
    </div>
);
