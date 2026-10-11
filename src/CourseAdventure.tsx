import { lazy, Suspense, useEffect, useState, useRef } from "react";
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
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  const [progress, setProgress] = useState<LearningProgress | null>(null);
  const [answer, setAnswer] = useState<number | null>(null);
  const [help, setHelp] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [celebration, setCelebration] = useState(false);
  useEffect(
    () => () => {
      window.speechSynthesis?.cancel();
    },
    [],
  );
  const [started, setStarted] = useState(Date.now());
  const [sceneReady, setSceneReady] = useState(false);
  const [multiplier, setMultiplier] = useState(1);
  const [reducedMotion, setReducedMotion] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [clock, setClock] = useState(0);
  const [boost, setBoost] = useState(0);
  const [renderHeight, setRenderHeight] = useState(0);
  const synced = useRef(Date.now());
  const latest = useRef(progress);
  latest.current = progress;
  useEffect(() => {
    synced.current = Date.now();
  }, [progress]);
  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 200);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (progress?.game?.status !== "active" || !progress.question) return;
    let pending = false,
      alive = true;
    const poll = window.setInterval(async () => {
      if (pending || document.hidden) return;
      pending = true;
      try {
        const next = await request<LearningProgress>(
          "/learning/" + courseId + "/tick",
          { questionId: latest.current?.question?.id },
        );
        if (alive && latest.current?.question?.id === next.question?.id)
          setProgress(next);
      } catch {
        if (alive)
          setError(
            "Connection interrupted. Reconnect and reload saved progress; long connection gaps do not drain the section timer.",
          );
      } finally {
        pending = false;
      }
    }, 2000);
    const pause = () => {
      if (document.hidden)
        void request<LearningProgress>("/learning/" + courseId + "/pause", {
          questionId: latest.current?.question?.id,
        })
          .then((next) => {
            if (alive && latest.current?.question?.id === next.question?.id)
              setProgress(next);
          })
          .catch(() => {});
    };
    document.addEventListener("visibilitychange", pause);
    return () => {
      alive = false;
      window.clearInterval(poll);
      document.removeEventListener("visibilitychange", pause);
    };
  }, [courseId, progress?.question?.id, progress?.game?.status]);
  const elapsed =
    (progress?.game?.elapsedMs ?? 0) +
    (progress?.game?.status === "active"
      ? Math.min(5000, Math.max(0, clock - synced.current))
      : 0);
  const remaining = Math.max(0, (progress?.game?.budgetMs ?? 0) - elapsed);
  async function gameCommand(command: "play" | "pause") {
    if (!progress?.question) return;
    setProgress(
      await request<LearningProgress>("/learning/" + courseId + "/" + command, {
        questionId: progress.question.id,
        multiplier,
      }),
    );
  }
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
  useEffect(() => setSceneReady(false), [theme]);
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
        <button
          onClick={() =>
            run(async () => {
              if (progress?.game?.status === "active")
                await gameCommand("pause");
              onClose();
            })
          }
          className="course-secondary"
        >
          Return to city
        </button>
      </header>
      <div className="adventure-grid">
        <div className="adventure-world">
          <Suspense fallback={<p>Loading 3D scenery…</p>}>
            <CourseScene
              theme={theme}
              outfit={outfit}
              onReady={() => setSceneReady(true)}
              renderHeight={renderHeight}
              onChoose={(i) => {
                if (question && i < question.options.length) setAnswer(i);
              }}
              game={{
                status:
                  celebration || progress?.finished
                    ? "cleared"
                    : progress?.game?.status || "ready",
                remaining,
                budget: progress?.game?.budgetMs ?? 0,
                progress:
                  (progress?.levelProgress?.cleared ?? 0) /
                  (progress?.levelProgress?.total || 1),
                choice: answer,
                boost,
                reducedMotion,
              }}
            />
          </Suspense>
          <div className="adventure-scene-label">
            <span>{theme.replaceAll("-", " ")} · 3D preset</span>
            <small>
              {theme === "temple-chase"
                ? "Complete tasks to escape the guardian."
                : theme === "racing"
                  ? "Independent answers boost your pace."
                  : theme === "wrestling"
                    ? "Independent answers power your strikes."
                    : "Build skills at each workshop checkpoint."}
            </small>
          </div>
          <div
            className="adventure-timer"
            role="status"
            aria-label="Section timer"
          >
            {progress?.game?.budgetMs
              ? `${Math.ceil(remaining / 1000)}s`
              : "UNTIMED"}
            <small>
              {progress?.game?.status?.replaceAll("-", " ") || "ready"}
            </small>
          </div>
          <div
            className="adventure-task-meter"
            aria-label="Level task progress"
          >
            {progress?.levelProgress?.cleared || 0} /{" "}
            {progress?.levelProgress?.total || 0} criteria
            <progress
              value={progress?.levelProgress?.cleared || 0}
              max={progress?.levelProgress?.total || 1}
            />
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
          {!online && (
            <p role="status">
              Offline: cached artwork may remain visible. Answers, grading, and
              progress require a connection. Reconnect and retry; saved progress
              is retained.
            </p>
          )}
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
          {progress?.game?.status === "game-over" ? (
            <section aria-label="Game Over" className="adventure-celebration">
              <h2>Game Over</h2>
              <p>
                {theme === "temple-chase"
                  ? "The guardian caught up."
                  : theme === "racing"
                    ? "The rival reached this checkpoint first."
                    : "The section timer expired."}{" "}
                Repeat this step; previous checkpoints are saved.
              </p>
              <button
                className="primary"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    await gameCommand("play");
                    setAnswer(null);
                    setBoost(0);
                  })
                }
              >
                Retry this step
              </button>
            </section>
          ) : progress?.assessment?.status === "pending" ? (
            <section aria-label="Pending assessment">
              <h2>Level cleared · assessment pending</h2>
              <p>
                Your activity points and evidence are saved. Progression waits
                for validated criterion grades and an eligible route.
              </p>
              <button
                className="primary"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    setProgress(
                      await request<LearningProgress>(
                        "/learning/" + courseId + "/classify",
                        {},
                      ),
                    );
                  })
                }
              >
                Retry mock assessment
              </button>
            </section>
          ) : progress?.finished || celebration ? (
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
              {progress?.assessment && (
                <p>
                  {
                    progress.assessment.criteria.filter((c) => c.independent)
                      .length
                  }{" "}
                  independent criteria · {progress.assessment.assistanceCount}{" "}
                  assisted responses · {progress.assessment.errorCount}{" "}
                  corrections recorded
                </p>
              )}
              <strong>+{progress?.result?.awardedPoints || 0} points</strong>
              {progress?.finished && (
                <p className="earned-badge">
                  🏅 Checkpoint finisher badge earned · visit your wardrobe to
                  unlock gear.
                </p>
              )}
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
              <div className="game-controls">
                <label>
                  Graphics{" "}
                  <select
                    aria-label="Adventure graphics"
                    value={renderHeight}
                    onChange={(e) => setRenderHeight(Number(e.target.value))}
                  >
                    <option value={0}>Automatic · 144–360p</option>
                    {[144, 360, 720, 1080].map((h) => (
                      <option key={h} value={h}>
                        {h}p
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Section timing{" "}
                  <select
                    aria-label="Section timing"
                    value={multiplier}
                    disabled={progress?.game?.status !== "ready"}
                    onChange={(e) => setMultiplier(Number(e.target.value))}
                  >
                    <option value={1}>Tutor time</option>
                    <option value={2}>Double time</option>
                    <option value={0}>Untimed</option>
                  </select>
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={reducedMotion}
                    onChange={(e) => setReducedMotion(e.target.checked)}
                  />{" "}
                  Reduced motion
                </label>
                <button
                  className="course-secondary"
                  disabled={busy || !sceneReady}
                  onClick={() =>
                    run(() =>
                      gameCommand(
                        progress?.game?.status === "active" ? "pause" : "play",
                      ),
                    )
                  }
                >
                  {!sceneReady
                    ? "Loading adventure…"
                    : progress?.game?.status === "active"
                      ? "Pause section"
                      : progress?.game?.status === "paused"
                        ? "Resume section"
                        : "Start section"}
                </button>
                {"speechSynthesis" in window && (
                  <button
                    className="course-secondary"
                    onClick={() =>
                      run(async () => {
                        if (progress?.game?.status === "active")
                          await gameCommand("pause");
                        window.speechSynthesis.cancel();
                        window.speechSynthesis.speak(
                          new SpeechSynthesisUtterance(question.prompt),
                        );
                      })
                    }
                  >
                    Read task aloud
                  </button>
                )}
              </div>
              <p className="gate-help">
                Choose a 3D gate (left A, center B, right C) or use the answer
                buttons.
              </p>
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
              {progress?.feedback && (
                <p className="help-box">{progress.feedback}</p>
              )}
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
                  disabled={
                    busy ||
                    answer === null ||
                    !progress?.game ||
                    progress.game.status === "ready"
                  }
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
                      setBoost(
                        next.activity?.independent
                          ? Math.max(
                              0.3,
                              1 -
                                Math.min(
                                  1,
                                  next.activity.elapsedMs /
                                    Math.max(
                                      1000,
                                      progress!.game?.budgetMs || 60000,
                                    ),
                                ),
                            )
                          : 0,
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
                      setProgress(
                        await request<LearningProgress>(
                          "/learning/" + courseId,
                        ),
                      );
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
                <details
                  key={resource.id}
                  onToggle={(e) => {
                    if (
                      e.currentTarget.open &&
                      latest.current?.game?.status === "active"
                    )
                      void gameCommand("pause").catch(() => {});
                  }}
                >
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
