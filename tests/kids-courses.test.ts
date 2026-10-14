import { policyProvider } from "./provider-fixture.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import { openDatabase } from "../server/db.js";
import { initializeSchema } from "../server/schema.js";
import { initializeCourseSchema, registerCourses } from "../server/courses.js";
import { Authentication } from "../server/auth.js";
import { kidsCourses, publishKidsCourses } from "../server/kids-courses.js";
import { validateCourse, type LearningProgress } from "../shared/course.js";

test("children's worlds publish idempotently and complete independently without task deadlines or duplicate replay rewards", async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), "amamihe-kids-"));
  const db = await openDatabase({ dataDir });
  const app = Fastify();
  try {
    await initializeSchema(db);
    await initializeCourseSchema(db);
    await publishKidsCourses(db);
    await publishKidsCourses(db);
    assert.equal(
      (await db.query("SELECT * FROM course_versions")).rows.length,
      kidsCourses().length,
    );
    let message = "";
    const auth = new Authentication(
      db,
      {
        async send(m) {
          message = m.text;
        },
      },
      "kids-tests-secret-at-least-thirty-two-characters",
    );
    const pending = await auth.signup({
      name: "Family learner",
      email: "family@example.test",
      password: "test-password-for-kids",
      outfit: "teal",
    });
    const session = await auth.verify(
      pending.challengeId,
      message.match(/\b\d{6}\b/)![0],
    );
    await app.register(cookie);
    registerCourses(app, db, auth, policyProvider);
    const childCatalogue = (
      await app.inject("/api/courses?audience=kids")
    ).json();
    assert.equal(childCatalogue.total, kidsCourses().length);
    assert.ok(
      childCatalogue.courses.every((c: { id: string }) =>
        kidsCourses().some((k) => k.id === c.id),
      ),
    );
    assert.equal(
      (await app.inject("/api/courses?audience=unknown")).statusCode,
      400,
    );
    const post = async (url: string, payload: unknown) => {
      const r = await app.inject({
        method: "POST",
        url,
        payload: payload as Record<string, unknown>,
        headers: { cookie: `amamihe=${session.token}` },
      });
      assert.equal(r.statusCode, 200, r.body);
      return r.json<LearningProgress>();
    };
    for (const { id, definition } of kidsCourses()) {
      assert.deepEqual(validateCourse(definition), []);
      assert.ok(
        definition.levels.every(
          (l) => l.timeLimitSeconds === 0 && l.worldStyle,
        ),
      );
      const preview = (await app.inject(`/api/courses/${id}`)).json();
      assert.equal(preview.definition.levels[0].questions[0].answer, undefined);
      let p = await post(`/api/courses/${id}/enroll`, { version: 1 });
      assert.equal(p.level!.worldStyle, definition.levels[0].worldStyle);
      let answers = 0;
      while (!p.finished && answers < 10) {
        const l = definition.levels.find((l) => l.id === p.levelId)!;
        const q = [...l.questions, ...l.retryQuestions].find(
          (q) => q.prompt === p.question!.prompt,
        )!;
        await post(`/api/learning/${id}/play`, {
          questionId: p.question!.id,
          assist: true,
        });
        if (q.worldTask) {
          const rejected = await app.inject({
            method: "POST",
            url: `/api/learning/${id}/answer`,
            headers: { cookie: `amamihe=${session.token}` },
            payload: {
              questionId: p.question!.id,
              answer: q.answer,
              elapsedMs: 1000,
            },
          });
          assert.equal(
            rejected.statusCode,
            400,
            "A plain option cannot submit a physical learning challenge.",
          );
          const incompatible = await app.inject({
            method: "POST",
            url: `/api/learning/${id}/answer`,
            headers: { cookie: `amamihe=${session.token}` },
            payload: {
              questionId: p.question!.id,
              answer: q.answer,
              elapsedMs: 1000,
              worldEvidence: {
                kind: "circuit",
                switches: [false, false],
                pieces: [8],
              },
            },
          });
          assert.equal(incompatible.statusCode, 400);
        }
        p = await post(`/api/learning/${id}/answer`, {
          questionId: p.question!.id,
          answer: q.answer,
          ...(q.worldTask
            ? {
                worldEvidence:
                  q.worldTask.kind === "fraction-bridge"
                    ? {
                        kind: "fraction-bridge",
                        pieces: Array(q.answer + 1).fill(1),
                      }
                    : {
                        kind: "circuit",
                        switches: [
                          Boolean(q.answer & 1),
                          Boolean(q.answer & 2),
                        ],
                      },
              }
            : {}),
          elapsedMs: 1000,
        });
        answers++;
      }
      if (definition.levels[0].questions[0].worldTask) {
        assert.ok(p.worldAchievement?.question.worldTask);
        assert.equal("answer" in p.worldAchievement!.question, false);
        const rows = (
          await db.query(
            "SELECT world_evidence FROM course_chunks WHERE course_id=$1 ORDER BY created_at",
            [id],
          )
        ).rows;
        assert.equal(rows.length, 4);
        assert.ok(rows.every((row) => row.world_evidence));
      }
      assert.equal(p.finished, true);
      assert.equal(answers, 4);
      assert.equal(p.points, 20);
      assert.equal(
        p.journey?.completed,
        false,
        "Checkpoint clearance does not invent teaching-role participation.",
      );
      p = await post(`/api/learning/${id}/replay`, {
        scope: "course",
        checkpoint: p.checkpoint,
      });
      assert.equal(p.game!.budgetMs, 0);
      assert.equal(p.points, 20);
      p = await post(`/api/learning/${id}/resume-checkpoint`, {
        checkpoint: p.checkpoint,
      });
      assert.equal(p.finished, true);
      assert.equal(p.points, 20);
    }
  } finally {
    await app.close();
    await db.close();
    await rm(dataDir, { recursive: true, force: true });
  }
});

test("children's world styles cannot silently select incompatible physics", () => {
  const d = kidsCourses()[0].definition;
  d.levels[0].worldStyle = "pattern-track";
  assert.ok(validateCourse(d).some((i) => i.path.endsWith("worldStyle")));
});
