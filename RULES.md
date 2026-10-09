# Amamihe Product and Engineering Rules

## Product Identity

Amamihe is a genuine 3D learning game world built around tutor-configured stories, levels, practical activities, avatars, and social progression. It serves learners across Africa and beyond by combining credible learning resources with affordable adaptation and satisfying progress. These rules describe the intended product, not implemented functionality.

- Preserve real 3D scenes, spatial navigation, and interactive components throughout the product. Lower graphics settings must retain the 3D experience; a text or 2D course must not replace the game as the low-bandwidth strategy.
- Support accessibility through readable overlays, keyboard controls, reduced motion, alternative input, and equivalent task interactions within the game. Accessibility settings must not count as pedagogical assistance or reduce earned learning credit.
- Build a focused proof of concept around a reviewed course and a defined learner group. Limit initial content and integrations while retaining the full direction in the roadmap.
- Use AI development tools to implement and test the course-authoring and learning-game requirements. Evaluate suggestions against actual learner needs rather than letting generated suggestions redefine the product.

## Tutor Authoring and Content Ownership

- Make the visual course studio the primary authoring interface. Tutors must be able to arrange learning paths, select 3D story themes and widgets, configure levels, attach resources, and preview the learner experience without writing JSON/YAML or completing a monolithic form.
- Store course structure and content in a versioned database. A manifest may represent the internal schema or support optional import/export; it is not a mandatory tutor workflow.
- Require tutors to provide or approve resources, baseline interview questions, challenges, reasoning prompts, hints, explanations, rubrics, and independent retry alternatives before publication.
- Select predefined story themes, environments, and components from a reusable library. Tutors must not need to create 3D models or program worlds from scratch.
- Validate identifiers, source references, component compatibility, prerequisite DAGs, story bindings, and content coverage. Story revisits and review loops are allowed without introducing cycles into concept prerequisites.
- Preserve published course versions and the question, rubric, environment, and scene versions attached to each attempt.

## Affordable Decision Model

- Use a classification/decision model to select eligible learning steps and approved question/resource/explainer IDs through a verified no-charge endpoint. Deterministic rules enforce eligibility and provide outage fallback; they do not replace the required classification/decision model. Do not generate lessons, interview questions, hints, explanations, or challenge text in real time.
- Allow tutor-approved parameterized templates and authored question variants; parameter substitution must remain within reviewed bounds.
- Validate model selections against learner evidence, prerequisites, due reviews, available resources, and tutor rules. A model cannot override progression policy, grant mastery, or issue rewards.
- Measure routing accuracy, schema compliance, latency, quota consumption, and privacy terms before selecting a free classification-model endpoint. The classification/decision model grades learner responses and selects routes; no operational LLM may generate course content; the storytelling model built in the curriculum is a learner artifact.
- Provide deterministic fallback routes for supported situations when inference fails. State offline limitations clearly; inexpensive inference alone does not eliminate connectivity requirements.
- Use answer keys, spatial constraints, and executable tests where possible. Use classification-model rubric scoring per completed question or interaction chunk, corroborated by deterministic evidence where available; uncertain or unavailable grading stays pending rather than passing automatically.
- Treat course content, external tools, learner submissions, and model outputs as untrusted data. Do not execute uploaded instructions or give them privileged control of the application.

## Chunk-Level Assessment and Routing

- Capture question/interaction chunks during play. Only after level clearance, submit each chunk and its rubric, response/evidence, and assistance state for bounded classification grading. Do not require a full stage transcript in a single prompt.
- Store validated per-criterion scores, evidence references, misconception tags, uncertainty/status, and evaluator versions for each chunk. Preserve failed and pending outcomes.
- Aggregate results deterministically by concept and criterion. Ask the classification/decision model to choose the next trajectory from the compact stage summary and eligible content IDs; do not hide critical gaps behind a single average.
- Reserve input/output token budgets and split oversized submissions at meaningful rubric boundaries. Never silently discard response content needed for assessment.
- Grade completed questions or meaningful event groups, not every keystroke. Use idempotent requests, bounded retries, and quota accounting.
- Calibrate automated grades against tutor-reviewed examples. Route ambiguous assessments for review; model confidence alone cannot authorize mastery.

## Learning and Progression Invariants

