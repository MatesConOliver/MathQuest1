"use client";

import { useEffect, useState } from "react";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged, User } from "firebase/auth";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import Link from "next/link";
import { GameLocation, EncounterDoc } from "@/types/game";
import { useAudio } from "@/context/AudioContext";
import { MAP_LOCATIONS, MapLocationMeta } from "@/config/mapLayout";

function getMapMetaForLocation(locationId: string): MapLocationMeta | null {
  const meta = MAP_LOCATIONS.find((m) => m.locationId === locationId);
  return meta || null;
}

export default function MapPage() {
  const { playTrack } = useAudio()!;

  useEffect(() => {
    playTrack(
      "/the-minstrels-return-loopable-fantasy-medieval-rpg-music-447849.mp3"
    );
  }, []);

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Data
  const [locations, setLocations] = useState<GameLocation[]>([]);
  const [encounters, setEncounters] = useState<EncounterDoc[]>([]);

  // Navigation State
  const [selectedLocation, setSelectedLocation] = useState<GameLocation | null>(
    null
  );

  // Story-based fog gating
  const worldUnlocked = false; // TODO: replace with real story flag driven by encounter with id "l8o4lYWfiyUm2qpqWn2U" having counter >= 1

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (!u) {
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        // 1. Fetch Locations
        const locSnap = await getDocs(
          query(collection(db, "locations"), orderBy("order"))
        );
        setLocations(
          locSnap.docs.map((d) => ({ ...d.data(), id: d.id } as GameLocation))
        );

        // 2. Fetch ALL Encounters
        const encSnap = await getDocs(
          query(collection(db, "encounters"), orderBy("title"))
        );
        setEncounters(
          encSnap.docs.map((d) => ({ ...d.data(), id: d.id } as EncounterDoc))
        );
      } catch (err) {
        console.error("Error loading map:", err);
      } finally {
        setLoading(false);
      }
    });
    return () => unsub();
  }, []);

  // --- LOGIC: Filter battles for the popup ---
  const locationEncounters = selectedLocation
    ? encounters.filter((e) => e.locationId === selectedLocation.id)
    : [];

  // --- LOADING SCREEN ---
  if (loading)
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-gray-900">
        <div className="animate-pulse flex flex-col items-center gap-2">
          <span className="text-4xl">🗺️</span>
          <span className="text-gray-400 font-bold tracking-widest">
            LOADING MAP...
          </span>
        </div>
      </div>
    );

  // --- MAIN RENDER (Combined Map + Popup) ---
  return (
    <main
      className="min-h-screen bg-gray-900 p-4 md:p-8 transition-colors duration-300"
    >
      <div className="max-w-7xl mx-auto">
        {/* HEADER */}
        <header className="flex justify-between items-end pb-4 border-b border-gray-700">
          <div>
            <h1 className="text-3xl md:text-4xl font-black text-white">
              World Map
            </h1>
            <p className="text-gray-200 font-medium">
              Select a region to explore
            </p>
          </div>
          <Link
            href="/"
            className="px-4 py-2 bg-gray-800 text-gray-100 font-bold rounded-xl border-2 border-gray-700 hover:bg-gray-700 text-sm transition-all"
          >
            🏠 Home
          </Link>
        </header>

        {/* MAP AREA */}
        <div
          className="relative w-full aspect-[16/9] rounded-xl overflow-hidden mt-6 bg-cover bg-center"
          style={{
            backgroundImage:
              "url('https://firebasestorage.googleapis.com/v0/b/pokematicos.firebasestorage.app/o/The_Primordial_Equation_Backgrounds%2Fmap%20background%201.png?alt=media&token=38144b3f-4abf-475f-81f6-96030d482d38')",
          }}
        >
          {locations.map((loc) => {
            const mapMeta = getMapMetaForLocation(loc.id);
            if (!mapMeta) return null;

            const isLibrary = loc.id === "library";
            const isFogged = !worldUnlocked && !isLibrary;

            return (
              <button
                key={loc.id}
                onClick={() => !isFogged && setSelectedLocation(loc)}
                title={isFogged ? "The world is still obscured…" : loc.name}
                disabled={isFogged}
                className={`absolute w-10 h-10 rounded-full transition-all duration-300 ease-in-out 
                           flex items-center justify-center
                           focus:ring-4 focus:ring-blue-400 focus:outline-none
                           ${isFogged
                             ? 'pointer-events-none'
                             : 'opacity-80 hover:opacity-100 focus:opacity-100 hover:bg-white/20'
                           }`}
                style={{
                  left: `${mapMeta.x * 100}%`,
                  top: `${mapMeta.y * 100}%`,
                  transform: 'translate(-50%, -50%)',
                }}
              >
                <div className="w-full h-full rounded-full ring-2 ring-white/50 backdrop-blur-sm group-hover:scale-110 transition-transform duration-300 flex items-center justify-center bg-black/20">
                    <span className="text-2xl">
                        {loc.name.includes("Forest")
                          ? "🌲"
                          : loc.name.includes("Library")
                          ? "📚"
                          : loc.name.includes("Cave")
                          ? "🦇"
                          : "📍"}
                      </span>
                </div>
                {isFogged && (
                  <div className="absolute inset-0 bg-gray-900/70 rounded-full backdrop-blur-sm flex items-center justify-center transition-opacity duration-300">
                    <span className="text-xl">
                      {mapMeta.fogType === 'clouds' ? '☁️' : '🌫️'}
                    </span>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* --- THE POPUP OVERLAY --- */}
      {selectedLocation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-gray-800 w-full max-w-lg max-h-[85vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            {/* Popup Header */}
            <div className="p-6 bg-gray-50 dark:bg-gray-900/50 border-b border-gray-100 dark:border-gray-700 flex justify-between items-start shrink-0">
              <div>
                <h2 className="text-2xl font-black text-gray-900 dark:text-white">
                  {selectedLocation.name}
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">
                  Available Battles
                </p>
              </div>
              <button
                onClick={() => setSelectedLocation(null)}
                className="w-8 h-8 flex items-center justify-center bg-gray-200 dark:bg-gray-700 dark:text-gray-200 hover:bg-red-100 hover:text-red-600 rounded-full transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Scrollable Battle List */}
            <div className="p-4 overflow-y-auto space-y-3 bg-white dark:bg-gray-800">
              {locationEncounters.length === 0 ? (
                <div className="text-center py-10 text-gray-400 italic">
                  No enemies spotted here yet...
                </div>
              ) : (
                locationEncounters.map((enc) => (
                  <div
                    key={enc.id}
                    title={enc.description}
                    className="flex items-center justify-between p-4 bg-white dark:bg-gray-700/50 border-2 border-gray-100 dark:border-gray-600 rounded-2xl hover:border-blue-400 hover:shadow-md transition-all group"
                  >
                    <div className="flex items-center gap-3 min-w-0 mr-3">
                      <div className="w-10 h-10 bg-blue-100 dark:bg-gray-600 rounded-full flex items-center justify-center text-lg shrink-0">
                        ⚔️
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-bold text-gray-900 dark:text-gray-100 truncate">
                          {enc.title || "Unknown Encounter"}
                        </h3>
                        <div className="text-xs text-gray-500 dark:text-gray-400 font-medium flex items-center gap-3">
                          <span>
                            XP:{" "}
                            <span className="text-purple-600 dark:text-purple-400 font-bold">
                              +{enc.winRewardXp || 0}
                            </span>
                          </span>
                          <span>
                            Gold:{" "}
                            <span className="text-yellow-600 dark:text-yellow-400 font-bold">
                              +{enc.winRewardGold || 0}
                            </span>
                          </span>
                        </div>
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
            <div className="p-4 bg-gray-50 dark:bg-gray-900/50 border-t border-gray-100 dark:border-gray-700 text-center shrink-0">
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