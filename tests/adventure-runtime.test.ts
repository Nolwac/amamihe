import assert from "node:assert/strict";
import { test } from "node:test";
import {
  advanceAdventureRuntime,
  adventureFrame,
  applyAdventureAction,
  applyAdventureTask,
  createAdventureRuntime,
  continueAdventureStep,
  type AdventureState,
} from "../shared/adventure-runtime.js";
import {
  applyGameAction,
  applyGameTask,
  newGame,
  tickGame,
} from "../server/gameplay.js";

function advance(state: AdventureState, ms: number, interval = 1000) {
  let next = state;
  for (let remaining = ms; remaining > 0; remaining -= interval)
    next = advanceAdventureRuntime(next, Math.min(interval, remaining));
  return next;
}

test("manual chase collides with a real swept hurdle independently of heartbeat FPS", () => {
  const initial = createAdventureRuntime("temple-chase", {
    assist: false,
    seed: 17,
  });
  const fine = advance(initial, 10000, 25);
  const coarse = advance(initial, 10000, 5000);
  assert.equal(fine.collision?.kind, "hurdle");
  assert.equal(fine.collision?.id, "hazard:17:0");
  assert.deepEqual(coarse, fine);
  assert.ok(fine.distance >= 35.15 && fine.distance <= 35.3);
  assert.ok(fine.elapsedMs < 10000);
  assert.equal(adventureFrame(fine).animation, "fall");
  assert.equal(adventureFrame(fine).speed, 0);
});

test("lane movement and an actual timed jump avoid the first hurdle", () => {
  let jumping = advance(
    createAdventureRuntime("temple-chase", { assist: false }),
    6900,
  );
  jumping = applyAdventureAction(jumping, "jump");
  jumping = advance(jumping, 1400);
  assert.equal(jumping.collision, null);
  assert.equal(jumping.obstaclesCleared, 1);
  let steering = advance(
    createAdventureRuntime("temple-chase", { assist: false }),
    6000,
  );
  steering = applyAdventureAction(steering, "left");
  steering = advance(steering, 2500);
  assert.equal(steering.collision, null);
  assert.equal(steering.lane, -1);
  assert.equal(steering.obstaclesCleared, 1);
  assert.equal(adventureFrame(steering).avatar.x, -1.65);
});

test("arches require a slide and solid blocks require a lane change", () => {
  const initial = createAdventureRuntime("temple-chase", { assist: false });
  const atArch = { ...initial, distance: 88 };
  assert.equal(advance(atArch, 1200).collision?.kind, "arch");
  assert.equal(
    advance(applyAdventureAction(atArch, "slide"), 1200).collision,
    null,
  );
  const atBlock: AdventureState = {
    ...initial,
    distance: 60,
    lane: 1,
    targetLane: 1,
    laneX: 1.65,
  };
  assert.equal(advance(atBlock, 1200).collision?.kind, "block");
  assert.equal(
    advance(applyAdventureAction(atBlock, "jump"), 1200).collision?.kind,
    "block",
  );
  assert.equal(
    advance(applyAdventureAction(atBlock, "left"), 1200).collision,
    null,
  );
});

test("assisted movement clears seeded hurdles, arches and blocks for a full section", () => {
  for (const theme of ["temple-chase", "racing"] as const)
    for (const seed of [0, 1, 2, 41]) {
      const state = advance(
        createAdventureRuntime(theme, { assist: true, seed, budgetMs: 120000 }),
        120000,
        5000,
      );
      assert.equal(state.collision, null, `${theme}/${seed}`);
      assert.ok(state.obstaclesCleared > 15);
      assert.ok(state.actionSerial > 0);
      assert.ok(state.distance > 500);
      assert.equal(state.guardianGap, 0);
      assert.ok(adventureFrame(state).obstacles.length <= 5);
    }
});

test("correct independent tasks grant bounded speed and chase relief while assistance cannot", () => {
  const initial = advance(createAdventureRuntime("temple-chase"), 1000);
  const good = applyAdventureTask(initial, {
    correct: true,
    independent: true,
  });
  const assisted = applyAdventureTask(initial, {
    correct: true,
    independent: false,
  });
  const incorrect = applyAdventureTask(initial, {
    correct: false,
    independent: false,
  });
  assert.ok(adventureFrame(good).speed > adventureFrame(initial).speed);
  assert.ok(good.guardianGap > initial.guardianGap);
  assert.equal(adventureFrame(assisted).speed, adventureFrame(initial).speed);
  assert.equal(adventureFrame(incorrect).speed, adventureFrame(initial).speed);
  const expired = advance(good, 6600);
  assert.equal(adventureFrame(expired).speed, adventureFrame(initial).speed);
});

