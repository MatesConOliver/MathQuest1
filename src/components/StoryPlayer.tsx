"use client";

import { useState, useMemo, useEffect } from "react";
import { StoryEvent, StoryScene } from "@/types/game";
import { TypewriterText } from "./TypewriterText";

interface StoryPlayerProps {
  story: StoryEvent;
  onComplete: () => void;
}

export function StoryPlayer({ story, onComplete }: StoryPlayerProps) {
  const [currentSceneId, setCurrentSceneId] = useState<string | "END">("scene_1");

  const currentScene = useMemo(() => {
    // Start with the first scene if the ID is the initial one
    if (currentSceneId === "scene_1") {
        return story.scenes[0];
    }
    return story.scenes.find(s => s.id === currentSceneId);
  }, [currentSceneId, story.scenes]);

  // Effect to handle END state
  useEffect(() => {
    if (currentSceneId === "END") {
      onComplete();
    }
  }, [currentSceneId, onComplete]);
  
  if (!currentScene) {
    return null; // Or some fallback UI
  }

  const handleNext = () => {
    // If there are choices, this button shouldn't be the primary way to advance.
    if (currentScene.choices && currentScene.choices.length > 0) {
        return; 
    }
    setCurrentSceneId(currentScene.nextSceneId || "END");
  };

  const handleChoice = (nextId: string) => {
    setCurrentSceneId(nextId);
  }

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex flex-col justify-end">
        {/* Media Layer */}
        <div className="absolute inset-0">
          {currentScene.videoUrl ? (
            <video src={currentScene.videoUrl} autoPlay loop muted className="w-full h-full object-cover"/>
          ) : (
            <>
              {currentScene.backgroundUrl && <img src={currentScene.backgroundUrl} className="w-full h-full object-cover" alt="Background"/>}
              {currentScene.speakerSprite && (
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 h-2/3">
                    <img src={currentScene.speakerSprite} className="h-full w-auto object-contain" alt={currentScene.speakerName}/>
                </div>
              )}
            </>
          )}
        </div>

        {/* Dialogue Box */}
        <div className="relative m-4 p-6 bg-white/90 dark:bg-black/80 backdrop-blur-md rounded-xl border-2 border-gray-300 dark:border-gray-700 shadow-lg">
            {currentScene.speakerName && currentScene.speakerName.toLowerCase() !== "narrator" && (
                <div className="absolute -top-4 left-8 bg-blue-500 text-white font-bold px-4 py-1 rounded-full text-lg">
                    {currentScene.speakerName}
                </div>
            )}
            
            <TypewriterText text={currentScene.text} speed={30} className="text-xl text-gray-900 dark:text-gray-100 mb-4 min-h-[60px]"/>

            {/* Choices or Next Button */}
            <div className="flex justify-end space-x-4">
                {currentScene.choices ? (
                    currentScene.choices.map((choice, idx) => (
                        <button key={idx} onClick={() => handleChoice(choice.nextSceneId)} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg transition">
                            {choice.text}
                        </button>
                    ))
                ) : (
                    <button onClick={handleNext} className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg transition">
                        Next →
                    </button>
                )}
            </div>
        </div>
    </div>
  );
}
