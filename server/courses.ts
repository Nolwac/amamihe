import { KIDS_COURSES } from "../shared/catalogue.js";
import {
  LEARNING_ROLES,
  type LearningRole,
  type LearningJourney,
} from "../shared/learning-journey.js";
import {
  assessLevel,
  type Assessment,
  type Evidence,
  type ClassificationProvider,
} from "./assessment.js";
import {
  newGame,
  tickGame,
  applyGameAction,
  applyGameTask,
} from "./gameplay.js";
import {
  ADVENTURE_ACTIONS,
  type AdventureAction,
  type AdventureState,
} from "../shared/adventure-runtime.js";
import type { GameState } from "../shared/gameplay.js";
import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Authentication } from "./auth.js";
import type { Database, DatabaseQueries } from "./db.js";
import {
  validateCourse,
  type CourseDefinition,
  type CourseDraft,
  type CourseLevel,
  type CourseQuestion,
  type CourseSummary,
  type LearningProgress,
  type PublicCourseDefinition,
  type PublicCourseLevel,
} from "../shared/course.js";
import { blankCourse, storytellingCourse } from "./course-template.js";
import { worldTaskAnswer } from "../shared/world-task.js";
import { playableCourses } from "./playable-courses.js";
import {
  decisionConfiguration,
  DECISION_IDENTITY,
} from "./decision-provider.js";
import {
  prepareLearningSelection,
  permittedEntryLevels,
} from "./learning-selector.js";
import type { LearningSelection } from "../shared/decision.js";

/** Draft revisions and published versions deliberately have separate counters. */
export async function initializeCourseSchema(db: DatabaseQueries) {
  await db.exec(`
CREATE TABLE IF NOT EXISTS course_drafts (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES players(id),
  revision INTEGER NOT NULL DEFAULT 1,
  published_version INTEGER,
  definition JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS course_drafts_owner ON course_drafts(owner_id);
CREATE TABLE IF NOT EXISTS course_versions (
  course_id TEXT NOT NULL REFERENCES course_drafts(id),
  version INTEGER NOT NULL,
  source_revision INTEGER NOT NULL,
  definition JSONB NOT NULL,
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(course_id, version),
  UNIQUE(course_id, source_revision)
);
CREATE TABLE IF NOT EXISTS course_enrollments (
  course_id TEXT NOT NULL,
  player_id TEXT NOT NULL REFERENCES players(id),
  version INTEGER NOT NULL,
  progress JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(course_id, player_id),
  FOREIGN KEY(course_id, version) REFERENCES course_versions(course_id, version)
);
CREATE TABLE IF NOT EXISTS course_assessments (
 course_id TEXT NOT NULL, player_id TEXT NOT NULL, level_id TEXT NOT NULL, result JSONB NOT NULL,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY(course_id,player_id,level_id),
 FOREIGN KEY(course_id,player_id) REFERENCES course_enrollments(course_id,player_id)
);
CREATE TABLE IF NOT EXISTS course_assessment_runs (
 course_id TEXT NOT NULL,player_id TEXT NOT NULL,level_id TEXT NOT NULL,attempt INTEGER NOT NULL,result JSONB NOT NULL,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY(course_id,player_id,level_id,attempt),
 FOREIGN KEY(course_id,player_id) REFERENCES course_enrollments(course_id,player_id)
);
INSERT INTO course_assessment_runs(course_id,player_id,level_id,attempt,result)
SELECT course_id,player_id,level_id,0,result FROM course_assessments ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS course_decisions (
 course_id TEXT NOT NULL, player_id TEXT NOT NULL, decision_id TEXT NOT NULL,
 level_id TEXT NOT NULL, selection JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY(course_id,player_id,decision_id),
 FOREIGN KEY(course_id,player_id) REFERENCES course_enrollments(course_id,player_id)
);
CREATE TABLE IF NOT EXISTS course_chunks (
  course_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  delivery_id TEXT NOT NULL,
  level_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  retry BOOLEAN NOT NULL,
  answer INTEGER NOT NULL,
  attempt INTEGER NOT NULL DEFAULT 0,
  correct BOOLEAN NOT NULL,
  assisted BOOLEAN NOT NULL,
  elapsed_ms INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(course_id, player_id, delivery_id),
  FOREIGN KEY(course_id, player_id) REFERENCES course_enrollments(course_id, player_id)
);
ALTER TABLE course_chunks ADD COLUMN IF NOT EXISTS attempt INTEGER NOT NULL DEFAULT 0;
ALTER TABLE course_chunks ADD COLUMN IF NOT EXISTS world_evidence JSONB;
`);
}

type DraftRow = {
  id: string;
  owner_id: string;
  revision: number;
  published_version: number | null;
  definition: CourseDefinition;
};
export type StoredProgress = {
  worldAchievement?: LearningProgress["worldAchievement"];
  previousProviderMigrated?: boolean;
  resumeQuestionId?: string;
  selection?: LearningSelection;
  entryDecisionNeeded?: boolean;
  questionSelectionKey?: string;
  categorySelectionKey?: string;
  lastAwardedPoints?: number;
  attemptCounter?: number;
  resumeCheckpoint?: StoredProgress;
  journey?: {
    observed: LearningRole[];
    goal: string;
    reasoning: string;
    reflection: string;
    reasoningPrompt?: string;
  };
  revealedQuestionIds?: string[];
  attempt?: number;
  deliverySerial?: number;
  replayMode?: "course" | "level";
  replayCompletedLevelIds?: string[];
  practiceOnly?: boolean;
  levelId: string;
  questionIndex: number;
  retry: boolean;
  satisfiedQuestionIds: string[];
  assisted: boolean;
  feedback?: string;
  game?: GameState;
  adventureCheckpoint?: AdventureState;
  activity?: LearningProgress["activity"];
  completedLevelIds: string[];
  usedRetryQuestionIds: string[];
  points: number;
  finished: boolean;
  blocked: boolean;
  blockReason?: string;
  assessment?: Assessment;
  assessmentLevelId?: string;
  result?: LearningProgress["result"];
};
type EnrollmentRow = { version: number; progress: StoredProgress };
class CourseError extends Error {
  constructor(
    message: string,
    readonly status = 400,
    readonly issues?: ReturnType<typeof validateCourse>,
  ) {
    super(message);
  }
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new CourseError("Expected an object.");
  return value as Record<string, unknown>;
}
function integer(value: unknown, label: string, min = 1, max = 2_147_483_647) {
  if (!Number.isInteger(value) || Number(value) < min || Number(value) > max)
    throw new CourseError(`Invalid ${label}.`);
  return Number(value);
}
function identifier(value: unknown) {
  if (typeof value !== "string" || !value || value.length > 300)
    throw new CourseError("Invalid identifier.");
  return value;
}

