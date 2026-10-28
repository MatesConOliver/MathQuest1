export interface SpriteChoice {
  id: string;
  name: string;
  type: 'asset' | 'emoji' | 'procedural' | 'character' | 'custom';
  path?: string;
  emoji?: string;
  previewUrl?: string;
  description?: string;
}

export interface Loc2SpriteConfig {
  background: SpriteChoice;
  dais: SpriteChoice;
  platformSum: SpriteChoice;
  platformProduct: SpriteChoice;
  owl: SpriteChoice;
  foe: SpriteChoice;
}

export const LOC2_AVAILABLE_SPRITES = {
  background: [
    {
      id: 'summit_backdrop_clean',
      name: 'Summit Backdrop (Clean Natural Plateau)',
      type: 'asset' as const,
      path: '/Assets/Location specific/location 2/summit_backdrop.jpg',
      previewUrl: '/Assets/Location specific/location 2/summit_backdrop.jpg',
      description: 'Expansive flat snowy plateau leading toward the distant summit crest.',
    },
    {
      id: 'new_summit_asset',
      name: 'New Summit Asset (PNG)',
      type: 'asset' as const,
      path: '/Assets/Location specific/location 2/new summit.png',
      previewUrl: '/Assets/Location specific/location 2/new summit.png',
      description: 'Mountain ridge version saved under location 2.',
    },
    {
      id: 'firebase_summit',
      name: 'Original Firebase Summit Image',
      type: 'asset' as const,
      path: 'https://firebasestorage.googleapis.com/v0/b/pokematicos.firebasestorage.app/o/The_Primordial_Equation_Function_Range%2Fnew%20summit.png?alt=media&token=46be1be9-cdba-449d-b454-b4ece96efe72',
      previewUrl: 'https://firebasestorage.googleapis.com/v0/b/pokematicos.firebasestorage.app/o/The_Primordial_Equation_Function_Range%2Fnew%20summit.png?alt=media&token=46be1be9-cdba-449d-b454-b4ece96efe72',
      description: 'Original summit reference image from Firebase storage.',
    },
    {
      id: 'procedural_sky',
      name: 'Procedural Twilight Mountain',
      type: 'procedural' as const,
      description: 'Procedurally drawn canvas twilight sky and snowy horizon.',
    },
  ],

  dais: [
    {
      id: 'step_dais_asset',
      name: 'Celestial Channel Dais (Asset)',
      type: 'asset' as const,
      path: '/Assets/Location specific/location 2/step_dais.png',
      previewUrl: '/Assets/Location specific/location 2/step_dais.png',
      description: 'Circular runic stepping platform that channels altar lasers.',
    },
    {
      id: 'procedural_dais',
      name: 'Procedural Arcane Pad',
      type: 'procedural' as const,
      description: 'Dynamic glowing cyan magic circle drawn on canvas.',
    },
  ],

  platformSum: [
    {
      id: 'pedestal_sum_asset',
      name: 'Sum Altar Platform (∑ αᵢ Asset)',
      type: 'asset' as const,
      path: '/Assets/Location specific/location 2/pedestal_sum.png',
      previewUrl: '/Assets/Location specific/location 2/pedestal_sum.png',
      description: 'Wide flat stone platform engraved with ∑ αᵢ.',
    },
    {
      id: 'pedestal_generic_asset',
      name: 'Classic Stone Altar (Asset)',
      type: 'asset' as const,
      path: '/Assets/Location specific/location 2/pedestal.jpg',
      previewUrl: '/Assets/Location specific/location 2/pedestal.jpg',
      description: 'Original stone pedestal asset.',
    },
    {
      id: 'procedural_sum_platform',
      name: 'Procedural Stone Platform',
      type: 'procedural' as const,
      description: 'Clean procedural 3D carved altar with gold text.',
    },
  ],

  platformProduct: [
    {
      id: 'pedestal_product_asset',
      name: 'Product Altar Platform (∏ αᵢ Asset)',
      type: 'asset' as const,
      path: '/Assets/Location specific/location 2/pedestal_product.png',
      previewUrl: '/Assets/Location specific/location 2/pedestal_product.png',
      description: 'Wide flat stone platform engraved with ∏ αᵢ.',
    },
    {
      id: 'pedestal_generic_product',
      name: 'Classic Stone Altar (Asset)',
      type: 'asset' as const,
      path: '/Assets/Location specific/location 2/pedestal.jpg',
      previewUrl: '/Assets/Location specific/location 2/pedestal.jpg',
      description: 'Original stone pedestal asset.',
    },
    {
      id: 'procedural_product_platform',
      name: 'Procedural Stone Platform',
      type: 'procedural' as const,
      description: 'Clean procedural 3D carved altar with gold text.',
    },
  ],

  owl: [
    {
      id: 'owl_emoji_opaque',
      name: 'Opaque Owl Emoji 🦉 (Default)',
      type: 'emoji' as const,
      emoji: '🦉',
      description: 'Crisp, 100% completely opaque owl emoji with solid backing.',
    },
    {
      id: 'owl_sprite_asset',
      name: 'RPG Owl Character Asset',
      type: 'asset' as const,
      path: '/Assets/Location specific/location 2/owl_sprite.png',
      previewUrl: '/Assets/Location specific/location 2/owl_sprite.png',
      description: 'Rendered pixel/digital art owl sprite asset.',
    },
    {
      id: 'character_avatar',
      name: 'Current Player Avatar',
      type: 'character' as const,
      description: 'Uses the active character portrait from the player profile.',
    },
  ],

  foe: [
    {
      id: 'foe_emoji_default',
      name: 'Foe Emoji (Default)',
      type: 'emoji' as const,
      emoji: '👹',
      description: 'Uses the foe\'s defined emoji (e.g. 👹) rendered 100% opaque.',
    },
    {
      id: 'foe_image_asset',
      name: 'Foe Database Image',
      type: 'asset' as const,
      path: '',
      description: 'Uses the foe\'s high-resolution illustration from the database.',
    },
  ],
};

