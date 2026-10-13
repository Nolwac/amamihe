import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, cp, symlink } from "node:fs/promises";
import { decisionConfiguration } from "./decision-provider.js";

/** Only the packaged deployment starts an owned daemon; development can reuse one. */
export async function startLocalModel(): Promise<() => void> {
  if (process.env.OLLAMA_AUTOSTART !== "1") return () => {};
  const binary = process.env.OLLAMA_BIN || "/opt/ollama/bin/ollama";
  const home = "/tmp/amamihe-ollama";
  await mkdir(home, { recursive: true, mode: 0o700 });
  const models = home + "/models";
  await mkdir(models, { recursive: true, mode: 0o700 });
  // Ollama 0.40 migrates its manifest index. Keep only that small index writable;
  // the verified model blobs remain in the immutable image.
  const bundled = process.env.OLLAMA_BUNDLED_MODELS || "/opt/models";
  await cp(bundled + "/manifests", models + "/manifests", { recursive: true });
  try {
    await symlink(bundled + "/blobs", models + "/blobs", "dir");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  let owned: ChildProcess | undefined;
  let stopping = false;
  let restart: ReturnType<typeof setTimeout> | undefined;
  const launch = () => {
    if (stopping) return;
    owned = spawn(binary, ["serve"], {
      env: {
        ...process.env,
        HOME: home,
        OLLAMA_HOST: "127.0.0.1:11434",
        OLLAMA_MODELS: models,
        OLLAMA_NO_CLOUD: "1",
        OLLAMA_NOPRUNE: "1",
        OLLAMA_NUM_PARALLEL: "1",
        OLLAMA_MAX_LOADED_MODELS: "1",
        OLLAMA_KEEP_ALIVE: "30m",
      },
      stdio: ["ignore", "inherit", "inherit"],
    });
    owned.on("error", () =>
      console.error("Local learning-guide process could not start."),
    );
    owned.on("exit", () => {
      if (!stopping) restart = setTimeout(launch, 5000);
    });
  };
  launch();
  // Start-up is bounded; API discovery remains available if inference needs recovery.
  const provider = decisionConfiguration().provider;
  for (let attempt = 0; attempt < 20; attempt++) {
    if ((await provider.status(true)).ready) break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return () => {
    stopping = true;
    clearTimeout(restart);
    owned?.kill("SIGTERM");
  };
}
