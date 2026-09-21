CREATE TABLE `collection_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`study_id` text NOT NULL,
	`batch_id` text NOT NULL,
	`batch_name` text NOT NULL,
	`provider` text NOT NULL,
	`model` text NOT NULL,
	`prompt` text NOT NULL,
	`question_id` text,
	`repeat_index` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`run_id` text,
	`settings` text NOT NULL,
	`error` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`study_id`) REFERENCES `studies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `jobs_study_status` ON `collection_jobs` (`owner_id`,`study_id`,`status`);--> statement-breakpoint
CREATE INDEX `jobs_batch` ON `collection_jobs` (`owner_id`,`batch_id`);--> statement-breakpoint
CREATE TABLE `record_history` (
	`id` text PRIMARY KEY NOT NULL,
	`record_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`study_id` text NOT NULL,
	`kind` text NOT NULL,
	`payload` text NOT NULL,
	`recorded_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `history_record` ON `record_history` (`owner_id`,`record_id`,`recorded_at`);--> statement-breakpoint
CREATE TABLE `report_comments` (
	`id` text PRIMARY KEY NOT NULL,
	`report_id` text NOT NULL,
	`author` text NOT NULL,
	`review_id` text,
	`message` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`report_id`) REFERENCES `report_snapshots`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `comments_report` ON `report_comments` (`report_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `report_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`study_id` text NOT NULL,
	`title` text NOT NULL,
	`token_hash` text NOT NULL,
	`object_key` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`revoked_at` text,
	FOREIGN KEY (`study_id`) REFERENCES `studies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `report_snapshots_token_hash_unique` ON `report_snapshots` (`token_hash`);--> statement-breakpoint
CREATE INDEX `reports_study` ON `report_snapshots` (`owner_id`,`study_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `studies` ADD `profile` text DEFAULT '{}' NOT NULL;