import {
  circuitOutput,
  type WorldAction,
  type WorldEvidence,
  type WorldTask,
} from "../shared/world-task";
import { useAccess } from "./Access";
export default function WorldTaskControls({
  task,
  evidence,
  onAction,
  disabled,
}: {
  task: WorldTask;
  evidence: WorldEvidence;
  onAction: (a: WorldAction) => void;
  disabled: boolean;
}) {
  const { t } = useAccess();
  return (
    <section
      className="world-task-controls"
      aria-label="Playable learning controls"
    >
      <p>
        {task.kind === "fraction-bridge"
          ? "Choose beams in the world or use these controls. Undo and test your construction."
          : "Operate the world switches or use these controls. The test lamp shows the current signal; accepted missions earn progress."}
      </p>
      {task.kind === "fraction-bridge" &&
      evidence.kind === "fraction-bridge" ? (
        <>
          <div className="world-piece-buttons">
            {task.pieces.map((units) => (
              <button
                key={units}
                className="course-secondary"
                disabled={
                  disabled ||
                  evidence.pieces.reduce((a, b) => a + b, 0) + units > 8
                }
                onClick={() => onAction({ kind: "add-piece", units })}
              >
                Add {units}/8 beam
              </button>
            ))}
          </div>
          <p aria-live="polite">
            Built span: {evidence.pieces.reduce((a, b) => a + b, 0)}/8 ·{" "}
            {evidence.pieces.length} beams
          </p>
          <button
            className="course-secondary"
            disabled={disabled || !evidence.pieces.length}
            onClick={() => onAction({ kind: "remove-piece" })}
          >
            {t("Undo last beam")}
          </button>
        </>
      ) : task.kind === "circuit" && evidence.kind === "circuit" ? (
        <>
          <div className="world-piece-buttons">
            {([0, 1] as const).map((index) => (
              <button
                key={index}
                className="course-secondary"
                disabled={
                  disabled ||
                  (index === 0 ? task.fixed?.a : task.fixed?.b) !== undefined
                }
                aria-pressed={evidence.switches[index]}
                onClick={() => onAction({ kind: "switch", index })}
              >
                Relay {index === 0 ? "A" : "B"}:{" "}
                {evidence.switches[index] ? "on" : "off"}
                {(index === 0 ? task.fixed?.a : task.fixed?.b) !== undefined
                  ? " · fixed"
                  : ""}
              </button>
            ))}
          </div>
          <p aria-live="polite">
            {task.gate.toUpperCase()} test signal:{" "}
            {circuitOutput(task.gate, evidence.switches) ? "on" : "off"} ·
            mission goal: {task.goal ? "power on" : "power off"}
          </p>
        </>
      ) : null}
      <button
        className="course-secondary"
        disabled={disabled}
        onClick={() => onAction({ kind: "reset" })}
      >
        {t("Reset experiment")}
      </button>
    </section>
  );
}
