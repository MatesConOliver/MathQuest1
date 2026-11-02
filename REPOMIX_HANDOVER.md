# MathQuest — Project Handover & Architecture Document

This document serves as the master context and handover reference for generating a clean **Repomix** package and bootstrapping a new AI chat session.

---

## 1. Project Overview & Identity

- **Name**: MathQuest
- **Framework**: Next.js 14+ (App Router), React 18, TypeScript, Tailwind CSS
- **Backend & Database**: Firebase Firestore, Firebase Authentication, Firebase Storage
- **Runtime Environment**: Containerized Node.js (deployed on Google Cloud Run)
- **Primary Concept**: An educational RPG where players navigate an overland world map, explore 16 unique thematic regions, enter subareas, battle mathematical foes with turn-based math questions, earn gold and experience, purchase gear in shops, and progress through scripted story events.

---

## 2. Critical Security & Identity Rules (DO NOT CHANGE)

### The GM (Game Master / Admin) Account
- **Strictly ONLY ONE admin account exists**:
  ```
  oliveru1996@gmail.com
  ```
- **Student / Player Accounts**:
  ```
  oliverozcariz@britanico-aragon.edu  <--- STUDENT / PLAYER ONLY. NEVER A GM.
  ```
- **Rule**: `oliverozcariz@britanico-aragon.edu` must **NEVER** be granted GM privileges, admin flags, or Firestore rule write permissions for game settings, questions, foes, stories, or items.
- If a user signed in as `oliverozcariz@britanico-aragon.edu` attempts to access `/gm` or upload assets/sprites, permission rejection is the intended behavior. To perform GM operations, the user must log in as `oliveru1996@gmail.com`.

---

## 3. Recently Implemented Features & Bug Fixes

### A. Store Redesign (Option 3 — Compact Grid)
- **Path**: `src/app/shop/page.tsx`
- Replaced the cluttered layout with a clean, low-clutter compact grid.
- High-visibility background image: subtle dark overlay (`bg-slate-950/70`) keeps the store backdrop artwork clearly visible.
- Left side: 2-column compact grid of items with rarity badges, icon sprites, and price in gold.
- Right side: Dedicated inspection & purchase detail panel that displays full stats, description, level requirement, and the "Purchase" button.
- Clean typography and zero emoji clutter.

### B. Map & Navigation Fixes
- **Return to World Map**: Fixed navigation state so clicking "Return to World Map" from locations, shops, or encounters returns on a **single click** without needing to press twice.
- **Subarea Pins**: Map pins on subarea view display **only the pin name**; verbose descriptions are omitted from the map view to keep pins crisp and clean.

### C. System Icons & Custom Sprite Replacement Hub
- **Paths**:
  - `src/app/gm/panels/AssetManagerPanel.tsx`
  - `src/context/SystemIconsContext.tsx`
  - `src/components/GameIcon.tsx`
  - `src/lib/imageOptimizer.ts`
- **Features**:
  - Replaces default emojis across the game (world map, character, home, store, gold, fight buttons, escape/flee, health, xp, victory, defeat, hint, timer, lock, potions, backpack) with custom uploaded sprites.
  - **Comprehensive UI-wide Adoption**: All hardcoded emojis in the Lobby, World Map, Character Sheet, Store Grid, Battle Intro, Combat Arena (Turn Timer, Health Bars, Victory/Defeat modals, Consumables, Objects & Equipment), and Solution/Report modals now utilize `<GameIcon name="..." />` so uploaded sprite customizations immediately propagate game-wide with 100% consistency.
  - **Client-Side Auto-Downscaling**: All uploaded icon images are automatically scaled down client-side via HTML5 Canvas to max **128×128px PNG** with alpha transparency before saving, guaranteeing tiny payload sizes (~4KB–12KB) and smooth 60fps rendering.
  - **Infallible Storage Fallback**: Handles Cloud Run & serverless read-only filesystem (`EROFS`). If local filesystem write fails and Firebase Storage is restricted, it seamlessly uses a compact Base64 Data URL fallback so icon replacement never fails.
  - Real-time synchronization via Firestore `system_settings/icons` document + `locations/system_icons` fallback + `localStorage` caching + character document backup.

### D. Firebase Security Rules Hardened
- **`firestore.rules`**: Restricts `isGM()` exclusively to `oliveru1996@gmail.com`. Protects `system_settings`, `settings`, `questions`, `foes`, `items`, `stories`, `locations`, `subAreas`.
- **`storage.rules`**: Restricts `/Assets/**` upload writes strictly to `isGM()` (`oliveru1996@gmail.com`), while granting public read access so all players can load uploaded sprites.
- **In-App Rules Helper**: GM panel includes a "🛡️ Firebase Rules" modal with 1-click copyable snippets for Firestore and Storage to paste into the Firebase Console.

---

## 4. Key Directory & File Structure

```
├── .firebaserc                     # Firebase project ID (mathquest1-b6223)
├── firebase.json                   # Functions, Firestore rules & Storage rules config
├── firestore.rules                 # Cloud Firestore security rules
├── storage.rules                   # Firebase Storage security rules
├── public/                         # Static assets
│   └── Assets/
│       ├── Icons/                  # 128x128px system icon sprites
│       ├── Location specific/      # Location 1-16 backdrops & monsters
│       └── General/                # Gear, consumables, others
├── src/
│   ├── app/
│   │   ├── page.tsx                # Game hub, auth watcher, world map routing
│   │   ├── gm/                     # Game Master suite
│   │   │   ├── page.tsx            # GM tab navigation (authorized for oliveru1996@gmail.com)
│   │   │   └── panels/
│   │   │       ├── AssetManagerPanel.tsx   # Sprite & Icon manager with 128x128 auto-optimizer
│   │   │       ├── ReportsPanel.tsx        # Bug bounty and student reports
│   │   │       ├── LoadingTipsPanel.tsx    # Random loading screen hints
│   │   │       └── ...                     # Foes, Questions, Stories, Items panels
│   │   ├── play/                   # Combat arena & special fights
│   │   ├── shop/                   # Compact grid shop
│   │   └── api/                    # Server-side Next.js routes
│   ├── components/
│   │   ├── GameIcon.tsx            # Renders custom sprite or emoji fallback
│   │   ├── StoryPlayer.tsx         # Visual novel story engine
│   │   └── ...
│   ├── context/
│   │   └── SystemIconsContext.tsx  # Centralized icon management
│   ├── lib/
│   │   ├── firebase.ts             # Firebase client SDK initialization
│   │   └── imageOptimizer.ts       # Canvas-based 128x128 downscaler
│   └── types/                      # TypeScript definitions (game.ts, etc.)
```

---

## 5. Instructions for Bootstrapping a New AI Chat Session

When starting a new conversation with Repomix:

1. Run your Repomix command to bundle the repository:
   ```bash
   npx repomix
   ```
2. In the new chat turn, provide `repomix-output.xml` (or output file) and state:
   - "This is MathQuest. Refer to `REPOMIX_HANDOVER.md` for context."
   - "Remember: `oliveru1996@gmail.com` is the ONLY GM/admin. `oliverozcariz@britanico-aragon.edu` is a student/player."
3. The project compiles with `npm run build` with zero errors and zero fatal linter warnings.
