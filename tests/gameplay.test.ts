import assert from "node:assert/strict";
import { test } from "node:test";
import { newGame, tickGame } from "../server/gameplay.js";
test("deadline equality causes Game Over and pause/reconnection gaps are bounded", () => {
  let game = { ...newGame(15), status: "active" as const, lastTick: 1000 };
  game = tickGame(game, 6000) as typeof game;
  game = tickGame(game, 11000) as typeof game;
  assert.equal(tickGame(game, 15999).status, "active");
  assert.equal(tickGame(game, 16000).status, "game-over");
  const reconnect = tickGame(
    { ...newGame(15), status: "active", lastTick: 1000 },
    1000000,
  );
  assert.equal(reconnect.elapsedMs, 5000);
  assert.equal(reconnect.status, "active");
  const paused = tickGame({ ...reconnect, status: "paused" }, 2000000);
  assert.equal(paused.elapsedMs, 5000);
});
test("timer accommodations preserve the game contract", () => {
  assert.equal(newGame(15, 2).budgetMs, 30000);
  assert.equal(
    tickGame({ ...newGame(15, 0), status: "active", lastTick: 0 }, 5000).status,
    "active",
  );
  assert.throws(() => newGame(15, 3));
});
