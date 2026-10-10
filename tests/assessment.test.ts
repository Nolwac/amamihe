import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assessLevel,
  boundedChunks,
  mockProvider,
  type ClassificationProvider,
  type Evidence,
} from "../server/assessment.js";
import { storytellingCourse } from "../server/course-template.js";
const definition = storytellingCourse();
const level = definition.levels[0];
const evidence: Evidence[] = level.questions.map((q) => ({
  delivery_id: `primary:${q.id}`,
  question_id: q.id,
  retry: false,
  correct: true,
  assisted: false,
  answer: q.answer,
  elapsed_ms: 100,
}));
test("post-clearance assessment aggregates criterion evidence and validates authored routing", async () => {
  const result = await assessLevel(definition, level, evidence, [level.id]);
  assert.equal(result.status, "confirmed");
  assert.equal(result.grades.length, evidence.length);
  assert(result.criteria.every((c) => c.independent));
  assert.equal(result.nextLevelId, definition.levels[1].id);
  assert.deepEqual(
    result.taskIds,
    definition.levels[1].questions.map((q) => q.id),
  );
});
test("assistance and errors persist while fresh independent evidence repairs only its criterion", async () => {
  const retry = level.retryQuestions.find(
    (q) => q.retryFor === level.questions[0].id,
  )!;
  const first = { ...evidence[0], correct: false, assisted: true };
  const repair = {
    ...evidence[0],
    delivery_id: "retry:" + retry.id,
    question_id: retry.id,
    retry: true,
  };
  const pending = await assessLevel(
    definition,
    level,
    [first, ...evidence.slice(1)],
    [level.id],
  );
  assert.equal(pending.status, "pending");
  const result = await assessLevel(
    definition,
    level,
    [first, ...evidence.slice(1), repair],
    [level.id],
  );
  assert.equal(result.status, "confirmed");
  assert.equal(result.assistanceCount, 1);
  assert.equal(result.errorCount, 1);
  assert.equal(result.grades.length, evidence.length + 1);
});
test("invalid grades, uncertain scores, hallucinated tasks and locked routes remain pending", async () => {
  const providers: ClassificationProvider[] = [
    { ...mockProvider, grade: async () => ({ score: 1 }) },
    {
      ...mockProvider,
      grade: async (input) => ({
        ...((await mockProvider.grade(input)) as object),
        confidence: 0.5,
      }),
    },
    {
      ...mockProvider,
      route: async () => ({
        nextLevelId: definition.levels.at(-1)!.id,
        taskIds: [],
      }),
    },
    {
      ...mockProvider,
      route: async () => ({
        nextLevelId: definition.levels[1].id,
        taskIds: ["invented"],
      }),
    },
    {
      ...mockProvider,
      grade: async () => {
        throw new Error("Provider unavailable");
      },
    },
  ];
  for (const provider of providers) {
    const result = await assessLevel(
      definition,
      level,
      evidence,
      [level.id],
      provider,
    );
    assert.equal(result.status, "pending");
    assert.equal(result.nextLevelId, null);
  }
});
test("unresponsive providers time out without selecting a route", async () => {
  const result = await assessLevel(definition, level, evidence, [level.id], {
    ...mockProvider,
    grade: () => new Promise(() => {}),
  });
  assert.equal(result.status, "pending");
});
test("bounded multilingual chunks preserve long responses without breaking Unicode", () => {
  const text = "故事🙂é".repeat(3000);
  const chunks = boundedChunks(text);
  assert.equal(chunks.join(""), text);
  assert(chunks.every((c) => Buffer.byteLength(c) <= 2048));
  assert.throws(() => boundedChunks("x".repeat(65537)));
});
