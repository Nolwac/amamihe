# Amamihe

A browser-based 3D human-simulation learning world. Players explore course streets, create learning adventures in a visual tutor studio, and complete tutor-authored checkpoints with saved progress. The deployed foundation is available at https://amamihe.online; release promotion follows the [Contabo pipeline](deploy/contabo/README.md).

## Repository Layout

```text
src/                  React interface, tutor studio, and Babylon.js scenes
server/               Fastify API, account authentication, storage, and courses
shared/               Course contracts and publication validation
public/assets/        Assets served by the game
tests/                Node and Playwright checks
scripts/assets/       Mesh, texture, and avatar builders
scripts/browser/      Browser captures and performance audits
scripts/deploy/       Release, deployment, and database TLS helpers
deploy/               Shared/standalone VPS configuration and Contabo operations
docs/                 Design, deployment, authoring, and milestone documentation
evidence/             Measured reports and actual browser screenshots
```

Architecture, implementation milestones, and mandatory product rules remain at the root. See the [documentation index](docs/README.md).

## Run Locally

Use Node.js 24:

```sh
npm ci
npm run build
npm start
```

The client and API share http://localhost:3000. Development uses `npm run dev:api` and `npm run dev` in separate terminals. Local storage defaults to persistent PGlite in ignored `.data/`.

Gameplay requires a verified account. Production mounts a private `EMAIL_CONFIG_FILE` outside Git; see [.env.example](.env.example) and the [Contabo guide](deploy/contabo/README.md). The client never receives email-provider credentials or verification codes from the API.

For isolated automated browser tests, use a test email outbox:

```sh
EMAIL_PROVIDER=test EMAIL_TEST_OUTBOX=/tmp/amamihe-test-outbox npm start
EMAIL_TEST_OUTBOX=/tmp/amamihe-test-outbox npm run test:browser
```

The test provider writes codes to private local files and refuses production use. Ordinary local development does not send email unless a provider is configured. Existing-account audits can use private `BROWSER_ACCOUNT_EMAIL` and `BROWSER_ACCOUNT_PASSWORD` environment variables.

## Course Authoring and Learning

Every signed-in player can open **Tutor studio**. Start a blank course or the six-stage storytelling-model template. Connect levels, select Workshop/Temple Chase/Racing/Wrestling presets, attach sourced resources, and edit questions, rubrics, hints, explanations, and fresh retry variants. Preview the authored tasks and genuine 3D preset scenery, then validate and publish. See the [authoring guide](docs/authoring/COURSES.md).

Published course versions are immutable. Four published houses load per district page; **Course houses** offers previews, explicit enrollment, district navigation, and saved adventures. **Search portals** opens a genuine 3D result universe with bounded previews and course-doorstep enrollment. Enrollments stay pinned to their original version after tutor edits. Draft ownership, optimistic revision checks, prerequisite validation, and transaction locks protect content and progress.

The playable checkpoint runner persists question evidence and assistance, requires criterion-mapped independent fresh retries after wrong or assisted answers, and awards each level's activity points once. Exhausted retry coverage stops progression. By default, a clearly labeled mock chooses an eligible next level only after clearance. The optional server adapter uses OpenRouter’s typed Jev Decisions API; a missing private key or zero cost budget prevents live calls. Neither provider generates teaching content. Quiz clearance and points do not certify practical competence.

Adventures use animated human rigs and physical encounters: jump, slide and change lanes while a guardian pursues you, earn race boosts through independent answers, spar against a reacting opponent, or build at workshop stations. Navigation assistance is enabled by default; select **Manual obstacle controls** before starting for direct obstacle play. Focus the world for arrows/A/D, Space to jump, S to slide and F to strike, or use the touch buttons. Game Over restores the current task's checkpoint. Open **Sound** and enable audio for original theme music and movement/action effects. See the [adventure runtime guide](docs/status/ADVENTURE_RUNTIME.md).

The corrective adventure/audio build passes final local validation and is ready for review; CI and production promotion remain pending. See the [handoff](docs/status/ADVENTURE_HANDOFF.md) for evidence and release boundaries.

**Model Makers** and the featured storytelling card open the published pilot directly: six sequential levels, twelve primary checkpoints and twelve fresh retries, with practical assignments for corpus preparation, byte tokenization, causal architecture, parameter accounting, training, and evaluation. Parameter and evaluation levels include server-checked arithmetic workbenches. The training level includes a downloadable **1,040,768-parameter** Python/PyTorch notebook for a learner-owned environment. Browser-hosted Python training and verified training competence remain outside this prototype. **Try foundations checkpoint** opens the separate three-question introduction; its completion cannot complete the pilot. See [pilot delivery](docs/status/PILOT_CURRICULUM.md).

## Storage and Production Configuration

