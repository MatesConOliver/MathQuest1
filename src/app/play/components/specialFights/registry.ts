import { SpecialFightDefinition } from "./types";
import Loc2VietaScales from "./Loc2VietaScales";

export const SPECIAL_FIGHTS: Record<string, SpecialFightDefinition> = {
  loc2_vieta_scales: {
    id: "loc2_vieta_scales",
    name: "Vieta's Arcane Altar (Sum & Product of Roots)",
    locationOrder: 2,
    locationName: "Location 2: Caves & Underground (Functions & Quadratics)",
    topicTitle: "Topic 2: Quadratic Equations & Vieta's Properties",
    description:
      "The foe erects an impenetrable quadratic barrier. Place the two root mana stones to balance the scales of Sum and Product across 3 escalating rounds.",
    difficulty: "Normal",
    component: Loc2VietaScales,
  },
};

export const SPECIAL_FIGHTS_LIST: SpecialFightDefinition[] = Object.values(SPECIAL_FIGHTS);

export function getSpecialFightById(id?: string | null): SpecialFightDefinition | null {
  if (!id) return null;
  return SPECIAL_FIGHTS[id] || null;
}
