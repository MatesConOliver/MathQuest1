
import { EncounterDoc, FoeDoc } from "@/types/game";

interface BattleIntroProps {
  encounter: EncounterDoc | null;
  foe: FoeDoc | null;
  questionCount: number;
  onStartBattle: () => void;
}

export function BattleIntro({ encounter, foe, questionCount, onStartBattle }: BattleIntroProps) {
  const heroImage = encounter?.imageUrl || foe?.imageUrl;
  const displayEmoji = encounter?.emoji || "👹";

  return (
    <main className="min-h-screen bg-gray-100 dark:bg-gray-900 flex items-center justify-center p-4 transition-colors duration-500">
      <div className="max-w-lg w-full bg-white dark:bg-gray-800 dark:text-gray-100 rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 border border-gray-200 dark:border-gray-700">
        <div className="relative h-64 w-full bg-gray-900">
          {heroImage ? (
            <img 
              src={heroImage} 
              alt="Enemy" 
              className="w-full h-full object-cover opacity-90 hover:scale-105 transition-transform duration-700 ease-in-out" 
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-800 via-slate-900 to-black">
              <div className="absolute opacity-20 w-48 h-48 bg-blue-500 blur-3xl rounded-full -top-10 -left-10"></div>
              <div className="absolute opacity-20 w-48 h-48 bg-purple-500 blur-3xl rounded-full bottom-0 right-0"></div>
              <span className="relative z-10 text-8xl filter drop-shadow-2xl animate-pulse-slow">
                {displayEmoji}
              </span>
            </div>
          )}
          <div className="absolute bottom-0 left-0 w-full bg-gradient-to-t from-black/95 via-black/70 to-transparent pt-20 pb-6 px-8">
            <h1 className="text-3xl font-black text-white uppercase tracking-wider drop-shadow-md">
              {encounter?.title || foe?.name || "Battle"}
            </h1>
            <p className="text-slate-300 text-sm font-bold flex items-center gap-2">
              <span className="bg-red-600 text-white px-2 py-0.5 rounded text-[10px] tracking-tighter">ENEMY</span> 
              {foe?.name || "Unknown Foe"}
            </p>
          </div>
        </div>

        <div className="p-8 space-y-6 bg-white dark:bg-gray-800">
          <div className="relative pl-4 border-l-4 border-slate-300 dark:border-slate-500">
            <p className="text-gray-600 dark:text-gray-300 text-lg leading-relaxed italic">
              "{encounter?.description || "A shadow moves in the darkness. Prepare yourself..."}"
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-50 dark:bg-gray-900/40 p-3 rounded-xl border border-slate-100 dark:border-gray-700 flex flex-col items-center justify-center text-center">
                  <span className="text-[10px] font-black text-slate-400 dark:text-gray-500 uppercase tracking-widest mb-1">Enemy Stats</span>
                  <div className="text-sm font-bold flex flex-wrap justify-center gap-x-3">
                    <span className="text-green-600 dark:text-green-400">❤ {foe?.maxHp || 50}</span>
                    <span className="text-red-600 dark:text-red-400">⚔️ {foe?.attackDamage || 5}</span>
                  </div>
              </div>

              <div className="bg-slate-50 dark:bg-gray-900/40 p-3 rounded-xl border border-slate-100 dark:border-gray-700 flex flex-col items-center justify-center text-center">
                  <span className="text-[10px] font-black text-slate-400 dark:text-gray-500 uppercase tracking-widest mb-1">Rewards</span>
                  <div className="flex flex-col items-center">
                      <span className="text-xl font-bold text-purple-600 dark:text-purple-400">+{encounter?.winRewardXp || 0} XP</span>
                      <span className="text-sm font-bold text-yellow-600 dark:text-yellow-500">+{encounter?.winRewardGold || 0} Gold</span>
                  </div>
              </div>
          </div>

          <p className="text-center text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            You have <span className="text-red-600 dark:text-red-500 text-sm px-1">{questionCount} Turns</span> to defeat this enemy!
          </p>

          <button
            onClick={onStartBattle}
            className="group relative w-full overflow-hidden rounded-2xl bg-black dark:bg-white text-white dark:text-black px-8 py-4 shadow-xl transition-all hover:bg-gray-800 dark:hover:bg-gray-100 hover:shadow-2xl active:scale-[0.98]"
          >
            <div className="relative z-10 flex items-center justify-center gap-2">
              <span className="text-xl font-black tracking-widest">FIGHT!</span>
              <span className="text-2xl group-hover:translate-x-1 transition-transform">⚔️</span>
            </div>
          </button>
        </div>
      </div>
    </main>
  );
}
