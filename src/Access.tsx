import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import {
  accessPreferences,
  DEFAULT_ACCESS,
  LANGUAGES,
  parseVoiceCommand,
  type AccessPreferences,
  type VoiceCommand,
} from "../shared/inclusion";
import { translate } from "../shared/ui-language";
import {
  browserSpeechInput,
  localVoice,
  type RecognitionConstructor,
} from "./speech";
import { clearDeviceStudy, OfflineStudyLibrary } from "./OfflineStudy";
import "./access.css";

const PREFERENCE_KEY = "amamihe-access-v1";
let currentLanguage = "en";
export function interfaceLanguage() {
  return currentLanguage;
}
type Respond = (text: string, language?: string) => void;
type CommandDetail = {
  command: VoiceCommand;
  respond: Respond;
  handled: boolean;
};
const commandHandlers: {
  priority: number;
  run: (command: VoiceCommand, respond: Respond) => boolean;
}[] = [];
type AccessValue = {
  preferences: AccessPreferences;
  setPreferences: (value: Partial<AccessPreferences>) => void;
  t: (text: string) => string;
  announce: (text: string, language?: string, speak?: boolean) => void;
  speak: (text: string, language?: string) => void;
  stopSpeech: () => void;
  message: string;
};
const AccessContext = createContext<AccessValue | null>(null);
export function useAccess() {
  const value = useContext(AccessContext);
  if (!value) throw new Error("AccessProvider is required.");
  return value;
}
export function useVoiceCommands(
  handler: (command: VoiceCommand, respond: Respond) => boolean,
  priority = 0,
) {
  const latest = useRef(handler);
  latest.current = handler;
  useEffect(() => {
    const entry = {
      priority,
      run: (command: VoiceCommand, respond: Respond) =>
        latest.current(command, respond),
    };
    commandHandlers.push(entry);
    return () => {
      const index = commandHandlers.indexOf(entry);
      if (index >= 0) commandHandlers.splice(index, 1);
    };
  }, [priority]);
}
export function AccessProvider({ children }: { children: ReactNode }) {
  const [preferences, update] = useState<AccessPreferences>(() => {
    try {
      const saved = localStorage.getItem(PREFERENCE_KEY);
      return saved
        ? accessPreferences(JSON.parse(saved))
        : {
            ...DEFAULT_ACCESS,
            reducedMotion: matchMedia("(prefers-reduced-motion: reduce)")
              .matches,
          };
    } catch {
      return DEFAULT_ACCESS;
    }
  });
  const [message, setMessage] = useState("");
  currentLanguage = preferences.language;
  const audio = useRef<HTMLAudioElement | null>(null);
  const audioUrl = useRef<string | undefined>(undefined);
  const speechRequest = useRef<AbortController | null>(null);
  const [playback, setPlayback] = useState("");
  const stopSpeech = useCallback(() => {
    window.speechSynthesis?.cancel();
    speechRequest.current?.abort();
    audio.current?.pause();
    if (audioUrl.current) URL.revokeObjectURL(audioUrl.current);
    audioUrl.current = undefined;
    setPlayback("");
  }, []);
  const t = (text: string) => translate(text, preferences.language);
  const speak = (text: string, lang: string = preferences.language) => {
    if (!text.trim()) return;
    stopSpeech();
    const voice = window.speechSynthesis
      ? (localVoice(window.speechSynthesis.getVoices(), lang) as
          SpeechSynthesisVoice | undefined)
      : undefined;
    if (!voice) {
      if (!preferences.serverNarration || !navigator.onLine) {
        setMessage(
          t(
            "No device voice matches this language. The text remains available to your screen reader.",
          ),
        );
        return;
      }
      const controller = new AbortController();
      speechRequest.current = controller;
      void fetch("/api/speech/narrate", {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: text.slice(0, 8000),
          language: lang,
          rate: preferences.speechRate,
        }),
      })
        .then(async (r) => {
          if (!r.ok) {
            const result = await r.json();
            throw new Error(result.error);
          }
          const blob = await r.blob();
          if (controller.signal.aborted) return;
          const url = URL.createObjectURL(blob);
          audioUrl.current = url;
          setPlayback(url);
        })
        .catch((e) => {
          if (!controller.signal.aborted) setMessage(t(e.message));
        });
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text.slice(0, 8000));
    utterance.lang = lang;
    utterance.voice = voice;
    utterance.rate = preferences.speechRate;
    window.speechSynthesis.speak(utterance);
  };
  const announce = (text: string, lang?: string, explicit = false) => {
    setMessage(text);
    if (preferences.narration || explicit) speak(text, lang);
  };
  useEffect(() => {
    try {
      localStorage.setItem(PREFERENCE_KEY, JSON.stringify(preferences));
    } catch {
      /* Optional device storage. */
    }
    document.documentElement.lang = preferences.language;
    document.documentElement.dir = LANGUAGES.find(
      (l) => l.id === preferences.language,
    )!.dir;
    document.documentElement.dataset.accessText = preferences.textSize;
    document.documentElement.dataset.accessContrast = String(
      preferences.contrast,
    );
    document.documentElement.dataset.accessMotion = String(
      preferences.reducedMotion,
    );
    document.documentElement.dataset.dataSaver = String(preferences.dataSaver);
    stopSpeech();
  }, [preferences]);
  useEffect(() => {
    window.speechSynthesis?.getVoices();
    return () => {
      window.speechSynthesis?.cancel();
      speechRequest.current?.abort();
      audio.current?.pause();
      if (audioUrl.current) URL.revokeObjectURL(audioUrl.current);
    };
  }, []);
  return (
    <AccessContext.Provider
      value={{
        preferences,
        setPreferences: (p) => update((v) => accessPreferences({ ...v, ...p })),
        t,
        announce,
        speak,
        stopSpeech,
        message,
      }}
    >
      <a className="skip-link" href="#learner-content">
        {t("My learning")}
      </a>
      {children}
      <AccessControls />
      {playback && (
        <audio
          ref={audio}
          src={playback}
          controls
          className="narration-player"
          aria-label="Lesson narration"
          onCanPlay={() =>
            void audio.current
              ?.play()
              .catch(() =>
                setMessage("Narration is ready. Use the audio play control."),
              )
          }
          onEnded={stopSpeech}
        />
      )}
      <p
        className="screen-reader-status"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {message}
      </p>
    </AccessContext.Provider>
  );
}
const samples: Record<string, string[]> = {
  en: [
    "read question",
    "where am I",
    "what is nearby",
    "search fractions",
    "go to Number Garden",
    "answer 2",
    "submit answer",
    "confirm",
    "pause",
    "resume",
    "add beam 2",
    "switch relay A",
    "write My explanation",
  ],
  fr: [
    "lire la question",
    "où suis je",
    "à proximité",
    "rechercher fractions",
    "aller à Number Garden",
    "réponse 2",
    "envoyer réponse",
    "confirmer",
    "pause",
    "reprendre",
    "ajouter poutre 2",
    "commuter relais A",
    "écrire Mon explication",
  ],
  pt: [
    "ler pergunta",
    "onde estou",
    "por perto",
    "pesquisar frações",
    "ir para Number Garden",
    "resposta 2",
    "enviar resposta",
    "confirmar",
    "pausar",
    "continuar",
    "adicionar viga 2",
    "alternar relé A",
    "escrever A minha explicação",
  ],
  ar: [
    "اقرأ السؤال",
    "أين أنا",
    "ماذا يوجد بالقرب",
    "ابحث عن الكسور",
    "اذهب إلى Number Garden",
    "الإجابة ٢",
    "أرسل الإجابة",
    "تأكيد",
    "توقف",
    "استأنف",
    "أضف عارضة ٢",
    "بدل المرحل A",
    "اكتب شرحي",
  ],
  ig: [
    "gụọ ajụjụ",
    "ebe ka m nọ",
    "ihe dị nso",
    "chọọ fractions",
    "gaa na Number Garden",
    "azịza 2",
    "zipụ azịza",
    "kwado",
    "kwụsị",
    "malite",
    "tinye osisi 2",
    "gbanwee relay A",
    "dee Nkọwa m",
  ],
  yo: [
    "ka ibeere",
    "nibo ni mo wa",
    "kini o wa nitosi",
    "wa fractions",
    "lo si Number Garden",
    "idahun 2",
    "fi idahun ranse",
    "jerisi",
    "duro",
    "bere",
    "fi igi kun 2",
    "yi relay pada A",
    "ko Alaye mi",
  ],
  ha: [
    "karanta tambaya",
    "ina nake",
    "me ke kusa",
    "nemo fractions",
    "je zuwa Number Garden",
    "amsa 2",
    "aika amsa",
    "tabbatar",
    "dakata",
    "fara",
    "kara katako 2",
    "sauya relay A",
    "rubuta Bayanin nawa",
  ],
};
function AccessControls() {
  const {
    preferences: p,
    setPreferences,
    t,
    announce,
    stopSpeech,
    message,
  } = useAccess();
  const [open, setOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [external, setExternal] = useState(false); // Consent is deliberately session-only.
  const [input, setInput] = useState("");
  const [guide, setGuide] = useState(false);
  const stop = useRef<() => void>(() => {});
  const generation = useRef(0);
  const dialog = useRef<HTMLDivElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  const last = useRef("");
  function execute(text: string, spoken = false) {
    const command = parseVoiceCommand(text);
    if (!command)
      return announce(
        t("Command not recognized. Open the command guide or type a command."),
        undefined,
        spoken,
      );
    if (command.kind === "help") {
      setGuide(true);
      return;
    }
    if (command.kind === "repeat")
      return announce(last.current, undefined, spoken);
    const detail: CommandDetail = {
      command,
      handled: false,
      respond: (text, lang) => {
        last.current = text;
        announce(text, lang, spoken);
      },
    };
    for (const handler of [...commandHandlers].sort(
      (a, b) => b.priority - a.priority,
    ))
      if (handler.run(command, detail.respond)) {
        detail.handled = true;
        break;
      }
    if (!detail.handled)
      announce(
        t("This command is not available in the current place."),
        undefined,
        spoken,
      );
  }
  async function listen() {
    stop.current();
    const serial = ++generation.current;
    stopSpeech();
    setListening(true);
    const w = window as unknown as {
      SpeechRecognition?: RecognitionConstructor;
      webkitSpeechRecognition?: RecognitionConstructor;
    };
    try {
      const abort = await browserSpeechInput(
        w.SpeechRecognition || w.webkitSpeechRecognition,
      ).listen({
        language: LANGUAGES.find((l) => l.id === p.language)!.speech,
        allowExternal: external,
        result: (text) => {
          if (serial === generation.current) {
            setInput(text);
            execute(text, true);
          }
        },
        error: (error) => {
          if (serial === generation.current) announce(t(error));
        },
        end: () => {
          if (serial === generation.current) setListening(false);
        },
      });
      if (serial !== generation.current) abort();
      else stop.current = abort;
    } catch (e) {
      if (serial === generation.current) {
        setListening(false);
        announce(
          t(
            e instanceof Error
              ? e.message
              : "Speech is unavailable here. Use typed commands or the keyboard.",
          ),
        );
      }
    }
  }
  const close = () => {
    generation.current++;
    stop.current();
    setListening(false);
    setOpen(false);
    setInput("");
    launcher.current?.focus();
  };
  useEffect(() => {
    const abort = () => {
      generation.current++;
      stop.current();
      setListening(false);
    };
    window.addEventListener("blur", abort);
    return () => {
      window.removeEventListener("blur", abort);
      abort();
    };
  }, []);
  useEffect(() => {
    generation.current++;
    stop.current();
    setListening(false);
  }, [p.language, external]);
  useEffect(() => {
    if (!open) return;
    dialog.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }, [open]);
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("amamihe-access-open", { detail: open }),
    );
  }, [open]);
  return (
    <>
      <button
        ref={launcher}
        className="access-launcher"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        {t("Access & language")}
      </button>
      {open && (
        <div className="access-backdrop">
          <div
            ref={dialog}
            className="access-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="access-title"
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                close();
              }
              if (e.key !== "Tab") return;
              const nodes = Array.from(
                dialog.current!.querySelectorAll<HTMLElement>(
                  "button:not(:disabled), input:not(:disabled), select, textarea, a[href]",
                ),
              );
              const first = nodes[0],
                end = nodes.at(-1);
              if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                end?.focus();
              } else if (!e.shiftKey && document.activeElement === end) {
                e.preventDefault();
                first?.focus();
              }
            }}
          >
            <header>
              <h2 id="access-title">{t("Access & language")}</h2>
              <button onClick={close}>{t("Close")}</button>
            </header>
            <label>
              {t("Language")}
              <select
                aria-label={t("Language")}
                value={p.language}
                onChange={(e) =>
                  setPreferences({
                    language: e.target.value as AccessPreferences["language"],
                  })
                }
              >
                {LANGUAGES.map((l) => (
                  <option key={l.id} value={l.id} lang={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t("Text size")}
              <select
                aria-label={t("Text size")}
                value={p.textSize}
                onChange={(e) =>
                  setPreferences({
                    textSize: e.target.value as AccessPreferences["textSize"],
                  })
                }
              >
                {["normal", "large", "larger"].map((size) => (
                  <option key={size} value={size}>
                    {t(size[0].toUpperCase() + size.slice(1))}
                  </option>
                ))}
              </select>
            </label>
            {(
              [
                ["contrast", "High contrast"],
                ["reducedMotion", "Reduced motion"],
                ["dataSaver", "Save mobile data"],
                ["narration", "Read aloud automatically"],
                ["serverNarration", "Allow protected server narration"],
              ] as const
            ).map(([key, label]) => (
              <label className="access-check" key={key}>
                <input
                  type="checkbox"
                  checked={p[key]}
                  onChange={(e) => setPreferences({ [key]: e.target.checked })}
                />
                {t(label)}
              </label>
            ))}
            <p>
              {t(
                "Server narration uses mobile data and requires sign-in. Unsupported voices remain text.",
              )}
            </p>
            <label>
              {t("Speech speed")}
              <input
                type="range"
                min="0.6"
                max="1.4"
                step="0.1"
                value={p.speechRate}
                onChange={(e) =>
                  setPreferences({ speechRate: Number(e.target.value) })
                }
              />
            </label>
            <section>
              <h3>{t("Voice commands")}</h3>
              <p>{t("Local speech only")}</p>
              <label className="access-check">
                <input
                  type="checkbox"
                  checked={external}
                  onChange={(e) => setExternal(e.target.checked)}
                />
                {t("Allow browser speech service")}
              </label>
              <p>
                {t(
                  "Audio may leave your device through your browser's speech provider. Amamihe does not record or store microphone audio.",
                )}
              </p>
              <button
                onClick={
                  listening
                    ? () => {
                        generation.current++;
                        stop.current();
                        setListening(false);
                      }
                    : () => void listen()
                }
              >
                {t(listening ? "Stop listening" : "Listen for a command")}
              </button>
              {listening && <p role="status">{t("Listening…")}</p>}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  execute(input);
                }}
              >
                <label>
                  {t("Type a command")}
                  <input
                    value={input}
                    maxLength={500}
                    onChange={(e) => setInput(e.target.value)}
                  />
                </label>
                <button>{t("Run command")}</button>
              </form>
              <button onClick={() => setGuide(!guide)} aria-expanded={guide}>
                {t("Command guide")}
              </button>
              {guide && (
                <ul>
                  {samples[p.language].map((sample) => (
                    <li key={sample}>
                      <button onClick={() => setInput(sample)}>{sample}</button>
                    </li>
                  ))}
                </ul>
              )}
              <button onClick={stopSpeech}>{t("Stop speaking")}</button>
              {message && <p className="access-feedback">{message}</p>}
            </section>
            <OfflineStudyLibrary />
            <section>
              <h3>{t("Privacy & your data")}</h3>
              <p>
                {t(
                  "Your email and progress stay on the protected server. Amamihe does not store microphone audio or command history.",
                )}
              </p>
              <p>
                {t(
                  "Clear saved lessons and private drafts after using a shared device. External resources have their own privacy rules.",
                )}
              </p>
              <button
                onClick={() =>
                  void fetch("/api/account/export", { cache: "no-store" })
                    .then(async (r) => {
                      if (!r.ok)
                        throw new Error("Sign in to download your data.");
                      const data = await r.json();
                      const url = URL.createObjectURL(
                        new Blob([JSON.stringify(data, null, 2)], {
                          type: "application/json",
                        }),
                      );
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = "amamihe-account-data.json";
                      a.click();
                      URL.revokeObjectURL(url);
                      announce(
                        t(
                          data.truncated
                            ? "Export reached its size limit. The downloaded file lists omitted categories."
                            : "Account data downloaded.",
                        ),
                      );
                    })
                    .catch((e) => announce(e.message))
                }
              >
                {t("Download my account data")}
              </button>
              <button
                onClick={() =>
                  void clearDeviceStudy().then(() =>
                    announce(
                      t(
                        "Saved device data cleared. Your server progress is unchanged.",
                      ),
                    ),
                  )
                }
              >
                {t("Clear saved device data")}
              </button>
            </section>
          </div>
        </div>
      )}
    </>
  );
}
