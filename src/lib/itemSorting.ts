import { GameItem, ItemType, EquipmentSlot } from '@/types/game';

export const CATEGORY_ORDER: ItemType[] = ['potion', 'weapon', 'armor', 'misc'];
export const SLOT_ORDER: EquipmentSlot[] = ['mainHand', 'offHand', 'armor', 'head'];

export function getCategoryRank(type: string): number {
  switch (type) {
    case 'potion': return 0;
    case 'weapon': return 1;
    case 'armor': return 2;
    case 'misc': return 3;
    default: return 4;
  }
}

export function getSlotRank(slot?: string): number {
  switch (slot) {
    case 'mainHand': return 0;
    case 'offHand': return 1;
    case 'armor': return 2;
    case 'head': return 3;
    default: return 4;
  }
}

export function getSlotLabel(slot?: string): string {
  switch (slot) {
    case 'mainHand': return 'Main Hand';
    case 'offHand': return 'Off Hand';
    case 'armor': return 'Armor';
    case 'head': return 'Head';
    default: return 'No Slot';
  }
}

export function getCategoryLabel(type: string): string {
  switch (type) {
    case 'potion': return 'Potions';
    case 'weapon': return 'Weapons';
    case 'armor': return 'Armor';
    case 'misc': return 'Miscellaneous';
    default: return 'Other';
  }
}

export function getCategoryIcon(type: string): string {
  switch (type) {
    case 'potion': return '🧪';
    case 'weapon': return '⚔️';
    case 'armor': return '🛡️';
    case 'misc': return '📦';
    default: return '✨';
  }
}

export function getSubGroupKey(item: GameItem): string {
  if (item.type === 'potion') return 'potion';
  if (item.type === 'misc') return 'misc';
  return `${item.type}_${item.slot || 'none'}`;
}

export function getSubGroupTitle(item: GameItem): string {
  if (item.type === 'potion') return 'Potions';
  if (item.type === 'misc') return 'Miscellaneous Items';
  const typeName = item.type === 'weapon' ? 'Weapons' : 'Armor';
  return `${typeName} — ${getSlotLabel(item.slot)}`;
}

/**
 * Strict Store & GM Sorting:
 * 1. Category Rank: potion (0) < weapon (1) < armor (2) < misc (3)
 * 2. Slot Rank for weapons and armor: mainHand (0) < offHand (1) < armor (2) < head (3)
 * 3. User Order within subgroup (default 1, ascending)
 * 4. Alphabetical by name (case-insensitive)
 */
export function compareStoreItems(a: GameItem, b: GameItem): number {
  // 1. Category Rank
  const catA = getCategoryRank(a.type);
  const catB = getCategoryRank(b.type);
  if (catA !== catB) return catA - catB;

  // 2. Slot Rank for weapons and armor
  if (a.type === 'weapon' || a.type === 'armor' || b.type === 'weapon' || b.type === 'armor') {
    const slotA = getSlotRank(a.slot);
    const slotB = getSlotRank(b.slot);
    if (slotA !== slotB) return slotA - slotB;
  }

  // 3. User Order within subgroup (default 1)
  const orderA = typeof a.order === 'number' && !isNaN(a.order) ? a.order : 1;
  const orderB = typeof b.order === 'number' && !isNaN(b.order) ? b.order : 1;
  if (orderA !== orderB) return orderA - orderB;

  // 4. Alphabetical by name
  return (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' });
}
