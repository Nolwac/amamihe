import { test } from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { openDatabase } from "../server/db.js";
import { initializeSchema } from "../server/schema.js";
import { initializeCourseSchema, registerCourses } from "../server/courses.js";
import { initializePracticeSchema } from "../server/practice.js";
import { initializeWorldPolicySchema } from "../server/world-policy.js";
import {
  initializeInclusionSchema,
  registerInclusion,
  registerCourseLocalization,
} from "../server/inclusion.js";
import { registerNarration, cpuSpeechOutput } from "../server/speech-output.js";
import { Authentication } from "../server/auth.js";
import { kidsCourses } from "../server/kids-courses.js";
import { policyProvider } from "./provider-fixture.js";

test("authenticated localization, correction ownership and private export retain independent progress", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "amamihe-inclusion-"));
  const db = await openDatabase({ dataDir: directory });
  const app = Fastify();
  try {
    await initializeSchema(db);
    await initializeCourseSchema(db);
    await initializePracticeSchema(db);
    await initializeWorldPolicySchema(db);
    await initializeInclusionSchema(db);
    let message = "";
    const auth = new Authentication(
      db,
      {
        async send(mail) {
          message = mail.text;
        },
      },
      "inclusion-test-secret-at-least-thirty-two-characters",
    );
    async function account(email: string) {
      const pending = await auth.signup({
        email,
        name: "Inclusion tester",
        password: "inclusion-test-password",
        outfit: "teal",
      });
      const verified = await auth.verify(
        pending.challengeId,
        message.match(/\b\d{6}\b/)![0],
      );
      return { id: verified.player!.id, cookie: `amamihe=${verified.token}` };
    }
    const tutor = await account("publisher@example.test"),
      learner = await account("learner@example.test"),
      other = await account("other@example.test");
    await app.register(cookie);
    registerCourseLocalization(app, db, auth);
    registerCourses(app, db, auth, policyProvider);
    registerInclusion(app, db, auth);
    registerNarration(app, auth, {
      name: "bounded-test-provider",
      languages: ["en"],
      async synthesize() {
        return Buffer.alloc(200, 12);
      },
    });
    const inject = (
      method: "GET" | "POST" | "PUT",
      url: string,
      payload?: unknown,
      session = learner.cookie,
      lang = "en",
    ) =>
      app.inject({
        method,
        url,
        payload: payload as any,
        headers: { cookie: session, "x-amamihe-language": lang },
      });
    const draft = (
      await inject(
        "POST",
        "/api/studio/courses",
        { template: "blank" },
        tutor.cookie,
      )
    ).json();
    const definition = kidsCourses().find(
      (c) => c.id === "amamihe-number-garden",
    )!.definition;
    const saved = await inject(
      "PUT",
      `/api/studio/courses/${draft.id}`,
      { revision: draft.revision, definition },
      tutor.cookie,
    );
    assert.equal(saved.statusCode, 200, saved.body);
    const published = await inject(
      "POST",
      `/api/studio/courses/${draft.id}/publish`,
      { revision: saved.json().revision },
      tutor.cookie,
    );
    assert.equal(published.statusCode, 200, published.body);
    const publicFr = await inject(
      "GET",
      `/api/courses/${draft.id}?version=1`,
      undefined,
      "",
      "fr",
    );
    assert.equal(publicFr.json().definition.language, "fr");
    const publicQuestion = publicFr.json().definition.levels[0].questions[0];
    for (const key of [
      "answer",
      "hint",
      "explanation",
      "rubric",
      "translations",
    ])
      assert.equal(key in publicQuestion, false);
    assert.equal("translations" in publicFr.json().definition, false);
    const search = await inject(
      "GET",
      "/api/courses?q=" + encodeURIComponent("Jardin des nombres"),
      undefined,
      "",
      "fr",
    );
    assert.ok(search.json().courses.some((c: any) => c.id === draft.id));
    const enrolled = await inject("POST", `/api/courses/${draft.id}/enroll`, {
      version: 1,
    });
    assert.equal(enrolled.statusCode, 200, enrolled.body);
    const baseline = enrolled.json();
    for (const lang of ["fr", "pt", "ar", "ig", "yo", "ha"]) {
      const local = (
        await inject(
          "GET",
          `/api/learning/${draft.id}`,
          undefined,
          learner.cookie,
          lang,
        )
      ).json();
      assert.equal(local.language, lang);
      assert.equal(local.question.id, baseline.question.id);
      assert.equal(local.checkpoint, baseline.checkpoint);
      assert.equal(local.assisted, baseline.assisted);
      assert.equal(local.points, baseline.points);
    }
    assert.equal(
      (await inject("GET", "/api/account/export", undefined, "")).statusCode,
      401,
    );
    await db.query(
      "INSERT INTO attempts(id,player_id) VALUES('private-other-attempt',$1)",
      [other.id],
    );
    await db.query(
      "INSERT INTO chunks(attempt_id,question_id,answer,assisted,elapsed_ms) VALUES('private-other-attempt','private-other-question',1,false,20)",
    );
    const report = await inject(
      "POST",
      `/api/courses/${draft.id}/material-report`,
      {
        version: 1,
        resourceId: definition.resources[0].id,
        description: "Please review this counting explanation.",
      },
    );
    assert.equal(report.statusCode, 200, report.body);
    assert.equal(
      (
        await inject("POST", `/api/courses/${draft.id}/material-report`, {
          version: 1,
          resourceId: "missing",
          description: "Please review this material.",
        })
      ).statusCode,
      404,
    );
    assert.equal(
      (await inject("GET", `/api/studio/courses/${draft.id}/material-reports`))
        .statusCode,
      404,
    );
    const owned = await inject(
      "GET",
      `/api/studio/courses/${draft.id}/material-reports`,
      undefined,
      tutor.cookie,
    );
    assert.equal(owned.json().reports.length, 1);
    assert.ok(!owned.body.includes("learner@example.test"));
    assert.ok(!owned.body.includes(learner.id));
    const resolve = `/api/studio/courses/${draft.id}/material-reports/${report.json().id}/resolve`;
    assert.equal(
      (
        await inject("POST", resolve, {
          response: "The publisher reviewed this explanation.",
        })
      ).statusCode,
      404,
    );
    assert.equal(
      (
        await inject(
          "POST",
          resolve,
          { response: "The publisher reviewed this explanation." },
          tutor.cookie,
        )
      ).statusCode,
      200,
    );
    const exported = await inject("GET", "/api/account/export");
    assert.equal(exported.statusCode, 200, exported.body);
    assert.equal(exported.headers["cache-control"], "no-store");
    const data = exported.json();
    assert.equal(data.account.id, learner.id);
    assert.equal(data.data.material_reports.length, 1);
    assert.equal(data.truncated, false);
    for (const forbidden of [
      "private-other-attempt",
      "private-other-question",
      other.id,
      "password_hash",
      "token_hash",
      "code_hash",
      "inclusion-test-secret",
    ])
      assert.ok(!exported.body.includes(forbidden), forbidden);
    assert.equal(
      (
        await inject(
          "POST",
          "/api/speech/narrate",
          { text: "Hello", language: "en" },
          "",
        )
      ).statusCode,
      401,
    );
    assert.equal(
      (
        await inject("POST", "/api/speech/narrate", {
          text: "Ndewo",
          language: "ig",
        })
      ).statusCode,
      422,
    );
    const narration = await inject("POST", "/api/speech/narrate", {
      text: "Count one, two, three.",
      language: "en",
    });
    assert.equal(narration.statusCode, 200);
    assert.equal(narration.headers["cache-control"], "no-store");
    assert.equal(narration.headers["content-type"], "audio/mpeg");
  } finally {
    await app.close();
    await db.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("installed CPU narrator generates a bounded MP3 with only actual supported languages", async (t) => {
  const provider = await cpuSpeechOutput();
  if (!provider) {
    if (process.env.REQUIRE_NATIVE_SPEECH)
      assert.fail("Required native narrator is missing.");
    t.skip("Native eSpeak/FFmpeg are absent on this host.");
    return;
  }
  assert.ok(provider.languages.includes("en"));
  const mp3 = await provider.synthesize(
    "Count one, two, three. There are three flowers.",
    "en",
    1,
  );
  assert.ok(mp3.byteLength > 1000 && mp3.byteLength < 1_500_000);
  assert.ok(mp3.subarray(0, 3).toString() === "ID3" || mp3[0] === 0xff);
  await assert.rejects(provider.synthesize("Hello", "en", Infinity));
  await assert.rejects(provider.synthesize("x".repeat(8001), "en", 1));
});
