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
import { asError } from '@/lib/errors';

export type OutboxItem = {
  id: string;            // = client_id
  table: string;
  op: 'insert' | 'update';
  match?: Record<string, unknown>; // solo para update
  payload: Record<string, unknown>;
  created_at: number;
  attempts: number;
  last_error?: string;
  local_id?: number;
};

export type OutboxState = {
  pending: number;
  syncing: boolean;
  online: boolean;
  lastSyncAt: number | null;
  blocked: number;
  lastError: string | null;
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
        t.onabort = () => reject(t.error || new Error('No pudimos guardar en el teléfono.'));
        t.addEventListener?.('complete', () => db.close());
        t.addEventListener?.('abort', () => db.close());
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
    blocked: 0,
    lastError: null,
  };
  private timer: number | null = null;
  private userId: string | null = null;
  private nextLocalId = Date.now();
  private onOnline = () => { this.set({ online: true }); this.run(); };
  private onOffline = () => this.set({ online: false });
  private onVisible = () => { if (document.visibilityState === 'visible') this.run(); };
  private run() { void this.flush().catch(error => this.set({ lastError: asError(error).message })); }

  /** Llamar una vez con el cliente de Supabase autenticado. */
  start(client: SupabaseClient, userId: string) {
    this.stop();
    this.client = client;
    this.userId = userId;
    if (typeof window === 'undefined') return;
    this.set({ online: navigator.onLine });
    window.addEventListener('online', this.onOnline);
    window.addEventListener('offline', this.onOffline);
    document.addEventListener('visibilitychange', this.onVisible);
    this.timer = window.setInterval(() => this.run(), 30_000);
    void this.refreshCount().then(() => this.run()).catch(error => this.set({ lastError: asError(error).message }));
  }

  stop() {
    if (typeof window !== 'undefined') {
      if (this.timer !== null) window.clearInterval(this.timer);
      window.removeEventListener('online', this.onOnline);
      window.removeEventListener('offline', this.onOffline);
      document.removeEventListener('visibilitychange', this.onVisible);
    }
    this.timer = null;
    this.client = null;
    this.userId = null;
  }

  subscribe(fn: (s: OutboxState) => void) {
    this.listeners.add(fn);
    fn(this.state);
    return () => { this.listeners.delete(fn); };
  }

  /**
   * Guarda localmente y dispara sincronización. Devuelve el client_id.
   * El payload NO debe incluir client_id; se agrega aquí.
   */
  async enqueue(item: Omit<OutboxItem, 'id' | 'created_at' | 'attempts'> & { id?: string }, options: { autoFlush?: boolean } = {}): Promise<string> {
    const id = item.id ?? newClientId();
    const existing = (await this.pendingItems(null)).find(record => record.id === id);
    this.nextLocalId = Math.max(this.nextLocalId + 1, Date.now());
    const record: OutboxItem = { ...item, id, created_at: existing?.created_at ?? Date.now(), local_id: existing?.local_id ?? -this.nextLocalId, attempts: 0 };
    await tx('readwrite', (s) => s.put(record));
    await this.refreshCount();
    if (options.autoFlush !== false) this.run();
    return id;
  }

  async pendingItems(userId: string | null = this.userId): Promise<OutboxItem[]> {
    const all = await tx<OutboxItem[]>('readonly', (s) => s.getAll());
    return all.filter(item => !userId || (item.payload.user_id ?? item.match?.user_id) === userId).sort((a, b) => a.created_at - b.created_at);
  }

  async acknowledge(id: string): Promise<void> {
    await tx('readwrite', store => store.delete(id));
    await this.refreshCount();
  }

  async recordFailure(id: string, error: unknown): Promise<void> {
    const item = (await this.pendingItems(null)).find(record => record.id === id);
    if (item) await tx('readwrite', store => store.put({ ...item, attempts: item.attempts + 1, last_error: asError(error).message }));
    await this.refreshCount();
  }

  async retryBlocked(): Promise<void> {
    if (this.state.syncing) return;
    for (const item of await this.pendingItems()) {
      if (item.attempts >= MAX_ATTEMPTS) await tx('readwrite', store => store.put({ ...item, attempts: 0, last_error: undefined }));
    }
    await this.refreshCount();
    await this.flush();
  }

  /** Intenta enviar todo lo pendiente, en orden. */
  async flush(): Promise<void> {
    if (!this.client || this.state.syncing || !this.state.online) return;
    const userId = this.userId;
    this.set({ syncing: true });
    try {
    const items = await this.pendingItems();
    if (!items.length) return;

    for (const item of items) {
      if (userId !== this.userId || !this.client) break;
      if (item.attempts >= MAX_ATTEMPTS) continue;
      try {
        await this.send(item);
        await tx('readwrite', (s) => s.delete(item.id));
      } catch (err) {
        const msg = asError(err).message;
        const attempts = item.attempts + 1;
        // Errores de datos (RLS, columna inválida) no se arreglan reintentando:
        // los dejamos para revisión pero no bloqueamos los demás.
        await tx('readwrite', (s) => s.put({ ...item, attempts, last_error: msg }));
        if (attempts >= MAX_ATTEMPTS) {
          // Preserve failed records for review instead of deleting user data.
          console.warn('[outbox] registro pendiente de revisión tras', attempts, 'intentos');
        }
        if (/network|fetch|timeout|Failed to fetch/i.test(msg)) break; // sin señal: paramos y esperamos
      }
    }

    await this.refreshCount();
    this.set({ lastSyncAt: Date.now() });
    } finally { this.set({ syncing: false }); }
  }

  private async send(item: OutboxItem) {
    const c = this.client!;
    if (item.op === 'insert') {
      const { error } = await c.from(item.table).insert({ ...item.payload, client_id: item.id });
      // Solo reconocemos el mismo client_id como un envío ya completado.
      if (error?.code === '23505') {
        const existing = await c.from(item.table).select('client_id').eq('client_id', item.id).eq('user_id', item.payload.user_id as string).maybeSingle();
        if (!existing.error && existing.data?.client_id === item.id) return;
      }
      if (error) throw asError(error);
      return;
    }
    let q = c.from(item.table).update(item.payload);
    for (const [k, v] of Object.entries(item.match ?? {})) q = q.eq(k, v as never);
    const { data, error } = await q.select('id');
    if (error) throw asError(error);
    if (!data?.length) throw new Error('No pudimos actualizar la jornada. Revisa el registro pendiente.');
  }

  private async refreshCount() {
    const items = await this.pendingItems();
    this.set({ pending: items.length, blocked: items.filter(item => item.attempts >= MAX_ATTEMPTS).length, lastError: items.findLast(item => item.last_error)?.last_error ?? null });
  }

  private set(patch: Partial<OutboxState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((fn) => fn(this.state));
  }
}

export const outbox = new Outbox();
