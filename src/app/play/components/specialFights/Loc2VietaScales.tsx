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
  Award,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Hand,
  Heart,
  Skull,
  RotateCcw,
} from 'lucide-react';

// Process a sprite on an offscreen canvas to turn white background into smooth alpha transparency
function createProcessedTransparentCanvas(img: HTMLImageElement): HTMLCanvasElement {
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
      if (r > 230 && g > 230 && b > 230) {
        const avg = (r + g + b) / 3;
        if (avg >= 245) {
          data[i + 3] = 0;
        } else {
          data[i + 3] = Math.round(((245 - avg) / 15) * 255);
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

// 3 increasingly epic rounds with non-1 leading coefficients & fractional values:
// Round 1: Quadratic / Cubic (Degree 2 or 3)
// Round 2: Degree 3, 4, 5
// Round 3: High Degree (Degree 20, 50, 77, 100!)
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
const PAD_RADIUS = 36;

export default function Loc2VietaScales({
  foe,
  character,
  onComplete,
  isTestMode = false,
  onCloseTest,
}: SpecialFightProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Rounds state
  const [currentRoundIndex, setCurrentRoundIndex] = useState(0); // 0, 1, 2
  const [selectedRounds, setSelectedRounds] = useState<VietaRound[]>([]);
  const [shieldLayers, setShieldLayers] = useState(3);
  const [lives, setLives] = useState(3);
  const [isGameOver, setIsGameOver] = useState(false);
  const [isVictory, setIsVictory] = useState(false);
  const [isShattering, setIsShattering] = useState(false);
  const [showHowToPlay, setShowHowToPlay] = useState(false);

  // Entities state
  const [runes, setRunes] = useState<RuneEntity[]>([]);
  const [pedestals, setPedestals] = useState<PedestalEntity[]>([
    {
      id: 'sum',
      symbol: 'Σ αᵢ',
      x: 300,
      y: 250,
      placedRuneId: null,
    },
    {
      id: 'product',
      symbol: '∏ αᵢ',
      x: 500,
      y: 250,
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
  const foeImgRef = useRef<HTMLImageElement | null>(null);
  const bgImgRef = useRef<HTMLImageElement | null>(null);
  const pedestalCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const runeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Pad cooldown so player doesn't trigger multiple times in one step
  const padTriggerCooldownRef = useRef(false);

  // Initialize random 3 rounds on mount
  useEffect(() => {
    const pickRandom = (arr: VietaRound[]) => arr[Math.floor(Math.random() * arr.length)];
    setSelectedRounds([
      pickRandom(ROUND_1_POOL),
      pickRandom(ROUND_2_POOL),
      pickRandom(ROUND_3_POOL),
    ]);

    // Initialize snow particles
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

  // Preload game sprites & Location 2 visual assets
  useEffect(() => {
    // 1. Mountain Summit Backdrop
    const bg = new Image();
    bg.src = LOCATION_2_ASSETS.SUMMIT_BACKDROP;
    bg.onload = () => {
      bgImgRef.current = bg;
    };

    // 2. Carved Altar Pedestal Sprite
    const pedImg = new Image();
    pedImg.src = LOCATION_2_ASSETS.PEDESTAL;
    pedImg.onload = () => {
      pedestalCanvasRef.current = createProcessedTransparentCanvas(pedImg);
    };

    // 3. Ancient Rune Tablet Sprite
    const rImg = new Image();
    rImg.src = LOCATION_2_ASSETS.RUNE_TABLET;
    rImg.onload = () => {
      runeCanvasRef.current = createProcessedTransparentCanvas(rImg);
    };

    // 4. Player Owl
    const owl = new Image();
    owl.crossOrigin = 'anonymous';
    owl.src =
      character?.imageUrl ||
      'https://firebasestorage.googleapis.com/v0/b/pokematicos.firebasestorage.app/o/The_Primordial_Equation_Owl_Sprites%2Fowl%20back.png?alt=media&token=bae93c5e-92ed-4958-9274-fb67a3f5f8c9';
    owl.onload = () => {
      owlImgRef.current = owl;
    };

    // 5. Boss Foe
    if (foe?.imageUrl) {
      const foeImg = new Image();
      foeImg.crossOrigin = 'anonymous';
      foeImg.src = foe.imageUrl;
      foeImg.onload = () => {
        foeImgRef.current = foeImg;
      };
    }
  }, [character?.imageUrl, foe?.imageUrl]);

  // Spawn runes & reset pedestals for the current round
  // NOTE: Does NOT reset player position so owl stays where it was!
  useEffect(() => {
    if (!currentRound) return;

    setHeldRuneId(null);
    projectilesRef.current = [];
    nextShootTimeRef.current = Date.now() + 2000;
    padTriggerCooldownRef.current = false;

    // Reset pedestals
    setPedestals([
      {
        id: 'sum',
        symbol: 'Σ αᵢ',
        x: 300,
        y: 250,
        placedRuneId: null,
      },
      {
        id: 'product',
        symbol: '∏ αᵢ',
        x: 500,
        y: 250,
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
    // Shuffle values
    const shuffled = [...allValues].sort(() => Math.random() - 0.5);

    // Place them scattered on the snowy summit floor
    const cols = 3;
    const startX = 170;
    const startY = 360;
    const stepX = 230;
    const stepY = 85;

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
        y: Math.min(480, Math.max(340, startY + row * stepY + jitterY)),
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
    if (isShattering || isVictory || isGameOver) return;

    const px = playerRef.current.x;
    const py = playerRef.current.y;

    // 1. Are we near a pedestal? (< 65px)
    const nearPedestal = pedestals.find((p) => Math.hypot(p.x - px, p.y - py) < 65);

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

    // 2. Are we near a rune on the ground? (< 50px)
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
  }, [pedestals, runes, heldRuneId, isShattering, isVictory, isGameOver]);

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

  // Check if both pedestals are filled
  const bothPedestalsFilled = useMemo(() => {
    return pedestals.every((p) => p.placedRuneId !== null);
  }, [pedestals]);

  // Evaluate the Viète Altars when stepping on the pressure pad
  const evaluateAltar = useCallback(() => {
    if (!bothPedestalsFilled || isShattering || isVictory || isGameOver || !currentRound) return;

    const sumPedestal = pedestals.find((p) => p.id === 'sum');
    const prodPedestal = pedestals.find((p) => p.id === 'product');

    const sumRune = runes.find((r) => r.id === sumPedestal?.placedRuneId);
    const prodRune = runes.find((r) => r.id === prodPedestal?.placedRuneId);

    if (!sumRune || !prodRune) return;

    const isSumCorrect = isFracEqual(sumRune.value, currentRound.sumOfRoots);
    const isProductCorrect = isFracEqual(prodRune.value, currentRound.productOfRoots);

    if (isSumCorrect && isProductCorrect) {
      // SUCCESS! Shoot rays and shatter barrier layer
      setIsShattering(true);

      // Spawn laser beams from both pedestals directly to boss
      pedestals.forEach((p) => {
        createBurstParticles(p.x, p.y, '#38bdf8', 25);
        for (let i = 0; i < 30; i++) {
          particlesRef.current.push({
            x: p.x + (Math.random() - 0.5) * 20,
            y: p.y,
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

      // Boss hit explosion (no screen shake)
      setTimeout(() => {
        createBurstParticles(400, 100, '#f43f5e', 45);
        setShieldLayers((prev) => Math.max(0, prev - 1));
      }, 700);

      setTimeout(() => {
        setIsShattering(false);
        if (currentRoundIndex < 2) {
          setCurrentRoundIndex((prev) => prev + 1);
        } else {
          setIsVictory(true);
        }
      }, 1600);
    }
  }, [bothPedestalsFilled, isShattering, isVictory, isGameOver, currentRound, pedestals, runes, currentRoundIndex]);

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

      if (!isGameOver && !isVictory) {
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
          !isVictory &&
          !isGameOver &&
          !padTriggerCooldownRef.current
        ) {
          if (isSumCorrect && isProductCorrect) {
            padTriggerCooldownRef.current = true;
            evaluateAltar();
          }
        }
      }

      // 2. Foe Monomial Projectile Spawner
      const now = Date.now();
      if (!isGameOver && !isVictory && !isShattering && now >= nextShootTimeRef.current) {
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
        if (distToPlayer < 24 && p.invulnerableFrames === 0 && !isGameOver && !isVictory) {
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

      // 3. Clear Canvas & Apply Screen Shake (only on projectile hit)
      ctx.save();
      if (p.shakeTime > 0) {
        const shakeX = (Math.random() - 0.5) * 6;
        const shakeY = (Math.random() - 0.5) * 6;
        ctx.translate(shakeX, shakeY);
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // 4. Render Mountain Sky & Summit Atmosphere (High-fidelity backdrop with procedural fallback)
      if (bgImgRef.current && bgImgRef.current.complete) {
        ctx.drawImage(bgImgRef.current, 0, 0, canvas.width, canvas.height);
      } else {
        const skyGrad = ctx.createLinearGradient(0, 0, 0, 220);
        skyGrad.addColorStop(0, '#0c1222');
        skyGrad.addColorStop(0.6, '#1e293b');
        skyGrad.addColorStop(1, '#334155');
        ctx.fillStyle = skyGrad;
        ctx.fillRect(0, 0, canvas.width, 220);

        // Distant snowy mountain peaks in silhouette
        ctx.fillStyle = '#1e293b';
        ctx.beginPath();
        ctx.moveTo(0, 220);
        ctx.lineTo(80, 110);
        ctx.lineTo(160, 160);
        ctx.lineTo(260, 90);
        ctx.lineTo(360, 170);
        ctx.lineTo(480, 80);
        ctx.lineTo(580, 160);
        ctx.lineTo(690, 100);
        ctx.lineTo(800, 220);
        ctx.closePath();
        ctx.fill();

        // Snowy peak caps on mountains
        ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
        ctx.beginPath();
        ctx.moveTo(80, 110);
        ctx.lineTo(105, 130);
        ctx.lineTo(55, 130);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(260, 90);
        ctx.lineTo(290, 115);
        ctx.lineTo(230, 115);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(480, 80);
        ctx.lineTo(510, 110);
        ctx.lineTo(450, 110);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(690, 100);
        ctx.lineTo(720, 125);
        ctx.lineTo(660, 125);
        ctx.closePath();
        ctx.fill();

        // 5. Render Snowy Summit Ground (Peak Platform)
        const groundGrad = ctx.createLinearGradient(0, 200, 0, 600);
        groundGrad.addColorStop(0, '#cbd5e1');
        groundGrad.addColorStop(0.3, '#f1f5f9');
        groundGrad.addColorStop(0.8, '#e2e8f0');
        groundGrad.addColorStop(1, '#94a3b8');
        ctx.fillStyle = groundGrad;
        ctx.fillRect(0, 200, canvas.width, 400);

        // Snowy texture drifts
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        for (let i = 0; i < 8; i++) {
          ctx.beginPath();
          ctx.ellipse(80 + i * 90, 310 + (i % 3) * 60, 60, 14, 0, 0, Math.PI * 2);
          ctx.fill();
        }

        // Mountain rocks & snowy boulders on edges
        ctx.fillStyle = '#475569';
        ctx.beginPath();
        ctx.moveTo(0, 240);
        ctx.lineTo(50, 270);
        ctx.lineTo(35, 340);
        ctx.lineTo(55, 420);
        ctx.lineTo(25, 520);
        ctx.lineTo(0, 560);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#f8fafc';
        ctx.beginPath();
        ctx.ellipse(35, 270, 20, 6, 0, 0, Math.PI * 2);
        ctx.ellipse(40, 340, 18, 5, 0, 0, Math.PI * 2);
        ctx.ellipse(30, 420, 22, 6, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#475569';
        ctx.beginPath();
        ctx.moveTo(800, 240);
        ctx.lineTo(750, 280);
        ctx.lineTo(765, 360);
        ctx.lineTo(745, 440);
        ctx.lineTo(775, 520);
        ctx.lineTo(800, 560);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#f8fafc';
        ctx.beginPath();
        ctx.ellipse(765, 280, 20, 6, 0, 0, Math.PI * 2);
        ctx.ellipse(755, 360, 18, 5, 0, 0, Math.PI * 2);
        ctx.ellipse(770, 440, 22, 6, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      // 6. Falling Snowflakes
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

      // 7. Render Foe on the Summit Throne (Fully visible, not covered)
      const bossX = 400;
      const bossY = 95;
      const hoverOffset = Math.sin(Date.now() / 320) * 5;

      ctx.save();
      ctx.beginPath();
      ctx.ellipse(bossX, bossY + 45, 55, 14, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(15, 23, 42, 0.45)';
      ctx.filter = 'blur(4px)';
      ctx.fill();
      ctx.restore();

      if (foeImgRef.current && foeImgRef.current.complete) {
        ctx.drawImage(foeImgRef.current, bossX - 44, bossY - 44 + hoverOffset, 88, 88);
      } else {
        ctx.font = '52px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(foe?.emoji || '👹', bossX, bossY + hoverOffset);
      }

      // Boss Runic Shield Rings
      if (shieldLayers > 0) {
        for (let s = 0; s < shieldLayers; s++) {
          const radius = 58 + s * 13;
          const spin = (Date.now() / (1100 + s * 280)) * (s % 2 === 0 ? 1 : -1);
          ctx.save();
          ctx.translate(bossX, bossY + hoverOffset);
          ctx.rotate(spin);
          ctx.beginPath();
          ctx.arc(0, 0, radius, 0, Math.PI * 2);
          ctx.strokeStyle =
            s === 0
              ? 'rgba(239, 68, 68, 0.75)'
              : s === 1
              ? 'rgba(168, 85, 247, 0.65)'
              : 'rgba(56, 189, 248, 0.6)';
          ctx.lineWidth = 2.5;
          ctx.setLineDash([10, 8]);
          ctx.stroke();
          ctx.restore();
        }
      }

      // Laser beams during shattering
      if (isShattering) {
        pedestals.forEach((ped) => {
          ctx.save();
          ctx.beginPath();
          ctx.moveTo(ped.x, ped.y - 20);
          ctx.lineTo(bossX + (Math.random() - 0.5) * 15, bossY + hoverOffset);
          ctx.strokeStyle = 'rgba(56, 189, 248, 0.9)';
          ctx.lineWidth = 6 + Math.random() * 4;
          ctx.shadowColor = '#38bdf8';
          ctx.shadowBlur = 16;
          ctx.stroke();
          ctx.restore();
        });
      }

      // 8. Render Flying Monomial Projectiles
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

      // 9. Render Bigger Pedestals: Sum (Σ α_i) and Product (∏ α_i)
      pedestals.forEach((ped) => {
        const sumPed = pedestals.find((pd) => pd.id === 'sum');
        const prodPed = pedestals.find((pd) => pd.id === 'product');
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
          !isVictory &&
          ((ped.id === 'sum' && !isSumCorrect) || (ped.id === 'product' && !isProductCorrect));

        // Shadow
        ctx.beginPath();
        ctx.ellipse(ped.x, ped.y + 18, 42, 14, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.fill();

        const hasRune = ped.placedRuneId !== null;

        // Render carved altar sprite or procedural fallback
        if (pedestalCanvasRef.current) {
          const pw = 84;
          const ph = 102;
          ctx.drawImage(pedestalCanvasRef.current, ped.x - pw / 2, ped.y - ph + 24, pw, ph);

          // Glowing socket on altar top
          ctx.beginPath();
          ctx.ellipse(ped.x, ped.y - ph + 34, 26, 9, 0, 0, Math.PI * 2);
          ctx.fillStyle = hasRune ? 'rgba(56, 189, 248, 0.85)' : 'rgba(14, 165, 233, 0.25)';
          ctx.fill();
        } else {
          // Mountain stone altar column (wider and taller)
          ctx.fillStyle = '#334155';
          ctx.fillRect(ped.x - 34, ped.y - 30, 68, 46);

          // Snow dusting on top of altar
          ctx.fillStyle = '#f8fafc';
          ctx.beginPath();
          ctx.ellipse(ped.x, ped.y - 30, 36, 12, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#64748b';
          ctx.lineWidth = 2.5;
          ctx.stroke();

          // Socket
          ctx.beginPath();
          ctx.ellipse(ped.x, ped.y - 30, 24, 8, 0, 0, Math.PI * 2);
          ctx.fillStyle = hasRune ? 'rgba(56, 189, 248, 0.85)' : 'rgba(71, 85, 105, 0.4)';
          ctx.fill();
        }

        // Altar Greek Engraving on Column Face (BIGGER, NO SUBTEXT)
        ctx.save();
        ctx.fillStyle = '#fef08a';
        ctx.shadowColor = 'rgba(250, 204, 21, 0.7)';
        ctx.shadowBlur = 9;
        ctx.font = 'bold 24px serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(ped.symbol, ped.x, ped.y - 12);
        ctx.restore();

        // Pulsate RED when altar has wrong rune and owl is on the platform
        if (isWrongOnPad) {
          const redPulse = (Math.sin(Date.now() / 110) + 1) / 2;
          ctx.save();
          // Pulsing red aura ring around the pedestal
          ctx.beginPath();
          ctx.ellipse(ped.x, ped.y - 10, 50 + redPulse * 8, 40 + redPulse * 6, 0, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(239, 68, 68, ${0.45 + redPulse * 0.55})`;
          ctx.lineWidth = 3.5;
          ctx.shadowColor = '#ef4444';
          ctx.shadowBlur = 22 + redPulse * 15;
          ctx.stroke();

          // Pulsing red overlay on altar face
          ctx.fillStyle = `rgba(239, 68, 68, ${0.25 + redPulse * 0.35})`;
          ctx.beginPath();
          ctx.ellipse(ped.x, ped.y - 14, 34, 40, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }

        // Placed Rune floating above socket
        if (hasRune) {
          const placedRune = runes.find((r) => r.id === ped.placedRuneId);
          if (placedRune) {
            const floatY = ped.y - 64 + Math.sin(Date.now() / 250) * 3;
            drawRuneStone(ctx, placedRune, ped.x, floatY, true);
          }
        }
      });

      // 10. Render Floor Pressure Pad when both pedestals are filled
      if (bothPedestalsFilled && !isGameOver && !isVictory) {
        ctx.save();
        const pulse = Math.sin(Date.now() / 220) * 3;

        // Outer glowing ring
        ctx.beginPath();
        ctx.arc(PAD_X, PAD_Y, PAD_RADIUS + pulse, 0, Math.PI * 2);
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 3;
        ctx.shadowColor = '#38bdf8';
        ctx.shadowBlur = 18;
        ctx.stroke();

        // Inner glowing fill
        ctx.beginPath();
        ctx.arc(PAD_X, PAD_Y, PAD_RADIUS, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(56, 189, 248, 0.25)';
        ctx.fill();

        // Rotating runic spokes
        const spin = Date.now() / 800;
        for (let i = 0; i < 4; i++) {
          const a = spin + (i * Math.PI) / 2;
          ctx.beginPath();
          ctx.moveTo(PAD_X, PAD_Y);
          ctx.lineTo(PAD_X + Math.cos(a) * PAD_RADIUS, PAD_Y + Math.sin(a) * PAD_RADIUS);
          ctx.strokeStyle = 'rgba(254, 240, 138, 0.6)';
          ctx.lineWidth = 2;
          ctx.stroke();
        }

        // Center symbol
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#fef08a';
        ctx.font = 'bold 15px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('⚡', PAD_X, PAD_Y);

        // Text prompt above pad
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(PAD_X - 70, PAD_Y - 48, 140, 18);
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1;
        ctx.strokeRect(PAD_X - 70, PAD_Y - 48, 140, 18);
        ctx.fillStyle = '#38bdf8';
        ctx.font = 'bold 9px monospace';
        ctx.fillText('STEP TO CHANNEL ALTAR', PAD_X, PAD_Y - 36);

        ctx.restore();
      }

      // 11. Render Scattered Runes on the Snowy Summit
      const placedIds = new Set(pedestals.map((p) => p.placedRuneId).filter(Boolean));
      runes.forEach((rune) => {
        if (placedIds.has(rune.id) || rune.id === heldRuneId) return;

        drawRuneStone(ctx, rune, rune.x, rune.y, false);

        // Highlight proximity
        const dist = Math.hypot(rune.x - p.x, rune.y - p.y);
        if (dist < 50 && !heldRuneId && !isGameOver && !isVictory) {
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

      // 12. Render Particles
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

      // 13. Render Player (The Owl) with Damage Blinking
      const bob = p.isMoving ? Math.sin(p.walkCycle) * 3 : 0;
      const playerY = p.y + bob;

      ctx.beginPath();
      ctx.ellipse(p.x, p.y + 16, 20, 7, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
      ctx.fill();

      const isBlinking = p.invulnerableFrames > 0 && Math.floor(p.invulnerableFrames / 6) % 2 === 0;

      if (!isBlinking) {
        ctx.save();
        ctx.translate(p.x, playerY);
        if (p.facing === 'left') {
          ctx.scale(-1, 1);
        }

        if (owlImgRef.current && owlImgRef.current.complete) {
          ctx.drawImage(owlImgRef.current, -24, -36, 48, 48);
        } else {
          ctx.font = '36px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('🦉', 0, -10);
        }
        ctx.restore();
      }

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

      // Pedestal proximity prompt
      const nearPed = pedestals.find((ped) => Math.hypot(ped.x - p.x, ped.y - p.y) < 65);
      if (nearPed && !isGameOver && !isVictory) {
        ctx.save();
        ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
        ctx.fillRect(nearPed.x - 44, nearPed.y - 82, 88, 20);
        ctx.strokeStyle = '#38bdf8';
        ctx.strokeRect(nearPed.x - 44, nearPed.y - 82, 88, 20);
        ctx.fillStyle = '#38bdf8';
        ctx.font = 'bold 9px monospace';
        ctx.textAlign = 'center';
        if (heldRuneId) {
          ctx.fillText('[E] PLACE RUNE', nearPed.x, nearPed.y - 68);
        } else if (nearPed.placedRuneId) {
          ctx.fillText('[E] RETRIEVE', nearPed.x, nearPed.y - 68);
        } else {
          ctx.fillText('EMPTY SOCKET', nearPed.x, nearPed.y - 68);
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
  }, [pedestals, runes, heldRuneId, shieldLayers, isShattering, isGameOver, isVictory, foe, currentRound, bothPedestalsFilled, evaluateAltar]);

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

      // Inner glowing core
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.arc(x, y, 13, 0, Math.PI * 2);
      ctx.fillStyle = rune.glowColor;
      ctx.fill();

      // Readability contrast backing badge for fraction text
      ctx.beginPath();
      ctx.arc(x, y, 11, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.fill();
    } else {
      // Hexagonal procedural fallback
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

    // Fraction or integer text
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

  // Close / Skip controls for GM test mode
  const handleSkipRound = () => {
    if (currentRoundIndex < 2) {
      setShieldLayers((prev) => Math.max(0, prev - 1));
      setCurrentRoundIndex((prev) => prev + 1);
    } else {
      setIsVictory(true);
    }
  };

  // Exit / Continue handler
  const handleFinishVictory = () => {
    onComplete({
      success: true,
      message: 'All 3 Viète polynomial seals shattered!',
    });
    if (isTestMode && onCloseTest) {
      onCloseTest();
    }
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
      <div className="w-full max-w-4xl flex flex-col items-center gap-1 shrink-0 z-20">
        <div className="w-full flex items-center justify-between text-xs sm:text-sm text-gray-300 px-2">
          {/* Left: Round & Shield Indicator */}
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 rounded-full bg-slate-800/90 border border-cyan-500/40 text-cyan-300 font-bold tracking-wider text-[11px] sm:text-xs uppercase flex items-center gap-1.5 shadow-md">
              <Sparkles className="w-3.5 h-3.5 text-cyan-400 animate-spin" />
              Round {currentRoundIndex + 1} / 3
            </span>
            <div className="flex items-center gap-1 bg-black/60 px-2 py-0.5 rounded-full border border-red-500/30">
              <ShieldAlert className="w-3.5 h-3.5 text-red-400" />
              <span className="text-red-300 text-xs font-mono font-bold">
                Shields: {shieldLayers}/3
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
                  onClick={() => setIsVictory(true)}
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

        {/* FLOATING GLOWING POLYNOMIAL ONLY (REFINED SIZE, NO PLAQUE, NO TITLE, NO DEGREE - FOE FULLY VISIBLE BEHIND) */}
        <div className="absolute top-[13%] sm:top-[15%] left-1/2 -translate-x-1/2 pointer-events-none z-20 text-center select-none w-full px-4">
          <div className="text-base sm:text-xl md:text-2xl text-yellow-300 font-black tracking-wide drop-shadow-[0_0_12px_rgba(250,204,21,0.9)] drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
            <InlineMath math={currentRound?.latex || ''} />
          </div>
        </div>

        {/* Controls Legend overlay */}
        <div className="absolute top-2 left-2 pointer-events-none hidden sm:flex items-center gap-2 bg-black/70 backdrop-blur-md px-3 py-1 rounded-full border border-white/10 text-[11px] text-gray-300">
          <span className="font-mono text-cyan-300 font-bold">WASD / Arrows:</span> Move
          <span className="text-gray-500">•</span>
          <span className="font-mono text-yellow-300 font-bold">SPACE / E:</span> Pick / Place
        </div>
      </div>

      {/* 3. MOBILE CONTROLS & DESKTOP FOOTER */}
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
              Viète&apos;s Mountain Trial: Rules
            </h3>
            <div className="space-y-3 text-xs sm:text-sm text-gray-300 leading-relaxed">
              <p>
                1. <strong className="text-rose-400">Dodge Projectiles:</strong> The mountain boss periodically launches <strong className="text-yellow-300">monomial fireballs</strong> (e.g. <InlineMath math="2x^2, -5x, +3" />). You have <strong className="text-rose-400">3 Lives</strong> in total. Avoid them using <strong className="text-white">WASD / Arrow Keys</strong>!
              </p>
              <p>
                2. <strong className="text-cyan-300">Viète Altars:</strong>
                <br />
                • Left Altar <strong className="text-yellow-300">Σ αᵢ</strong> = Sum of all roots (<InlineMath math="=-\frac{a_{n-1}}{a_n}" />).
                <br />
                • Right Altar <strong className="text-yellow-300">∏ αᵢ</strong> = Product of all roots (<InlineMath math="=(-1)^n \frac{a_0}{a_n}" />).
              </p>
              <p>
                3. <strong className="text-indigo-300">Fraction Runes:</strong> Results can be fractional (e.g. <InlineMath math="5/2, -7/3" />). Place the corresponding fractional rune onto the pedestal.
              </p>
              <p>
                4. <strong className="text-yellow-300">Channel Altar:</strong> Once both altars are socketed, a glowing floor pad appears at the bottom. <strong className="text-white">Step onto it</strong> to fire the rays at the boss!
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

      {/* 6. VICTORY OVERLAY MODAL */}
      {isVictory && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in zoom-in-95 duration-300">
          <div className="bg-gradient-to-b from-slate-900 to-cyan-950 border-2 border-yellow-400/60 rounded-3xl p-6 sm:p-8 max-w-lg w-full text-center shadow-[0_0_50px_rgba(234,179,8,0.35)] relative overflow-hidden">
            <div className="absolute -top-12 -left-12 w-32 h-32 bg-yellow-500/20 rounded-full blur-2xl" />
            <div className="absolute -bottom-12 -right-12 w-32 h-32 bg-cyan-500/20 rounded-full blur-2xl" />

            <div className="w-16 h-16 rounded-2xl bg-yellow-500/20 border-2 border-yellow-400 flex items-center justify-center mx-auto mb-4 shadow-[0_0_20px_rgba(234,179,8,0.5)]">
              <Award className="w-9 h-9 text-yellow-300" />
            </div>

            <h2 className="text-2xl sm:text-3xl font-black text-white uppercase tracking-wider mb-5">
              All 3 seals shattered!
            </h2>

            <div className="bg-black/60 rounded-xl p-3 mb-6 border border-white/10 flex items-center justify-around text-xs">
              <div>
                <span className="text-gray-400 block">Seals Broken</span>
                <span className="text-base font-black text-yellow-300">3 / 3</span>
              </div>
              <div className="w-px h-8 bg-white/10" />
              <div>
                <span className="text-gray-400 block">Lives Left</span>
                <span className="text-base font-black text-rose-400">{lives} / 3</span>
              </div>
            </div>

            <button
              onClick={handleFinishVictory}
              className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-yellow-500 via-amber-500 to-orange-500 text-black font-black text-base uppercase tracking-wider shadow-[0_0_25px_rgba(245,158,11,0.6)] hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-2"
            >
              <Zap className="w-5 h-5 text-black" />
              {isTestMode ? 'Back to Test Lab' : 'Continue Fight'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
