'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { InlineMath } from 'react-katex';
import 'katex/dist/katex.min.css';
import { SpecialFightProps } from './types';
import { LOCATION_2_ASSETS } from '@/config/assetStructure';
import {
  Sparkles,
  ShieldAlert,
  Zap,
  HelpCircle,
  X,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Hand,
  Heart,
  Skull,
  RotateCcw,
} from 'lucide-react';
import { getLoc2SpriteConfig, Loc2SpriteConfig } from '@/config/specialFightSprites';

// Render an emoji completely 100% opaque on an offscreen canvas with solid backing & clamped alpha
function createOpaqueEmojiCanvas(emoji: string, size = 128): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const cx = size / 2;
  const cy = size / 2;
  const fontSize = Math.round(size * 0.74);

  // 1. Probe canvas to calculate exact alpha bounds
  const probe = document.createElement('canvas');
  probe.width = size;
  probe.height = size;
  const pCtx = probe.getContext('2d');
  if (!pCtx) return canvas;

  pCtx.font = `${fontSize}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
  pCtx.textAlign = 'center';
  pCtx.textBaseline = 'middle';
  pCtx.fillText(emoji, cx, cy);

  try {
    const probeData = pCtx.getImageData(0, 0, size, size);
    const pD = probeData.data;

    // Solid opaque backing under any non-transparent pixel so background NEVER bleeds through
    const maskData = ctx.createImageData(size, size);
    const mD = maskData.data;
    for (let i = 0; i < pD.length; i += 4) {
      if (pD[i + 3] > 8) {
        mD[i] = 255;
        mD[i + 1] = 255;
        mD[i + 2] = 255;
        mD[i + 3] = 255;
      }
    }
    ctx.putImageData(maskData, 0, 0);

    // 2. Draw crisp emoji centered over the solid white backing
    ctx.font = `${fontSize}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emoji, cx, cy);

    // 3. Force 100% opacity on all rendered pixels (alpha = 255)
    const finalData = ctx.getImageData(0, 0, size, size);
    const fD = finalData.data;
    for (let i = 0; i < fD.length; i += 4) {
      if (fD[i + 3] > 8) {
        fD[i + 3] = 255;
      }
    }
    ctx.putImageData(finalData, 0, 0);
  } catch {
    ctx.font = `${fontSize}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emoji, cx, cy);
  }

  return canvas;
}

// Process a sprite on an offscreen canvas to turn white background into smooth alpha transparency
function createProcessedTransparentCanvas(
  img: HTMLImageElement,
  mode: 'removeWhite' | 'removeDark' = 'removeWhite'
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth || img.width || 256;
  canvas.height = img.naturalHeight || img.height || 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.drawImage(img, 0, 0);
  try {
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imgData.data;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      if (mode === 'removeWhite') {
        const minVal = Math.min(r, g, b);
        const maxVal = Math.max(r, g, b);
        const diff = maxVal - minVal;
        if (minVal > 210 && diff < 30) {
          const avg = (r + g + b) / 3;
          if (avg >= 238) {
            data[i + 3] = 0;
          } else {
            data[i + 3] = Math.round(((238 - avg) / 28) * 255);
          }
        }
      } else if (mode === 'removeDark') {
        const maxVal = Math.max(r, g, b);
        if (maxVal < 36) {
          if (maxVal < 20) {
            data[i + 3] = 0;
          } else {
            data[i + 3] = Math.round(((maxVal - 20) / 16) * 255);
          }
        }
      }
    }
    ctx.putImageData(imgData, 0, 0);
  } catch {
    // If CORS or local context prevents pixel manipulation, keep canvas as-is
  }
  return canvas;
}

// Fraction utilities for exact mathematical representation
export interface Fraction {
  num: number;
  den: number; // always > 0
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

export function frac(num: number, den = 1): Fraction {
  if (den < 0) {
    num = -num;
    den = -den;
  }
  const common = gcd(Math.abs(num), Math.abs(den)) || 1;
  return { num: num / common, den: den / common };
}

export function fracToString(f: Fraction): string {
  if (f.den === 1) return `${f.num}`;
  return `${f.num}/${f.den}`;
}

export function fracToDisplay(f: Fraction): string {
  if (f.den === 1) {
    return f.num > 0 ? `+${f.num}` : `${f.num}`;
  }
  return f.num > 0 ? `+${f.num}/${f.den}` : `${f.num}/${f.den}`;
}

export function isFracEqual(a: Fraction, b: Fraction): boolean {
  return a.num * b.den === b.num * a.den;
}

interface VietaRound {
  title: string;
  degree: number;
  latex: string;
  sumOfRoots: Fraction;
  productOfRoots: Fraction;
  distractors: Fraction[];
  monomialPool: string[];
}

// 3 distinct rounds:
// Round 1: Quadratic / Cubic (Degree 2 or 3)
// Round 2: Cubic / Quartic / Quintic (Degree 3, 4, 5)
// Round 3: High Degree (Degree 50, 77, 100!)
const ROUND_1_POOL: VietaRound[] = [
  {
    title: 'Trial of the Snowy Ridge',
    degree: 2,
    latex: '2x^2 - 5x + 3 = 0',
    sumOfRoots: frac(5, 2), // -(-5)/2
    productOfRoots: frac(3, 2), // (-1)^2 * 3/2
    distractors: [frac(-5, 2), frac(-3, 2), frac(2, 5), frac(1, 1), frac(3, 1)],
    monomialPool: ['2x²', '-5x', '+3', '4x', '-2'],
  },
  {
    title: 'Trial of the Snowy Ridge',
    degree: 2,
    latex: '3x^2 + 7x - 6 = 0',
    sumOfRoots: frac(-7, 3), // -(7)/3
    productOfRoots: frac(-2, 1), // (-1)^2 * (-6/3) = -2
    distractors: [frac(7, 3), frac(2, 1), frac(-2, 3), frac(1, 3), frac(-6, 1)],
    monomialPool: ['3x²', '+7x', '-6', 'x', '+2'],
  },
  {
    title: 'Trial of the Snowy Ridge',
    degree: 3,
    latex: '2x^3 - 6x^2 + 5x - 3 = 0',
    sumOfRoots: frac(3, 1), // -(-6)/2 = 3
    productOfRoots: frac(3, 2), // (-1)^3 * (-3/2) = 3/2
    distractors: [frac(-3, 1), frac(-3, 2), frac(5, 2), frac(2, 3), frac(1, 2)],
    monomialPool: ['2x³', '-6x²', '+5x', '-3', 'x²'],
  },
  {
    title: 'Trial of the Snowy Ridge',
    degree: 2,
    latex: '4x^2 - 12x + 9 = 0',
    sumOfRoots: frac(3, 1), // -(-12)/4 = 3
    productOfRoots: frac(9, 4), // (-1)^2 * 9/4
    distractors: [frac(-3, 1), frac(-9, 4), frac(3, 4), frac(4, 9), frac(2, 1)],
    monomialPool: ['4x²', '-12x', '+9', '3x', '-1'],
  },
];

const ROUND_2_POOL: VietaRound[] = [
  {
    title: 'Crest of the Frozen Gale',
    degree: 3,
    latex: '3x^3 - 5x^2 + 2x - 4 = 0',
    sumOfRoots: frac(5, 3), // -(-5)/3
    productOfRoots: frac(4, 3), // (-1)^3 * (-4/3) = 4/3
    distractors: [frac(-5, 3), frac(-4, 3), frac(2, 3), frac(1, 3), frac(2, 1)],
    monomialPool: ['3x³', '-5x²', '+2x', '-4', '2x²'],
  },
  {
    title: 'Crest of the Frozen Gale',
    degree: 4,
    latex: '2x^4 + 6x^3 - 5x - 7 = 0',
    sumOfRoots: frac(-3, 1), // -6/2 = -3
    productOfRoots: frac(-7, 2), // (-1)^4 * (-7/2) = -7/2
    distractors: [frac(3, 1), frac(7, 2), frac(-5, 2), frac(1, 2), frac(5, 2)],
    monomialPool: ['2x⁴', '+6x³', '-5x', '-7', '3x'],
  },
  {
    title: 'Crest of the Frozen Gale',
    degree: 4,
    latex: '5x^4 - 10x^3 + 8x^2 - 15 = 0',
    sumOfRoots: frac(2, 1), // -(-10)/5 = 2
    productOfRoots: frac(-3, 1), // (-1)^4 * (-15/5) = -3
    distractors: [frac(-2, 1), frac(3, 1), frac(8, 5), frac(-3, 5), frac(1, 5)],
    monomialPool: ['5x⁴', '-10x³', '+8x²', '-15', '4x'],
  },
  {
    title: 'Crest of the Frozen Gale',
    degree: 5,
    latex: '2x^5 - 7x^4 + 3x^2 - 1 = 0',
    sumOfRoots: frac(7, 2), // -(-7)/2
    productOfRoots: frac(1, 2), // (-1)^5 * (-1/2) = 1/2
    distractors: [frac(-7, 2), frac(-1, 2), frac(3, 2), frac(1, 1), frac(2, 1)],
    monomialPool: ['2x⁵', '-7x⁴', '+3x²', '-1', '2x³'],
  },
];

const ROUND_3_POOL: VietaRound[] = [
  {
    title: 'Summit of the Centenary Colossus',
    degree: 100,
    latex: '4x^{100} - 6x^{99} + 11x^3 - 3 = 0',
    sumOfRoots: frac(3, 2), // -(-6)/4 = 3/2
    productOfRoots: frac(-3, 4), // (-1)^100 * (-3/4) = -3/4
    distractors: [frac(-3, 2), frac(3, 4), frac(11, 4), frac(1, 2), frac(-1, 4)],
    monomialPool: ['4x¹⁰⁰', '-6x⁹⁹', '+11x³', '-3', '2x'],
  },
  {
    title: 'Summit of the Centenary Colossus',
    degree: 100,
    latex: '2x^{100} + 5x^{99} - 8x^5 + 7 = 0',
    sumOfRoots: frac(-5, 2), // -(5)/2
    productOfRoots: frac(7, 2), // (-1)^100 * (7/2) = 7/2
    distractors: [frac(5, 2), frac(-7, 2), frac(-4, 1), frac(1, 2), frac(7, 1)],
    monomialPool: ['2x¹⁰⁰', '+5x⁹⁹', '-8x⁵', '+7', '3x²'],
  },
  {
    title: 'Summit of the Centenary Colossus',
    degree: 50,
    latex: '3x^{50} - 9x^{49} + 14x^2 - 5 = 0',
    sumOfRoots: frac(3, 1), // -(-9)/3 = 3
    productOfRoots: frac(-5, 3), // (-1)^50 * (-5/3) = -5/3
    distractors: [frac(-3, 1), frac(5, 3), frac(14, 3), frac(1, 3), frac(-1, 3)],
    monomialPool: ['3x⁵⁰', '-9x⁴⁹', '+14x²', '-5', 'x'],
  },
  {
    title: 'Summit of the Centenary Colossus',
    degree: 77,
    latex: '5x^{77} + 15x^{76} + 4x^3 - 2 = 0',
    sumOfRoots: frac(-3, 1), // -(15)/5 = -3
    productOfRoots: frac(2, 5), // (-1)^77 * (-2/5) = 2/5
    distractors: [frac(3, 1), frac(-2, 5), frac(4, 5), frac(-1, 5), frac(2, 1)],
    monomialPool: ['5x⁷⁷', '+15x⁷⁶', '+4x³', '-2', '2x'],
  },
];

interface RuneEntity {
  id: string;
  value: Fraction;
  x: number;
  y: number;
  color: string;
  glowColor: string;
}

interface PedestalEntity {
  id: 'sum' | 'product';
  symbol: string;
  sublabel: string;
  x: number;
  y: number;
  placedRuneId: string | null;
}

interface Projectile {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  text: string;
  size: number;
  color: string;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  alpha: number;
  life: number;
  maxLife: number;
}

interface SnowFlake {
  x: number;
  y: number;
  vy: number;
  vx: number;
  size: number;
  alpha: number;
}

const RUNE_PALETTES = [
  { color: '#38bdf8', glow: 'rgba(56, 189, 248, 0.7)' }, // cyan
  { color: '#a855f7', glow: 'rgba(168, 85, 247, 0.7)' }, // purple
  { color: '#f59e0b', glow: 'rgba(245, 158, 11, 0.7)' }, // amber
  { color: '#10b981', glow: 'rgba(16, 185, 129, 0.7)' }, // emerald
  { color: '#ec4899', glow: 'rgba(236, 72, 153, 0.7)' }, // rose
  { color: '#6366f1', glow: 'rgba(99, 102, 241, 0.7)' }, // indigo
];

// Activation pad coordinates
const PAD_X = 400;
const PAD_Y = 515;
const PAD_RADIUS = 38;

export default function Loc2VietaScales({
  foe,
  character,
  onComplete,
  isTestMode = false,
  onCloseTest,
  spriteConfig: spriteConfigProp,
}: SpecialFightProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Active Sprite Config (customizable from GM Special Fights Panel)
  const [spriteConfig, setSpriteConfig] = useState<Loc2SpriteConfig>(() => {
    return (spriteConfigProp as Loc2SpriteConfig) || getLoc2SpriteConfig();
  });

  useEffect(() => {
    if (spriteConfigProp) {
      setSpriteConfig(spriteConfigProp as Loc2SpriteConfig);
    }
  }, [spriteConfigProp]);

  // Real-time listener for changes made in the GM Special Fights Panel
  useEffect(() => {
    const handleUpdate = (e: Event) => {
      const customEvent = e as CustomEvent<Loc2SpriteConfig>;
      if (customEvent.detail) {
        setSpriteConfig(customEvent.detail);
      } else {
        setSpriteConfig(getLoc2SpriteConfig());
      }
    };
    window.addEventListener('specialFightSpritesUpdated', handleUpdate);
    return () => window.removeEventListener('specialFightSpritesUpdated', handleUpdate);
  }, []);

  // Rounds state: 3 epic rounds
  // Round 1 (0): 2 seals -> breaks 1 seal (shields = 1)
  // Round 2 (1): 1 seal -> breaks last seal (shields = 0, unprotected!)
  // Round 3 (2): Unprotected foe -> direct laser hit -> foe falls!
  const [currentRoundIndex, setCurrentRoundIndex] = useState(0); // 0, 1, or 2
  const [selectedRounds, setSelectedRounds] = useState<VietaRound[]>([]);
  const [shieldLayers, setShieldLayers] = useState(2); // 2 layers -> 1 -> 0
  const [lives, setLives] = useState(3);
  const [isGameOver, setIsGameOver] = useState(false);
  const [isShattering, setIsShattering] = useState(false);
  const [showHowToPlay, setShowHowToPlay] = useState(false);
  // Boss defeat & rage state:
  // 'normal': hovering & firing projectiles
  // 'falling': tumbling down after round 3 unprotected laser strike
  // 'fallen': landed on floor
  // 'raging': shaking on floor with speech bubble "It's not over!"
  const [bossState, setBossState] = useState<'normal' | 'hit' | 'falling' | 'fallen' | 'raging'>('normal');
  const bossYRef = useRef(95);
  const bossRotationRef = useRef(0);
  const [isExitingTransition, setIsExitingTransition] = useState(false);

  const onCompleteRef = useRef(onComplete);
  const isTestModeRef = useRef(isTestMode);
  const onCloseTestRef = useRef(onCloseTest);

  useEffect(() => {
    onCompleteRef.current = onComplete;
    isTestModeRef.current = isTestMode;
    onCloseTestRef.current = onCloseTest;
  }, [onComplete, isTestMode, onCloseTest]);

  // Flat Altar Platforms - wider and firmly grounded at y = 340
  const [runes, setRunes] = useState<RuneEntity[]>([]);
  const [pedestals, setPedestals] = useState<PedestalEntity[]>([
    {
      id: 'sum',
      symbol: '∑ αᵢ',
      sublabel: 'SUM OF ROOTS',
      x: 230,
      y: 340,
      placedRuneId: null,
    },
    {
      id: 'product',
      symbol: '∏ αᵢ',
      sublabel: 'PRODUCT OF ROOTS',
      x: 570,
      y: 340,
      placedRuneId: null,
    },
  ]);
  const [heldRuneId, setHeldRuneId] = useState<string | null>(null);

  // Player position & physics
  const playerRef = useRef({
    x: 400,
    y: 470,
    speed: 3.8,
    facing: 'right' as 'left' | 'right',
    walkCycle: 0,
    isMoving: false,
    invulnerableFrames: 0,
    shakeTime: 0,
  });

  // Projectiles
  const projectilesRef = useRef<Projectile[]>([]);
  const nextShootTimeRef = useRef<number>(Date.now() + 1800);

  // Particles & Snow
  const particlesRef = useRef<Particle[]>([]);
  const snowFlakesRef = useRef<SnowFlake[]>([]);

  // Keys & Touch
  const keysRef = useRef<{ [key: string]: boolean }>({});
  const touchDirRef = useRef<{ dx: number; dy: number }>({ dx: 0, dy: 0 });

  // Sprites
  const owlImgRef = useRef<HTMLImageElement | null>(null);
  const owlCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const foeImgRef = useRef<HTMLImageElement | null>(null);
  const foeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const bgImgRef = useRef<HTMLImageElement | null>(null);
  const sumPedestalCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const prodPedestalCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const stepDaisCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const runeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Pad cooldown & defeat trigger guard
  const padTriggerCooldownRef = useRef(false);
  const hasTriggeredFallenRef = useRef(false);

  // Initialize 3 rounds on mount: Round 1 (Quad/Cubic), Round 2 (Cubic/Quartic), Round 3 (Centenary/High degree)
  useEffect(() => {
    const pickRandom = (arr: VietaRound[]) => arr[Math.floor(Math.random() * arr.length)];
    setSelectedRounds([
      pickRandom(ROUND_1_POOL),
      pickRandom(ROUND_2_POOL),
      pickRandom(ROUND_3_POOL),
    ]);

    // Initialize snowflakes
    const flakes: SnowFlake[] = [];
    for (let i = 0; i < 90; i++) {
      flakes.push({
        x: Math.random() * 800,
        y: Math.random() * 600,
        vy: 1.2 + Math.random() * 2.2,
        vx: -0.6 + Math.random() * 0.4,
        size: 1.5 + Math.random() * 2.8,
        alpha: 0.4 + Math.random() * 0.6,
      });
    }
    snowFlakesRef.current = flakes;
  }, []);

  const currentRound = selectedRounds[currentRoundIndex] || ROUND_1_POOL[0];

  // Dynamic Sprite & Asset Preloader based on active Sprite Configuration
  useEffect(() => {
    // 1. Mountain Summit Backdrop
    if (spriteConfig.background.type === 'procedural') {
      bgImgRef.current = null;
    } else {
      const bg = new Image();
      bg.crossOrigin = 'anonymous';
      const bgSrc = spriteConfig.background.path || LOCATION_2_ASSETS.SUMMIT_BACKDROP;
      bg.onload = () => {
        bgImgRef.current = bg;
      };
      bg.onerror = () => {
        bg.src = LOCATION_2_ASSETS.SUMMIT_BACKDROP;
      };
      bg.src = bgSrc;
    }

    // 2. Sum Platform Sprite (∑ αᵢ)
    if (spriteConfig.platformSum.type === 'procedural') {
      sumPedestalCanvasRef.current = null;
    } else {
      const sumImg = new Image();
      sumImg.crossOrigin = 'anonymous';
      sumImg.onload = () => {
        sumPedestalCanvasRef.current = createProcessedTransparentCanvas(sumImg, 'removeDark');
      };
      sumImg.src = spriteConfig.platformSum.path || LOCATION_2_ASSETS.PEDESTAL_SUM;
    }

    // 3. Product Platform Sprite (∏ αᵢ)
    if (spriteConfig.platformProduct.type === 'procedural') {
      prodPedestalCanvasRef.current = null;
    } else {
      const prodImg = new Image();
      prodImg.crossOrigin = 'anonymous';
      prodImg.onload = () => {
        prodPedestalCanvasRef.current = createProcessedTransparentCanvas(prodImg, 'removeDark');
      };
      prodImg.src = spriteConfig.platformProduct.path || LOCATION_2_ASSETS.PEDESTAL_PRODUCT;
    }

    // 4. Step Dais Platform Sprite
    if (spriteConfig.dais.type === 'procedural') {
      stepDaisCanvasRef.current = null;
    } else {
      const daisImg = new Image();
      daisImg.crossOrigin = 'anonymous';
      daisImg.onload = () => {
        stepDaisCanvasRef.current = createProcessedTransparentCanvas(daisImg, 'removeDark');
      };
      daisImg.src = spriteConfig.dais.path || LOCATION_2_ASSETS.STEP_DAIS;
    }

    // 5. Ancient Rune Tablet Sprite
    const rImg = new Image();
    rImg.crossOrigin = 'anonymous';
    rImg.onload = () => {
      runeCanvasRef.current = createProcessedTransparentCanvas(rImg, 'removeWhite');
    };
    rImg.src = LOCATION_2_ASSETS.RUNE_TABLET;

    // 6. Player Owl Sprite (Defaults to 100% OPAQUE Emoji with solid backing)
    if (spriteConfig.owl.type === 'emoji') {
      const emojiChar = spriteConfig.owl.emoji || '🦉';
      owlCanvasRef.current = createOpaqueEmojiCanvas(emojiChar, 128);
      owlImgRef.current = null;
    } else if (spriteConfig.owl.type === 'character' && character?.imageUrl) {
      const charImg = new Image();
      charImg.crossOrigin = 'anonymous';
      charImg.onload = () => {
        owlCanvasRef.current = null;
        owlImgRef.current = charImg;
      };
      charImg.onerror = () => {
        owlCanvasRef.current = createOpaqueEmojiCanvas('🦉', 128);
      };
      charImg.src = character.imageUrl;
    } else {
      // Asset or custom image path
      const owl = new Image();
      owl.crossOrigin = 'anonymous';
      owl.onload = () => {
        owlCanvasRef.current = createProcessedTransparentCanvas(owl, 'removeWhite');
        owlImgRef.current = owl;
      };
      owl.onerror = () => {
        owlCanvasRef.current = createOpaqueEmojiCanvas(spriteConfig.owl.emoji || '🦉', 128);
      };
      owl.src = spriteConfig.owl.path || LOCATION_2_ASSETS.OWL_SPRITE;
    }

    // 7. Boss Foe Sprite (Defaults to 100% OPAQUE Emoji)
    if (spriteConfig.foe.type === 'emoji') {
      const foeEmojiChar = spriteConfig.foe.emoji || foe?.emoji || '👹';
      foeCanvasRef.current = createOpaqueEmojiCanvas(foeEmojiChar, 160);
      foeImgRef.current = null;
    } else {
      const foeSrc = spriteConfig.foe.path || foe?.imageUrl;
      if (foeSrc) {
        const foeImg = new Image();
        foeImg.crossOrigin = 'anonymous';
        foeImg.onload = () => {
          foeCanvasRef.current = null;
          foeImgRef.current = foeImg;
        };
        foeImg.onerror = () => {
          foeCanvasRef.current = createOpaqueEmojiCanvas(foe?.emoji || '👹', 160);
        };
        foeImg.src = foeSrc;
      } else {
        foeCanvasRef.current = createOpaqueEmojiCanvas(foe?.emoji || '👹', 160);
        foeImgRef.current = null;
      }
    }
  }, [spriteConfig, character?.imageUrl, foe?.imageUrl, foe?.emoji]);

  // Spawn runes & reset platforms for the current round
  useEffect(() => {
    if (!currentRound) return;

    setHeldRuneId(null);
    projectilesRef.current = [];
    nextShootTimeRef.current = Date.now() + 2000;
    padTriggerCooldownRef.current = false;

    // Reset platforms
    setPedestals([
      {
        id: 'sum',
        symbol: '∑ αᵢ',
        sublabel: 'SUM OF ROOTS',
        x: 230,
        y: 340,
        placedRuneId: null,
      },
      {
        id: 'product',
        symbol: '∏ αᵢ',
        sublabel: 'PRODUCT OF ROOTS',
        x: 570,
        y: 340,
        placedRuneId: null,
      },
    ]);

    // Build runes list with exact fraction values
    const requiredValues: Fraction[] = [currentRound.sumOfRoots, currentRound.productOfRoots];

    // Pick 4 distractors distinct from both sum and product
    const distractors = currentRound.distractors.filter(
      (d) =>
        !isFracEqual(d, currentRound.sumOfRoots) && !isFracEqual(d, currentRound.productOfRoots)
    );
    const chosenDistractors = distractors.slice(0, 4);

    const allValues = [...requiredValues, ...chosenDistractors];
    const shuffled = [...allValues].sort(() => Math.random() - 0.5);

    const cols = 3;
    const startX = 170;
    const startY = 370;
    const stepX = 230;
    const stepY = 80;

    const newRunes: RuneEntity[] = shuffled.map((val, idx) => {
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      const jitterX = (Math.random() - 0.5) * 40;
      const jitterY = (Math.random() - 0.5) * 20;
      const palette = RUNE_PALETTES[idx % RUNE_PALETTES.length];

      return {
        id: `rune-${idx}-${fracToString(val)}-${Math.random().toString(36).substring(2, 6)}`,
        value: val,
        x: Math.min(680, Math.max(120, startX + col * stepX + jitterX)),
        y: Math.min(480, Math.max(350, startY + row * stepY + jitterY)),
        color: palette.color,
        glowColor: palette.glow,
      };
    });

    setRunes(newRunes);
  }, [currentRoundIndex, currentRound]);

  // Burst particles generator
  const createBurstParticles = (x: number, y: number, color: string, count = 10) => {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.5 + Math.random() * 3.5;
      particlesRef.current.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 3 + Math.random() * 3,
        color,
        alpha: 1,
        life: 0,
        maxLife: 20 + Math.random() * 20,
      });
    }
  };

  // Primary Interaction Handler (Pick up / Place / Swap)
  const handleInteractRef = useRef<() => void>(() => {});

  const handleInteract = useCallback(() => {
    if (isShattering || isGameOver || bossState !== 'normal') return;

    const px = playerRef.current.x;
    const py = playerRef.current.y;

    // 1. Near a platform? (< 70px)
    const nearPedestal = pedestals.find((p) => Math.hypot(p.x - px, p.y - py) < 70);

    if (nearPedestal) {
      if (heldRuneId) {
        // Placing or swapping
        if (nearPedestal.placedRuneId) {
          const oldPlacedRuneId = nearPedestal.placedRuneId;
          setPedestals((prev) =>
            prev.map((p) => (p.id === nearPedestal.id ? { ...p, placedRuneId: heldRuneId } : p))
          );
          setHeldRuneId(oldPlacedRuneId);
        } else {
          setPedestals((prev) =>
            prev.map((p) => (p.id === nearPedestal.id ? { ...p, placedRuneId: heldRuneId } : p))
          );
          setHeldRuneId(null);
        }
        createBurstParticles(nearPedestal.x, nearPedestal.y, '#38bdf8', 14);
        return;
      } else {
        // Retrieving placed rune
        if (nearPedestal.placedRuneId) {
          const runeToPick = nearPedestal.placedRuneId;
          setPedestals((prev) =>
            prev.map((p) => (p.id === nearPedestal.id ? { ...p, placedRuneId: null } : p))
          );
          setHeldRuneId(runeToPick);
          createBurstParticles(nearPedestal.x, nearPedestal.y, '#a855f7', 10);
          return;
        }
      }
    }

    // 2. Near a rune on the ground? (< 50px)
    if (!heldRuneId) {
      const placedIds = new Set(pedestals.map((p) => p.placedRuneId).filter(Boolean));
      const unplacedRunes = runes.filter((r) => !placedIds.has(r.id));

      let closestRune: RuneEntity | null = null;
      let minDist = 50;

      for (const r of unplacedRunes) {
        const dist = Math.hypot(r.x - px, r.y - py);
        if (dist < minDist) {
          minDist = dist;
          closestRune = r;
        }
      }

      if (closestRune) {
        setHeldRuneId(closestRune.id);
        createBurstParticles(closestRune.x, closestRune.y, closestRune.color, 12);
        return;
      }
    } else {
      // Drop carried rune on the snow
      const droppedRuneId = heldRuneId;
      setRunes((prev) =>
        prev.map((r) => (r.id === droppedRuneId ? { ...r, x: px, y: py + 15 } : r))
      );
      setHeldRuneId(null);
      createBurstParticles(px, py + 15, '#e0f2fe', 8);
    }
  }, [pedestals, runes, heldRuneId, isShattering, isGameOver, bossState]);

  useEffect(() => {
    handleInteractRef.current = handleInteract;
  }, [handleInteract]);

  // Keyboard listeners
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
        e.preventDefault();
      }
      keysRef.current[e.code] = true;
      keysRef.current[e.key.toLowerCase()] = true;

      if (e.code === 'Space' || e.key.toLowerCase() === 'e') {
        handleInteractRef.current();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      keysRef.current[e.code] = false;
      keysRef.current[e.key.toLowerCase()] = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Check if both platforms are filled
  const bothPedestalsFilled = useMemo(() => {
    return pedestals.every((p) => p.placedRuneId !== null);
  }, [pedestals]);

  // Evaluate the Viète Altars when stepping on the pressure pad (3 Rounds)
  const evaluateAltar = useCallback(() => {
    if (!bothPedestalsFilled || isShattering || isGameOver || !currentRound || bossState !== 'normal') return;

    const sumPedestal = pedestals.find((p) => p.id === 'sum');
    const prodPedestal = pedestals.find((p) => p.id === 'product');

    const sumRune = runes.find((r) => r.id === sumPedestal?.placedRuneId);
    const prodRune = runes.find((r) => r.id === prodPedestal?.placedRuneId);

    if (!sumRune || !prodRune) return;

    const isSumCorrect = isFracEqual(sumRune.value, currentRound.sumOfRoots);
    const isProductCorrect = isFracEqual(prodRune.value, currentRound.productOfRoots);

    if (isSumCorrect && isProductCorrect) {
      setIsShattering(true);

      // Spawn celestial laser sparks from both platforms
      pedestals.forEach((p) => {
        createBurstParticles(p.x, p.y - 15, '#38bdf8', 25);
        for (let i = 0; i < 25; i++) {
          particlesRef.current.push({
            x: p.x + (Math.random() - 0.5) * 30,
            y: p.y - 15,
            vx: (Math.random() - 0.5) * 2,
            vy: -4 - Math.random() * 5,
            size: 4 + Math.random() * 4,
            color: '#38bdf8',
            alpha: 1,
            life: 0,
            maxLife: 45,
          });
        }
      });

      if (currentRoundIndex === 0) {
        // Round 1 Complete: Break Outer Shield Layer (2 -> 1)
        setTimeout(() => {
          createBurstParticles(400, 100, '#38bdf8', 45);
          createBurstParticles(400, 100, '#a855f7', 25);
          setShieldLayers(1);
        }, 700);

        setTimeout(() => {
          setIsShattering(false);
          setCurrentRoundIndex(1);
        }, 1500);
      } else if (currentRoundIndex === 1) {
        // Round 2 Complete: Break Inner Shield Layer (1 -> 0). Foe is now UNPROTECTED!
        setTimeout(() => {
          createBurstParticles(400, 100, '#a855f7', 50);
          createBurstParticles(400, 100, '#ec4899', 30);
          setShieldLayers(0);
        }, 700);

        setTimeout(() => {
          setIsShattering(false);
          setCurrentRoundIndex(2);
        }, 1500);
      } else {
        // Round 3 Complete: Lasers strike the UNPROTECTED foe directly!
        setTimeout(() => {
          // Blinding strike explosion right on the foe
          createBurstParticles(400, 95, '#f43f5e', 50);
          createBurstParticles(400, 95, '#fef08a', 40);
          createBurstParticles(400, 95, '#ffffff', 30);
          // Foe takes direct laser strike and begins falling down
          projectilesRef.current = [];
          setBossState('falling');
        }, 700);

        setTimeout(() => {
          setIsShattering(false);
        }, 1600);
      }
    }
  }, [bothPedestalsFilled, isShattering, isGameOver, currentRound, pedestals, runes, currentRoundIndex, bossState]);

  // Main 2D Canvas Game Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let running = true;

    const gameLoop = () => {
      if (!running) return;

      const p = playerRef.current;
      const keys = keysRef.current;
      const touch = touchDirRef.current;

      // 1. Player Input & Movement
      let dx = 0;
      let dy = 0;

      if (!isGameOver && bossState === 'normal') {
        if (keys['arrowup'] || keys['w']) dy -= 1;
        if (keys['arrowdown'] || keys['s']) dy += 1;
        if (keys['arrowleft'] || keys['a']) dx -= 1;
        if (keys['arrowright'] || keys['d']) dx += 1;

        if (touch.dx !== 0 || touch.dy !== 0) {
          dx = touch.dx;
          dy = touch.dy;
        }

        if (dx !== 0 && dy !== 0) {
          const len = Math.hypot(dx, dy);
          dx /= len;
          dy /= len;
        }

        p.isMoving = dx !== 0 || dy !== 0;
        if (p.isMoving) {
          p.walkCycle += 0.22;
          if (dx > 0) p.facing = 'right';
          else if (dx < 0) p.facing = 'left';
        }

        p.x += dx * p.speed;
        p.y += dy * p.speed;

        // Summit boundaries: left: 65, right: 735, top: 285, bottom: 550
        p.x = Math.max(65, Math.min(735, p.x));
        p.y = Math.max(285, Math.min(550, p.y));

        if (p.invulnerableFrames > 0) p.invulnerableFrames--;
        if (p.shakeTime > 0) p.shakeTime--;

        // Check if player is on the activation pressure pad
        const distToPad = Math.hypot(p.x - PAD_X, p.y - PAD_Y);
        const isOwlOnPad = distToPad < PAD_RADIUS + 4;

        if (!isOwlOnPad) {
          padTriggerCooldownRef.current = false;
        }

        // Check root correctness
        const sumPed = pedestals.find((pd) => pd.id === 'sum');
        const prodPed = pedestals.find((pd) => pd.id === 'product');
        const sumRune = runes.find((r) => r.id === sumPed?.placedRuneId);
        const prodRune = runes.find((r) => r.id === prodPed?.placedRuneId);
        const isSumCorrect = sumRune ? isFracEqual(sumRune.value, currentRound.sumOfRoots) : false;
        const isProductCorrect = prodRune ? isFracEqual(prodRune.value, currentRound.productOfRoots) : false;

        if (
          bothPedestalsFilled &&
          isOwlOnPad &&
          !isShattering &&
          !isGameOver &&
          !padTriggerCooldownRef.current
        ) {
          if (isSumCorrect && isProductCorrect) {
            padTriggerCooldownRef.current = true;
            evaluateAltar();
          }
        }
      }

      // 2. Foe Monomial Projectile Spawner (only when normal)
      const now = Date.now();
      if (!isGameOver && bossState === 'normal' && !isShattering && now >= nextShootTimeRef.current) {
        const bossX = 400;
        const bossY = 100;
        const angle = Math.atan2(p.y - bossY, p.x - bossX);
        const speed = 2.4 + Math.random() * 1.4;

        const pool = currentRound?.monomialPool || ['2x²', '-5x', '+3'];
        const randomMonomial = pool[Math.floor(Math.random() * pool.length)];

        projectilesRef.current.push({
          id: `proj-${now}-${Math.random()}`,
          x: bossX,
          y: bossY + 20,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          text: randomMonomial,
          size: 16,
          color: '#f43f5e',
        });

        createBurstParticles(bossX, bossY + 20, '#f43f5e', 8);
        nextShootTimeRef.current = now + 2400 + Math.random() * 1000;
      }

      // Update projectiles & check player collisions
      for (let i = projectilesRef.current.length - 1; i >= 0; i--) {
        const proj = projectilesRef.current[i];
        proj.x += proj.vx;
        proj.y += proj.vy;

        const distToPlayer = Math.hypot(proj.x - p.x, proj.y - (p.y - 10));
        if (distToPlayer < 24 && p.invulnerableFrames === 0 && !isGameOver && bossState === 'normal') {
          p.invulnerableFrames = 75;
          p.shakeTime = 10;
          createBurstParticles(p.x, p.y - 10, '#f43f5e', 20);

          setLives((prevLives) => {
            const next = prevLives - 1;
            if (next <= 0) {
              setIsGameOver(true);
            }
            return Math.max(0, next);
          });

          projectilesRef.current.splice(i, 1);
          continue;
        }

        if (proj.x < 10 || proj.x > 790 || proj.y > 590) {
          projectilesRef.current.splice(i, 1);
        }
      }

      // 3. Clear Canvas & Apply Screen Shake
      ctx.save();
      if (p.shakeTime > 0) {
        const shakeX = (Math.random() - 0.5) * 6;
        const shakeY = (Math.random() - 0.5) * 6;
        ctx.translate(shakeX, shakeY);
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // 4. Render Mountain Sky & Backdrop (Depicting the path to the summit)
      if (bgImgRef.current && bgImgRef.current.complete) {
        ctx.drawImage(bgImgRef.current, 0, 0, canvas.width, canvas.height);
      } else {
        const skyGrad = ctx.createLinearGradient(0, 0, 0, 240);
        skyGrad.addColorStop(0, '#090d16');
        skyGrad.addColorStop(0.5, '#1e293b');
        skyGrad.addColorStop(1, '#334155');
        ctx.fillStyle = skyGrad;
        ctx.fillRect(0, 0, canvas.width, 240);

        // Distant jagged mountains in background
        ctx.fillStyle = '#1e293b';
        ctx.beginPath();
        ctx.moveTo(0, 240);
        ctx.lineTo(90, 120);
        ctx.lineTo(180, 170);
        ctx.lineTo(280, 95);
        ctx.lineTo(380, 180);
        ctx.lineTo(500, 85);
        ctx.lineTo(620, 170);
        ctx.lineTo(720, 110);
        ctx.lineTo(800, 240);
        ctx.closePath();
        ctx.fill();

        // Snowy ground plateau
        const groundGrad = ctx.createLinearGradient(0, 200, 0, 600);
        groundGrad.addColorStop(0, '#cbd5e1');
        groundGrad.addColorStop(0.3, '#f1f5f9');
        groundGrad.addColorStop(0.8, '#e2e8f0');
        groundGrad.addColorStop(1, '#94a3b8');
        ctx.fillStyle = groundGrad;
        ctx.fillRect(0, 200, canvas.width, 400);
      }

      // 5. Falling Snowflakes
      ctx.fillStyle = '#ffffff';
      snowFlakesRef.current.forEach((flake) => {
        flake.y += flake.vy;
        flake.x += flake.vx;
        if (flake.y > 600) {
          flake.y = -10;
          flake.x = Math.random() * 800;
        }
        if (flake.x < 0) flake.x = 800;
        ctx.save();
        ctx.globalAlpha = flake.alpha;
        ctx.beginPath();
        ctx.arc(flake.x, flake.y, flake.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });

      // 6. Foe Falling & Defeat Physics (Longer dramatic pause on the floor)
      const bossX = 400;
      if (bossState === 'falling') {
        if (bossYRef.current < 285) {
          bossYRef.current += 4.5;
          bossRotationRef.current = Math.min(Math.PI / 4, bossRotationRef.current + 0.04);
        } else {
          bossYRef.current = 285;
          if (!hasTriggeredFallenRef.current) {
            hasTriggeredFallenRef.current = true;
            setBossState('fallen');
            createBurstParticles(400, 290, '#cbd5e1', 35);
            createBurstParticles(400, 290, '#38bdf8', 25);

            // Longer pause: Stay knocked down on the floor for 3.5 seconds before raging and talking
            setTimeout(() => {
              setBossState('raging');
              // Speech bubble displayed for 2 seconds (2000ms), then start smooth faded transition back to battle
              setTimeout(() => {
                setIsExitingTransition(true);
                setTimeout(() => {
                  onCompleteRef.current({
                    success: true,
                    message: 'Function imp defeated!',
                  });
                  if (isTestModeRef.current && onCloseTestRef.current) {
                    onCloseTestRef.current();
                  }
                }, 750);
              }, 2000);
            }, 3500);
          }
        }
      }

      const currentBossY = bossYRef.current;
      const hoverOffset = bossState === 'normal' ? Math.sin(Date.now() / 320) * 5 : 0;
      const rageOffset = bossState === 'raging' ? Math.sin(Date.now() / 25) * 4 : 0;

      // Foe Ground Contact Shadow
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(
        bossX + rageOffset,
        currentBossY + (bossState === 'fallen' || bossState === 'raging' ? 26 : 45),
        55,
        14,
        0,
        0,
        Math.PI * 2
      );
      ctx.fillStyle = 'rgba(15, 23, 42, 0.45)';
      ctx.filter = 'blur(4px)';
      ctx.fill();
      ctx.restore();

      // Draw Foe Sprite / Emoji
      ctx.save();
      ctx.translate(bossX + rageOffset, currentBossY + hoverOffset);
      if (bossRotationRef.current !== 0) {
        ctx.rotate(bossRotationRef.current);
      }
      if (bossState === 'fallen' || bossState === 'raging') {
        ctx.globalAlpha = 0.88;
      }

      if (foeCanvasRef.current) {
        // 100% Opaque, crisp boss emoji sprite (no background transparency)
        ctx.drawImage(foeCanvasRef.current, -44, -44, 88, 88);
      } else if (foeImgRef.current && foeImgRef.current.complete) {
        ctx.drawImage(foeImgRef.current, -44, -44, 88, 88);
      } else {
        ctx.font = '52px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(foe?.emoji || '👹', 0, 0);
      }
      ctx.restore();

      // Crystalline Frost Barriers:
      // Round 1 (shieldLayers === 2): Inner + Outer Barrier
      // Round 2 (shieldLayers === 1): Inner Barrier only
      // Round 3 (shieldLayers === 0): UNPROTECTED! No shields!
      if (shieldLayers > 0 && bossState === 'normal') {
        const time = Date.now();

        // Layer 1 (Inner Arcane Frost Barrier): shown when shieldLayers >= 1
        if (shieldLayers >= 1) {
          ctx.save();
          ctx.translate(bossX, currentBossY + hoverOffset);
          const spin1 = time / 2200;
          ctx.rotate(spin1);

          ctx.beginPath();
          for (let i = 0; i < 6; i++) {
            const angle = (i * Math.PI) / 3;
            const r = 58 + Math.sin(time / 300 + i) * 2;
            const hx = Math.cos(angle) * r;
            const hy = Math.sin(angle) * r;
            if (i === 0) ctx.moveTo(hx, hy);
            else ctx.lineTo(hx, hy);
          }
          ctx.closePath();
          ctx.fillStyle = 'rgba(99, 102, 241, 0.22)';
          ctx.fill();
          ctx.strokeStyle = 'rgba(168, 85, 247, 0.9)';
          ctx.lineWidth = 2.8;
          ctx.shadowColor = '#a855f7';
          ctx.shadowBlur = 14;
          ctx.stroke();

          for (let i = 0; i < 6; i++) {
            const angle = (i * Math.PI) / 3;
            const r = 58;
            ctx.beginPath();
            ctx.arc(Math.cos(angle) * r, Math.sin(angle) * r, 3.5, 0, Math.PI * 2);
            ctx.fillStyle = '#f0abfc';
            ctx.fill();
          }
          ctx.restore();
        }

        // Layer 2 (Outer Prismatic Hexagonal Aegis): shown when shieldLayers >= 2
        if (shieldLayers >= 2) {
          ctx.save();
          ctx.translate(bossX, currentBossY + hoverOffset);
          const spin2 = -(time / 3000);
          ctx.rotate(spin2);

          ctx.beginPath();
          for (let i = 0; i < 6; i++) {
            const angle = (i * Math.PI) / 3;
            const r = 76 + Math.sin(time / 260 + i) * 3;
            const hx = Math.cos(angle) * r;
            const hy = Math.sin(angle) * r;
            if (i === 0) ctx.moveTo(hx, hy);
            else ctx.lineTo(hx, hy);
          }
          ctx.closePath();
          ctx.fillStyle = 'rgba(56, 189, 248, 0.22)';
          ctx.fill();
          ctx.strokeStyle = 'rgba(56, 189, 248, 0.95)';
          ctx.lineWidth = 3.2;
          ctx.shadowColor = '#38bdf8';
          ctx.shadowBlur = 18;
          ctx.stroke();

          // Orbiting Diamond Crystal Shards
          for (let i = 0; i < 6; i++) {
            const angle = (i * Math.PI) / 3;
            const r = 76;
            const cx = Math.cos(angle) * r;
            const cy = Math.sin(angle) * r;

            ctx.save();
            ctx.translate(cx, cy);
            ctx.rotate(time / 350 + i);
            ctx.beginPath();
            ctx.moveTo(0, -7);
            ctx.lineTo(4.5, 0);
            ctx.lineTo(0, 7);
            ctx.lineTo(-4.5, 0);
            ctx.closePath();
            ctx.fillStyle = '#e0f2fe';
            ctx.fill();
            ctx.strokeStyle = '#38bdf8';
            ctx.lineWidth = 1.2;
            ctx.stroke();
            ctx.restore();
          }
          ctx.restore();
        }
      }

      // Laser Beams: Round 1 & 2 hit shields; Round 3 fires directly into the UNPROTECTED foe!
      if (isShattering) {
        pedestals.forEach((ped) => {
          ctx.save();
          ctx.beginPath();
          ctx.moveTo(ped.x, ped.y - 20);
          ctx.lineTo(bossX + (Math.random() - 0.5) * 10, currentBossY + hoverOffset);
          const isFinalStrike = currentRoundIndex === 2;
          ctx.strokeStyle = isFinalStrike ? 'rgba(254, 240, 138, 0.95)' : 'rgba(56, 189, 248, 0.95)';
          ctx.lineWidth = isFinalStrike ? 8 + Math.random() * 5 : 6 + Math.random() * 4;
          ctx.shadowColor = isFinalStrike ? '#fef08a' : '#38bdf8';
          ctx.shadowBlur = 24;
          ctx.stroke();
          ctx.restore();
        });
      }

      // 9. Flying Monomial Projectiles
      if (bossState === 'normal') {
        projectilesRef.current.forEach((proj) => {
          ctx.save();
          ctx.shadowColor = proj.color;
          ctx.shadowBlur = 14;

          ctx.beginPath();
          ctx.arc(proj.x, proj.y, proj.size, 0, Math.PI * 2);
          ctx.fillStyle = '#dc2626';
          ctx.fill();
          ctx.strokeStyle = '#fef08a';
          ctx.lineWidth = 2;
          ctx.stroke();

          ctx.shadowBlur = 0;
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 11px monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(proj.text, proj.x, proj.y);
          ctx.restore();
        });
      }

      // 10. REDESIGNED FLAT WIDER ALTAR PLATFORMS (Sum Left, Product Right)
      // Contains the full symbols: ∑ αᵢ and ∏ αᵢ
      const sumPed = pedestals.find((pd) => pd.id === 'sum');
      const prodPed = pedestals.find((pd) => pd.id === 'product');

      pedestals.forEach((ped) => {
        const sumRune = runes.find((r) => r.id === sumPed?.placedRuneId);
        const prodRune = runes.find((r) => r.id === prodPed?.placedRuneId);
        const isSumCorrect = sumRune ? isFracEqual(sumRune.value, currentRound.sumOfRoots) : false;
        const isProductCorrect = prodRune ? isFracEqual(prodRune.value, currentRound.productOfRoots) : false;

        const distToPad = Math.hypot(p.x - PAD_X, p.y - PAD_Y);
        const isOwlOnPad = distToPad < PAD_RADIUS + 4;
        const isWrongOnPad =
          isOwlOnPad &&
          bothPedestalsFilled &&
          !isShattering &&
          bossState === 'normal' &&
          ((ped.id === 'sum' && !isSumCorrect) || (ped.id === 'product' && !isProductCorrect));

        const hasRune = ped.placedRuneId !== null;

        // Render Platform Sprite Asset if available
        const activePedCanvas = ped.id === 'sum' ? sumPedestalCanvasRef.current : prodPedestalCanvasRef.current;
        if (activePedCanvas) {
          const pw = 144;
          const ph = 80;
          ctx.drawImage(activePedCanvas, ped.x - pw / 2, ped.y - ph + 24, pw, ph);
        } else {
          // 3D Flat Stone Platform Base Procedural Fallback
          const pw = 136;
          const ph = 32;

          ctx.fillStyle = '#1e293b';
          ctx.beginPath();
          ctx.roundRect(ped.x - pw / 2, ped.y - ph / 2 + 6, pw, ph, 8);
          ctx.fill();

          ctx.fillStyle = '#334155';
          ctx.fillRect(ped.x - pw / 2 + 2, ped.y, pw - 4, ph / 2 + 6);

          ctx.beginPath();
          ctx.ellipse(ped.x, ped.y - 6, pw / 2, 16, 0, 0, Math.PI * 2);
          ctx.fillStyle = hasRune ? '#475569' : '#334155';
          ctx.fill();
          ctx.strokeStyle = hasRune ? '#38bdf8' : '#64748b';
          ctx.lineWidth = 2;
          ctx.stroke();

          ctx.save();
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.font = 'bold 15px "Times New Roman", serif';
          ctx.fillStyle = hasRune ? '#fef08a' : '#e2e8f0';
          if (hasRune) {
            ctx.shadowColor = '#fef08a';
            ctx.shadowBlur = 8;
          }
          ctx.fillText(ped.symbol, ped.x, ped.y + 7);

          ctx.shadowBlur = 0;
          ctx.font = 'bold 8px monospace';
          ctx.fillStyle = hasRune ? '#38bdf8' : '#94a3b8';
          ctx.fillText(ped.id === 'sum' ? 'SUM' : 'PRODUCT', ped.x, ped.y + 19);
          ctx.restore();
        }

        // Pulsate RED when altar has wrong rune and owl is on the platform
        if (isWrongOnPad) {
          const redPulse = (Math.sin(Date.now() / 110) + 1) / 2;
          ctx.save();
          ctx.beginPath();
          ctx.ellipse(ped.x, ped.y + 4, 78 + redPulse * 6, 26 + redPulse * 4, 0, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(239, 68, 68, ${0.45 + redPulse * 0.55})`;
          ctx.lineWidth = 3;
          ctx.shadowColor = '#ef4444';
          ctx.shadowBlur = 20;
          ctx.stroke();
          ctx.restore();
        }

        // Placed Rune floating above socket
        if (hasRune) {
          const placedRune = runes.find((r) => r.id === ped.placedRuneId);
          if (placedRune) {
            const floatY = ped.y - 44 + Math.sin(Date.now() / 250) * 3;
            drawRuneStone(ctx, placedRune, ped.x, floatY, true);
          }
        }
      });

      // 11. ACTIVATION PLATFORM (FLOOR STEP DAIS AT PAD_X, PAD_Y)
      // Render dedicated step dais asset with brilliant glow when two runes are set up
      ctx.save();

      if (stepDaisCanvasRef.current) {
        const dw = 88;
        const dh = 88;
        if (bothPedestalsFilled && bossState === 'normal') {
          // Pulsing celestial cyan & amber glow
          const pulse = Math.sin(Date.now() / 200) * 4;
          ctx.shadowColor = '#38bdf8';
          ctx.shadowBlur = 24 + pulse * 2;
          ctx.drawImage(stepDaisCanvasRef.current, PAD_X - dw / 2, PAD_Y - dh / 2, dw, dh);

          // Center lightning icon
          ctx.shadowBlur = 0;
          ctx.fillStyle = '#fef08a';
          ctx.font = 'bold 16px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('⚡', PAD_X, PAD_Y);

          // Prompt banner above pad
          ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
          ctx.fillRect(PAD_X - 80, PAD_Y - 48, 160, 20);
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(PAD_X - 80, PAD_Y - 48, 160, 20);
          ctx.fillStyle = '#fef08a';
          ctx.font = 'bold 9px monospace';
          ctx.textAlign = 'center';
          ctx.fillText('⚡ STEP TO CHANNEL LASERS ⚡', PAD_X, PAD_Y - 37);
        } else {
          // Dormant step dais
          ctx.globalAlpha = 0.85;
          ctx.drawImage(stepDaisCanvasRef.current, PAD_X - dw / 2, PAD_Y - dh / 2, dw, dh);
          ctx.globalAlpha = 1.0;

          ctx.font = 'bold 8px monospace';
          ctx.fillStyle = '#94a3b8';
          ctx.textAlign = 'center';
          ctx.fillText('CHANNEL DAIS (AWAITING 2 RUNES)', PAD_X, PAD_Y + 48);
        }
      } else {
        // Procedural fallback
        if (bothPedestalsFilled && bossState === 'normal') {
          const pulse = Math.sin(Date.now() / 200) * 4;

          ctx.beginPath();
          ctx.ellipse(PAD_X, PAD_Y, PAD_RADIUS + pulse, (PAD_RADIUS + pulse) * 0.48, 0, 0, Math.PI * 2);
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 3.5;
          ctx.shadowColor = '#38bdf8';
          ctx.shadowBlur = 24;
          ctx.stroke();

          ctx.beginPath();
          ctx.ellipse(PAD_X, PAD_Y, PAD_RADIUS, PAD_RADIUS * 0.45, 0, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(56, 189, 248, 0.35)';
          ctx.fill();

          const spin = Date.now() / 800;
          for (let i = 0; i < 4; i++) {
            const a = spin + (i * Math.PI) / 2;
            ctx.beginPath();
            ctx.moveTo(PAD_X, PAD_Y);
            ctx.lineTo(PAD_X + Math.cos(a) * PAD_RADIUS, PAD_Y + Math.sin(a) * (PAD_RADIUS * 0.45));
            ctx.strokeStyle = 'rgba(254, 240, 138, 0.7)';
            ctx.lineWidth = 2;
            ctx.stroke();
          }

          ctx.shadowBlur = 0;
          ctx.fillStyle = '#fef08a';
          ctx.font = 'bold 16px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('⚡', PAD_X, PAD_Y);

          ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
          ctx.fillRect(PAD_X - 80, PAD_Y - 44, 160, 20);
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(PAD_X - 80, PAD_Y - 44, 160, 20);
          ctx.fillStyle = '#fef08a';
          ctx.font = 'bold 9px monospace';
          ctx.textAlign = 'center';
          ctx.fillText('⚡ STEP TO CHANNEL LASERS ⚡', PAD_X, PAD_Y - 33);
        } else {
          ctx.beginPath();
          ctx.ellipse(PAD_X, PAD_Y, PAD_RADIUS, PAD_RADIUS * 0.45, 0, 0, Math.PI * 2);
          ctx.fillStyle = '#1e293b';
          ctx.fill();
          ctx.strokeStyle = '#475569';
          ctx.lineWidth = 2;
          ctx.stroke();

          ctx.fillStyle = '#64748b';
          ctx.font = 'bold 12px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('⚡', PAD_X, PAD_Y);

          ctx.font = 'bold 8px monospace';
          ctx.fillStyle = '#64748b';
          ctx.fillText('CHANNEL DAIS (AWAITING 2 RUNES)', PAD_X, PAD_Y + 16);
        }
      }
      ctx.restore();

      // 12. Render Scattered Runes on the Snowy Summit
      const placedIds = new Set(pedestals.map((p) => p.placedRuneId).filter(Boolean));
      runes.forEach((rune) => {
        if (placedIds.has(rune.id) || rune.id === heldRuneId) return;

        drawRuneStone(ctx, rune, rune.x, rune.y, false);

        // Proximity highlight
        const dist = Math.hypot(rune.x - p.x, rune.y - p.y);
        if (dist < 50 && !heldRuneId && !isGameOver && bossState === 'normal') {
          ctx.save();
          ctx.beginPath();
          ctx.arc(rune.x, rune.y, 24, 0, Math.PI * 2);
          ctx.strokeStyle = '#0284c7';
          ctx.lineWidth = 2;
          ctx.setLineDash([4, 4]);
          ctx.stroke();

          ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
          ctx.fillRect(rune.x - 38, rune.y - 36, 76, 18);
          ctx.strokeStyle = '#38bdf8';
          ctx.strokeRect(rune.x - 38, rune.y - 36, 76, 18);
          ctx.fillStyle = '#38bdf8';
          ctx.font = 'bold 9px monospace';
          ctx.textAlign = 'center';
          ctx.fillText('[E] PICK UP', rune.x, rune.y - 24);
          ctx.restore();
        }
      });

      // 13. Render Particles
      for (let i = particlesRef.current.length - 1; i >= 0; i--) {
        const pt = particlesRef.current[i];
        pt.x += pt.vx;
        pt.y += pt.vy;
        pt.life++;
        pt.alpha = Math.max(0, 1 - pt.life / pt.maxLife);

        ctx.save();
        ctx.globalAlpha = pt.alpha;
        ctx.fillStyle = pt.color;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        if (pt.life >= pt.maxLife) {
          particlesRef.current.splice(i, 1);
        }
      }

      // 14. Render Player (The Owl) - 100% Opaque, Zero Transparency, No Artificial Shadow
      ctx.save();
      ctx.globalAlpha = 1.0;

      const bob = p.isMoving ? Math.sin(p.walkCycle) * 3 : 0;
      const playerY = p.y + bob;

      // Damage blinking ring
      const isDamaged = p.invulnerableFrames > 0;
      if (isDamaged) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(p.x, playerY - 12, 28, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(239, 68, 68, 0.25)';
        ctx.fill();
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 2.5;
        ctx.stroke();
        ctx.restore();
      }

      ctx.save();
      ctx.translate(p.x, playerY);
      if (p.facing === 'left') {
        ctx.scale(-1, 1);
      }

      if (owlCanvasRef.current) {
        // 100% Opaque, crisp RPG owl sprite or emoji with solid backing (completely solid)
        ctx.drawImage(owlCanvasRef.current, -28, -38, 56, 56);
      } else if (owlImgRef.current && owlImgRef.current.complete) {
        ctx.drawImage(owlImgRef.current, -26, -38, 52, 52);
      } else {
        // 100% Opaque fallback emoji
        const fallbackCanvas = createOpaqueEmojiCanvas(spriteConfig.owl.emoji || '🦉', 128);
        ctx.drawImage(fallbackCanvas, -28, -38, 56, 56);
      }
      ctx.restore();
      ctx.restore();

      // Carried Rune floating over head
      if (heldRuneId) {
        const carriedRune = runes.find((r) => r.id === heldRuneId);
        if (carriedRune) {
          const carriedY = playerY - 50 + Math.sin(Date.now() / 200) * 2;
          drawRuneStone(ctx, carriedRune, p.x, carriedY, true);

          ctx.beginPath();
          ctx.moveTo(p.x, carriedY + 14);
          ctx.lineTo(p.x, playerY - 24);
          ctx.strokeStyle = carriedRune.glowColor;
          ctx.lineWidth = 1.5;
          ctx.setLineDash([2, 2]);
          ctx.stroke();
        }
      }

      // Platform proximity prompt
      const nearPed = pedestals.find((ped) => Math.hypot(ped.x - p.x, ped.y - p.y) < 70);
      if (nearPed && !isGameOver && bossState === 'normal') {
        ctx.save();
        ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
        ctx.fillRect(nearPed.x - 48, nearPed.y - 70, 96, 20);
        ctx.strokeStyle = '#38bdf8';
        ctx.strokeRect(nearPed.x - 48, nearPed.y - 70, 96, 20);
        ctx.fillStyle = '#38bdf8';
        ctx.font = 'bold 9px monospace';
        ctx.textAlign = 'center';
        if (heldRuneId) {
          ctx.fillText('[E] PLACE RUNE', nearPed.x, nearPed.y - 56);
        } else if (nearPed.placedRuneId) {
          ctx.fillText('[E] RETRIEVE', nearPed.x, nearPed.y - 56);
        } else {
          ctx.fillText('EMPTY SOCKET', nearPed.x, nearPed.y - 56);
        }
        ctx.restore();
      }

      ctx.restore();

      animFrameRef.current = requestAnimationFrame(gameLoop);
    };

    animFrameRef.current = requestAnimationFrame(gameLoop);

    return () => {
      running = false;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [
    pedestals,
    runes,
    heldRuneId,
    shieldLayers,
    isShattering,
    isGameOver,
    foe,
    currentRound,
    bothPedestalsFilled,
    evaluateAltar,
    bossState,
    currentRoundIndex,
    spriteConfig,
  ]);

  // Helper: Draw Rune Stone on Canvas (Supports fractions!)
  const drawRuneStone = (
    ctx: CanvasRenderingContext2D,
    rune: RuneEntity,
    x: number,
    y: number,
    isHovering = false
  ) => {
    ctx.save();

    if (isHovering) {
      ctx.beginPath();
      ctx.ellipse(x, y + 20, 18, 6, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fill();
    }

    ctx.shadowColor = rune.color;
    ctx.shadowBlur = isHovering ? 18 : 8;

    const rSize = isHovering ? 46 : 40;

    if (runeCanvasRef.current) {
      ctx.drawImage(runeCanvasRef.current, x - rSize / 2, y - rSize / 2, rSize, rSize);

      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.arc(x, y, 13, 0, Math.PI * 2);
      ctx.fillStyle = rune.glowColor;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(x, y, 11, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.fill();
    } else {
      const size = 19;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const angle = (i * Math.PI) / 3;
        const rx = x + size * Math.cos(angle);
        const ry = y + size * Math.sin(angle);
        if (i === 0) ctx.moveTo(rx, ry);
        else ctx.lineTo(rx, ry);
      }
      ctx.closePath();

      ctx.fillStyle = '#0f172a';
      ctx.fill();
      ctx.strokeStyle = rune.color;
      ctx.lineWidth = 2.5;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(x, y, 12, 0, Math.PI * 2);
      ctx.fillStyle = rune.glowColor;
      ctx.fill();
    }

    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffffff';
    const text = fracToDisplay(rune.value);
    ctx.font = text.length > 3 ? 'bold 10px monospace' : 'bold 12px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y + 1);

    ctx.restore();
  };

  // Virtual D-pad controls for mobile
  const handleTouchStart = (dir: 'up' | 'down' | 'left' | 'right') => {
    if (dir === 'up') touchDirRef.current = { dx: 0, dy: -1 };
    if (dir === 'down') touchDirRef.current = { dx: 0, dy: 1 };
    if (dir === 'left') touchDirRef.current = { dx: -1, dy: 0 };
    if (dir === 'right') touchDirRef.current = { dx: 1, dy: 0 };
  };

  const handleTouchEnd = () => {
    touchDirRef.current = { dx: 0, dy: 0 };
  };

  // GM Test Skip controls
  const handleSkipRound = () => {
    if (currentRoundIndex === 0) {
      setShieldLayers(1);
      setCurrentRoundIndex(1);
    } else if (currentRoundIndex === 1) {
      setShieldLayers(0);
      setCurrentRoundIndex(2);
    } else {
      projectilesRef.current = [];
      setBossState('falling');
    }
  };

  const handleInstantWin = () => {
    setShieldLayers(0);
    projectilesRef.current = [];
    setBossState('falling');
  };

  const handleRetryAfterGameOver = () => {
    setLives(3);
    setIsGameOver(false);
    playerRef.current.x = 400;
    playerRef.current.y = 480;
    projectilesRef.current = [];
    nextShootTimeRef.current = Date.now() + 2000;
    padTriggerCooldownRef.current = false;
  };

  const handleExitAfterGameOver = () => {
    onComplete({
      success: false,
      message: 'Felled by the mountain monomial barrage.',
    });
    if (isTestMode && onCloseTest) {
      onCloseTest();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/95 backdrop-blur-xl flex flex-col items-center justify-between p-2 sm:p-4 select-none overflow-hidden">
      {/* 1. TOP HEADER & HUD */}
      <div className="w-full max-w-4xl flex items-center justify-between text-xs sm:text-sm text-gray-300 px-2 shrink-0 z-20">
        {/* Left: 3 Rounds & Shield Indicator */}
        <div className="flex items-center gap-2">
          <span className="px-2.5 py-1 rounded-full bg-slate-800/90 border border-cyan-500/40 text-cyan-300 font-bold tracking-wider text-[11px] sm:text-xs uppercase flex items-center gap-1.5 shadow-md">
            <Sparkles className="w-3.5 h-3.5 text-cyan-400 animate-spin" />
            Round {currentRoundIndex + 1} / 3
          </span>
          <div className="flex items-center gap-1 bg-black/60 px-2.5 py-1 rounded-full border border-cyan-500/30">
            <ShieldAlert className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-cyan-300 text-xs font-mono font-bold">
              {shieldLayers > 0 ? `Shields: ${shieldLayers}/2` : 'UNPROTECTED!'}
            </span>
          </div>
        </div>

        {/* Center: 3 Player Hearts (Lives) */}
        <div className="flex items-center gap-1.5 bg-black/80 px-3 py-1 rounded-full border border-rose-500/40 shadow-[0_0_15px_rgba(244,63,94,0.3)]">
          <span className="text-[10px] uppercase font-bold text-gray-400 mr-1">Lives:</span>
          {[1, 2, 3].map((heartIndex) => (
            <Heart
              key={heartIndex}
              className={`w-4 h-4 transition-transform ${
                heartIndex <= lives
                  ? 'text-rose-500 fill-rose-500 scale-110 drop-shadow-[0_0_6px_rgba(244,63,94,0.8)]'
                  : 'text-gray-600 scale-90 opacity-40'
              }`}
            />
          ))}
        </div>

        {/* Right: GM tools / Help / Close */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setShowHowToPlay((prev) => !prev)}
            className="p-1.5 rounded-lg bg-gray-800/80 hover:bg-gray-700 text-gray-300 transition-colors"
            title="How to Play"
          >
            <HelpCircle className="w-4 h-4 text-cyan-400" />
          </button>

          {isTestMode && (
            <>
              <button
                onClick={handleSkipRound}
                className="px-2 py-1 rounded-lg bg-amber-600/80 hover:bg-amber-500 text-white text-[11px] font-bold flex items-center gap-1"
              >
                <Zap className="w-3 h-3" /> Skip Round
              </button>
              <button
                onClick={handleInstantWin}
                className="px-2 py-1 rounded-lg bg-emerald-600/80 hover:bg-emerald-500 text-white text-[11px] font-bold"
              >
                Instant Win
              </button>
            </>
          )}

          {isTestMode && onCloseTest && (
            <button
              onClick={onCloseTest}
              className="p-1.5 rounded-lg bg-red-900/60 hover:bg-red-800 text-red-200 transition-colors"
              title="Exit Test Lab"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* 2. THE 2D CANVAS ARENA (800x600 coordinate space) */}
      <div className="relative w-full max-w-4xl flex-1 flex items-center justify-center my-1 overflow-hidden">
        <canvas
          ref={canvasRef}
          width={800}
          height={600}
          onClick={handleInteract}
          className="w-full h-full max-h-[66vh] object-contain rounded-2xl border-2 border-slate-700/60 shadow-[0_15px_40px_rgba(0,0,0,0.9)] cursor-pointer"
        />

        {/* 3. SHINING EQUATION DIRECTLY IN FRONT OF THE FOE (NO BACKGROUND BOX, HIGHER Z-AXIS) */}
        {bossState === 'normal' && currentRound && (
          <div className="absolute top-[14%] sm:top-[15%] left-1/2 -translate-x-1/2 pointer-events-none z-30 flex flex-col items-center select-none">
            <div className="text-yellow-200 text-xs sm:text-sm font-black tracking-wide drop-shadow-[0_0_8px_rgba(250,204,21,1)] filter drop-shadow-[0_0_18px_rgba(245,158,11,0.85)] animate-pulse">
              <InlineMath math={currentRound.latex} />
            </div>
          </div>
        )}

        {/* 4. RAGE SPEECH BUBBLE WHEN FOE IS ON THE FLOOR */}
        {bossState === 'raging' && (
          <div className="absolute top-[38%] left-1/2 -translate-x-1/2 pointer-events-none z-40 flex flex-col items-center animate-in zoom-in-90 duration-200">
            <div className="bg-black text-white text-xs sm:text-sm font-black px-3.5 py-1.5 rounded-xl border border-white/60 shadow-[0_0_20px_rgba(0,0,0,0.95)] tracking-wider">
              It&apos;s not over!
            </div>
            <div className="w-0 h-0 border-x-[5px] border-x-transparent border-t-[7px] border-t-black -mt-px" />
          </div>
        )}

        {/* Controls Legend overlay */}
        <div className="absolute top-2 left-2 pointer-events-none hidden sm:flex items-center gap-2 bg-black/70 backdrop-blur-md px-3 py-1 rounded-full border border-white/10 text-[11px] text-gray-300">
          <span className="font-mono text-cyan-300 font-bold">WASD / Arrows:</span> Move
          <span className="text-gray-500">•</span>
          <span className="font-mono text-yellow-300 font-bold">SPACE / E:</span> Pick / Place
        </div>
      </div>

      {/* 3. MOBILE CONTROLS & STATUS FOOTER */}
      <div className="w-full max-w-4xl flex items-center justify-between gap-3 shrink-0 px-2 py-1 z-20">
        {/* Mobile D-Pad (Left) */}
        <div className="sm:hidden grid grid-cols-3 gap-1 w-28 h-28 touch-none">
          <div />
          <button
            onTouchStart={() => handleTouchStart('up')}
            onTouchEnd={handleTouchEnd}
            onMouseDown={() => handleTouchStart('up')}
            onMouseUp={handleTouchEnd}
            className="bg-gray-800/80 active:bg-cyan-600 text-white rounded-lg flex items-center justify-center border border-white/20 active:scale-90"
          >
            <ArrowUp className="w-5 h-5" />
          </button>
          <div />

          <button
            onTouchStart={() => handleTouchStart('left')}
            onTouchEnd={handleTouchEnd}
            onMouseDown={() => handleTouchStart('left')}
            onMouseUp={handleTouchEnd}
            className="bg-gray-800/80 active:bg-cyan-600 text-white rounded-lg flex items-center justify-center border border-white/20 active:scale-90"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center justify-center text-[10px] text-gray-500 font-bold font-mono">
            PAD
          </div>
          <button
            onTouchStart={() => handleTouchStart('right')}
            onTouchEnd={handleTouchEnd}
            onMouseDown={() => handleTouchStart('right')}
            onMouseUp={handleTouchEnd}
            className="bg-gray-800/80 active:bg-cyan-600 text-white rounded-lg flex items-center justify-center border border-white/20 active:scale-90"
          >
            <ArrowRight className="w-5 h-5" />
          </button>

          <div />
          <button
            onTouchStart={() => handleTouchStart('down')}
            onTouchEnd={handleTouchEnd}
            onMouseDown={() => handleTouchStart('down')}
            onMouseUp={handleTouchEnd}
            className="bg-gray-800/80 active:bg-cyan-600 text-white rounded-lg flex items-center justify-center border border-white/20 active:scale-90"
          >
            <ArrowDown className="w-5 h-5" />
          </button>
          <div />
        </div>

        {/* Carrying Status Center Pill */}
        <div className="flex-1 flex justify-center">
          <div className="bg-black/75 backdrop-blur-md px-4 py-1.5 rounded-full border border-white/10 flex items-center gap-2 text-xs">
            <span className="text-gray-400 font-medium">Carrying:</span>
            {heldRuneId ? (
              <span className="font-bold text-yellow-300 font-mono bg-yellow-950/60 px-2 py-0.5 rounded border border-yellow-500/40">
                Rune ({fracToDisplay(runes.find((r) => r.id === heldRuneId)?.value || frac(0))})
              </span>
            ) : (
              <span className="text-gray-500 italic">Hands Empty</span>
            )}
          </div>
        </div>

        {/* Mobile Action Button (Right) */}
        <div className="sm:hidden">
          <button
            onClick={handleInteract}
            className="w-20 h-20 rounded-2xl bg-gradient-to-tr from-cyan-600 to-blue-500 active:from-blue-400 active:to-cyan-600 text-white font-black text-xs uppercase flex flex-col items-center justify-center gap-1 shadow-lg border border-cyan-300 active:scale-90 transition-transform"
          >
            <Hand className="w-6 h-6 text-white" />
            <span>{heldRuneId ? 'PLACE' : 'PICK'}</span>
          </button>
        </div>
      </div>

      {/* 4. HOW TO PLAY MODAL */}
      {showHowToPlay && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-cyan-500/40 rounded-2xl p-6 max-w-md w-full shadow-2xl relative">
            <button
              onClick={() => setShowHowToPlay(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-lg font-black text-white flex items-center gap-2 mb-3">
              <Sparkles className="w-5 h-5 text-cyan-400" />
              Viète&apos;s Mountain Trial: 3 Rounds
            </h3>
            <div className="space-y-3 text-xs sm:text-sm text-gray-300 leading-relaxed">
              <p>
                1. <strong className="text-rose-400">Dodge Projectiles:</strong> The mountain boss periodically launches <strong className="text-yellow-300">monomial fireballs</strong>. You have <strong className="text-rose-400">3 Lives</strong>.
              </p>
              <p>
                2. <strong className="text-cyan-300">Viète Platforms:</strong>
                <br />
                • Left Platform <strong className="text-yellow-300">∑ αᵢ</strong> = Sum of roots (<InlineMath math="=-\frac{a_{n-1}}{a_n}" />).
                <br />
                • Right Platform <strong className="text-yellow-300">∏ αᵢ</strong> = Product of roots (<InlineMath math="=(-1)^n \frac{a_0}{a_n}" />).
              </p>
              <p>
                3. <strong className="text-yellow-300">3 Rounds & Shields:</strong>
                <br />
                • Round 1: Shatter outer seal.
                <br />
                • Round 2: Shatter inner seal (foe becomes unprotected!).
                <br />
                • Round 3: Lasers hit unprotected foe directly, clearing the path to the summit!
              </p>
              <p>
                4. <strong className="text-cyan-300">Activation Dais:</strong> Once both platforms are socketed, the center step dais glows. Step onto it to fire the celestial lasers!
              </p>
            </div>
            <button
              onClick={() => setShowHowToPlay(false)}
              className="mt-5 w-full py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-sm transition-all shadow-lg"
            >
              Got it, let&apos;s climb!
            </button>
          </div>
        </div>
      )}

      {/* 5. GAME OVER (DEFEAT) MODAL */}
      {isGameOver && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in zoom-in-95 duration-300">
          <div className="bg-gradient-to-b from-slate-900 to-rose-950 border-2 border-rose-500/60 rounded-3xl p-6 sm:p-8 max-w-md w-full text-center shadow-[0_0_50px_rgba(244,63,94,0.4)] relative">
            <div className="w-16 h-16 rounded-2xl bg-rose-500/20 border-2 border-rose-400 flex items-center justify-center mx-auto mb-4 shadow-[0_0_20px_rgba(244,63,94,0.5)]">
              <Skull className="w-9 h-9 text-rose-400" />
            </div>

            <h2 className="text-2xl font-black text-white uppercase tracking-wider mb-2">
              Felled on the Summit!
            </h2>
            <p className="text-sm text-gray-300 mb-6 leading-relaxed">
              The barrage of monomial projectiles overwhelmed your defenses before the Viète altars could be harmonized.
            </p>

            <div className="flex flex-col gap-2.5">
              <button
                onClick={handleRetryAfterGameOver}
                className="w-full py-3 rounded-2xl bg-gradient-to-r from-rose-600 to-amber-600 text-white font-black text-sm uppercase tracking-wider shadow-lg hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-2"
              >
                <RotateCcw className="w-4 h-4" />
                Retry Trial (3 Lives)
              </button>

              <button
                onClick={handleExitAfterGameOver}
                className="w-full py-2.5 rounded-2xl bg-gray-800/80 hover:bg-gray-700 text-gray-300 font-bold text-xs uppercase tracking-wider border border-white/10 transition-colors"
              >
                {isTestMode ? 'Back to Test Lab' : 'Retreat'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. CINEMATIC EXIT FADE TRANSITION (Smooth fade back to battle after defeat rage) */}
      {isExitingTransition && (
        <div className="fixed inset-0 z-50 pointer-events-auto bg-black transition-opacity duration-700 opacity-100 flex items-center justify-center">
          <div className="text-cyan-400 font-mono font-bold text-xs sm:text-sm tracking-widest uppercase flex items-center gap-2 animate-pulse">
            <Sparkles className="w-4 h-4 text-cyan-300" /> Returning to Battle...
          </div>
        </div>
      )}
    </div>
  );
}
