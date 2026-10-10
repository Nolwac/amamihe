import { registerRewards } from "../server/rewards.js";
import {
  mockProvider,
  type ClassificationProvider,
} from "../server/assessment.js";
import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import Fastify, { type LightMyRequestResponse } from "fastify";
import cookie from "@fastify/cookie";
import { Authentication } from "../server/auth.js";
import { openDatabase } from "../server/db.js";
import { initializeSchema } from "../server/schema.js";
import { initializeCourseSchema, registerCourses } from "../server/courses.js";
import {
  validateCourse,
  type CourseDefinition,
  type CourseDraft,
  type LearningProgress,
} from "../shared/course.js";

function authoredCourse(): CourseDefinition {
  const question = (id: string, prompt: string, retryFor?: string) => ({
    id,
    prompt,
    ...(retryFor ? { retryFor } : {}),
    options: [
      "Keep the evaluation set separate",
      "Train on every evaluation example",
    ],
    answer: 0,
    hint: "Think about measuring performance on unseen examples.",
    explanation:
      "A held-out evaluation set estimates how a model performs on examples it did not train on.",
    rubric:
      "Choose the option that prevents evaluation data from leaking into training.",
  });
  return {
    title: "Authored model workshop",
    summary:
      "Prepare original story data and evaluate a small model with authored checkpoints.",
    language: "en",
    concepts: [
      { id: "data", title: "Data preparation", prerequisites: [] },
      { id: "evaluation", title: "Model evaluation", prerequisites: ["data"] },
    ],
    resources: [
      {
        id: "reading",
        title: "Reviewed workshop reading",
        kind: "reading",
        content:
          "Reserve held-out data before training. Document story ownership and dataset splits.",
        url: "",
        source: "https://pytorch.org/docs/stable/",
      },
    ],
    levels: [
      {
        id: "prepare",
        title: "Prepare story data",
        conceptId: "data",
        prerequisites: [],
        theme: "workshop",
        timeLimitSeconds: 180,
        points: 40,
        resourceIds: ["reading"],
        widget: "quiz",
        questions: [
          question(
            "prepare-q1",
            "How should the initial dataset split preserve an unbiased evaluation?",
          ),
          question(
            "prepare-q2",
            "What should happen to reserved evaluation stories during training?",
          ),
        ],
        retryQuestions: [
          question(
            "prepare-r1",
            "A classmate puts held-out stories into the optimizer batches. What fixes this?",
            "prepare-q1",
          ),
          question(
            "prepare-r2",
            "Which data handling choice prevents a contaminated validation score?",
            "prepare-q2",
          ),
        ],
      },
      {
        id: "evaluate",
        title: "Evaluate the small model",
        conceptId: "evaluation",
        prerequisites: ["prepare"],
        theme: "racing",
        timeLimitSeconds: 180,
        points: 60,
        resourceIds: ["reading"],
        widget: "quiz",
        questions: [
          question(
            "evaluate-q1",
            "Which examples should be used for an unbiased final model evaluation?",
          ),
        ],
        retryQuestions: [
          question(
            "evaluate-r1",
            "A reported score uses the same stories as training. How should evaluation be corrected?",
            "evaluate-q1",
          ),
        ],
      },
    ],
  };
}
async function fixture(provider?: ClassificationProvider, now?: () => number) {
  const directory = await mkdtemp(path.join(tmpdir(), "amamihe-courses-"));
  const db = await openDatabase({ dataDir: directory });
  await initializeSchema(db);
  await initializeCourseSchema(db);
  const messages: string[] = [];
  const auth = new Authentication(
    db,
    {
      async send(message) {
        messages.push(message.text);
      },
    },
    "course-test-secret-at-least-thirty-two-characters",
  );
  async function account(email: string) {
    const pending = await auth.signup({
      name: "Course tester",
      email,
      password: "course-test-password",
      outfit: "teal",
    });
    const session = await auth.verify(
      pending.challengeId,
      messages.at(-1)!.match(/\b\d{6}\b/)![0],
    );
    return { cookie: `amamihe=${session.token}`, playerId: session.player!.id };
  }
  const tutor = await account("tutor@example.test"),
    learner = await account("learner@example.test");
  const app = Fastify({ bodyLimit: 16384 });
  await app.register(cookie);
  registerCourses(app, db, auth, provider, now);
  registerRewards(app, db, auth);
  await app.ready();
  const request = (
    method: "GET" | "POST" | "PUT",
    url: string,
    payload?: unknown,
    session = tutor.cookie,
  ) =>
    app.inject({
      method,
      url,
      ...(payload === undefined
        ? {}
        : { payload: payload as Record<string, unknown> }),
      headers: session ? { cookie: session } : {},
    });
  async function create(definition = authoredCourse()) {
    const response = await request("POST", "/api/studio/courses", {
      template: "blank",
    });
    assert.equal(response.statusCode, 201, response.body);
    const draft = response.json<CourseDraft>();
    const saved = await request("PUT", `/api/studio/courses/${draft.id}`, {
      revision: draft.revision,
      definition,
    });
    assert.equal(saved.statusCode, 200, saved.body);
    return saved.json<CourseDraft>();
  }
  async function publish(draft: CourseDraft) {
    const response = await request(
      "POST",
      `/api/studio/courses/${draft.id}/publish`,
      { revision: draft.revision },
    );
    assert.equal(response.statusCode, 200, response.body);
    return response.json<{ id: string; version: number }>();
  }
  async function enroll(id: string, version = 1, session = learner.cookie) {
    const response = await request(
      "POST",
      `/api/courses/${id}/enroll`,
      { version },
      session,
    );
    assert.equal(response.statusCode, 200, response.body);
    return response.json<LearningProgress>();
  }
  const answer = async (
    id: string,
    progress: LearningProgress,
    choice = 0,
    session = learner.cookie,
  ) => {
    const started = await request(
      "POST",
      `/api/learning/${id}/play`,
      { questionId: progress.question!.id },
      session,
    );
    if (started.statusCode !== 200) return started;
    return request(
      "POST",
      `/api/learning/${id}/answer`,
      { questionId: progress.question!.id, answer: choice, elapsedMs: 1000 },
      session,
    );
  };

  return {
    db,
    directory,
    app,
    tutor,
    learner,
    request,
    create,
    publish,
    enroll,
    answer,
    async close() {
      await app.close();
      await db.close();
      await rm(directory, { recursive: true, force: true });
    },
  };
}
function accepted(response: LightMyRequestResponse): LearningProgress {
  assert.equal(response.statusCode, 200, response.body);
  return response.json<LearningProgress>();
}

