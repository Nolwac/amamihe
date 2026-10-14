export type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  processLocally?: boolean;
  onresult:
    | ((event: {
        results: ArrayLike<ArrayLike<{ transcript: string }>>;
      }) => void)
    | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  abort: () => void;
};
export type RecognitionConstructor = {
  new (): Recognition;
  available?: (options: {
    langs: string[];
    processLocally: boolean;
  }) => Promise<string>;
};
export interface SpeechInputProvider {
  listen(options: {
    language: string;
    allowExternal: boolean;
    result: (text: string) => void;
    error: (message: string) => void;
    end: () => void;
  }): Promise<() => void>;
}
export function browserSpeechInput(
  ctor?: RecognitionConstructor,
): SpeechInputProvider {
  return {
    async listen(options) {
      if (!ctor)
        throw new Error(
          "Speech is unavailable here. Use typed commands or the keyboard.",
        );
      const recognition = new ctor();
      if (!options.allowExternal) {
        if (!("processLocally" in recognition) || !ctor.available)
          throw new Error(
            "Speech is unavailable here. Use typed commands or the keyboard.",
          );
        const state = await ctor.available({
          langs: [options.language],
          processLocally: true,
        });
        // No silent downloads of large language packs on limited data plans.
        if (state !== "available")
          throw new Error(
            "Speech is unavailable here. Use typed commands or the keyboard.",
          );
        recognition.processLocally = true;
      } else if ("processLocally" in recognition)
        recognition.processLocally = false;
      recognition.lang = options.language;
      recognition.continuous = false;
      recognition.interimResults = false;
      let ended = false;
      let timer: ReturnType<typeof setTimeout>;
      const end = () => {
        if (ended) return;
        ended = true;
        clearTimeout(timer);
        recognition.onresult = null;
        recognition.onerror = null;
        recognition.onend = null;
        options.end();
      };
      const abort = () => {
        recognition.abort();
        end();
      };
      recognition.onresult = (e) => {
        const text = e.results[0]?.[0]?.transcript?.slice(0, 500);
        recognition.abort();
        end();
        if (text) options.result(text);
      };
      recognition.onerror = (e) => {
        options.error(
          e.error === "not-allowed"
            ? "Microphone permission was denied. Typed commands still work."
            : "Speech could not be recognized. Try again or type a command.",
        );
        end();
      };
      recognition.onend = end;
      timer = setTimeout(abort, 15000);
      try {
        recognition.start();
      } catch (e) {
        end();
        throw e;
      }
      return abort;
    },
  };
}
export function localVoice(
  voices: Pick<SpeechSynthesisVoice, "lang" | "localService">[],
  lang: string,
) {
  const base = lang.toLowerCase().split("-")[0];
  return (
    voices.find(
      (v) => v.localService && v.lang.toLowerCase() === lang.toLowerCase(),
    ) ||
    voices.find(
      (v) => v.localService && v.lang.toLowerCase().split("-")[0] === base,
    )
  );
}
