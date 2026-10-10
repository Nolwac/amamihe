# Amamihe Implementation Plan

## Delivery Goal

Build a genuine 3D human-simulation learning world with explorable course streets, house-based enrollment, search portals, tutor-configured adventures, inexpensive classification, practice tools, and skill-driven social progression. The foundation is implemented; subsequent phases remain planned.

The first playable proof of concept must preserve 3D: a tutor creates and previews a small course in the visual studio; a learner enters its story, completes authored challenges, receives a predefined explanation when needed, retries independently, earns a milestone reward, and resumes saved progress. Broader environments and team play follow as explicit phases.

## Current Delivery Status

The technical foundation is implemented with a mock classifier in place of live OpenRouter access. Production build, storage checks, and local Chromium verification are available. [Render Free + Neon Free hosting](docs/deployment/HOSTING.md) is prepared; deployment needs provider credentials and private-repository authorization. Physical 2 GB-device tests are not complete. See [docs/status/STEP_01_STATUS.md](docs/status/STEP_01_STATUS.md) for evidence and remaining limitations. The mock is the authorized Step 1 substitute, not a verified classification model.

## Phase 1: Technical Decisions and Foundation

- Prototype the recommended React/TypeScript/Vite client, Babylon.js engine, Fastify API, PostgreSQL store, and `ts-fsrs` adapter. Select authentication and validate the baseline against the target devices.
- Test 2 GB phones and laptops with a provisional 10–15 FPS low-quality target, 3 MB initial transfer budget, and measured memory ceiling. Use existing infrastructure and verified free endpoints; no purchased services or credits.
- Verify an OpenRouter classification/scoring endpoint against tutor-reviewed fixtures before selecting it. The catalogue listing for Jev Router describes model routing, not educational grading; generic free reasoning models and safety classifiers are not verified substitutes. Preserve pending outcomes if no qualifying no-purchase endpoint is available. Validate selected IDs, enforce hard eligibility, and retain deterministic fallback for outages. Do not substitute a contextual bandit for the classification/decision model.
- Define server-authoritative learning state, reward records, assistance semantics, and assessment contracts.
- Establish lockfiles, formatting, tests, CI, and documented install/start commands.

**Acceptance:** A genuine 3D scene with an avatar and interaction runs on the target baseline. Tooling checks execute, costs have measurable budgets, and decisions are documented without claiming universal device support.

## Phase 2: Course Database and Visual Tutor Studio

- Store versioned concepts, prerequisites, resources, questions, hints, explainers, rubrics, retry banks, story levels, and component bindings.
- Build a visual course graph and story editor with reusable theme/widget selection, resource management, and learner preview.
- Allow tutors to configure levels, learning paths, difficulty, help, practice tools, and rewards without writing manifests.
- Validate prerequisite DAGs, story references, sources, component compatibility, and question/help/retry coverage before publication.
- Author the from-scratch 1M-parameter storytelling-model curriculum and configure Model Makers Workshop levels for data, tokenization, architecture, training, and evaluation; optional manifest import/export follows the internal schema rather than defining the primary UI.

**Acceptance:** A tutor can create, preview, and publish a short course through the studio. Incomplete retry banks and broken references produce actionable errors. Published course versions remain reproducible.

## Phase 3: Authored-Content Learning Engine

- Implement objective and intermediate-step evaluators using answer keys, rubrics, spatial checks, and executable tests as applicable.
- Present only authored or tutor-approved parameterized learning material; prohibit runtime generation of instructional content.
- Give grading requests bounded question-level context and routing requests a compact aggregated state plus eligible content IDs. Validate both response schemas, enforce token budgets, and provide deterministic fallback routes where supported.
- Enforce explanation-to-independent-retry transitions and persist attempts, assistance, decision reasons, and progress.
- Capture question/interaction chunks during the level. After level clearance, grade them in bounded classification calls, persist validated criterion scores/error tags, aggregate deterministically, and classify the next level plus tutor-authored task set. Keep uncertain results pending or send them for tutor review. In-level feedback and timers use deterministic checks, not route-classifier calls.

