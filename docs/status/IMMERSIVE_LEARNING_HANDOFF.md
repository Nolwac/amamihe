# Immersive learning and recovery handoff

## Scope and release boundary

The physical-adventure/audio release from PR #2 was merged and publicly verified at `d7485ea45769cf47a519cdb227327eae69c85193`. This follow-up responds to learner feedback about recovery, retry limits, obstructive panels, rapid camera movement, reading, practice, teaching-role coverage, police presentation and faint sound.

The follow-up is on `fix/immersive-learning-recovery`. Its production promotion is pending. Keep published course versions, private deployment configuration, learner evidence and unrelated VPS services intact.

## Implemented behavior

- Opening an enrolled adventure restores its server checkpoint. Reloading the last open adventure on the same device reopens it paused. The selected answer and JavaScript, drawing, journal-page and notebook-evidence drafts are retained on that device under account-specific keys; recorded responses and submitted practice evidence remain server-owned. An explicit return to the city clears automatic reopening. Another device can resume the server checkpoint through My learning.
- Game Over still retries only the current step. Course and current/cleared-level replays have no attempt limit, use separate evidence identities and preserve the original checkpoint. Return to that checkpoint through the replay menu. Already-earned milestone points and badges cannot be awarded twice.
- Exhausted retry banks, including previously blocked enrollments, continue as unlimited practice. Previously explained variants remain assisted practice and cannot supply fresh independent credit. The missing authored-variant notice remains visible without disabling questions or practice. Earned assessments and review schedules remain intact if replay grading is pending. Help exposure survives a replay or return even when its answer was never submitted. Failed responses remain audited; bounded checkpoint grading retains the latest independent and unsuccessful evidence for each authored question instead of imposing an attempt limit.
- City navigation, map, skill labels, graphics, police controls, adventure status, movement controls, task and resource panels are collapsed by default. Play/pause stays accessible in the compact header. Expanding a task reserves a bounded side panel or phone sheet while retaining a usable 3D canvas. Stopped, completed and pending states do not force a panel open.
- City, portal and course cameras share slower drag/pinch controls with a short coast. The phone chase camera rises for the right lane so the guardian cannot hide the player's feet.
- Current-level resources have selectable 3D journal/workstation surfaces containing authored text. A field journal preserves the world behind it, pages the complete resource, optionally reads it aloud, retains attribution, and links discoveries back to the challenge. Study and tool entry pause the adventure. Reading alone never grants mastery.
- Open practice works during repeated attempts, pending assessment and checkpoint completion for the enrolled level's authorized resource. Code still runs in the isolated worker; server arithmetic checks and exactly-once submission semantics are preserved. A new practice attempt can be opened repeatedly.
- A ten-role learning camp exposes the architecture's Mapmaker, Interviewer, Socratic Questioner, Explainer, Examiner, Checker, Listener, Diagnostician, Sparring Partner and Clerk. Older completed checkpoints retain their examination/check/listener role history. Goals, reasoning, field study, evidence review, authored final rehearsal and reflection are saved. Reasoning hints are withheld until assistance is recorded. Exam/check/listener coverage comes from actual responses. The course shows a completed learning journey only after all checkpoint and role requirements are met. Role participation, checkpoint clearance, practical mastery and cosmetic rewards remain distinct.
- Server-authorized arrest makes the existing animated officer approach the learner, apply visible restraints and escort the avatar to a barred release area. The learner cannot roam during detention. Release controls remain collapsible; server fines, free learning release, appeals, protected breaks and progress preservation are unchanged.
- The audio mix has a stronger output stage, compressor and persisted master-volume slider. Existing per-channel choices and mute are retained. No music service, recording download or inference is involved.

Verified learners sharing a school/carrier IP now have separate 300-per-minute general API allowances. Anonymous traffic and authentication remain IP limited; social route limits remain unchanged. This fixes enrollment and startup failures under multi-user request bursts without disabling the safeguards.

The ten-role interpretation follows the architecture's Pedagogical Responsibilities. City subject/skill labels are not a requirement to teach unrelated subjects in every course.

## Verification

- Node suite: **105 passed, 1 optional external-PostgreSQL check skipped, 0 failed**.
- Build/typecheck, formatting and diff checks passed.
- Final browser suite: **all 27 passed in 4.7 minutes**, no failures, skips or retries.
- Isolated verification uses port 3003, disposable PGlite storage and `EMAIL_PROVIDER=test`; no production accounts, learner records or signup emails are used.
- Regressions cover 55 repeated attempts without counterfeit mastery, stale/duplicate delivery rejection, course and level replay, original-checkpoint recovery, reward idempotency, practice access after exhaustion/completion, all ten recorded roles and assistance before hint delivery.
- Browser checks retain physical rig/foot visibility, collisions, pause/resume, accessibility, social isolation and resource/practice assertions. New checks exercise actual phone layout, bounded drag angle, stronger generated waveform, automatic paused recovery, saved answer/workspace, all ten role interactions and visible officer escort.

Physical 2 GB-device performance, listening on the learner's hardware, artwork acceptance, delayed recall and transfer still require evaluation. Classification remains explicitly mocked. Notebook launch/submission and arithmetic practice do not certify that a learner trained and evaluated the full storytelling model.

The source implementation is committed as `f0f4d9b7e21e6f1405fa99d9701f7f91acac14ab`. The complete browser run is preserved in `evidence/reports/immersive-learning-browser-final.json`; the verification manifest records hashes, counts and boundaries. After closing selected resource menus and improving button contrast, the complete phone journey passed again; both police browser checks also passed. Final actual captures are in `evidence/screenshots/immersive-*.png`.
