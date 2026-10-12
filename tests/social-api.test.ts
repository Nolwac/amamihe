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
import { initializeSocialSchema, registerSocial } from "../server/social.js";
import { storytellingCourse } from "../server/course-template.js";
import type { Authentication } from "../server/auth.js";
import { validPosition } from "../shared/social.js";
test("course traversal bounds preserve finite city and heading limits", () => {
  assert.equal(validPosition({ x: 0, z: 45, heading: 0 }), false);
  assert.equal(validPosition({ x: 0, z: -11, heading: 0 }), true);
  assert.equal(validPosition({ x: 0, z: 10, heading: 0 }), true);
  assert.equal(validPosition({ x: 0, z: 45, heading: 0 }, "course"), true);
  assert.equal(validPosition({ x: 5, z: 100000, heading: 0 }, "course"), true);
  for (const position of [
    { x: 5.01, z: 45, heading: 0 },
    { x: 0, z: -0.01, heading: 0 },
    { x: 0, z: 100001, heading: 0 },
    { x: 0, z: Infinity, heading: 0 },
    { x: 0, z: 45, heading: NaN },
    { x: 0, z: 45, heading: Math.PI * 2 + 0.1 },
  ])
    assert.equal(validPosition(position, "course"), false);
});
test("eight-player rooms, private four-player teams, consent, validated battles, moderation and rewards survive replay/disconnection", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "amamihe-social-test-")),
    db = await openDatabase({ dataDir: dir }),
    app = Fastify();
  let now = Date.UTC(2026, 9, 11, 12);
  try {
    await initializeSchema(db);
    await initializeCourseSchema(db);
    await initializeSocialSchema(db);
    await app.register(cookie);
    const auth = {
      player: async (token: string) =>
        /^p[0-8]$/.test(token || "") ? { id: token } : null,
    } as unknown as Authentication;
    registerSocial(app, db, auth, () => now, ["p8"]);
    for (let i = 0; i < 9; i++)
      await db.query(
        "INSERT INTO players(id,token,name,outfit) VALUES($1,$1,$1,'teal')",
        ["p" + i],
      );
    const def = storytellingCourse();
    await db.query(
      "INSERT INTO course_drafts(id,owner_id,definition) VALUES('course','p0',$1)",
      [JSON.stringify(def)],
    );
    await db.query(
      "INSERT INTO course_versions(course_id,version,source_revision,definition) VALUES('course',1,1,$1)",
      [JSON.stringify(def)],
    );
    for (let i = 0; i < 8; i++)
      await db.query(
        "INSERT INTO course_enrollments(course_id,player_id,version,progress) VALUES('course',$1,1,$2)",
        [
          "p" + i,
          JSON.stringify({ levelId: def.levels[0].id, completedLevelIds: [] }),
        ],
      );
    const call = (
      p: string,
      method: "GET" | "POST",
      url: string,
      payload?: unknown,
    ) =>
      app.inject({
        method,
        url,
        payload: payload as any,
        headers: { cookie: "amamihe=" + p },
      });
    const post = (p: string, url: string, body: unknown) =>
      call(p, "POST", "/api/social" + url, body);
    const get = (p: string) => call(p, "GET", "/api/social");
    assert.equal((await get("")).statusCode, 401);
    const coursePosition = { x: 1.65, z: 45, heading: 0 };
    for (const body of [
      { position: coursePosition },
      { space: "city", levelId: def.levels[0].id, position: coursePosition },
      {
        space: "missing-course",
        levelId: def.levels[0].id,
        position: coursePosition,
      },
      { space: "course", levelId: "unearned-level", position: coursePosition },
      { space: { course: "course" }, position: coursePosition },
    ])
      assert.equal((await post("p0", "/presence", body)).statusCode, 409);
    assert.equal(
      (
        await post("p8", "/presence", {
          space: "course",
          levelId: def.levels[0].id,
          position: coursePosition,
        })
      ).statusCode,
      409,
    );
    const joined = await post("p0", "/presence", {
      space: "course",
      levelId: def.levels[0].id,
      position: coursePosition,
    });
    assert.equal(joined.statusCode, 200);
    assert.equal(joined.json().room, `course:course:v1:${def.levels[0].id}:0`);
    const savedPosition = (
      await db.query<{ x: number; z: number }>(
        "SELECT x,z FROM social_presence WHERE player_id='p0'",
      )
    ).rows[0];
    assert.deepEqual(savedPosition, { x: 1.65, z: 45 });
    for (let i = 0; i < 9; i++)
      assert.equal(
        (
          await post("p" + i, "/presence", {
            space: "city",
            position: { x: i / 2, z: 0, heading: 0 },
          })
        ).statusCode,
        200,
      );
    const rooms = (
      await db.query<{ count: string }>(
        "SELECT count(*) AS count FROM social_presence GROUP BY room ORDER BY count(*) DESC",
      )
    ).rows;
    assert.deepEqual(
      rooms.map((r) => Number(r.count)),
      [8, 1],
    );
    assert.equal((await get("p0")).json().presence.length, 7);
    assert.equal(
      (await post("p0", "/presence", { position: { x: 99, z: 0, heading: 0 } }))
        .statusCode,
      409,
    );
    assert.equal(
      (
        await post("p0", "/presence", {
          position: { x: 0, z: 0, heading: 0 },
          signal: "arbitrary chat",
        })
      ).statusCode,
      409,
    );
    await post("p0", "/block", { targetId: "p1" });
    assert.equal((await get("p0")).json().presence.length, 6);
    await post("p0", "/unblock", { targetId: "p1" });
    await post("p0", "/report", { targetId: "p1", reason: "harassment" });
    assert.equal(
      (await call("p2", "GET", "/api/social/moderation")).statusCode,
      409,
    );
    const reports = (await call("p8", "GET", "/api/social/moderation")).json();
    assert.equal(reports.length, 1);
    await post("p1", "/presence", {
      space: "city",
      position: { x: 0, z: 0, heading: 0 },
      signal: "Hello",
    });
    await post("p8", "/moderation", {
      targetId: "p1",
      reportId: reports[0].id,
      action: "mute",
    });
    assert.equal(
      (await get("p0")).json().presence.find((p: any) => p.id === "p1").signal,
      "",
    );
    await post("p1", "/presence", {
      space: "city",
      position: { x: 0, z: 0, heading: 0 },
      signal: "Hello",
    });
    assert.equal(
      (await get("p0")).json().presence.find((p: any) => p.id === "p1").signal,
      "",
    );
    await post("p0", "/teams", { name: "Alpha" });
    await post("p4", "/teams", { name: "Beta" });
    let a = (await get("p0")).json().team,
      b = (await get("p4")).json().team;
    for (let i = 1; i < 4; i++)
      assert.equal(
        (await post("p" + i, "/teams/join", { invite: a.invite })).statusCode,
        200,
      );
    for (let i = 5; i < 8; i++)
      assert.equal(
        (await post("p" + i, "/teams/join", { invite: b.invite })).statusCode,
        200,
      );
    assert.equal(
      (await post("p8", "/teams/join", { invite: a.invite })).statusCode,
      409,
    );
    assert.equal(
      (await post("p1", "/teams/join", { invite: a.invite })).statusCode,
      200,
    );
    await db.query(
      "INSERT INTO course_versions(course_id,version,source_revision,definition) VALUES('course',2,2,$1)",
      [JSON.stringify({ ...def, title: "Updated course version" })],
    );
    const invitation = (
      await post("p0", "/battles", {
        opponentInvite: b.invite,
        courseId: "course",
      })
    ).json();
    assert.equal(invitation.status, "pending");
    assert.equal(invitation.courseVersion, 1);
    assert.equal(invitation.courseTitle, def.title);
    assert.deepEqual(invitation.questions, []);
    assert.equal(
      (await post("p0", "/battles/" + invitation.id + "/accept", {}))
        .statusCode,
      409,
    );
    assert.equal(
      (await call("p8", "GET", "/api/social/battles/" + invitation.id))
        .statusCode,
      409,
    );
    let battle = (
      await post("p4", "/battles/" + invitation.id + "/accept", {})
    ).json();
    assert.equal(battle.status, "active");
    assert.equal(battle.questions[0].answer, undefined);
    assert.equal((await post("p0", "/teams/leave", {})).statusCode, 409);
    assert.equal(
      (
        await post("p0", "/battles/" + battle.id + "/answer", {
          questionId: battle.questions[0].id,
          answer: 0,
          score: 999,
        })
      ).statusCode,
      409,
    );
    for (let i = 0; i < 8; i++) {
      for (const q of def.levels[0].questions.slice(0, 2)) {
        const answer = i < 4 ? q.answer : (q.answer + 1) % q.options.length;
        const response = await post(
          "p" + i,
          "/battles/" + battle.id + "/answer",
          { questionId: q.id, answer },
        );
        assert.equal(response.statusCode, 200);
        battle = response.json();
        if (i === 0) {
          assert.equal(
            (
              await post("p0", "/battles/" + battle.id + "/answer", {
                questionId: q.id,
                answer: (answer + 1) % 3,
              })
            ).statusCode,
            200,
          );
        }
      }
    }
    assert.equal(battle.status, "complete");
    for (let i = 0; i < 8; i++)
      assert.equal(battle.result.rewards["p" + i], i < 4 ? 20 : 5);
    const ledger = (
      await db.query<{ count: string }>(
        "SELECT count(*) AS count FROM reward_ledger WHERE event_id=$1",
        ["battle:" + battle.id],
      )
    ).rows[0];
    assert.equal(Number(ledger.count), 8);
    await call("p0", "GET", "/api/social/battles/" + battle.id);
    await post("p0", "/battles/" + battle.id + "/answer", {
      questionId: def.levels[0].questions[0].id,
      answer: 0,
    });
    assert.equal(
      Number(
        (
          await db.query<{ count: string }>(
            "SELECT count(*) AS count FROM reward_ledger WHERE event_id=$1",
            ["battle:" + battle.id],
          )
        ).rows[0].count,
      ),
      8,
    );
    assert.equal(
      (
        await db.query<{ progress: any }>(
          "SELECT progress FROM course_enrollments WHERE player_id='p0'",
        )
      ).rows[0].progress.completedLevelIds.length,
      0,
    );
    const next = (
      await post("p0", "/battles", {
        opponentInvite: b.invite,
        courseId: "course",
      })
    ).json();
    await post("p4", "/battles/" + next.id + "/accept", {});
    now += 600001;
    const expired = (
      await call("p0", "GET", "/api/social/battles/" + next.id)
    ).json();
    assert.equal(expired.status, "complete");
    assert.equal(expired.result.winningTeamId, null);
    assert.equal(expired.result.rewards.p0, 0);
    for (let round = 0; round < 3; round++) {
      const invited = (
        await post("p0", "/battles", {
          opponentInvite: b.invite,
          courseId: "course",
        })
      ).json();
      await post("p4", "/battles/" + invited.id + "/accept", {});
      const q = def.levels[0].questions[0];
      await post("p0", "/battles/" + invited.id + "/answer", {
        questionId: q.id,
        answer: (q.answer + 1) % 3,
      });
      now += 600001;
      const final = (
        await call("p0", "GET", "/api/social/battles/" + invited.id)
      ).json();
      assert.equal(final.result.rewards.p0, round < 2 ? 10 : 0);
      assert.equal(final.result.rewards.p4, 0);
    }

    await post("p0", "/presence", {
      space: "city",
      position: { x: 0, z: 0, heading: 0 },
    });
    assert.equal((await get("p0")).json().presence.length, 0);
  } finally {
    await app.close();
    await db.close();
    await rm(dir, { recursive: true, force: true });
  }
});
