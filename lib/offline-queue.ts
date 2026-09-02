// AUTORAM · cola offline
// Todo lo que el conductor registra se guarda primero en IndexedDB y se envía
// a Supabase cuando hay señal. Cada registro lleva client_id (UUID) para que
// un reintento nunca duplique filas (ver 002_trips_route.sql).
//
// Uso:
//   await outbox.enqueue({ table: 'trips', payload: {...} });
//   outbox.start(supabase);       // una vez, al montar la app
//   outbox.subscribe(state => …); // para mostrar "3 pendientes" en la UI

import type { SupabaseClient } from '@supabase/supabase-js';

export type OutboxItem = {
  id: string;            // = client_id
  table: string;
  op: 'insert' | 'update';
  match?: Record<string, unknown>; // solo para update
  payload: Record<string, unknown>;
  created_at: number;
  attempts: number;
  last_error?: string;
};

export type OutboxState = {
  pending: number;
  syncing: boolean;
  online: boolean;
  lastSyncAt: number | null;
};

const DB_NAME = 'autoram';
const STORE = 'outbox';
const MAX_ATTEMPTS = 20;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' }).createIndex('created_at', 'created_at');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T> | void): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const store = t.objectStore(STORE);
        const req = fn(store);
        t.oncomplete = () => resolve(req ? (req.result as T) : (undefined as T));
        t.onerror = () => reject(t.error);
      }),
  );
}

export function newClientId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  // fallback RFC4122 v4
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

class Outbox {
  private client: SupabaseClient | null = null;
  private listeners = new Set<(s: OutboxState) => void>();
  private state: OutboxState = {
    pending: 0,
    syncing: false,
    online: typeof navigator === 'undefined' ? true : navigator.onLine,
    lastSyncAt: null,
  };
  private timer: number | null = null;

  /** Llamar una vez con el cliente de Supabase autenticado. */
  start(client: SupabaseClient) {
    this.client = client;
    if (typeof window === 'undefined') return;
    window.addEventListener('online', () => { this.set({ online: true }); void this.flush(); });
    window.addEventListener('offline', () => this.set({ online: false }));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void this.flush();
    });
    this.timer = window.setInterval(() => void this.flush(), 30_000);
    void this.refreshCount().then(() => this.flush());
  }

  stop() {
    if (this.timer) window.clearInterval(this.timer);
  }

  subscribe(fn: (s: OutboxState) => void) {
    this.listeners.add(fn);
    fn(this.state);
    return () => {
      this.listeners.delete(fn);
    };
  }

  /**
   * Guarda localmente y dispara sincronización. Devuelve el client_id.
   * El payload NO debe incluir client_id; se agrega aquí.
   */
  async enqueue(item: Omit<OutboxItem, 'id' | 'created_at' | 'attempts'> & { id?: string }): Promise<string> {
    const id = item.id ?? newClientId();
    const record: OutboxItem = { ...item, id, created_at: Date.now(), attempts: 0 };
    await tx('readwrite', (s) => s.put(record));
    await this.refreshCount();
    void this.flush();
    return id;
  }

  async pendingItems(): Promise<OutboxItem[]> {
    const all = await tx<OutboxItem[]>('readonly', (s) => s.getAll());
    return all.sort((a, b) => a.created_at - b.created_at);
  }

  /** Intenta enviar todo lo pendiente, en orden. */
  async flush(): Promise<void> {
    if (!this.client || this.state.syncing || !this.state.online) return;
    const items = await this.pendingItems();
    if (!items.length) return;
    this.set({ syncing: true });

    for (const item of items) {
      try {
        await this.send(item);
        await tx('readwrite', (s) => s.delete(item.id));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const attempts = item.attempts + 1;
        // Errores de datos (RLS, columna inválida) no se arreglan reintentando:
        // los dejamos para revisión pero no bloqueamos los demás.
        await tx('readwrite', (s) => s.put({ ...item, attempts, last_error: msg }));
        if (attempts >= MAX_ATTEMPTS) {
          console.warn('[outbox] descartado tras', attempts, 'intentos', item, msg);
          await tx('readwrite', (s) => s.delete(item.id));
        }
        if (/network|fetch|timeout|Failed to fetch/i.test(msg)) break; // sin señal: paramos y esperamos
      }
    }

    await this.refreshCount();
    this.set({ syncing: false, lastSyncAt: Date.now() });
  }

  private async send(item: OutboxItem) {
    const c = this.client!;
    if (item.op === 'insert') {
      const { error } = await c.from(item.table).insert({ ...item.payload, client_id: item.id });
      // 23505 = unique_violation → ya se había insertado en un intento anterior. Listo.
      if (error && error.code !== '23505') throw new Error(`${error.code ?? ''} ${error.message}`);
      return;
    }
    let q = c.from(item.table).update(item.payload);
    for (const [k, v] of Object.entries(item.match ?? {})) q = q.eq(k, v as never);
    const { error } = await q;
    if (error) throw new Error(`${error.code ?? ''} ${error.message}`);
  }

  private async refreshCount() {
    const n = await tx<number>('readonly', (s) => s.count());
    this.set({ pending: n });
  }

  private set(patch: Partial<OutboxState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((fn) => fn(this.state));
  }
}

export const outbox = new Outbox();
