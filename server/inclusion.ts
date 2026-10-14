import type { FastifyInstance } from "fastify";
import type { Database } from "./db.js";
import type { Authentication } from "./auth.js";
import type { CourseDefinition } from "../shared/course.js";
import {
  availableCourseLanguages,
  localizedDefinition,
  translationSourceHash,
} from "../shared/course-language.js";
import { kidsCourses } from "./kids-courses.js";
import { language } from "../shared/inclusion.js";
import { randomUUID } from "node:crypto";

type Payload = Record<string, any>;
const maintainedNumberGarden = kidsCourses().find(
  (c) => c.id === "amamihe-number-garden",
)!.definition;
export function compatibleMaintainedLanguages(
  courseId: string,
  original: CourseDefinition,
): CourseDefinition {
  // Add display translations only when old authored text and grading match.
  // Never rewrite a pinned version, original citation or learner progress.
  if (
    courseId === "amamihe-number-garden" &&
    !original.translations &&
    translationSourceHash(original) ===
      translationSourceHash(maintainedNumberGarden)
  )
    return { ...original, translations: maintainedNumberGarden.translations };
  return original;
}
export async function initializeInclusionSchema(db: Database) {
  await db.exec(`CREATE TABLE IF NOT EXISTS material_reports (
    id TEXT PRIMARY KEY, course_id TEXT NOT NULL, version INTEGER NOT NULL,
    resource_id TEXT NOT NULL, reporter_id TEXT NOT NULL REFERENCES players(id),
    description TEXT NOT NULL, resolved BOOLEAN NOT NULL DEFAULT false,
    response TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY(course_id,version) REFERENCES course_versions(course_id,version));
    CREATE INDEX IF NOT EXISTS material_reports_course ON material_reports(course_id,version);`);
}
export function localizeCoursePayload(
  payload: Payload,
  original: CourseDefinition,
  requested: ReturnType<typeof language>,
): Payload {
  const d = localizedDefinition(original, requested);
  const result = structuredClone(payload);
  result.language = d.language;
  result.sourceLanguage = original.language;
  result.availableLanguages = availableCourseLanguages(original);
  if (d.language !== original.language)
    result.translationNote = original.translations?.[requested]?.note;
  const resource = (r: Payload) => {
    const source = d.resources.find((item) => item.id === r.id);
    return source ? { ...r, title: source.title, content: source.content } : r;
  };
  const question = (q: Payload) => {
    const id = String(q.id).includes(":") ? String(q.id).split(":")[2] : q.id;
    const source = d.levels
      .flatMap((l) => [...l.questions, ...l.retryQuestions])
      .find((item) => item.id === id);
    if (!source) return q;
    const copy: Payload = {
      ...q,
      prompt: source.prompt,
      options: source.options,
    };
    // Only replace already-authorized fields, never add hints to public tasks.
    if (Object.hasOwn(q, "hint")) copy.hint = source.hint;
    if (Object.hasOwn(q, "explanation")) copy.explanation = source.explanation;
    return copy;
  };
  if (result.definition) {
    result.definition = {
      ...result.definition,
      title: d.title,
      summary: d.summary,
      language: d.language,
      sourceLanguage: original.language,
      availableLanguages: result.availableLanguages,
      translationNote: result.translationNote,
      concepts: d.concepts,
      resources: result.definition.resources.map(resource),
      levels: result.definition.levels.map((l: Payload) => ({
        ...l,
        title: d.levels.find((level) => level.id === l.id)?.title || l.title,
        questions: l.questions.map(question),
        retryQuestions: l.retryQuestions.map(question),
      })),
    };
  }
  if (result.level)
    result.level.title =
      d.levels.find((l) => l.id === result.level.id)?.title ||
      result.level.title;
  if (result.question) result.question = question(result.question);
  if (result.resources) result.resources = result.resources.map(resource);
  if (result.worldAchievement?.question)
    result.worldAchievement.question = question(
      result.worldAchievement.question,
    );
  if (result.replayableLevels)
    result.replayableLevels = result.replayableLevels.map((l: Payload) => ({
      ...l,
      title: d.levels.find((item) => item.id === l.id)?.title || l.title,
    }));
  if (result.journey?.path)
    result.journey.path = result.journey.path.map((l: Payload) => ({
      ...l,
      title: d.levels.find((item) => item.id === l.id)?.title || l.title,
    }));
  if (result.journey?.rehearsal)
    result.journey.rehearsal = question(result.journey.rehearsal);
  return result;
}
export function registerCourseLocalization(
  app: FastifyInstance,
  db: Database,
  auth: Authentication,
) {
  app.addHook("preSerialization", async (req, reply, payload) => {
    if (reply.statusCode >= 400 || !payload || typeof payload !== "object")
      return payload;
    const result = payload as Payload;
    const requested = language(req.headers["x-amamihe-language"]);
    const path = req.url.split("?")[0];
    if (path === "/api/courses" && Array.isArray(result.courses)) {
      return {
        ...result,
        courses: await Promise.all(
          result.courses.map(async (c: Payload) => {
            const row = (
              await db.query<{ definition: CourseDefinition }>(
                "SELECT definition FROM course_versions WHERE course_id=$1 AND version=$2",
                [c.id, c.version],
              )
            ).rows[0];
            if (!row) return c;
            const definition = compatibleMaintainedLanguages(
              c.id,
              row.definition,
            );
            const d = localizedDefinition(definition, requested);
            return {
              ...c,
              title: d.title,
              summary: d.summary,
              language: d.language,
              availableLanguages: availableCourseLanguages(definition),
            };
          }),
        ),
      };
    }
    const match = path.match(
      /^\/api\/(courses|learning)\/([^/]+)(?:\/([^/]+))?$/,
    );
    if (!match) return payload;
    const courseId = decodeURIComponent(match[2]);
    let version = result.version;
    if (!Number.isInteger(version) && match[1] === "learning") {
      const p = await auth.player(req.cookies.amamihe);
      if (!p) return payload;
      version = (
        await db.query<{ version: number }>(
          "SELECT version FROM course_enrollments WHERE course_id=$1 AND player_id=$2",
          [courseId, p.id],
        )
      ).rows[0]?.version;
    }
    if (!Number.isInteger(version)) return payload;
    const row = (
      await db.query<{ definition: CourseDefinition }>(
        "SELECT definition FROM course_versions WHERE course_id=$1 AND version=$2",
        [courseId, version],
      )
    ).rows[0];
    if (!row) return payload;
    const definition = compatibleMaintainedLanguages(courseId, row.definition);
    if (match[3] === "help") {
      const bankId = String((req.body as Payload)?.questionId || "").split(
        ":",
      )[2];
      const q = localizedDefinition(definition, requested)
        .levels.flatMap((l) => [...l.questions, ...l.retryQuestions])
        .find((q) => q.id === bankId);
      return q
        ? { ...result, hint: q.hint, explanation: q.explanation }
        : payload;
    }
    return localizeCoursePayload(result, definition, requested);
  });
}
export function registerInclusion(
  app: FastifyInstance,
  db: Database,
  auth: Authentication,
) {
  app.get(
    "/api/account/export",
    { config: { rateLimit: { max: 3, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const p = await auth.player(req.cookies.amamihe);
      reply.header("Cache-Control", "no-store");
      if (!p)
        return reply
          .code(401)
          .send({ error: "Sign in to download your data." });
      const tables = [
        "attempts",
        "chunks",
        "assistance",
        "course_enrollments",
        "course_chunks",
        "course_assessments",
        "course_decisions",
        "player_inventory",
        "player_badges",
        "reward_ledger",
        "practice_attempts",
        "world_policy_events",
        "material_reports",
      ];
      const data: Record<string, unknown> = {};
      let truncated = false,
        bytes = 0;
      const omittedCategories: string[] = [];
      for (const table of tables) {
        const column =
          table === "material_reports" ? "reporter_id" : "player_id";
        const sql = ["chunks", "assistance"].includes(table)
          ? `SELECT c.* FROM ${table} c JOIN attempts a ON a.id=c.attempt_id WHERE a.player_id=$1 LIMIT 501`
          : `SELECT * FROM ${table} WHERE ${column}=$1 LIMIT 501`;
        const rows = (await db.query(sql, [p.id])).rows;
        const selected: unknown[] = [];
        for (const row of rows.slice(0, 500)) {
          const size = Buffer.byteLength(JSON.stringify(row));
          if (bytes + size > 4_000_000) break;
          selected.push(row);
          bytes += size;
        }
        if (selected.length < rows.length) {
          truncated = true;
          omittedCategories.push(table);
        }
        data[table] = selected;
      }
      return {
        exportedAt: new Date().toISOString(),
        account: p,
        data,
        truncated,
        omittedCategories,
        rowLimitPerCategory: 500,
        maximumDataBytes: 4_000_000,
      };
    },
  );
  app.post<{
    Params: { id: string };
    Body: { version: number; resourceId: string; description: string };
  }>(
    "/api/courses/:id/material-report",
    { config: { rateLimit: { max: 6, timeWindow: "1 hour" } } },
    async (req, reply) => {
      const p = await auth.player(req.cookies.amamihe);
      if (!p)
        return reply
          .code(401)
          .send({ error: "Sign in to report a material error." });
      const body = req.body;
      if (
        !Number.isInteger(body?.version) ||
        typeof body?.description !== "string" ||
        body.description.trim().length < 10 ||
        body.description.length > 2000 ||
        typeof body.resourceId !== "string"
      )
        return reply.code(400).send({
          error: "Describe the material error in 10–2000 characters.",
        });
      const row = (
        await db.query<{ definition: CourseDefinition }>(
          "SELECT definition FROM course_versions WHERE course_id=$1 AND version=$2",
          [req.params.id, body.version],
        )
      ).rows[0];
      if (!row?.definition.resources.some((r) => r.id === body.resourceId))
        return reply
          .code(404)
          .send({ error: "The published material is unavailable." });
      const id = randomUUID();
      await db.query(
        "INSERT INTO material_reports(id,course_id,version,resource_id,reporter_id,description) VALUES($1,$2,$3,$4,$5,$6)",
        [
          id,
          req.params.id,
          body.version,
          body.resourceId,
          p.id,
          body.description.trim(),
        ],
      );
      return { id, status: "received" };
    },
  );
  app.get<{ Params: { id: string } }>(
    "/api/studio/courses/:id/material-reports",
    async (req, reply) => {
      const p = await auth.player(req.cookies.amamihe);
      if (!p) return reply.code(401).send({ error: "Sign in first." });
      const own = (
        await db.query(
          "SELECT id FROM course_drafts WHERE id=$1 AND owner_id=$2",
          [req.params.id, p.id],
        )
      ).rows.length;
      if (!own)
        return reply.code(404).send({ error: "Your course is unavailable." });
      return {
        reports: (
          await db.query(
            "SELECT id,version,resource_id,description,resolved,response,created_at FROM material_reports WHERE course_id=$1 ORDER BY created_at DESC LIMIT 100",
            [req.params.id],
          )
        ).rows,
      };
    },
  );
  app.post<{
    Params: { id: string; report: string };
    Body: { response: string };
  }>(
    "/api/studio/courses/:id/material-reports/:report/resolve",
    async (req, reply) => {
      const p = await auth.player(req.cookies.amamihe);
      if (!p) return reply.code(401).send({ error: "Sign in first." });
      const response = req.body?.response;
      if (
        typeof response !== "string" ||
        response.trim().length < 10 ||
        response.length > 1000
      )
        return reply.code(400).send({
          error:
            "Record the publisher's correction or review in 10–1000 characters.",
        });
      const updated = await db.query(
        "UPDATE material_reports SET resolved=true,response=$4 WHERE id=$1 AND course_id=$2 AND EXISTS(SELECT 1 FROM course_drafts WHERE id=$2 AND owner_id=$3) RETURNING id",
        [req.params.report, req.params.id, p.id, response.trim()],
      );
      if (!updated.rows.length)
        return reply.code(404).send({ error: "Your report is unavailable." });
      return { ok: true };
    },
  );
}
