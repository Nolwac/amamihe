import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import { openDatabase } from "../server/db.js";
import { initializeSchema } from "../server/schema.js";
import { initializeCourseSchema } from "../server/courses.js";
import { initializeReviewSchema, registerReviews } from "../server/reviews.js";
import { storytellingCourse } from "../server/course-template.js";
import type { Authentication } from "../server/auth.js";
test("review API pins authored content, restores open encounters, schedules help conservatively and rejects forged ownership", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "amamihe-review-test-"));
  const db = await openDatabase({ dataDir: dir });
  const app = Fastify();
  let now = Date.UTC(2026, 9, 11, 12);
  try {
    await initializeSchema(db);
    await initializeCourseSchema(db);
    await initializeReviewSchema(db);
    await app.register(cookie);
    const auth = {
      player: async (token: string) =>
        token === "learner" || token === "other" ? { id: token } : null,
    } as unknown as Authentication;
    registerReviews(app, db, auth, () => now);
    for (const p of ["learner", "other"])
      await db.query(
        "INSERT INTO players(id,token,name,outfit) VALUES($1,$1,$1,'teal')",
        [p],
      );
    const def = storytellingCourse();
    const l = def.levels[0];
    l.retryQuestions.push({
      ...l.retryQuestions[0],
      id: "third-review-variant",
    });
    await db.query(
      "INSERT INTO course_drafts(id,owner_id,definition) VALUES('course','learner',$1)",
      [JSON.stringify(def)],
    );
    await db.query(
      "INSERT INTO course_versions(course_id,version,source_revision,definition) VALUES('course',1,1,$1)",
      [JSON.stringify(def)],
    );
    await db.query(
      "INSERT INTO course_enrollments(course_id,player_id,version,progress) VALUES('course','learner',1,$1)",
      [JSON.stringify({ finished: true, completedLevelIds: [l.id] })],
    );
    await db.query(
      "INSERT INTO course_assessments(course_id,player_id,level_id,result,updated_at) VALUES('course','learner',$1,$2,$3)",
      [l.id, JSON.stringify({ status: "confirmed" }), new Date(now)],
    );
    const call = async (
      method: "GET" | "POST",
      url: string,
      payload?: unknown,
      token = "learner",
    ) =>
      app.inject({
        method,
        url,
        payload: payload as any,
        headers: { cookie: "amamihe=" + token },
      });
    assert.equal(
      (await call("GET", "/api/reviews", undefined, "")).statusCode,
      401,
    );
    const list = (await call("GET", "/api/reviews")).json();
    assert.equal(list.cards.length, 1);
    assert.equal(list.cards[0].dueNow, false);
    const binding = { courseId: "course", version: 1, levelId: l.id };
    const first = (await call("POST", "/api/reviews/start", binding)).json();
    assert.equal(first.early, true);
    assert.equal(first.question.answer, undefined);
    assert.equal(
      (await call("POST", "/api/reviews/start", binding)).json().id,
      first.id,
    );
    assert.equal(
      (await call("POST", "/api/reviews/" + first.id + "/help", {}, "other"))
        .statusCode,
      409,
    );
    let result = (
      await call("POST", "/api/reviews/" + first.id + "/answer", {
        answer: l.retryQuestions[0].answer,
      })
    ).json();
    assert.equal(result.independent, true);
    assert.equal(result.early, true);
    now += 86400001;
    const second = (await call("POST", "/api/reviews/start", binding)).json();
    await call("POST", "/api/reviews/" + second.id + "/help", {});
    result = (
      await call("POST", "/api/reviews/" + second.id + "/answer", {
        answer: l.retryQuestions[1].answer,
      })
    ).json();
    assert.equal(result.independent, false);
    assert.equal(result.early, false);
    assert.equal(
      (
        await call("POST", "/api/reviews/" + second.id + "/answer", {
          answer: 99,
        })
      ).json().due,
      result.due,
    );
    now = new Date(result.due).getTime() + 1;
    const third = (await call("POST", "/api/reviews/start", binding)).json();
    await call("POST", "/api/reviews/" + third.id + "/help", {});
    result = (
      await call("POST", "/api/reviews/" + third.id + "/answer", {
        answer: (l.retryQuestions[2].answer + 1) % 3,
      })
    ).json();
    assert.equal(result.window.remediate, true);
    assert.equal(result.pointsAwarded, 0);
    assert.equal(
      (await call("POST", "/api/reviews/start", binding)).statusCode,
      409,
    );
    assert.equal(
      (
        await db.query<{ points: number }>(
          "SELECT points FROM players WHERE id='learner'",
        )
      ).rows[0].points,
      0,
    );
    assert.equal(
      (await call("GET", "/api/reviews", undefined, "other")).json().cards
        .length,
      0,
    );
  } finally {
    await app.close();
    await db.close();
    await rm(dir, { recursive: true, force: true });
  }
});
