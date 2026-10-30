# Architecture & Implementation Plan: Tag-to-Location Curriculum Mapping

## 1. Overview
This plan establishes a clean, unified curriculum architecture connecting **Tags**, **Locations (Units 1–16)**, and **Question AI Solvers**:
1. **Locations Panel**: Each location manages its assigned curriculum tags (`assignedTags`).
2. **Global Tag Uniqueness**: A tag cannot belong to more than one location. Attempting to assign an already mapped tag to another location is prevented with a clear indicator.
3. **Unassigned Tags Pool**: A dedicated panel/section in the Locations GM manager identifies all tags discovered across questions and encounters that have not yet been assigned to any location, allowing quick assignment.
4. **Question Resolution & Strict Location Constraint**: Each question's location is resolved via its assigned tag. In both single-question generation and batch AI generation, the question's location order (1..16) is auto-detected and passed to the solver, guaranteeing curriculum constraint adherence (all prior units 1..$L$ allowed, strictly forbidding any concepts from future units $L+1$..16).
5. **Question Tag Integrity**: In the Questions Panel, questions display their mapped location badge, and a warning is displayed if a question has tags that conflict across multiple locations.

---

## 2. Proposed Changes

### A. Data Schema Updates (`src/types/game.ts`)
- Extend `GameLocation`:
  ```ts
  export type GameLocation = {
    id: string;
    name: string;
    description: string;
    order: number; // 1 to 16
    imageUrl?: string;
    pathColor?: string;
    unlockRequirements?: { ... };
    assignedTags?: string[]; // Array of unique tags associated with this unit
  };
  ```

### B. Locations GM Panel (`src/app/gm/panels/LocationsPanel.tsx`)
- **Global Tag Registry State**:
  - Scan all known tags across `questions` and `encounters`.
  - Calculate global mapping: `tagToLocationMap: Record<string, { locationId: string; locationName: string; locationOrder: number }>`.
  - Calculate `unassignedTags: string[]` (tags present in database questions/encounters that are not assigned to any location).
- **Assigned Tags Management in Location Editor**:
  - Multi-tag input/selector for the active location.
  - Quick-add chip list showing currently assigned tags with removal (✕).
  - Adding a tag already claimed by another location shows a validation alert: `"Tag '{tag}' is already assigned to Location {order}: {name}. Denied duplicate assignment."`
- **"Unassigned Tags" Tray**:
  - Prominent collapsible tray showing unassigned tags with count.
  - 1-click action to assign an unassigned tag directly to the currently editing location.
- **Location Tag Overview Summary**:
  - Visual table or list showing each of the 16 locations and their mapped tags for quick audit.

### C. Questions GM Panel (`src/app/gm/panels/QuestionsPanel.tsx`)
- **Location Resolution Helper**:
  - Given a question's `tags: string[]`, resolve its `detectedLocationOrder` and `detectedLocationName` using the location tag mappings.
  - If a question's tags belong to different locations, flag as a conflict badge (e.g. `⚠️ Conflicting Unit Tags: Loc 1 & Loc 2`).
- **Batch AI Solver Auto-Location Binding**:
  - In the Batch Solver modal, add an option: `Auto-detect Location per Question from Tags (Recommended)`.
  - When enabled, each question automatically uses its specific unit topic constraint (1..16) so the AI generates the solution using syllabus knowledge up to that unit.
  - If a question has an unassigned tag, it gracefully falls back to the manual location selected in the dropdown or Universal mode.
- **Question Card & Form Indicators**:
  - In the question list and editor, display a chip: `Unit {order}: {locationName}`.

### D. Verification & Play Mode Integration
- Verify that `SolutionModal.tsx` and `/api/questions/solve/route.ts` already receive and store the appropriate `locationOrder`.
- Ensure instant 0ms cached answer retrieval works seamlessly with the mapped location tags.

---

## 3. User Review & Feedback Points
- **Unassigned Tags**: Any new tag created during question import or editing will automatically surface in the "Unassigned Tags" tray until allocated to a location.
- **Cross-unit Tag Prevention**: Ensures complete curriculum hygiene so that a question cannot accidentally be ambiguous about which grade/unit level it belongs to.
