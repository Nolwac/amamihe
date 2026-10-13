export type DecisionSelection = {
  primitive?: "choice" | "noul";
  approvalProbability?: number;
  kind: "level" | "question" | "category" | "foundation";
  provider: string;
  model: string;
  modelDigest: string;
  choice: string;
  probabilities: Record<string, number>;
  /** Probability concentration, not a calibrated correctness estimate. */
  confidence: number;
  durationMs: number;
};
export type LearningSelection = {
  status: "ready" | "pending";
  provider: string;
  question?: DecisionSelection;
  category?: DecisionSelection;
  level?: DecisionSelection;
  reason?: string;
};
export const DECISION_MODEL = "tev1:0.8b";
export const DECISION_IDENTITY = "ollama:" + DECISION_MODEL;
export const DECISION_MODEL_DIGEST =
  "sha256:8d11b3146b7f3f4f4d5e9a64665ab2bdaf8b46e4ec42a5880b60a716ae50e3fb";
