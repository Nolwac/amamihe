import type { Theme } from "../shared/course";

type Sound =
  | "click"
  | "start"
  | "pause"
  | "jump"
  | "slide"
  | "strike"
  | "impact"
  | "correct"
  | "wrong"
  | "clear"
  | "game-over"
  | "portal"
  | "purchase"
  | "footstep";
type Settings = {
  enabled: boolean;
  muted: boolean;
  volume: number;
  music: number;
  effects: number;
};
type AudioTheme = Theme | "city";
const STORAGE_KEY = "amamihe-audio-v1";
const defaults: Settings = {
  enabled: false,
  muted: false,
  volume: 0.85,
  music: 0.6,
  effects: 0.85,
};
const themes: Record<
  AudioTheme,
  { bpm: number; notes: number[]; bass: number; type: OscillatorType }
> = {
  city: {
    bpm: 88,
    notes: [60, 64, 67, 69, 67, 64, 62, 55],
    bass: 36,
    type: "sine",
  },
  "temple-chase": {
    bpm: 112,
    notes: [50, 57, 53, 57, 50, 60, 57, 53],
    bass: 26,
    type: "triangle",
  },
  racing: {
    bpm: 136,
    notes: [60, 67, 72, 67, 64, 69, 74, 69],
    bass: 36,
    type: "triangle",
  },
  wrestling: {
    bpm: 108,
    notes: [43, 43, 46, 48, 43, 50, 48, 46],
    bass: 31,
    type: "triangle",
  },
  workshop: {
    bpm: 76,
    notes: [60, 64, 67, 71, 69, 67, 64, 62],
    bass: 36,
    type: "sine",
  },
};
const frequency = (note: number) => 440 * 2 ** ((note - 69) / 12);
const bounded = (value: number) =>
  Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));

/** Original, locally synthesized score and effects. No media downloads, remote
 * audio services or inference are required. Nodes disconnect after each voice. */
class GameAudio {
  private settings: Settings = { ...defaults };
  private context?: AudioContext;
  private master?: GainNode;
  private music?: GainNode;
  private effects?: GainNode;
  private analyser?: AnalyserNode;
  private noise?: AudioBuffer;
  private listeners = new Set<() => void>();
  private timer?: ReturnType<typeof setInterval>;
  private theme: AudioTheme = "city";
  private beat = 0;
  private nextBeat = 0;
  private nextFootstep = 0;
  private moving = false;
  private speed = 0;
  private voices = 0;
  private installed = false;

