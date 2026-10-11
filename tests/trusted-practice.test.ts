import { test } from "node:test";
import assert from "node:assert/strict";
import { arithmetic, checkPractice } from "../server/trusted-practice.js";
test("trusted arithmetic checker recomputes fixtures without executing supplied JavaScript", () => {
  assert.equal(
    checkPractice("embedding-parameters", "return tokens * width;").status,
    "verified-bounded-practice",
  );
  assert.equal(
    checkPractice("average-loss", "return (a + b + c) / 3;").passed,
    3,
  );
  assert.equal(checkPractice("attention-score", "return a*b;").passed, 3);
  assert.equal(
    checkPractice("embedding-parameters", "return 16384;").passed,
    1,
  );
  for (const source of [
    "while(true) {}",
    "return process.env",
    "return fetch('https://evil.test')",
    "return constructor.constructor('return process')()",
    "return 1/0",
    "return tokens ** 99999999",
  ])
    assert.equal(
      checkPractice("embedding-parameters", source).status,
      "practice-needs-revision",
    );
  assert.throws(() => arithmetic("(".repeat(30) + "1" + ")".repeat(30), {}));
});