export const DEFAULT_LOC2_SPRITES: Loc2SpriteConfig = {
  background: LOC2_AVAILABLE_SPRITES.background[0],
  dais: LOC2_AVAILABLE_SPRITES.dais[0],
  platformSum: LOC2_AVAILABLE_SPRITES.platformSum[0],
  platformProduct: LOC2_AVAILABLE_SPRITES.platformProduct[0],
  owl: LOC2_AVAILABLE_SPRITES.owl[0], // Defaulting to emoji!
  foe: LOC2_AVAILABLE_SPRITES.foe[0], // Defaulting to emoji!
};

const STORAGE_KEY = 'mq_special_fight_loc2_sprites';

export function getLoc2SpriteConfig(): Loc2SpriteConfig {
  if (typeof window === 'undefined') {
    return DEFAULT_LOC2_SPRITES;
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_LOC2_SPRITES;
    const parsed = JSON.parse(raw);
    return {
      background: parsed.background || DEFAULT_LOC2_SPRITES.background,
      dais: parsed.dais || DEFAULT_LOC2_SPRITES.dais,
      platformSum: parsed.platformSum || DEFAULT_LOC2_SPRITES.platformSum,
      platformProduct: parsed.platformProduct || DEFAULT_LOC2_SPRITES.platformProduct,
      owl: parsed.owl || DEFAULT_LOC2_SPRITES.owl,
      foe: parsed.foe || DEFAULT_LOC2_SPRITES.foe,
    };
  } catch {
    return DEFAULT_LOC2_SPRITES;
  }
}

export function saveLoc2SpriteConfig(config: Loc2SpriteConfig): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    window.dispatchEvent(new CustomEvent('specialFightSpritesUpdated', { detail: config }));
  } catch (err) {
    console.error('Failed to save special fight sprite config', err);
  }
}

export function resetLoc2SpriteConfig(): Loc2SpriteConfig {
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem(STORAGE_KEY);
      window.dispatchEvent(new CustomEvent('specialFightSpritesUpdated', { detail: DEFAULT_LOC2_SPRITES }));
    } catch {}
  }
  return DEFAULT_LOC2_SPRITES;
}
