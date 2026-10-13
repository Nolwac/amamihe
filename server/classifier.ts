import { createEmptyCard, fsrs, Rating } from "ts-fsrs";
import type { ClassificationProvider } from "./assessment.js";
import { decisionConfiguration } from "./decision-provider.js";
export const questions = [
  {
    id: "tokens",
    concept: "tokenization",
    prompt: "What does a tokenizer do before a language model sees a story?",
    options: [
      "Turns text into token IDs",
      "Adds more training layers",
      "Writes a better ending",
    ],
    answer: 0,
    explanation:
      "A tokenizer maps text to a sequence of IDs. The model learns patterns in those sequences.",
  },
  {
    id: "split",
    concept: "evaluation",
    prompt: "Why reserve stories that the model never sees during training?",
    options: [
      "To make training faster",
      "To test how well it generalizes",
      "To increase the parameter count",
    ],
    answer: 1,
    explanation:
      "Held-out stories let us evaluate generalization, rather than simply remembering training examples.",
  },
  {
    id: "scratch",
    concept: "training",
    prompt: "What does training a model from scratch mean?",
    options: [
      "Copy a pretrained model",
      "Only change its name",
      "Start with newly initialized weights",
    ],
    answer: 2,
    explanation:
      "Training from scratch starts with new weights and learns them from the chosen dataset.",
  },
];
export type Chunk = {
  questionId: string;
  answer: number;
  assisted: boolean;
  elapsedMs: number;
};
export async function selectFoundationQuestions(
  provider: ClassificationProvider,
) {
  const remaining = [...questions];
  const order: string[] = [];
  const decisions = [];
  while (remaining.length) {
    const selection = await provider.select({
      kind: "question",
      state: { selectedConcepts: order, remaining: remaining.length },
      instructions:
        "Choose the next authored foundation examination question. Cover every listed concept once, starting with foundational ideas. Every listed question is appropriate and permitted.",
      candidates: remaining.map((q) => ({ id: q.id, description: q.prompt })),
    });
    const index = remaining.findIndex((q) => q.id === selection.choice);
    if (index < 0)
      throw new Error(
        "The local guide selected an unavailable foundation question.",
      );
    order.push(remaining[index].id);
    decisions.push(selection);
    remaining.splice(index, 1);
  }
  return { order, decisions };
}

/** Only current public fields leave storage; old records retain earned rewards. */
export function publicFoundationResult(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const r = value as Record<string, unknown>;
  const current =
    typeof r.provider === "string" && r.provider.startsWith("ollama:");
  return {
    provider: current ? r.provider : "historical-checkpoint",
    model: current ? r.model : "Recorded checkpoint",
    independent: r.independent,
    total: r.total,
    route: r.route,
    nextLevel: r.nextLevel,
    reason: current
      ? r.reason
      : "Your earlier checkpoint and earned points are preserved.",
    points: r.points,
    nextReview: r.nextReview,
    assessments: r.assessments,
    ...(current ? { routingDecision: r.routingDecision } : {}),
  };
}
export async function classifyFoundation(
  chunks: Chunk[],
  provider: ClassificationProvider = decisionConfiguration().provider,
) {
  if (
    chunks.length !== questions.length ||
    questions.some(
      (q) => chunks.filter((c) => c.questionId === q.id).length !== 1,
    )
  )
    throw new Error(
      "Complete each question exactly once before classification.",
    );
  const assessments = [];
  for (const c of chunks) {
    const q = questions.find((q) => q.id === c.questionId)!;
    const grade = (await provider.grade({
      evidence: {
        delivery_id: q.id,
        question_id: q.id,
        retry: false,
        correct: c.answer === q.answer,
        assisted: c.assisted,
        answer: c.answer,
        elapsed_ms: c.elapsedMs,
      },
      criterionId: q.id,
      rubric: q.explanation,
    })) as {
      deliveryId?: string;
      criterionId?: string;
      score?: number;
      tags?: string[];
      confidence?: number;
    };
    if (
      grade.deliveryId !== q.id ||
      grade.criterionId !== q.id ||
      ![0, 1].includes(grade.score!) ||
      !Number.isFinite(grade.confidence) ||
      grade.tags?.includes("uncertain")
    )
      throw new Error(
        "The local learning guide could not confirm this evidence. Your responses remain saved.",
      );
    if (c.answer === q.answer && !c.assisted && grade.score !== 1)
      throw new Error(
        "The local learning guide needs another assessment attempt. Your responses remain saved.",
      );
    assessments.push({
      questionId: q.id,
      concept: q.concept,
      outcome: c.answer === q.answer ? "correct" : "incorrect",
      assisted: c.assisted,
      score: c.answer === q.answer && !c.assisted ? 1 : 0,
      elapsedMs: c.elapsedMs,
    });
  }
  const independent = assessments.reduce((n, a) => n + a.score, 0);
  const candidates =
    independent === 3
      ? [
          {
            id: "advance",
            description:
              "All three concepts were answered correctly without help. Continue to the data workshop.",
          },
        ]
      : independent >= 2
        ? [
            {
              id: "retry",
              description:
                "Rehearse the missing criterion with fresh authored practice.",
            },
            {
              id: "review_prerequisite",
              description:
                "Review foundational reading before another attempt.",
            },
          ]
        : [
            {
              id: "review_prerequisite",
              description:
                "Review foundational concepts because several independent criteria are missing.",
            },
          ];
  const decision = await provider.select({
    kind: "foundation",
    state: { independent, total: questions.length, evidence: assessments },
    instructions:
      "Select the next permitted learning route from the recorded independent evidence. Prefer fresh practice for one gap and prerequisite review for multiple gaps. Advance only when all independent criteria are met.",
    candidates,
  });
  if (!candidates.some((c) => c.id === decision.choice))
    throw new Error("The local guide selected an impermissible route.");
  const route = decision.choice;
  const card = createEmptyCard();
  const nextReview = fsrs()
    .repeat(card, new Date())
    [independent === 3 ? Rating.Good : Rating.Again].card.due.toISOString();
  return {
    model: decision.model,
    provider: decision.provider,
    routingDecision: decision,
    assessments,
    independent,
    total: 3,
    route,
    nextLevel:
      route === "advance"
        ? "Data Workshop"
        : route === "retry"
          ? "Foundations — fresh practice"
          : "Tokenization Primer",
    reason:
      route === "advance"
        ? "All three concepts demonstrated independently."
        : "Strengthen the highlighted concepts before advancing.",
    points: independent * 20,
    nextReview,
  };
}
