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

export function updateCachedTips(tips: string[]) {
  cachedTips = tips;
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem("mq_loading_tips", JSON.stringify(tips));
    } catch {}
  }
}

export function LoadingScreen({ message }: { message?: string }) {
  // Use stable placeholder on SSR to avoid hydration mismatch
  const [tip, setTip] = useState<string>(message || "Loading your adventure...");
  const [isReady, setIsReady] = useState<boolean>(Boolean(message));

  useEffect(() => {
    if (message) {
      setTip(message);
      setIsReady(true);
      return;
    }

    // 1. Synchronously read from in-memory cache or localStorage (0ms instant)
    let activeTips = cachedTips;
    if (!activeTips && typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("mq_loading_tips");
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed) && parsed.length > 0) {
            activeTips = parsed;
            cachedTips = parsed;
          }
        }
      } catch {}
    }

    // If custom tips exist in cache, pick immediately with 0 delay (never shows deleted default tips!)
    if (activeTips && activeTips.length > 0) {
      setTip(activeTips[Math.floor(Math.random() * activeTips.length)]);
      setIsReady(true);
    }

    // 2. Sync with Firestore in the background to ensure remote GM updates are applied
    let isMounted = true;
    async function fetchTips() {
      try {
        let snap = await getDoc(doc(db, "settings", "loadingTips")).catch(() => null);
        if (!snap || !snap.exists()) {
          snap = await getDoc(doc(db, "locations", "loading_screen_settings")).catch(() => null);
        }

        if (snap && snap.exists()) {
          const data = snap.data();
          if (Array.isArray(data.tips) && data.tips.length > 0) {
            updateCachedTips(data.tips);
            if (isMounted) {
              setTip(data.tips[Math.floor(Math.random() * data.tips.length)]);
              setIsReady(true);
            }
            return;
          }
        }
      } catch (err) {
        // Fallback
      }

      // If no custom tips exist anywhere (neither in cache nor in database), fall back to defaults
      if (isMounted && (!cachedTips || cachedTips.length === 0)) {
        updateCachedTips(DEFAULT_LOADING_TIPS);
        setTip(DEFAULT_LOADING_TIPS[Math.floor(Math.random() * DEFAULT_LOADING_TIPS.length)]);
        setIsReady(true);
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
          className="text-base sm:text-lg font-bold text-indigo-200 tracking-wide font-serif leading-relaxed px-4 py-2 bg-black/40 rounded-xl border border-indigo-500/20 shadow-inner min-h-[44px] flex items-center justify-center transition-all duration-200"
        >
          {isReady ? `\u201C${tip}\u201D` : "Loading your adventure..."}
        </h3>
        <p className="text-xs text-gray-500 font-mono">
          Preparing realm...
        </p>
      </div>
    </div>
  );
}
