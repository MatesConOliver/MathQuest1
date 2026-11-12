import { InventoryItem, PkmAchievementEntry } from "@/types/game";

export const MATHQUEST_PKM_SOURCE_ID = "DP4DP";
export const ACHIEVEMENT_LOG_ITEM_ID = "achievement_log";

/**
 * Standard Ethernet / ZIP CRC-32 (0xEDB88320 reflected polynomial)
 */
export function crc32(str: string): number {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < str.length; i++) {
    const byte = str.charCodeAt(i) & 0xFF;
    crc ^= byte;
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ ((crc & 1) ? 0xEDB88320 : 0);
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

/**
 * ATM CRC-8 checksum (polynomial 0x07, init 0xFF, final XOR 0xFF, no reflection)
 */
export function crc8ATM(bytes: number[]): number {
  let crc = 0xFF;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) {
      if (crc & 0x80) {
        crc = ((crc << 1) ^ 0x07) & 0xFF;
      } else {
        crc = (crc << 1) & 0xFF;
      }
    }
  }
  return (crc ^ 0xFF) & 0xFF;
}

/**
 * Generates a deterministic, reversible 28-character Pokemáticos reward code
 * formatted as 7 groups of 4 characters: XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX
 * 
 * Payload structure (18 bytes total):
 * - Byte 0: Version (0x01)
 * - Bytes 1-4: CRC-32 hash of student's public ID (big-endian)
 * - Bytes 5-10: Source ID truncated/right-padded with spaces to 6 chars ("DP4DP ")
 * - Bytes 11-16: Activity ID truncated/right-padded with spaces to 6 chars
 * - Byte 17: CRC-8 ATM checksum of bytes 0-16
 */
export function generatePkmRewardCode(
  studentId: string,
  activityId: string,
  sourceId: string = MATHQUEST_PKM_SOURCE_ID
): string {
  const cleanStudentId = studentId.trim();
  const cleanActivityId = activityId.trim();

  // 1. Compute CRC-32 of student's Public ID
  const studentHash = crc32(cleanStudentId);

  // 2. Truncate & right-pad source and activity IDs to exactly 6 ASCII chars
  const sourcePadded = (sourceId.slice(0, 6) + "      ").slice(0, 6);
  const activityPadded = (cleanActivityId.slice(0, 6) + "      ").slice(0, 6);

  // 3. Assemble 17-byte payload
  const payload: number[] = [0x01]; // Version 1
  payload.push((studentHash >>> 24) & 0xFF);
  payload.push((studentHash >>> 16) & 0xFF);
  payload.push((studentHash >>> 8) & 0xFF);
  payload.push(studentHash & 0xFF);

  for (let i = 0; i < 6; i++) {
    payload.push(sourcePadded.charCodeAt(i));
  }
  for (let i = 0; i < 6; i++) {
    payload.push(activityPadded.charCodeAt(i));
  }

  // 4. Calculate CRC-8 checksum of first 17 bytes
  const checksum = crc8ATM(payload);
  payload.push(checksum); // 18 bytes total

  // 5. Convert 18 bytes (144-bit big-endian integer) to Base36
  let num = BigInt(0);
  const eight = BigInt(8);
  for (const b of payload) {
    num = (num << eight) | BigInt(b);
  }
  const base36 = num.toString(36).toUpperCase().padStart(28, '0');

  // 6. Format with hyphens into 7 groups of 4
  const groups = base36.match(/.{1,4}/g);
  return groups ? groups.join('-') : base36;
}

/**
 * Validates the basic shape of a Pokemáticos Public ID string.
 */
export function isValidPkmId(id: string): boolean {
  if (!id) return false;
  const trimmed = id.trim();
  return trimmed.length >= 4 && trimmed.length <= 128;
}

/**
 * Ensures the unsellable "Achievement Log" item is in the player's inventory.
 */
export function ensureAchievementLogItem(inventory: InventoryItem[] = []): InventoryItem[] {
  const hasLog = inventory.some(item => item.itemId === ACHIEVEMENT_LOG_ITEM_ID);
  if (hasLog) return inventory;

  const logItem: InventoryItem = {
    itemId: ACHIEVEMENT_LOG_ITEM_ID,
    instanceId: "achievement_log_permanent",
    obtainedAt: Date.now(),
    customData: {
      title: "Achievement Log",
    },
  };

  return [logItem, ...inventory];
}

/**
 * Recalculates all previously earned codes if a student updates their Pokemáticos Public ID.
 */
export function recalculateAllPkmCodes(
  existingAchievements: Record<string, PkmAchievementEntry> = {},
  newStudentId: string
): Record<string, PkmAchievementEntry> {
  const updated: Record<string, PkmAchievementEntry> = {};

  for (const [activityId, entry] of Object.entries(existingAchievements)) {
    if (!entry) continue;
    const newCode = generatePkmRewardCode(newStudentId, entry.activityId || activityId);
    updated[activityId] = {
      ...entry,
      code: newCode,
    };
  }

  return updated;
}

export const PKM_LEVEL_MILESTONES: Record<number, string> = {
  10: "lvl10",
  20: "20lvl",
  30: "l303l",
  40: "4lvl0",
  50: "mid100",
  60: "3rdage",
  70: "sixsev",
  80: "8lvl10",
  90: "almost",
  100: "100yay",
};

/**
 * Returns any Pokemáticos level-milestone achievements (10, 20, ..., 100)
 * that the player has reached by level but does not yet have in existingAchievements.
 */
export function getMissingLevelMilestoneAchievements(
  level: number,
  studentId: string,
  existingAchievements: Record<string, PkmAchievementEntry> = {}
): Record<string, PkmAchievementEntry> {
  const missing: Record<string, PkmAchievementEntry> = {};
  if (!studentId || !studentId.trim() || level < 10) return missing;

  const now = Date.now();
  for (const [lvlStr, activityId] of Object.entries(PKM_LEVEL_MILESTONES)) {
    const milestoneLvl = Number(lvlStr);
    if (level >= milestoneLvl && !existingAchievements[activityId]) {
      missing[activityId] = {
        activityId,
        activityName: `Level ${milestoneLvl} Milestone`,
        code: generatePkmRewardCode(studentId, activityId),
        earnedAt: now,
      };
    }
  }

  return missing;
}