test("free sparring punches animate without damage; validated tasks cause strikes and recoil", () => {
  const initial = createAdventureRuntime("wrestling", { taskCount: 2 });
  const practice = advance(applyAdventureAction(initial, "strike"), 250);
  assert.ok(adventureFrame(practice).strikePhase > 0.5);
  assert.equal(practice.opponentHealth, 100);
  assert.equal(practice.strikes, 0);
  const first = advance(
    applyAdventureTask(initial, { correct: true, independent: true }),
    250,
  );
  assert.equal(first.opponentHealth, 50);
  assert.equal(first.strikes, 1);
  assert.ok(adventureFrame(first).strikePhase > 0.5);
  assert.ok(adventureFrame(first).recoilPhase > 0.5);
  const second = applyAdventureTask(advance(first, 1000), {
    correct: true,
    independent: true,
  });
  assert.equal(second.opponentHealth, 0);
  assert.equal(second.taskProgress, 1);
  assert.equal(
    applyAdventureTask(initial, { correct: true, independent: false })
      .opponentHealth,
    100,
  );
});

test("workshop moves through stations; bounded simulation does not consume disconnected hours", () => {
  const initial = createAdventureRuntime("workshop");
  const normal = advanceAdventureRuntime(initial, 5000);
  const disconnected = advanceAdventureRuntime(initial, 3600000);
  assert.deepEqual(normal, disconnected);
  assert.ok(Math.abs(normal.distance - 9) < 1e-9);
  assert.equal(normal.elapsedMs, 5000);
  assert.deepEqual(advanceAdventureRuntime(initial, NaN), initial);
  assert.deepEqual(advanceAdventureRuntime(initial, -100), initial);
});

test("the server marks an authoritative encounter Game Over and cannot act through it", () => {
  let game = {
    ...newGame(120, 1, 0, { theme: "temple-chase", assist: false }),
    status: "active" as const,
    lastTick: 1000,
  };
  game = tickGame(game, 6000) as typeof game;
  game = tickGame(game, 9000) as typeof game;
  assert.equal(game.status, "game-over");
  assert.equal(game.adventure?.collision?.kind, "hurdle");
  assert.equal(game.elapsedMs, game.adventure?.elapsedMs);
  assert.deepEqual(applyGameAction(game, "jump", 10000), game);
  const retry = newGame(120, 1, 1, { theme: "temple-chase", assist: false });
  assert.equal(retry.adventure?.collision, null);
  assert.equal(retry.adventure?.distance, 0);
  assert.equal(retry.run, 1);
  assert.equal(retry.actionSequence, 0);
});

test("pause freezes physics and untimed accommodation retains assessment-independent assistance", () => {
  const active = {
    ...newGame(120, 0, 0, { theme: "temple-chase", assist: false }),
    status: "active" as const,
    lastTick: 1000,
  };
  assert.equal(active.adventure?.assist, true);
  assert.equal(
    newGame(0, 1, 0, { theme: "temple-chase", assist: false }).adventure
      ?.assist,
    true,
  );
  const stepped = tickGame(active, 6000);
  const paused = { ...stepped, status: "paused" as const };
  assert.deepEqual(tickGame(paused, 1000000), paused);
  assert.equal(stepped.elapsedMs, 5000);
  assert.equal(stepped.budgetMs, 0);
  const boosted = applyGameTask(stepped, { correct: true, independent: true });
  assert.ok(
    adventureFrame(boosted.adventure!).speed >
      adventureFrame(stepped.adventure!).speed,
  );
});

test("task boosts do not make automatic movement fail at any seeded obstacle", () => {
  for (const theme of ["temple-chase", "racing"] as const)
    for (let seed = 0; seed < 12; seed++) {
      let state = createAdventureRuntime(theme, { seed });
      for (let step = 0; step < 120; step++) {
        if (step % 7 === 0)
          state = applyAdventureTask(state, {
            correct: true,
            independent: true,
          });
        state = advanceAdventureRuntime(state, 1000);
        assert.equal(
          state.collision,
          null,
          `${theme}, seed=${seed}, second=${step}`,
        );
      }
    }
});

test("the authoritative deadline brings the temple guardian into actual contact", () => {
  let game = {
    ...newGame(15, 1, 0, { theme: "temple-chase" }),
    status: "active" as const,
    lastTick: 1000,
  };
  for (const now of [6000, 11000, 16000])
    game = tickGame(game, now) as typeof game;
  assert.equal(game.status, "game-over");
  assert.equal(game.adventure?.collision?.kind, "guardian");
  assert.equal(game.adventure?.guardianGap, 0);
});

