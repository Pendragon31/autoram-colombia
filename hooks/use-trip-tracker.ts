"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { haversineKm, routeLengthKm, simplifyRoute, speedKmh, type TrackPoint } from "@/lib/geo";
import { GPS_MAX_ACCURACY_M, GPS_STALE_MS, gpsSignal, validGpsFix } from "@/lib/gps-signal";
import { newClientId } from "@/lib/offline-queue";

export type TrackerState = "idle" | "locating" | "tracking" | "saving" | "error";
export type TrackedTrip = {
  vehicleId: number; clientId: string;
  startedAt: string; endedAt: string; durationSeconds: number; distanceKm: number;
  startLat: number; startLng: number; endLat: number; endLng: number;
  routePoints: TrackPoint[]; maxSpeedKmh: number; avgSpeedKmh: number;
};
type Options = { vehicleId: number | null; userId?: string | null; maxAccuracyM?: number; minStepM?: number; maxJumpKmh?: number };
type Draft = { vehicleId: number | null; clientId?: string; startedAt: string; points: TrackPoint[] };
const DRAFT_KEY = "autoram.trip.draft.v1";
const loadDraft = (key: string): Draft | null => {
  try {
    const raw = localStorage.getItem(key); if (!raw) return null;
    const d = JSON.parse(raw) as Draft;
    if (!d || !Number.isFinite(Date.parse(d.startedAt)) || !Array.isArray(d.points) ||
      !d.points.every(p => Array.isArray(p) && (p.length === 3 || p.length === 4 && p[3] === 1) &&
        p.every(Number.isFinite) && Math.abs(p[0]) <= 90 && Math.abs(p[1]) <= 180)) return null;
    return d;
  } catch { return null; }
};
const saveDraft = (key: string, draft: Draft | null) => {
  try { if (draft) localStorage.setItem(key, JSON.stringify(draft)); else localStorage.removeItem(key); } catch { /* La interfaz conserva el recorrido mientras está abierta. */ }
};

