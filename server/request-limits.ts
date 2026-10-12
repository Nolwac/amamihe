import type { FastifyRequest } from "fastify";
import type { Authentication } from "./auth.js";

/** Shared school/carrier networks must not make one learner exhaust another's
 * course allowance. Only a verified session selects an account bucket. Login
 * and anonymous traffic keep their IP budget; handlers still authorize access. */
export function learningRequestKey(auth: Authentication) {
  return async (req: FastifyRequest) => {
    if (!req.url.startsWith("/api/") || req.url.startsWith("/api/auth/"))
      return "ip:" + req.ip;
    const learner = await auth.player(req.cookies.amamihe);
    return learner ? "learner:" + learner.id : "ip:" + req.ip;
  };
}
