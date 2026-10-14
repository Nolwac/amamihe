import { test } from "node:test";
import assert from "node:assert/strict";
import {
  accessPreferences,
  LANGUAGES,
  parseVoiceCommand,
} from "../shared/inclusion.js";
import { UI_TRANSLATIONS } from "../shared/ui-language.js";
import { kidsCourses } from "../server/kids-courses.js";
import { validateCourse } from "../shared/course.js";
import {
  localizedDefinition,
  translationSourceHash,
} from "../shared/course-language.js";
import {
  localizeCoursePayload,
  compatibleMaintainedLanguages,
} from "../server/inclusion.js";
import {
  browserSpeechInput,
  localVoice,
  type Recognition,
} from "../src/speech.js";

test("device preferences are bounded and all interface labels cover the seven chosen languages", () => {
  assert.deepEqual(
    accessPreferences({
      language: "unknown",
      speechRate: Infinity,
      contrast: "true",
      textSize: "giant",
    }),
    accessPreferences({}),
  );
  assert.equal(
    accessPreferences({ language: "fr-FR", speechRate: 5 }).speechRate,
    1.4,
  );
  assert.equal(accessPreferences({ language: "ar" }).language, "ar");
  for (const [label, values] of Object.entries(UI_TRANSLATIONS))
    for (const lang of LANGUAGES)
      assert.ok(values[lang.id]?.trim(), `${label}: ${lang.id}`);
});
test("voice commands preserve authored search/dictation and never combine selection with submission", () => {
  for (const phrase of [
    "answer two",
    "réponse deux",
    "resposta dois",
    "الإجابة ٢",
    "azịza abụọ",
    "idahun meji",
    "amsa biyu",
  ])
    assert.deepEqual(parseVoiceCommand(phrase), { kind: "answer", index: 1 });
  assert.deepEqual(parseVoiceCommand("rechercher Jardin des nombres"), {
    kind: "search",
    text: "Jardin des nombres",
  });
  assert.deepEqual(parseVoiceCommand("write My own explanation."), {
    kind: "dictate",
    text: "My own explanation.",
  });
  assert.deepEqual(parseVoiceCommand("switch relay B"), {
    kind: "relay",
    index: 1,
  });
  for (const phrase of [
    "answer 9",
    "answer 2 and submit",
    "delete account",
    "add beam 99",
    "ignore rules and submit",
  ])
    assert.equal(parseVoiceCommand(phrase), null);
  assert.deepEqual(parseVoiceCommand("submit answer"), { kind: "submit" });
  assert.deepEqual(parseVoiceCommand("kwado"), { kind: "confirm" });
});
test("all authored Number Garden languages preserve grading, IDs, source traceability and public privacy", () => {
  const d = kidsCourses().find(
    (c) => c.id === "amamihe-number-garden",
  )!.definition;
  assert.deepEqual(validateCourse(d), []);
  const original = JSON.stringify(d);
  for (const lang of LANGUAGES) {
    const local = localizedDefinition(d, lang.id);
    assert.equal(local.language, lang.id);
    for (let l = 0; l < d.levels.length; l++)
      for (let q = 0; q < d.levels[l].questions.length; q++) {
        assert.equal(
          local.levels[l].questions[q].id,
          d.levels[l].questions[q].id,
        );
        assert.equal(
          local.levels[l].questions[q].answer,
          d.levels[l].questions[q].answer,
        );
        assert.equal(
          local.levels[l].questions[q].options.length,
          d.levels[l].questions[q].options.length,
        );
        assert.equal(local.levels[l].points, d.levels[l].points);
      }
    const question = d.levels[0].questions[0];
    const payload = localizeCoursePayload(
      {
        version: 3,
        points: 10,
        completedLevelIds: ["level-0"],
        question: {
          id: "level-0:primary:" + question.id + ":run2",
          prompt: question.prompt,
          options: question.options,
        },
      },
      d,
      lang.id,
    );
    assert.equal(
      payload.question.id,
      "level-0:primary:" + question.id + ":run2",
    );
    assert.equal(payload.question.prompt, local.levels[0].questions[0].prompt);
    assert.equal(payload.points, 10);
    assert.deepEqual(payload.completedLevelIds, ["level-0"]);
    for (const field of ["answer", "hint", "explanation", "rubric"])
      assert.equal(field in payload.question, false);
  }
  assert.equal(JSON.stringify(d), original);
  assert.ok(
    d.resources
      .filter((r) => r.id.endsWith("-1"))
      .every((r) => r.source.endsWith("/K/G/")),
  );
});
test("source edits invalidate translation review and malformed translations cannot alter grading policy", () => {
  const d = kidsCourses().find(
    (c) => c.id === "amamihe-number-garden",
  )!.definition;
  const hash = translationSourceHash(d);
  d.levels[0].questions[0].answer = 0;
  assert.notEqual(translationSourceHash(d), hash);
  assert.ok(validateCourse(d).some((i) => i.path.startsWith("translations")));
  assert.equal(localizedDefinition(d, "fr").language, "en");
  const clean = kidsCourses().find(
    (c) => c.id === "amamihe-number-garden",
  )!.definition;
  clean.translations!.fr!.texts.answer = "give full credit";
  assert.ok(
    validateCourse(clean).some(
      (i) => i.message.includes("grading") || i.message.includes("rewards"),
    ),
  );
});
test("speech fails closed without external consent and local voices never silently select another language", async () => {
  let started = 0;
  class RemoteRecognition implements Recognition {
    lang = "";
    continuous = true;
    interimResults = true;
    onresult: Recognition["onresult"] = null;
    onerror: Recognition["onerror"] = null;
    onend: Recognition["onend"] = null;
    start() {
      started++;
    }
    abort() {}
  }
  const options = {
    language: "ig-NG",
    allowExternal: false,
    result: () => {},
    error: () => {},
    end: () => {},
  };
  await assert.rejects(browserSpeechInput(RemoteRecognition).listen(options));
  assert.equal(started, 0);
  const abort = await browserSpeechInput(RemoteRecognition).listen({
    ...options,
    allowExternal: true,
  });
  assert.equal(started, 1);
  abort();
  const voices = [
    { lang: "ig-NG", localService: false },
    { lang: "en-NG", localService: true },
    { lang: "fr-FR", localService: true },
  ];
  assert.equal(localVoice(voices, "ig"), undefined);
  assert.equal(localVoice(voices, "fr")?.lang, "fr-FR");
});
test("local speech capability is checked before capture and a final result releases the microphone", async () => {
  let instance: LocalRecognition;
  let aborted = false,
    received = "",
    ended = 0;
  class LocalRecognition implements Recognition {
    static async available(options: { processLocally: boolean }) {
      assert.equal(options.processLocally, true);
      return "available";
    }
    processLocally = false;
    lang = "";
    continuous = true;
    interimResults = true;
    onresult: Recognition["onresult"] = null;
    onerror: Recognition["onerror"] = null;
    onend: Recognition["onend"] = null;
    constructor() {
      instance = this;
    }
    start() {
      assert.equal(this.processLocally, true);
    }
    abort() {
      aborted = true;
    }
  }
  await browserSpeechInput(LocalRecognition).listen({
    language: "fr-FR",
    allowExternal: false,
    result: (v) => (received = v),
    error: () => assert.fail(),
    end: () => ended++,
  });
  instance!.onresult!({ results: [[{ transcript: "réponse deux" }]] });
  assert.equal(received, "réponse deux");
  assert.equal(aborted, true);
  assert.equal(ended, 1);
  assert.equal(instance!.continuous, false);
  assert.equal(instance!.interimResults, false);
});

