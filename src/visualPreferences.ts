import { useEffect, useState } from "react";

const KEY = "amamihe-visual-v1";
type VisualSettings = {
  cityQuality: "low" | "medium" | "high";
  adventureHeight: number;
};
function allowed<K extends keyof VisualSettings>(
  key: K,
  value: unknown,
): value is VisualSettings[K] {
  return key === "cityQuality"
    ? ["low", "medium", "high"].includes(value as string)
    : [0, 144, 360, 720, 1080].includes(value as number);
}
function saved<K extends keyof VisualSettings>(
  key: K,
  fallback: VisualSettings[K],
): VisualSettings[K] {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) || "{}")[key];
    return allowed(key, value) ? value : fallback;
  } catch {
    return fallback;
  }
}
export function useVisualPreference<K extends keyof VisualSettings>(
  key: K,
  fallback: VisualSettings[K],
) {
  const [value, update] = useState(() => saved(key, fallback));
  useEffect(() => {
    const sync = () => update(saved(key, fallback));
    window.addEventListener("storage", sync);
    window.addEventListener("amamihe-visual-change", sync);
    window.addEventListener("amamihe-study-change", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("amamihe-visual-change", sync);
      window.removeEventListener("amamihe-study-change", sync);
    };
  }, [key, fallback]);
  const setValue = (next: VisualSettings[K]) => {
    if (!allowed(key, next)) return;
    update(next);
    try {
      let previous: Record<string, unknown> = {};
      try {
        const parsed = JSON.parse(localStorage.getItem(KEY) || "{}");
        if (parsed && typeof parsed === "object") previous = parsed;
      } catch {
        /* Repair invalid settings using this explicit choice. */
      }
      const settings = Object.fromEntries(
        (["cityQuality", "adventureHeight"] as const)
          .filter((name) => allowed(name, previous[name]))
          .map((name) => [name, previous[name]]),
      );
      settings[key] = next;
      localStorage.setItem(KEY, JSON.stringify(settings));
      window.dispatchEvent(new Event("amamihe-visual-change"));
    } catch {
      /* Settings remain usable when browser storage is unavailable. */
    }
  };
  return [value, setValue] as const;
}
