import type { GameState } from "../shared/gameplay.js";
export function newGame(seconds: number, multiplier = 1, run = 0): GameState {
  if (![0, 1, 2].includes(multiplier))
    throw new Error("Invalid timer accommodation");
  return {
    status: "ready",
    elapsedMs: 0,
    lastTick: 0,
    budgetMs: seconds * multiplier * 1000,
    multiplier,
    run,
  };
}
/** Connected activity lease: gaps longer than five seconds count at most five.
 * Lost connectivity, suspended tabs, loading and server pauses cannot drain a
 * whole section timer. All accepted elapsed time comes from the server clock. */
export function tickGame(game: GameState, now: number): GameState {
  const next = { ...game };
  if (next.status === "active") {
    next.elapsedMs += Math.max(0, Math.min(5000, now - next.lastTick));
    next.lastTick = now;
    if (next.budgetMs > 0 && next.elapsedMs >= next.budgetMs)
      next.status = "game-over";
  }
  return next;
}
