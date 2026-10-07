"use client";

import { useEffect, useState } from "react";

type Pause = { pausedAt: number | null; pausedMs: number };
const readPause = (key: string): Pause => {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null") as Pause | null;
    if (value && Number.isFinite(value.pausedMs) && value.pausedMs >= 0 && (value.pausedAt === null || (Number.isFinite(value.pausedAt) && value.pausedAt > 0))) return value;
  } catch { /* Sin pausa guardada. */ }
  return { pausedAt: null, pausedMs: 0 };
};

// La pausa afecta este contador del dispositivo; la jornada conserva sus horas de inicio y cierre.
export function useWorkClock(session: { id: number; startedAt: string } | null) {
  const key = `autoram.work.clock.v1.${session?.id || "idle"}`;
  const [pause,setPause] = useState(() => readPause(key));
  const [now,setNow] = useState(() => Date.now());
  useEffect(() => { if (!session) return; const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer); }, [session?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const togglePause = () => {
    const at = Date.now();
    const next: Pause = pause.pausedAt === null ? { ...pause, pausedAt: at } : { pausedAt: null, pausedMs: pause.pausedMs + Math.max(0,at-pause.pausedAt) };
    try { localStorage.setItem(key,JSON.stringify(next)); } catch { /* La pausa sigue activa hasta cerrar esta pantalla. */ }
    setNow(at);setPause(next);
  };
  const elapsed = session ? Math.max(0,Math.floor(((pause.pausedAt ?? now)-Date.parse(session.startedAt)-pause.pausedMs)/1000)) : 0;
  return { elapsed, paused: pause.pausedAt !== null, togglePause };
}
