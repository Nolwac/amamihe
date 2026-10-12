# Step 4: Playable 3D Story and Individual Rewards

This report describes the initial timer and reward implementation. The corrected physical game loop, avatar clips, checkpoint continuity and audio are documented in [Physical Adventure Runtime](ADVENTURE_RUNTIME.md). Its final local validation passes, with 26 browser journeys and 95 Node checks passing; one optional external PostgreSQL fixture is skipped. Review, CI and production promotion remain pending as recorded in the [implementation handoff](ADVENTURE_HANDOFF.md).

## Playable Adventure

Published tutor-authored levels use Workshop, Temple Chase, Racing, or Wrestling.
The adventure renders a genuine Babylon.js scene with the existing rigged human
explorer, local materials, anchored task controls, and saved criterion progress.
Temple Chase adds a procedural stone guardian, moving obstacles, raised temple
walkways, and a section timer. Expiry produces Game Over and a new delivery ID
for the same failed step; previous independent criteria and completed levels remain.
Racing adds a human rival and task-driven pace boosts. Wrestling adds a human
sparring opponent and animated strikes. Faster independent responses increase
cosmetic action intensity. Buttons and three selectable 3D answer gates share the
same server-checked authored answer contract; the gates are not practical-skill
or physical-position assessments.

## Timers and Accessibility

A section starts explicitly after scene readiness. Server-clock activity leases
bound each connected update to five seconds; long disconnected or suspended-tab
gaps cannot consume the entire time budget. Pausing, opening authored resources,
requesting help, and changing tabs suspend active timing. Network latency within
a live lease can still contribute up to its five-second bound. Loading and
post-clearance assessment run outside the active task timer.

Tutor time, double time, and untimed play use identical learning criteria and
point rules. Reduced motion stops continuous action animation while retaining
3D tasks. Keyboard-operable answer controls and optional browser speech are
available. Manual 144p, 360p, 720p, and 1080p targets are capped by viewport size;
these do not establish automatic bandwidth or asset-tier adaptation.

## Rewards and Persistence

Independent level clearance awards activity points once in the enrollment
transaction and writes a unique ledger event. Existing balances receive an
idempotent opening record. Completing a course's confirmed mock checkpoints earns
one checkpoint-finisher badge. This badge does not certify model training or
practical mastery.

The wardrobe in Course Houses lists two cosmetic jackets, inventory, badges, and
available points. Purchase and equip routes validate ownership and lock the player
balance. Duplicate purchases return the owned item without charging again. Gear
changes the existing explorer's palette in the city and adventure; it never
changes assessment criteria or buys competence.

## Delivery Boundary

This is task-driven chase, foot-racing, and stylized sparring gameplay, not full
vehicle physics or a combat simulation. Presets share the authored quiz contract.
Remote training sandboxes, live OpenRouter classification, search portals,
multiplayer, teams, billboards, and Learning Police remain subsequent roadmap
work. Existing city houses and avatar onboarding are retained.

The 2 GB physical-device and global city performance acceptance gates remain open.
New scene captures are runtime screenshots, not concept images; final artwork
acceptance is not assumed.

## Initial Implementation Verification

Build and formatting checks pass. The Node suite passes 47 checks with one
optional external PostgreSQL fixture skipped. All ten browser journeys passed;
a follow-up gameplay run also verifies the refined 3D gate picking and render
resolution controls. The opening-ledger migration preserves historical balances
and remains idempotent. See [local verification](../../evidence/reports/step4-verification.json).

Runtime captures: [Temple Chase](../../evidence/screenshots/step4-temple-chase.png),
[Game Over](../../evidence/screenshots/step4-temple-game-over.png),
[Racing](../../evidence/screenshots/step4-racing.png),
[Wrestling](../../evidence/screenshots/step4-wrestling.png),
[Workshop](../../evidence/screenshots/step4-workshop.png),
[mobile adventure](../../evidence/screenshots/step4-mobile-adventure.png), and
[mobile wardrobe](../../evidence/screenshots/step4-mobile-wardrobe.png).

CI reruns the full suite before promotion. Its production browser job requires
this release's exact server revision, matching client bundle, gameplay/reward
feature flags, HTTPS/HSTS, authorization boundaries, and desktop/mobile rendering.
Production checks do not create accounts, send synthetic email, or write learner
records; authenticated gameplay runs against isolated test storage.
