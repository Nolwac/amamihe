import { test } from "node:test";
import assert from "node:assert/strict";
import { mockClassify, questions } from "../server/classifier.js";
const clean = () =>
  questions.map((q) => ({
    questionId: q.id,
    answer: q.answer,
    assisted: false,
    elapsedMs: 3000,
  }));
test("independent correct answers advance and schedule a review", () => {
  const r = mockClassify(clean());
  assert.equal(r.route, "advance");
  assert.equal(r.points, 60);
  assert.equal(r.mocked, true);
  assert.ok(Date.parse(r.nextReview) > Date.now());
});
test("assisted correct work cannot count as independent mastery", () => {
  const c = clean();
  c[0].assisted = true;
  const r = mockClassify(c);
  assert.equal(r.route, "retry");
  assert.equal(r.independent, 2);
  assert.equal(r.points, 40);
});
test("critical errors lead to prerequisite review", () => {
  const c = clean();
  c[0].answer = 2;
  c[1].answer = 2;
  assert.equal(mockClassify(c).route, "review_prerequisite");
});
test("partial and duplicate question sets cannot classify a level", () => {
  assert.throws(() => mockClassify(clean().slice(0, 2)));
  const c = clean();
  c[2] = c[0];
  assert.throws(() => mockClassify(c));
});
