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
import {
  advancePolicy,
  initializeWorldPolicySchema,
  registerWorldPolicy,
  type WorldPolicyState,
} from "../server/world-policy.js";
import type { Authentication } from "../server/auth.js";
import { storytellingCourse } from "../server/course-template.js";
test("hidden tabs, breaks, loading and disconnected gaps do not consume idle time", () => {
  const state: WorldPolicyState = {
    status: "free",
    idleMs: 599000,
    lastSeen: 1000,
    protection: "",
  };
  for (const mode of ["break", "hidden", "waiting"])
    assert.equal(advancePolicy(state, 6000, mode).idleMs, 599000);
  assert.equal(advancePolicy(state, 30000, "active").status, "free");
  assert.equal(advancePolicy(state, 6000, "active").status, "warned");
  assert.equal(
    advancePolicy({ ...state, idleMs: 899000 }, 6000, "active").status,
    "arrested",
  );
});
test("police fines, learning release and appeals are server-owned, bounded and replay-safe", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "amamihe-police-")),
    db = await openDatabase({ dataDir: dir }),
    app = Fastify();
  let now = 1000000;
  try {
    await initializeSchema(db);
    await initializeCourseSchema(db);
    await initializeWorldPolicySchema(db);
    await app.register(cookie);
    for (const id of ["player", "other", "moderator"])
      await db.query(
        "INSERT INTO players(id,token,name,outfit,points) VALUES($1,$1,$1,'teal',20)",
        [id],
      );
    const auth = {
      player: async (token: string) =>
        ["player", "other", "moderator"].includes(token) ? { id: token } : null,
    } as unknown as Authentication;
    registerWorldPolicy(app, db, auth, () => now, ["moderator"]);
    app.post("/api/learning/course/answer", async () => ({ saved: true }));
    const call = (id: string, payload?: any) =>
      app.inject({
        method: payload ? "POST" : "GET",
        url: "/api/world-policy",
        payload,
        headers: { cookie: "amamihe=" + id },
      });
    const seed = async () => {
      await db.query(
        "INSERT INTO world_policy(player_id,state) VALUES('player',$1) ON CONFLICT(player_id) DO UPDATE SET state=$1",
        [
          JSON.stringify({
            status: "warned",
            idleMs: 899000,
            lastSeen: now - 5000,
            protection: "",
          }),
        ],
      );
      return (
        await call("player", { action: "heartbeat", mode: "active" })
      ).json();
    };
    assert.equal((await call("")).statusCode, 401);
    const arrest = await seed();
    assert.equal(arrest.status, "arrested");
    await Promise.all([
      call("player", { action: "fine" }),
      call("player", { action: "fine" }),
    ]);
    assert.equal(
      (
        await db.query<{ points: number }>(
          "SELECT points FROM players WHERE id='player'",
        )
      ).rows[0].points,
      15,
    );
    assert.equal(
      (
        await db.query("SELECT * FROM reward_ledger WHERE event_id=$1", [
          "police:" + arrest.detentionId,
        ])
      ).rows.length,
      1,
    );
    await seed();
    const def = storytellingCourse();
    await db.query(
      "INSERT INTO course_drafts(id,owner_id,definition) VALUES('course','player',$1)",
      [JSON.stringify(def)],
    );
    await db.query(
      "INSERT INTO course_versions(course_id,version,source_revision,definition) VALUES('course',1,1,$1)",
      [JSON.stringify(def)],
    );
    await db.query(
      "INSERT INTO course_enrollments(course_id,player_id,version,progress) VALUES('course','player',1,'{}')",
    );
    assert.equal(
      (await call("player", { action: "release-course", courseId: "missing" }))
        .statusCode,
      409,
    );
    assert.equal(
      (await call("player", { action: "release-course", courseId: "course" }))
        .statusCode,
      200,
    );
    // Insert server-validated question fixtures, then exercise the successful activity hook.
    for (let i = 0; i < 2; i++)
      await db.query(
        "INSERT INTO course_chunks(course_id,player_id,delivery_id,level_id,question_id,retry,answer,correct,assisted,elapsed_ms) VALUES('course','player',$1,'level',$1,false,0,true,false,10)",
        ["q" + i],
      );
    await app.inject({
      method: "POST",
      url: "/api/learning/course/answer",
      payload: {},
      headers: { cookie: "amamihe=player" },
    });
    assert.equal((await call("player")).json().status, "free");
    await seed();
    await call("player", { action: "release-course", courseId: "course" });
    await db.query(
      "UPDATE course_enrollments SET progress='{\"finished\":true}' WHERE player_id='player' AND course_id='course'",
    );
    await db.query(
      "INSERT INTO course_chunks(course_id,player_id,delivery_id,level_id,question_id,retry,answer,correct,assisted,elapsed_ms) VALUES('course','player','q-final','level','q-final',false,0,true,false,10)",
    );
    await app.inject({
      method: "POST",
      url: "/api/learning/course/answer",
      payload: {},
      headers: { cookie: "amamihe=player" },
    });
    assert.equal((await call("player")).json().status, "free");
    await seed();
    await call("player", {
      action: "appeal",
      message: "The connection was interrupted.",
    });
    await call("player", { action: "appeal", message: "Repeated request" });
    assert.equal(
      (await db.query("SELECT * FROM world_policy_events WHERE event='appeal'"))
        .rows.length,
      1,
    );
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/api/world-policy/dismiss",
          payload: { playerId: "player" },
          headers: { cookie: "amamihe=other" },
        })
      ).statusCode,
      403,
    );
    await app.inject({
      method: "POST",
      url: "/api/world-policy/dismiss",
      payload: { playerId: "player" },
      headers: { cookie: "amamihe=moderator" },
    });
    assert.equal((await call("player")).json().status, "free");
  } finally {
    await app.close();
    await db.close();
    await rm(dir, { recursive: true, force: true });
  }
});
