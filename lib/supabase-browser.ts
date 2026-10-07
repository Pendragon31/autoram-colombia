import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { newClientId, outbox } from "@/lib/offline-queue";
import { asError } from "@/lib/errors";

let browserClient: SupabaseClient | null = null;
type RowValue = string | number | boolean | null | RowValue[] | { [key: string]: RowValue | undefined };
type Row = Record<string, RowValue | undefined>;

function publicConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Autoram no tiene configurada la conexión de datos.");
  return { url, key };
}

export function getSupabaseBrowserClient() {
  if (!browserClient) {
    const { url, key } = publicConfig();
    browserClient = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  }
  return browserClient;
}

function json(data: unknown, status = 200) { return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } }); }
function fail(error: unknown): never { throw asError(error); }
function driverOut(row: Row | null) { return row ? { fullName: row.full_name, document: row.document, phone: row.phone, email: row.email || "", city: row.city, address: row.address || "", license: row.license, category: row.category } : null; }
const PRIVATE_IMAGE_PREFIX = "storage://vehicle-images/";
function vehicleOut(row: Row | null) {
  if (!row) return null;
  const storedImage = String(row.image_url || "");
  const imageStoragePath = storedImage.startsWith(PRIVATE_IMAGE_PREFIX) ? storedImage.slice(PRIVATE_IMAGE_PREFIX.length) : "";
  return { id: Number(row.id), type: row.type, brand: row.brand, model: row.model, version: row.version || "", year: String(row.year), plate: row.plate, color: row.color || "", fuel: row.fuel, transmission: row.transmission, odometer: String(row.odometer), tires: row.tires, brakes: row.brakes, fluids: row.fluids, battery: row.battery, general: row.general, vin: row.vin || "", imageUrl: imageStoragePath ? "" : storedImage, imageStoragePath, imageAttribution: row.image_attribution || "" };
}
async function vehicleWithImage(supabase: SupabaseClient, row: Row | null) {
  const vehicle = vehicleOut(row);
  if (vehicle?.imageStoragePath) {
    try {
      const result = await supabase.storage.from("vehicle-images").createSignedUrl(vehicle.imageStoragePath, 3600);
      if (!result.error && result.data) vehicle.imageUrl = result.data.signedUrl;
    } catch { /* El resto del vehículo sigue disponible si falla la foto. */ }
  }
  return vehicle;
}
function fuelOut(row: Row) { return { id: Number(row.id), vehicleId: Number(row.vehicle_id), occurredAt: row.occurred_at, odometer: Number(row.odometer), station: row.station, fuelType: row.fuel_type, gallons: Number(row.gallons), pricePerGallon: Number(row.price_per_gallon), total: Number(row.total), payment: row.payment || "", fillType: row.fill_type || "", notes: row.notes || "" }; }
function maintenanceOut(row: Row) { return { id: Number(row.id), vehicleId: Number(row.vehicle_id), occurredAt: row.occurred_at, odometer: Number(row.odometer), movementType: row.movement_type, category: row.category, issue: row.issue, workDone: row.work_done, shop: row.shop, phone: row.phone || "", laborCost: Number(row.labor_cost), partsCost: Number(row.parts_cost), total: Number(row.total), warranty: row.warranty || "", nextKm: row.next_km === null ? null : Number(row.next_km), notes: row.notes || "" }; }
function workOut(row: Row) { return { id: Number(row.id), vehicleId: Number(row.vehicle_id), role: row.role, platforms: JSON.stringify(row.platforms || []), activity: row.activity || "", startedAt: row.started_at, endedAt: row.ended_at, startOdometer: Number(row.start_odometer), endOdometer: row.end_odometer === null ? null : Number(row.end_odometer), income: Number(row.income), expenses: Number(row.expenses) }; }
function tripOut(row: Row) { return { id: Number(row.id), vehicleId: Number(row.vehicle_id), startedAt: row.started_at, endedAt: row.ended_at, durationSeconds: Number(row.duration_seconds), distanceKm: Number(row.distance_km), startLat: row.start_lat === null ? null : Number(row.start_lat), startLng: row.start_lng === null ? null : Number(row.start_lng), endLat: row.end_lat === null ? null : Number(row.end_lat), endLng: row.end_lng === null ? null : Number(row.end_lng), routePoints: Array.isArray(row.route_points) ? row.route_points : null, maxSpeedKmh: row.max_speed_kmh === null || row.max_speed_kmh === undefined ? null : Number(row.max_speed_kmh), avgSpeedKmh: row.avg_speed_kmh === null || row.avg_speed_kmh === undefined ? null : Number(row.avg_speed_kmh) }; }
function quoteOut(row: Row) { return { id: Number(row.id), vehicleId: Number(row.vehicle_id), serviceName: row.service_name, createdAt: row.created_at, startOdometer: Number(row.start_odometer), endOdometer: Number(row.end_odometer), serviceKm: Number(row.service_km), extraKm: Number(row.extra_km), totalKm: Number(row.total_km), fuelPrice: Number(row.fuel_price), efficiencyKpg: Number(row.efficiency_kpg), fuelCost: Number(row.fuel_cost), wearPerKm: Number(row.wear_per_km), wearCost: Number(row.wear_cost), tolls: Number(row.tolls), otherCosts: Number(row.other_costs), hours: Number(row.hours), hourlyRate: Number(row.hourly_rate), timeCost: Number(row.time_cost), commissionPct: Number(row.commission_pct), marginPct: Number(row.margin_pct), operatingCost: Number(row.operating_cost), recommendedPrice: Number(row.recommended_price), pricePerKm: Number(row.price_per_km) }; }
function documentOut(row: Row) { return { id: Number(row.id), vehicleId: Number(row.vehicle_id), documentType: row.document_type, documentNumber: row.document_number || "", issuedAt: row.issued_at || "", expiresAt: row.expires_at || "", provider: row.provider || "", notes: row.notes || "", createdAt: row.created_at }; }

