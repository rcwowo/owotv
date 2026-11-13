CREATE TABLE `channel_slug_aliases` (
	`slug` text PRIMARY KEY NOT NULL,
	`channel_id` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `channels` ADD `banner_url` text;--> statement-breakpoint
ALTER TABLE `channels` ADD `description` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `channels` ADD `links` text DEFAULT '[]' NOT NULL;