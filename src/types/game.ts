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
    maxHp?: StatModifier; 
    time?: StatModifier;
    timeFactor?: number;    // e.g., 1.2 for +20% time
  };
  slot?: EquipmentSlot;
  maxDurability?: number;
  inShop?: boolean;
}

// An item inside the player's inventory
export interface InventoryItem {
  itemId: string;
  obtainedAt: number;
  instanceId: string;
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
  baseDamage: number;
  baseDefense: number;
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

export interface Monster {
  id?: string;
  name: string;
  description?: string; 
  emoji?: string;
  attackDamage?: number; 
  defense?: number;     
  level?: number;
  maxHp: number;
  hp: number;        // Current HP (Starting HP)
  
  //Legacy fields
  imageUrl?: string;
  damage?: number;
  xpReward?: number;
  goldReward?: number;
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
  defense: number;
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