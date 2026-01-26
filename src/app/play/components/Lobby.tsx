
import { EncounterDoc, FoeDoc } from "@/types/game";

interface LobbyProps {
  encounters: EncounterDoc[];
  onStartEncounter: (encounter: EncounterDoc) => void;
  msg?: string;
  encounterWinCounts: { [key: string]: number };
  getFoe: (id: string) => FoeDoc | undefined;
}

const formatSkillName = (skill: string) => {
    const spaced = skill.replace(/([A-Z])/g, ' $1');
    return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function Lobby({ encounters, onStartEncounter, msg, encounterWinCounts, getFoe }: LobbyProps) {
  return (
    <main className="p-6 max-w-2xl mx-auto space-y-6">
      <h1 className="text-3xl font-bold text-center mb-8 dark:text-white">Choose Your Battle ⚔️</h1>
      
      {msg && (
        <div className="p-4 bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 font-bold rounded-xl text-center animate-pulse">
            {msg}
        </div>
      )}
      
      <div className="grid gap-4">
        {encounters.map(enc => {
          if (!enc.id) return null;
          const winCount = encounterWinCounts[enc.id] || 0;
          const canSeeRewards = winCount > 0;
          const skillRewards = enc.winRewardSkills ? Object.entries(enc.winRewardSkills).filter(([, val]) => val > 0) : [];

          return (
            <div 
              key={enc.id} 
              className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4"
            >
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-bold text-lg text-gray-800 dark:text-gray-100">{enc.title}</h3>
                    <span className="text-[10px] bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded text-gray-500 dark:text-gray-300 font-bold uppercase tracking-wider">
                      {enc.questionTag}
                    </span>
                    {winCount > 0 && (
                        <span className="text-xs font-bold text-green-500 bg-green-100 dark:bg-green-900/50 px-2 py-0.5 rounded-full">
                            🏆 {winCount}
                        </span>
                    )}
                </div>
                
                {/* Rewards Section */}
                <div className="pt-2">
                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Rewards</h4>
                    {canSeeRewards ? (
                        <div className="text-sm text-gray-500 dark:text-gray-400 flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
                            <span>XP: <span className="text-purple-600 dark:text-purple-400 font-bold">+{enc.winRewardXp || 0}</span></span>
                            <span>Gold: <span className="text-yellow-600 dark:text-yellow-400 font-bold">+{enc.winRewardGold || 0}</span></span>
                            {skillRewards.map(([skill, value]) => (
                                <span key={skill}>
                                    {formatSkillName(skill)}: <span className="font-bold text-blue-500">+{value}</span>
                                </span>
                            ))}
                        </div>
                    ) : (
                        <div className="text-sm text-gray-400 dark:text-gray-500 italic mt-1">
                            (hidden until first victory)
                        </div>
                    )}
                </div>

                {/* Foes Section */}
                <div className="pt-2">
                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Foes</h4>
                    <div className="flex flex-wrap gap-2 mt-1">
                        {enc.foes?.map(foeId => {
                            const foe = getFoe(foeId);
                            if (!foe) return <div key={foeId} className="text-xs text-gray-400 italic">...</div>;
                            
                            return (
                                <div key={foeId} className="bg-gray-100 dark:bg-gray-700/70 p-2 rounded-lg text-xs">
                                    <span className="font-bold">{foe.name}</span>
                                    {canSeeRewards ? (
                                        <div className="text-gray-500 dark:text-gray-400">
                                            HP: {foe.maxHp}, ATK: {foe.attackDamage}
                                        </div>
                                    ) : (
                                        <div className="text-gray-400 dark:text-gray-500 italic">
                                            (stats hidden)
                                        </div>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                </div>

              </div>

              <button 
                 onClick={() => onStartEncounter(enc)}
                 className="shrink-0 w-full sm:w-auto bg-black text-white hover:bg-gray-800 dark:bg-white dark:text-black dark:hover:bg-gray-200 font-bold py-3 px-8 rounded-xl transition-transform active:scale-95 flex items-center justify-center gap-2"
              >
                 <span>FIGHT</span>
                 <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                 </svg>
              </button>
            </div>
          )
        })}
      </div>
    </main>
  );
}
