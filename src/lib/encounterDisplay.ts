import { EncounterDoc, EncounterWave, FoeDoc } from '@/types/game';

/**
 * Returns the ordered wave definitions for an encounter, falling back cleanly
 * to legacy `foes` arrays or a single `foeId`.
 */
export function getEncounterWaveConfigs(
  enc: Partial<EncounterDoc> | null | undefined
): EncounterWave[] {
  if (!enc || enc.encounterType === 'shop') return [];

  if (Array.isArray(enc.waves) && enc.waves.length > 0) {
    return enc.waves
      .filter((w) => w && typeof w.foeId === 'string' && w.foeId.trim().length > 0)
      .map((w) => ({
        foeId: w.foeId.trim(),
        ...(Array.isArray(w.questionTags) && w.questionTags.length > 0
          ? { questionTags: w.questionTags.map((t) => t.trim()).filter(Boolean) }
          : {}),
      }));
  }

  if (Array.isArray(enc.foes) && enc.foes.length > 0) {
    return enc.foes
      .map((id) => (typeof id === 'string' ? id.trim() : ''))
      .filter(Boolean)
      .map((foeId) => ({ foeId }));
  }

  if (typeof enc.foeId === 'string' && enc.foeId.trim()) {
    return [{ foeId: enc.foeId.trim() }];
  }

  return [];
}

/**
 * Returns the Wave 1 / primary foe ID for an encounter.
 */
export function getPrimaryFoeId(
  enc: Partial<EncounterDoc> | null | undefined
): string {
  return getEncounterWaveConfigs(enc)[0]?.foeId || '';
}

/**
 * Resolves display metadata for an encounter. Any non-empty encounter field acts
 * as an override; blank fields inherit automatically from the Wave 1 foe.
 */
export function resolveEncounterDisplay(
  enc: Partial<EncounterDoc> | null | undefined,
  primaryFoe?: Partial<FoeDoc> | null
) {
  const isShop = enc?.encounterType === 'shop';

  const title =
    enc?.title?.trim() ||
    (!isShop ? primaryFoe?.name?.trim() : '') ||
    (isShop ? 'Merchant Shop' : 'Untitled Encounter');

  const description =
    enc?.description?.trim() ||
    (!isShop ? primaryFoe?.description?.trim() : '') ||
    '';

  const imageUrl =
    enc?.imageUrl?.trim() ||
    (!isShop ? primaryFoe?.imageUrl?.trim() : '') ||
    '';

  const emoji =
    enc?.emoji?.trim() ||
    (!isShop ? primaryFoe?.emoji?.trim() : '') ||
    (isShop ? '🏪' : '👹');

  return { title, description, imageUrl, emoji };
}

/**
 * Sanitizes a Foe ID string into kebab-case (`[a-z0-9_-]`).
 */
export function sanitizeFoeId(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Generates a unique kebab-case Foe ID from a foe's display name.
 */
export function generateUniqueFoeId(
  name: string,
  takenIds: Set<string> | string[],
  excludeId?: string
): string {
  const taken = takenIds instanceof Set ? takenIds : new Set(takenIds);
  const base = sanitizeFoeId(name) || 'foe';
  if (!taken.has(base) || base === excludeId) return base;

  let suffix = 2;
  while (taken.has(`${base}-${suffix}`) && `${base}-${suffix}` !== excludeId) {
    suffix++;
  }
  return `${base}-${suffix}`;
}
