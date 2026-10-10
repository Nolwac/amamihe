import { test } from "node:test";
import assert from "node:assert/strict";
import { validateCourse } from "../shared/course.js";
import {
  blankCourse,
  storytellingCourse,
  STORY_MODEL_NOTEBOOK,
} from "../server/course-template.js";

test("authored storytelling pilot has a valid six-stage prerequisite path", () => {
  const course = storytellingCourse();
  assert.deepEqual(validateCourse(course), []);
  assert.equal(course.levels.length, 6);
  for (const [index, level] of course.levels.entries()) {
    assert.equal(level.questions.length, 2);
    assert.equal(level.retryQuestions.length, 2);
    assert.deepEqual(
      level.prerequisites,
      index ? [course.levels[index - 1].id] : [],
    );
    assert.ok(level.questions.every((question) => question.rubric.length > 10));
    assert.deepEqual(
      level.retryQuestions.map((retry) => retry.rubric),
      level.questions.map((question) => question.rubric),
      "Each fresh retry must assess the same criterion as its primary question.",
    );
    assert.deepEqual(
      level.retryQuestions.map((retry) => retry.retryFor),
      level.questions.map((question) => question.id),
    );
    assert.ok(
      level.retryQuestions.every(
        (retry) =>
          !level.questions.some((question) => question.prompt === retry.prompt),
      ),
    );
  }
  assert.equal(
    256 * 128 + 128 * 128 + 5 * (12 * 128 ** 2 + 13 * 128) + 2 * 128,
    1_040_768,
  );
  assert.ok(STORY_MODEL_NOTEBOOK.includes("parameter_count == 1_040_768"));
  assert.ok(STORY_MODEL_NOTEBOOK.includes("F.linear(x, self.token.weight)"));
  assert.ok(STORY_MODEL_NOTEBOOK.includes('Path("split.json")'));
});

test("empty draft stays editable but cannot be published", () => {
  const issues = validateCourse(blankCourse());
  for (const path of ["summary", "concepts", "resources", "levels"])
    assert.ok(
      issues.some((issue) => issue.path === path),
      path,
    );
});

test("publication rejects missing hints, explanations, rubrics and independent retries", () => {
  const course = storytellingCourse();
  course.levels[0].questions[0].hint = "";
  course.levels[0].questions[0].explanation = "";
  course.levels[0].questions[0].rubric = "";
  course.levels[0].retryQuestions = [];
  const paths = validateCourse(course).map((issue) => issue.path);
  assert.ok(paths.includes("levels.0.questions.0.hint"));
  assert.ok(paths.includes("levels.0.questions.0.explanation"));
  assert.ok(paths.includes("levels.0.questions.0.rubric"));
  assert.ok(paths.includes("levels.0.retryQuestions"));
});

test("answers must index distinct options and cloned retry questions are rejected", () => {
  const course = storytellingCourse();
  const question = course.levels[0].questions[0];
  question.answer = 20;
  question.options[1] = question.options[0];
  course.levels[0].retryQuestions[0].prompt = `  ${question.prompt.toUpperCase()} `;
  const paths = validateCourse(course).map((issue) => issue.path);
  assert.ok(paths.includes("levels.0.questions.0.answer"));
  assert.ok(paths.includes("levels.0.questions.0.options.1"));
  assert.ok(paths.includes("levels.0.retryQuestions"));
});

test("each primary requires a mapped fresh retry, rather than arbitrary retry-bank size", () => {
  const course = storytellingCourse();
  const level = course.levels[0];
  level.retryQuestions[1].retryFor = level.questions[0].id;
  assert.ok(
    validateCourse(course).some(
      (issue) =>
        issue.path === "levels.0.retryQuestions" &&
        issue.message.includes(level.questions[1].id),
    ),
  );
});

test("retry targets must be explicit primary IDs from the same level", () => {
  const course = storytellingCourse();
  delete course.levels[0].retryQuestions[0].retryFor;
  course.levels[0].retryQuestions[1].retryFor =
    course.levels[1].questions[0].id;
  course.levels[0].questions[0].retryFor = course.levels[0].questions[1].id;
  const paths = validateCourse(course).map((issue) => issue.path);
  assert.ok(paths.includes("levels.0.retryQuestions.0.retryFor"));
  assert.ok(paths.includes("levels.0.retryQuestions.1.retryFor"));
  assert.ok(paths.includes("levels.0.questions.0.retryFor"));
});