test("tutor drafts enforce ownership, bounded structure, saveable incompletes and revision races", async () => {
  const f = await fixture();
  try {
    assert.deepEqual(validateCourse(authoredCourse()), []);
    assert.equal(
      (await f.request("GET", "/api/studio/courses", undefined, "")).statusCode,
      401,
    );
    const response = await f.request("POST", "/api/studio/courses", {
      template: "blank",
    });
    const draft = response.json<CourseDraft>();
    assert.equal(
      (
        await f.request(
          "GET",
          `/api/studio/courses/${draft.id}`,
          undefined,
          f.learner.cookie,
        )
      ).statusCode,
      404,
    );
    assert.equal(
      (
        await f.request(
          "POST",
          `/api/studio/courses/${draft.id}/publish`,
          { revision: 1 },
          f.learner.cookie,
        )
      ).statusCode,
      404,
    );
    const incomplete = authoredCourse();
    incomplete.title = "";
    incomplete.levels[0].retryQuestions = [];
    const saved = await f.request("PUT", `/api/studio/courses/${draft.id}`, {
      revision: 1,
      definition: incomplete,
    });
    assert.equal(saved.statusCode, 200, saved.body);
    assert.equal(saved.json<CourseDraft>().revision, 2);
    const checked = await f.request(
      "POST",
      `/api/studio/courses/${draft.id}/validate`,
      { revision: 2 },
    );
    assert.ok(checked.json<{ issues: unknown[] }>().issues.length >= 2);
    const blocked = await f.request(
      "POST",
      `/api/studio/courses/${draft.id}/publish`,
      { revision: 2 },
    );
    assert.equal(blocked.statusCode, 422);
    assert.ok(blocked.json<{ issues: unknown[] }>().issues.length >= 2);
    assert.equal(
      (await f.request("GET", `/api/courses/${draft.id}`)).statusCode,
      404,
    );
    const malformed = structuredClone(incomplete) as unknown as Record<
      string,
      unknown
    >;
    malformed.levels = [null];
    assert.equal(
      (
        await f.request("PUT", `/api/studio/courses/${draft.id}`, {
          revision: 2,
          definition: malformed,
        })
      ).statusCode,
      400,
    );
    const race = await Promise.all([
      f.request("PUT", `/api/studio/courses/${draft.id}`, {
        revision: 2,
        definition: authoredCourse(),
      }),
      f.request("PUT", `/api/studio/courses/${draft.id}`, {
        revision: 2,
        definition: authoredCourse(),
      }),
    ]);
    assert.deepEqual(race.map((r) => r.statusCode).sort(), [200, 409]);
    assert.equal(
      (
        await f.request("GET", `/api/studio/courses/${draft.id}`)
      ).json<CourseDraft>().revision,
      3,
    );
    assert.equal(
      (
        await f.request(
          "PUT",
          `/api/studio/courses/${draft.id}`,
          { revision: 3, definition: authoredCourse() },
          f.learner.cookie,
        )
      ).statusCode,
      404,
    );
    const oversized = authoredCourse();
    oversized.resources[0].content = "x".repeat(300000);
    assert.equal(
      (
        await f.request("PUT", `/api/studio/courses/${draft.id}`, {
          revision: 3,
          definition: oversized,
        })
      ).statusCode,
      413,
    );
  } finally {
    await f.close();
  }
});

