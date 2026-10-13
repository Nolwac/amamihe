import { useRef, useState } from "react";
import { LEARNING_ROLES } from "../shared/learning-journey";
import type { LearningProgress } from "../shared/course";

export default function LearningJourney({
  progress,
  onActivity,
  onClose,
  onResource,
}: {
  progress: LearningProgress;
  onActivity: (
    activity: string,
    data?: Record<string, unknown>,
  ) => Promise<string | undefined>;
  onClose: () => void;
  onResource: (id: string) => void;
}) {
  const journey = progress.journey!;
  const panel = useRef<HTMLElement>(null);
  const nextRole = progress.selection?.category?.choice;
  const [goal, setGoal] = useState(journey.goal),
    [reasoning, setReasoning] = useState(journey.reasoning),
    [reflection, setReflection] = useState(journey.reflection),
    [answer, setAnswer] = useState<number>(),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(activity: string, data?: Record<string, unknown>) {
    setBusy(true);
    try {
      setMessage(
        (await onActivity(activity, data)) || "Saved to your learning journey.",
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <aside
      ref={panel}
      className="learning-journey field-journal"
      aria-label="Learning journey"
    >
      <button
        className="journal-close"
        onClick={onClose}
        aria-label="Close learning journey"
      >
        ×
      </button>
      <span className="eyebrow">YOUR LEARNING CAMP</span>
      <h2>Learning journey</h2>
      {nextRole && (
        <div className="learning-note" role="status">
          <p>
            Your learning guide recommends: <strong>{nextRole}</strong>
          </p>
          <button
            onClick={() => {
              const detail = [
                ...(panel.current?.querySelectorAll<HTMLDetailsElement>(
                  "details",
                ) ?? []),
              ].find((d) =>
                d.querySelector("summary")?.textContent?.includes(nextRole),
              );
              if (detail) {
                detail.open = true;
                detail.scrollIntoView({ block: "nearest", behavior: "smooth" });
              }
            }}
          >
            Visit next learning category
          </button>
        </div>
      )}
      <p>
        Visit all ten teaching roles before completing the course. Participation
        and assessed mastery are recorded separately.
      </p>
      <ol aria-label="Teaching role coverage">
        {LEARNING_ROLES.map((role) => (
          <li key={role}>
            {journey.observed.includes(role) ? "✓" : "○"} {role}
          </li>
        ))}
      </ol>
      <details>
        <summary>Mapmaker · your route</summary>
        <ol>
          {journey.path.map((l) => (
            <li key={l.id}>
              {l.cleared ? "✓" : "○"} {l.title}
            </li>
          ))}
        </ol>
        <button disabled={busy} onClick={() => void submit("map")}>
          Record route review
        </button>
      </details>
      <details>
        <summary>Interviewer · choose your goal</summary>
        <label>
          My learning goal
          <textarea
            value={goal}
            maxLength={2000}
            onChange={(e) => setGoal(e.target.value)}
          />
        </label>
        <button
          disabled={busy || goal.trim().length < 10}
          onClick={() => void submit("goal", { text: goal })}
        >
          Save learning goal
        </button>
      </details>
      <details
        onToggle={(e) => {
          if (e.currentTarget.open) void submit("reasoning-prompt");
        }}
      >
        <summary>Socratic Questioner · explain your reasoning</summary>
        <p>{journey.reasoningPrompt}</p>
        <p>
          Viewing a reasoning prompt records assistance for an unfinished task.
        </p>
        <label>
          My reasoning
          <textarea
            value={reasoning}
            maxLength={2000}
            onChange={(e) => setReasoning(e.target.value)}
          />
        </label>
        <button
          disabled={busy || reasoning.trim().length < 10}
          onClick={() => void submit("reasoning", { text: reasoning })}
        >
          Save reasoning
        </button>
      </details>
      <details>
        <summary>Explainer · investigate a resource</summary>
        {progress.resources?.map((r) => (
          <button key={r.id} onClick={() => onResource(r.id)}>
            Investigate: {r.title}
          </button>
        ))}
      </details>
      <details>
        <summary>Examiner, Checker & Listener · your evidence</summary>
        <p>
          {progress.completedLevelIds.length} checkpoints cleared. Authored
          answers and recorded assistance feed criterion checks. Your goal,
          reasoning and reflection stay saved.
        </p>
        <p>
          {progress.assessment?.reason ||
            "Complete a challenge to collect examination and checking evidence."}
        </p>
      </details>
      <details>
        <summary>Diagnostician · review strengths and gaps</summary>
        <p>{journey.diagnosis}</p>
        <p>
          {progress.feedback ||
            "Review each criterion and your assistance record. Rehearse any uncertain concept before moving on."}
        </p>
        <button
          disabled={busy || !progress.assessment}
          onClick={() => void submit("diagnosis")}
        >
          Record evidence review
        </button>
      </details>
      <details>
        <summary>Sparring Partner · final rehearsal</summary>
        <p>
          After the checkpoints, practise an authored alternative without
          affecting mastery or rewards.
        </p>
        <h3>{journey.rehearsal.prompt}</h3>
        {journey.rehearsal.options.map((option, i) => (
          <button
            key={i}
            aria-pressed={answer === i}
            onClick={() => setAnswer(i)}
          >
            {option}
          </button>
        ))}
        <button
          disabled={busy || answer === undefined || !progress.finished}
          onClick={() =>
            void submit("rehearsal", {
              questionId: journey.rehearsal.id,
              answer,
            })
          }
        >
          Check rehearsal
        </button>
      </details>
      <details>
        <summary>Clerk · save your takeaway</summary>
        <label>
          My course takeaway
          <textarea
            value={reflection}
            maxLength={2000}
            onChange={(e) => setReflection(e.target.value)}
          />
        </label>
        <button
          disabled={busy || !progress.finished || reflection.trim().length < 10}
          onClick={() => void submit("reflection", { text: reflection })}
        >
          Save course takeaway
        </button>
      </details>
      {message && <p role="status">{message}</p>}
      {journey.completed && (
        <p role="status">
          All ten teaching roles visited. Your learning journey is complete.
        </p>
      )}
    </aside>
  );
}
