import { createEmptyCard, fsrs, Rating } from "ts-fsrs";
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
export function mockClassify(chunks: Chunk[]) {
  if (
    chunks.length !== questions.length ||
    questions.some(
      (q) => chunks.filter((c) => c.questionId === q.id).length !== 1,
    )
  )
    throw new Error(
      "Complete each question exactly once before classification.",
    );
  const assessments = chunks.map((c) => {
    const q = questions.find((q) => q.id === c.questionId)!;
    return {
      questionId: q.id,
      concept: q.concept,
      outcome: c.answer === q.answer ? "correct" : "incorrect",
      assisted: c.assisted,
      score: c.answer === q.answer && !c.assisted ? 1 : 0,
      elapsedMs: c.elapsedMs,
    };
  });
  const independent = assessments.reduce((n, a) => n + a.score, 0);
  const route =
    independent === 3
      ? "advance"
      : independent >= 2
        ? "retry"
        : "review_prerequisite";
  const card = createEmptyCard();
  const nextReview = fsrs()
    .repeat(card, new Date())
    [independent === 3 ? Rating.Good : Rating.Again].card.due.toISOString();
  return {
    model: "mock-classifier-v1",
    mocked: true,
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
