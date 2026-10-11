// Execute only the repository-authored reference in an isolated, no-cost local runtime.
// This synthetic smoke corpus is not a useful training dataset or evaluation corpus.
import { STORY_MODEL_NOTEBOOK } from "../../server/course-template.ts";
import {
  mkdtemp,
  writeFile,
  readFile,
  stat,
  rm,
  mkdir,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
const python = process.argv[2];
if (!python)
  throw new Error("Pass an existing Python/PyTorch interpreter path.");
const dir = await mkdtemp(path.join(tmpdir(), "amamihe-training-"));
try {
  const records = Array.from({ length: 6 }, (_, i) => ({
    id: "smoke-" + i,
    text: (
      "Original smoke fixture " +
      i +
      ": A learner visits a workshop and studies how careful experiments help explain evidence. "
    ).repeat(8),
    license: "original",
    source: "original",
    author: "Amamihe verification fixture",
  }));
  await writeFile(
    path.join(dir, "corpus.jsonl"),
    records.map((r) => JSON.stringify(r)).join("\n"),
  );
  await writeFile(path.join(dir, "train.py"), STORY_MODEL_NOTEBOOK);
  const started = Date.now();
  const result = spawnSync(python, ["train.py"], {
    cwd: dir,
    timeout: 120000,
    encoding: "utf8",
    env: { ...process.env, CUDA_VISIBLE_DEVICES: "" },
  });
  if (result.status !== 0)
    throw new Error("Training smoke failed: " + result.stderr);
  const parameters = Number(
    result.stdout.match(/Trainable parameters: (\d+)/)?.[1],
  );
  if (parameters !== 1040768) throw new Error("Unexpected parameter count.");
  const split = JSON.parse(
    await readFile(path.join(dir, "split.json"), "utf8"),
  );
  if (split.train.some((id) => split.heldout.includes(id)))
    throw new Error("Split leakage.");
  const report = {
    date: new Date().toISOString(),
    runtime: "Existing isolated CPU Python/PyTorch; no purchased service",
    parameters,
    trainingSteps: 20,
    checkpointBytes: (await stat(path.join(dir, "story-model.pt"))).size,
    durationMs: Date.now() - started,
    trainingLossSamples: [
      ...result.stdout.matchAll(/step (\d+) training loss ([\d.]+)/g),
    ].map((m) => ({ step: Number(m[1]), loss: Number(m[2]) })),
    split,
    limitations:
      "Synthetic repeated smoke fixtures verify parameter counting, optimization, held-out mechanics and checkpoint output only. They do not establish storytelling quality, independent practical mastery, or available Colab/Kaggle accounts and quotas.",
  };
  await mkdir("evidence/reports", { recursive: true });
  await writeFile(
    "evidence/reports/step6-training-smoke.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await rm(dir, { recursive: true, force: true });
}
