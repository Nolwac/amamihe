import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  mkdtemp,
  readFile,
  copyFile,
  writeFile,
  rm,
  access,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DECISION_MODEL_DIGEST } from "../shared/decision.js";

const installer = new URL("../scripts/models/pull-tev1.py", import.meta.url);
const manifest = new URL(
  "../scripts/models/tev1-0.8b.manifest",
  import.meta.url,
);

test("bundled model manifest is the exact revision accepted by real inference", async () => {
  const raw = await readFile(manifest);
  assert.equal(
    "sha256:" + createHash("sha256").update(raw).digest("hex"),
    DECISION_MODEL_DIGEST,
  );
});

test("installer refuses altered bundled provenance before creating a model store", async () => {
  const directory = await mkdtemp(join(tmpdir(), "amamihe-model-integrity-"));
  try {
    const script = join(directory, "pull-tev1.py");
    const destination = join(directory, "models");
    await copyFile(installer, script);
    const raw = await readFile(manifest);
    // Semantically identical JSON must still fail the exact upstream digest.
    await writeFile(
      join(directory, "tev1-0.8b.manifest"),
      Buffer.concat([raw, Buffer.from("\n")]),
    );
    const result = spawnSync(
      process.env.PYTHON || "python3",
      [script, destination],
      {
        encoding: "utf8",
        timeout: 5000,
      },
    );
    assert.equal(result.error, undefined);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /reviewed tev1 manifest changed/);
    await assert.rejects(access(destination), { code: "ENOENT" });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
