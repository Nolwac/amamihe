#!/usr/bin/env bash
# Exercise the bundled model without production configuration or host networking.
set -Eeuo pipefail
image=${1:?Supply the immutable application image to verify}
[[ $image != -* && $image != *$'\n'* && $image != *$'\r'* ]]
name="runtime-qa-amamihe-$$"
docker image inspect "$image" >/dev/null
if docker container inspect "$name" >/dev/null 2>&1; then
  echo 'Runtime verification name is already occupied.' >&2
  exit 1
fi
cleanup() { docker container rm -f "$name" >/dev/null 2>&1 || true; }
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
docker run --rm -i --name "$name" --network none --read-only \
  --memory 3g --cpus 2 --user 1000:1000 --tmpfs /tmp:size=64m,mode=1777 \
  --cap-drop ALL --security-opt no-new-privileges:true \
  --entrypoint node "$image" --import tsx --input-type=module <<'JS'
import assert from 'node:assert/strict';
import { startLocalModel } from './server/local-model.ts';
import { decisionConfiguration, DECISION_MODEL_DIGEST } from './server/decision-provider.ts';
import { cpuSpeechOutput } from './server/speech-output.ts';
const started = performance.now();
const watchdog = setTimeout(() => {
  console.error('Packaged model did not finish real cold inference within three minutes.');
  process.exit(1);
}, 180000);
let stop;
try {
  const narrator = await cpuSpeechOutput();
  assert.ok(narrator?.languages.includes('en'), 'Packaged native narrator is missing.');
  const audio = await narrator.synthesize('Count one, two, three.', 'en', 1);
  assert.ok(audio.byteLength > 1000 && audio.byteLength < 1_500_000);
  stop = await startLocalModel();
  const status = await decisionConfiguration().provider.status(true);
  assert.equal(status.ready, true, status.reason);
  assert.equal(status.modelDigest, DECISION_MODEL_DIGEST);
  console.log('Packaged runtime verified: ' + JSON.stringify({ elapsedMs: Math.round(performance.now() - started), ...status }));
} finally {
  clearTimeout(watchdog);
  stop?.();
}
JS
