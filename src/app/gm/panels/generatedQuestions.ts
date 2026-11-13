export type GeneratedQuestion = {
  title: string;
  prompt: string;
  choices: string[];
  correctIndex: number;
  tags: string[];
  time: number; // Time limit in seconds (e.g., 30, 60, 120)
  groupId?: string | null; // Optional: links sub-questions of the same multi-part exercise
  order?: number | null; // Optional: sequence order within a group (e.g., 1, 2, 3)
};

// Add a batch here, then upload it from GM Dashboard > Questions.
export const generatedQuestions: GeneratedQuestion[] = [
  
];
