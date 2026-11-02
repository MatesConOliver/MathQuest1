'use client';

import React, { useState, useEffect } from 'react';
import { useSystemIcons } from '@/context/SystemIconsContext';

export interface GameIconProps {
  name: string;
  fallback?: string;
  className?: string;
  alt?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | number;
  inline?: boolean;
}

const SIZE_CLASSES = {
  xs: 'w-3.5 h-3.5',
  sm: 'w-4 h-4',
  md: 'w-5 h-5',
  lg: 'w-6 h-6',
  xl: 'w-8 h-8',
  '2xl': 'w-10 h-10',
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
  }

  // If a custom image URL exists and hasn't errored out, render the custom asset
  if (iconUrl && !hasImgError) {
    return (
      <span
        className={`${inline ? 'inline-flex items-center justify-center align-middle' : 'flex items-center justify-center'} shrink-0 select-none ${className}`}
        style={inlineStyle}
      >
        <img
          src={iconUrl}
          alt={alt || name}
          onError={() => setHasImgError(true)}
          className={`object-contain pointer-events-none ${sizeClass || 'w-[1.15em] h-[1.15em]'}`}
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
      {resolvedFallback}
    </span>
  );
}

export default GameIcon;
