import type { Theme } from "./course.js";

export type AdventureAction = "left" | "right" | "jump" | "slide" | "strike";
export type AdventureHazardKind = "hurdle" | "arch" | "block" | "guardian";
export type AdventureCollision = {
  id: string;
  kind: AdventureHazardKind;
  distance: number;
};
export type AdventureState = {
  theme: Theme;
  seed: number;
  assist: boolean;
  budgetMs: number;
  taskCount: number;
  elapsedMs: number;
  distance: number;
  rivalDistance: number;
  lane: -1 | 0 | 1;
  targetLane: -1 | 0 | 1;
  laneX: number;
  jumpStartedMs: number | null;
  slideStartedMs: number | null;
  boostUntilMs: number;
  guardianGap: number;
  guardianStartGap: number;
  guardianRelief: number;
  strikes: number;
  opponentHealth: number;
  taskProgress: number;
  obstaclesCleared: number;
  collision: AdventureCollision | null;
  actionSerial: number;
  lastAction: AdventureAction | null;
  lastActionMs: number;
  lastTaskMs: number;
  lastTaskCorrect: boolean | null;
};

export const ADVENTURE_ACTIONS: readonly AdventureAction[] = [
  "left",
  "right",
  "jump",
  "slide",
  "strike",
];
const JUMP_MS = 1400;
const SLIDE_MS = 1300;
const STRIKE_MS = 850;
const FIRST_HAZARD = 36;
const HAZARD_SPACING = 28;
const LANE_WIDTH = 1.65;
const HALF_CONTACT = 0.85;
const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));
const lane = (value: number): -1 | 0 | 1 =>
  clamp(Math.round(value), -1, 1) as -1 | 0 | 1;

/** Small serializable physics state. The server and browser use the same
 * obstacle schedule and swept contact checks; rendering never awards mastery.
 * Auto assistance changes movement only, not assessment or reward criteria. */
export function createAdventureRuntime(
  theme: Theme,
  options: {
    seed?: number;
    assist?: boolean;
    budgetMs?: number;
    taskCount?: number;
  } = {},
): AdventureState {
  return {
    theme,
    seed: Number.isSafeInteger(options.seed)
      ? Math.abs(options.seed! % 1000000)
      : 0,
    assist: options.assist !== false,
    budgetMs: Number.isFinite(options.budgetMs)
      ? clamp(options.budgetMs!, 0, 7200000)
      : 0,
    taskCount: Number.isFinite(options.taskCount)
      ? clamp(Math.floor(options.taskCount!), 1, 100)
      : 4,
    elapsedMs: 0,
    distance: 0,
    rivalDistance: 4,
    lane: 0,
    targetLane: 0,
    laneX: 0,
    jumpStartedMs: null,
    slideStartedMs: null,
    boostUntilMs: 0,
    guardianGap: 10,
    guardianStartGap: 10,
    guardianRelief: 0,
    strikes: 0,
    opponentHealth: 100,
    taskProgress: 0,
    obstaclesCleared: 0,
    collision: null,
    actionSerial: 0,
    lastAction: null,
    lastActionMs: 0,
    lastTaskMs: -10000,
    lastTaskCorrect: null,
  };
}

export type AdventureObstacle = {
  id: string;
  kind: Exclude<AdventureHazardKind, "guardian">;
  lane: -1 | 0 | 1;
  distance: number;
  z: number;
  cleared: boolean;
};

function obstacle(state: AdventureState, index: number): AdventureObstacle {
  // The first hurdle is deliberately visible in the initial straight. Later
  // lanes/kinds are seeded but deterministic across devices and reloads.
  const offset = index === 0 ? 0 : state.seed % 3;
  const pattern = [0, 1, 0, -1, 1, -1] as const;
  const kind = ["hurdle", "block", "arch", "hurdle", "arch", "block"] as const;
  const distance = FIRST_HAZARD + index * HAZARD_SPACING;
  return {
    id: `hazard:${state.seed}:${index}`,
    kind: kind[(index + offset) % kind.length],
    lane: pattern[(index + offset) % pattern.length],
    distance,
    z: distance - state.distance,
    cleared: state.distance > distance + HALF_CONTACT,
  };
}

