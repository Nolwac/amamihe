import { test } from "node:test";
import assert from "node:assert/strict";
import {
  OllamaProvider,
  decisionConfiguration,
  DECISION_MODEL,
  DECISION_MODEL_DIGEST,
} from "../server/decision-provider.js";

const gradeInput = {
  evidence: {
    delivery_id: "d1",
    question_id: "q1",
    retry: false,
    correct: true,
    assisted: false,
    answer: 0,
    elapsed_ms: 100,
  },
  criterionId: "q1",
  rubric: "A reviewed criterion.",
};
function transport(
  answer: unknown,
  observe?: (url: string, options?: RequestInit) => void,
): typeof fetch {
  return async (url, options) => {
    observe?.(String(url), options);
    if (String(url).endsWith("/api/tags"))
      return Response.json({
        models: [
          {
            name: DECISION_MODEL,
            digest: DECISION_MODEL_DIGEST.replace("sha256:", ""),
          },
        ],
      });
    if (String(url).endsWith("/api/version"))
      return Response.json({ version: "0.40.3" });
    return Response.json({ model: DECISION_MODEL, answers: answer });
  };
}
test("local tev1 is the only default provider and requires no credentials", () => {
  assert.equal(decisionConfiguration({}).provider.identity, "ollama:tev1:0.8b");
  assert.throws(() => new OllamaProvider("https://public.example"));
  assert.throws(() => new OllamaProvider("http://user:pass@localhost:11434"));
  assert.throws(() => new OllamaProvider("http://localhost:11434/redirect"));
});
test("typed local evidence uses systemone without authentication and records concentration", async () => {
  let posted = false;
  const p = new OllamaProvider(
    undefined,
    transport(
      {
        evidence: {
          type: "choice",
          choice: "independent",
          probabilities: {
            independent: 0.4,
            assisted: 0.1,
            incorrect: 0.3,
            uncertain: 0.2,
          },
          confidence: 0.06,
        },
      },
      (url, options) => {
        if (!url.endsWith("/v1/systemone")) return;
        posted = true;
        assert.equal(options?.method, "POST");
        assert.deepEqual(options?.headers, {
          "Content-Type": "application/json",
        });
        const body = JSON.parse(String(options?.body));
        assert.equal(body.model, "tev1:0.8b");
        assert.equal(body.questions.evidence.type, "choice");
        assert.equal(body.keep_alive, "30m");
      },
    ),
  );
  const grade = await p.grade(gradeInput);
  assert.equal(posted, true);
  assert.equal(grade.score, 1);
  assert.equal(grade.confidence, 0.06);
});
test("wrong provenance, unknown labels and malformed probability distributions are rejected", async () => {
  for (const probabilities of [
    { independent: 2, assisted: 0, incorrect: 0, uncertain: 0 },
    { independent: 0.1, assisted: 0.1, incorrect: 0.1, uncertain: 0.1 },
    { independent: 1 },
  ]) {
    await assert.rejects(() =>
      new OllamaProvider(
        undefined,
        transport({
          evidence: {
            type: "choice",
            choice: "independent",
            probabilities,
            confidence: 1,
          },
        }),
      ).grade(gradeInput),
    );
  }
  await assert.rejects(() =>
    new OllamaProvider(
      undefined,
      transport({
        evidence: {
          type: "choice",
          choice: "invented",
          probabilities: {
            independent: 1,
            assisted: 0,
            incorrect: 0,
            uncertain: 0,
          },
          confidence: 1,
        },
      }),
    ).grade(gradeInput),
  );
  const changed = new OllamaProvider(undefined, async () =>
    Response.json({
      models: [{ name: DECISION_MODEL, digest: "0".repeat(64) }],
    }),
  );
  await assert.rejects(() => changed.grade(gradeInput), /weights differ/);
});
test("a real choice selects an eligible authored route and rejects refusal", async () => {
  const p = new OllamaProvider(
    undefined,
    transport({
      next: {
        type: "choice",
        choice: "second",
        probabilities: { first: 0.2, second: 0.8 },
        confidence: 0.3,
      },
    }),
  );
  const route = await p.route({
    criteria: [],
    eligible: [
      { id: "first", taskIds: ["q1"] },
      { id: "second", taskIds: ["q2"] },
    ],
  });
  assert.equal(route.nextLevelId, "second");
  assert.deepEqual(route.taskIds, ["q2"]);
  assert.equal(route.decision?.modelDigest, DECISION_MODEL_DIGEST);
  const refusing = new OllamaProvider(
    undefined,
    transport({
      next: {
        type: "noul",
        noul: 0.1,
      },
    }),
  );
  await assert.rejects(
    () =>
      refusing.route({
        criteria: [],
        eligible: [{ id: "first", taskIds: ["q1"] }],
      }),
    /not approved/,
  );
});
test("readiness requires a successful typed inference and an unavailable service stays unavailable", async () => {
  const p = new OllamaProvider(
    undefined,
    transport({ available: { type: "noul", noul: 0.9 } }),
  );
  const status = await p.status();
  assert.equal(status.ready, true);
  assert.equal(status.modelDigest, DECISION_MODEL_DIGEST);
  const missing = new OllamaProvider(undefined, async () => {
    throw new Error("Local service stopped");
  });
  assert.equal((await missing.status()).ready, false);
  await assert.rejects(() => missing.grade(gradeInput), /stopped/);
});
