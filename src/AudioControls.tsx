import { useEffect, useSyncExternalStore } from "react";
import { gameAudio } from "./gameAudio";
import "./audio.css";

export default function AudioControls() {
  const settings = useSyncExternalStore(
    gameAudio.subscribe,
    gameAudio.getSettings,
  );
  useEffect(() => gameAudio.install(), []);
  return (
    <details className="audio-controls">
      <summary
        title={settings.enabled && !settings.muted ? "Sound on" : "Sound off"}
      >
        <span aria-hidden="true">
          {settings.enabled && !settings.muted ? "♫" : "♪"}
        </span>
        <span className="sr-only">
          Sound {settings.enabled && !settings.muted ? "on" : "off"}
        </span>
      </summary>
      <div className="audio-options">
        <button
          type="button"
          onClick={() =>
            settings.enabled ? gameAudio.toggleMute() : void gameAudio.enable()
          }
        >
          {!settings.enabled
            ? "Enable game audio"
            : settings.muted
              ? "Unmute game audio"
              : "Mute game audio"}
        </button>
        <label>
          Game volume
          <input
            aria-label="Game volume"
            type="range"
            min="0"
            max="100"
            value={Math.round(settings.volume * 100)}
            onChange={(event) =>
              gameAudio.setVolume("volume", Number(event.target.value) / 100)
            }
          />
        </label>
        <label>
          Music volume
          <input
            aria-label="Music volume"
            type="range"
            min="0"
            max="100"
            value={Math.round(settings.music * 100)}
            onChange={(event) =>
              gameAudio.setVolume("music", Number(event.target.value) / 100)
            }
          />
        </label>
        <label>
          Sound effects volume
          <input
            aria-label="Sound effects volume"
            type="range"
            min="0"
            max="100"
            value={Math.round(settings.effects * 100)}
            onChange={(event) =>
              gameAudio.setVolume("effects", Number(event.target.value) / 100)
            }
          />
        </label>
        <small>
          Original theme music and action sounds. Your sound settings stay on
          this device.
        </small>
      </div>
    </details>
  );
}
