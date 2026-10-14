export const SIGNALS = [
  "Hello",
  "Ready to learn",
  "Need a hint",
  "Let’s practice",
  "Well done",
  "Taking a break",
] as const;
export type Presence = {
  id: string;
  name: string;
  outfit: string;
  avatar?: import("./avatars.js").CharacterId;
  x: number;
  z: number;
  heading: number;
  signal: string;
  room: string;
};
export type Team = {
  id: string;
  name: string;
  ownerId: string;
  invite: string;
  members: { id: string; name: string }[];
};
export type BattleView = {
  id: string;
  status: "pending" | "active" | "complete";
  courseTitle: string;
  courseVersion: number;
  expiresAt: number;
  teams: { id: string; name: string; score: number }[];
  players: {
    id: string;
    teamId: string;
    name: string;
    answered: number;
    score: number;
  }[];
  questions: { id: string; prompt: string; options: string[] }[];
  result?: { winningTeamId: string | null; rewards: Record<string, number> };
};
export function validPosition(
  value: unknown,
  scope: "city" | "course" = "city",
): value is { x: number; z: number; heading: number } {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    ["x", "z", "heading"].every(
      (k) => typeof v[k] === "number" && Number.isFinite(v[k]),
    ) &&
    Math.abs(Number(v.x)) <= 5 &&
    Number(v.z) >= (scope === "course" ? 0 : -11) &&
    Number(v.z) <= (scope === "course" ? 100000 : 10) &&
    Math.abs(Number(v.heading)) <= Math.PI * 2
  );
}
export function teamOutcome(
  scores: { id: string; correct: number; participants: number }[],
) {
  const normalized = scores.map((s) => ({
    ...s,
    score: s.correct / Math.max(1, s.participants),
  }));
  const winner =
    normalized[0].score === normalized[1].score
      ? null
      : normalized[0].score > normalized[1].score
        ? normalized[0].id
        : normalized[1].id;
  return {
    winner,
    reward: (teamId: string) =>
      winner === null ? 10 : winner === teamId ? 20 : 5,
  };
}