const NETWORK_ERROR = /fetch|network|timeout|ECONN|Load failed/i;
function isNetworkError(error: { message?: string } | null | undefined) { return !!error && NETWORK_ERROR.test(String(error.message || "")); }

// La copia duradera existe antes de cualquier solicitud de red.
async function insertOrQueue(supabase: SupabaseClient, table: string, payload: Row, clientId = newClientId()) {
  await outbox.enqueue({ id: clientId, table, op: "insert", payload }, { autoFlush: false });
  const item = (await outbox.pendingItems(String(payload.user_id))).find(record => record.id === clientId)!;
  const queued = { id: item.local_id!, createdAt: new Date(item.created_at).toISOString(), queued: true };
  if (typeof navigator !== "undefined" && !navigator.onLine) return queued;
  try {
    const result = await supabase.from(table).insert({ ...payload, client_id: clientId }).select("id, created_at").single();
    let saved = result.data, error = result.error;
    if (result.error?.code === "23505") {
      const existing = await supabase.from(table).select("id, created_at").eq("client_id", clientId).eq("user_id", String(payload.user_id)).maybeSingle();
      if (!existing.error && existing.data) { saved = existing.data; error = null; }
    }
    if (error) fail(error);
    if (!saved) throw new Error("No pudimos confirmar el registro. La copia sigue en el teléfono.");
    await cacheConfirmedInsert(String(payload.user_id), table, { ...payload, ...saved, client_id: clientId });
    await outbox.acknowledge(clientId);
    return { id: Number(saved.id), createdAt: String(saved.created_at || queued.createdAt), queued: false };
  } catch (error) {
    await outbox.recordFailure(clientId, error);
    if (isNetworkError(asError(error))) return queued;
    fail(error);
  }
}

// Resumen del panel calculado en la base de datos (003_views_rpc). Si la función aún no existe, devuelve null.
async function loadSummary(supabase: SupabaseClient, vehicleId: number) {
  try {
    const result = await supabase.rpc("dashboard_summary", { p_vehicle_id: vehicleId, p_days: 31 });
    return result.error ? null : (result.data as Row | null);
  } catch { return null; }
}