test("immutable publication is idempotent and existing enrollments remain pinned to their version", async () => {
  const f = await fixture();
  try {
    const draft = await f.create();
    const publications = await Promise.all([
      f.publish(draft),
      f.publish(draft),
    ]);
    assert.deepEqual(publications, [
      { id: draft.id, version: 1 },
      { id: draft.id, version: 1 },
    ]);
    const first = await f.enroll(draft.id);
    assert.equal(first.version, 1);
    const changed = authoredCourse();
    changed.title = "Revised model workshop";
    changed.levels[0].questions[0].answer = 1;
    const nextDraft = (
      await f.request("PUT", `/api/studio/courses/${draft.id}`, {
        revision: draft.revision,
        definition: changed,
      })
    ).json<CourseDraft>();
    assert.equal((await f.publish(nextDraft)).version, 2);
    assert.equal((await f.enroll(draft.id, 2)).version, 1);
    const oldPublic = (
      await f.request(
        "GET",
        `/api/courses/${draft.id}?version=1`,
        undefined,
        "",
      )
    ).json<{ version: number; definition: CourseDefinition }>();
    const currentPublic = (
      await f.request("GET", `/api/courses/${draft.id}`, undefined, "")
    ).json<{ version: number; definition: CourseDefinition }>();
    assert.equal(oldPublic.definition.title, "Authored model workshop");
    assert.equal(currentPublic.definition.title, "Revised model workshop");
    for (const level of currentPublic.definition.levels)
      for (const question of [...level.questions, ...level.retryQuestions])
        assert.deepEqual(Object.keys(question).sort(), [
          "id",
          "options",
          "prompt",
        ]);
    const persisted = (
      await f.db.query<{ definition: CourseDefinition }>(
        "SELECT definition FROM course_versions WHERE course_id=$1 AND version=1",
        [draft.id],
      )
    ).rows[0].definition;
    assert.equal(persisted.levels[0].questions[0].answer, 0);
    assert.equal(
      accepted(await f.answer(draft.id, first)).questionIndex,
      1,
      "Old answer key remains in force",
    );
    const catalogue = await f.request(
      "GET",
      "/api/courses?limit=1&offset=0&q=revised",
      undefined,
      "",
    );
    assert.equal(
      catalogue.json<{ total: number; courses: { version: number }[] }>().total,
      1,
    );
    assert.equal(
      catalogue.json<{ courses: { version: number }[] }>().courses[0].version,
      2,
    );
    assert.equal(
      (await f.request("GET", "/api/courses?offset=1&limit=1")).json<{
        total: number;
        courses: unknown[];
      }>().courses.length,
      0,
    );
    assert.equal(
      (await f.request("GET", "/api/courses?limit=25")).statusCode,
      400,
    );
    const myLearning = (
      await f.request("GET", "/api/learning", undefined, f.learner.cookie)
    ).json<{ courses: { courseId: string; version: number }[] }>();
    assert.deepEqual(
      myLearning.courses.map((c) => [c.courseId, c.version]),
      [[draft.id, 1]],
    );
    assert.deepEqual(
      (
        await f.request("GET", "/api/learning", undefined, f.tutor.cookie)
      ).json<{ courses: unknown[] }>().courses,
      [],
    );
    assert.equal(
      (
        await f.request(
          "GET",
          `/api/learning/${draft.id}`,
          undefined,
          f.tutor.cookie,
        )
      ).statusCode,
      404,
    );
  } finally {
    await f.close();
  }
});

