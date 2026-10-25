import type { GpsSignal } from "@/lib/gps-signal";

export default function GpsQuality({ signal, accuracyM, gapCount }: { signal: GpsSignal; accuracyM: number; gapCount: number }) {
  return (
    <section className="gps-quality" aria-label="Calidad del GPS" data-tone={signal.tone}>
      <div className="gps-quality__heading"><b><i aria-hidden="true" />{signal.label}</b><span>{accuracyM > 0 ? "Precisión recibida: ± " + accuracyM + " m" : "Precisión pendiente"}</span></div>
      <p>{signal.ageSeconds === null ? "Todavía no hay una ubicación válida en esta sesión." : "Última ubicación válida: hace " + signal.ageSeconds + " s."}</p>
      <small>{gapCount > 0 ? gapCount + " interrupción" + (gapCount === 1 ? "" : "es") + ": los tramos sin datos no se suman a los kilómetros." : "Los kilómetros se calculan con ubicaciones válidas. La precisión es estimada."}</small>
    </section>
  );
}