const ACCOUNT_CACHE_KEY = "autoram.account.cache.v1";
function readAccountCache(userId: string): Row | null {
  try { const raw = localStorage.getItem(ACCOUNT_CACHE_KEY); if (!raw) return null; const parsed = JSON.parse(raw) as { userId: string; account: Row }; return parsed.userId === userId && parsed.account && typeof parsed.account === "object" && Array.isArray(parsed.account.vehicles) ? parsed.account : null; } catch { return null; }
}
function writeAccountCache(userId: string, account: Row) {
  try { localStorage.setItem(ACCOUNT_CACHE_KEY, JSON.stringify({ userId, at: Date.now(), account })); } catch { /* IndexedDB conserva los pendientes. */ }
}
const collections: Record<string, { key: string; map: (row: Row) => Row }> = {
  fuel_entries: { key: "fuel", map: fuelOut }, maintenance_entries: { key: "maintenance", map: maintenanceOut },
  trips: { key: "trips", map: tripOut }, service_quotes: { key: "quotes", map: quoteOut }, vehicle_documents: { key: "documents", map: documentOut },
};
async function cacheConfirmedInsert(userId: string, table: string, row: Row) {
  const account = readAccountCache(userId), collection = collections[table];
  if (!account || !collection || Number(account.activeVehicleId) !== Number(row.vehicle_id)) return;
  const records = (account[collection.key] || []) as Row[];
  account[collection.key] = [{ ...collection.map(row), clientId: row.client_id }, ...records.filter(record => record.id !== row.id && record.clientId !== row.client_id)];
  account.summary = null;
  writeAccountCache(userId, account);
}
async function withPending(account: Row, userId: string): Promise<Row> {
  const merged = { ...account }, activeId = Number(account.activeVehicleId);
  for (const item of await outbox.pendingItems(userId)) {
    const collection = collections[item.table];
    if (item.op === "insert" && collection && Number(item.payload.vehicle_id) === activeId) {
      const records = (merged[collection.key] || []) as Row[];
      if (!records.some(record => record.clientId === item.id || record.id === item.local_id)) {
        merged[collection.key] = [{ ...collection.map({ ...item.payload, id: item.local_id, created_at: new Date(item.created_at).toISOString() } as Row), clientId: item.id }, ...records];
      }
      merged.summary = null;
    } else if (item.op === "update" && item.table === "work_sessions") {
      merged.work = ((merged.work || []) as Row[]).map(record => Number(record.id) === Number(item.match?.id) ? { ...record, endedAt: item.payload.ended_at as string, endOdometer: item.payload.end_odometer as number, income: item.payload.income as number, expenses: item.payload.expenses as number } : record);
      merged.summary = null;
    }
  }
  return merged;
}

async function actor() {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.auth.getSession();
  if (error) fail(error);
  return data.session ? { supabase, userId: data.session.user.id } : null;
}

async function activeVehicleId(supabase: SupabaseClient, userId: string) {
  const selected = await supabase.from("vehicle_selections").select("vehicle_id").eq("user_id", userId).maybeSingle();
  if (selected.error) fail(selected.error);
  if (selected.data?.vehicle_id) return Number(selected.data.vehicle_id);
  const first = await supabase.from("vehicles").select("id").eq("user_id", userId).order("created_at").limit(1).maybeSingle();
  if (first.error) fail(first.error);
  return first.data?.id ? Number(first.data.id) : null;
}
async function vehicleForWrite(supabase: SupabaseClient, userId: string, requested: RowValue | undefined) {
  const cached = readAccountCache(userId);
  const id = Number(requested || cached?.activeVehicleId);
  if (id && ((cached?.vehicles || []) as Row[]).some(vehicle => Number(vehicle.id) === id)) return id;
  if (typeof navigator !== "undefined" && !navigator.onLine) throw new Error("Abre este vehículo con conexión antes de registrar sin señal.");
  if (requested) {
    const result = await supabase.from("vehicles").select("id").eq("id", Number(requested)).eq("user_id", userId).maybeSingle();
    if (result.error) fail(result.error);
    if (!result.data) throw new Error("Vehículo no disponible.");
    return Number(result.data.id);
  }
  return activeVehicleId(supabase, userId);
}

