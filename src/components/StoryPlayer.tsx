'use client';

import { useState, useMemo, useEffect } from 'react';
import { StoryEvent, StoryScene } from '@/types/game';
import { TypewriterText } from './TypewriterText';
import { callApi } from '@/lib/firebase';

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
  const [name, setName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const currentScene = useMemo(() => {
    return story.scenes.find((s) => s.id === currentSceneId);
  }, [currentSceneId, story.scenes]);

  useEffect(() => {
    if (!currentScene) {
      onComplete();
      return;
    }
    setTransitionDuration(currentScene.fadeIn ?? true ? 500 : 0);
    const timer = setTimeout(() => setOpacity(1), 50);
    return () => clearTimeout(timer);
  }, [currentScene, onComplete]);

  const transitionToScene = (nextId: string) => {
    const shouldFadeOut = currentScene?.fadeOut ?? true;
    setTransitionDuration(shouldFadeOut ? 500 : 0);
    setOpacity(0);

    setTimeout(() => {
      if (nextId === 'END') {
        onComplete();
        return;
      }
      const nextScene = story.scenes.find((s) => s.id === nextId);
      if (!nextScene) {
        onComplete();
        return;
      }
      setTransitionDuration(nextScene.fadeIn ?? true ? 500 : 0);
      setCurrentSceneId(nextId);
      setTimeout(() => setOpacity(1), 50);
    }, shouldFadeOut ? 500 : 10);
  };

  const handleNext = () => {
    if (currentScene?.command === 'PROMPT_NAME' || (currentScene?.choices && currentScene.choices.length > 0)) return;
    transitionToScene(currentScene?.nextSceneId || 'END');
  };

  const handleChoice = (nextId: string) => {
    transitionToScene(nextId);
  };

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

  if (!currentScene) return null;

  const isClickableOverlay = !currentScene.text && !currentScene.choices && currentScene.command !== 'PROMPT_NAME';

  return (
    <div
      className={'fixed inset-0 bg-black z-50 flex flex-col justify-end'}
      style={{ transition: `opacity ${transitionDuration}ms ease-in-out`, opacity: opacity }}
      onClick={isClickableOverlay ? handleNext : undefined}
    >
      {/* Media Layer */}
      <div className='absolute inset-0'>
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

      {/* Dialogue Box */}
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
