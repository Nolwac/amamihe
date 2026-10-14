# Codex review and protected-main policy

Every new change goes through a pull request into `main`. Use a merge commit so
published branch heads remain ancestors of main. CI and the exact-head `Codex
review` check must pass. Never bypass a rejected review or deploy direct pushes.

`.github/workflows/codex-review.yml` reviews opened/updated PRs and responds to
`@codex` comments, including inline review replies, from write collaborators. It
uses the repository's `OPENAI_API_KEY` secret. The key is never checked into Git,
copied to the VPS, or passed to the feedback job. Codex runs read-only, with sudo
removed, as the final step of its job. Trusted base-workflow scripts collect and
publish data; PR code is inspected without installing or executing it. Hidden
comment text is stripped, review sizes are bounded, incomplete/invalid results
block approval, and changed PR heads cannot reuse old approval. Review findings
override an inconsistent model approval. API failures must be corrected and the
review rerun; they never count as approval.

The publisher records an APPROVE or REQUEST_CHANGES review and a check on the
exact PR head. A fresh review makes the check pending, so an older result cannot
authorize deployment while review is running. Deployment additionally requires
the current main commit to come from a merged PR with the latest successful
Codex check and exact-head bot approval, plus all existing tests, immutable
runtime checks and every-branch ancestry audit. The reviewer never merges code.

For the initial installation, the existing Deploy Amamihe workflow can be
manually dispatched on the maintainer's reviewed setup branch with `review_pr`
set to its PR number. This runs the new reusable reviewer at that exact trusted
branch SHA before the workflow exists on main. Normal automatic reviews use the
workflow source on main. Ordinary deployment remains Actions → Deploy Amamihe →
Run workflow → main, with `review_pr` empty.

## GitHub plan limitation

On 14 October 2026 GitHub returned HTTP403 for this private personal repository's
branch-protection API: "Upgrade to GitHub Pro or make this repository public to
enable this feature." The repository stays private. Workflow reviews and the
PR-only production gate are available, but a workflow cannot prevent a Git push.
Do not claim GitHub is blocking direct pushes until its protection API succeeds.

The desired policy is saved in `.github/branch-protection.json`: require `verify`
and `Codex review` from GitHub Actions, one approval after the latest push,
dismiss stale approvals, resolve conversations, enforce admins, and prohibit
force pushes/deletion. After the owner enables an eligible plan, apply it with:

```sh
gh api --method PUT repos/Nolwac/amamihe/branches/main/protection \
  --input .github/branch-protection.json
```

`main` is the actual default branch; no `master` branch exists. Apply the same
policy to `master` if it is ever introduced. Actions is configured to allow bot
review approvals while keeping default workflow permissions read-only.

Official implementation reference: [Codex GitHub Action](https://learn.chatgpt.com/docs/github-action).
