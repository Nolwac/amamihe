import Fastify from "fastify";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import compress from "@fastify/compress";
import staticPlugin from "@fastify/static";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mockClassify, questions, type Chunk } from "./classifier.js";
import { openDatabase } from "./db.js";
import { initializeSchema } from "./schema.js";
import { Authentication, registerAuthentication } from "./auth.js";
import { emailConfiguration } from "./email.js";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dbPath = process.env.DATA_DIR || path.join(root, ".data");
if (process.env.NODE_ENV === "production" && !process.env.DATABASE_URL?.trim())
  throw new Error(
    "DATABASE_URL is required in production so learner progress does not depend on ephemeral application storage.",
  );
const db = await openDatabase({
  dataDir: dbPath,
  databaseUrl: process.env.DATABASE_URL,
  caCertificate: process.env.DATABASE_CA_CERT,
});
await initializeSchema(db);
const email = await emailConfiguration();
const auth = new Authentication(db, email.provider, email.codeSecret);
const app = Fastify({
  logger: true,
  bodyLimit: 16384,
  // Production ingress is the private loopback publication behind Caddy.
  trustProxy:
    process.env.NODE_ENV === "production"
      ? (_address, hop) => hop === 0
      : false,
});
app.addHook("onClose", async () => db.close());
await app.register(cookie);
await app.register(rateLimit, {
  max: 300,
  timeWindow: "1 minute",
  allowList: (req) => !req.url.startsWith("/api/"),
});
await app.register(compress, { global: true, encodings: ["br", "gzip"] });
app.addHook("onRequest", async (req, reply) => {
  reply
    .header("X-Content-Type-Options", "nosniff")
    .header("Referrer-Policy", "same-origin");
  if (req.method !== "GET" && req.method !== "HEAD") {
    const origin = req.headers.origin;
    if (origin) {
      let host = "";
      try {
        host = new URL(origin).host;
      } catch {}
      if (host !== req.headers.host)
        return reply
          .code(403)
          .send({ error: "Cross-origin requests are not allowed." });
    }
  }
});
async function player(req: { cookies: Record<string, string | undefined> }) {
  return auth.player(req.cookies.amamihe);
}
registerAuthentication(app, auth);
app.get("/api/health", async () => {
  await db.query("SELECT 1");
  return {
    ok: true,
    storage: db.kind === "pglite" ? "PostgreSQL / PGlite" : "PostgreSQL",
    classifier: "mock-classifier-v1",
  };
});
app.get("/api/session", async (req, reply) => {
  reply.header("Cache-Control", "no-store");
  const p = await player(req);
  if (!p) return { player: null, result: null };
  const result =
    (
      await db.query<{ result: unknown }>(
        "SELECT result FROM attempts WHERE player_id=$1 AND status='complete' ORDER BY created_at DESC LIMIT 1",
        [p.id],
      )
    ).rows[0]?.result || null;
  const a = (
    await db.query<{ id: string }>(
      "SELECT id FROM attempts WHERE player_id=$1 AND status='playing' ORDER BY created_at DESC LIMIT 1",
      [p.id],
    )
  ).rows[0];
  const answered = a
    ? (
        await db.query("SELECT question_id FROM chunks WHERE attempt_id=$1", [
          a.id,
        ])
      ).rows.length
    : 0;
  return {
    player: p,
    result,
    active: a
      ? {
          id: a.id,
          questions: questions.map(({ answer, explanation, ...q }) => q),
          answered,
        }
      : null,
  };
});
app.post<{ Body: { name: string; outfit: string } }>(
  "/api/session",
  async (req, reply) => {
    const { name, outfit } = req.body || {};
    if (
      typeof name !== "string" ||
      name.trim().length < 2 ||
      name.trim().length > 24 ||
      !["terracotta", "teal", "gold"].includes(outfit)
    )
      return reply.code(400).send({
        error: "Choose a name (2–24 characters) and an available outfit.",
      });
    const existing = await player(req);
    if (existing) {
      await db.query("UPDATE players SET name=$1,outfit=$2 WHERE id=$3", [
        name.trim(),
        outfit,
        existing.id,
      ]);
      return { player: { ...existing, name: name.trim(), outfit } };
    }
    return reply
      .code(401)
      .send({ error: "Verify your email and sign in first." });
  },
);
app.post("/api/attempts", async (req, reply) => {
  const p = await player(req);
  if (!p) return reply.code(401).send({ error: "Create your player first." });
  const id = randomUUID();
  await db.query("INSERT INTO attempts(id,player_id) VALUES($1,$2)", [
    id,
    p.id,
  ]);
  return { id, questions: questions.map(({ answer, explanation, ...q }) => q) };
});
app.post<{ Params: { id: string }; Body: { questionId: string } }>(
  "/api/attempts/:id/help",
  async (req, reply) => {
    const p = await player(req);
    if (!p) return reply.code(401).send({ error: "Sign in first." });
    const a = (
      await db.query(
        "SELECT id FROM attempts WHERE id=$1 AND player_id=$2 AND status=$3",
        [req.params.id, p.id, "playing"],
      )
    ).rows[0];
    const q = questions.find((q) => q.id === req.body?.questionId);
    if (!a || !q)
      return reply.code(404).send({ error: "Active question not found." });
    await db.query(
      "INSERT INTO assistance VALUES($1,$2) ON CONFLICT DO NOTHING",
      [req.params.id, q.id],
    );
    return { explanation: q.explanation };
  },
);
app.post<{ Params: { id: string }; Body: Chunk }>(
  "/api/attempts/:id/chunks",
  async (req, reply) => {
    const p = await player(req);
    if (!p) return reply.code(401).send({ error: "Sign in first." });
    const c = req.body;
    const q = questions.find((q) => q.id === c?.questionId);
    if (
      !q ||
      !Number.isInteger(c.answer) ||
      c.answer < 0 ||
      c.answer > 2 ||
      !Number.isFinite(c.elapsedMs) ||
      c.elapsedMs < 0 ||
      c.elapsedMs > 3600000
    )
      return reply.code(400).send({ error: "Invalid response." });
    const a = (
      await db.query(
        "SELECT id FROM attempts WHERE id=$1 AND player_id=$2 AND status=$3",
        [req.params.id, p.id, "playing"],
      )
    ).rows[0];
    if (!a) return reply.code(404).send({ error: "Active attempt not found." });
    const answered = (
      await db.query("SELECT question_id FROM chunks WHERE attempt_id=$1", [
        req.params.id,
      ])
    ).rows.length;
    if (
      !(
        await db.query(
          "SELECT question_id FROM chunks WHERE attempt_id=$1 AND question_id=$2",
          [req.params.id, q.id],
        )
      ).rows.length &&
      questions[answered]?.id !== q.id
    )
      return reply.code(409).send({ error: "Complete questions in order." });
    const assisted =
      (
        await db.query(
          "SELECT question_id FROM assistance WHERE attempt_id=$1 AND question_id=$2",
          [req.params.id, q.id],
        )
      ).rows.length > 0;
    await db.query(
      "INSERT INTO chunks VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING",
      [req.params.id, q.id, c.answer, assisted, Math.round(c.elapsedMs)],
    );
    return { stored: true };
  },
);
app.post<{ Params: { id: string } }>(
  "/api/attempts/:id/complete",
  async (req, reply) => {
    const p = await player(req);
    if (!p) return reply.code(401).send({ error: "Sign in first." });
    try {
      return await db.transaction(async (tx) => {
        const a = (
          await tx.query<{ status: string; result: unknown }>(
            "SELECT status,result FROM attempts WHERE id=$1 AND player_id=$2 FOR UPDATE",
            [req.params.id, p.id],
          )
        ).rows[0];
        if (!a) {
          reply.code(404);
          return { error: "Attempt not found." };
        }
        if (a.status === "complete") return a.result;
        const rows = (
          await tx.query<{
            question_id: string;
            answer: number;
            assisted: boolean;
            elapsed_ms: number;
          }>("SELECT * FROM chunks WHERE attempt_id=$1", [req.params.id])
        ).rows;
        const result = mockClassify(
          rows.map((c) => ({
            questionId: c.question_id,
            answer: c.answer,
            assisted: c.assisted,
            elapsedMs: c.elapsed_ms,
          })),
        );
        await tx.query(
          "UPDATE attempts SET status='complete',result=$1 WHERE id=$2",
          [JSON.stringify(result), req.params.id],
        );
        await tx.query("UPDATE players SET points=points+$1 WHERE id=$2", [
          result.points,
          p.id,
        ]);
        return result;
      });
    } catch (err) {
      reply.code(400);
      return {
        error: err instanceof Error ? err.message : "Assessment failed.",
      };
    }
  },
);
await app.register(staticPlugin, {
  root: path.join(root, "dist"),
  wildcard: true,
});
app.setNotFoundHandler((req, reply) =>
  req.url.startsWith("/api/")
    ? reply.code(404).send({ error: "Unknown endpoint." })
    : reply.sendFile("index.html"),
);
await app.listen({ port: Number(process.env.PORT || 3000), host: "0.0.0.0" });
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, async () => {
    await app.close();
  });