test("authored runner preserves chunk order, tracks help and blocks exhausted fresh retries without mastery", async () => {
  const f = await fixture();
  try {
    const draft = await f.create();
    await f.publish(draft);
    let progress = await f.enroll(draft.id);
    assert.equal(
      (
        await f.request(
          "POST",
          `/api/learning/${draft.id}/answer`,
          {
            questionId: "prepare:primary:prepare-q2",
            answer: 0,
            elapsedMs: 10,
          },
          f.learner.cookie,
        )
      ).statusCode,
      409,
    );
    const helpedQuestion = progress.question!.id;
    const helped = await f.request(
      "POST",
      `/api/learning/${draft.id}/help`,
      { questionId: helpedQuestion },
      f.learner.cookie,
    );
    assert.equal(helped.statusCode, 200);
    assert.ok(helped.json<{ explanation: string }>().explanation);
    assert.equal(
      (
        await f.request(
          "GET",
          `/api/learning/${draft.id}`,
          undefined,
          f.learner.cookie,
        )
      ).json<LearningProgress>().assisted,
      true,
    );
    progress = accepted(await f.answer(draft.id, progress));
    assert.equal(progress.retry, true);
    assert.equal(progress.points, 0);
    assert.equal(progress.result, undefined);
    const outcomes = await Promise.all([
      f.answer(draft.id, progress),
      f.answer(draft.id, progress),
    ]);
    assert.deepEqual(outcomes.map((r) => r.statusCode).sort(), [200, 409]);
    progress = accepted(outcomes.find((r) => r.statusCode === 200)!);
    await f.request(
      "POST",
      `/api/learning/${draft.id}/help`,
      { questionId: progress.question!.id },
      f.learner.cookie,
    );
    progress = accepted(await f.answer(draft.id, progress));
    assert.equal(progress.blocked, true);
    assert.match(progress.blockReason!, /Retry bank exhausted/);
    assert.equal(progress.question, undefined);
    assert.equal(progress.finished, false);
    assert.equal(progress.points, 0);
    assert.deepEqual(progress.completedLevelIds, []);
    assert.equal(
      (
        await f.request(
          "POST",
          `/api/learning/${draft.id}/help`,
          { questionId: helpedQuestion },
          f.learner.cookie,
        )
      ).statusCode,
      409,
    );
    assert.equal(
      (await f.enroll(draft.id)).blocked,
      true,
      "Re-entry cannot reuse revealed prompts",
    );
    const chunks = (
      await f.db.query<{ assisted: boolean; retry: boolean }>(
        "SELECT assisted,retry FROM course_chunks WHERE course_id=$1 ORDER BY created_at",
        [draft.id],
      )
    ).rows;
    assert.equal(chunks.length, 3);
    assert.equal(chunks.filter((c) => c.assisted).length, 2);
    assert.equal(
      (
        await f.db.query<{ points: number }>(
          "SELECT points FROM players WHERE id=$1",
          [f.learner.playerId],
        )
      ).rows[0].points,
      0,
    );
    assert.equal(
      (
        await f.request(
          "GET",
          `/api/learning/${draft.id}`,
          undefined,
          f.learner.cookie,
        )
      ).json<LearningProgress>().blocked,
      true,
    );
  } finally {
    await f.close();
  }
});

