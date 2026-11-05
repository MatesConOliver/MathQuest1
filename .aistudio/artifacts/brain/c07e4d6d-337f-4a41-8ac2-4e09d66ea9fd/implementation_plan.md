# Pokemáticos (PKM) Reward Code Integration Plan

## Summary
Integrate a client-side, zero-network, deterministic achievement reward code system into MathQuest based on the canonical Pokemáticos specification (18-byte payload: Version 0x01 + 4-byte CRC-32 + 6-byte Source ID + 6-byte Activity ID + 1-byte CRC-8 ATM, encoded to 28-character Base36). Students of *Mates con Oliver* can link their Pokemáticos Public ID in a new Settings menu (PIN protected with "CBA"), earn achievement codes on designated encounter victories, and view or copy them anytime via an unsellable backpack item named **Achievement Log**.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> **Plan Revised to Incorporate Your Feedback & the Canonical Specification:**
> 1. **Warning Language**: Set strictly to English: *"This section is exclusively for math students of Mates con Oliver. It requires your Pokemáticos Public Identifier."*
> 2. **Backpack Item Name**: Named strictly **Achievement Log** (unsellable, non-breaking backpack item).
> 3. **Exact Algorithm Integrated**: Incorporates the official PKM specification (`CRC-32` student hash + 18-byte payload + `CRC-8 ATM` checksum + `Base36` 28-character format `XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX`).

- **Source Identifier**: `DP4DP` (right-padded with 1 space to 6 ASCII bytes: `"DP4DP "`).
- **Activity Identifiers**: Configurable per encounter in GM panel (e.g. `libgua`, `alg001`, or 6-character activity keys truncated/padded to 6 ASCII bytes).
- **Settings PIN Guard**: "CBA" (case-insensitive/normalized uppercase, allows all alphanumeric characters).

---

## 1. Overview & Core Concept

- **What It Does**:
  1. Students paste their Pokemáticos Public ID into MathQuest Settings (accessed via a gear icon on the main menu, protected by PIN "CBA").
  2. When the player defeats an encounter designated by the GM with a `pkmActivityId`, MathQuest deterministically computes their 28-character PKM reward code.
  3. The code is shown on the Victory Screen with a 1-click copy button, saved permanently in `characters/{uid}` under `pkmAchievements`, and accessible anytime through the unsellable **Achievement Log** in the player's backpack.
  4. If the student updates their PKM Public ID in settings, all previously earned codes automatically regenerate for the new ID so the log stays synchronized.
- **Zero Network Coupling**: MathQuest and Pokemáticos remain completely decoupled across their separate Firebase projects with zero HTTP requests or shared keys.

---

## 2. User Experience & Visual Design

### Key User Flows

```
[Main Menu] ──> [⚙️ Settings Button] ──> [Settings Modal]
                                             │
                       ┌─────────────────────┴────────────────────────┐
                       ▼                                              ▼
              [Theme: Dark / Light]                      [🎓 Pokemáticos Public ID]
                                                                      │
                                                             (Enter PIN: "CBA")
                                                                      │
                                                       [Paste Public ID & Save]
                                                                      │
                                                      [Auto-Sync All Past Codes]
```

```
[Battle Won] ──> [Is Encounter Rewardable?] ──> [Has PKM ID in Settings?]
                         │                                  │
                         ▼ (Yes)                            ▼ (Yes)
              [Generate Canonical Code] ──> [Victory Screen: Display Code & Copy Button]
                         │
                         ▼
             [Persist to Character] ──> [Ensure "Achievement Log" is in Backpack]
```

```
[Character Page] ──> [Backpack] ──> [📜 Achievement Log] ──> [Click "View Codes"]
                                                                      │
                                                                      ▼
                                                          [Achievement Codes Modal]
                                                      - Activity Name
                                                      - 28-char Code (XXXX-...-XXXX)
                                                      - 📋 Copy-to-Clipboard Button
                                                      - Date Earned
```

### Visual Identity & Theme
- **Settings Menu**: Clean, minimalist gear icon (`⚙️ Settings`) on the Main Menu (`src/app/page.tsx`), distinct from the primary game navigation cards.
- **English Caution Notice**:
  > *"Caution: This section is exclusively for math students of Mates con Oliver. It requires your Pokemáticos Public Identifier."*
- **PIN Verification**: Inline alphanumeric PIN prompt requiring `"CBA"` before revealing the editable input.
- **Backpack Item (`Achievement Log`)**:
  - Item name: **Achievement Log**.
  - Type: Quest/Special item (`canSell: false`).
  - Hover: Displays item description.
  - Click ("Use" / "View Codes"): Opens the modal listing all earned codes with copy buttons.

---

## 3. The Canonical PKM Algorithm Implementation

Implementation in `src/lib/pkm.ts`:

```typescript
// 1. Standard Ethernet CRC-32 (0xEDB88320 reflected polynomial)
function crc32(str: string): number {
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

// 2. ATM CRC-8 (polynomial 0x07, init 0xFF, final XOR 0xFF, no reflection)
function crc8ATM(bytes: number[]): number {
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

// 3. 18-Byte Payload & Base36 Formatting
export function generatePkmRewardCode(studentId: string, activityId: string): string {
  const sourcePadded = "DP4DP "; // 6 chars ASCII
  const activityPadded = (activityId.slice(0, 6) + "      ").slice(0, 6);
  const studentHash = crc32(studentId.trim());

  // Build 17 bytes
  const bytes: number[] = [0x01]; // Version 1
  bytes.push((studentHash >>> 24) & 0xFF);
  bytes.push((studentHash >>> 16) & 0xFF);
  bytes.push((studentHash >>> 8) & 0xFF);
  bytes.push(studentHash & 0xFF);
  for (let i = 0; i < 6; i++) bytes.push(sourcePadded.charCodeAt(i));
  for (let i = 0; i < 6; i++) bytes.push(activityPadded.charCodeAt(i));

  // Byte 17: CRC-8 checksum
  const checksum = crc8ATM(bytes);
  bytes.push(checksum);

  // Convert 18 bytes (144 bits) to BigInt and Base36
  let num = 0n;
  for (const b of bytes) {
    num = (num << 8n) | BigInt(b);
  }
  const base36 = num.toString(36).toUpperCase().padStart(28, '0');

  // Format as XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX
  return base36.match(/.{1,4}/g)!.join('-');
}
```

