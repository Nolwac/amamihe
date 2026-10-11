import { useState } from "react";
export default function DeviceCheck() {
  const [ram, setRam] = useState("unknown"),
    [experience, setExperience] = useState("not-tested"),
    [note, setNote] = useState("");
  function download() {
    const canvas = document.querySelector<HTMLCanvasElement>(
      "canvas[data-scene-mode=world]",
    );
    const report = {
      recordedAt: new Date().toISOString(),
      browser: navigator.userAgent,
      viewport: { width: innerWidth, height: innerHeight },
      physicalRamGbReportedByLearner: ram,
      experienceReportedByLearner: experience,
      note,
      online: navigator.onLine,
      rendering: {
        fps:
          canvas?.dataset.fps ??
          document.querySelector(".engine-status b")?.textContent,
        height: canvas?.dataset.renderHeight,
        triangles: canvas?.dataset.activeTriangles,
      },
      limitations:
        "Learner report and current browser snapshot, not verified hardware specifications or proof of learning. No personal account records included. No report is uploaded automatically.",
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "amamihe-device-check.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <section className="wardrobe" aria-label="Device evaluation">
      <h2>Check this device</h2>
      <p>
        Try walking, entering a course, completing a task and reloading. Save an
        optional local report to share when reporting a problem. It stays on
        your device until you choose to share it.
      </p>
      <label>
        Device RAM (from your device settings)
        <select value={ram} onChange={(e) => setRam(e.target.value)}>
          <option value="unknown">I don’t know</option>
          {[1, 2, 3, 4, 8].map((n) => (
            <option key={n} value={n}>
              {n} GB
            </option>
          ))}
        </select>
      </label>
      <label>
        How did the game feel?
        <select
          value={experience}
          onChange={(e) => setExperience(e.target.value)}
        >
          <option value="not-tested">Not tested yet</option>
          <option value="usable">Usable</option>
          <option value="slow">Slow or difficult</option>
          <option value="blocked">Could not complete the activity</option>
        </select>
      </label>
      <label>
        Activity and problem
        <textarea
          maxLength={1000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="What were you doing, what did you expect, and what happened?"
        />
      </label>
      <button onClick={download}>Download device report</button>
      <p>
        Graphics settings preserve the 3D world. Try Automatic/Low on limited
        devices. Internet is required for saving answers and grading; cached art
        alone does not make the game offline.
      </p>
    </section>
  );
}
