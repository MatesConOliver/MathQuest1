
import { Character } from "@/types/game";

interface VictoryScreenProps {
  character: Character | null;
  levelUpData: { oldLvl: number, newLvl: number, hpGain: number, pointsGain: number } | null;
  lootDrops: string[];
  onFightAgain: () => void;
  onReturnToMap: () => void;
  xpReward: number;
  goldReward: number;
  skillGains: {[key: string]: number} | null;
}

export function VictoryScreen({ character, levelUpData, lootDrops, onFightAgain, onReturnToMap, xpReward, goldReward, skillGains }: VictoryScreenProps) {
  const data = levelUpData as any;

  const hpGain = data?.hpGain || 0;
  
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-4 bg-yellow-50 dark:bg-gray-900 transition-colors">
      <div className="bg-white dark:bg-gray-800 dark:text-gray-100 p-8 rounded-3xl shadow-xl border-4 border-yellow-400 dark:border-yellow-600 text-center max-w-sm w-full space-y-6 animate-in zoom-in duration-300">
        <div className="text-6xl animate-bounce">🎉</div>
        <div className="text-center">
          <h1 className="text-4xl font-black text-yellow-600 dark:text-yellow-400 uppercase tracking-widest drop-shadow-sm">Victory!</h1>
          <p className="text-gray-500 dark:text-gray-400 font-bold mt-2 uppercase text-sm tracking-tighter">Level {character?.level || 1}</p>
        </div>

        <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-xl p-4 border border-yellow-200 dark:border-yellow-700/50 space-y-2 text-left">
            <div className="font-bold text-yellow-800 dark:text-yellow-200 uppercase text-xs tracking-wider mb-2 text-center">Rewards</div>
            <div className="flex justify-between items-center px-2">
                <span className="font-bold text-gray-600 dark:text-gray-400">XP Gained</span>
                <span className="font-bold text-blue-600 dark:text-blue-400 text-lg">+{xpReward}</span>
            </div>
            <div className="flex justify-between items-center px-2">
                <span className="font-bold text-gray-600 dark:text-gray-400">Gold Found</span>
                <span className="font-bold text-yellow-600 dark:text-yellow-400 text-lg">🪙 +{goldReward}</span>
            </div>
            {skillGains && Object.keys(skillGains).length > 0 && (
                <div className="pt-1">
                    <div className="font-bold text-gray-500 dark:text-gray-400 text-xs px-2">Skill Gains</div>
                    {Object.entries(skillGains).map(([skill, value]) => (
                        <div className="flex justify-between items-center px-2 text-sm" key={skill}>
                            <span className="text-gray-500 dark:text-gray-300 capitalize">{skill.replace(/([A-Z])/g, ' $1')}</span>
                            <span className="font-semibold text-purple-500 dark:text-purple-400">+{value}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>

        {data?.newLvl > data?.oldLvl && (
          <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-xl p-4 border border-yellow-200 dark:border-yellow-700/50 space-y-3">
              <div className="font-bold text-yellow-800 dark:text-yellow-200 uppercase text-xs tracking-wider mb-2">Level Up Bonuses</div>
              <div className="flex justify-between items-center px-4">
                <span className="font-bold text-gray-600 dark:text-gray-400">Max Health</span>
                <span className="font-black text-green-600 dark:text-green-400 text-xl">+{hpGain} 💚</span>
              </div>
              <div className="flex justify-between items-center px-4 bg-yellow-100 dark:bg-yellow-800/30 rounded-lg py-2">
                <span className="font-bold text-gray-700 dark:text-gray-300">Upgrade Points</span>
                <span className="font-black text-yellow-700 dark:text-yellow-400 text-xl">+{data.pointsGain} 🆙</span>
              </div>
              <div className="text-[10px] text-center text-gray-400 italic">Visit Character Page to spend points!</div>
          </div>
        )}
        
        {lootDrops.length > 0 && (
           <div className="text-sm font-bold text-gray-500 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 p-2 rounded">
              Found: {lootDrops.join(", ")}
           </div>
        )}

        <div className="pt-4 flex flex-col gap-2">
          <button 
            onClick={onReturnToMap}
            className="w-full bg-black text-white hover:bg-gray-800 dark:bg-white dark:text-black dark:hover:bg-gray-200 py-4 rounded-xl font-bold text-xl hover:scale-105 transition-transform shadow-lg"
          >
            Collect Loot & Return ➡️
          </button>
          <button 
            onClick={onFightAgain}
            className="w-full bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600 py-2 rounded-xl font-bold text-md transition-transform"
          >
            Fight Again
          </button>
        </div>
      </div>
    </main>
  );
}
