# Adventure and Audio Implementation Handoff

## Implemented

- Shared deterministic adventure physics with server-owned collisions, ordered run-bound controls, automatic assistance, and checkpoint-preserving retries.
- Actual skeletal Run, Jump, Slide, Guard, Jab, Hit and Build clips in a reproducible 873 KB human avatar asset.
- Traversing Temple Chase with hurdles, arches, barriers and an articulated guardian; Racing with a moving rival and task-driven boosts; Wrestling with task-powered hits and recoil; Workshop with walking and building actions.
- Responsive game viewport and task drawer, keyboard/touch controls, visible mobile chase camera, and isolated canvas generations to prevent deleted WebGL shaders from blackening avatars and scenery.
- Original locally synthesized theme music and action/button effects, user-gesture activation, separate volume controls, persistent mute and hidden-tab suspension.
- Final visual Slide correction removes duplicate root lowering while preserving authoritative crouch collision rules. The final browser run verifies native foot height and Hips-relative limb motion.
- Manual controls capture the current command generation, discarding actions queued before pause and ignoring late results after a newer command. A regression verifies that those actions cannot enter the resumed run.
- The phone chase camera keeps the avatar visible around temple columns and a closing guardian in both center and right lanes. Scene readiness reports loading errors, and cleanup remains bounded if readiness never completes.
- Browser journeys synchronize current-task and rendered collision checks, move shared avatars through physical controls, and inspect restored answer-gate picking diagnostics.

## Final Local Verification

Source revision `9237bf28da92b5afe75ea8ce1c6a026e0ee6c1ad` passes build/type checking and formatting. The Node suite reports **95 passes, zero failures and one optional external PostgreSQL skip** (96 total). The full browser suite reports **26 passes, zero failures, skips or retries**, using isolated test storage and email delivery.

The final run covers all four themes, actual skeletal motion and Slide foot height, phone center/right-lane visibility, obstacle clearance and collision/retry, pause ordering and stale queued actions, audio signal/mute, account flows, billboards, device evaluation and shared-avatar movement. The machine-readable result is in `evidence/reports/physical-adventure-browser-final.json`; final captures use `physical-adventure-*-final.png` names in `evidence/screenshots/`. The verification summary records capture provenance in `evidence/reports/physical-adventure-verification.json`.

## Historical Failures

Earlier focused browser runs passed all four themes and, separately, mobile camera readability, real jumping/obstacle clearance, collision/retry, delayed-response pause and audio signal/mute. Stored captures are explicitly labeled as earlier builds; they do not establish final-build acceptance.

The earlier 25-journey regression was stopped to preserve the handoff: **one passed, five failed, one interrupted and eighteen unrun**. Its failures were:

1. All-theme adventure timed out waiting for actual avatar/bone readiness within 30 seconds.
2. Phone adventure expected a paused state but received Game Over.
3. Authentication timed out clicking Sign in within its 120-second journey.
4. Billboard journey could not find its expected rendered billboard canvas.
5. Desktop evaluation could not find the device-evaluation heading.

The playable-theme journey was interrupted. These historical results do not establish a common root cause. The original machine-readable result remains in `evidence/reports/physical-adventure-browser-failures.json`; the completed final run above supersedes its acceptance status.

## Subsequent release and feedback

PR #2 was merged and deployed as `d7485ea45769cf47a519cdb227327eae69c85193`. [The release workflow](https://github.com/Nolwac/amamihe/actions/runs/38307296229) passed verification, packaging, promotion and exact-release public browser acceptance.

Continue with [Immersive learning and recovery](IMMERSIVE_LEARNING_HANDOFF.md), which records the learner-feedback correction, current checks and its separate release boundary. The earlier evidence remains a historical validation snapshot.
