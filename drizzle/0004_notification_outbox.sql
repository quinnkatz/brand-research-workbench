CREATE TABLE `notification_outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`study_id` text NOT NULL,
	`monitor_id` text NOT NULL,
	`connection_id` text NOT NULL,
	`kind` text NOT NULL,
	`target_id` text NOT NULL,
	`payload` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`response` text,
	`error` text,
	`first_attempt` text,
	`last_attempt` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`study_id`) REFERENCES `studies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `notifications_study_status` ON `notification_outbox` (`owner_id`,`study_id`,`status`);