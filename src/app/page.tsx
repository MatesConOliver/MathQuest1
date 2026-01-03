"use client";

import { useEffect, useState } from "react";
import { auth, db } from "@/lib/firebase"; // Make sure path matches your setup
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

  if (loading) return <div className="p-10 text-center">Loading World...</div>;

  return (
    <main className="min-h-screen bg-gray-50 flex flex-col items-center py-12 px-6">
      <div className="max-w-md w-full space-y-8 text-center">
        
        {/* Header */}
        <div>
          <h1 className="text-4xl font-extrabold text-gray-900">MathQuest ⚔️</h1>
          <p className="mt-2 text-gray-600">
            Welcome back, <span className="font-bold text-blue-600">{characterName || "Hero"}</span>.
          </p>
        </div>

        {/* Navigation Grid */}
        <div className="grid gap-4">
          
          <Link href="/map" className="group relative p-6 bg-white border-2 border-black rounded-2xl shadow-sm hover:shadow-md hover:-translate-y-1 transition-all">
            <div className="text-3xl mb-2">🗺️</div>
            <h3 className="text-xl font-bold">Battle Map</h3>
            <p className="text-sm text-gray-500">Select a level and fight foes!</p>
          </Link>

          <div className="grid grid-cols-2 gap-4">
            <Link href="/character" className="p-4 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition">
              <div className="text-2xl mb-1">👤</div>
              <div className="font-bold">Character</div>
            </Link>

            <Link href="/shop" className="p-4 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition">
              <div className="text-2xl mb-1">🛒</div>
              <div className="font-bold">Shop</div>
            </Link>
          </div>

          <Link href="/gm" className="p-3 text-xs text-gray-400 hover:text-gray-600">
             (GM Panel)
          </Link>
        </div>

        {/* Footer Actions */}
        <button 
          onClick={handleLogout}
          className="text-red-500 text-sm font-bold hover:underline mt-8"
        >
          Logout
        </button>

      </div>
    </main>
  );
}