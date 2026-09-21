CREATE TABLE `activity` (
	`id` text PRIMARY KEY NOT NULL,
	`study_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`event` text NOT NULL,
	`target_id` text,
	`detail` text DEFAULT '{}' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`study_id`) REFERENCES `studies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `activity_study` ON `activity` (`study_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `connections` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`provider` text NOT NULL,
	`label` text NOT NULL,
	`model` text NOT NULL,
	`ciphertext` text NOT NULL,
	`iv` text NOT NULL,
	`metadata` text DEFAULT '{}' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `connections_owner` ON `connections` (`owner_id`);--> statement-breakpoint
CREATE TABLE `drafts` (
	`id` text PRIMARY KEY NOT NULL,
	`study_id` text NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`payload` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`study_id`) REFERENCES `studies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `draft_scope` ON `drafts` (`study_id`,`user_id`,`name`);--> statement-breakpoint
CREATE TABLE `execution_tickets` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`connection_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`message_id` text,
	`status` text NOT NULL,
	`error` text,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tickets_job` ON `execution_tickets` (`job_id`);--> statement-breakpoint
CREATE INDEX `tickets_owner` ON `execution_tickets` (`owner_id`);--> statement-breakpoint
CREATE TABLE `monitor_ticks` (
	`id` text PRIMARY KEY NOT NULL,
	`monitor_id` text NOT NULL,
	`batch_id` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`monitor_id`) REFERENCES `monitors`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `monitors` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`study_id` text NOT NULL,
	`name` text NOT NULL,
	`config` text NOT NULL,
	`status` text NOT NULL,
	`token_hash` text NOT NULL,
	`schedule_id` text,
	`last_tick` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`study_id`) REFERENCES `studies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `monitors_study` ON `monitors` (`owner_id`,`study_id`);--> statement-breakpoint
CREATE TABLE `request_reservations` (
	`id` text PRIMARY KEY NOT NULL,
	`grant_id` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `reservations_grant` ON `request_reservations` (`grant_id`);--> statement-breakpoint
CREATE TABLE `study_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`study_id` text NOT NULL,
	`connection_id` text NOT NULL,
	`request_limit` integer DEFAULT 100 NOT NULL,
	`used_requests` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`study_id`) REFERENCES `studies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`connection_id`) REFERENCES `connections`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `study_connection_grant` ON `study_connections` (`study_id`,`connection_id`);--> statement-breakpoint
CREATE TABLE `study_invites` (
	`id` text PRIMARY KEY NOT NULL,
	`study_id` text NOT NULL,
	`email` text NOT NULL,
	`role` text NOT NULL,
	`token_hash` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`accepted_at` text,
	`revoked_at` text,
	FOREIGN KEY (`study_id`) REFERENCES `studies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `study_invites_token_hash_unique` ON `study_invites` (`token_hash`);--> statement-breakpoint
CREATE INDEX `invites_study` ON `study_invites` (`study_id`);--> statement-breakpoint
CREATE TABLE `study_members` (
	`id` text PRIMARY KEY NOT NULL,
	`study_id` text NOT NULL,
	`user_id` text NOT NULL,
	`email` text NOT NULL,
	`role` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`study_id`) REFERENCES `studies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `members_study_user` ON `study_members` (`study_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `members_user` ON `study_members` (`user_id`);