  constructor() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (
        saved &&
        typeof saved.enabled === "boolean" &&
        typeof saved.muted === "boolean"
      )
        this.settings = {
          enabled: saved.enabled,
          muted: saved.muted,
          volume:
            typeof saved.volume === "number"
              ? bounded(saved.volume)
              : defaults.volume,
          music: bounded(saved.music),
          effects: bounded(saved.effects),
        };
    } catch {
      /* Storage is optional. */
    }
  }
  getSettings = () => this.settings;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private update(patch: Partial<Settings>) {
    this.settings = { ...this.settings, ...patch };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
    } catch {
      /* Private browsing may deny storage. */
    }
    this.gains();
    this.listeners.forEach((listener) => listener());
  }
  private gains() {
    if (!this.context || !this.master || !this.music || !this.effects) return;
    const now = this.context.currentTime;
    this.master.gain.setValueAtTime(
      this.settings.enabled && !this.settings.muted && !document.hidden
        ? this.settings.volume * 3.5
        : 0,
      now,
    );
    this.music.gain.setValueAtTime(this.settings.music, now);
    this.effects.gain.setValueAtTime(this.settings.effects, now);
  }
  install() {
    if (this.installed) return;
    this.installed = true;
    document.addEventListener(
      "click",
      (event) => {
        if (!(event.target instanceof Element)) return;
        const button = event.target.closest("button");
        if (!button || button.disabled || button.closest(".audio-controls"))
          return;
        if (this.settings.enabled) {
          void this.activate();
          this.effect("click");
        }
      },
      true,
    );
    document.addEventListener("visibilitychange", () => {
      this.gains();
      if (document.hidden) {
        void this.context?.suspend();
      } else {
        this.nextBeat = 0;
        this.nextFootstep = 0;
      }
    });
    (
      window as unknown as {
        getAmamiheAudioSnapshot: () => ReturnType<GameAudio["snapshot"]>;
      }
    ).getAmamiheAudioSnapshot = () => this.snapshot();
  }
  async activate() {
    this.install();
    if (!this.settings.enabled) return;
    if (!this.context) {
      const Audio = window.AudioContext;
      if (!Audio) return;
      try {
        this.context = new Audio({ latencyHint: "interactive" });
        this.master = this.context.createGain();
        this.music = this.context.createGain();
        this.effects = this.context.createGain();
        this.analyser = this.context.createAnalyser();
        this.analyser.fftSize = 512;
        this.music.connect(this.master);
        this.effects.connect(this.master);
        const limiter = this.context.createDynamicsCompressor();
        limiter.threshold.value = -6;
        limiter.knee.value = 8;
        limiter.ratio.value = 12;
        limiter.attack.value = 0.003;
        limiter.release.value = 0.18;
        this.master.connect(limiter);
        limiter.connect(this.analyser);
        this.analyser.connect(this.context.destination);
        this.noise = this.context.createBuffer(
          1,
          this.context.sampleRate,
          this.context.sampleRate,
        );
        const samples = this.noise.getChannelData(0);
        // Fixed synthesis texture rather than a fetched recording.
        let seed = 17;
        for (let i = 0; i < samples.length; i++) {
          seed = (seed * 16807) % 2147483647;
          samples[i] = seed / 1073741824 - 1;
        }
        this.timer = setInterval(() => this.schedule(), 80);
      } catch {
        return;
      }
    }
    this.gains();
    if (this.context.state === "suspended" && !document.hidden) {
      try {
        await this.context.resume();
      } catch {
        return;
      }
    }
    this.nextBeat = Math.max(this.context.currentTime + 0.03, this.nextBeat);
    this.schedule();
  }
  async enable() {
    this.update({ enabled: true, muted: false });
    await this.activate();
    this.effect("start");
  }
  toggleMute() {
    this.update({ muted: !this.settings.muted });
    if (!this.settings.muted) void this.activate();
  }
  setVolume(channel: "volume" | "music" | "effects", value: number) {
    this.update({ [channel]: bounded(value) });
  }
  setTheme(theme: AudioTheme) {
    if (theme === this.theme) return;
    this.theme = theme;
    this.beat = 0;
    this.nextBeat = 0;
  }
  setMovement({
    active,
    speed,
    theme,
  }: {
    active: boolean;
    speed: number;
    theme: AudioTheme;
  }) {
    if (!active && theme !== this.theme) return;
    this.setTheme(theme);
    this.moving = active;
    this.speed = speed;
    if (!active) this.nextFootstep = 0;
  }
  private tone(
    hz: number,
    at: number,
    duration: number,
    volume: number,
    type: OscillatorType,
    channel: GainNode,
    endHz = hz,
  ) {
    if (!this.context || this.voices >= 24) return;
    const oscillator = this.context.createOscillator(),
      envelope = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(Math.max(20, hz), at);
    oscillator.frequency.exponentialRampToValueAtTime(
      Math.max(20, endHz),
      at + duration,
    );
    envelope.gain.setValueAtTime(0, at);
    envelope.gain.linearRampToValueAtTime(volume, at + 0.008);
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    oscillator.connect(envelope);
    envelope.connect(channel);
    this.voices++;
    oscillator.onended = () => {
      oscillator.disconnect();
      envelope.disconnect();
      this.voices--;
    };
    oscillator.start(at);
    oscillator.stop(at + duration + 0.02);
  }
  private percussion(
    at: number,
    duration: number,
    volume: number,
    hz: number,
    channel: GainNode,
  ) {
    if (!this.context || !this.noise || this.voices >= 24) return;
    const source = this.context.createBufferSource(),
      envelope = this.context.createGain(),
      filter = this.context.createBiquadFilter();
    source.buffer = this.noise;
    filter.type = "lowpass";
    filter.frequency.value = hz;
    envelope.gain.setValueAtTime(volume, at);
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    source.connect(filter);
    filter.connect(envelope);
    envelope.connect(channel);
    this.voices++;
    source.onended = () => {
      source.disconnect();
      filter.disconnect();
      envelope.disconnect();
      this.voices--;
    };
    source.start(at);
    source.stop(at + duration + 0.02);
  }
  private schedule() {
    if (
      !this.context ||
      this.context.state !== "running" ||
      !this.settings.enabled ||
      this.settings.muted ||
      document.hidden ||
      !this.music ||
      !this.effects
    )
      return;
    const now = this.context.currentTime,
      score = themes[this.theme];
    if (this.nextBeat < now - 0.2) this.nextBeat = now + 0.02;
    while (this.nextBeat < now + 0.15) {
      const step = this.beat % score.notes.length,
        duration = 60 / score.bpm / 2;
      this.tone(
        frequency(score.notes[step]),
        this.nextBeat,
        duration * 1.5,
        0.1,
        score.type,
        this.music,
      );
      if (step % 2 === 0)
        this.tone(
          frequency(score.bass + (step >= 4 ? 5 : 0)),
          this.nextBeat,
          duration * 1.8,
          0.13,
          "sine",
          this.music,
        );
      if (this.theme !== "workshop" && this.theme !== "city") {
        this.percussion(
          this.nextBeat,
          0.06,
          step % 2 ? 0.04 : 0.08,
          step % 2 ? 4000 : 450,
          this.music,
        );
        if (step % 4 === 0)
          this.tone(100, this.nextBeat, 0.15, 0.15, "sine", this.music, 35);
      }
      this.beat++;
      this.nextBeat += duration;
    }
    if (this.moving && this.speed > 0.2 && now >= this.nextFootstep) {
      this.effect("footstep");
      this.nextFootstep = now + Math.max(0.2, 0.48 - this.speed * 0.025);
    }
  }
  effect(kind: Sound) {
    if (
      !this.context ||
      this.context.state !== "running" ||
      !this.effects ||
      !this.settings.enabled ||
      this.settings.muted ||
      document.hidden
    )
      return;
    const at = this.context.currentTime + 0.005,
      channel = this.effects;
    const note = (
      hz: number,
      duration = 0.14,
      volume = 0.16,
      endHz = hz,
      type: OscillatorType = "sine",
      offset = 0,
    ) => this.tone(hz, at + offset, duration, volume, type, channel, endHz);
    if (kind === "footstep")
      this.percussion(
        at,
        0.07,
        0.12,
        this.theme === "temple-chase" ? 650 : 1200,
        channel,
      );
    else if (kind === "click") note(760, 0.045, 0.09, 480);
    else if (kind === "jump") note(220, 0.24, 0.14, 720, "triangle");
    else if (kind === "slide") this.percussion(at, 0.24, 0.14, 2600, channel);
    else if (kind === "strike" || kind === "impact") {
      this.percussion(at, 0.16, 0.26, 900, channel);
      note(kind === "strike" ? 110 : 75, 0.18, 0.2, 30);
    } else if (kind === "wrong" || kind === "game-over") {
      note(190, 0.3, 0.18, 80, "triangle");
      if (kind === "game-over") note(110, 0.6, 0.16, 40, "triangle", 0.2);
    } else if (kind === "pause") note(350, 0.14, 0.12, 240);
    else if (kind === "portal") note(180, 0.7, 0.16, 1200, "triangle");
    else {
      const notes =
        kind === "clear"
          ? [523, 659, 784, 1047]
          : kind === "purchase"
            ? [784, 1047]
            : [440, 660, 880];
      notes.forEach((hz, i) => note(hz, 0.23, 0.16, hz, "sine", i * 0.09));
    }
  }
  snapshot() {
    let rms = 0;
    if (this.analyser) {
      const samples = new Float32Array(this.analyser.fftSize);
      this.analyser.getFloatTimeDomainData(samples);
      rms = Math.sqrt(
        samples.reduce((sum, value) => sum + value * value, 0) / samples.length,
      );
    }
    return {
      ...this.settings,
      theme: this.theme,
      contextState: this.context?.state ?? "uninitialized",
      masterGain: this.master?.gain.value ?? 0,
      rms,
      voices: this.voices,
      movement: this.moving,
      speed: this.speed,
      musicGain: this.music?.gain.value ?? 0,
      effectsGain: this.effects?.gain.value ?? 0,
    };
  }
}
export const gameAudio = new GameAudio();
