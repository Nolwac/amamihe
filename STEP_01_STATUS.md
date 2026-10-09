# Step 01 — Foundation Status

## Delivery State

Step 1 remains incomplete. The browser-game foundation and mock classification loop pass local verification. Public deployment and physical 2 GB-device validation remain outstanding. Visual acceptance against the scene references has not been established.

## Implemented Foundation

- React, strict TypeScript, Vite, Babylon.js, Fastify, local PGlite, optional external PostgreSQL, and FSRS review scheduling.
- Separate avatar-studio and street scenes, starter outfits, a rigged player, static street residents on Low, keyboard/touch movement, camera orbit, and course-house interaction.
- Responsive fullscreen HUD, projected course-entrance action, position-aware minimap, local textures, and adaptive Low render height from 360p toward 144p. Interface text retains screen resolution.
- A separate Low player asset: 720,764 bytes, 14,473 triangles, 25 joints, and retained Idle/Walk clips. Fine detail and independent finger articulation are reduced. The full-detail asset remains available for higher presets.
- Guest cookies, three authored assessment questions, immutable response chunks, assistance records, clearance checks, a labeled mock classifier, idempotent points, scheduled review, and recovery after refresh.
- Durable hosted-storage contracts, verified PostgreSQL TLS configuration, production startup checks, Docker packaging, CI configuration, lockfile, and documented install/start commands.

The next course is currently a routing recommendation, rather than an implemented playable level. Other street characters are local NPCs, not connected learners. Rendering pauses behind learning panels and in hidden tabs; Low uses simpler lighting and a software-rendering fallback.

## Verification

- Production build and TypeScript checks passed.
- The default Node run passed 12 tests and skipped the optional external-PostgreSQL integration test. Tests cover classification policy, both avatar rigs, actual walking data, Low asset budgets/source freshness, storage persistence, transaction rollback, and production configuration.
- Separate PostgreSQL-fixture checks verified transaction behavior and concurrent idempotent rewards. Production Docker checks verified health, static delivery, assessment completion, and recovery after container restart. These checks validate packaging and backend storage, not a connected cloud provider.
- All five Chromium checks passed across the latest suite and a focused journey rerun. The suite's journey timed out while collecting screenshots; its rerun passed after capture work moved to the separate capture script. Checks cover movement, assessment, persistence, isolation, assistance, and rendered frames from 320px to 1920px.
- The current software-WebGL audit at 390 × 844, 2 Mbps, 100ms latency, and 4× CPU slowdown measured 15.3 seconds to playable, 11–13 FPS, and 2.16 MB transferred. JavaScript heap was 66 MB; browser-process PSS was 558 MB, including 422 MB across renderer/GPU processes. These memory measurements exceed the provisional budget and do not establish physical-device compatibility.
- Local Compose checks verified trusted HTTPS, secure cookies, PostgreSQL certificate/hostname enforcement, restart recovery, and logical backup/restore. [Sanitized evidence](evidence/vps-compose-local-smoke.json) records those results; the disposable test stack was removed.
- [Current scene captures](SCENE_PREVIEWS.md#current-browser-implementation) were regenerated from the running build with no browser errors. They show actual prototype graphics; they do not establish visual acceptance against the concept artwork.

Run `npm run test:browser` and `npm run audit:browser` against the built application. Record startup time, frame rate, transferred bytes, JavaScript heap, and browser-process memory with the exact test conditions. Software WebGL and CPU/network emulation cannot replace tests on physical 2 GB phones and laptops.

## Deployment

The selected deployment target is an existing shared Contabo VPS with the domain `amamihe.online`. [The shared-VPS pipeline](DEPLOYMENT.md) packages immutable application releases and keeps database credentials, TLS keys, and persistent data outside the release. Public routing must preserve existing services and use an inspected, available port. Production requires a private `DATABASE_URL` and rejects silent fallback to ephemeral local storage. [Render Free + Neon Free](HOSTING.md) remains an optional alternative.

The attached cloud runtime reports Tailscale disabled and no TCP destination grants. Its configuration draft also rejects updates with `stale_base`. Remote inventory, deployment, DNS changes, public HTTPS checks, and browser verification of `amamihe.online` have therefore not occurred. No public preview URL has been established.

## Remaining Scope

Live OpenRouter classification is intentionally deferred for this step; the mock makes no inference calls. Tutor authoring, the complete approximately 1M-parameter storytelling-model curriculum, practice runtimes, chase/racing/wrestling mechanics, multiplayer, portals, billboards, and world enforcement remain later milestones.

The current characters and environments are stylized. [Asset provenance](ASSETS.md) describes the rigged assets and their reduced-detail derivatives; [scene references](SCENE_PREVIEWS.md) define the visual target. Completion requires current browser evidence, measured performance, an accessible deployed preview, and a clear account of remaining device and visual limitations.
