# Step 3: Authored-Content Learning Engine

## Implementation

Published courses retain their immutable version, authored resources, answer keys,
criterion-mapped fresh retries, and persisted assistance. Wrong or assisted answers
show the authored explanation and require a fresh independent task. Exhausted banks
block progression without discarding earned activity points.

Each question produces a persisted evidence chunk. After independent level clearance,
question-level mock classification runs with an 8 KiB serialized request ceiling,
validated criterion IDs, binary scores, confidence threshold, error tags, and a
one-second call timeout. Grades and deterministic criterion aggregates are persisted
in `course_assessments`. Routing receives only criteria and eligible authored IDs,
with a 32 KiB ceiling. Concept and level prerequisites remain authoritative.

Provider failures, uncertain grades, invalid IDs, and missing independent evidence
leave assessment pending. Reload restores that state; retrying assessment cannot
award another level reward. No classification recommendation alone grants mastery.
Activity points remain distinct from practical competence.

## Validation and Boundaries

The Node suite passes 44 tests; one optional external PostgreSQL check is skipped.
Build, TypeScript, and formatting checks pass. Node checks exercise aggregation, assistance preservation, critical failures, invalid
routes/task sets, provider exceptions/timeouts, Unicode-safe bounded response splitting,
and persisted pending recovery without duplicate rewards. All nine Playwright browser tests pass, including explicit criterion/route assertions.
Existing end-to-end browser
journeys exercise authoring, help, fresh retries, level clearance, and restored progress.
The deployment browser check requires the exact release and learning-assessment feature.

The active provider is explicitly mocked; no OpenRouter credentials are required.
Real model agreement against tutor-scored fixtures remains an integration gate.
The playable evaluator currently supports authored multiple-choice answer keys.
The bounded text splitter is a prepared utility, not an open-ended grading interface.
Spatial evaluators belong to the subsequent gameplay implementation; executable
training evidence and sandboxing remain in the practice-environment milestone.
