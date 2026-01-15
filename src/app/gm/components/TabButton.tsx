export function TabButton({ label, active, onClick }: any) {
    return (
      <button 
        onClick={onClick} 
        className={`px-4 py-2 rounded-lg font-bold text-sm transition-all 
          ${active 
            ? 'bg-black text-white shadow-md dark:bg-white dark:text-black' 
            : 'text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'
          }`}
      >
        {label}
      </button>
    );
  }