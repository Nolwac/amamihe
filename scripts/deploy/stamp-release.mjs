import { readFile, writeFile, mkdir } from "node:fs/promises";

// Read only HEAD, never Git config, credentials, reflogs, or history.
// GitHub checkout and the VPS poller both build a detached, verified commit.
const supplied = process.argv[2];
let commit = supplied || "";
if (supplied && !/^[a-f0-9]{40}$/.test(supplied))
  throw new Error("AMAMIHE_COMMIT must be a full Git commit identifier.");
if (!commit) {
  try {
    const head = (await readFile(".git/HEAD", "utf8")).trim();
    if (/^[a-f0-9]{40}$/.test(head)) commit = head;
  } catch {
    /* A source export or local branch is an unstamped development build. */
  }
}
await mkdir("server", { recursive: true });
await writeFile(
  "server/build-info.json",
  JSON.stringify({ commit: commit || "development" }) + "\n",
);
