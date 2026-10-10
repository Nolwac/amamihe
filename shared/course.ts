export const THEMES = [
  "workshop",
  "temple-chase",
  "racing",
  "wrestling",
] as const;
export const WIDGETS = ["quiz", "notebook", "javascript", "drawing"] as const;
export type Theme = (typeof THEMES)[number];
export type Widget = (typeof WIDGETS)[number];

export type CourseQuestion = {
  id: string;
  prompt: string;
  options: string[];
  answer: number;
  hint: string;
  explanation: string;
  rubric: string;
  retryFor?: string;
};
export type CourseResource = {
  id: string;
  title: string;
  kind: "reading" | "video" | "notebook" | "javascript" | "drawing";
  content: string;
  url: string;
  source: string;
};
export type CourseConcept = {
  id: string;
  title: string;
  prerequisites: string[];
};
export type CourseLevel = {
  id: string;
  title: string;
  conceptId: string;
  prerequisites: string[];
  theme: Theme;
  timeLimitSeconds: number;
  points: number;
  resourceIds: string[];
  widget: Widget;
  questions: CourseQuestion[];
  retryQuestions: CourseQuestion[];
};
export type CourseDefinition = {
  title: string;
  summary: string;
  language: string;
  concepts: CourseConcept[];
  resources: CourseResource[];
  levels: CourseLevel[];
};
export type CourseDraft = {
  id: string;
  ownerId: string;
  revision: number;
  publishedVersion: number | null;
  definition: CourseDefinition;
};
export type CourseSummary = {
  id: string;
  title: string;
  summary: string;
  language: string;
  version: number;
  levelCount: number;
};
export type PublicCourseQuestion = Pick<
  CourseQuestion,
  "id" | "prompt" | "options"
>;
export type PublicCourseLevel = Omit<
  CourseLevel,
  "questions" | "retryQuestions"
> & {
  questions: PublicCourseQuestion[];
  retryQuestions: PublicCourseQuestion[];
};
export type PublicCourseDefinition = Omit<CourseDefinition, "levels"> & {
  levels: PublicCourseLevel[];
};
export type PublishedCourse = {
  id: string;
  version: number;
  definition: PublicCourseDefinition;
};
export type LearningProgress = {
  courseId: string;
  version: number;
  levelId: string;
  questionIndex: number;
  retry: boolean;
  completedLevelIds: string[];
  points: number;
  finished: boolean;
  assisted?: boolean;
  feedback?: string;
  blocked?: boolean;
  blockReason?: string;
  question?: PublicCourseQuestion;
  resources?: CourseResource[];
  level?: Omit<PublicCourseLevel, "questions" | "retryQuestions">;
  assessment?: import("../server/assessment.js").Assessment;
  result?: {
    mocked: true;
    label: string;
    nextLevelId: string | null;
    awardedPoints: number;
  };
};
export type ValidationIssue = { path: string; message: string };

