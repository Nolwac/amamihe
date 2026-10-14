export function cleanText(value: unknown, limit?: number): string;
export function trustedInlineRequest(
  run: Record<string, any>,
  comment: Record<string, any>,
  repository: string,
): number;
export function diffLines(patch: unknown): Set<number>;
export function validReview(value: unknown): {
  decision: "approve" | "request_changes";
  summary: string;
  reply: string;
  findings: {
    path: string;
    line: number;
    priority: number;
    title: string;
    body: string;
  }[];
};
export function reviewedApproval(
  pr: {
    merged_at: string | null;
    merge_commit_sha: string;
    base: { ref: string };
    head: { sha: string };
  },
  reviews: Record<string, any>[],
  checks: Record<string, any>[],
  commit: string,
): boolean;
