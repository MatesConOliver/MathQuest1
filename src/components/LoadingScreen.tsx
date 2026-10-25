"use client";

import React, { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

export const DEFAULT_LOADING_TIPS = [
  "Loading your adventure...",
  "Sharpening algebraic tools and checking coordinates...",
  "Factoring polynomials to uncover hidden pathways...",
  "Balancing the equation before the monster strikes...",
  "Checking derivatives for critical points ahead...",
  "Verifying proofs: by contradiction, the goblin stands no chance...",
  "Applying the quadratic formula to dodge incoming spells...",
  "Summoning mathematical theorems to guide your journey...",
  "Exploring geometric realms where angles determine fate...",
  "Calibrating trigonometry vectors for the upcoming battle...",
];

// In-memory cache so transitions between areas in the same session don't re-read Firestore
let cachedTips: string[] | null = null;

export function LoadingScreen({ message }: { message?: string }) {
  // Use stable default on initial render to prevent SSR hydration mismatch
  const [tip, setTip] = useState<string>(message || DEFAULT_LOADING_TIPS[0]);

  useEffect(() => {
    if (message) {
      setTip(message);
      return;
    }

    // Randomize on client mount after hydration
    const pool = (cachedTips && cachedTips.length > 0) ? cachedTips : DEFAULT_LOADING_TIPS;
    setTip(pool[Math.floor(Math.random() * pool.length)]);

    if (cachedTips && cachedTips.length > 0) return;

    let isMounted = true;
    async function fetchTips() {
      try {
        const snap = await getDoc(doc(db, "settings", "loadingTips"));
        if (snap.exists()) {
          const data = snap.data();
          if (Array.isArray(data.tips) && data.tips.length > 0) {
            cachedTips = data.tips;
            if (isMounted) {
              setTip(data.tips[Math.floor(Math.random() * data.tips.length)]);
            }
          }
        }
      } catch (err) {
        // Fallback to defaults
      }
    }
    fetchTips();

    return () => {
      isMounted = false;
    };
  }, [message]);

  return (
    <div className="w-full h-screen min-h-[400px] flex flex-col items-center justify-center p-6 bg-gradient-to-b from-gray-950 via-gray-900 to-black text-white select-none">
      <div className="relative mb-6">
        <div className="w-16 h-16 rounded-2xl bg-indigo-600/20 border-2 border-indigo-500/50 flex items-center justify-center shadow-[0_0_30px_rgba(99,102,241,0.3)] animate-pulse">
          <span className="text-3xl animate-spin">🔮</span>
        </div>
        <div className="absolute -inset-2 rounded-2xl border border-indigo-400/20 animate-ping opacity-30" />
      </div>

      <div className="max-w-md text-center space-y-2">
        <h3
          suppressHydrationWarning
          className="text-base sm:text-lg font-bold text-indigo-200 tracking-wide font-serif leading-relaxed px-4 py-2 bg-black/40 rounded-xl border border-indigo-500/20 shadow-inner"
        >
          &ldquo;{tip}&rdquo;
        </h3>
        <p className="text-xs text-gray-500 font-mono">
          Preparing realm...
        </p>
      </div>
    </div>
  );
}