/** Incomplete drafts are saveable; malformed or unbounded documents are not. */
function draftDefinition(value: unknown): CourseDefinition {
  const data = object(value);
  const text = (v: unknown, max: number) =>
    typeof v === "string" && v.length <= max;
  const strings = (v: unknown, max = 100) =>
    Array.isArray(v) && v.length <= max && v.every((x) => text(x, 100));
  const list = (
    v: unknown,
    max: number,
    validate: (row: Record<string, unknown>) => boolean,
  ) =>
    Array.isArray(v) &&
    v.length <= max &&
    v.every(
      (x) => x && typeof x === "object" && !Array.isArray(x) && validate(x),
    );
  const question = (q: Record<string, unknown>) =>
    text(q.id, 100) &&
    text(q.prompt, 4000) &&
    Array.isArray(q.options) &&
    q.options.length <= 8 &&
    q.options.every((x) => text(x, 2000)) &&
    Number.isInteger(q.answer) &&
    Number(q.answer) >= -1 &&
    Number(q.answer) <= 7 &&
    text(q.hint, 4000) &&
    text(q.explanation, 8000) &&
    text(q.rubric, 4000) &&
    (q.retryFor === undefined || text(q.retryFor, 100));
  if (
    !text(data.title, 160) ||
    !text(data.summary, 4000) ||
    !text(data.language, 80) ||
    !list(
      data.concepts,
      100,
      (c) => text(c.id, 100) && text(c.title, 160) && strings(c.prerequisites),
    ) ||
    !list(
      data.resources,
      100,
      (r) =>
        text(r.id, 100) &&
        text(r.title, 160) &&
        ["reading", "video", "notebook", "javascript", "drawing"].includes(
          String(r.kind),
        ) &&
        text(r.content, 80_000) &&
        text(r.url, 2000) &&
        text(r.source, 2000),
    ) ||
    !list(
      data.levels,
      50,
      (l) =>
        text(l.id, 100) &&
        text(l.title, 160) &&
        text(l.conceptId, 100) &&
        strings(l.prerequisites, 50) &&
        ["workshop", "temple-chase", "racing", "wrestling"].includes(
          String(l.theme),
        ) &&
        ["quiz", "notebook", "javascript", "drawing"].includes(
          String(l.widget),
        ) &&
        Number.isInteger(l.timeLimitSeconds) &&
        Number(l.timeLimitSeconds) >= 0 &&
        Number(l.timeLimitSeconds) <= 86400 &&
        Number.isInteger(l.points) &&
        Number(l.points) >= 0 &&
        Number(l.points) <= 10000 &&
        strings(l.resourceIds) &&
        list(l.questions, 24, question) &&
        list(l.retryQuestions, 24, question),
    )
  )
    throw new CourseError("The course document has an invalid structure.");
  // Strip unrecognized properties instead of persisting arbitrary payload data.
  return {
    title: data.title as string,
    summary: data.summary as string,
    language: data.language as string,
    concepts: (data.concepts as CourseDefinition["concepts"]).map((c) => ({
      id: c.id,
      title: c.title,
      prerequisites: c.prerequisites,
    })),
    resources: (data.resources as CourseDefinition["resources"]).map((r) => ({
      id: r.id,
      title: r.title,
      kind: r.kind,
      content: r.content,
      url: r.url,
      source: r.source,
      ...(r.practiceCheck ? { practiceCheck: r.practiceCheck } : {}),
    })),
    levels: (data.levels as CourseLevel[]).map((l) => ({
      ...levelMetadata(l),
      questions: l.questions.map(copyQuestion),
      retryQuestions: l.retryQuestions.map(copyQuestion),
    })),
  };
}
const copyQuestion = (q: CourseQuestion): CourseQuestion => ({
  id: q.id,
  prompt: q.prompt,
  options: q.options,
  answer: q.answer,
  hint: q.hint,
  explanation: q.explanation,
  rubric: q.rubric,
  ...(typeof q.retryFor === "string" ? { retryFor: q.retryFor } : {}),
  ...(q.worldTask ? { worldTask: structuredClone(q.worldTask) } : {}),
});
const publicQuestion = (q: CourseQuestion) => ({
  id: q.id,
  prompt: q.prompt,
  options: q.options,
  ...(q.worldTask ? { worldTask: structuredClone(q.worldTask) } : {}),
});
function levelMetadata(l: CourseLevel) {
  return {
    id: l.id,
    title: l.title,
    conceptId: l.conceptId,
    prerequisites: l.prerequisites,
    theme: l.theme,
    timeLimitSeconds: l.timeLimitSeconds,
    points: l.points,
    resourceIds: l.resourceIds,
    ...(l.worldStyle ? { worldStyle: l.worldStyle } : {}),
    widget: l.widget,
  };
}
function publicDefinition(d: CourseDefinition): PublicCourseDefinition {
  return {
    title: d.title,
    summary: d.summary,
    language: d.language,
    concepts: d.concepts,
    resources: d.resources,
    levels: d.levels.map((l): PublicCourseLevel => ({
      ...levelMetadata(l),
      questions: l.questions.map(publicQuestion),
      retryQuestions: l.retryQuestions.map(publicQuestion),
    })),
  };
}
function draft(row: DraftRow): CourseDraft {
  return {
    id: row.id,
    ownerId: row.owner_id,
    revision: row.revision,
    publishedVersion: row.published_version,
    definition: row.definition,
  };
}
async function ownedDraft(
  db: DatabaseQueries,
  id: string,
  ownerId: string,
  lock = false,
) {
  const row = (
    await db.query<DraftRow>(
      `SELECT * FROM course_drafts WHERE id=$1 AND owner_id=$2${lock ? " FOR UPDATE" : ""}`,
      [id, ownerId],
    )
  ).rows[0];
  if (!row) throw new CourseError("Course draft not found.", 404);
  return row;
}
function requireRevision(row: DraftRow, revision: unknown) {
  if (row.revision !== integer(revision, "revision"))
    throw new CourseError(
      "This draft changed elsewhere. Reload it before saving or publishing.",
      409,
    );
}
async function published(db: DatabaseQueries, id: string, version?: number) {
  const row = (
    await db.query<{ version: number; definition: CourseDefinition }>(
      version
        ? "SELECT version,definition FROM course_versions WHERE course_id=$1 AND version=$2"
        : "SELECT version,definition FROM course_versions WHERE course_id=$1 ORDER BY version DESC LIMIT 1",
      version ? [id, version] : [id],
    )
  ).rows[0];
  if (!row) throw new CourseError("Published course not found.", 404);
  return row;
}
function eligibleLevel(definition: CourseDefinition, completed: string[]) {
  const masteredConcepts = new Set(
    definition.levels
      .filter((l) => completed.includes(l.id))
      .map((l) => l.conceptId),
  );
  return definition.levels.find(
    (level) =>
      !completed.includes(level.id) &&
      level.prerequisites.every((id) => completed.includes(id)) &&
      (
        definition.concepts.find((c) => c.id === level.conceptId)
          ?.prerequisites || []
      ).every((id) => masteredConcepts.has(id)),
  );
}
export function deliveryId(state: StoredProgress, question: CourseQuestion) {
  return `${state.levelId}:${state.retry ? "retry" : "primary"}:${question.id}${state.game?.run ? ":run" + state.game.run : ""}${state.attempt ? ":attempt" + state.attempt : ""}${state.deliverySerial ? ":repeat" + state.deliverySerial : ""}`;
}
export function currentQuestion(
  definition: CourseDefinition,
  state: StoredProgress,
) {
  const level = definition.levels.find((l) => l.id === state.levelId);
  if (!level) throw new CourseError("Saved course level is unavailable.", 409);
  const question = (state.retry ? level.retryQuestions : level.questions)[
    state.questionIndex
  ];
  return { level, question };
}
function freshGame(
  level: CourseLevel,
  multiplier = 1,
  run = 0,
  assist = true,
  carry?: AdventureState,
) {
  // Stable authored-level layout; clients cannot supply encounter seeds.
  const seed = [...level.id].reduce(
    (hash, char) => (hash * 31 + char.charCodeAt(0)) % 1000000,
    0,
  );
  return newGame(level.timeLimitSeconds, multiplier, run, {
    theme: level.theme,
    seed,
    assist,
    taskCount: level.questions.length,
    carry,
  });
}
function progressResponse(
  courseId: string,
  version: number,
  definition: CourseDefinition,
  state: StoredProgress,
): LearningProgress {
  const { level, question } = currentQuestion(definition, state);
  // Completed checkpoints predate the camp in older enrollments. Their
  // authoritative response/checking history still fulfils these three roles.
  const observed = [
    ...new Set<LearningRole>([
      ...(state.journey?.observed ?? []),
      ...(state.completedLevelIds.length
        ? (["Examiner", "Checker", "Listener"] as const)
        : []),
    ]),
  ];
  return {
    courseId,
    version,
    levelId: state.levelId,
    questionIndex: state.questionIndex,
    retry: state.retry,
    assisted: state.assisted,
    feedback: state.feedback,
    activity: state.activity,
    worldAchievement: state.worldAchievement,
    game: state.game ?? freshGame(level),
    levelProgress: {
      cleared: state.satisfiedQuestionIds.length,
      total: level.questions.length,
    },
    completedLevelIds: state.completedLevelIds,
    points: state.points,
    finished: state.finished,
    selection: state.selection,
    journey: {
      observed,
      goal: state.journey?.goal ?? "",
      reasoning: state.journey?.reasoning ?? "",
      reflection: state.journey?.reflection ?? "",
      completed:
        state.finished &&
        definition.levels.every((l) =>
          state.completedLevelIds.includes(l.id),
        ) &&
        LEARNING_ROLES.every((role) => observed.includes(role)),
      path: definition.levels.map((l) => ({
        id: l.id,
        title: l.title,
        cleared: state.completedLevelIds.includes(l.id),
      })),
      reasoningPrompt: state.finished
        ? level.questions[0].hint
        : (state.journey?.reasoningPrompt ?? ""),
      rehearsal: publicQuestion(level.retryQuestions[0]),
      diagnosis:
        state.assessment?.reason ??
        "Complete a checkpoint to review criterion evidence, recorded assistance and any gaps.",
    } satisfies LearningJourney,
    practiceOnly: state.practiceOnly,
    replayMode: state.replayMode,
    canResumeCheckpoint: Boolean(state.resumeCheckpoint),
    practiceDeliveryId:
      question && !state.finished
        ? deliveryId(state, question)
        : `practice:${state.levelId}:${state.attempt ?? 0}`,
    checkpoint: `${state.attempt ?? 0}:${state.levelId}:${state.questionIndex}:${state.deliverySerial ?? 0}`,
    replayableLevels: definition.levels
      .filter(
        (l) => l.id === state.levelId || state.completedLevelIds.includes(l.id),
      )
      .map((l) => ({ id: l.id, title: l.title })),
    ...(state.blocked ? { blocked: true, blockReason: state.blockReason } : {}),
    ...(state.practiceOnly ? { blockReason: state.blockReason } : {}),
    ...(state.result ? { result: state.result } : {}),
    ...(state.assessment ? { assessment: state.assessment } : {}),
    level: levelMetadata(level),
    resources: definition.resources.filter((r) =>
      level.resourceIds.includes(r.id),
    ),
    ...(!state.finished &&
    !state.blocked &&
    state.selection?.status !== "pending" &&
    state.assessment?.status !== "pending" &&
    question
      ? {
          question: {
            ...publicQuestion(question),
            id: deliveryId(state, question),
          },
        }
      : {}),
  };
}
export async function enrolled(
  db: DatabaseQueries,
  id: string,
  playerId: string,
) {
  const row = (
    await db.query<EnrollmentRow>(
      "SELECT version,progress FROM course_enrollments WHERE course_id=$1 AND player_id=$2 FOR UPDATE",
      [id, playerId],
    )
  ).rows[0];
  if (!row) throw new CourseError("Enter this course house first.", 404);
  const course = await published(db, id, row.version);
  // Previously recorded checkpoints retain points, evidence and partial work.
  // New selections use local inference without relabeling old assessments.
  if (
    row.progress.assessment &&
    !row.progress.previousProviderMigrated &&
    !row.progress.assessment.provider?.startsWith("ollama:")
  ) {
    const prior = row.progress.assessment;
    row.progress.assessment = {
      status: prior.status,
      provider:
        prior.status === "pending"
          ? DECISION_IDENTITY
          : "historical-checkpoint",
      grades: prior.grades.map((g) => ({
        deliveryId: g.deliveryId,
        criterionId: g.criterionId,
        score: g.score,
        confidence: g.confidence,
        tags: g.tags,
      })),
      criteria: prior.criteria,
      assistanceCount: prior.assistanceCount,
      errorCount: prior.errorCount,
      nextLevelId: prior.nextLevelId,
      taskIds: prior.taskIds,
      reason:
        "Your earlier recorded checkpoint evidence and earned points are preserved. New activity selections use the local learning guide.",
    };
    row.progress.result = row.progress.result
      ? {
          provider: "historical-checkpoint",
          label: "Recorded checkpoint preserved",
          nextLevelId: row.progress.result.nextLevelId,
          awardedPoints: row.progress.result.awardedPoints,
        }
      : undefined;
    row.progress.previousProviderMigrated = true;
    await saveProgress(db, id, playerId, row.progress);
  }
  if (
    !row.progress.selection &&
    !row.progress.entryDecisionNeeded &&
    !row.progress.finished
  ) {
    row.progress.resumeQuestionId = currentQuestion(
      course.definition,
      row.progress,
    ).question?.id;
  }
  // Existing progress can be upgraded without inventing independent evidence.
  if (!Array.isArray(row.progress.satisfiedQuestionIds)) {
    const level = course.definition.levels.find(
      (l) => l.id === row.progress.levelId,
    );
    const chunks = (
      await db.query<{ question_id: string; retry: boolean }>(
        "SELECT question_id,retry FROM course_chunks WHERE course_id=$1 AND player_id=$2 AND level_id=$3 AND correct AND NOT assisted",
        [id, playerId, row.progress.levelId],
      )
    ).rows;
    row.progress.satisfiedQuestionIds = [
      ...new Set(
        chunks.flatMap((c) => {
          const question = (
            c.retry ? level?.retryQuestions : level?.questions
          )?.find((q) => q.id === c.question_id);
          const criterionId = c.retry ? question?.retryFor : question?.id;
          return criterionId ? [criterionId] : [];
        }),
      ),
    ];
    await saveProgress(db, id, playerId, row.progress);
  }
  if (!row.progress.game?.adventure) {
    const { level } = currentQuestion(course.definition, row.progress);
    const old = row.progress.game;
    row.progress.game = freshGame(level, old?.multiplier ?? 1, old?.run ?? 0);
    if (old) {
      row.progress.game.status =
        old.status === "active" ? "paused" : old.status;
      row.progress.game.elapsedMs = old.elapsedMs;
      row.progress.game.adventure!.elapsedMs = old.elapsedMs;
    }
    row.progress.adventureCheckpoint = structuredClone(
      row.progress.game.adventure,
    );
    await saveProgress(db, id, playerId, row.progress);
  }
  // Recover legacy exhausted banks without losing any successful criterion.
  if (row.progress.blocked) {
    const { level } = currentQuestion(course.definition, row.progress);
    const index = level.retryQuestions.findIndex(
      (q) =>
        q.retryFor && !row.progress.satisfiedQuestionIds.includes(q.retryFor),
    );
    if (index >= 0) {
      row.progress.blocked = false;
      row.progress.retry = true;
      row.progress.questionIndex = index;
      row.progress.deliverySerial = (row.progress.deliverySerial ?? 0) + 1;
      row.progress.blockReason =
        "Keep practising without a retry limit. Previously shown solutions are practice; a fresh authored variant is needed for independent credit.";
      row.progress.practiceOnly = true;
      row.progress.assisted = true;
      const previous = row.progress.game;
      row.progress.game = freshGame(
        level,
        previous?.multiplier ?? 1,
        (previous?.run ?? 0) + 1,
        previous?.adventure?.assist !== false,
        row.progress.adventureCheckpoint ?? previous?.adventure,
      );
      row.progress.adventureCheckpoint = structuredClone(
        row.progress.game.adventure,
      );
      await saveProgress(db, id, playerId, row.progress);
    }
  }
  return { ...row, ...course };
}
async function saveProgress(
  db: DatabaseQueries,
  id: string,
  playerId: string,
  state: StoredProgress,
) {
  await db.query(
    "UPDATE course_enrollments SET progress=$3,updated_at=now() WHERE course_id=$1 AND player_id=$2",
    [id, playerId, JSON.stringify(state)],
  );
}