function jumpHeight(state: AdventureState, now = state.elapsedMs) {
  if (state.jumpStartedMs === null) return 0;
  const phase = (now - state.jumpStartedMs) / JUMP_MS;
  return phase > 0 && phase < 1 ? Math.sin(phase * Math.PI) * 1.45 : 0;
}
function isJumping(state: AdventureState) {
  return (
    state.jumpStartedMs !== null &&
    state.elapsedMs - state.jumpStartedMs < JUMP_MS
  );
}
function isSliding(state: AdventureState, now = state.elapsedMs) {
  return (
    state.slideStartedMs !== null &&
    now >= state.slideStartedMs &&
    now - state.slideStartedMs < SLIDE_MS
  );
}
export function adventureSpeed(state: AdventureState) {
  if (state.collision) return 0;
  const base =
    state.theme === "racing"
      ? 6
      : state.theme === "temple-chase"
        ? 4.6
        : state.theme === "workshop"
          ? 1.8
          : 0;
  return (
    base +
    (state.elapsedMs < state.boostUntilMs
      ? state.theme === "racing"
        ? 3
        : state.theme === "temple-chase"
          ? 1.8
          : 0.8
      : 0)
  );
}

export function applyAdventureAction(
  state: AdventureState,
  action: AdventureAction,
): AdventureState {
  if (state.collision || !ADVENTURE_ACTIONS.includes(action)) return state;
  const next = { ...state };
  if (action === "left" || action === "right") {
    const targetLane = lane(state.targetLane + (action === "left" ? -1 : 1));
    if (
      state.assist &&
      (state.theme === "temple-chase" || state.theme === "racing")
    ) {
      const index = Math.max(
        0,
        Math.floor(
          (state.distance - FIRST_HAZARD + HALF_CONTACT) / HAZARD_SPACING,
        ),
      );
      // Optional controls cannot steer assisted/untimed play into a solid
      // block inside the automatic avoidance window.
      if (
        [obstacle(state, index), obstacle(state, index + 1)].some(
          (hazard) =>
            hazard.kind === "block" &&
            hazard.lane === targetLane &&
            hazard.z >= -HALF_CONTACT &&
            hazard.z <= 9,
        )
      )
        return state;
    }
    next.targetLane = targetLane;
  } else if (action === "jump") {
    if (
      (state.theme !== "temple-chase" && state.theme !== "racing") ||
      isJumping(state) ||
      isSliding(state)
    )
      return state;
    next.jumpStartedMs = state.elapsedMs;
  } else if (action === "slide") {
    if (
      (state.theme !== "temple-chase" && state.theme !== "racing") ||
      isJumping(state) ||
      isSliding(state)
    )
      return state;
    next.slideStartedMs = state.elapsedMs;
  } else if (action === "strike") {
    if (state.theme !== "wrestling") return state;
    // Free practice punches animate; only validated task events cause damage.
    if (
      state.lastAction === "strike" &&
      state.elapsedMs - state.lastActionMs < STRIKE_MS
    )
      return state;
  }
  next.lastAction = action;
  next.lastActionMs = state.elapsedMs;
  next.actionSerial++;
  return next;
}

export function applyAdventureTask(
  state: AdventureState,
  event: { correct: boolean; independent: boolean },
): AdventureState {
  if (state.collision) return state;
  let next = {
    ...state,
    lastTaskMs: state.elapsedMs,
    lastTaskCorrect: event.correct && event.independent,
  };
  if (event.correct && event.independent) {
    next.boostUntilMs = state.elapsedMs + 6500;
    next.guardianRelief = Math.min(5, state.guardianRelief + 2.5);
    next.guardianGap = Math.min(15, state.guardianGap + 2.5);
    next.taskProgress = Math.min(1, state.taskProgress + 1 / state.taskCount);
    if (state.theme === "wrestling") {
      // Task confirmation must have a fresh visible hit even if the learner
      // just used the harmless free-practice punch button.
      next.lastAction = "strike";
      next.lastActionMs = state.elapsedMs;
      next.actionSerial++;
      next.strikes++;
      next.opponentHealth = Math.max(
        0,
        state.opponentHealth - 100 / state.taskCount,
      );
      if (next.opponentHealth < 1e-8) next.opponentHealth = 0;
    }
  } else {
    // An authored incorrect/assisted response cannot create a speed or combat
    // reward; the server still selects the mapped fresh independent retry.
    next.guardianRelief = Math.max(0, state.guardianRelief - 1);
  }
  return next;
}

