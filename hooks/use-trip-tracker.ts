"use client";

// Registro GPS del recorrido. Reemplaza el watchPosition de NavigatePage.
//  · Guarda la ruta completa (no solo inicio/fin).
//  · Ignora el temblor del GPS cuando el carro está quieto.
//  · Si la app se cierra a mitad de viaje, el borrador sobrevive y se retoma.
//  · Mantiene la pantalla encendida (Wake Lock).
//  · stop() devuelve el registro listo para saveTrip(); no guarda por su cuenta.

import { useCallback, useEffect, useRef, useState } from "react";
import { haversineKm, simplifyRoute, speedKmh, type TrackPoint } from "@/lib/geo";

export type TrackerState = "idle" | "locating" | "tracking" | "saving" | "error";

export type TrackedTrip = {
  startedAt: string; endedAt: string; durationSeconds: number; distanceKm: number;
  startLat: number; startLng: number; endLat: number; endLng: number;
  routePoints: TrackPoint[]; maxSpeedKmh: number; avgSpeedKmh: number;
};

type Options = { vehicleId: number | null; maxAccuracyM?: number; minStepM?: number; maxJumpKmh?: number };
type Draft = { vehicleId: number | null; startedAt: string; points: TrackPoint[] };

const DRAFT_KEY = "autoram.trip.draft.v1";
const loadDraft = (): Draft | null => { try { const raw = localStorage.getItem(DRAFT_KEY); return raw ? JSON.parse(raw) as Draft : null; } catch { return null; } };
const saveDraft = (d: Draft | null) => { try { if (d) localStorage.setItem(DRAFT_KEY, JSON.stringify(d)); else localStorage.removeItem(DRAFT_KEY); } catch { /* sin espacio */ } };

