import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { Authentication, hashPassword, checkPassword } from "../server/auth.js";
import {
  AgentMailProvider,
  emailConfiguration,
  type EmailMessage,
} from "../server/email.js";
import { openDatabase } from "../server/db.js";
import { initializeSchema } from "../server/schema.js";

test("password hashes are salted and verify without storing the password", async () => {
  const password = "a long secret password";
  const first = await hashPassword(password),
    second = await hashPassword(password);
  assert.notEqual(first, second);
  assert.ok(!first.includes(password));
  assert.equal(await checkPassword(password, first), true);
  assert.equal(await checkPassword("wrong password", first), false);
  assert.equal(await checkPassword(password, "corrupt"), false);
});
test("verified accounts preserve progress, enforce one-use codes and recover across sessions", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "amamihe-auth-"));
  const db = await openDatabase({ dataDir: directory });
  try {
    await initializeSchema(db);
    const messages: EmailMessage[] = [];
    const auth = new Authentication(
      db,
      {
        async send(message) {
          messages.push(message);
        },
      },
      "unit-test-secret-that-is-at-least-32-characters",
    );
    await db.query(
      "INSERT INTO players(id,token,name,outfit,points) VALUES($1,$2,$3,$4,$5)",
      ["legacy-player", "a".repeat(64), "Guest", "teal", 60],
    );
    await db.query("INSERT INTO attempts(id,player_id) VALUES($1,$2)", [
      "saved-attempt",
      "legacy-player",
    ]);
    assert.equal(
      await auth.player("a".repeat(64)),
      null,
      "Guest token cannot authorize gameplay",
    );
    const signup = await auth.signup(
      {
        name: "Learner",
        email: "  LEARNER@example.com ",
        password: "long-password-for-tests",
        outfit: "teal",
      },
      "a".repeat(64),
    );
    assert.equal(
      (await db.query("SELECT * FROM accounts")).rows.length,
      0,
      "No account before verification",
    );
    const code = messages[0].text.match(/\b\d{6}\b/)![0];
    assert.equal(messages[0].to, "learner@example.com");
    const stored = (
      await db.query<{ code_hash: string }>(
        "SELECT code_hash FROM auth_challenges WHERE id=$1",
        [signup.challengeId],
      )
    ).rows[0];
    assert.ok(!stored.code_hash.includes(code));
    await assert.rejects(
      auth.verify(signup.challengeId, "000000", "a".repeat(64)),
    );
    assert.equal(
      (
        await db.query<{ attempts: number }>(
          "SELECT attempts FROM auth_challenges WHERE id=$1",
          [signup.challengeId],
        )
      ).rows[0].attempts,
      1,
    );
    const verified = await auth.verify(
      signup.challengeId,
      code,
      "a".repeat(64),
    );
    assert.equal(verified.player?.id, "legacy-player");
    assert.equal(verified.player?.points, 60);
    assert.equal(
      (
        await db.query("SELECT * FROM attempts WHERE player_id=$1", [
          verified.player!.id,
        ])
      ).rows.length,
      1,
    );
    assert.equal(
      (
        await db.query<{ token_hash: string }>(
          "SELECT token_hash FROM auth_sessions",
        )
      ).rows[0].token_hash,
      createHash("sha256").update(verified.token).digest("hex"),
    );
    await assert.rejects(
      auth.verify(signup.challengeId, code, "a".repeat(64)),
      /already used/,
    );
    await assert.rejects(
      auth.passwordLogin("learner@example.com", "wrong"),
      /incorrect/,
    );
    const passwordSession = await auth.passwordLogin(
      "learner@example.com",
      "long-password-for-tests",
    );
    assert.equal(passwordSession.player?.id, verified.player!.id);
    const recovery = await auth.requestLoginCode("learner@example.com");
    const recovered = await auth.verify(
      recovery.challengeId,
      messages[1].text.match(/\b\d{6}\b/)![0],
    );
    assert.equal(recovered.player?.points, 60);
    await auth.changePassword(recovered.token, "new-password-for-tests");
    assert.equal(
      await auth.player(passwordSession.token),
      null,
      "Password change invalidates other sessions",
    );
    await assert.rejects(
      auth.passwordLogin("learner@example.com", "long-password-for-tests"),
    );
    assert.equal(
      (
        await auth.passwordLogin(
          "learner@example.com",
          "new-password-for-tests",
        )
      ).player?.id,
      "legacy-player",
    );
    await auth.logout(recovered.token);
    assert.equal(await auth.player(recovered.token), null);
    const resumed = new Authentication(
      db,
      { async send() {} },
      "unit-test-secret-that-is-at-least-32-characters",
    );
    assert.equal(
      (
        await resumed.passwordLogin(
          "learner@example.com",
          "new-password-for-tests",
        )
      ).player?.points,
      60,
    );
    const unknown = await auth.requestLoginCode("unknown@example.com");
    assert.ok(unknown.challengeId);
    assert.equal(
      messages.length,
      2,
      "Unknown accounts do not receive login codes",
    );
    await assert.rejects(auth.requestLoginCode("unknown@example.com"), /wait/);
    const signup2 = await auth.signup({
      name: "Another",
      email: "another@example.com",
      password: "long-password-for-tests",
      outfit: "gold",
    });
    const code2 = messages[2].text.match(/\b\d{6}\b/)![0];
    for (let i = 0; i < 5; i++)
      await assert.rejects(auth.verify(signup2.challengeId, "000000"));
    await assert.rejects(auth.verify(signup2.challengeId, code2), /invalid/);
    const expiry = await auth.signup({
      name: "Expiry",
      email: "expiry@example.com",
      password: "long-password-for-tests",
      outfit: "gold",
    });
    await db.query(
      "UPDATE auth_challenges SET expires_at=now()-interval '1 minute' WHERE id=$1",
      [expiry.challengeId],
    );
    await assert.rejects(
      auth.verify(expiry.challengeId, messages[3].text.match(/\b\d{6}\b/)![0]),
      /expired/,
    );
    const race = await auth.signup({
      name: "Race",
      email: "race@example.com",
      password: "long-password-for-tests",
      outfit: "teal",
    });
    const outcomes = await Promise.allSettled([
      auth.verify(race.challengeId, messages[4].text.match(/\b\d{6}\b/)![0]),
      auth.verify(race.challengeId, messages[4].text.match(/\b\d{6}\b/)![0]),
    ]);
    assert.equal(outcomes.filter((r) => r.status === "fulfilled").length, 1);
  } finally {
    await db.close();
    await rm(directory, { recursive: true, force: true });
  }
});
test("provider errors reveal no credentials and test email cannot run in production", async () => {
  const oldFetch = globalThis.fetch,
    oldNodeEnv = process.env.NODE_ENV,
    oldProvider = process.env.EMAIL_PROVIDER,
    oldConfig = process.env.EMAIL_CONFIG_FILE;
  let requestBody: Record<string, unknown> = {};
  try {
    globalThis.fetch = async (input, options) => {
      assert.match(String(input), /amamihe%40agentmail.to/);
      requestBody = JSON.parse(String(options?.body));
      return new Response('{"private":"secret"}', { status: 403 });
    };
    await assert.rejects(
      new AgentMailProvider("private-api-key", "amamihe@agentmail.to").send({
        id: "test",
        to: "test@example.com",
        subject: "test",
        text: "test code",
      }),
      (error) =>
        error instanceof Error &&
        !error.message.includes("private-api-key") &&
        !error.message.includes("secret"),
    );
    assert.equal(requestBody.to, "test@example.com");
    process.env.NODE_ENV = "production";
    process.env.EMAIL_PROVIDER = "test";
    delete process.env.EMAIL_CONFIG_FILE;
    await assert.rejects(emailConfiguration(), /Production requires/);
  } finally {
    globalThis.fetch = oldFetch;
    for (const [key, value] of Object.entries({
      NODE_ENV: oldNodeEnv,
      EMAIL_PROVIDER: oldProvider,
      EMAIL_CONFIG_FILE: oldConfig,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
