
import { Story } from '@/types/game';
import React from 'react';

interface StoryDisplayProps {
  story: Story;
  onFinish: () => void;
}

export const StoryDisplay: React.FC<StoryDisplayProps> = ({ story, onFinish }) => {
  return (
    <div className="fixed inset-0 bg-gray-900 bg-opacity-80 flex items-center justify-center z-50">
      <div className="bg-gray-800 border border-gray-700 text-white p-8 rounded-lg shadow-lg max-w-2xl mx-auto animate-fade-in">
        <h1 className="text-3xl font-bold mb-4 text-yellow-400">{story.title}</h1>
        <div className="whitespace-pre-wrap mb-6 text-lg leading-relaxed">
          {story.text}
        </div>
        <button
          onClick={onFinish}
          className="bg-yellow-500 hover:bg-yellow-600 text-gray-900 font-bold py-2 px-6 rounded transition-colors duration-300"
        >
          Continue
        </button>
      </div>
    </div>
  );
};
