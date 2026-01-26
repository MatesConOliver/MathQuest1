'use client';

import { useEffect, useState } from "react";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged, User } from "firebase/auth";
import { collection, getDocs, orderBy, query, doc, getDoc, where } from "firebase/firestore";
import Link from "next/link";
import { GameLocation, EncounterDoc, Character, SubArea, UnlockedSubArea, CharacterSkills } from "@/types/game";
import { useAudio } from "@/context/AudioContext";
import { MAP_LOCATIONS, MapLocationMeta } from "@/config/mapLayout";
import classNames from "classnames";

// --- HELPER FUNCTIONS ---

function getMapMetaForLocation(locationId: string): MapLocationMeta | null {
  const meta = MAP_LOCATIONS.find((m) => m.locationId === locationId);
  return meta || null;
}

function isSubAreaUnlocked(subArea: SubArea, character: Character, unlockedSubAreas: { [key: string]: UnlockedSubArea }): boolean {
  if (unlockedSubAreas[subArea.id]) return true;
  const reqs = subArea.unlockRequirements;
  if (!reqs) return true;

  if (reqs.storyFlags && reqs.storyFlags.length > 0) {
    const hasAllFlags = reqs.storyFlags.every(flag => character.storyFlags?.includes(flag));
    if (!hasAllFlags) return false;
  }

  if (reqs.skills) {
    for (const key in reqs.skills) {
      const skill = key as keyof CharacterSkills;
      const requiredLevel = reqs.skills[skill]!;
      if ((character.skills[skill] || 0) < requiredLevel) return false;
    }
  }
  return true;
}

