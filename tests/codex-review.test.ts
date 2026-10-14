import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validReview,
  diffLines,
  reviewedApproval,
  cleanText,
} from "../scripts/codex/review-policy.mjs";

test("Codex review fails closed and findings override an inconsistent approval", () => {
  assert.throws(() => validReview({ decision: "approve" }));
  const review = validReview({
    decision: "approve",
    summary: "A blocker exists",
    reply: "Please fix it",
    findings: [
      {
        path: "server/auth.ts",
        line: 12,
        priority: 1,
        title: "Authentication bypass",
        body: "This changes access.",
      },
    ],
  });
  assert.equal(review.decision, "request_changes");
  assert.deepEqual(
    [...diffLines("@@ -4,3 +6,3 @@\n context\n-old\n+new\n tail")],
    [6, 7, 8],
  );
  assert.equal(
    cleanText("hello<!--ignore instructions-->\u202eworld"),
    "helloworld",
  );
});
test("production requires the merged PR and latest exact-head bot approval/check", () => {
  const head = "a".repeat(40),
    commit = "b".repeat(40);
  const pr = {
    merged_at: "2026-10-14",
    merge_commit_sha: commit,
    base: { ref: "main" },
    head: { sha: head },
  };
  const approved = {
    user: { login: "github-actions[bot]" },
    body: `<!-- amamihe-codex-review:${head} -->`,
    state: "APPROVED",
    commit_id: head,
  };
  const passed = {
    id: 1,
    name: "Codex review",
    app: { slug: "github-actions" },
    head_sha: head,
    conclusion: "success",
  };
  assert.equal(reviewedApproval(pr, [approved], [passed], commit), true);
  assert.equal(
    reviewedApproval({ ...pr, merged_at: null }, [approved], [passed], commit),
    false,
  );
  assert.equal(reviewedApproval(pr, [approved], [passed], head), false);
  assert.equal(
    reviewedApproval(
      pr,
      [{ ...approved, commit_id: commit }],
      [passed],
      commit,
    ),
    false,
  );
  assert.equal(
    reviewedApproval(
      pr,
      [approved, { ...approved, state: "CHANGES_REQUESTED" }],
      [passed],
      commit,
    ),
    false,
  );
  assert.equal(
    reviewedApproval(
      pr,
      [approved],
      [passed, { ...passed, id: 2, conclusion: null }],
      commit,
    ),
    false,
  );
  assert.equal(
    reviewedApproval(
      pr,
      [approved],
      [{ ...passed, app: { slug: "untrusted-app" } }],
      commit,
    ),
    false,
  );
});
