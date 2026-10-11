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
  adDestination,
  initializeAdvertisingSchema,
  registerAdvertising,
} from "../server/advertising.js";
import type { Authentication } from "../server/auth.js";
import { storytellingCourse } from "../server/course-template.js";
test("placements require moderator approval, enforce ownership and revoke with one audit event", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "amamihe-ads-")),
    db = await openDatabase({ dataDir: dir }),
    app = Fastify();
  try {
    await initializeSchema(db);
    await initializeCourseSchema(db);
    await initializeAdvertisingSchema(db);
    await app.register(cookie);
    for (const id of ["owner", "other", "moderator"])
      await db.query(
        "INSERT INTO players(id,token,name,outfit) VALUES($1,$1,$1,'teal')",
        [id],
      );
    const auth = {
      player: async (token: string) =>
        ["owner", "other", "moderator"].includes(token) ? { id: token } : null,
    } as unknown as Authentication;
    registerAdvertising(app, db, auth, ["moderator"]);
    const call = (
      id: string,
      method: "GET" | "POST",
      url: string,
      payload?: any,
    ) =>
      app.inject({
        method,
        url,
        payload,
        headers: { cookie: "amamihe=" + id },
      });
    const submitted = await call("owner", "POST", "/api/ads", {
      title: "Python opportunity",
      description: "Authored community learning",
      destination: "https://pytorch.org",
    });
    assert.equal(submitted.statusCode, 200);
    const id = submitted.json().id;
    assert.equal((await app.inject("/api/billboards")).json().length, 0);
    assert.equal(
      (
        await call("other", "POST", `/api/ads/${id}/action`, {
          action: "approve",
        })
      ).statusCode,
      409,
    );
    assert.equal(
      (
        await call("moderator", "POST", `/api/ads/${id}/action`, {
          action: "approve",
        })
      ).statusCode,
      200,
    );
    assert.equal(
      (await app.inject("/api/billboards")).json()[0].title,
      "Python opportunity",
    );
    assert.equal(
      (
        await call("other", "POST", `/api/ads/${id}/action`, {
          action: "withdraw",
        })
      ).statusCode,
      409,
    );
    await call("owner", "POST", `/api/ads/${id}/action`, {
      action: "withdraw",
    });
    await call("owner", "POST", `/api/ads/${id}/action`, {
      action: "withdraw",
    });
    assert.equal((await app.inject("/api/billboards")).json().length, 0);
    assert.equal(
      (
        await db.query<{ n: number }>(
          "SELECT count(*)::integer AS n FROM ad_events WHERE ad_id=$1",
          [id],
        )
      ).rows[0].n,
      3,
    );
    assert.equal(
      (
        await call("moderator", "POST", `/api/ads/${id}/action`, {
          action: "approve",
        })
      ).statusCode,
      409,
    );
    const def = storytellingCourse();
    await db.query(
      "INSERT INTO course_drafts(id,owner_id,definition) VALUES('course','owner',$1)",
      [JSON.stringify(def)],
    );
    await db.query(
      "INSERT INTO course_versions(course_id,version,source_revision,definition) VALUES('course',1,1,$1)",
      [JSON.stringify(def)],
    );
    const placement = {
      title: "Course resource",
      description: "Credible reference",
      destination: "https://pytorch.org/docs",
      courseId: "course",
      version: 1,
      levelId: def.levels[0].id,
    };
    assert.equal(
      (await call("other", "POST", "/api/ads", placement)).statusCode,
      409,
    );
    const courseAd = (await call("owner", "POST", "/api/ads", placement)).json()
      .id;
    await call("moderator", "POST", `/api/ads/${courseAd}/action`, {
      action: "approve",
    });
    assert.equal(
      (
        await app.inject(
          `/api/billboards?courseId=course&version=1&levelId=${def.levels[0].id}`,
        )
      ).json().length,
      1,
    );
    assert.equal(
      (
        await app.inject(
          `/api/billboards?courseId=course&version=2&levelId=${def.levels[0].id}`,
        )
      ).json().length,
      0,
    );
    assert.equal((await app.inject("/api/billboards")).json().length, 0);
    for (const destination of [
      "http://pytorch.org",
      "https://localhost",
      "https://127.0.0.1",
      "https://u:p@pytorch.org",
      "javascript:alert(1)",
    ])
      assert.equal(adDestination(destination), null);
  } finally {
    await app.close();
    await db.close();
    await rm(dir, { recursive: true, force: true });
  }
});
