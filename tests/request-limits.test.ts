import { test } from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import { learningRequestKey } from "../server/request-limits.js";
import type { Authentication } from "../server/auth.js";

test("verified learners sharing one IP retain independent budgets while forged cookies and login remain IP limited", async () => {
  const app = Fastify();
  const auth = {
    player: async (token?: string) =>
      token === "verified-one" || token === "verified-two"
        ? { id: token }
        : null,
  } as unknown as Authentication;
  try {
    await app.register(cookie);
    await app.register(rateLimit, {
      max: 3,
      timeWindow: "1 minute",
      keyGenerator: learningRequestKey(auth),
    });
    app.get("/api/learning-probe", async (req, reply) => {
      const learner = await auth.player(req.cookies.amamihe);
      return learner
        ? { id: learner.id }
        : reply.code(401).send({ error: "Sign in" });
    });
    app.post(
      "/api/auth/probe",
      { config: { rateLimit: { max: 3, timeWindow: "1 minute" } } },
      async () => ({ ok: true }),
    );
    const call = (
      token: string,
      url = "/api/learning-probe",
      method: "GET" | "POST" = "GET",
    ) => app.inject({ method, url, headers: { cookie: "amamihe=" + token } });
    for (const token of ["verified-one", "verified-two"]) {
      for (let i = 0; i < 3; i++)
        assert.equal((await call(token)).statusCode, 200);
      assert.equal((await call(token)).statusCode, 429);
    }
    for (let i = 0; i < 3; i++)
      assert.equal((await call("forged-" + i)).statusCode, 401);
    assert.equal((await call("forged-new-cookie")).statusCode, 429);
    for (let i = 0; i < 3; i++)
      assert.equal(
        (
          await call(
            i % 2 ? "verified-one" : "verified-two",
            "/api/auth/probe",
            "POST",
          )
        ).statusCode,
        200,
      );
    assert.equal(
      (await call("verified-new-account", "/api/auth/probe", "POST"))
        .statusCode,
      429,
    );
  } finally {
    await app.close();
  }
});
