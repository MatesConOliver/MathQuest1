/**
 * MathQuest Asset Taxonomy Configuration
 * 
 * Directory Structure:
 * Assets/
 *   ├── Location specific/
 *   │     ├── location 1/
 *   │     ├── location 2/
 *   │     └── ... location 16/
 *   └── General/
 *         ├── gear/
 *         ├── consumables/
 *         └── others/
 */

export const ASSET_CATEGORIES = {
  LOCATION_SPECIFIC: 'Location specific',
  GENERAL: 'General',
} as const;

export const GENERAL_SUBFOLDERS = ['gear', 'consumables', 'others'] as const;

export const TOTAL_LOCATIONS = 16;

export function getLocationAssetPath(locationIndex: number, filename?: string): string {
  const base = `/Assets/Location specific/location ${locationIndex}`;
  return filename ? `${base}/${filename}` : base;
}

export function getGeneralAssetPath(subfolder: 'gear' | 'consumables' | 'others', filename?: string): string {
  const base = `/Assets/General/${subfolder}`;
  return filename ? `${base}/${filename}` : base;
}

// Pre-defined sprite assets for Location 2 ("Vieta's Arcane Altar")
export const LOCATION_2_ASSETS = {
  SUMMIT_BACKDROP: '/Assets/Location specific/location 2/summit_backdrop.jpg',
  PEDESTAL: '/Assets/Location specific/location 2/pedestal.jpg',
  RUNE_TABLET: '/Assets/Location specific/location 2/rune_tablet.jpg',
} as const;