1. **Require active production.** Learners recall, explain, predict, build, or solve. Reading, animation, playtime, and reward collection alone cannot prove mastery.
2. **Record assistance.** Track hints, explanations, and worked solutions per attempt; distinguish independent performance from assisted practice.
3. **Require independent retry after explanation.** A revealed solution or walkthrough cannot complete a mastery challenge. Select another authored question or approved variant and require the full solution unassisted.
4. **Keep retry outcomes conditional.** A reset never implies success. If no valid retry exists, flag the course gap rather than inventing content or granting mastery.
5. **Evaluate intermediate work.** Apply the course's reviewed rubric to relevant reasoning, spatial actions, and practice-environment results as well as final answers.
6. **Offer productive help.** Use predefined Socratic prompts before full explanations where appropriate. Permit requested help, pauses, and remediation without trapping learners in endless retries.
7. **Respect prerequisite evidence.** Establish baseline knowledge through authored assessment; use demonstrated understanding to unlock learning steps.
8. **Schedule retention practice.** Select due review encounters from approved banks and update scheduling from actual outcomes.

- Treat the proposed 85% success and 40% failure thresholds as configurable starting hypotheses. Define windows, minimum samples, and escalation limits before use.
- Personalize from demonstrated evidence, goals, and pace, not assumptions about language, location, age, or device. Let learners revisit fundamentals and understand redirects.
- Use the selected FSRS or SM-2 algorithm accurately. Fixed example review intervals must not be represented as FSRS behavior.
- Keep story milestones, activity participation, rewards, and concept mastery distinct. Team success cannot substitute for individual understanding.

## Genuine 3D at Different Quality Settings

- Provide manual and automatic quality settings such as 144p, 360p, 720p, and 1080p, with documented target render heights and device limits. Keep interface text legible independently of scene resolution.
- Adapt lighting, shadows, effects, frame-rate targets, mesh detail, and textures without changing challenge meaning or mastery requirements.
- Distinguish rendering cost from network cost. Lower render resolution reduces GPU work; bandwidth savings require smaller compressed assets, tiered textures/meshes, caching, and controlled downloads.
- Load current-level essentials first, reuse cached components, and bound prefetching. Do not download an entire world before learning can begin.
- Preserve interrupted work and synchronize attempts and rewards idempotently. Declare offline support per activity; hosted inference, remote notebooks, and live multiplayer may need connectivity.
- Test actual modest devices, bandwidth throttling, disconnections, and each supported preset. Do not promise compatibility with every device or bandwidth condition.

## Practice Environments Inside the Learning World

- Let tutors attach approved external tools and choose reusable environments such as Python/Jupyter notebooks, JavaScript coding spaces, and drawing canvases.
- Preserve game context and attempt identity when entering, submitting work from, and leaving a practice environment.
- Verify embedding support. For services that prohibit embedding, provide an explicit launch-and-return integration rather than claiming seamless in-world execution.
- Isolate learner code from application services. Restrict execution time, memory, compute, storage, and network access; validate cross-origin messages and tool submissions.
- Declare each tool's grading, connectivity, cost, and data-sharing requirements. Launching an external resource alone does not establish completion or learning evidence.

## Rewards, Avatars, and Social Learning

- Provide meaningful level celebrations, points, milestone badges, and purchasable avatar gear. Define earning and spending rules and keep balances and inventories authoritative and auditable.
- Tie achievement rewards to verified criteria. Cosmetic purchases must not buy mastery, alter grading, or create an advantage in assessed learning battles.
- Support learner interaction, team creation/joining, and team-versus-team learning battles. Publish scoring and shared reward rules for points, badges, and configured prizes.
- Track individual learning evidence independently of team rewards. Prevent duplicate rewards and validate battle results on the server.
- Keep solo learning available. Missed sessions must not erase earned progress or cause punitive streak mechanics; review reminders remain optional.
- Configure communication permissions, moderation, blocking/reporting, and age-appropriate defaults before enabling social interaction. Do not expose academic weaknesses in public profiles by default.
- Specify prize fulfilment before promising externally funded rewards. Real-money trading is not assumed by the avatar economy.

## Credibility, Language, and Local Relevance

- Publish clear prerequisites, learning outcomes, expected time requirements, and language coverage for each course.
- Require credible, traceable sources and attribution for learning materials and rubrics. Distinguish reviewed courses from drafts and provide a correction/reporting path.
- Identify paid, login-protected, or connectivity-dependent resources before learners rely on them; prefer accessible, legally reusable essentials.
- Separate interface text and course language from game logic. Validate translations, terminology, and assessment in each language actually supported.
- Adapt examples and pathways to the intended community. Show how mastered concepts support practical tasks and next learning steps.
- Identify institution/location/version when mapping qualifications or recommending opportunities. Do not promise accreditation, employment, or equivalence without verification.

