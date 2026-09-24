import { Character, CharacterSkills, GameLocation, SubArea, UnlockedSubArea } from "@/types/game";

export type UnlockStatus =
    | { locked: false }
    | { locked: true; reason: 'story'; }
    | { locked: true; reason: 'skills'; missing: { skill: keyof CharacterSkills, required: number }[] };

export function getUnlockStatus(item: GameLocation | SubArea, character: Character, unlockedSubAreas?: { [key: string]: UnlockedSubArea }): UnlockStatus {
  // Handle specific sub-area direct unlocks (e.g. via an item)
  if ('locationId' in item && unlockedSubAreas?.[item.id]) {
    return { locked: false };
  }

  const reqs = item.unlockRequirements;
  if (!reqs) return { locked: false }; // No requirements

  // 1. Check Story Flags first
  if (reqs.storyFlags && reqs.storyFlags.length > 0) {
    const hasAllFlags = reqs.storyFlags.every(flag => character.storyFlags?.includes(flag));
    if (!hasAllFlags) {
      return { locked: true, reason: 'story' };
    }
  }

  // 2. If story flags are met, check skills
  if (reqs.skills) {
    const missingSkills: { skill: keyof CharacterSkills, required: number }[] = [];
    const skillOrder: (keyof CharacterSkills)[] = ['algebra', 'functions', 'geometry', 'probabilityAndStatistics', 'calculus'];
    for (const skill of skillOrder) {
      const requiredLevel = reqs.skills[skill];
      if (requiredLevel && requiredLevel > 0 && (character.skills[skill] || 0) < requiredLevel) {
        missingSkills.push({ skill, required: requiredLevel });
      }
    }
    if (missingSkills.length > 0) {
      return { locked: true, reason: 'skills', missing: missingSkills };
    }
  }

  return { locked: false };
}