const identifier = /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/;
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/** Publication checks only: tutors may save incomplete drafts. No code is executed. */
export function validateCourse(value: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const add = (path: string, message: string) => {
    // A malformed payload must not produce an unbounded response.
    if (issues.length < 150) issues.push({ path, message });
  };
  const text = (
    entry: unknown,
    path: string,
    minimum = 1,
    maximum = 2000,
  ): entry is string => {
    if (
      typeof entry !== "string" ||
      entry.trim().length < minimum ||
      entry.length > maximum
    ) {
      add(path, `Use ${minimum}–${maximum} characters.`);
      return false;
    }
    return true;
  };
  const id = (entry: unknown, path: string): entry is string => {
    if (typeof entry !== "string" || !identifier.test(entry)) {
      add(
        path,
        "Use a letter followed by letters, numbers, _ or - (64 maximum).",
      );
      return false;
    }
    return true;
  };
  const list = (
    entry: unknown,
    path: string,
    minimum: number,
    maximum: number,
  ): unknown[] => {
    if (!Array.isArray(entry)) {
      add(path, "Provide a list.");
      return [];
    }
    if (entry.length < minimum || entry.length > maximum)
      add(path, `Provide ${minimum}–${maximum} entries.`);
    return entry.slice(0, maximum);
  };
  const ids = (entry: unknown, path: string, maximum = 50): string[] => {
    const result: string[] = [];
    for (const [index, item] of list(entry, path, 0, maximum).entries()) {
      if (!id(item, `${path}.${index}`)) continue;
      if (result.includes(item))
        add(`${path}.${index}`, "Remove duplicate IDs.");
      result.push(item);
    }
    return result;
  };
  const integer = (
    entry: unknown,
    path: string,
    minimum: number,
    maximum: number,
  ) => {
    if (
      typeof entry !== "number" ||
      !Number.isInteger(entry) ||
      entry < minimum ||
      entry > maximum
    )
      add(path, `Use a whole number from ${minimum} to ${maximum}.`);
  };
  const https = (entry: unknown, path: string, optional = false) => {
    if (optional && entry === "") return;
    if (!text(entry, path, 1, 2048)) return;
    try {
      const parsed = new URL(entry);
      const hostname = parsed.hostname.toLowerCase();
      // Links are displayed/explicitly launched, never fetched by the server.
      if (
        parsed.protocol !== "https:" ||
        parsed.username ||
        parsed.password ||
        !hostname.includes(".") ||
        hostname === "localhost" ||
        hostname.endsWith(".localhost") ||
        hostname.endsWith(".local") ||
        /^[\d.]+$/.test(hostname) ||
        hostname.includes(":")
      )
        throw new Error("unsafe URL");
    } catch {
      add(path, "Use a public HTTPS source URL without embedded credentials.");
    }
  };
  if (!record(value)) {
    add("course", "Provide a course object.");
    return issues;
  }
  text(value.title, "title", 3, 160);
  text(value.summary, "summary", 20, 2000);
  if (
    !text(value.language, "language", 2, 35) ||
    (typeof value.language === "string" &&
      !/^[a-zA-Z]{2,3}(?:-[a-zA-Z0-9]{2,8})*$/.test(value.language))
  )
    add("language", "Use a language tag such as en, fr or pt-BR.");

  const concepts = new Map<string, { prerequisites: string[]; path: string }>();
  for (const [index, concept] of list(
    value.concepts,
    "concepts",
    1,
    50,
  ).entries()) {
    const path = `concepts.${index}`;
    if (!record(concept)) {
      add(path, "Provide a concept object.");
      continue;
    }
    text(concept.title, `${path}.title`, 2, 160);
    const prerequisites = ids(concept.prerequisites, `${path}.prerequisites`);
    if (id(concept.id, `${path}.id`)) {
      if (concepts.has(concept.id))
        add(`${path}.id`, "Use a unique concept ID.");
      else concepts.set(concept.id, { prerequisites, path });
    }
  }

  const resources = new Map<string, { kind: string; path: string }>();
  for (const [index, resource] of list(
    value.resources,
    "resources",
    1,
    100,
  ).entries()) {
    const path = `resources.${index}`;
    if (!record(resource)) {
      add(path, "Provide a resource object.");
      continue;
    }
    text(resource.title, `${path}.title`, 2, 160);
    const kind = resource.kind;
    if (
      typeof kind !== "string" ||
      !["reading", "video", "notebook", "javascript", "drawing"].includes(kind)
    )
      add(`${path}.kind`, "Choose a supported resource kind.");
    text(resource.content, `${path}.content`, 0, 60000);
    https(resource.url, `${path}.url`, true);
    https(resource.source, `${path}.source`);
    if (
      (typeof resource.content !== "string" || !resource.content.trim()) &&
      (typeof resource.url !== "string" || !resource.url.trim())
    )
      add(path, "Provide authored content or an external HTTPS resource.");
    if (kind === "video" && !resource.url)
      add(`${path}.url`, "Provide the video's HTTPS URL.");
    if (id(resource.id, `${path}.id`)) {
      if (resources.has(resource.id))
        add(`${path}.id`, "Use a unique resource ID.");
      else resources.set(resource.id, { kind: String(kind), path });
    }
  }

  const questionIds = new Set<string>();
  const questions = (
    entry: unknown,
    path: string,
    retryBank = false,
  ): string[] => {
    const prompts: string[] = [];
    for (const [index, question] of list(entry, path, 1, 12).entries()) {
      const questionPath = `${path}.${index}`;
      if (!record(question)) {
        add(questionPath, "Provide a question object.");
        continue;
      }
      if (id(question.id, `${questionPath}.id`)) {
        if (questionIds.has(question.id))
          add(
            `${questionPath}.id`,
            "Use a unique question ID across all banks.",
          );
        questionIds.add(question.id);
      }
      if (text(question.prompt, `${questionPath}.prompt`, 10, 2000))
        prompts.push(question.prompt.trim().replace(/\s+/g, " ").toLowerCase());
      const options = list(question.options, `${questionPath}.options`, 2, 8);
      const optionText = new Set<string>();
      for (const [optionIndex, option] of options.entries()) {
        if (!text(option, `${questionPath}.options.${optionIndex}`, 1, 1000))
          continue;
        const normalized = option.trim().toLowerCase();
        if (optionText.has(normalized))
          add(
            `${questionPath}.options.${optionIndex}`,
            "Use distinct options.",
          );
        optionText.add(normalized);
      }
      integer(question.answer, `${questionPath}.answer`, 0, options.length - 1);
      text(question.hint, `${questionPath}.hint`, 5, 2000);
      text(question.explanation, `${questionPath}.explanation`, 10, 4000);
      text(question.rubric, `${questionPath}.rubric`, 10, 2000);
      if (retryBank) id(question.retryFor, `${questionPath}.retryFor`);
      else if (question.retryFor !== undefined)
        add(
          `${questionPath}.retryFor`,
          "Only retry questions may target a primary question.",
        );
    }
    return prompts;
  };
  const levels = new Map<
    string,
    { prerequisites: string[]; conceptId: string; path: string }
  >();
  for (const [index, level] of list(value.levels, "levels", 1, 50).entries()) {
    const path = `levels.${index}`;
    if (!record(level)) {
      add(path, "Provide a level object.");
      continue;
    }
    text(level.title, `${path}.title`, 2, 160);
    const conceptValid = id(level.conceptId, `${path}.conceptId`);
    if (conceptValid && !concepts.has(level.conceptId as string))
      add(`${path}.conceptId`, "Select an existing concept.");
    const prerequisites = ids(level.prerequisites, `${path}.prerequisites`);
    if (!THEMES.includes(level.theme as Theme))
      add(`${path}.theme`, "Choose a supported story theme.");
    if (!WIDGETS.includes(level.widget as Widget))
      add(`${path}.widget`, "Choose a supported activity widget.");
    if (level.timeLimitSeconds !== 0)
      integer(level.timeLimitSeconds, `${path}.timeLimitSeconds`, 15, 3600);
    integer(level.points, `${path}.points`, 1, 1000);
    const resourceIds = ids(level.resourceIds, `${path}.resourceIds`, 20);
    if (resourceIds.length === 0)
      add(`${path}.resourceIds`, "Attach at least one reviewed resource.");
    for (const resourceId of resourceIds)
      if (!resources.has(resourceId))
        add(`${path}.resourceIds`, `Resource ${resourceId} does not exist.`);
    if (
      level.widget !== "quiz" &&
      WIDGETS.includes(level.widget as Widget) &&
      !resourceIds.some(
        (resourceId) => resources.get(resourceId)?.kind === level.widget,
      )
    )
      add(`${path}.widget`, "Attach a resource matching the selected widget.");
    const primary = questions(level.questions, `${path}.questions`);
    const retries = questions(
      level.retryQuestions,
      `${path}.retryQuestions`,
      true,
    );
    const primaryIds = new Set(
      (Array.isArray(level.questions) ? level.questions.slice(0, 12) : [])
        .filter(record)
        .map((question) => question.id)
        .filter(
          (questionId): questionId is string => typeof questionId === "string",
        ),
    );
    const coveredPrimaryIds = new Set<string>();
    for (const [retryIndex, retry] of (Array.isArray(level.retryQuestions)
      ? level.retryQuestions.slice(0, 12)
      : []
    ).entries()) {
      if (!record(retry) || typeof retry.retryFor !== "string") continue;
      if (!primaryIds.has(retry.retryFor))
        add(
          `${path}.retryQuestions.${retryIndex}.retryFor`,
          "Select a primary question in this level for the retry to assess.",
        );
      else coveredPrimaryIds.add(retry.retryFor);
    }
    for (const primaryId of primaryIds)
      if (!coveredPrimaryIds.has(primaryId))
        add(
          `${path}.retryQuestions`,
          `Provide a fresh retry targeting primary question ${primaryId}.`,
        );
    if (retries.length < primary.length)
      add(
        `${path}.retryQuestions`,
        "Provide a fresh retry for each primary question.",
      );
    const allPrompts = [...primary, ...retries];
    if (new Set(allPrompts).size !== allPrompts.length)
      add(
        `${path}.retryQuestions`,
        "Use different prompts in primary and retry banks.",
      );
    if (id(level.id, `${path}.id`)) {
      if (levels.has(level.id)) add(`${path}.id`, "Use a unique level ID.");
      else
        levels.set(level.id, {
          prerequisites,
          conceptId: typeof level.conceptId === "string" ? level.conceptId : "",
          path,
        });
    }
  }

  const checkGraph = (
    entries: Map<string, { prerequisites: string[]; path: string }>,
    label: string,
  ) => {
    const done = new Set<string>();
    for (const [entryId, entry] of entries) {
      for (const prerequisite of entry.prerequisites) {
        if (!entries.has(prerequisite))
          add(
            `${entry.path}.prerequisites`,
            `${label} ${prerequisite} does not exist.`,
          );
        if (prerequisite === entryId)
          add(`${entry.path}.prerequisites`, "An item cannot require itself.");
      }
    }
    for (let pass = 0; pass < entries.size; pass++) {
      for (const [entryId, entry] of entries)
        if (entry.prerequisites.every((prerequisite) => done.has(prerequisite)))
          done.add(entryId);
    }
    for (const [entryId, entry] of entries)
      if (!done.has(entryId))
        add(
          `${entry.path}.prerequisites`,
          "Prerequisites must form an acyclic, reachable path.",
        );
  };
  checkGraph(concepts, "Concept");
  checkGraph(levels, "Level");
  for (const [levelId, level] of levels) {
    const seen = new Set<string>([levelId]);
    const ancestorConcepts = new Set<string>();
    const queue = [...level.prerequisites];
    while (queue.length) {
      const ancestorId = queue.pop()!;
      if (seen.has(ancestorId)) continue;
      seen.add(ancestorId);
      const ancestor = levels.get(ancestorId);
      if (!ancestor) continue;
      ancestorConcepts.add(ancestor.conceptId);
      queue.push(...ancestor.prerequisites);
    }
    for (const conceptId of concepts.get(level.conceptId)?.prerequisites ?? [])
      if (!ancestorConcepts.has(conceptId))
        add(
          `${level.path}.prerequisites`,
          `Include an earlier level for prerequisite concept ${conceptId}.`,
        );
  }
  for (const [conceptId, concept] of concepts)
    if (![...levels.values()].some((level) => level.conceptId === conceptId))
      add(concept.path, "Provide a playable level for this concept.");
  return issues;
}
