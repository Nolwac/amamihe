export const LEARNING_ROLES = [
  "Mapmaker",
  "Interviewer",
  "Socratic Questioner",
  "Explainer",
  "Examiner",
  "Checker",
  "Listener",
  "Diagnostician",
  "Sparring Partner",
  "Clerk",
] as const;
export type LearningRole = (typeof LEARNING_ROLES)[number];
export type LearningJourney = {
  observed: LearningRole[];
  goal: string;
  reasoning: string;
  reflection: string;
  completed: boolean;
  path: { id: string; title: string; cleared: boolean }[];
  reasoningPrompt: string;
  rehearsal: { id: string; prompt: string; options: string[] };
  diagnosis: string;
};
