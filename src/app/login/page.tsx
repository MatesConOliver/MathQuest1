'use client';

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  onAuthStateChanged 
} from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore"; 
import { auth, db, callApi } from "@/lib/firebase";
import { useAudio } from "@/context/AudioContext";

export default function LoginPage() {
  const { playTrack } = useAudio()!;

  useEffect(() => {
    playTrack("/the-minstrels-return-loopable-fantasy-medieval-rpg-music-447849.mp3"); 
  }, [playTrack]);

  const router = useRouter();
  
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isRegistering, setIsRegistering] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        const unsubSnapshot = onSnapshot(doc(db, "characters", user.uid), (charDoc) => {
          if (charDoc.exists()) {
            router.push("/");
          } else {
            // If character data doesn't exist, create it.
            // This handles cases where registration was incomplete or data was lost.
            callApi('newGame', {}).catch(err => {
              console.error("Error creating character data for logged in user:", err);
              setError("There was a problem setting up your character. Please log out and try again.");
              auth.signOut(); // Sign out to prevent potential loops
            });
          }
        });
        return () => unsubSnapshot();
      }
    });
    return () => unsubAuth();
  }, [router]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault(); 
    setError("");
    setLoading(true);

    const cleanEmail = email.trim();

    try {
      if (isRegistering) {
        await createUserWithEmailAndPassword(auth, cleanEmail, password);
        // After creating the user, we immediately call the cloud function to create the character data.
        // This avoids race conditions and keeps character creation logic on the server.
        await callApi('newGame', {});
        // The onSnapshot listener will then redirect the user to the main page.
      } else {
        await signInWithEmailAndPassword(auth, cleanEmail, password);
        // For existing users, the onSnapshot listener will also handle the redirection.
      }
    } catch (err: any) {
      if (err.code === 'auth/email-already-in-use') {
        setError("This email is already registered. Please log in.");
      } else if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setError("Incorrect email or password. Please try again.");
      } else {
        setError("An authentication error occurred. Please try again.");
        console.error("Authentication error:", err);
      }
    } finally {
      setLoading(false);
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
        className="absolute top-0 left-0 w-full h-full object-contain md:object-cover -z-20"
      >
        <source src="/login.mp4" type="video/mp4" />
      </video>

      <div className="absolute top-0 left-0 w-full h-full bg-black/50 -z-10" />

      <div className="relative z-10 w-full max-w-md bg-white/90 backdrop-blur-sm dark:bg-gray-900/90 dark:text-gray-100 p-6 rounded-2xl shadow-2xl border border-white/20">
        <h1 className="text-2xl font-bold mb-2 text-center">
          {isRegistering ? "Create Account" : "Welcome Back"}
        </h1>

        <form onSubmit={handleAuth} className="space-y-4">
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
            disabled={loading}
            className="w-full bg-black text-white py-3 rounded-xl font-bold hover:scale-[1.02] active:scale-[0.98] transition-all dark:bg-white dark:text-black shadow-lg disabled:opacity-70"
          >
            {loading ? '...' : (isRegistering ? "Start Adventure" : "Enter World")}
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
