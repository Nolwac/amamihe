import { initializeAssetCache } from "./rendering";
void initializeAssetCache();
import React, { Suspense, lazy, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/dm-sans/latin-400.css";
import "@fontsource/dm-sans/latin-500.css";
import "@fontsource/dm-sans/latin-600.css";
import "@fontsource/dm-sans/latin-700.css";
import "@fontsource/manrope/latin-400.css";
import "@fontsource/manrope/latin-500.css";
import "@fontsource/manrope/latin-600.css";
import "@fontsource/manrope/latin-700.css";
import "@fontsource/manrope/latin-800.css";
import "./style.css";
import "./game.css";
const World = lazy(() => import("./World"));
const TutorStudio = lazy(() => import("./TutorStudio"));
const CourseAdventure = lazy(() => import("./CourseAdventure"));
const WardrobeShop = lazy(() => import("./WardrobeShop"));
const CourseScene = lazy(() => import("./CourseScene"));
import type { CourseSummary } from "../shared/course";
import "./courses.css";
import { AccountGate, AccountControls, type Player } from "./AccountGate";
type Question = {
  id: string;
  concept: string;
  prompt: string;
  options: string[];
};
type Result = {
  mocked: boolean;
  model: string;
  independent: number;
  total: number;
  route: string;
  nextLevel: string;
  reason: string;
  points: number;
  nextReview: string;
  assessments: {
    questionId: string;
    concept: string;
    outcome: string;
    assisted: boolean;
  }[];
};
async function api<T>(url: string, body?: unknown): Promise<T> {
  const r = await fetch("/api" + url, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const d = await r.json();
  if (r.status === 401) window.location.reload();
  if (!r.ok) throw new Error(d.error || "Something went wrong. Please retry.");
  return d;
}
function Icon({ name, size = 22 }: { name: string; size?: number }) {
  const paths: Record<string, React.ReactNode> = {
    crown: (
      <>
        <path d="m3 7 4 4 5-7 5 7 4-4-3 12H6Z" />
        <path d="M7 22h10" />
      </>
    ),
    tech: (
      <>
        <path d="m6 8-4 4 4 4m12-8 4 4-4 4m-7 4 2-16" />
      </>
    ),
    chat: (
      <>
        <path d="M20 16a3 3 0 0 1-3 3H8l-5 3V6a3 3 0 0 1 3-3h11a3 3 0 0 1 3 3Z" />
        <path d="M7 9h9M7 13h6" />
      </>
    ),
    team: (
      <>
        <circle cx="9" cy="8" r="3" />
        <circle cx="18" cy="9" r="2" />
        <path d="M3 20v-2a6 6 0 0 1 12 0v2m2-6a4 4 0 0 1 4 4v2" />
      </>
    ),
    coin: (
      <>
        <circle cx="12" cy="12" r="10" />
        <path d="m12 5 2 4 5 1-4 3 1 5-4-2-4 2 1-5-4-3 5-1Z" />
      </>
    ),
    arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
    book: (
      <>
        <path d="M12 5v16M3 3c4 0 6 1 9 3 3-2 5-3 9-3v16c-4 0-6 0-9 2-3-2-5-2-9-2Z" />
      </>
    ),
    hanger: (
      <>
        <path d="M9 5a3 3 0 1 1 5 2l-2 2v3L2 19v2h20v-2l-10-7" />
      </>
    ),
    compass: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="m16 8-2 6-6 2 2-6Z" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] || paths.book}
    </svg>
  );
}
function App() {
  const [studio, setStudio] = useState(false);
  const [directory, setDirectory] = useState(false);
  const [courseId, setCourseId] = useState<string | null>(null);
  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [catalogueOffset, setCatalogueOffset] = useState(0);
  const [catalogueTotal, setCatalogueTotal] = useState(0);
  const [catalogueRevision, setCatalogueRevision] = useState(0);
  const [enrollments, setEnrollments] = useState<
    { courseId: string; title: string; version: number; finished: boolean }[]
  >([]);
  const [player, setPlayer] = useState<Player | null>(null),
    [loading, setLoading] = useState(true),
    [outfit, setOutfit] = useState("terracotta"),
    [quality, setQuality] = useState("low"),
    [stats, setStats] = useState({
      fps: 0,
      meshes: 0,
      x: 0,
      z: -5,
      heading: 0,
      avatarReady: false,
      gateX: 0.54,
      gateY: 0.47,
      gateWidth: 220,
      gateVisible: false,
    }),
    [house, setHouse] = useState<string | null>(null),
    [tab, setTab] = useState("explore"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [attempt, setAttempt] = useState<{
      id: string;
      questions: Question[];
    } | null>(null),
    [index, setIndex] = useState(0),
    [answer, setAnswer] = useState<number | null>(null),
    [help, setHelp] = useState(""),
    [started, setStarted] = useState(Date.now()),
    [result, setResult] = useState<Result | null>(null),
    [cleared, setCleared] = useState(false);
  useEffect(() => {
    let alive = true;
    api<{ courses: CourseSummary[]; total: number }>(
      `/courses?limit=4&offset=${catalogueOffset}`,
    )
      .then((data) => {
        if (alive) {
          setCourses(data.courses);
          setCatalogueTotal(data.total);
        }
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [catalogueOffset, catalogueRevision]);
  useEffect(() => {
    if (!player) return;
    let alive = true;
    api<{ courses: typeof enrollments }>("/learning")
      .then((data) => {
        if (alive) setEnrollments(data.courses);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [player?.id, directory, courseId]);
  const publishedHouse = courses.find(
    (course) => house === "course:" + course.id,
  );
  const refreshPoints = () =>
    api<{ player: Player }>("/session")
      .then((s) => {
        setPlayer(s.player);
        setOutfit(s.player.outfit);
      })
      .catch((e) => setError(e.message));
  useEffect(() => {
    api<{
      player: Player | null;
      result: Result | null;
      active?: { id: string; questions: Question[]; answered: number };
    }>("/session")
      .then((d) => {
        setPlayer(d.player);
        setResult(d.result);
        if (d.player) setOutfit(d.player.outfit);
        if (d.active) {
          setAttempt(d.active);
          setIndex(d.active.answered);
          setCleared(d.active.answered === 3);
          setTab("learn");
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  async function action(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }
  const q = attempt?.questions[index];
  const begin = () =>
    action(async () => {
      const a = await api<{ id: string; questions: Question[] }>(
        "/attempts",
        {},
      );
      setAttempt(a);
      setIndex(0);
      setAnswer(null);
      setHelp("");
      setResult(null);
      setCleared(false);
      setStarted(Date.now());
      setHouse(null);
      setTab("learn");
    });
  const submit = () =>
    action(async () => {
      if (!q || answer === null) return;
      await api("/attempts/" + attempt!.id + "/chunks", {
        questionId: q.id,
        answer,
        elapsedMs: Date.now() - started,
      });
      if (index === attempt!.questions.length - 1) {
        setCleared(true);
      } else {
        setIndex(index + 1);
        setAnswer(null);
        setHelp("");
        setStarted(Date.now());
      }
    });
  const classify = () =>
    action(async () => {
      const r = await api<Result>("/attempts/" + attempt!.id + "/complete", {});
      setResult(r);
      setAttempt(null);
      setCleared(false);
      const session = await api<{ player: Player }>("/session");
      setPlayer(session.player);
    });
  return (
    <div className={"app" + (!player ? " creating-character" : "")}>
      <header className="topbar">
        <a className="brand" href="#" onClick={() => setTab("explore")}>
          <span className="brand-mark">
            a<span>✦</span>
          </span>
          <span>
            amamihe<small>A WORLD OF POSSIBILITY</small>
          </span>
        </a>
        <nav aria-label="Main navigation">
          <button
            className={tab === "explore" ? "active" : ""}
            onClick={() => setTab("explore")}
          >
            <Icon name="compass" size={17} /> Explore the world
          </button>
          <button
            className={tab === "learn" ? "active" : ""}
            onClick={() =>
              enrollments.length ? setDirectory(true) : setTab("learn")
            }
          >
            <Icon name="book" size={17} /> My learning
          </button>
          {player && (
            <>
              <button
                onClick={() => {
                  setDirectory(true);
                  setHouse(null);
                }}
              >
                Course houses
              </button>
              <button
                className="tutor-toggle"
                onClick={() => {
                  setStudio(true);
                  setHouse(null);
                }}
              >
                Tutor studio
              </button>
            </>
          )}
        </nav>
        <div className="skills-hud" aria-label="Skill categories">
          {[
            ["crown", "Creativity"],
            ["tech", "Tech"],
            ["chat", "Communication"],
            ["team", "Leadership"],
          ].map(([icon, label]) => (
            <div key={label} className={"skill-category " + icon}>
              <span className="skill-hex">
                <Icon name={icon} />
              </span>
              <small>{label}</small>
            </div>
          ))}
        </div>
        <div className="district-map" aria-label="Workshop District map">
          <svg viewBox="0 0 120 120" aria-hidden="true">
            <defs>
              <clipPath id="map-clip">
                <circle cx="60" cy="60" r="55" />
              </clipPath>
            </defs>
            <g clipPath="url(#map-clip)">
              <rect width="120" height="120" fill="#657a71" />
              <path
                d="M55-10v140M-10 77h140"
                stroke="#aa9c7d"
                strokeWidth="21"
              />
              <path
                d="M55-10v140M-10 77h140"
                stroke="#d4bfa1"
                strokeWidth="12"
              />
              {[
                [22, 64, 18, 26, "#bb7050"],
                [80, 55, 20, 27, "#667f92"],
                [39, 23, 30, 23, "#37877d"],
                [15, 22, 18, 29, "#cea357"],
                [85, 23, 19, 24, "#915e69"],
              ].map(([x, y, w, h, c], i) => (
                <rect
                  key={i}
                  x={x}
                  y={y}
                  width={w}
                  height={h}
                  rx="2"
                  fill={String(c)}
                  stroke="#ddcbb3"
                  strokeWidth="1"
                />
              ))}
              {[
                [12, 90],
                [92, 92],
                [14, 10],
                [100, 40],
                [80, 14],
              ].map(([cx, cy], i) => (
                <circle key={i} cx={cx} cy={cy} r="7" fill="#3c6854" />
              ))}
              <g
                transform={`translate(${55 + stats.x * 3},${98 - (stats.z + 5) * 3}) rotate(${(stats.heading * 180) / Math.PI})`}
              >
                <path
                  d="M0-7 5 6 0 3-5 6Z"
                  fill="#fff4db"
                  stroke="#17362f"
                  strokeWidth="1.5"
                />
              </g>
            </g>
            <circle
              cx="60"
              cy="60"
              r="56"
              stroke="#d9bf85"
              strokeWidth="3"
              fill="none"
            />
          </svg>
          <small>WORKSHOP DISTRICT</small>
        </div>
        <div className="points-chip" aria-label="Earned skill points">
          <Icon name="coin" size={26} />
          <b>{player?.points || 0}</b>
          <span>points</span>
        </div>
        <div className="player-chip">
          <img
            className="mini-avatar"
            src="/assets/explorer-portrait.png"
            alt="Your explorer avatar"
          />
          <div>
            <strong title={player?.name || "Explorer"}>
              {player?.name || "Explorer"}
            </strong>
            <small>
              {player?.points ? "Learning explorer" : "New explorer"}
            </small>
            <span
              className="profile-progress"
              aria-label={`${player?.points || 0} activity points; course progress is saved separately`}
            >
              <i
                style={{
                  width: `${Math.min(100, ((player?.points || 0) / 60) * 100)}%`,
                }}
              />
            </span>
          </div>
          {player && (
            <AccountControls
              player={player}
              onLogout={() => window.location.reload()}
            />
          )}
        </div>
      </header>
      <main>
        <section className="intro">
          <div>
            <div className="eyebrow">
              <span /> VENTURE CITY · FOUNDATIONS PREVIEW
            </div>
            <h1>
              Your next chapter
              <br />
              starts <em>right here.</em>
            </h1>
            <p>
              A neighborhood of possibilities. Every house is a course.
              <br className="desktop" /> Every skill you learn opens a new door.
            </p>
          </div>
          <div className="intro-aside">
            <span className="round-icon">↗</span>
            <div>
              Small steps.
              <br />
              <strong>Extraordinary possibilities.</strong>
            </div>
          </div>
        </section>
        <section className="game-shell" aria-label="Game world">
          <div className="scene-top">
            <span className="location-pill">
              ⌖ &nbsp; Venture City <span>•</span> Workshop District
            </span>
            <label className="quality-control">
              Graphics{" "}
              <select
                aria-label="Graphics quality"
                value={quality}
                onChange={(e) => setQuality(e.target.value)}
              >
                <option value="low">Low · adaptive 144–360p</option>
                <option value="medium">Medium · 720p</option>
                <option value="high">High · 1080p</option>
              </select>
            </label>
          </div>
          {studio || courseId ? (
            <div className="world-loading">
              Return to Venture City when you are ready.
            </div>
          ) : loading ? (
            <div className="world-loading">Restoring your journey…</div>
          ) : (
            <Suspense
              fallback={
                <div className="world-loading">Building your neighborhood…</div>
              }
            >
              <World
                key={courses
                  .map((course) => course.id + ":" + course.version)
                  .join("|")}
                courses={courses.map(({ id, title }) => ({ id, title }))}
                paused={Boolean(
                  player && (house || directory || tab === "learn"),
                )}
                mode={player ? "world" : "avatar"}
                outfit={outfit}
                quality={quality}
                onHouse={setHouse}
                onReady={setStats}
              />
            </Suspense>
          )}
          <div className="touch-controls" aria-label="Movement controls">
            {[
              ["", ""],
              ["↑", "ArrowUp"],
              ["", ""],
              ["←", "ArrowLeft"],
              ["↓", "ArrowDown"],
              ["→", "ArrowRight"],
            ].map(([label, key], i) =>
              key ? (
                <button
                  key={i}
                  aria-label={"Walk " + key.replace("Arrow", "")}
                  onPointerDown={(e) => {
                    e.currentTarget.setPointerCapture(e.pointerId);
                    window.dispatchEvent(new KeyboardEvent("keydown", { key }));
                  }}
                  onPointerUp={() =>
                    window.dispatchEvent(new KeyboardEvent("keyup", { key }))
                  }
                  onPointerCancel={() =>
                    window.dispatchEvent(new KeyboardEvent("keyup", { key }))
                  }
                >
                  {label}
                </button>
              ) : (
                <span key={i} />
              ),
            )}
          </div>
          <div className="scene-bottom">
            <span>
              <span className="keyboard-hint" aria-label="W A S D to walk">
                {["W", "A", "S", "D"].map((key) => (
                  <kbd key={key}>{key}</kbd>
                ))}
              </span>
              to walk <i /> Drag to look around <i /> Click a house
            </span>
            <span
              className={
                "engine-status" +
                (stats.avatarReady && stats.fps < 5 ? " slow" : "")
              }
            >
              <span /> LIVE 3D{" "}
              <b
                title={
                  stats.avatarReady && stats.fps < 5
                    ? "Frames are arriving slowly. Try Low graphics or close other tabs."
                    : undefined
                }
              >
                {!stats.avatarReady
                  ? "Loading"
                  : stats.fps > 0
                    ? `${stats.fps} FPS`
                    : "<1 FPS"}
              </b>
            </span>
          </div>
          <button
            className="course-entry"
            aria-label="Visit Model Makers"
            style={{
              left: `${stats.gateX * 100}%`,
              top: `${stats.gateY * 100}%`,
              width: Math.max(120, Math.min(300, stats.gateWidth)),
              visibility: stats.gateVisible ? "visible" : "hidden",
            }}
            onClick={() => setHouse("MODEL MAKERS")}
          >
            Enter course <Icon name="arrow" size={20} />
          </button>
        </section>
        <section className="below">
          <div className="featured-heading">
            <span className="eyebrow">START YOUR ADVENTURE</span>
            <h2>A little curiosity goes a long way.</h2>
          </div>
          <button
            className="course-card"
            onClick={() => setHouse("MODEL MAKERS")}
          >
            <div className="course-icon">⌘</div>
            <div>
              <span className="tag">AI & MACHINE LEARNING</span>
              <h3>Build a small storytelling model</h3>
              <p>
                Meet tokens, training, and the ideas behind your first
                1M-parameter model.
              </p>
              <span className="course-meta">
                3-question foundations demo <span>•</span> Beginner checkpoint
              </span>
            </div>
            <span className="course-arrow">↗</span>
          </button>
          <div className="preview-note">
            <span>◈</span>
            <div>
              <strong>Foundation, not fiction.</strong>
              <p>
                A real browser world. Persistent progress.
                <br />A mock classifier, ready for the next chapter.
              </p>
            </div>
          </div>
        </section>
        <footer>
          <span>AMAMIHE · STEP 01</span>
          <span>Built for curiosity. Designed for growth.</span>
          <button onClick={() => setTab("learn")}>View my progress ↗</button>
        </footer>
      </main>
      {player && directory && (
        <section
          className="course-directory"
          aria-label="Course houses directory"
        >
          <header className="course-bar">
            <div>
              <span className="eyebrow">VENTURE CITY · COURSE HOUSES</span>
              <h1>Find your next skill</h1>
            </div>
            <button
              className="course-secondary"
              onClick={() => setDirectory(false)}
            >
              Return to city
            </button>
          </header>
          <Suspense fallback={<p>Opening wardrobe…</p>}>
            <WardrobeShop onChanged={refreshPoints} />
          </Suspense>
          {enrollments.length > 0 && (
            <div
              className="course-directory-grid"
              aria-label="Enrolled courses"
            >
              {enrollments.map((course) => (
                <article className="directory-card" key={course.courseId}>
                  <span className="eyebrow">
                    MY ADVENTURES · VERSION {course.version}
                  </span>
                  <h2>{course.title}</h2>
                  <p>
                    {course.finished
                      ? "Course checkpoints complete"
                      : "Your progress is saved"}
                  </p>
                  <button
                    className="course-secondary"
                    onClick={() => {
                      setDirectory(false);
                      setCourseId(course.courseId);
                    }}
                  >
                    Resume {course.title}
                  </button>
                </article>
              ))}
            </div>
          )}
          <div className="course-directory-grid">
            {courses.map((course) => (
              <article className="directory-card" key={course.id}>
                <span className="eyebrow">
                  PUBLISHED HOUSE · {course.language} · V{course.version}
                </span>
                <h2>{course.title}</h2>
                <p>{course.summary}</p>
                <small>{course.levelCount} tutor-authored levels</small>
                <br />
                <button
                  className="course-secondary"
                  aria-label={"Visit course house: " + course.title}
                  onClick={() => {
                    setDirectory(false);
                    setTab("explore");
                    setHouse("course:" + course.id);
                  }}
                >
                  Preview course house ↗
                </button>
              </article>
            ))}
          </div>
          {courses.length === 0 && (
            <div className="directory-empty">
              <h2>The next course house starts with you.</h2>
              <p>
                Build a learning adventure from presets and publish it to this
                district.
              </p>
              <button
                className="primary"
                onClick={() => {
                  setDirectory(false);
                  setStudio(true);
                }}
              >
                Open tutor studio
              </button>
            </div>
          )}
          <div className="directory-pagination">
            <button
              className="course-secondary"
              disabled={catalogueOffset === 0}
              onClick={() =>
                setCatalogueOffset(Math.max(0, catalogueOffset - 4))
              }
            >
              Previous district
            </button>
            <span>
              {catalogueTotal === 0
                ? "0 houses"
                : `${catalogueOffset + 1}–${Math.min(catalogueOffset + 4, catalogueTotal)} of ${catalogueTotal} houses`}
            </span>
            <button
              className="course-secondary"
              disabled={catalogueOffset + 4 >= catalogueTotal}
              onClick={() => setCatalogueOffset(catalogueOffset + 4)}
            >
              Next district
            </button>
          </div>
        </section>
      )}
      {player && publishedHouse && (
        <div className="modal-backdrop">
          <section
            className="modal"
            aria-label="Published course house preview"
          >
            <button
              className="close"
              onClick={() => setHouse(null)}
              aria-label="Close course preview"
            >
              ×
            </button>
            <span className="eyebrow">
              COURSE HOUSE · VERSION {publishedHouse.version}
            </span>
            <h2>{publishedHouse.title}</h2>
            <p>{publishedHouse.summary}</p>
            <div className="detail-row">
              <span>{publishedHouse.levelCount} levels</span>
              <span>{publishedHouse.language}</span>
              <span>Tutor-authored tasks</span>
            </div>
            <p className="mock-note">
              MOCK CLASSIFIER · Your enrollment stays on this published version.
              Task-driven adventures include timed sections, step retries, and
              cosmetic rewards.
            </p>
            <button
              className="primary"
              disabled={busy}
              onClick={() =>
                action(async () => {
                  await api("/courses/" + publishedHouse.id + "/enroll", {
                    version: publishedHouse.version,
                  });
                  setCourseId(publishedHouse.id);
                  setHouse(null);
                  setTab("explore");
                })
              }
            >
              Enroll & enter adventure
            </button>
          </section>
        </div>
      )}
      {player && studio && (
        <Suspense
          fallback={
            <section className="course-overlay">
              Opening your tutor studio…
            </section>
          }
        >
          <TutorStudio
            onClose={() => setStudio(false)}
            onPublished={() => {
              setCatalogueOffset(0);
              setCatalogueRevision((v) => v + 1);
            }}
            renderScene={(theme) => (
              <Suspense fallback={<p>Loading 3D preview…</p>}>
                <CourseScene theme={theme} outfit={outfit} />
              </Suspense>
            )}
          />
        </Suspense>
      )}
      {player && courseId && (
        <Suspense
          fallback={
            <section className="course-overlay">Restoring your course…</section>
          }
        >
          <CourseAdventure
            key={courseId}
            courseId={courseId}
            outfit={outfit}
            onClose={() => setCourseId(null)}
            onPoints={() => {
              void refreshPoints();
            }}
          />
        </Suspense>
      )}
      {error && (
        <div role="alert" className="error-toast">
          {error}
          <button onClick={() => setError("")}>×</button>
        </div>
      )}
      {(loading || !player) && (
        <div className="modal-backdrop character-creation">
          <div className="creation-heading">
            <Icon name="hanger" size={42} />
            <div>
              <h1>
                AVATAR <span>& OUTFIT</span>
              </h1>
              <p>Create your look. Your story starts here.</p>
            </div>
          </div>
          <aside className="creation-points">
            <h3>
              <Icon name="coin" /> Skills & points
            </h3>
            <strong>
              <Icon name="coin" size={35} /> 0 <small>Skill points</small>
            </strong>
            <p>Clear course levels to earn points and grow your skills.</p>
            <div className="first-adventure">
              <span className="adventure-icon">
                <Icon name="book" size={27} />
              </span>
              <span>
                <small>YOUR FIRST ADVENTURE</small>
                <b>Model Makers</b>
                <span>Build a small storytelling model</span>
              </span>
            </div>
          </aside>
          <AccountGate
            loading={loading}
            outfit={outfit}
            onOutfit={setOutfit}
            onAuthenticated={() => window.location.reload()}
          />
        </div>
      )}
      {player && house && !publishedHouse && (
        <div className="modal-backdrop">
          <section className="modal" aria-label="Course preview">
            <button
              className="close"
              onClick={() => setHouse(null)}
              aria-label="Close course preview"
            >
              ×
            </button>
            <span className="eyebrow">
              COURSE HOUSE ·{" "}
              {house === "MODEL MAKERS" ? "OPEN DOOR" : "COMING SOON"}
            </span>
            <h2>
              {house === "MODEL MAKERS"
                ? "Model Makers Workshop"
                : house.replaceAll("_", " ")}
            </h2>
            <p>
              {house === "MODEL MAKERS"
                ? "Your first step toward training a small storytelling model from scratch. Start with three foundational concepts."
                : "This house is part of the city preview. Its course adventure is not yet available."}
            </p>
            <div className="detail-row">
              <span>◷ 3 questions</span>
              <span>✦ Up to 60 points</span>
              <span>◎ Authored tasks</span>
            </div>
            {house === "MODEL MAKERS" && (
              <>
                <ul className="objectives">
                  <li>Understand token IDs</li>
                  <li>Recognize held-out evaluation</li>
                  <li>Know what “from scratch” means</li>
                </ul>
                <div className="mock-note">
                  MOCK CLASSIFIER · Recorded responses are assessed only after
                  level clearance. No OpenRouter calls.
                </div>
                <button className="primary" disabled={busy} onClick={begin}>
                  Enter course adventure <Icon name="arrow" />
                </button>
              </>
            )}
          </section>
        </div>
      )}
      {player && tab === "learn" && !house && (
        <div className="modal-backdrop">
          <section className="modal learning" aria-label="Learning checkpoint">
            <button
              className="close"
              onClick={() => setTab("explore")}
              aria-label="Return to city"
            >
              ×
            </button>
            <span className="eyebrow">MODEL MAKERS · FOUNDATIONS</span>
            {q && !cleared ? (
              <>
                <div className="progress-track">
                  <span style={{ width: ((index + 1) / 3) * 100 + "%" }} />
                </div>
                <span className="question-count">
                  QUESTION {index + 1} OF 3 · RESPONSES RECORDED, NOT YET
                  CLASSIFIED
                </span>
                <h2>{q.prompt}</h2>
                <div className="answers">
                  {q.options.map((o, i) => (
                    <button
                      key={o}
                      aria-pressed={answer === i}
                      className={answer === i ? "chosen" : ""}
                      onClick={() => setAnswer(i)}
                    >
                      <span>{String.fromCharCode(65 + i)}</span>
                      {o}
                    </button>
                  ))}
                </div>
                {help && (
                  <p className="help-box">
                    {help}{" "}
                    <small>
                      Assistance recorded. This answer cannot count as
                      independent mastery.
                    </small>
                  </p>
                )}
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() =>
                    action(async () => {
                      const d = await api<{ explanation: string }>(
                        "/attempts/" + attempt!.id + "/help",
                        { questionId: q.id },
                      );
                      setHelp(d.explanation);
                    })
                  }
                >
                  Show tutor-authored explanation
                </button>
                <button
                  className="primary"
                  disabled={busy || answer === null}
                  onClick={submit}
                >
                  {index === 2
                    ? "Clear the level"
                    : "Record response & continue"}{" "}
                  <span>→</span>
                </button>
              </>
            ) : cleared ? (
              <>
                <h2>
                  Level cleared.
                  <br />
                  <em>Time to reflect.</em>
                </h2>
                <p>
                  Your three response chunks are stored. Now the mock classifier
                  can assess the evidence and select your next learning route.
                </p>
                <div className="mock-note">
                  This is the level boundary. No classification ran during the
                  questions.
                </div>
                <button className="primary" disabled={busy} onClick={classify}>
                  Run mock classification <Icon name="arrow" />
                </button>
              </>
            ) : result ? (
              <>
                <h2>
                  {result.route === "advance"
                    ? "A new door opens."
                    : "Every step teaches you."}
                </h2>
                <p>{result.reason}</p>
                <div className="result-stats">
                  <div>
                    <strong>{result.independent}/3</strong>
                    <span>Independent concepts</span>
                  </div>
                  <div>
                    <strong>+{result.points}</strong>
                    <span>Points awarded</span>
                  </div>
                </div>
                <div className="assessment-list">
                  {result.assessments.map((a) => (
                    <div key={a.questionId}>
                      <span>{a.concept}</span>
                      <b>{a.assisted ? "Assisted practice" : a.outcome}</b>
                    </div>
                  ))}
                </div>
                <div className="next-route">
                  <span>NEXT ROUTE · MOCK DECISION</span>
                  <strong>{result.nextLevel}</strong>
                  <small>
                    FSRS review: {new Date(result.nextReview).toLocaleString()}
                  </small>
                </div>
                <div className="mock-note">
                  The next route is a recommendation preview. Later course
                  levels and model training are not implemented in Step 01.
                </div>
                <button className="primary" onClick={begin} disabled={busy}>
                  Practice foundations again <Icon name="arrow" />
                </button>
              </>
            ) : (
              <>
                <h2>
                  Your learning
                  <br />
                  <em>journey awaits.</em>
                </h2>
                <p>
                  Start the Model Makers foundations checkpoint and make your
                  first step count.
                </p>
                <button className="primary" disabled={busy} onClick={begin}>
                  Start foundations <Icon name="arrow" />
                </button>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