async function loadAccount(supabase: SupabaseClient, userId: string) {
  const [driverResult, vehiclesResult, selectionResult] = await Promise.all([
    supabase.from("driver_profiles").select("*").eq("user_id", userId).maybeSingle(),
    supabase.from("vehicles").select("*").eq("user_id", userId).order("created_at"),
    supabase.from("vehicle_selections").select("vehicle_id").eq("user_id", userId).maybeSingle(),
  ]);
  if (driverResult.error) fail(driverResult.error); if (vehiclesResult.error) fail(vehiclesResult.error); if (selectionResult.error) fail(selectionResult.error);
  const vehicles = (await Promise.all((vehiclesResult.data || []).map(row => vehicleWithImage(supabase, row)))).filter(Boolean) as NonNullable<ReturnType<typeof vehicleOut>>[];
  const selectedId = Number(selectionResult.data?.vehicle_id || 0);
  const activeId = vehicles.some(item => item.id === selectedId) ? selectedId : (vehicles[0]?.id || null);
  const activeVehicle = vehicles.find(item => item.id === activeId) || null;
  if (!activeId) return { driver: driverOut(driverResult.data), vehicle: null, vehicles: [], activeVehicleId: null, fuel: [], maintenance: [], work: [], trips: [], quotes: [], documents: [], summary: null };
  const [fuel, maintenance, work, trips, quotes, documents, summary] = await Promise.all([
    supabase.from("fuel_entries").select("*").eq("vehicle_id", activeId).order("occurred_at", { ascending: false }).limit(50),
    supabase.from("maintenance_entries").select("*").eq("vehicle_id", activeId).order("occurred_at", { ascending: false }).limit(50),
    supabase.from("work_sessions").select("*").eq("vehicle_id", activeId).order("started_at", { ascending: false }).limit(30),
    supabase.from("trips").select("*").eq("vehicle_id", activeId).order("started_at", { ascending: false }).limit(50),
    supabase.from("service_quotes").select("*").eq("vehicle_id", activeId).order("created_at", { ascending: false }).limit(30),
    supabase.from("vehicle_documents").select("*").eq("vehicle_id", activeId).order("expires_at", { ascending: true, nullsFirst: false }).limit(50),
    loadSummary(supabase, activeId),
  ]);
  for (const result of [fuel, maintenance, work, trips, quotes, documents]) if (result.error) fail(result.error);
  const mapped = (rows: Row[], map: (row: Row) => Row) => rows.map(row => ({ ...map(row), clientId: row.client_id }));
  return { driver: driverOut(driverResult.data), vehicle: activeVehicle, vehicles, activeVehicleId: activeId, fuel: mapped(fuel.data || [], fuelOut), maintenance: mapped(maintenance.data || [], maintenanceOut), work: (work.data || []).map(workOut), trips: mapped(trips.data || [], tripOut), quotes: mapped(quotes.data || [], quoteOut), documents: mapped(documents.data || [], documentOut), summary };
}

