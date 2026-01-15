
import { EncounterDoc } from "@/types/game";

interface LobbyProps {
  encounters: EncounterDoc[];
  onStartEncounter: (encounter: EncounterDoc) => void;
  msg?: string;
}

export function Lobby({ encounters, onStartEncounter, msg }: LobbyProps) {
  return (
    <main className="p-6 max-w-2xl mx-auto space-y-6">
      <h1 className="text-3xl font-bold text-center mb-8 dark:text-white">Choose Your Battle ⚔️</h1>
      
      {msg && (
        <div className="p-4 bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 font-bold rounded-xl text-center animate-pulse">
            {msg}
        </div>
      )}
      
      <div className="grid gap-4">
        {encounters.map(enc => (
          <div 
            key={enc.id} 
            className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4"
          >
            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-bold text-lg text-gray-800 dark:text-gray-100">{enc.title}</h3>
                  <span className="text-[10px] bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded text-gray-500 dark:text-gray-300 font-bold uppercase tracking-wider">
                    {enc.questionTag}
                  </span>
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-3">
                <span>XP: <span className="text-purple-600 dark:text-purple-400 font-bold">+{enc.winRewardXp || 0}</span></span>
                <span>Gold: <span className="text-yellow-600 dark:text-yellow-400 font-bold">+{enc.winRewardGold || 0}</span></span>
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
        ))}
      </div>
    </main>
  );
}
