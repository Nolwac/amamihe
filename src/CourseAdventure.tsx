import { FloatingControl, useHudEditing } from "./FloatingHud";
import { useAccess, useVoiceCommands, interfaceLanguage } from "./Access";
import { normalizedSpeech } from "../shared/inclusion";
import { saveStudyPack } from "./OfflineStudy";
import LearningJourney from "./LearningJourney";
import SourceEvidence from "./SourceEvidence";
import FieldJournal from "./FieldJournal";
import { useBillboards } from "./billboardPresence";
import BillboardLinks from "./BillboardLinks";
import type { Presence } from "../shared/social";
import PracticeTool from "./PracticeTool";
import AudioControls from "./AudioControls";
import { gameAudio } from "./gameAudio";
import { lazy, Suspense, useEffect, useState, useRef, useMemo } from "react";
import type { LearningProgress, PublishedCourse } from "../shared/course";
import {
  changeWorldEvidence,
  emptyWorldEvidence,
  worldTaskAnswer,
  type WorldEvidence,
  type WorldAction,
} from "../shared/world-task";
import WorldTaskControls from "./WorldTaskControls";
import {
  advanceAdventureRuntime,
  type AdventureAction,
} from "../shared/adventure-runtime";
import "./courses.css";
const CourseScene = lazy(() => import("./CourseScene"));
async function request<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch("/api" + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Amamihe-Language": interfaceLanguage(),
    },
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
  playerId,
  onClose,
  onPoints,
  outfit,
  avatar = "amani",
  peers = [],
}: {
  courseId: string;
  playerId: string;
  onClose: () => void;
  onPoints: () => void;
  outfit: string;
  avatar?: import("../shared/avatars").CharacterId;
  peers?: Presence[];
}) {
  const { preferences: access, t, announce, speak, stopSpeech } = useAccess();
  const [dictation, setDictation] = useState("");
  const [studyStatus, setStudyStatus] = useState("");
  const pendingVoice = useRef<{
    id: string;
    answer: number;
    evidence: string;
  } | null>(null);
  const arrangingControls = useHudEditing();
  useEffect(() => {
    if (arrangingControls) void run(pauseForStudy);
  }, [arrangingControls]);
  const [decision, setDecision] = useState({ mode: "ollama", ready: false });
  useEffect(() => {
    void request<{
      mode: string;
      ready: boolean;
    }>("/decision-status")
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
  const [worldDraft, setWorldDraft] = useState<{
    questionId: string;
    evidence: WorldEvidence;
  }>();
  const [missionComplete, setMissionComplete] = useState(false);
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
      stopSpeech();
    },
    [stopSpeech],
  );
  const [started, setStarted] = useState(Date.now());
  const [sceneReady, setSceneReady] = useState(false);
  const [multiplier, setMultiplier] = useState(1);
  const [reducedMotion, setReducedMotion] = useState(
    () =>
      access.reducedMotion ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [clock, setClock] = useState(0);
  const [boost, setBoost] = useState(0);
  const [sceneActivity, setSceneActivity] =
    useState<import("./CourseScene").SceneGame["activity"]>();
  const activitySerial = useRef(0);
  const [manualControls, setManualControls] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const [selectedResource, setSelectedResource] = useState<string>();
  const [journeyOpen, setJourneyOpen] = useState(false);
  const taskPanel = useRef<HTMLDivElement>(null);
  const [controlNotice, setControlNotice] = useState("");
  const [renderHeight, setRenderHeight] = useState(access.dataSaver ? 144 : 0);
  useEffect(
    () => setRenderHeight(access.dataSaver ? 144 : 0),
    [access.dataSaver],
  );
  useEffect(
    () => setReducedMotion(access.reducedMotion),
    [access.reducedMotion],
  );
  useEffect(() => {
    const pause = (e: Event) => {
      if (
        (e as CustomEvent).detail &&
        latest.current?.game?.status === "active"
      )
        void gameCommand("pause").catch(() => {});
    };
    window.addEventListener("amamihe-access-open", pause);
    return () => window.removeEventListener("amamihe-access-open", pause);
  }, [courseId]);
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
    if (busy || progress?.game?.status !== "active" || !progress.question)
      return;
    let pending = false,
      alive = true;
    const poll = window.setInterval(async () => {
      if (pending || document.hidden) return;
      pending = true;
      const questionId = latest.current?.question?.id;
      const serial = gameCommandSerial.current;
      try {
        const next = await request<LearningProgress>(
          "/learning/" + courseId + "/tick",
          { questionId },
        );
        if (
          alive &&
          latest.current?.question?.id === questionId &&
          serial === gameCommandSerial.current
        )
          acceptGameSnapshot(next);
      } catch {
        if (
          alive &&
          latest.current?.question?.id === questionId &&
          serial === gameCommandSerial.current
        )
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
  }, [courseId, progress?.question?.id, progress?.game?.status, busy]);
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
    const commandSerial = gameCommandSerial.current;
    controlQueue.current = controlQueue.current
      .catch(() => {})
      .then(async () => {
        const live = latest.current;
        if (
          !mounted.current ||
          inputBusy.current ||
          commandSerial !== gameCommandSerial.current ||
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
          if (
            mounted.current &&
            commandSerial === gameCommandSerial.current &&
            acceptGameSnapshot(next)
          ) {
            setControlNotice("");
          }
        } catch (e) {
          if (mounted.current && commandSerial === gameCommandSerial.current)
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
        if (p.game?.status === "active" && p.question)
          p = await request<LearningProgress>(
            "/learning/" + courseId + "/pause",
            { questionId: p.question.id },
          );
        try {
          const draft = JSON.parse(localStorage.getItem(draftKey) || "null");
          setDictation(
            draft?.questionId === p.question?.id &&
              typeof draft?.dictation === "string"
              ? draft.dictation.slice(0, 2000)
              : "",
          );
          if (
            p.question?.worldTask &&
            draft?.questionId === p.question.id &&
            draft.worldEvidence &&
            (worldTaskAnswer(p.question.worldTask, draft.worldEvidence) !==
              null ||
              (draft.worldEvidence.kind === "fraction-bridge" &&
                Array.isArray(draft.worldEvidence.pieces) &&
                draft.worldEvidence.pieces.length === 0))
          ) {
            setWorldDraft({
              questionId: p.question.id,
              evidence: draft.worldEvidence,
            });
            setAnswer(
              worldTaskAnswer(p.question.worldTask, draft.worldEvidence),
            );
          } else if (
            !p.question?.worldTask &&
            draft?.questionId === p.question?.id &&
            Number.isInteger(draft.answer) &&
            draft.answer >= 0 &&
            draft.answer < p.question!.options.length
          )
            setAnswer(draft.answer);
        } catch {
          /* No local draft. */
        }
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
  }, [courseId, access.language]);
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
  useEffect(() => {
    pendingVoice.current = null;
    if (question && access.narration)
      announce(
        question.prompt +
          ". " +
          question.options.map((o, i) => `${i + 1}. ${o}`).join(". "),
        progress?.language || "en",
      );
  }, [question?.id, question?.prompt, progress?.language, access.narration]);
  const currentWorldEvidence = question?.worldTask
    ? worldDraft?.questionId === question.id
      ? worldDraft.evidence
      : emptyWorldEvidence(question.worldTask)
    : undefined;
  const sceneQuestion =
    display?.question ??
    (progress?.finished ? progress.worldAchievement?.question : undefined);
  const sceneEvidence = holdingScene
    ? sceneActivity?.worldEvidence
    : (currentWorldEvidence ??
      (progress?.finished ? progress.worldAchievement?.evidence : undefined));
  const earnedActivity =
    sceneActivity ??
    (progress?.finished && progress.worldAchievement
      ? {
          id: `saved:${progress.worldAchievement.question.id}`,
          questionId: progress.worldAchievement.question.id,
          correct: true,
          independent: true,
          worldTask: progress.worldAchievement.question.worldTask,
          worldEvidence: progress.worldAchievement.evidence,
        }
      : undefined);
  function worldAction(action: WorldAction) {
    if (!question?.worldTask || !actionEnabled) return;
    const evidence = changeWorldEvidence(
      question.worldTask,
      currentWorldEvidence,
      action,
    );
    setWorldDraft({ questionId: question.id, evidence });
    setAnswer(worldTaskAnswer(question.worldTask, evidence));
  }
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
  const playbackLabel = !sceneReady
    ? "Loading adventure…"
    : progress?.game?.status === "active"
      ? t("Pause section")
      : progress?.game?.status === "paused"
        ? t("Resume section")
        : t("Start section");
  const draftKey = `amamihe-draft:${playerId}:${courseId}`;
  useEffect(() => {
    if (!progress?.question) return;
    try {
      localStorage.setItem(
        draftKey,
        JSON.stringify({
          questionId: progress.question.id,
          answer,
          worldEvidence: currentWorldEvidence,
          dictation: dictation.slice(0, 2000),
        }),
      );
    } catch {
      /* Storage is optional. */
    }
  }, [answer, dictation, worldDraft, progress?.question?.id]);
  const submitting = useRef(false);
  function continueMission() {
    if (progress?.finished) {
      onClose();
      return;
    }
    setCelebration(false);
    setMissionComplete(false);
    setClearedScene(null);
    setSceneActivity(undefined);
    setBoost(0);
    setStarted(Date.now());
  }
  async function submitTask() {
    if (
      submitting.current ||
      !question ||
      !progress ||
      progress.game?.status !== "active" ||
      answer === null
    )
      return;
    submitting.current = true;
    try {
      const next = await request<LearningProgress>(
        "/learning/" + courseId + "/answer",
        {
          questionId: question.id,
          answer,
          ...(question.worldTask
            ? { worldEvidence: currentWorldEvidence }
            : {}),
          elapsedMs: Math.min(3600000, Math.max(0, Date.now() - started)),
        },
      );
      const acceptedTask = next.game?.status !== "game-over";
      if (acceptedTask && next.activity) {
        activitySerial.current += 1;
        setSceneActivity({
          id: `${question.id}:${activitySerial.current}`,
          correct: next.activity.correct,
          independent: next.activity.independent,
          questionId: question.id,
          worldTask: question.worldTask,
          worldEvidence: currentWorldEvidence,
        });
      }
      const cleared =
        next.levelId !== progress.levelId ||
        next.completedLevelIds.length > progress.completedLevelIds.length ||
        next.finished ||
        next.assessment?.status === "pending";
      const mission = Boolean(
        question.worldTask &&
        acceptedTask &&
        next.activity?.independent &&
        !cleared,
      );
      setMissionComplete(mission);
      if (cleared || mission)
        setClearedScene({
          ...progress,
          game: progress.game
            ? {
                ...progress.game,
                status: "paused",
                elapsedMs:
                  next.activity?.adventure?.elapsedMs ??
                  progress.game.elapsedMs,
                adventure: next.activity?.adventure ?? progress.game.adventure,
              }
            : progress.game,
          levelProgress: progress.levelProgress
            ? {
                ...progress.levelProgress,
                cleared: cleared
                  ? progress.levelProgress.total
                  : (next.levelProgress?.cleared ??
                    progress.levelProgress.cleared),
              }
            : progress.levelProgress,
        });
      setCelebration(cleared || mission);
      setBoost(
        acceptedTask && next.activity?.independent
          ? Math.max(
              0.3,
              1 -
                Math.min(
                  1,
                  next.activity.elapsedMs /
                    Math.max(1000, progress.game?.budgetMs || 60000),
                ),
            )
          : 0,
      );
      latest.current = next;
      setProgress(next);
      setAnswer(null);
      setDictation("");
      setHelp("");
      setStarted(Date.now());
      onPoints();
    } finally {
      submitting.current = false;
    }
  }
  async function pauseForStudy() {
    if (latest.current?.game?.status === "active") await gameCommand("pause");
  }
  async function journeyActivity(
    activity: string,
    data: Record<string, unknown> = {},
  ) {
    const result = await request<{
      progress: LearningProgress;
      feedback?: string;
    }>("/learning/" + courseId + "/journey", { activity, ...data });
    latest.current = result.progress;
    setProgress(result.progress);
    return result.feedback;
  }
  function openResource(id: string) {
    void run(async () => {
      await pauseForStudy();
      setSelectedResource(id);
    });
  }
  async function replay(scope: "course" | "level", levelId?: string) {
    const next = await request<LearningProgress>(
      "/learning/" + courseId + "/replay",
      { scope, levelId, checkpoint: latest.current?.checkpoint },
    );
    ++gameCommandSerial.current;
    latest.current = next;
    setProgress(next);
    setAnswer(null);
    setHelp("");
    setCelebration(false);
    setMissionComplete(false);
    setClearedScene(null);
    setSceneActivity(undefined);
    setSelectedResource(undefined);
    setStarted(Date.now());
  }
  useVoiceCommands((command, respond) => {
    const lang = progress?.language || "en";
    if (command.kind === "untimed") {
      if (progress?.game?.status === "ready") {
        setMultiplier(0);
        setTaskOpen(true);
        respond(t("Untimed"));
      } else respond(t("This command is not available in the current place."));
      return true;
    }
    if (command.kind === "hint" && question) {
      void run(async () => {
        await pauseForStudy();
        const result = await request<{ hint: string; explanation: string }>(
          "/learning/" + courseId + "/help",
          { questionId: question.id },
        );
        setHelp(result.hint + " " + result.explanation);
        setProgress(await request<LearningProgress>("/learning/" + courseId));
        respond(result.hint + " " + result.explanation, lang);
      });
      return true;
    }
    if (command.kind === "read") {
      if (!question) return false;
      setTaskOpen(true);
      void run(async () => {
        await pauseForStudy();
        respond(
          question.prompt +
            ". " +
            question.options.map((o, i) => `${i + 1}. ${o}`).join(". "),
          lang,
        );
      });
      return true;
    }
    if (command.kind === "where" || command.kind === "nearby") {
      respond(
        [
          progress?.level?.title,
          progress?.game?.status,
          question?.prompt,
          question?.worldTask
            ? document.querySelector(".world-task-controls")?.textContent
            : "",
        ]
          .filter(Boolean)
          .join(". "),
        lang,
      );
      return true;
    }
    if (command.kind === "pause" || command.kind === "start") {
      void run(async () => {
        await gameCommand(command.kind === "pause" ? "pause" : "play");
        respond(
          t(command.kind === "pause" ? t("Pause section") : t("Start section")),
        );
      });
      return true;
    }
    if (command.kind === "cancel") {
      pendingVoice.current = null;
      respond(t("Cancel"));
      return true;
    }
    if (command.kind === "answer" && question && !question.worldTask) {
      if (command.index >= question.options.length) {
        respond(
          t(
            "Command not recognized. Open the command guide or type a command.",
          ),
        );
        return true;
      }
      setAnswer(command.index);
      setTaskOpen(true);
      pendingVoice.current = null;
      respond(`${command.index + 1}. ${question.options[command.index]}`, lang);
      return true;
    }
    if (command.kind === "dictate" && question && !question.worldTask) {
      const plain = (value: string) =>
        normalizedSpeech(value)
          .replace(/[^\p{L}\p{N}\s]/gu, "")
          .trim();
      const matches = question.options
        .map((o, i) => (plain(o) === plain(command.text) ? i : -1))
        .filter((i) => i >= 0);
      setDictation(command.text);
      setTaskOpen(true);
      if (matches.length === 1) {
        setAnswer(matches[0]);
        respond(question.options[matches[0]], lang);
      } else respond(command.text, lang);
      return true;
    }
    if (
      command.kind === "beam" ||
      command.kind === "relay" ||
      command.kind === "undo" ||
      command.kind === "reset"
    ) {
      if (!question?.worldTask || !actionEnabled) return false;
      if (
        command.kind === "beam" &&
        question.worldTask.kind === "fraction-bridge"
      )
        worldAction({ kind: "add-piece", units: command.units });
      else if (
        command.kind === "relay" &&
        question.worldTask.kind === "circuit"
      )
        worldAction({ kind: "switch", index: command.index });
      else if (
        command.kind === "undo" &&
        question.worldTask.kind === "fraction-bridge"
      )
        worldAction({ kind: "remove-piece" });
      else if (command.kind === "reset") worldAction({ kind: "reset" });
      else return false;
      pendingVoice.current = null;
      setTaskOpen(true);
      respond(command.kind === "reset" ? t("Cancel") : t("Confirm"));
      return true;
    }
    if (command.kind === "submit" || command.kind === "confirm") {
      if (!question || answer === null || !actionEnabled) {
        respond(t("This command is not available in the current place."));
        return true;
      }
      const identity = {
        id: question.id,
        answer,
        evidence: JSON.stringify(currentWorldEvidence || null),
      };
      if (command.kind === "submit") {
        pendingVoice.current = identity;
        respond(t("Your answer is selected. Confirm before submitting."));
        return true;
      }
      if (JSON.stringify(pendingVoice.current) !== JSON.stringify(identity)) {
        pendingVoice.current = null;
        respond(t("Nothing is waiting for confirmation."));
        return true;
      }
      pendingVoice.current = null;
      void run(submitTask);
      return true;
    }
    return false;
  }, 10);
  return (
    <section
      className="course-adventure course-overlay"
      aria-label="Published course adventure"
    >
      <header className="course-bar">
        <div data-hud-obstacle="course-title">
          <span className="eyebrow">
            COURSE ADVENTURE · VERSION {progress?.version || "…"}
          </span>
          <h1>{display?.level?.title || "Restoring your adventure"}</h1>
        </div>
        <FloatingControl id="adventure-tools" label="adventure tools">
          <div className="adventure-header-actions">
            <AudioControls />
            <button
              className="course-secondary"
              aria-label="Open learning journey"
              aria-expanded={journeyOpen}
              onClick={() =>
                void run(async () => {
                  await pauseForStudy();
                  setSelectedResource(undefined);
                  setJourneyOpen((v) => !v);
                })
              }
            >
              ◇
            </button>
            {question &&
              !holdingScene &&
              progress?.game?.status !== "game-over" && (
                <button
                  className="course-secondary"
                  disabled={busy || !sceneReady}
                  aria-label={playbackLabel}
                  title={playbackLabel}
                  onClick={() =>
                    run(() =>
                      gameCommand(
                        progress?.game?.status === "active" ? "pause" : "play",
                      ),
                    )
                  }
                >
                  <span aria-hidden="true">
                    {progress?.game?.status === "active" ? "Ⅱ" : "▶"}
                  </span>
                </button>
              )}
            <details className="adventure-replay">
              <summary aria-label="Replay adventure">↻</summary>
              <div className="compact-popover">
                <p>
                  Replay without a limit. Earned progress and points stay saved.
                </p>
                {progress?.canResumeCheckpoint && (
                  <button
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        const next = await request<LearningProgress>(
                          "/learning/" + courseId + "/resume-checkpoint",
                          { checkpoint: progress.checkpoint },
                        );
                        ++gameCommandSerial.current;
                        latest.current = next;
                        setProgress(next);
                        setAnswer(null);
                        setCelebration(false);
                        setClearedScene(null);
                        setHelp("");
                      })
                    }
                  >
                    Resume original checkpoint
                  </button>
                )}
                {progress?.replayableLevels?.map((level) => (
                  <button
                    key={level.id}
                    disabled={busy}
                    onClick={() => void run(() => replay("level", level.id))}
                  >
                    Replay level: {level.title}
                  </button>
                ))}
                <button
                  disabled={busy}
                  onClick={() => void run(() => replay("course"))}
                >
                  Replay entire course
                </button>
              </div>
            </details>
            <details className="resource-menu">
              <summary aria-label="World resources">▤</summary>
              <div className="compact-popover">
                {progress?.resources?.map((resource) => (
                  <button
                    key={resource.id}
                    onClick={(event) => {
                      event.currentTarget
                        .closest("details")
                        ?.removeAttribute("open");
                      openResource(resource.id);
                    }}
                  >
                    {resource.kind === "reading" ? "Read" : "Practise"}:{" "}
                    {resource.title}
                  </button>
                ))}
              </div>
            </details>
            <button
              className="course-secondary adventure-task-toggle"
              aria-expanded={taskOpen}
              aria-controls="adventure-task-panel"
              onClick={() => setTaskOpen((value) => !value)}
            >
              <span aria-hidden="true">{taskOpen ? "×" : "?"}</span>
              <span className="sr-only">
                {taskOpen ? t("Hide task") : t("Show task")}
              </span>
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
              <span aria-hidden="true">⌂</span>
              <span className="sr-only">{t("Return to city")}</span>
            </button>
          </div>
        </FloatingControl>
      </header>
      <div
        className="adventure-grid"
        data-task-panel={taskOpen ? "open" : "closed"}
      >
        <div className="adventure-world">
          <Suspense fallback={<p>Loading 3D scenery…</p>}>
            <CourseScene
              question={sceneQuestion}
              worldEvidence={sceneEvidence}
              onWorldAction={worldAction}
              onWorldSubmit={() => {
                if (holdingScene && !busy) continueMission();
                else if (actionEnabled) void run(submitTask);
              }}
              resources={display?.resources}
              selectedResource={selectedResource}
              onResource={openResource}
              billboards={ads}
              theme={theme}
              worldStyle={display?.level?.worldStyle}
              outfit={outfit}
              avatar={avatar}
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
                activity: earnedActivity,
              }}
            />
          </Suspense>
          <FloatingControl id="adventure-status" label="adventure status">
            <details className="adventure-status-menu">
              <summary aria-label="Adventure status">◎</summary>
              <div className="compact-popover">
                <div className="adventure-scene-label">
                  <span>
                    {(display?.level?.worldStyle || theme).replaceAll("-", " ")}{" "}
                    adventure
                  </span>
                  <small>
                    {display?.level?.worldStyle === "story-trail"
                      ? "Follow story clues along the woodland trail."
                      : display?.level?.worldStyle === "garden"
                        ? "Count and solve to grow your garden."
                        : theme === "temple-chase"
                          ? "Complete tasks to escape the guardian."
                          : theme === "racing"
                            ? "Independent answers boost your pace."
                            : theme === "wrestling"
                              ? "Independent answers power your strikes."
                              : "Build skills at each workshop checkpoint."}
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
                    {decision.ready
                      ? "LOCAL LEARNING GUIDE"
                      : "LEARNING GUIDE STARTING"}
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
                  {theme === "temple-chase" &&
                    display?.level?.worldStyle !== "story-trail" &&
                    adventure && (
                      <span>
                        Guardian gap{" "}
                        {Math.max(0, adventure.guardianGap).toFixed(1)}m
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
                          : t("Manual obstacle controls")}
                  </span>
                  {!sceneReady && (
                    <span>Loading your character and world…</span>
                  )}
                  {progress?.game?.status === "paused" && (
                    <span>Paused · progress saved</span>
                  )}
                </div>
              </div>
            </details>
          </FloatingControl>
          <FloatingControl id="adventure-timer" label="section timer">
            {" "}
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
          </FloatingControl>
          {theme !== "workshop" && (
            <FloatingControl id="adventure-movement" label="adventure movement">
              {" "}
              <div
                className="adventure-pad"
                role="group"
                aria-label="Adventure movement controls"
                tabIndex={0}
              >
                <details className="movement-menu">
                  <summary aria-label="Movement controls">✥</summary>
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
                </details>
                {controlNotice && <small role="status">{controlNotice}</small>}
              </div>
            </FloatingControl>
          )}
        </div>
        <div
          ref={taskPanel}
          className="adventure-content"
          id="adventure-task-panel"
          hidden={!taskOpen}
        >
          <BillboardLinks ads={ads} />
          {progress?.practiceOnly && (
            <p role="status">{progress.blockReason}</p>
          )}
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
          ) : progress?.selection?.status === "pending" ? (
            <section aria-label="Pending learning route">
              <h2>Your learning guide is choosing the next activity</h2>
              <p>
                {progress.selection.reason ||
                  "Your checkpoint and responses are saved."}
              </p>
              <button
                className="primary"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    const next = await request<LearningProgress>(
                      "/learning/" + courseId + "/select",
                      {},
                    );
                    latest.current = next;
                    setProgress(next);
                  })
                }
              >
                Retry learning route
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
                  ? progress.replayMode === "level"
                    ? "Level replay complete"
                    : "Course checkpoints complete"
                  : missionComplete
                    ? "Mission accepted"
                    : "Level cleared"}
              </h2>
              <p>
                {missionComplete
                  ? "Your construction worked. Try it in the world, then continue to the next mission."
                  : progress?.result?.label ||
                    "Your independent responses have been recorded."}
              </p>
              <p className="learning-note">
                {progress?.assessment?.provider === "historical-checkpoint"
                  ? "SAVED LEARNING CHECKPOINT"
                  : "LOCAL LEARNING ASSESSMENT"}{" "}
                {display?.level?.worldStyle
                  ? " · This checkpoint checks your answers against authored keys. Practise independently; points alone do not prove what you have learned."
                  : " · This checkpoint uses authored answer keys. It does not certify practical model training or mastery."}
              </p>
              {!missionComplete && progress?.assessment && (
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
              {!missionComplete && (
                <strong>+{progress?.result?.awardedPoints || 0} points</strong>
              )}
              {progress?.finished && (
                <p className="earned-badge">
                  🏅 Checkpoint finisher badge earned · visit your wardrobe to
                  unlock gear.
                </p>
              )}
              {progress?.finished && !progress.journey?.completed && (
                <>
                  <p>
                    Finish your learning camp: goals, reasoning, resources,
                    rehearsal, evidence review and takeaways. Earned checkpoints
                    are saved.
                  </p>
                  <button
                    className="course-secondary"
                    onClick={() => setJourneyOpen(true)}
                  >
                    Finish learning journey
                  </button>
                </>
              )}
              <button className="primary" onClick={continueMission}>
                {progress?.finished
                  ? progress.journey?.completed
                    ? "Course complete · back to Venture City"
                    : "Save & return to Venture City"
                  : t("Continue adventure")}
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
                {t("Return to city")}
              </button>
            </section>
          ) : question ? (
            <section aria-label="Authored learning task">
              <span className="eyebrow">
                {progress?.retry ? "INDEPENDENT RETRY" : "AUTHORED TASK"} ·{" "}
                {progress!.questionIndex + 1}
              </span>
              {progress?.sourceLanguage &&
                progress.language !== access.language && (
                  <p>
                    {t(
                      "This lesson keeps its authored language. Your progress is preserved.",
                    )}
                  </p>
                )}
              <h2
                lang={progress?.language || "en"}
                dir={progress?.language?.startsWith("ar") ? "rtl" : "ltr"}
              >
                {question.prompt}
              </h2>
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
                    {t("Manual obstacle controls")}
                  </label>
                )}
                <label>
                  {t("Graphics")}{" "}
                  <select
                    aria-label={t("Adventure graphics")}
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
                  {t("Section timing")}{" "}
                  <select
                    aria-label={t("Section timing")}
                    value={multiplier}
                    disabled={progress?.game?.status !== "ready"}
                    onChange={(e) => setMultiplier(Number(e.target.value))}
                  >
                    <option value={1}>{t("Tutor time")}</option>
                    <option value={2}>{t("Double time")}</option>
                    <option value={0}>{t("Untimed")}</option>
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
                  {t("Reduced motion")}
                </label>
                {
                  <button
                    className="course-secondary"
                    onClick={() =>
                      run(async () => {
                        if (progress?.game?.status === "active")
                          await gameCommand("pause");
                        speak(
                          question.prompt +
                            ". " +
                            question.options
                              .map((o, i) => `${i + 1}. ${o}`)
                              .join(". "),
                          progress?.language || "en",
                        );
                      })
                    }
                  >
                    {t("Read task aloud")}
                  </button>
                }
              </div>
              <p className="gate-help">
                {theme === "workshop"
                  ? question.worldTask?.kind === "fraction-bridge"
                    ? "Build the requested span from real beam lengths, test it, then cross your verified bridge. Pause to plan or read the field guide."
                    : question.worldTask?.kind === "circuit"
                      ? "Operate the relay switches to achieve the mission signal. Test your arrangement to restore the lighthouse or open the maintenance hatch."
                      : display?.level?.worldStyle === "garden"
                        ? "Solve the garden challenges to grow new flowers. You can pause, sketch and ask your helper to read."
                        : "Complete each authored task to build at your workstation and illuminate the next progress station."
                  : theme === "wrestling"
                    ? "Use Strike or F to practice punches. Independent answers power attacks and weaken your opponent."
                    : theme === "racing"
                      ? "Independent answers give you a speed boost against your rival. Jump, slide and change lanes; guided navigation handles obstacles while you study."
                      : display?.level?.worldStyle === "story-trail"
                        ? "Follow the story clues through the woods. Guided navigation handles trail obstacles while you read."
                        : "Complete tasks to stay ahead of the guardian. Jump, slide and change lanes; guided navigation handles obstacles while you study."}
              </p>
              {question.worldTask && currentWorldEvidence ? (
                <WorldTaskControls
                  task={question.worldTask}
                  evidence={currentWorldEvidence}
                  onAction={worldAction}
                  disabled={!actionEnabled}
                />
              ) : (
                <div
                  className="answers"
                  lang={progress?.language || "en"}
                  dir={progress?.language?.startsWith("ar") ? "rtl" : "ltr"}
                >
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
              )}
              {progress?.feedback && (
                <p className="help-box">{progress.feedback}</p>
              )}
              <label>
                {t("Practice explanation")}
                <textarea
                  aria-label={t("Practice explanation")}
                  value={dictation}
                  maxLength={2000}
                  onChange={(e) => setDictation(e.target.value)}
                />
              </label>
              <small>
                {t(
                  "Practice notes stay on this device and do not submit an answer.",
                )}
              </small>
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
                  Practise another tutor-authored question to clear this
                  checkpoint.
                </p>
              )}
              <div className="course-task-actions">
                <button
                  className="primary"
                  disabled={
                    !online ||
                    busy ||
                    answer === null ||
                    !progress?.game ||
                    progress.game.status !== "active"
                  }
                  onClick={() => void run(submitTask)}
                >
                  {busy ? t("Saving\u2026") : t("Submit task")}
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
                  {t("Show authored help")}
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
              <h3>{t("Workbench resources")}</h3>
              <button
                className="course-secondary"
                disabled={busy || !online}
                onClick={() =>
                  run(async () => {
                    await pauseForStudy();
                    const course = await request<PublishedCourse>(
                      `/courses/${courseId}?version=${progress.version}`,
                    );
                    await saveStudyPack(course);
                    setStudyStatus(
                      t(
                        "Saved public readings. Open Saved lessons in accessibility settings. Offline availability depends on browser storage.",
                      ),
                    );
                  })
                }
              >
                {t("Save lesson for offline study")}
              </button>
              {studyStatus && <p role="status">{studyStatus}</p>}
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
                  <pre lang={progress.language || "en"}>{resource.content}</pre>
                  <SourceEvidence
                    resource={resource}
                    courseId={courseId}
                    version={progress.version}
                  />
                  <PracticeTool
                    playerId={playerId}
                    resource={resource}
                    courseId={courseId}
                    key={resource.id + progress.practiceDeliveryId}
                    deliveryId={progress.practiceDeliveryId}
                    onOpen={pauseForStudy}
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
      {journeyOpen && progress?.journey && (
        <LearningJourney
          progress={progress}
          onActivity={journeyActivity}
          onResource={openResource}
          onClose={() => setJourneyOpen(false)}
        />
      )}
      {selectedResource &&
        progress?.resources?.find((r) => r.id === selectedResource) && (
          <FieldJournal
            key={selectedResource}
            playerId={playerId}
            resource={progress.resources.find(
              (r) => r.id === selectedResource,
            )!}
            courseId={courseId}
            version={progress.version}
            language={progress.language || "en"}
            deliveryId={progress.practiceDeliveryId}
            onChallenge={() => {
              setSelectedResource(undefined);
              setTaskOpen(true);
              stopSpeech();
            }}
            onStudy={() =>
              journeyActivity("study", { resourceId: selectedResource }).then(
                () => {},
              )
            }
            onPractice={pauseForStudy}
            onClose={() => {
              setSelectedResource(undefined);
              stopSpeech();
            }}
          />
        )}
    </section>
  );
}
