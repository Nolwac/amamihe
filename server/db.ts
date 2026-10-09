import { PGlite } from "@electric-sql/pglite";
import { mkdir } from "node:fs/promises";
import { Pool, type PoolConfig } from "pg";

export interface DatabaseQueries {
  query<T = Record<string, unknown>>(
    sql: string,
    parameters?: unknown[],
  ): Promise<{ rows: T[] }>;
  exec(sql: string): Promise<void>;
}

export interface Database extends DatabaseQueries {
  readonly kind: "pglite" | "postgresql";
  transaction<T>(work: (tx: DatabaseQueries) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

/** Keep URL query parameters from overriding the verified TLS configuration. */
export function postgresConfig(
  databaseUrl: string,
  caCertificate?: string,
): PoolConfig {
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error("DATABASE_URL must be a PostgreSQL connection URL.");
  }
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !url.hostname ||
    !url.username ||
    url.pathname.length < 2
  )
    throw new Error(
      "DATABASE_URL must include a PostgreSQL host, user, and database.",
    );

  const supported = new Set([
    "sslmode",
    "channel_binding",
    "application_name",
    "connect_timeout",
    "options",
  ]);
  if ([...url.searchParams.keys()].some((key) => !supported.has(key)))
    throw new Error(
      "DATABASE_URL contains an unsupported connection parameter.",
    );

  const host = url.hostname.replace(/^\[|\]$/g, "");
  const sslMode = url.searchParams.get("sslmode") || "verify-full";
  const local = ["localhost", "127.0.0.1", "::1"].includes(host);
  if (
    ![
      "require",
      "verify-ca",
      "verify-full",
      "prefer",
      "allow",
      "disable",
    ].includes(sslMode) ||
    (sslMode === "disable" && !local)
  )
    throw new Error(
      "PostgreSQL requires verified TLS; sslmode=disable is only allowed on loopback.",
    );

  const timeout = Number(url.searchParams.get("connect_timeout") || 10);
  if (!Number.isFinite(timeout) || timeout <= 0 || timeout > 60)
    throw new Error(
      "PostgreSQL connect_timeout must be between 1 and 60 seconds.",
    );

  let user: string, password: string, database: string;
  try {
    user = decodeURIComponent(url.username);
    password = decodeURIComponent(url.password);
    database = decodeURIComponent(url.pathname.slice(1));
  } catch {
    throw new Error("DATABASE_URL contains invalid URL encoding.");
  }
  return {
    host,
    port: Number(url.port || 5432),
    user,
    password,
    database,
    ssl:
      sslMode === "disable"
        ? false
        : {
            rejectUnauthorized: true,
            ...(caCertificate ? { ca: caCertificate } : {}),
          },
    // Prefer SCRAM channel binding when the server supports it.
    enableChannelBinding: url.searchParams.get("channel_binding") !== "disable",
    application_name: url.searchParams.get("application_name") || "amamihe",
    options: url.searchParams.get("options") || undefined,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: timeout * 1000,
  };
}

export async function openDatabase(options: {
  dataDir: string;
  databaseUrl?: string;
  caCertificate?: string;
}): Promise<Database> {
  if (!options.databaseUrl) {
    await mkdir(options.dataDir, { recursive: true });
    const local = new PGlite(options.dataDir);
    await local.waitReady;
    return {
      kind: "pglite",
      query: (sql, parameters) => local.query(sql, parameters),
      exec: async (sql) => {
        await local.exec(sql);
      },
      transaction: (work) =>
        local.transaction(async (tx) =>
          work({
            query: (sql, parameters) => tx.query(sql, parameters),
            exec: async (sql) => {
              await tx.exec(sql);
            },
          }),
        ),
      close: () => local.close(),
    };
  }

  const pool = new Pool(
    postgresConfig(options.databaseUrl, options.caCertificate),
  );
  pool.on("error", () => {
    // Connection URLs and provider credentials must never reach application logs.
    console.error(
      "An idle PostgreSQL connection failed; the pool will reconnect.",
    );
  });
  try {
    await pool.query("SELECT 1");
  } catch {
    await pool.end();
    throw new Error(
      "Could not connect to PostgreSQL. Check DATABASE_URL and TLS configuration.",
    );
  }
  return {
    kind: "postgresql",
    query: async <T>(sql: string, parameters?: unknown[]) => ({
      rows: (await pool.query(sql, parameters)).rows as T[],
    }),
    exec: async (sql) => {
      await pool.query(sql);
    },
    transaction: async (work) => {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await work({
          query: async <T>(sql: string, parameters?: unknown[]) => ({
            rows: (await client.query(sql, parameters)).rows as T[],
          }),
          exec: async (sql) => {
            await client.query(sql);
          },
        });
        await client.query("COMMIT");
        return result;
      } catch (error) {
        try {
          await client.query("ROLLBACK");
        } catch {
          /* Preserve the original failure. */
        }
        throw error;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}