## Privacy and Validation

- Separate tutor and learner permissions, keep credentials out of the client/repository, and minimize collected personal and performance data.
- Make speech optional and obtain consent before recording or transmitting it. Define retention, access, export, and deletion behavior before release.
- Use synthetic or de-identified records in demonstrations.
- Follow [ARCHITECTURE.md](ARCHITECTURE.md) and [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md), updating decisions when the design changes.
- Test authored-content coverage, selection validity, independent retry, scheduling, quality presets, practice sandboxing, authorization, social results, and reward integrity.
- Measure decision cost and asset transfer alongside rendering performance. Assess delayed recall and transfer alongside engagement; points and return visits alone do not prove learning effectiveness.
- Document executed checks and distinguish passed, failed, skipped, and unrun outcomes. Keep planned features separate from implemented capabilities.

## Resource and Pilot Constraints

- Maintain a zero-purchase deployment path for the prototype, using existing infrastructure and verified free services. Paid hosting and a custom domain may be evaluated as optional deployment choices; they must not become prerequisites for demonstrating the learning loop. Disable paid fallback and automatic top-ups on free deployments.
- Target phones and laptops with 2 GB total RAM. Start with a measured 10–15 FPS low-quality target, compact assets, and bounded game-tab memory. Keep every quality setting genuinely 3D.
- Use the from-scratch approximately 1M-parameter storytelling-model course as the pilot. Require actual parameter counting, original weight initialization, documented corpus rights, held-out evaluation, and honest model-quality limitations.
- Separate training compute from the low-memory game client. Verify shared or free training availability and distinguish learner-run experiments from tutor-provided reference runs.
- Treat free-endpoint and training quotas as operational limits. If required no-charge access is unavailable, report the blocked capability rather than silently switching to paid services or claiming the feature works.

## Venture World, Identity, and Discovery

- Build an indie-style human-simulation world where skill growth drives progression. Keep concept mastery distinct from spendable points, fines, and gear ownership.
- Let every user learn and create courses under one account. Registration includes free avatar and starter-outfit selection; later outfits depend on owned gear and earned resources.
- Make course feeds walkable city streets and each course a house. Show its preview and require an explicit enrollment decision at the door.
- Search opens an alternate portal universe with previewed results leading to course doorsteps. Preserve a return route and bounded resource loading.
- Provide real-time shared presence on streets and within courses, with moderated interactions and independent learner progress. Do not require a 2 GB device to load the entire population.

## Billboards and Learning Police

- Display user ads only after authorization, with clear ad labels, validated destinations, and bounded assets. Tutors may place approved billboards within their course trajectories; city placement rights are separate.
- Define and publish idle-engagement policies. Learning, authoring, purposeful course discovery, and constructive collaboration must be recognized appropriately; movement alone is not learning evidence.
- Learning Police may warn, arrest, and temporarily evict policy violators through audited server decisions. Provide release through an in-game point fine or bounded learning aligned with the player's goals; never require real payment.
- Protect legitimate breaks, loading, lost connectivity, suspended tabs, accessibility adjustments, and waiting for tools/grades from false idle penalties.
- Preserve mastery and course progress, provide appeals, and process fines/release exactly once. Keep NPC presentation separate from authoritative enforcement logic.
- Use OpenRouter for operational classification. Verify a purpose-built endpoint's capabilities and no-purchase access; do not label generic chat models, safety-only models, or downstream model routers as equivalent educational classifiers.

## Preset Gameplay and Level-Clearance Routing

- Tutors choose gameplay themes and configure authored task banks, deadlines, point/action bindings, checkpoints, and retries through the studio.
- Temple Chase maps timely task completion to escape and obstacle clearance. An expired active section timer causes Game Over and retry of that specific step.
- Racing maps correct, faster task completion to speed boosts; Wrestling maps it to stylized avatar punches/combos. Reward valid task performance, not speed alone.
- Run the classification checkpoint only after the player clears the level. Assess stored chunks, aggregate results, and select the next level and approved task set. In-level mechanics, feedback, help, and Game Over use deterministic policies.
- Do not treat game-level clearance, provisional open-ended submissions, or action points as confirmed mastery before checkpoint assessment.
- Exclude downloads, connection failures, tool startup, and classifier wait time from course deadlines. Support configured accessibility timing without invalidating learning evidence.
- Keep course Game Over distinct from Learning Police enforcement. Preserve completed steps and never penalize checkpoint waiting as idle misconduct.
