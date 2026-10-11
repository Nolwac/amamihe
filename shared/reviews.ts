import { fsrs, createEmptyCard, Rating, type Card } from "ts-fsrs";
const scheduler = fsrs({ enable_fuzz: false });
export function scheduleReview(
  card: Card | undefined,
  now: number,
  correct: boolean,
  assisted: boolean,
) {
  return scheduler.next(
    card || createEmptyCard(new Date(now)),
    new Date(now),
    correct && !assisted ? Rating.Good : Rating.Again,
  ).card;
}
export function remediationWindow(
  evidence: { correct: boolean; assisted: boolean }[],
  policy = { window: 5, minimumEvidence: 3, errorThreshold: 2 },
) {
  const recent = evidence.slice(-policy.window);
  const errors = recent.filter((e) => !e.correct).length,
    assistance = recent.filter((e) => e.assisted).length;
  return {
    samples: recent.length,
    errors,
    assistance,
    remediate:
      recent.length >= policy.minimumEvidence &&
      (errors >= policy.errorThreshold || assistance >= policy.errorThreshold),
  };
}
export function localDueLabel(due: string, timeZone: string) {
  try {
    return new Intl.DateTimeFormat("en", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone,
    }).format(new Date(due));
  } catch {
    return new Date(due).toISOString();
  }
}
