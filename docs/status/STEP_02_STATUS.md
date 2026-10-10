# Step 02 — Course Database and Visual Tutor Studio

## Delivery State

The course database, visual tutor studio, publication validation, and authored learner runner are implemented. The build, formatting, and storage checks pass. Browser verification covers tutor publication, a separate learner completing all six checkpoints, refresh/resume, mobile editing, account recovery, and HUD alignment.

## Tutor-to-Learner Flow

Every verified account can create courses as well as learn. The tutor studio is the primary authoring interface: select Workshop, Temple Chase, Racing, or Wrestling presets; arrange path cards and prerequisite connectors; attach resources; configure questions, hints, explainers, independent retries, rubrics, authored time budgets, and activity rewards; then preview and publish the course. The editor provides keyboard reordering, focused resource/task dialogs, and mobile navigation.

Resources support authored text, HTTPS links, source citations, and bounded text imports (`.md`, `.txt`, `.py`, `.js`, `.ipynb`). Notebook, JavaScript, and drawing bindings describe the intended practice tool; external resources open explicitly in another tab. Embedded execution and binary uploads are not implemented.

Draft saves use revision checks and preserve unsaved edits after a conflict. Publication checks link errors to the affected editor section. Tutor previews show authored tasks and genuine 3D preset scenery without creating learner evidence or earning points.

Published versions remain immutable. Learner enrollment and response chunks bind to a specific published version so later draft edits cannot change an active assessment. A learner discovers a published course through its street house, enrolls, completes its authored tasks, and resumes saved progress through My Learning. The catalogue returns bounded pages of published courses.

## Authored Pilot Curriculum

The Model Makers Workshop has six authored stages: corpus rights and document splits, UTF-8 byte tokenization, causal architecture, parameter accounting, training, and held-out evaluation. Each stage supplies two primary questions and two distinct independent-retry questions, with hints, explanations, rubrics, and traceable references. Tutors must review this editable starter before publication; source links and automated checks do not establish expert review or curriculum certification.

Its reference architecture has **1,040,768 parameters**: a 256-token vocabulary, width 128, context 128, five blocks, four heads, feed-forward width 512, biased linear layers, two layer normalizations per block, final normalization, and a tied output embedding. An authored Python/PyTorch reference includes a 20-step smoke training loop without pretrained weights, external model APIs, or a dataset download.

This milestone demonstrates authored instruction and assessed checkpoints. Learners run the reference on their own available compute; integrated remote Python environments remain the practice-environment milestone. Quiz completion does not establish a training run, story quality, or practical model-building competence. No hosted training service is provisioned.

## Publication and Progress Rules

Publication rejects broken references, cyclic concept prerequisites, unreachable levels, incomplete task/help/retry coverage, invalid preset bindings, and missing or invalid HTTPS source URLs with actionable messages. Every retry names its primary checkpoint through `retryFor`; each primary checkpoint needs a distinct mapped retry. URL checks validate syntax and protocol, not credibility or licensing. Drafts belong to their creator; learner routes exclude answer keys, hints, explanations, and private rubrics.

Learner evidence remains server-authoritative. A wrong or assisted response selects a fresh authored retry mapped to the unsatisfied primary checkpoint. Previous independent successes remain satisfied; multiple variants for one checkpoint cannot satisfy another. Wrong or assisted retry responses consume their variant without earning credit. Clearance requires independent evidence for every primary checkpoint; missing fresh coverage blocks progress rather than inventing a task or granting clearance. These checkpoint checks do not establish practical training competence or expert-calibrated model grading.

Activity points stay separate from confirmed mastery. The mock route decision runs after independent checkpoint clearance and selects the next prerequisite-eligible authored level from persisted evidence. It makes no OpenRouter calls and generates no teaching content. Duplicate submissions cannot award points twice; the learner's account and course progress update in one transaction.

## Verification and Boundaries

`npm run format:check` and `npm run build` pass. The Node suite passes 38 tests with one optional externally configured PostgreSQL test skipped. A separate isolated production-container smoke passes eight checks against native PostgreSQL with verified TLS, including app/database restarts, immutable publication, enrollment pinning, assistance, and idempotent rewards; see [its report](../../evidence/reports/step2-native-postgresql.json). All **nine Playwright browser tests pass** against the built application. Captures show the [desktop studio](../../evidence/screenshots/step2-tutor-studio-desktop.png) and [mobile studio](../../evidence/screenshots/step2-tutor-studio-mobile.png). The browser tests also check avatar rigs and HUD separation at 1920, 1440, 768, 640, 390, and 320 pixels. Browser verification must exercise create → edit → validate → preview → publish → enter course house → complete authored tasks → refresh and resume. Tests must cover authorization, draft conflicts, immutable versions, prerequisite validation, retry coverage, learner isolation, and idempotent rewards.

Preset configuration and story staging do not establish completed Temple Chase, Racing, or Wrestling game mechanics. Authored time budgets are stored; game deadlines and failure mechanics are not enforced in this milestone. Full monster chases, vehicle physics, combat animation, criterion-level model grading, remote training environments, live classification, real-time learners, team battles, portals, billboards, and Learning Police remain the later phases in [IMPLEMENTATION_PLAN.md](../../IMPLEMENTATION_PLAN.md).

The existing production installation is documented in [the Contabo guide](../../deploy/contabo/README.md). The deployment workflow waits for the approved server commit and matching client bundle, then verifies public HTTPS and 3D account screens in desktop/mobile Chromium. Its production artifact records the promoted revision and screenshots; a local result alone does not establish promotion. Physical 2 GB-device performance and final scene-art acceptance remain the follow-up items in [Step 1 status](STEP_01_STATUS.md).
