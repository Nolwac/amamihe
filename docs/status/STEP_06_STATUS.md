# Step 6 — Practice Environments

Course resources now open isolated JavaScript workspaces, bounded drawing tools, and downloadable Python notebooks without replacing the 3D adventure. Tutors bind these through the existing resource editor and level resource choices. Opening resources pauses active game timers. Practice attempts persist the learner, pinned course version, level, delivery, resource and expiry; duplicate submissions retain the original evidence. Another account cannot submit to an attempt.

JavaScript runs in a worker owned by an opaque sandbox iframe. The iframe accepts only its parent and a per-instance nonce; the game accepts only that iframe, opaque origin and nonce. CSP prohibits network connections, and the worker has no game DOM or account credentials. Execution times out after one second, code/output are capped at 4,000 characters, and submitted artifacts at 8,000. Browser memory cannot be strictly quota-controlled; this is not a server-side arbitrary-code service. Drawing stores at most 500 normalized points and supports a keyboard point control.

Notebook download produces a Python 3 `.ipynb`. Learners launch an available Colab or Kaggle account, upload the notebook and rights-cleared corpus, then return to the preserved game checkpoint. Existing local/shared Python/PyTorch is also supported. No paid provisioning or fallback is configured. Approved privacy-enhanced YouTube embed URLs can play in a sandbox; other external resources use launch/return, with a visible fallback when playback fails.

## Evidence and boundaries

The repository-authored reference executed on an isolated CPU Python 3.12/PyTorch runtime: 1,040,768 parameters, 20 optimization steps, disjoint split IDs and a saved checkpoint. Run `node --import tsx scripts/practice/verify-training.mjs /path/to/python`; see `evidence/reports/step6-training-smoke.json`. Its synthetic corpus verifies mechanics, not storytelling quality.

Notebook metrics and browser artifacts are learner-reported, schema-checked **unverified practice**. They are retained for review and cannot award course points, alter routing or certify practical mastery. Trusted remote execution receipts/live classification remain integration gates. Colab/Kaggle account access, free quotas, embed availability and offline execution are not promised. JavaScript/drawing require a loaded page; saving and external runtimes require connectivity. Expired attempts can be reopened without resetting course progress.

Validation: all 52 Node checks pass (one optional external-PostgreSQL test skipped), all 12 browser journeys pass, build and formatting pass. The focused browser journey exercises runaway-code cancellation, blocked network/game DOM access, drawing input, notebook download, evidence replay protection, and cross-account rejection.