test("independent clearance awards exactly once and mock routing selects an eligible authored level", async () => {
  const f = await fixture();
  try {
    const draft = await f.create();
    await f.publish(draft);
    let progress = await f.enroll(draft.id);
    progress = accepted(await f.answer(draft.id, progress));
    const pending = progress;
    const outcomes = await Promise.all([
      f.answer(draft.id, pending),
      f.answer(draft.id, pending),
    ]);
    assert.deepEqual(outcomes.map((r) => r.statusCode).sort(), [200, 409]);
    progress = accepted(outcomes.find((r) => r.statusCode === 200)!);
    assert.equal(progress.levelId, "evaluate");
    assert.equal(progress.points, 40);
    assert.deepEqual(progress.completedLevelIds, ["prepare"]);
    assert.deepEqual(progress.result, {
      mocked: true,
      label: "Independent checkpoint clear",
      nextLevelId: "evaluate",
      awardedPoints: 40,
    });
    assert.equal((await f.answer(draft.id, pending)).statusCode, 409);
    progress = accepted(await f.answer(draft.id, progress));
    assert.equal(progress.finished, true);
    assert.equal(progress.points, 100);
    assert.equal(progress.result!.nextLevelId, null);
    assert.deepEqual(progress.completedLevelIds, ["prepare", "evaluate"]);
    assert.equal(
      (
        await f.db.query<{ points: number }>(
          "SELECT points FROM players WHERE id=$1",
          [f.learner.playerId],
        )
      ).rows[0].points,
      100,
    );
    assert.equal(
      (
        await f.db.query("SELECT * FROM course_chunks WHERE course_id=$1", [
          draft.id,
        ])
      ).rows.length,
      3,
    );
    assert.equal((await f.enroll(draft.id)).points, 100);
  } finally {
    await f.close();
  }
});

test("a wrong retry consumes its prompt and one remaining answer cannot satisfy two independent checkpoints", async () => {
  const f = await fixture();
  try {
    const draft = await f.create();
    await f.publish(draft);
    let progress = await f.enroll(draft.id);
    progress = accepted(await f.answer(draft.id, progress, 1));
    const firstRetry = progress;
    progress = accepted(await f.answer(draft.id, progress, 1));
    assert.notEqual(progress.question!.id, firstRetry.question!.id);
    assert.equal((await f.answer(draft.id, firstRetry)).statusCode, 409);
    progress = accepted(await f.answer(draft.id, progress));
    assert.equal(progress.levelId, "prepare");
    assert.equal(progress.points, 0);
    assert.equal(progress.blocked, true);
    assert.equal(progress.result, undefined);
    const learnerRows = (
      await f.db.query<{ progress: { usedRetryQuestionIds: string[] } }>(
        "SELECT progress FROM course_enrollments WHERE course_id=$1 AND player_id=$2",
        [draft.id, f.learner.playerId],
      )
    ).rows;
    assert.deepEqual(learnerRows[0].progress.usedRetryQuestionIds, [
      "prepare-r1",
      "prepare-r2",
    ]);
  } finally {
    await f.close();
  }
});

test("a complete independent retry bank clears once while help on its first item cannot earn missing credit", async () => {
  const f = await fixture();
  try {
    const draft = await f.create();
    await f.publish(draft);
    let progress = await f.enroll(draft.id);
    progress = accepted(await f.answer(draft.id, progress, 1));
    progress = accepted(await f.answer(draft.id, progress));
    assert.equal(progress.points, 0);
    assert.equal(progress.result, undefined);
    progress = accepted(await f.answer(draft.id, progress));
    assert.equal(progress.points, 40);
    assert.equal(progress.result!.label, "Independent retry checkpoint clear");
    assert.equal(progress.levelId, "evaluate");

    const second = await f.create();
    await f.publish(second);
    progress = await f.enroll(second.id);
    progress = accepted(await f.answer(second.id, progress, 1));
    const firstRetry = progress.question!.id;
    assert.equal(
      (
        await f.request(
          "POST",
          `/api/learning/${second.id}/help`,
          { questionId: firstRetry },
          f.learner.cookie,
        )
      ).statusCode,
      200,
    );
    progress = accepted(await f.answer(second.id, progress));
    progress = accepted(await f.answer(second.id, progress));
    assert.equal(progress.points, 0);
    assert.equal(progress.blocked, true);
    assert.deepEqual(progress.completedLevelIds, []);
    assert.equal(progress.result, undefined);
    assert.equal(
      (
        await f.answer(second.id, {
          ...progress,
          question: { id: firstRetry, prompt: "", options: [] },
        })
      ).statusCode,
      409,
    );
  } finally {
    await f.close();
  }
});