/** A confirmed task begins a fresh section clock while the same world and
 * opponent continue. A retry receives the saved pre-step checkpoint, rather
 * than the failed encounter position. Only a level change creates a new world. */
export function continueAdventureStep(
  previous: AdventureState,
  options: { budgetMs: number; assist?: boolean; taskCount?: number },
): AdventureState {
  const next = createAdventureRuntime(previous.theme, {
    seed: previous.seed,
    assist: options.assist ?? previous.assist,
    budgetMs: options.budgetMs,
    taskCount: options.taskCount ?? previous.taskCount,
  });
  return {
    ...next,
    distance: previous.distance,
    rivalDistance: previous.rivalDistance,
    lane: previous.lane,
    targetLane: previous.targetLane,
    laneX: previous.laneX,
    // A successful checkpoint can occur over a hurdle or under a beam. Finish
    // that airborne/sliding motion after the clock reset instead of spawning
    // the learner inside a hazard and creating an unavoidable false failure.
    jumpStartedMs: isJumping(previous)
      ? previous.jumpStartedMs! - previous.elapsedMs
      : null,
    slideStartedMs: isSliding(previous)
      ? previous.slideStartedMs! - previous.elapsedMs
      : null,
    boostUntilMs: Math.max(0, previous.boostUntilMs - previous.elapsedMs),
    guardianGap: previous.guardianGap,
    guardianStartGap: Math.max(0, previous.guardianGap),
    strikes: previous.strikes,
    opponentHealth: previous.opponentHealth,
    taskProgress: previous.taskProgress,
    obstaclesCleared: previous.obstaclesCleared,
    actionSerial: previous.actionSerial,
    lastAction: previous.lastAction,
    lastActionMs: previous.lastActionMs - previous.elapsedMs,
    lastTaskMs: previous.lastTaskMs - previous.elapsedMs,
    lastTaskCorrect: previous.lastTaskCorrect,
  };
}

function assistObstacle(
  state: AdventureState,
  nextObstacle: AdventureObstacle,
) {
  if (!state.assist) return state;
  const ahead = nextObstacle.distance - state.distance;
  if (ahead < -HALF_CONTACT || ahead > 9) return state;
  if (nextObstacle.kind === "block") {
    if (state.targetLane === nextObstacle.lane) {
      return applyAdventureAction(
        state,
        nextObstacle.lane === -1 ? "right" : "left",
      );
    }
  } else if (
    state.targetLane === nextObstacle.lane ||
    Math.abs(state.laneX - nextObstacle.lane * LANE_WIDTH) < 0.95
  ) {
    const speed = adventureSpeed(state);
    if (ahead / Math.max(1, speed) < 0.64) {
      const untilCenterMs = Math.max(0, (ahead / Math.max(1, speed)) * 1000);
      const contactHalfMs = (HALF_CONTACT / Math.max(1, speed)) * 1000;
      if (nextObstacle.kind === "hurdle") {
        // A voluntary early jump or slide must not block the assisted jump.
        // Keep an existing jump only when it covers both contact boundaries;
        // otherwise align its apex with the obstacle center exactly once.
        if (
          jumpHeight(state, state.elapsedMs + untilCenterMs - contactHalfMs) >
            0.73 &&
          jumpHeight(state, state.elapsedMs + untilCenterMs + contactHalfMs) >
            0.73
        )
          return state;
        const safe = applyAdventureAction(
          { ...state, jumpStartedMs: null, slideStartedMs: null },
          "jump",
        );
        return {
          ...safe,
          jumpStartedMs: state.elapsedMs + untilCenterMs - JUMP_MS / 2,
        };
      }
      if (isSliding(state, state.elapsedMs + untilCenterMs + contactHalfMs))
        return state;
      return applyAdventureAction(
        { ...state, jumpStartedMs: null, slideStartedMs: null },
        "slide",
      );
    }
  }
  return state;
}

/** Advance an active lease in fixed small sweeps. A low frame rate or a five
 * second server heartbeat cannot tunnel through an obstacle. Each call is
 * bounded to the same five-second connectivity lease as server gameplay. */
