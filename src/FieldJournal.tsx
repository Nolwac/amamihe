import { useEffect, useState } from "react";
import type { CourseResource } from "../shared/course";
import PracticeTool from "./PracticeTool";
import { useAccess, useVoiceCommands } from "./Access";
import SourceEvidence from "./SourceEvidence";
export default function FieldJournal({
  resource,
  playerId,
  courseId,
  deliveryId,
  onClose,
  onStudy,
  onChallenge,
  onPractice,
  language = "en",
  version,
}: {
  resource: CourseResource;
  playerId: string;
  courseId: string;
  deliveryId?: string;
  onClose: () => void;
  onStudy: () => Promise<void>;
  onChallenge: () => void;
  onPractice: () => Promise<void>;
  language?: string;
  version?: number;
}) {
  const { preferences, t, speak, announce, stopSpeech } = useAccess();
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
    stopSpeech();
    return stopSpeech;
  }, [pageKey, page, stopSpeech]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useVoiceCommands((command, respond) => {
    if (command.kind === "next" || command.kind === "previous") {
      const next = Math.max(
        0,
        Math.min(pages.length - 1, page + (command.kind === "next" ? 1 : -1)),
      );
      setPage(next);
      respond(
        resource.title + `. ${next + 1} / ${pages.length}. ` + pages[next],
        language,
      );
      return true;
    }
    if (command.kind === "read") {
      respond(resource.title + ". " + pages[page], language);
      return true;
    }
    if (command.kind === "where") {
      respond(resource.title + `. ${page + 1} / ${pages.length}.`, language);
      return true;
    }
    return false;
  }, 30);
  useEffect(() => {
    if (preferences.narration)
      announce(resource.title + ". " + pages[page], language);
  }, [resource.id, page, preferences.narration]);
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
        aria-label={t("Close field journal")}
        onClick={onClose}
      >
        ×
      </button>
      <span className="eyebrow">
        {resource.kind === "reading"
          ? "FIELD JOURNAL · INVESTIGATE"
          : "WORLD WORKSTATION"}
      </span>
      <h2 lang={language}>{resource.title}</h2>
      <p className="journal-mission">
        Investigate this station, then use what you discover at the next
        challenge. Your adventure is paused while you study.
      </p>
      <pre
        className="journal-page"
        lang={language}
        dir={language.startsWith("ar") ? "rtl" : "ltr"}
      >
        {pages[page]}
      </pre>
      <nav aria-label="Journal pages">
        <button disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
          {t("Previous page")}
        </button>
        <span>
          {page + 1} / {pages.length}
        </span>
        <button
          disabled={page === pages.length - 1}
          onClick={() => setPage((p) => p + 1)}
        >
          {t("Next page")}
        </button>
      </nav>
      {
        <button
          onClick={() => {
            speak(pages[page], language);
          }}
        >
          {t("Listen to this page")}
        </button>
      }
      <button disabled={busy} onClick={() => void recordStudy()}>
        {t("Record field study")}
      </button>
      <button disabled={busy} onClick={() => void recordStudy(true)}>
        {t("Put this discovery to work")}
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
      <SourceEvidence
        resource={resource}
        courseId={courseId}
        version={version}
      />
      <small>
        Reading is preparation. Explain, predict or build at the challenge to
        demonstrate understanding.
      </small>
    </aside>
  );
}
