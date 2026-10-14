export const LANGUAGES = [
  { id: "en", name: "English", speech: "en-NG", dir: "ltr" },
  { id: "fr", name: "Français", speech: "fr-FR", dir: "ltr" },
  { id: "pt", name: "Português", speech: "pt-PT", dir: "ltr" },
  { id: "ar", name: "العربية", speech: "ar", dir: "rtl" },
  { id: "ig", name: "Igbo", speech: "ig-NG", dir: "ltr" },
  { id: "yo", name: "Yorùbá", speech: "yo-NG", dir: "ltr" },
  { id: "ha", name: "Hausa", speech: "ha-NG", dir: "ltr" },
] as const;
export type Language = (typeof LANGUAGES)[number]["id"];
export function language(value: unknown): Language {
  return (
    LANGUAGES.find((l) => l.id === String(value).split("-")[0])?.id || "en"
  );
}
export type AccessPreferences = {
  language: Language;
  narration: boolean;
  serverNarration: boolean;
  textSize: "normal" | "large" | "larger";
  contrast: boolean;
  reducedMotion: boolean;
  dataSaver: boolean;
  speechRate: number;
};
export const DEFAULT_ACCESS: AccessPreferences = {
  language: "en",
  narration: false,
  serverNarration: false,
  textSize: "normal",
  contrast: false,
  reducedMotion: false,
  dataSaver: false,
  speechRate: 1,
};
export function accessPreferences(value: unknown): AccessPreferences {
  const v =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  return {
    language: language(v.language),
    narration: v.narration === true,
    serverNarration: v.serverNarration === true,
    textSize:
      v.textSize === "large" || v.textSize === "larger" ? v.textSize : "normal",
    contrast: v.contrast === true,
    reducedMotion: v.reducedMotion === true,
    dataSaver: v.dataSaver === true,
    speechRate:
      typeof v.speechRate === "number" && Number.isFinite(v.speechRate)
        ? Math.max(0.6, Math.min(1.4, v.speechRate))
        : 1,
  };
}
export type VoiceCommand =
  | {
      kind:
        | "read"
        | "where"
        | "nearby"
        | "pause"
        | "start"
        | "submit"
        | "confirm"
        | "cancel"
        | "help"
        | "repeat"
        | "home"
        | "undo"
        | "reset"
        | "enter"
        | "next"
        | "previous"
        | "untimed"
        | "hint";
    }
  | { kind: "search" | "go" | "dictate"; text: string }
  | { kind: "answer"; index: number }
  | { kind: "beam"; units: number }
  | { kind: "relay"; index: 0 | 1 };
