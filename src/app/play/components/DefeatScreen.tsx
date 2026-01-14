
import { useRouter } from "next/navigation";

interface DefeatScreenProps {
  msg: string;
  onTryAgain: () => void;
}

export function DefeatScreen({ msg, onTryAgain }: DefeatScreenProps) {
  const router = useRouter();

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-4 bg-red-50 dark:bg-gray-900 transition-colors">
      <div className="bg-white dark:bg-gray-800 dark:text-gray-100 p-8 rounded-3xl shadow-xl border-4 border-red-500 dark:border-red-600 text-center max-w-sm w-full space-y-6 animate-in zoom-in duration-300">
        <div className="text-6xl animate-pulse">💀</div>
        <div className="text-center">
          <h1 className="text-4xl font-black text-red-600 dark:text-red-500 uppercase tracking-widest drop-shadow-md">Defeat</h1>
          <p className="text-gray-500 dark:text-gray-400 font-bold mt-2 italic">"You have fallen..."</p>
        </div>
        <div className="bg-gray-100 dark:bg-gray-700/50 p-4 rounded-xl border border-gray-200 dark:border-gray-600">
           <p className="font-bold text-gray-500 dark:text-gray-400 text-xs uppercase mb-2">Outcome</p>
           <p className="font-bold text-gray-700 dark:text-gray-200">{msg || "HP Critical. Retreating to camp."}</p>
        </div>
        <div className="pt-4 flex flex-col gap-2">
          <button 
            onClick={() => router.push("/map")}
            className="w-full bg-gray-900 text-white hover:bg-black dark:bg-white dark:text-black dark:hover:bg-gray-200 py-4 rounded-xl font-bold text-xl hover:scale-105 transition-transform shadow-lg"
          >
            Return to Map 🗺️
          </button>
          <button 
            onClick={onTryAgain}
            className="w-full bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600 py-2 rounded-xl font-bold text-md transition-transform"
          >
            Try Again
          </button>
        </div>
      </div>
    </main>
  );
}