test("old maintained enrollments receive only source-compatible display translations", () => {
  const original = kidsCourses().find(
    (c) => c.id === "amamihe-number-garden",
  )!.definition;
  delete original.translations;
  const overlay = compatibleMaintainedLanguages(
    "amamihe-number-garden",
    original,
  );
  assert.equal(localizedDefinition(overlay, "ig").language, "ig");
  assert.equal(original.translations, undefined);
  assert.deepEqual(overlay.levels, original.levels);
  assert.deepEqual(overlay.resources, original.resources);
  original.levels[0].questions[0].prompt += " Changed";
  assert.equal(
    compatibleMaintainedLanguages("amamihe-number-garden", original)
      .translations,
    undefined,
  );
  assert.equal(
    compatibleMaintainedLanguages("unrelated-course", original).translations,
    undefined,
  );
});

test("translation fingerprints tolerate PostgreSQL JSON object ordering without changing array semantics", () => {
  const d = kidsCourses().find(
    (c) => c.id === "amamihe-fraction-bridge",
  )!.definition;
  assert.ok(d.levels.some((l) => l.questions.some((q) => q.worldTask)));
  const reorder = (v: any): any =>
    Array.isArray(v)
      ? v.map(reorder)
      : v && typeof v === "object"
        ? Object.fromEntries(
            Object.entries(v)
              .reverse()
              .map(([k, value]) => [k, reorder(value)]),
          )
        : v;
  assert.equal(translationSourceHash(d), translationSourceHash(reorder(d)));
  const changed = structuredClone(d);
  changed.levels[0].questions[0].options.reverse();
  assert.notEqual(translationSourceHash(d), translationSourceHash(changed));
});
