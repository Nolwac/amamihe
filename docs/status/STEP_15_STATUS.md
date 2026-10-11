# Step 15 — Animated Peers and World Operations

Shared rooms now render rigged human peer models with idle/walk clips and time-based position interpolation. Seven peers remain the visibility limit; at most three animate at once. Reduced-motion preferences stop peer clips. Failed model downloads retry with a bounded delay instead of issuing a request every frame. Real-device capacity remains unverified.

Shared presence exposes connecting, connected and reconnecting states. Requests time out after five seconds; connection failure removes stale local peers. Returning online or foregrounded triggers a refresh, and server presence still expires after twenty seconds. Opt-in is required after account changes and reloads. Solo saved learning remains available independently of multiplayer state.

Privately assigned moderators receive an operations view for active presence, unresolved participant reports, pending placements and arrest appeals. They can dismiss an arrest after reviewing its explanation. Existing signal mute/unmute, creator withdrawal and advertising approval retain their separate authorization checks. Anonymous and ordinary accounts cannot read operations counts. No production moderator is assigned automatically.

Shared deployment accepts a bounded optional configuration allowlist for moderator identifiers, idle thresholds and decision settings. Values stay in the private host file; inherited shell settings cannot override that file during promotion. Existing deployments need no new values. Classification remains mock and its default budget zero. No secret or paid service was introduced.

Verification includes the isolated operations authorization check, the full Node regression suite, accessibility checks and a two-browser journey covering animated peers, disconnect/reconnect, course rooms, team battle rewards and reporting/blocking. The public verifier additionally checks new health capabilities and anonymous authorization gates. Browser and API evidence establish prototype behavior, not learning effectiveness, physical 2 GB performance or large-scale capacity.

## Recorded validation

The final local Node suite passes 67 checks with one optional external-PostgreSQL skip. All 21 browser journeys pass; a final focused four-journey run repeats accessibility and detention controls after the short-course release correction. Seven deployment-setting guard cases, Compose configuration validation, helper syntax and release metadata checks pass.

The eight-player fixture uses one 390 × 844 software-rendered browser and seven API-only peers. It records seven visible peers, three animated peers, 8/9/9/9 FPS at 144 render height, 113,295 active triangles and 85.5 MB JavaScript heap, with no page errors. Heap excludes browser, GPU and device memory; runner load varies. The report and actual scene capture are in `evidence/`. These figures do not establish eight-browser or physical 2 GB performance.

Reproduce the bounded-room check against an isolated test-email server with `EMAIL_TEST_OUTBOX=/tmp/amamihe-test-outbox npx tsx scripts/browser/audit-shared-world.mjs`. It refuses non-loopback destinations and removes fixture presence on completion. Never interpret synthetic participant activity as learner outcomes.

City advertisements have native destination links and an explicit preview when their 3D billboard is selected. Billboard polling is separated from the scene renderer so the ordinary interface does not eagerly import rendering modules. Typed decisions also reject malformed probability distributions and combined contexts exceeding the conservative request budget before network access.
