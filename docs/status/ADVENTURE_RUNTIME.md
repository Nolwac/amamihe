# Physical Adventure Runtime

Implementation status: committed for review. Final browser regression has unresolved failures, and deployment is pending. See the [handoff note](ADVENTURE_HANDOFF.md) for results and next actions.

## Gameplay

The course world occupies the main viewport, with a scrolling task drawer and a mobile **Hide task** control. Human avatars use baked skeletal Run, Jump, Slide, Guard, Jab, Hit and Build clips. A following camera, bounded scenery sections and pooled colliders support genuine world traversal without allocating an endless world.

- **Temple Chase:** the runner traverses a temple bridge, jumps hurdles, slides under arches and changes lanes around solid barriers. An articulated guardian pursues the player. Section expiry or an actual obstacle contact causes Game Over.
- **Racing:** the player and a rigged rival advance along the track. Independent correct tasks produce a temporary speed boost that can overtake the rival; speed alone cannot clear a learning criterion.
- **Wrestling:** raised guards, task-powered jabs and opponent recoil accompany sparring. Accepted independent tasks reduce opponent strength. Free punches animate but grant no damage, points or mastery.
- **Workshop:** the avatar traverses workstations and performs a building action when a task succeeds; completed criteria illuminate authored progress stations.

Distance, boosts and opponent strength persist between tasks within a level. Game Over restores the current task's starting checkpoint; earlier independent criteria, completed levels and rewards remain saved. Level clearance stays visible before **Continue adventure** reveals the classifier's next authored trajectory.

## Controls and Authority

Movement assistance is the default. Optional manual controls provide left/right, Jump, Slide and Strike buttons. Focus the canvas to use arrows/A/D, Space, S and F. Input fields retain normal typing. Untimed and reduced-motion settings promote safe movement assistance without changing learning criteria.

The pure runtime in `shared/adventure-runtime.ts` supplies both server physics and bounded browser prediction. The server advances swept collision checks using its active clock, capped to a five-second connection lease. Ordered, run-bound action requests contain no client position or collision verdict. Replays are idempotent; stale steps, out-of-order actions and paused answers are rejected. Only independent authored task evidence grants learning progress. Classification remains after level clearance.

Theme, outfit and city-quality changes create a fresh canvas for each engine generation. Reusing a canvas during asynchronous disposal allowed the old engine to delete shader programs still referenced by the new scene, rendering clothing and untextured scenery black. Browser regression checks inspect the rendered outfit and footwear pixels as well as actual skeletal motion and camera visibility.

## Music and Effects

Open **Sound** and choose **Enable game audio**. Each theme has an original locally synthesized musical score. Footsteps follow movement; jumps, slides, strikes, impacts, task results, start/pause, Game Over and button clicks have associated effects. Music and effects have separate volume sliders; mute and volume preferences persist on the device. Audio requires a player gesture and suspends in hidden tabs. No recordings, paid service, external audio downloads or runtime generation of teaching material are involved.

## Verification Boundaries

Node checks exercise swept collisions, assist layouts, checkpoint continuity, action authorization and replay handling, task-driven race boosts and sparring damage. Chromium journeys inspect actual Babylon root positions, bone orientation matrices and collider bounds, including pause, assisted clearance and mobile collision/retry. Web Audio checks sample the actual analyser waveform and master gain; headless output does not establish listening quality. The public deployment check verifies the exact release, HTTPS, client bundle and bounded action asset.

Actual browser captures belong in `evidence/screenshots/`. Physical 2 GB hardware, soundtrack listening feedback, final artwork and educational outcomes still require evaluation. Concept previews remain visual targets, not screenshots of delivered gameplay.
