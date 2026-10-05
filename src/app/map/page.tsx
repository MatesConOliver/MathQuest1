'use client';

import { useCallback, useEffect, useRef, useState } from "react";
import { auth, callApi, db } from "@/lib/firebase";
import { onAuthStateChanged, User } from "firebase/auth";
import { arrayRemove, arrayUnion, collection, getDocs, orderBy, query, doc, getDoc, where, updateDoc } from "firebase/firestore";
import Link from "next/link";
import { GameLocation, EncounterDoc, Character, SubArea, UnlockedSubArea, CharacterSkills, StoryEvent } from "@/types/game";
import { useAudio } from "@/context/AudioContext";
import { MAP_LOCATIONS, MapLocationMeta } from "@/config/mapLayout";
import classNames from "classnames";
import { UnlockStatus, getUnlockStatus } from "@/lib/unlock";
import { StoryPlayer } from "@/components/StoryPlayer";

// --- HELPER FUNCTIONS ---

function getMapMetaForLocation(locationId: string): MapLocationMeta | null {
  const meta = MAP_LOCATIONS.find((m) => m.locationId === locationId);
  return meta || null;
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

const isStoryLockedStatus = (status: UnlockStatus) => status.locked && status.reason === 'story';

const SKILL_ORDER: (keyof CharacterSkills)[] = ['algebra', 'functions', 'geometry', 'probabilityAndStatistics', 'calculus'];


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
  const [codeInput, setCodeInput] = useState("");
  const [codeMessage, setCodeMessage] = useState("");
  const [isRedeeming, setIsRedeeming] = useState(false);
  const [activeStory, setActiveStory] = useState<StoryEvent | null>(null);
  
  const [selectedLocation, setSelectedLocation] = useState<GameLocation | null>(null);
  const [selectedSubArea, setSelectedSubArea] = useState<SubArea | null>(null);

  const [animatingOutLocationIds, setAnimatingOutLocationIds] = useState<Set<string>>(new Set());
  const processingFlagRef = useRef<string | null>(null);
  
  const selectedLocationMeta = selectedLocation ? getMapMetaForLocation(selectedLocation.id) : null;

  const finalizeProgression = useCallback(async (flag: string, storyId?: string) => {
    if (!user) return;

    const updates: { [key: string]: any } = {
      pendingProgressionFlags: arrayRemove(flag),
    };
    if (storyId) updates.completedStoryEvents = arrayUnion(storyId);

    await updateDoc(doc(db, "characters", user.uid), updates);
    setCharacter(prev => {
      if (!prev) return null;
      return {
        ...prev,
        pendingProgressionFlags: (prev.pendingProgressionFlags || []).filter(pendingFlag => pendingFlag !== flag),
        ...(storyId && {
          completedStoryEvents: [...new Set([...(prev.completedStoryEvents || []), storyId])],
        }),
      };
    });
    setAnimatingOutLocationIds(prev => {
      const next = new Set(prev);
      locations
        .filter(location => location.unlockRequirements?.storyFlags?.includes(flag))
        .forEach(location => next.delete(location.id));
      return next;
    });
    if (sessionStorage.getItem("pendingStoryFlag") === flag) {
      sessionStorage.removeItem("pendingStoryFlag");
    }
    processingFlagRef.current = null;
    setActiveStory(null);
  }, [user, locations]);

  const handleCodeSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isRedeeming) return;
    if (!codeInput.trim()) {
      setCodeMessage("That code does not exist or is incorrect.");
      return;
    }

    setIsRedeeming(true);
    setCodeMessage("");
    try {
      const result = await callApi<{ status: "redeemed" | "already-redeemed" | "invalid"; storyFlag?: string }>(
        "redeemEncounterCode",
        { code: codeInput }
      );
      if (result.status === "invalid") {
        setCodeMessage("That code does not exist or is incorrect.");
      } else if (result.status === "already-redeemed" || !result.storyFlag) {
        setCodeMessage("This code has already been redeemed and has no effect.");
      } else {
        setCharacter(prev => {
          if (!prev) return null;
          return {
            ...prev,
            storyFlags: [...new Set([...(prev.storyFlags || []), result.storyFlag!])],
            pendingProgressionFlags: [...new Set([...(prev.pendingProgressionFlags || []), result.storyFlag!])],
          };
        });
        setCodeInput("");
        setCodeMessage("Code redeemed.");
      }
    } catch (error) {
      console.error("Could not redeem encounter code:", error);
      setCodeMessage("Could not redeem the code. Please try again.");
    } finally {
      setIsRedeeming(false);
    }
  };

  useEffect(() => {
    playTrack("/the-minstrels-return-loopable-fantasy-medieval-rpg-music-447849.mp3");
    setMapMounted(true);
  }, [playTrack]);

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
    if (!user || !character || locations.length === 0 || activeStory) return;

    const pendingFlag = character.pendingProgressionFlags?.[0] || sessionStorage.getItem("pendingStoryFlag");
    if (!pendingFlag || processingFlagRef.current === pendingFlag) return;
    processingFlagRef.current = pendingFlag;

    const processProgression = async () => {
      const currentFlags = character.storyFlags || [];
      const beforeCharacter = { ...character, storyFlags: currentFlags.filter(flag => flag !== pendingFlag) };
      const afterCharacter = { ...character, storyFlags: [...new Set([...currentFlags, pendingFlag])] };
      const unlockedLocations = locations.filter(location =>
        location.unlockRequirements?.storyFlags?.includes(pendingFlag) &&
        isStoryLockedStatus(getUnlockStatus(location, beforeCharacter)) &&
        !isStoryLockedStatus(getUnlockStatus(location, afterCharacter))
      );

      try {
        if (unlockedLocations.length > 0) {
          await new Promise(resolve => window.setTimeout(resolve, 1000));
          setAnimatingOutLocationIds(prev => new Set([...prev, ...unlockedLocations.map(location => location.id)]));
          await new Promise(resolve => window.setTimeout(resolve, 3500));
        }

        await updateDoc(doc(db, "characters", user.uid), {
          storyFlags: arrayUnion(pendingFlag),
        });
        setCharacter(prev => prev ? {
          ...prev,
          storyFlags: [...new Set([...(prev.storyFlags || []), pendingFlag])],
        } : null);

        const story = await callApi<StoryEvent | null>("getStoryForTrigger", {
          trigger: "ON_OBJECT_CONDITIONS",
          triggerCondition: pendingFlag,
        });
        if (story?.scenes?.length) {
          setActiveStory(story);
          return;
        }

        await finalizeProgression(pendingFlag);
      } catch (error) {
        console.error("Could not finish encounter progression:", error);
        setAnimatingOutLocationIds(prev => {
          const next = new Set(prev);
          unlockedLocations.forEach(location => next.delete(location.id));
          return next;
        });
        processingFlagRef.current = null;
        setCodeMessage("Progress could not be saved. Refresh the map to retry.");
      }
    };

    void processProgression();
  }, [user, character, locations, activeStory, finalizeProgression]);

  const handleStoryComplete = useCallback(async () => {
    const flag = processingFlagRef.current;
    if (!flag || !activeStory) return;
    try {
      await finalizeProgression(flag, activeStory.id);
    } catch (error) {
      console.error("Could not save story completion:", error);
      processingFlagRef.current = flag;
      setActiveStory(null);
      setCodeMessage("Story progress could not be saved. Refresh the map to retry.");
    }
  }, [activeStory, finalizeProgression]);

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
          <span className="text-gray-600 dark:text-gray-300 font-bold tracking-widest">LOADING MAP...</span>
        </div>
      </div>
    );
  }

  if (activeStory) {
    return <StoryPlayer story={activeStory} onComplete={handleStoryComplete} />;
  }

  const topActionClass = "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-bold text-gray-800 shadow-sm transition-colors hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700";
  
  const showSubAreaList = panelSubAreas.length > 0 && !selectedSubArea;

  return (
    <main className="min-h-screen bg-gray-900 md:flex">
      <div className="flex-grow p-4 md:p-8">
          <div className="max-w-7xl mx-auto h-full flex flex-col">
          <header className="flex flex-col gap-4 border-b border-gray-700 pb-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-3xl md:text-4xl font-black text-white">World Map</h1>
              <p className="text-gray-200 font-medium">Select a region to explore</p>
            </div>
            <div className="flex flex-col items-start gap-2 lg:items-end">
              <div className="flex flex-wrap items-center gap-2">
                <form onSubmit={handleCodeSubmit} className="flex min-w-0 gap-2">
                  <input
                    aria-label="Encounter code"
                    autoComplete="off"
                    value={codeInput}
                    onChange={event => setCodeInput(event.target.value)}
                    placeholder="Enter code"
                    className="h-10 w-32 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 placeholder:text-gray-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:placeholder:text-gray-400 sm:w-40"
                  />
                  <button type="submit" disabled={isRedeeming} className={`${topActionClass} disabled:cursor-wait disabled:opacity-60`}>
                    {isRedeeming ? "Checking..." : "Redeem"}
                  </button>
                </form>
                <Link href="/character" className={topActionClass}>🦉 Character</Link>
                <Link href="/shop" className={topActionClass}>🔮 Store</Link>
                <Link href="/" className={topActionClass}>🏠 Home</Link>
              </div>
              {codeMessage && <p role="status" aria-live="polite" className="text-sm font-medium text-white">{codeMessage}</p>}
            </div>
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
              const pendingFlag = character.pendingProgressionFlags?.[0];
              const isPendingUnlock = Boolean(
                pendingFlag &&
                loc.unlockRequirements?.storyFlags?.includes(pendingFlag) &&
                !isStoryLocked &&
                isStoryLockedStatus(getUnlockStatus(loc, {
                  ...character,
                  storyFlags: (character.storyFlags || []).filter(flag => flag !== pendingFlag),
                }))
              );
              const shouldShowFog = !isFirstLocation && (isStoryLocked || isPendingUnlock);
              const isClickable = !shouldShowFog && !isSkillLocked;

              const skillRequirements = isSkillLocked && !shouldShowFog
                ? SKILL_ORDER.flatMap(skill => {
                    const required = loc.unlockRequirements?.skills?.[skill] ?? 0;
                    return required > 0 ? [{ skill, required, current: character.skills?.[skill] ?? 0 }] : [];
                  })
                : [];

              const title = isSkillLocked
                ? `Locked. Requires: ${skillRequirements.map(r => `${formatSkillName(r.skill)} ${r.current}/${r.required}`).join(', ')}`
                : isStoryLocked
                ? "Keep playing to unlock"
                : loc.name;

              return (
                <button
                  key={loc.id}
                  onClick={() => handleLocationClick(loc, unlockStatus)}
                  title={skillRequirements.length > 0 ? undefined : title}
                  aria-label={title}
                  disabled={!isClickable}
                  className={classNames(
                    `group absolute w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300 ease-out focus:outline-none hover:z-30`,
                    { 'opacity-90 cursor-not-allowed': !isClickable },
                    { 'opacity-90 hover:opacity-100 hover:scale-110 hover:ring-4 hover:ring-blue-300/60 cursor-pointer': isClickable },
                  )}
                  style={{ left: `${mapMeta.x * 100}%`, top: `${mapMeta.y * 100}%`, transform: "translate(-50%, -50%)" }}
                >
                  <div className="w-full h-full rounded-full ring-2 ring-white/50 backdrop-blur-sm bg-black/30 flex items-center justify-center transition-transform duration-300 ease-out group-hover:scale-110">
                     {isSkillLocked ? (
                        <span className="text-2xl">🔒</span>
                     ) : (
                      <span className="text-2xl select-none">{mapMeta?.emoji || "📍"}</span>
                     )}
                  </div>
                  {/* Animate cloud disappearance */}
                  {(shouldShowFog || animatingOutLocationIds.has(loc.id)) && (
                      <div className={classNames(
                          "absolute inset-0 z-10 bg-gray-900/70 rounded-full backdrop-blur-sm flex items-center justify-center pointer-events-none",
                          "transition-all duration-[3500ms] ease-in-out", // Animation classes
                          { 
                              'opacity-0 scale-150': animatingOutLocationIds.has(loc.id),
                              'opacity-100 scale-100': !animatingOutLocationIds.has(loc.id)
                          }
                      )}>
                          <span className={classNames("text-9xl transition-transform duration-[2500ms] ease-in-out", {
                              'transform rotate-45 scale-0': animatingOutLocationIds.has(loc.id),
                          })}>
                              ☁️
                          </span>
                      </div>
                  )}
                  {skillRequirements.length > 0 && (
                    <div
                      role="tooltip"
                      className={classNames(
                        "pointer-events-none absolute left-1/2 z-20 hidden w-max -translate-x-1/2 flex-col gap-1.5 whitespace-nowrap rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-left text-xs shadow-lg group-hover:flex",
                        mapMeta.y < 0.3 ? "top-full mt-2" : "bottom-full mb-2"
                      )}
                    >
                      <span className="font-bold text-gray-200">Locked - required skills</span>
                      {skillRequirements.map(({ skill, required, current }) => {
                        const met = current >= required;
                        return (
                          <span key={skill} className="flex items-center justify-between gap-4">
                            <span className={classNames("font-bold", SKILL_COLORS[skill] || 'text-gray-300')}>{formatSkillName(skill)}</span>
                            <span className={classNames("font-bold", met ? 'text-green-400' : 'text-red-400')}>
                              {current} / {required} <span aria-hidden="true">{met ? '✓' : '✗'}</span>
                              <span className="sr-only">{met ? ' achieved' : ' not achieved'}</span>
                            </span>
                          </span>
                        );
                      })}
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
                                        <div key={sa.id} className="w-full text-center flex flex-col items-center justify-center p-4 bg-gray-700/50 border-2 border-gray-600 rounded-2xl">
                                          <span className="text-3xl mb-1">☁️</span>
                                          <h4 className="font-bold text-gray-200 text-sm">Locked</h4>
                                          <p className="text-xs text-gray-300">Keep playing to unlock.</p>
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
              <button onClick={handlePanelClose} className="text-sm text-gray-300 hover:text-white font-bold transition-colors hidden md:block">Close Panel</button>
            </div>
          </div>
        </aside>
      )}
    </main>
  );
}
