
export function HealthBar({ current, max, label }: { current: number; max: number; label: string }) {
  const pct = Math.max(0, Math.min(100, (current / max) * 100));
  
  let colorClass = "bg-green-500";
  if (pct <= 50) colorClass = "bg-orange-500";
  if (pct <= 20) colorClass = "bg-red-600 animate-pulse";

  return (
    <div className="w-full space-y-2">
      <div className="flex justify-between items-center">
        <span className="text-xs font-bold uppercase text-gray-400 dark:text-gray-400">{label}</span>
        <span className="text-sm font-bold text-gray-800 dark:text-gray-200">{current}/{max} HP</span>
      </div>
      
      <div className="h-4 w-full bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden border border-gray-300 dark:border-gray-600 relative shadow-inner">
        <div 
          className={`h-full ${colorClass} transition-all duration-500 ease-out`} 
          style={{ width: `${pct}%` }} 
        />
      </div>
    </div>
  );
}

export function TimeBar({ current, max }: { current: number; max: number }) {
  const safeMax = max > 0 ? max : 30;
  const pct = Math.max(0, (current / safeMax) * 100);

  const minutes = Math.floor(current / 60);
  const seconds = Math.ceil(current % 60);
  const timeString = `${minutes}:${seconds.toString().padStart(2, '0')}`;

  let colorClass = "bg-blue-500"; 
  if (pct <= 50) colorClass = "bg-orange-400";
  if (pct <= 15) colorClass = "bg-red-700 animate-pulse";
  
  return (
    <div className="w-full flex flex-col gap-1">
      <div className="flex justify-between items-end px-1">
        <span className="text-xs font-bold uppercase text-gray-400 dark:text-gray-400 tracking-wider">Time Remaining</span>
        <span className={`text-2xl font-black ${current <= 5 ? 'text-red-600 dark:text-red-500' : 'text-gray-700 dark:text-gray-100'}`}>
           {timeString}
        </span>
      </div>
      
      <div className="h-4 w-full bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden border border-gray-300 dark:border-gray-600 relative shadow-inner">
        <div 
          className={`h-full ${colorClass} transition-all duration-1000 ease-linear`} 
          style={{ width: `${pct}%` }} 
        />
      </div>
    </div>
  );
}
