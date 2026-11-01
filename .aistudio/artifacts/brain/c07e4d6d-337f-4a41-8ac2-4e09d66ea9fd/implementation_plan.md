# Store Redesign & Multi-Layout System

A complete redesign of the encounter item shop to eliminate visual clutter, remove bright saturated badges and emoji spam, dramatically improve background art visibility, and provide an interactive 4-layout switcher inspired by classic game stores (*Dark Souls*, *Zelda*, *Diablo*, *Octopath Traveler*).

## User Review & Critical Decisions

> [!IMPORTANT]
> - **Confirmed Choice 1 (Layout Selection)**: An interactive 4-button layout switcher bar will be included in the store (`1. Side Ledger`, `2. Bottom Shelf`, `3. Compact Grid`, `4. Floating Dock`) so the user can test all 4 styles on the live game and pick their favorite. The selection is persisted in `localStorage`.
> - **Confirmed Choice 2 (Background Visibility)**: Each layout pairs with a tailored, low-opacity backdrop treatment (e.g., directional gradients and soft edge vignettes instead of a full dark blur blanket) ensuring the background art is fully recognizable and atmospheric.
> - **Confirmed Choice 3 (Item Inspection)**: Selecting an item in the list/shelf opens an inspector panel displaying clean stats, lore description, price, and a dignified "Purchase" button.

---

## 1. Overview & Core Concept

- **What It Does**: Replaces the bulky 3-column card grid with four minimalist, low-clutter store presentations that showcase the merchant outpost background art while providing clear, readable item inspection and purchasing.
- **Target Experience**: Evokes the restrained, immersive atmosphere of classic RPG merchant encounters (like visiting a bonfire merchant in *Dark Souls* or an apothecary in *Octopath Traveler*).
- **Key Value**: Low visual fatigue, high readability, beautiful background presence, and immediate user agency to toggle between 4 layout styles.

---

## 2. User Experience & Visual Design

### The 4 Distinct Layout Variations

```
┌────────────────────────────────────────────────────────────────────────┐
│ [1. Side Ledger]             [2. Bottom Shelf]                         │
│ ┌──────┬──────────────────┐  ┌──────────────────────────────────────┐  │
│ │List  │ Clear Background │  │       Clear Background Art           │  │
│ │+Lore │ Art              │  ├──────────────────────────────────────┤  │
│ │Panel │                  │  │ [Item 1] [Item 2] [Item 3] | Details │  │
│ └──────┴──────────────────┘  └──────────────────────────────────────┘  │
│                                                                        │
│ [3. Compact Grid]            [4. Floating Dock]                        │
│ ┌───────────────┬─────────┐  ┌──────────────────────────────────────┐  │
│ │ [][][][]      │ Detail  │  │        Clear Background Art          │  │
│ │ [][][][]      │ Card    │  │   ┌──────────────────────────────┐   │  │
│ └───────────────┴─────────┘  │   │  Docked List  |  Inspector   │   │  │
│                              │   └──────────────────────────────┘   │  │
└────────────────────────────────────────────────────────────────────────┘
```

1. **Layout 1: Side Ledger (*Dark Souls* / *Hollow Knight* Style)**
   - **Position**: Vertical shop column anchored to the left (~380px wide).
   - **Background Art**: 65% of the viewport is completely unobstructed. Soft left-to-right fade (`from-black/80 via-black/40 to-transparent`) ensures text contrast while preserving the art.
   - **Interaction**: Clean list of item rows. Selecting an item displays its lore, stat bonuses, and purchase button in the inspector card below the list.

2. **Layout 2: Bottom Shelf (*Zelda* / *Metroid* Merchant Counter)**
   - **Position**: Docked across the bottom third of the viewport.
   - **Background Art**: The entire upper 60% of the screen is an open panorama of the merchant scene. Gentle upward gradient from the bottom (`from-black/90 via-black/40 to-transparent`).
   - **Interaction**: Horizontal item shelf with scroll/paging + right-hand inspector preview card.

3. **Layout 3: Compact Grid (*Diablo* / *Final Fantasy* Inventory Slots)**
   - **Position**: Tightly grouped, elegant grid of compact item slots on the left with an adjacent detail card on the right.
   - **Background Art**: Clean, unobtrusive subtle corner vignette, letting the central scene remain crisp.
   - **Interaction**: Clicking an item slot selects it with a gold hairline border and displays the full lore card and purchase button.

4. **Layout 4: Floating Dock (*Octopath Traveler* / *Sea of Stars*)**
   - **Position**: Floating minimalist card container centered in the lower half of the screen.
   - **Background Art**: Full-bleed background viewable all around the floating dock with subtle glassmorphic backdrop.
   - **Interaction**: Left pane holds the streamlined catalog; right pane holds the item inspect and purchase action.

### Anti-Slop & Design Constitution Compliance
- **No Shiny Badges or Capsule Pills**: All prices and categories use clean typographic figures (`font-mono tabular-nums`) and subtle hairline dividers.
- **No Emoji Spam**: Replaced saturated emojis with clean SVG icons or subtle icon glyphs.
- **Restrained Color Palette**: Deep charcoal / slate surfaces (`rgba(15, 23, 42, 0.85)`), muted warm gold accent (`text-amber-300`, `border-amber-400/40`), clean white/gray text.
- **Gold Balance & Navigation**: Kept in a quiet, single-line header with "‹ Return to Location" link.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Interactive Layout Switcher**:
  - *Approach*: Provide a 4-tab switcher in the store header allowing instant live switching between the 4 layouts.
  - *Why*: Allows the user to evaluate all 4 game-store styles in the actual browser environment with their real background images and inventory.
  - *Persistence*: Stored in `localStorage.getItem('shop_layout_style')` so the chosen layout is remembered.
- **Decision 2: Light Gradient Scrims Over Heavy Blur**:
  - *Approach*: Removed `backdrop-blur-[2px]` and heavy `bg-black/75` blanket. Replaced with localized directional scrims so the background art remains sharp and recognizable.
- **Decision 3: Inspector Purchasing Pattern**:
  - *Approach*: Selecting an item loads its description, stats, and a clean "Purchase (X Gold)" button into the inspector panel. Prevents accidental purchases and gives players time to read item lore.

---

## 4. Technical Implementation

- **File**: `src/app/shop/page.tsx`
- **State**:
  - `activeLayout`: `'ledger' | 'shelf' | 'grid' | 'dock'` (defaults to `'ledger'` or persisted value).
  - `selectedItem`: `GameItem | null` (defaults to first item in store).
  - Standard shop states: `character`, `encounter`, `items`, `loading`, `msg`.
- **Purchasing Handler**: Remains wired to Firestore `characters` updates (subtract gold, arrayUnion inventory).
- **Navigation**: Clean link back to `/map?locationId=${locationId}` without `subAreaId`.
