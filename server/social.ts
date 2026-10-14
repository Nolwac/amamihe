import { randomUUID, randomBytes } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Database, DatabaseQueries } from "./db.js";
import type { Authentication } from "./auth.js";
import type { CourseDefinition, CourseQuestion } from "../shared/course.js";
import {
  SIGNALS,
  validPosition,
  teamOutcome,
  type Presence,
  type BattleView,
} from "../shared/social.js";
type TeamRow = { id: string; name: string; owner_id: string; invite: string };
type Battle = {
  id: string;
  status: "pending" | "active" | "complete";
  courseId: string;
  version: number;
  levelId: string;
  courseTitle: string;
  expiresAt: number;
  teams: { id: string; name: string; ownerId: string }[];
  players: {
    id: string;
    teamId: string;
    name: string;
    answers: Record<string, number>;
    score: number;
  }[];
  questions: CourseQuestion[];
  result?: BattleView["result"];
};
export async function initializeSocialSchema(db: DatabaseQueries) {
  await db.exec(`
CREATE TABLE IF NOT EXISTS social_presence(player_id TEXT PRIMARY KEY REFERENCES players(id),room TEXT NOT NULL,x REAL NOT NULL,z REAL NOT NULL,heading REAL NOT NULL,signal TEXT NOT NULL DEFAULT '',last_seen BIGINT NOT NULL);
CREATE INDEX IF NOT EXISTS social_presence_room ON social_presence(room);
CREATE TABLE IF NOT EXISTS social_teams(id TEXT PRIMARY KEY,name TEXT NOT NULL,owner_id TEXT NOT NULL REFERENCES players(id),invite TEXT UNIQUE NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS social_members(player_id TEXT PRIMARY KEY REFERENCES players(id),team_id TEXT NOT NULL REFERENCES social_teams(id));
CREATE TABLE IF NOT EXISTS social_battles(id TEXT PRIMARY KEY,state JSONB NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS social_blocks(player_id TEXT NOT NULL REFERENCES players(id),target_id TEXT NOT NULL REFERENCES players(id),PRIMARY KEY(player_id,target_id));
CREATE TABLE IF NOT EXISTS social_reports(id TEXT PRIMARY KEY,player_id TEXT NOT NULL REFERENCES players(id),target_id TEXT NOT NULL REFERENCES players(id),reason TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),resolved BOOLEAN NOT NULL DEFAULT false);
CREATE TABLE IF NOT EXISTS social_mutes(player_id TEXT PRIMARY KEY REFERENCES players(id),until_ms BIGINT NOT NULL);
CREATE TABLE IF NOT EXISTS social_room_locks(room TEXT PRIMARY KEY);
`);
}
export function registerSocial(
  app: FastifyInstance,
  db: Database,
  auth: Authentication,
  now = Date.now,
  moderators = (process.env.SOCIAL_MODERATOR_IDS || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean),
) {
  const route = (
    method: "GET" | "POST",
    url: string,
    work: (req: FastifyRequest, p: string) => Promise<unknown>,
  ) =>
    app.route({
      method,
      url,
      config: {
        rateLimit: {
          max: 600,
          timeWindow: "1 minute",
          keyGenerator: (req: FastifyRequest) => req.ip,
        },
      },
      handler: async (req, reply) => {
        reply.header("Cache-Control", "no-store");
        const p = await auth.player(req.cookies.amamihe);
        if (!p) return reply.code(401).send({ error: "Sign in first." });
        try {
          return await work(req, p.id);
        } catch (e) {
          return reply.code(409).send({
            error:
              e instanceof Error ? e.message : "Social action unavailable.",
          });
        }
      },
    });
  const team = async (tx: DatabaseQueries, p: string) =>
    (
      await tx.query<TeamRow>(
        "SELECT t.* FROM social_teams t JOIN social_members m ON m.team_id=t.id WHERE m.player_id=$1",
        [p],
      )
    ).rows[0];
  const members = async (tx: DatabaseQueries, id: string) =>
    (
      await tx.query<{ id: string; name: string }>(
        "SELECT p.id,p.name FROM social_members m JOIN players p ON p.id=m.player_id WHERE team_id=$1 ORDER BY p.id",
        [id],
      )
    ).rows;
  const save = async (tx: DatabaseQueries, b: Battle) =>
    tx.query("UPDATE social_battles SET state=$2 WHERE id=$1", [
      b.id,
      JSON.stringify(b),
    ]);
  const view = (b: Battle): BattleView => ({
    id: b.id,
    status: b.status,
    courseTitle: b.courseTitle,
    courseVersion: b.version,
    expiresAt: b.expiresAt,
    teams: b.teams.map((t) => ({
      id: t.id,
      name: t.name,
      score:
        b.players
          .filter((p) => p.teamId === t.id)
          .reduce((s, p) => s + p.score, 0) /
        Math.max(1, b.players.filter((p) => p.teamId === t.id).length),
    })),
    players: b.players.map(({ answers, ...p }) => ({
      ...p,
      answered: Object.keys(answers).length,
    })),
    questions:
      b.status === "pending"
        ? []
        : b.questions.map(({ id, prompt, options }) => ({
            id,
            prompt,
            options,
          })),
    result: b.result,
  });
  const finish = async (tx: DatabaseQueries, b: Battle) => {
    if (
      b.status !== "active" ||
      (now() < b.expiresAt &&
        b.players.some(
          (p) => Object.keys(p.answers).length < b.questions.length,
        ))
    )
      return;
    const outcome = teamOutcome(
      b.teams.map((t) => ({
        id: t.id,
        correct: b.players
          .filter((p) => p.teamId === t.id)
          .reduce((s, p) => s + p.score, 0),
        participants: b.players.filter((p) => p.teamId === t.id).length,
      })),
    );
    b.status = "complete";
    b.result = { winningTeamId: outcome.winner, rewards: {} };
    for (const p of [...b.players].sort((a, c) => a.id.localeCompare(c.id))) {
      await tx.query("SELECT id FROM players WHERE id=$1 FOR UPDATE", [p.id]);
      const recent = (
        await tx.query<{ count: string }>(
          "SELECT count(*) AS count FROM reward_ledger WHERE player_id=$1 AND amount>0 AND reason='Team activity reward; not individual mastery' AND created_at>now()-interval '1 day'",
          [p.id],
        )
      ).rows[0];
      const engaged = b.players.some(
        (member) =>
          member.teamId === p.teamId && Object.keys(member.answers).length > 0,
      );
      const amount =
        engaged && Number(recent.count) < 3 ? outcome.reward(p.teamId) : 0;
      const inserted = await tx.query(
        "INSERT INTO reward_ledger(player_id,event_id,amount,reason) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING event_id",
        [
          p.id,
          "battle:" + b.id,
          amount,
          "Team activity reward; not individual mastery",
        ],
      );
      if (inserted.rows.length)
        await tx.query("UPDATE players SET points=points+$2 WHERE id=$1", [
          p.id,
          amount,
        ]);
      b.result.rewards[p.id] = amount;
    }
    await save(tx, b);
  };
  const battle = async (tx: DatabaseQueries, id: string, p: string) => {
    const r = (
      await tx.query<{ state: Battle }>(
        "SELECT state FROM social_battles WHERE id=$1 FOR UPDATE",
        [id],
      )
    ).rows[0];
    if (!r) throw new Error("Battle not found.");
    const t = await team(tx, p);
    if (
      !r.state.players.some((v) => v.id === p) &&
      !r.state.teams.some((v) => v.id === t?.id)
    )
      throw new Error("This battle is private to its invited teams.");
    return r.state;
  };
  route("GET", "/api/social", async (_req, p) => {
    const t = await team(db, p);
    const pres = (
      await db.query(
        "SELECT s.player_id AS id,p.name,p.outfit,p.avatar,s.room,s.x,s.z,s.heading,s.signal FROM social_presence s JOIN players p ON p.id=s.player_id WHERE s.room=(SELECT room FROM social_presence WHERE player_id=$1) AND s.player_id<>$1 AND last_seen>$2 AND NOT EXISTS(SELECT 1 FROM social_blocks b WHERE (b.player_id=$1 AND b.target_id=s.player_id) OR (b.target_id=$1 AND b.player_id=s.player_id)) LIMIT 7",
        [p, now() - 20000],
      )
    ).rows;
    const battles = t
      ? (
          await db.query<{ state: Battle }>(
            "SELECT state FROM social_battles WHERE state->'teams' @> $1::jsonb ORDER BY created_at DESC LIMIT 5",
            [JSON.stringify([{ id: t.id }])],
          )
        ).rows.map((r) => view(r.state))
      : [];
    return {
      presence: pres,
      team: t
        ? {
            id: t.id,
            name: t.name,
            ownerId: t.owner_id,
            invite: t.invite,
            members: await members(db, t.id),
          }
        : null,
      battles,
      blocked: (
        await db.query(
          "SELECT p.id,p.name FROM social_blocks b JOIN players p ON p.id=b.target_id WHERE b.player_id=$1",
          [p],
        )
      ).rows,
      canModerate: moderators.includes(p),
      roomLimit: 8,
      teamLimit: 4,
    };
  });
  route("POST", "/api/social/presence", async (req, p) =>
    db.transaction(async (tx) => {
      const b = req.body as {
        space?: string;
        levelId?: string;
        position?: unknown;
        signal?: string;
      };
      if (
        !b ||
        typeof b !== "object" ||
        (b.space !== undefined && typeof b.space !== "string") ||
        (b.levelId !== undefined && typeof b.levelId !== "string") ||
        (b.signal !== undefined &&
          !(SIGNALS as readonly string[]).includes(b.signal))
      )
        throw new Error("Choose a bounded position and preset signal.");
      await tx.query("DELETE FROM social_presence WHERE last_seen<$1", [
        now() - 20000,
      ]);
      const prior = (
        await tx.query<{ room: string }>(
          "SELECT room FROM social_presence WHERE player_id=$1",
          [p],
        )
      ).rows[0];
      let base = "city";
      let positionScope: "city" | "course" = "city";
      if (b.space && b.space !== "city") {
        const e = (
          await tx.query<{ version: number; progress: { levelId: string } }>(
            "SELECT version,progress FROM course_enrollments WHERE player_id=$1 AND course_id=$2",
            [p, b.space],
          )
        ).rows[0];
        if (!e || e.progress.levelId !== b.levelId)
          throw new Error("Join your current enrolled checkpoint.");
        base = "course:" + b.space + ":v" + e.version + ":" + b.levelId;
        positionScope = "course";
      }
      if (!validPosition(b.position, positionScope))
        throw new Error("Choose a bounded position and preset signal.");
      let room = "";
      for (let shard = 0; shard < 100; shard++) {
        const candidate =
          prior?.room.startsWith(base + ":") && shard === 0
            ? prior.room
            : base + ":" + shard;
        await tx.query(
          "INSERT INTO social_room_locks VALUES($1) ON CONFLICT DO NOTHING",
          [candidate],
        );
        await tx.query(
          "SELECT room FROM social_room_locks WHERE room=$1 FOR UPDATE",
          [candidate],
        );
        const count = (
          await tx.query<{ count: string }>(
            "SELECT count(*) AS count FROM social_presence WHERE room=$1 AND player_id<>$2",
            [candidate, p],
          )
        ).rows[0];
        if (Number(count.count) < 8) {
          room = candidate;
          break;
        }
      }
      if (!room)
        throw new Error("Rooms are full. Solo learning remains available.");
      const mute = (
        await tx.query<{ until_ms: string }>(
          "SELECT until_ms FROM social_mutes WHERE player_id=$1",
          [p],
        )
      ).rows[0];
      const signal =
        mute && Number(mute.until_ms) > now() ? "" : b.signal || "";
      await tx.query(
        "INSERT INTO social_presence(player_id,room,x,z,heading,signal,last_seen) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(player_id) DO UPDATE SET room=$2,x=$3,z=$4,heading=$5,signal=$6,last_seen=$7",
        [
          p,
          room,
          b.position.x,
          b.position.z,
          b.position.heading,
          signal,
          now(),
        ],
      );
      return { room };
    }),
  );
  route("POST", "/api/social/leave", async (_req, p) => {
    await db.query("DELETE FROM social_presence WHERE player_id=$1", [p]);
    return { left: true };
  });
  route("POST", "/api/social/teams", async (req, p) =>
    db.transaction(async (tx) => {
      await tx.query("SELECT id FROM players WHERE id=$1 FOR UPDATE", [p]);
      if (await team(tx, p)) throw new Error("Leave your current team first.");
      const name = (req.body as { name?: unknown })?.name;
      if (
        typeof name !== "string" ||
        name.trim().length < 2 ||
        name.length > 32
      )
        throw new Error("Use a 2–32 character team name.");
      const recent = (
        await tx.query<{ count: string }>(
          "SELECT count(*) AS count FROM social_teams WHERE owner_id=$1 AND created_at>now()-interval '1 day'",
          [p],
        )
      ).rows[0];
      if (Number(recent.count) >= 3)
        throw new Error("Daily team creation limit reached.");
      const id = randomUUID();
      await tx.query(
        "INSERT INTO social_teams(id,name,owner_id,invite) VALUES($1,$2,$3,$4)",
        [id, name.trim(), p, randomBytes(16).toString("hex")],
      );
      await tx.query("INSERT INTO social_members VALUES($1,$2)", [p, id]);
      return { id };
    }),
  );
  route("POST", "/api/social/teams/join", async (req, p) =>
    db.transaction(async (tx) => {
      await tx.query("SELECT id FROM players WHERE id=$1 FOR UPDATE", [p]);
      const invite = (req.body as { invite?: unknown })?.invite;
      if (typeof invite !== "string" || !/^[a-f0-9]{32}$/.test(invite))
        throw new Error("Use the private team invite.");
      const t = (
        await tx.query<TeamRow>(
          "SELECT * FROM social_teams WHERE invite=$1 FOR UPDATE",
          [invite],
        )
      ).rows[0];
      if (!t) throw new Error("Invite unavailable.");
      const existing = await team(tx, p);
      if (existing) {
        if (existing.id === t.id) return { joined: true };
        throw new Error("Leave your current team first.");
      }
      if ((await members(tx, t.id)).length >= 4)
        throw new Error("This team has four members.");
      const blocked = (
        await tx.query(
          "SELECT player_id FROM social_blocks WHERE (player_id=$1 AND target_id=$2) OR (player_id=$2 AND target_id=$1)",
          [p, t.owner_id],
        )
      ).rows;
      if (blocked.length) throw new Error("Invite unavailable.");
      await tx.query("INSERT INTO social_members VALUES($1,$2)", [p, t.id]);
      return { joined: true };
    }),
  );
  route("POST", "/api/social/teams/leave", async (_req, p) =>
    db.transaction(async (tx) => {
      const t = await team(tx, p);
      if (!t) return { left: true };
      await tx.query("SELECT id FROM social_teams WHERE id=$1 FOR UPDATE", [
        t.id,
      ]);
      const active = (
        await tx.query(
          "SELECT id FROM social_battles WHERE state->>'status'='active' AND state->'players' @> $1::jsonb",
          [JSON.stringify([{ id: p }])],
        )
      ).rows;
      if (active.length)
        throw new Error("Finish the active battle before changing teams.");
      if (t.owner_id === p && (await members(tx, t.id)).length > 1)
        throw new Error("The captain can leave after other members leave.");
      await tx.query("DELETE FROM social_members WHERE player_id=$1", [p]);
      return { left: true };
    }),
  );
  route("POST", "/api/social/battles", async (req, p) =>
    db.transaction(async (tx) => {
      const own = await team(tx, p);
      if (!own || own.owner_id !== p)
        throw new Error("Only a team captain can invite a battle.");
      const b = req.body as { opponentInvite?: string; courseId?: string };
      const opponent = (
        await tx.query<TeamRow>("SELECT * FROM social_teams WHERE invite=$1", [
          b?.opponentInvite,
        ])
      ).rows[0];
      if (!opponent || opponent.id === own.id)
        throw new Error("Invite another team.");
      for (const id of [own.id, opponent.id].sort())
        await tx.query("SELECT id FROM social_teams WHERE id=$1 FOR UPDATE", [
          id,
        ]);
      const existing = (
        await tx.query(
          "SELECT id FROM social_battles WHERE state->>'status' IN ('pending','active') AND state->'teams' @> $1::jsonb AND (state->>'expiresAt')::bigint>$2",
          [JSON.stringify([{ id: own.id }]), now()],
        )
      ).rows;
      if (existing.length)
        throw new Error("Complete the existing team invitation or battle.");
      const version = (
        await tx.query<{ version: number; definition: CourseDefinition }>(
          "SELECT e.version,v.definition FROM course_enrollments e JOIN course_versions v ON v.course_id=e.course_id AND v.version=e.version WHERE e.player_id=$1 AND e.course_id=$2",
          [p, b?.courseId],
        )
      ).rows[0];
      if (!version)
        throw new Error("Enroll in this course before inviting a battle.");
      const level = version.definition.levels.find(
        (l) => !l.prerequisites.length,
      )!;
      const state: Battle = {
        id: randomUUID(),
        status: "pending",
        courseId: b.courseId!,
        version: version.version,
        levelId: level.id,
        courseTitle: version.definition.title,
        expiresAt: now() + 600000,
        teams: [
          { id: own.id, name: own.name, ownerId: p },
          { id: opponent.id, name: opponent.name, ownerId: opponent.owner_id },
        ],
        players: [],
        questions: level.questions.slice(0, 2),
      };
      await tx.query("INSERT INTO social_battles(id,state) VALUES($1,$2)", [
        state.id,
        JSON.stringify(state),
      ]);
      return view(state);
    }),
  );
  route("POST", "/api/social/battles/:id/accept", async (req, p) =>
    db.transaction(async (tx) => {
      const b = await battle(tx, (req.params as { id: string }).id, p);
      if (
        b.status !== "pending" ||
        now() > b.expiresAt ||
        b.teams[1].ownerId !== p
      )
        throw new Error(
          "Only the invited captain can accept an active invitation.",
        );
      for (const t of [...b.teams].sort((a, c) => a.id.localeCompare(c.id))) {
        await tx.query("SELECT id FROM social_teams WHERE id=$1 FOR UPDATE", [
          t.id,
        ]);
        const conflicting = (
          await tx.query(
            "SELECT id FROM social_battles WHERE id<>$1 AND state->>'status'='active' AND state->'teams' @> $2::jsonb AND (state->>'expiresAt')::bigint>$3",
            [b.id, JSON.stringify([{ id: t.id }]), now()],
          )
        ).rows;
        if (conflicting.length)
          throw new Error("This team has an active battle.");
        const roster = await members(tx, t.id);
        if (!roster.length || roster.length > 4)
          throw new Error("Both teams need one to four members.");
        for (const m of roster) {
          const e = (
            await tx.query<{ version: number }>(
              "SELECT version FROM course_enrollments WHERE player_id=$1 AND course_id=$2",
              [m.id, b.courseId],
            )
          ).rows[0];
          if (!e || e.version !== b.version)
            throw new Error(
              "Every participant must enroll in the same published course version first.",
            );
          b.players.push({ ...m, teamId: t.id, answers: {}, score: 0 });
        }
      }
      const blocked = (
        await tx.query(
          "SELECT player_id,target_id FROM social_blocks WHERE player_id=ANY($1::text[]) AND target_id=ANY($1::text[])",
          [b.players.map((v) => v.id)],
        )
      ).rows;
      if (blocked.length)
        throw new Error("Blocked participants cannot share a battle.");
      b.status = "active";
      b.expiresAt = now() + 600000;
      await save(tx, b);
      return view(b);
    }),
  );
  route("GET", "/api/social/battles/:id", async (req, p) =>
    db.transaction(async (tx) => {
      const b = await battle(tx, (req.params as { id: string }).id, p);
      await finish(tx, b);
      return view(b);
    }),
  );
  route("POST", "/api/social/battles/:id/answer", async (req, p) =>
    db.transaction(async (tx) => {
      const b = await battle(tx, (req.params as { id: string }).id, p);
      await finish(tx, b);
      const participant = b.players.find((v) => v.id === p);
      if (!participant)
        throw new Error("You are not on the locked battle roster.");
      const input = req.body as { questionId?: string; answer?: number };
      if (
        !input ||
        Object.keys(input).some((k) => !["questionId", "answer"].includes(k))
      )
        throw new Error("Submit an answer, not a client score.");
      if (b.status === "complete") return view(b);
      if (b.status !== "active") throw new Error("Accept the battle first.");
      const q = b.questions.find((q) => q.id === input.questionId);
      if (
        !q ||
        !Number.isInteger(input.answer) ||
        Number(input.answer) < 0 ||
        Number(input.answer) >= q.options.length
      )
        throw new Error("Choose an authored question and valid answer.");
      if (participant.answers[q.id] !== undefined) return view(b);
      if (b.questions[Object.keys(participant.answers).length]?.id !== q.id)
        throw new Error("Complete battle questions in order.");
      participant.answers[q.id] = input.answer!;
      if (input.answer === q.answer) participant.score += 10;
      await save(tx, b);
      await finish(tx, b);
      return view(b);
    }),
  );
  route("POST", "/api/social/block", async (req, p) => {
    const target = (req.body as { targetId?: string })?.targetId;
    if (!target || target === p) throw new Error("Choose another participant.");
    await db.query(
      "INSERT INTO social_blocks VALUES($1,$2) ON CONFLICT DO NOTHING",
      [p, target],
    );
    return { blocked: true };
  });
  route("POST", "/api/social/unblock", async (req, p) => {
    await db.query(
      "DELETE FROM social_blocks WHERE player_id=$1 AND target_id=$2",
      [p, (req.body as { targetId?: string })?.targetId],
    );
    return { unblocked: true };
  });
  route("POST", "/api/social/report", async (req, p) => {
    const b = req.body as { targetId?: string; reason?: string };
    if (
      !b?.targetId ||
      b.targetId === p ||
      !["spam", "harassment", "unsafe"].includes(b.reason || "")
    )
      throw new Error("Choose a participant and report category.");
    await db.query(
      "INSERT INTO social_reports(id,player_id,target_id,reason) VALUES($1,$2,$3,$4)",
      [randomUUID(), p, b.targetId, b.reason],
    );
    return { reported: true };
  });
  route("GET", "/api/social/moderation", async (_req, p) => {
    if (!moderators.includes(p)) throw new Error("Moderator access required.");
    return (
      await db.query(
        "SELECT id,player_id,target_id,reason,created_at,resolved FROM social_reports ORDER BY created_at DESC LIMIT 100",
      )
    ).rows;
  });
  route("POST", "/api/social/moderation", async (req, p) => {
    if (!moderators.includes(p)) throw new Error("Moderator access required.");
    const b = req.body as {
      targetId?: string;
      reportId?: string;
      action?: string;
    };
    if (!b.targetId || !["mute", "unmute"].includes(b.action || ""))
      throw new Error("Choose mute or unmute.");
    await db.transaction(async (tx) => {
      await tx.query(
        "INSERT INTO social_mutes VALUES($1,$2) ON CONFLICT(player_id) DO UPDATE SET until_ms=$2",
        [b.targetId, b.action === "mute" ? now() + 86400000 : 0],
      );
      if (b.action === "mute")
        await tx.query(
          "UPDATE social_presence SET signal='' WHERE player_id=$1",
          [b.targetId],
        );
      if (b.reportId)
        await tx.query(
          "UPDATE social_reports SET resolved=true WHERE id=$1 AND target_id=$2",
          [b.reportId, b.targetId],
        );
    });
    return { moderated: true };
  });
}
