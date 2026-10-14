import { useState } from "react";
import type { CourseResource } from "../shared/course";
import { useAccess } from "./Access";
export default function SourceEvidence({
  resource,
  courseId,
  version,
}: {
  resource: CourseResource;
  courseId: string;
  version?: number;
}) {
  const { t } = useAccess();
  const [open, setOpen] = useState(false),
    [description, setDescription] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  let source = "";
  try {
    source = new URL(resource.source).hostname;
  } catch {
    /* Publication validation normally prevents invalid sources. */
  }
  return (
    <section className="source-evidence" aria-label={t("Source & attribution")}>
      <p>
        <a href={resource.source} target="_blank" rel="noopener noreferrer">
          {t("Source & attribution")}: {source}
        </a>
      </p>
      {resource.review && (
        <p lang="en">
          Publisher review: {resource.review.reviewer} · {resource.review.date}.{" "}
          {resource.review.note}
        </p>
      )}
      <p lang="en">
        This link identifies the publisher's reference. Original activities are
        authored by the course publisher; a source link does not imply
        independent endorsement.
      </p>
      {version && (
        <>
          <button onClick={() => setOpen(!open)} aria-expanded={open}>
            {t("Report a material error")}
          </button>
          {open && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setBusy(true);
                setMessage("");
                void fetch(
                  `/api/courses/${encodeURIComponent(courseId)}/material-report`,
                  {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      version,
                      resourceId: resource.id,
                      description,
                    }),
                  },
                )
                  .then(async (r) => {
                    const result = await r.json();
                    if (!r.ok) throw new Error(result.error);
                    setMessage(
                      t(
                        "Report saved for the course publisher. It does not change your grade.",
                      ),
                    );
                    setDescription("");
                  })
                  .catch((e) => setMessage(e.message))
                  .finally(() => setBusy(false));
              }}
            >
              <label>
                {t("Correction details")}
                <textarea
                  value={description}
                  minLength={10}
                  maxLength={2000}
                  required
                  onChange={(e) => setDescription(e.target.value)}
                />
              </label>
              <button disabled={busy}>{t("Send correction report")}</button>
            </form>
          )}
        </>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
