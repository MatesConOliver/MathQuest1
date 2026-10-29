'use client';

import { useCallback, useEffect, useRef, useState } from "react";
import { auth, callApi, db } from "@/lib/firebase";
import { onAuthStateChanged, User } from "firebase/auth";
import { arrayRemove, arrayUnion, collection, getDocs, orderBy, query, doc, getDoc, where, updateDoc, onSnapshot } from "firebase/firestore";
import Link from "next/link";
import { GameLocation, EncounterDoc, Character, SubArea, UnlockedSubArea, CharacterSkills, StoryEvent, SubAreaNodeType } from "@/types/game";
import { useAudio } from "@/context/AudioContext";
import { MAP_LOCATIONS, MapLocationMeta } from "@/config/mapLayout";
import classNames from "classnames";
import { UnlockStatus, getUnlockStatus } from "@/lib/unlock";
import { StoryPlayer } from "@/components/StoryPlayer";
import { buildMapPath } from "@/lib/mapPath";

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
};

const isStoryLockedStatus = (status: UnlockStatus) => status.locked && status.reason === 'story';

const SKILL_ORDER: (keyof CharacterSkills)[] = ['algebra', 'functions', 'geometry', 'probabilityAndStatistics', 'calculus'];

// =========================================================================
// 5-CLOUD FOG-OF-WAR EMOJI COMPONENT (Expanded 2x2 Grid + Large Center Cloud)
// =========================================================================
function FourCloudsFog({ isAnimatingOut }: { isAnimatingOut: boolean }) {
  // Expanded 2x2 grid (±30px, ±26px) with proportionally larger clouds (scale 1.75 corner, scale 1.85 center)
  // Ensures a much larger fog footprint while keeping heavy overlap and zero gaps!
  // When animating out (3.5s), they drift out slowly and gracefully (±60px, ±52px).
  const cornerClouds = [
    {
      id: 'tl',
      initTransform: 'translate(-50%, -50%) translate(-30px, -26px) scale(1.75)',
      shootTransform: 'translate(-50%, -50%) translate(-60px, -52px) scale(1.95)',
    },
    {
      id: 'tr',
      initTransform: 'translate(-50%, -50%) translate(30px, -26px) scale(1.75)',
      shootTransform: 'translate(-50%, -50%) translate(60px, -52px) scale(1.95)',
    },
    {
      id: 'bl',
      initTransform: 'translate(-50%, -50%) translate(-30px, 26px) scale(1.75)',
      shootTransform: 'translate(-50%, -50%) translate(-60px, 52px) scale(1.95)',
    },
    {
      id: 'br',
      initTransform: 'translate(-50%, -50%) translate(30px, 26px) scale(1.75)',
      shootTransform: 'translate(-50%, -50%) translate(60px, 52px) scale(1.95)',
    },
  ];

  return (
    <div className="relative w-0 h-0 overflow-visible pointer-events-none select-none z-10">
      {/* 4 Corner Big ☁️ Clouds in Expanded 2x2 Grid */}
      {cornerClouds.map((c) => (
        <span
          key={c.id}
          className={classNames(
            "absolute text-6xl sm:text-7xl md:text-8xl filter drop-shadow-[0_8px_20px_rgba(0,0,0,0.6)] transition-all duration-[3500ms] ease-out",
            {
              "opacity-100": !isAnimatingOut,
              "opacity-0": isAnimatingOut,
            }
          )}
          style={{
            transform: isAnimatingOut ? c.shootTransform : c.initTransform,
          }}
        >
          ☁️
        </span>
      ))}

      {/* Center 5th Big ☁️ Cloud (Anchors the core so there is zero open space across the wider grid) */}
      <span
        className={classNames(
          "absolute text-6xl sm:text-7xl md:text-8xl filter drop-shadow-[0_8px_22px_rgba(0,0,0,0.7)] transition-all duration-[3500ms] ease-out",
          {
            "opacity-100": !isAnimatingOut,
            "opacity-0": isAnimatingOut,
          }
        )}
        style={{
          transform: isAnimatingOut
            ? 'translate(-50%, -50%) scale(2.05)'
            : 'translate(-50%, -50%) scale(1.85)',
        }}
      >
        ☁️
      </span>
    </div>
  );
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
  const [codeInput, setCodeInput] = useState("");
  const [codeMessage, setCodeMessage] = useState("");
  const [isRedeeming, setIsRedeeming] = useState(false);
  const [activeStory, setActiveStory] = useState<StoryEvent | null>(null);
  
  // State 1 (Macro) vs State 2 (Micro Area Expedition)
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
    const cleanCode = codeInput.trim().replace(/^["']|["']$/g, '').trim();
    if (!cleanCode) {
      setCodeMessage("That code does not exist or is incorrect.");
      return;
    }

    setIsRedeeming(true);
    setCodeMessage("");

    try {
      const norm = cleanCode.toUpperCase();
      let matchedStoryFlag: string | null = null;

      // 1. Check locations' required story flags or location name/ID
      for (const loc of locations) {
        const flags = loc.unlockRequirements?.storyFlags || [];
        const match = flags.find(f => f.trim().toUpperCase() === norm);
        if (match) {
          matchedStoryFlag = match.trim();
          break;
        }
        if (loc.id.trim().toUpperCase() === norm || (loc.name && loc.name.trim().toUpperCase() === norm)) {
          if (flags.length > 0) {
            matchedStoryFlag = flags[0].trim();
            break;
          }
        }
      }

      // 2. Check encounters collection in Firestore for winRewardStoryFlag or encounter ID / title
      if (!matchedStoryFlag) {
        try {
          const encSnap = await getDocs(collection(db, "encounters"));
          for (const d of encSnap.docs) {
            const data = d.data();
            const flag = data.winRewardStoryFlag;
            if (typeof flag === 'string' && flag.trim().toUpperCase() === norm) {
              matchedStoryFlag = flag.trim();
              break;
            }
            if (d.id.trim().toUpperCase() === norm || (data.title && data.title.trim().toUpperCase() === norm)) {
              matchedStoryFlag = flag ? flag.trim() : d.id;
              break;
            }
          }
        } catch (e) {
          console.warn("Could not query encounters for code:", e);
        }
      }

      // 3. Check stories collection in Firestore
      if (!matchedStoryFlag) {
        try {
          const storiesSnap = await getDocs(collection(db, "stories"));
          for (const d of storiesSnap.docs) {
            const data = d.data();
            if (d.id.trim().toUpperCase() === norm) {
              matchedStoryFlag = d.id;
              break;
            }
            if (data.triggerCondition && data.triggerCondition.trim().toUpperCase() === norm) {
              matchedStoryFlag = data.triggerCondition.trim();
              break;
            }
          }
        } catch (e) {
          console.warn("Could not query stories for code:", e);
        }
      }

      // 4. Check subAreas collection for story flags or subArea name/ID
      if (!matchedStoryFlag) {
        try {
          const subAreasSnap = await getDocs(collection(db, "subAreas"));
          for (const d of subAreasSnap.docs) {
            const data = d.data();
            const flags = data.unlockRequirements?.storyFlags || [];
            const match = flags.find((f: string) => f.trim().toUpperCase() === norm);
            if (match) {
              matchedStoryFlag = match.trim();
              break;
            }
            if (d.id.trim().toUpperCase() === norm || (data.name && data.name.trim().toUpperCase() === norm)) {
              if (flags.length > 0) {
                matchedStoryFlag = flags[0].trim();
                break;
              }
            }
          }
        } catch (e) {
          console.warn("Could not query subAreas for code:", e);
        }
      }

      // 5. Fallback: if GM entered/tested a raw story flag directly
      if (!matchedStoryFlag && cleanCode.length > 0) {
        matchedStoryFlag = cleanCode;
      }

      if (!matchedStoryFlag) {
        setCodeMessage("That code does not exist or is incorrect.");
        return;
      }

      // Check if already redeemed
      const currentFlags = character?.storyFlags || [];
      if (currentFlags.includes(matchedStoryFlag)) {
        setCodeMessage("This code has already been redeemed and has no effect.");
        return;
      }

      // Update character in Firestore and local state
      if (user) {
        await updateDoc(doc(db, "characters", user.uid), {
          storyFlags: arrayUnion(matchedStoryFlag),
          pendingProgressionFlags: arrayUnion(matchedStoryFlag),
        });
      }

      setCharacter(prev => {
        if (!prev) return null;
        return {
          ...prev,
          storyFlags: [...new Set([...(prev.storyFlags || []), matchedStoryFlag!])],
          pendingProgressionFlags: [...new Set([...(prev.pendingProgressionFlags || []), matchedStoryFlag!])],
        };
      });

      setCodeInput("");
      setCodeMessage(`✅ Code redeemed! Unlocking progress...`);
      setTimeout(() => setCodeMessage(""), 4000);

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

  // Real-time synchronization for Character, Locations, and Unlocked Sub-Areas
  useEffect(() => {
    if (!user) return;

    setLoading(true);

    const unsubChar = onSnapshot(doc(db, "characters", user.uid), (docSnap) => {
      if (docSnap.exists()) {
        setCharacter(docSnap.data() as Character);
      }
      setLoading(false);
    }, (err) => {
      console.error("Error subscribing to character:", err);
      setLoading(false);
    });

    const unsubLocs = onSnapshot(query(collection(db, "locations"), orderBy("order")), (snap) => {
      setLocations(snap.docs.map(d => ({ ...d.data(), id: d.id } as GameLocation)));
    }, (err) => {
      console.error("Error subscribing to locations:", err);
    });

    const unsubUnlocked = onSnapshot(collection(db, `characters/${user.uid}/unlockedSubAreas`), (snap) => {
      const unlockedData: { [key: string]: UnlockedSubArea } = {};
      snap.forEach(d => { unlockedData[d.id] = d.data() as UnlockedSubArea });
      setUnlockedSubAreas(unlockedData);
    }, (err) => {
      console.error("Error subscribing to unlocked sub-areas:", err);
    });

    return () => {
      unsubChar();
      unsubLocs();
      unsubUnlocked();
    };
  }, [user]);

  // If GM updates requirements of the currently viewed location making it locked, auto-return to World Map
  useEffect(() => {
    if (selectedLocation && character) {
      const liveLoc = locations.find(l => l.id === selectedLocation.id);
      if (liveLoc) {
        const status = getUnlockStatus(liveLoc, character, unlockedSubAreas);
        if (status.locked) {
          setSelectedLocation(null);
          setSelectedSubArea(null);
        }
      }
    }
  }, [locations, character, selectedLocation, unlockedSubAreas]);

  // Fetch sub-areas when an Area is selected
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

  // Fetch encounters when a SubArea is selected
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

  // Handle story progression flags
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

  const handleReturnToWorldMap = () => {
    setSelectedLocation(null);
    setSelectedSubArea(null);
  };

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

  // Build Cubic Bezier Curve for sorted sub-areas
  const sortedSubAreas = [...panelSubAreas].sort((a, b) => a.order - b.order);
  // In SVG d="", use raw numbers, never '%' (viewBox is 0 0 100 100).
  const bezierPath = buildMapPath(sortedSubAreas);

  const getNodeIcon = (nodeType?: SubAreaNodeType, _order?: number) => {
    switch (nodeType) {
      case 'boss': return '💀';
      case 'puzzle': return '🧩';
      case 'lore': return '📜';
      case 'encounter':
      default:
        return '⚔️';
    }
  };

  const getThreatStars = (sa: SubArea) => {
    const starCount = Math.min(5, Math.max(1, sa.order || 1));
    return '★'.repeat(starCount) + '☆'.repeat(5 - starCount);
  };

  return (
    <main className="min-h-screen bg-gray-950 text-white flex flex-col">
      <div className="flex-grow p-4 md:p-8 max-w-7xl mx-auto w-full flex flex-col">
        
        {/* =========================================================================
            STATE 1: WORLD MAP VIEW (MACRO MAP)
            ========================================================================= */}
        {!selectedLocation ? (
          <div className="space-y-6">
            <header className="flex flex-col gap-4 border-b border-gray-800 pb-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h1 className="text-3xl md:text-4xl font-black text-white flex items-center gap-2">
                  <span>🗺️</span> World Map
                </h1>
                <p className="text-gray-300 font-medium">Select an unlocked region to begin an expedition</p>
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
                      className="h-10 w-32 rounded-lg border border-gray-700 bg-gray-800 px-3 text-sm text-white placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:w-40"
                    />
                    <button type="submit" disabled={isRedeeming} className={`${topActionClass} disabled:cursor-wait disabled:opacity-60`}>
                      {isRedeeming ? "Checking..." : "Redeem"}
                    </button>
                  </form>
                  <Link href="/character" className={topActionClass}>🦉 Character</Link>
                  <Link href="/shop" className={topActionClass}>🔮 Store</Link>
                  <Link href="/" className={topActionClass}>🏠 Home</Link>
                </div>
                {codeMessage && <p role="status" aria-live="polite" className="text-sm font-medium text-yellow-300">{codeMessage}</p>}
              </div>
            </header>

            {/* World Parchment Map */}
            <div
              className="relative w-full aspect-[16/9] rounded-2xl overflow-hidden mt-6 bg-cover bg-center shadow-2xl border-2 border-white/10 transition-all duration-500 ease-in-out"
              style={{
                backgroundImage: "url('https://firebasestorage.googleapis.com/v0/b/pokematicos.firebasestorage.app/o/The_Primordial_Equation_Backgrounds%2Fmap%20background%201.png?alt=media&token=38144b3f-4abf-475f-81f6-96030d482d38')",
              }}
            >
              {locations.map((loc) => {
                const mapMeta = getMapMetaForLocation(loc.id);
                if (!mapMeta) return null;

                const unlockStatus = getUnlockStatus(loc, character);
                const isStoryLocked = unlockStatus.locked && unlockStatus.reason === 'story';
                const isSkillLocked = unlockStatus.locked && unlockStatus.reason === 'skills';

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
                // Any location whose required story flags are not met by the player is covered with fog and locked
                const shouldShowFog = isStoryLocked || isPendingUnlock;
                const isClickable = !shouldShowFog && !isSkillLocked;
                const isAnimatingOut = animatingOutLocationIds.has(loc.id);

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

                const isFogged = shouldShowFog || isAnimatingOut;
                // Unlocked location pins have higher z-coordinate (z-30 hover:z-40) so nearby clouds (z-10) don't overstep them
                // Locked location pins stay at the lowest z-coordinate (z-10)
                const wrapperZIndex = isFogged ? "z-10" : "z-30 hover:z-40";

                return (
                  <div
                    key={loc.id}
                    className={classNames("absolute transition-all duration-300", wrapperZIndex)}
                    style={{ left: `${mapMeta.x * 100}%`, top: `${mapMeta.y * 100}%` }}
                  >
                    {/* Location Pin Button */}
                    <button
                      onClick={() => handleLocationClick(loc, unlockStatus)}
                      title={skillRequirements.length > 0 ? undefined : title}
                      aria-label={title}
                      disabled={!isClickable}
                      className={classNames(
                        `group relative -translate-x-1/2 -translate-y-1/2 w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300 ease-out focus:outline-none`,
                        isFogged ? "z-10" : "z-30",
                        { 'opacity-90 cursor-not-allowed': !isClickable },
                        { 'opacity-90 hover:opacity-100 hover:scale-110 hover:ring-4 hover:ring-amber-400/80 cursor-pointer shadow-lg': isClickable },
                      )}
                    >
                      <div className="w-full h-full rounded-full ring-2 ring-white/60 backdrop-blur-sm bg-black/40 flex items-center justify-center transition-transform duration-300 ease-out group-hover:scale-110">
                        {isSkillLocked && !shouldShowFog ? (
                          <span className="text-2xl">🔒</span>
                        ) : (
                          <span className="text-2xl select-none">{mapMeta?.emoji || "📍"}</span>
                        )}
                      </div>

                      {/* Region Tooltip (Visible when hovered and not hidden by fog) */}
                      {!shouldShowFog && (
                        <div className="absolute top-full mt-2 hidden group-hover:flex flex-col items-center z-40 pointer-events-none">
                          <div className="px-2.5 py-1 rounded-md bg-gray-950/90 text-white text-xs font-black shadow-xl border border-white/20 whitespace-nowrap">
                            {loc.name}
                          </div>
                        </div>
                      )}

                      {/* Skill Requirement Tooltip */}
                      {skillRequirements.length > 0 && !shouldShowFog && (
                        <div
                          role="tooltip"
                          className={classNames(
                            "pointer-events-none absolute left-1/2 z-40 hidden w-max -translate-x-1/2 flex-col gap-1.5 whitespace-nowrap rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-left text-xs shadow-lg group-hover:flex",
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

                    {/* 4-CLOUD FOG-OF-WAR LAYER (2x2 Grid Centered on the Pin) */}
                    {(shouldShowFog || isAnimatingOut) && (
                      <div className="absolute inset-0 pointer-events-none z-10">
                        <FourCloudsFog isAnimatingOut={isAnimatingOut} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          /* =========================================================================
             STATE 2: AREA EXPEDITION VIEW (MICRO EXPEDITION VIEW)
             ========================================================================= */
          <div className="space-y-5 animate-in fade-in duration-300">
            {/* Top Bar with Return Button & Region Title */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-800 pb-4">
              <div className="flex items-center gap-3">
                <button
                  onClick={handleReturnToWorldMap}
                  className="px-3.5 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-yellow-400 hover:text-yellow-300 font-black text-sm border border-yellow-500/30 transition-all shadow-md flex items-center gap-1.5 active:scale-95"
                >
                  <span className="text-lg">‹</span> World Map
                </button>
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="text-2xl sm:text-3xl font-black text-white">{selectedLocation.name}</h1>
                    <span className="text-xs font-bold uppercase tracking-wider bg-yellow-500/20 text-yellow-400 border border-yellow-500/40 px-2.5 py-0.5 rounded-full">
                      Region #{selectedLocation.order}
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm text-gray-300 mt-0.5 line-clamp-1 sm:line-clamp-none">
                    {selectedLocation.description}
                  </p>
                </div>
              </div>

              {/* Quick Nav Links */}
              <div className="flex items-center gap-2 shrink-0">
                <Link href="/character" className={topActionClass}>🦉 Character</Link>
                <Link href="/shop" className={topActionClass}>🔮 Store</Link>
                <Link href="/" className={topActionClass}>🏠 Home</Link>
              </div>
            </div>

            {/* PROGRESSIVE HYBRID RENDER */}
            {selectedLocation.imageUrl ? (
              /* --- MODE A: AERIAL BACKGROUND MAP WITH SVG BEZIER CURVE & PINS --- */
              <div className="relative w-full aspect-[16/9] rounded-2xl overflow-hidden border-2 border-white/20 shadow-2xl bg-gray-950 select-none">
                {/* Aerial Artwork Background */}
                <img
                  src={selectedLocation.imageUrl}
                  alt={selectedLocation.name}
                  className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                />

                {/* Dark Vignette Overlay for Pin Clarity */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/30 pointer-events-none" />

                {/* SVG Bezier Path Overlay (Single color, no black under-stroke) */}
                {bezierPath && (
                  <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 w-full h-full pointer-events-none z-10 overflow-visible">
                    <path
                      d={bezierPath}
                      stroke={selectedLocation.pathColor || '#fbbf24'}
                      strokeWidth="3.5"
                      vectorEffect="non-scaling-stroke"
                      strokeDasharray="5 5"
                      fill="none"
                      className="animate-pulse"
                    />
                  </svg>
                )}

                {/* Sub-Area Pins on Aerial Map */}
                {panelSubAreas.map((sa) => {
                  const unlockStatus = getUnlockStatus(sa, character, unlockedSubAreas);
                  const isLocked = unlockStatus.locked;
                  const isSelected = selectedSubArea?.id === sa.id;
                  const icon = isLocked ? '🔒' : getNodeIcon(sa.nodeType, sa.order);
                  const posX = sa.x ?? 50;
                  const posY = sa.y ?? 50;

                  return (
                    <button
                      key={sa.id}
                      onClick={() => setSelectedSubArea(sa)}
                      style={{
                        left: `${posX}%`,
                        top: `${posY}%`,
                        transform: 'translate(-50%, -50%)',
                      }}
                      className={`group absolute z-20 flex flex-col items-center justify-center transition-all duration-200 outline-none ${
                        isSelected ? 'scale-125 z-30' : 'hover:scale-110'
                      }`}
                    >
                      {/* Pin Circle */}
                      <div
                        className={`w-9 h-9 sm:w-12 sm:h-12 rounded-full flex items-center justify-center text-sm sm:text-base font-black shadow-2xl transition-all border-2 ${
                          isLocked
                            ? 'bg-gray-900/90 text-gray-400 border-gray-600 ring-2 ring-black/60 opacity-80'
                            : isSelected
                            ? 'bg-yellow-400 text-gray-950 border-white ring-4 ring-yellow-400/80 shadow-[0_0_20px_rgba(250,204,21,0.8)]'
                            : sa.nodeType === 'boss'
                            ? 'bg-red-700 text-white border-red-300 ring-2 ring-red-500/70 shadow-[0_0_15px_rgba(220,38,38,0.6)]'
                            : sa.nodeType === 'puzzle'
                            ? 'bg-purple-700 text-white border-purple-300 ring-2 ring-purple-500/70 shadow-[0_0_15px_rgba(168,85,247,0.6)]'
                            : sa.nodeType === 'lore'
                            ? 'bg-emerald-700 text-white border-emerald-300 ring-2 ring-emerald-500/70 shadow-[0_0_15px_rgba(16,185,129,0.6)]'
                            : 'bg-amber-600 text-white border-amber-200 ring-2 ring-amber-400/80 shadow-[0_0_15px_rgba(245,158,11,0.5)]'
                        }`}
                      >
                        {icon}
                      </div>

                      {/* Sub-Area Name Pill */}
                      <div className={`mt-1.5 px-2 py-0.5 rounded-md text-[10px] sm:text-xs font-bold whitespace-nowrap shadow-lg border transition-all ${
                        isSelected
                          ? 'bg-yellow-400 text-gray-950 border-white'
                          : 'bg-black/80 text-white border-white/20 group-hover:border-yellow-400'
                      }`}>
                        {sa.name}
                      </div>
                    </button>
                  );
                })}

                {/* Empty State if no sub-areas */}
                {panelSubAreas.length === 0 && !panelLoading && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400">
                    <span className="text-3xl mb-1">🌲</span>
                    <p className="font-bold text-sm">No sub-areas registered for this region yet.</p>
                  </div>
                )}

                {/* =========================================================================
                    OPTION B: IN-MAP FROSTED EXPEDITION DOSSIER DRAWER
                    (Slides up seamlessly inside the bottom of the 16:9 aerial container)
                    ========================================================================= */}
                {selectedSubArea && (
                  <div className="absolute bottom-0 inset-x-0 z-40 max-h-[58%] sm:max-h-[50%] overflow-y-auto custom-scrollbar bg-gray-950/92 backdrop-blur-md border-t-2 border-yellow-500/70 shadow-[0_-12px_32px_rgba(0,0,0,0.9)] p-4 sm:p-5 text-white animate-in slide-in-from-bottom duration-300 flex flex-col gap-3">
                    {/* Header Row: Title, Type Badge, Threat Stars, Close Button */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xl sm:text-2xl">{getNodeIcon(selectedSubArea.nodeType, selectedSubArea.order)}</span>
                          <h2 className="text-lg sm:text-xl font-black text-white truncate">
                            {selectedSubArea.name}
                          </h2>
                          <span className="text-[10px] sm:text-xs font-black uppercase tracking-wider bg-yellow-400/20 text-yellow-300 border border-yellow-400/40 px-2 py-0.5 rounded-full">
                            {selectedSubArea.nodeType || 'encounter'}
                          </span>
                        </div>
                        <div className="text-xs text-yellow-400 font-mono mt-1 flex items-center gap-1.5">
                          <span className="text-gray-400">Threat Rating:</span>
                          <span className="tracking-widest font-bold">{getThreatStars(selectedSubArea)}</span>
                        </div>
                      </div>

                      {/* Close Button */}
                      <button
                        onClick={() => setSelectedSubArea(null)}
                        className="w-8 h-8 rounded-full bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white flex items-center justify-center font-bold text-sm transition-all border border-white/10 shrink-0"
                        title="Close Dossier"
                      >
                        ✕
                      </button>
                    </div>

                    <p className="text-xs sm:text-sm text-gray-300 leading-relaxed line-clamp-2 sm:line-clamp-none">
                      {selectedSubArea.description}
                    </p>

                    <hr className="border-gray-800" />

                    {/* Check Unlock Status */}
                    {(() => {
                      const unlockStatus = getUnlockStatus(selectedSubArea, character, unlockedSubAreas);
                      const isLocked = unlockStatus.locked;

                      if (isLocked) {
                        return (
                          <div className="p-3 sm:p-4 rounded-xl bg-red-950/40 border border-red-800/60 text-red-200 space-y-2">
                            <div className="flex items-center gap-2 font-black text-xs sm:text-sm">
                              <span>🔒</span> Node Access Locked
                            </div>
                            {unlockStatus.reason === 'story' ? (
                              <p className="text-xs text-gray-300">
                                This sub-area is sealed by ancient wards. Continue your campaign journey and conquer earlier encounters to reveal this path.
                              </p>
                            ) : (
                              <div className="text-xs space-y-1">
                                <div className="text-gray-400">Required Skill Levels:</div>
                                <div className="flex flex-wrap gap-2 pt-1">
                                  {unlockStatus.missing.map(({ skill, required }) => (
                                    <span key={skill} className="px-2 py-0.5 rounded bg-black/50 border border-red-500/40 text-red-300 font-bold">
                                      {formatSkillName(skill)}: {character.skills?.[skill] ?? 0} / {required}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      }

                      return (
                        <div className="space-y-2.5">
                          <h3 className="text-xs font-black uppercase tracking-wider text-gray-400">
                            Available Encounters & Foes
                          </h3>

                          {panelLoading ? (
                            <div className="py-4 text-center text-gray-400 italic text-xs">Scouting sub-area...</div>
                          ) : panelEncounters.length === 0 ? (
                            <div className="py-4 text-center text-gray-500 italic text-xs">No foes spotted in this sector.</div>
                          ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                              {panelEncounters.map((enc) => {
                                if (!enc.id) return null;
                                const winCount = character.encounterWins?.[enc.id] || 0;
                                const skillRewards = enc.winRewardSkills
                                  ? Object.entries(enc.winRewardSkills).filter(([, val]) => (val as number) > 0)
                                  : [];

                                return (
                                  <div
                                    key={enc.id}
                                    className="p-2.5 sm:p-3 rounded-xl bg-gray-900/90 border border-white/10 flex items-center justify-between gap-2.5 hover:border-yellow-400/50 transition-all shadow-md"
                                  >
                                    <div className="flex items-center gap-2.5 min-w-0">
                                      <div className="w-10 h-10 rounded-lg bg-gray-800 border border-white/10 flex items-center justify-center text-xl shrink-0 shadow-inner">
                                        {enc.emoji || '⚔️'}
                                      </div>
                                      <div className="min-w-0">
                                        <div className="flex items-center gap-1.5">
                                          <h4 className="font-bold text-white text-xs sm:text-sm truncate">{enc.title}</h4>
                                          {winCount > 0 && (
                                            <span className="text-[9px] font-bold text-green-400 bg-green-950/80 px-1.5 py-0.2 rounded border border-green-800 shrink-0">
                                              🏆 {winCount}
                                            </span>
                                          )}
                                        </div>

                                        {/* Rewards Badges or Store Tag */}
                                        {enc.encounterType === 'shop' ? (
                                          <div className="flex flex-wrap gap-1 mt-1 text-[9px] sm:text-[10px]">
                                            <span className="px-1.5 py-0.5 rounded bg-emerald-950/70 border border-emerald-500/40 text-emerald-300 font-bold">
                                              🏪 Merchant Shop ({enc.shopItemIds?.length ?? 'All'} items)
                                            </span>
                                          </div>
                                        ) : (
                                          <div className="flex flex-wrap gap-1 mt-1 text-[9px] sm:text-[10px]">
                                            {enc.winRewardXp ? (
                                              <span className="px-1.5 py-0.5 rounded bg-purple-950/60 border border-purple-500/30 text-purple-300 font-bold">
                                                +{enc.winRewardXp} XP
                                              </span>
                                            ) : null}
                                            {enc.winRewardGold ? (
                                              <span className="px-1.5 py-0.5 rounded bg-yellow-950/60 border border-yellow-500/30 text-yellow-300 font-bold">
                                                +{enc.winRewardGold} G
                                              </span>
                                            ) : null}
                                            {skillRewards.map(([skill, val]) => (
                                              <span key={skill} className="px-1.5 py-0.5 rounded bg-blue-950/60 border border-blue-500/30 text-blue-300 font-bold">
                                                +{val as number} {formatSkillName(skill)}
                                              </span>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    </div>

                                    {/* ACTION CTA BUTTON */}
                                    {enc.encounterType === 'shop' ? (
                                      <Link
                                        href={`/shop?encounterId=${enc.id}`}
                                        className="px-3.5 py-2 bg-emerald-500 hover:bg-emerald-400 text-gray-950 font-black text-xs uppercase tracking-wider rounded-lg shadow-md transition-all active:scale-95 shrink-0 flex items-center gap-1.5"
                                      >
                                        <span>🏪</span> VISIT STORE
                                      </Link>
                                    ) : (
                                      <Link
                                        href={`/play?id=${enc.id}`}
                                        className="px-4 py-2 bg-yellow-400 hover:bg-yellow-300 text-gray-950 font-black text-xs uppercase tracking-wider rounded-lg shadow-md transition-all active:scale-95 shrink-0 flex items-center gap-1"
                                      >
                                        <span>⚔️</span> FIGHT
                                      </Link>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            ) : (
              /* --- MODE B: FALLBACK HORIZONTAL ILLUSTRATED CARDS --- */
              <div className="space-y-4">
                <h2 className="text-lg font-bold text-gray-300 mb-2">Expedition Sub-Areas</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {panelSubAreas.map((sa) => {
                    const unlockStatus = getUnlockStatus(sa, character, unlockedSubAreas);
                    const isLocked = unlockStatus.locked;
                    const isSelected = selectedSubArea?.id === sa.id;

                    return (
                      <button
                        key={sa.id}
                        onClick={() => setSelectedSubArea(sa)}
                        className={`text-left p-4 rounded-2xl border-2 transition-all flex items-start gap-4 ${
                          isSelected
                            ? 'bg-gray-800 border-yellow-400 shadow-[0_0_15px_rgba(250,204,21,0.25)]'
                            : 'bg-gray-900 border-gray-700 hover:border-gray-500 hover:bg-gray-850'
                        }`}
                      >
                        {/* Thumbnail / Icon */}
                        <div className="w-16 h-16 rounded-xl bg-gray-800 border border-white/10 shrink-0 flex items-center justify-center overflow-hidden">
                          {sa.imageUrl ? (
                            <img src={sa.imageUrl} alt={sa.name} className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-3xl">{getNodeIcon(sa.nodeType, sa.order)}</span>
                          )}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-mono font-bold text-yellow-400">#{sa.order}</span>
                            <h3 className="font-black text-white text-base truncate">{sa.name}</h3>
                            <span className="text-[10px] font-bold uppercase tracking-wider bg-gray-800 text-gray-300 px-2 py-0.5 rounded-full border border-gray-600">
                              {sa.nodeType || 'encounter'}
                            </span>
                          </div>
                          
                          <div className="text-xs text-yellow-500 font-mono mt-0.5">
                            Threat: {getThreatStars(sa)}
                          </div>

                          <p className="text-xs text-gray-400 mt-1 line-clamp-2">{sa.description}</p>

                          {isLocked && (
                            <div className="mt-2 text-xs text-red-400 font-semibold flex items-center gap-1">
                              <span>🔒</span>
                              {unlockStatus.reason === 'story' ? 'Requires Story Progression' : 'Skill Requirements Unmet'}
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Fallback Mode Dossier */}
                {selectedSubArea && (
                  <div className="mt-4 bg-gray-900 border-2 border-yellow-500/50 rounded-2xl p-5 shadow-2xl relative animate-in slide-in-from-bottom duration-200">
                    <button
                      onClick={() => setSelectedSubArea(null)}
                      className="absolute top-4 right-4 w-8 h-8 rounded-full bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white flex items-center justify-center font-bold text-sm"
                    >
                      ✕
                    </button>
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{getNodeIcon(selectedSubArea.nodeType, selectedSubArea.order)}</span>
                      <h3 className="text-xl font-black text-white">{selectedSubArea.name}</h3>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">{selectedSubArea.description}</p>
                    <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {panelEncounters.map((enc) => (
                        <div key={enc.id} className="p-3 rounded-xl bg-gray-800 border border-white/10 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-xl">{enc.emoji || '⚔️'}</span>
                            <span className="text-sm font-bold text-white">{enc.title}</span>
                          </div>
                          {enc.encounterType === 'shop' ? (
                            <Link href={`/shop?encounterId=${enc.id}`} className="px-3.5 py-2 bg-emerald-500 text-gray-950 font-bold text-xs rounded-lg flex items-center gap-1">
                              <span>🏪</span> VISIT STORE
                            </Link>
                          ) : (
                            <Link href={`/play?id=${enc.id}`} className="px-4 py-2 bg-yellow-400 text-gray-950 font-bold text-xs rounded-lg">
                              FIGHT
                            </Link>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
