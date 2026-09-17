CREATE TABLE `attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`run_id` text NOT NULL,
	`name` text NOT NULL,
	`mime` text NOT NULL,
	`object_key` text NOT NULL,
	`sha256` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `attachments_run` ON `attachments` (`owner_id`,`run_id`);--> statement-breakpoint
CREATE TABLE `records` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`study_id` text NOT NULL,
	`kind` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`study_id`) REFERENCES `studies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `records_study_kind` ON `records` (`owner_id`,`study_id`,`kind`);--> statement-breakpoint
CREATE TABLE `runs` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`study_id` text NOT NULL,
	`provider` text NOT NULL,
	`environment` text NOT NULL,
	`model` text NOT NULL,
	`prompt` text NOT NULL,
	`status` text NOT NULL,
	`search` text NOT NULL,
	`settings` text NOT NULL,
	`normalized` text,
	`evidence_key` text,
	`evidence_hash` text,
	`error` text,
	`created_at` text NOT NULL,
	`finished_at` text,
	FOREIGN KEY (`study_id`) REFERENCES `studies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `runs_study_created` ON `runs` (`owner_id`,`study_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `studies` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`brand` text NOT NULL,
	`website` text DEFAULT '' NOT NULL,
	`objective` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `studies_owner` ON `studies` (`owner_id`,`created_at`);