export function Input({ label, className, ...props }: any) {
    return (
      <div className="mb-2">
        {label && (
          <label className="block text-xs font-bold text-gray-500 uppercase mb-1 dark:text-gray-400">
            {label}
          </label>
        )}
        <input 
          className={`w-full p-2 border rounded-lg text-sm bg-white border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 
                     dark:bg-gray-700 dark:border-gray-600 dark:text-white dark:placeholder-gray-400 transition-colors ${className || ""}`} 
          {...props} 
        />
      </div>
    );
  }