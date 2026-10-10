import type { FastifyInstance } from "fastify";
import type { Database } from "./db.js";
import type { Authentication } from "./auth.js";
import { GEAR } from "../shared/gameplay.js";
export function registerRewards(
  app: FastifyInstance,
  db: Database,
  auth: Authentication,
) {
  app.get("/api/rewards", async (req, reply) => {
    reply.header("Cache-Control", "no-store");
    const player = await auth.player(req.cookies.amamihe);
    if (!player) return reply.code(401).send({ error: "Sign in first." });
    return {
      points: player.points,
      outfit: player.outfit,
      gear: GEAR,
      inventory: (
        await db.query<{ gear_id: string }>(
          "SELECT gear_id FROM player_inventory WHERE player_id=$1",
          [player.id],
        )
      ).rows.map((r) => r.gear_id),
      badges: (
        await db.query<{ id: string; title: string }>(
          "SELECT badge_id AS id,title FROM player_badges WHERE player_id=$1 ORDER BY created_at DESC LIMIT 100",
          [player.id],
        )
      ).rows,
    };
  });
  for (const action of ["buy", "equip"] as const)
    app.post(`/api/rewards/${action}`, async (req, reply) => {
      reply.header("Cache-Control", "no-store");
      const player = await auth.player(req.cookies.amamihe);
      if (!player) return reply.code(401).send({ error: "Sign in first." });
      const body = req.body as { gearId?: unknown } | null;
      const gear = GEAR.find((g) => g.id === body?.gearId);
      if (!gear)
        return reply.code(400).send({ error: "Choose a listed cosmetic." });
      return db.transaction(async (tx) => {
        const balance = (
          await tx.query<{ points: number }>(
            "SELECT points FROM players WHERE id=$1 FOR UPDATE",
            [player.id],
          )
        ).rows[0].points;
        const owned =
          (
            await tx.query(
              "SELECT 1 FROM player_inventory WHERE player_id=$1 AND gear_id=$2",
              [player.id, gear.id],
            )
          ).rows.length > 0;
        if (action === "buy" && !owned) {
          if (balance < gear.price)
            return reply.code(409).send({
              error: "Earn more activity points to unlock this jacket.",
            });
          await tx.query(
            "INSERT INTO player_inventory(player_id,gear_id) VALUES($1,$2)",
            [player.id, gear.id],
          );
          await tx.query("UPDATE players SET points=points-$2 WHERE id=$1", [
            player.id,
            gear.price,
          ]);
          await tx.query(
            "INSERT INTO reward_ledger(player_id,event_id,amount,reason) VALUES($1,$2,$3,$4)",
            [
              player.id,
              "purchase:" + gear.id,
              -gear.price,
              "Cosmetic purchase",
            ],
          );
        } else if (action === "equip" && !owned)
          return reply.code(403).send({ error: "Unlock this jacket first." });
        await tx.query("UPDATE players SET outfit=$2 WHERE id=$1", [
          player.id,
          gear.id,
        ]);
        return {
          outfit: gear.id,
          points: balance - (action === "buy" && !owned ? gear.price : 0),
        };
      });
    });
}
