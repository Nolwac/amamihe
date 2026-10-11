import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import { openDatabase } from "../server/db.js";
import { initializeSchema } from "../server/schema.js";
import { initializeSocialSchema } from "../server/social.js";
import { initializeAdvertisingSchema } from "../server/advertising.js";
import { initializeWorldPolicySchema } from "../server/world-policy.js";
import { registerOperations } from "../server/operations.js";
import type { Authentication } from "../server/auth.js";
test("operations counts are private to configured moderators and expose no credentials", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "amamihe-ops-")),
    db = await openDatabase({ dataDir: dir }),
    app = Fastify();
  try {
    await initializeSchema(db);
    await initializeSocialSchema(db);
    await initializeAdvertisingSchema(db);
    await initializeWorldPolicySchema(db);
    await app.register(cookie);
    const auth = {
      player: async (token: string) => (token ? { id: token } : null),
    } as unknown as Authentication;
    registerOperations(app, db, auth, ["moderator"]);
    assert.equal((await app.inject("/api/operations")).statusCode, 401);
    assert.equal(
      (
        await app.inject({
          url: "/api/operations",
          headers: { cookie: "amamihe=other" },
        })
      ).statusCode,
      403,
    );
    const response = await app.inject({
      url: "/api/operations",
      headers: { cookie: "amamihe=moderator" },
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().limits.animatedPeers, 3);
    assert.equal(response.json().reports, 0);
    assert.equal(response.headers["cache-control"], "no-store");
    assert.doesNotMatch(response.body, /API_KEY|password|token|SECRET/);
  } finally {
    await app.close();
    await db.close();
    await rm(dir, { recursive: true, force: true });
  }
});