---

## 4. Technical Architecture & Data Strategy

### System Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              MATHQUEST CLIENT                               │
├─────────────────────────┬───────────────────────────┬───────────────────────┤
│    Settings Modal       │       Victory Screen      │      Character Page   │
│  (src/app/page.tsx)     │  (VictoryScreen.tsx)      │   (src/app/character) │
│                         │                           │                       │
│  - Mode (Light/Dark)    │  - XP / Gold / Loot       │  - Backpack List      │
│  - English Warning      │  - PKM Reward Banner      │  - "Achievement Log"  │
│  - PIN Guard ("CBA")    │  - 28-char Code Display   │  - Unsellable Item    │
│  - PKM Public ID Input  │  - Copy Button            │  - "View Codes" Modal │
└────────────┬────────────┴─────────────┬─────────────┴───────────┬───────────┘
             │                          │                         │
             ▼                          ▼                         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    PKM REWARD ENGINE (src/lib/pkm.ts)                       │
│                                                                             │
│  - generatePkmRewardCode(studentId, activityId): string                     │
│  - ensureAchievementLogItem(character): InventoryItem[]                     │
│  - syncAllPkmCodes(character, newStudentId): Promise<void>                  │
└───────────────────────────────────────┬─────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           FIRESTORE: characters/{uid}                       │
│                                                                             │
│  {                                                                          │
│    pkmStudentId: "user-abc123xyz456...",                                    │
│    pkmAchievements: {                                                       │
│      "libgua": {                                                            │
│        activityId: "libgua",                                                │
│        activityName: "Guardian of the Ancient Library",                     │
│        code: "04VI-FMXN-3BET-NPI7-EHB9-MLGZ-ZMBN",                          │
│        earnedAt: 1712345678000                                              │
│      }                                                                      │
│    },                                                                       │
│    inventory: [                                                             │
│      ...,                                                                   │
│      { itemId: "achievement_log", instanceId: "achievement_log_perm", ... } │
│    ]                                                                        │
│  }                                                                          │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Files to Modify

| File | Nature of Modification |
| :--- | :--- |
| `src/types/game.ts` | Add `pkmStudentId?: string;` and `pkmAchievements?: Record<string, PkmAchievementEntry>;` to `Character`; add `pkmActivityId?: string;` to `EncounterDoc`. |
| `src/lib/pkm.ts` *(new)* | Canonical PKM algorithm (CRC-32, 18-byte payload, CRC-8 ATM, Base36 conversion, hyphen formatting, code re-sync helper). |
| `src/app/page.tsx` | Add Settings modal button, Theme toggle, English caution notice, "CBA" PIN verification, and PKM Public ID input with auto-sync. |
| `src/app/gm/panels/EncountersPanel.tsx` | Add `PKM Activity ID` input (≤ 6 chars recommended or truncated) with explanatory helper text. |
| `src/app/play/hooks/useBattle.ts` | In `handleWin`, check if `currentEncounter.pkmActivityId` and `character.pkmStudentId` are present; generate code and persist into `pkmAchievements`; pass earned code to `VictoryScreen`. |
| `src/app/play/PlayClient.tsx` | Pass `earnedPkmCode` and `pkmActivityName` to `<VictoryScreen />`. |
| `src/app/play/components/VictoryScreen.tsx` | Render the PKM reward achievement box with copy button when a code is earned. |
| `src/app/character/page.tsx` | Register `achievement_log` as an unsellable item, and add the Achievements Modal listing all earned codes with copy buttons. |

---

## 6. Phased Implementation Steps (Upon Your Approval)

1. **Phase 1: Types & Core Algorithm (`src/types/game.ts` & `src/lib/pkm.ts`)**
   - Implement the exact 18-byte CRC-32 + CRC-8 Base36 generator.
   - Add automated verification checks matching the test vectors from the integration guide.

2. **Phase 2: Settings Menu on Main Page (`src/app/page.tsx`)**
   - Add a subtle gear icon button on the main page.
   - Implement Theme toggle (Light/Dark).
   - Implement the English caution message.
   - Implement the "CBA" PIN lock and PKM Public ID input.
   - If a student updates their ID, automatically regenerate and update their stored codes.

3. **Phase 3: GM Encounter Configuration (`src/app/gm/panels/EncountersPanel.tsx`)**
   - Add the `PKM Activity ID` field to the encounter editor so bosses can be tagged for rewards.

4. **Phase 4: Battle Win & Victory Screen (`useBattle.ts`, `PlayClient.tsx`, `VictoryScreen.tsx`)**
   - Generate the code on battle victory if `character.pkmStudentId` exists.
   - Render the reward banner on the Victory Screen with 1-click copy.
   - Automatically ensure the **Achievement Log** item exists in the student's backpack.

5. **Phase 5: Backpack Achievement Log (`src/app/character/page.tsx`)**
   - Define the unsellable **Achievement Log** item.
   - Clicking "Use" / "View Codes" displays the modal with all earned codes, activity names, and copy buttons.
