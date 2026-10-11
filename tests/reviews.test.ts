import { test } from "node:test";
import assert from "node:assert/strict";
import {
  scheduleReview,
  remediationWindow,
  localDueLabel,
} from "../shared/reviews.js";
test("controlled-clock FSRS schedules independent recall later than assisted/wrong evidence", () => {
  const now = Date.UTC(2026, 9, 11, 12);
  const independent = scheduleReview(undefined, now, true, false),
    assisted = scheduleReview(undefined, now, true, true),
    wrong = scheduleReview(undefined, now, false, false);
  assert.ok(independent.due.getTime() > assisted.due.getTime());
  assert.equal(assisted.due.getTime(), wrong.due.getTime());
  const due = independent.due.getTime();
  const next = scheduleReview(independent, due, true, false);
  assert.ok(next.due.getTime() > due);
  assert.equal(next.reps, 2);
  assert.ok(
    localDueLabel(independent.due.toISOString(), "Africa/Lagos").includes(
      "2026",
    ),
  );
  assert.equal(
    localDueLabel(independent.due.toISOString(), "invalid-zone"),
    independent.due.toISOString(),
  );
});
test("bounded adaptation requires minimum evidence and does not count help as independent mastery", () => {
  assert.equal(
    remediationWindow([{ correct: false, assisted: false }]).remediate,
    false,
  );
  assert.equal(
    remediationWindow([
      { correct: false, assisted: false },
      { correct: false, assisted: false },
      { correct: true, assisted: false },
    ]).remediate,
    true,
  );
  assert.equal(
    remediationWindow(Array(6).fill({ correct: true, assisted: false }))
      .samples,
    5,
  );
  assert.equal(
    remediationWindow([
      { correct: true, assisted: true },
      { correct: true, assisted: true },
      { correct: true, assisted: false },
    ]).remediate,
    true,
  );
});

test("tutor review windows validate minimum evidence before publication", async () => {
  const { storytellingCourse } = await import("../server/course-template.js");
  const { validateCourse } = await import("../shared/course.js");
  const course = storytellingCourse();
  course.reviewPolicy = { window: 10, minimumEvidence: 5, errorThreshold: 3 };
  assert.equal(validateCourse(course).length, 0);
  course.reviewPolicy = { window: 2, minimumEvidence: 1, errorThreshold: 1 };
  assert.ok(validateCourse(course).some((i) => i.path === "reviewPolicy"));
});
