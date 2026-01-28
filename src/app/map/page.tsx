'use client';

import { useEffect, useState } from "react";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged, User } from "firebase/auth";
import { collection, getDocs, orderBy, query, doc, getDoc, where, updateDoc, arrayUnion } from "firebase/firestore";
import Link from "next/link";
import { GameLocation, EncounterDoc, Character, SubArea, UnlockedSubArea, CharacterSkills } from "@/types/game";
import { useAudio } from "@/context/AudioContext";
import { MAP_LOCATIONS, MapLocationMeta } from "@/config/mapLayout";
import classNames from "classnames";

// --- TYPES ---
type UnlockStatus = 
    | { locked: false }
    | { locked: true; reason: 'story'; }
    | { locked: true; reason: 'skills'; missing: { skill: keyof CharacterSkills, required: number }[] };

// --- HELPER FUNCTIONS ---

function getMapMetaForLocation(locationId: string): MapLocationMeta | null {
  const meta = MAP_LOCATIONS.find((m) => m.locationId === locationId);
  return meta || null;
}

function getUnlockStatus(item: GameLocation | SubArea, character: Character, unlockedSubAreas?: { [key: string]: UnlockedSubArea }): UnlockStatus {
  // Handle specific sub-area direct unlocks (e.g. via an item)
  if ('locationId' in item && unlockedSubAreas?.[item.id]) {
    return { locked: false };
  }

  const reqs = item.unlockRequirements;
  if (!reqs) return { locked: false }; // No requirements

  // 1. Check Story Flags first
  if (reqs.storyFlags && reqs.storyFlags.length > 0) {
    const hasAllFlags = reqs.storyFlags.every(flag => character.storyFlags?.includes(flag));
    if (!hasAllFlags) {
      return { locked: true, reason: 'story' };
    }
  }

  // 2. If story flags are met, check skills
  if (reqs.skills) {
    const missingSkills: { skill: keyof CharacterSkills, required: number }[] = [];
    const skillOrder: (keyof CharacterSkills)[] = ['algebra', 'functions', 'geometry', 'probabilityAndStatistics', 'calculus'];
    for (const skill of skillOrder) {
      const requiredLevel = reqs.skills[skill];
      if (requiredLevel && requiredLevel > 0 && (character.skills[skill] || 0) < requiredLevel) {
        missingSkills.push({ skill, required: requiredLevel });
      }
    }
    if (missingSkills.length > 0) {
      return { locked: true, reason: 'skills', missing: missingSkills };
    }
  }

  return { locked: false };
}


const SKILL_COLORS: { [key in keyof CharacterSkills]?: string } = {
    algebra: 'text-red-400',
    functions: 'text-green-400',
    geometry: 'text-blue-400',
    probabilityAndStatistics: 'text-yellow-400',
    calculus: 'text-violet-400',
};

const formatSkillName = (skill: string) => {
    const spaced = skill.replace(/([A-Z])/g, ' $1');
    return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}


