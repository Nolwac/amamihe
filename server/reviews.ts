import { randomUUID } from "node:crypto";
import { createEmptyCard, type Card } from "ts-fsrs";
import { scheduleReview, remediationWindow } from "../shared/reviews.js";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Database, DatabaseQueries } from "./db.js";
import type { Authentication } from "./auth.js";
import type { CourseDefinition } from "../shared/course.js";
export async function initializeReviewSchema(db: DatabaseQueries) {
  await db.exec(
    `CREATE TABLE IF NOT EXISTS review_cards (player_id TEXT NOT NULL REFERENCES players(id),course_id TEXT NOT NULL,version INTEGER NOT NULL,level_id TEXT NOT NULL,card JSONB NOT NULL,PRIMARY KEY(player_id,course_id,version,level_id),FOREIGN KEY(course_id,version) REFERENCES course_versions(course_id,version));CREATE TABLE IF NOT EXISTS review_deliveries (id TEXT PRIMARY KEY,player_id TEXT NOT NULL REFERENCES players(id),course_id TEXT NOT NULL,version INTEGER NOT NULL,level_id TEXT NOT NULL,question_id TEXT NOT NULL,assisted BOOLEAN NOT NULL DEFAULT false,status TEXT NOT NULL DEFAULT 'open',correct BOOLEAN,result JSONB,expires_at BIGINT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now());CREATE INDEX IF NOT EXISTS reviews_player ON review_deliveries(player_id,course_id);`,
  );
}
export function registerReviews(
  app: FastifyInstance,
  db: Database,
  auth: Authentication,
  now = Date.now,
) {
  const route = (
    method: "GET" | "POST",
    url: string,
    work: (req: FastifyRequest, p: string) => Promise<unknown>,
  ) =>
    app.route({
      method,
      url,
      handler: async (req, reply) => {
        reply.header("Cache-Control", "no-store");
        const p = await auth.player(req.cookies.amamihe);
        if (!p) return reply.code(401).send({ error: "Sign in first." });
        try {
          return await work(req, p.id);
        } catch (e) {
          return reply.code(409).send({
            error: e instanceof Error ? e.message : "Review unavailable.",
          });
        }
      },
    });
  const seed = async (p: string) => {
    const rows = (
      await db.query<{
        course_id: string;
        version: number;
        level_id: string;
        updated_at: Date;
      }>(
        "SELECT a.course_id,e.version,a.level_id,a.updated_at FROM course_assessments a JOIN course_enrollments e ON e.course_id=a.course_id AND e.player_id=a.player_id WHERE a.player_id=$1 AND a.result->>'status'='confirmed'",
        [p],
      )
    ).rows;
    for (const r of rows) {
      const card = createEmptyCard(
        new Date(new Date(r.updated_at).getTime() + 86400000),
      );
      await db.query(
        "INSERT INTO review_cards VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING",
        [p, r.course_id, r.version, r.level_id, JSON.stringify(card)],
      );
    }
  };
  route("GET", "/api/reviews", async (_req, p) => {
    await seed(p);
    const cards = (
      await db.query<{
        course_id: string;
        version: number;
        level_id: string;
        card: Card;
        definition: CourseDefinition;
      }>(
        "SELECT r.*,v.definition FROM review_cards r JOIN course_versions v ON v.course_id=r.course_id AND v.version=r.version WHERE player_id=$1 ORDER BY (card->>'due') LIMIT 100",
        [p],
      )
    ).rows;
    return {
      cards: cards.map((r) => ({
        courseId: r.course_id,
        version: r.version,
        levelId: r.level_id,
        title: r.definition.levels.find((l) => l.id === r.level_id)?.title,
        due: r.card.due,
        dueNow: new Date(r.card.due).getTime() <= now(),
        reps: r.card.reps,
      })),
      summary: {
        confirmedCheckpoints: cards.length,
        template:
          "Review tutor-authored encounters to strengthen recall. Practice artifacts and social rewards do not certify mastery.",
      },
    };
  });
  route("POST", "/api/reviews/start", async (req, p) =>
    db.transaction(async (tx) => {
      const b = req.body as {
        courseId: string;
        version: number;
        levelId: string;
      };
      const row = (
        await tx.query<{ card: Card; definition: CourseDefinition }>(
          "SELECT r.card,v.definition FROM review_cards r JOIN course_versions v ON v.course_id=r.course_id AND v.version=r.version WHERE player_id=$1 AND r.course_id=$2 AND r.version=$3 AND level_id=$4 FOR UPDATE",
          [p, b?.courseId, b?.version, b?.levelId],
        )
      ).rows[0];
      if (!row) throw new Error("Confirmed review checkpoint not found.");
      const level = row.definition.levels.find((l) => l.id === b.levelId)!;
      const active = (
        await tx.query<{ id: string; question_id: string }>(
          "SELECT id,question_id FROM review_deliveries WHERE player_id=$1 AND course_id=$2 AND version=$3 AND level_id=$4 AND status='open' AND expires_at>$5",
          [p, b.courseId, b.version, b.levelId, now()],
        )
      ).rows[0];
      if (active) {
        const q = level.retryQuestions.find(
          (q) => q.id === active.question_id,
        )!;
        return {
          id: active.id,
          question: { prompt: q.prompt, options: q.options },
          theme: level.theme,
          early: new Date(row.card.due).getTime() > now(),
          resources: row.definition.resources.filter((r) =>
            level.resourceIds.includes(r.id),
          ),
        };
      }
      const used = (
        await tx.query<{ question_id: string }>(
          "SELECT question_id FROM review_deliveries WHERE player_id=$1 AND course_id=$2 AND version=$3 AND level_id=$4 UNION SELECT question_id FROM course_chunks WHERE player_id=$1 AND course_id=$2 AND level_id=$4",
          [p, b.courseId, b.version, b.levelId],
        )
      ).rows.map((r) => r.question_id);
      const question = level.retryQuestions.find((q) => !used.includes(q.id));
      if (!question)
        throw new Error(
          "Fresh authored review questions are exhausted. The tutor needs to extend the bank.",
        );
      const open = (
        await tx.query(
          "SELECT id FROM review_deliveries WHERE player_id=$1 AND course_id=$2 AND version=$3 AND level_id=$4 AND status='open' AND expires_at>$5",
          [p, b.courseId, b.version, b.levelId, now()],
        )
      ).rows;
      if (open.length)
        throw new Error("Complete the existing review or wait for its expiry.");
      const id = randomUUID();
      await tx.query(
        "INSERT INTO review_deliveries(id,player_id,course_id,version,level_id,question_id,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7)",
        [id, p, b.courseId, b.version, b.levelId, question.id, now() + 1800000],
      );
      return {
        id,
        question: { prompt: question.prompt, options: question.options },
        theme: level.theme,
        early: new Date(row.card.due).getTime() > now(),
        resources: row.definition.resources.filter((r) =>
          level.resourceIds.includes(r.id),
        ),
      };
    }),
  );
  const delivery = async (tx: DatabaseQueries, id: string, p: string) => {
    const a = (
      await tx.query<{
        course_id: string;
        version: number;
        level_id: string;
        question_id: string;
        assisted: boolean;
        status: string;
        result: unknown;
        expires_at: string;
      }>(
        "SELECT * FROM review_deliveries WHERE id=$1 AND player_id=$2 FOR UPDATE",
        [id, p],
      )
    ).rows[0];
    if (!a) throw new Error("Review not found.");
    const d = (
      await tx.query<{ definition: CourseDefinition }>(
        "SELECT definition FROM course_versions WHERE course_id=$1 AND version=$2",
        [a.course_id, a.version],
      )
    ).rows[0].definition;
    const l = d.levels.find((l) => l.id === a.level_id)!;
    return {
      a,
      d,
      l,
      q: l.retryQuestions.find((q) => q.id === a.question_id)!,
    };
  };
  route("POST", "/api/reviews/:id/help", async (req, p) =>
    db.transaction(async (tx) => {
      const id = (req.params as { id: string }).id;
      const { a, q } = await delivery(tx, id, p);
      if (a.status !== "open" || Number(a.expires_at) < now())
        throw new Error("Review closed.");
      await tx.query("UPDATE review_deliveries SET assisted=true WHERE id=$1", [
        id,
      ]);
      return { hint: q.hint, explanation: q.explanation };
    }),
  );
  route("POST", "/api/reviews/:id/answer", async (req, p) =>
    db.transaction(async (tx) => {
      const id = (req.params as { id: string }).id;
      const { a, q, l, d } = await delivery(tx, id, p);
      if (a.status === "complete") return a.result;
      if (Number(a.expires_at) < now()) throw new Error("Review expired.");
      const answer = (req.body as { answer?: number })?.answer;
      if (
        !Number.isInteger(answer) ||
        Number(answer) < 0 ||
        Number(answer) >= q.options.length
      )
        throw new Error("Choose an available answer.");
      const r = (
        await tx.query<{ card: Card }>(
          "SELECT card FROM review_cards WHERE player_id=$1 AND course_id=$2 AND version=$3 AND level_id=$4 FOR UPDATE",
          [p, a.course_id, a.version, a.level_id],
        )
      ).rows[0];
      const correct = answer === q.answer;
      const early = new Date(r.card.due).getTime() > now();
      const card = early
        ? r.card
        : scheduleReview(r.card, now(), correct, a.assisted);
      const previous = (
        await tx.query<{ correct: boolean; assisted: boolean }>(
          "SELECT correct,assisted FROM review_deliveries WHERE player_id=$1 AND course_id=$2 AND level_id=$3 AND status='complete' ORDER BY created_at DESC LIMIT 19",
          [p, a.course_id, a.level_id],
        )
      ).rows.reverse();
      const window = remediationWindow(
        [...previous, { correct, assisted: a.assisted }],
        d.reviewPolicy,
      );
      const prerequisites = d.levels.filter((level) =>
        l.prerequisites.includes(level.id),
      );
      const resourceIds = new Set([
        ...l.resourceIds,
        ...(window.remediate
          ? prerequisites.flatMap((level) => level.resourceIds)
          : []),
      ]);
      const result = {
        criterionId: q.retryFor,
        rubric: q.rubric,
        correct,
        independent: correct && !a.assisted,
        early,
        due: card.due,
        explanation:
          correct && !a.assisted
            ? "Independent authored answer recorded."
            : q.explanation,
        window,
        resources: d.resources.filter((r) => resourceIds.has(r.id)),
        pointsAwarded: 0,
      };
      await tx.query(
        "UPDATE review_cards SET card=$5 WHERE player_id=$1 AND course_id=$2 AND version=$3 AND level_id=$4",
        [p, a.course_id, a.version, a.level_id, JSON.stringify(card)],
      );
      await tx.query(
        "UPDATE review_deliveries SET status='complete',correct=$2,result=$3 WHERE id=$1",
        [id, correct, JSON.stringify(result)],
      );
      return result;
    }),
  );
}
