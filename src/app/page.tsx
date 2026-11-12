'use client';

import { useEffect, useState, useRef, useCallback } from "react";
import { auth, db, callApi } from "@/lib/firebase";
import { onAuthStateChanged, signOut, User } from "firebase/auth";
import { doc, getDoc, updateDoc, arrayUnion, onSnapshot, Unsubscribe } from "firebase/firestore";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Settings, Moon, Sun, Lock, Unlock, Check, ShieldAlert } from "lucide-react";
import { StoryPlayer } from "@/components/StoryPlayer";
import { LoadingScreen } from "@/components/LoadingScreen";
import { GameIcon } from "@/components/GameIcon";
import { Character, StoryEvent } from "@/types/game";
import { recalculateAllPkmCodes, ensureAchievementLogItem, isValidPkmId, getMissingLevelMilestoneAchievements } from "@/lib/pkm";

export default function HomePage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [character, setCharacter] = useState<Character | null>(null);
  const [loading, setLoading] = useState(true);
  const [isStoryBootstrapping, setIsStoryBootstrapping] = useState(false);
  const [mapStoryError, setMapStoryError] = useState("");
  const [storyToPlay, setStoryToPlay] = useState<StoryEvent | null>(null);
  const [isGM, setIsGM] = useState(false);
  const [isCreatingNewGame, setIsCreatingNewGame] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);

  // --- SETTINGS MODAL & PKM STATE ---
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [charNameInput, setCharNameInput] = useState("");
  const [isSavingCharName, setIsSavingCharName] = useState(false);
  const [charNameSuccessMsg, setCharNameSuccessMsg] = useState("");
  const [charNameErrorMsg, setCharNameErrorMsg] = useState("");
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [isPinUnlocked, setIsPinUnlocked] = useState(false);
  const [pinError, setPinError] = useState("");
  const [pkmIdInput, setPkmIdInput] = useState("");
  const [settingsMsg, setSettingsMsg] = useState("");
  const [isSavingPkmId, setIsSavingPkmId] = useState(false);
  const charUnsub = useRef<Unsubscribe | null>(null);
  const storyToPlayRef = useRef(storyToPlay);
  storyToPlayRef.current = storyToPlay;
  // Firestore can emit a burst of snapshot updates around character creation/new-game resets.
  // Keep a generation token so stale async story fetches cannot overwrite the active boot flow.
  const storyBootstrapGenerationRef = useRef(0);
  const storyBootstrapInFlightRef = useRef(false);

  const bootInitialStory = useCallback(async (charData: Character) => {
    const needsLoginStory = !charData.completedStoryEvents || charData.completedStoryEvents.length === 0;

    if (!needsLoginStory || storyToPlayRef.current || storyBootstrapInFlightRef.current) {
      if (!needsLoginStory) {
        setIsStoryBootstrapping(false);
        setLoading(false);
      }
      return;
    }

    const generation = ++storyBootstrapGenerationRef.current;
    storyBootstrapInFlightRef.current = true;
    setIsStoryBootstrapping(true);
    setLoading(true);

    try {
      const loginStory = await callApi<StoryEvent>('getStoryForTrigger', { trigger: 'ON_LOGIN' });
      if (generation !== storyBootstrapGenerationRef.current) {
        return;
      }

      if (loginStory && !storyToPlayRef.current) {
        storyToPlayRef.current = loginStory;
        setStoryToPlay(loginStory);
      }
    } catch (error) {
      console.error("Error loading login story:", error);
    } finally {
      if (generation === storyBootstrapGenerationRef.current) {
        storyBootstrapInFlightRef.current = false;
        setIsStoryBootstrapping(false);
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (u) => {
      if (!u) {
        router.push("/login");
        return;
      }
      setUser(u);
      setIsGM(u.email === "oliveru1996@gmail.com");
      setLoading(true);
      setStoryToPlay(null);
      storyToPlayRef.current = null;
      storyBootstrapGenerationRef.current += 1;
      storyBootstrapInFlightRef.current = false;

      if (charUnsub.current) {
        charUnsub.current();
      }

      charUnsub.current = onSnapshot(doc(db, "characters", u.uid), async (charSnap) => {
        if (!charSnap.exists()) {
          console.log("Waiting for character creation...");
          if (!storyToPlayRef.current) {
            setLoading(true);
          }
          return;
        }

        const charData = charSnap.data() as Character;
        setCharacter(charData);
        void bootInitialStory(charData);
      }, (error) => {
        console.error("Error listening to character data:", error);
        setLoading(false);
      });
    });

    return () => {
      unsubAuth();
      if (charUnsub.current) {
        charUnsub.current();
      }
    };
  }, [bootInitialStory, router]);

  const handleStoryComplete = useCallback(async () => {
    if (!user || !storyToPlay) return;

    try {
        await updateDoc(doc(db, "characters", user.uid), {
            completedStoryEvents: arrayUnion(storyToPlay.id)
        });
        // After the name story, go to the map
        if (storyToPlay.id === 'name') {
            router.push('/map');
        }
    } catch(e) {
        console.error("Error updating completed stories", e);
    } finally {
        storyBootstrapGenerationRef.current += 1;
        storyBootstrapInFlightRef.current = false;
        storyToPlayRef.current = null;
        setIsStoryBootstrapping(false);
        setStoryToPlay(null);
    }
  }, [user, storyToPlay, router]);

  const handleMapClick = async (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    if (character?.name === "Nameless") {
        if (storyBootstrapInFlightRef.current) return;
        const generation = ++storyBootstrapGenerationRef.current;
        storyBootstrapInFlightRef.current = true;
        setMapStoryError("");
        setIsStoryBootstrapping(true);
        try {
            const nameStory = await callApi<StoryEvent | null>('getStoryForTrigger', { trigger: 'ON_FIRST_MAP_ENTER' });
            if (generation !== storyBootstrapGenerationRef.current) return;
            if (nameStory) {
              storyToPlayRef.current = nameStory;
              setStoryToPlay(nameStory);
            } else {
              router.push('/map');
            }
        } catch (error) {
            console.error("Error loading first map story:", error);
            setMapStoryError("Could not load the starting story. Check your connection and try again.");
        } finally {
            if (generation === storyBootstrapGenerationRef.current) {
                storyBootstrapInFlightRef.current = false;
                setIsStoryBootstrapping(false);
            }
        }
    } else {
        router.push('/map');
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    router.push("/login");
  };

  const handleNewGame = async () => {
    if (!user || isCreatingNewGame) return;

    if (window.confirm("Are you sure you want to start a new game? Your current progress will be lost.")) {
        setIsCreatingNewGame(true);
        setIsStoryBootstrapping(true);
        setLoading(true);
        storyBootstrapGenerationRef.current += 1;
        storyBootstrapInFlightRef.current = false;
        storyToPlayRef.current = null;
        setStoryToPlay(null);
        try {
            await callApi('newGame', {});
        } catch (error) {
            console.error("Error starting a new game:", error);
            alert("There was an error starting a new game. Please try again.");
            setLoading(false);
        } finally {
            setIsStoryBootstrapping(false);
            setIsCreatingNewGame(false);
        }
    }
  };

  const handleDeleteAccount = async () => {
    if (!user || isDeletingAccount) return;
    if (window.confirm("Are you sure you want to delete your account? This action is irreversible.")) {
      setIsDeletingAccount(true);
      try {
        await callApi('deleteUserAccount');
        router.push("/login");
      } catch (error) {
        console.error("Error deleting account:", error);
        alert("There was an error deleting your account. You might need to log in again to complete this action.");
      } finally {
        setIsDeletingAccount(false);
      }
    }
  };

  // Sync PKM ID from character document
  useEffect(() => {
    if (character?.pkmStudentId) {
      setPkmIdInput(character.pkmStudentId);
    }
  }, [character?.pkmStudentId]);

  // Sync character name from document
  useEffect(() => {
    if (character?.name) {
      setCharNameInput(character.name);
    }
  }, [character?.name]);

  const handleSaveCharacterName = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!user || !character) return;
    const cleanName = charNameInput.trim();
    if (!cleanName) {
      setCharNameErrorMsg("Character name cannot be blank.");
      return;
    }
    if (cleanName.length > 25) {
      setCharNameErrorMsg("Character name is too long (max 25 characters).");
      return;
    }
    setIsSavingCharName(true);
    setCharNameErrorMsg("");
    setCharNameSuccessMsg("");
    try {
      const charRef = doc(db, "characters", user.uid);
      await updateDoc(charRef, {
        name: cleanName,
        updatedAt: Date.now()
      });
      setCharacter(prev => prev ? { ...prev, name: cleanName } : null);
      setCharNameSuccessMsg("Character name saved successfully!");
      setTimeout(() => setCharNameSuccessMsg(""), 3000);
    } catch (error) {
      console.error("Error updating character name:", error);
      setCharNameErrorMsg("Failed to update character name. Please try again.");
    } finally {
      setIsSavingCharName(false);
    }
  };

  // Sync theme mode on mount
  useEffect(() => {
    if (typeof document !== 'undefined') {
      const savedTheme = localStorage.getItem('theme');
      const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      const isDark = savedTheme === 'dark' || (!savedTheme && prefersDark);
      setIsDarkMode(isDark);
      if (isDark) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }
  }, []);

  const toggleTheme = () => {
    const nextDark = !isDarkMode;
    setIsDarkMode(nextDark);
    if (typeof document !== 'undefined') {
      if (nextDark) {
        document.documentElement.classList.add('dark');
        localStorage.setItem('theme', 'dark');
      } else {
        document.documentElement.classList.remove('dark');
        localStorage.setItem('theme', 'light');
      }
    }
  };

  const handleUnlockPin = (e: React.FormEvent) => {
    e.preventDefault();
    if (pinInput.trim().toUpperCase() === "CBA") {
      setIsPinUnlocked(true);
      setPinError("");
    } else {
      setPinError("Incorrect PIN. Please enter the valid authorization code.");
    }
  };

  const handleSavePkmId = async () => {
    if (!user || !character) return;
    const cleanId = pkmIdInput.trim();
    if (!cleanId) {
      setSettingsMsg("Please enter a valid Pokemáticos Public ID.");
      return;
    }
    setIsSavingPkmId(true);
    setSettingsMsg("");
    try {
      const oldAchievements = character.pkmAchievements || {};
      const recalculatedAchievements = recalculateAllPkmCodes(oldAchievements, cleanId);
      const missingMilestones = getMissingLevelMilestoneAchievements(
        character.level || 1,
        cleanId,
        recalculatedAchievements
      );
      const updatedAchievements = {
        ...recalculatedAchievements,
        ...missingMilestones,
      };
      const updatedInventory = ensureAchievementLogItem(character.inventory || []);

      await updateDoc(doc(db, "characters", user.uid), {
        pkmStudentId: cleanId,
        pkmAchievements: updatedAchievements,
        inventory: updatedInventory,
      });

      setSettingsMsg("✅ Pokemáticos Public ID saved! All past codes have been synchronized.");
      setTimeout(() => {
        setSettingsMsg("");
        setIsPinUnlocked(false);
        setPinInput("");
      }, 3000);
    } catch (err: any) {
      console.error("Error saving PKM ID:", err);
      setSettingsMsg("❌ Failed to save. Please try again.");
    } finally {
      setIsSavingPkmId(false);
    }
  };

  const needsToName = character?.name === "Nameless";

  if (loading || isStoryBootstrapping) return <LoadingScreen />;

  if (storyToPlay) {
    return <StoryPlayer story={storyToPlay} onComplete={handleStoryComplete} />
  }

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col items-center py-12 px-6 transition-colors duration-300">
      <div className="max-w-md w-full space-y-8 text-center">

        <div className="space-y-2">
          <h1 className="text-4xl font-extrabold text-gray-900 dark:text-white">The Primordial Equation</h1>
          <p className="text-gray-600 dark:text-gray-300">
            Welcome back, <span className="font-bold text-blue-600 dark:text-blue-400">{character?.name || "Hero"}</span>.
          </p>
        </div>

        <div className="grid gap-4">

          {mapStoryError && needsToName && (
            <p role="alert" className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200">
              {mapStoryError}
            </p>
          )}

          <Link
            href="/map"
            onClick={handleMapClick}
            className="group relative p-6 bg-white dark:bg-gray-800 border-2 border-black dark:border-gray-500 rounded-2xl shadow-sm hover:shadow-md hover:-translate-y-1 transition-all"
          >
            <div className="mb-2 group-hover:scale-110 transition-transform duration-300 flex justify-center">
              <GameIcon name="map" fallback="🗺️" size="2xl" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 dark:text-white">World Map</h3>
            {needsToName && <div className="absolute inset-0 bg-black/50 rounded-2xl flex items-center justify-center text-white font-bold">Start here!</div>}
          </Link>

          <div className="grid grid-cols-1 gap-4">
            <Link
              href="/character"
              className={`p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl transition ${needsToName ? 'opacity-50 pointer-events-none' : 'hover:bg-gray-50 dark:hover:bg-gray-700'}`}
            >
              <div className="mb-1 flex justify-center">
                <GameIcon name="character" fallback="🦉" size="2xl" />
              </div>
              <div className="font-bold text-gray-900 dark:text-gray-200">Character</div>
            </Link>

            {/* Settings button */}
            <button
              type="button"
              onClick={() => {
                setShowSettingsModal(true);
                setPinError("");
                setSettingsMsg("");
              }}
              className="w-full py-2.5 px-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 rounded-xl flex items-center justify-center gap-2 text-sm font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/60 transition shadow-xs active:scale-98"
            >
              <Settings className="w-4 h-4 text-gray-500 dark:text-gray-400" />
              <span>Settings</span>
            </button>
          </div>

          {isGM && (
            <Link href="/gm" className="p-3 text-xs text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white transition-colors">
               (GM Panel)
            </Link>
          )}
        </div>

        <button
          onClick={handleLogout}
          className="text-red-500 dark:text-red-400 text-sm font-bold hover:underline mt-8"
        >
          Logout
        </button>

      </div>
      <div className="fixed bottom-4 right-4 flex flex-col items-end space-y-2">
        <button
          onClick={handleNewGame}
          disabled={isCreatingNewGame}
          className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 disabled:opacity-50"
        >
          {isCreatingNewGame ? "Creating..." : "New Game"}
        </button>
        <button
          onClick={handleDeleteAccount}
          disabled={isDeletingAccount}
          className="text-xs text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-200 disabled:opacity-50"
        >
          {isDeletingAccount ? "Deleting..." : "Delete Account"}
        </button>
      </div>

      {/* SETTINGS MODAL */}
      {showSettingsModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white dark:bg-gray-800 rounded-3xl max-w-md w-full shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden text-left flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="p-5 border-b border-gray-100 dark:border-gray-700/80 flex items-center justify-between">
              <div className="flex items-center gap-2 font-black text-lg text-gray-900 dark:text-white">
                <Settings className="w-5 h-5 text-gray-600 dark:text-gray-300" />
                <span>Game Settings</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowSettingsModal(false);
                  setIsPinUnlocked(false);
                  setPinInput("");
                  setPinError("");
                  setSettingsMsg("");
                }}
                className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white flex items-center justify-center font-bold text-sm"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-6">
              {/* 0. Character Name Setting */}
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Character Name
                </label>
                <form onSubmit={handleSaveCharacterName} className="space-y-2">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={charNameInput}
                      onChange={(e) => {
                        setCharNameInput(e.target.value);
                        setCharNameErrorMsg("");
                      }}
                      placeholder="Enter character name"
                      maxLength={25}
                      className="input text-xs font-bold py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 placeholder:text-gray-400"
                    />
                    <button
                      type="submit"
                      disabled={isSavingCharName || !charNameInput.trim() || charNameInput.trim() === character?.name}
                      className="py-2 px-3.5 rounded-lg text-xs font-bold bg-black text-white dark:bg-white dark:text-black hover:opacity-90 disabled:opacity-40 transition shrink-0"
                    >
                      {isSavingCharName ? "Saving..." : "Save"}
                    </button>
                  </div>
                  {charNameErrorMsg && (
                    <p className="text-[11px] text-red-500 dark:text-red-400 font-bold">
                      {charNameErrorMsg}
                    </p>
                  )}
                  {charNameSuccessMsg && (
                    <p className="text-[11px] text-green-600 dark:text-green-400 font-bold flex items-center gap-1">
                      <Check className="w-3.5 h-3.5" /> {charNameSuccessMsg}
                    </p>
                  )}
                </form>
              </div>

              {/* 1. Theme Setting */}
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Appearance
                </label>
                <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700">
                  <div className="flex items-center gap-2.5 text-sm font-bold text-gray-800 dark:text-gray-200">
                    {isDarkMode ? <Moon className="w-4 h-4 text-indigo-400" /> : <Sun className="w-4 h-4 text-amber-500" />}
                    <span>Theme: {isDarkMode ? "Dark Mode" : "Light Mode"}</span>
                  </div>
                  <button
                    type="button"
                    onClick={toggleTheme}
                    className="py-1 px-3 text-xs font-bold rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200 transition"
                  >
                    Switch to {isDarkMode ? "Light" : "Dark"}
                  </button>
                </div>
              </div>

              {/* 2. Language Option (Placeholder) */}
              <div className="space-y-2 opacity-60">
                <label className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Language
                </label>
                <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-600 dark:text-gray-400">
                  <span>English (Default)</span>
                  <span className="text-[11px] font-bold bg-gray-200 dark:bg-gray-700 px-2 py-0.5 rounded text-gray-600 dark:text-gray-300">
                    More languages soon
                  </span>
                </div>
              </div>

              {/* 3. Pokemáticos Public Identifier Section */}
              <div className="pt-2 border-t border-gray-200 dark:border-gray-700 space-y-3">
                <div className="flex items-center gap-2 text-sm font-black text-purple-700 dark:text-purple-400">
                  <span>🎓</span>
                  <span>Pokemáticos Integration</span>
                </div>

                {/* English Warning / Caution */}
                <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2.5 leading-relaxed">
                  <ShieldAlert className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <strong>Caution:</strong> This section is exclusively for math students of <em>Mates con Oliver</em>. It requires your Pokemáticos Public Identifier.
                  </div>
                </div>

                {settingsMsg && (
                  <div className="p-2.5 rounded-xl bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 text-xs text-blue-800 dark:text-blue-300 font-semibold text-center">
                    {settingsMsg}
                  </div>
                )}

                {/* Display current registered ID (if any) */}
                <div className="text-xs text-gray-600 dark:text-gray-300">
                  <span className="font-bold">Current Public ID: </span>
                  <span className="font-mono bg-gray-100 dark:bg-gray-900 px-2 py-0.5 rounded border border-gray-200 dark:border-gray-700">
                    {character?.pkmStudentId || "None registered"}
                  </span>
                </div>

                {/* PIN Locked vs Unlocked Editor */}
                {!isPinUnlocked ? (
                  <form onSubmit={handleUnlockPin} className="p-3.5 rounded-xl bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 space-y-2.5">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-gray-700 dark:text-gray-300">
                      <Lock className="w-3.5 h-3.5 text-gray-500" />
                      <span>Enter Authorization PIN to edit ID:</span>
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={pinInput}
                        onChange={(e) => {
                          setPinInput(e.target.value);
                          setPinError("");
                        }}
                        placeholder="Enter PIN"
                        className="input text-xs font-mono py-1.5"
                      />
                      <button
                        type="submit"
                        className="py-1.5 px-3 rounded-lg text-xs font-bold bg-black text-white dark:bg-white dark:text-black hover:opacity-90 transition shrink-0"
                      >
                        Unlock
                      </button>
                    </div>
                    {pinError && (
                      <p className="text-[11px] text-red-500 dark:text-red-400 font-bold">
                        {pinError}
                      </p>
                    )}
                  </form>
                ) : (
                  <div className="p-3.5 rounded-xl bg-purple-50/80 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800 space-y-2.5">
                    <div className="flex items-center justify-between text-xs font-bold text-purple-900 dark:text-purple-200">
                      <span className="flex items-center gap-1.5">
                        <Unlock className="w-3.5 h-3.5 text-green-500" />
                        <span>Edit Pokemáticos Public ID:</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setIsPinUnlocked(false);
                          setPinInput("");
                          if (character?.pkmStudentId) setPkmIdInput(character.pkmStudentId);
                        }}
                        className="text-[11px] text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                      >
                        Lock
                      </button>
                    </div>
                    <input
                      type="text"
                      value={pkmIdInput}
                      onChange={(e) => setPkmIdInput(e.target.value)}
                      placeholder="e.g. PKM-83K2-91F7"
                      className="input text-xs font-mono py-1.5 bg-white dark:bg-gray-900"
                    />
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-tight">
                      Paste your Public ID from Pokemáticos settings. If you change your ID, all previously earned codes will automatically be updated to match the new ID.
                    </p>
                    <div className="flex gap-2 pt-1">
                      <button
                        type="button"
                        disabled={isSavingPkmId || !pkmIdInput.trim()}
                        onClick={handleSavePkmId}
                        className="flex-1 py-1.5 px-3 rounded-lg text-xs font-bold bg-purple-600 hover:bg-purple-500 text-white disabled:opacity-50 transition"
                      >
                        {isSavingPkmId ? "Saving..." : "Save Identifier & Sync Codes"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-gray-100 dark:border-gray-700/80 bg-gray-50 dark:bg-gray-900/40 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setShowSettingsModal(false);
                  setIsPinUnlocked(false);
                  setPinInput("");
                  setPinError("");
                  setSettingsMsg("");
                }}
                className="py-1.5 px-4 rounded-xl text-xs font-bold bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600 transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
