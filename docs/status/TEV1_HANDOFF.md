# Local tev1 decisions and deployment handoff

## Current state — 13 October 2026, 23:52 UTC

The implementation is merged into `main` through [PR #5](https://github.com/Nolwac/amamihe/pull/5), followed by three regression fixes. The last application revision is `9e2424d454aef54454d4a0b6c77022fce921eab6`. It replaces the former operational provider with private CPU-only Ollama 0.40.3 and `tev1:0.8b`. Implementation, complete regression verification, release packaging and CI approval are finished. **Successful production promotion is not verified.** Continue with deployment diagnosis rather than rebuilding the model integration.

- [Release workflow, attempt 1](https://github.com/Nolwac/amamihe/actions/runs/38444423834/attempts/1): all four browser shards, aggregate `verify`, immutable `release`, and `approve-deployment` passed. The approved reference was published at 18:24:33 UTC. Only `verify-production` failed after its 20-minute deployment wait expired.
- [Public verification rerun, attempt 2](https://github.com/Nolwac/amamihe/actions/runs/38444423834/attempts/2): requested at 20:41 UTC for failed jobs only. Previously passing results were reused. `verify-production` failed again at 21:02 UTC with “The approved server revision and expected client were not promoted within the deployment window.” It is no longer running.
- The last successful public health request, at 20:47:42 UTC, reported PostgreSQL and the previous release `3eab1e9f5d6a1acd1a15b9fb721fef0517df8003`, still using the retired provider. A fresh request at 23:52 UTC returned HTTP 502. Earlier intermittent 502 responses had cleared back to the old release; a gateway error alone does not establish its cause or a successful promotion.
- The user wants to pause here and continue from this handoff. Do not require repeated manual log collection. Establish working authorized server access before attempting VPS repair.

This documentation update advances `main` and starts the normal push workflow. The verified application revision above remains the evidence baseline; check the latest `main`, approved reference and workflow before resuming. The VPS deliberately refuses an approved reference that no longer matches current `main`.

## Actual inference

The adapter calls `/v1/systemone` without credentials. It validates model identity, the pinned model manifest, typed primitives, allowed labels and probability distributions. The verified manifest is `sha256:8d11b3146b7f3f4f4d5e9a64665ab2bdaf8b46e4ec42a5880b60a716ae50e3fb`; model weights are Q8_0, 752.39M parameters, approximately 812 MB. This is an experimental Together AI decision model, not a chat-completion prompt that emits teaching text.

Objective answer keys and assistance history determine valid evidence. Tev1 classifies those compact records after clearance and selects eligible published next levels. Before delivery it chooses an authored quiz question and an available teaching role. Multiple eligible options use `choice`; a single permissible activity needs a real `noul` approval. Model concentration is not a calibrated correctness probability. Binary approvals retain their probability and derived margin separately.

Choices and model provenance are persisted in `course_decisions`, and foundation question plans are saved with attempts. Refreshes keep the delivered question, category changes do not reshuffle work, completed criteria remain excluded from independent retries, and previous course versions/points remain intact. Older provider metadata is normalized as historical checkpoint evidence; it is never presented as a fresh tev1 decision. An old partial delivery requires approval of that same question before continuing. Inference failures remain pending with saved work and explicit retry. No alternate provider or generated lesson path exists.

The learning camp presents the selected category and lets learners visit it. All ten actual participation requirements remain distinct from mastery. Existing physical gameplay, protected breaks, unlimited practice/replay and exactly-once rewards are preserved. Stale heartbeat responses cannot overwrite a newer model-selected delivery or report its successful transition as a disconnect.

## Runtime and deployment

The immutable application image includes the checksum-verified CPU runtime and all manifest-verified model blobs. No first-start model download is needed. An owned daemon listens only on container loopback. Small Ollama manifest indexes and its ephemeral local configuration use `/tmp`; model blobs remain immutable. CPU runtime GPU libraries are excluded. The API and inference container has a 3 GiB/two-core limit, while database TLS, private email configuration and the existing release gate remain in place.

Development requires the actual model and a running local Ollama service. `scripts/models/install-ollama.sh` pins the official runtime checksum; `pull-tev1.py` fetches official registry blobs through configured proxies, verifies every SHA256, and refuses a changed model tag. The native pull failed on the managed cloud's direct blob route; the verified proxy-aware downloader installed the same official model manifest. No TLS bypass or network-policy change was used.

## Completed verification at the application revision

- Exact-revision CI passed **114 Node checks, zero failures and one optional external-PostgreSQL skip**, including actual model classification/level/category/question inference and progress/retry/reward/migration regressions. Build/typecheck and formatting passed.
- **All 31 browser journeys passed with actual tev1 decisions**, across four isolated runners with 8/8/8/7 journeys. Coverage includes the six-level pilot, all three children’s courses, authentication recovery, physical encounters, mobile resume, practice, all ten roles, authoring, social play and police recovery. Each maintained children’s course completed four challenges and earned 20 points. The complete six-level studio journey took 3.4 minutes on its CI runner; model response waits allow bounded cold CPU inference while retaining the existing UI and persistence assertions.
- A focused phone journey passed locally in 51.2 seconds with an extra 20-second delay on its real final-answer response. The relay preserved actual inference payloads. The studio journey passed locally in 57 seconds.
- Actual model inference passed in the packaged application image with networking disabled, UID 1000, a read-only filesystem, two CPU cores, a 3 GiB memory limit and the exact **64 MiB `/tmp` limit** used by Compose. This used disposable PGlite, not the VPS private PostgreSQL configuration. An earlier isolated cold decision took approximately seven seconds; a separate cold start under competing CPU work took around 90 seconds with a 1.476 GiB ready memory sample. These are not VPS throughput measurements.

The approximately 1.30 GB application image started its own model and its API reported the exact pinned model ready. Exact production promotion and public model/browser verification remain required before calling this release live. Retired provider code, labels, seven obsolete manifests and 28 screenshots showing retired labels were removed from the checkout. Unmodified historical evidence remains available at the baseline commit and in a verified local archive. Provider contract fixtures exist only in unit tests and are never copied into the runtime image; actual-model checks and browser journeys use real weights.

[Local verification](../../evidence/reports/tev1-local-verification.json) and [desktop guide](../../evidence/screenshots/tev1-local-guide-desktop.png), [selected activity](../../evidence/screenshots/tev1-selected-category-desktop.png), and [phone category](../../evidence/screenshots/tev1-selected-category-phone.png) captures record actual inference, reload stability and category changes without question reshuffling. The workflow above supplies verification for the subsequent fixes and final application revision.

## Regression fixes already completed

- `37cc3d8203fb9d6026228ba0505c1e82833f702e` restores city presence before paused rendering. Returning from a course and immediately opening the directory previously left the learner in the old course room; the two-browser social regression now verifies both city memberships before team/moderation actions.
- `79435668a388b3c3c3238e2d3d9c1ccb3b59fe52` raises the phone chase camera as the guardian closes, preserving foot visibility. Browser CI uses four isolated shards; aggregate `verify` remains the release gate. No journeys or assertions were removed.
- `9e2424d454aef54454d4a0b6c77022fce921eab6` gives full phone/studio journeys a five-minute budget and actual model responses a 90-second budget. Phone DOM interaction waits remain 15 seconds. This corrects cold CPU inference timeouts without substituting responses or weakening progression checks.

## VPS observations and access blocker

The deployment installation is `/home/agents/amamihe-deploy/{bin,source,releases,shared}`. User units are [amamihe-deploy.service](../../deploy/contabo/amamihe-deploy.service) and [amamihe-deploy.timer](../../deploy/contabo/amamihe-deploy.timer); see [deployment operations](../../deploy/contabo/README.md). The trusted scripts in `bin/` are installed separately; changing repository copies does not update them automatically.

The user's journal confirms this attempt started at 20:12:05 UTC (22:12:05 CEST), fetched `9e2424d` at 20:12:17, verified the pinned model manifest at 20:18:09, and finished exporting image layers at 20:19:10. Its last supplied line was `sending tarball`. This proves the runtime/model download and build progressed, but does not prove Docker import, release packaging, app promotion, rollback or a later timer retry completed.

The repository unit has `TimeoutStartSec=20min`. Its timer uses `OnBootSec=2min`, `OnUnitInactiveSec=5min` and up to 30 seconds of randomized delay. Installed overrides and subsequent service state were not available. Do not infer a specific VPS failure from the elapsed CI wait. The VPS builds the approved source in its bounded builder, then packages and promotes it; it does not simply install the GitHub image artifact.

This cloud session has `vpn_configured: true`, but its TCP domain/CIDR grants are empty. A bounded connection to the configured `proxy:8088` listener was refused even outside the filesystem sandbox; no SSH connection to `agents@100.98.106.21` was established. The app's read-only desktop terminal did not return output either. HTTP proxy access and a configured Tailscale key do not establish working SSH access. Use the supported cloud TCP forwarding/configuration path with a grant for the intended host, or an already authorized remote execution environment; preserve SSH host-key verification. Do not install Tailscale in the executor or bypass the managed network policy.

GitHub authenticated access resumed and successfully restarted failed-job verification. No new token was required. A separate attempt to inspect CI credential names was denied by integration permissions; no credential values were accessed. There is no established CI path for running commands on the VPS.

## Resume from here

1. Read the current workflow result, `main`, `deploy/verified-main` and public health. This documentation commit triggers a new workflow, so the original application SHA is not automatically the current deployment target. Do not rerun passing model regressions merely to monitor deployment.
2. Establish authorized VPS command access. Once available, inspect the installed user unit/overrides, service journal and only the Amamihe builder/releases/app. Identify whether Docker import, packaging, the service time limit, app health or rollback prevented promotion before choosing a fix. Do not ask the user to repeatedly relay logs.
3. Preserve private `shared/` configuration, PostgreSQL data/TLS, email settings, learner checkpoints and unrelated host services. Avoid global Docker pruning, database recreation or replacing reviewed host scripts implicitly. If the installed service actually timed out, adjust only its own limit based on the observed stage and retain the existing release checks.
4. Promote the current CI-approved revision through the reviewed deployment helper. Require `/api/health` to report that exact revision, PostgreSQL, `classifier: "ollama:tev1:0.8b"`, `decisionService.ready: true` and the pinned model digest. Require the matching client bundle and the read-only desktop/mobile checks in `scripts/browser/verify-production.mjs`. Do not create synthetic production accounts or send signup emails for smoke checks.
5. Record actual public acceptance before describing the model integration as deployed. Pedagogical calibration and physical-device evaluation below remain separate work.

## Cloud development state

The verified native runtime is at `/workspace/.tools/ollama-v0.40.3`; the model store is `/workspace/.cache/amamihe-ollama`. The current-session development API used port 3004, disposable data under `/tmp/amamihe-tev1-development-data`, and test-only email delivery. Process IDs, `/tmp` reports and open connections are temporary; verify readiness and restart owned services after environment restoration.

Reusable installation/start instructions were saved to the cloud configuration draft, including `scripts/models/install-ollama.sh` and `scripts/models/pull-tev1.py`. Publication of that draft and restoration into a fresh session were not verified. Do not confuse saved setup instructions with a published environment or working VPS access. The model is bundled in the VPS image independently of this cloud draft. Disposable Docker QA containers and delay relays were removed; no unrelated Docker resources were pruned.

## Remaining evaluation boundaries

The upstream model card reports 63.5% mean accuracy over general public decision datasets for the 0.8B model. That is not measured educational classification accuracy. Tutor-reviewed pedagogy, language calibration, prompt-injection behavior, physical learner-device performance, and production concurrency remain separate evaluation work. Inference is local to the VPS; the browser still renders its own world and downloads no model weights.

Sources: [Ollama model card](https://ollama.com/library/tev1), [Together AI project](https://github.com/togethercomputer/tev1).
