import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import Fastify, { type LightMyRequestResponse } from "fastify";
import cookie from "@fastify/cookie";
import { Authentication } from "../server/auth.js";
import {
  mockProvider,
  type ClassificationProvider,
} from "../server/assessment.js";
import { openDatabase } from "../server/db.js";
import { initializeSchema } from "../server/schema.js";
import { initializeCourseSchema, registerCourses } from "../server/courses.js";
import type {
  CourseDefinition,
  CourseDraft,
  LearningProgress,
  Theme,
} from "../shared/course.js";

function course(theme: Theme = "temple-chase"): CourseDefinition {
  const questions = (prefix: string) =>
    [1, 2].map((index) => ({
      id: `${prefix}-q${index}`,
      prompt: `Checkpoint ${index}: which dataset must remain separate from training?`,
      options: ["Held-out evaluation stories", "Optimizer training batches"],
      answer: 0,
      hint: "Measure generalization on unseen examples.",
      explanation:
        "Held-out examples measure generalization without training leakage.",
      rubric: "Identify the held-out evaluation dataset.",
    }));
  const levels = [
    {
      id: "prepare",
      theme: "workshop" as Theme,
      prerequisites: [],
      points: 40,
    },
    { id: "adventure", theme, prerequisites: ["prepare"], points: 60 },
  ].map((level) => ({
    ...level,
    title: `${level.id} story data`,
    conceptId: level.id,
    timeLimitSeconds: 120,
    resourceIds: ["reading"],
    widget: "quiz" as const,
    questions: questions(level.id),
    retryQuestions: questions(`${level.id}-retry`).map((question, index) => ({
      ...question,
      retryFor: `${level.id}-q${index + 1}`,
      prompt: `${question.prompt} Apply the same rule to a fresh dataset.`,
    })),
  }));
  return {
    title: "Server-authoritative adventure workshop",
    summary:
      "Learn held-out story evaluation through authored challenges and physical adventure encounters.",
    language: "en",
    concepts: [
      { id: "prepare", title: "Prepare stories", prerequisites: [] },
      {
        id: "adventure",
        title: "Evaluate stories",
        prerequisites: ["prepare"],
      },
    ],
    resources: [
      {
        id: "reading",
        title: "Reviewed evaluation guide",
        kind: "reading",
        content:
          "Split stories before training and hold back an evaluation set. Keep the evaluation examples outside the training optimizer.",
        url: "",
        source: "https://pytorch.org/docs/stable/",
      },
    ],
    levels,
  };
}