export function useTripTracker({ vehicleId, maxAccuracyM = 50, minStepM = 8, maxJumpKmh = 200 }: Options) {
  const [state, setState] = useState<TrackerState>("idle");
  const [points, setPoints] = useState<TrackPoint[]>([]);
  const [distanceKm, setDistanceKm] = useState(0);
  const [currentKmh, setCurrentKmh] = useState(0);
  const [accuracyM, setAccuracyM] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [hasDraft, setHasDraft] = useState(false);

  const watchId = useRef<number | null>(null);
  const pts = useRef<TrackPoint[]>([]);
  const dist = useRef(0);
  const maxSpeed = useRef(0);
  const startedRef = useRef<string | null>(null);
  const wakeLock = useRef<WakeLockSentinel | null>(null);
  const draftTimer = useRef<number | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const d = loadDraft();
      setHasDraft(!!d && d.vehicleId === vehicleId && d.points.length > 1);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [vehicleId]);

  useEffect(() => {
    if (state !== "tracking" && state !== "locating") return;
    const base = startedRef.current ? new Date(startedRef.current).getTime() : Date.now();
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - base) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [state]);

  const acquireWakeLock = useCallback(async () => { try { if ("wakeLock" in navigator) wakeLock.current = await navigator.wakeLock.request("screen"); } catch { /* no soportado */ } }, []);
  const releaseWakeLock = useCallback(() => { wakeLock.current?.release().catch(() => undefined); wakeLock.current = null; }, []);
  const persistDraft = useCallback(() => { if (startedRef.current) saveDraft({ vehicleId, startedAt: startedRef.current, points: pts.current }); }, [vehicleId]);

  const onPosition = useCallback((pos: GeolocationPosition) => {
    const { latitude, longitude, accuracy, speed } = pos.coords;
    setAccuracyM(Math.round(accuracy));
    if (accuracy > maxAccuracyM) return;
    const p: TrackPoint = [latitude, longitude, pos.timestamp || Date.now()];
    const last = pts.current.at(-1);
    if (last) {
      const stepKm = haversineKm({ lat: last[0], lng: last[1] }, { lat: p[0], lng: p[1] });
      if (stepKm * 1000 < minStepM) { setState("tracking"); return; }
      const kmh = speedKmh(last, p);
      if (kmh > maxJumpKmh) return;
      dist.current += stepKm;
      const shown = speed != null && speed >= 0 ? speed * 3.6 : kmh;
      setCurrentKmh(Math.round(shown));
      if (shown > maxSpeed.current) maxSpeed.current = shown;
      setDistanceKm(Number(dist.current.toFixed(2)));
    }
    pts.current = [...pts.current, p];
    setPoints(pts.current);
    setState("tracking");
    setMessage("");
  }, [maxAccuracyM, minStepM, maxJumpKmh]);

  const onError = useCallback((err: GeolocationPositionError) => {
    const msgs: Record<number, string> = { 1: "Autoriza la ubicación para registrar el recorrido.", 2: "No hay señal de GPS. Seguimos intentando.", 3: "El GPS tarda en responder. Seguimos intentando." };
    setMessage(msgs[err.code] ?? "No pudimos leer la ubicación.");
    if (err.code === 1) setState("error");
  }, []);

  const beginWatch = useCallback(() => {
    if (!("geolocation" in navigator)) { setState("error"); setMessage("Este dispositivo no permite usar GPS."); return; }
    watchId.current = navigator.geolocation.watchPosition(onPosition, onError, { enableHighAccuracy: true, maximumAge: 0, timeout: 15_000 });
    void acquireWakeLock();
    draftTimer.current = window.setInterval(persistDraft, 10_000);
  }, [onPosition, onError, acquireWakeLock, persistDraft]);

  const start = useCallback(() => {
    pts.current = []; dist.current = 0; maxSpeed.current = 0;
    setPoints([]); setDistanceKm(0); setCurrentKmh(0); setElapsed(0);
    const now = new Date().toISOString();
    startedRef.current = now; setStartedAt(now);
    saveDraft({ vehicleId, startedAt: now, points: [] });
    setHasDraft(false); setState("locating"); setMessage("Buscando señal de GPS…");
    beginWatch();
  }, [vehicleId, beginWatch]);

  const resume = useCallback(() => {
    const d = loadDraft(); if (!d) return;
    pts.current = d.points; dist.current = 0; maxSpeed.current = 0;
    for (let i = 1; i < d.points.length; i++) dist.current += haversineKm({ lat: d.points[i - 1][0], lng: d.points[i - 1][1] }, { lat: d.points[i][0], lng: d.points[i][1] });
    setPoints(d.points); setDistanceKm(Number(dist.current.toFixed(2)));
    startedRef.current = d.startedAt; setStartedAt(d.startedAt);
    setHasDraft(false); setState("locating"); setMessage("Retomando el recorrido…");
    beginWatch();
  }, [beginWatch]);

  const discardDraft = useCallback(() => { saveDraft(null); setHasDraft(false); }, []);

  const stop = useCallback((): TrackedTrip | null => {
    if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current);
    if (draftTimer.current) window.clearInterval(draftTimer.current);
    watchId.current = null; draftTimer.current = null;
    releaseWakeLock();
    const raw = pts.current;
    const endedAt = new Date().toISOString();
    if (raw.length < 2 || dist.current < 0.05) { saveDraft(null); setState("idle"); setMessage("El recorrido no registró distancia."); return null; }
    setState("saving");
    const route = simplifyRoute(raw, 10);
    const first = raw[0], lastP = raw[raw.length - 1];
    const started = startedRef.current ?? new Date(first[2]).toISOString();
    const durationSeconds = Math.max(1, Math.round((Date.now() - new Date(started).getTime()) / 1000));
    return {
      startedAt: started, endedAt, durationSeconds, distanceKm: Number(dist.current.toFixed(3)),
      startLat: first[0], startLng: first[1], endLat: lastP[0], endLng: lastP[1],
      routePoints: route, maxSpeedKmh: Number(maxSpeed.current.toFixed(1)), avgSpeedKmh: Number((dist.current / (durationSeconds / 3600)).toFixed(1)),
    };
  }, [releaseWakeLock]);

  /** Llamar después de guardar (o si falló) para volver a reposo. */
  const finish = useCallback((ok: boolean, msg?: string) => { if (ok) saveDraft(null); setState(ok ? "idle" : "error"); setMessage(msg ?? ""); if (ok) { pts.current = []; setPoints([]); } }, []);

  useEffect(() => () => { if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current); if (draftTimer.current) window.clearInterval(draftTimer.current); releaseWakeLock(); }, [releaseWakeLock]);
  useEffect(() => { const onVis = () => { if (document.visibilityState === "visible" && watchId.current != null) void acquireWakeLock(); }; document.addEventListener("visibilitychange", onVis); return () => document.removeEventListener("visibilitychange", onVis); }, [acquireWakeLock]);

  return { state, points, distanceKm, currentKmh, accuracyM, elapsed, startedAt, message, hasDraft, start, stop, finish, resume, discardDraft };
}
