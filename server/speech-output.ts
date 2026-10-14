import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import type { FastifyInstance } from "fastify";
import type { Authentication } from "./auth.js";
import { LANGUAGES, type Language } from "../shared/inclusion.js";

export interface SpeechOutputProvider {
  readonly languages: Language[];
  readonly name: string;
  synthesize(text: string, language: Language, rate: number): Promise<Buffer>;
}
export async function cpuSpeechOutput(): Promise<SpeechOutputProvider | null> {
  const espeak = process.env.ESPEAK_BIN || "espeak-ng",
    ffmpeg = process.env.FFMPEG_BIN || "ffmpeg";
  const run = promisify(execFile);
  try {
    const voices = await run(espeak, ["--voices"], {
      timeout: 2000,
      maxBuffer: 100_000,
    });
    await run(ffmpeg, ["-version"], { timeout: 2000, maxBuffer: 100_000 });
    const supported = new Set(
      voices.stdout
        .split(/\r?\n/)
        .slice(1)
        .map((line) => line.trim().split(/\s+/)[1]?.split("-")[0]),
    );
    const languages = LANGUAGES.filter((l) => supported.has(l.id)).map(
      (l) => l.id,
    );
    return {
      name: "espeak-ng",
      languages,
      synthesize: (text, language, rate) => {
        if (
          !languages.includes(language) ||
          !text.trim() ||
          text.length > 8000 ||
          !Number.isFinite(rate)
        )
          return Promise.reject(new Error("Unsupported narration request."));
        return new Promise<Buffer>((resolve, reject) => {
          const environment = { PATH: process.env.PATH, LANG: "C.UTF-8" };
          const voice = spawn(
            espeak,
            [
              "--stdout",
              "-v",
              language,
              "-s",
              String(Math.round(175 * Math.max(0.6, Math.min(1.4, rate)))),
              "--stdin",
            ],
            { env: environment, stdio: ["pipe", "pipe", "ignore"] },
          );
          const encode = spawn(
            ffmpeg,
            [
              "-hide_banner",
              "-loglevel",
              "error",
              "-i",
              "pipe:0",
              "-t",
              "480",
              "-ac",
              "1",
              "-ar",
              "22050",
              "-threads",
              "1",
              "-codec:a",
              "libmp3lame",
              "-b:a",
              "24k",
              "-f",
              "mp3",
              "pipe:1",
            ],
            { env: environment, stdio: ["pipe", "pipe", "ignore"] },
          );
          let finished = false,
            bytes = 0,
            voiceCode: number | null = null,
            encodeCode: number | null = null;
          const chunks: Buffer[] = [];
          const end = (error?: Error) => {
            if (finished) return;
            finished = true;
            clearTimeout(timer);
            voice.kill();
            encode.kill();
            if (error) reject(error);
            else resolve(Buffer.concat(chunks));
          };
          const timer = setTimeout(
            () => end(new Error("Narration exceeded its processing limit.")),
            15000,
          );
          voice.on("error", () => end(new Error("Narration is unavailable.")));
          encode.on("error", () => end(new Error("Narration is unavailable.")));
          voice.stdin.on("error", () => {});
          encode.stdin.on("error", () => {});
          const complete = () => {
            if (voiceCode === 0 && encodeCode === 0)
              end(
                bytes < 100
                  ? new Error("Narration is unavailable.")
                  : undefined,
              );
          };
          voice.on("close", (code) => {
            voiceCode = code;
            if (code !== 0) end(new Error("Narration is unavailable."));
            else complete();
          });
          encode.stdout.on("data", (chunk: Buffer) => {
            bytes += chunk.length;
            if (bytes > 1_500_000)
              end(new Error("Narration exceeds its data budget."));
            else chunks.push(chunk);
          });
          encode.on("close", (code) => {
            encodeCode = code;
            if (code !== 0) end(new Error("Narration is unavailable."));
            else complete();
          });
          voice.stdout.pipe(encode.stdin);
          voice.stdin.end(
            text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, " "),
          );
        });
      },
    };
  } catch {
    return null;
  }
}
export function registerNarration(
  app: FastifyInstance,
  auth: Authentication,
  provider: SpeechOutputProvider | null,
) {
  let active = false;
  app.get("/api/speech/capabilities", async (_req, reply) => {
    reply.header("Cache-Control", "no-store");
    return {
      provider: provider?.name || "unavailable",
      languages: provider?.languages || [],
      storesAudio: false,
      requiresSignIn: true,
      maximumCharacters: 8000,
    };
  });
  app.post<{ Body: { text: string; language: string; rate?: number } }>(
    "/api/speech/narrate",
    {
      bodyLimit: 32768,
      config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    },
    async (req, reply) => {
      reply.header("Cache-Control", "no-store");
      if (!(await auth.player(req.cookies.amamihe)))
        return reply
          .code(401)
          .send({ error: "Sign in to use the protected narrator." });
      const body = req.body;
      const lang = LANGUAGES.find(
        (l) => l.id === String(body?.language).split("-")[0],
      )?.id;
      if (
        !lang ||
        typeof body?.text !== "string" ||
        !body.text.trim() ||
        body.text.length > 8000 ||
        (body.rate !== undefined &&
          (!Number.isFinite(body.rate) || body.rate < 0.6 || body.rate > 1.4))
      )
        return reply.code(400).send({
          error:
            "Use a supported language and at most 8000 narration characters.",
        });
      if (!provider?.languages.includes(lang))
        return reply.code(422).send({
          error:
            "No device voice matches this language. The text remains available to your screen reader.",
        });
      if (active)
        return reply
          .code(503)
          .send({ error: "The narrator is busy. Please retry." });
      active = true;
      try {
        const audio = await provider.synthesize(
          body.text,
          lang,
          body.rate || 1,
        );
        return reply
          .type("audio/mpeg")
          .header("X-Narration-Language", lang)
          .send(audio);
      } catch {
        return reply.code(503).send({
          error:
            "Narration is unavailable. Text and keyboard controls remain usable.",
        });
      } finally {
        active = false;
      }
    },
  );
}
