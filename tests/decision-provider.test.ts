import { test } from "node:test";
import assert from "node:assert/strict";
import {
  JevProvider,
  decisionConfiguration,
} from "../server/decision-provider.js";
const input = {
  evidence: {
    delivery_id: "delivery",
    question_id: "question",
    retry: false,
    correct: true,
    assisted: false,
    answer: 1,
    elapsed_ms: 100,
  },
  criterionId: "question",
  rubric: "Correct independent answer.",
};
test("typed classifier is mock by default and makes no paid request without budget", async () => {
  assert.equal(decisionConfiguration({}).status.mode, "mock");
  assert.equal(
    decisionConfiguration({ DECISION_PROVIDER: "openrouter" }).status.ready,
    false,
  );
  let called = false;
  const provider = new JevProvider("key", 0, async () => {
    called = true;
    throw new Error();
  });
  await assert.rejects(provider.grade(input));
  assert.equal(called, false);
});
test("typed request uses Decisions API, preserves identifiers and validates model provenance", async () => {
  const provider = new JevProvider(
    "fixture-only",
    0.001,
    async (url, options) => {
      assert.equal(url, "https://openrouter.ai/api/alpha/decisions");
      const body = JSON.parse(String(options?.body));
      assert.equal(body.questions.evidence.type, "choice");
      assert.equal(body.state.evidence.delivery_id, "delivery");
      assert.equal(body.messages, undefined);
      return new Response(
        JSON.stringify({
          model: "typesafe/jev-1.13-20260917",
          provider: "TypeSafe",
          answers: {
            evidence: {
              type: "choice",
              choice: "independent",
              confidence: 0.95,
              probabilities: { independent: 0.98 },
            },
          },
          usage: { cost: 0.00002 },
        }),
      );
    },
  );
  assert.deepEqual(await provider.grade(input), {
    deliveryId: "delivery",
    criterionId: "question",
    score: 1,
    confidence: 0.95,
    tags: [],
  });
  const malformed = new JevProvider(
    "fixture",
    0.001,
    async () =>
      new Response(JSON.stringify({ model: "chat-model", answers: {} })),
  );
  await assert.rejects(malformed.grade(input));
});
test("routing cannot invent task IDs or accept uncertain choices", async () => {
  const fixture = (confidence: number) =>
    new JevProvider(
      "fixture",
      0.001,
      async () =>
        new Response(
          JSON.stringify({
            model: "typesafe/jev-1.13",
            provider: "TypeSafe",
            answers: {
              next: {
                type: "choice",
                choice: "level2",
                confidence,
                probabilities: { level2: 1 },
              },
            },
            usage: { cost: 0 },
          }),
        ),
    );
  const route = {
    criteria: [{ id: "question", score: 1, independent: true }],
    eligible: [{ id: "level2", taskIds: ["authored-question"] }],
  };
  assert.deepEqual(await fixture(0.99).route(route), {
    nextLevelId: "level2",
    taskIds: ["authored-question"],
  });
  await assert.rejects(fixture(0.3).route(route));
});
