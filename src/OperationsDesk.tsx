import { useEffect, useState } from "react";
type Appeal = {
  player_id: string;
  state: { appeal: string; goalCourseId?: string };
};
async function call(path: string, body?: unknown) {
  const r = await fetch("/api" + path, {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error);
  return data;
}
export default function OperationsDesk() {
  const [status, setStatus] = useState<{
      reports: number;
      ads: number;
      appeals: number;
      presence: number;
      modelMode: string;
    } | null>(null),
    [appeals, setAppeals] = useState<Appeal[]>([]),
    [message, setMessage] = useState("");
  async function load() {
    setStatus(await call("/operations"));
    setAppeals(await call("/world-policy/moderation"));
  }
  useEffect(() => {
    void load().catch((e) => setMessage(e.message));
  }, []);
  return (
    <section aria-label="World operations">
      <h3>World operations</h3>
      <button
        className="course-secondary"
        onClick={() => void load().catch((e) => setMessage(e.message))}
      >
        Refresh operations
      </button>
      {status && (
        <p>
          {status.presence} active players · {status.reports} unresolved
          participant reports · {status.ads} pending placements ·{" "}
          {status.appeals} appeals · {status.modelMode} classifier
        </p>
      )}
      <p>
        Review context before dismissing an arrest. Course progress and learning
        releases remain independent of moderation.
      </p>
      {appeals.map((a) => (
        <article key={a.player_id}>
          <p>{a.state.appeal}</p>
          <button
            className="course-secondary"
            onClick={() =>
              void call("/world-policy/dismiss", { playerId: a.player_id })
                .then(load)
                .catch((e) => setMessage(e.message))
            }
          >
            Dismiss arrest for {a.player_id.slice(0, 8)}
          </button>
        </article>
      ))}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
