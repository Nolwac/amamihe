# Learning city and playable lessons handoff

Visual refinement requested on 15 October 2026 is tracked in [VISUAL_WORLD_HANDOFF.md](VISUAL_WORLD_HANDOFF.md). Preserve the later inclusion and production-recovery changes on current main when continuing.

## All-branch reconciliation — 14 October 2026

The desktop audit found that production correctly served `8d039bc51c8c6fb32281ce93b64c23817b2fb7fd`, but PR #6 at `c2a30b01a11280ff31fa48e5b49d57c7e5b0a635` was still outside `main`. The user requires every remote branch to be reconciled before claiming all changes are deployed. Integration is complete in `b3fc38e`, followed by reconciliation of the superseded deployment history in `38bfc33`. Every audited remote head is now an ancestor of the combined source. The branch's final [CI run](https://github.com/Nolwac/amamihe/actions/runs/38537105792) passed 136 Node checks and all 36 real-model browser journeys, with one optional external-PostgreSQL skip.

The combined source preserves the production recovery: two-thread owned model startup, exact readiness and release checks, packaged cold-inference verification, archive integrity and retained rollback packages, and the 30-minute public deployment wait. The independently preserved model manifests are byte-identical. Integration uses the bounded manifest read and both provenance test suites; their checks still reject altered bytes before network access or destination creation. The current recovery handoff remains intact.

GitHub production approval now enumerates every published branch and requires each head to be an ancestor of the verified main revision before updating `deploy/verified-main`. Unmerged work blocks approval. The final deployment report must refresh that inventory and compare it with the exact live revision again, because branches can change after CI starts. The prior source review's partial-main deployment claim is corrected by this audit.

| Remote branch | Audited head | Reconciliation |
| --- | --- | --- |
| `feat/learning-city-experiences` | `c2a30b0` | Merged playable missions, characters, course houses and police transport in `b3fc38e`. |
| `feat/local-tev1-decisions` | `fb1d7e3` | Already an ancestor of `main`; actual local inference is deployed. |
| `fix/physical-adventure-audio` | `abc3a7f` | Already an ancestor of `main`. |
| `fix/immersive-learning-recovery` | `abb352a` | Already an ancestor of `main`. |
| `fix/mobile-controls-kids-world` | `c5ca880` | Already an ancestor of `main`. |
| `deploy/contabo` | `59ae13e` | Superseded proposal; history merged in `38bfc33` while retaining the installed, tested pipeline. |
| `deploy/verified-main` | `8d039bc` | CI approval pointer; advance only through successful main verification. |

The older Contabo proposal downloads GitHub artifacts after a fully successful workflow and introduces a dedicated Cloudflare Tunnel. Current production instead uses a VPS-only read-only SSH key, an approval reference published before public verification, bounded local builds, the reviewed release validator and a systemd timer. The pre-public approval avoids a circular wait for deployment acceptance. Existing Caddy and Cloudflare already provide isolated public HTTPS, certificate renewal, HTTP restriction and HSTS. Build-context restrictions and non-root runtime protection also exist in the current Dockerfile. Reapplying the obsolete transport/tunnel would replace a working system without adding an unmet requirement. Record that branch as superseded rather than restore its old runtime implementation.

After the combined source passes CI, promote it through the normal approved-reference pipeline and require matching live server/client revision, PostgreSQL, the exact ready model, all five maintained children's courses and actual desktop/phone browser acceptance. Keep credentials, existing accounts/progress and unrelated VPS services intact. Until that acceptance completes, the deployed revision above remains the live baseline. Historical implementation observations below are retained as dated evidence.

