export const GPS_STALE_MS = 30_000;
export const GPS_MAX_FIX_AGE_MS = 15_000;
export const GPS_GOOD_ACCURACY_M = 15;
export const GPS_MAX_ACCURACY_M = 50;

export type GpsSignal = { label: string; tone: "neutral" | "good" | "fair" | "poor"; ageSeconds: number | null };

export function gpsSignal(state: string, accuracyM: number, lastFixAt: number | null, now = Date.now()): GpsSignal {
  const ageSeconds = lastFixAt === null ? null : Math.max(0, Math.floor((now - lastFixAt) / 1000));
  if (state === "error") return { label: "GPS no disponible", tone: "poor", ageSeconds };
  if (state === "idle" || state === "saving") return { label: "GPS en espera", tone: "neutral", ageSeconds };
  if (accuracyM > GPS_MAX_ACCURACY_M) return { label: "Precisión baja", tone: "poor", ageSeconds };
  if (ageSeconds !== null && now - lastFixAt! >= GPS_STALE_MS) return { label: "Sin ubicación reciente", tone: "poor", ageSeconds };
  if (state === "locating" || lastFixAt === null) return { label: "Buscando ubicación", tone: "neutral", ageSeconds };
  return accuracyM <= GPS_GOOD_ACCURACY_M
    ? { label: "Señal buena", tone: "good", ageSeconds }
    : { label: "Señal aceptable", tone: "fair", ageSeconds };
}

export function validGpsFix(position: GeolocationPosition, now = Date.now()): boolean {
  const { latitude, longitude, accuracy } = position.coords;
  return Number.isFinite(latitude) && Math.abs(latitude) <= 90 && Number.isFinite(longitude) && Math.abs(longitude) <= 180
    && Number.isFinite(accuracy) && accuracy > 0 && Number.isFinite(position.timestamp) && position.timestamp > 0
    && position.timestamp <= now + 5_000 && now - position.timestamp <= GPS_MAX_FIX_AGE_MS;
}
