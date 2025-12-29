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
    damage?: StatModifier;  // replacing number
    defense?: StatModifier; // replacing number
    heal?: StatModifier;    // replacing number
    
    // New: Time Multiplier for Wands
    timeFactor?: number;    // e.g., 1.2 for +20% time
  };
  slot?: EquipmentSlot;
}

// An item inside the player's inventory
export interface InventoryItem {
  itemId: string;
  obtainedAt: number;
  instanceId: string; // 👈 Kept as required string, as per your file
  // 👇 New Durability Fields
  durability?: number;    
  maxDurability?: number; 
}

export interface Character {
  ownerUid: string;
  name: string;
  className: string;
  level: number;
  xp: number;
  gold: number;
  maxHp: number;
  inventory: InventoryItem[]; 
  equipment: {
    mainHand: string | null;
    offHand: string | null; // 👈 ADDED THIS (Fixes your TS error)
    armor: string | null;
    head: string | null;
  };
  createdAt?: any;
  updatedAt?: any;
}

// ... (Rest of the file: Monster, Question, QuestionDoc, FoeDoc, EncounterDoc) ...
// (You can leave the rest exactly as you have it)
export interface Monster {
  id: string;
  name: string;
  level: number;
  maxHp: number;
  damage: number;
  xpReward: number;
  goldReward: number;
}

export interface Question {
  id: string;
  text: string;
  answer: number;
  difficulty: number;
  packId?: string;
  order?: number;
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
};

export type FoeDoc = {
  id?: string;
  name: string;
  maxHp: number;
  attackDamage: number;
};

export type EncounterDoc = {
  id?: string;
  title: string;
  foeId: string;
  questionTag: string;
  damagePerCorrect: number;
  winRewardXp: number;
  winRewardGold: number;
  timeLimitSeconds?: number;
};