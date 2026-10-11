import type { FastifyInstance } from "fastify";
import type { Database } from "./db.js";
import type { Authentication } from "./auth.js";
export function registerOperations(
  app: FastifyInstance,
  db: Database,
  auth: Authentication,
  moderators = (process.env.SOCIAL_MODERATOR_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
) {
  app.get("/api/operations", async (req, reply) => {
    reply.header("Cache-Control", "no-store");
    const p = await auth.player(req.cookies.amamihe);
    if (!p) return reply.code(401).send({ error: "Sign in first." });
    if (!moderators.includes(p.id))
      return reply.code(403).send({ error: "Moderator access required." });
    const result = await db.query<{
      reports: number;
      ads: number;
      appeals: number;
      presence: number;
    }>(
      `SELECT (SELECT count(*)::integer FROM social_reports WHERE NOT resolved) AS reports,(SELECT count(*)::integer FROM world_ads WHERE status='pending') AS ads,(SELECT count(*)::integer FROM world_policy WHERE state->>'status'='arrested' AND state->>'appeal' IS NOT NULL) AS appeals,(SELECT count(*)::integer FROM social_presence WHERE last_seen>$1) AS presence`,
      [Date.now() - 20000],
    );
    return {
      ...result.rows[0],
      limits: {
        roomPlayers: 8,
        teamPlayers: 4,
        visiblePeers: 7,
        animatedPeers: 3,
        presenceSeconds: 20,
        pollSeconds: 3,
      },
      modelMode: process.env.DECISION_PROVIDER || "mock",
      emailConfigured: Boolean(process.env.EMAIL_PROVIDER),
      notice:
        "Counts establish current prototype activity, not service capacity or learning effectiveness.",
    };
  });
}
