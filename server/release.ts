import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export async function readRelease(
  filename = fileURLToPath(new URL("./build-info.json", import.meta.url)),
) {
  try {
    const data = JSON.parse(await readFile(filename, "utf8"));
    return typeof data.commit === "string" && /^[a-f0-9]{40}$/.test(data.commit)
      ? data.commit
      : "development";
  } catch {
    return "development";
  }
}
