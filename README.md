# Amamihe

A browser-based 3D human-simulation learning world. This repository implements the first technical foundation: an explorable neighborhood, guest avatars, a small authored checkpoint, persistent progress, and a mock classification adapter.

## Implemented Foundation

- React/TypeScript interface and Babylon.js scene with course houses, an avatar, movement, camera orbit, and house interaction.
- Keyboard and mobile touch movement, with low/medium/high rendering settings. Low starts at 360p in the city, reduces toward 144p when frames arrive slowly, and caps renders at approximately 15 FPS. Medium and High cap render height at 720p and 1080p; interface text retains screen resolution.
- Free starter-outfit selection and an HTTP-only cookie-backed guest identity. No password, email, or third-party account is required for this prototype.
- Fastify API with persistent local PostgreSQL through PGlite in `.data/`, or shared PostgreSQL through `DATABASE_URL` for hosted deployments. The local development default needs no separate database server.
- Three tutor-authored questions about tokenization, held-out evaluation, and training from scratch. These demonstrate the assessment plumbing, not the complete 1M-parameter-model curriculum.
- Immutable response chunks, server-recorded assistance, post-clearance mock classification, server-controlled points, idempotent completion, and FSRS review scheduling.
- Guest progress and unfinished response sequences restored after page refresh. Guest identity is tied to the browser cookie; clearing it loses access to that identity.

## Run

Requires Node.js 24 and npm. Run from the repository root:

```sh
npm ci
npm run build
npm start
```

The application and API share port 3000. `PORT` changes the port; `DATA_DIR` changes the local database directory. Verify startup and database connectivity with `curl --fail http://127.0.0.1:3000/api/health`.

For development, run `npm run dev:api` and `npm run dev` in separate terminals. Vite forwards `/api` to the local API. No credentials are needed. Do not put future OpenRouter keys into frontend variables.

## Database Configuration

Leave `DATABASE_URL` unset to use existing `.data/` progress. For a host with an ephemeral filesystem, configure `DATABASE_URL` as a server-side secret pointing to an external PostgreSQL database, for example a Neon pooled connection. The server creates its existing tables on startup; changing databases does not copy local progress.

With `NODE_ENV=production`, startup requires `DATABASE_URL` and session cookies always use `Secure`. This prevents a hosted preview from silently putting learner progress on ephemeral disk. Local development leaves `NODE_ENV` unset and retains PGlite.

| Setting            | Purpose                                                                                                       |
| ------------------ | ------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`     | `postgresql://USER:PASSWORD@HOST/DATABASE?sslmode=verify-full`                                                |
| `DATABASE_CA_CERT` | Optional PEM CA certificate for a private certificate authority; publicly trusted providers need no override. |
| `DATA_DIR`         | Local PGlite directory, ignored when `DATABASE_URL` is set.                                                   |

External connections verify certificates and hostnames, including URLs supplied with `sslmode=require`. Unencrypted connections are allowed only for explicit loopback development URLs with `sslmode=disable`. Connection pooling is limited to five clients. Assessment completion retains one database transaction and row locking so concurrent requests cannot duplicate points. Graceful shutdown closes database connections.

`.env.example` contains placeholders. The process reads environment variables; `npm start` does not automatically load a `.env` file. For local external-database testing, use `node --env-file=.env --import=tsx server/index.ts`. Never commit actual connection URLs or expose them through `VITE_*` settings.

## Validation

```sh
npm run typecheck
npm run format:check
npm test
npm run test:browser
npm run audit:browser
```

Browser tests use Playwright and system Chromium at `/usr/bin/chromium`; set `CHROMIUM_PATH` for another installation. Alternatively, install the Playwright browser with `npx playwright install --with-deps chromium` and set `PLAYWRIGHT_MANAGED_BROWSER=1` for `npm run test:browser`. The audit currently uses system Chromium or `CHROMIUM_PATH`.

