"use client";

// Registro GPS del recorrido. Reemplaza el watchPosition de NavigatePage.
//  · Guarda la ruta completa (no solo inicio/fin).
//  · Ignora el temblor del GPS cuando el carro está quieto.
//  · Si la app se cierra a mitad de viaje, el borrador sobrevive y se retoma.
//  · Mantiene la pantalla encendida (Wake Lock).
//  · stop() devuelve el registro listo para saveTrip(); no guarda por su cuenta.

import { useCallback, useEffect, useRef, useState } from "react";
import { haversineKm, simplifyRoute, speedKmh, type TrackPoint } from "@/lib/geo";
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
const loadDraft = (key: string): Draft | null => { try { const raw = localStorage.getItem(key); if (!raw) return null;
  const d = JSON.parse(raw) as Draft;
  if (!d || !Number.isFinite(Date.parse(d.startedAt)) || !Array.isArray(d.points) ||
      !d.points.every(point => Array.isArray(point) && point.length === 3 && point.every(Number.isFinite) && Math.abs(point[0]) <= 90 && Math.abs(point[1]) <= 180)) return null;
  return d; } catch { return null; } };
const saveDraft = (key: string, d: Draft | null) => { try { if (d) localStorage.setItem(key, JSON.stringify(d)); else localStorage.removeItem(key); } catch { /* sin espacio */ } };

