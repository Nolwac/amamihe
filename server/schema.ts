import type { DatabaseQueries } from "./db.js";

export async function initializeSchema(db: DatabaseQueries) {
  await db.exec(`CREATE TABLE IF NOT EXISTS players (id TEXT PRIMARY KEY, token TEXT UNIQUE NOT NULL, name TEXT NOT NULL, outfit TEXT NOT NULL, points INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS attempts (id TEXT PRIMARY KEY, player_id TEXT REFERENCES players(id), status TEXT NOT NULL DEFAULT 'playing', created_at TIMESTAMPTZ DEFAULT now(), result JSONB);
CREATE TABLE IF NOT EXISTS chunks (attempt_id TEXT REFERENCES attempts(id), question_id TEXT NOT NULL, answer INTEGER NOT NULL, assisted BOOLEAN NOT NULL, elapsed_ms INTEGER NOT NULL, PRIMARY KEY(attempt_id, question_id));
CREATE TABLE IF NOT EXISTS assistance (attempt_id TEXT REFERENCES attempts(id), question_id TEXT NOT NULL, PRIMARY KEY(attempt_id, question_id));`);
}