export function normalizedSpeech(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[٠-٩]/g, (v) => String(v.charCodeAt(0) - 0x660))
    .replace(/[۰-۹]/g, (v) => String(v.charCodeAt(0) - 0x6f0))
    .toLowerCase()
    .replace(/[.,!?،؟:;\-‐‑–—]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
const verbs: Record<string, VoiceCommand["kind"]> = {};
const add = (kind: VoiceCommand["kind"], expressions: string[]) => {
  for (const expression of expressions)
    verbs[normalizedSpeech(expression)] = kind;
};
add("read", [
  "read question",
  "read exercise",
  "read page",
  "lire la question",
  "lire la page",
  "ler pergunta",
  "ler página",
  "اقرأ السؤال",
  "اقرأ الصفحة",
  "gụọ ajụjụ",
  "gụọ ibe",
  "ka ibeere",
  "ka oju iwe",
  "karanta tambaya",
  "karanta shafi",
]);
add("where", [
  "where am i",
  "describe location",
  "où suis je",
  "onde estou",
  "أين أنا",
  "ebe ka m nọ",
  "nibo ni mo wa",
  "ina nake",
]);
add("nearby", [
  "what is nearby",
  "nearby",
  "à proximité",
  "por perto",
  "ماذا يوجد بالقرب",
  "ihe dị nso",
  "kini o wa nitosi",
  "me ke kusa",
]);
add("pause", [
  "pause",
  "pause section",
  "pausar",
  "توقف",
  "kwụsị",
  "duro",
  "dakata",
]);
add("start", [
  "start",
  "resume",
  "start section",
  "commencer",
  "reprendre",
  "começar",
  "continuar",
  "ابدأ",
  "استأنف",
  "malite",
  "gaa n'ihu",
  "bere",
  "tesiwaju",
  "fara",
  "ci gaba",
]);
add("submit", [
  "submit answer",
  "submit task",
  "envoyer réponse",
  "enviar resposta",
  "أرسل الإجابة",
  "zipụ azịza",
  "fi idahun ranse",
  "aika amsa",
]);
add("confirm", [
  "confirm",
  "confirm answer",
  "confirmer",
  "confirmar",
  "تأكيد",
  "kwado",
  "jerisi",
  "tabbatar",
]);
add("cancel", [
  "cancel",
  "annuler",
  "cancelar",
  "إلغاء",
  "kagbuo",
  "fagilee",
  "soke",
]);
add("repeat", [
  "repeat",
  "répéter",
  "repetir",
  "كرر",
  "kwughachi",
  "tun so",
  "maimaita",
]);
add("help", [
  "help",
  "voice help",
  "aide",
  "ajuda",
  "مساعدة",
  "enyemaka",
  "iranlowo",
  "taimako",
]);
add("enter", [
  "enter adventure",
  "entrer dans l'aventure",
  "entrar na aventura",
  "ادخل المغامرة",
  "banye n'aventure",
  "wo ere",
  "shiga wasa",
]);
add("next", [
  "next page",
  "page suivante",
  "próxima página",
  "الصفحة التالية",
  "ibe ọzọ",
  "oju iwe to kan",
  "shafi na gaba",
]);
add("previous", [
  "previous page",
  "page précédente",
  "página anterior",
  "الصفحة السابقة",
  "ibe gara aga",
  "oju iwe ti tẹlẹ",
  "shafin baya",
]);
add("untimed", [
  "untimed",
  "sans limite de temps",
  "sem limite de tempo",
  "دون حد زمني",
  "enweghị oke oge",
  "laisi opin akoko",
  "ba tare da iyakar lokaci ba",
]);
add("hint", [
  "show hint",
  "afficher un indice",
  "mostrar dica",
  "أظهر التلميح",
  "gosi ntụnye",
  "fi itọka han",
  "nuna alama",
]);
add("home", [
  "return to city",
  "retour en ville",
  "voltar à cidade",
  "العودة إلى المدينة",
  "laghachi n'obodo",
  "pada si ilu",
  "koma gari",
]);
add("undo", [
  "undo beam",
  "undo last beam",
  "annuler la poutre",
  "desfazer viga",
  "تراجع عن العارضة",
  "wepụ osisi",
  "yo igi",
  "cire katako",
]);
add("reset", [
  "reset experiment",
  "réinitialiser expérience",
  "reiniciar experiência",
  "أعد التجربة",
  "malite nnwale ọzọ",
  "tun idanwo bere",
  "sake gwaji",
]);
const prefixes: [VoiceCommand["kind"], string[]][] = [
  [
    "search",
    [
      "search",
      "rechercher",
      "chercher",
      "pesquisar",
      "buscar",
      "ابحث عن",
      "chọọ",
      "wa",
      "nemo",
    ],
  ],
  [
    "go",
    ["go to", "aller à", "ir para", "اذهب إلى", "gaa na", "lo si", "je zuwa"],
  ],
  ["dictate", ["write", "écrire", "escrever", "اكتب", "dee", "ko", "rubuta"]],
  [
    "answer",
    [
      "choose answer",
      "answer",
      "option",
      "choisir réponse",
      "réponse",
      "escolher resposta",
      "resposta",
      "اختر الإجابة",
      "الإجابة",
      "họrọ azịza",
      "azịza",
      "yan idahun",
      "idahun",
      "zabi amsa",
      "amsa",
    ],
  ],
  [
    "beam",
    [
      "add beam",
      "ajouter poutre",
      "adicionar viga",
      "أضف عارضة",
      "tinye osisi",
      "fi igi kun",
      "kara katako",
    ],
  ],
  [
    "relay",
    [
      "switch relay",
      "toggle relay",
      "commuter relais",
      "alternar relé",
      "بدل المرحل",
      "gbanwee relay",
      "yi relay pada",
      "sauya relay",
    ],
  ],
];
const numbers = [
  ["one", "un", "um", "واحد", "otu", "okan", "daya", "a"],
  ["two", "deux", "dois", "اثنان", "abụọ", "meji", "biyu", "b"],
  ["three", "trois", "três", "ثلاثة", "atọ", "meta", "uku", "c"],
  ["four", "quatre", "quatro", "أربعة", "anọ", "merin", "hudu", "d"],
  ["five", "cinq", "cinco", "خمسة", "ise", "marun", "biyar", "e"],
  ["six", "six", "seis", "ستة", "isii", "mefa", "shida", "f"],
  ["seven", "sept", "sete", "سبعة", "asaa", "meje", "bakwai", "g"],
  ["eight", "huit", "oito", "ثمانية", "asatọ", "mejo", "takwas", "h"],
].map((list) => list.map(normalizedSpeech));
export function parseVoiceCommand(input: string): VoiceCommand | null {
  if (input.length > 500) return null;
  const normalized = normalizedSpeech(input);
  const kind = verbs[normalized];
  if (kind) return { kind } as VoiceCommand;
  for (const [kind, list] of prefixes)
    for (const prefix of list) {
      const start = normalizedSpeech(prefix) + " ";
      if (!normalized.startsWith(start)) continue;
      const tail = normalized.slice(start.length).trim();
      if (!tail) return null;
      if (kind === "search" || kind === "go" || kind === "dictate") {
        // Preserve diacritics, punctuation and case in authored searches/dictation.
        const words = prefix.trim().split(/\s+/).length;
        return {
          kind,
          text: input.trim().split(/\s+/).slice(words).join(" ").slice(0, 200),
        };
      }
      const numeric = /^\d+$/.test(tail)
        ? Number(tail)
        : numbers.findIndex((n) => n.includes(tail)) + 1;
      if (kind === "answer" && numeric >= 1 && numeric <= 8)
        return { kind, index: numeric - 1 };
      if (kind === "beam" && numeric >= 1 && numeric <= 3)
        return { kind, units: numeric };
      if (kind === "relay" && (tail === "a" || tail === "b"))
        return { kind, index: tail === "a" ? 0 : 1 };
      return null;
    }
  return null;
}
