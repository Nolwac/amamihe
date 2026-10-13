import type { ClassificationProvider, SelectionInput } from "./assessment.js";
import {
  DECISION_MODEL,
  DECISION_IDENTITY,
  DECISION_MODEL_DIGEST,
  type DecisionSelection,
} from "../shared/decision.js";
export {
  DECISION_MODEL,
  DECISION_IDENTITY,
  DECISION_MODEL_DIGEST,
} from "../shared/decision.js";

export function validProbabilities(value: unknown, labels: string[]): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const vector = value as Record<string, number>;
  return (
    Object.keys(vector).length === labels.length &&
    labels.every(
      (label) =>
        Object.hasOwn(vector, label) &&
        Number.isFinite(vector[label]) &&
        vector[label] >= 0 &&
        vector[label] <= 1,
    ) &&
    Math.abs(Object.values(vector).reduce((a, b) => a + b, 0) - 1) <= 0.001
  );
}
export type DecisionStatus = {
  mode: "ollama";
  ready: boolean;
  model: string;
  modelDigest?: string;
  reason: string;
};

/** Local typed decisions. There is no hosted inference or alternate provider. */
export class OllamaProvider implements ClassificationProvider {
  readonly identity = DECISION_IDENTITY;
  readonly timeoutMs: number;
  private base: string;
  private modelDigest = "";
  private lastProbe = 0;
  private probeWork?: Promise<DecisionStatus>;
  private current: DecisionStatus = {
    mode: "ollama",
    ready: false,
    model: DECISION_MODEL,
    reason: "The local learning guide is starting.",
  };
  constructor(
    base = "http://127.0.0.1:11434",
    private request: typeof fetch = fetch,
    timeoutMs = 90000,
  ) {
    const url = new URL(base);
    if (
      url.protocol !== "http:" ||
      !["127.0.0.1", "localhost", "[::1]", "ollama"].includes(url.hostname) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== "/"
    )
      throw new Error(
        "OLLAMA_BASE_URL must address a private local Ollama service.",
      );
    if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 120000)
      throw new Error("Invalid local decision timeout.");
    this.base = url.origin;
    this.timeoutMs = timeoutMs;
  }
  private async metadata() {
    const response = await this.request(this.base + "/api/tags", {
      signal: AbortSignal.timeout(5000),
      redirect: "error",
    });
    if (!response.ok) throw new Error("Local Ollama is unavailable.");
    const data = await response.json();
    const model = data.models?.find(
      (m: { name?: string }) => m.name === DECISION_MODEL,
    );
    if (!model || !/^(sha256:)?[a-f0-9]{64}$/.test(model.digest))
      throw new Error("Pull tev1:0.8b into the local Ollama service.");
    const digest = "sha256:" + model.digest.replace(/^sha256:/, "");
    if (digest !== DECISION_MODEL_DIGEST) {
      this.modelDigest = "";
      throw new Error(
        "The local tev1 weights differ from this release's verified model manifest.",
      );
    }
    this.modelDigest = digest;
  }
  private async decide(state: unknown, questions: Record<string, unknown>) {
    if (!this.modelDigest) await this.metadata();
    const body = JSON.stringify({
      model: DECISION_MODEL,
      state,
      questions,
      keep_alive: "30m",
    });
    // Tev1 is trained on short inputs. Long teaching resources are never sent.
    if (Buffer.byteLength(body) > 6000)
      throw new Error("Local decision context exceeds its short-input budget.");
    const response = await this.request(this.base + "/v1/systemone", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      signal: AbortSignal.timeout(this.timeoutMs),
      redirect: "error",
    });
    if (!response.ok)
      throw new Error(
        "The local learning guide could not complete this decision. Retry when it is ready.",
      );
    const text = await response.text();
    if (Buffer.byteLength(text) > 65536)
      throw new Error("Local decision response exceeds its budget.");
    const result = JSON.parse(text);
    if (
      result.model !== DECISION_MODEL ||
      !result.answers ||
      typeof result.answers !== "object"
    )
      throw new Error("Unrecognized local decision provenance.");
    return result.answers;
  }
  private choice(answer: unknown, labels: string[]) {
    const a = answer as {
      type?: string;
      choice?: string;
      probabilities?: Record<string, number>;
      confidence?: number;
    };
    if (
      !a ||
      a.type !== "choice" ||
      !labels.includes(a.choice ?? "") ||
      !Number.isFinite(a.confidence) ||
      a.confidence! < 0 ||
      a.confidence! > 1 ||
      !validProbabilities(a.probabilities, labels)
    )
      throw new Error("Malformed local decision.");
    const maximum = Math.max(...Object.values(a.probabilities!));
    if (a.probabilities![a.choice!] < maximum - 0.00001)
      throw new Error("Local choice disagrees with its probabilities.");
    return {
      choice: a.choice!,
      confidence: a.confidence!,
      probabilities: a.probabilities!,
    };
  }
  async status(force = false): Promise<DecisionStatus> {
    if (!force && Date.now() - this.lastProbe < 15000) return this.current;
    if (this.probeWork) return this.probeWork;
    this.probeWork = (async () => {
      try {
        const response = await this.request(this.base + "/api/version", {
          signal: AbortSignal.timeout(5000),
          redirect: "error",
        });
        const { version } = await response.json();
        const [major, minor] = String(version).split(".").map(Number);
        if (
          !response.ok ||
          !Number.isFinite(major) ||
          !Number.isFinite(minor) ||
          (major === 0 && minor < 35)
        )
          throw new Error(
            "Ollama 0.35 or newer is required for tev1 decisions.",
          );
        await this.metadata();
        if (force || !this.current.ready) {
          const answers = await this.decide("The message is: Hello.", {
            available: {
              type: "noul",
              instructions: "Does the message contain a greeting?",
            },
          });
          if (
            answers.available?.type !== "noul" ||
            !Number.isFinite(answers.available.noul) ||
            answers.available.noul < 0 ||
            answers.available.noul > 1
          )
            throw new Error(
              "The local typed decision endpoint is unavailable.",
            );
        }
        this.current = {
          mode: "ollama",
          ready: true,
          model: DECISION_MODEL,
          modelDigest: this.modelDigest,
          reason:
            "Local tev1 typed inference verified; no API key is required.",
        };
      } catch (error) {
        this.current = {
          mode: "ollama",
          ready: false,
          model: DECISION_MODEL,
          reason:
            error instanceof Error
              ? error.message
              : "The local learning guide is unavailable.",
        };
      } finally {
        this.lastProbe = Date.now();
        this.probeWork = undefined;
      }
      return this.current;
    })();
    return this.probeWork;
  }
  async grade(input: Parameters<ClassificationProvider["grade"]>[0]) {
    const { evidence, criterionId } = input;
    const state = `The learner ${evidence.correct ? "gave the correct answer" : "gave an incorrect answer"}, according to the published answer key. ${evidence.assisted ? "The learner used help or had already seen the solution." : "No help was used and the solution had not been revealed."}`;
    const labels = ["independent", "assisted", "incorrect", "uncertain"];
    const answers = await this.decide(state, {
      evidence: {
        type: "choice",
        instructions:
          "Which learning evidence category describes this response?",
        criteria: {
          independent: "Correct answer without help.",
          assisted: "Correct answer with help or prior solution exposure.",
          incorrect: "Incorrect answer.",
          uncertain: "Correctness or assistance is not known.",
        },
      },
    });
    const a = this.choice(answers.evidence, labels);
    return {
      deliveryId: evidence.delivery_id,
      modelDigest: this.modelDigest,
      probabilities: a.probabilities,
      criterionId,
      score: a.choice === "independent" || a.choice === "assisted" ? 1 : 0,
      confidence: a.confidence,
      tags: a.choice === "independent" ? [] : [a.choice],
    };
  }
  async select(input: SelectionInput): Promise<DecisionSelection> {
    if (
      !input.candidates.length ||
      input.candidates.length > 50 ||
      new Set(input.candidates.map((c) => c.id)).size !==
        input.candidates.length
    )
      throw new Error("Invalid authored decision candidates.");
    // Hierarchical selection keeps every request short even for a 50-level course.
    if (input.candidates.length > 8) {
      const winners: SelectionInput["candidates"] = [];
      for (let i = 0; i < input.candidates.length; i += 8) {
        const group = input.candidates.slice(i, i + 8);
        const selected = await this.select({ ...input, candidates: group });
        winners.push(group.find((c) => c.id === selected.choice)!);
      }
      return this.select({ ...input, candidates: winners });
    }
    const started = Date.now();
    if (input.candidates.length === 1) {
      const candidate = input.candidates[0];
      const answers = await this.decide(
        {
          evidence: input.state,
          approvedActivity: candidate.description.slice(0, 200),
          eligibility:
            "The server has verified that this activity is permitted and its prerequisites are satisfied.",
        },
        {
          next: {
            type: "noul",
            instructions:
              "Is the listed activity an eligible approved learning activity that the learner may continue with?",
          },
        },
      );
      const a = answers.next;
      if (
        a?.type !== "noul" ||
        !Number.isFinite(a.noul) ||
        a.noul < 0 ||
        a.noul > 1
      )
        throw new Error("Malformed local approval decision.");
      if (a.noul < 0.5)
        throw new Error(
          "The local learning guide has not approved this activity yet. Your checkpoint is saved.",
        );
      return {
        kind: input.kind,
        primitive: "noul",
        approvalProbability: a.noul,
        provider: this.identity,
        model: DECISION_MODEL,
        modelDigest: this.modelDigest,
        choice: candidate.id,
        probabilities: { [candidate.id]: a.noul, _deferred: 1 - a.noul },
        confidence: Math.abs(2 * a.noul - 1),
        durationMs: Date.now() - started,
      };
    }
    const criteria = Object.fromEntries(
      input.candidates.map((c) => [c.id, c.description.slice(0, 200)]),
    );
    // All candidates were filtered by authoritative prerequisite/evidence rules.
    const answers = await this.decide(input.state, {
      next: { type: "choice", instructions: input.instructions, criteria },
    });
    const a = this.choice(answers.next, Object.keys(criteria));
    return {
      kind: input.kind,
      primitive: "choice",
      provider: this.identity,
      model: DECISION_MODEL,
      modelDigest: this.modelDigest,
      ...a,
      durationMs: Date.now() - started,
    };
  }
  async route(input: Parameters<ClassificationProvider["route"]>[0]) {
    if (!input.eligible.length) return { nextLevelId: null, taskIds: [] };
    const decision = await this.select({
      kind: "level",
      state: {
        independentCriteria: input.criteria.map((c) => ({
          id: c.id,
          independent: c.independent,
        })),
      },
      instructions:
        "Choose the next eligible published learning level. All listed prerequisites have been verified. Prefer the level that builds on these demonstrated concepts. Select an authored option; do not invent a level.",
      candidates: input.eligible.map((l) => ({
        id: l.id,
        description: l.title ?? `Continue with authored level ${l.id}.`,
      })),
    });
    const level = input.eligible.find((l) => l.id === decision.choice)!;
    return { nextLevelId: level.id, taskIds: level.taskIds, decision };
  }
}
export function decisionConfiguration(env: NodeJS.ProcessEnv = process.env) {
  const provider = new OllamaProvider(
    env.OLLAMA_BASE_URL || "http://127.0.0.1:11434",
    fetch,
    Number(env.OLLAMA_DECISION_TIMEOUT_MS || "90000"),
  );
  return { provider, status: () => provider.status() };
}
