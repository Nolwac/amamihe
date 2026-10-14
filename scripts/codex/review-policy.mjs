export function cleanText(value, limit = 12000) {
  return String(value || "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u202a-\u202e\u2066-\u2069]/g,
      "",
    )
    .slice(0, limit);
}
export function trustedInlineRequest(run, comment, repository) {
  const prefix = `https://api.github.com/repos/${repository}/pulls/`;
  const url = String(comment?.pull_request_url || "");
  const number = Number(url.slice(prefix.length));
  if (
    run?.event !== "pull_request_review_comment" ||
    run.conclusion !== "success" ||
    run.actor?.type === "Bot" ||
    comment?.user?.type === "Bot" ||
    run.actor?.login !== comment?.user?.login ||
    !url.startsWith(prefix) ||
    !Number.isSafeInteger(number) ||
    number < 1 ||
    !/^\d+$/.test(url.slice(prefix.length))
  )
    throw new Error(
      "Inline request does not match its authenticated GitHub actor and repository.",
    );
  return number;
}
export function inlineReplyTarget(comment) {
  const id = comment?.in_reply_to_id ?? comment?.id;
  if (!Number.isSafeInteger(id) || id < 1)
    throw new Error("Invalid inline reply target.");
  return id;
}
export function reviewNeedsCheck(pr) {
  return pr.state === "open" || Boolean(pr.merged_at);
}
export function validReview(value) {
  if (
    !value ||
    !["approve", "request_changes"].includes(value.decision) ||
    typeof value.summary !== "string" ||
    typeof value.reply !== "string" ||
    !Array.isArray(value.findings) ||
    value.findings.length > 10
  )
    throw new Error("Codex returned an invalid review; approval is blocked.");
  for (const f of value.findings)
    if (
      !f ||
      ![0, 1, 2].includes(f.priority) ||
      typeof f.path !== "string" ||
      !Number.isInteger(f.line) ||
      f.line < 1 ||
      typeof f.title !== "string" ||
      typeof f.body !== "string"
    )
      throw new Error("Codex findings are invalid; approval is blocked.");
  return {
    ...value,
    decision: value.findings.length ? "request_changes" : value.decision,
  };
}
export function diffLines(patch) {
  const lines = new Set();
  let line;
  for (const row of String(patch || "").split("\n")) {
    const hunk = row.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) {
      line = Number(hunk[1]);
      continue;
    }
    if (line === undefined || row.startsWith("\\") || row.startsWith("-"))
      continue;
    if (row.startsWith("+") || row.startsWith(" ")) {
      lines.add(line);
      line++;
    }
  }
  return lines;
}
export function reviewedApproval(pr, reviews, checks, commit) {
  if (
    !pr.merged_at ||
    pr.base?.ref !== "main" ||
    pr.merge_commit_sha !== commit
  )
    return false;
  const marker = `<!-- amamihe-codex-review:${pr.head.sha} -->`;
  const latest = reviews
    .filter(
      (r) =>
        r.user?.login === "github-actions[bot]" &&
        r.body?.includes(marker) &&
        ["APPROVED", "CHANGES_REQUESTED"].includes(r.state),
    )
    .at(-1);
  const check = checks
    .filter(
      (c) =>
        c.name === "Codex review" &&
        c.app?.slug === "github-actions" &&
        c.head_sha === pr.head.sha,
    )
    .sort((a, b) => b.id - a.id)[0];
  return (
    latest?.state === "APPROVED" &&
    latest.commit_id === pr.head.sha &&
    check?.conclusion === "success"
  );
}
