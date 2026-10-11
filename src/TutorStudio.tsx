import { useEffect, useRef, useState, type ReactNode } from "react";
import type {
  CourseConcept,
  CourseDefinition,
  CourseDraft,
  CourseLevel,
  CourseQuestion,
  CourseResource,
} from "../shared/course";
import "./studio.css";

type Issue = { path: string; message: string };
type StudioProps = {
  onClose: () => void;
  onPublished: (courseId: string) => void;
  renderScene?: (theme: CourseLevel["theme"]) => ReactNode;
};
type Editor =
  | { kind: "resource"; resource: CourseResource }
  | {
      kind: "question";
      question: CourseQuestion;
      bank: "questions" | "retryQuestions";
      levelId: string;
    }
  | null;
const presets: {
  id: CourseLevel["theme"];
  title: string;
  icon: string;
  description: string;
}[] = [
  {
    id: "workshop",
    title: "Workshop",
    icon: "◇",
    description: "A calm space to explore and practice.",
  },
  {
    id: "temple-chase",
    title: "Temple chase",
    icon: "△",
    description: "Learning checkpoints along an escape route.",
  },
  {
    id: "racing",
    title: "Racing",
    icon: "⚑",
    description: "Learning checkpoints on the racing circuit.",
  },
  {
    id: "wrestling",
    title: "Wrestling",
    icon: "✦",
    description: "Learning checkpoints in the arena.",
  },
];
function newId(prefix: string) {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}
function safeUrl(value: string) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      url.hostname.includes(".") &&
      !url.hostname.endsWith(".local") &&
      !url.hostname.endsWith(".localhost") &&
      !/^[\d.]+$/.test(url.hostname) &&
      !url.hostname.includes(":")
    );
  } catch {
    return false;
  }
}
class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
async function request<T>(
  url: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await fetch(`/api/studio/courses${url}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new ApiError(
      response.status,
      response.status === 409
        ? "A newer draft was saved in another session. Your edits are still here. Copy anything you need, then reload the saved draft before editing again."
        : data.error ||
            "The studio could not complete this request. Your draft is still here.",
    );
  }
  return data as T;
}
function Label({ title, children }: { title: string; children: ReactNode }) {
  return (
    <label className="studio-field">
      <span>{title}</span>
      {children}
    </label>
  );
}
function Dialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const node = dialog.current;
    node?.showModal();
    return () => node?.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="studio-dialog"
      onCancel={onClose}
      aria-label={title}
    >
      <div className="studio-dialog-heading">
        <div>
          <span className="studio-eyebrow">TUTOR WORKBENCH</span>
          <h2>{title}</h2>
        </div>
        <button
          className="studio-icon-button"
          onClick={onClose}
          aria-label="Close editor"
        >
          ×
        </button>
      </div>
      {children}
    </dialog>
  );
}
function ResourceEditor({
  initial,
  onSave,
  onClose,
}: {
  initial: CourseResource;
  onSave: (resource: CourseResource) => void;
  onClose: () => void;
}) {
  const [resource, setResource] = useState(initial);
  const [importError, setImportError] = useState("");
  const [importing, setImporting] = useState(false);
  const patch = (value: Partial<CourseResource>) =>
    setResource((previous) => ({ ...previous, ...value }));
  return (
    <Dialog title="Learning resource" onClose={onClose}>
      <p className="studio-muted">
        Add the material learners will actually read or open. Record its
        original, credible source.
      </p>
      <Label title="Resource title">
        <input
          value={resource.title}
          onChange={(event) => patch({ title: event.target.value })}
        />
      </Label>
      <Label title="Resource type">
        <select
          value={resource.kind}
          onChange={(event) =>
            patch({ kind: event.target.value as CourseResource["kind"] })
          }
        >
          <option value="reading">Reading / explainer</option>
          <option value="video">Video</option>
          <option value="notebook">Notebook</option>
          <option value="javascript">JavaScript environment</option>
          <option value="drawing">Drawing canvas</option>
        </select>
      </Label>
      <Label title="Authored content">
        <textarea
          rows={7}
          value={resource.content}
          placeholder="Write or paste your learning material here."
          onChange={(event) => patch({ content: event.target.value })}
        />
      </Label>
      <Label title="Import resource file">
        <input
          type="file"
          accept=".md,.txt,.py,.js,.ipynb"
          disabled={importing}
          onChange={async (event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            setImportError("");
            if (
              !/\.(md|txt|py|js|ipynb)$/i.test(file.name) ||
              file.size > 240000
            ) {
              setImportError(
                "Choose a Markdown, text, Python, JavaScript, or notebook file up to 240 KB and 60,000 characters.",
              );
              return;
            }
            setImporting(true);
            try {
              const content = await file.text();
              if (content.length > 60000 || content.includes("\0")) {
                setImportError(
                  "Use a text resource of at most 60,000 characters. Binary files are not supported.",
                );
                return;
              }
              patch({
                content,
                title: resource.title || file.name.replace(/\.[^.]+$/, ""),
                kind: /\.ipynb$/i.test(file.name)
                  ? "notebook"
                  : /\.js$/i.test(file.name)
                    ? "javascript"
                    : resource.kind,
              });
            } catch {
              setImportError(
                "The file could not be read. Try another file or paste its text.",
              );
            } finally {
              setImporting(false);
            }
          }}
        />
      </Label>
      {importError && (
        <p className="studio-import-error" role="alert">
          {importError}
        </p>
      )}
      <p className="studio-small">
        Imported text replaces the content above and is saved with the course.
        Use HTTPS links for images and videos; binary uploads are not available
        yet. Code is displayed as text and is never executed in the studio.
      </p>
      <Label title="Resource URL (optional with inline content)">
        <input
          type="url"
          value={resource.url}
          placeholder="https://…"
          onChange={(event) => patch({ url: event.target.value })}
        />
      </Label>
      <Label title="Credible source URL">
        <input
          type="url"
          value={resource.source}
          placeholder="https://…"
          onChange={(event) => patch({ source: event.target.value })}
        />
      </Label>
      <p className="studio-small">
        JavaScript and drawing resources open in isolated practice tools during
        the adventure. Notebook resources support download and launch/return.
        External runtime access may require an account.
      </p>
      <div className="studio-dialog-actions">
        <button onClick={onClose}>Cancel</button>
        <button
          className="studio-primary"
          disabled={importing}
          onClick={() => onSave(resource)}
        >
          Keep resource
        </button>
      </div>
    </Dialog>
  );
}
function QuestionEditor({
  initial,
  retry,
  primaryQuestions,
  onSave,
  onClose,
}: {
  initial: CourseQuestion;
  retry: boolean;
  primaryQuestions: CourseQuestion[];
  onSave: (question: CourseQuestion) => void;
  onClose: () => void;
}) {
  const [question, setQuestion] = useState(initial);
  const patch = (value: Partial<CourseQuestion>) =>
    setQuestion((previous) => ({ ...previous, ...value }));
  return (
    <Dialog title={retry ? "Retry task" : "Checkpoint task"} onClose={onClose}>
      <p className="studio-muted">
        Write the task, answer key, and support yourself. The classifier selects
        authored tasks; it does not generate teaching material.
      </p>
      {retry && (
        <>
          <Label title="Retry criterion">
            <select
              value={question.retryFor || ""}
              onChange={(event) => patch({ retryFor: event.target.value })}
            >
              <option value="">
                Choose the checkpoint this task reassesses
              </option>
              {primaryQuestions.map((primary, index) => (
                <option key={primary.id} value={primary.id}>
                  {index + 1}. {primary.prompt || "Untitled checkpoint"}
                </option>
              ))}
            </select>
          </Label>
          <p className="studio-small">
            Link each retry to the specific checkpoint it reassesses. Every
            checkpoint needs an authored retry; repeated answers to one
            criterion cannot clear the whole level.
          </p>
        </>
      )}
      <Label title="Question prompt">
        <textarea
          rows={3}
          value={question.prompt}
          onChange={(event) => patch({ prompt: event.target.value })}
        />
      </Label>
      <div className="studio-field">
        <span>Answer choices · select the correct answer</span>
        {question.options.map((option, index) => (
          <div className="studio-answer-editor" key={index}>
            <input
              type="radio"
              name="correct-answer"
              aria-label={`Choice ${index + 1} is correct`}
              checked={question.answer === index}
              onChange={() => patch({ answer: index })}
            />
            <input
              value={option}
              aria-label={`Choice ${index + 1}`}
              placeholder={`Choice ${index + 1}`}
              onChange={(event) =>
                patch({
                  options: question.options.map((value, at) =>
                    at === index ? event.target.value : value,
                  ),
                })
              }
            />
            <button
              className="studio-icon-button"
              aria-label={`Remove choice ${index + 1}`}
              disabled={question.options.length <= 2}
              onClick={() =>
                patch({
                  options: question.options.filter((_, at) => at !== index),
                  answer:
                    question.answer === index
                      ? 0
                      : question.answer > index
                        ? question.answer - 1
                        : question.answer,
                })
              }
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <button
        className="studio-link"
        disabled={question.options.length >= 8}
        onClick={() => patch({ options: [...question.options, ""] })}
      >
        + Add answer choice
      </button>
      <Label title="Hint">
        <textarea
          rows={2}
          value={question.hint}
          onChange={(event) => patch({ hint: event.target.value })}
        />
      </Label>
      <Label title="Answer explanation">
        <textarea
          rows={3}
          value={question.explanation}
          onChange={(event) => patch({ explanation: event.target.value })}
        />
      </Label>
      <Label title="Assessment rubric">
        <textarea
          rows={2}
          value={question.rubric}
          placeholder="Describe the evidence this task should demonstrate."
          onChange={(event) => patch({ rubric: event.target.value })}
        />
      </Label>
      <div className="studio-dialog-actions">
        <button onClick={onClose}>Cancel</button>
        <button className="studio-primary" onClick={() => onSave(question)}>
          Keep task
        </button>
      </div>
    </Dialog>
  );
}
function LearnerPreview({
  definition,
  initialLevel,
  renderScene,
}: {
  definition: CourseDefinition;
  initialLevel: string | null;
  renderScene?: StudioProps["renderScene"];
}) {
  const [levelId, setLevelId] = useState(
    initialLevel || definition.levels[0]?.id || "",
  );
  const level =
    definition.levels.find((item) => item.id === levelId) ||
    definition.levels[0];
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answer, setAnswer] = useState<number | null>(null);
  const [checked, setChecked] = useState(false);
  const [hint, setHint] = useState(false);
  const [bank, setBank] = useState<"questions" | "retryQuestions">("questions");
  const question = level?.[bank][questionIndex];
  const reset = () => {
    setQuestionIndex(0);
    setAnswer(null);
    setChecked(false);
    setHint(false);
  };
  if (!level)
    return (
      <div className="studio-empty">
        <span>◇</span>
        <h2>Build your first level</h2>
        <p>
          Add a level and authored tasks to preview the learning experience.
        </p>
      </div>
    );
  return (
    <div className="studio-preview">
      <div className="studio-preview-ribbon">
        <span>LEARNER PREVIEW</span>
        <strong>No progress or rewards are recorded</strong>
      </div>
      <Label title="Preview level">
        <select
          value={level.id}
          onChange={(event) => {
            setLevelId(event.target.value);
            reset();
          }}
        >
          {definition.levels.map((item, index) => (
            <option key={item.id} value={item.id}>
              {index + 1}. {item.title || "Untitled level"}
            </option>
          ))}
        </select>
      </Label>
      <div className={`studio-scene studio-theme-${level.theme}`}>
        {renderScene ? (
          renderScene(level.theme)
        ) : (
          <div className="studio-storyboard" aria-hidden="true">
            <div className="studio-scene-sun" />
            <div className="studio-scene-mountain" />
            <div className="studio-scene-track" />
            <div className="studio-scene-gate">
              <span>
                {presets.find((preset) => preset.id === level.theme)?.icon}
              </span>
            </div>
            <div className="studio-scene-avatar">♟</div>
          </div>
        )}
        <div className="studio-scene-caption">
          <span>
            {presets.find((preset) => preset.id === level.theme)?.title} preset
          </span>
          <h2>{level.title || "Untitled level"}</h2>
          <div>
            <span>
              {level.timeLimitSeconds
                ? `${level.timeLimitSeconds}s authored time budget`
                : "Untimed"}
            </span>
            <span>{level.points} practice points</span>
          </div>
        </div>
      </div>
      <p className="studio-small">
        Preset scenery preview. Timed chase, racing, and wrestling action
        bindings are scheduled for the adventure-engine milestone.
      </p>
      <section className="studio-preview-material">
        <h3>Before you play</h3>
        {level.resourceIds.length === 0 && (
          <p className="studio-muted">
            Attach learning resources to this level.
          </p>
        )}
        {level.resourceIds.map((resourceId) => {
          const resource = definition.resources.find(
            (item) => item.id === resourceId,
          );
          return resource ? (
            <article key={resource.id}>
              <div className="studio-resource-heading">
                <span className="studio-resource-glyph">▤</span>
                <div>
                  <span className="studio-eyebrow">{resource.kind}</span>
                  <h4>{resource.title || "Untitled resource"}</h4>
                </div>
              </div>
              {resource.content && (
                <p className="studio-authored-content">{resource.content}</p>
              )}
              {safeUrl(resource.url) && (
                <a
                  href={resource.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="studio-link"
                >
                  Open resource ↗
                </a>
              )}
              {safeUrl(resource.source) && (
                <a
                  href={resource.source}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="studio-source"
                >
                  View source ↗
                </a>
              )}
            </article>
          ) : (
            <p key={resourceId} className="studio-error">
              Missing resource: {resourceId}
            </p>
          );
        })}
      </section>
      <section className="studio-preview-question">
        <div className="studio-section-heading">
          <h3>Try an authored task</h3>
          <select
            aria-label="Preview task bank"
            value={bank}
            onChange={(event) => {
              setBank(event.target.value as typeof bank);
              reset();
            }}
          >
            <option value="questions">Checkpoints</option>
            <option value="retryQuestions">Retry tasks</option>
          </select>
        </div>
        {question ? (
          <>
            <span className="studio-eyebrow">
              TASK {questionIndex + 1} / {level[bank].length}
            </span>
            <h4>{question.prompt || "Add a question prompt"}</h4>
            <div className="studio-preview-options">
              {question.options.map((option, index) => (
                <button
                  key={index}
                  aria-pressed={answer === index}
                  className={answer === index ? "selected" : ""}
                  disabled={checked}
                  onClick={() => setAnswer(index)}
                >
                  <span>{String.fromCharCode(65 + index)}</span>
                  {option || "Empty answer choice"}
                </button>
              ))}
            </div>
            {hint && (
              <div className="studio-hint">
                {question.hint || "This task has no authored hint."}
              </div>
            )}
            {checked && (
              <div
                className={`studio-feedback ${answer === question.answer ? "success" : ""}`}
                role="status"
              >
                <strong>
                  {answer === question.answer
                    ? "Correct answer"
                    : "Try this idea again"}
                </strong>
                <p>
                  {question.explanation ||
                    "Add an explanation in the task editor."}
                </p>
              </div>
            )}
            <div className="studio-preview-actions">
              <button onClick={() => setHint(!hint)}>
                {hint ? "Hide hint" : "Show hint"}
              </button>
              {checked ? (
                <button
                  className="studio-primary"
                  onClick={() => {
                    setQuestionIndex((questionIndex + 1) % level[bank].length);
                    setAnswer(null);
                    setChecked(false);
                    setHint(false);
                  }}
                >
                  {questionIndex + 1 < level[bank].length
                    ? "Next preview task"
                    : "Restart preview"}
                </button>
              ) : (
                <button
                  className="studio-primary"
                  disabled={answer === null}
                  onClick={() => setChecked(true)}
                >
                  Check preview answer
                </button>
              )}
            </div>
          </>
        ) : (
          <p className="studio-muted">No authored tasks in this bank yet.</p>
        )}
      </section>
    </div>
  );
}

export default function TutorStudio({
  onClose,
  onPublished,
  renderScene,
}: StudioProps) {
  const [courses, setCourses] = useState<CourseDraft[]>([]);
  const [draft, setDraft] = useState<CourseDraft | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [issues, setIssues] = useState<Issue[]>([]);
  const [view, setView] = useState<"path" | "preview">("path");
  const [panel, setPanel] = useState<"path" | "library" | "details">("path");
  const [inspectorTab, setInspectorTab] = useState<
    "level" | "tasks" | "resources"
  >("level");
  const [editor, setEditor] = useState<Editor>(null);
  const [listLimit, setListLimit] = useState(8);
  const definition = draft?.definition;
  const level = definition?.levels.find((item) => item.id === selected);
  useEffect(() => {
    let active = true;
    request<{ courses: CourseDraft[] }>("")
      .then((data) => {
        if (!active) return;
        setCourses(data.courses);
        const first = data.courses[0];
        if (first) {
          setDraft(first);
          setSelected(first.definition.levels[0]?.id || null);
        }
      })
      .catch((cause) => {
        if (active) setError(cause.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty]);
  const canLeave = () =>
    !dirty || window.confirm("Discard the unsaved changes to this draft?");
  const modify = (
    change: (definition: CourseDefinition) => CourseDefinition,
  ) => {
    if (busy) return;
    setDraft((previous) =>
      previous
        ? { ...previous, definition: change(previous.definition) }
        : previous,
    );
    setDirty(true);
    setIssues([]);
    setMessage("");
  };
  const patchLevel = (patch: Partial<CourseLevel>) =>
    modify((previous) => ({
      ...previous,
      levels: previous.levels.map((item) =>
        item.id === selected ? { ...item, ...patch } : item,
      ),
    }));
  const remember = (saved: CourseDraft) =>
    setCourses((previous) => [
      saved,
      ...previous.filter((item) => item.id !== saved.id),
    ]);
  const perform = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Request failed. Your draft has been preserved.",
      );
    } finally {
      setBusy(false);
    }
  };
  const save = async () => {
    if (!draft) return null;
    if (!dirty) return draft;
    const saved = await request<CourseDraft>(`/${draft.id}`, "PUT", {
      revision: draft.revision,
      definition: draft.definition,
    });
    setDraft(saved);
    remember(saved);
    setDirty(false);
    return saved;
  };
  const create = (template: "blank" | "storytelling") => {
    if (!canLeave()) return;
    void perform(async () => {
      const created = await request<CourseDraft>("", "POST", { template });
      remember(created);
      setDraft(created);
      setDirty(false);
      setIssues([]);
      setSelected(created.definition.levels[0]?.id || null);
      setView("path");
      setPanel("path");
    });
  };
  const selectCourse = (course: CourseDraft) => {
    if (busy || course.id === draft?.id || !canLeave()) return;
    setDraft(course);
    setSelected(course.definition.levels[0]?.id || null);
    setDirty(false);
    setIssues([]);
    setError("");
    setMessage("");
    setView("path");
    setPanel("path");
  };
  const validate = (publish: boolean) =>
    void perform(async () => {
      const saved = await save();
      if (!saved) return;
      const checked = await request<{ issues: Issue[] }>(
        `/${saved.id}/validate`,
        "POST",
        { revision: saved.revision },
      );
      setIssues(checked.issues);
      if (checked.issues.length) {
        setMessage(
          `Resolve ${checked.issues.length} publication ${checked.issues.length === 1 ? "issue" : "issues"} below.`,
        );
        setPanel("path");
        setView("path");
        return;
      }
      if (!publish) {
        setMessage(
          "Ready to publish. The resources, tasks, and learning path passed validation.",
        );
        return;
      }
      const published = await request<{ id: string; version: number }>(
        `/${saved.id}/publish`,
        "POST",
        { revision: saved.revision },
      );
      const updated = { ...saved, publishedVersion: published.version };
      setDraft(updated);
      remember(updated);
      setMessage(
        `Version ${published.version} published. Learners can enter this course from the street. Future edits stay in the draft until published again.`,
      );
      onPublished(published.id);
    });
  const addLevel = () => {
    if (!definition) return;
    const id = newId("level");
    const conceptId = definition.concepts[0]?.id || newId("concept");
    modify((previous) => ({
      ...previous,
      concepts: previous.concepts.length
        ? previous.concepts
        : [{ id: conceptId, title: "New skill", prerequisites: [] }],
      levels: [
        ...previous.levels,
        {
          id,
          title: `Level ${previous.levels.length + 1}`,
          conceptId,
          prerequisites: previous.levels.length
            ? [previous.levels.at(-1)!.id]
            : [],
          theme: "workshop",
          timeLimitSeconds: 0,
          points: 20,
          resourceIds: [],
          widget: "quiz",
          questions: [],
          retryQuestions: [],
        },
      ],
    }));
    setSelected(id);
    setView("path");
  };
  const moveLevel = (direction: number) => {
    if (!definition || !level) return;
    const at = definition.levels.findIndex((item) => item.id === level.id),
      to = at + direction;
    if (to < 0 || to >= definition.levels.length) return;
    modify((previous) => {
      const levels = [...previous.levels];
      [levels[at], levels[to]] = [levels[to], levels[at]];
      return { ...previous, levels };
    });
  };
  const editQuestion = (
    bank: "questions" | "retryQuestions",
    question?: CourseQuestion,
  ) => {
    if (!level) return;
    setEditor({
      kind: "question",
      bank,
      levelId: level.id,
      question: question || {
        id: newId("task"),
        prompt: "",
        options: ["", ""],
        answer: 0,
        hint: "",
        explanation: "",
        rubric: "",
        ...(bank === "retryQuestions"
          ? {
              retryFor:
                (
                  level.questions.find(
                    (primary) =>
                      !level.retryQuestions.some(
                        (retry) => retry.retryFor === primary.id,
                      ),
                  ) || level.questions[0]
                )?.id || "",
            }
          : {}),
      },
    });
  };
  const editResource = (resource?: CourseResource) =>
    setEditor({
      kind: "resource",
      resource: resource || {
        id: newId("resource"),
        title: "",
        kind: "reading",
        content: "",
        url: "",
        source: "",
      },
    });
  const navigateIssue = (issue: Issue) => {
    const match = issue.path.match(/levels(?:\.|\[)(\d+)/);
    if (match && definition?.levels[Number(match[1])]) {
      const affected = definition.levels[Number(match[1])];
      setSelected(affected.id);
      setInspectorTab(
        issue.path.includes("questions") || issue.path.includes("Questions")
          ? "tasks"
          : issue.path.includes("resource")
            ? "resources"
            : "level",
      );
      const task = issue.path.match(/(questions|retryQuestions)\.(\d+)/);
      if (task) {
        const bank = task[1] as "questions" | "retryQuestions";
        const question = affected[bank][Number(task[2])];
        if (question)
          setEditor({ kind: "question", bank, question, levelId: affected.id });
      }
    } else {
      setSelected(null);
      const resource = issue.path.match(/^resources\.(\d+)/);
      if (resource && definition?.resources[Number(resource[1])])
        editResource(definition.resources[Number(resource[1])]);
    }
    setView("path");
    setPanel("details");
  };
  const patchConcept = (id: string, patch: Partial<CourseConcept>) =>
    modify((previous) => ({
      ...previous,
      concepts: previous.concepts.map((concept) =>
        concept.id === id ? { ...concept, ...patch } : concept,
      ),
    }));
  return (
    <section
      className={`tutor-studio studio-panel-${panel}`}
      aria-label="Tutor studio"
    >
      <header className="studio-header">
        <div className="studio-brand">
          <span className="studio-brand-mark">
            a<span>✦</span>
          </span>
          <div>
            <strong>Tutor studio</strong>
            <small>BUILD A WORLD OF LEARNING</small>
          </div>
        </div>
        <div className="studio-save-status" role="status">
          <i className={dirty ? "unsaved" : ""} />
          {busy
            ? "Working…"
            : dirty
              ? "Unsaved changes"
              : draft
                ? `Draft saved · revision ${draft.revision}`
                : "Your creator workspace"}
        </div>
        <div className="studio-header-actions">
          <button
            disabled={!draft || !dirty || busy}
            onClick={() =>
              void perform(async () => {
                await save();
                setMessage("Draft saved.");
              })
            }
          >
            Save draft
          </button>
          <button
            className="studio-primary"
            disabled={!draft || busy}
            onClick={() => validate(true)}
          >
            Publish course <span>↗</span>
          </button>
          <button
            className="studio-icon-button studio-close"
            aria-label="Return to game"
            onClick={() => {
              if (!busy && canLeave()) onClose();
            }}
          >
            ×
          </button>
        </div>
      </header>
      {(error || message) && (
        <div
          className={`studio-notice ${error ? "studio-error" : ""}`}
          role={error ? "alert" : "status"}
        >
          <span>{error || message}</span>
          {error.includes("newer draft") && (
            <button
              disabled={busy}
              onClick={() => {
                if (canLeave())
                  void perform(async () => {
                    const data = await request<{ courses: CourseDraft[] }>("");
                    setCourses(data.courses);
                    const latest = data.courses.find(
                      (item) => item.id === draft?.id,
                    );
                    if (latest) {
                      setDraft(latest);
                      setDirty(false);
                      setSelected(latest.definition.levels[0]?.id || null);
                    }
                  });
              }}
            >
              Reload saved draft
            </button>
          )}
          <button
            className="studio-icon-button"
            aria-label="Dismiss message"
            onClick={() => {
              setError("");
              setMessage("");
            }}
          >
            ×
          </button>
        </div>
      )}
      <div className="studio-mobile-nav">
        <button
          className={panel === "library" ? "active" : ""}
          onClick={() => setPanel("library")}
        >
          My courses
        </button>
        <button
          className={panel === "path" ? "active" : ""}
          onClick={() => setPanel("path")}
        >
          Learning path
        </button>
        <button
          className={panel === "details" ? "active" : ""}
          disabled={!draft}
          onClick={() => setPanel("details")}
        >
          Edit details
        </button>
      </div>
      <div className="studio-layout">
        <aside className="studio-library">
          <div className="studio-library-heading">
            <span className="studio-eyebrow">YOUR COURSES</span>
            <span>{courses.length}</span>
          </div>
          <button
            className="studio-new-course"
            disabled={busy}
            onClick={() => create("blank")}
          >
            + New course
          </button>
          <div className="studio-course-list">
            {courses.slice(0, listLimit).map((course) => (
              <button
                key={course.id}
                className={`studio-course-card ${draft?.id === course.id ? "active" : ""}`}
                disabled={busy}
                onClick={() => selectCourse(course)}
              >
                <span className="studio-course-symbol">
                  {presets.find(
                    (preset) =>
                      preset.id === course.definition.levels[0]?.theme,
                  )?.icon || "◇"}
                </span>
                <span>
                  <strong>
                    {course.definition.title || "Untitled course"}
                  </strong>
                  <small>
                    {course.definition.levels.length} levels ·{" "}
                    {course.publishedVersion
                      ? `Live v${course.publishedVersion}`
                      : "Draft"}
                  </small>
                </span>
              </button>
            ))}
          </div>
          {courses.length > listLimit && (
            <button
              className="studio-link"
              onClick={() => setListLimit(listLimit + 8)}
            >
              Show more courses
            </button>
          )}
          <div className="studio-starter-card">
            <span className="studio-eyebrow">CURRICULUM STARTER</span>
            <div className="studio-starter-art">
              ✦<span>1M</span>
            </div>
            <h3>Build a small storytelling model</h3>
            <p>
              A tutor-authored path from text preparation to training and
              evaluation.
            </p>
            <button disabled={busy} onClick={() => create("storytelling")}>
              Start storytelling course <span>↗</span>
            </button>
          </div>
          <p className="studio-library-note">
            Anyone can teach. Every published adventure starts with your
            expertise.
          </p>
        </aside>
        <main className="studio-workspace">
          {loading ? (
            <div className="studio-empty" role="status">
              <span>◇</span>
              <h2>Opening your workbench…</h2>
            </div>
          ) : !draft || !definition ? (
            <div className="studio-empty">
              <span>✦</span>
              <span className="studio-eyebrow">
                YOUR NEXT ADVENTURE STARTS HERE
              </span>
              <h1>
                Turn what you know
                <br />
                into a learning world.
              </h1>
              <p>
                Connect skills, choose a setting, and give learners a path worth
                following.
              </p>
              <div>
                <button
                  className="studio-primary"
                  onClick={() => create("storytelling")}
                >
                  Start storytelling course
                </button>
                <button onClick={() => create("blank")}>New course</button>
              </div>
            </div>
          ) : (
            <>
              <div className="studio-course-heading">
                <div className="studio-course-meta">
                  <span className="studio-eyebrow">COURSE BLUEPRINT</span>
                  <span className="studio-version">
                    {draft.publishedVersion
                      ? `Published v${draft.publishedVersion} · editing draft`
                      : "UNPUBLISHED DRAFT"}
                  </span>
                </div>
                <Label title="Course title">
                  <input
                    className="studio-title-input"
                    value={definition.title}
                    disabled={busy}
                    placeholder="Name your adventure"
                    onChange={(event) =>
                      modify((previous) => ({
                        ...previous,
                        title: event.target.value,
                      }))
                    }
                  />
                </Label>
                <p>
                  {definition.summary ||
                    "Give your adventure a clear purpose in Course settings."}
                </p>
                <button
                  className="studio-link"
                  onClick={() => {
                    setSelected(null);
                    setView("path");
                    setPanel("details");
                  }}
                >
                  Course settings & skills ↗
                </button>
              </div>
              <div className="studio-workspace-toolbar">
                <div className="studio-view-tabs">
                  <button
                    className={view === "path" ? "active" : ""}
                    onClick={() => setView("path")}
                  >
                    Learning path
                  </button>
                  <button
                    className={view === "preview" ? "active" : ""}
                    onClick={() => setView("preview")}
                  >
                    Preview course
                  </button>
                </div>
                <span>
                  {definition.levels.length} levels <i>·</i>{" "}
                  {definition.levels.reduce(
                    (sum, item) => sum + item.points,
                    0,
                  )}{" "}
                  points
                </span>
              </div>
              {issues.length > 0 && (
                <section
                  className="studio-validation"
                  aria-label="Publication issues"
                >
                  <div className="studio-section-heading">
                    <h3>{issues.length} things to finish before publishing</h3>
                    <button
                      className="studio-icon-button"
                      aria-label="Close publication issues"
                      onClick={() => setIssues([])}
                    >
                      ×
                    </button>
                  </div>
                  {issues.map((issue, index) => (
                    <button key={index} onClick={() => navigateIssue(issue)}>
                      <span>!</span>
                      <span>
                        {issue.message}
                        <small>{issue.path}</small>
                      </span>
                      <span>↗</span>
                    </button>
                  ))}
                </section>
              )}
              {view === "preview" ? (
                <LearnerPreview
                  key={`${draft.id}-${selected}`}
                  definition={definition}
                  initialLevel={selected}
                  renderScene={renderScene}
                />
              ) : (
                <div className="studio-path">
                  <div className="studio-path-guide">
                    <span className="studio-start-dot" />
                    ENTRY POINT <span>Connect levels to shape the journey</span>
                  </div>
                  <div
                    className="studio-path-map"
                    style={{
                      minHeight: Math.max(160, definition.levels.length * 156),
                    }}
                  >
                    <svg className="studio-connections" aria-hidden="true">
                      <defs>
                        <marker
                          id="studio-arrow"
                          markerWidth="6"
                          markerHeight="6"
                          refX="5"
                          refY="3"
                          orient="auto"
                        >
                          <path d="M0 0L6 3L0 6" fill="#5b8177" />
                        </marker>
                      </defs>
                      {definition.levels.flatMap((item, index) =>
                        item.prerequisites.map((prerequisite, branch) => {
                          const from = definition.levels.findIndex(
                            (node) => node.id === prerequisite,
                          );
                          if (from < 0) return null;
                          const start = from * 156 + 75,
                            end = index * 156 + 75,
                            bend = 30 + branch * 8;
                          return (
                            <path
                              key={`${item.id}-${prerequisite}`}
                              d={`M65 ${start} C${bend} ${start} ${bend} ${end} 65 ${end}`}
                              fill="none"
                              stroke="#5b8177"
                              strokeWidth="2"
                              markerEnd="url(#studio-arrow)"
                            />
                          );
                        }),
                      )}
                    </svg>
                    {definition.levels.map((item, index) => (
                      <div
                        className={`studio-path-node ${selected === item.id ? "selected" : ""}`}
                        key={item.id}
                      >
                        <span className="studio-node-number">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        <button
                          className={`studio-level-card studio-theme-${item.theme}`}
                          onClick={() => {
                            setSelected(item.id);
                            setInspectorTab("level");
                          }}
                          aria-pressed={selected === item.id}
                        >
                          <div className="studio-level-art">
                            <span>
                              {
                                presets.find(
                                  (preset) => preset.id === item.theme,
                                )?.icon
                              }
                            </span>
                            <i />
                            <i />
                          </div>
                          <div className="studio-level-information">
                            <span className="studio-eyebrow">
                              {
                                presets.find(
                                  (preset) => preset.id === item.theme,
                                )?.title
                              }{" "}
                              ·{" "}
                              {definition.concepts.find(
                                (concept) => concept.id === item.conceptId,
                              )?.title || "Choose a skill"}
                            </span>
                            <h3>{item.title || "Untitled level"}</h3>
                            <p>
                              {item.questions.length} tasks <i>·</i>{" "}
                              {item.resourceIds.length} resources <i>·</i>{" "}
                              {item.timeLimitSeconds
                                ? `${item.timeLimitSeconds}s`
                                : "Untimed"}
                            </p>
                            <span className="studio-level-reward">
                              ✦ {item.points} points
                            </span>
                          </div>
                          <span className="studio-level-arrow">↗</span>
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    className="studio-add-level"
                    disabled={busy || definition.levels.length >= 40}
                    onClick={addLevel}
                  >
                    + Add level <span>A new stop on the learning path</span>
                  </button>
                  <p className="studio-path-footer">
                    Prerequisites unlock levels. Task evidence informs routing
                    after a level is cleared.
                  </p>
                </div>
              )}
            </>
          )}
        </main>
        <aside className="studio-inspector">
          <fieldset disabled={busy || !definition}>
            {!definition ? (
              <div className="studio-inspector-placeholder">
                <span>◇</span>
                <h3>Your course, your world.</h3>
                <p>Select a course to shape its learning path.</p>
              </div>
            ) : !level ? (
              <>
                <div className="studio-inspector-heading">
                  <span className="studio-eyebrow">THE BIG PICTURE</span>
                  <h2>Course settings</h2>
                </div>
                <Label title="Course name">
                  <input
                    value={definition.title}
                    onChange={(event) =>
                      modify((previous) => ({
                        ...previous,
                        title: event.target.value,
                      }))
                    }
                  />
                </Label>
                <Label title="Course summary">
                  <textarea
                    rows={4}
                    value={definition.summary}
                    onChange={(event) =>
                      modify((previous) => ({
                        ...previous,
                        summary: event.target.value,
                      }))
                    }
                    placeholder="What will learners be able to do?"
                  />
                </Label>
                <Label title="Course language">
                  <input
                    value={definition.language}
                    placeholder="en"
                    onChange={(event) =>
                      modify((previous) => ({
                        ...previous,
                        language: event.target.value,
                      }))
                    }
                  />
                </Label>
                <section className="studio-inspector-section">
                  <div className="studio-section-heading">
                    <h3>Skills & prerequisites</h3>
                    <button
                      className="studio-link"
                      onClick={() =>
                        modify((previous) => ({
                          ...previous,
                          concepts: [
                            ...previous.concepts,
                            {
                              id: newId("concept"),
                              title: "New skill",
                              prerequisites: [],
                            },
                          ],
                        }))
                      }
                    >
                      + Skill
                    </button>
                  </div>
                  <p className="studio-small">
                    Name the skills your course teaches and connect any prior
                    knowledge.
                  </p>
                  {definition.concepts.map((concept) => (
                    <div className="studio-concept" key={concept.id}>
                      <Label title="Skill name">
                        <input
                          value={concept.title}
                          onChange={(event) =>
                            patchConcept(concept.id, {
                              title: event.target.value,
                            })
                          }
                        />
                      </Label>
                      {definition.concepts.length > 1 && (
                        <details>
                          <summary>
                            Prerequisite skills ({concept.prerequisites.length})
                          </summary>
                          {definition.concepts
                            .filter((other) => other.id !== concept.id)
                            .map((other) => (
                              <label
                                className="studio-check-row"
                                key={other.id}
                              >
                                <input
                                  type="checkbox"
                                  checked={concept.prerequisites.includes(
                                    other.id,
                                  )}
                                  onChange={(event) =>
                                    patchConcept(concept.id, {
                                      prerequisites: event.target.checked
                                        ? [...concept.prerequisites, other.id]
                                        : concept.prerequisites.filter(
                                            (id) => id !== other.id,
                                          ),
                                    })
                                  }
                                />
                                {other.title}
                              </label>
                            ))}
                        </details>
                      )}
                      <button
                        className="studio-link studio-danger"
                        onClick={() => {
                          if (
                            window.confirm(
                              `Remove the skill “${concept.title}”? Levels using it will need another skill before publishing.`,
                            )
                          )
                            modify((previous) => ({
                              ...previous,
                              concepts: previous.concepts
                                .filter((item) => item.id !== concept.id)
                                .map((item) => ({
                                  ...item,
                                  prerequisites: item.prerequisites.filter(
                                    (id) => id !== concept.id,
                                  ),
                                })),
                            }));
                        }}
                      >
                        Remove skill
                      </button>
                    </div>
                  ))}
                </section>
                <button
                  className="studio-check-publish"
                  onClick={() => validate(false)}
                >
                  Check publication readiness ↗
                </button>
              </>
            ) : (
              <>
                <div className="studio-inspector-heading">
                  <div className="studio-section-heading">
                    <span className="studio-eyebrow">LEVEL WORKBENCH</span>
                    <button
                      className="studio-link"
                      onClick={() => setSelected(null)}
                    >
                      Course settings
                    </button>
                  </div>
                  <h2>{level.title || "Untitled level"}</h2>
                </div>
                <div className="studio-inspector-tabs">
                  {(["level", "tasks", "resources"] as const).map((name) => (
                    <button
                      className={inspectorTab === name ? "active" : ""}
                      key={name}
                      onClick={() => setInspectorTab(name)}
                    >
                      {name === "level"
                        ? "Setting"
                        : name === "tasks"
                          ? "Tasks"
                          : "Resources"}
                    </button>
                  ))}
                </div>
                {inspectorTab === "level" ? (
                  <>
                    <Label title="Level title">
                      <input
                        value={level.title}
                        onChange={(event) =>
                          patchLevel({ title: event.target.value })
                        }
                      />
                    </Label>
                    <Label title="Skill taught">
                      <select
                        value={level.conceptId}
                        onChange={(event) =>
                          patchLevel({ conceptId: event.target.value })
                        }
                      >
                        <option value="">Choose a skill</option>
                        {definition.concepts.map((concept) => (
                          <option key={concept.id} value={concept.id}>
                            {concept.title}
                          </option>
                        ))}
                      </select>
                    </Label>
                    <section className="studio-inspector-section">
                      <span className="studio-eyebrow">
                        CHOOSE THE ADVENTURE
                      </span>
                      <div className="studio-theme-chooser">
                        {presets.map((preset) => (
                          <button
                            key={preset.id}
                            className={`studio-preset studio-theme-${preset.id} ${level.theme === preset.id ? "selected" : ""}`}
                            aria-pressed={level.theme === preset.id}
                            onClick={() => patchLevel({ theme: preset.id })}
                          >
                            <span>{preset.icon}</span>
                            <strong>{preset.title}</strong>
                            <small>{preset.description}</small>
                          </button>
                        ))}
                      </div>
                    </section>
                    <div className="studio-two-fields">
                      <Label title="Time budget (seconds)">
                        <input
                          type="number"
                          min="0"
                          max="3600"
                          value={level.timeLimitSeconds}
                          onChange={(event) =>
                            patchLevel({
                              timeLimitSeconds: Number(event.target.value),
                            })
                          }
                        />
                      </Label>
                      <Label title="Practice points">
                        <input
                          type="number"
                          min="0"
                          max="1000"
                          value={level.points}
                          onChange={(event) =>
                            patchLevel({ points: Number(event.target.value) })
                          }
                        />
                      </Label>
                    </div>
                    <p className="studio-small">
                      0 seconds means untimed. Speed never establishes mastery.
                    </p>
                    <Label title="Practice widget">
                      <select
                        value={level.widget}
                        onChange={(event) =>
                          patchLevel({
                            widget: event.target.value as CourseLevel["widget"],
                          })
                        }
                      >
                        <option value="quiz">Checkpoint quiz</option>
                        <option value="notebook">
                          Notebook (external resource)
                        </option>
                        <option value="javascript">
                          JavaScript (external resource)
                        </option>
                        <option value="drawing">
                          Drawing (external resource)
                        </option>
                      </select>
                    </Label>
                    <section className="studio-inspector-section">
                      <h3>Unlock after</h3>
                      <p className="studio-small">
                        Select the levels that must be completed first.
                      </p>
                      {definition.levels
                        .filter((item) => item.id !== level.id)
                        .map((item) => (
                          <label className="studio-check-row" key={item.id}>
                            <input
                              type="checkbox"
                              checked={level.prerequisites.includes(item.id)}
                              onChange={(event) =>
                                patchLevel({
                                  prerequisites: event.target.checked
                                    ? [...level.prerequisites, item.id]
                                    : level.prerequisites.filter(
                                        (id) => id !== item.id,
                                      ),
                                })
                              }
                            />
                            {item.title}
                          </label>
                        ))}
                      {definition.levels.length === 1 && (
                        <p className="studio-small">This is the entry level.</p>
                      )}
                    </section>
                    <div className="studio-order-controls">
                      <button
                        aria-label="Move level earlier"
                        disabled={definition.levels[0]?.id === level.id}
                        onClick={() => moveLevel(-1)}
                      >
                        ↑ Move earlier
                      </button>
                      <button
                        aria-label="Move level later"
                        disabled={definition.levels.at(-1)?.id === level.id}
                        onClick={() => moveLevel(1)}
                      >
                        ↓ Move later
                      </button>
                    </div>
                    <button
                      className="studio-link studio-danger"
                      onClick={() => {
                        if (
                          window.confirm(
                            `Remove “${level.title}” and its tasks from this draft?`,
                          )
                        ) {
                          modify((previous) => ({
                            ...previous,
                            levels: previous.levels
                              .filter((item) => item.id !== level.id)
                              .map((item) => ({
                                ...item,
                                prerequisites: item.prerequisites.filter(
                                  (id) => id !== level.id,
                                ),
                              })),
                          }));
                          setSelected(null);
                        }
                      }}
                    >
                      Remove level
                    </button>
                  </>
                ) : inspectorTab === "tasks" ? (
                  <>
                    {(["questions", "retryQuestions"] as const).map((bank) => (
                      <section className="studio-inspector-section" key={bank}>
                        <div className="studio-section-heading">
                          <h3>
                            {bank === "questions"
                              ? "Checkpoint tasks"
                              : "Retry bank"}
                          </h3>
                          <span className="studio-count">
                            {level[bank].length}
                          </span>
                        </div>
                        <p className="studio-small">
                          {bank === "questions"
                            ? "Authored tasks collect evidence for each learning step."
                            : "Alternative authored tasks help learners practice a skill again."}
                        </p>
                        {level[bank].map((question, index) => (
                          <div className="studio-task-row" key={question.id}>
                            <button
                              onClick={() => editQuestion(bank, question)}
                            >
                              <span>{index + 1}</span>
                              <strong>
                                {question.prompt || "Untitled task"}
                              </strong>
                              <span>↗</span>
                            </button>
                            <button
                              className="studio-icon-button studio-danger"
                              aria-label={`Remove ${bank === "questions" ? "checkpoint" : "retry"} task ${index + 1}`}
                              onClick={() =>
                                patchLevel({
                                  [bank]: level[bank].filter(
                                    (item) => item.id !== question.id,
                                  ),
                                })
                              }
                            >
                              ×
                            </button>
                          </div>
                        ))}
                        <button
                          className="studio-add-item"
                          disabled={level[bank].length >= 12}
                          onClick={() => editQuestion(bank)}
                        >
                          + Add{" "}
                          {bank === "questions"
                            ? "checkpoint task"
                            : "retry task"}
                        </button>
                      </section>
                    ))}
                  </>
                ) : (
                  <>
                    <div className="studio-section-heading">
                      <h3>Learning materials</h3>
                      <button
                        className="studio-link"
                        onClick={() => editResource()}
                      >
                        + Resource
                      </button>
                    </div>
                    <p className="studio-small">
                      Check a resource to attach it to this level. Resources can
                      be reused across the course.
                    </p>
                    {definition.resources.map((resource) => (
                      <div className="studio-resource-row" key={resource.id}>
                        <label className="studio-check-row">
                          <input
                            type="checkbox"
                            checked={level.resourceIds.includes(resource.id)}
                            onChange={(event) =>
                              patchLevel({
                                resourceIds: event.target.checked
                                  ? [...level.resourceIds, resource.id]
                                  : level.resourceIds.filter(
                                      (id) => id !== resource.id,
                                    ),
                              })
                            }
                          />
                          <span>
                            <strong>
                              {resource.title || "Untitled resource"}
                            </strong>
                            <small>{resource.kind}</small>
                          </span>
                        </label>
                        <button
                          className="studio-icon-button"
                          aria-label={`Edit resource ${resource.title}`}
                          onClick={() => editResource(resource)}
                        >
                          ↗
                        </button>
                        <button
                          className="studio-icon-button studio-danger"
                          aria-label={`Remove resource ${resource.title}`}
                          onClick={() => {
                            if (
                              window.confirm(
                                `Remove “${resource.title}” from every level in this course?`,
                              )
                            )
                              modify((previous) => ({
                                ...previous,
                                resources: previous.resources.filter(
                                  (item) => item.id !== resource.id,
                                ),
                                levels: previous.levels.map((item) => ({
                                  ...item,
                                  resourceIds: item.resourceIds.filter(
                                    (id) => id !== resource.id,
                                  ),
                                })),
                              }));
                          }}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    {!definition.resources.length && (
                      <div className="studio-empty-resource">
                        <span>▤</span>
                        <p>
                          No resources yet. Add a reading, video, or practice
                          link.
                        </p>
                      </div>
                    )}
                    <button
                      className="studio-add-item"
                      onClick={() => editResource()}
                    >
                      + Add learning resource
                    </button>
                  </>
                )}
              </>
            )}
          </fieldset>
        </aside>
      </div>
      {editor?.kind === "resource" && (
        <ResourceEditor
          initial={editor.resource}
          onClose={() => setEditor(null)}
          onSave={(resource) => {
            modify((previous) => ({
              ...previous,
              resources: previous.resources.some(
                (item) => item.id === resource.id,
              )
                ? previous.resources.map((item) =>
                    item.id === resource.id ? resource : item,
                  )
                : [...previous.resources, resource],
              levels: previous.levels.map((item) =>
                item.id === selected && !item.resourceIds.includes(resource.id)
                  ? { ...item, resourceIds: [...item.resourceIds, resource.id] }
                  : item,
              ),
            }));
            setEditor(null);
          }}
        />
      )}
      {editor?.kind === "question" && (
        <QuestionEditor
          initial={editor.question}
          retry={editor.bank === "retryQuestions"}
          primaryQuestions={
            definition?.levels.find((item) => item.id === editor.levelId)
              ?.questions || []
          }
          onClose={() => setEditor(null)}
          onSave={(question) => {
            modify((previous) => ({
              ...previous,
              levels: previous.levels.map((item) =>
                item.id === editor.levelId
                  ? {
                      ...item,
                      [editor.bank]: item[editor.bank].some(
                        (task) => task.id === question.id,
                      )
                        ? item[editor.bank].map((task) =>
                            task.id === question.id ? question : task,
                          )
                        : [...item[editor.bank], question],
                    }
                  : item,
              ),
            }));
            setEditor(null);
          }}
        />
      )}
    </section>
  );
}
