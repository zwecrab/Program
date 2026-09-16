CREATE TABLE `attempts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` integer NOT NULL,
	`question_id` integer NOT NULL,
	`chosen_option_ids_json` text DEFAULT '[]' NOT NULL,
	`is_correct` integer NOT NULL,
	`seconds_spent` integer,
	`confidence` integer,
	`answered_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`question_id`) REFERENCES `questions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `attempts_session_idx` ON `attempts` (`session_id`);--> statement-breakpoint
CREATE INDEX `attempts_question_idx` ON `attempts` (`question_id`);--> statement-breakpoint
CREATE TABLE `case_questions` (
	`case_study_id` integer NOT NULL,
	`question_id` integer NOT NULL,
	`sequence` integer NOT NULL,
	PRIMARY KEY(`case_study_id`, `question_id`),
	FOREIGN KEY (`case_study_id`) REFERENCES `case_studies`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`question_id`) REFERENCES `questions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `case_studies` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`scenario_md` text NOT NULL,
	`domain_mix` text,
	`exhibit_json` text
);
--> statement-breakpoint
CREATE TABLE `eco_tasks` (
	`id` integer PRIMARY KEY NOT NULL,
	`domain` text NOT NULL,
	`task_number` integer NOT NULL,
	`title` text NOT NULL,
	`weight_pct` real NOT NULL,
	`plan_day` integer NOT NULL,
	`studied` integer DEFAULT false NOT NULL,
	`studied_at` text
);
--> statement-breakpoint
CREATE TABLE `flashcards` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`eco_task_id` integer NOT NULL,
	`lesson_id` integer,
	`front` text NOT NULL,
	`back` text NOT NULL,
	`card_type` text DEFAULT 'recall' NOT NULL,
	`fsrs_stability` real DEFAULT 0 NOT NULL,
	`fsrs_difficulty` real DEFAULT 0 NOT NULL,
	`due_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`lapses` integer DEFAULT 0 NOT NULL,
	`reps` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`eco_task_id`) REFERENCES `eco_tasks`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`lesson_id`) REFERENCES `lessons`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `flashcards_due_idx` ON `flashcards` (`due_at`);--> statement-breakpoint
CREATE TABLE `lessons` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`eco_task_id` integer NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`title_en` text NOT NULL,
	`title_my` text,
	`body_md` text NOT NULL,
	`predictive_md` text,
	`adaptive_md` text,
	`traps_md` text,
	`artifacts_md` text,
	`pmbok_refs_json` text,
	`generated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`model_used` text,
	`reviewed` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`eco_task_id`) REFERENCES `eco_tasks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `llm_usage` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`called_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`purpose` text NOT NULL,
	`model` text NOT NULL,
	`prompt_tokens` integer DEFAULT 0 NOT NULL,
	`completion_tokens` integer DEFAULT 0 NOT NULL,
	`cost_usd` real DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `options` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`question_id` integer NOT NULL,
	`label` text NOT NULL,
	`body` text NOT NULL,
	`is_correct` integer DEFAULT false NOT NULL,
	`distractor_family` text,
	`rationale` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`question_id`) REFERENCES `questions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `questions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`eco_task_id` integer NOT NULL,
	`domain` text NOT NULL,
	`delivery_approach` text NOT NULL,
	`item_type` text NOT NULL,
	`difficulty` integer NOT NULL,
	`style` text NOT NULL,
	`stem` text NOT NULL,
	`exhibit_json` text,
	`explanation_md` text DEFAULT '' NOT NULL,
	`pmbok_ref` text,
	`source_batch` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`eco_task_id`) REFERENCES `eco_tasks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `questions_task_status_idx` ON `questions` (`eco_task_id`,`status`);--> statement-breakpoint
CREATE TABLE `review_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`question_id` integer NOT NULL,
	`rule_broken` text,
	`distractor_family` text,
	`note` text,
	`resolved` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`question_id`) REFERENCES `questions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`started_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`ended_at` text,
	`config_json` text,
	`score_pct` real
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `study_days` (
	`day` integer PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`phase` text NOT NULL,
	`focus` text NOT NULL,
	`done` integer DEFAULT false NOT NULL,
	`hours` real,
	`notes` text
);
