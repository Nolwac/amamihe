import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Database } from "./db.js";
import type { Authentication } from "./auth.js";
import { enrolled, currentQuestion, deliveryId } from "./courses.js";
import {
  validPracticeEvidence,
  type PracticeKind,
  type PracticeAttempt,
} from "../shared/practice.js";
export async function initializePracticeSchema(db: Database) {
  await db.exec(
    `CREATE TABLE IF NOT EXISTS practice_attempts (id TEXT PRIMARY KEY,player_id TEXT NOT NULL REFERENCES players(id),course_id TEXT NOT NULL,version INTEGER NOT NULL,level_id TEXT NOT NULL,delivery_id TEXT NOT NULL,resource_id TEXT NOT NULL,kind TEXT NOT NULL,expires_at BIGINT NOT NULL,status TEXT NOT NULL DEFAULT 'open',evidence JSONB,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),FOREIGN KEY(course_id,version) REFERENCES course_versions(course_id,version)); CREATE INDEX IF NOT EXISTS practice_player ON practice_attempts(player_id,course_id);`,
  );
}
export function registerPractice(
  app: FastifyInstance,
  db: Database,
  auth: Authentication,
  now = Date.now,
) {
  const run = (
    method: "GET" | "POST",
    url: string,
    handler: (req: FastifyRequest, playerId: string) => Promise<unknown>,
  ) =>
    app.route({
      method,
      url,
      handler: async (req, reply) => {
        reply.header("Cache-Control", "no-store");
        const p = await auth.player(req.cookies.amamihe);
        if (!p) return reply.code(401).send({ error: "Sign in first." });
        try {
          return await handler(req, p.id);
        } catch (e) {
          return reply.code(409).send({
            error: e instanceof Error ? e.message : "Practice unavailable.",
          });
        }
      },
    });
  run("POST", "/api/practice/:courseId/start", async (req, p) =>
    db.transaction(async (tx) => {
      const courseId = (req.params as { courseId: string }).courseId;
      const b = req.body as { resourceId?: string; deliveryId?: string };
      const row = await enrolled(tx, courseId, p);
      const { level, question } = currentQuestion(row.definition, row.progress);
      const resource = row.definition.resources.find(
        (r) => r.id === b?.resourceId && level.resourceIds.includes(r.id),
      );
      if (
        !question ||
        row.progress.finished ||
        row.progress.blocked ||
        row.progress.assessment?.status === "pending" ||
        b?.deliveryId !== deliveryId(row.progress, question) ||
        !resource ||
        !["javascript", "drawing", "notebook"].includes(resource.kind)
      )
        throw new Error(
          "Open practice for the currently delivered course resource.",
        );
      const attempt: PracticeAttempt = {
        id: randomUUID(),
        courseId,
        version: row.version,
        levelId: level.id,
        deliveryId: b.deliveryId,
        resourceId: resource.id,
        kind: resource.kind as PracticeKind,
        expiresAt: now() + 1800000,
        status: "open",
      };
      await tx.query(
        "INSERT INTO practice_attempts(id,player_id,course_id,version,level_id,delivery_id,resource_id,kind,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
        [
          attempt.id,
          p,
          courseId,
          row.version,
          level.id,
          b.deliveryId,
          resource.id,
          resource.kind,
          attempt.expiresAt,
        ],
      );
      return attempt;
    }),
  );
  run("POST", "/api/practice/:id/submit", async (req, p) =>
    db.transaction(async (tx) => {
      const id = (req.params as { id: string }).id;
      const a = (
        await tx.query<{
          kind: PracticeKind;
          expires_at: string;
          status: string;
          evidence: unknown;
        }>(
          "SELECT * FROM practice_attempts WHERE id=$1 AND player_id=$2 FOR UPDATE",
          [id, p],
        )
      ).rows[0];
      if (!a) throw new Error("Practice attempt not found.");
      if (a.status === "received")
        return {
          status: "received",
          evidence: a.evidence,
          assessment: "unverified-practice",
        };
      if (Number(a.expires_at) < now())
        throw new Error(
          "Practice expired. Your game progress is retained; open a fresh attempt.",
        );
      const evidence = (req.body as { evidence?: unknown })?.evidence;
      if (!validPracticeEvidence(a.kind, evidence))
        throw new Error(
          "Evidence does not match the configured practice tool.",
        );
      await tx.query(
        "UPDATE practice_attempts SET status='received',evidence=$2 WHERE id=$1",
        [id, JSON.stringify(evidence)],
      );
      return {
        status: "received",
        evidence,
        assessment: "unverified-practice",
      };
    }),
  );
  run(
    "GET",
    "/api/practice/:courseId/history",
    async (req, p) =>
      (
        await db.query(
          "SELECT id,version,level_id,delivery_id,resource_id,kind,status,evidence FROM practice_attempts WHERE player_id=$1 AND course_id=$2 ORDER BY created_at DESC LIMIT 20",
          [p, (req.params as { courseId: string }).courseId],
        )
      ).rows,
  );
}
