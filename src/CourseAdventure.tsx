import { useBillboards } from "./billboardPresence";
import BillboardLinks from "./BillboardLinks";
import type { Presence } from "../shared/social";
import PracticeTool from "./PracticeTool";
import AudioControls from "./AudioControls";
import { gameAudio } from "./gameAudio";
import { lazy, Suspense, useEffect, useState, useRef, useMemo } from "react";
import type { LearningProgress } from "../shared/course";
import {
  advanceAdventureRuntime,
  type AdventureAction,
} from "../shared/adventure-runtime";
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
  peers = [],
}: {
  courseId: string;
  onClose: () => void;
  onPoints: () => void;
  outfit: string;
  peers?: Presence[];
}) {
  const [decision, setDecision] = useState({ mode: "mock", ready: true });
  useEffect(() => {
    void request<{ mode: string; ready: boolean }>("/decision-status")
      .then(setDecision)
      .catch(() => setDecision({ mode: "unavailable", ready: false }));
  }, []);
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
  const [clearedScene, setClearedScene] = useState<LearningProgress | null>(
    null,
  );
  const [answer, setAnswer] = useState<number | null>(null);
  const [help, setHelp] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [celebration, setCelebration] = useState(false);
  const holdingScene = Boolean(
    clearedScene &&
    (celebration ||
      progress?.finished ||
      progress?.assessment?.status === "pending"),
  );
  const display = holdingScene ? clearedScene : progress;
  const ads = useBillboards(courseId, display?.version, display?.levelId);
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
  const [sceneActivity, setSceneActivity] = useState<
    { id: string; correct: boolean; independent: boolean } | undefined
  >();
  const activitySerial = useRef(0);
  const [manualControls, setManualControls] = useState(false);
  const [taskOpen, setTaskOpen] = useState(true);
  const taskPanel = useRef<HTMLDivElement>(null);
  const [controlNotice, setControlNotice] = useState("");
  const [renderHeight, setRenderHeight] = useState(0);
  const synced = useRef(Date.now());
  const latest = useRef(progress);
  latest.current = progress;
  const gameCommandSerial = useRef(0);
  function acceptGameSnapshot(next: LearningProgress, resume = false) {
    const current = latest.current;
    if (
      !current ||
      current.question?.id !== next.question?.id ||
      current.game?.run !== next.game?.run ||
      (next.game?.lastTick ?? 0) < (current.game?.lastTick ?? 0) ||
      (next.game?.elapsedMs ?? 0) < (current.game?.elapsedMs ?? 0) ||
      (next.game?.actionSequence ?? 0) < (current.game?.actionSequence ?? 0) ||
      (current.game?.status === "game-over" &&
        next.game?.status !== "game-over") ||
      (current.game?.status === "paused" &&
        next.game?.status === "active" &&
        !resume)
    )
      return false;
    latest.current = next;
    setProgress(next);
    return true;
  }
  const controlQueue = useRef(Promise.resolve());
  const mounted = useRef(true);
  const inputBusy = useRef(busy);
  inputBusy.current =
    busy || holdingScene || celebration || Boolean(progress?.finished);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
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
        if (alive) acceptGameSnapshot(next);
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
      if (document.hidden) {
        const serial = ++gameCommandSerial.current;
        void request<LearningProgress>("/learning/" + courseId + "/pause", {
          questionId: latest.current?.question?.id,
        })
          .then((next) => {
            if (alive && serial === gameCommandSerial.current)
              acceptGameSnapshot(next);
          })
          .catch(() => {});
      }
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
    (progress?.game?.status === "active" && online && !document.hidden
      ? Math.min(2000, Math.max(0, clock - synced.current))
      : 0);
  const remaining = Math.max(0, (progress?.game?.budgetMs ?? 0) - elapsed);
  async function gameCommand(command: "play" | "pause") {
    const requested = latest.current;
    if (!requested?.question) return;
    const serial = ++gameCommandSerial.current;
    if (command === "play") void gameAudio.activate().catch(() => {});
    const next = await request<LearningProgress>(
      "/learning/" + courseId + "/" + command,
      {
        questionId: requested.question.id,
        multiplier,
        assist: !manualControls || reducedMotion || multiplier === 0,
      },
    );
    if (serial !== gameCommandSerial.current) return;
    if (command === "pause") {
      acceptGameSnapshot(next);
    } else if (
      mounted.current &&
      latest.current?.question?.id === requested.question.id &&
      latest.current.game?.run === requested.game?.run
    ) {
      if (next.game?.run === latest.current.game?.run)
        acceptGameSnapshot(next, true);
      else {
        // A retry intentionally resets elapsed time and the action sequence.
        latest.current = next;
        setProgress(next);
      }
    }
  }
  function sendAction(action: AdventureAction) {
    const current = latest.current;
    const actionTheme = current?.level?.theme;
    const traversing =
      actionTheme === "temple-chase" || actionTheme === "racing";
    if (
      !online ||
      inputBusy.current ||
      current?.game?.status !== "active" ||
      !current.question ||
      (action === "strike" ? actionTheme !== "wrestling" : !traversing)
    )
      return;
    void gameAudio.activate().catch(() => {});
    const questionId = current.question.id;
    const runNumber = current.game.run;
    controlQueue.current = controlQueue.current
      .catch(() => {})
      .then(async () => {
        const live = latest.current;
        if (
          !mounted.current ||
          inputBusy.current ||
          live?.question?.id !== questionId ||
          live.game?.run !== runNumber ||
          live.game.status !== "active"
        )
          return;
        try {
          const next = await request<LearningProgress>(
            "/learning/" + courseId + "/action",
            {
              questionId,
              run: runNumber,
              sequence: (live.game.actionSequence ?? 0) + 1,
              action,
            },
          );
          if (mounted.current && acceptGameSnapshot(next)) {
            setControlNotice("");
          }
        } catch (e) {
          if (mounted.current)
            setControlNotice(
              e instanceof Error ? e.message : "Controls could not be saved.",
            );
        }
      });
  }
  const actions = useRef(sendAction);
  actions.current = sendAction;
  useEffect(() => {
    function keydown(event: KeyboardEvent) {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (
        target.closest("input, textarea, select, [contenteditable='true']") ||
        !target.closest(".course-scene, .adventure-pad")
      )
        return;
      const action: AdventureAction | undefined = {
        ArrowLeft: "left",
        a: "left",
        A: "left",
        ArrowRight: "right",
        d: "right",
        D: "right",
        ArrowUp: "jump",
        " ": "jump",
        ArrowDown: "slide",
        s: "slide",
        S: "slide",
        f: "strike",
        F: "strike",
      }[event.key] as AdventureAction | undefined;
      if (action) {
        event.preventDefault();
        if (!event.repeat) actions.current(action);
      }
    }
    document.addEventListener("keydown", keydown);
    return () => document.removeEventListener("keydown", keydown);
  }, []);
  useEffect(() => {
    let alive = true;
    request<LearningProgress>("/learning/" + courseId)
      .then(async (p) => {
        if (
          alive &&
          reducedMotion &&
          p.question &&
          p.game?.adventure?.assist === false &&
          (p.game.status === "active" || p.game.status === "paused")
        ) {
          const paused = p.game.status === "paused";
          p = await request<LearningProgress>(
            "/learning/" + courseId + "/play",
            { questionId: p.question.id, assist: true },
          );
          if (paused)
            p = await request<LearningProgress>(
              "/learning/" + courseId + "/pause",
              { questionId: p.question?.id },
            );
        }
        if (alive) {
          latest.current = p;
          setProgress(p);
          if (p.game?.status !== "ready") {
            setMultiplier(p.game?.multiplier ?? 1);
            setManualControls(p.game?.adventure?.assist === false);
          }
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
  const theme = display?.level?.theme || "workshop";
  const adventure = useMemo(() => {
    const saved = display?.game?.adventure;
    return saved &&
      display.game?.status === "active" &&
      online &&
      !document.hidden
      ? advanceAdventureRuntime(
          saved,
          Math.min(2000, Math.max(0, clock - synced.current)),
        )
      : saved;
  }, [display, clock, online]);
  const sceneRemaining = holdingScene
    ? Math.max(
        0,
        (display?.game?.budgetMs ?? 0) - (display?.game?.elapsedMs ?? 0),
      )
    : remaining;
  const actionEnabled =
    !holdingScene &&
    !celebration &&
    !progress?.finished &&
    progress?.game?.status === "active" &&
    online &&
    !busy;
  const collision = adventure?.collision;
  useEffect(() => setSceneReady(false), [theme]);
  useEffect(() => {
    taskPanel.current?.scrollTo({ top: 0 });
  }, [question?.id]);
  useEffect(() => {
    if (
      progress?.game?.status === "game-over" ||
      celebration ||
      progress?.finished
    )
      setTaskOpen(true);
  }, [progress?.game?.status, celebration, progress?.finished]);
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
          <h1>{display?.level?.title || "Restoring your adventure"}</h1>
        </div>
        <div className="adventure-header-actions">
          <AudioControls />
          <button
            className="course-secondary adventure-task-toggle"
            aria-expanded={taskOpen}
            aria-controls="adventure-task-panel"
            onClick={() => setTaskOpen((value) => !value)}
          >
            {taskOpen ? "Hide task" : "Show task"}
          </button>
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
        </div>
      </header>
      <div
        className="adventure-grid"
        data-task-panel={taskOpen ? "open" : "closed"}
      >
        <div className="adventure-world">
          <Suspense fallback={<p>Loading 3D scenery…</p>}>
            <CourseScene
              billboards={ads}
              theme={theme}
              outfit={outfit}
              onReady={() => setSceneReady(true)}
              renderHeight={renderHeight}
              peers={holdingScene ? [] : peers}
              presenceSpace={
                !holdingScene &&
                !celebration &&
                !progress?.finished &&
                progress?.assessment?.status !== "pending" &&
                progress
                  ? { courseId, levelId: progress.levelId }
                  : undefined
              }
              onChoose={(i) => {
                if (
                  !holdingScene &&
                  !celebration &&
                  !progress?.finished &&
                  question &&
                  i < question.options.length
                )
                  setAnswer(i);
              }}
              game={{
                status:
                  holdingScene ||
                  celebration ||
                  progress?.finished ||
                  progress?.assessment?.status === "pending"
                    ? "cleared"
                    : display?.game?.status || "ready",
                remaining: sceneRemaining,
                budget: display?.game?.budgetMs ?? 0,
                progress:
                  (display?.levelProgress?.cleared ?? 0) /
                  (display?.levelProgress?.total || 1),
                choice: answer,
                boost,
                reducedMotion,
                stepKey: display?.question?.id || display?.levelId,
                elapsedMs: display?.game?.elapsedMs ?? 0,
                run: display?.game?.run ?? 0,
                adventure: display?.game?.adventure,
                activity: sceneActivity,
              }}
            />
          </Suspense>
          <div className="adventure-scene-label">
            <span>{theme.replaceAll("-", " ")} adventure</span>
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
            {display?.game?.budgetMs
              ? `${Math.ceil(sceneRemaining / 1000)}s`
              : "UNTIMED"}
            <small>
              {holdingScene
                ? "cleared"
                : display?.game?.status?.replaceAll("-", " ") || "ready"}
            </small>
          </div>
          <div
            className="adventure-task-meter"
            aria-label="Level task progress"
          >
            {display?.levelProgress?.cleared || 0} /{" "}
            {display?.levelProgress?.total || 0} criteria
            <progress
              value={display?.levelProgress?.cleared || 0}
              max={display?.levelProgress?.total || 1}
            />
          </div>
          <div className="adventure-milestones">
            <strong>
              {progress?.completedLevelIds.length || 0} levels cleared
            </strong>
            <span>✦ {progress?.points || 0} course points</span>
            <span>
              {decision.mode === "mock"
                ? "MOCK CLASSIFIER"
                : decision.ready
                  ? "TYPED CLASSIFIER"
                  : "CLASSIFIER UNAVAILABLE"}
            </span>
          </div>
          <div
            className="adventure-run-status"
            aria-label="Adventure run status"
          >
            <span>
              {adventure
                ? `${Math.floor(adventure.distance)}m travelled`
                : "Ready at the start"}
            </span>
            {theme === "temple-chase" && adventure && (
              <span>
                Guardian gap {Math.max(0, adventure.guardianGap).toFixed(1)}m
              </span>
            )}
            {theme === "racing" && adventure && (
              <span>
                {adventure.boostUntilMs > adventure.elapsedMs
                  ? "Learning boost active"
                  : "Racing to the checkpoint"}
              </span>
            )}
            {theme === "wrestling" && adventure && (
              <span>
                Opponent strength {adventure.opponentHealth} ·{" "}
                {adventure.strikes} strikes
              </span>
            )}
            <span>
              {theme === "workshop"
                ? "Complete tasks to operate your workstation"
                : theme === "wrestling"
                  ? "Independent answers power your attacks"
                  : adventure?.assist !== false
                    ? "Guided obstacle navigation"
                    : "Manual obstacle controls"}
            </span>
            {!sceneReady && <span>Loading your character and world…</span>}
            {progress?.game?.status === "paused" && (
              <span>Paused · progress saved</span>
            )}
          </div>
          {theme !== "workshop" && (
            <div
              className="adventure-pad"
              role="group"
              aria-label="Adventure movement controls"
              tabIndex={0}
            >
              <div className="adventure-pad-buttons">
                {(
                  [
                    ["left", "←", "Move left"],
                    ["right", "→", "Move right"],
                    ["jump", "↑", "Jump"],
                    ["slide", "↓", "Slide"],
                    ["strike", "✦", "Strike"],
                  ] as const
                )
                  .filter(([action]) =>
                    theme === "wrestling"
                      ? action === "strike"
                      : action !== "strike",
                  )
                  .map(([action, icon, label]) => (
                    <button
                      key={action}
                      type="button"
                      aria-label={label}
                      disabled={!actionEnabled}
                      onClick={() => sendAction(action)}
                    >
                      <span aria-hidden="true">{icon}</span>
                      <small>{label}</small>
                    </button>
                  ))}
              </div>
              <small className="adventure-key-help">
                {theme === "wrestling"
                  ? "Focus the world: F to practice a strike. Complete tasks to deal damage."
                  : "Focus the world: A/D or ←/→ · Space jump · S slide"}
              </small>
              {controlNotice && <small role="status">{controlNotice}</small>}
            </div>
          )}
        </div>
        <div
          ref={taskPanel}
          className="adventure-content"
          id="adventure-task-panel"
          hidden={!taskOpen}
        >
          <BillboardLinks ads={ads} />
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
                    setClearedScene(null);
                    setSceneActivity(undefined);
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
                {collision
                  ? collision.kind === "guardian"
                    ? "The guardian caught you."
                    : collision.kind === "hurdle"
                      ? "You hit a hurdle. Jump or change lanes to avoid it."
                      : collision.kind === "arch"
                        ? "You hit a low arch. Slide or change lanes to avoid it."
                        : "You collided with a barrier. Move into a clear lane."
                  : theme === "temple-chase"
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
                    const next = await request<LearningProgress>(
                      "/learning/" + courseId + "/classify",
                      {},
                    );
                    if (!clearedScene) setClearedScene(progress);
                    setCelebration(true);
                    latest.current = next;
                    setProgress(next);
                  })
                }
              >
                Retry assessment
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
                {progress?.assessment?.mocked !== false
                  ? "MOCK CLASSIFICATION"
                  : "TYPED CLASSIFICATION"}{" "}
                · This checkpoint uses authored answer keys. It does not certify
                practical model training or mastery.
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
                        setClearedScene(null);
                        setSceneActivity(undefined);
                        setBoost(0);
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
                {(theme === "temple-chase" || theme === "racing") && (
                  <label>
                    <input
                      type="checkbox"
                      checked={manualControls}
                      disabled={
                        progress?.game?.status !== "ready" ||
                        reducedMotion ||
                        multiplier === 0
                      }
                      onChange={(e) => setManualControls(e.target.checked)}
                    />{" "}
                    Manual obstacle controls
                  </label>
                )}
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
                    disabled={busy}
                    onChange={(e) => {
                      const enabled = e.target.checked;
                      if (
                        enabled &&
                        progress.game?.adventure?.assist === false &&
                        progress.game.status !== "ready" &&
                        progress.game.status !== "game-over"
                      ) {
                        void run(async () => {
                          const paused = progress.game?.status === "paused";
                          let next = await request<LearningProgress>(
                            "/learning/" + courseId + "/play",
                            { questionId: question.id, assist: true },
                          );
                          if (paused)
                            next = await request<LearningProgress>(
                              "/learning/" + courseId + "/pause",
                              { questionId: question.id },
                            );
                          latest.current = next;
                          setProgress(next);
                          setReducedMotion(true);
                        });
                      } else setReducedMotion(enabled);
                    }}
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
                {theme === "workshop"
                  ? "Complete each authored task to build at your workstation and illuminate the next progress station."
                  : theme === "wrestling"
                    ? "Use Strike or F to practice punches. Independent answers power attacks and weaken your opponent."
                    : theme === "racing"
                      ? "Independent answers give you a speed boost against your rival. Jump, slide and change lanes; guided navigation handles obstacles while you study."
                      : "Complete tasks to stay ahead of the guardian. Jump, slide and change lanes; guided navigation handles obstacles while you study."}
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
                    progress.game.status !== "active"
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
                      const acceptedTask = next.game?.status !== "game-over";
                      if (acceptedTask && next.activity) {
                        activitySerial.current += 1;
                        setSceneActivity({
                          id: `${question.id}:${activitySerial.current}`,
                          correct: next.activity.correct,
                          independent: next.activity.independent,
                        });
                      }
                      const cleared =
                        next.completedLevelIds.length >
                          progress!.completedLevelIds.length ||
                        next.finished ||
                        next.assessment?.status === "pending";
                      if (cleared) {
                        const old = progress!;
                        setClearedScene({
                          ...old,
                          game: old.game
                            ? {
                                ...old.game,
                                status: "paused",
                                elapsedMs:
                                  next.activity?.adventure?.elapsedMs ??
                                  old.game.elapsedMs,
                                adventure:
                                  next.activity?.adventure ??
                                  old.game.adventure,
                              }
                            : old.game,
                          levelProgress: old.levelProgress
                            ? {
                                ...old.levelProgress,
                                cleared: old.levelProgress.total,
                              }
                            : old.levelProgress,
                        });
                      }
                      setCelebration(cleared);
                      setBoost(
                        acceptedTask && next.activity?.independent
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
                      latest.current = next;
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
                  <PracticeTool
                    resource={resource}
                    courseId={courseId}
                    deliveryId={progress.question?.id}
                  />
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
