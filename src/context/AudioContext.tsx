"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from "react";

type AudioContextType = {
  playTrack: (url: string) => void; // For Background Music (loops)
  playSfx: (url: string) => void;   // For Sound Effects (one-shot)
  stopTrack: () => void;           // To stop background music
  currentTrack: string;            // URL of the current BGM track
};

const AudioContext = createContext<AudioContextType | null>(null);

export function AudioProvider({ children }: { children: React.ReactNode }) {
  // 1. The Background Music Player (Persistent)
  const musicRef = useRef<HTMLAudioElement | null>(null);
  const currentTrackRef = useRef("");
  const [currentTrack, setCurrentTrack] = useState<string>("");

  // Function A: Play Background Music (Loops, only one at a time)
  const playTrack = useCallback((url: string) => {
    if (!musicRef.current) return;
    if (currentTrackRef.current === url && !musicRef.current.paused) return;

    currentTrackRef.current = url;
    setCurrentTrack(url);
    musicRef.current.src = url;
    musicRef.current.volume = 0.3; // Background music at 30% volume
    musicRef.current.play().catch(() => console.log("BGM waiting for interaction..."));
  }, []);

  // Function B: Stop Background Music
  const stopTrack = useCallback(() => {
    if (!musicRef.current || !currentTrackRef.current) return;
    musicRef.current.pause();
    currentTrackRef.current = "";
    setCurrentTrack("");
  }, []);

  // Function C: Play Sound Effect (Fire-and-forget, allows overlap)
  const playSfx = useCallback((url: string) => {
    try {
      const sfx = new Audio(url);
      sfx.volume = 0.5; // SFX slightly louder (50%)
      sfx.play().catch((e) => console.error("SFX blocked", e));
    } catch (e) {
      console.error("Audio error", e);
    }
  }, []);

  // Global unlocker for Background Music
  useEffect(() => {
    const unlockAudio = () => {
      if (musicRef.current && musicRef.current.paused && currentTrack) {
        musicRef.current.play().catch(() => {});
      }
    };
    window.addEventListener("click", unlockAudio);
    window.addEventListener("keydown", unlockAudio);
    return () => {
      window.removeEventListener("click", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
    };
  }, [currentTrack]);

  const audioContextValue = useMemo(
    () => ({ playTrack, playSfx, stopTrack, currentTrack }),
    [playTrack, playSfx, stopTrack, currentTrack]
  );

  return (
    <AudioContext.Provider value={audioContextValue}>
      {/* Hidden player for Background Music only */}
      <audio ref={musicRef} loop hidden />
      {children}
    </AudioContext.Provider>
  );
}

export function useAudio() {
  return useContext(AudioContext);
}
