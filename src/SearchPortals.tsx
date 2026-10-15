import { lazy, Suspense, useEffect, useRef, useState } from "react";
import type { CourseSummary } from "../shared/course";
import { gameAudio } from "./gameAudio";
import { useAccess } from "./Access";
import "./portals.css";
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
    [error, setError] = useState(""),
    [activeCourseId, setActiveCourseId] = useState("");
  const audibleSearch = useRef<string | null>(null);
  const catalog = useRef<HTMLDivElement>(null);
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
  function returnToCity() {
    void gameAudio.activate();
    onClose();
    gameAudio.effect("portal");
  }
  function focusPortal(index: number) {
    const course = courses[index];
    if (!course) return;
    setActiveCourseId(course.id);
    const card = catalog.current?.children[index];
    if (card instanceof HTMLElement)
      card.scrollIntoView({
        block: "nearest",
        inline: "center",
        behavior: preferences.reducedMotion ? "instant" : "smooth",
      });
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
        if (controller.signal.aborted) return;
        setCourses(data.courses);
        setTotal(data.total);
        setActiveCourseId(data.courses[0]?.id || "");
        catalog.current?.scrollTo({ left: 0 });
        if (audibleSearch.current === search) {
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
  const activeIndex = Math.max(
    0,
    courses.findIndex((course) => course.id === activeCourseId),
  );
  return (
    <section
      className="course-directory portal-universe"
      aria-label="Search portal universe"
      aria-busy={busy}
    >
      <div className="portal-world">
        <Suspense
          fallback={
            <p className="portal-status" role="status">
              {t("Opening the portal universe…")}
            </p>
          }
        >
          <PortalScene
            courses={courses}
            activeCourseId={activeCourseId}
            onDoor={openDoor}
            onClose={returnToCity}
          />
        </Suspense>
      </div>
      <header className="portal-hud">
        <div className="portal-heading">
          <div>
            <span className="portal-eyebrow">
              {t("Discover your next adventure")}
            </span>
            <h1>{t("Course portals")}</h1>
          </div>
          <button className="portal-city-return" onClick={returnToCity}>
            <span aria-hidden="true">↶</span> {t("Return to city")}
          </button>
        </div>
        <form
          className="portal-search"
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
            <span className="portal-search-icon" aria-hidden="true">
              ⌕
            </span>
            <span className="portal-visually-hidden">{t("Find a course")}</span>
            <input
              value={query}
              maxLength={200}
              placeholder={t("Find a course")}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <button disabled={busy}>
            <span className="portal-search-submit-text">
              {t("Open search portals")}
            </span>
            <span aria-hidden="true">→</span>
          </button>
        </form>
      </header>
      <div className="portal-stage-note" aria-live="polite">
        {error ? (
          <p role="alert">{t(error)}</p>
        ) : busy ? (
          <p role="status">{t("Finding portals…")}</p>
        ) : !courses.length ? (
          <p>{t("No portals match. Try another skill or course title.")}</p>
        ) : null}
      </div>
      <div
        className="portal-focused-navigation"
        aria-label={t("Choose a portal")}
      >
        <button
          aria-label={t("Focus previous portal")}
          disabled={activeIndex === 0}
          onClick={() => focusPortal(activeIndex - 1)}
        >
          ‹
        </button>
        <span>
          {courses.length ? `${activeIndex + 1} / ${courses.length}` : "—"}
        </span>
        <button
          aria-label={t("Focus next portal")}
          disabled={activeIndex + 1 >= courses.length}
          onClick={() => focusPortal(activeIndex + 1)}
        >
          ›
        </button>
      </div>
      <aside
        className="portal-results"
        aria-label={t("Available course doorsteps")}
      >
        <div
          className="portal-course-cards"
          ref={catalog}
          onScroll={(event) => {
            const row = event.currentTarget;
            if (row.scrollWidth <= row.clientWidth) return;
            const middle = row.scrollLeft + row.clientWidth / 2;
            const cards = [...row.children] as HTMLElement[];
            const nearest = cards.reduce(
              (best, card, index) =>
                Math.abs(card.offsetLeft + card.offsetWidth / 2 - middle) <
                Math.abs(
                  cards[best].offsetLeft + cards[best].offsetWidth / 2 - middle,
                )
                  ? index
                  : best,
              0,
            );
            if (courses[nearest]) setActiveCourseId(courses[nearest].id);
          }}
        >
          {courses.map((course, index) => (
            <article
              className="portal-course-card"
              data-active={course.id === activeCourseId}
              data-portal-index={index}
              key={course.id}
              onFocus={() => setActiveCourseId(course.id)}
            >
              <div className="portal-card-heading">
                <span className="portal-course-number" aria-hidden="true">
                  {String(index + offset + 1).padStart(2, "0")}
                </span>
                <div>
                  <h2>{course.title}</h2>
                  <span className="portal-course-meta">
                    {course.language.toUpperCase()} · {course.levelCount}{" "}
                    {t("authored levels")} · V{course.version}
                  </span>
                </div>
              </div>
              <div className="portal-card-actions">
                <details>
                  <summary>{t("Course details")}</summary>
                  <div className="portal-course-details">
                    <h3>{course.title}</h3>
                    <p>{course.summary}</p>
                  </div>
                </details>
                <button
                  className="portal-enter"
                  onClick={() => openDoor(course)}
                  aria-label={t("Teleport to") + " " + course.title}
                >
                  {t("Teleport")} <span aria-hidden="true">→</span>
                </button>
              </div>
            </article>
          ))}
        </div>
        <nav
          className="portal-pagination"
          aria-label={t("Portal result pages")}
        >
          <button
            disabled={offset === 0 || busy}
            onClick={() => setOffset(Math.max(0, offset - 4))}
          >
            {t("Previous portals")}
          </button>
          <span>
            {total} {t("matching courses")}
          </span>
          <button
            disabled={offset + 4 >= total || busy}
            onClick={() => setOffset(offset + 4)}
          >
            {t("Next portals")}
          </button>
        </nav>
      </aside>
    </section>
  );
}