export function useTripTracker({ vehicleId, userId, maxAccuracyM = GPS_MAX_ACCURACY_M, minStepM = 8, maxJumpKmh = 200 }: Options) {
  const draftKey = userId ? DRAFT_KEY + "." + userId + "." + vehicleId : DRAFT_KEY;
  const [state, setState] = useState<TrackerState>("idle");
  const [points, setPoints] = useState<TrackPoint[]>([]);
  const [distanceKm, setDistanceKm] = useState(0);
  const [currentKmh, setCurrentKmh] = useState(0);
  const [accuracyM, setAccuracyM] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [hasDraft, setHasDraft] = useState(false);
  const [lastFixAt, setLastFixAt] = useState<number | null>(null);
  const [gapCount, setGapCount] = useState(0);
  const watchId = useRef<number | null>(null);
  const watcherEpoch = useRef(0);
  const active = useRef(false);
  const pts = useRef<TrackPoint[]>([]);
  const dist = useRef(0);
  const maxSpeed = useRef(0);
  const startedRef = useRef<string | null>(null);
  const wakeLock = useRef<WakeLockSentinel | null>(null);
  const draftTimer = useRef<number | null>(null);
  const owner = useRef({ key: draftKey, vehicleId, clientId: "" });
  const pendingBreak = useRef(false);
  const lastTimestamp = useRef(0);
  const lastGoodReceipt = useRef(0);
  const lastWatchAt = useRef(0);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const draft = loadDraft(draftKey);
      setHasDraft(!!draft && draft.vehicleId === vehicleId && draft.points.length > 1);
      setState("idle"); setPoints([]); setDistanceKm(0); setElapsed(0); setMessage("");
      setAccuracyM(0); setLastFixAt(null); setGapCount(0);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [vehicleId, draftKey]);

  useEffect(() => {
    if (state !== "tracking" && state !== "locating") return;
    const base = startedRef.current ? Date.parse(startedRef.current) : Date.now();
    // También actualiza la edad de la última ubicación aunque no cambien los puntos.
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - base) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [state]);

  const clearObserver = useCallback(() => {
    watcherEpoch.current++;
    if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
    if (draftTimer.current !== null) window.clearInterval(draftTimer.current);
    watchId.current = null; draftTimer.current = null;
  }, []);
  const releaseWakeLock = useCallback(() => { wakeLock.current?.release().catch(() => undefined); wakeLock.current = null; }, []);
  const acquireWakeLock = useCallback(async () => {
    try {
      if (!("wakeLock" in navigator)) return;
      const lock = await navigator.wakeLock.request("screen");
      if (!active.current || document.visibilityState === "hidden") { await lock.release(); return; }
      wakeLock.current = lock;
    } catch { /* No disponible en todos los navegadores. */ }
  }, []);
  const persistDraft = useCallback(() => {
    if (startedRef.current) saveDraft(owner.current.key, { vehicleId: owner.current.vehicleId, clientId: owner.current.clientId, startedAt: startedRef.current, points: pts.current });
  }, []);

  const onPosition = useCallback((position: GeolocationPosition) => {
    if (!validGpsFix(position)) {
      pendingBreak.current = pts.current.length > 0;
      setCurrentKmh(0); setMessage("Se descartó una ubicación antigua o no válida. Esperando una señal reciente…"); return;
    }
    if (position.timestamp <= lastTimestamp.current) return;
    const { latitude, longitude, accuracy, speed } = position.coords;
    setAccuracyM(Math.ceil(accuracy));
    if (accuracy > maxAccuracyM) {
      setCurrentKmh(0); setState("locating");
      setMessage("La precisión es baja. Esperando una ubicación más fiable para sumar kilómetros."); return;
    }
    const previous = pts.current.at(-1);
    const interrupted = !!previous && (pendingBreak.current || lastGoodReceipt.current > 0 && Date.now() - lastGoodReceipt.current >= GPS_STALE_MS);
    const point: TrackPoint = interrupted ? [latitude, longitude, position.timestamp, 1] : [latitude, longitude, position.timestamp];
    let stepKm = 0, calculatedSpeed = 0;
    if (previous && !interrupted) {
      stepKm = haversineKm({ lat: previous[0], lng: previous[1] }, { lat: latitude, lng: longitude });
      calculatedSpeed = speedKmh(previous, point);
      if (stepKm * 1000 >= minStepM && calculatedSpeed > maxJumpKmh) {
        pendingBreak.current = true; setCurrentKmh(0);
        setMessage("Se descartó un salto de ubicación. Esperando una señal fiable…"); return;
      }
    }
    lastTimestamp.current = position.timestamp; lastGoodReceipt.current = Date.now();
    setLastFixAt(position.timestamp); setState("tracking");
    const shown = speed !== null && Number.isFinite(speed) && speed >= 0 && speed * 3.6 <= maxJumpKmh ? speed * 3.6 : calculatedSpeed;
    setCurrentKmh(Math.round(shown)); maxSpeed.current = Math.max(maxSpeed.current, shown);
    if (previous && !interrupted && stepKm * 1000 < minStepM) { setMessage(""); return; }
    pendingBreak.current = false;
    if (interrupted) {
      setGapCount(count => count + 1);
      setMessage("Señal recuperada. El tramo sin datos no se suma a la distancia.");
    } else { dist.current += stepKm; setMessage(""); }
    pts.current = [...pts.current, point];
    setDistanceKm(Number(dist.current.toFixed(2))); setPoints(pts.current); persistDraft();
  }, [maxAccuracyM, minStepM, maxJumpKmh, persistDraft]);

  const onError = useCallback((error: GeolocationPositionError) => {
    pendingBreak.current = pts.current.length > 0; setCurrentKmh(0);
    const messages: Record<number, string> = {
      1: "La ubicación está bloqueada. Permite el acceso a la ubicación en los ajustes de este sitio y activa la ubicación del teléfono. Después vuelve a intentar registrar el recorrido.",
      2: "No hay señal de GPS. Seguimos intentando.",
      3: "El GPS tarda en responder. Seguimos intentando.",
    };
    setMessage(messages[error.code] ?? "No pudimos leer la ubicación.");
    if (error.code === 1) {
      active.current = false; clearObserver(); persistDraft(); releaseWakeLock();
      setHasDraft(pts.current.length > 1); setState("error");
    } else { setState("locating"); }
  }, [clearObserver, persistDraft, releaseWakeLock]);

  const beginWatch = useCallback(function watch(): void {
    clearObserver(); releaseWakeLock();
    if (!("geolocation" in navigator)) { active.current = false; setState("error"); setMessage("Este dispositivo no permite usar GPS."); return; }
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    lastWatchAt.current = Date.now();
    const epoch = watcherEpoch.current;
    try {
      const id = navigator.geolocation.watchPosition(
        position => { if (active.current && watcherEpoch.current === epoch) onPosition(position); },
        error => { if (active.current && watcherEpoch.current === epoch) onError(error); },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 15_000 },
      );
      // Algunos navegadores/proveedores rechazan de forma inmediata.
      if (!active.current || watcherEpoch.current !== epoch) { navigator.geolocation.clearWatch(id); return; }
      watchId.current = id; void acquireWakeLock();
      draftTimer.current = window.setInterval(() => {
        persistDraft();
        if (!active.current || typeof document !== "undefined" && document.visibilityState === "hidden") return;
        if (Date.now() - Math.max(lastWatchAt.current, lastGoodReceipt.current) >= GPS_STALE_MS) {
          pendingBreak.current = pts.current.length > 0; setCurrentKmh(0); setState("locating");
          setMessage("La ubicación no se actualiza. Estamos intentando recuperar la señal…"); watch();
        }
      }, 10_000);
    } catch {
      active.current = false; clearObserver(); releaseWakeLock(); setState("error");
      setHasDraft(pts.current.length > 1); persistDraft();
      setMessage("No pudimos iniciar el GPS. Revisa los permisos de ubicación y vuelve a intentarlo.");
    }
  }, [clearObserver, onPosition, onError, acquireWakeLock, persistDraft, releaseWakeLock]);

  const start = useCallback(() => {
    if (!vehicleId) { setMessage("Selecciona un vehículo antes de iniciar."); return; }
    owner.current = { key: draftKey, vehicleId, clientId: newClientId() };
    pts.current = []; dist.current = 0; maxSpeed.current = 0; pendingBreak.current = false;
    lastTimestamp.current = 0; lastGoodReceipt.current = 0; active.current = true;
    setPoints([]); setDistanceKm(0); setCurrentKmh(0); setElapsed(0); setAccuracyM(0); setLastFixAt(null); setGapCount(0);
    const now = new Date().toISOString(); startedRef.current = now; setStartedAt(now);
    persistDraft(); setHasDraft(false); setState("locating"); setMessage("Buscando señal de GPS…"); beginWatch();
  }, [vehicleId, draftKey, persistDraft, beginWatch]);

  const resume = useCallback(() => {
    const draft = loadDraft(draftKey); if (!draft || draft.vehicleId !== vehicleId) return;
    owner.current = { key: draftKey, vehicleId, clientId: draft.clientId || newClientId() };
    pts.current = draft.points; dist.current = routeLengthKm(draft.points); maxSpeed.current = 0;
    for (let i = 1; i < draft.points.length; i++) maxSpeed.current = Math.max(maxSpeed.current, speedKmh(draft.points[i - 1], draft.points[i]));
    lastTimestamp.current = draft.points.at(-1)?.[2] ?? 0; lastGoodReceipt.current = 0;
    pendingBreak.current = draft.points.length > 0; active.current = true;
    setPoints(draft.points); setDistanceKm(Number(dist.current.toFixed(2))); setCurrentKmh(0); setAccuracyM(0);
    setLastFixAt(null); setGapCount(draft.points.filter(p => p[3] === 1).length);
    startedRef.current = draft.startedAt; setStartedAt(draft.startedAt);
    setHasDraft(false); setState("locating"); setMessage("Retomando el recorrido…"); beginWatch();
  }, [beginWatch, vehicleId, draftKey]);

  const discardDraft = useCallback(() => {
    active.current = false; clearObserver(); releaseWakeLock(); saveDraft(draftKey, null);
    startedRef.current = null; pts.current = []; dist.current = 0;
    setPoints([]); setDistanceKm(0); setHasDraft(false); setMessage(""); setState("idle");
    setLastFixAt(null); setAccuracyM(0); setGapCount(0);
  }, [draftKey, clearObserver, releaseWakeLock]);

  const stop = useCallback((): TrackedTrip | null => {
    active.current = false; clearObserver(); releaseWakeLock(); setCurrentKmh(0);
    const raw = pts.current;
    if (raw.length < 2 || dist.current < 0.05) {
      saveDraft(owner.current.key, null); startedRef.current = null; setState("idle");
      setLastFixAt(null); setAccuracyM(0);
      setMessage("El recorrido no registró distancia suficiente con señal válida."); return null;
    }
    persistDraft(); setState("saving");
    const first = raw[0], last = raw[raw.length - 1], endedAt = new Date().toISOString();
    const started = startedRef.current ?? new Date(first[2]).toISOString();
    const durationSeconds = Math.max(1, Math.round((Date.now() - Date.parse(started)) / 1000));
    return {
      vehicleId: owner.current.vehicleId!, clientId: owner.current.clientId, startedAt: started, endedAt, durationSeconds,
      distanceKm: Number(dist.current.toFixed(3)), startLat: first[0], startLng: first[1], endLat: last[0], endLng: last[1],
      routePoints: simplifyRoute(raw, 10), maxSpeedKmh: Number(maxSpeed.current.toFixed(1)),
      avgSpeedKmh: Number((dist.current / (durationSeconds / 3600)).toFixed(1)),
    };
  }, [clearObserver, releaseWakeLock, persistDraft]);

  const finish = useCallback((ok: boolean, msg?: string) => {
    if (ok) { saveDraft(owner.current.key, null); startedRef.current = null; pts.current = []; setPoints([]); setLastFixAt(null); setAccuracyM(0); }
    setHasDraft(!ok && pts.current.length > 1); setState(ok ? "idle" : "error"); setMessage(msg ?? "");
  }, []);

  useEffect(() => () => {
    active.current = false; persistDraft(); clearObserver(); releaseWakeLock();
    startedRef.current = null; pts.current = []; dist.current = 0;
  }, [draftKey, clearObserver, releaseWakeLock, persistDraft]);

  useEffect(() => {
    const suspend = () => {
      if (!active.current) return;
      pendingBreak.current = pts.current.length > 0; persistDraft(); clearObserver(); releaseWakeLock();
      setCurrentKmh(0); setState("locating"); setMessage("Registro en pausa mientras AutoRAM está en segundo plano. Vuelve para recuperar la señal.");
    };
    const onVisible = () => {
      if (document.visibilityState !== "visible") { suspend(); return; }
      if (active.current) {
        pendingBreak.current = pts.current.length > 0; setState("locating");
        setMessage("Recuperando la ubicación sin reiniciar el recorrido…"); beginWatch();
      }
    };
    document.addEventListener("visibilitychange", onVisible); window.addEventListener("pagehide", suspend);
    window.addEventListener("pageshow", onVisible);
    return () => { document.removeEventListener("visibilitychange", onVisible); window.removeEventListener("pagehide", suspend); window.removeEventListener("pageshow", onVisible); };
  }, [beginWatch, persistDraft, clearObserver, releaseWakeLock]);

  const signal = gpsSignal(state, accuracyM, lastFixAt);
  return { state, points, distanceKm, currentKmh, accuracyM, elapsed, startedAt, message, hasDraft, lastFixAt, gapCount, signal, start, stop, finish, resume, discardDraft };
}
