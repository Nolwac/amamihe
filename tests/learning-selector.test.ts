import { test } from "node:test";
import assert from "node:assert/strict";
import type { DatabaseQueries } from "../server/db.js";
import type { StoredProgress } from "../server/courses.js";
import { prepareLearningSelection } from "../server/learning-selector.js";
import { storytellingCourse } from "../server/course-template.js";
import { policyProvider } from "./provider-fixture.js";
import type { ClassificationProvider } from "../server/assessment.js";

const definition = storytellingCourse();
function fixture() {
  const records: unknown[][] = [];
  const db: DatabaseQueries = {
    exec: async () => {},
    query: async <T>(_sql: string, parameters?: unknown[]) => {
      records.push(parameters ?? []);
      return { rows: [] as T[] };
    },
  };
  const state: StoredProgress = {
    levelId: definition.levels[0].id,
    questionIndex: 0,
    retry: false,
    satisfiedQuestionIds: [],
    assisted: false,
    completedLevelIds: [],
    usedRetryQuestionIds: [],
    points: 0,
    finished: false,
    blocked: false,
  };
  return { db, state, records };
}
test("model-selected questions and categories are saved and reload never reshuffles a delivery", async () => {
  const { db, state, records } = fixture();
  let calls = 0;
  const provider: ClassificationProvider = {
    ...policyProvider,
    async select(input) {
      calls++;
      return policyProvider.select({
        ...input,
        candidates: [...input.candidates].reverse(),
      });
    },
  };
  await prepareLearningSelection(
    db,
    "course",
    "learner",
    definition,
    state,
    provider,
  );
  assert.equal(state.questionIndex, definition.levels[0].questions.length - 1);
  assert.equal(state.selection?.status, "ready");
  assert.equal(records.length, 2);
  const question = state.selection?.question?.choice;
  await prepareLearningSelection(
    db,
    "course",
    "learner",
    definition,
    state,
    provider,
  );
  assert.equal(calls, 2);
  assert.equal(state.selection?.question?.choice, question);
  state.journey = {
    observed: ["Mapmaker"],
    goal: "Learn how to prepare data.",
    reasoning: "",
    reflection: "",
  };
  await prepareLearningSelection(
    db,
    "course",
    "learner",
    definition,
    state,
    provider,
  );
  assert.equal(calls, 3);
  assert.equal(state.selection?.question?.choice, question);
});
test("fresh retry selections cover only missing criteria and never redeliver an exhausted independent variant", async () => {
  const { db, state } = fixture();
  const level = definition.levels[0];
  state.retry = true;
  state.satisfiedQuestionIds = [level.questions[0].id];
  await prepareLearningSelection(
    db,
    "course",
    "learner",
    definition,
    state,
    policyProvider,
  );
  const q = level.retryQuestions[state.questionIndex];
  assert.equal(q.retryFor, level.questions[1].id);
  state.usedRetryQuestionIds.push(q.id);
  state.deliverySerial = 1;
  state.practiceOnly = true;
  await prepareLearningSelection(
    db,
    "course",
    "learner",
    definition,
    state,
    policyProvider,
  );
  assert.equal(state.assisted, true);
  assert.equal(state.satisfiedQuestionIds.length, 1);
});
test("invalid or unavailable model selections remain pending without delivering an invented question", async () => {
  for (const choice of ["invented-question", "stopped-service"]) {
    const { db, state } = fixture();
    const provider: ClassificationProvider = {
      ...policyProvider,
      async select(input) {
        if (choice === "stopped-service")
          throw new Error("Local service stopped");
        return { ...(await policyProvider.select(input)), choice };
      },
    };
    await prepareLearningSelection(
      db,
      "course",
      "learner",
      definition,
      state,
      provider,
    );
    assert.equal(state.selection?.status, "pending");
    assert.equal(state.selection?.question, undefined);
    assert.deepEqual(state.satisfiedQuestionIds, []);
    assert.equal(state.points, 0);
  }
});