Tests exercise rendered movement, guest onboarding, course submission, the classification boundary, idempotent rewards, assistance records, persisted results, in-progress recovery, player isolation, and cross-origin mutation rejection. The configured CI workflow runs these checks; it has not yet been executed on GitHub.

Storage tests verify local restart persistence, transaction rollback, and concurrent idempotent rewards. Set `TEST_DATABASE_URL` to a disposable PostgreSQL database to run the optional external-storage integration test; `TEST_DATABASE_CA_CERT` accepts its private CA when necessary. Without that setting the external test is explicitly skipped. Use `DATABASE_URL` with the running server to exercise browser workflows against PostgreSQL.

## API and Mock Adapter

`GET /api/session` restores identity, completed evidence, and the latest active attempt. `POST /api/session` creates or changes a guest profile. `POST /api/attempts` opens a checkpoint; `/api/attempts/:id/help` records tutor assistance; `/chunks` stores a response; `/complete` verifies all questions exist before assessing and routing.

`server/classifier.ts` is the replacement boundary for the future OpenRouter classification implementation. The current mock evaluates known answer keys and assistance flags; it does not invoke or train a model. Three independent correct responses recommend `advance`; two recommend `retry`; fewer recommend `review_prerequisite`. The backend records the accepted result and awards points exactly once per attempt. Repeated practice opens a new attempt and may earn additional practice points; the full economy is not implemented.

The next level is a recommendation display, not a playable implemented course level. An assisted response never counts as independent mastery; full authored retry variants are part of the later course-authoring implementation.

## Evidence and Limits

See [STEP_01_STATUS.md](STEP_01_STATUS.md) and `evidence/browser-audit.json` for current results. CPU/network emulation is not proof of compatibility with every physical 2 GB phone or laptop. The audit reports JavaScript heap and a Linux browser-process memory snapshot separately; neither establishes physical-device performance.

Step 1 does not implement the tutor studio, full curriculum/training environment, timed chase/racing/wrestling mechanics, real multiplayer, portals, ads, Learning Police, or a live OpenRouter model. Other avatars are local NPCs. Low uses two baked braided residents and two short-haired residents; Medium/High retain idle animation on the braided pair. The player remains animated at every quality. Rendering pauses behind checkpoint panels and when the tab is hidden.

## Preview Deployment

The application serves the client and API at one origin. The selected target is an existing shared VPS and `amamihe.online`; [DEPLOYMENT.md](DEPLOYMENT.md) describes isolated containers, immutable releases, private configuration, and deployment checks. The application port binds to loopback behind an inspected HTTPS route. Database ports remain private. Existing services and their listeners must be preserved.

Local production-container checks passed for HTTPS delivery, assessment completion, database TLS, restart recovery, and backup/restore. The attached cloud session lacks an active Tailscale connection and TCP grants; its environment draft is stale. Remote deployment and public browser verification remain blocked. No public preview URL has been established.

[HOSTING.md](HOSTING.md) retains **Render Free + Neon Free** as an alternative. Guest authentication and rate limits are prototype safeguards, not a production account system. No OpenRouter calls or purchased assets were used. Asset provenance and optional Blender rebuild commands are documented in [ASSETS.md](ASSETS.md).

## Visual Implementation

The fullscreen world uses a rigged explorer GLB with authored idle/walk clips, a separate dressing-room scene, locally rendered avatar portraits and outfit thumbnails, and house entrances with visible interiors. Low downloads a 14,473-triangle, 25-joint derivative and uses CPU skinning, static resident poses, simpler lighting, and adaptive render resolution. The course action is anchored to its 3D sign; the minimap tracks position. HUD groups use shared screen margins and responsive rules. `node scripts/capture-visuals.mjs` records actual browser captures. Playwright allows 120 seconds for complete journeys with multiple software-WebGL scene restores; that timeout does not establish rendering performance. `audit:browser` measures the performance budget separately.
