import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  readdir,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const commit = "a".repeat(40);

async function fixture() {
  const base = await mkdtemp(path.join(tmpdir(), "amamihe-poll-"));
  for (const dir of ["shared", "releases", "bin", "tools"])
    await mkdir(path.join(base, dir));
  await writeFile(path.join(base, "shared/deployment.env"), "private-config\n");
  await writeFile(
    path.join(base, "bin/deploy-release.sh"),
    '#!/bin/bash\nprintf "%s\\n" "$@" > "$TEST_BASE/promoted"\nexit "${TEST_PROMOTION_EXIT:-0}"\n',
    { mode: 0o500 },
  );
  await writeFile(
    path.join(base, "tools/gh"),
    `#!/bin/bash
set -eu
if [[ $1 == api ]]; then
  [[ $2 == 'repos/Nolwac/amamihe/actions/workflows/checks.yml/runs?branch=main&event=push&status=success&per_page=1' ]] || exit 99
  printf '123\\t%s\\t%s\\n' '${commit}' "\${TEST_SOURCE:-Nolwac/amamihe}"
elif [[ $1 == run && $2 == download ]]; then
  [[ $3 == 123 && $4 == --repo && $5 == Nolwac/amamihe && $6 == --name && $7 == amamihe-release-${commit} && $8 == --dir ]] || exit 99
  [[ \${TEST_DOWNLOAD_FAIL:-0} == 0 ]] || exit 1
  printf '{"commit":"%s"}\\n' "\${TEST_ARTIFACT_COMMIT:-${commit}}" > "$9/manifest.json"
else
  exit 99
fi
`,
    { mode: 0o500 },
  );
  const run = (extra: Record<string, string> = {}) =>
    spawnSync("bash", ["scripts/pull-deploy.sh", base], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PATH: `${base}/tools:${process.env.PATH}`,
        TEST_BASE: base,
        ...extra,
      },
      encoding: "utf8",
    });
  return {
    base,
    run,
    cleanup: () => rm(base, { recursive: true, force: true }),
  };
}

test("poller promotes an authenticated main artifact using only the installed helper", async () => {
  const f = await fixture();
  try {
    const result = f.run();
    assert.equal(result.status, 0, result.stderr);
    const args = await readFile(path.join(f.base, "promoted"), "utf8");
    assert.match(args, /--manifest-sha256\n[0-9a-f]{64}\n/);
    assert.ok(args.includes(`${f.base}/releases/${commit}`));
    assert.deepEqual(await readdir(path.join(f.base, "releases")), [commit]);
  } finally {
    await f.cleanup();
  }
});

test("poller leaves a current release alone", async () => {
  const f = await fixture();
  try {
    await writeFile(
      path.join(f.base, "shared/releases.json"),
      JSON.stringify({ current: { commit } }),
    );
    assert.equal(f.run().status, 0);
    await assert.rejects(readFile(path.join(f.base, "promoted")));
  } finally {
    await f.cleanup();
  }
});

for (const [name, settings] of [
  ["foreign repository", { TEST_SOURCE: "attacker/amamihe" }],
  ["mismatched artifact", { TEST_ARTIFACT_COMMIT: "b".repeat(40) }],
  ["unavailable artifact", { TEST_DOWNLOAD_FAIL: "1" }],
] as const) {
  test(`poller refuses ${name} before promotion`, async () => {
    const f = await fixture();
    try {
      assert.notEqual(f.run(settings).status, 0);
      await assert.rejects(readFile(path.join(f.base, "promoted")));
    } finally {
      await f.cleanup();
    }
  });
}

test("poller reports failed promotion without advancing deployment state", async () => {
  const f = await fixture();
  try {
    assert.equal(f.run({ TEST_PROMOTION_EXIT: "23" }).status, 23);
    await assert.rejects(readFile(path.join(f.base, "shared/releases.json")));
  } finally {
    await f.cleanup();
  }
});

test("poller refuses to overwrite a conflicting immutable release", async () => {
  const f = await fixture();
  try {
    const release = path.join(f.base, "releases", commit);
    await mkdir(release);
    await writeFile(
      path.join(release, "manifest.json"),
      "conflicting artifact",
    );
    assert.notEqual(f.run().status, 0);
    await assert.rejects(readFile(path.join(f.base, "promoted")));
    assert.equal(
      await readFile(path.join(release, "manifest.json"), "utf8"),
      "conflicting artifact",
    );
    assert.deepEqual(await readdir(path.join(f.base, "releases")), [commit]);
  } finally {
    await f.cleanup();
  }
});
