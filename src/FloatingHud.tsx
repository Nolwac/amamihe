import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import "./hud.css";

type Point = { x: number; y: number };
type Layout = Record<string, Point>;
const key = "amamihe-hud-layout-v1";
const Hud = createContext<{
  editing: boolean;
  setEditing: (v: boolean) => void;
  positions: Layout;
  save: (id: string, p: Point) => void;
  reset: () => void;
}>({ editing: false, setEditing() {}, positions: {}, save() {}, reset() {} });
function load(): Layout {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "{}");
    const result: Layout = {};
    if (!value || typeof value !== "object" || Array.isArray(value))
      return result;
    for (const [id, entry] of Object.entries(value)) {
      const p = entry as Point | null;
      if (
        p &&
        Number.isFinite(p.x) &&
        Number.isFinite(p.y) &&
        p.x >= 0 &&
        p.x <= 1 &&
        p.y >= 0 &&
        p.y <= 1
      )
        result[id] = { x: p.x, y: p.y };
    }
    return result;
  } catch {
    return {};
  }
}
export function HudLayout({ children }: { children: ReactNode }) {
  const [editing, setEditing] = useState(false);
  const [positions, setPositions] = useState<Layout>(load);
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(positions));
    } catch {
      /* Optional device storage. */
    }
  }, [positions]);
  return (
    <Hud.Provider
      value={{
        editing,
        setEditing,
        positions,
        save: (id, p) => setPositions((v) => ({ ...v, [id]: p })),
        reset: () => setPositions({}),
      }}
    >
      {children}
      {editing && (
        <div
          data-hud-obstacle="edit-toolbar"
          className="hud-edit-bar"
          role="region"
          aria-label="Arrange game controls"
        >
          <span>Drag controls. Use arrow keys when focused.</span>
          <button onClick={() => setPositions({})}>Reset layout</button>
          <button onClick={() => setEditing(false)}>Done</button>
        </div>
      )}
    </Hud.Provider>
  );
}
export function useHudEditing() {
  return useContext(Hud).editing;
}
export function ArrangeControls() {
  const hud = useContext(Hud);
  return (
    <button
      className="hud-arrange"
      aria-label="Arrange controls"
      title="Arrange controls"
      onClick={() => hud.setEditing(!hud.editing)}
    >
      ⠿
    </button>
  );
}

function placePopover(node: HTMLElement, detail: HTMLDetailsElement) {
  const anchor = detail.querySelector("summary")?.getBoundingClientRect();
  if (!anchor) return;
  const below = window.innerHeight - anchor.bottom;
  const above = anchor.top;
  const down = below >= above;
  node.style.setProperty(
    "--hud-panel-right",
    (anchor.left > 130 ? window.innerWidth - anchor.left + 8 : 12) + "px",
  );
  node.style.setProperty(
    "--hud-panel-top",
    down ? anchor.bottom + 8 + "px" : "auto",
  );
  node.style.setProperty(
    "--hud-panel-bottom",
    down ? "auto" : window.innerHeight - anchor.top + 8 + "px",
  );
  node.style.setProperty(
    "--hud-panel-height",
    Math.max(64, (down ? below : above) - 20) + "px",
  );
}

