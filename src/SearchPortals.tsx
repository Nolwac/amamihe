import { lazy, Suspense, useEffect, useRef, useState } from "react";
import type { CourseSummary } from "../shared/course";
import { gameAudio } from "./gameAudio";
import { useAccess } from "./Access";
const PortalScene = lazy(() => import("./PortalScene"));
export default function SearchPortals({
  onDoor,
  onClose,
  initialQuery = "",
}: {
  onDoor: (course: CourseSummary) => void;
  onClose: () => void;
  initialQuery?: string;
}) {
  const { preferences, t } = useAccess();
  const [query, setQuery] = useState(initialQuery),
    [search, setSearch] = useState(initialQuery),
    [offset, setOffset] = useState(0),
    [courses, setCourses] = useState<CourseSummary[]>([]),
    [total, setTotal] = useState(0),
    [busy, setBusy] = useState(true),
    [error, setError] = useState("");
  const audibleSearch = useRef<string | null>(null);
  useEffect(() => {
    setQuery(initialQuery);
    setSearch(initialQuery);
    setOffset(0);
  }, [initialQuery]);
  function openDoor(course: CourseSummary) {
    void gameAudio.activate();
    onDoor(course);
    gameAudio.effect("portal");
  }
  useEffect(() => {
    const controller = new AbortController();
    setBusy(true);
    setError("");
    void fetch(
      `/api/courses?q=${encodeURIComponent(search)}&limit=4&offset=${offset}`,
      {
        signal: controller.signal,
        headers: { "X-Amamihe-Language": preferences.language },
      },
    )
      .then(async (r) => {
        if (!r.ok) throw new Error("Course search unavailable.");
        return r.json();
      })
      .then((data) => {
        setCourses(data.courses);
        setTotal(data.total);
        if (!controller.signal.aborted && audibleSearch.current === search) {
          audibleSearch.current = null;
          gameAudio.effect("portal");
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [search, offset, preferences.language]);
  return (
    <section className="course-directory" aria-label="Search portal universe">
      <header className="course-bar">
        <h1>{t("Course portals")}</h1>
        <button
          className="course-secondary"
          onClick={() => {
            void gameAudio.activate();
            onClose();
            gameAudio.effect("portal");
          }}
        >
          {t("Return to city")}
        </button>
      </header>
      <p>
        Search for a skill. Choose a portal to preview its course doorstep
        before enrolling.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void gameAudio.activate();
          const nextSearch = query.trim();
          if (nextSearch !== search || offset !== 0)
            audibleSearch.current = nextSearch;
          setOffset(0);
          setSearch(nextSearch);
        }}
      >
        <label>
          {t("Find a course")}{" "}
          <input
            value={query}
            maxLength={200}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <button className="course-secondary" disabled={busy}>
          {t("Open search portals")}
        </button>
      </form>
      {error && <p role="alert">{error}</p>}
      {busy ? (
        <p role="status">Finding portals…</p>
      ) : (
        <>
          <Suspense fallback={<p>Opening the portal universe…</p>}>
            <PortalScene courses={courses} onDoor={openDoor} />
          </Suspense>
          <div className="course-directory-grid">
            {courses.map((course) => (
              <article className="directory-card" key={course.id}>
                <span className="eyebrow">
                  PORTAL · {course.language} · V{course.version}
                </span>
                <h2>{course.title}</h2>
                <p>{course.summary}</p>
                <small>{course.levelCount} authored levels</small>
                <button
                  className="course-secondary"
                  onClick={() => openDoor(course)}
                >
                  Teleport to {course.title}
                </button>
              </article>
            ))}
          </div>
          {!courses.length && (
            <p>No portals match. Try another skill or course title.</p>
          )}
          <div className="directory-pagination">
            <button
              className="course-secondary"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - 4))}
            >
              {t("Previous portals")}
            </button>
            <span>{total} matching courses</span>
            <button
              className="course-secondary"
              disabled={offset + 4 >= total}
              onClick={() => setOffset(offset + 4)}
            >
              {t("Next portals")}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