Production requires `DATABASE_URL`, a private email configuration, and HTTPS. It cannot silently fall back to local application storage. External PostgreSQL verifies certificate trust and hostname; unencrypted connections require explicit loopback development `sslmode=disable`. `DATABASE_CA_CERT` supports a private CA. Pooling is capped at five clients.

Account, draft/version, enrollment, and evidence tables are created additively at startup. Course snapshots use bounded JSONB documents; ownership and pinned version relationships are relational. Changing databases does not copy existing progress. Keep credentials, TLS keys, backups, and learner data outside Git and release artifacts; never expose secrets through `VITE_*` variables.

`.env` files are not loaded automatically. For local external storage, use `node --env-file=.env --import=tsx server/index.ts`. Private examples contain placeholders only.

## Validation

```sh
npm run format:check
npm run build
npm test
npm run test:browser
npm run audit:browser
```

Playwright defaults to `/usr/bin/chromium`; set `CHROMIUM_PATH` for another system browser. Alternatively install with `npx playwright install --with-deps chromium` and use `PLAYWRIGHT_MANAGED_BROWSER=1`. Browser tests require the test outbox and running built server above. Tests cover account verification/recovery, rendered movement, authoring/publication, version isolation, independent retries, reward integrity, and refresh recovery.

`TEST_DATABASE_URL` enables the optional disposable external-PostgreSQL integration test; `TEST_DATABASE_CA_CERT` accepts its private CA. Without it, that test is explicitly skipped. CI runs build, formatting, Node/browser checks, and release packaging before approving deployment.

## Delivery Boundaries

[Step 1](docs/status/STEP_01_STATUS.md) records the deployed technical foundation; [Step 2](docs/status/STEP_02_STATUS.md) records course storage, studio, curriculum, and verification. [Step 3](docs/status/STEP_03_STATUS.md) records bounded post-clearance mock grading, criterion aggregation, and pending recovery. [Step 4](docs/status/STEP_04_STATUS.md) adds playable task-driven chase/racing/sparring, section timers, badges, and a cosmetic wardrobe in Course Houses. [Step 5](docs/status/STEP_05_STATUS.md) adds adaptive rendering and bounded public-asset caching. [Step 6](docs/status/STEP_06_STATUS.md) adds isolated JavaScript, drawing and downloadable training notebooks. [Step 7](docs/status/STEP_07_STATUS.md) adds authored recall encounters and conservative review scheduling. [Step 8](docs/status/STEP_08_STATUS.md) adds opt-in shared avatars, private teams, preset communication and server-scored battles. [Step 9](docs/status/STEP_09_STATUS.md) adds accessibility checks and local device reports. [Step 10](docs/status/STEP_10_STATUS.md) adds the typed classifier adapter. [Step 11](docs/status/STEP_11_STATUS.md) adds server-checked arithmetic practice. [Step 12](docs/status/STEP_12_STATUS.md) adds 3D search portals. [Step 13](docs/status/STEP_13_STATUS.md) adds moderated street/course billboards. [Step 14](docs/status/STEP_14_STATUS.md) adds Learning Police with protected breaks, replay-safe fines and learning release. [Step 15](docs/status/STEP_15_STATUS.md) adds bounded peer animation, reconnect behavior and private moderation operations. Physical 2 GB-device acceptance, learner studies, live classification and trusted remote training verification remain evaluation gates. Moderation requires a privately assigned operator.

Low quality preserves genuine 3D with adaptive 144–360p rendering and a reduced-detail rigged player; text retains screen resolution. Studio/adventure views release the city scene instead of running two worlds together. Software-browser measurements cannot establish physical 2 GB-device compatibility or final artwork acceptance. [Asset provenance](docs/assets/ASSETS.md) and [scene references](docs/design/SCENE_PREVIEWS.md) document the visual baseline.

### Compact adventure controls and saved work

Course controls start collapsed. **?** opens the authored task, **▤** lists field journals/workstations, **◇** opens the ten-role learning camp, **↻** replays a level/course or returns to its original checkpoint, and **♪** opens sound and volume settings. **▶/Ⅱ** starts, resumes or pauses the current section; **⌂** returns to the city. Select a journal's actual 3D surface to study its authored resource. Reading and practice pause active timers; close the journal and explicitly resume to continue.

The same-device last-open course returns paused after reload. Selected answers, journal pages and practice workspace drafts persist locally per account; submitted evidence and checkpoints persist on the server. My learning resumes those checkpoints on another device. Replays and repeated practice have no count limit and do not duplicate earned rewards. Previously explained tasks remain practice when no fresh independent variant exists. A completed course journey requires the ten teaching roles as well as independent checkpoint clearance. See the [follow-up handoff](docs/status/IMMERSIVE_LEARNING_HANDOFF.md) for verification and release status.
