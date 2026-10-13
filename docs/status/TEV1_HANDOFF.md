# Local tev1 decisions

## Implementation and release boundary

This follow-up replaces the former operational provider with private CPU-only Ollama 0.40.3 and `tev1:0.8b`. Base public release: `3eab1e9f5d6a1acd1a15b9fb721fef0517df8003`. Implementation is on `feat/local-tev1-decisions`; exact-head CI and public promotion remain release gates.

## Actual inference

The adapter calls `/v1/systemone` without credentials. It validates model identity, the pinned model manifest, typed primitives, allowed labels and probability distributions. The verified manifest is `sha256:8d11b3146b7f3f4f4d5e9a64665ab2bdaf8b46e4ec42a5880b60a716ae50e3fb`; model weights are Q8_0, 752.39M parameters, approximately 812 MB. This is an experimental Together AI decision model, not a chat-completion prompt that emits teaching text.

Objective answer keys and assistance history determine valid evidence. Tev1 classifies those compact records after clearance and selects eligible published next levels. Before delivery it chooses an authored quiz question and an available teaching role. Multiple eligible options use `choice`; a single permissible activity needs a real `noul` approval. Model concentration is not a calibrated correctness probability. Binary approvals retain their probability and derived margin separately.

Choices and model provenance are persisted in `course_decisions`, and foundation question plans are saved with attempts. Refreshes keep the delivered question, category changes do not reshuffle work, completed criteria remain excluded from independent retries, and previous course versions/points remain intact. Older provider metadata is normalized as historical checkpoint evidence; it is never presented as a fresh tev1 decision. An old partial delivery requires approval of that same question before continuing. Inference failures remain pending with saved work and explicit retry. No alternate provider or generated lesson path exists.

The learning camp presents the selected category and lets learners visit it. All ten actual participation requirements remain distinct from mastery. Existing physical gameplay, protected breaks, unlimited practice/replay and exactly-once rewards are preserved. Stale heartbeat responses cannot overwrite a newer model-selected delivery or report its successful transition as a disconnect.

## Runtime and deployment

The immutable application image includes the checksum-verified CPU runtime and all manifest-verified model blobs. No first-start model download is needed. An owned daemon listens only on container loopback. Small Ollama manifest indexes and its ephemeral local configuration use `/tmp`; model blobs remain immutable. CPU runtime GPU libraries are excluded. The API and inference container has a 3 GiB/two-core limit, while database TLS, private email configuration and the existing release gate remain in place.

Development requires the actual model and a running local Ollama service. `scripts/models/install-ollama.sh` pins the official runtime checksum; `pull-tev1.py` fetches official registry blobs through configured proxies, verifies every SHA256, and refuses a changed model tag. The native pull failed on the managed cloud's direct blob route; the verified proxy-aware downloader installed the same official model manifest. No TLS bypass or network-policy change was used.

## Executed validation so far

- The final complete Node run passed 114 checks with one optional external-PostgreSQL skip and no failures. Actual model classification/level/category/question inference and progress/retry/reward/migration regressions ran. Individual test cases were confirmed using executable workers.
- All 31 complete browser journeys passed with actual tev1 decisions, including the six-level pilot, children’s courses, authentication recovery, physical encounters, mobile resume, practice, all ten roles, authoring, social play and police recovery. Each maintained children’s course completed four challenges and earned 20 points. The final scoped recommendation contrast/text edits then passed an actual-inference capture and WCAG check. CI and exact public promotion remain release gates.
- Actual model inference passed with networking disabled, UID 1000, a read-only filesystem, two CPU cores and a 3 GiB memory limit. The isolated cold decision took approximately seven seconds in that sample. A separate application-image cold start under competing CPU work took around 90 seconds; its ready memory sample was 1.476 GiB including disposable PGlite. This is not a VPS throughput benchmark.

The 1.30 GB pre-promotion application image started its own model with networking disabled, read-only root and UID 1000, and its API reported the exact pinned model ready. Final browser CI, exact release promotion and public model-readiness checks remain required before calling this release live. Retired provider code, labels, seven obsolete manifests and 28 screenshots showing retired labels were removed from the checkout. Unmodified historical evidence remains available at the baseline commit and in a verified local archive. Provider contract fixtures exist only in unit tests and are never copied into the runtime image; actual-model checks and browser journeys use real weights.

Fresh [local verification](../../evidence/reports/tev1-local-verification.json) and [desktop guide](../../evidence/screenshots/tev1-local-guide-desktop.png), [selected activity](../../evidence/screenshots/tev1-selected-category-desktop.png), and [phone category](../../evidence/screenshots/tev1-selected-category-phone.png) captures record actual inference, reload stability and category changes without question reshuffling.

## Remaining evaluation boundaries

The upstream model card reports 63.5% mean accuracy over general public decision datasets for the 0.8B model. That is not measured educational classification accuracy. Tutor-reviewed pedagogy, language calibration, prompt-injection behavior, physical learner-device performance, and production concurrency remain separate evaluation work. Inference is local to the VPS; the browser still renders its own world and downloads no model weights.

Sources: [Ollama model card](https://ollama.com/library/tev1), [Together AI project](https://github.com/togethercomputer/tev1).
