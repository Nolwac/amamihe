import { useEffect, useRef, useState } from "react";
import type { CourseDefinition } from "../shared/course";
import {
  translationFields,
  translationSourceHash,
  validateTranslations,
  type CourseTranslation,
} from "../shared/course-language";
import { LANGUAGES, type Language } from "../shared/inclusion";
import { useAccess } from "./Access";

export default function CourseTranslations({
  definition,
  onSave,
}: {
  definition: CourseDefinition;
  onSave: (value: CourseDefinition["translations"]) => void;
}) {
  const { t } = useAccess();
  const [open, setOpen] = useState(false);
  const [lang, setLang] = useState<Language>(
    LANGUAGES.find((l) => l.id !== definition.language)!.id,
  );
  const [page, setPage] = useState(0);
  const [variant, setVariant] = useState<CourseTranslation>();
  const [error, setError] = useState("");
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const timer = setTimeout(
      () => panel.current?.querySelector<HTMLButtonElement>("button")?.focus(),
      0,
    );
    const trap = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const items = Array.from(
        panel.current?.querySelectorAll<HTMLElement>(
          "button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled)",
        ) || [],
      );
      const first = items[0],
        last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", trap);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("keydown", trap);
      previous?.focus();
    };
  }, [open]);
  const fields = translationFields(definition);
  useEffect(() => {
    setVariant(
      definition.translations?.[lang] || {
        sourceHash: translationSourceHash(definition),
        confirmed: false,
        note: "",
        texts: Object.fromEntries(fields.map((f) => [f.key, f.value])),
      },
    );
    setPage(0);
    setError("");
  }, [lang, open]);
  function patch(key: string, value: string | string[]) {
    setVariant((v) =>
      v ? { ...v, confirmed: false, texts: { ...v.texts, [key]: value } } : v,
    );
  }
  return (
    <section className="studio-inspector-section" lang="en">
      <h3>Authored lesson languages</h3>
      <p>
        Translate the same learning tasks without changing their answers or
        progress. Source edits invalidate the review. Every option keeps its
        original position. Learners can keep using the source language.
      </p>
      <button className="course-secondary" onClick={() => setOpen(true)}>
        Edit lesson translations
      </button>
      {open && variant && (
        <div className="access-backdrop">
          <div
            className="access-panel"
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-labelledby="translation-title"
            onKeyDown={(e) => {
              if (e.key === "Escape") setOpen(false);
            }}
          >
            <header>
              <h2 id="translation-title">Authored lesson translation</h2>
              <button onClick={() => setOpen(false)}>{t("Close")}</button>
            </header>
            <label>
              {t("Language")}
              <select
                value={lang}
                onChange={(e) => setLang(e.target.value as Language)}
              >
                {LANGUAGES.filter((l) => l.id !== definition.language).map(
                  (l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ),
                )}
              </select>
            </label>
            {fields.slice(page * 8, page * 8 + 8).map((f) => (
              <fieldset key={f.key}>
                <legend>{f.label}</legend>
                <p lang={definition.language}>
                  {Array.isArray(f.value)
                    ? f.value.map((o, i) => `${i + 1}. ${o}`).join(" · ")
                    : f.value}
                </p>
                {Array.isArray(f.value) ? (
                  f.value.map((_, i) => (
                    <label key={i}>
                      Translated option {i + 1}
                      <input
                        lang={lang}
                        dir={lang === "ar" ? "rtl" : "ltr"}
                        value={
                          Array.isArray(variant.texts[f.key])
                            ? variant.texts[f.key][i]
                            : ""
                        }
                        maxLength={300}
                        onChange={(e) => {
                          const options = [
                            ...(variant.texts[f.key] as string[]),
                          ];
                          options[i] = e.target.value;
                          patch(f.key, options);
                        }}
                      />
                    </label>
                  ))
                ) : (
                  <label>
                    Translation
                    <textarea
                      lang={lang}
                      dir={lang === "ar" ? "rtl" : "ltr"}
                      value={String(variant.texts[f.key] || "")}
                      maxLength={f.key.endsWith("/content") ? 60000 : 4000}
                      onChange={(e) => patch(f.key, e.target.value)}
                    />
                  </label>
                )}
              </fieldset>
            ))}
            <nav>
              <button disabled={!page} onClick={() => setPage(page - 1)}>
                {t("Previous page")}
              </button>
              <span>
                {page + 1} / {Math.ceil(fields.length / 8)}
              </span>
              <button
                disabled={(page + 1) * 8 >= fields.length}
                onClick={() => setPage(page + 1)}
              >
                {t("Next page")}
              </button>
            </nav>
            <label>
              Language review / source note
              <textarea
                value={variant.note}
                minLength={10}
                maxLength={500}
                onChange={(e) =>
                  setVariant({
                    ...variant,
                    note: e.target.value,
                    confirmed: false,
                  })
                }
              />
            </label>
            <label className="access-check">
              <input
                type="checkbox"
                checked={variant.confirmed}
                onChange={(e) =>
                  setVariant({
                    ...variant,
                    confirmed: e.target.checked,
                    sourceHash: translationSourceHash(definition),
                  })
                }
              />
              I checked every translated field against the source, including
              meaning and answer-option order. This is a publisher declaration,
              not independent certification.
            </label>
            {error && <p role="alert">{error}</p>}
            <button
              onClick={() => {
                const next = { ...definition.translations, [lang]: variant };
                const issues = validateTranslations({
                  ...definition,
                  translations: { [lang]: variant },
                });
                if (issues.length) {
                  setError(
                    issues
                      .map((i) => i.message)
                      .slice(0, 3)
                      .join(" "),
                  );
                  return;
                }
                onSave(next);
                setOpen(false);
              }}
            >
              {t("Save")}
            </button>
            <button
              onClick={() => {
                const next = { ...definition.translations };
                delete next[lang];
                onSave(next);
                setOpen(false);
              }}
            >
              Remove this language
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
