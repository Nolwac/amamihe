export type PracticeKind = "javascript" | "drawing" | "notebook";
export type PracticeAttempt = {
  id: string;
  courseId: string;
  version: number;
  levelId: string;
  deliveryId: string;
  resourceId: string;
  kind: PracticeKind;
  expiresAt: number;
  status: "open" | "received";
  evidence?: unknown;
};
export function validPracticeEvidence(
  kind: PracticeKind,
  value: unknown,
): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  if (JSON.stringify(value).length > 8000) return false;
  if (kind === "javascript")
    return (
      typeof v.output === "string" &&
      v.output.length <= 4000 &&
      typeof v.code === "string" &&
      v.code.length <= 4000
    );
  if (kind === "drawing")
    return (
      Array.isArray(v.points) &&
      v.points.length <= 500 &&
      v.points.every(
        (p) =>
          Array.isArray(p) &&
          p.length === 2 &&
          p.every(
            (n) =>
              typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1,
          ),
      )
    );
  return (
    Number.isInteger(v.parameters) &&
    v.parameters === 1040768 &&
    typeof v.steps === "number" &&
    Number.isInteger(v.steps) &&
    v.steps >= 1 &&
    v.steps <= 100000 &&
    typeof v.heldoutLoss === "number" &&
    Number.isFinite(v.heldoutLoss) &&
    v.heldoutLoss > 0 &&
    v.heldoutLoss < 100 &&
    typeof v.checkpoint === "string" &&
    v.checkpoint.length <= 200
  );
}
export function notebookDocument(code: string) {
  let importedCells;
  if (code.trimStart().startsWith("{")) {
    const imported = JSON.parse(code);
    if (
      imported.nbformat !== 4 ||
      !Array.isArray(imported.cells) ||
      imported.cells.length > 200
    )
      throw new Error(
        "Upload a valid version 4 notebook with at most 200 cells.",
      );
    importedCells = imported.cells.map(
      (cell: Record<string, unknown>, index: number) => {
        const source =
          typeof cell.source === "string" ? [cell.source] : cell.source;
        if (
          !["code", "markdown", "raw"].includes(String(cell.cell_type)) ||
          !Array.isArray(source) ||
          !source.every((line) => typeof line === "string") ||
          source.join("").length > 100000
        )
          throw new Error("Notebook cells must contain bounded text sources.");
        return {
          cell_type: String(cell.cell_type),
          id: `imported-${index}`,
          metadata: {},
          source,
          ...(cell.cell_type === "code"
            ? { outputs: [], execution_count: null }
            : {}),
        };
      },
    );
  }
  return {
    nbformat: 4,
    nbformat_minor: 5,
    metadata: {
      kernelspec: {
        display_name: "Python 3",
        language: "python",
        name: "python3",
      },
    },
    cells: importedCells ?? [
      {
        cell_type: "markdown",
        id: "practice-context",
        metadata: {},
        source: [
          "# Amamihe practice\n",
          "Use an available free runtime or your own Python/PyTorch environment. Upload a rights-cleared corpus.jsonl first. No paid fallback is configured.\n",
        ],
      },
      {
        cell_type: "code",
        id: "training-code",
        metadata: {},
        source: code.split("\n").map((line) => line + "\n"),
        outputs: [],
        execution_count: null,
      },
    ],
  };
}
export function approvedEmbed(value: string): string | null {
  try {
    const u = new URL(value);
    return u.protocol === "https:" &&
      u.hostname === "www.youtube-nocookie.com" &&
      /^\/embed\/[A-Za-z0-9_-]{11}$/.test(u.pathname) &&
      !u.username &&
      !u.password &&
      !u.port
      ? u.origin + u.pathname
      : null;
  } catch {
    return null;
  }
}
