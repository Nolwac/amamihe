# Step 10 — Typed Decision Integration

## Contract

The server adapter calls OpenRouter's typed Decisions API (`POST /api/alpha/decisions`) with `typesafe/jev-1.13`. Question-sized authored rubric/evidence inputs produce choice labels, confidence and probabilities. After clearance, the aggregate criteria select only an eligible authored level; task IDs come from the immutable course version. No teaching material or explanation is generated. Authored answer keys and assistance evidence remain authoritative.

Responses require TypeSafe provenance, bounded sizes, known labels and confident decisions. Timeouts, malformed output, unsupported labels and low confidence leave assessment pending. The selected provider is recorded with assessment provenance. Configuring OpenRouter never silently substitutes the mock. The legacy foundation demonstration remains a labeled mock.

## Configuration and cost

The default is `DECISION_PROVIDER=mock`. Private server settings for future live integration are `DECISION_PROVIDER=openrouter`, `OPENROUTER_API_KEY` and `OPENROUTER_MAX_REQUEST_COST_USD`. No secret belongs in frontend variables, Git or screenshots. An absent key or zero budget disables paid requests before network access. The adapter conservatively bounds input cost using byte count and a fixed published price, validates returned cost and aborts network requests within the assessment timeout.

The published Jev input price is $0.042 per million tokens, with zero output-token price. This is inexpensive, but not free. No verified free equivalent was found. `typesafe/jev-router` selects downstream generative models and is not a substitute for typed classification. Configuration and model-price limits must be revisited before enabling live requests; no purchase or live request was made in this milestone. A private key and a separately authorized nonzero budget are still required.

## Verification

Fixture tests exercise the actual typed request shape, provenance, cost rejection without network calls, uncertain routing and authored-task preservation. Existing aggregation tests retain uncertainty, assistance and locked-route checks. Production continues using the mock. Fixture success does not establish live endpoint availability or calibrated classification quality.

References: [OpenRouter Jev guide](https://openrouter.ai/docs/guides/community/jev), [typed API tutorial](https://openrouter.ai/docs/guides/community/jev-tutorial).
