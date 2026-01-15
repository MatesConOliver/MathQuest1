"use client";

import { useEffect, useState } from "react";
import { auth, db, functions } from "@/lib/firebase"; 
import { onAuthStateChanged, signOut, User } from "firebase/auth";
import { doc, getDoc, updateDoc, arrayUnion } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { StoryEvent, Character } from "@/types/game";
import { StoryPlayer } from "@/components/StoryPlayer";

const checkAndGetLoginStory = httpsCallable(functions, 'checkAndGetLoginStory');

export default function HomePage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [character, setCharacter] = useState<Character | null>(null);
  const [loading, setLoading] = useState(true);
  const [storyToPlay, setStoryToPlay] = useState<StoryEvent | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        router.push("/login");
        return;
      }
      setUser(u);
      
      try {
        const charSnap = await getDoc(doc(db, "characters", u.uid));
        if (!charSnap.exists()) {
            router.push("/character/new");
            return;
        }
        setCharacter(charSnap.data() as Character);

        // --- Check for a story using the cloud function ---
        const storyResult = await checkAndGetLoginStory();
        if (storyResult.data) {
            setStoryToPlay(storyResult.data as StoryEvent);
        }

      } catch (e) {
        console.error("Error during initial load:", e);
      } finally {
        setLoading(false);
      }
    });
    return () => unsub();
  }, [router]);

  const handleStoryComplete = async () => {
    if (!user || !storyToPlay) return;

    try {
        await updateDoc(doc(db, "characters", user.uid), {
            completedStoryEvents: arrayUnion(storyToPlay.id)
        });
        setCharacter(prev => prev ? ({ ...prev, completedStoryEvents: [...(prev.completedStoryEvents || []), storyToPlay.id]}) : null);
    } catch(e) {
        console.error("Error updating completed stories", e);
    } finally {
        setStoryToPlay(null);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    router.push("/login");
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 text-gray-500 dark:text-gray-400 animate-pulse font-bold">
      Loading World...
    </div>
  );

  if (storyToPlay) {
    return <StoryPlayer story={storyToPlay} onComplete={handleStoryComplete} />
  }

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col items-center py-12 px-6 transition-colors duration-300">
      <div className="max-w-md w-full space-y-8 text-center">
        
        <div className="space-y-2">
          <h1 className="text-4xl font-extrabold text-gray-900 dark:text-white">MathQuest ⚔️</h1>
          <p className="text-gray-600 dark:text-gray-300">
            Welcome back, <span className="font-bold text-blue-600 dark:text-blue-400">{character?.name || "Hero"}</span>.
          </p>
        </div>

        <div className="grid gap-4">
          
          <Link 
            href="/map" 
            className="group relative p-6 bg-white dark:bg-gray-800 border-2 border-black dark:border-gray-500 rounded-2xl shadow-sm hover:shadow-md hover:-translate-y-1 transition-all"
          >
            <div className="text-3xl mb-2 group-hover:scale-110 transition-transform duration-300">🗺️</div>
            <h3 className="text-xl font-bold text-gray-900 dark:text-white">Battle Map</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">Select a level and fight foes!</p>
          </Link>

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