The combined source passes local build/typechecking, formatting with Windows line-ending handling, 28 focused asset/gameplay/provenance checks and both Python integrity checks. A fresh private database backup passed archive validation before the additive avatar migration; record counts, deployment state and existing container start times were also preserved for post-promotion comparison. The public checker now verifies the exact hashes of all new character/portrait/resident/officer assets and the two physical puzzle types without creating accounts or submitting learner work. The matching main [workflow run](https://github.com/Nolwac/amamihe/actions/workflows/checks.yml?query=branch%3Amain) records complete regression results, packaged cold inference, branch reconciliation, release approval and exact public desktop/phone acceptance; its production evidence artifact records the accepted revision. Do not interpret the earlier branch-only CI or the historical “not deployed” notes below as that final acceptance.

### Combined-source renderer correction

The first combined [workflow](https://github.com/Nolwac/amamihe/actions/runs/38572429182), at `094a01c`, passed 136 Node checks, both Python checks and 35 of 36 browser journeys. Production approval was blocked. The remaining phone journey completed its gameplay assertions but its avatar-color capture contained an entirely blank 3D canvas and zero light-shoe pixels. The snapshot still recorded valid rig projections; a later slide capture rendered normally. Inspection found automatic quality scaling resized the backing buffer immediately **after** `scene.render()`, leaving it cleared until the next throttled draw.

Adaptive resizing now occurs before drawing, and layout/quality resize requests bypass the 100 ms render throttle for a prompt new frame. Avatar captures wait for three actual completed frames after panel/pose settling. All original material, shoe-color, rig, jump, obstacle, checkpoint and reward assertions remain intact. Fresh combined verification must pass before any release is approved; the failed run remains recorded as failed.

## Work started — 14 October 2026

Baseline: `433311a3c19f0c0a78f9093e7d60fd572b61b1d8`, following the [local tev1 handoff](TEV1_HANDOFF.md). Work is on `feat/learning-city-experiences`. Production promotion of the preceding model release remains unresolved; this work does not claim a live deployment.

The learner feedback requires walking/running officers in a recognizable uniform, an arrest and boarding sequence, a police car journey to a permanent city station, varied human characters, reachable houses for published courses, and learning challenges whose solutions drive actual gameplay. Do not add a typing course. Preserve existing checkpoints, unlimited practice/replay, independent evidence, real local decision inference and exactly-once rewards.

## Inspection findings

- `src/World.tsx` assigns course entries to four hardcoded houses, so additional publications do not receive a city house.
- Street residents use a frozen static asset. The first resident doubles as the arresting officer, so moving its root cannot animate a gait.
- Arrest currently interpolates the learner/officer into an enclosure created near the starting position, with no transport or permanent station.
- The player and background residents derive from the same character. Cloth recoloring alone does not supply different silhouettes, faces or gender presentation.

## Implementation in progress

1. Build deterministic course blocks with accessible entrances and explicit city navigation; retain bounded asset loading.
2. Add a permanent station, a uniformed animated officer and a staged vehicle transport encounter. Keep detention/release authority on the server.
3. Provide visibly different character choices and residents, including masculine and feminine presentations, while retaining skeletal motion and Low assets.
4. Add original fraction-building and circuit-solving courses. Learner-controlled objects must express the actual answer, and successful learning must cause the corresponding construction or power effect. Keep authored tasks and server grading authoritative; no typing game or generated lessons.
5. Validate saved progress, course access, encounter motion and learning effects through Node/browser regressions with real local model inference; record actual captures and results here.

## Verification completed locally

Build/typechecking, formatting and `git diff --check` pass. The final Node suite reports **133 passes, zero failures and one optional external PostgreSQL skip** (134 total). The original collision/budget/continuous-normal test remains intact; the new renderer contract checks rounded face winding against Babylon’s standard box. Transport paths also pass at both edges of course entrances, and the final cell position is canonical even under variable frame timing. Puzzle validation rejects malformed gate objects without coercion.

All **36 browser journey names have passing results** across the initial full suite and final focused reruns, using the pinned real local `tev1:0.8b` runtime. The initial full suite had 35 passes and an ambiguous character-flow selector caused by several identically named tutor templates. Subsequent checks explicitly select the maintained children’s catalogue and handle a valid pilot-only final city block. The seven other affected rendering/game flows pass; the final police arrival/release and bridge-capture reruns pass separately. The machine-readable [verification report](../../evidence/reports/city-learning-verification.json) retains every run’s actual results. This is software-browser validation, including a 390 × 844 phone viewport; physical phone performance and child learning outcomes were not measured.

Verified behavior includes:

- Free character choice survives email verification, reload, wardrobe changes and course entry without changing points. City residents have distinct heads, hair and silhouettes. Peer rendering carries the account’s chosen profile.
- Every tested publication gets a district house. The browser publishes seven additional courses, finds their houses across blocks and walks to an actual entrance. The map/navigation share physical coordinates; filtering the finder does not rearrange the city.
- Actual skeletal officer motion, a navy uniform without cloth-palette substitution, both seated passengers, moving vehicle transport and permanent interior detention pass. Paths go around course walls and through the station doorway. The officer leaves the cell before its door closes. Break protection, free course release and appeals remain intact.
- A physical beam can be picked directly in 3D. Paused unfinished work resumes on its original delivery, accepted pieces are audited, and partial missions cannot award a completed-level reward. The learner walks on the verified bridge. Both new courses also restore exact earned constructions after completion and reload.
- Rounded objects now use exterior face winding; their illuminated surfaces render correctly rather than exposing inward faces. Captures wait for completed rendering after panel resizing. Actual images show the officer, patrol car, station interior and fraction crossing.

## Final implementation

Four free selectable character profiles and a uniformed officer derive from the verified Low explorer. Original heads/hair, standing residents, portraits and transport poses retain its 25-joint body rig. Blended Head/Neck weights keep the collar connected to the moving jaw; residents and portraits were rebuilt from those final assets. Twenty final asset/animation checks and both the profile and complete police browser flows pass after this refinement. Asset provenance and rebuild commands are in `docs/assets/ASSETS.md`. Each city block loads at most six published courses plus the maintained pilot. The separate children’s finder exposes all five maintained age-band courses.

Fraction Bridge (ages 8–12) and Circuit Rescue (ages 10–14) each contain two levels, four original missions, four mapped fresh retries, reading and optional drawing practice. The server checks actual beam/relay evidence; a plain answer cannot submit a playable task. Correct independent learning builds the crossing, powers the lighthouse or opens a maintenance hatch. Earned construction is saved on progress; unfinished work uses delivery-scoped drafts. Movement, equipment, assisted answers and repeated completions cannot create mastery or duplicate rewards. Tutor Studio offers both authored course starters. No inference credential is required for local Ollama.

Captures: [bridge](../../evidence/screenshots/city-learning-fraction-bridge.png), [officer](../../evidence/screenshots/city-learning-uniformed-officer.png), [transport](../../evidence/screenshots/city-learning-police-transport.png), [station](../../evidence/screenshots/city-learning-station-cell.png).

## Publication and continuation

Feature branch `feat/learning-city-experiences` is pushed and under review in [PR #6](https://github.com/Nolwac/amamihe/pull/6). Implementation commit: `2d3b376`; final character/asset refinement: `f8c1846`. Baseline: `433311a3c19f0c0a78f9093e7d60fd572b61b1d8`. GitHub API access recovered without requiring user intervention. The PR workflow is responsible for remote verification; no remote CI success is claimed here.

### Reproducible model installation

[Workflow 38507730471](https://github.com/Nolwac/amamihe/actions/runs/38507730471) passed formatting/building on all four runners but stopped before Node/browser checks: the upstream `tev1:0.8b` tag now resolves to a different manifest (`abc31fdb0bf52506cc47091145ac19c4cfb509b73a6841789324f9e32200c099`). Its configuration advertises 772.85M parameters and requires Ollama 0.40.4, whereas this release verifies the 752.39M decision model with Ollama 0.40.3. Do not change the expected digest to accept an unreviewed revision.

The installer now reads the exact, previously verified upstream bytes from `scripts/models/tev1-0.8b.manifest`, SHA256 `8d11b3146b7f3f4f4d5e9a64665ab2bdaf8b46e4ec42a5880b60a716ae50e3fb`, and requests official registry blobs by their immutable digests. That file was recovered from the validated local model store; its raw formatting must remain intact. The registry does not serve this historical manifest by digest, but all six original blobs remain available. A clean download into `/tmp/amamihe-tev1-pin-rebuild` verified every blob's exact size/SHA256, the original model capabilities and the final manifest. Eight focused tests pass, including real classification and level/category/question selection against an isolated daemon using that fresh store, plus rejection of altered manifest bytes before any model store is created. Formatting, typechecking and Python syntax checks pass. Runtime version, weights, TLS and inference provenance checks remain unchanged. Remote CI must rerun with this reproducible installer.

### CI timing follow-up

[Workflow 38533350185](https://github.com/Nolwac/amamihe/actions/runs/38533350185), at `ca81125`, passed installation/building on all four runners and **135 Node checks with one optional PostgreSQL skip**. Browser results were **33 passed, three failed**. All five maintained children's courses completed their four challenges. The failures exposed a slow-renderer arrest clock and two checks with five-second expectations while real enrollment/checkpoint requests were still pending.

Police presentation now consumes bounded elapsed time in small movement steps, rather than losing three quarters of each one-second frame to the manual movement cap. This preserves the intended walking/driving speed on a slow renderer and bounds recovery after suspension. Five transport/path checks pass, including travel speed and complete station arrival at 1, 3, 10 and 60 FPS. The enrollment and multi-theme browser checks now await successful real API responses within the existing 90-second inference budget before checking the character, badge and saved rewards. Their UI assertions remain intact. All three affected browser journeys pass locally after the corrections; the full arrest/release flow takes 37.9 seconds and the multi-theme/reward flow about one minute. Build/typechecking, formatting and diff checks pass. Inspect the latest PR-head workflow for subsequent remote results; the earlier failed run remains recorded rather than relabeled.

[The following CI run](https://github.com/Nolwac/amamihe/actions/runs/38535540467), at `24f9d3c`, passed **136 Node checks with one optional PostgreSQL skip**, and browser shards 1 and 3. The police sequence reached detention, but the test looked for its brief transport phase after waiting for an earlier screenshot. Software-WebGL image readback can outlast the motion being observed. The browser check now samples the restrained and seated-transport phases at 100 ms intervals before any screenshot; it retains the actual gait, material, seated-passenger, station, appeal and release assertions, and captures the stable interior endpoint. The revised complete police journey passes locally in 37 seconds. Existing original officer/car captures above remain valid visual evidence. Check the latest PR-head run for final remote acceptance.

These changes have **not been deployed**. The preceding release’s unresolved VPS promotion/access boundary remains in `TEV1_HANDOFF.md`. Do not request repeated manual VPS logs or claim local verification establishes a live release. After source review, use the existing CI-approved deployment procedure and exact-release public acceptance. Further course work can turn the older question-based starters into more spatial missions, using these two playable examples; richer steering/boarding animation and physical-device performance remain useful subsequent polish.
