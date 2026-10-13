import type { CourseDefinition, CourseLevel } from "../shared/course.js";
import { decisionConfiguration } from "./decision-provider.js";
import type { DecisionSelection } from "../shared/decision.js";

export type Evidence = {
  delivery_id: string;
  question_id: string;
  retry: boolean;
  correct: boolean;
  assisted: boolean;
  answer: number;
  elapsed_ms: number;
};
export type Grade = {
  modelDigest?: string;
  probabilities?: Record<string, number>;
  deliveryId: string;
  criterionId: string;
  score: number;
  confidence: number;
  tags: string[];
};
export type Assessment = {
  status: "confirmed" | "pending";
  provider?: string;
  routingDecision?: DecisionSelection;
  grades: Grade[];
  criteria: { id: string; score: number; independent: boolean }[];
  assistanceCount: number;
  errorCount: number;
  nextLevelId: string | null;
  taskIds: string[];
  reason: string;
};
export interface ClassificationProvider {
  readonly identity?: string;
  readonly timeoutMs?: number;
  select(input: SelectionInput): Promise<DecisionSelection>;
  grade(input: {
    evidence: Evidence;
    criterionId: string;
    rubric: string;
  }): Promise<unknown>;
  route(input: {
    criteria: Assessment["criteria"];
    eligible: { id: string; title?: string; taskIds: string[] }[];
  }): Promise<unknown>;
}
export type SelectionInput = {
  kind: DecisionSelection["kind"];
  state: unknown;
  instructions: string;
  candidates: { id: string; description: string }[];
};

/** Byte-conservative budget: even a one-byte token cannot exceed this limit. */
export function boundedChunks(text: string, byteBudget = 2048): string[] {
  if (
    !Number.isInteger(byteBudget) ||
    byteBudget < 4 ||
    byteBudget > 8192 ||
    Buffer.byteLength(text) > 65536
  )
    throw new Error("Response exceeds the bounded assessment budget.");
  const chunks: string[] = [];
  let current = "",
    bytes = 0;
  for (const char of text) {
    const size = Buffer.byteLength(char);
    if (bytes + size > byteBudget) {
      chunks.push(current);
      current = "";
      bytes = 0;
    }
    current += char;
    bytes += size;
  }
  if (current) chunks.push(current);
  return chunks;
}
function validGrade(
  value: unknown,
  evidence: Evidence,
  criterionId: string,
): value is Grade {
  if (!value || typeof value !== "object") return false;
  const g = value as Grade;
  return (
    g.deliveryId === evidence.delivery_id &&
    g.criterionId === criterionId &&
    [0, 1].includes(g.score) &&
    Number.isFinite(g.confidence) &&
    g.confidence >= 0 &&
    g.confidence <= 1 &&
    Array.isArray(g.tags) &&
    g.tags.length <= 4 &&
    g.tags.every((t) => ["assisted", "incorrect", "uncertain"].includes(t))
  );
}
async function boundedCall(work: () => Promise<unknown>, timeoutMs: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work(),
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("Classification timeout")),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
export async function assessLevel(
  definition: CourseDefinition,
  level: CourseLevel,
  evidence: Evidence[],
  completed: string[],
  provider: ClassificationProvider = decisionConfiguration().provider,
): Promise<Assessment> {
  const result: Assessment = {
    status: "pending",
    provider: provider.identity ?? "injected-provider",
    grades: [],
    criteria: level.questions.map((q) => ({
      id: q.id,
      score: 0,
      independent: false,
    })),
    assistanceCount: evidence.filter((e) => e.assisted).length,
    errorCount: evidence.filter((e) => !e.correct).length,
    nextLevelId: null,
    taskIds: [],
    reason: "Assessment pending; no further level has been selected.",
  };
  try {
    if (evidence.length > 48) throw new Error("Too many chunks");
    for (const e of evidence) {
      const question = (e.retry ? level.retryQuestions : level.questions).find(
        (q) => q.id === e.question_id,
      );
      const criterionId = e.retry ? question?.retryFor : question?.id;
      if (!question || !criterionId) throw new Error("Unknown evidence");
      // Full teaching resources and the entire level never enter a grade request.
      const input = { evidence: e, criterionId, rubric: question.rubric };
      if (Buffer.byteLength(JSON.stringify(input)) > 8192)
        throw new Error("Context exceeds budget");
      const grade = await boundedCall(
        () => provider.grade(input),
        provider.timeoutMs ?? 1000,
      );
      if (
        !validGrade(grade, e, criterionId) ||
        grade.tags.includes("uncertain")
      )
        throw new Error("Invalid or uncertain grade");
      result.grades.push(grade);
      const criterion = result.criteria.find((c) => c.id === criterionId)!;
      // Classifier output cannot override the authored answer key or assistance.
      if (e.correct && !e.assisted && grade.score === 1) {
        criterion.score = 1;
        criterion.independent = true;
      }
    }
    if (result.criteria.some((c) => !c.independent))
      throw new Error("Critical evidence missing");
    const completedConcepts = new Set(
      definition.levels
        .filter((l) => completed.includes(l.id))
        .map((l) => l.conceptId),
    );
    const eligible = definition.levels
      .filter(
        (l) =>
          !completed.includes(l.id) &&
          l.prerequisites.every((id) => completed.includes(id)) &&
          (
            definition.concepts.find((c) => c.id === l.conceptId)
              ?.prerequisites ?? []
          ).every((id) => completedConcepts.has(id)),
      )
      .map((l) => ({
        id: l.id,
        title: l.title,
        taskIds: l.questions.map((q) => q.id),
      }));
    const input = { criteria: result.criteria, eligible };
    if (Buffer.byteLength(JSON.stringify(input)) > 32768)
      throw new Error("Routing context exceeds budget");
    const route = (await boundedCall(
      () => provider.route(input),
      provider.timeoutMs ?? 1000,
    )) as {
      nextLevelId?: unknown;
      taskIds?: unknown;
      decision?: DecisionSelection;
    } | null;
    const selected = eligible.find((l) => l.id === route?.nextLevelId);
    if (
      !route ||
      (!selected && !(eligible.length === 0 && route.nextLevelId === null)) ||
      !Array.isArray(route.taskIds) ||
      JSON.stringify(route.taskIds) !== JSON.stringify(selected?.taskIds ?? [])
    )
      throw new Error("Ineligible level or task set");
    result.status = "confirmed";
    result.nextLevelId = selected?.id ?? null;
    result.taskIds = selected?.taskIds ?? [];
    result.routingDecision = route.decision;
    result.reason =
      "Local decision inference confirmed recorded independent criteria and selected an eligible authored task set. This is not practical mastery certification.";
  } catch (error) {
    result.reason =
      "Assessment pending: " +
      (error instanceof Error
        ? error.message.slice(0, 240)
        : "The local learning guide is unavailable.");
    /* Preserve evidence and stay pending; never silently grant mastery. */
  }
  return result;
}
