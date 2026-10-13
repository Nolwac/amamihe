import { test } from "node:test";
import assert from "node:assert/strict";
import {
  OllamaProvider,
  DECISION_MODEL_DIGEST,
} from "../server/decision-provider.js";

test(
  "actual local tev1 classifies evidence and chooses authored learning levels, categories and questions",
  { timeout: 120000 },
  async () => {
    const provider = new OllamaProvider(process.env.OLLAMA_BASE_URL);
    const status = await provider.status();
    assert.equal(status.ready, true, status.reason);
    assert.equal(status.modelDigest, DECISION_MODEL_DIGEST);
    for (const [correct, assisted, score, tag] of [
      [true, false, 1, undefined],
      [true, true, 1, "assisted"],
      [false, false, 0, "incorrect"],
    ] as const) {
      const grade = await provider.grade({
        evidence: {
          delivery_id: "live-q",
          question_id: "q",
          retry: false,
          correct,
          assisted,
          answer: 0,
          elapsed_ms: 1000,
        },
        criterionId: "counting",
        rubric: "Count three seeds.",
      });
      assert.equal(grade.score, score);
      if (tag) assert.ok(grade.tags.includes(tag));
      else assert.deepEqual(grade.tags, []);
    }
    for (const kind of ["level", "category", "question"] as const) {
      const candidates =
        kind === "category"
          ? [
              {
                id: "Mapmaker",
                description: "Review the course learning path.",
              },
              { id: "Interviewer", description: "Record a learning goal." },
            ]
          : [
              { id: "count", description: "Count three seeds in a garden." },
              { id: "shapes", description: "Identify a circle in a garden." },
            ];
      const selection = await provider.select({
        kind,
        state:
          "A learner is beginning a counting and shapes course. All listed activities are appropriate and permitted.",
        instructions:
          "Choose one of the eligible authored activities so the learner can begin.",
        candidates,
      });
      assert.ok(candidates.some((c) => c.id === selection.choice));
      assert.equal(selection.modelDigest, DECISION_MODEL_DIGEST);
      assert.ok(selection.durationMs > 0);
    }
  },
);
