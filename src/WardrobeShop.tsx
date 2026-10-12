import { useEffect, useState } from "react";
import type { GEAR } from "../shared/gameplay";
import { gameAudio } from "./gameAudio";
type Rewards = {
  points: number;
  outfit: string;
  gear: typeof GEAR;
  inventory: string[];
  badges: { id: string; title: string }[];
};
export default function WardrobeShop({ onChanged }: { onChanged: () => void }) {
  const [data, setData] = useState<Rewards | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function load() {
    const response = await fetch("/api/rewards");
    if (!response.ok) throw new Error("Unable to load your wardrobe.");
    setData(await response.json());
  }
  useEffect(() => {
    void load().catch((e) => setError(e.message));
  }, []);
  async function act(action: string, gearId: string) {
    void gameAudio.activate();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/rewards/" + action, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gearId }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      if (action === "buy") gameAudio.effect("purchase");
      await load();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="wardrobe-shop" aria-label="Avatar wardrobe and rewards">
      <span className="eyebrow">YOUR EXPLORER · COSMETIC GEAR</span>
      <h2>Earn it. Wear it.</h2>
      <p>
        ✦ {data?.points ?? "…"} available activity points. Jackets change your
        appearance; learning criteria stay the same.
      </p>
      {error && <p role="alert">{error}</p>}
      <div className="shop-gear">
        {data?.gear.map((gear) => (
          <article key={gear.id}>
            <span
              className="gear-swatch"
              style={{ background: gear.color }}
              aria-hidden="true"
            />
            <h3>{gear.name}</h3>
            <p>
              {data.inventory.includes(gear.id)
                ? "In your inventory"
                : `${gear.price} points`}
            </p>
            <button
              className="course-secondary"
              disabled={busy || data.outfit === gear.id}
              onClick={() =>
                act(data.inventory.includes(gear.id) ? "equip" : "buy", gear.id)
              }
            >
              {data.outfit === gear.id
                ? "Equipped"
                : data.inventory.includes(gear.id)
                  ? `Equip ${gear.name}`
                  : `Unlock ${gear.name}`}
            </button>
          </article>
        ))}
      </div>
      <h3>Milestone badges</h3>
      {data?.badges.length ? (
        <ul>
          {data.badges.map((b) => (
            <li key={b.id}>🏅 {b.title}</li>
          ))}
        </ul>
      ) : (
        <p>
          Complete a published course's independent checkpoints to earn your
          first badge.
        </p>
      )}
    </section>
  );
}
