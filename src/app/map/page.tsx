"use client";

import { useEffect, useState } from "react";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged, User } from "firebase/auth";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import Link from "next/link";
import { GameLocation, EncounterDoc } from "@/types/game";

export default function MapPage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Data
  const [locations, setLocations] = useState<GameLocation[]>([]);
  const [encounters, setEncounters] = useState<EncounterDoc[]>([]);

  // Navigation State
  const [selectedLocation, setSelectedLocation] = useState<GameLocation | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (!u) { setLoading(false); return; }

      setLoading(true);
      try {
        // 1. Fetch Locations
        const locSnap = await getDocs(query(collection(db, "locations"), orderBy("order")));
        setLocations(locSnap.docs.map(d => ({ ...d.data(), id: d.id } as GameLocation)));

        // 2. Fetch ALL Encounters
        const encSnap = await getDocs(
    query(collection(db, "encounters"), orderBy("title"))
 );
        setEncounters(encSnap.docs.map(d => ({ ...d.data(), id: d.id } as EncounterDoc)));
      } catch (err) {
        console.error("Error loading map:", err);
      } finally {
        setLoading(false);
      }
    });
    return () => unsub();
  }, []);

  // --- LOGIC: Filter battles for the popup ---
  // We do this here so it recalculates instantly when selectedLocation changes
  const locationEncounters = selectedLocation 
    ? encounters.filter(e => e.locationId === selectedLocation.id)
    : [];

  // --- LOADING SCREEN ---
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="animate-pulse flex flex-col items-center gap-2">
        <span className="text-4xl">🗺️</span>
        <span className="text-gray-400 font-bold tracking-widest">LOADING MAP...</span>
      </div>
    </div>
  );

  // --- MAIN RENDER (Combined Map + Popup) ---
  return (
    <main className="min-h-screen bg-slate-100 p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        
        {/* HEADER */}
        <header className="flex justify-between items-end pb-4 border-b border-gray-200">
          <div>
            <h1 className="text-3xl md:text-4xl font-black text-gray-900">World Map</h1>
            <p className="text-gray-500 font-medium">Select a region to explore</p>
          </div>
          <Link href="/" className="px-4 py-2 bg-white text-gray-700 font-bold rounded-xl border-2 border-gray-200 hover:bg-gray-50 text-sm transition-all">
            🏠 Home
          </Link>
        </header>

        {/* LOCATIONS GRID */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {locations.map((loc) => (
            <button
              key={loc.id}
              onClick={() => setSelectedLocation(loc)}
              className="group relative text-left bg-white p-6 rounded-3xl border-2 border-transparent hover:border-blue-500 shadow-sm hover:shadow-xl transition-all duration-300 overflow-hidden"
            >
              <div className="absolute inset-0 bg-blue-50 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              <div className="relative z-10 flex items-start gap-4">
                <div className="text-5xl group-hover:scale-110 transition-transform duration-300">
                   {loc.name.includes("Forest") ? "🌲" : loc.name.includes("Cave") ? "🦇" : "📍"}
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900 group-hover:text-blue-700">{loc.name}</h2>
                  <p className="text-sm text-gray-500 mt-1 leading-relaxed">{loc.description}</p>
                  <div className="mt-3 inline-flex items-center text-xs font-black text-blue-600 uppercase tracking-wider">
                    View Area <span className="ml-1 group-hover:translate-x-1 transition-transform">➜</span>
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* --- THE POPUP OVERLAY (Replaces the old "View 1") --- */}
      {selectedLocation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          
          <div className="bg-white w-full max-w-lg max-h-[85vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            
            {/* Popup Header */}
            <div className="p-6 bg-gray-50 border-b border-gray-100 flex justify-between items-start shrink-0">
              <div>
                <h2 className="text-2xl font-black text-gray-900">{selectedLocation.name}</h2>
                <p className="text-sm text-gray-500 font-medium">Available Battles</p>
              </div>
              <button 
                onClick={() => setSelectedLocation(null)}
                className="w-8 h-8 flex items-center justify-center bg-gray-200 hover:bg-red-100 hover:text-red-600 rounded-full transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Scrollable Battle List */}
            <div className="p-4 overflow-y-auto space-y-3">
              {locationEncounters.length === 0 ? (
                <div className="text-center py-10 text-gray-400 italic">
                  No enemies spotted here yet...
                </div>
              ) : (
                locationEncounters.map((enc) => (
                  <div 
                    key={enc.id} 
                    title={enc.description}
                    className="flex items-center justify-between p-4 bg-white border-2 border-gray-100 rounded-2xl hover:border-blue-400 hover:shadow-md transition-all group"
                  >
                    <div className="flex items-center gap-3 min-w-0 mr-3">
                      <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center text-lg shrink-0">
                        ⚔️
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-bold text-gray-900 truncate">
                          {enc.title || "Unknown Encounter"}
                        </h3>
                        <p className="text-xs text-gray-500 font-medium">
                          Win Reward: {enc.winRewardXp} XP
                        </p>
                      </div>
                    </div>

                    <Link
                      href={`/play?id=${enc.id}`}
                      className="shrink-0 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl shadow-sm active:scale-95 transition-all"
                    >
                      FIGHT
                    </Link>
                  </div>
                ))
              )}
            </div>

            {/* Popup Footer */}
            <div className="p-4 bg-gray-50 border-t border-gray-100 text-center shrink-0">
               <span className="text-xs text-gray-400 uppercase tracking-widest font-bold">
                 Good Luck!
               </span>
            </div>

          </div>
        </div>
      )}

    </main>
  );
}