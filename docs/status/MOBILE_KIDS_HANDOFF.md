# Mobile controls, softer worlds and children’s courses

## Release boundary

Base production release: PR #3, `ec64f2ebcbbce187d9e45ce570416db80f5c0d0b`. This follow-up is on `fix/mobile-controls-kids-world`; promotion is pending. It responds to the learner’s mobile screenshot and request for smoother objects and different games for different ages.

## Implemented behavior

- City skills, map, sound, graphics, police and menu icons have separate default anchors. The walking pad and rendering status occupy separate left-side rows. The conflicting `audio.css` mobile position and off-screen graphics popover are overridden by a shared HUD layout.
- Choose the six-dot Arrange controls button, then drag a control or focus it and use arrow keys. Done returns to play; Reset layout restores defaults. Normal taps, movement presses and camera input keep their existing meanings. Positions are validated and persisted only on the device. Viewport changes clamp positions and reflow collisions. Opening a HUD menu closes other HUD menus; open panels stay viewport-bounded.
- Adventure tools, timer, status and movement are also movable groups. Timers no longer overlap the compact toolbar. Ordinary city HUD and police menus are hidden while a course or full-screen finder is open; active detention guidance stays accessible in the course footer. Active adventures pause during arrangement; the learner explicitly resumes play.
- Original bevelled geometry gives buildings, furniture and encounter objects continuous edge normals. City cylinders/plant forms have smoother silhouettes; engines request antialiasing. Thin parts retain compact geometry, material merging and recyclable course sections remain in use, and Low still adapts pixel resolution. Collision extents and baked rig assets are preserved.
- Number Garden (3–5, with a helper) teaches small-group counting and circles/triangles in a garden workshop; solved criteria grow visible flowers. Story Trail (6–8) teaches story sequence and rhymes on a daylight woodland course without a visible pursuer. Pattern Racers (9–12) teaches additive number rules and repeated robot instructions on the racing course.
- Each English starter course has two levels, four primary challenges and four mapped fresh retries, two original reading guides and two optional drawing activities, and no task deadline. Ages guide course choice; no age data is collected. Sources are linked as background frameworks, without claiming accreditation or endorsement. All three source links returned HTTP 200 at the current `www.thecorestandards.org` domain.
- Children’s games has a dedicated city-menu entry and directory filter, so unrelated new publications do not hide the maintained courses on the first unfiltered page.
- Startup publishes these maintained courses idempotently under the reserved curriculum owner. Content changes create new immutable versions; pinned enrollments and tutor drafts remain intact. `worldStyle` is optional and publication-validated against the gameplay theme. Existing tutor courses default to their original presentation.
- Existing independent evidence, assistance, ten-role participation, unlimited practice/replay and exactly-once rewards remain distinct. Optional drawing and world effects do not automatically award mastery. Classification remains explicitly historical answer-key based.

## Validation

Build/typecheck, formatting and diff checks pass. Node: 108 passed, one optional external-PostgreSQL check skipped. All 31 browser journeys passed in 5.1 minutes, with no skips or retries. After the final finder-layer polish, all seven focused phone/recovery/police checks passed again in 46.2 seconds. Regressions cover actual touch dragging, keyboard relocation, reload persistence, viewport collision reflow, closing the same menu toggle, phone portrait/landscape bounds, all three four-challenge course completions, all original motion/authoring/social/practice flows and detention release guidance. All checks use disposable local storage and test-only email.

The existing 390×844 software-WebGL audit at 2 Mbps/100 ms/4× CPU slowdown measured 169,199 active triangles, 45 ms render CPU time, 5–8 FPS samples, about 491 MB total browser-process PSS and a 10.7-second first playable load. Geometry cost increased from the previous 65,543-triangle report; these are separate software-browser samples, not a controlled hardware improvement claim. The audit and actual high-quality 390×690 captures are preserved with the verification manifest. The public production checker now also requires all three maintained age bands, compatible untimed worlds, fresh retry coverage and hidden grading fields. Those new public checks run after promotion; this branch is not deployed yet.

## Boundaries

Suggested ages and times are starting content-design choices, not measured learner outcomes. Early readers need a helper or optional device read-aloud. No child usability study, physical 2 GB-device performance, hardware listening, live classification accuracy or real remote model-training verification is claimed. Existing opt-in moderated social behavior is not expanded by these courses. The new procedural world geometry introduces no external art or paid integration.

Implementation source: `b212d9aae8977e2a6307e682153562e41386cf71`. The complete browser run precedes the final finder-only layer change; the focused seven checks cover that change. The subsequent CI run verifies the final branch head.

The first PR CI run passed build, formatting, Node checks and 30 browser journeys, including every phone/children’s check. Its second social browser was still in the lazy adventure loading fallback when the helper’s five-second wait expired. The helper now waits up to 30 seconds for the same visible adventure view before interacting; no assertions or retries were removed. The focused two-browser social journey passed locally in 55.7 seconds after this test-only adjustment. The updated branch requires a fresh complete CI run before promotion.

Evidence: `evidence/reports/mobile-kids-browser-final.json`, `mobile-kids-rendering-audit.json` and the [historical verification manifest](https://github.com/Nolwac/amamihe/blob/3eab1e9f5d6a1acd1a15b9fb721fef0517df8003/evidence/reports/mobile-kids-verification.json); seven actual captures are in `evidence/screenshots/mobile-kids-*.png`. The public verifier syntax and its native Node 24 catalogue import passed locally.

Provider update: these milestone observations precede the [local tev1 integration](TEV1_HANDOFF.md). Refer to that handoff for current inference behavior and its release boundary. Historical captures remain in Git history.