export function advanceAdventureRuntime(
  state: AdventureState,
  deltaMs: number,
): AdventureState {
  if (state.collision || !Number.isFinite(deltaMs) || deltaMs <= 0)
    return state;
  let next = { ...state };
  let remaining = Math.min(5000, deltaMs);
  while (remaining > 0 && !next.collision) {
    const dt = Math.min(25, remaining);
    remaining -= dt;
    const previousDistance = next.distance;
    const hazards = next.theme === "temple-chase" || next.theme === "racing";
    const index = Math.max(
      0,
      Math.floor(
        (next.distance - FIRST_HAZARD + HALF_CONTACT) / HAZARD_SPACING,
      ),
    );
    const candidates = hazards
      ? [obstacle(next, index), obstacle(next, index + 1)]
      : [];
    for (const candidate of candidates) next = assistObstacle(next, candidate);
    const speed = adventureSpeed(next);
    next.distance += (speed * dt) / 1000;
    next.rivalDistance += (6.15 * dt) / 1000;
    const targetX = next.targetLane * LANE_WIDTH;
    const movement = (6.6 * dt) / 1000;
    next.laneX += clamp(targetX - next.laneX, -movement, movement);
    next.lane = lane(next.laneX / LANE_WIDTH);
    next.elapsedMs += dt;
    next.guardianGap = Math.max(
      0,
      next.guardianStartGap +
        next.guardianRelief -
        (next.budgetMs
          ? (next.elapsedMs / next.budgetMs) * next.guardianStartGap
          : Math.min(5, next.elapsedMs / 30000)),
    );
    for (const candidate of candidates) {
      if (
        previousDistance > candidate.distance + HALF_CONTACT ||
        next.distance < candidate.distance - HALF_CONTACT
      )
        continue;
      const touchingLane =
        Math.abs(next.laneX - candidate.lane * LANE_WIDTH) < 0.83;
      const avoided =
        candidate.kind === "hurdle"
          ? jumpHeight(next) > 0.73
          : candidate.kind === "arch"
            ? isSliding(next)
            : false;
      if (touchingLane && !avoided) {
        next.collision = {
          id: candidate.id,
          kind: candidate.kind,
          distance: next.distance,
        };
        break;
      }
    }
    if (hazards)
      next.obstaclesCleared = Math.max(
        0,
        Math.floor(
          (next.distance - FIRST_HAZARD - HALF_CONTACT) / HAZARD_SPACING,
        ) + 1,
      );
  }
  return next;
}

/** Bounded renderer projection. Positions are in real world units; callers
 * move the avatar/camera through the track instead of pretending in-place
 * leg motion is forward progress. Reduced motion is applied by the renderer. */
export function adventureFrame(state: AdventureState) {
  const first = Math.max(
    0,
    Math.floor((state.distance - FIRST_HAZARD - 6) / HAZARD_SPACING),
  );
  const obstacles =
    state.theme === "temple-chase" || state.theme === "racing"
      ? Array.from({ length: 5 }, (_, i) => obstacle(state, first + i)).filter(
          (o) => o.z >= -8 && o.z <= 110,
        )
      : [];
  const jump = jumpHeight(state);
  const sliding = isSliding(state);
  const strikeAge = state.elapsedMs - state.lastActionMs;
  const strikePhase =
    state.lastAction === "strike" && strikeAge < STRIKE_MS
      ? Math.sin(Math.max(0, strikeAge / STRIKE_MS) * Math.PI)
      : 0;
  const taskAge = state.elapsedMs - state.lastTaskMs;
  const recoilPhase =
    state.lastTaskCorrect !== null && taskAge < 950
      ? Math.sin(Math.max(0, taskAge / 950) * Math.PI)
      : 0;
  return {
    distance: state.distance,
    speed: adventureSpeed(state),
    avatar: { x: state.laneX, y: jump, crouch: sliding ? 0.55 : 0 },
    animation: state.collision
      ? "fall"
      : jump > 0.01
        ? "jump"
        : sliding
          ? "slide"
          : strikePhase > 0
            ? "strike"
            : state.theme === "wrestling"
              ? "guard"
              : "run",
    guardianGap: state.guardianGap,
    rivalDistance: state.rivalDistance,
    obstacles,
    opponentHealth: state.opponentHealth,
    strikePhase,
    recoilPhase,
    taskProgress: state.taskProgress,
    collision: state.collision,
  };
}
