import { policyProvider } from "./provider-fixture.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyFoundation, questions } from "../server/classifier.js";
const clean = () =>
  questions.map((q) => ({
    questionId: q.id,
    answer: q.answer,
    assisted: false,
    elapsedMs: 3000,
  }));
test("independent correct answers advance and schedule a review", async () => {
  const r = await classifyFoundation(clean(), policyProvider);
  assert.equal(r.route, "advance");
  assert.equal(r.points, 60);
  assert.equal(r.provider, policyProvider.identity);
  assert.ok(Date.parse(r.nextReview) > Date.now());
});
test("assisted correct work cannot count as independent mastery", async () => {
  const c = clean();
  c[0].assisted = true;
  const r = await classifyFoundation(c, policyProvider);
  assert.equal(r.route, "retry");
  assert.equal(r.independent, 2);
  assert.equal(r.points, 40);
});
test("critical errors lead to prerequisite review", async () => {
  const c = clean();
  c[0].answer = 2;
  c[1].answer = 2;
  assert.equal(
    (await classifyFoundation(c, policyProvider)).route,
    "review_prerequisite",
  );
});
test("partial and duplicate question sets cannot classify a level", async () => {
  await assert.rejects(() =>
    classifyFoundation(clean().slice(0, 2), policyProvider),
  );
  const c = clean();
  c[2] = c[0];
  await assert.rejects(() => classifyFoundation(c, policyProvider));
});