/** Drag mode keeps a movement press, summary tap and camera orbit unambiguous. */
export function FloatingControl({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: ReactNode;
}) {
  const hud = useContext(Hud);
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    x: number;
    y: number;
    left: number;
    top: number;
  } | null>(null);
  const [revision, resize] = useState(0);
  const [preview, setPreview] = useState<Point | null>(null);
  useEffect(() => {
    const update = () => resize((v) => v + 1);
    window.addEventListener("resize", update);
    window.visualViewport?.addEventListener("resize", update);
    const observer = new ResizeObserver(update);
    if (ref.current) observer.observe(ref.current);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("resize", update);
    };
  }, []);
  const bounds = () => ({
    w: window.innerWidth,
    h: window.innerHeight,
    width: ref.current?.offsetWidth || 44,
    height: ref.current?.offsetHeight || 44,
  });
  const clamp = (x: number, y: number): Point => {
    const b = bounds();
    return {
      x: Math.max(12, Math.min(b.w - b.width - 12, x)),
      y: Math.max(12, Math.min(b.h - b.height - 12, y)),
    };
  };
  const settle = (p: Point) => {
    const b = bounds();
    const obstacles = [
      ...document.querySelectorAll<HTMLElement>(
        "[data-hud-item], [data-hud-obstacle], .hud-arrange",
      ),
    ]
      .filter(
        (el) =>
          el !== ref.current &&
          getComputedStyle(el).visibility !== "hidden" &&
          el.getBoundingClientRect().width > 0,
      )
      .map((el) => el.getBoundingClientRect());
    const free = (q: Point) =>
      !obstacles.some(
        (r) =>
          q.x < r.right + 6 &&
          q.x + b.width + 6 > r.left &&
          q.y < r.bottom + 6 &&
          q.y + b.height + 6 > r.top,
      );
    let chosen = clamp(p.x, p.y);
    if (!free(chosen)) {
      let distance = Infinity;
      for (let y = 12; y + b.height <= b.h - 12; y += 12)
        for (let x = 12; x + b.width <= b.w - 12; x += 12) {
          const d = (x - p.x) ** 2 + (y - p.y) ** 2;
          if (d < distance && free({ x, y })) {
            chosen = { x, y };
            distance = d;
          }
        }
    }
    // Commit the rectangle before another control's resize effect chooses a slot.
    if (ref.current)
      Object.assign(ref.current.style, {
        left: chosen.x + "px",
        top: chosen.y + "px",
        right: "auto",
        bottom: "auto",
      });
    hud.save(id, { x: chosen.x / b.w, y: chosen.y / b.h });
    setPreview(null);
  };
  useEffect(() => {
    const node = ref.current;
    const toggle = (event: Event) => {
      const detail = event.target as HTMLDetailsElement;
      if (!detail.open) return;
      if (node) placePopover(node, detail);
      document
        .querySelectorAll<HTMLDetailsElement>("[data-hud-item] details[open]")
        .forEach((other) => {
          if (other !== detail) other.open = false;
        });
    };
    node?.addEventListener("toggle", toggle, true);
    return () => node?.removeEventListener("toggle", toggle, true);
  }, []);
  useEffect(() => {
    const node = ref.current;
    node
      ?.querySelectorAll<HTMLDetailsElement>("details[open]")
      .forEach((detail) => placePopover(node, detail));
  }, [revision, hud.positions]);
  const saved = hud.positions[id];
  const position =
    preview ||
    (saved
      ? clamp(saved.x * window.innerWidth, saved.y * window.innerHeight)
      : null);
  useEffect(() => {
    if (!ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const collision = [
      ...document.querySelectorAll<HTMLElement>(
        "[data-hud-item], [data-hud-obstacle], .hud-arrange",
      ),
    ].some((el) => {
      if (el === ref.current || getComputedStyle(el).visibility === "hidden")
        return false;
      const other = el.getBoundingClientRect();
      return (
        other.width > 0 &&
        r.left < other.right + 6 &&
        r.right + 6 > other.left &&
        r.top < other.bottom + 6 &&
        r.bottom + 6 > other.top
      );
    });
    if (collision) settle({ x: r.left, y: r.top });
  }, [revision]);
  return (
    <div
      ref={ref}
      className={`hud-item hud-${id}${hud.editing ? " hud-editing" : ""}`}
      data-hud-item={id}
      style={
        position
          ? { left: position.x, top: position.y, right: "auto", bottom: "auto" }
          : undefined
      }
      tabIndex={hud.editing ? 0 : undefined}
      role={hud.editing ? "button" : undefined}
      aria-label={hud.editing ? "Move " + label : undefined}
      onKeyDown={(e) => {
        if (!hud.editing || !e.key.startsWith("Arrow")) return;
        e.preventDefault();
        e.stopPropagation();
        const r = e.currentTarget.getBoundingClientRect();
        settle({
          x:
            r.left +
            (e.key === "ArrowRight" ? 12 : e.key === "ArrowLeft" ? -12 : 0),
          y:
            r.top +
            (e.key === "ArrowDown" ? 12 : e.key === "ArrowUp" ? -12 : 0),
        });
      }}
      onPointerDownCapture={(e) => {
        if (!hud.editing) return;
        e.preventDefault();
        e.stopPropagation();
        const r = e.currentTarget.getBoundingClientRect();
        drag.current = { x: e.clientX, y: e.clientY, left: r.left, top: r.top };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!drag.current) return;
        e.preventDefault();
        e.stopPropagation();
        const d = drag.current;
        setPreview(clamp(d.left + e.clientX - d.x, d.top + e.clientY - d.y));
      }}
      onPointerUp={(e) => {
        if (!drag.current) return;
        e.preventDefault();
        e.stopPropagation();
        const d = drag.current;
        drag.current = null;
        settle({ x: d.left + e.clientX - d.x, y: d.top + e.clientY - d.y });
      }}
      onPointerCancel={() => {
        drag.current = null;
        setPreview(null);
      }}
      onClickCapture={(e) => {
        if (hud.editing) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
    >
      {children}
    </div>
  );
}