async function classify(
  db: DatabaseQueries,
  id: string,
  playerId: string,
  definition: CourseDefinition,
  state: StoredProgress,
  provider: ClassificationProvider,
) {
  const level = definition.levels.find(
    (l) => l.id === state.assessmentLevelId,
  )!;
  const evidence = (
    await db.query<Evidence>(
      `SELECT DISTINCT ON (question_id, (correct AND NOT assisted)) delivery_id,question_id,retry,correct,assisted,answer,elapsed_ms FROM course_chunks WHERE course_id=$1 AND player_id=$2 AND level_id=$3 AND attempt=$4 ORDER BY question_id,(correct AND NOT assisted),created_at DESC,delivery_id DESC`,
      [id, playerId, level.id, state.attempt ?? 0],
    )
  ).rows;
  state.assessment = await assessLevel(
    definition,
    level,
    evidence,
    state.replayMode === "level"
      ? definition.levels.map((l) => l.id)
      : state.replayMode === "course"
        ? (state.replayCompletedLevelIds ?? [])
        : state.completedLevelIds,
    provider,
  );
  await db.query(
    "INSERT INTO course_assessments(course_id,player_id,level_id,result) VALUES($1,$2,$3,$4) ON CONFLICT(course_id,player_id,level_id) DO UPDATE SET result=$4,updated_at=now() WHERE NOT ($5 AND course_assessments.result->>'status'='confirmed')",
    [
      id,
      playerId,
      level.id,
      JSON.stringify(state.assessment),
      Boolean(state.replayMode),
    ],
  );
  await db.query(
    "INSERT INTO course_assessment_runs(course_id,player_id,level_id,attempt,result) VALUES($1,$2,$3,$4,$5) ON CONFLICT(course_id,player_id,level_id,attempt) DO UPDATE SET result=$5,updated_at=now()",
    [
      id,
      playerId,
      level.id,
      state.attempt ?? 0,
      JSON.stringify(state.assessment),
    ],
  );
  state.result = {
    provider: state.assessment.provider ?? DECISION_IDENTITY,
    label:
      state.assessment.status === "pending"
        ? "Level cleared · assessment pending"
        : evidence.some((e) => e.retry)
          ? "Independent retry checkpoint clear"
          : "Independent checkpoint clear",
    nextLevelId: state.assessment.nextLevelId,
    awardedPoints: state.lastAwardedPoints ?? level.points,
  };
  if (state.assessment.status === "pending") return;
  if (state.assessment.nextLevelId) {
    state.levelId = state.assessment.nextLevelId;
    state.questionIndex = 0;
    state.retry = false;
    state.satisfiedQuestionIds = [];
    state.game = undefined;
    state.adventureCheckpoint = undefined;
    state.selection = {
      status: "pending",
      provider: provider.identity ?? DECISION_IDENTITY,
      level: state.assessment.routingDecision,
    };
  } else {
    state.finished = true;
    await db.query(
      "INSERT INTO player_badges(player_id,badge_id,title) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
      [playerId, "course:" + id, definition.title + " · checkpoint finisher"],
    );
  }
}

