export type GameState = {
  status: "ready" | "active" | "paused" | "game-over";
  elapsedMs: number;
  lastTick: number;
  budgetMs: number;
  multiplier: number;
  run: number;
};
export const GEAR = [
  { id: "azure", name: "Azure explorer jacket", price: 40, color: "#478ccc" },
  { id: "plum", name: "Plum trail jacket", price: 80, color: "#9964ba" },
] as const;