export function useTripTracker({ vehicleId, userId, maxAccuracyM = 50, minStepM = 8, maxJumpKmh = 200 }: Options) {
  const draftKey = userId ? `${DRAFT_KEY}.${userId}.${vehicleId}` : DRAFT_KEY;
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
  const owner = useRef({ key: draftKey, vehicleId, clientId: "" });

  useEffect(() => {
    const timer = window.setTimeout(() => { const d = loadDraft(draftKey); setHasDraft(!!d && d.vehicleId === vehicleId && d.points.length > 1); setState("idle"); setPoints([]); setDistanceKm(0); setElapsed(0); setMessage(""); }, 0);
    return () => window.clearTimeout(timer);
  }, [vehicleId, draftKey]);

  useEffect(() => {
    if (state !== "tracking" && state !== "locating") return;
    const base = startedRef.current ? new Date(startedRef.current).getTime() : Date.now();
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - base) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [state]);

  const acquireWakeLock = useCallback(async () => { try { if ("wakeLock" in navigator) wakeLock.current = await navigator.wakeLock.request("screen"); } catch { /* no soportado */ } }, []);
  const releaseWakeLock = useCallback(() => { wakeLock.current?.release().catch(() => undefined); wakeLock.current = null; }, []);
  const persistDraft = useCallback(() => { if (startedRef.current) saveDraft(owner.current.key, { vehicleId: owner.current.vehicleId, clientId: owner.current.clientId, startedAt: startedRef.current, points: pts.current }); }, []);

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
    persistDraft();
    setPoints(pts.current);
    setState("tracking");
    setMessage("");
  }, [maxAccuracyM, minStepM, maxJumpKmh, persistDraft]);

  const onError = useCallback((err: GeolocationPositionError) => {
    const msgs: Record<number, string> = { 1: "Autoriza la ubicación para registrar el recorrido.", 2: "No hay señal de GPS. Seguimos intentando.", 3: "El GPS tarda en responder. Seguimos intentando." };
    setMessage(msgs[err.code] ?? "No pudimos leer la ubicación.");
    if (err.code === 1) {
      if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current);
      if (draftTimer.current != null) window.clearInterval(draftTimer.current);
      watchId.current = null; draftTimer.current = null;
      persistDraft(); releaseWakeLock();
      setHasDraft(pts.current.length > 1); setState("error");
    }
  }, [persistDraft, releaseWakeLock]);

  const beginWatch = useCallback(() => {
    if (!("geolocation" in navigator)) { setState("error"); setMessage("Este dispositivo no permite usar GPS."); return; }
    if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current);
    if (draftTimer.current != null) window.clearInterval(draftTimer.current);
    watchId.current = navigator.geolocation.watchPosition(onPosition, onError, { enableHighAccuracy: true, maximumAge: 0, timeout: 15_000 });
    void acquireWakeLock();
    draftTimer.current = window.setInterval(persistDraft, 10_000);
  }, [onPosition, onError, acquireWakeLock, persistDraft]);

  const start = useCallback(() => {
    if (!vehicleId) { setMessage("Selecciona un vehículo antes de iniciar."); return; }
    owner.current = { key: draftKey, vehicleId, clientId: newClientId() };
    pts.current = []; dist.current = 0; maxSpeed.current = 0;
    setPoints([]); setDistanceKm(0); setCurrentKmh(0); setElapsed(0);
    const now = new Date().toISOString();
    startedRef.current = now; setStartedAt(now);
    saveDraft(draftKey, { vehicleId, clientId: owner.current.clientId, startedAt: now, points: [] });
    setHasDraft(false); setState("locating"); setMessage("Buscando señal de GPS…");
    beginWatch();
  }, [vehicleId, draftKey, beginWatch]);

  const resume = useCallback(() => {
    const d = loadDraft(draftKey); if (!d || d.vehicleId !== vehicleId) return;
    owner.current = { key: draftKey, vehicleId, clientId: d.clientId || newClientId() };
    pts.current = d.points; dist.current = 0; maxSpeed.current = 0;
    for (let i = 1; i < d.points.length; i++) { dist.current += haversineKm({ lat: d.points[i - 1][0], lng: d.points[i - 1][1] }, { lat: d.points[i][0], lng: d.points[i][1] }); maxSpeed.current = Math.max(maxSpeed.current, speedKmh(d.points[i - 1], d.points[i])); }
    setPoints(d.points); setDistanceKm(Number(dist.current.toFixed(2)));
    startedRef.current = d.startedAt; setStartedAt(d.startedAt);
    setHasDraft(false); setState("locating"); setMessage("Retomando el recorrido…");
    beginWatch();
  }, [beginWatch, vehicleId, draftKey]);

  const discardDraft = useCallback(() => { saveDraft(draftKey, null); startedRef.current = null; pts.current = []; setPoints([]); setHasDraft(false); setMessage(""); setState("idle"); }, [draftKey]);

  const stop = useCallback((): TrackedTrip | null => {
    if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current);
    if (draftTimer.current) window.clearInterval(draftTimer.current);
    watchId.current = null; draftTimer.current = null;
    releaseWakeLock();
    const raw = pts.current;
    const endedAt = new Date().toISOString();
    if (raw.length < 2 || dist.current < 0.05) { saveDraft(owner.current.key, null); startedRef.current = null; setState("idle"); setMessage("El recorrido no registró distancia."); return null; }
    persistDraft();
    setState("saving");
    const route = simplifyRoute(raw, 10);
    const first = raw[0], lastP = raw[raw.length - 1];
    const started = startedRef.current ?? new Date(first[2]).toISOString();
    const durationSeconds = Math.max(1, Math.round((Date.now() - new Date(started).getTime()) / 1000));
    return {
      vehicleId: owner.current.vehicleId!, clientId: owner.current.clientId,
      startedAt: started, endedAt, durationSeconds, distanceKm: Number(dist.current.toFixed(3)),
      startLat: first[0], startLng: first[1], endLat: lastP[0], endLng: lastP[1],
      routePoints: route, maxSpeedKmh: Number(maxSpeed.current.toFixed(1)), avgSpeedKmh: Number((dist.current / (durationSeconds / 3600)).toFixed(1)),
    };
  }, [releaseWakeLock, persistDraft]);

  /** Llamar después de guardar (o si falló) para volver a reposo. */
  const finish = useCallback((ok: boolean, msg?: string) => { if (ok) { saveDraft(owner.current.key, null); startedRef.current = null; } setHasDraft(!ok && pts.current.length > 1); setState(ok ? "idle" : "error"); setMessage(msg ?? ""); if (ok) { pts.current = []; setPoints([]); } }, []);

  useEffect(() => () => { persistDraft(); if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current); if (draftTimer.current != null) window.clearInterval(draftTimer.current); watchId.current = null; draftTimer.current = null; startedRef.current = null; pts.current = []; dist.current = 0; releaseWakeLock(); }, [draftKey, releaseWakeLock, persistDraft]);
  useEffect(() => { const onVis = () => { if (document.visibilityState === "visible" && watchId.current != null) void acquireWakeLock(); else persistDraft(); }; const onHide = () => persistDraft(); document.addEventListener("visibilitychange", onVis); window.addEventListener("pagehide", onHide); return () => { document.removeEventListener("visibilitychange", onVis); window.removeEventListener("pagehide", onHide); }; }, [acquireWakeLock, persistDraft]);

  return { state, points, distanceKm, currentKmh, accuracyM, elapsed, startedAt, message, hasDraft, start, stop, finish, resume, discardDraft };
}