test("question clocks restart while race position and a confirmed boost continue", () => {
  const previous = applyAdventureTask(
    advance(createAdventureRuntime("racing", { seed: 3, taskCount: 2 }), 4000),
    { correct: true, independent: true },
  );
  const game = newGame(120, 1, 0, {
    theme: "racing",
    carry: previous,
    taskCount: 2,
  });
  assert.equal(game.elapsedMs, 0);
  assert.equal(game.actionSequence, 0);
  assert.equal(game.adventure?.elapsedMs, 0);
  assert.equal(game.adventure?.distance, previous.distance);
  assert.equal(game.adventure?.rivalDistance, previous.rivalDistance);
  assert.equal(game.adventure?.seed, previous.seed);
  assert.equal(game.adventure?.taskProgress, 0.5);
  assert.equal(game.adventure?.boostUntilMs, 6500);
  const moving = advance(game.adventure!, 2500);
  assert.ok(moving.distance > moving.rivalDistance);
  assert.equal(moving.collision, null);
});

test("sparring health is retained through question checkpoints and a level change clears it", () => {
  const previous = applyAdventureTask(
    advance(createAdventureRuntime("wrestling", { taskCount: 3 }), 2000),
    { correct: true, independent: true },
  );
  const carried = continueAdventureStep(previous, { budgetMs: 120000 });
  assert.equal(carried.opponentHealth, previous.opponentHealth);
  assert.equal(carried.lastTaskMs, 0);
  assert.equal(carried.lastActionMs, 0);
  const nextTask = applyAdventureTask(advance(carried, 1500), {
    correct: true,
    independent: true,
  });
  const finalTask = applyAdventureTask(advance(nextTask, 1500), {
    correct: true,
    independent: true,
  });
  assert.equal(finalTask.opponentHealth, 0);
  assert.equal(finalTask.taskProgress, 1);
  assert.equal(
    newGame(120, 1, 0, { theme: "racing", carry: previous }).adventure
      ?.opponentHealth,
    100,
  );
});

test("assisted checkpoints at every point of an obstacle crossing remain safe", () => {
  for (let elapsed = 7000; elapsed < 8500; elapsed += 25) {
    const before = advance(createAdventureRuntime("temple-chase"), elapsed);
    const next = continueAdventureStep(
      applyAdventureTask(before, { correct: true, independent: true }),
      { budgetMs: 120000 },
    );
    const resumed = advance(next, 2000);
    assert.equal(resumed.collision, null, `checkpoint at ${elapsed}ms`);
  }
});

test("assistance safely replaces a voluntary slide before a hurdle and jump before an arch", () => {
  let atHurdle = advance(
    createAdventureRuntime("temple-chase", { assist: true, budgetMs: 0 }),
    6900,
  );
  atHurdle = applyAdventureAction(atHurdle, "slide");
  const safeHurdle = advance(atHurdle, 1800);
  assert.equal(safeHurdle.collision, null);
  assert.equal(safeHurdle.obstaclesCleared, 1);
  const atArch = applyAdventureAction(
    {
      ...createAdventureRuntime("temple-chase", { assist: true, budgetMs: 0 }),
      distance: 88,
    },
    "jump",
  );
  const safeArch = advance(atArch, 1400);
  assert.equal(safeArch.collision, null);
  assert.equal(safeArch.lastAction, "slide");
  assert.ok(
    safeArch.actionSerial <= 3,
    "automatic action must not restart every physics tick",
  );
  assert.equal(
    advance(applyAdventureAction({ ...atArch, assist: false }, "jump"), 1400)
      .collision?.kind,
    "arch",
  );
});

test("untimed assistance remains safe through alternating optional controls and boosts", () => {
  const inputs = ["left", "right", "jump", "slide"] as const;
  for (const theme of ["temple-chase", "racing"] as const)
    for (let seed = 0; seed < 6; seed++) {
      let state = createAdventureRuntime(theme, {
        seed,
        assist: true,
        budgetMs: 0,
      });
      for (let step = 0; step < 600; step++) {
        state = applyAdventureAction(state, inputs[step % inputs.length]);
        if (step % 20 === 0)
          state = applyAdventureTask(state, {
            correct: true,
            independent: true,
          });
        state = advanceAdventureRuntime(state, 200);
        assert.equal(
          state.collision,
          null,
          `${theme}, seed=${seed}, action=${step}`,
        );
      }
    }
});

test("late heartbeats stop physics exactly at the section deadline", () => {
  let game = {
    ...newGame(15, 1, 0, { theme: "temple-chase" }),
    status: "active" as const,
    lastTick: 1000,
  };
  for (const now of [6000, 11000, 15900])
    game = tickGame(game, now) as typeof game;
  assert.equal(game.elapsedMs, 14900);
  game = tickGame(game, 20900) as typeof game;
  assert.equal(game.status, "game-over");
  assert.equal(game.elapsedMs, 15000);
  assert.equal(game.adventure?.elapsedMs, 15000);
  assert.ok(Math.abs(game.adventure!.distance - 69) < 1e-8);
  assert.equal(game.adventure?.collision?.kind, "guardian");
});
