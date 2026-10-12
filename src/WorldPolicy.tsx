import { useEffect, useState } from "react";
import type { WorldPolicyState } from "../server/world-policy";
export function useWorldPolicy(enabled: boolean, mode: string) {
  const [state, setState] = useState<WorldPolicyState | null>(null),
    [error, setError] = useState("");
  async function action(body: unknown) {
    const response = await fetch("/api/world-policy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    setState(data);
    setError("");
    return data;
  }
  useEffect(() => {
    if (!enabled) {
      setState(null);
      return;
    }
    let alive = true,
      pending = false;
    const update = async () => {
      if (pending) return;
      pending = true;
      try {
        const r = await fetch("/api/world-policy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "heartbeat",
            mode: document.hidden ? "hidden" : mode,
          }),
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error);
        if (alive) {
          setState(data);
          setError("");
        }
      } catch {
        if (alive)
          setError("Connection interrupted. Disconnected time is protected.");
      } finally {
        pending = false;
      }
    };
    void update();
    const timer = setInterval(() => {
      if (!document.hidden) void update();
    }, 5000);
    const visibility = () => void update();
    document.addEventListener("visibilitychange", visibility);
    return () => {
      alive = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [enabled, mode]);
  return { state, error, action };
}
export default function WorldPolicy({
  state,
  error,
  action,
  breakMode,
  onBreak,
  learningOpen,
  courses,
  onCourse,
  onSearch,
  onStudio,
  onPoints,
}: {
  state: WorldPolicyState | null;
  error: string;
  action: (body: unknown) => Promise<unknown>;
  breakMode: boolean;
  onBreak: (value: boolean) => void;
  learningOpen: boolean;
  courses: { courseId: string; title: string; finished: boolean }[];
  onCourse: (id: string) => void;
  onSearch: () => void;
  onStudio: () => void;
  onPoints: () => void;
}) {
  const [course, setCourse] = useState(""),
    [appeal, setAppeal] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  if (!state) return null;
  const detained = state.status === "arrested" && !learningOpen;
  async function perform(body: unknown, done?: () => void) {
    setBusy(true);
    try {
      await action(body);
      setMessage("");
      done?.();
    } catch (e) {
      setMessage(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className={
        detained ? "course-directory police-detention" : "police-controls"
      }
      aria-label="Learning Police"
    >
      <details className="police-menu">
        <summary aria-label="Learning Police controls">
          ♜<span className="sr-only">Learning Police controls</span>
          {state.status === "arrested" && " · detained"}
        </summary>
        <div className="police-options">
          <h2>
            {detained
              ? "Learning Police · temporary city eviction"
              : state.status === "warned"
                ? "Learning Police warning"
                : "Learning Police"}
          </h2>
          {detained ? (
            <>
              <p>
                {state.arrestMinutes ?? 15} minutes of connected foreground time
                passed without recorded learning or course authoring. Progress
                and mastery are retained.
              </p>
              <p>
                Return by answering two new questions independently in a
                selected course or finishing its remaining questions, publishing
                a valid course, or spending five cosmetic points. No real
                payment is required. Breaks, hidden tabs and connection gaps are
                protected.
              </p>
              <label>
                Release course
                <select
                  value={course}
                  onChange={(e) => setCourse(e.target.value)}
                >
                  <option value="">Choose an enrolled adventure</option>
                  {courses
                    .filter((c) => !c.finished)
                    .map((c) => (
                      <option value={c.courseId} key={c.courseId}>
                        {c.title}
                      </option>
                    ))}
                </select>
              </label>
              <button
                className="course-secondary"
                disabled={busy || !course}
                onClick={() =>
                  void perform(
                    { action: "release-course", courseId: course },
                    () => onCourse(course),
                  )
                }
              >
                Continue release course
              </button>
              <button className="course-secondary" onClick={onSearch}>
                Find a release course
              </button>
              <button className="course-secondary" onClick={onStudio}>
                Create a course for release
              </button>
              <button
                className="course-secondary"
                disabled={busy}
                onClick={() => void perform({ action: "fine" }, onPoints)}
              >
                Pay five cosmetic points
              </button>
              <label>
                Appeal this warning
                <textarea
                  maxLength={500}
                  value={appeal}
                  onChange={(e) => setAppeal(e.target.value)}
                />
              </label>
              <button
                className="course-secondary"
                disabled={
                  busy || appeal.trim().length < 5 || Boolean(state.appeal)
                }
                onClick={() =>
                  void perform({ action: "appeal", message: appeal })
                }
              >
                {state.appeal ? "Appeal submitted" : "Submit appeal"}
              </button>
            </>
          ) : (
            <>
              {state.status === "warned" && (
                <p>
                  Choose a course or work on your course draft. City eviction
                  starts after fifteen idle minutes.
                </p>
              )}
              {state.status === "arrested" && (
                <p>
                  Complete two independent questions or finish your selected
                  course for release.
                </p>
              )}
              <button
                className="course-secondary"
                onClick={() => onBreak(!breakMode)}
              >
                {breakMode ? "Resume learning" : "Take a break"}
              </button>
              {breakMode && <p>Break protected. Your progress is retained.</p>}
            </>
          )}
          {(message || error) && <p role="status">{message || error}</p>}
        </div>
      </details>
    </section>
  );
}