**Acceptance:** Tests cover independent pass, failure, hinted correction, explanation, failed retry, successful retry, exhausted question banks, invalid model IDs, provider failure, duplicate submissions, long-response chunking, aggregation accuracy, assistance preservation, and pending-result handling. Compare LLM grades with tutor-scored fixtures and ensure stage routing respects critical criterion failures. No route recommendation alone grants mastery.

## Phase 4: Playable 3D Story and Individual Rewards

- Build Venture City streets with course houses, explicit door enrollment, avatar/starter-outfit onboarding, and the Model Makers Workshop course adventure. Include spatial challenges and in-world resources.
- Bind studio-authored courses to the selected theme and provide clear transitions and milestone celebrations.
- Add badges, points, an avatar inventory, and a small cosmetic gear shop with an idempotent reward ledger.
- Preserve keyboard operation, readable overlays, reduced motion, optional speech, and configurable timers within the 3D experience.
- Connect progress restoration and the complete authored challenge/help/retry loop.

**Acceptance:** A learner finishes the prototype story and sees earned progression, a badge, and a cosmetic purchase. Reloads and repeated requests cannot duplicate points. Quality or accessibility settings cannot change mastery criteria.

## Phase 5: Adaptive Rendering and Resource Delivery

- Implement manual and automatic 144p/360p/720p/1080p target render-height presets within device limits.
- Adapt frame rate, lighting, shadows, effects, mesh detail, and compressed texture tiers while preserving true 3D interactions.
- Separate device-performance adaptation from bandwidth-driven asset selection and downloads.
- Cache reusable assets, stage level loading, bound prefetching, and persist interrupted attempts.
- Declare offline support per activity and test deterministic routes where inference is unavailable.

**Acceptance:** The same course remains a genuine 3D game across supported presets. Measurements demonstrate reduced asset transfer for lower asset tiers and reduced rendering load for lower render resolution. Tests cover bandwidth throttling, interrupted downloads, cache reuse, reconnection, and legible UI. Unsupported devices and network-dependent features are identified precisely.

## Phase 6: Embedded Learning Environments

- Define the practice-environment adapter contract and studio bindings.
- Prepare a Google Colab free notebook for the pilot, with Kaggle Notebooks or existing shared Python/PyTorch compute as alternatives. Use launch-and-return integration unless embedding is explicitly supported. Implement parameter-count checks, short training experiments, checkpoints, and evaluation tasks. Add a drawing canvas and isolated JavaScript practice without preloading heavy runtimes into 2 GB game clients.
- Support approved external embeds and a contextual launch/return path when embedding is blocked.
- Isolate code execution, restrict resources and networks, and validate cross-origin messages and submitted evidence.
- Link environment results to the correct learner, course version, level, and attempt.

**Acceptance:** Learners can practice and submit assessed work from the configured tools without losing game context. Timeouts, prohibited operations, unavailable remote runtimes, blocked embeds, and forged messages are handled. Actual infrastructure cost and offline capabilities are documented per tool.

## Phase 7: Review Scheduling and Deeper Adaptation

- Integrate FSRS or SM-2 using recorded review evidence and timezone-aware due dates.
- Select authored review encounters and remedial resources from the course bank.
- Configure adaptation windows and minimum evidence; match recurring errors to tutor-defined misconceptions.
- Assemble Codex summaries from evidence and approved templates; complete all ten pedagogical responsibilities without generating lessons during play.

**Acceptance:** Controlled-clock tests verify review scheduling. Repeated errors lead to appropriate prerequisite encounters. Assisted attempts do not inflate mastery, and insufficient evidence does not cause unstable difficulty changes.

## Phase 8: Social World, Teams, and Learning Battles

- Add authenticated presence, private invites, preset communications, and team creation/joining for rooms of up to eight learners.
- Implement a turn-based or asynchronous learning battle between two teams of up to four, with documented scoring, server-validated results, and shared in-game rewards.
- Preserve individual mastery evidence separately from team success.
- Add communication permissions, reporting/blocking, moderation, reconnect handling, and solo progression.

**Acceptance:** Two teams can complete a battle and receive the correct rewards exactly once. Duplicate events, disconnections, invalid scores, unauthorized joins, and participant reports are exercised. Social outcomes cannot grant mastery to a learner who has not demonstrated the skill.

## Phase 9: Proof-of-Concept Evaluation