async function saveAction(supabase: SupabaseClient, userId: string, action: string, d: Row) {
  const now = new Date().toISOString();
  if (action === "saveDriver") {
    const result = await supabase.from("driver_profiles").upsert({ user_id: userId, full_name: d.fullName, document: d.document, phone: d.phone, email: d.email || null, city: d.city, address: d.address || null, license: d.license, category: d.category, updated_at: now }, { onConflict: "user_id" });
    if (result.error) fail(result.error); return { ok: true, driver: d };
  }
  if (action === "saveVehicle" || action === "addVehicle") {
    const values = { user_id: userId, type: d.type, brand: d.brand, model: d.model, version: d.version || null, year: Number(d.year), plate: String(d.plate).toUpperCase(), color: d.color || null, fuel: d.fuel, transmission: d.transmission, odometer: Number(d.odometer), tires: d.tires, brakes: d.brakes, fluids: d.fluids, battery: d.battery, general: d.general, vin: d.vin || null, image_url: d.imageStoragePath ? PRIVATE_IMAGE_PREFIX + String(d.imageStoragePath) : d.imageUrl || null, image_attribution: d.imageAttribution || null, updated_at: now };
    let saved: Row | null = null;
    if (d.id) { const result = await supabase.from("vehicles").update(values).eq("id", Number(d.id)).eq("user_id", userId).select("*").single(); if (result.error) fail(result.error); saved = result.data; }
    else { const result = await supabase.from("vehicles").insert(values).select("*").single(); if (result.error) fail(result.error); saved = result.data; }
    if (!saved) throw new Error("No pudimos guardar el vehículo.");
    const selection = await supabase.from("vehicle_selections").upsert({ user_id: userId, vehicle_id: saved.id, updated_at: now }, { onConflict: "user_id" });
    if (selection.error) fail(selection.error); return { ok: true, vehicle: await vehicleWithImage(supabase, saved), id: Number(saved.id) };
  }
  if (action === "selectVehicle") {
    const id = Number(d.id); const vehicle = await supabase.from("vehicles").select("id").eq("id", id).eq("user_id", userId).maybeSingle();
    if (vehicle.error) fail(vehicle.error); if (!vehicle.data) throw new Error("Vehículo no disponible.");
    const active = await supabase.from("work_sessions").select("vehicle_id").eq("user_id", userId).is("ended_at", null).maybeSingle();
    if (active.error) fail(active.error); if (active.data && Number(active.data.vehicle_id) !== id) throw new Error("Finaliza la jornada activa antes de cambiar de vehículo.");
    const result = await supabase.from("vehicle_selections").upsert({ user_id: userId, vehicle_id: id, updated_at: now }, { onConflict: "user_id" });
    if (result.error) fail(result.error); return { ok: true, activeVehicleId: id };
  }
  if (action === "finishWork") {
    const values = { ended_at: now, end_odometer: Number(d.endOdometer), income: Number(d.income), expenses: Number(d.expenses) };
    const id = `work-finish:${userId}:${Number(d.id)}`;
    await outbox.enqueue({ id, table: "work_sessions", op: "update", match: { id: Number(d.id), user_id: userId }, payload: values }, { autoFlush: false });
    if (typeof navigator !== "undefined" && !navigator.onLine) return { ok: true, endedAt: now, queued: true };
    try {
      const result = await supabase.from("work_sessions").update(values).eq("id", Number(d.id)).eq("user_id", userId).select("id").maybeSingle();
      if (result.error) fail(result.error);
      if (!result.data) throw new Error("La jornada no existe o no está disponible.");
      const account = readAccountCache(userId);
      if (account) { writeAccountCache(userId, await withPending(account, userId)); }
      await outbox.acknowledge(id);
      return { ok: true, endedAt: now };
    } catch (error) {
      await outbox.recordFailure(id, error);
      if (isNetworkError(asError(error))) return { ok: true, endedAt: now, queued: true };
      fail(error);
    }
  }
  const vehicleId = await vehicleForWrite(supabase, userId, d.vehicleId); if (!vehicleId) throw new Error("Registra primero un vehículo.");
  if (action === "addFuel") {
    const saved = await insertOrQueue(supabase, "fuel_entries", { user_id: userId, vehicle_id: vehicleId, occurred_at: d.occurredAt, odometer: Number(d.odometer), station: d.station, fuel_type: d.fuelType, gallons: Number(d.gallons), price_per_gallon: Number(d.pricePerGallon), total: Number(d.total), payment: d.payment || null, fill_type: d.fillType || null, notes: d.notes || null });
    return { ok: true, id: saved.id, queued: saved.queued, record: d };
  }
  if (action === "addMaintenance") {
    const saved = await insertOrQueue(supabase, "maintenance_entries", { user_id: userId, vehicle_id: vehicleId, occurred_at: d.occurredAt, odometer: Number(d.odometer), movement_type: d.movementType, category: d.category, issue: d.issue, work_done: d.workDone, shop: d.shop, phone: d.phone || null, labor_cost: Number(d.laborCost), parts_cost: Number(d.partsCost), total: Number(d.total), warranty: d.warranty || null, next_km: d.nextKm === null ? null : Number(d.nextKm), notes: d.notes || null });
    return { ok: true, id: saved.id, queued: saved.queued, record: d };
  }
  if (action === "startWork") {
    if (typeof navigator !== "undefined" && !navigator.onLine) throw new Error("Necesitas conexión para iniciar una jornada. Puedes registrar recorridos y gastos sin señal.");
    const result = await supabase.from("work_sessions").insert({ user_id: userId, vehicle_id: vehicleId, role: d.role, platforms: d.platforms || [], activity: d.activity || null, started_at: now, start_odometer: Number(d.odometer) }).select("*").single();
    if (result.error) fail(result.error); return { ok: true, record: workOut(result.data) };
  }
  if (action === "addTrip") {
    const route = Array.isArray(d.routePoints) && d.routePoints.length > 1 ? d.routePoints : null;
    const saved = await insertOrQueue(supabase, "trips", { user_id: userId, vehicle_id: vehicleId, started_at: d.startedAt, ended_at: d.endedAt, duration_seconds: Number(d.durationSeconds), distance_km: Number(d.distanceKm), start_lat: d.startLat, start_lng: d.startLng, end_lat: d.endLat, end_lng: d.endLng, route_points: route, point_count: route ? route.length : null, max_speed_kmh: d.maxSpeedKmh ?? null, avg_speed_kmh: d.avgSpeedKmh ?? null, source: "gps" }, typeof d.clientId === "string" ? d.clientId : undefined);
    return { ok: true, id: saved.id, queued: saved.queued, record: d };
  }
  if (action === "saveQuote") {
    const saved = await insertOrQueue(supabase, "service_quotes", { user_id: userId, vehicle_id: vehicleId, service_name: d.serviceName, created_at: now, start_odometer: Number(d.startOdometer), end_odometer: Number(d.endOdometer), service_km: Number(d.serviceKm), extra_km: Number(d.extraKm), total_km: Number(d.totalKm), fuel_price: Number(d.fuelPrice), efficiency_kpg: Number(d.efficiencyKpg), fuel_cost: Number(d.fuelCost), wear_per_km: Number(d.wearPerKm), wear_cost: Number(d.wearCost), tolls: Number(d.tolls), other_costs: Number(d.otherCosts), hours: Number(d.hours), hourly_rate: Number(d.hourlyRate), time_cost: Number(d.timeCost), commission_pct: Number(d.commissionPct), margin_pct: Number(d.marginPct), operating_cost: Number(d.operatingCost), recommended_price: Number(d.recommendedPrice), price_per_km: Number(d.pricePerKm) });
    return { ok: true, id: saved.id, queued: saved.queued, createdAt: now, record: d };
  }
  if (action === "addDocument") {
    const saved = await insertOrQueue(supabase, "vehicle_documents", { user_id: userId, vehicle_id: vehicleId, document_type: d.documentType, document_number: d.documentNumber || null, issued_at: d.issuedAt || null, expires_at: d.expiresAt || null, provider: d.provider || null, notes: d.notes || null, updated_at: now });
    return { ok: true, id: saved.id, queued: saved.queued, createdAt: saved.createdAt, record: d };
  }
  throw new Error("Acción no disponible.");
}

