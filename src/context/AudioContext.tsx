"use client"; // 👈 This makes it work with browsers

import { createContext, useContext, useEffect, useRef, useState } from "react";

type AudioContextType = {
  playTrack: (trackUrl: string) => void;
};

const AudioContext = createContext<AudioContextType | null>(null);

export function AudioProvider({ children }: { children: React.ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [currentTrack, setCurrentTrack] = useState<string>("");

  const playTrack = (trackUrl: string) => {
    if (!audioRef.current) return;
    if (currentTrack === trackUrl) return; // Already playing this song? Do nothing.

    setCurrentTrack(trackUrl);
    audioRef.current.src = trackUrl;
    audioRef.current.play().catch((err) => console.log("Audio waiting for interaction..."));
  };

  // Global unlocker: The first click anywhere starts the music if it's paused
  useEffect(() => {
    const unlockAudio = () => {
      if (audioRef.current && audioRef.current.paused && currentTrack) {
        audioRef.current.play().catch(() => {});
      }
    };
    window.addEventListener("click", unlockAudio);
    window.addEventListener("keydown", unlockAudio);
    return () => {
      window.removeEventListener("click", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
    };
  }, [currentTrack]);

  return (
    <AudioContext.Provider value={{ playTrack }}>
      <audio ref={audioRef} loop hidden />
      {children}
    </AudioContext.Provider>
  );
}

export function useAudio() {
  return useContext(AudioContext);
}