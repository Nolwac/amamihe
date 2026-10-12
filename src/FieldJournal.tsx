import { useEffect, useState } from "react";
import type { CourseResource } from "../shared/course";
import PracticeTool from "./PracticeTool";

export default function FieldJournal({
  resource,
  playerId,
  courseId,
  deliveryId,
  onClose,
  onStudy,
  onChallenge,
  onPractice,
}: {
  resource: CourseResource;
  playerId: string;
  courseId: string;
  deliveryId?: string;
  onClose: () => void;
  onStudy: () => Promise<void>;
  onChallenge: () => void;
  onPractice: () => Promise<void>;
}) {
  // No generated teaching text: page breaks retain the complete authored resource.
  const pages = resource.content.match(
    /[\s\S]{1,700}(?:\s|$)|[\s\S]{1,700}/g,
  ) || [""];
  const pageKey = `amamihe-journal-page:${playerId}:${courseId}:${resource.id}`;
  const [page, setPage] = useState(() => {
    try {
      const saved = Number(localStorage.getItem(pageKey));
      return Number.isInteger(saved)
        ? Math.max(0, Math.min(pages.length - 1, saved))
        : 0;
    } catch {
      return 0;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(pageKey, String(page));
    } catch {
      /* Device storage optional. */
    }
    window.speechSynthesis?.cancel();
  }, [pageKey, page]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function recordStudy(challenge = false) {
    setBusy(true);
    try {
      await onStudy();
      setMessage("Field study saved. Apply this discovery in your challenge.");
      if (challenge) onChallenge();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not save study.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside
      className="field-journal"
      aria-label={"Field journal: " + resource.title}
    >
      <button
        className="journal-close"
        aria-label="Close field journal"
        onClick={onClose}
      >
        ×
      </button>
      <span className="eyebrow">
        {resource.kind === "reading"
          ? "FIELD JOURNAL · INVESTIGATE"
          : "WORLD WORKSTATION"}
      </span>
      <h2>{resource.title}</h2>
      <p className="journal-mission">
        Investigate this station, then use what you discover at the next
        challenge. Your adventure is paused while you study.
      </p>
      <pre className="journal-page">{pages[page]}</pre>
      <nav aria-label="Journal pages">
        <button disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
          Previous page
        </button>
        <span>
          {page + 1} / {pages.length}
        </span>
        <button
          disabled={page === pages.length - 1}
          onClick={() => setPage((p) => p + 1)}
        >
          Next page
        </button>
      </nav>
      {"speechSynthesis" in window && (
        <button
          onClick={() => {
            window.speechSynthesis.cancel();
            window.speechSynthesis.speak(
              new SpeechSynthesisUtterance(pages[page]),
            );
          }}
        >
          Listen to this page
        </button>
      )}
      <button disabled={busy} onClick={() => void recordStudy()}>
        Record field study
      </button>
      <button disabled={busy} onClick={() => void recordStudy(true)}>
        Put this discovery to work
      </button>
      {message && <p role="status">{message}</p>}
      <PracticeTool
        playerId={playerId}
        resource={resource}
        courseId={courseId}
        deliveryId={deliveryId}
        onOpen={onPractice}
      />
      {resource.url && (
        <a href={resource.url} target="_blank" rel="noopener noreferrer">
          Open resource ↗
        </a>
      )}
      <a href={resource.source} target="_blank" rel="noopener noreferrer">
        Source & attribution ↗
      </a>
      <small>
        Reading is preparation. Explain, predict or build at the challenge to
        demonstrate understanding.
      </small>
    </aside>
  );
}
