import { useState } from "react";
type Report = {
  id: string;
  version: number;
  resource_id: string;
  description: string;
  resolved: boolean;
  response: string;
};
export default function MaterialReports({ courseId }: { courseId: string }) {
  const [reports, setReports] = useState<Report[]>([]),
    [message, setMessage] = useState("");
  async function load() {
    const r = await fetch(
      `/api/studio/courses/${encodeURIComponent(courseId)}/material-reports`,
      { cache: "no-store" },
    );
    const value = await r.json();
    if (!r.ok) throw new Error(value.error);
    setReports(value.reports);
  }
  return (
    <details
      lang="en"
      onToggle={(e) => {
        if (e.currentTarget.open)
          void load().catch((e) => setMessage(e.message));
      }}
    >
      <summary>Material correction reports</summary>
      {reports.map((report) => (
        <article key={report.id}>
          <p>
            Version {report.version} · {report.resource_id}
          </p>
          <p>{report.description}</p>
          {report.resolved ? (
            <p>Publisher response: {report.response}</p>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const response = String(
                  new FormData(form).get("response") || "",
                );
                void fetch(
                  `/api/studio/courses/${encodeURIComponent(courseId)}/material-reports/${report.id}/resolve`,
                  {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ response }),
                  },
                )
                  .then(async (r) => {
                    const body = await r.json();
                    if (!r.ok) throw new Error(body.error);
                    await load();
                  })
                  .catch((e) => setMessage(e.message));
              }}
            >
              <label>
                Correction or review response
                <textarea
                  name="response"
                  required
                  minLength={10}
                  maxLength={1000}
                />
              </label>
              <button>Record publisher review</button>
            </form>
          )}
        </article>
      ))}
      {!reports.length && <p>No material reports for this course.</p>}
      {message && <p role="status">{message}</p>}
    </details>
  );
}
