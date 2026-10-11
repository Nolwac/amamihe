import { useEffect, useRef, useState } from "react";
import type { CourseResource } from "../shared/course";
import {
  approvedEmbed,
  notebookDocument,
  type PracticeAttempt,
} from "../shared/practice";
async function call(path: string, body: unknown) {
  const r = await fetch("/api/practice/" + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error);
  return data;
}
export default function PracticeTool({
  resource,
  courseId,
  deliveryId,
}: {
  resource: CourseResource;
  courseId: string;
  deliveryId?: string;
}) {
  const [attempt, setAttempt] = useState<PracticeAttempt | null>(null),
    [message, setMessage] = useState(""),
    [code, setCode] = useState(
      resource.kind === "javascript" ? resource.content : "",
    ),
    [output, setOutput] = useState(""),
    [busy, setBusy] = useState(false),
    [points, setPoints] = useState<number[][]>([]),
    [notebookEvidence, setNotebookEvidence] = useState("");
  const frame = useRef<HTMLIFrameElement>(null);
  const nonce = useRef(crypto.randomUUID());
  const timer = useRef<number | undefined>(undefined);
  const workerSource = `self.onmessage=async e=>{try{const result=await (new Function(e.data))();self.postMessage({output:String(result).slice(0,4000)});}catch(error){self.postMessage({output:'Error: '+String(error).slice(0,1000)});}}`;
  const document = `<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' blob:; worker-src blob:; connect-src 'none'; img-src 'none'"><script>let worker;addEventListener('message',e=>{if(e.source!==parent||e.data.token!==${JSON.stringify(nonce.current)})return;worker?.terminate();worker=new Worker(URL.createObjectURL(new Blob([${JSON.stringify(workerSource)}],{type:'text/javascript'})));worker.onmessage=m=>{parent.postMessage({token:${JSON.stringify(nonce.current)},output:m.data.output},'*');worker.terminate();};worker.postMessage(e.data.code);});</script>`;
  useEffect(() => {
    const receive = (e: MessageEvent) => {
      if (
        e.source !== frame.current?.contentWindow ||
        e.origin !== "null" ||
        e.data?.token !== nonce.current ||
        typeof e.data.output !== "string"
      )
        return;
      clearTimeout(timer.current);
      setOutput(e.data.output.slice(0, 4000));
      setBusy(false);
    };
    window.addEventListener("message", receive);
    return () => {
      window.removeEventListener("message", receive);
      clearTimeout(timer.current);
    };
  }, []);
  async function start() {
    setMessage("");
    try {
      setAttempt(
        await call(courseId + "/start", {
          resourceId: resource.id,
          deliveryId,
        }),
      );
    } catch (e) {
      setMessage(String(e));
    }
  }
  async function submit() {
    if (!attempt) return;
    setBusy(true);
    try {
      const evidence =
        resource.kind === "javascript"
          ? { code, output }
          : resource.kind === "drawing"
            ? { points }
            : JSON.parse(notebookEvidence);
      await call(attempt.id + "/submit", { evidence });
      setMessage(
        "Practice saved as unverified evidence. Course criteria and points are unchanged.",
      );
    } catch (e) {
      setMessage(String(e));
    } finally {
      setBusy(false);
    }
  }
  function download() {
    const raw = resource.content;
    const offset = raw.indexOf("# A small decoder");
    const blob = new Blob(
      [
        JSON.stringify(
          notebookDocument(offset >= 0 ? raw.slice(offset) : raw),
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const a = window.document.createElement("a");
    a.href = url;
    a.download = "amamihe-story-model.ipynb";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  if (resource.kind === "video" && approvedEmbed(resource.url))
    return (
      <section>
        <iframe
          title={resource.title}
          src={approvedEmbed(resource.url)!}
          sandbox="allow-scripts allow-same-origin allow-presentation"
          loading="lazy"
          referrerPolicy="no-referrer"
          style={{ width: "100%", height: 220, border: 0 }}
        />
        <p>
          If playback is blocked or unavailable, use Open resource to launch
          outside the game. Connectivity is required.
        </p>
      </section>
    );
  if (!["javascript", "drawing", "notebook"].includes(resource.kind))
    return null;
  return (
    <section
      aria-label={"Practice: " + resource.title}
      className="practice-tool"
    >
      {!attempt ? (
        <button disabled={!deliveryId} onClick={() => void start()}>
          Open practice
        </button>
      ) : (
        <>
          <p>
            Practice checkpoint saved. This tool does not automatically grant
            mastery.
          </p>
          {resource.kind === "javascript" && (
            <>
              <label>
                JavaScript workspace
                <textarea
                  aria-label="JavaScript workspace"
                  value={code}
                  maxLength={4000}
                  onChange={(e) => setCode(e.target.value)}
                />
              </label>
              <iframe
                ref={frame}
                title="Isolated JavaScript worker"
                sandbox="allow-scripts"
                srcDoc={document}
                hidden
              />
              <button
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  setOutput("");
                  frame.current?.contentWindow?.postMessage(
                    { token: nonce.current, code },
                    "*",
                  );
                  timer.current = window.setTimeout(() => {
                    setBusy(false);
                    setOutput("Execution timed out.");
                    if (frame.current) frame.current.srcdoc = document;
                  }, 1000);
                }}
              >
                Run code
              </button>
              <pre role="status">{output}</pre>
              <small>
                One-second execution limit. No network, account access, or
                game-page DOM.
              </small>
            </>
          )}
          {resource.kind === "drawing" && (
            <>
              <svg
                aria-label="Drawing workspace"
                role="img"
                viewBox="0 0 300 180"
                style={{
                  width: "100%",
                  background: "#fff",
                  touchAction: "none",
                }}
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId);
                  const r = e.currentTarget.getBoundingClientRect();
                  setPoints((p) =>
                    p.length < 500
                      ? [
                          ...p,
                          [
                            Math.max(
                              0,
                              Math.min(1, (e.clientX - r.left) / r.width),
                            ),
                            Math.max(
                              0,
                              Math.min(1, (e.clientY - r.top) / r.height),
                            ),
                          ],
                        ]
                      : p,
                  );
                }}
                onPointerMove={(e) => {
                  if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
                  const r = e.currentTarget.getBoundingClientRect();
                  setPoints((p) =>
                    p.length < 500
                      ? [
                          ...p,
                          [
                            Math.max(
                              0,
                              Math.min(1, (e.clientX - r.left) / r.width),
                            ),
                            Math.max(
                              0,
                              Math.min(1, (e.clientY - r.top) / r.height),
                            ),
                          ],
                        ]
                      : p,
                  );
                }}
              >
                <polyline
                  fill="none"
                  stroke="#173e3c"
                  strokeWidth="3"
                  points={points
                    .map((p) => p[0] * 300 + "," + p[1] * 180)
                    .join(" ")}
                />
              </svg>
              <button onClick={() => setPoints([])}>Clear drawing</button>
              <button
                onClick={() =>
                  setPoints((p) => (p.length < 500 ? [...p, [0.5, 0.5]] : p))
                }
              >
                Add center point with keyboard
              </button>
            </>
          )}
          {resource.kind === "notebook" && (
            <>
              <button onClick={download}>Download training notebook</button>
              <p>
                Launch a free runtime if available, upload this notebook and a
                rights-cleared corpus.jsonl, then return here. Account
                requirements and quotas apply; no paid fallback.
              </p>
              <a
                href="https://colab.research.google.com/"
                target="_blank"
                rel="noopener noreferrer"
              >
                Open Colab
              </a>
              {" · "}
              <a
                href="https://www.kaggle.com/code"
                target="_blank"
                rel="noopener noreferrer"
              >
                Open Kaggle Notebooks
              </a>
              <label>
                Training evidence JSON
                <textarea
                  aria-label="Training evidence JSON"
                  maxLength={8000}
                  placeholder={
                    '{"parameters":1040768,"steps":20,"heldoutLoss":5.2,"checkpoint":"story-model.pt"}'
                  }
                  value={notebookEvidence}
                  onChange={(e) => setNotebookEvidence(e.target.value)}
                />
              </label>
              <small>
                Imported results are learner-reported, not authenticated proof
                of remote execution.
              </small>
            </>
          )}
          <button disabled={busy} onClick={() => void submit()}>
            Save practice evidence
          </button>
        </>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
