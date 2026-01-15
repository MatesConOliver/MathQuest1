'use client';

import { useState, useEffect } from 'react';

interface TypewriterTextProps {
  text: string;
  speed?: number; // Speed in milliseconds per character
  className?: string;
}

export function TypewriterText({ text, speed = 30, className }: TypewriterTextProps) {
  const [displayedText, setDisplayedText] = useState('');

  useEffect(() => {
    if (!text) return;

    setDisplayedText(''); // Reset on text change

    // If the text is meant to appear instantly (e.g., speed is 0 or negative)
    if (speed <= 0) {
        setDisplayedText(text);
        return;
    }

    let i = 0;
    const intervalId = setInterval(() => {
      if (i < text.length) {
        setDisplayedText(text.substring(0, i + 1));
        i++;
      } else {
        clearInterval(intervalId);
      }
    }, speed);

    return () => clearInterval(intervalId);
  }, [text, speed]);

  return <p className={className}>{displayedText}</p>;
}
