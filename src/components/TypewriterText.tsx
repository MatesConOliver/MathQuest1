"use client";
import { useState, useEffect } from 'react';

interface TypewriterTextProps {
  text: string;
  speed?: number; // Speed in milliseconds per character
  className?: string;
}

export function TypewriterText({ text, speed = 50, className }: TypewriterTextProps) {
  const [displayedText, setDisplayedText] = useState('');

  useEffect(() => {
    setDisplayedText(''); // Reset on text change
    let i = 0;
    const interval = setInterval(() => {
      if (i < text.length) {
        setDisplayedText(prev => prev + text.charAt(i));
        i++;
      } else {
        clearInterval(interval);
      }
    }, speed);

    return () => clearInterval(interval);
  }, [text, speed]);

  return <p className={className}>{displayedText}</p>;
}