test("retry coverage targets the missing primary criterion and skips already satisfied retry variants", async () => {
  const f = await fixture();
  try {
    const draft = await f.create();
    await f.publish(draft);
    let progress = await f.enroll(draft.id);
    progress = accepted(await f.answer(draft.id, progress));
    await f.request(
      "POST",
      `/api/learning/${draft.id}/help`,
      { questionId: progress.question!.id },
      f.learner.cookie,
    );
    progress = accepted(await f.answer(draft.id, progress));
    assert.equal(progress.question!.id, "prepare:retry:prepare-r2");
    assert.equal(progress.questionIndex, 1);
    progress = accepted(await f.answer(draft.id, progress));
    assert.equal(progress.levelId, "evaluate");
    assert.equal(
      progress.points,
      40,
      "The actual missing criterion has a fresh independent result",
    );

    const course = authoredCourse();
    const first = course.levels[0].retryQuestions[0];
    const extra = {
      ...first,
      id: "prepare-r1-extra",
      prompt:
        "A reserved evaluation story was copied into training. Which split policy fixes that mistake?",
    };
    course.levels[0].retryQuestions.splice(1, 0, extra);
    const secondDraft = await f.create(course);
    await f.publish(secondDraft);
    progress = await f.enroll(secondDraft.id);
    progress = accepted(await f.answer(secondDraft.id, progress, 1));
    progress = accepted(await f.answer(secondDraft.id, progress));
    assert.equal(progress.question!.id, "prepare:retry:prepare-r2");
    assert.equal(
      progress.questionIndex,
      2,
      "Another variant for the already covered first criterion is skipped",
    );
    assert.equal(
      (
        await f.request(
          "POST",
          `/api/learning/${secondDraft.id}/answer`,
          {
            questionId: "prepare:retry:prepare-r1-extra",
            answer: 0,
            elapsedMs: 100,
          },
          f.learner.cookie,
        )
      ).statusCode,
      409,
    );
    assert.equal(
      progress.points,
      0,
      "One criterion cannot count twice toward independent clearance",
    );
    progress = accepted(await f.answer(secondDraft.id, progress, 1));
    assert.equal(progress.blocked, true);
    assert.equal(progress.points, 0);
    const saved = (
      await f.db.query<{ progress: { satisfiedQuestionIds: string[] } }>(
        "SELECT progress FROM course_enrollments WHERE course_id=$1 AND player_id=$2",
        [secondDraft.id, f.learner.playerId],
      )
    ).rows[0].progress;
    assert.deepEqual(saved.satisfiedQuestionIds, ["prepare-q1"]);
  } finally {
    await f.close();
  }
});

test("pending post-clearance classification survives reload and retries without duplicate rewards", async () => {
  let fail = true;
  const f = await fixture({
    ...mockProvider,
    route: async (input) => {
      if (fail) throw new Error("Unavailable");
      return mockProvider.route(input);
    },
  });
  try {
    const draft = await f.create();
    await f.publish(draft);
    let progress = await f.enroll(draft.id);
    progress = accepted(await f.answer(draft.id, progress));
    assert.equal(
      (await f.db.query("SELECT * FROM course_assessments")).rows.length,
      0,
    );
    progress = accepted(await f.answer(draft.id, progress));
    assert.equal(progress.assessment?.status, "pending");
    assert.equal(progress.question, undefined);
    assert.equal(progress.points, 40);
    const saved = accepted(
      await f.request(
        "GET",
        `/api/learning/${draft.id}`,
        undefined,
        f.learner.cookie,
      ),
    );
    assert.equal(saved.assessment?.status, "pending");
    fail = false;
    progress = accepted(
      await f.request(
        "POST",
        `/api/learning/${draft.id}/classify`,
        {},
        f.learner.cookie,
      ),
    );
    assert.equal(progress.assessment?.status, "confirmed");
    assert.equal(progress.levelId, "evaluate");
    assert.equal(progress.points, 40);
    assert.equal(
      (
        await f.db.query<{ points: number }>(
          "SELECT points FROM players WHERE id=$1",
          [f.learner.playerId],
        )
      ).rows[0].points,
      40,
    );
    assert.equal(
      (
        await f.request(
          "POST",
          `/api/learning/${draft.id}/classify`,
          {},
          f.learner.cookie,
        )
      ).statusCode,
      409,
    );
  } finally {
    await f.close();
  }
});

