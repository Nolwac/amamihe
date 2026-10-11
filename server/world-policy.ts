import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { Database, DatabaseQueries } from "./db.js";
import type { Authentication } from "./auth.js";
export type WorldPolicyState = {
  status: "free" | "warned" | "arrested";
  idleMs: number;
  lastSeen: number;
  protection: string;
  detentionId?: string;
  arrestedAt?: number;
  goalCourseId?: string;
  goalBaseline?: number;
  appeal?: string;
  discoveryUntil?: number;
  discoveryUsed?: boolean;
  policyVersion?: string;
  warningMinutes?: number;
  arrestMinutes?: number;
};
export async function initializeWorldPolicySchema(db: Database) {
  await db.exec(
    `CREATE TABLE IF NOT EXISTS world_policy(player_id TEXT PRIMARY KEY REFERENCES players(id),state JSONB NOT NULL); CREATE TABLE IF NOT EXISTS world_policy_events(id TEXT PRIMARY KEY,player_id TEXT NOT NULL REFERENCES players(id),event TEXT NOT NULL,detail TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now());`,
  );
}
export function advancePolicy(
  state: WorldPolicyState,
  now: number,
  mode: string,
  warnMs = 600000,
  arrestMs = 900000,
): WorldPolicyState {
  const elapsed = Math.max(0, now - state.lastSeen);
  const next = { ...state, lastSeen: now, protection: "" };
  if (
    ["break", "hidden", "waiting"].includes(mode) ||
    elapsed > 10000 ||
    (state.discoveryUntil || 0) > now
  ) {
    next.protection =
      mode !== "active"
        ? mode
        : elapsed > 10000
          ? "connection gap"
          : "course discovery";
    return next;
  }
  if (state.status === "arrested") return next;
  next.idleMs += elapsed;
  if (next.idleMs >= arrestMs) {
    next.status = "arrested";
    next.detentionId = randomUUID();
    next.arrestedAt = now;
  } else if (next.idleMs >= warnMs) next.status = "warned";
  return next;
}
export function registerWorldPolicy(
  app: FastifyInstance,
  db: Database,
  auth: Authentication,
  now = Date.now,
  moderators = (process.env.SOCIAL_MODERATOR_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
) {
  const warningSeconds = Number(
      process.env.WORLD_IDLE_WARNING_SECONDS || "600",
    ),
    arrestSeconds = Number(process.env.WORLD_IDLE_ARREST_SECONDS || "900");
  if (
    !Number.isInteger(warningSeconds) ||
    !Number.isInteger(arrestSeconds) ||
    warningSeconds < 60 ||
    arrestSeconds < warningSeconds + 60 ||
    arrestSeconds > 7200
  )
    throw new Error("Invalid world idle thresholds.");
  const policyVersion = `engagement-v1:${warningSeconds}:${arrestSeconds}`;
  const state = async (tx: DatabaseQueries, p: string) => {
    await tx.query(
      "INSERT INTO world_policy(player_id,state) VALUES($1,$2) ON CONFLICT DO NOTHING",
      [
        p,
        JSON.stringify({
          status: "free",
          idleMs: 0,
          lastSeen: now(),
          protection: "",
          policyVersion,
        }),
      ],
    );
    return (
      await tx.query<{ state: WorldPolicyState }>(
        "SELECT state FROM world_policy WHERE player_id=$1 FOR UPDATE",
        [p],
      )
    ).rows[0].state;
  };
  const save = (tx: DatabaseQueries, p: string, s: WorldPolicyState) =>
    tx.query("UPDATE world_policy SET state=$2 WHERE player_id=$1", [
      p,
      JSON.stringify(s),
    ]);
  const event = (tx: DatabaseQueries, p: string, name: string, detail = "") =>
    tx.query(
      "INSERT INTO world_policy_events(id,player_id,event,detail) VALUES($1,$2,$3,$4)",
      [randomUUID(), p, name, detail],
    );
  const release = async (
    tx: DatabaseQueries,
    p: string,
    s: WorldPolicyState,
    reason: string,
  ) => {
    await event(tx, p, "released", reason + ":" + (s.detentionId || ""));
    await save(tx, p, {
      status: "free",
      idleMs: 0,
      lastSeen: now(),
      protection: "",
    });
  };
  const count = async (tx: DatabaseQueries, p: string, course: string) =>
    Number(
      (
        await tx.query<{ n: number }>(
          "SELECT count(*)::integer AS n FROM course_chunks WHERE player_id=$1 AND course_id=$2 AND correct AND NOT assisted",
          [p, course],
        )
      ).rows[0].n,
    );
  app.addHook("onRequest", async (req, reply) => {
    const match = req.url.match(/^\/api\/learning\/([^/?]+)\//);
    if (!match || req.method !== "POST") return;
    const p = await auth.player(req.cookies.amamihe);
    if (!p) return;
    const s = (
      await db.query<{ state: WorldPolicyState }>(
        "SELECT state FROM world_policy WHERE player_id=$1",
        [p.id],
      )
    ).rows[0]?.state;
    if (
      s?.status === "arrested" &&
      s.goalCourseId &&
      decodeURIComponent(match[1]) !== s.goalCourseId
    )
      return reply.code(423).send({
        error:
          "Continue your selected release course or use Learning Police controls to change it. Progress is retained.",
      });
  });
  app.addHook("onResponse", async (req, reply) => {
    const discovery =
      req.method === "GET" && req.url.startsWith("/api/courses?");
    if (
      reply.statusCode >= 300 ||
      (!discovery && !["POST", "PUT"].includes(req.method))
    )
      return;
    const meaningful =
      /^\/api\/learning\/[^/]+\/(answer|help|retry|continue|classify)$/.test(
        req.url,
      ) ||
      /^\/api\/studio\/courses(?:\/[^/]+(?:\/publish)?)?$/.test(req.url) ||
      /^\/api\/practice\/[^/]+\/submit$/.test(req.url) ||
      /^\/api\/reviews\/[^/]+\/answer$/.test(req.url) ||
      /^\/api\/social\/battles\/[^/]+\/answer$/.test(req.url);
    if (!meaningful && !discovery) return;
    const p = await auth.player(req.cookies.amamihe);
    if (!p) return;
    await db.transaction(async (tx) => {
      const s = await state(tx, p.id);
      if (discovery) {
        if (!s.discoveryUsed && s.status !== "arrested") {
          s.discoveryUntil = now() + 300000;
          s.discoveryUsed = true;
          await save(tx, p.id, s);
        }
        return;
      }
      if (s.status === "arrested") {
        const answers = s.goalCourseId
          ? await count(tx, p.id, s.goalCourseId)
          : 0;
        const goal = s.goalCourseId
          ? (
              await tx.query<{ progress: { finished?: boolean } }>(
                "SELECT progress FROM course_enrollments WHERE player_id=$1 AND course_id=$2",
                [p.id, s.goalCourseId],
              )
            ).rows[0]
          : undefined;
        if (
          (s.goalCourseId &&
            (answers >= (s.goalBaseline || 0) + 2 ||
              (goal?.progress.finished && answers > (s.goalBaseline || 0)))) ||
          /^\/api\/studio\/courses\/[^/]+\/publish$/.test(req.url)
        ) {
          await release(tx, p.id, s, "learning-or-authoring");
          return;
        }
      } else {
        s.status = "free";
        s.idleMs = 0;
        s.discoveryUsed = false;
        s.discoveryUntil = undefined;
      }
      s.lastSeen = now();
      await save(tx, p.id, s);
    });
  });
  app.route({
    method: ["GET", "POST"],
    url: "/api/world-policy",
    handler: async (req, reply) => {
      reply.header("Cache-Control", "no-store");
      const p = await auth.player(req.cookies.amamihe);
      if (!p) return reply.code(401).send({ error: "Sign in first." });
      try {
        return await db.transaction(async (tx) => {
          let s = await state(tx, p.id);
          if (req.method === "POST") {
            const b = req.body as {
              action?: string;
              mode?: string;
              courseId?: string;
              message?: string;
            };
            if (b?.action === "heartbeat") {
              if (
                !["active", "break", "hidden", "waiting"].includes(b.mode || "")
              )
                throw new Error("Choose a valid activity mode.");
              const previous = s.status;
              s = advancePolicy(
                s,
                now(),
                b.mode!,
                warningSeconds * 1000,
                arrestSeconds * 1000,
              );
              if (s.status !== previous)
                await event(
                  tx,
                  p.id,
                  s.status,
                  s.detentionId || "Idle warning",
                );
              await save(tx, p.id, s);
            } else if (b?.action === "fine") {
              if (s.status !== "arrested") return s;
              const balance = (
                await tx.query<{ points: number }>(
                  "SELECT points FROM players WHERE id=$1 FOR UPDATE",
                  [p.id],
                )
              ).rows[0].points;
              if (balance < 5)
                throw new Error(
                  "Five cosmetic points are required. The learning release option is free.",
                );
              const inserted = await tx.query(
                "INSERT INTO reward_ledger(player_id,event_id,amount,reason) VALUES($1,$2,-5,'Learning Police cosmetic fine') ON CONFLICT DO NOTHING RETURNING event_id",
                [p.id, "police:" + s.detentionId],
              );
              if (inserted.rows.length)
                await tx.query(
                  "UPDATE players SET points=points-5 WHERE id=$1",
                  [p.id],
                );
              await release(tx, p.id, s, "cosmetic-fine");
              return {
                status: "free",
                idleMs: 0,
                lastSeen: now(),
                protection: "",
              };
            } else if (b?.action === "release-course") {
              if (s.status !== "arrested" || typeof b.courseId !== "string")
                throw new Error("No learning release is required.");
              const enrollment = (
                await tx.query<{
                  progress: { finished?: boolean; blocked?: boolean };
                }>(
                  "SELECT progress FROM course_enrollments WHERE player_id=$1 AND course_id=$2",
                  [p.id, b.courseId],
                )
              ).rows[0];
              if (
                !enrollment ||
                enrollment.progress.finished ||
                enrollment.progress.blocked
              )
                throw new Error(
                  "Enroll in an available adventure to choose it for release.",
                );
              s.goalCourseId = b.courseId;
              s.goalBaseline = await count(tx, p.id, b.courseId);
              await event(tx, p.id, "release-course", b.courseId);
              await save(tx, p.id, s);
            } else if (b?.action === "appeal") {
              if (
                s.status !== "arrested" ||
                typeof b.message !== "string" ||
                b.message.trim().length < 5 ||
                b.message.length > 500
              )
                throw new Error("Describe the issue in 5–500 characters.");
              if (!s.appeal) {
                s.appeal = b.message.trim();
                await event(tx, p.id, "appeal", s.appeal);
                await save(tx, p.id, s);
              }
            } else throw new Error("Unknown world policy action.");
          }
          return {
            ...s,
            finePoints: 5,
            warningMinutes: warningSeconds / 60,
            arrestMinutes: arrestSeconds / 60,
            policyVersion,
            releaseAnswers: 2,
          };
        });
      } catch (e) {
        return reply.code(409).send({
          error: e instanceof Error ? e.message : "World policy unavailable.",
        });
      }
    },
  });
  app.get("/api/world-policy/moderation", async (req, reply) => {
    const p = await auth.player(req.cookies.amamihe);
    if (!p || !moderators.includes(p.id))
      return reply.code(403).send({ error: "Moderator access required." });
    return (
      await db.query(
        "SELECT player_id,state FROM world_policy WHERE state->>'status'='arrested' AND state->>'appeal' IS NOT NULL LIMIT 50",
      )
    ).rows;
  });
  app.post<{ Body: { playerId?: string } }>(
    "/api/world-policy/dismiss",
    async (req, reply) => {
      const p = await auth.player(req.cookies.amamihe);
      if (!p || !moderators.includes(p.id))
        return reply.code(403).send({ error: "Moderator access required." });
      if (typeof req.body?.playerId !== "string")
        return reply.code(400).send({ error: "Choose an appeal." });
      return db.transaction(async (tx) => {
        const s = await state(tx, req.body.playerId!);
        if (s.status === "arrested")
          await release(
            tx,
            req.body.playerId!,
            s,
            "appeal-dismissed-by:" + p.id,
          );
        return { released: true };
      });
    },
  );
}
