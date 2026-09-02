// AUTORAM · SyncStatus — muestra si hay registros esperando señal.
// Solo aparece cuando hay algo pendiente o no hay conexión; si todo está
// sincronizado no ocupa espacio.

"use client";

import { useEffect, useState } from 'react';
import { outbox, type OutboxState } from "@/lib/offline-queue";

export default function SyncStatus() {
  const [s, setS] = useState<OutboxState | null>(null);
  useEffect(() => outbox.subscribe(setS), []);

  if (!s || (s.online && s.pending === 0)) return null;

  const text = !s.online
    ? s.pending
      ? `Sin señal · ${s.pending} registro${s.pending > 1 ? 's' : ''} guardado${s.pending > 1 ? 's' : ''} en el teléfono`
      : 'Sin señal · puedes seguir registrando'
    : s.syncing
      ? `Enviando ${s.pending}…`
      : `${s.pending} pendiente${s.pending > 1 ? 's' : ''} por enviar`;

  return (
    <div
      role="status"
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 12px', borderRadius: 10, fontSize: 13,
        background: s.online ? 'rgba(184,255,44,0.10)' : 'rgba(252,209,22,0.12)',
        color: '#F5F7F5', border: '1px solid rgba(245,247,245,0.08)',
      }}
    >
      <span
        aria-hidden
        style={{
          width: 8, height: 8, borderRadius: 999,
          background: s.online ? '#B8FF2C' : '#FCD116',
          boxShadow: s.syncing ? '0 0 0 4px rgba(184,255,44,0.25)' : 'none',
        }}
      />
      {text}
      {s.online && !s.syncing && (
        <button
          type="button"
          onClick={() => void outbox.flush()}
          style={{ marginLeft: 'auto', background: 'none', border: 0, color: '#B8FF2C', fontSize: 13, cursor: 'pointer' }}
        >
          Enviar ahora
        </button>
      )}
    </div>
  );
}