test("game deadlines retry only the failed step and reward/shop transactions remain idempotent", async () => {
  let clock = 100000;
  const f = await fixture(undefined, () => clock);
  try {
    const definition = authoredCourse();
    definition.levels[0].timeLimitSeconds = 15;
    definition.levels[0].theme = "temple-chase";
    const draft = await f.create(definition);
    await f.publish(draft);
    let p = await f.enroll(draft.id);
    p = accepted(await f.answer(draft.id, p));
    assert.equal(p.levelProgress?.cleared, 1);
    const command = (name: string, extra = {}) =>
      f.request(
        "POST",
        `/api/learning/${draft.id}/${name}`,
        { questionId: p.question!.id, ...extra },
        f.learner.cookie,
      );
    p = accepted(await command("play"));
    for (let i = 0; i < 3; i++) {
      clock += 5000;
      p = accepted(await command("tick"));
    }
    assert.equal(p.game?.status, "game-over");
    assert.equal(p.levelProgress?.cleared, 1);
    assert.equal(p.points, 0);
    const oldId = p.question!.id;
    p = accepted(await command("play"));
    assert.notEqual(p.question!.id, oldId);
    assert.equal(
      (
        await f.request(
          "POST",
          `/api/learning/${draft.id}/answer`,
          { questionId: oldId, answer: 0, elapsedMs: 0 },
          f.learner.cookie,
        )
      ).statusCode,
      409,
    );
    p = accepted(await f.answer(draft.id, p));
    assert.equal(p.points, 40);
    p = accepted(await f.answer(draft.id, p));
    assert.equal(p.finished, true);
    const rewards = (
      await f.request("GET", "/api/rewards", undefined, f.learner.cookie)
    ).json();
    assert.equal(rewards.badges.length, 1);
    const buys = await Promise.all(
      [1, 2].map(() =>
        f.request(
          "POST",
          "/api/rewards/buy",
          { gearId: "azure" },
          f.learner.cookie,
        ),
      ),
    );
    assert(buys.every((r) => r.statusCode === 200));
    const after = (
      await f.request("GET", "/api/rewards", undefined, f.learner.cookie)
    ).json();
    assert.equal(after.points, 60);
    assert.equal(after.outfit, "azure");
    assert.deepEqual(after.inventory, ["azure"]);
    assert.equal(
      (
        await f.db.query("SELECT * FROM reward_ledger WHERE player_id=$1", [
          f.learner.playerId,
        ])
      ).rows.length,
      3,
    );
    assert.equal(
      (
        await f.request(
          "POST",
          "/api/rewards/equip",
          { gearId: "plum" },
          f.learner.cookie,
        )
      ).statusCode,
      403,
    );
    assert.equal(
      (
        await f.request(
          "POST",
          "/api/rewards/buy",
          { gearId: "plum" },
          f.learner.cookie,
        )
      ).statusCode,
      409,
    );
    assert.equal(
      (
        await f.request(
          "POST",
          "/api/rewards/buy",
          { gearId: "invented" },
          f.learner.cookie,
        )
      ).statusCode,
      400,
    );
    assert.equal(
      (await f.request("POST", "/api/rewards/buy", { gearId: "azure" }, ""))
        .statusCode,
      401,
    );
    await f.db.query("UPDATE players SET points=25 WHERE id=$1", [
      f.tutor.playerId,
    ]);
    await initializeSchema(f.db);
    await initializeSchema(f.db);
    const opening = (
      await f.db.query<{ amount: number }>(
        "SELECT amount FROM reward_ledger WHERE player_id=$1 AND event_id='opening:step4'",
        [f.tutor.playerId],
      )
    ).rows;
    assert.deepEqual(opening, [{ amount: 25 }]);
    const total = (
      await f.db.query<{ total: string }>(
        "SELECT SUM(amount) AS total FROM reward_ledger WHERE player_id=$1",
        [f.learner.playerId],
      )
    ).rows[0];
    assert.equal(Number(total.total), 60);
  } finally {
    await f.close();
  }
});
