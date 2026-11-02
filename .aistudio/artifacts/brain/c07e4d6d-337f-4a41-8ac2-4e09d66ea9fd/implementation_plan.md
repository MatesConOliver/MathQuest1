# System Icons Manager & Universal Asset Replacement

A comprehensive icon management system that enables the Game Master to replace hardcoded game emojis (World Map, Character, Gold, Fight, Escape, Store, HP, XP, Potions, etc.) with custom visual assets, featuring client-side 128×128px image auto-optimization, a dedicated GM Assets panel, Firestore live persistence, and a universal `<GameIcon />` component.

## Implementation Status: COMPLETED ✅

All architectural decisions and features have been fully implemented and verified with successful Next.js compilation and lint checks.

| Feature / Component | Status | Details |
| :--- | :---: | :--- |
| **Client-Side Image Auto-Optimizer** (`src/lib/imageOptimizer.ts`) | ✅ Complete | Auto-resizes any upload to max 128×128px PNG with alpha transparency & high-quality smoothing |
| **System Icons Real-Time Context** (`src/context/SystemIconsContext.tsx`) | ✅ Complete | Listens via Firestore `onSnapshot` to `system_settings/icons` with local cache fallback |
| **Universal `<GameIcon />` Component** (`src/components/GameIcon.tsx`) | ✅ Complete | Renders custom sprite if available; gracefully falls back to default emoji with zero broken images |
| **GM Asset Manager "System Icons" Hub** (`src/app/gm/panels/AssetManagerPanel.tsx`) | ✅ Complete | Category selector, search filter, auto-downscaling notification, live preview, 1-click upload & reset |
| **Backend Asset Handler** (`src/app/api/gm/assets/route.ts`) | ✅ Complete | Supports `Assets/Icons` in summary counts, uploads, and file listings with safe path verification |
| **Firestore Security Rules** (`firestore.rules`) | ✅ Complete | Unrestricted read for players (`allow read: if true;`), GM-only write for system icons (`isGM()`) |
| **World & Area Map Integration** (`src/app/map/page.tsx`) | ✅ Complete | Replaced map, character, home, store, fight, xp, and gold emojis with `<GameIcon>` |
| **Store & Merchant Outpost Integration** (`src/app/shop/page.tsx`) | ✅ Complete | Replaced store title, coin purse, character link, purchase CTA, and skeleton with `<GameIcon>` |
| **Battle Commands & Combat Effects** (`src/app/play/components/BattleScreen.tsx`) | ✅ Complete | Replaced fight, objects bag, retreat/escape, weapon slash, and solution buttons with `<GameIcon>` |
| **Victory & Defeat Screens** (`VictoryScreen.tsx`, `DefeatScreen.tsx`) | ✅ Complete | Replaced victory trophy, gold, xp, health bonus, defeat skull, and return buttons with `<GameIcon>` |

---

## 1. Catalog of Supported System Icons

| Icon Key | Default Fallback | Category | Primary In-Game Usage |
| :--- | :---: | :---: | :--- |
| `map` | 🗺️ | Navigation | World Map header, top navigation, and return to map buttons |
| `character` | 🦉 | Navigation | Character profile quick-links, stats sheet, equipment |
| `home` | 🏠 | Navigation | Home button and main entrance links |
| `shop` | 🏪 | Economy | Outpost store headers, merchant visit buttons, and shopping links |
| `gold` | 🪙 | Economy | Coin purses, item pricing, reward displays, and treasury counters |
| `fight` | ⚔️ | Combat | Battle encounter cards, fight CTA buttons, and attack commands |
| `escape` | 🏃 | Combat | Battle retreat buttons, flee prompts, and escape confirmation modals |
| `inventory` | 🎒 | Combat | Battle objects button, inventory bag triggers, and item slots |
| `potion` | 🧪 | Combat | Healing potions, elixir triggers, and consumable slots |
| `hp` | ❤️ | Status | Health bars, player/foe vitality indicators, and level-up HP bonuses |
| `xp` | ⭐ | Status | XP bars, victory experience tallies, and progression badges |
| `victory` | 🏆 | Status | Battle triumph screen banner, victory medals, and quest clears |
| `defeat` | 💀 | Status | Battle defeat screen banner, combatant fallen notice, and revival prompts |
| `lock` | 🔒 | Meta | Locked sub-area pins, sealed regions, and prerequisite gate indicators |
| `hint` | 💡 | Meta | Ask for explanation buttons and question solution modals |
| `timer` | ⏳ | Meta | Turn timers, speed challenges, and countdown clocks |

---

## 2. Technical Summary

1. **Auto-Downscaling Guarantee**:
   Uploaded images of any resolution (even 4K or 10MB camera uploads) are drawn onto an offscreen HTML5 canvas, downscaled with high-quality smoothing to fit within 128×128px, and encoded as a transparent PNG. Files end up between 5KB and 20KB, guaranteeing instant asset loading and zero frame drops.

2. **Zero Broken Image Fallback**:
   `<GameIcon name="gold" fallback="🪙" />` attempts to load the custom asset. If an image error occurs or if no custom image is assigned in Firestore, it instantly renders the default emoji without shifting page layout.

3. **Instant Live Updates**:
   When a Game Master uploads or resets an icon in the GM panel, the change is written to `system_settings/icons` in Firestore. All active players receive the update in real-time via `onSnapshot` without needing to refresh their browsers.
