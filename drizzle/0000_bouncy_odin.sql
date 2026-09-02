CREATE TABLE `driver_profiles` (
	`owner_email` text PRIMARY KEY NOT NULL,
	`full_name` text NOT NULL,
	`document` text NOT NULL,
	`phone` text NOT NULL,
	`email` text,
	`city` text NOT NULL,
	`address` text,
	`license` text NOT NULL,
	`category` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `fuel_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`owner_email` text NOT NULL,
	`occurred_at` text NOT NULL,
	`odometer` integer NOT NULL,
	`station` text NOT NULL,
	`fuel_type` text NOT NULL,
	`gallons` real NOT NULL,
	`price_per_gallon` integer NOT NULL,
	`total` integer NOT NULL,
	`payment` text,
	`fill_type` text,
	`notes` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `maintenance_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`owner_email` text NOT NULL,
	`occurred_at` text NOT NULL,
	`odometer` integer NOT NULL,
	`movement_type` text NOT NULL,
	`category` text NOT NULL,
	`issue` text NOT NULL,
	`work_done` text NOT NULL,
	`shop` text NOT NULL,
	`phone` text,
	`labor_cost` integer NOT NULL,
	`parts_cost` integer NOT NULL,
	`total` integer NOT NULL,
	`warranty` text,
	`next_km` integer,
	`notes` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `vehicles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`owner_email` text NOT NULL,
	`type` text NOT NULL,
	`brand` text NOT NULL,
	`model` text NOT NULL,
	`version` text,
	`year` text NOT NULL,
	`plate` text NOT NULL,
	`color` text,
	`fuel` text NOT NULL,
	`transmission` text NOT NULL,
	`odometer` integer NOT NULL,
	`tires` text NOT NULL,
	`brakes` text NOT NULL,
	`fluids` text NOT NULL,
	`battery` text NOT NULL,
	`general` text NOT NULL,
	`vin` text,
	`image_url` text,
	`image_attribution` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `vehicles_owner_email_unique` ON `vehicles` (`owner_email`);--> statement-breakpoint
CREATE TABLE `work_sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`owner_email` text NOT NULL,
	`role` text NOT NULL,
	`platforms` text,
	`activity` text,
	`started_at` text NOT NULL,
	`ended_at` text,
	`start_odometer` integer NOT NULL,
	`end_odometer` integer,
	`income` integer DEFAULT 0 NOT NULL,
	`expenses` integer DEFAULT 0 NOT NULL
);