async function fixture(provider: ClassificationProvider = mockProvider) {
  let clock = 100_000;
  const directory = await mkdtemp(
    path.join(tmpdir(), "amamihe-adventure-api-"),
  );
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
    "adventure-test-secret-at-least-thirty-two-characters",
  );
  const app = Fastify({ bodyLimit: 16384 });
  await app.register(cookie);
  registerCourses(app, db, auth, provider, () => clock);
  await app.ready();
  async function account(email: string) {
    const pending = await auth.signup({
      name: "Adventure tester",
      email,
      password: "adventure-test-password",
      outfit: "teal",
    });
    const session = await auth.verify(
      pending.challengeId,
      messages.at(-1)!.match(/\b\d{6}\b/)![0],
    );
    return { cookie: `amamihe=${session.token}`, playerId: session.player!.id };
  }
  const tutor = await account("tutor@example.test");
  const learner = await account("learner@example.test");
  const request = (
    method: "GET" | "POST" | "PUT",
    url: string,
    payload?: unknown,
    session = learner.cookie,
  ) =>
    app.inject({
      method,
      url,
      ...(payload === undefined
        ? {}
        : { payload: payload as Record<string, unknown> }),
      headers: session ? { cookie: session } : {},
    });
  async function create(definition = course()) {
    const created = await request(
      "POST",
      "/api/studio/courses",
      { template: "blank" },
      tutor.cookie,
    );
    assert.equal(created.statusCode, 201, created.body);
    const draft = created.json<CourseDraft>();
    const saved = await request(
      "PUT",
      `/api/studio/courses/${draft.id}`,
      { revision: draft.revision, definition },
      tutor.cookie,
    );
    assert.equal(saved.statusCode, 200, saved.body);
    const publication = await request(
      "POST",
      `/api/studio/courses/${draft.id}/publish`,
      { revision: saved.json<CourseDraft>().revision },
      tutor.cookie,
    );
    assert.equal(publication.statusCode, 200, publication.body);
    return draft.id;
  }
  const enroll = async (id: string) =>
    accepted(
      await request("POST", `/api/courses/${id}/enroll`, { version: 1 }),
    );
  const command = (
    id: string,
    progress: LearningProgress,
    name: string,
    extra: Record<string, unknown> = {},
  ) =>
    request("POST", `/api/learning/${id}/${name}`, {
      questionId: progress.question!.id,
      ...extra,
    });
  async function answer(
    id: string,
    progress: LearningProgress,
    settings: Record<string, unknown> = {},
    choice = 0,
  ) {
    progress = accepted(await command(id, progress, "play", settings));
    return accepted(
      await command(id, progress, "answer", { answer: choice, elapsedMs: 0 }),
    );
  }
  async function balance() {
    return (
      await db.query<{ points: number }>(
        "SELECT points FROM players WHERE id=$1",
        [learner.playerId],
      )
    ).rows[0].points;
  }
  return {
    db,
    app,
    tutor,
    learner,
    create,
    enroll,
    request,
    command,
    answer,
    balance,
    advance(ms: number) {
      clock += ms;
    },
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

test("physical obstacle collisions are authoritative and retry preserves prior checkpoints and rewards", async () => {
  let grades = 0;
  const f = await fixture({
    ...mockProvider,
    async grade(input) {
      grades++;
      return mockProvider.grade(input);
    },
  });
  try {
    const id = await f.create();
    let progress = await f.enroll(id);
    progress = await f.answer(id, progress);
    progress = await f.answer(id, progress);
    assert.deepEqual(progress.completedLevelIds, ["prepare"]);
    assert.equal(progress.points, 40);
    assert.equal(grades, 2);
    progress = await f.answer(id, progress);
    assert.equal(progress.levelProgress?.cleared, 1);
    assert.equal(
      grades,
      2,
      "The next level has not cleared for classification",
    );
    progress = accepted(
      await f.command(id, progress, "play", { assist: false }),
    );
    assert.equal(progress.game?.adventure?.assist, false);
    const failedDelivery = progress.question!.id;
    f.advance(5000);
    progress = accepted(await f.command(id, progress, "tick"));
    assert.equal(progress.game?.status, "active");
    f.advance(3000);
    progress = accepted(await f.command(id, progress, "tick"));
    assert.equal(progress.game?.status, "game-over");
    assert.equal(progress.game?.adventure?.collision?.kind, "hurdle");
    assert(
      progress.game!.elapsedMs < progress.game!.budgetMs,
      "The physical hurdle caused failure before the timer deadline",
    );
    assert.equal(progress.levelProgress?.cleared, 1);
    assert.deepEqual(progress.completedLevelIds, ["prepare"]);
    assert.equal(progress.points, 40);
    assert.equal(await f.balance(), 40);
    const collision = progress.game?.adventure?.collision;
    progress = accepted(
      await f.command(id, progress, "answer", { answer: 0, elapsedMs: 0 }),
    );
    assert.deepEqual(progress.game?.adventure?.collision, collision);
    assert.equal(grades, 2);
    assert.equal(
      (await f.db.query("SELECT * FROM course_chunks WHERE course_id=$1", [id]))
        .rows.length,
      3,
    );
    const failedRun = progress.game!.run;
    progress = accepted(
      await f.command(id, progress, "play", { assist: false }),
    );
    assert.equal(progress.game?.run, failedRun + 1);
    assert.equal(progress.game?.adventure?.collision, null);
    assert.equal(progress.game?.adventure?.distance, 0);
    assert.notEqual(progress.question!.id, failedDelivery);
    assert.equal(progress.levelProgress?.cleared, 1);
    assert.deepEqual(progress.completedLevelIds, ["prepare"]);
    assert.equal(
      (
        await f.request("POST", `/api/learning/${id}/action`, {
          questionId: failedDelivery,
          run: failedRun,
          sequence: 1,
          action: "left",
        })
      ).statusCode,
      409,
    );
    assert.equal(
      (
        await f.request("POST", `/api/learning/${id}/answer`, {
          questionId: failedDelivery,
          answer: 0,
          elapsedMs: 0,
        })
      ).statusCode,
      409,
    );
    progress = accepted(
      await f.command(id, progress, "answer", { answer: 0, elapsedMs: 0 }),
    );
    assert.equal(progress.finished, true);
    assert.equal(progress.points, 100);
    assert.equal(await f.balance(), 100);
    assert.equal(grades, 4);
    assert.equal(
      (await f.db.query("SELECT * FROM course_chunks WHERE course_id=$1", [id]))
        .rows.length,
      4,
    );
    assert.equal(
      (
        await f.db.query("SELECT * FROM reward_ledger WHERE player_id=$1", [
          f.learner.playerId,
        ])
      ).rows.length,
      2,
    );
  } finally {
    await f.close();
  }
});

test("actions reject unauthenticated, stale, paused and invalid commands and make replay idempotent", async () => {
  const f = await fixture();
  try {
    const id = await f.create();
    let progress = await f.enroll(id);
    progress = await f.answer(id, progress);
    progress = await f.answer(id, progress);
    const action = (
      sequence: number,
      name = "left",
      extra: Record<string, unknown> = {},
    ) =>
      f.command(id, progress, "action", {
        run: progress.game!.run,
        sequence,
        action: name,
        ...extra,
      });
    assert.equal((await action(1)).statusCode, 409);
    assert.equal(
      (await f.command(id, progress, "play", { assist: "false" })).statusCode,
      400,
    );
    assert.equal(
      (await f.command(id, progress, "play", { multiplier: 3 })).statusCode,
      400,
    );
    progress = accepted(
      await f.command(id, progress, "play", { assist: false }),
    );
    assert.equal(
      (
        await f.request(
          "POST",
          `/api/learning/${id}/action`,
          {
            questionId: progress.question!.id,
            run: 0,
            sequence: 1,
            action: "left",
          },
          "",
        )
      ).statusCode,
      401,
    );
    assert.equal((await action(1, "teleport")).statusCode, 400);
    assert.equal((await action(1.5)).statusCode, 400);
    assert.equal((await action(2)).statusCode, 409);
    assert.equal(
      (await action(1, "left", { run: progress.game!.run + 1 })).statusCode,
      409,
    );
    assert.equal(
      (
        await action(1, "left", {
          questionId: "adventure:primary:adventure-q2",
        })
      ).statusCode,
      409,
    );
    const concurrent = await Promise.all([action(1), action(1)]);
    assert.deepEqual(
      concurrent.map((response) => response.statusCode).sort(),
      [200, 200],
    );
    progress = accepted(
      concurrent.find((response) => response.statusCode === 200)!,
    );
    assert.equal(progress.game?.adventure?.targetLane, -1);
    assert.equal(progress.game?.adventure?.actionSerial, 1);
    assert.equal(progress.game?.actionSequence, 1);
    const prior = progress.game;
    const replay = accepted(await action(1));
    assert.deepEqual(replay.game, prior);
    const saved = accepted(await f.request("GET", `/api/learning/${id}`));
    assert.deepEqual(
      saved.game,
      prior,
      "Replayed actions cannot move or reward the player",
    );
    progress = accepted(await f.command(id, progress, "pause"));
    f.advance(60_000);
    const pausedElapsed = progress.game!.elapsedMs;
    assert.equal((await action(2)).statusCode, 409);
    assert.equal(
      (await f.command(id, progress, "answer", { answer: 0, elapsedMs: 0 }))
        .statusCode,
      409,
    );
    progress = accepted(await f.command(id, progress, "tick"));
    assert.equal(progress.game?.elapsedMs, pausedElapsed);
    assert.equal(progress.game?.status, "paused");
    assert.equal(
      (await f.db.query("SELECT * FROM course_chunks WHERE course_id=$1", [id]))
        .rows.length,
      2,
    );
    progress = accepted(await f.command(id, progress, "play"));
    progress = accepted(await action(2, "right"));
    assert.equal(progress.game?.actionSequence, 2);
    assert.equal(progress.game?.adventure?.targetLane, 0);
    assert.equal(progress.game?.adventure?.actionSerial, 2);
    const replayRight = accepted(await action(2, "right"));
    assert.equal(
      replayRight.game?.adventure?.targetLane,
      0,
      "Replaying a right turn cannot apply a second lane change",
    );
    assert.equal(progress.points, 40);
    assert.equal(await f.balance(), 40);
    f.advance(5000);
    progress = accepted(await f.command(id, progress, "tick"));
    f.advance(2000);
    progress = accepted(await action(3, "jump"));
    assert.equal(progress.game?.adventure?.jumpStartedMs, 7000);
    f.advance(1100);
    progress = accepted(await f.command(id, progress, "tick"));
    assert.equal(progress.game?.status, "active");
    assert.equal(progress.game?.adventure?.collision, null);
    assert.equal(
      progress.game?.adventure?.obstaclesCleared,
      1,
      "A correctly timed accepted jump physically clears the center hurdle",
    );
    assert.equal(progress.points, 40);
    assert.equal(
      (await f.db.query("SELECT * FROM course_chunks WHERE course_id=$1", [id]))
        .rows.length,
      2,
    );
  } finally {
    await f.close();
  }
});

test("untimed assistance avoids physical exclusion while retaining answer-key mastery and bounded disconnected time", async () => {
  const f = await fixture();
  try {
    const id = await f.create();
    let progress = await f.enroll(id);
    progress = await f.answer(id, progress);
    progress = await f.answer(id, progress);
    progress = accepted(
      await f.command(id, progress, "play", { multiplier: 0, assist: false }),
    );
    assert.equal(progress.game?.budgetMs, 0);
    assert.equal(progress.game?.adventure?.assist, true);
    f.advance(3_600_000);
    progress = accepted(await f.command(id, progress, "tick"));
    assert.equal(progress.game?.elapsedMs, 5000);
    assert.equal(progress.game?.adventure?.elapsedMs, 5000);
    for (let i = 0; i < 3; i++) {
      f.advance(5000);
      progress = accepted(await f.command(id, progress, "tick"));
    }
    assert.equal(progress.game?.status, "active");
    assert.equal(progress.game?.adventure?.collision, null);
    assert(
      progress.game!.adventure!.obstaclesCleared >= 1,
      "Movement assistance actually passes a physical obstacle",
    );
    progress = accepted(
      await f.command(id, progress, "answer", { answer: 1, elapsedMs: 0 }),
    );
    assert.equal(progress.retry, true);
    assert.equal(progress.levelProgress?.cleared, 0);
    assert.equal(
      progress.points,
      40,
      "Avoiding obstacles does not confer mastery credit",
    );
    assert.equal(progress.assessment?.status, "confirmed");
    const wrongChunk = (
      await f.db.query<{
        correct: boolean;
        assisted: boolean;
        elapsed_ms: number;
      }>(
        "SELECT correct,assisted,elapsed_ms FROM course_chunks WHERE course_id=$1 AND level_id='adventure'",
        [id],
      )
    ).rows;
    assert.deepEqual(wrongChunk, [
      { correct: false, assisted: false, elapsed_ms: 20000 },
    ]);
    progress = await f.answer(id, progress, { multiplier: 0, assist: true });
    assert.equal(progress.levelProgress?.cleared, 1);
    progress = await f.answer(id, progress, { multiplier: 0, assist: true });
    assert.equal(progress.finished, true);
    assert.equal(progress.points, 100);
    assert.deepEqual(progress.assessment?.criteria, [
      { id: "adventure-q1", score: 1, independent: true },
      { id: "adventure-q2", score: 1, independent: true },
    ]);
    assert.equal(progress.assessment?.errorCount, 1);
    assert.equal(
      progress.assessment?.assistanceCount,
      0,
      "Motor assistance never disguises use of instructional hints",
    );
  } finally {
    await f.close();
  }
});

test("validated task success drives carried race speed and wrestling damage while free punches grant no progress", async () => {
  const f = await fixture();
  try {
    const racing = await f.create(course("racing"));
    let progress = await f.enroll(racing);
    progress = await f.answer(racing, progress);
    progress = await f.answer(racing, progress);
    progress = accepted(await f.command(racing, progress, "play"));
    f.advance(2000);
    progress = accepted(await f.command(racing, progress, "tick"));
    const firstDistance = progress.game!.adventure!.distance;
    assert(firstDistance >= 11 && firstDistance <= 13);
    progress = accepted(
      await f.command(racing, progress, "answer", { answer: 0, elapsedMs: 0 }),
    );
    assert.equal(progress.game?.status, "ready");
    assert.equal(
      progress.game?.adventure?.distance,
      firstDistance,
      "Completing a question must not teleport the avatar back to the starting line",
    );
    assert.equal(progress.game?.adventure?.taskProgress, 0.5);
    assert(
      progress.game!.adventure!.boostUntilMs >
        progress.game!.adventure!.elapsedMs,
    );
    assert.equal(progress.points, 40);
    progress = accepted(await f.command(racing, progress, "play"));
    f.advance(1000);
    progress = accepted(await f.command(racing, progress, "tick"));
    assert(
      progress.game!.adventure!.distance >= firstDistance + 8,
      "An accepted independent task must increase actual racing movement speed",
    );
    progress = accepted(
      await f.command(racing, progress, "answer", { answer: 0, elapsedMs: 0 }),
    );
    assert.equal(progress.finished, true);
    assert.equal(progress.points, 100);

    const wrestling = await f.create(course("wrestling"));
    progress = await f.enroll(wrestling);
    progress = await f.answer(wrestling, progress);
    progress = await f.answer(wrestling, progress);
    progress = accepted(
      await f.command(wrestling, progress, "play", { assist: false }),
    );
    progress = accepted(
      await f.command(wrestling, progress, "action", {
        run: progress.game!.run,
        sequence: 1,
        action: "strike",
      }),
    );
    assert.equal(progress.game?.adventure?.opponentHealth, 100);
    assert.equal(progress.game?.adventure?.strikes, 0);
    assert.equal(progress.game?.adventure?.taskProgress, 0);
    assert.equal(progress.points, 40);
    progress = accepted(
      await f.command(wrestling, progress, "answer", {
        answer: 0,
        elapsedMs: 0,
      }),
    );
    assert.equal(progress.game?.adventure?.opponentHealth, 50);
    assert.equal(progress.game?.adventure?.strikes, 1);
    assert.equal(progress.game?.adventure?.taskProgress, 0.5);
    assert.equal(progress.game?.status, "ready");
    assert.equal(progress.points, 40);
    progress = await f.answer(wrestling, progress);
    assert.equal(progress.finished, true);
    assert.equal(progress.points, 100);
    assert.equal(await f.balance(), 200);
    assert.equal(
      (
        await f.db.query("SELECT * FROM reward_ledger WHERE player_id=$1", [
          f.learner.playerId,
        ])
      ).rows.length,
      4,
      "Only independently cleared authored levels create reward ledger entries",
    );
  } finally {
    await f.close();
  }
});

test("a failed second task restores its nonzero airborne checkpoint without replaying earlier mastery", async () => {
  const f = await fixture();
  try {
    const definition = course();
    definition.levels[1].timeLimitSeconds = 15;
    const id = await f.create(definition);
    let progress = await f.enroll(id);
    progress = await f.answer(id, progress);
    progress = await f.answer(id, progress);
    progress = accepted(
      await f.command(id, progress, "play", { assist: false }),
    );
    f.advance(5000);
    progress = accepted(await f.command(id, progress, "tick"));
    f.advance(2000);
    progress = accepted(
      await f.command(id, progress, "action", {
        run: progress.game!.run,
        sequence: 1,
        action: "jump",
      }),
    );
    f.advance(800);
    progress = accepted(await f.command(id, progress, "tick"));
    assert.equal(progress.game?.status, "active");
    assert(
      progress.game!.adventure!.distance > 35 &&
        progress.game!.adventure!.distance < 37,
      "The first task is confirmed while airborne over a real center hurdle",
    );
    progress = accepted(
      await f.command(id, progress, "answer", { answer: 0, elapsedMs: 0 }),
    );
    assert.equal(progress.questionIndex, 1);
    assert.equal(progress.levelProgress?.cleared, 1);
    assert.equal(progress.game?.status, "ready");
    assert.equal(progress.game?.adventure?.jumpStartedMs, -800);
    assert.equal(progress.game?.adventure?.taskProgress, 0.5);
    progress = accepted(
      await f.command(id, progress, "play", { assist: false }),
    );
    const checkpoint = structuredClone(progress.game!.adventure!);
    const failedDelivery = progress.question!.id;
    f.advance(500);
    progress = accepted(await f.command(id, progress, "tick"));
    assert.equal(
      progress.game?.status,
      "active",
      "Carry must finish the existing jump rather than create a false contact on resume",
    );
    assert.equal(progress.game?.adventure?.obstaclesCleared, 1);
    for (let i = 0; i < 3 && progress.game?.status !== "game-over"; i++) {
      f.advance(5000);
      progress = accepted(await f.command(id, progress, "tick"));
    }
    assert.equal(progress.game?.status, "game-over");
    assert(
      progress.game?.adventure?.collision,
      "An authentic physical encounter or guardian deadline causes failure",
    );
    assert.equal(progress.points, 40);
    assert.equal(await f.balance(), 40);
    assert.equal(
      (await f.db.query("SELECT * FROM course_chunks WHERE course_id=$1", [id]))
        .rows.length,
      3,
    );
    assert.equal(
      (
        await f.db.query(
          "SELECT * FROM course_assessments WHERE course_id=$1 AND level_id='adventure'",
          [id],
        )
      ).rows.length,
      0,
    );
    progress = accepted(
      await f.command(id, progress, "play", { assist: false }),
    );
    assert.equal(progress.game?.run, 1);
    assert.notEqual(progress.question!.id, failedDelivery);
    assert.equal(progress.questionIndex, 1);
    assert.equal(progress.levelProgress?.cleared, 1);
    assert.deepEqual(progress.completedLevelIds, ["prepare"]);
    assert.equal(progress.game?.elapsedMs, 0);
    assert.equal(progress.game?.adventure?.collision, null);
    for (const field of [
      "distance",
      "rivalDistance",
      "taskProgress",
      "opponentHealth",
      "boostUntilMs",
      "jumpStartedMs",
      "laneX",
    ] as const) {
      assert.equal(
        progress.game?.adventure?.[field],
        checkpoint[field],
        `${field} resumes from the pre-task checkpoint`,
      );
    }
    assert.equal(
      progress.game?.adventure?.distance,
      checkpoint.distance,
      "Retry begins at the completed first task, rather than at the level entrance or failed position",
    );
    progress = accepted(
      await f.command(id, progress, "answer", { answer: 0, elapsedMs: 0 }),
    );
    assert.equal(progress.finished, true);
    assert.equal(progress.points, 100);
    assert.equal(await f.balance(), 100);
    assert.deepEqual(progress.assessment?.criteria, [
      { id: "adventure-q1", score: 1, independent: true },
      { id: "adventure-q2", score: 1, independent: true },
    ]);
    assert.equal(
      (await f.db.query("SELECT * FROM course_chunks WHERE course_id=$1", [id]))
        .rows.length,
      4,
    );
    assert.equal(
      (
        await f.db.query("SELECT * FROM reward_ledger WHERE player_id=$1", [
          f.learner.playerId,
        ])
      ).rows.length,
      2,
    );
  } finally {
    await f.close();
  }
});
