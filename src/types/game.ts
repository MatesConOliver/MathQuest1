
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

export interface CharacterSkills {
  algebra: number;
  functions: number;
  geometry: number;
  probabilityAndStatistics: number;
  calculus: number;
}

export interface Character {
  ownerUid: string;
  name: string;
  level: number;
  xp: number;
  gold: number;
  maxHp: number;
  hp: number;
  stats: CharacterStats;
  skills: CharacterSkills;
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
  completedStoryEvents: string[]; // List of IDs like ["intro_01", "chapter_1_done"]
  storyFlags: string[]; // e.g., ["DEFEATED_GOBLIN_KING"]
  unlockedContinents: string[];   // List of IDs like ["cont_1", "cont_2"]
  encounterWins: { [encounterId: string]: number };
  imageUrl?: string;
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
  id:string;
  text: string;
  answer: number;
  difficulty: number;
  packId?: string;
  order?: number;
  timeLimit?: number;
}

// A block of content (text, latex, or image)
export interface ContentBlock {
    type: 'text' | 'latex' | 'image';
    value: string;
}

// A single choice in a structured question, containing multiple content blocks
export interface StructuredChoice {
    content: ContentBlock[];
}

export type QuestionDoc = {
  id?: string;
  title?: string;
  
  // New structured content fields
  promptContent?: ContentBlock[]; 
  choicesContent?: StructuredChoice[];

  // --- LEGACY FIELDS (for backward compatibility) ---
  promptType?: "text" | "latex" | "image";
  promptText?: string; 
  promptLatex?: string;
  promptImageUrl?: string;
  choices?: string[]; 

  choiceType?: "text" | "latex";
  correctIndex: number;
  rewardXp?: number;
  rewardGold?: number;
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
  description?: string;
  emoji?: string;
  maxHp: number;
  attackDamage: number;
  imageUrl?: string;
};

export type GameLocation = {
  id: string;
  name: string;
  description: string;
  order: number; // To sort them (1. Forest, 2. Caves...)
  imageUrl?: string;
  unlockRequirements?: {
    storyFlags?: string[];
    skills?: Partial<CharacterSkills>;
  };
};

export type SubArea = {
  id: string;
  locationId: string; // Foreign key to the 'locations' collection
  name: string;
  description: string;
  order: number; // To order sub-areas within a location
  imageUrl?: string;
  unlockRequirements?: {
    storyFlags?: string[]; // e.g., ["DEFEATED_GOBLIN_KING"]
    skills?: Partial<CharacterSkills>; // e.g., { algebra: 10 }
  };
};

export type EncounterDoc = {
  id?: string;
  title: string;
  description?: string;
  order?: number;
  subAreaId: string; // Foreign key to the 'subAreas' collection
  locationId: string; // Legacy foreign key
  foeId: string;
  foes?: string[];
  questionTag: string; //legacy
  questionTags?: string[];
  damagePerCorrect?: number;
  winRewardXp?: number;
  winRewardGold?: number;
  winRewardSkills?: Partial<CharacterSkills>;
  timeMultiplier?: number;
  winRewardItems?: string[];
  winRewardStoryFlag?: string; // Story flag to grant on victory
  shuffleQuestions?: boolean;
  imageUrl?: string;
  emoji?: string;
};

export type UnlockedSubArea = {
  unlockedAt: any; // Using 'any' for Firebase ServerTimestamp
}

// =========================================
// 📖 STORY ENGINE TYPES
// =========================================

export type StoryTrigger =
  | "ON_LOGIN"           // Plays immediately when opening the game
  | "ON_FIRST_MAP_ENTER" // Plays when the player clicks the map for the first time
  | "ON_ENTER_MAP"       // Plays when entering a specific map/continent
  | "ON_VICTORY"         // Plays after winning a specific encounter
  | "ON_DEFEAT"          // Plays after losing a specific encounter
  | "ON_LEVEL_UP"       // Plays when reaching a specific level
  | "ON_OBJECT_CONDITIONS"; // Plays when certain object conditions are met, for example, retrieving all pieces of a core or finding a key

export interface StoryEvent {
  id: string;            // Unique ID (e.g., "intro_01")
  title: string;         // Internal name
  triggerType: StoryTrigger;
  triggerCondition: string; // The ID of the thing that triggers it (e.g., "encounter_rat_king")

  // The actual visual novel sequence
  scenes: StoryScene[];

  // What happens when the story finishes?
  rewards?: {
    xp?: number;
    gold?: number;
    unlockMapId?: string; // Unlocks a new continent
    unlockEncounterId?: string; // Unlocks a new fight
    storyFlag?: string; // a flag to add to the character's storyFlags array
  };

  // Is it repeatable? Usually stories play once.
  oneTime: boolean;
}

export type SceneCommand = "PROMPT_NAME";

export interface StoryScene {
  id: string;
  speakerName?: string;    // e.g., "Wise Wizard"
  speakerSprite?: string;  // URL to image
  text: string;            // "Welcome to the world of Math!"
  backgroundUrl?: string;  // URL to background
  musicUrl?: string;       // URL to background music
  videoUrl?: string;       // URL to a video that will play instead of background/sprite
  loopVideo?: boolean;   // Should the video loop?
  fadeIn?: boolean;
  fadeOut?: boolean;
  command?: SceneCommand;

  // Interaction (Simple Version)
  choices?: {
    text: string;          // "I am ready!"
    nextSceneId: string;   // Jumps to specific scene
  }[];

  // If no choices, where does the "Next" button go?
  nextSceneId?: string | "END";
}
