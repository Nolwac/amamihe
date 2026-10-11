# Step 11 — Trusted Bounded Practice

Tutors can select a server check for a JavaScript resource: embedding parameter counts, mean losses or a two-component attention score. Learners write an arithmetic return expression using the preset variables. The isolated browser worker supplies preview values; the server independently evaluates three input sets using a restricted arithmetic interpreter.

The interpreter accepts only bounded numbers, known numeric variables, parentheses and arithmetic operators. It never invokes JavaScript evaluation, network requests, imports, loops or object access. Nonfinite results, excessive depth, oversized expressions and unsupported syntax fail. Client output and claimed scores are ignored.

The selected check is preserved in the immutable published course version. Practice receipts are tied to the authenticated player, course version, level, resource and delivered question. Submission locks the attempt and stores one receipt; replays return that receipt rather than replacing it. Other accounts cannot submit the attempt. Expiry and existing resource-delivery checks remain enforced.

Verified receipts certify the bounded arithmetic exercise only. They do not award points, change course mastery, verify arbitrary JavaScript or authenticate remote Python training. Drawings, unrestricted JavaScript exploration and imported notebooks retain their unverified status. Training artifacts still require trusted execution and independent corpus/checkpoint inspection before any mastery claim.

Four focused Node checks pass. The existing isolated-practice browser journey passes, and the new server-check journey passes after correcting publication normalization. Browser verification covers execution preview, persisted receipts, idempotent replay, ownership and unchanged course progression. Full regression journeys also run in deployment CI.
