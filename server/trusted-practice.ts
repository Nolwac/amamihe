export type PracticeCheck =
  "embedding-parameters" | "average-loss" | "attention-score";
/** Restricted arithmetic interpreter: no eval, objects, calls, loops or imports. */
export function arithmetic(
  code: string,
  variables: Record<string, number>,
): number {
  const source = code
    .trim()
    .replace(/^return\s+/, "")
    .replace(/;$/, "")
    .trim();
  if (!source || source.length > 1000)
    throw new Error("Use one bounded arithmetic return expression.");
  const tokens =
    source.match(/\d+(?:\.\d+)?|[a-zA-Z_][a-zA-Z_0-9]*|[()+\-*/]/g) ?? [];
  if (tokens.join("") !== source.replace(/\s/g, "") || tokens.length > 100)
    throw new Error("Unsupported expression.");
  let at = 0;
  function atom(depth: number): number {
    if (depth > 20) throw new Error("Expression too deep.");
    const token = tokens[at++];
    if (token === "-") return -atom(depth + 1);
    if (token === "+") return atom(depth + 1);
    if (token === "(") {
      const value = sum(depth + 1);
      if (tokens[at++] !== ")") throw new Error("Missing bracket.");
      return value;
    }
    if (/^\d/.test(token || "")) return Number(token);
    if (Object.hasOwn(variables, token || "")) return variables[token];
    throw new Error("Unknown variable.");
  }
  function product(depth: number): number {
    let value = atom(depth);
    while (tokens[at] === "*" || tokens[at] === "/") {
      const op = tokens[at++],
        right = atom(depth);
      value = op === "*" ? value * right : value / right;
    }
    return value;
  }
  function sum(depth: number): number {
    let value = product(depth);
    while (tokens[at] === "+" || tokens[at] === "-") {
      const op = tokens[at++],
        right = product(depth);
      value = op === "+" ? value + right : value - right;
    }
    return value;
  }
  const value = sum(0);
  if (at !== tokens.length || !Number.isFinite(value) || Math.abs(value) > 1e12)
    throw new Error("Invalid or unbounded result.");
  return value;
}
export function checkPractice(check: PracticeCheck, code: string) {
  const inputs = [
    { tokens: 256, width: 64, a: 2, b: 4, c: 6 },
    { tokens: 128, width: 32, a: 1.5, b: 2.5, c: 5 },
    { tokens: 17, width: 13, a: 3, b: -1, c: 4 },
  ];
  if (
    !["embedding-parameters", "average-loss", "attention-score"].includes(check)
  )
    throw new Error("Unknown authored check.");
  const expected = (v: (typeof inputs)[number]) =>
    check === "embedding-parameters"
      ? v.tokens * v.width
      : check === "average-loss"
        ? (v.a + v.b + v.c) / 3
        : v.a * v.b;
  let passed = 0;
  try {
    for (const v of inputs)
      if (Math.abs(arithmetic(code, v) - expected(v)) < 1e-8) passed++;
  } catch {
    /* Unsupported code fails without execution. */
  }
  return {
    status:
      passed === inputs.length
        ? "verified-bounded-practice"
        : "practice-needs-revision",
    check,
    passed,
    total: inputs.length,
    engine: "arithmetic-v1",
    limitations:
      "Verifies only this arithmetic task; no training, notebook execution or course mastery is certified.",
  };
}
