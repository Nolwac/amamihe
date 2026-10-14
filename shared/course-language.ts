import type { CourseDefinition, ValidationIssue } from "./course.js";
import { LANGUAGES, type Language } from "./inclusion.js";
import { sha256 } from "@noble/hashes/sha2.js";
export type CourseTranslation = {
  sourceHash: string;
  confirmed: boolean;
  note: string;
  texts: Record<string, string | string[]>;
};
export type TranslationField = {
  key: string;
  label: string;
  value: string | string[];
};
export function translationFields(d: CourseDefinition): TranslationField[] {
  return [
    { key: "title", label: "Course title", value: d.title },
    { key: "summary", label: "Course summary", value: d.summary },
    ...d.concepts.map((c) => ({
      key: `concept/${c.id}/title`,
      label: `Concept: ${c.title}`,
      value: c.title,
    })),
    ...d.resources.flatMap((r) => [
      {
        key: `resource/${r.id}/title`,
        label: `Resource: ${r.title}`,
        value: r.title,
      },
      ...(["reading", "drawing"].includes(r.kind)
        ? [
            {
              key: `resource/${r.id}/content`,
              label: `Reading: ${r.title}`,
              value: r.content,
            },
          ]
        : []),
    ]),
    ...d.levels.flatMap((l) => [
      {
        key: `level/${l.id}/title`,
        label: `Level: ${l.title}`,
        value: l.title,
      },
      ...[...l.questions, ...l.retryQuestions].flatMap((q) =>
        (["prompt", "options", "hint", "explanation"] as const).map(
          (field) => ({
            key: `question/${q.id}/${field}`,
            label: `${q.id}: ${field}`,
            value: q[field],
          }),
        ),
      ),
    ]),
  ];
}
export function validateTranslations(d: CourseDefinition): ValidationIssue[] {
  if (d.translations === undefined) return [];
  const issues: ValidationIssue[] = [];
  const fields = translationFields(d);
  if (
    !d.translations ||
    typeof d.translations !== "object" ||
    Array.isArray(d.translations)
  )
    return [
      { path: "translations", message: "Provide authored translations." },
    ];
  const entries = Object.entries(d.translations);
  if (entries.length > 6)
    issues.push({
      path: "translations",
      message: "Use at most six additional languages.",
    });
  for (const [lang, item] of entries) {
    const path = `translations.${lang}`;
    if (!LANGUAGES.some((l) => l.id === lang) || lang === d.language)
      issues.push({ path, message: "Choose a supported additional language." });
    if (
      !item ||
      typeof item !== "object" ||
      Array.isArray(item) ||
      item.confirmed !== true ||
      item.sourceHash !== translationSourceHash(d) ||
      typeof item.note !== "string" ||
      item.note.trim().length < 10 ||
      item.note.length > 500 ||
      !item.texts ||
      typeof item.texts !== "object" ||
      Array.isArray(item.texts)
    ) {
      issues.push({
        path,
        message:
          "Confirm the translation and describe its source/language review.",
      });
      continue;
    }
    const allowed = new Set(fields.map((f) => f.key));
    if (
      Object.keys(item).some(
        (key) => !["sourceHash", "confirmed", "note", "texts"].includes(key),
      ) ||
      Object.keys(item.texts).some((key) => !allowed.has(key))
    )
      issues.push({
        path,
        message:
          "Translations may change only authored display text, never answers, IDs, prerequisites or rewards.",
      });
    for (const field of fields) {
      const value = item.texts[field.key];
      const bounded = (v: unknown) =>
        typeof v === "string" &&
        (field.value === "" || v.trim().length > 0) &&
        v.length <=
          (field.key.endsWith("/content")
            ? 60000
            : field.key === "summary"
              ? 2000
              : 4000);
      if (
        Array.isArray(field.value)
          ? !Array.isArray(value) ||
            value.length !== field.value.length ||
            !value.every(bounded)
          : !bounded(value)
      )
        issues.push({
          path: `${path}.texts.${field.key}`,
          message:
            "Translate every display field and keep answer options in their original order.",
        });
      if (issues.length >= 100) return issues;
    }
  }
  return issues;
}
export function availableCourseLanguages(d: CourseDefinition) {
  return [
    d.language,
    ...Object.entries(d.translations || {})
      .filter(
        ([, v]) => v.confirmed && v.sourceHash === translationSourceHash(d),
      )
      .map(([lang]) => lang),
  ];
}
export function translationSourceHash(d: CourseDefinition) {
  const source = {
    language: d.language,
    fields: translationFields(d),
    grading: d.levels.map((l) => ({
      id: l.id,
      prerequisites: l.prerequisites,
      points: l.points,
      questions: [...l.questions, ...l.retryQuestions].map((q) => ({
        id: q.id,
        answer: q.answer,
        rubric: q.rubric,
        worldTask: q.worldTask,
      })),
    })),
  };
  return Array.from(
    sha256(new TextEncoder().encode(JSON.stringify(source))),
    (v) => v.toString(16).padStart(2, "0"),
  ).join("");
}
export function localizedDefinition(d: CourseDefinition, requested: Language) {
  const result = structuredClone(d);
  const variant = d.translations?.[requested];
  delete result.translations;
  if (!variant || !variant.confirmed || validateTranslations(d).length)
    return result;
  const text = (key: string, base: string) =>
    typeof variant.texts[key] === "string"
      ? (variant.texts[key] as string)
      : base;
  result.language = requested;
  result.title = text("title", d.title);
  result.summary = text("summary", d.summary);
  for (const c of result.concepts)
    c.title = text(`concept/${c.id}/title`, c.title);
  for (const r of result.resources) {
    r.title = text(`resource/${r.id}/title`, r.title);
    r.content = text(`resource/${r.id}/content`, r.content);
  }
  for (const l of result.levels) {
    l.title = text(`level/${l.id}/title`, l.title);
    for (const q of [...l.questions, ...l.retryQuestions]) {
      for (const key of ["prompt", "hint", "explanation"] as const)
        q[key] = text(`question/${q.id}/${key}`, q[key]);
      const options = variant.texts[`question/${q.id}/options`];
      if (Array.isArray(options)) q.options = [...options];
    }
  }
  return result;
}
