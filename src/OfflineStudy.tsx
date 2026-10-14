import { useEffect, useState } from "react";
import type { PublicCourseDefinition, PublishedCourse } from "../shared/course";
import { useAccess } from "./Access";

const KEY = "amamihe-public-study-v1";
const BUDGET = 1_200_000;
type StudyPack = {
  id: string;
  version: number;
  savedAt: string;
  definition: Pick<
    PublicCourseDefinition,
    "title" | "summary" | "language" | "resources"
  >;
};
function packs(): StudyPack[] {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(value) ? value.slice(0, 3) : [];
  } catch {
    return [];
  }
}
export function clearPrivateDeviceData() {
  try {
    for (const key of Object.keys(localStorage))
      if (
        /^amamihe-(draft:|practice-draft:|active-course:|journal-page:)/.test(
          key,
        )
      )
        localStorage.removeItem(key);
  } catch {
    /* Device storage optional. */
  }
}
export async function clearDeviceStudy() {
  try {
    for (const key of Object.keys(localStorage))
      if (key.startsWith("amamihe-")) localStorage.removeItem(key);
  } catch {
    /* Optional storage. */
  }
  if ("caches" in window)
    for (const key of await caches.keys())
      if (key.startsWith("amamihe-")) await caches.delete(key);
  window.dispatchEvent(new Event("amamihe-study-change"));
}
async function cacheSeenPublicAssets() {
  if (!("serviceWorker" in navigator)) return;
  const worker = (await navigator.serviceWorker.ready).active;
  if (!worker) return;
  const assets = performance
    .getEntriesByType("resource")
    .map((r) => r.name)
    .filter((name) => {
      const url = new URL(name, location.href);
      return (
        url.origin === location.origin &&
        url.pathname.startsWith("/assets/") &&
        /\.(js|css|woff2|glb|png|webp|jpg)$/.test(url.pathname)
      );
    })
    .slice(-180);
  await new Promise<void>((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(resolve, 15000);
    channel.port1.onmessage = () => {
      clearTimeout(timer);
      channel.port1.close();
      resolve();
    };
    worker.postMessage({ type: "CACHE_PUBLIC_SHELL", assets }, [channel.port2]);
  });
}
export async function saveStudyPack(course: PublishedCourse) {
  // Copy only public authored readings. Never persist private API responses,
  // assessment/routing evidence, answer keys, login tokens or learner identity.
  const pack: StudyPack = {
    id: course.id,
    version: course.version,
    savedAt: new Date().toISOString(),
    definition: {
      title: course.definition.title,
      summary: course.definition.summary,
      language: course.definition.language,
      resources: course.definition.resources
        .filter((r) => r.kind === "reading")
        .map((r) => ({
          id: r.id,
          title: r.title,
          kind: r.kind,
          content: r.content,
          url: r.url,
          source: r.source,
        })),
    },
  };
  if (JSON.stringify(pack).length > 350_000)
    throw new Error(
      "This lesson exceeds the offline reading budget. Save a smaller lesson.",
    );
  const next = [pack, ...packs().filter((p) => p.id !== pack.id)].slice(0, 3);
  const encoded = JSON.stringify(next);
  if (new TextEncoder().encode(encoded).byteLength > BUDGET)
    throw new Error(
      "Saved lessons exceed the device budget. Remove a saved lesson first.",
    );
  localStorage.setItem(KEY, encoded);
  await cacheSeenPublicAssets();
  window.dispatchEvent(new Event("amamihe-study-change"));
}
export function OfflineStudyLibrary() {
  const { t, speak } = useAccess();
  const [saved, setSaved] = useState(packs);
  const [selected, select] = useState<string>();
  useEffect(() => {
    const refresh = () => setSaved(packs());
    window.addEventListener("amamihe-study-change", refresh);
    return () => window.removeEventListener("amamihe-study-change", refresh);
  }, []);
  const pack = saved.find((p) => p.id === selected);
  return (
    <section>
      <h3>{t("Saved lessons")}</h3>
      <p>
        {t(
          "Offline study is practice. Reconnect and sign in to save assessed progress.",
        )}
      </p>
      {saved.map((p) => (
        <div key={p.id}>
          <button onClick={() => select(p.id)} lang={p.definition.language}>
            {p.definition.title} · V{p.version}
          </button>
          <button
            onClick={() => {
              const next = saved.filter((item) => item.id !== p.id);
              localStorage.setItem(KEY, JSON.stringify(next));
              setSaved(next);
            }}
          >
            {t("Remove saved lesson")}
          </button>
        </div>
      ))}
      {pack && (
        <div
          className="offline-study"
          lang={pack.definition.language}
          dir={pack.definition.language.startsWith("ar") ? "rtl" : "ltr"}
        >
          <h4>{pack.definition.title}</h4>
          {pack.definition.resources.map((r) => (
            <article key={r.id}>
              <h4>{r.title}</h4>
              <pre>{r.content}</pre>
              <button
                onClick={() => speak(r.content, pack.definition.language)}
              >
                {t("Listen to this page")}
              </button>
              <a href={r.source} target="_blank" rel="noopener noreferrer">
                {t("Source & attribution")}
              </a>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
