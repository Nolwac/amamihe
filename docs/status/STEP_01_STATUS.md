# Step 01 — Foundation Status

## Delivery State

The technical foundation is delivered. The browser game, authenticated accounts, persistent assessment loop, mock classifier, and HTTPS deployment are implemented. The public application is [amamihe.online](https://amamihe.online); its installation and operating procedure are recorded in [the Contabo deployment guide](../../deploy/contabo/README.md).

Physical 2 GB-device performance and final artwork acceptance remain separate validation items. Neither is established by this delivery status. Course authoring is delivered in [Step 2](STEP_02_STATUS.md).

## Implemented Foundation

- React, strict TypeScript, Vite, Babylon.js, Fastify, local PGlite, TLS-verified external PostgreSQL, and FSRS review scheduling.
- Separate avatar-studio and street scenes, starter outfits, a rigged player, local street residents, keyboard/touch movement, camera orbit, course-house interaction, and a position-aware minimap.
- Responsive fullscreen controls, locally served textures, and adaptive Low render height from 360p toward 144p. Interface text retains screen resolution; rendering pauses behind learning panels and in hidden tabs.
- A Low player asset with 14,473 triangles, 25 joints, and Idle/Walk clips. Higher presets retain the full-detail asset. Asset provenance and derivative budgets are documented in [ASSETS.md](../assets/ASSETS.md).
- Verified-email signup, password or one-time-code login, account settings, sign-out, salted password hashes, hashed session tokens, code expiry/attempt limits, and preserved legacy guest progress after verification.
- Three authored assessment questions, immutable response chunks, server-recorded assistance, clearance checks, a clearly labeled mock classifier, transactional idempotent points, scheduled review, and recovery after refresh or account login.
- Production configuration checks, container packaging, immutable release validation, CI checks, a verified-source deployment reference, and an isolated Contabo deployment behind the existing HTTPS proxy.

The foundation checkpoint recommends a next level rather than implementing the complete authored learning path. Street residents are local NPCs, not connected learners. Practice points do not establish mastery.

## Verification

The foundation Node suite at commit `2ffc3b2` passed **15 tests**, with one explicit skip for the optional external-PostgreSQL integration test. It verifies account recovery and progress migration, one-use verification codes, password/session behavior, provider isolation, avatar rigs and animation, mock classification, local persistence, transaction rollback, and production TLS/storage requirements.

Earlier local container checks verified trusted HTTPS, secure cookies, PostgreSQL certificate/hostname enforcement, restart recovery, and logical backup/restore. [Sanitized container evidence](../../evidence/reports/vps-compose-local-smoke.json) records these checks. The desktop deployment documentation records the live HTTPS installation and CI-gated promotion; those production checks are distinct from the local container fixture. GitHub Actions reports a successful foundation workflow for commit `2ffc3b2`; a green workflow approves the source revision, while actual promotion remains a host-side result.

Current integration changes must pass `npm run build`, `npm run format:check`, `npm test`, and `npm run test:browser`. Browser journeys exercise authenticated onboarding, movement, assessment, persistence, assistance, and account recovery. Current screenshots belong in `evidence/screenshots/`; concept references remain in [SCENE_PREVIEWS.md](../design/SCENE_PREVIEWS.md).

## Performance and Visual Follow-up

The [October 9 software-WebGL audit](../../evidence/reports/browser-audit-2026-10-09.json), preceding account authentication, measured 15.3 seconds to playable, 11–13 FPS, and 2.16 MB transferred at 390 × 844, 2 Mbps, 100 ms latency, and 4× CPU slowdown. JavaScript heap was 66 MB; browser-process PSS was approximately 558 MB, including 422 MB across renderer/GPU processes. These are historical measurements, not a benchmark of every subsequent build.

The measured memory exceeds the provisional budget. Re-run performance measurement after runtime or asset changes and validate on physical 2 GB phones and laptops. Record first-playable time, frame rate, transferred bytes, JavaScript heap, and browser-process memory with the exact conditions. Software rendering and CPU/network emulation do not establish physical-device compatibility.

Current characters and environments are stylized; final visual acceptance against the scene references remains unrecorded.

## Deployment and Milestone Boundary

The live installation binds the application to loopback, keeps PostgreSQL private, and uses the existing proxy for HTTPS. Private database/email credentials, certificate material, and deploy keys remain outside Git and release archives. CI approves a source revision only after checks and packaging succeed; the VPS polls that reference and promotes the application with rollback support. See [deployment operations](../../deploy/contabo/README.md) before changing host configuration.

The earlier cloud-session VPN/configuration conflict is historical and does not describe the deployed installation. This cloud runtime cannot independently inspect the VPS or public domain with its currently configured network policy; no remote production changes were attempted during this review.

Live OpenRouter classification remains intentionally deferred; the mock makes no inference calls. The visual tutor studio and authored curriculum belong to Step 2. Full chase/racing/wrestling mechanics, training runtimes, multiplayer, search portals, billboards, and world enforcement retain their later milestones in [IMPLEMENTATION_PLAN.md](../../IMPLEMENTATION_PLAN.md).

The [October 10 authenticated audit](../../evidence/reports/browser-audit.json) of the course-studio integration measured 60.1 seconds to playable, 3–6 FPS, 1.94 MB transferred, 37 MB JavaScript heap, and approximately 512 MB browser-process PSS under the same stated 390 × 844, 2 Mbps, 100 ms latency, and 4× CPU slowdown conditions. Adaptive rendering reached 144 pixels high. These results do not meet the intended responsiveness budget and require profiling and physical-device validation; functional delivery is not a low-memory performance acceptance claim. Account creation and email delivery are excluded from navigation timing.
