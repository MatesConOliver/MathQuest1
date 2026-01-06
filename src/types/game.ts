// src/types/game.ts

export type ItemType = 'weapon' | 'armor' | 'potion' | 'misc';
export type EquipmentSlot = 'mainHand' | 'offHand' | 'armor' | 'head';

export interface StatModifier {
  flat?: number; // e.g., +5
  mult?: number; // e.g., 1.5 (which means +50%)
}

// The "template" of an item in the shop
export interface GameItem {
  id: string;
  name: string;
  description: string;
  type: ItemType;
  price: number;
  imageUrl?: string;   
  stats?: {
    a?: number;
    b?: number; 
    c?: number; 
    d?: number;
    xBonus?: number;
    damage?: { 
        mult?: number;
    };
    heal?: StatModifier;   
    maxHp?: StatModifier; 
    time?: StatModifier;
  };
  slot?: EquipmentSlot;
  maxDurability?: number;
  inShop?: boolean;
}

export interface InventoryItem {
  itemId: string;
  obtainedAt: number;
  instanceId: string;
  durability?: number;    
  maxDurability?: number; 
}

export interface CharacterStats {
  a: number; // Coefficient for x^3 (Unlocks Lvl 50)
  b: number; // Coefficient for x^2 (Unlocks Lvl 20)
  c: number; // Coefficient for x   (Linear)
  d: number; // Constant term
}

export interface Character {
  ownerUid: string;
  name: string;
  className: string;
  level: number;
  xp: number;
  gold: number;
  maxHp: number;
  hp: number;
  stats: CharacterStats; 
  unspentPoints: number;
  inventory: InventoryItem[]; 
  equipment: {
    mainHand: string | null;
    offHand: string | null;
    armor: string | null;
    head: string | null;
  };
  createdAt?: any;
  updatedAt?: any;
}

export interface Monster {
  id?: string;
  name: string;
  description?: string; 
  emoji?: string;
  attackDamage?: number; 
  level?: number;
  maxHp: number;
  hp: number;     
}

export interface Question {
  id: string;
  text: string;
  answer: number;
  difficulty: number;
  packId?: string;
  order?: number;
  timeLimit?: number;
}

export type QuestionDoc = {
  id?: string;
  title?: string;
  promptType?: "text" | "latex" | "image";
  promptText?: string;
  promptLatex?: string;
  promptImageUrl?: string;
  choices: string[];
  choiceType?: "text" | "latex";
  correctIndex: number;
  rewardXp: number;
  rewardGold: number;
  difficulty?: number;
  tags: string[];
  packId?: string; 
  order?: number; 
  timeLimit: number;
  imageUrl?: string;
};

export type FoeDoc = {
  id?: string;
  name: string;
  maxHp: number;
  attackDamage: number;
  imageUrl?: string;
};

export type GameLocation = {
  id?: string;
  name: string;
  description: string;
  order: number; // To sort them (1. Forest, 2. Caves...)
};

export type EncounterDoc = {
  id?: string;
  title: string;
  description?: string;
  locationId: string;
  foeId: string;
  foes?: string[];
  questionTag: string; //legacy
  questionTags?: string[];
  damagePerCorrect?: number;
  winRewardXp?: number;
  winRewardGold?: number;
  timeMultiplier?: number;
  winRewardItems?: string[];
  shuffleQuestions?: boolean; 
  imageUrl?: string;         
  emoji?: string;            
};