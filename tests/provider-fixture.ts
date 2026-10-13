import type { ClassificationProvider } from "../server/assessment.js";

/** Injected only by policy tests. Production has a single local-model provider. */
export const policyProvider: ClassificationProvider = {
  identity: "ollama:policy-test-fixture",
  async grade({ evidence, criterionId }) {
    return {
      deliveryId: evidence.delivery_id,
      criterionId,
      score: evidence.correct ? 1 : 0,
      confidence: 1,
      tags: evidence.assisted
        ? ["assisted"]
        : evidence.correct
          ? []
          : ["incorrect"],
    };
  },
  async route({ eligible }) {
    return {
      nextLevelId: eligible[0]?.id ?? null,
      taskIds: eligible[0]?.taskIds ?? [],
    };
  },
  async select(input) {
    return {
      kind: input.kind,
      provider: this.identity!,
      model: "policy-test-fixture",
      modelDigest: "sha256:" + "0".repeat(64),
      choice: input.candidates[0].id,
      probabilities: Object.fromEntries(
        input.candidates.map((c, i) => [c.id, i === 0 ? 1 : 0]),
      ),
      confidence: 1,
      durationMs: 0,
    };
  },
};
