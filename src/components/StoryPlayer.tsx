'use client';

import { useState, useMemo, useEffect } from 'react';
import { StoryEvent, StoryScene } from '@/types/game';
import { TypewriterText } from './TypewriterText';

interface StoryPlayerProps {
  story: StoryEvent;
  onComplete: () => void;
}

export function StoryPlayer({ story, onComplete }: StoryPlayerProps) {
  const [currentSceneId, setCurrentSceneId] = useState<string | 'END'>(
    story.scenes[0]?.id || 'END'
  );
  const [opacity, setOpacity] = useState(0);
  const [transitionDuration, setTransitionDuration] = useState(500);

  const currentScene = useMemo(() => {
    return story.scenes.find((s) => s.id === currentSceneId);
  }, [currentSceneId, story.scenes]);

  // Initial scene load
  useEffect(() => {
    if (!currentScene) {
      onComplete();
      return;
    }
    setTransitionDuration(currentScene.fadeIn ?? true ? 500 : 0);
    // Use a timeout to allow the initial state to render before fading in
    const timer = setTimeout(() => setOpacity(1), 50);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Scene Transition Logic ---
  const transitionToScene = (nextId: string) => {
    const shouldFadeOut = currentScene?.fadeOut ?? true;

    // 1. Fade or cut out
    setTransitionDuration(shouldFadeOut ? 500 : 0);
    setOpacity(0);

    // 2. Wait for fade out to finish
    setTimeout(() => {
        if (nextId === 'END') {
            onComplete();
            return;
        }

        const nextScene = story.scenes.find(s => s.id === nextId);
        if (!nextScene) { // Should not happen with correct data
            onComplete();
            return;
        }

        // 3. Change content while invisible
        setTransitionDuration(nextScene.fadeIn ?? true ? 500 : 0);
        setCurrentSceneId(nextId);

        // 4. Fade or cut in
        setOpacity(1);

    }, shouldFadeOut ? 500 : 10); // Wait for transition or just a moment for hard cut
  };

  const handleNext = () => {
    if (currentScene?.choices && currentScene.choices.length > 0) return;
    transitionToScene(currentScene?.nextSceneId || 'END');
  };

  const handleChoice = (nextId: string) => {
    transitionToScene(nextId);
  };

  if (!currentScene) {
    return null;
  }

  const isClickableOverlay = !currentScene.text && !currentScene.choices;

  return (
    <div
      className={'fixed inset-0 bg-black z-50 flex flex-col justify-end'}
      style={{ 
        transition: `opacity ${transitionDuration}ms ease-in-out`,
        opacity: opacity
      }}
      onClick={isClickableOverlay ? handleNext : undefined}
    >
      {/* Media Layer */}
      <div className='absolute inset-0'>
        {currentScene.videoUrl ? (
          <video
            src={currentScene.videoUrl}
            autoPlay
            loop
            muted
            className='w-full h-full object-cover'
          />
        ) : (
          <>
            {currentScene.backgroundUrl && (
              <img
                src={currentScene.backgroundUrl}
                className='w-full h-full object-cover'
                alt='Background'
              />
            )}
            {currentScene.speakerSprite && (
              <div className='absolute bottom-0 left-1/2 -translate-x-1/2 h-2/3'>
                <img
                  src={currentScene.speakerSprite}
                  className='h-full w-auto object-contain'
                  alt={currentScene.speakerName}
                />
              </div>
            )}
          </>
        )}
      </div>

      {/* Dialogue Box (only shown if there is text) */}
      {currentScene.text && (
        <div className='relative m-4 p-6 bg-white/90 dark:bg-black/80 backdrop-blur-md rounded-xl border-2 border-gray-300 dark:border-gray-700 shadow-lg'>
          {currentScene.speakerName &&
            currentScene.speakerName.toLowerCase() !== 'narrator' && (
              <div className='absolute -top-4 left-8 bg-blue-500 text-white font-bold px-4 py-1 rounded-full text-lg'>
                {currentScene.speakerName}
              </div>
            )}

          <TypewriterText
            text={currentScene.text}
            speed={30}
            className='text-xl text-gray-900 dark:text-gray-100 mb-4 min-h-[60px]'
          />

          {/* Choices or Next Button */}
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
        </div>
      )}
    </div>
  );
}
