"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  onAuthStateChanged 
} from "firebase/auth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { Character } from "@/types/game";

export default function LoginPage() {
  const router = useRouter();
  
  // State
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [characterName, setCharacterName] = useState("");
  
  const [isRegistering, setIsRegistering] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) {
        router.push("/character");
      }
    });
    return () => unsub();
  }, [router]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault(); 
    setError("");

    try {
      if (isRegistering) {
        // --- VALIDATION ---
        if (!characterName.trim()) {
            setError("Please enter a character name.");
            return;
        }

        // --- REGISTER ---
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        const uid = cred.user.uid;

        // --- CREATE CHARACTER ---
        const starter: Character = {
          ownerUid: uid,
          name: characterName.trim(), // 👈 Uses the input name
          className: "Apprentice",
          level: 1,
          xp: 0,
          gold: 0,
          maxHp: 15,
          
          // Stats
          baseDamage: 1,  
          baseDefense: 0,
          
          inventory: [],
          equipment: {
            mainHand: null,
            offHand: null, 
            armor: null,
            head: null,
          },
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };

        await setDoc(doc(db, "characters", uid), starter);
        
      } else {
        // --- LOGIN ---
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err: any) {
      setError(err.message || "Authentication Error");
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
      <div className="w-full max-w-md bg-white p-6 rounded-2xl shadow-md border">
        <h1 className="text-2xl font-bold mb-2">
          {isRegistering ? "Create Hero" : "Welcome Back"}
        </h1>

        <form onSubmit={handleAuth} className="space-y-4">
          {isRegistering && (
            <label className="block animate-in fade-in slide-in-from-top-2 duration-300">
                <span className="text-sm font-medium">Character Name</span>
                <input
                type="text"
                required={isRegistering} 
                className="mt-1 block w-full rounded-xl border p-2 bg-yellow-50 border-yellow-200"
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
              className="mt-1 block w-full rounded-xl border p-2"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium">Password</span>
            <input
              type="password"
              required
              className="mt-1 block w-full rounded-xl border p-2"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>

          {error && <p className="text-red-500 text-sm font-medium">{error}</p>}

          <button
            type="submit"
            className="w-full bg-black text-white py-2 rounded-xl font-semibold hover:opacity-80 transition"
          >
            {isRegistering ? "Start Adventure" : "Enter World"}
          </button>
        </form>

        <div className="mt-4 text-center text-sm">
          <button
            type="button" // (Added type=button to prevent accidental form submit)
            onClick={() => setIsRegistering(!isRegistering)}
            className="text-blue-600 underline"
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