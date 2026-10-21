import { Character, CharacterSkills, GameLocation, SubArea, UnlockedSubArea } from "@/types/game";

export type UnlockStatus =
    | { locked: false }
    | { locked: true; reason: 'story'; }
    | { locked: true; reason: 'skills'; missing: { skill: keyof CharacterSkills, required: number }[] };

export function getUnlockStatus(item: GameLocation | SubArea, character: Character, unlockedSubAreas?: { [key: string]: UnlockedSubArea }): UnlockStatus {
  const reqs = item.unlockRequirements;

  // 1. Check Story Flags first (Story flags are authoritative - if GM adds or changes a flag, it must be locked)
  if (reqs?.storyFlags && reqs.storyFlags.length > 0) {
    const playerFlags = (character.storyFlags || []).map(f => typeof f === 'string' ? f.trim() : f);
    const hasAllFlags = reqs.storyFlags.every(flag => {
      const clean = typeof flag === 'string' ? flag.trim() : flag;
      return clean && playerFlags.includes(clean);
    });
    if (!hasAllFlags) {
      return { locked: true, reason: 'story' };
    }
  }

  // Handle specific sub-area direct unlocks (e.g. via an item, only if story flags are satisfied)
  if ('locationId' in item && unlockedSubAreas?.[item.id]) {
    return { locked: false };
  }

  if (!reqs) return { locked: false }; // No requirements

  // 2. If story flags are met, check skills
  if (reqs.skills) {
    const missingSkills: { skill: keyof CharacterSkills, required: number }[] = [];
    const skillOrder: (keyof CharacterSkills)[] = ['algebra', 'functions', 'geometry', 'probabilityAndStatistics', 'calculus'];
    for (const skill of skillOrder) {
      const requiredLevel = reqs.skills[skill];
      if (requiredLevel && requiredLevel > 0 && (character.skills?.[skill] ?? 0) < requiredLevel) {
        missingSkills.push({ skill, required: requiredLevel });
      }
    }
    if (missingSkills.length > 0) {
      return { locked: true, reason: 'skills', missing: missingSkills };
    }
  }

  return { locked: false };
}