- Run the complete tutor-to-learner flow on representative devices and connections.
- Check source traceability, actual supported languages, authorization, privacy, reward integrity, code sandboxing, and accessibility controls.
- Measure decision cost, asset transfer, rendering performance, completion, return visits, delayed recall, and transfer to practical work.
- Record what was implemented, deferred, or unavailable; compare outcomes with the defined budgets.

**Acceptance:** The demonstration establishes feasibility and usefulness with evidence. Engagement and earned rewards are not presented as proof of learning effectiveness. Prototype scope can be limited, but 3D, authored-content selection, visual authoring, practice environments, and social progression retain their stated place in the product direction.

## Baseline Validation and Remaining Decisions

Use the recommended technical baseline, initial curriculum/theme, social limits, and provisional performance budgets in [ARCHITECTURE.md](ARCHITECTURE.md) as the phase-one evaluation target. Confirm actual reference devices, hosting region/provider, authentication, sandbox implementation, and initial language coverage before the affected phases. Define content-bank coverage, mastery windows, target age group, retention, reward amounts, and offline boundaries through tutor review and pilot evidence. Record any departure from the baseline with its cost, learning, or performance rationale.

See [ARCHITECTURE.md](ARCHITECTURE.md) for the design and [RULES.md](RULES.md) for invariants.

## No-Purchase Readiness Gate

Verify no-charge decision inference, existing hosting, and an available training runtime before claiming the complete pilot works. Record quotas, account requirements, notebook restrictions, and outages. Disable billable fallbacks and top-ups. If a required free resource is unavailable, report the affected feature as blocked; pre-recorded training output and deterministic routing are not substitutes for demonstrated learner training and classification-model operation.

## World Expansion Workstreams

Deliver these alongside the existing phases; they are part of the product rather than separate unrelated demos.

1. **Identity and discovery (Phases 2–4):** let every account author or enroll in courses; build house previews, saved enrollment, city pagination, and creator publishing controls. Add search-portal invocation and a result universe with course previews, door teleportation, and a return path.
2. **Shared city and course presence (Phase 8):** support real-time avatars and moderated interaction both on streets and inside compatible course checkpoints. Test sharding, interest management, low-bandwidth presence, disconnects, and individual progress isolation on 2 GB devices.
3. **Billboards (Phases 4–8):** add street placement approval and tutor-controlled course placements, moderated creatives, disclosure labels, and bounded static assets. Test unauthorized placement, unsafe destinations, rejected ads, and expiry. No purchased ad service is needed.
4. **Learning Police (Phases 4–9):** implement a versioned server policy with warnings, arrest notice, temporary eviction, point fines, and goal-aligned learning release. Provide the fine-free learning path and an appeal workflow. Test idle versus meaningful collaboration/authoring, discovery grace time, loading/network exclusions, pending grading, accessibility adjustments, and exactly-once fines.

**Acceptance:** A player chooses an avatar/outfit, explores shared streets, previews and enrolls through a house, searches through portals, completes a chunk-graded adventure, and earns skill/gear progression. Authorized ads appear only in approved locations. A simulated policy violation triggers the documented enforcement and release path without lost learning progress or required payment. Keep prototype mockups distinct from working multiplayer, classification, and enforcement.

## Gameplay Theme Delivery

- Extend the studio with Temple Chase, Racing, and Wrestling presets: task banks, allotted section times, points, progress/action bindings, failure behavior, and checkpoints.
- Implement one complete Temple Chase level first. Task success sustains escape; an expired active-task timer causes monster catch/obstacle Game Over and retry of only the failed step.
- Add Racing speed boosts and stylized Wrestling combos using the same learning-event contract.
- Introduce the post-clearance classifier checkpoint, separate chunk assessment jobs, compact aggregate, and next-level/task-set selection. Keep game clearance distinct from confirmed mastery.
- Test exact deadline behavior, step retry boundaries, prior-checkpoint persistence, duplicate point events, timer exclusions, accommodation-adjusted timings, pending grading, and rejection of invalid next-level IDs.

**Acceptance:** A tutor previews and publishes a preset-driven adventure without coding. A learner earns validated activity points, progresses through timed tasks, can fail/retry a step, clears the level, and only then enters classification-based routing. The same task contract supports all three themes without generated teaching content or per-frame model calls.
