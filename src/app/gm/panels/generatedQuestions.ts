export type GeneratedQuestion = {
  title: string;
  prompt: string;
  choices: string[];
  correctIndex: number;
  tags: string[];
  time: number;
  groupId?: string | null;
  order?: number | null;
};

// Add a batch here, then upload it from GM Dashboard > Questions.
export const generatedQuestions: GeneratedQuestion[] = [
  
];
