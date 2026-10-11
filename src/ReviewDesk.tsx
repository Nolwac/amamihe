import { useEffect, useState } from "react";
import CourseScene from "./CourseScene";
import type { Theme, CourseResource } from "../shared/course";
import { localDueLabel } from "../shared/reviews";
type ReviewCard = {
  courseId: string;
  version: number;
  levelId: string;
  title: string;
  due: string;
  dueNow: boolean;
  reps: number;
};
type Encounter = {
  id: string;
  question: { prompt: string; options: string[] };
  theme: Theme;
  early: boolean;
  resources: CourseResource[];
};
async function call(path: string, body?: unknown) {
  const r = await fetch("/api/reviews" + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error);
  return d;
}
export default function ReviewDesk() {
  const [cards, setCards] = useState<ReviewCard[]>([]),
    [active, setActive] = useState<Encounter | null>(null),
    [choice, setChoice] = useState<number | null>(null),
    [message, setMessage] = useState(""),
    [help, setHelp] = useState(""),
    [resources, setResources] = useState<CourseResource[]>([]),
    [busy, setBusy] = useState(false),
    [zone, setZone] = useState(
      Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    );
  const load = () => call("").then((d) => setCards(d.cards));
  useEffect(() => {
    void load().catch((e) => setMessage(String(e)));
  }, []);
  async function action(work: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    try {
      await work();
    } catch (e) {
      setMessage(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section aria-label="Review encounters" className="wardrobe">
      <h2>Recall encounters</h2>
      <p>
        Your Codex: {cards.length} confirmed checkpoints. Reviews use fresh
        tutor-authored tasks; practice and team rewards do not certify mastery.
      </p>
      <label>
        Review timezone
        <select
          aria-label="Review timezone"
          value={zone}
          onChange={(e) => setZone(e.target.value)}
        >
          {[
            ...new Set([
              Intl.DateTimeFormat().resolvedOptions().timeZone,
              "UTC",
              "Africa/Lagos",
            ]),
          ].map((z) => (
            <option key={z}>{z}</option>
          ))}
        </select>
      </label>
      {!cards.length && (
        <p>
          Complete an independently assessed course checkpoint to unlock
          scheduled review.
        </p>
      )}
      {!active &&
        cards.map((c) => (
          <article key={c.courseId + ":" + c.version + ":" + c.levelId}>
            <strong>{c.title}</strong>
            <p>
              {c.dueNow ? "Due now" : "Due " + localDueLabel(c.due, zone)} ·{" "}
              {c.reps} scheduled reviews
            </p>
            <button
              disabled={busy}
              onClick={() =>
                void action(async () => {
                  setActive(
                    await call("/start", {
                      courseId: c.courseId,
                      version: c.version,
                      levelId: c.levelId,
                    }),
                  );
                  setHelp("");
                  setChoice(null);
                  setResources([]);
                })
              }
            >
              {c.dueNow ? "Enter review" : "Practice early"}: {c.title}
            </button>
          </article>
        ))}
      {active && (
        <>
          <div style={{ height: 220 }}>
            <CourseScene theme={active.theme} renderHeight={144} />
          </div>
          <h3>{active.question.prompt}</h3>
          {active.early && (
            <p>Early practice: this does not reschedule delayed recall.</p>
          )}
          <div className="answers">
            {active.question.options.map((option, i) => (
              <button
                key={i}
                aria-pressed={choice === i}
                onClick={() => setChoice(i)}
              >
                {option}
              </button>
            ))}
          </div>
          <button
            disabled={busy}
            onClick={() =>
              void action(async () => {
                const d = await call("/" + active.id + "/help", {});
                setHelp(d.explanation);
              })
            }
          >
            Show review explanation
          </button>
          {help && <p>{help}</p>}
          <button
            disabled={busy || choice === null}
            onClick={() =>
              void action(async () => {
                const result = await call("/" + active.id + "/answer", {
                  answer: choice,
                });
                setMessage(
                  result.independent
                    ? "Independent recall recorded. " +
                        (result.early
                          ? "Schedule unchanged."
                          : "Next due " + localDueLabel(result.due, zone))
                    : result.explanation,
                );
                setResources(result.resources);
                setActive(null);
                await load();
              })
            }
          >
            Submit review
          </button>
          <button onClick={() => setActive(null)}>Close encounter</button>
        </>
      )}
      {resources.map((r) => (
        <details key={r.id}>
          <summary>{r.title}</summary>
          <pre>{r.content}</pre>
          <a href={r.source} target="_blank" rel="noopener noreferrer">
            Source
          </a>
        </details>
      ))}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
