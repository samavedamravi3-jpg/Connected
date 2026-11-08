CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_email` ON `accounts` (`email`);--> statement-breakpoint
CREATE TABLE `connections` (
	`id` text PRIMARY KEY NOT NULL,
	`sender_id` text NOT NULL,
	`recipient_id` text NOT NULL,
	`message` text NOT NULL,
	`status` text NOT NULL,
	`door_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `connections_sender` ON `connections` (`sender_id`);--> statement-breakpoint
CREATE INDEX `connections_recipient` ON `connections` (`recipient_id`);--> statement-breakpoint
CREATE TABLE `login_codes` (
	`email` text PRIMARY KEY NOT NULL,
	`code_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`sent_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `member_blocks` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`blocked_id` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `member_blocks_account` ON `member_blocks` (`account_id`);--> statement-breakpoint
CREATE INDEX `member_blocks_blocked` ON `member_blocks` (`blocked_id`);--> statement-breakpoint
CREATE TABLE `member_profiles` (
	`account_id` text PRIMARY KEY NOT NULL,
	`public_data` text NOT NULL,
	`private_data` text NOT NULL,
	`area_name` text,
	`lat` real,
	`lng` real,
	`visible_until` integer DEFAULT 0 NOT NULL,
	`photo_id` text,
	`onboarded` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `member_profiles_visible` ON `member_profiles` (`visible_until`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`connection_id` text NOT NULL,
	`sender_id` text NOT NULL,
	`text` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `messages_connection` ON `messages` (`connection_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `open_doors` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`venue_id` text NOT NULL,
	`start_at` integer NOT NULL,
	`end_at` integer NOT NULL,
	`length_min` integer NOT NULL,
	`topics` text NOT NULL,
	`audience` text NOT NULL,
	`ended_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `open_doors_account` ON `open_doors` (`account_id`);--> statement-breakpoint
CREATE INDEX `open_doors_end` ON `open_doors` (`end_at`);--> statement-breakpoint
CREATE TABLE `photos` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`mime` text NOT NULL,
	`data` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `photos_account` ON `photos` (`account_id`);--> statement-breakpoint
CREATE TABLE `push_tokens` (
	`token` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`platform` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `push_tokens_account` ON `push_tokens` (`account_id`);--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`window_start` integer NOT NULL,
	`count` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `reports` (
	`id` text PRIMARY KEY NOT NULL,
	`reporter_id` text NOT NULL,
	`target_id` text NOT NULL,
	`reason` text NOT NULL,
	`details` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `reports_target` ON `reports` (`target_id`);--> statement-breakpoint
CREATE TABLE `saved_events` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`event_id` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `saved_events_account` ON `saved_events` (`account_id`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `sessions_account` ON `sessions` (`account_id`);