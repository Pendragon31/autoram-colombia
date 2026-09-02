import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const driverProfiles = sqliteTable("driver_profiles", {
  ownerEmail: text("owner_email").primaryKey(),
  fullName: text("full_name").notNull(),
  document: text("document").notNull(),
  phone: text("phone").notNull(),
  email: text("email"),
  city: text("city").notNull(),
  address: text("address"),
  license: text("license").notNull(),
  category: text("category").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const vehicles = sqliteTable("vehicles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ownerEmail: text("owner_email").notNull(),
  type: text("type").notNull(), brand: text("brand").notNull(), model: text("model").notNull(),
  version: text("version"), year: text("year").notNull(), plate: text("plate").notNull(), color: text("color"),
  fuel: text("fuel").notNull(), transmission: text("transmission").notNull(), odometer: integer("odometer").notNull(),
  tires: text("tires").notNull(), brakes: text("brakes").notNull(), fluids: text("fluids").notNull(),
  battery: text("battery").notNull(), general: text("general").notNull(), vin: text("vin"),
  imageUrl: text("image_url"), imageAttribution: text("image_attribution"),
  createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
}, table=>[uniqueIndex("vehicles_owner_email_unique").on(table.ownerEmail)]);

export const fuelEntries = sqliteTable("fuel_entries", {
  id: integer("id").primaryKey({ autoIncrement: true }), ownerEmail: text("owner_email").notNull(),
  occurredAt: text("occurred_at").notNull(), odometer: integer("odometer").notNull(), station: text("station").notNull(),
  fuelType: text("fuel_type").notNull(), gallons: real("gallons").notNull(), pricePerGallon: integer("price_per_gallon").notNull(),
  total: integer("total").notNull(), payment: text("payment"), fillType: text("fill_type"), notes: text("notes"),
  createdAt: text("created_at").notNull(),
});

export const maintenanceEntries = sqliteTable("maintenance_entries", {
  id: integer("id").primaryKey({ autoIncrement: true }), ownerEmail: text("owner_email").notNull(),
  occurredAt: text("occurred_at").notNull(), odometer: integer("odometer").notNull(), movementType: text("movement_type").notNull(),
  category: text("category").notNull(), issue: text("issue").notNull(), workDone: text("work_done").notNull(), shop: text("shop").notNull(),
  phone: text("phone"), laborCost: integer("labor_cost").notNull(), partsCost: integer("parts_cost").notNull(),
  total: integer("total").notNull(), warranty: text("warranty"), nextKm: integer("next_km"), notes: text("notes"),
  createdAt: text("created_at").notNull(),
});

export const workSessions = sqliteTable("work_sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }), ownerEmail: text("owner_email").notNull(),
  role: text("role").notNull(), platforms: text("platforms"), activity: text("activity"),
  startedAt: text("started_at").notNull(), endedAt: text("ended_at"), startOdometer: integer("start_odometer").notNull(),
  endOdometer: integer("end_odometer"), income: integer("income").notNull().default(0), expenses: integer("expenses").notNull().default(0),
});

export const trips = sqliteTable("trips", {
  id: integer("id").primaryKey({ autoIncrement: true }), ownerEmail: text("owner_email").notNull(),
  startedAt: text("started_at").notNull(), endedAt: text("ended_at").notNull(), durationSeconds: integer("duration_seconds").notNull(),
  distanceKm: real("distance_km").notNull(), startLat: real("start_lat"), startLng: real("start_lng"), endLat: real("end_lat"), endLng: real("end_lng"),
  createdAt: text("created_at").notNull(),
});

export const serviceQuotes = sqliteTable("service_quotes", {
  id: integer("id").primaryKey({ autoIncrement: true }), ownerEmail: text("owner_email").notNull(),
  serviceName: text("service_name").notNull(), createdAt: text("created_at").notNull(),
  startOdometer: real("start_odometer").notNull(), endOdometer: real("end_odometer").notNull(),
  serviceKm: real("service_km").notNull(), extraKm: real("extra_km").notNull(), totalKm: real("total_km").notNull(),
  fuelPrice: integer("fuel_price").notNull(), efficiencyKpg: real("efficiency_kpg").notNull(), fuelCost: integer("fuel_cost").notNull(),
  wearPerKm: integer("wear_per_km").notNull(), wearCost: integer("wear_cost").notNull(), tolls: integer("tolls").notNull(),
  otherCosts: integer("other_costs").notNull(), hours: real("hours").notNull(), hourlyRate: integer("hourly_rate").notNull(),
  timeCost: integer("time_cost").notNull(), commissionPct: real("commission_pct").notNull(), marginPct: real("margin_pct").notNull(),
  operatingCost: integer("operating_cost").notNull(), recommendedPrice: integer("recommended_price").notNull(), pricePerKm: integer("price_per_km").notNull(),
}, table=>[index("service_quotes_owner_created_idx").on(table.ownerEmail,table.createdAt)]);
