CREATE TABLE `api_tokens` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`token_hash` text NOT NULL,
	`channel_id` integer,
	`role` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`last_used_at` integer,
	`revoked_at` integer,
	FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `api_tokens_token_hash_unique` ON `api_tokens` (`token_hash`);--> statement-breakpoint
CREATE TABLE `channels` (
	`id` integer PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`display_name` text NOT NULL,
	`twitch_id` text,
	`avatar_url` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `channels_slug_unique` ON `channels` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `channels_twitch_id_unique` ON `channels` (`twitch_id`);--> statement-breakpoint
CREATE TABLE `episodes` (
	`id` integer PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`season_id` integer NOT NULL,
	`title` text NOT NULL,
	`aired_at` integer NOT NULL,
	`duration_s` integer NOT NULL,
	`video_provider` text DEFAULT 'youtube' NOT NULL,
	`video_ref` text NOT NULL,
	`thumbnail_url` text,
	`sort` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`season_id`) REFERENCES `seasons`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `episodes_slug_unique` ON `episodes` (`slug`);--> statement-breakpoint
CREATE INDEX `episodes_season_sort_idx` ON `episodes` (`season_id`,`sort`);--> statement-breakpoint
CREATE TABLE `games` (
	`id` integer PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`twitch_game_id` text,
	`cover_url` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `games_slug_unique` ON `games` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `games_twitch_game_id_unique` ON `games` (`twitch_game_id`);--> statement-breakpoint
CREATE TABLE `seasons` (
	`id` integer PRIMARY KEY NOT NULL,
	`show_id` integer NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`show_id`) REFERENCES `shows`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `seasons_show_slug_idx` ON `seasons` (`show_id`,`slug`);--> statement-breakpoint
CREATE TABLE `shows` (
	`id` integer PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`channel_id` integer NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`cover_url` text,
	`logo_url` text,
	`sort` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `shows_slug_unique` ON `shows` (`slug`);--> statement-breakpoint
CREATE INDEX `shows_channel_sort_idx` ON `shows` (`channel_id`,`sort`);--> statement-breakpoint
CREATE TABLE `vod_chapters` (
	`vod_id` integer NOT NULL,
	`game_id` integer NOT NULL,
	`start_s` integer NOT NULL,
	PRIMARY KEY(`vod_id`, `start_s`),
	FOREIGN KEY (`vod_id`) REFERENCES `vods`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `vod_chapters_game_idx` ON `vod_chapters` (`game_id`,`vod_id`);--> statement-breakpoint
CREATE TABLE `vods` (
	`id` integer PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`channel_id` integer NOT NULL,
	`title` text NOT NULL,
	`streamed_at` integer NOT NULL,
	`duration_s` integer NOT NULL,
	`primary_game_id` integer,
	`video_provider` text DEFAULT 'youtube' NOT NULL,
	`video_ref` text NOT NULL,
	`thumbnail_url` text,
	`source_twitch_vod_id` text,
	`chat_status` text DEFAULT 'none' NOT NULL,
	`chat_message_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`primary_game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `vods_slug_unique` ON `vods` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `vods_source_twitch_vod_id_unique` ON `vods` (`source_twitch_vod_id`);--> statement-breakpoint
CREATE INDEX `vods_streamed_at_idx` ON `vods` (`streamed_at`);--> statement-breakpoint
CREATE INDEX `vods_channel_streamed_at_idx` ON `vods` (`channel_id`,`streamed_at`);--> statement-breakpoint
CREATE INDEX `vods_game_streamed_at_idx` ON `vods` (`primary_game_id`,`streamed_at`);