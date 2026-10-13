import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { openDatabase, postgresConfig, type Database } from "../server/db.js";
import { initializeSchema } from "../server/schema.js";

test("production startup rejects missing external storage before creating local data", async () => {
  const dataDir = await mkdtemp(
    path.join(tmpdir(), "amamihe-production-storage-"),
  );
  try {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      NODE_ENV: "production",
      DATA_DIR: dataDir,
    };
    delete env.DATABASE_URL;
    const result = spawnSync(
      process.execPath,
      ["--import=tsx", "server/index.ts"],
      {
        cwd: process.cwd(),
        env,
        encoding: "utf8",
        timeout: 15000,
      },
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, /DATABASE_URL is required in production/);
    assert.deepEqual(await readdir(dataDir), []);
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});

test("external PostgreSQL always verifies TLS and rejects insecure URL overrides", () => {
  for (const mode of ["require", "prefer", "verify-ca", "verify-full"])
    assert.equal(
      (
        postgresConfig(
          `postgresql://learner:secret@db.example/amamihe?sslmode=${mode}`,
        ).ssl as { rejectUnauthorized: boolean }
      ).rejectUnauthorized,
      true,
    );
  for (const suffix of [
    "sslmode=disable",
    "sslmode=no-verify",
    "sslmode=require&uselibpqcompat=true",
    "ssl=0",
  ])
    assert.throws(() =>
      postgresConfig(
        `postgresql://learner:secret@db.example/amamihe?${suffix}`,
      ),
    );
  assert.throws(() =>
    postgresConfig(
      "postgresql://learner:secret@127.0.0.1/amamihe?sslmode=disable&host=db.example",
    ),
  );
  assert.equal(
    postgresConfig("postgresql://learner@127.0.0.1/amamihe?sslmode=disable")
      .ssl,
    false,
  );
  assert.throws(() =>
    postgresConfig("https://learner:secret@db.example/amamihe"),
  );
  assert.throws(
    () => postgresConfig("invalid-private-secret"),
    (error: unknown) =>
      error instanceof Error && !error.message.includes("private-secret"),
  );
});

async function exerciseTransactions(db: Database) {
  await initializeSchema(db);
  const player = randomUUID(),
    attempt = randomUUID();
  await db.query(
    "INSERT INTO players(id,token,name,outfit) VALUES($1,$2,$3,$4)",
    [player, randomUUID(), "Database Explorer", "teal"],
  );
  await db.query("INSERT INTO attempts(id,player_id) VALUES($1,$2)", [
    attempt,
    player,
  ]);
  try {
    await assert.rejects(
      db.transaction(async (tx) => {
        await tx.query("UPDATE players SET points=100 WHERE id=$1", [player]);
        throw new Error("Abort this transaction");
      }),
      /Abort this transaction/,
    );
    assert.equal(
      (
        await db.query<{ points: number }>(
          "SELECT points FROM players WHERE id=$1",
          [player],
        )
      ).rows[0].points,
      0,
    );

    const complete = () =>
      db.transaction(async (tx) => {
        const current = (
          await tx.query<{ status: string }>(
            "SELECT status FROM attempts WHERE id=$1 FOR UPDATE",
            [attempt],
          )
        ).rows[0];
        if (current.status === "complete") return;
        await tx.query("UPDATE players SET points=points+60 WHERE id=$1", [
          player,
        ]);
        await tx.query(
          "UPDATE attempts SET status='complete',result=$1 WHERE id=$2",
          [
            JSON.stringify({ points: 60, provider: "ollama:tev1:0.8b" }),
            attempt,
          ],
        );
      });
    await Promise.all([complete(), complete(), complete()]);
    assert.equal(
      (
        await db.query<{ points: number }>(
          "SELECT points FROM players WHERE id=$1",
          [player],
        )
      ).rows[0].points,
      60,
    );
    assert.deepEqual(
      (
        await db.query<{ result: unknown }>(
          "SELECT result FROM attempts WHERE id=$1",
          [attempt],
        )
      ).rows[0].result,
      { points: 60, provider: "ollama:tev1:0.8b" },
    );
    return player;
  } finally {
    await db.query("DELETE FROM attempts WHERE id=$1", [attempt]);
  }
}

test("local PGlite retains committed progress and rolls back failed transactions", async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), "amamihe-storage-"));
  let db = await openDatabase({ dataDir });
  try {
    assert.equal(db.kind, "pglite");
    const player = await exerciseTransactions(db);
    await db.close();
    db = await openDatabase({ dataDir });
    assert.equal(
      (
        await db.query<{ points: number }>(
          "SELECT points FROM players WHERE id=$1",
          [player],
        )
      ).rows[0].points,
      60,
    );
  } finally {
    await db.close();
    await rm(dataDir, { recursive: true, force: true });
  }
});

test(
  "external PostgreSQL preserves transactions and concurrent idempotent rewards",
  {
    skip: !process.env.TEST_DATABASE_URL,
  },
  async () => {
    const dataDir = await mkdtemp(
      path.join(tmpdir(), "amamihe-external-storage-"),
    );
    const db = await openDatabase({
      dataDir,
      databaseUrl: process.env.TEST_DATABASE_URL,
      caCertificate: process.env.TEST_DATABASE_CA_CERT,
    });
    let player: string | undefined;
    try {
      assert.equal(db.kind, "postgresql");
      player = await exerciseTransactions(db);
    } finally {
      if (player) await db.query("DELETE FROM players WHERE id=$1", [player]);
      await db.close();
      await rm(dataDir, { recursive: true, force: true });
    }
  },
);
