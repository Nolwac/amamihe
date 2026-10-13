import type { DatabaseQueries } from "./db.js";

export async function initializeSchema(db: DatabaseQueries) {
  await db.exec(`CREATE TABLE IF NOT EXISTS players (id TEXT PRIMARY KEY, token TEXT UNIQUE NOT NULL, name TEXT NOT NULL, outfit TEXT NOT NULL, points INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS attempts (id TEXT PRIMARY KEY, player_id TEXT REFERENCES players(id), status TEXT NOT NULL DEFAULT 'playing', created_at TIMESTAMPTZ DEFAULT now(), result JSONB);
CREATE TABLE IF NOT EXISTS chunks (attempt_id TEXT REFERENCES attempts(id), question_id TEXT NOT NULL, answer INTEGER NOT NULL, assisted BOOLEAN NOT NULL, elapsed_ms INTEGER NOT NULL, PRIMARY KEY(attempt_id, question_id));
CREATE TABLE IF NOT EXISTS assistance (attempt_id TEXT REFERENCES attempts(id), question_id TEXT NOT NULL, PRIMARY KEY(attempt_id, question_id));`);
  await db.exec(
    "ALTER TABLE attempts ADD COLUMN IF NOT EXISTS question_order JSONB; ALTER TABLE attempts ADD COLUMN IF NOT EXISTS decision_plan JSONB;",
  );
  await db.exec(`
CREATE TABLE IF NOT EXISTS player_inventory (player_id TEXT REFERENCES players(id), gear_id TEXT NOT NULL, PRIMARY KEY(player_id,gear_id));
CREATE TABLE IF NOT EXISTS player_badges (player_id TEXT REFERENCES players(id), badge_id TEXT NOT NULL, title TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(player_id,badge_id));
CREATE TABLE IF NOT EXISTS reward_ledger (player_id TEXT REFERENCES players(id), event_id TEXT NOT NULL, amount INTEGER NOT NULL, reason TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(player_id,event_id));
INSERT INTO reward_ledger(player_id,event_id,amount,reason)
SELECT p.id,'opening:step4',p.points,'Pre-ledger activity balance' FROM players p
WHERE NOT EXISTS (SELECT 1 FROM reward_ledger r WHERE r.player_id=p.id)
ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS accounts (email TEXT PRIMARY KEY, player_id TEXT UNIQUE NOT NULL REFERENCES players(id), password_hash TEXT NOT NULL, verified_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS auth_sessions (token_hash TEXT PRIMARY KEY, player_id TEXT NOT NULL REFERENCES players(id), expires_at TIMESTAMPTZ NOT NULL);
CREATE INDEX IF NOT EXISTS auth_sessions_player ON auth_sessions(player_id);
CREATE TABLE IF NOT EXISTS auth_challenges (id TEXT PRIMARY KEY, email TEXT NOT NULL, purpose TEXT NOT NULL CHECK (purpose IN ('signup','login')), code_hash TEXT NOT NULL, password_hash TEXT, name TEXT, outfit TEXT, legacy_player_id TEXT, expires_at TIMESTAMPTZ NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, consumed BOOLEAN NOT NULL DEFAULT false, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS auth_challenges_email ON auth_challenges(email,purpose);
CREATE TABLE IF NOT EXISTS auth_rate_limits (key TEXT PRIMARY KEY, window_start TIMESTAMPTZ NOT NULL, last_request TIMESTAMPTZ NOT NULL, count INTEGER NOT NULL);
`);
}