test("identifiers and resource references must resolve uniquely", () => {
  const course = storytellingCourse();
  course.levels[1].questions[0].id = course.levels[0].questions[0].id;
  course.resources[1].id = course.resources[0].id;
  course.levels[0].resourceIds = ["missing-resource"];
  course.concepts[0].id = "bad id";
  const issues = validateCourse(course);
  assert.ok(issues.some((issue) => issue.path === "levels.1.questions.0.id"));
  assert.ok(issues.some((issue) => issue.path === "resources.1.id"));
  assert.ok(issues.some((issue) => issue.path === "levels.0.resourceIds"));
  assert.ok(issues.some((issue) => issue.path === "concepts.0.id"));
});

test("both concept and playable-level prerequisite cycles are rejected", () => {
  const course = storytellingCourse();
  course.concepts[0].prerequisites = [course.concepts[1].id];
  course.levels[0].prerequisites = [course.levels[1].id];
  const issues = validateCourse(course);
  assert.ok(
    issues.some(
      (issue) =>
        issue.path === "concepts.0.prerequisites" &&
        issue.message.includes("acyclic"),
    ),
  );
  assert.ok(
    issues.some(
      (issue) =>
        issue.path === "levels.0.prerequisites" &&
        issue.message.includes("acyclic"),
    ),
  );
});

test("levels cannot bypass their concept prerequisites", () => {
  const course = storytellingCourse();
  course.levels[2].prerequisites = [];
  assert.ok(
    validateCourse(course).some(
      (issue) =>
        issue.path === "levels.2.prerequisites" &&
        issue.message.includes("tokenization"),
    ),
  );
});

test("dangling prerequisites and concepts with no playable content are rejected", () => {
  const course = storytellingCourse();
  course.levels[1].prerequisites = ["unknown-level"];
  course.concepts.push({
    id: "unused",
    title: "Unused concept",
    prerequisites: [],
  });
  const issues = validateCourse(course);
  assert.ok(
    issues.some((issue) =>
      issue.message.includes("unknown-level does not exist"),
    ),
  );
  assert.ok(issues.some((issue) => issue.path === "concepts.6"));
});

test("non-quiz practice widgets require the matching authored resource", () => {
  const course = storytellingCourse();
  course.levels[0].widget = "notebook";
  assert.ok(
    validateCourse(course).some((issue) => issue.path === "levels.0.widget"),
  );
  course.levels[0].resourceIds = ["training-notebook"];
  assert.deepEqual(validateCourse(course), []);
});

test("untimed accessible levels are valid while short accidental deadlines are rejected", () => {
  const course = storytellingCourse();
  course.levels[0].timeLimitSeconds = 0;
  assert.deepEqual(validateCourse(course), []);
  course.levels[0].timeLimitSeconds = 1;
  assert.ok(
    validateCourse(course).some(
      (issue) => issue.path === "levels.0.timeLimitSeconds",
    ),
  );
});

test("external links and sources reject active, plaintext, private and credentialed URLs", () => {
  for (const source of [
    "javascript:alert(1)",
    "http://docs.python.org/",
    "https://localhost/",
    "https://127.0.0.1/",
    "https://[::1]/",
    "https://user:password@example.org/resource",
  ]) {
    const course = storytellingCourse();
    course.resources[0].source = source;
    assert.ok(
      validateCourse(course).some(
        (issue) => issue.path === "resources.0.source",
      ),
      source,
    );
  }
  const course = storytellingCourse();
  course.resources[0].url = "data:text/html,<script>bad()</script>";
  assert.ok(
    validateCourse(course).some((issue) => issue.path === "resources.0.url"),
  );
});

test("untrusted shape, range and excessive size errors stay bounded", () => {
  for (const value of [null, [], "course", 2])
    assert.ok(validateCourse(value).length > 0);
  const course = storytellingCourse();
  course.levels[0].timeLimitSeconds = Number.NaN;
  course.levels[0].points = -1;
  course.language = "English language, not a tag";
  course.resources[0].content = "x".repeat(60001);
  const paths = validateCourse(course).map((issue) => issue.path);
  assert.ok(paths.includes("levels.0.timeLimitSeconds"));
  assert.ok(paths.includes("levels.0.points"));
  assert.ok(paths.includes("resources.0.content"));
  assert.ok(paths.includes("language"));
  const enormous = { ...course, levels: Array(10000).fill({}) };
  const issues = validateCourse(enormous);
  assert.ok(issues.length <= 150);
  assert.ok(issues.some((issue) => issue.path === "levels"));
});
