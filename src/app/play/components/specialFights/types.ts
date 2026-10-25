import React from "react";
import { FoeDoc, Character } from "@/types/game";

export interface SpecialFightCompleteResult {
  success: boolean;
  message?: string;
  damageTaken?: number;
}

export interface SpecialFightProps {
  foe: FoeDoc | null;
  character?: Character | null;
  onComplete: (result: SpecialFightCompleteResult) => void;
  isTestMode?: boolean;
  onCloseTest?: () => void;
}

export interface SpecialFightDefinition {
  id: string;
  name: string;
  locationOrder: number;
  locationName: string;
  topicTitle: string;
  description: string;
  difficulty: "Normal" | "Challenging" | "Master";
  component: React.ComponentType<SpecialFightProps>;
}
