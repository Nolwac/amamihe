import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validPracticeEvidence,
  notebookDocument,
  approvedEmbed,
} from "../shared/practice.js";
test("practice artifacts are bounded and tool-specific; imported training is not mastery", () => {
  assert.equal(
    validPracticeEvidence("javascript", { code: "return 4", output: "4" }),
    true,
  );
  assert.equal(
    validPracticeEvidence("javascript", {
      code: "x".repeat(4001),
      output: "4",
    }),
    false,
  );
  assert.equal(
    validPracticeEvidence("drawing", {
      points: [
        [0.2, 0.4],
        [1, 1],
      ],
    }),
    true,
  );
  assert.equal(
    validPracticeEvidence("drawing", { points: [[0, Infinity]] }),
    false,
  );
  assert.equal(
    validPracticeEvidence("drawing", { points: Array(501).fill([0, 0]) }),
    false,
  );
  assert.equal(
    validPracticeEvidence("notebook", {
      parameters: 1040768,
      steps: 20,
      heldoutLoss: 3.8,
      checkpoint: "story-model.pt",
    }),
    true,
  );
  assert.equal(
    validPracticeEvidence("notebook", {
      parameters: 1000000,
      steps: 20,
      heldoutLoss: 3.8,
      checkpoint: "x",
    }),
    false,
  );
  assert.equal(notebookDocument("print(4)").cells[1].cell_type, "code");
});
test("only allowlisted video embeds can execute externally", () => {
  assert.equal(
    approvedEmbed("https://www.youtube-nocookie.com/embed/abcdefghijk"),
    "https://www.youtube-nocookie.com/embed/abcdefghijk",
  );
  for (const u of [
    "javascript:alert(1)",
    "http://www.youtube-nocookie.com/embed/abcdefghijk",
    "https://evil.test/embed/abcdefghijk",
    "https://www.youtube-nocookie.com.evil.test/embed/abcdefghijk",
    "https://user:pw@www.youtube-nocookie.com/embed/abcdefghijk",
  ])
    assert.equal(approvedEmbed(u), null);
});
