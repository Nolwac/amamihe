# Step 8 — Shared World and Team Learning Battles

## Delivered behavior

Verified accounts can opt into shared city streets and course rooms from Course Houses. The 3D scene displays nearby human avatars, names, outfits and interpolated movement. Rooms hold eight learners; a ninth joins another shard. Course rooms match the enrolled content version and current level. Foreground clients exchange bounded positions and preset messages every three seconds; inactive presence expires after twenty seconds. Solo progression remains available after disconnects.

Private invite codes support teams of up to four. A captain proposes an asynchronous battle on an enrolled course; the opposing captain must consent. Acceptance snapshots both rosters and the pinned course version. Every participant must hold that version's enrollment. Two tutor-authored questions use server-held answer keys; client scores are rejected. Each correct answer earns ten battle-score units. Team ranking uses mean participant score, so a larger roster cannot win solely through size.

The winning team receives twenty cosmetic points per member, the losing team five, and a tie ten. Teams submitting no answers receive zero. Each learner can receive three positive battle rewards per rolling day. Ten-minute deadlines resolve interrupted battles; rewards use unique ledger events and atomic balances. Replays cannot duplicate rewards. Battle outcomes never modify individual course assessments, review schedules or mastery.

## Communication and moderation

Communication uses six preset messages. Learners can report peers, block their visibility in both directions and unblock them. Moderators can review reports, mute preset messages for twenty-four hours and remove a mute. Moderation access requires verified player IDs in the private server setting `SOCIAL_MODERATOR_IDS`; it is disabled when that setting is absent. No production moderator has been assigned by this implementation. Team membership and battles survive reloads; presence requires fresh opt-in.

## Verification and boundaries

An isolated API fixture exercises eight participants plus overflow, team capacity, consent, pinned-version publication changes, score injection, unauthorized access, duplicate submissions, timeout rewards, daily caps, moderation, blocking and stale presence. A two-browser journey checks shared 3D streets and course scenes, preset communication, movement, private teams, a completed battle, reward persistence and unchanged mastery. Actual captures are stored in `evidence/screenshots/step8-*.png`.

The prototype uses three-second polling and static low-detail peer meshes rather than animated networked characters. It does not establish eight-player performance on physical 2 GB devices, large-scale concurrency or learning effectiveness. Search portals, advertising billboards, Learning Police, free-text chat and full vehicle/combat simulation remain explicit roadmap work. OpenRouter classification remains the labeled mock.

A practice regression fix also preserves imported version-4 notebook cells during download while discarding execution outputs and metadata; malformed imports fail visibly.

Validation: 58 Node checks pass with one optional external-PostgreSQL skip. All 14 browser journeys pass in the full baseline; the final focused two-browser journey also passes after material cleanup, immediate mute enforcement, responsive styling and wardrobe refresh fixes. Final build/type and formatting checks pass. Phone social controls have no horizontal overflow. Public deployment verification separately checks exact release identity, PostgreSQL health, HTTPS/HSTS, anonymous authorization gates and desktop/mobile 3D rendering.