export function registerCourses(
  app: FastifyInstance,
  db: Database,
  auth: Authentication,
  provider: ClassificationProvider = decisionConfiguration().provider,
  now: () => number = Date.now,
) {
  const player = async (req: FastifyRequest) => {
    const p = await auth.player(req.cookies.amamihe);
    if (!p) throw new CourseError("Sign in first.", 401);
    return p;
  };
  const param = (req: FastifyRequest, name = "id") =>
    identifier((req.params as Record<string, unknown>)[name]);
  const route = (
    method: "GET" | "POST" | "PUT",
    url: string,
    handler: (req: FastifyRequest, reply: FastifyReply) => Promise<unknown>,
    bodyLimit = 16384,
  ) =>
    app.route({
      method,
      url,
      bodyLimit,
      handler: async (req, reply) => {
        reply.header("Cache-Control", "no-store");
        try {
          return await handler(req, reply);
        } catch (error) {
          if (error instanceof CourseError)
            return reply.code(error.status).send({
              error: error.message,
              ...(error.issues ? { issues: error.issues } : {}),
            });
          app.log.error("Course operation failed");
          return reply
            .code(503)
            .send({ error: "Unable to update this course right now." });
        }
      },
    });
  route("GET", "/api/studio/courses", async (req) => {
    const p = await player(req);
    const rows = await db.query<DraftRow>(
      "SELECT * FROM course_drafts WHERE owner_id=$1 ORDER BY updated_at DESC,id LIMIT 50",
      [p.id],
    );
    return { courses: rows.rows.map(draft) };
  });
  route("POST", "/api/studio/courses", async (req, reply) => {
    const p = await player(req);
    const body = object(req.body);
    if (
      !["blank", "storytelling", "fraction-bridge", "circuit-rescue"].includes(
        String(body.template),
      )
    )
      throw new CourseError("Choose a course template.");
    const definition =
      body.template === "storytelling"
        ? storytellingCourse()
        : body.template === "blank"
          ? blankCourse()
          : structuredClone(
              playableCourses().find(
                (c) => c.id === "amamihe-" + body.template,
              )!.definition,
            );
    const id = randomUUID();
    const result = await db.transaction(async (tx) => {
      // Lock the account to serialize draft creation and bound retained drafts.
      await tx.query("SELECT id FROM players WHERE id=$1 FOR UPDATE", [p.id]);
      const count = (
        await tx.query<{ count: number }>(
          "SELECT count(*)::integer AS count FROM course_drafts WHERE owner_id=$1",
          [p.id],
        )
      ).rows[0].count;
      if (count >= 50)
        throw new CourseError("This tutor already has 50 course drafts.", 409);
      return draft(
        (
          await tx.query<DraftRow>(
            "INSERT INTO course_drafts(id,owner_id,definition) VALUES($1,$2,$3) RETURNING *",
            [id, p.id, JSON.stringify(definition)],
          )
        ).rows[0],
      );
    });
    reply.code(201);
    return result;
  });
  route("GET", "/api/studio/courses/:id", async (req) =>
    draft(await ownedDraft(db, param(req), (await player(req)).id)),
  );
  route(
    "PUT",
    "/api/studio/courses/:id",
    async (req) => {
      const p = await player(req);
      const body = object(req.body);
      const definition = draftDefinition(body.definition);
      return db.transaction(async (tx) => {
        const row = await ownedDraft(tx, param(req), p.id, true);
        requireRevision(row, body.revision);
        return draft(
          (
            await tx.query<DraftRow>(
              "UPDATE course_drafts SET definition=$3,revision=revision+1,updated_at=now() WHERE id=$1 AND owner_id=$2 RETURNING *",
              [row.id, p.id, JSON.stringify(definition)],
            )
          ).rows[0],
        );
      });
    },
    262144,
  );
  route("POST", "/api/studio/courses/:id/validate", async (req) => {
    const row = await ownedDraft(db, param(req), (await player(req)).id);
    requireRevision(row, object(req.body).revision);
    return { issues: validateCourse(row.definition) };
  });
  route("POST", "/api/studio/courses/:id/publish", async (req) => {
    const p = await player(req);
    const body = object(req.body);
    return db.transaction(async (tx) => {
      const row = await ownedDraft(tx, param(req), p.id, true);
      requireRevision(row, body.revision);
      const issues = validateCourse(row.definition);
      if (issues.length)
        throw new CourseError(
          "Resolve course checks before publishing.",
          422,
          issues,
        );
      const existing = (
        await tx.query<{ version: number }>(
          "SELECT version FROM course_versions WHERE course_id=$1 AND source_revision=$2",
          [row.id, row.revision],
        )
      ).rows[0];
      if (existing) return { id: row.id, version: existing.version };
      const version = (row.published_version || 0) + 1;
      await tx.query(
        "INSERT INTO course_versions(course_id,version,source_revision,definition) VALUES($1,$2,$3,$4)",
        [row.id, version, row.revision, JSON.stringify(row.definition)],
      );
      await tx.query(
        "UPDATE course_drafts SET published_version=$2,updated_at=now() WHERE id=$1",
        [row.id, version],
      );
      return { id: row.id, version };
    });
  });
  route("GET", "/api/courses", async (req) => {
    const query = (req.query || {}) as Record<string, unknown>;
    const q = typeof query.q === "string" ? query.q.trim() : "";
    if (q.length > 200) throw new CourseError("Search is too long.");
    if (query.audience !== undefined && query.audience !== "kids")
      throw new CourseError("Choose a supported course audience.");
    const catalogueParameters = [
      q,
      query.audience === "kids",
      KIDS_COURSES.map((c) => c.id),
    ];
    const offset =
      query.offset === undefined
        ? 0
        : integer(Number(query.offset), "offset", 0, 100000);
    const limit =
      query.limit === undefined
        ? 24
        : integer(Number(query.limit), "limit", 1, 24);
    const filter = `FROM course_versions v
JOIN course_drafts d ON d.id=v.course_id AND d.published_version=v.version
WHERE ($1='' OR position(lower($1) in lower((v.definition->>'title')||' '||(v.definition->>'summary')))>0)
AND ($2::boolean=false OR v.course_id=ANY($3::text[]))`;
    const total = (
      await db.query<{ count: number }>(
        `SELECT count(*)::integer AS count ${filter}`,
        catalogueParameters,
      )
    ).rows[0].count;
    const rows = (
      await db.query<{
        course_id: string;
        version: number;
        title: string;
        summary: string;
        language: string;
        level_count: number;
      }>(
        `SELECT v.course_id,v.version,v.definition->>'title' AS title,
v.definition->>'summary' AS summary,v.definition->>'language' AS language,
jsonb_array_length(v.definition->'levels') AS level_count ${filter}
ORDER BY v.published_at DESC,v.course_id LIMIT $4 OFFSET $5`,
        [...catalogueParameters, limit, offset],
      )
    ).rows;
    return {
      total,
      courses: rows.map((r): CourseSummary => ({
        id: r.course_id,
        version: r.version,
        title: r.title,
        summary: r.summary,
        language: r.language,
        levelCount: r.level_count,
      })),
    };
  });
  route("GET", "/api/courses/:id", async (req) => {
    const query = (req.query || {}) as Record<string, unknown>;
    const version =
      query.version === undefined
        ? undefined
        : integer(Number(query.version), "version");
    const row = await published(db, param(req), version);
    return {
      id: param(req),
      version: row.version,
      definition: publicDefinition(row.definition),
    };
  });
  route("POST", "/api/courses/:id/enroll", async (req) => {
    const p = await player(req);
    const id = param(req);
    const version = integer(object(req.body).version, "version");
    return db.transaction(async (tx) => {
      const course = await published(tx, id, version);
      const first = eligibleLevel(course.definition, []);
      if (!first) throw new CourseError("This course has no entry level.", 409);
      const initial: StoredProgress = {
        entryDecisionNeeded: true,
        levelId: first.id,
        questionIndex: 0,
        retry: false,
        satisfiedQuestionIds: [],
        assisted: false,
        completedLevelIds: [],
        usedRetryQuestionIds: [],
        points: 0,
        finished: false,
        blocked: false,
      };
      await tx.query(
        "INSERT INTO course_enrollments(course_id,player_id,version,progress) VALUES($1,$2,$3,$4) ON CONFLICT(course_id,player_id) DO NOTHING",
        [id, p.id, version, JSON.stringify(initial)],
      );
      const row = await enrolled(tx, id, p.id);
      await prepareLearningSelection(
        tx,
        id,
        p.id,
        row.definition,
        row.progress,
        provider,
      );
      await saveProgress(tx, id, p.id, row.progress);
      return progressResponse(id, row.version, row.definition, row.progress);
    });
  });
  route("GET", "/api/learning", async (req) => {
    const p = await player(req);
    const rows = (
      await db.query<{
        course_id: string;
        version: number;
        title: string;
        progress: StoredProgress;
      }>(
        `SELECT e.course_id,e.version,e.progress,v.definition->>'title' AS title
FROM course_enrollments e JOIN course_versions v ON v.course_id=e.course_id AND v.version=e.version
WHERE e.player_id=$1 ORDER BY e.updated_at DESC,e.course_id LIMIT 100`,
        [p.id],
      )
    ).rows;
    return {
      courses: rows.map((r) => ({
        courseId: r.course_id,
        title: r.title,
        version: r.version,
        finished: r.progress.finished,
        completedLevelIds: r.progress.completedLevelIds,
        blocked: r.progress.blocked,
      })),
    };
  });
  route("POST", "/api/learning/:courseId/journey", async (req) => {
    const p = await player(req),
      id = param(req, "courseId"),
      body = object(req.body);
    return db.transaction(async (tx) => {
      const row = await enrolled(tx, id, p.id),
        state = row.progress;
      const { level } = currentQuestion(row.definition, state);
      const journey = state.journey ?? {
        observed: [],
        goal: "",
        reasoning: "",
        reflection: "",
      };
      const add = (...roles: LearningRole[]) =>
        (journey.observed = [...new Set([...journey.observed, ...roles])]);
      const responseText = () => {
        if (
          typeof body.text !== "string" ||
          body.text.trim().length < 10 ||
          body.text.length > 2000
        )
          throw new CourseError("Write 10–2000 characters in your own words.");
        return body.text.trim();
      };
      if (body.activity === "map") add("Mapmaker");
      else if (body.activity === "goal") {
        journey.goal = responseText();
        add("Interviewer");
      } else if (body.activity === "reasoning-prompt") {
        if (!state.finished) {
          state.assisted = true;
          const q = currentQuestion(row.definition, state).question;
          if (q)
            state.revealedQuestionIds = [
              ...new Set([...(state.revealedQuestionIds ?? []), q.id]),
            ];
        }
        journey.reasoningPrompt =
          currentQuestion(row.definition, state).question?.hint ??
          level.questions[0].hint;
      } else if (body.activity === "reasoning") {
        journey.reasoning = responseText();
        add("Socratic Questioner", "Listener");
      } else if (body.activity === "study") {
        if (!level.resourceIds.includes(String(body.resourceId)))
          throw new CourseError("Choose a resource at this level.");
        add("Explainer");
      } else if (body.activity === "diagnosis") {
        if (!state.assessment)
          throw new CourseError(
            "Clear a checkpoint before reviewing its evidence.",
          );
        add("Diagnostician");
      } else if (body.activity === "rehearsal") {
        if (!state.finished)
          throw new CourseError(
            "Clear the course checkpoints before the final rehearsal.",
          );
        const q = level.retryQuestions.find((q) => q.id === body.questionId);
        if (
          !q ||
          !Number.isInteger(body.answer) ||
          Number(body.answer) < 0 ||
          Number(body.answer) >= q.options.length
        )
          throw new CourseError("Choose an authored rehearsal answer.");
        if (Number(body.answer) !== q.answer)
          return {
            progress: progressResponse(id, row.version, row.definition, state),
            feedback: q.hint,
          };
        add("Sparring Partner");
      } else if (body.activity === "reflection") {
        if (!state.finished)
          throw new CourseError(
            "Clear the course checkpoints before recording the final takeaway.",
          );
        journey.reflection = responseText();
        add("Clerk");
      } else throw new CourseError("Choose a learning journey activity.");
      state.journey = journey;
      if (state.game?.status === "active") state.game.status = "paused";
      await prepareLearningSelection(
        tx,
        id,
        p.id,
        row.definition,
        state,
        provider,
      );
      await saveProgress(tx, id, p.id, state);
      return {
        progress: progressResponse(id, row.version, row.definition, state),
      };
    });
  });
  route("POST", "/api/learning/:courseId/resume-checkpoint", async (req) => {
    const p = await player(req),
      id = param(req, "courseId"),
      body = object(req.body);
    return db.transaction(async (tx) => {
      const row = await enrolled(tx, id, p.id),
        state = row.progress;
      const token = `${state.attempt ?? 0}:${state.levelId}:${state.questionIndex}:${state.deliverySerial ?? 0}`;
      if (!state.resumeCheckpoint || body.checkpoint !== token)
        throw new CourseError(
          "Reload your saved replay before returning.",
          409,
        );
      const restored = state.resumeCheckpoint;
      restored.points = state.points;
      restored.completedLevelIds = [
        ...new Set([...restored.completedLevelIds, ...state.completedLevelIds]),
      ];
      restored.attemptCounter = Math.max(
        state.attempt ?? 0,
        state.attemptCounter ?? 0,
      );
      restored.journey = state.journey;
      restored.revealedQuestionIds = [
        ...new Set([
          ...(restored.revealedQuestionIds ?? []),
          ...(state.revealedQuestionIds ?? []),
        ]),
      ];
      const current = currentQuestion(row.definition, restored).question;
      restored.assisted =
        restored.assisted ||
        Boolean(current && restored.revealedQuestionIds.includes(current.id));
      if (restored.game?.status === "active") restored.game.status = "paused";
      await prepareLearningSelection(
        tx,
        id,
        p.id,
        row.definition,
        restored,
        provider,
      );
      await saveProgress(tx, id, p.id, restored);
      return progressResponse(id, row.version, row.definition, restored);
    });
  });
  route("POST", "/api/learning/:courseId/replay", async (req) => {
    const p = await player(req),
      id = param(req, "courseId");
    const body = object(req.body);
    if (body.scope !== "course" && body.scope !== "level")
      throw new CourseError("Choose course or level replay.");
    return db.transaction(async (tx) => {
      const row = await enrolled(tx, id, p.id),
        state = row.progress;
      if (state.assessment?.status === "pending")
        throw new CourseError(
          "Finish the pending assessment before replaying.",
          409,
        );
      // The current delivery makes a double click or stale tab harmless.
      const token = `${state.attempt ?? 0}:${state.levelId}:${state.questionIndex}:${state.deliverySerial ?? 0}`;
      if (body.checkpoint !== token)
        throw new CourseError(
          "Reload your saved checkpoint before replaying.",
          409,
        );
      const level =
        body.scope === "course"
          ? eligibleLevel(row.definition, [])
          : row.definition.levels.find((l) => l.id === body.levelId);
      if (
        !level ||
        (body.scope !== "course" &&
          level.id !== state.levelId &&
          !state.completedLevelIds.includes(level.id))
      )
        throw new CourseError(
          "Replay your current or previously cleared level.",
          409,
        );
      const revealed = [
        ...new Set([
          ...(state.revealedQuestionIds ?? []),
          ...(
            await tx.query<{ question_id: string }>(
              "SELECT DISTINCT question_id FROM course_chunks WHERE course_id=$1 AND player_id=$2 AND (NOT correct OR assisted)",
              [id, p.id],
            )
          ).rows.map((r) => r.question_id),
        ]),
      ];
      const resumeCheckpoint = state.resumeCheckpoint ?? structuredClone(state);
      Object.assign(state, {
        resumeCheckpoint,
        revealedQuestionIds: revealed,
        attempt: Math.max(state.attemptCounter ?? 0, state.attempt ?? 0) + 1,
        deliverySerial: 0,
        replayMode: body.scope === "course" ? "course" : "level",
        replayCompletedLevelIds: [],
        levelId: level.id,
        questionIndex: 0,
        retry: false,
        satisfiedQuestionIds: [],
        usedRetryQuestionIds: [],
        assisted: false,
        practiceOnly: false,
        finished: false,
        blocked: false,
        blockReason: undefined,
        feedback: undefined,
        activity: undefined,
        assessment: undefined,
        result: undefined,
        assessmentLevelId: undefined,
        selection: undefined,
        questionSelectionKey: undefined,
        categorySelectionKey: undefined,
        entryDecisionNeeded: body.scope === "course",
        game: freshGame(level),
        adventureCheckpoint: undefined,
      });
      state.assisted = revealed.includes(level.questions[0].id);
      await prepareLearningSelection(
        tx,
        id,
        p.id,
        row.definition,
        state,
        provider,
      );
      await saveProgress(tx, id, p.id, state);
      return progressResponse(id, row.version, row.definition, state);
    });
  });
  route("GET", "/api/learning/:courseId", async (req) => {
    const p = await player(req);
    const id = param(req, "courseId");
    return db.transaction(async (tx) => {
      const row = await enrolled(tx, id, p.id);
      await prepareLearningSelection(
        tx,
        id,
        p.id,
        row.definition,
        row.progress,
        provider,
      );
      await saveProgress(tx, id, p.id, row.progress);
      return progressResponse(id, row.version, row.definition, row.progress);
    });
  });
  for (const command of ["play", "pause", "tick"] as const)
    route("POST", `/api/learning/:courseId/${command}`, async (req) => {
      const p = await player(req),
        id = param(req, "courseId");
      const body = object(req.body);
      if (body.assist !== undefined && typeof body.assist !== "boolean")
        throw new CourseError("Movement assistance must be true or false.");
      return db.transaction(async (tx) => {
        const row = await enrolled(tx, id, p.id),
          state = row.progress;
        const { level, question } = currentQuestion(row.definition, state);
        if (
          state.finished ||
          state.blocked ||
          state.selection?.status === "pending" ||
          state.assessment?.status === "pending" ||
          !question ||
          body.questionId !== deliveryId(state, question)
        )
          throw new CourseError("This game step is no longer active.", 409);
        let game = tickGame(state.game ?? freshGame(level), now());
        if (command === "play") {
          if (game.status === "game-over")
            game = freshGame(
              level,
              game.multiplier,
              game.run + 1,
              body.assist === undefined
                ? game.adventure?.assist !== false
                : body.assist !== false,
              state.adventureCheckpoint,
            );
          if (game.status === "ready")
            game = freshGame(
              level,
              body.multiplier === undefined
                ? game.multiplier
                : integer(body.multiplier, "timer setting", 0, 2),
              game.run,
              body.assist === undefined
                ? game.adventure?.assist !== false
                : body.assist !== false,
              game.adventure,
            );
          // Accessibility may safely promote assistance during an active run.
          // Manual hazards can only be selected before starting a new step.
          if (body.assist === true && game.adventure)
            game.adventure.assist = true;
          if (game.status === "ready")
            state.adventureCheckpoint = structuredClone(game.adventure);
          if (game.status === "ready" || game.status === "paused") {
            game.status = "active";
            game.lastTick = now();
          }
        } else if (command === "pause" && game.status === "active")
          game.status = "paused";
        state.game = game;
        await saveProgress(tx, id, p.id, state);
        return progressResponse(id, row.version, row.definition, state);
      });
    });
  route("POST", "/api/learning/:courseId/action", async (req) => {
    const p = await player(req),
      id = param(req, "courseId"),
      body = object(req.body);
    const run = integer(body.run, "run", 0, 2_000_000_000);
    const sequence = integer(
      body.sequence,
      "action sequence",
      1,
      2_000_000_000,
    );
    if (!ADVENTURE_ACTIONS.includes(body.action as AdventureAction))
      throw new CourseError("Choose an available game action.");
    return db.transaction(async (tx) => {
      const row = await enrolled(tx, id, p.id),
        state = row.progress;
      const { question } = currentQuestion(row.definition, state);
      if (
        state.finished ||
        state.blocked ||
        state.selection?.status === "pending" ||
        state.assessment?.status === "pending" ||
        !question ||
        body.questionId !== deliveryId(state, question) ||
        !state.game ||
        state.game.run !== run
      )
        throw new CourseError("This game step is no longer active.", 409);
      const last = state.game.actionSequence ?? 0;
      if (sequence <= last)
        return progressResponse(id, row.version, row.definition, state);
      if (sequence !== last + 1)
        throw new CourseError(
          "Game actions arrived out of order. Retry the current action.",
          409,
        );
      if (state.game.status !== "active")
        throw new CourseError("Resume this game step before moving.", 409);
      state.game = applyGameAction(
        state.game,
        body.action as AdventureAction,
        now(),
      );
      state.game.actionSequence = sequence;
      await saveProgress(tx, id, p.id, state);
      return progressResponse(id, row.version, row.definition, state);
    });
  });
  route("POST", "/api/learning/:courseId/classify", async (req) => {
    const p = await player(req);
    const id = param(req, "courseId");
    return db.transaction(async (tx) => {
      const row = await enrolled(tx, id, p.id);
      if (row.progress.assessment?.status !== "pending")
        throw new CourseError("There is no pending assessment.", 409);
      await classify(tx, id, p.id, row.definition, row.progress, provider);
      await prepareLearningSelection(
        tx,
        id,
        p.id,
        row.definition,
        row.progress,
        provider,
      );
      await saveProgress(tx, id, p.id, row.progress);
      return progressResponse(id, row.version, row.definition, row.progress);
    });
  });
  route("POST", "/api/learning/:courseId/select", async (req) => {
    const p = await player(req),
      id = param(req, "courseId");
    return db.transaction(async (tx) => {
      const row = await enrolled(tx, id, p.id);
      if (row.progress.game?.status === "active")
        row.progress.game.status = "paused";
      await prepareLearningSelection(
        tx,
        id,
        p.id,
        row.definition,
        row.progress,
        provider,
      );
      await saveProgress(tx, id, p.id, row.progress);
      return progressResponse(id, row.version, row.definition, row.progress);
    });
  });
  route("POST", "/api/learning/:courseId/help", async (req) => {
    const p = await player(req);
    const id = param(req, "courseId");
    const questionId = identifier(object(req.body).questionId);
    return db.transaction(async (tx) => {
      const row = await enrolled(tx, id, p.id);
      const state = row.progress;
      const { question } = currentQuestion(row.definition, state);
      if (
        state.finished ||
        state.selection?.status === "pending" ||
        state.assessment?.status === "pending" ||
        state.blocked ||
        !question ||
        deliveryId(state, question) !== questionId
      )
        throw new CourseError("This question is no longer active.", 409);
      if (state.game) {
        state.game = tickGame(state.game, now());
        if (state.game.status === "active") state.game.status = "paused";
      }
      state.assisted = true;
      state.revealedQuestionIds = [
        ...new Set([...(state.revealedQuestionIds ?? []), question.id]),
      ];
      await saveProgress(tx, id, p.id, state);
      return { hint: question.hint, explanation: question.explanation };
    });
  });
  route("POST", "/api/learning/:courseId/answer", async (req) => {
    const p = await player(req);
    const id = param(req, "courseId");
    const body = object(req.body);
    const questionId = identifier(body.questionId);
    const answer = integer(body.answer, "answer", 0, 7);
    const elapsedMs = integer(body.elapsedMs, "elapsed time", 0, 3_600_000);
    return db.transaction(async (tx) => {
      const row = await enrolled(tx, id, p.id);
      const state = row.progress;
      const { level, question } = currentQuestion(row.definition, state);
      if (
        state.finished ||
        state.assessment?.status === "pending" ||
        state.blocked ||
        !question ||
        deliveryId(state, question) !== questionId
      )
        throw new CourseError(
          "Complete the currently delivered question in order.",
          409,
        );
      if (answer >= question.options.length)
        throw new CourseError("Choose an available answer.");
      if (
        question.worldTask &&
        worldTaskAnswer(question.worldTask, body.worldEvidence) !== answer
      )
        throw new CourseError(
          "Submit the actual bridge pieces or relay settings for this task.",
        );
      if (!state.game || state.game.status === "ready")
        throw new CourseError("Start this game step before submitting.", 409);
      if (state.game.status === "paused")
        throw new CourseError("Resume this game step before submitting.", 409);
      state.game = tickGame(state.game, now());
      if (state.game.status === "game-over") {
        await saveProgress(tx, id, p.id, state);
        return progressResponse(id, row.version, row.definition, state);
      }
      state.journey ??= {
        observed: [],
        goal: "",
        reasoning: "",
        reflection: "",
      };
      state.journey.observed = [
        ...new Set([
          ...state.journey.observed,
          "Examiner",
          "Checker",
          "Listener",
        ] as LearningRole[]),
      ];
      const activityElapsedMs = state.game.elapsedMs;
      const correct = answer === question.answer;
      state.activity = {
        correct,
        independent: correct && !state.assisted,
        elapsedMs: activityElapsedMs,
      };
      if (question.worldTask && correct && !state.assisted)
        state.worldAchievement = {
          question: { ...publicQuestion(question), id: questionId },
          evidence: structuredClone(
            body.worldEvidence,
          ) as import("../shared/world-task.js").WorldEvidence,
        };
      state.game = applyGameTask(state.game, state.activity);
      const taskAdventure = state.game.adventure;
      state.activity.adventure = structuredClone(taskAdventure);
      const multiplier = state.game.multiplier;
      state.feedback =
        correct && !state.assisted ? undefined : question.explanation;
      await tx.query(
        "INSERT INTO course_chunks(course_id,player_id,delivery_id,level_id,question_id,retry,answer,correct,assisted,elapsed_ms,attempt,world_evidence) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)",
        [
          id,
          p.id,
          questionId,
          level.id,
          question.id,
          state.retry,
          answer,
          correct,
          state.assisted,
          activityElapsedMs,
          state.attempt ?? 0,
          question.worldTask ? JSON.stringify(body.worldEvidence) : null,
        ],
      );
      state.satisfiedQuestionIds ??= [];
      if (state.retry && !state.usedRetryQuestionIds.includes(question.id))
        state.usedRetryQuestionIds.push(question.id);
      if (!correct || state.assisted)
        state.revealedQuestionIds = [
          ...new Set([...(state.revealedQuestionIds ?? []), question.id]),
        ];
      const criterionId = state.retry ? question.retryFor : question.id;
      if (
        correct &&
        !state.assisted &&
        criterionId &&
        level.questions.some((q) => q.id === criterionId) &&
        !state.satisfiedQuestionIds.includes(criterionId)
      ) {
        state.satisfiedQuestionIds.push(criterionId);
      }
      const cleared = level.questions.every((q) =>
        state.satisfiedQuestionIds.includes(q.id),
      );
      if (!cleared) {
        if (!state.retry && correct && !state.assisted) {
          state.questionIndex++;
        } else {
          state.retry = true;
          let nextIndex = level.retryQuestions.findIndex(
            (q) =>
              typeof q.retryFor === "string" &&
              !state.satisfiedQuestionIds.includes(q.retryFor) &&
              !state.usedRetryQuestionIds.includes(q.id),
          );
          if (nextIndex === -1) {
            // Continue as often as desired. A previously revealed variant is
            // practice, not new independent evidence. Failed chunks remain audited.
            nextIndex = level.retryQuestions.findIndex(
              (q) =>
                q.retryFor && !state.satisfiedQuestionIds.includes(q.retryFor),
            );
            state.deliverySerial = (state.deliverySerial ?? 0) + 1;
            state.practiceOnly = true;
            state.blockReason =
              "Keep practising without a retry limit. These solutions have been shown; ask your tutor for a fresh variant to earn the remaining independent credit.";
            state.questionIndex = nextIndex;
          } else {
            state.questionIndex = nextIndex;
          }
        }
      }
      state.assisted = Boolean(state.practiceOnly);
      if (cleared) {
        // Classification is invoked only after independent level clearance.
        // The local decision model selects an eligible published level.
        if (!state.completedLevelIds.includes(level.id))
          state.completedLevelIds.push(level.id);
        if (state.replayMode === "course")
          state.replayCompletedLevelIds = [
            ...(state.replayCompletedLevelIds ?? []),
            level.id,
          ];
        const award = await tx.query<{ amount: number }>(
          "INSERT INTO reward_ledger(player_id,event_id,amount,reason) VALUES($1,$2,$3,$4) ON CONFLICT(player_id,event_id) DO NOTHING RETURNING amount",
          [
            p.id,
            `course:${id}:v${row.version}:${level.id}`,
            level.points,
            "Independent activity clearance",
          ],
        );
        state.lastAwardedPoints = award.rows[0]?.amount ?? 0;
        if (award.rows.length) {
          state.points += level.points;
          await tx.query("UPDATE players SET points=points+$2 WHERE id=$1", [
            p.id,
            level.points,
          ]);
        }
        state.assessmentLevelId = level.id;
        await classify(tx, id, p.id, row.definition, state, provider);
      }
      await prepareLearningSelection(
        tx,
        id,
        p.id,
        row.definition,
        state,
        provider,
      );
      state.game = freshGame(
        currentQuestion(row.definition, state).level,
        multiplier,
        0,
        taskAdventure?.assist !== false,
        state.levelId === level.id ? taskAdventure : undefined,
      );
      state.adventureCheckpoint = structuredClone(state.game.adventure);
      const nextQuestion = currentQuestion(row.definition, state).question;
      state.assisted = Boolean(
        state.practiceOnly ||
        (nextQuestion && state.revealedQuestionIds?.includes(nextQuestion.id)),
      );
      await saveProgress(tx, id, p.id, state);
      return progressResponse(id, row.version, row.definition, state);
    });
  });
}