export default function MapPage() {
  const { playTrack } = useAudio()!;

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const [locations, setLocations] = useState<GameLocation[]>([]);
  const [character, setCharacter] = useState<Character | null>(null);
  const [unlockedSubAreas, setUnlockedSubAreas] = useState<{ [key: string]: UnlockedSubArea }>({});
  
  const [panelSubAreas, setPanelSubAreas] = useState<SubArea[]>([]);
  const [panelEncounters, setPanelEncounters] = useState<EncounterDoc[]>([]);
  const [panelLoading, setPanelLoading] = useState(false);

  const [mapMounted, setMapMounted] = useState(false);
  
  const [selectedLocation, setSelectedLocation] = useState<GameLocation | null>(null);
  const [selectedSubArea, setSelectedSubArea] = useState<SubArea | null>(null);

  const [animatingOutLocationIds, setAnimatingOutLocationIds] = useState<Set<string>>(new Set());
  
  const selectedLocationMeta = selectedLocation ? getMapMetaForLocation(selectedLocation.id) : null;

  useEffect(() => {
    playTrack("/the-minstrels-return-loopable-fantasy-medieval-rpg-music-447849.mp3");
    setMapMounted(true);
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (!currentUser) {
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


  useEffect(() => {
      if (selectedLocation && !selectedLocationMeta) {
          console.warn(`[Dev Warning] No map metadata found for location ID "${selectedLocation.id}".`);
      }
  }, [selectedLocation, selectedLocationMeta]);

  useEffect(() => {
    if (!user || !character || locations.length === 0) return;

    const pendingFlag = sessionStorage.getItem("pendingStoryFlag");
    // Check if the character *doesn't* already have the flag to prevent re-animations on refresh
    if (pendingFlag && !character.storyFlags?.includes(pendingFlag)) {
        sessionStorage.removeItem("pendingStoryFlag");

        const unlockedLocation = locations.find(loc => loc.unlockRequirements?.storyFlags?.includes(pendingFlag));

        if (unlockedLocation) {
            // 1. Start the animation by adding the location ID to our animation state
            setAnimatingOutLocationIds(prev => new Set(prev).add(unlockedLocation.id));

            // 2. After the animation duration, update the character data. This will make the cloud unmount.
            setTimeout(() => {
                const doUpdate = async () => {
                    try {
                        await updateDoc(doc(db, "characters", user.uid), {
                            storyFlags: arrayUnion(pendingFlag)
                        });
                        setCharacter(prev => ({...prev!, storyFlags: [...(prev?.storyFlags || []), pendingFlag]}));
                        
                        // 3. Clean up the animation state
                        setAnimatingOutLocationIds(prev => {
                            const newSet = new Set(prev);
                            newSet.delete(unlockedLocation.id);
                            return newSet;
                        });
                    } catch (error) {
                        console.error("Failed to update story flag after animation:", error);
                    }
                };
                doUpdate();
            }, 1200); // This should be slightly longer than the animation duration (1000ms)
        }
    }
  }, [user, character, locations]);


  const handleLocationClick = (loc: GameLocation, status: UnlockStatus) => {
    if (status.locked) return;
    setSelectedLocation(loc);
    setSelectedSubArea(null);
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
  
  const showSubAreaList = panelSubAreas.length > 0 && !selectedSubArea;

  return (
    <main className="min-h-screen bg-gray-900 md:flex">
      <div className="flex-grow p-4 md:p-8">
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

              const unlockStatus = getUnlockStatus(loc, character);
              const isStoryLocked = unlockStatus.locked && unlockStatus.reason === 'story';
              const isSkillLocked = unlockStatus.locked && unlockStatus.reason === 'skills';

              // The very first location should always be visible.
              const isFirstLocation = loc.order === 1;
              const shouldShowFog = !isFirstLocation && isStoryLocked;
              const isClickable = !shouldShowFog && !isSkillLocked;
              
              const title = isSkillLocked 
                ? `Locked. Requires: ${unlockStatus.missing.map(m => `${formatSkillName(m.skill)} Lvl ${m.required}`).join(', ')}` 
                : isStoryLocked
                ? "Keep playing to unlock"
                : loc.name;

              return (
                <button
                  key={loc.id}
                  onClick={() => handleLocationClick(loc, unlockStatus)}
                  title={title}
                  disabled={!isClickable}
                  className={classNames(
                    `group absolute w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300 ease-out focus:outline-none`,
                    { 'opacity-90 cursor-not-allowed': !isClickable },
                    { 'opacity-90 hover:opacity-100 hover:scale-110 hover:ring-4 hover:ring-blue-300/60 cursor-pointer': isClickable },
                  )}
                  style={{ left: `${mapMeta.x * 100}%`, top: `${mapMeta.y * 100}%`, transform: "translate(-50%, -50%)" }}
                >
                  <div className="w-full h-full rounded-full ring-2 ring-white/50 backdrop-blur-sm bg-black/30 flex items-center justify-center transition-transform duration-300 ease-out group-hover:scale-110">
                     {isSkillLocked ? (
                        <span className="text-2xl">🔒</span>
                     ) : (
                        <span className="text-2xl select-none">{loc.name.includes("Forest") ? "🌲" : loc.name.includes("Library") ? "📚" : loc.name.includes("Cave") ? "🦇" : loc.name.includes("Mountain") ? "⛰️" : loc.name.includes("Peak") ? "🏔️" : loc.name.includes("polis") ? "🏙️" : "📍"}</span>
                     )}
                  </div>
                  {/* Animate cloud disappearance */}
                  {((!isFirstLocation && isStoryLocked) || animatingOutLocationIds.has(loc.id)) && (
                      <div className={classNames(
                          "absolute inset-0 z-10 bg-gray-900/70 rounded-full backdrop-blur-sm flex items-center justify-center pointer-events-none",
                          "transition-all duration-1000 ease-in-out", // Animation classes
                          { 
                              'opacity-0 scale-150': animatingOutLocationIds.has(loc.id),
                              'opacity-100 scale-100': !animatingOutLocationIds.has(loc.id)
                          }
                      )}>
                          <span className={classNames("text-9xl transition-transform duration-1000 ease-in-out", {
                              'transform rotate-45 scale-0': animatingOutLocationIds.has(loc.id),
                          })}>
                              ☁️
                          </span>
                      </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {selectedLocation && (
        <aside className="fixed inset-0 z-50 bg-gray-900 animate-in slide-in-from-bottom-full md:slide-in-from-bottom-0 md:slide-in-from-left-full duration-300 md:static md:w-[400px] lg:w-[420px] md:flex-shrink-0 md:border-l md:border-gray-700">
          <div className="w-full h-full flex flex-col bg-gray-800 text-white">
            <button onClick={handlePanelClose} className="absolute top-4 right-4 z-10 w-8 h-8 flex items-center justify-center bg-gray-700 hover:bg-red-500 rounded-full transition-colors md:hidden">✕</button>

            {selectedLocation.imageUrl && <img src={selectedLocation.imageUrl} alt={selectedLocation.name} className="w-full h-48 object-cover" />}

            <div className="p-6 space-y-4 overflow-y-auto flex-grow">
              <h2 className="text-3xl font-black text-white">{selectedSubArea ? selectedSubArea.name : selectedLocation.name}</h2>
              <p className="text-gray-300 font-light text-base leading-relaxed">{selectedSubArea ? selectedSubArea.description : selectedLocation.description}</p>
              
              <hr className="border-gray-600" />

              {showSubAreaList ? (
                  <div>
                      <h3 className="text-lg font-bold text-gray-200 mb-3">Explore Area</h3>
                      <div className="space-y-3">
                          {panelSubAreas.map(sa => {
                              const unlockStatus = getUnlockStatus(sa, character, unlockedSubAreas);

                              if (unlockStatus.locked && unlockStatus.reason === 'story') {
                                  return (
                                      <div key={sa.id} className="w-full text-center flex flex-col items-center justify-center p-4 bg-gray-700/50 border-2 border-gray-600 rounded-2xl opacity-60">
                                          <span className="text-3xl mb-1">☁️</span>
                                          <h4 className="font-bold text-gray-400 text-sm">Locked</h4>
                                          <p className="text-xs text-gray-500">Keep playing to unlock.</p>
                                      </div>
                                  )
                              }

                              return (
                                <button 
                                    key={sa.id} 
                                    onClick={() => !unlockStatus.locked && setSelectedSubArea(sa)} 
                                    disabled={unlockStatus.locked}
                                    className="w-full text-left flex items-center justify-between p-4 bg-gray-700/50 border-2 border-gray-600 rounded-2xl transition-all group disabled:opacity-70 disabled:cursor-not-allowed enabled:hover:border-blue-400 enabled:hover:shadow-md"
                                >
                                    <div>
                                        <h4 className="font-bold text-gray-100">{sa.name}</h4>
                                        {unlockStatus.locked && unlockStatus.reason === 'skills' && (
                                            <div className="text-xs font-semibold mt-2 space-y-1">
                                                <div className="text-gray-400">Requires:</div>
                                                <div className="flex flex-wrap gap-x-4 gap-y-1">
                                                    {unlockStatus.missing.map(({ skill, required }) => (
                                                        <div key={skill} className="flex items-center gap-1.5">
                                                            <span className={classNames("font-bold", SKILL_COLORS[skill] || 'text-gray-300')}>
                                                                {formatSkillName(skill)}: {required}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                     {unlockStatus.locked ? (
                                        <span className="text-2xl pl-4">🔒</span>
                                     ) : (
                                        <span className="font-bold text-lg text-blue-400 group-hover:translate-x-1 transition-transform">›</span>
                                     )}
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
                              panelEncounters.map((enc) => {
                                  if (!enc.id) return null;
                                  const winCount = character.encounterWins?.[enc.id] || 0;
                                  const canSeeRewards = winCount > 0;
                                  const skillRewards = enc.winRewardSkills ? Object.entries(enc.winRewardSkills).filter(([, val]) => val > 0) : [];

                                  return (
                                    <div key={enc.id} title={enc.description} className="flex items-center justify-between p-4 bg-gray-700/50 border-2 border-gray-600 rounded-2xl hover:border-blue-400 hover:shadow-md transition-all group">
                                        <div className="flex items-center gap-3 min-w-0 mr-3">
                                            <div className="w-10 h-10 bg-gray-600 rounded-full flex items-center justify-center text-lg shrink-0">{enc.emoji || '⚔️'}</div>
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <h3 className="font-bold text-gray-100 truncate">{enc.title}</h3>
                                                    {canSeeRewards && (
                                                        <span className="text-xs font-bold text-green-500 bg-green-900/50 px-2 py-0.5 rounded-full">
                                                            🏆 {winCount}
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="text-xs text-gray-400 font-medium flex items-center flex-wrap gap-x-3 gap-y-1 mt-1">
                                                    {canSeeRewards ? (
                                                        <>
                                                            <span>XP: <span className="text-purple-400 font-bold">+{enc.winRewardXp || 0}</span></span>
                                                            <span>Gold: <span className="text-yellow-400 font-bold">+{enc.winRewardGold || 0}</span></span>
                                                            {skillRewards.map(([skill, value]) => (
                                                                <span key={skill}>
                                                                    {formatSkillName(skill)}: <span className="font-bold text-blue-400">+{value}</span>
                                                                </span>
                                                            ))}
                                                        </>
                                                    ) : (
                                                        <span className="italic text-gray-500">(Rewards hidden until first victory)</span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                        <Link href={`/play?id=${enc.id}`} className="shrink-0 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl shadow-sm active:scale-95 transition-all">FIGHT</Link>
                                    </div>
                                  )
                              })
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
