"use client";

import { useEffect, useState } from "react";
import { auth, db } from "@/lib/firebase"; 
import { onAuthStateChanged, signOut, User } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function HomePage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [characterName, setCharacterName] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        router.push("/login"); // Redirect if not logged in
        return;
      }
      setUser(u);
      
      // Fetch Character Name for a nice greeting
      try {
        const snap = await getDoc(doc(db, "characters", u.uid));
        if (snap.exists()) setCharacterName(snap.data().name);
      } catch (e) {
        console.error("Error fetching char", e);
      }
      
      setLoading(false);
    });
    return () => unsub();
  }, [router]);

  const handleLogout = async () => {
    await signOut(auth);
    router.push("/login");
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 text-gray-500 dark:text-gray-400 animate-pulse font-bold">
      Loading World...
    </div>
  );

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col items-center py-12 px-6 transition-colors duration-300">
      <div className="max-w-md w-full space-y-8 text-center">
        
        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-4xl font-extrabold text-gray-900 dark:text-white">MathQuest ⚔️</h1>
          <p className="text-gray-600 dark:text-gray-300">
            Welcome back, <span className="font-bold text-blue-600 dark:text-blue-400">{characterName || "Hero"}</span>.
          </p>
        </div>

        {/* Navigation Grid */}
        <div className="grid gap-4">
          
          {/* Main Action: MAP */}
          <Link 
            href="/map" 
            className="group relative p-6 bg-white dark:bg-gray-800 border-2 border-black dark:border-gray-500 rounded-2xl shadow-sm hover:shadow-md hover:-translate-y-1 transition-all"
          >
            <div className="text-3xl mb-2 group-hover:scale-110 transition-transform duration-300">🗺️</div>
            <h3 className="text-xl font-bold text-gray-900 dark:text-white">Battle Map</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">Select a level and fight foes!</p>
          </Link>

          {/* Secondary Actions */}
          <div className="grid grid-cols-2 gap-4">
            <Link 
              href="/character" 
              className="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition"
            >
              <div className="text-2xl mb-1">👤</div>
              <div className="font-bold text-gray-900 dark:text-gray-200">Character</div>
            </Link>

            <Link 
              href="/shop" 
              className="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition"
            >
              <div className="text-2xl mb-1">🛒</div>
              <div className="font-bold text-gray-900 dark:text-gray-200">Shop</div>
            </Link>
          </div>

          <Link href="/gm" className="p-3 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
             (GM Panel)
          </Link>
        </div>

        {/* Footer Actions */}
        <button 
          onClick={handleLogout}
          className="text-red-500 dark:text-red-400 text-sm font-bold hover:underline mt-8"
        >
          Logout
        </button>

      </div>
    </main>
  );
}