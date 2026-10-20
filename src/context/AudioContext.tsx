"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from "react";

type AudioContextType = {
  playTrack: (url: string) => void;
  playSfx: (url: string) => void;
  stopTrack: () => void;
  currentTrack: string;
  volume: number;
  setVolume: (vol: number) => void;
  isMuted: boolean;
  toggleMute: () => void;
};

const AudioContext = createContext<AudioContextType | null>(null);

// Fallback Web Audio synthesizer for instant, crisp RPG sound effects
function playSynthesizedSfx(type: string) {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();

    if (type.includes("upgrade") || type === "levelup") {
      // Ascending major arpeggio chime (C5, E5, G5, C6)
      const notes = [523.25, 659.25, 783.99, 1046.50];
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.08);
        gain.gain.setValueAtTime(0, ctx.currentTime + idx * 0.08);
        gain.gain.linearRampToValueAtTime(0.25, ctx.currentTime + idx * 0.08 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.08 + 0.3);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + idx * 0.08);
        osc.stop(ctx.currentTime + idx * 0.08 + 0.35);
      });
    } else if (type.includes("hit") || type === "damage") {
      // Punchy impact sound
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(160, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.18);
      gain.gain.setValueAtTime(0.35, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.22);
    } else if (type.includes("attack") || type === "slash") {
      // Blade swoosh
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(500, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(180, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.28, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.16);
    }
  } catch (err) {
    console.warn("Synthesized sound error", err);
  }
}

export function AudioProvider({ children }: { children: React.ReactNode }) {
  const musicRef = useRef<HTMLAudioElement | null>(null);
  const currentTrackRef = useRef("");
  const [currentTrack, setCurrentTrack] = useState<string>("");
  const [volume, setVolumeState] = useState<number>(0.3);
  const [isMuted, setIsMuted] = useState<boolean>(false);

  // Restore volume preferences on mount
  useEffect(() => {
    try {
      const savedVol = localStorage.getItem("mq_audio_volume");
      const savedMute = localStorage.getItem("mq_audio_muted");
      if (savedVol !== null) {
        const parsed = parseFloat(savedVol);
        if (!isNaN(parsed) && parsed >= 0 && parsed <= 1) setVolumeState(parsed);
      }
      if (savedMute !== null) {
        setIsMuted(savedMute === "true");
      }
    } catch (_) {}
  }, []);

  const setVolume = useCallback((vol: number) => {
    const clamped = Math.max(0, Math.min(1, vol));
    setVolumeState(clamped);
    if (musicRef.current) {
      musicRef.current.volume = isMuted ? 0 : clamped;
    }
    try {
      localStorage.setItem("mq_audio_volume", clamped.toString());
    } catch (_) {}
  }, [isMuted]);

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      if (musicRef.current) {
        musicRef.current.volume = next ? 0 : volume;
      }
      try {
        localStorage.setItem("mq_audio_muted", next.toString());
      } catch (_) {}
      return next;
    });
  }, [volume]);

  // Play Background Music (Loops)
  const playTrack = useCallback((url: string) => {
    if (!musicRef.current) return;
    if (currentTrackRef.current === url && !musicRef.current.paused) return;

    currentTrackRef.current = url;
    setCurrentTrack(url);
    musicRef.current.src = url;
    musicRef.current.volume = isMuted ? 0 : volume;
    musicRef.current.play().catch(() => console.log("BGM waiting for interaction..."));
  }, [isMuted, volume]);

  const stopTrack = useCallback(() => {
    if (!musicRef.current || !currentTrackRef.current) return;
    musicRef.current.pause();
    currentTrackRef.current = "";
    setCurrentTrack("");
  }, []);

  // Play Sound Effect with Web Audio fallback
  const playSfx = useCallback((url: string) => {
    if (isMuted) return;

    // Check if it's a symbolic sfx or missing asset
    if (url.includes("upgrade") || url.includes("levelup") || url === "hit" || url === "attack" || url === "slash") {
      playSynthesizedSfx(url);
      return;
    }

    try {
      const sfx = new Audio(url);
      sfx.volume = Math.min(1, volume * 1.5);
      sfx.play().catch(() => {
        // Fallback to synthesized audio on error
        playSynthesizedSfx(url);
      });
    } catch {
      playSynthesizedSfx(url);
    }
  }, [isMuted, volume]);

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
    () => ({ playTrack, playSfx, stopTrack, currentTrack, volume, setVolume, isMuted, toggleMute }),
    [playTrack, playSfx, stopTrack, currentTrack, volume, setVolume, isMuted, toggleMute]
  );

  return (
    <AudioContext.Provider value={audioContextValue}>
      <audio ref={musicRef} loop hidden />
      {children}
      <AudioControlWidget />
    </AudioContext.Provider>
  );
}

export function useAudio() {
  return useContext(AudioContext);
}

export function AudioControlWidget() {
  const audio = useAudio();
  const [isOpen, setIsOpen] = useState(false);

  if (!audio) return null;

  return (
    <div className="fixed top-4 right-4 z-50 flex items-center flex-row-reverse gap-2">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-9 h-9 rounded-full bg-black/75 hover:bg-black text-white shadow-lg border border-white/20 flex items-center justify-center transition-all hover:scale-105 active:scale-95 text-sm"
        title="Audio Settings"
        aria-label="Audio Settings"
      >
        {audio.isMuted ? "🔇" : audio.volume === 0 ? "🔈" : "🎵"}
      </button>
      {isOpen && (
        <div className="bg-gray-900/90 text-white backdrop-blur-md px-3 py-1.5 rounded-xl shadow-xl border border-white/20 flex items-center gap-3 animate-in fade-in slide-in-from-top-2 duration-150">
          <button
            onClick={audio.toggleMute}
            className="text-xs font-bold hover:text-yellow-400 transition-colors"
            title={audio.isMuted ? "Unmute" : "Mute"}
          >
            {audio.isMuted ? "🔇 Unmute" : "🔊 Sound"}
          </button>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={audio.isMuted ? 0 : audio.volume}
            onChange={(e) => {
              if (audio.isMuted) audio.toggleMute();
              audio.setVolume(parseFloat(e.target.value));
            }}
            className="w-20 h-1.5 accent-yellow-400 cursor-pointer"
          />
          <span className="text-[10px] font-mono text-gray-300 w-6">
            {audio.isMuted ? "0%" : `${Math.round(audio.volume * 100)}%`}
          </span>
        </div>
      )}
    </div>
  );
}
