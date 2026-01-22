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

  // Find the metadata (like x,y coordinates) for the selected location.
  const selectedLocationMeta = selectedLocation
    ? getMapMetaForLocation(selectedLocation.id)
    : null;

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
        const fetchedLocations = locSnap.docs.map(
          (d) => ({ ...d.data(), id: d.id } as GameLocation)
        );
        setLocations(fetchedLocations);

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

  const locationEncounters = selectedLocation
    ? encounters.filter((e) => e.locationId === selectedLocation.id)
    : [];

  if (loading) {
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
  }

  return (
    <main className="min-h-screen bg-gray-900 md:flex">
      {/* --- MAP + HEADER (Takes remaining space) --- */}
      <div className="flex-grow p-4 md:p-8">
        <div className="max-w-7xl mx-auto h-full flex flex-col">
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
                transition: "transform 600ms cubic-bezier(0.22, 1, 0.36, 1), transform-origin 600ms ease-out",
              // When a location is selected, we want to zoom into it.
              // A scale of 1.15 gives a slight zoom effect.
              transform: selectedLocation ? "scale(1.15)" : "scale(1)",
              // The transform-origin is key to the focus effect. By setting it to the
              // location's coordinates (as percentages), we make the scale
              // transformation zoom in on that specific point of the map.
              // If no location is selected, we default to the center.
              transformOrigin: selectedLocationMeta
                ? `${selectedLocationMeta.x * 100}% ${
                    selectedLocationMeta.y * 100
                  }%`
                : "50% 50%",
            }}
          >
            {locations.map((loc) => {
              const mapMeta = getMapMetaForLocation(loc.id);
              if (!mapMeta) return null;

              const isFogged = mapMeta.initiallyHidden && !worldUnlocked;

              return (
                <button
                  key={loc.id}
                  onClick={() => !isFogged && setSelectedLocation(loc)}
                  title={isFogged ? "The world is still obscured…" : loc.name}
                  disabled={isFogged}
                  className={`
                    group absolute w-12 h-12 rounded-full
                    flex items-center justify-center
                    transition-all duration-300 ease-out
                    focus:outline-none
                    ${
                      isFogged
                        ? "opacity-90 cursor-not-allowed"
                        : "opacity-90 hover:opacity-100 hover:scale-110 hover:ring-4 hover:ring-blue-300/60 cursor-pointer"
                    }
                  `}
                  style={{
                    left: `${mapMeta.x * 100}%`,
                    top: `${mapMeta.y * 100}%`,
                    transform: "translate(-50%, -50%)",
                  }}
                >
                  <div
                    className="
                      w-full h-full rounded-full
                      ring-2 ring-white/50
                      backdrop-blur-sm
                      bg-black/30
                      flex items-center justify-center
                      transition-transform duration-300 ease-out
                      group-hover:scale-110
                    "
                  >
                    <span className="text-2xl select-none">
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
                    <div className="absolute inset-0 z-10 bg-gray-900/70 rounded-full backdrop-blur-sm flex items-center justify-center transition-opacity duration-300">
                      <span className="text-xl">
                        {mapMeta.fogType === "clouds" ? "☁️" : "🌫️"}
                      </span>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* --- RIGHT-SIDE INFORMATION PANEL --- */}
      {selectedLocation && (
        <aside className="fixed inset-0 z-50 bg-gray-900 animate-in slide-in-from-bottom-full md:slide-in-from-bottom-0 md:slide-in-from-left-full duration-300 md:static md:w-[400px] lg:w-[420px] md:flex-shrink-0 md:border-l md:border-gray-700">
          <div className="w-full h-full overflow-y-auto bg-gray-800 text-white">
            {/* Close button for mobile */}
            <button
              onClick={() => setSelectedLocation(null)}
              className="absolute top-4 right-4 z-10 w-8 h-8 flex items-center justify-center bg-gray-700 hover:bg-red-500 rounded-full transition-colors md:hidden"
            >
              ✕
            </button>

            {/* Banner Image */}
            {selectedLocation.imageUrl && (
              <div className="w-full h-48 bg-gray-700">
                <img
                  src={selectedLocation.imageUrl}
                  alt={selectedLocation.name}
                  className="w-full h-full object-cover"
                />
              </div>
            )}

            {/* Content */}
            <div className="p-6 space-y-4">
              <h2 className="text-3xl font-black text-white">
                {selectedLocation.name}
              </h2>

              <p className="text-gray-300 font-light text-base leading-relaxed">
                {selectedLocation.description}
              </p>

              <hr className="border-gray-600" />

              <div>
                <h3 className="text-lg font-bold text-gray-200 mb-3">
                  Available Battles
                </h3>
                <div className="space-y-3">
                  {locationEncounters.length === 0 ? (
                    <div className="text-center py-10 text-gray-400 italic">
                      No enemies spotted here yet...
                    </div>
                  ) : (
                    locationEncounters.map((enc) => (
                      <div
                        key={enc.id}
                        title={enc.description}
                        className="flex items-center justify-between p-4 bg-gray-700/50 border-2 border-gray-600 rounded-2xl hover:border-blue-400 hover:shadow-md transition-all group"
                      >
                        <div className="flex items-center gap-3 min-w-0 mr-3">
                          <div className="w-10 h-10 bg-gray-600 rounded-full flex items-center justify-center text-lg shrink-0">
                            ⚔️
                          </div>
                          <div className="min-w-0">
                            <h3 className="font-bold text-gray-100 truncate">
                              {enc.title || "Unknown Encounter"}
                            </h3>
                            <div className="text-xs text-gray-400 font-medium flex items-center gap-3">
                              <span>
                                XP:{" "}
                                <span className="text-purple-400 font-bold">
                                  +{enc.winRewardXp || 0}
                                </span>
                              </span>
                              <span>
                                Gold:{" "}
                                <span className="text-yellow-400 font-bold">
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
              </div>
            </div>
            <div className="p-4 bg-gray-900/50 border-t border-gray-700 text-center shrink-0">
              <button
                onClick={() => setSelectedLocation(null)}
                className="text-sm text-gray-400 hover:text-white font-bold transition-colors"
              >
                Close Panel
              </button>
            </div>
          </div>
        </aside>
      )}
    </main>
  );
}