async function uploadImage(init: RequestInit, supabase: SupabaseClient, userId: string) {
  const form = init.body as FormData; const file = form?.get("file");
  if (!(file instanceof File)) return json({ error: "Selecciona una imagen." }, 400);
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 8 * 1024 * 1024) return json({ error: "Usa JPG, PNG o WEBP de máximo 8 MB." }, 400);
  const extension = file.name.split(".").pop()?.replace(/[^a-zA-Z0-9]/g, "").toLowerCase() || "jpg";
  const key = `${userId}/${crypto.randomUUID()}.${extension}`;
  const result = await supabase.storage.from("vehicle-images").upload(key, file, { contentType: file.type, upsert: false });
  if (result.error) fail(result.error);
  const signed = await supabase.storage.from("vehicle-images").createSignedUrl(key, 3600);
  if (signed.error) fail(signed.error);
  return json({ url: signed.data.signedUrl, key });
}

export async function autoramFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const pathname = new URL(typeof input === "string" ? input : input.toString(), window.location.origin).pathname;
  if (pathname !== "/api/autoram" && pathname !== "/api/upload") return fetch(input, init);
  try {
    const current = await actor(); if (!current) return json({ error: "Inicia sesión para usar Autoram." }, 401);
    if (pathname === "/api/upload") return uploadImage(init, current.supabase, current.userId);
    if ((init.method || "GET").toUpperCase() === "GET") {
      // Sin señal, la app abre con la última copia de la cuenta y sigue funcionando.
      try {
        const cached = readAccountCache(current.userId);
        if (typeof navigator !== "undefined" && !navigator.onLine && cached) return json({ ...await withPending(cached, current.userId), offline: true });
        const account = await loadAccount(current.supabase, current.userId);
        writeAccountCache(current.userId, account as Row);
        return json(await withPending(account as Row, current.userId));
      } catch (error) {
        if (!isNetworkError(asError(error))) throw error;
        const cached = readAccountCache(current.userId);
        if (cached) return json({ ...await withPending(cached, current.userId), offline: true });
        throw error;
      }
    }
    const body = JSON.parse(String(init.body || "{}")) as { action?: string; data?: Row };
    if (!body.action) return json({ error: "Acción no válida." }, 400);
    return json(await saveAction(current.supabase, current.userId, body.action, body.data || {}), 201);
  } catch (error) { return json({ error: asError(error, "No fue posible guardar.").message }, 500); }
}
