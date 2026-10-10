import { lazy, Suspense, useEffect, useState } from "react";
import type { LearningProgress } from "../shared/course";
import "./courses.css";
const CourseScene = lazy(() => import("./CourseScene"));
async function request<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch("/api" + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(
      data.error || "Your progress could not be saved. Please retry.",
    );
  return data;
}
export default function CourseAdventure({
  courseId,
  onClose,
  onPoints,
  outfit,
}: {
  courseId: string;
  onClose: () => void;
  onPoints: () => void;
  outfit: string;
}) {
  const [progress, setProgress] = useState<LearningProgress | null>(null);
  const [answer, setAnswer] = useState<number | null>(null);
  const [help, setHelp] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [celebration, setCelebration] = useState(false);
  const [started, setStarted] = useState(Date.now());
  useEffect(() => {
    let alive = true;
    request<LearningProgress>("/learning/" + courseId)
      .then((p) => {
        if (alive) {
          setProgress(p);
          setStarted(Date.now());
        }
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [courseId]);
  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed.");
    } finally {
      setBusy(false);
    }
  }
  const question = progress?.question;
  const theme = progress?.level?.theme || "workshop";
  return (
    <section
      className="course-adventure course-overlay"
      aria-label="Published course adventure"
    >
      <header className="course-bar">
        <div>
          <span className="eyebrow">
            COURSE ADVENTURE · VERSION {progress?.version || "…"}
          </span>
          <h1>{progress?.level?.title || "Restoring your adventure"}</h1>
        </div>
        <button onClick={onClose} className="course-secondary">
          Return to city
        </button>
      </header>
      <div className="adventure-grid">
        <div className="adventure-world">
          <Suspense fallback={<p>Loading 3D scenery…</p>}>
            <CourseScene theme={theme} outfit={outfit} />
          </Suspense>
          <div className="adventure-scene-label">
            <span>{theme.replaceAll("-", " ")} · 3D preset</span>
            <small>
              Task checkpoints are playable. Timed action mechanics follow in
              Step 4.
            </small>
          </div>
          <div className="adventure-milestones">
            <strong>
              {progress?.completedLevelIds.length || 0} levels cleared
            </strong>
            <span>✦ {progress?.points || 0} course points</span>
            <span>MOCK CLASSIFIER</span>
          </div>
        </div>
        <div className="adventure-content">
          {error && (
            <div className="course-error" role="alert">
              {error}
              <button
                onClick={() =>
                  run(async () => {
                    setProgress(
                      await request<LearningProgress>("/learning/" + courseId),
                    );
                    setAnswer(null);
                    setHelp("");
                    setCelebration(false);
                    setStarted(Date.now());
                  })
                }
              >
                Reload saved progress
              </button>
            </div>
          )}
          {progress?.finished || celebration ? (
            <section
              className="adventure-celebration"
              aria-label="Level clearance"
            >
              <span className="celebration-mark">✦</span>
              <h2>
                {progress?.finished
                  ? "Course checkpoints complete"
                  : "Level cleared"}
              </h2>
              <p>
                {progress?.result?.label ||
                  "Your independent responses have been recorded."}
              </p>
              <p className="mock-note">
                MOCK CLASSIFICATION · This checkpoint uses authored answer keys.
                It does not certify practical model training or mastery.
              </p>
              <strong>+{progress?.result?.awardedPoints || 0} points</strong>
              <button
                className="primary"
                onClick={
                  progress?.finished
                    ? onClose
                    : () => {
                        setCelebration(false);
                        setStarted(Date.now());
                      }
                }
              >
                {progress?.finished
                  ? "Back to Venture City"
                  : "Continue adventure"}
              </button>
            </section>
          ) : progress?.blocked ? (
            <section>
              <h2>Fresh practice needed</h2>
              <p>{progress.blockReason}</p>
              <p>
                Your completed levels and points are saved. The tutor needs to
                supply additional independent retry tasks.
              </p>
              <button className="primary" onClick={onClose}>
                Return to city
              </button>
            </section>
          ) : question ? (
            <section aria-label="Authored learning task">
              <span className="eyebrow">
                {progress?.retry ? "INDEPENDENT RETRY" : "AUTHORED TASK"} ·{" "}
                {progress!.questionIndex + 1}
              </span>
              <h2>{question.prompt}</h2>
              <div className="answers">
                {question.options.map((option, i) => (
                  <button
                    key={i}
                    aria-pressed={answer === i}
                    className={answer === i ? "chosen" : ""}
                    onClick={() => setAnswer(i)}
                    disabled={busy}
                  >
                    <span>{String.fromCharCode(65 + i)}</span>
                    {option}
                  </button>
                ))}
              </div>
              {help && (
                <div className="help-box">
                  {help}
                  <small>
                    Assistance recorded. A fresh independent retry is required.
                  </small>
                </div>
              )}
              {progress?.assisted && !help && (
                <p className="help-box">
                  Assistance was recorded for this task before you returned. A
                  fresh independent retry is required.
                </p>
              )}
              {progress?.retry && (
                <p className="retry-note">
                  Practice another tutor-authored question independently to
                  clear this checkpoint.
                </p>
              )}
              <div className="course-task-actions">
                <button
                  className="primary"
                  disabled={busy || answer === null}
                  onClick={() =>
                    run(async () => {
                      const next = await request<LearningProgress>(
                        "/learning/" + courseId + "/answer",
                        {
                          questionId: question.id,
                          answer,
                          elapsedMs: Math.min(
                            3600000,
                            Math.max(0, Date.now() - started),
                          ),
                        },
                      );
                      setCelebration(
                        next.completedLevelIds.length >
                          progress!.completedLevelIds.length,
                      );
                      setProgress(next);
                      setAnswer(null);
                      setHelp("");
                      setStarted(Date.now());
                      onPoints();
                    })
                  }
                >
                  {busy ? "Saving…" : "Submit task"}
                </button>
                <button
                  className="course-secondary"
                  disabled={busy || Boolean(help)}
                  onClick={() =>
                    run(async () => {
                      const result = await request<{
                        hint: string;
                        explanation: string;
                      }>("/learning/" + courseId + "/help", {
                        questionId: question.id,
                      });
                      setHelp(result.hint + " " + result.explanation);
                    })
                  }
                >
                  Show authored help
                </button>
              </div>
            </section>
          ) : (
            !error && <p>Loading your saved checkpoint…</p>
          )}
          {progress?.resources && (
            <section
              className="adventure-resources"
              aria-label="Course resources"
            >
              <h3>Workbench resources</h3>
              {progress.resources.map((resource) => (
                <details key={resource.id}>
                  <summary>
                    {resource.title}
                    <span>{resource.kind}</span>
                  </summary>
                  <pre>{resource.content}</pre>
                  {resource.url && (
                    <a
                      href={resource.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Open resource ↗
                    </a>
                  )}
                  <a
                    href={resource.source}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Source & attribution ↗
                  </a>
                  {resource.kind !== "reading" && (
                    <small>
                      External tools may require connectivity and an account.
                      Launching a tool does not award course points.
                    </small>
                  )}
                </details>
              ))}
            </section>
          )}
        </div>
      </div>
    </section>
  );
}
