import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  randomUUID,
  scrypt,
  timingSafeEqual,
} from "node:crypto";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { Database, DatabaseQueries } from "./db.js";
import type { EmailProvider } from "./email.js";
import {
  CHARACTERS,
  characterId,
  type CharacterId,
} from "../shared/avatars.js";

const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const derive = (password: string, salt: string) =>
  new Promise<Buffer>((resolve, reject) =>
    scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 }, (error, key) =>
      error ? reject(error) : resolve(key),
    ),
  );
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `scrypt$16384$${salt}$${(await derive(password, salt)).toString("hex")}`;
}
export async function checkPassword(password: string, stored: string) {
  const parts = stored.split("$");
  if (
    parts.length !== 4 ||
    parts[0] !== "scrypt" ||
    parts[1] !== "16384" ||
    !/^[a-f0-9]{32}$/.test(parts[2]) ||
    !/^[a-f0-9]{128}$/.test(parts[3])
  )
    return false;
  return timingSafeEqual(
    await derive(password, parts[2]),
    Buffer.from(parts[3], "hex"),
  );
}
export type AccountPlayer = {
  id: string;
  name: string;
  outfit: string;
  avatar: CharacterId;
  points: number;
  email: string;
};
export class AuthError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}
function emailAddress(value: unknown) {
  if (typeof value !== "string")
    throw new AuthError("Enter a valid email address.");
  const email = value.trim().toLowerCase();
  if (
    email.length > 254 ||
    !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(
      email,
    )
  )
    throw new AuthError("Enter a valid email address.");
  return email;
}
export class Authentication {
  private dummyPassword: Promise<string>;
  constructor(
    private db: Database,
    private mail: EmailProvider,
    private secret: string,
  ) {
    this.dummyPassword = hashPassword(randomBytes(32).toString("hex"));
  }
  async player(token?: string): Promise<AccountPlayer | null> {
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
    return (
      (
        await this.db.query<AccountPlayer>(
          `SELECT p.id,p.name,p.outfit,p.avatar,p.points,a.email FROM auth_sessions s JOIN players p ON p.id=s.player_id JOIN accounts a ON a.player_id=p.id WHERE s.token_hash=$1 AND s.expires_at>now()`,
          [digest(token)],
        )
      ).rows[0] || null
    );
  }
  private codeHash(id: string, code: string) {
    return createHmac("sha256", this.secret)
      .update(id + ":" + code)
      .digest("hex");
  }
  private async limit(
    tx: DatabaseQueries,
    email: string,
    bucket: string,
    cooldown: boolean,
  ) {
    const key = digest(bucket + ":" + email);
    await tx.query(
      `INSERT INTO auth_rate_limits(key,window_start,last_request,count) VALUES($1,now(),to_timestamp(0),0) ON CONFLICT (key) DO NOTHING`,
      [key],
    );
    const row = (
      await tx.query<{
        count: number;
        window_start: Date | string;
        last_request: Date | string;
      }>("SELECT * FROM auth_rate_limits WHERE key=$1 FOR UPDATE", [key])
    ).rows[0];
    const now = Date.now();
    const fresh = now - new Date(row.window_start).getTime() < 3600000;
    if (
      (cooldown && now - new Date(row.last_request).getTime() < 60000) ||
      (fresh && row.count >= (cooldown ? 5 : 20))
    )
      throw new AuthError(
        "Too many attempts. Please wait before trying again.",
        429,
      );
    await tx.query(
      "UPDATE auth_rate_limits SET count=$2,window_start=$3,last_request=now() WHERE key=$1",
      [
        key,
        fresh ? row.count + 1 : 1,
        fresh ? row.window_start : new Date(now).toISOString(),
      ],
    );
  }
  async signup(body: Record<string, unknown>, legacyToken?: string) {
    const email = emailAddress(body.email);
    if (
      typeof body.name !== "string" ||
      body.name.trim().length < 2 ||
      body.name.trim().length > 24
    )
      throw new AuthError("Choose a name between 2 and 24 characters.");
    if (
      typeof body.password !== "string" ||
      body.password.length < 12 ||
      body.password.length > 128
    )
      throw new AuthError("Use a password between 12 and 128 characters.");
    if (!["terracotta", "teal", "gold"].includes(String(body.outfit)))
      throw new AuthError("Choose an available outfit.");
    if (
      body.avatar !== undefined &&
      !CHARACTERS.some((c) => c.id === body.avatar)
    )
      throw new AuthError("Choose an available character.");
    const passwordHash = await hashPassword(body.password);
    const legacy = legacyToken
      ? (
          await this.db.query<{ id: string }>(
            "SELECT p.id FROM players p WHERE p.token=$1 AND NOT EXISTS (SELECT 1 FROM accounts a WHERE a.player_id=p.id)",
            [legacyToken],
          )
        ).rows[0]?.id
      : null;
    return this.issue(email, "signup", {
      passwordHash,
      name: body.name.trim(),
      outfit: String(body.outfit),
      avatar: characterId(body.avatar),
      legacy: legacy || null,
    });
  }
  async requestLoginCode(value: unknown) {
    return this.issue(emailAddress(value), "login");
  }
  private async issue(
    email: string,
    purpose: "signup" | "login",
    pending?: {
      passwordHash: string;
      name: string;
      outfit: string;
      avatar: CharacterId;
      legacy: string | null;
    },
  ) {
    const id = randomUUID(),
      code = String(randomInt(100000, 1000000));
    const exists =
      (
        await this.db.query("SELECT email FROM accounts WHERE email=$1", [
          email,
        ])
      ).rows.length > 0;
    await this.db.transaction(async (tx) => {
      await this.limit(tx, email, purpose, true);
      await tx.query(
        "UPDATE auth_challenges SET consumed=true WHERE email=$1 AND purpose=$2 AND NOT consumed",
        [email, purpose],
      );
      await tx.query(
        "INSERT INTO auth_challenges(id,email,purpose,code_hash,password_hash,name,outfit,legacy_player_id,expires_at,avatar) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
        [
          id,
          email,
          purpose,
          this.codeHash(id, code),
          pending?.passwordHash || null,
          pending?.name || null,
          pending?.outfit || null,
          pending?.legacy || null,
          new Date(Date.now() + 600000).toISOString(),
          pending?.avatar || null,
        ],
      );
      // Bound retained challenge/session data without removing player progress.
      await tx.query(
        "DELETE FROM auth_challenges WHERE expires_at < now() - interval '1 day'",
      );
      await tx.query("DELETE FROM auth_sessions WHERE expires_at < now()");
    });
    if ((purpose === "login" && exists) || (purpose === "signup" && !exists)) {
      try {
        await this.mail.send({
          id,
          to: email,
          subject:
            purpose === "signup"
              ? "Verify your Amamihe account"
              : "Your Amamihe login code",
          text: `Your Amamihe ${purpose === "signup" ? "verification" : "login"} code is ${code}.\n\nIt expires in 10 minutes and can be used once. Do not share it. If you did not request this, ignore this email.\n\nAmamihe — https://amamihe.online`,
        });
      } catch {
        await this.db.query(
          "UPDATE auth_challenges SET consumed=true WHERE id=$1",
          [id],
        );
        throw new AuthError(
          "Email delivery is temporarily unavailable. Please try again.",
          503,
        );
      }
    }
    return {
      challengeId: id,
      message:
        "If this email is eligible, a code has been sent. Check your inbox and spam folder.",
      expiresIn: 600,
    };
  }
  private async session(tx: DatabaseQueries, playerId: string) {
    const token = randomBytes(32).toString("hex");
    await tx.query(
      "INSERT INTO auth_sessions(token_hash,player_id,expires_at) VALUES($1,$2,$3)",
      [
        digest(token),
        playerId,
        new Date(Date.now() + 30 * 86400000).toISOString(),
      ],
    );
    return token;
  }
  async verify(id: unknown, code: unknown, legacyToken?: string) {
    if (
      typeof id !== "string" ||
      !/^[a-f0-9-]{36}$/.test(id) ||
      typeof code !== "string" ||
      !/^\d{6}$/.test(code)
    )
      throw new AuthError("Enter the six-digit code from your email.");
    const token = await this.db.transaction(async (tx) => {
      const row = (
        await tx.query<{
          email: string;
          purpose: string;
          code_hash: string;
          password_hash: string;
          name: string;
          outfit: string;
          avatar: string | null;
          legacy_player_id: string | null;
          expires_at: Date | string;
          attempts: number;
          consumed: boolean;
        }>("SELECT * FROM auth_challenges WHERE id=$1 FOR UPDATE", [id])
      ).rows[0];
      if (
        !row ||
        row.consumed ||
        row.attempts >= 5 ||
        new Date(row.expires_at).getTime() <= Date.now()
      )
        return null;
      if (
        !timingSafeEqual(
          Buffer.from(row.code_hash, "hex"),
          Buffer.from(this.codeHash(id, code), "hex"),
        )
      ) {
        await tx.query(
          "UPDATE auth_challenges SET attempts=attempts+1 WHERE id=$1",
          [id],
        );
        return null;
      }
      await tx.query("UPDATE auth_challenges SET consumed=true WHERE id=$1", [
        id,
      ]);
      const account = (
        await tx.query<{ player_id: string }>(
          "SELECT player_id FROM accounts WHERE email=$1",
          [row.email],
        )
      ).rows[0];
      let playerId = account?.player_id;
      if (row.purpose === "signup") {
        if (account) return null;
        if (row.legacy_player_id) {
          const legacy = (
            await tx.query<{ id: string }>(
              "SELECT p.id FROM players p WHERE p.id=$1 AND p.token=$2 AND NOT EXISTS (SELECT 1 FROM accounts a WHERE a.player_id=p.id) FOR UPDATE",
              [row.legacy_player_id, legacyToken || ""],
            )
          ).rows[0];
          if (!legacy) return null;
          playerId = legacy.id;
          await tx.query(
            "UPDATE players SET name=$2,outfit=$3,avatar=$4 WHERE id=$1",
            [playerId, row.name, row.outfit, characterId(row.avatar)],
          );
        } else {
          playerId = randomUUID();
          await tx.query(
            "INSERT INTO players(id,token,name,outfit,avatar) VALUES($1,$2,$3,$4,$5)",
            [
              playerId,
              randomBytes(32).toString("hex"),
              row.name,
              row.outfit,
              characterId(row.avatar),
            ],
          );
        }
        await tx.query(
          "INSERT INTO accounts(email,player_id,password_hash) VALUES($1,$2,$3)",
          [row.email, playerId, row.password_hash],
        );
      }
      if (!playerId) return null;
      return this.session(tx, playerId);
    });
    if (!token)
      throw new AuthError(
        "This code is invalid, expired, or already used. Request a new code.",
      );
    return { token, player: await this.player(token) };
  }
  async passwordLogin(value: unknown, password: unknown) {
    const email = emailAddress(value);
    if (typeof password !== "string" || password.length > 128)
      throw new AuthError("Email or password is incorrect.", 401);
    await this.db.transaction((tx) => this.limit(tx, email, "password", false));
    const row = (
      await this.db.query<{ player_id: string; password_hash: string }>(
        "SELECT player_id,password_hash FROM accounts WHERE email=$1",
        [email],
      )
    ).rows[0];
    const valid = await checkPassword(
      password,
      row?.password_hash || (await this.dummyPassword),
    );
    if (!row || !valid)
      throw new AuthError("Email or password is incorrect.", 401);
    const token = await this.db.transaction((tx) =>
      this.session(tx, row.player_id),
    );
    return { token, player: await this.player(token) };
  }
  async logout(token?: string) {
    if (token)
      await this.db.query("DELETE FROM auth_sessions WHERE token_hash=$1", [
        digest(token),
      ]);
  }
  async changePassword(token: string | undefined, password: unknown) {
    const player = await this.player(token);
    if (!player) throw new AuthError("Sign in first.", 401);
    if (
      typeof password !== "string" ||
      password.length < 12 ||
      password.length > 128
    )
      throw new AuthError("Use a password between 12 and 128 characters.");
    const hash = await hashPassword(password);
    await this.db.transaction(async (tx) => {
      await tx.query(
        "UPDATE accounts SET password_hash=$2 WHERE player_id=$1",
        [player.id, hash],
      );
      await tx.query(
        "DELETE FROM auth_sessions WHERE player_id=$1 AND token_hash<>$2",
        [player.id, digest(token!)],
      );
    });
  }
}
export function registerAuthentication(
  app: FastifyInstance,
  auth: Authentication,
) {
  const setSession = (
    req: FastifyRequest,
    reply: FastifyReply,
    token: string,
  ) =>
    reply.setCookie("amamihe", token, {
      httpOnly: true,
      sameSite: "lax",
      secure:
        process.env.NODE_ENV === "production" ||
        req.headers["x-forwarded-proto"] === "https",
      path: "/",
      maxAge: 30 * 86400,
    });
  const route = (
    url: string,
    handler: (
      body: Record<string, unknown>,
      req: FastifyRequest,
      reply: FastifyReply,
    ) => Promise<unknown>,
  ) =>
    app.post<{ Body: Record<string, unknown> }>(
      url,
      { config: { rateLimit: { max: 15, timeWindow: "1 minute" } } },
      async (req, reply) => {
        try {
          reply.header("Cache-Control", "no-store");
          return await handler(req.body || {}, req, reply);
        } catch (error) {
          if (error instanceof AuthError)
            return reply.code(error.status).send({ error: error.message });
          app.log.error("Authentication operation failed");
          return reply
            .code(503)
            .send({ error: "Unable to sign in right now. Please try again." });
        }
      },
    );
  route("/api/auth/signup", (body, req) =>
    auth.signup(body, req.cookies.amamihe),
  );
  route("/api/auth/code", (body) => auth.requestLoginCode(body.email));
  route("/api/auth/verify", async (body, req, reply) => {
    const result = await auth.verify(
      body.challengeId,
      body.code,
      req.cookies.amamihe,
    );
    setSession(req, reply, result.token);
    return { player: result.player };
  });
  route("/api/auth/login", async (body, req, reply) => {
    const result = await auth.passwordLogin(body.email, body.password);
    setSession(req, reply, result.token);
    return { player: result.player };
  });
  route("/api/auth/logout", async (_, req, reply) => {
    await auth.logout(req.cookies.amamihe);
    reply.clearCookie("amamihe", { path: "/" });
    return { ok: true };
  });
  route("/api/auth/password", async (body, req) => {
    await auth.changePassword(req.cookies.amamihe, body.password);
    return { ok: true };
  });
}
