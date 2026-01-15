"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  onAuthStateChanged 
} from "firebase/auth";
import { doc, setDoc, serverTimestamp, onSnapshot } from "firebase/firestore"; 
import { auth, db } from "@/lib/firebase";
import { Character } from "@/types/game";
import { useAudio } from "@/context/AudioContext";

// ✅ Define a constant for the story ID to avoid magic strings
const LOGIN_STORY_ID = "intro_story";

export default function LoginPage() {
  const { playTrack } = useAudio()!; 

  useEffect(() => {
    playTrack("/the-minstrels-return-loopable-fantasy-medieval-rpg-music-447849.mp3"); 
  }, [playTrack]);

  const router = useRouter();
  
  // State
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [characterName, setCharacterName] = useState("");
  
  const [isRegistering, setIsRegistering] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        // Listen for the character document to be created or updated.
        // This solves the race condition for new sign-ups.
        const unsubSnapshot = onSnapshot(doc(db, "characters", user.uid), (charDoc) => {
          if (charDoc.exists()) {
            const character = charDoc.data() as Character;
            
            // ✅ CORRECTED: Check for the actual story ID
            if (!character.completedStoryEvents?.includes(LOGIN_STORY_ID)) {
              router.push("/"); 
            } else {
              router.push("/character");
            }
          }
          // If the document doesn't exist yet, we wait. The listener will
          // fire again as soon as it's created by the handleAuth function.
        });
        
        return () => unsubSnapshot(); // Cleanup snapshot listener
      }
    });

    return () => unsubAuth(); // Cleanup auth listener
  }, [router]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault(); 
    setError("");

    const cleanEmail = email.trim();

    try {
      if (isRegistering) {
        if (!characterName.trim()) {
            setError("Please enter a character name.");
            return;
        }

        const cred = await createUserWithEmailAndPassword(auth, cleanEmail, password);
        const uid = cred.user.uid;

        const starter: Character = {
          ownerUid: uid,
          name: characterName.trim(), 
          className: "Apprentice",
          level: 1,
          xp: 0,
          gold: 0,
          maxHp: 15,
          hp: 15,
          stats: { a: 0, b: 0, c: 0, d: 0 },
          unspentPoints: 0,
          inventory: [],
          equipment: { mainHand: null, offHand: null, armor: null, head: null },
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          completedStoryEvents: [], 
          unlockedContinents: ["bSL1XkrzgqQxqtCLNumD"]
        };

        // Create the character doc. The onSnapshot listener will then handle redirection.
        await setDoc(doc(db, "characters", uid), starter);
        
      } else {
        // For login, the onSnapshot listener will also handle redirection.
        await signInWithEmailAndPassword(auth, cleanEmail, password);
      }
    } catch (err: any) {
        if (err.code === 'auth/email-already-in-use') {
            setError("This email is already registered. Please log in.");
        } else {
            setError(err.message || "Authentication Error");
        }
    }
  };

  return (
    <main className="relative min-h-screen flex items-center justify-center p-4 overflow-hidden">
      
      <video
        autoPlay
        loop
        muted
        playsInline
        poster="/login.png"
        className="absolute top-0 left-0 w-full h-full object-cover -z-20"
      >
        <source src="/login.mp4" type="video/mp4" />
      </video>

      <div className="absolute top-0 left-0 w-full h-full bg-black/50 -z-10" />

      <div className="relative z-10 w-full max-w-md bg-white/90 backdrop-blur-sm dark:bg-gray-900/90 dark:text-gray-100 p-6 rounded-2xl shadow-2xl border border-white/20">
        <h1 className="text-2xl font-bold mb-2 text-center">
          {isRegistering ? "Create Hero" : "Welcome Back"}
        </h1>

        <form onSubmit={handleAuth} className="space-y-4">
          {isRegistering && (
            <label className="block animate-in fade-in slide-in-from-top-2 duration-300">
                <span className="text-sm font-medium">Character Name</span>
                <input
                type="text"
                required={isRegistering} 
                className="mt-1 block w-full rounded-xl border p-2 bg-yellow-50/50 border-yellow-200 text-yellow-900 placeholder:text-yellow-700/50"
                placeholder="e.g. Sir Lancelot"
                value={characterName}
                onChange={(e) => setCharacterName(e.target.value)}
                />
            </label>
          )}

          <label className="block">
            <span className="text-sm font-medium">Email</span>
            <input
              type="email"
              required
              className="mt-1 block w-full rounded-xl border p-2 bg-white/80 border-gray-300 dark:bg-gray-800 dark:border-gray-600"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium">Password</span>
            <input
              type="password"
              required
              className="mt-1 block w-full rounded-xl border p-2 bg-white/80 border-gray-300 dark:bg-gray-800 dark:border-gray-600"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>

          {error && <p className="text-red-500 text-sm font-medium text-center bg-red-100 p-2 rounded">{error}</p>}

          <button
            type="submit"
            className="w-full bg-black text-white py-3 rounded-xl font-bold hover:scale-[1.02] active:scale-[0.98] transition-all dark:bg-white dark:text-black shadow-lg"
          >
            {isRegistering ? "Start Adventure" : "Enter World"}
          </button>
        </form>

        <div className="mt-4 text-center text-sm">
          <button
            type="button" 
            onClick={() => setIsRegistering(!isRegistering)}
            className="text-blue-600 dark:text-blue-400 font-semibold hover:underline"
          >
            {isRegistering
              ? "Already have an account? Login"
              : "No account? Register"}
          </button>
        </div>
      </div>
    </main>
  );
}
