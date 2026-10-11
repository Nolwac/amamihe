import { useEffect, useRef, useState } from "react";
import type { Presence, Team, BattleView } from "../shared/social";
let location: {
  space: string;
  levelId?: string;
  position: { x: number; z: number; heading: number };
} = { space: "city", position: { x: 0, z: -5, heading: 0 } };
export function publishPosition(value: typeof location) {
  location = value;
}
export async function socialCall(path: string, body?: unknown) {
  const r = await fetch("/api/social" + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error);
  return d;
}
export function useSocialPresence(playerId?: string) {
  const [joined, setJoined] = useState(false),
    [state, setState] = useState<{
      presence: Presence[];
      team: Team | null;
      battles: BattleView[];
      blocked: { id: string; name: string }[];
      canModerate: boolean;
    }>({
      presence: [],
      team: null,
      battles: [],
      blocked: [],
      canModerate: false,
    }),
    [message, setMessage] = useState("");
  const signal = useRef("");
  const identity = useRef(playerId);
  identity.current = playerId;
  const refresh = async () => {
    const d = await socialCall("");
    if (identity.current === playerId) setState(d);
  };
  useEffect(() => {
    setJoined(false);
    signal.current = "";
    setState({
      presence: [],
      team: null,
      battles: [],
      blocked: [],
      canModerate: false,
    });
  }, [playerId]);
  useEffect(() => {
    if (!playerId) return;
    void refresh().catch((e) => setMessage(String(e)));
  }, [playerId]);
  useEffect(() => {
    if (!playerId || !joined) return;
    let alive = true,
      pending = false;
    const pulse = async () => {
      if (pending || document.hidden) return;
      pending = true;
      try {
        await socialCall("/presence", {
          ...location,
          signal: signal.current || undefined,
        });
        const d = await socialCall("");
        if (alive) {
          setState(d);
          setMessage("");
        }
      } catch (e) {
        if (alive)
          setMessage(
            "Connection interrupted; saved learning is retained. " + String(e),
          );
      } finally {
        pending = false;
      }
    };
    void pulse();
    const timer = window.setInterval(() => void pulse(), 3000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [playerId, joined]);
  return {
    joined,
    state,
    message,
    refresh,
    join: () => setJoined(true),
    leave: async () => {
      setJoined(false);
      setState((s) => ({ ...s, presence: [] }));
      await socialCall("/leave", {});
    },
    send: (value: string) => {
      signal.current = value;
      void socialCall("/presence", {
        ...location,
        signal: value || undefined,
      }).catch((e) => setMessage(String(e)));
    },
    setMessage,
  };
}
