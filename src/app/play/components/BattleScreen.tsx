import { Character, FoeDoc, QuestionDoc, GameItem, InventoryItem } from "@/types/game";
import { HealthBar, TimeBar } from "@/app/play/components/shared/Bars";
import { BlockMath } from 'react-katex';

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
  renderMixedText: (text: string) => React.ReactNode;
}

export function BattleScreen(props: BattleScreenProps) {
  const {
    character, foe, questions, currentQIndex, playerHp, foeHp, msg, timeLeft, totalTime, 
    isPaused, isEscaping, selectedChoice, gameItems, showInventory, setShowInventory, showEscapeConfirm, 
    setShowEscapeConfirm, handleAnswer, nextQuestion, skipQuestion, executeEscape, usePotion, renderMixedText
  } = props;

  const currentQ = questions[currentQIndex];

  if (!currentQ) return (
    <div className="p-10 text-center font-bold text-gray-500 dark:text-gray-400 animate-pulse">
      Loading Battle...
    </div>
  );

  return (
    <main className="min-h-screen p-2 md:p-4 flex flex-col items-center max-w-2xl mx-auto relative transition-colors font-sans">
      <div className="w-full grid grid-cols-2 gap-2 md:gap-4 mb-2">
        <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-2xl border border-blue-100 dark:border-blue-800 text-center space-y-1 transition-colors flex flex-col justify-between">
            <div>
                <h3 className="font-bold text-sm text-blue-900 dark:text-blue-200 truncate">{character?.name}</h3>
                <HealthBar label="YOU" current={playerHp} max={character?.maxHp || 100} />
            </div>
          <button 
            onClick={() => setShowInventory(true)}
            disabled={isPaused}
            className="mt-2 text-[10px] md:text-xs bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-200 py-1.5 rounded-lg font-bold flex items-center justify-center gap-2 border dark:border-gray-600 w-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            🎒 Items ({character?.inventory.filter(i => gameItems[i.itemId]?.type === 'potion').length || 0})
          </button>
        </div>
        
        <div className="bg-red-50 dark:bg-red-900/20 p-3 rounded-2xl border border-red-100 dark:border-red-800 text-center space-y-1 transition-colors">
            <h3 className="font-bold text-sm text-red-900 dark:text-red-200 truncate">{foe?.name || "Enemy"}</h3>
            <HealthBar label="ENEMY" current={foeHp} max={foe?.maxHp || 50} />
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 dark:text-gray-100 px-4 py-2 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 mb-2 w-full transition-colors">
        <TimeBar current={timeLeft} max={totalTime} />
      </div>

      <div className="w-full bg-white dark:bg-gray-800 dark:text-gray-100 rounded-3xl shadow-lg border dark:border-gray-700 p-4 md:p-6 space-y-3 relative transition-colors flex-1 flex flex-col justify-center">
        {msg && <div className="text-center text-red-500 font-bold animate-bounce text-sm absolute top-2 left-0 w-full">{msg}</div>}
        <div className="absolute top-3 right-4 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full text-[9px] font-black text-gray-400 dark:text-gray-300 tracking-widest border border-gray-200 dark:border-gray-600">
           TURN {currentQIndex + 1} / {questions.length}
        </div>
        
        {currentQ.imageUrl && (
          <div className="flex justify-center mb-1">
            <img src={currentQ.imageUrl} alt="Question Context" className="rounded-xl max-h-32 md:max-h-60 object-contain shadow-sm bg-white" />
          </div>
        )}

        <div className="text-xl md:text-2xl font-bold text-gray-800 dark:text-gray-100 text-center my-2">
          {currentQ.promptImageUrl && (
            <div className="flex justify-center mb-2">
                <img src={currentQ.promptImageUrl} alt="Question Image" className="max-h-32 md:max-h-48 rounded-lg shadow-md border bg-white" />
            </div>
          )}
          {currentQ.promptLatex && <div className="py-2 overflow-x-auto"><BlockMath math={currentQ.promptLatex} /></div>}
          {currentQ.promptText && <div className="whitespace-pre-wrap leading-relaxed dark:text-gray-100 text-sm md:text-base">{renderMixedText(currentQ.promptText || "")}</div>}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 md:gap-3">
          {!isPaused && currentQ.choices.map((choice, idx) => (
              <button key={idx} disabled={isPaused} onClick={() => handleAnswer(idx)} className={`p-4 pr-10 border-2 rounded-2xl text-base md:text-lg font-bold transition-all duration-200 group relative border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 bg-transparent hover:border-black dark:hover:border-white hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black active:scale-[0.98]`}>
                <span className="block w-full text-center">{renderMixedText(choice)}</span>
              </button>
          ))}
          {isPaused && !isEscaping && currentQ.choices.map((choice, idx) => {
            const isSelected = selectedChoice === idx;
            const isCorrectChoice = idx === currentQ.correctIndex;
            let highlightClass = "opacity-30 border-gray-200 dark:border-gray-800 text-gray-400 dark:text-gray-600";
            if (isCorrectChoice) {
              highlightClass = "border-green-500 bg-green-50 dark:bg-green-950/50 text-green-700 dark:text-green-400 shadow-[0_0_15px_rgba(34,197,94,0.2)]";
            } else if (isSelected && !isCorrectChoice) {
              highlightClass = "border-red-500 bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-400";
            }

            return (
              <button key={idx} disabled={true} className={`p-4 pr-10 border-2 rounded-2xl text-base md:text-lg font-bold transition-all duration-200 group relative ${highlightClass}`}>
                <span className="block w-full text-center">{renderMixedText(choice)}</span>
                {isCorrectChoice && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-green-600 dark:text-green-400 scale-125">✅</span>}
                {isSelected && !isCorrectChoice && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-red-600 dark:text-red-400 scale-125">❌</span>}
              </button>
            );
          })}
        </div>

        {isPaused && !isEscaping && (
            <div className="col-span-1 md:col-span-2 flex flex-col items-center justify-center space-y-3 animate-in fade-in zoom-in mb-2">
              <div className="text-lg font-bold bg-white dark:bg-gray-700 dark:text-white p-3 rounded-xl border-2 border-black dark:border-gray-500 w-full text-center shadow-md">{msg || "Round Over"}</div>
              <button onClick={nextQuestion} className="w-full py-3 rounded-xl text-lg font-black shadow-lg transition-all duration-200 hover:scale-[1.02] bg-blue-600 text-white hover:bg-blue-800 dark:bg-blue-600 dark:text-white dark:hover:bg-blue-500 dark:shadow-blue-900/30 dark:ring-1 dark:ring-blue-500/50">NEXT ➡️</button>
            </div>
        )}

        {isEscaping && (
            <div className="col-span-1 md:col-span-2 flex flex-col items-center justify-center space-y-3 animate-in fade-in zoom-in mb-2">
                <div className="text-lg font-bold bg-white dark:bg-gray-700 dark:text-white p-3 rounded-xl border-2 border-black dark:border-gray-500 w-full text-center shadow-md">{msg}</div>
            </div>
        )}

        {!isPaused && (
            <div className="mt-2 flex flex-row gap-2 pt-2 border-t border-gray-100 dark:border-gray-700">
                <button onClick={skipQuestion} className="flex-1 py-2 md:py-3 rounded-xl border-2 border-red-100 dark:border-red-900/30 bg-red-50 dark:bg-red-900/10 text-red-500 dark:text-red-400 font-bold hover:bg-red-100 dark:hover:bg-red-900/30 hover:border-red-200 transition-colors text-xs">⏭️ SKIP</button>
                <button onClick={() => setShowEscapeConfirm(true)} className="flex-1 py-2 md:py-3 rounded-xl border-2 border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500 font-bold hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-600 dark:hover:text-gray-300 transition-colors text-[10px] uppercase tracking-widest">🏃 ESCAPE</button>
            </div>
        )}
      </div>

      {showInventory && (
        <div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
           <div className="bg-white dark:bg-gray-800 dark:text-gray-100 w-full max-w-sm rounded-2xl p-6 shadow-2xl animate-in fade-in zoom-in duration-200 border dark:border-gray-700">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold">🎒 Backpack</h3>
                <button onClick={() => setShowInventory(false)} className="text-gray-400 hover:text-black dark:hover:text-white">✕</button>
              </div>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {character?.inventory.filter(i => gameItems[i.itemId]?.type === 'potion').length === 0 && <p className="text-center text-gray-400 py-4">No potions found!</p>}
                {character?.inventory.map((invItem) => {
                   const def = gameItems[invItem.itemId];
                   if (!def || def.type !== 'potion') return null;
                   return (
                     <div key={invItem.instanceId} className="flex justify-between items-center p-3 border dark:border-gray-600 rounded-xl hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors">
                        <div className="flex items-center gap-3">
                           {def.imageUrl ? <img src={def.imageUrl} className="w-8 h-8 rounded bg-gray-200" /> : <div className="w-8 h-8 rounded bg-pink-100 dark:bg-pink-900 flex items-center justify-center text-xs">🧪</div>}
                           <div>
                             <div className="font-bold text-sm dark:text-gray-200">{def.name}</div>
                             <div className="text-xs text-green-600 dark:text-green-400 font-bold">Heals {def.stats?.heal?.flat || 20} HP</div>
                           </div>
                        </div>
                        <button onClick={() => usePotion(invItem)} className="px-3 py-1 bg-green-500 text-white text-xs font-bold rounded-lg hover:bg-green-600">Drink</button>
                     </div>
                   );
                })}
              </div>
              <p className="text-center text-[10px] text-red-500 mt-4 animate-pulse">⏰ Time is still ticking!</p>
           </div>
        </div>
      )}

      {showEscapeConfirm && (
        <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
           <div className="bg-white dark:bg-gray-800 dark:text-gray-100 w-full max-w-sm rounded-2xl p-6 shadow-2xl border-4 border-red-100 dark:border-red-900/50 text-center space-y-4">
              <div className="text-4xl">🏃💨</div>
              <div>
                 <h3 className="text-xl font-black text-gray-800 dark:text-gray-100 uppercase">Run Away?</h3>
                 <p className="text-sm text-gray-500 dark:text-gray-400 font-medium mt-1">You will keep your Backpack and Gold.</p>
              </div>
              <div className="bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-300 text-[10px] font-bold py-2 rounded animate-pulse">⚠️ HURRY! THE BATTLE IS STILL ACTIVE!</div>
              <div className="grid grid-cols-2 gap-3 pt-2">
                 <button onClick={() => setShowEscapeConfirm(false)} className="py-3 rounded-xl font-bold bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200">Cancel</button>
                 <button onClick={executeEscape} className="py-3 rounded-xl font-bold bg-red-600 hover:bg-red-700 text-white shadow-lg hover:scale-105 transition-transform">Yes, Escape!</button>
              </div>
           </div>
        </div>
      )}
    </main>
  );
}
