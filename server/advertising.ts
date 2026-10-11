import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Database } from "./db.js";
import type { Authentication } from "./auth.js";
import type { CourseDefinition } from "../shared/course.js";
export function adDestination(value: unknown): string | null {
  try {
    if (typeof value !== "string" || value.length > 1000) return null;
    const u = new URL(value);
    return u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      !u.port &&
      /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(u.hostname) &&
      !u.hostname.endsWith(".local") &&
      !u.hostname.endsWith(".localhost") &&
      !u.hostname.endsWith(".internal")
      ? u.href
      : null;
  } catch {
    return null;
  }
}
export async function initializeAdvertisingSchema(db: Database) {
  await db.exec(
    `CREATE TABLE IF NOT EXISTS world_ads(id TEXT PRIMARY KEY,owner_id TEXT NOT NULL REFERENCES players(id),title TEXT NOT NULL,description TEXT NOT NULL,destination TEXT NOT NULL,course_id TEXT,version INTEGER,level_id TEXT,status TEXT NOT NULL DEFAULT 'pending',created_at TIMESTAMPTZ NOT NULL DEFAULT now()); CREATE TABLE IF NOT EXISTS ad_events(id TEXT PRIMARY KEY,ad_id TEXT NOT NULL REFERENCES world_ads(id),actor_id TEXT NOT NULL REFERENCES players(id),action TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now());`,
  );
}
export function registerAdvertising(
  app: FastifyInstance,
  db: Database,
  auth: Authentication,
  moderators = (process.env.SOCIAL_MODERATOR_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
) {
  app.get("/api/billboards", async (req) => {
    const q = req.query as {
      courseId?: string;
      levelId?: string;
      version?: string;
    };
    if (!q.courseId)
      return (
        await db.query(
          "SELECT id,title,description,destination FROM world_ads WHERE status='approved' AND course_id IS NULL ORDER BY created_at DESC LIMIT 3",
        )
      ).rows;
    if (
      q.courseId.length > 100 ||
      String(q.levelId || "").length > 100 ||
      !Number.isInteger(Number(q.version))
    )
      return [];
    return (
      await db.query(
        "SELECT id,title,description,destination FROM world_ads WHERE status='approved' AND course_id=$1 AND version=$2 AND level_id=$3 ORDER BY created_at DESC LIMIT 2",
        [q.courseId, Number(q.version), q.levelId],
      )
    ).rows;
  });
  const route = (
    method: "GET" | "POST",
    url: string,
    work: (req: FastifyRequest, id: string) => Promise<unknown>,
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
            error: e instanceof Error ? e.message : "Advertising unavailable.",
          });
        }
      },
    });
  route("GET", "/api/ads", async (_req, p) => ({
    moderator: moderators.includes(p),
    ads: (
      await db.query(
        "SELECT * FROM world_ads WHERE owner_id=$1 ORDER BY created_at DESC LIMIT 30",
        [p],
      )
    ).rows,
  }));
  route("POST", "/api/ads", async (req, p) =>
    db.transaction(async (tx) => {
      const b = req.body as {
        title?: string;
        description?: string;
        destination?: string;
        courseId?: string;
        version?: number;
        levelId?: string;
      };
      const destination = adDestination(b?.destination);
      if (
        typeof b?.title !== "string" ||
        b.title.trim().length < 3 ||
        b.title.length > 70 ||
        typeof b.description !== "string" ||
        b.description.length > 220 ||
        !destination
      )
        throw new Error(
          "Provide a title, brief description and public HTTPS destination.",
        );
      await tx.query("SELECT id FROM players WHERE id=$1 FOR UPDATE", [p]);
      const count = (
        await tx.query<{ n: number }>(
          "SELECT count(*)::integer AS n FROM world_ads WHERE owner_id=$1 AND status IN ('pending','approved')",
          [p],
        )
      ).rows[0].n;
      if (count >= 20)
        throw new Error(
          "Withdraw an existing placement before submitting another.",
        );
      if (b.courseId) {
        const owned = (
          await tx.query<{ definition: CourseDefinition }>(
            "SELECT v.definition FROM course_versions v JOIN course_drafts d ON d.id=v.course_id WHERE v.course_id=$1 AND v.version=$2 AND d.owner_id=$3",
            [b.courseId, b.version, p],
          )
        ).rows[0];
        if (!owned?.definition.levels.some((l) => l.id === b.levelId))
          throw new Error("Choose a published level in your own course.");
      }
      const id = randomUUID();
      await tx.query(
        "INSERT INTO world_ads(id,owner_id,title,description,destination,course_id,version,level_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
        [
          id,
          p,
          b.title.trim(),
          b.description.trim(),
          destination,
          b.courseId || null,
          b.courseId ? b.version : null,
          b.courseId ? b.levelId : null,
        ],
      );
      await tx.query(
        "INSERT INTO ad_events(id,ad_id,actor_id,action) VALUES($1,$2,$3,'submitted')",
        [randomUUID(), id, p],
      );
      return { id, status: "pending" };
    }),
  );
  route("GET", "/api/ads/moderation", async (_req, p) => {
    if (!moderators.includes(p)) throw new Error("Moderator access required.");
    return (
      await db.query(
        "SELECT * FROM world_ads WHERE status IN ('pending','approved') ORDER BY created_at LIMIT 50",
      )
    ).rows;
  });
  route("POST", "/api/ads/:id/action", async (req, p) =>
    db.transaction(async (tx) => {
      const ad = (
        await tx.query<{ owner_id: string; status: string }>(
          "SELECT owner_id,status FROM world_ads WHERE id=$1 FOR UPDATE",
          [(req.params as { id: string }).id],
        )
      ).rows[0];
      const action = (req.body as { action?: string })?.action;
      if (
        !ad ||
        !["approve", "reject", "withdraw"].includes(action || "") ||
        (action === "withdraw" ? ad.owner_id !== p : !moderators.includes(p))
      )
        throw new Error("Placement action unavailable.");
      const status =
        action === "approve"
          ? "approved"
          : action === "reject"
            ? "rejected"
            : "withdrawn";
      if (ad.status === "withdrawn" && status === "approved")
        throw new Error("Withdrawn placements cannot be restored.");
      if (ad.status !== status) {
        const id = (req.params as { id: string }).id;
        await tx.query("UPDATE world_ads SET status=$2 WHERE id=$1", [
          id,
          status,
        ]);
        await tx.query(
          "INSERT INTO ad_events(id,ad_id,actor_id,action) VALUES($1,$2,$3,$4)",
          [randomUUID(), id, p, action],
        );
      }
      return { status };
    }),
  );
}
