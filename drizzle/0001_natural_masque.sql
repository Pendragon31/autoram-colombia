CREATE TABLE `trips` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`owner_email` text NOT NULL,
	`started_at` text NOT NULL,
	`ended_at` text NOT NULL,
	`duration_seconds` integer NOT NULL,
	`distance_km` real NOT NULL,
	`start_lat` real,
	`start_lng` real,
	`end_lat` real,
	`end_lng` real,
	`created_at` text NOT NULL
);
