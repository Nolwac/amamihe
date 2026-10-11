import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { openDatabase } from "../server/db.js";
import { initializeSchema } from "../server/schema.js";
import { initializeCourseSchema, registerCourses } from "../server/courses.js";
import { publishPilotCourse } from "../server/pilot-course.js";
import { Authentication } from "../server/auth.js";
import { STORYTELLING_COURSE_ID } from "../shared/catalogue.js";
import { storytellingCourse } from "../server/course-template.js";
import Fastify from "fastify";
import cookie from "@fastify/cookie";

test("the maintained pilot is published once, exposes all levels, and preserves pinned progress and tutor drafts", async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), "amamihe-pilot-"));
  const db = await openDatabase({ dataDir });
  const app = Fastify();
  try {
    await initializeSchema(db);
    await initializeCourseSchema(db);
    const first = await publishPilotCourse(db);
    assert.equal(first.version, 1);
    assert.deepEqual(await publishPilotCourse(db), first);
    const auth = new Authentication(
      db,
      { async send() {} },
      "pilot-test-secret-at-least-thirty-two-characters",
    );
    await app.register(cookie);
    registerCourses(app, db, auth);
    const catalogue = await app.inject("/api/courses");
    assert.equal(catalogue.json().courses[0].id, STORYTELLING_COURSE_ID);
    assert.equal(catalogue.json().courses[0].levelCount, 6);
    const publicCourse = (await app.inject(`/api/courses/${first.id}`)).json();
    assert.equal(publicCourse.definition.levels.length, 6);
    assert.equal(
      publicCourse.definition.levels.reduce(
        (sum: number, l: { questions: unknown[] }) => sum + l.questions.length,
        0,
      ),
      12,
    );
    assert.equal(
      publicCourse.definition.levels[0].questions[0].answer,
      undefined,
    );
    assert.equal(
      (await app.inject(`/api/studio/courses/${first.id}`)).statusCode,
      401,
    );
    await db.query(
      "INSERT INTO players(id,token,name,outfit) VALUES('pilot-learner','private-test-token','Learner','teal')",
    );
    await db.query(
      "INSERT INTO course_enrollments(course_id,player_id,version,progress) VALUES($1,'pilot-learner',1,$2)",
      [
        first.id,
        JSON.stringify({
          levelId: "parameters-level",
          completedLevelIds: ["data-level"],
          points: 40,
        }),
      ],
    );
    const tutorDefinition = {
      ...storytellingCourse(),
      title: "Tutor-owned course",
    };
    await db.query(
      "INSERT INTO course_drafts(id,owner_id,definition) VALUES('tutor-course','pilot-learner',$1)",
      [JSON.stringify(tutorDefinition)],
    );
    // Simulate a previously published maintained revision that needs updating.
    await db.query(
      "UPDATE course_drafts SET definition=jsonb_set(definition,'{title}',to_jsonb('Older maintained title'::text)) WHERE id=$1",
      [first.id],
    );
    const second = await publishPilotCourse(db);
    assert.equal(second.version, 2);
    assert.deepEqual(await publishPilotCourse(db), second);
    const enrolled = (
      await db.query<{ version: number; progress: { points: number } }>(
        "SELECT version,progress FROM course_enrollments WHERE player_id='pilot-learner'",
      )
    ).rows[0];
    assert.equal(enrolled.version, 1);
    assert.equal(enrolled.progress.points, 40);
    assert.deepEqual(
      (
        await db.query<{ definition: unknown }>(
          "SELECT definition FROM course_drafts WHERE id='tutor-course'",
        )
      ).rows[0].definition,
      tutorDefinition,
    );
    assert.equal(
      (await app.inject(`/api/courses/${first.id}?version=1`)).statusCode,
      200,
    );
  } finally {
    await app.close();
    await db.close();
    await rm(dataDir, { recursive: true, force: true });
  }
});
