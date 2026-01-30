'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { StoryEvent } from '@/types/game';
import { TypewriterText } from './TypewriterText';
import { callApi } from '@/lib/firebase';
import { useAudio } from '@/context/AudioContext';

interface StoryPlayerProps {
  story: StoryEvent;
  onComplete: () => void;
}

// --- Preloading Helpers (no changes) ---
const preloadImage = (src: string) => new Promise((resolve, reject) => {
  const img = new Image();
  img.src = src;
  img.onload = resolve;
  img.onerror = reject;
});
const preloadVideo = (src: string) => new Promise((resolve, reject) => {
  const video = document.createElement('video');
  video.src = src;
  video.oncanplaythrough = resolve;
  video.onerror = reject;
});
const preloadAudio = (src: string) => new Promise((resolve, reject) => {
  const audio = new Audio();
  audio.src = src;
  audio.oncanplaythrough = resolve;
  audio.onerror = reject;
});

export function StoryPlayer({ story, onComplete }: StoryPlayerProps) {
  const [currentSceneId, setCurrentSceneId] = useState<string | 'END'>(
    story.scenes[0]?.id || 'END'
  );
  const [opacity, setOpacity] = useState(0);
  const [transitionDuration, setTransitionDuration] = useState(500);
  const [name, setName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPreloading, setIsPreloading] = useState(true);
  
  const audio = useAudio();
  const originalMusicTrack = useRef<string | null>(null);

  // --- Store and manage music ---
  useEffect(() => {
    if (audio) {
      // 1. On component mount, store the current BGM
      originalMusicTrack.current = audio.currentTrack;
    }

    return () => {
      // 5. On component unmount, restore the original BGM
      if (audio && originalMusicTrack.current) {
        audio.playTrack(originalMusicTrack.current);
      } else if (audio) {
        audio.stopTrack();
      }
    };
  }, [audio]);

  // --- Preloading Effect (no changes) ---
  useEffect(() => {
    const preloadAssets = async () => {
      const urlsToPreload = story.scenes.flatMap(scene =>
        [scene.videoUrl, scene.backgroundUrl, scene.speakerSprite, scene.musicUrl].filter(Boolean) as string[]
      );
      const uniqueUrls = [...new Set(urlsToPreload)];
      const promises = uniqueUrls.map(url => {
        if (url.match(/\.(jpeg|jpg|gif|png|svg)$/i)) return preloadImage(url);
        if (url.match(/\.(mp4|webm|ogg)$/i)) return preloadVideo(url);
        if (url.match(/\.(mp3|wav|ogg)$/i)) return preloadAudio(url);
        return Promise.resolve();
      });
      await Promise.allSettled(promises);
      setIsPreloading(false);
    };
    if (story && story.scenes?.length > 0) {
      preloadAssets();
    } else {
      setIsPreloading(false);
    }
  }, [story]);

  const currentScene = useMemo(() => {
    return story.scenes.find((s) => s.id === currentSceneId);
  }, [currentSceneId, story.scenes]);

  // --- Main Scene Logic & Music Control ---
  useEffect(() => {
    if (isPreloading) return;

    if (!currentScene) {
      onComplete(); // This eventually triggers the unmount cleanup
      return;
    }

    // 2. Manage music for the current scene
    if (audio) {
      if (currentScene.musicUrl) {
        audio.playTrack(currentScene.musicUrl); // Play scene-specific music
      } else {
        audio.stopTrack(); // Or stop music if the scene has none
      }
    }
    
    setTransitionDuration(currentScene.fadeIn ?? true ? 500 : 0);
    const timer = setTimeout(() => setOpacity(1), 50);
    return () => clearTimeout(timer);

  }, [currentScene, onComplete, isPreloading, audio]);

  // --- Transition and other handlers (no major changes) ---
  const transitionToScene = (nextId: string) => {
    const shouldFadeOut = currentScene?.fadeOut ?? true;
    setTransitionDuration(shouldFadeOut ? 500 : 0);
    setOpacity(0);

    setTimeout(() => {
      if (nextId === 'END') {
        onComplete();
        return;
      }
      setCurrentSceneId(nextId);
      // Opacity is set in the main useEffect after scene loads
    }, shouldFadeOut ? 500 : 10);
  };

  const handleNext = () => {
    if (currentScene?.command === 'PROMPT_NAME' || (currentScene?.choices && currentScene.choices.length > 0)) return;
    transitionToScene(currentScene?.nextSceneId || 'END');
  };

  const handleChoice = (nextId: string) => transitionToScene(nextId);

  const handleNameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await callApi('updateCharacterName', { name: name.trim() });
      transitionToScene(currentScene?.nextSceneId || 'END');
    } catch (error) { 
      console.error("Error updating name:", error);
      alert("There was an error setting your name. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVideoEnd = () => {
    if (currentScene?.videoUrl && !(currentScene.loopVideo ?? true)) {
      handleNext();
    }
  };
  
  if (isPreloading) {
    return (
      <div className="fixed inset-0 bg-black z-50 flex items-center justify-center text-white">
        <p>Loading Story...</p>
      </div>
    );
  }

  if (!currentScene) return null;

  const isClickableOverlay = !currentScene.text && !currentScene.choices && currentScene.command !== 'PROMPT_NAME';

  // --- JSX (no changes) ---
  return (
    <div
      className={'fixed inset-0 z-50 flex flex-col justify-end'}
      style={{ transition: `opacity ${transitionDuration}ms ease-in-out`, opacity: opacity }}
      onClick={isClickableOverlay ? handleNext : undefined}
    >
      <div className={`absolute inset-0 ${!currentScene.videoUrl ? 'bg-black' : ''}`}>
        {currentScene.videoUrl ? (
          <video
            key={currentScene.id}
            src={currentScene.videoUrl}
            autoPlay
            muted
            loop={currentScene.loopVideo ?? true}
            onEnded={handleVideoEnd}
            className='w-full h-full object-cover'
          />
        ) : (
          <>
            {currentScene.backgroundUrl && <img src={currentScene.backgroundUrl} className='w-full h-full object-cover' alt='Background' />}
            {currentScene.speakerSprite && (
              <div className='absolute bottom-0 left-1/2 -translate-x-1/2 h-2/3'>
                <img src={currentScene.speakerSprite} className='h-full w-auto object-contain' alt={currentScene.speakerName} />
              </div>
            )}
          </>
        )}
      </div>

      {currentScene.text && (
        <div className='relative m-4 p-6 bg-white/90 dark:bg-black/80 backdrop-blur-md rounded-xl border-2 border-gray-300 dark:border-gray-700 shadow-lg'>
          {currentScene.speakerName && currentScene.speakerName.toLowerCase() !== 'narrator' && (
            <div className='absolute -top-4 left-8 bg-blue-500 text-white font-bold px-4 py-1 rounded-full text-lg'>
              {currentScene.speakerName}
            </div>
          )}

          <TypewriterText text={currentScene.text} speed={30} className='text-xl text-gray-900 dark:text-gray-100 mb-4 min-h-[60px]' />

          {currentScene.command === 'PROMPT_NAME' ? (
            <form onSubmit={handleNameSubmit} className="flex items-center space-x-2">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="flex-grow p-2 rounded-lg border border-gray-400 dark:bg-gray-700 dark:text-white"
                placeholder="Enter your name..."
                required
                minLength={2}
                maxLength={50}
              />
              <button type="submit" disabled={isSubmitting} className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg transition disabled:opacity-50">
                {isSubmitting ? 'Saving...' : 'Confirm'}
              </button>
            </form>
          ) : (
            <div className='flex justify-end space-x-4'>
              {currentScene.choices ? (
                currentScene.choices.map((choice, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleChoice(choice.nextSceneId)}
                    className='bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg transition'
                  >
                    {choice.text}
                  </button>
                ))
              ) : (
                <button
                  onClick={handleNext}
                  className='bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg transition'
                >
                  Next →
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
