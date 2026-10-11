import { useEffect, useState } from "react";
import type { CourseDraft } from "../shared/course";
type Ad = {
  id: string;
  title: string;
  description: string;
  destination: string;
  status: string;
  course_id?: string;
};
async function call(path: string, body?: unknown) {
  const r = await fetch("/api/ads" + path, {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error);
  return data;
}
export default function AdDesk() {
  const [ads, setAds] = useState<Ad[]>([]),
    [queue, setQueue] = useState<Ad[]>([]),
    [moderator, setModerator] = useState(false),
    [drafts, setDrafts] = useState<CourseDraft[]>([]),
    [courseId, setCourseId] = useState(""),
    [levelId, setLevelId] = useState(""),
    [publishedLevels, setPublishedLevels] = useState<
      { id: string; title: string }[]
    >([]),
    [title, setTitle] = useState(""),
    [description, setDescription] = useState(""),
    [destination, setDestination] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  async function load() {
    const data = await call("");
    setAds(data.ads);
    setModerator(data.moderator);
    if (data.moderator) setQueue(await call("/moderation"));
  }
  useEffect(() => {
    void load().catch((e) => setMessage(e.message));
    void fetch("/api/studio/courses")
      .then((r) => r.json())
      .then((d) => setDrafts(d.courses || []))
      .catch(() => {});
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setPublishedLevels([]);
    if (courseId)
      void fetch("/api/courses/" + encodeURIComponent(courseId), {
        signal: controller.signal,
      })
        .then((r) => r.json())
        .then((d) => setPublishedLevels(d.definition?.levels || []))
        .catch(() => {});
    return () => controller.abort();
  }, [courseId]);
  async function act(id: string, action: string) {
    setBusy(true);
    try {
      await call(`/${id}/action`, { action });
      await load();
    } catch (e) {
      setMessage(String(e));
    } finally {
      setBusy(false);
    }
  }
  const selected = drafts.find((d) => d.id === courseId);
  return (
    <section className="wardrobe" aria-label="Billboard submissions">
      <span className="eyebrow">COMMUNITY BILLBOARDS</span>
      <h2>Share an opportunity</h2>
      <p>
        Placements are labeled advertisements. They appear only after moderator
        approval. No payment or tracking is configured.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setBusy(true);
          void call("", {
            title,
            description,
            destination,
            ...(selected
              ? { courseId, version: selected.publishedVersion, levelId }
              : {}),
          })
            .then(() => {
              setMessage(
                "Placement submitted for review. It is not yet visible in the world.",
              );
              return load();
            })
            .catch((e) => setMessage(e.message))
            .finally(() => setBusy(false));
        }}
      >
        <label>
          Billboard title
          <input
            required
            minLength={3}
            maxLength={70}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label>
          Advertisement description
          <textarea
            maxLength={220}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <label>
          HTTPS destination
          <input
            type="url"
            required
            maxLength={1000}
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
          />
        </label>
        <label>
          Placement
          <select
            value={courseId}
            onChange={(e) => {
              setCourseId(e.target.value);
              setLevelId("");
            }}
          >
            <option value="">City streets</option>
            {drafts
              .filter((d) => d.publishedVersion)
              .map((d) => (
                <option key={d.id} value={d.id}>
                  {d.definition.title} · V{d.publishedVersion}
                </option>
              ))}
          </select>
        </label>
        {selected && (
          <label>
            Published course level
            <select
              required
              value={levelId}
              onChange={(e) => setLevelId(e.target.value)}
            >
              <option value="">Choose level</option>
              {publishedLevels.map((l) => (
                <option value={l.id} key={l.id}>
                  {l.title}
                </option>
              ))}
            </select>
          </label>
        )}
        <button className="course-secondary" disabled={busy}>
          Submit billboard
        </button>
      </form>
      {message && <p role="status">{message}</p>}
      {ads.map((ad) => (
        <article key={ad.id}>
          <h3>{ad.title}</h3>
          <p>
            {ad.status} · {ad.course_id ? "Course placement" : "City placement"}
          </p>
          {["pending", "approved"].includes(ad.status) && (
            <button
              className="course-secondary"
              disabled={busy}
              onClick={() => void act(ad.id, "withdraw")}
            >
              Withdraw {ad.title}
            </button>
          )}
        </article>
      ))}
      {moderator && (
        <div aria-label="Advertising moderation">
          <h3>Placement review</h3>
          <p>
            Review credibility, age suitability, destination and local relevance
            before approval. Withdrawn placements cannot be restored.
          </p>
          {queue.map((ad) => (
            <article key={ad.id}>
              <h4>{ad.title}</h4>
              <p>{ad.description}</p>
              <a
                href={ad.destination}
                target="_blank"
                rel="noopener noreferrer"
              >
                Review destination
              </a>
              <button
                className="course-secondary"
                disabled={busy}
                onClick={() => void act(ad.id, "approve")}
              >
                Approve {ad.title}
              </button>
              <button
                className="course-secondary"
                disabled={busy}
                onClick={() => void act(ad.id, "reject")}
              >
                Reject {ad.title}
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
