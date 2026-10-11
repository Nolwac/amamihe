# Step 13 — Authorized Billboards

Verified creators can submit a title, brief description and public HTTPS destination for a city billboard. Tutors can also choose a published version and level in their own course. Course placement rights do not grant city advertising authority. New placements remain pending and invisible until a privately configured moderator approves them.

Moderators review destination, credibility, age suitability and local relevance before approving or rejecting. Creators can withdraw their own placements. Each transition is auditable; repeated withdrawals do not duplicate events and a withdrawn placement cannot be restored by approval. The private moderator allowlist uses `SOCIAL_MODERATOR_IDS`. No production moderator is assigned automatically, so pending submissions remain pending until that operational role is configured.

Approved placements render as genuine 3D billboard geometry with a clear advertisement label and bounded local text textures. City lists hold at most three placements; course lists hold two and match course, version and level. Lists refresh every thirty seconds while foregrounded, so revocations propagate within that interval. Course activities provide native destination links. No remote advertisement images, trackers, automatic navigation, billing or paid advertising service is used.

API verification covers approval authority, ownership, course/version isolation, invalid destinations, withdrawal and audit idempotency. The browser journey submits and withdraws a real pending placement, then uses an approved-list fixture to verify 3D rendering independently. Both phone and desktop accessibility journeys pass with the submission controls. The fixture establishes rendering, not a production moderation action.
