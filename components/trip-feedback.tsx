import { AlertTriangle, Navigation } from "lucide-react";
import type { TrackerState } from "@/hooks/use-trip-tracker";

export default function TripFeedback({ state, message }: { state: TrackerState; message: string }) {
  if (!message) return null;
  const failed = state === "error";
  const Icon = failed ? AlertTriangle : Navigation;
  return (
    <div className="trip-feedback" role={failed ? "alert" : "status"} aria-atomic="true">
      <Icon size={20} aria-hidden="true" />
      <div>
        <b>{failed ? "No pudimos usar el GPS" : "Estado del recorrido"}</b>
        <p>{message}</p>
      </div>
    </div>
  );
}
