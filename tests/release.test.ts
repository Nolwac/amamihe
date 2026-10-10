import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { readRelease } from "../server/release.js";
const execute = promisify(execFile);
const stamp = path.resolve("scripts/deploy/stamp-release.mjs");

test("release stamping identifies detached commits without copying or reading credential configuration", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "amamihe-release-"));
  try {
    await mkdir(path.join(directory, ".git"));
    const commit = "a".repeat(40);
    await writeFile(path.join(directory, ".git/HEAD"), commit + "\n");
    await writeFile(
      path.join(directory, ".git/config"),
      "a private configuration must never enter build-info",
    );
    await execute(process.execPath, [stamp], { cwd: directory });
    const file = path.join(directory, "server/build-info.json");
    assert.equal(await readRelease(file), commit);
    assert.deepEqual(JSON.parse(await readFile(file, "utf8")), { commit });
    await writeFile(
      path.join(directory, ".git/HEAD"),
      "ref: refs/heads/work\n",
    );
    await execute(process.execPath, [stamp], { cwd: directory });
    assert.equal(await readRelease(file), "development");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("release stamping validates explicit revisions and public health never echoes malformed metadata", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "amamihe-release-"));
  try {
    const commit = "b".repeat(40),
      file = path.join(directory, "server/build-info.json");
    await execute(process.execPath, [stamp, commit], { cwd: directory });
    assert.equal(await readRelease(file), commit);
    await assert.rejects(
      execute(process.execPath, [stamp, "not-a-commit"], { cwd: directory }),
    );
    await writeFile(file, JSON.stringify({ commit: "invalid private value" }));
    assert.equal(await readRelease(file), "development");
    assert.equal(
      await readRelease(path.join(directory, "absent.json")),
      "development",
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
