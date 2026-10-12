import type { GameState } from "../shared/gameplay.js";
import type { Theme } from "../shared/course.js";
import {
  advanceAdventureRuntime,
  applyAdventureAction,
  applyAdventureTask,
  createAdventureRuntime,
  continueAdventureStep,
  type AdventureAction,
  type AdventureState,
} from "../shared/adventure-runtime.js";
export function newGame(
  seconds: number,
  multiplier = 1,
  run = 0,
  options?: {
    theme: Theme;
    seed?: number;
    assist?: boolean;
    taskCount?: number;
    carry?: AdventureState;
  },
): GameState {
  if (![0, 1, 2].includes(multiplier))
    throw new Error("Invalid timer accommodation");
  return {
    status: "ready",
    elapsedMs: 0,
    lastTick: 0,
    budgetMs: seconds * multiplier * 1000,
    multiplier,
    run,
    actionSequence: 0,
    ...(options
      ? {
          adventure:
            options.carry && options.carry.theme === options.theme
              ? continueAdventureStep(options.carry, {
                  assist:
                    seconds === 0 ||
                    multiplier === 0 ||
                    options.assist !== false,
                  budgetMs: seconds * multiplier * 1000,
                  taskCount: options.taskCount,
                })
              : createAdventureRuntime(options.theme, {
                  seed: options.seed ?? run,
                  assist:
                    seconds === 0 ||
                    multiplier === 0 ||
                    options.assist !== false,
                  budgetMs: seconds * multiplier * 1000,
                  taskCount: options.taskCount,
                }),
        }
      : {}),
  };
}
/** Connected activity lease: gaps longer than five seconds count at most five.
 * Lost connectivity, suspended tabs, loading and server pauses cannot drain a
 * whole section timer. All accepted elapsed time comes from the server clock. */
export function tickGame(game: GameState, now: number): GameState {
  const next = { ...game };
  if (next.status === "active") {
    const acceptedMs = Math.max(
      0,
      Math.min(
        5000,
        now - next.lastTick,
        next.budgetMs > 0 ? Math.max(0, next.budgetMs - next.elapsedMs) : 5000,
      ),
    );
    next.elapsedMs += acceptedMs;
    if (next.adventure) {
      next.adventure = advanceAdventureRuntime(next.adventure, acceptedMs);
      if (next.adventure.collision) {
        next.status = "game-over";
        next.elapsedMs = next.adventure.elapsedMs;
      }
    }
    next.lastTick = now;
    if (next.budgetMs > 0 && next.elapsedMs >= next.budgetMs) {
      next.status = "game-over";
      if (next.adventure?.theme === "temple-chase" && !next.adventure.collision)
        next.adventure = {
          ...next.adventure,
          guardianGap: 0,
          collision: {
            id: `guardian:${next.adventure.seed}`,
            kind: "guardian",
            distance: next.adventure.distance,
          },
        };
    }
  }
  return next;
}

/** Only the server clock can advance a collision. Action requests contain no
 * client position, collision verdict, task grade, or reward amount. */
export function applyGameAction(
  game: GameState,
  action: AdventureAction,
  now: number,
): GameState {
  const next = tickGame(game, now);
  if (next.status === "active" && next.adventure)
    next.adventure = applyAdventureAction(next.adventure, action);
  return next;
}

export function applyGameTask(
  game: GameState,
  event: { correct: boolean; independent: boolean },
): GameState {
  return game.adventure
    ? { ...game, adventure: applyAdventureTask(game.adventure, event) }
    : game;
}
