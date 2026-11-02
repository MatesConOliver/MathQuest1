'use client';

import React, { useState, useEffect } from 'react';
import { useSystemIcons } from '@/context/SystemIconsContext';

export interface GameIconProps {
  name: string;
  fallback?: string;
  className?: string;
  alt?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | number;
  inline?: boolean;
}

const SIZE_CLASSES = {
  xs: 'w-4.5 h-4.5',   // 18px (crisp, readable inline)
  sm: 'w-5.5 h-5.5',   // 22px
  md: 'w-7 h-7',       // 28px
  lg: 'w-9 h-9',       // 36px
  xl: 'w-12 h-12',     // 48px
  '2xl': 'w-16 h-16',  // 64px
  '3xl': 'w-20 h-20',  // 80px
  '4xl': 'w-28 h-28',  // 112px
};

export function GameIcon({
  name,
  fallback,
  className = '',
  alt,
  size,
  inline = true,
}: GameIconProps) {
  const { getIconUrl, getDefaultEmoji } = useSystemIcons();
  const [hasImgError, setHasImgError] = useState(false);

  const iconUrl = getIconUrl(name);
  const resolvedFallback = fallback || getDefaultEmoji(name);

  // Reset error state if iconUrl changes
  useEffect(() => {
    setHasImgError(false);
  }, [iconUrl]);

  let sizeClass = '';
  let inlineStyle: React.CSSProperties = {};

  if (typeof size === 'number') {
    inlineStyle = { width: `${size}px`, height: `${size}px` };
  } else if (size && SIZE_CLASSES[size]) {
    sizeClass = SIZE_CLASSES[size];
  } else if (!size) {
    sizeClass = 'w-[1.25em] h-[1.25em]';
  }

  // If a custom image URL exists and hasn't errored out, render the custom asset
  if (iconUrl && !hasImgError) {
    return (
      <span
        className={`${inline ? 'inline-flex items-center justify-center align-middle' : 'flex items-center justify-center'} shrink-0 select-none ${sizeClass} ${className}`}
        style={inlineStyle}
      >
        <img
          src={iconUrl}
          alt={alt || name}
          onError={() => setHasImgError(true)}
          className="w-full h-full object-contain pointer-events-none drop-shadow-sm"
          loading="lazy"
        />
      </span>
    );
  }

  // Graceful fallback to emoji representation
  return (
    <span
      role="img"
      aria-label={alt || name}
      className={`${inline ? 'inline-flex items-center justify-center align-middle' : 'flex items-center justify-center'} shrink-0 select-none ${sizeClass} ${className}`}
      style={inlineStyle}
    >
      <span className="leading-none text-center select-none flex items-center justify-center w-full h-full">
        {resolvedFallback}
      </span>
    </span>
  );
}

export default GameIcon;
