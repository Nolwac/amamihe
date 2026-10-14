export type FractionTask = {
  kind: "fraction-bridge";
  divisions: 8;
  targets: { numerator: number; denominator: number }[];
  pieces: number[];
};
export type CircuitTask = {
  kind: "circuit";
  gate: "and" | "or" | "xor";
  goal: boolean;
  initial: [boolean, boolean];
  fixed?: { a?: boolean; b?: boolean };
};
export type WorldTask = FractionTask | CircuitTask;
export type WorldEvidence =
  | { kind: "fraction-bridge"; pieces: number[] }
  | { kind: "circuit"; switches: [boolean, boolean] };
export type WorldAction =
  | { kind: "add-piece"; units: number }
  | { kind: "remove-piece" }
  | { kind: "reset" }
  | { kind: "switch"; index: 0 | 1 };
const object = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);
const keys = (v: Record<string, unknown>, allowed: string[]) =>
  Object.keys(v).every((k) => allowed.includes(k));
export function circuitOutput(
  gate: CircuitTask["gate"],
  switches: readonly boolean[],
) {
  return gate === "and"
    ? switches[0] && switches[1]
    : gate === "or"
      ? switches[0] || switches[1]
      : switches[0] !== switches[1];
}
export function emptyWorldEvidence(task: WorldTask): WorldEvidence {
  return task.kind === "fraction-bridge"
    ? { kind: task.kind, pieces: [] }
    : { kind: task.kind, switches: [...task.initial] };
}
export function validateWorldTask(
  value: unknown,
  options: readonly unknown[],
  answer: unknown,
): string | undefined {
  if (!object(value)) return "Provide an authored world-task object.";
  if (value.kind === "fraction-bridge") {
    if (
      !keys(value, ["kind", "divisions", "targets", "pieces"]) ||
      value.divisions !== 8 ||
      !Array.isArray(value.targets) ||
      value.targets.length < 1 ||
      value.targets.length > 2 ||
      !Array.isArray(value.pieces) ||
      value.pieces.length < 1 ||
      value.pieces.length > 4
    )
      return "Use an eight-part bridge with one or two target fractions and a bounded piece tray.";
    if (
      value.pieces.some(
        (p) => !Number.isInteger(p) || Number(p) < 1 || Number(p) > 8,
      ) ||
      new Set(value.pieces).size !== value.pieces.length
    )
      return "Use distinct whole piece lengths between one and eight eighths.";
    let units = 0;
    for (const target of value.targets) {
      if (
        !object(target) ||
        !keys(target, ["numerator", "denominator"]) ||
        !Number.isInteger(target.denominator) ||
        ![1, 2, 4, 8].includes(Number(target.denominator)) ||
        !Number.isInteger(target.numerator) ||
        Number(target.numerator) < 1 ||
        Number(target.numerator) > Number(target.denominator)
      )
        return "Use positive fractions with denominators one, two, four or eight.";
      units += Number(target.numerator) * (8 / Number(target.denominator));
    }
    if (
      units > 8 ||
      options.length !== 8 ||
      options.some((o, i) => o !== `${i + 1}/8`) ||
      answer !== units - 1
    )
      return "The authored answer must equal the target span in eighths; use the eight fraction options in order.";
    const reachable = new Set([0]);
    for (let i = 1; i <= 8; i++)
      if (value.pieces.some((p) => reachable.has(i - Number(p))))
        reachable.add(i);
    if (!reachable.has(units))
      return "The piece tray cannot construct the requested span.";
  } else if (value.kind === "circuit") {
    if (
      !keys(value, ["kind", "gate", "goal", "initial", "fixed"]) ||
      typeof value.gate !== "string" ||
      !["and", "or", "xor"].includes(value.gate) ||
      typeof value.goal !== "boolean" ||
      !Array.isArray(value.initial) ||
      value.initial.length !== 2 ||
      value.initial.some((v) => typeof v !== "boolean")
    )
      return "Choose an authored AND, OR or XOR circuit with two boolean switches and a power goal.";
    const fixed = value.fixed === undefined ? {} : value.fixed;
    if (
      !object(fixed) ||
      !keys(fixed, ["a", "b"]) ||
      Object.values(fixed).some((v) => typeof v !== "boolean")
    )
      return "Fixed relay inputs must be boolean A/B values.";
    if (
      (fixed.a !== undefined && fixed.a !== value.initial[0]) ||
      (fixed.b !== undefined && fixed.b !== value.initial[1])
    )
      return "Initial switches must respect fixed relay inputs.";
    if (
      options.length !== 4 ||
      options.some(
        (o, i) => o !== ["Both off", "Only A on", "Only B on", "Both on"][i],
      )
    )
      return "Use the four authored switch configurations in order.";
    const valid: number[] = [];
    for (let mask = 0; mask < 4; mask++) {
      const switches = [Boolean(mask & 1), Boolean(mask & 2)];
      if (
        (fixed.a === undefined || fixed.a === switches[0]) &&
        (fixed.b === undefined || fixed.b === switches[1]) &&
        circuitOutput(value.gate as CircuitTask["gate"], switches) ===
          value.goal
      )
        valid.push(mask);
    }
    if (valid.length !== 1 || valid[0] !== answer)
      return "The circuit goal and fixed relays must have exactly one valid authored answer.";
  } else return "Choose a supported playable learning task.";
}
/** Validate the actual arrangement before mapping it to the authored answer bank. */
export function worldTaskAnswer(
  task: WorldTask,
  evidence: unknown,
): number | null {
  if (!object(evidence) || evidence.kind !== task.kind) return null;
  if (task.kind === "fraction-bridge") {
    if (
      !keys(evidence, ["kind", "pieces"]) ||
      !Array.isArray(evidence.pieces) ||
      evidence.pieces.length > 16 ||
      evidence.pieces.some(
        (p) => !Number.isInteger(p) || !task.pieces.includes(Number(p)),
      )
    )
      return null;
    const units = evidence.pieces.reduce((sum, p) => sum + Number(p), 0);
    return units >= 1 && units <= task.divisions ? units - 1 : null;
  }
  if (
    !keys(evidence, ["kind", "switches"]) ||
    !Array.isArray(evidence.switches) ||
    evidence.switches.length !== 2 ||
    evidence.switches.some((v) => typeof v !== "boolean")
  )
    return null;
  const [a, b] = evidence.switches;
  if (
    (task.fixed?.a !== undefined && task.fixed.a !== a) ||
    (task.fixed?.b !== undefined && task.fixed.b !== b)
  )
    return null;
  return Number(a) + Number(b) * 2;
}
export function changeWorldEvidence(
  task: WorldTask,
  current: WorldEvidence | undefined,
  action: WorldAction,
): WorldEvidence {
  const value =
    current?.kind === task.kind ? current : emptyWorldEvidence(task);
  if (action.kind === "reset") return emptyWorldEvidence(task);
  if (value.kind === "fraction-bridge" && task.kind === "fraction-bridge") {
    if (action.kind === "remove-piece")
      return { ...value, pieces: value.pieces.slice(0, -1) };
    if (
      action.kind === "add-piece" &&
      task.pieces.includes(action.units) &&
      value.pieces.reduce((a, b) => a + b, 0) + action.units <= task.divisions
    )
      return { ...value, pieces: [...value.pieces, action.units] };
  }
  if (
    value.kind === "circuit" &&
    task.kind === "circuit" &&
    action.kind === "switch"
  ) {
    if ((action.index === 0 ? task.fixed?.a : task.fixed?.b) !== undefined)
      return value;
    const switches: [boolean, boolean] = [...value.switches];
    switches[action.index] = !switches[action.index];
    return { ...value, switches };
  }
  return value;
}