export default function MapPage() {
  const { playTrack } = useAudio()!;

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // --- Game Data State ---
  const [locations, setLocations] = useState<GameLocation[]>([]);
  const [character, setCharacter] = useState<Character | null>(null);
  const [unlockedSubAreas, setUnlockedSubAreas] = useState<{ [key: string]: UnlockedSubArea }>({});
  
  // State for the side panel content
  const [panelSubAreas, setPanelSubAreas] = useState<SubArea[]>([]);
  const [panelEncounters, setPanelEncounters] = useState<EncounterDoc[]>([]);
  const [panelLoading, setPanelLoading] = useState(false);

  // --- UI & Animation State ---
  const [revealedLocations, setRevealedLocations] = useState(new Set<string>());
  const [animateFog, setAnimateFog] = useState(false);
  const [pendingReveal, setPendingReveal] = useState(false);
  const [mapMounted, setMapMounted] = useState(false);
  const [pulsingLocations, setPulsingLocations] = useState<Set<string>>(new Set());

  // --- Navigation State ---
  const [selectedLocation, setSelectedLocation] = useState<GameLocation | null>(null);
  const [selectedSubArea, setSelectedSubArea] = useState<SubArea | null>(null);

  const selectedLocationMeta = selectedLocation ? getMapMetaForLocation(selectedLocation.id) : null;
  const worldUnlocked = (character?.encounterWins?.['1jnYA8nD0PRaxu7Dezhs'] ?? 0) >= 1;

  // --- DATA FETCHING --- 

  useEffect(() => {
    playTrack("/the-minstrels-return-loopable-fantasy-medieval-rpg-music-447849.mp3");
    setMapMounted(true);
    if (sessionStorage.getItem("pendingFogReveal") === "true") {
      setPendingReveal(true);
      sessionStorage.removeItem("pendingFogReveal");
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (!currentUser) {
        // Clear all state on logout
        setLoading(false);
        setCharacter(null);
        setLocations([]);
        setUnlockedSubAreas({});
        setPanelSubAreas([]);
        setPanelEncounters([]);
        setSelectedLocation(null);
        setSelectedSubArea(null);
      }
    });
    return () => unsubscribe();
  }, []);

  // Fetch core data once user is available
  useEffect(() => {
    if (!user) return;

    const fetchCoreData = async () => {
      setLoading(true);
      try {
        const [charSnap, locSnap, unlockedSnap] = await Promise.all([
          getDoc(doc(db, "characters", user.uid)),
          getDocs(query(collection(db, "locations"), orderBy("order"))),
          getDocs(collection(db, `characters/${user.uid}/unlockedSubAreas`))
        ]);

        if (charSnap.exists()) setCharacter(charSnap.data() as Character);
        setLocations(locSnap.docs.map(d => ({ ...d.data(), id: d.id } as GameLocation)));
        
        const unlockedData: { [key: string]: UnlockedSubArea } = {};
        unlockedSnap.forEach(doc => { unlockedData[doc.id] = doc.data() as UnlockedSubArea });
        setUnlockedSubAreas(unlockedData);

      } catch (err) {
        console.error("Error loading core map data:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchCoreData();
  }, [user]);

  // Fetch sub-areas when a location is selected
  useEffect(() => {
    if (!selectedLocation) {
      setPanelSubAreas([]);
      return;
    }

    const fetchSubAreas = async () => {
      setPanelLoading(true);
      try {
        const q = query(
          collection(db, "subAreas"), 
          where("locationId", "==", selectedLocation.id), 
          orderBy("order")
        );
        const snap = await getDocs(q);
        const subAreas = snap.docs.map(d => ({ ...d.data(), id: d.id } as SubArea));
        setPanelSubAreas(subAreas);
      } catch (err) {
        console.error("Error fetching sub-areas:", err);
        setPanelSubAreas([]);
      } finally {
        setPanelLoading(false);
      }
    };

    fetchSubAreas();
  }, [selectedLocation]);

  // Fetch encounters when a sub-area is selected
  useEffect(() => {
    if (!selectedSubArea) {
      setPanelEncounters([]);
      return;
    }

    const fetchEncounters = async () => {
      setPanelLoading(true);
      try {
        const q = query(
          collection(db, "encounters"), 
          where("subAreaId", "==", selectedSubArea.id), 
          orderBy("order")
        );
        const snap = await getDocs(q);
        const encounters = snap.docs.map(d => ({ ...d.data(), id: d.id } as EncounterDoc));
        setPanelEncounters(encounters);
      } catch (err) {
        console.error("Error fetching encounters:", err);
        setPanelEncounters([]);
      } finally {
        setPanelLoading(false);
      }
    };

    fetchEncounters();
  }, [selectedSubArea]);


  // --- ANIMATION & DEV WARNINGS (omitted for brevity in this explanation, but included in code) ---
  useEffect(() => {
      if (selectedLocation && !selectedLocationMeta) {
          console.warn(`[Dev Warning] No map metadata found for location ID "${selectedLocation.id}".`);
      }
  }, [selectedLocation, selectedLocationMeta]);

  useEffect(() => {
    if (mapMounted && worldUnlocked && !pendingReveal) {
      setRevealedLocations(prev => {
        const next = new Set(prev);
        MAP_LOCATIONS.forEach(meta => { if (meta.initiallyHidden) next.add(meta.locationId) });
        return next;
      });
    }
  }, [mapMounted, worldUnlocked, pendingReveal]);

  // --- EVENT HANDLERS ---
  const handleLocationClick = (loc: GameLocation) => {
    setSelectedLocation(loc);
    setSelectedSubArea(null); // Always reset sub-area when a new location is clicked
  };

  const handlePanelClose = () => {
    setSelectedLocation(null);
    setSelectedSubArea(null);
  }

  if (loading || !character) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-gray-900">
        <div className="animate-pulse flex flex-col items-center gap-2">
          <span className="text-4xl">🗺️</span>
          <span className="text-gray-400 font-bold tracking-widest">LOADING MAP...</span>
        </div>
      </div>
    );
  }
  
  // Determine what the panel should show
  const showSubAreaList = panelSubAreas.length > 0 && !selectedSubArea;

  return (
    <main className="min-h-screen bg-gray-900 md:flex">
      {/* --- MAP + HEADER --- */}
      <div className="flex-grow p-4 md:p-8">
          {/* ... Map rendering logic (no changes here) ... */}
          <div className="max-w-7xl mx-auto h-full flex flex-col">
          <header className="flex justify-between items-end pb-4 border-b border-gray-700">
             <div>
              <h1 className="text-3xl md:text-4xl font-black text-white">World Map</h1>
              <p className="text-gray-200 font-medium">Select a region to explore</p>
            </div>
            <Link href="/" className="btn-secondary-sm">🏠 Main menu</Link>
          </header>

          <div
            className="relative w-full aspect-[16/9] rounded-xl overflow-hidden mt-6 bg-cover bg-center transition-all duration-500 ease-in-out"
            style={{
              backgroundImage: "url('https://firebasestorage.googleapis.com/v0/b/pokematicos.firebasestorage.app/o/The_Primordial_Equation_Backgrounds%2Fmap%20background%201.png?alt=media&token=38144b3f-4abf-475f-81f6-96030d482d38')",
              transform: selectedLocation ? "scale(1.15)" : "scale(1)",
              transformOrigin: selectedLocationMeta ? `${selectedLocationMeta.x * 100}% ${selectedLocationMeta.y * 100}%` : "50% 50%",
            }}
          >
            {locations.map((loc) => {
              const mapMeta = getMapMetaForLocation(loc.id);
              if (!mapMeta) return null;

              const isInitiallyFogged = mapMeta.initiallyHidden;
              const shouldShowFog = isInitiallyFogged && (!mapMounted || animateFog || !revealedLocations.has(loc.id));
              const isClickable = !shouldShowFog;

              return (
                <button
                  key={loc.id}
                  onClick={() => isClickable && handleLocationClick(loc)}
                  title={isClickable ? loc.name : "The world is still obscured…"}
                  disabled={!isClickable}
                  className={classNames(
                    `group absolute w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300 ease-out focus:outline-none`,
                    { 'opacity-90 cursor-not-allowed': !isClickable, 'opacity-90 hover:opacity-100 hover:scale-110 hover:ring-4 hover:ring-blue-300/60 cursor-pointer': isClickable },
                    { 'animate-discovery-pulse': pulsingLocations.has(loc.id) }
                  )}
                  style={{ left: `${mapMeta.x * 100}%`, top: `${mapMeta.y * 100}%`, transform: "translate(-50%, -50%)" }}
                >
                  <div className="w-full h-full rounded-full ring-2 ring-white/50 backdrop-blur-sm bg-black/30 flex items-center justify-center transition-transform duration-300 ease-out group-hover:scale-110">
                    <span className="text-2xl select-none">{loc.name.includes("Forest") ? "🌲" : loc.name.includes("Library") ? "📚" : loc.name.includes("Cave") ? "🦇" : loc.name.includes("Mountain") ? "⛰️" : loc.name.includes("Peak") ? "🏔️" : loc.name.includes("polis") ? "🏙️" : "📍"}</span>
                  </div>
                  {shouldShowFog && (
                    <div className={classNames("absolute inset-0 z-10 bg-gray-900/70 rounded-full backdrop-blur-sm flex items-center justify-center pointer-events-none", { 'animate-fog-reveal': animateFog })} style={{ animationDelay: "100ms" }}>
                      <span className="text-9xl">{mapMeta.fogType === "clouds" ? "☁️" : "🌫️"}</span>
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
          <div className="w-full h-full flex flex-col bg-gray-800 text-white">
            <button onClick={handlePanelClose} className="absolute top-4 right-4 z-10 w-8 h-8 flex items-center justify-center bg-gray-700 hover:bg-red-500 rounded-full transition-colors md:hidden">✕</button>

            {selectedLocation.imageUrl && <img src={selectedLocation.imageUrl} alt={selectedLocation.name} className="w-full h-48 object-cover" />}

            <div className="p-6 space-y-4 overflow-y-auto flex-grow">
              <h2 className="text-3xl font-black text-white">{selectedSubArea ? selectedSubArea.name : selectedLocation.name}</h2>
              <p className="text-gray-300 font-light text-base leading-relaxed">{selectedSubArea ? selectedSubArea.description : selectedLocation.description}</p>
              
              <hr className="border-gray-600" />

              {/* View: Sub-Areas OR Encounters */}
              {showSubAreaList ? (
                  <div>
                      <h3 className="text-lg font-bold text-gray-200 mb-3">Explore Area</h3>
                      <div className="space-y-3">
                          {panelSubAreas.map(sa => {
                              const isUnlocked = isSubAreaUnlocked(sa, character, unlockedSubAreas);
                              const skillReqs = sa.unlockRequirements?.skills ? Object.entries(sa.unlockRequirements.skills).map(([s,l]) => `${s.charAt(0).toUpperCase() + s.slice(1)}: Lvl ${l}`).join(', ') : null;
                              return (
                                <button key={sa.id} onClick={() => isUnlocked && setSelectedSubArea(sa)} disabled={!isUnlocked} className="w-full text-left flex items-center justify-between p-4 bg-gray-700/50 border-2 border-gray-600 rounded-2xl transition-all group disabled:opacity-50 disabled:cursor-not-allowed enabled:hover:border-blue-400 enabled:hover:shadow-md">
                                    <div>
                                        <h4 className="font-bold text-gray-100">{sa.name}</h4>
                                        {!isUnlocked && (
                                            <div className="text-xs text-red-400 font-semibold mt-1">
                                                {sa.unlockRequirements?.storyFlags ? `Requires flag: ${sa.unlockRequirements.storyFlags.join(', ')}` : skillReqs ? `Requires: ${skillReqs}`: 'Locked'}
                                            </div>
                                        )}
                                    </div>
                                    {isUnlocked && <span className="font-bold text-lg">›</span>}
                                </button>
                              )
                          })}
                      </div>
                  </div>
              ) : (
                  <div>
                      {selectedSubArea && (
                          <button onClick={() => setSelectedSubArea(null)} className="text-sm text-gray-300 hover:text-white font-bold mb-4">‹ Back to {selectedLocation.name}</button>
                      )}
                      <h3 className="text-lg font-bold text-gray-200 mb-3">Available Battles</h3>
                      <div className="space-y-3">
                          {panelLoading ? (
                               <div className="text-center py-10 text-gray-400 italic">Scouting...</div>
                          ) : panelEncounters.length === 0 ? (
                              <div className="text-center py-10 text-gray-400 italic">No enemies spotted here.</div>
                          ) : (
                              panelEncounters.map((enc) => (
                                  <div key={enc.id} title={enc.description} className="flex items-center justify-between p-4 bg-gray-700/50 border-2 border-gray-600 rounded-2xl hover:border-blue-400 hover:shadow-md transition-all group">
                                      <div className="flex items-center gap-3 min-w-0 mr-3">
                                          <div className="w-10 h-10 bg-gray-600 rounded-full flex items-center justify-center text-lg shrink-0">{enc.emoji || '⚔️'}</div>
                                          <div className="min-w-0">
                                              <h3 className="font-bold text-gray-100 truncate">{enc.title}</h3>
                                              <div className="text-xs text-gray-400 font-medium flex items-center gap-3">
                                                  <span>XP: <span className="text-purple-400 font-bold">+{enc.winRewardXp || 0}</span></span>
                                                  <span>Gold: <span className="text-yellow-400 font-bold">+{enc.winRewardGold || 0}</span></span>
                                              </div>
                                          </div>
                                      </div>
                                      <Link href={`/play?id=${enc.id}`} className="shrink-0 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl shadow-sm active:scale-95 transition-all">FIGHT</Link>
                                  </div>
                              ))
                          )}
                      </div>
                  </div>
              )}
            </div>

            <div className="p-4 bg-gray-900/50 border-t border-gray-700 text-center shrink-0">
              <button onClick={handlePanelClose} className="text-sm text-gray-400 hover:text-white font-bold transition-colors hidden md:block">Close Panel</button>
            </div>
          </div>
        </aside>
      )}
    </main>
  );
}
