PRAGMA foreign_keys=OFF;
--> statement-breakpoint
DROP TABLE IF EXISTS `case_questions`;
--> statement-breakpoint
DROP TABLE IF EXISTS `case_studies`;
--> statement-breakpoint
DROP TABLE IF EXISTS `attempts`;
--> statement-breakpoint
DROP TABLE IF EXISTS `review_items`;
--> statement-breakpoint
DROP TABLE IF EXISTS `options`;
--> statement-breakpoint
DROP TABLE IF EXISTS `questions`;
--> statement-breakpoint
DROP TABLE IF EXISTS `flashcards`;
--> statement-breakpoint
DROP TABLE IF EXISTS `lessons`;
--> statement-breakpoint
DROP TABLE IF EXISTS `eco_tasks`;
--> statement-breakpoint
CREATE TABLE `exams` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`title` text NOT NULL,
	`exam_date` text NOT NULL,
	`question_count` integer NOT NULL,
	`minutes` integer NOT NULL,
	`domain_weights_json` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `syllabus_items` (
	`id` integer PRIMARY KEY NOT NULL,
	`exam_id` integer NOT NULL,
	`parent_id` integer,
	`code` text NOT NULL,
	`domain` text NOT NULL,
	`task_number` integer NOT NULL,
	`title` text NOT NULL,
	`weight_pct` real NOT NULL,
	`plan_day` integer NOT NULL,
	`studied` integer DEFAULT false NOT NULL,
	`studied_at` text,
	FOREIGN KEY (`exam_id`) REFERENCES `exams`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `source_chunks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`exam_id` integer NOT NULL,
	`source_book` text NOT NULL,
	`source_section` text NOT NULL,
	`source_slug` text NOT NULL,
	`pdf_page_start` integer,
	`pdf_page_end` integer,
	`printed_page` text,
	`syllabus_item_ids` text DEFAULT '[]' NOT NULL,
	`text` text NOT NULL,
	`token_count` integer DEFAULT 0 NOT NULL,
	`embedding` F32_BLOB(384),
	FOREIGN KEY (`exam_id`) REFERENCES `exams`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `generation_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`exam_id` integer NOT NULL,
	`kind` text NOT NULL,
	`syllabus_item_id` integer,
	`status` text DEFAULT 'queued' NOT NULL,
	`params_json` text,
	`requested` integer DEFAULT 0 NOT NULL,
	`produced` integer DEFAULT 0 NOT NULL,
	`passed` integer DEFAULT 0 NOT NULL,
	`cost_usd` real DEFAULT 0 NOT NULL,
	`log` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`started_at` text,
	`ended_at` text,
	FOREIGN KEY (`exam_id`) REFERENCES `exams`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `explanations` (
	`question_id` integer PRIMARY KEY NOT NULL,
	`body_md` text NOT NULL,
	`citations_json` text,
	`support` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`question_id`) REFERENCES `questions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `coaching_summaries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`exam_id` integer NOT NULL,
	`week_start` text NOT NULL,
	`body_md` text NOT NULL,
	`stats_json` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`exam_id`) REFERENCES `exams`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `lessons` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`exam_id` integer NOT NULL,
	`syllabus_item_id` integer NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`title_en` text NOT NULL,
	`title_my` text,
	`body_md` text NOT NULL,
	`predictive_md` text,
	`adaptive_md` text,
	`traps_md` text,
	`artifacts_md` text,
	`example_md` text,
	`pmbok_refs_json` text,
	`citations_json` text,
	`support` text,
	`generated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`model_used` text,
	`reviewed` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`exam_id`) REFERENCES `exams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`syllabus_item_id`) REFERENCES `syllabus_items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `flashcards` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`exam_id` integer NOT NULL,
	`syllabus_item_id` integer NOT NULL,
	`lesson_id` integer,
	`front` text NOT NULL,
	`back` text NOT NULL,
	`card_type` text DEFAULT 'recall' NOT NULL,
	`fsrs_stability` real DEFAULT 0 NOT NULL,
	`fsrs_difficulty` real DEFAULT 0 NOT NULL,
	`fsrs_state` integer DEFAULT 0 NOT NULL,
	`last_review_at` text,
	`due_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`lapses` integer DEFAULT 0 NOT NULL,
	`reps` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`exam_id`) REFERENCES `exams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`syllabus_item_id`) REFERENCES `syllabus_items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`lesson_id`) REFERENCES `lessons`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `questions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`exam_id` integer NOT NULL,
	`syllabus_item_id` integer NOT NULL,
	`domain` text NOT NULL,
	`delivery_approach` text NOT NULL,
	`item_type` text NOT NULL,
	`difficulty` integer NOT NULL,
	`style` text NOT NULL,
	`stem` text NOT NULL,
	`exhibit_json` text,
	`explanation_md` text DEFAULT '' NOT NULL,
	`pmbok_ref` text,
	`citations_json` text,
	`support` text,
	`qa_json` text,
	`source_batch` text,
	`status` text DEFAULT 'qa_pending' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`exam_id`) REFERENCES `exams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`syllabus_item_id`) REFERENCES `syllabus_items`(`id`) ON UPDATE no action ON DELETE no action
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
CREATE TABLE `case_studies` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`exam_id` integer NOT NULL,
	`scenario_md` text NOT NULL,
	`domain_mix` text,
	`exhibit_json` text,
	FOREIGN KEY (`exam_id`) REFERENCES `exams`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `case_questions` (
	`case_study_id` integer NOT NULL,
	`question_id` integer NOT NULL,
	`sequence` integer NOT NULL,
	PRIMARY KEY(`case_study_id`, `question_id`),
	FOREIGN KEY (`case_study_id`) REFERENCES `case_studies`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`question_id`) REFERENCES `questions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `attempts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`exam_id` integer NOT NULL,
	`session_id` integer NOT NULL,
	`question_id` integer NOT NULL,
	`chosen_option_ids_json` text DEFAULT '[]' NOT NULL,
	`is_correct` integer NOT NULL,
	`distractor_family` text,
	`seconds_spent` integer,
	`confidence` integer,
	`pretest` integer DEFAULT false NOT NULL,
	`answered_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`exam_id`) REFERENCES `exams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`question_id`) REFERENCES `questions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `review_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`exam_id` integer NOT NULL,
	`question_id` integer NOT NULL,
	`rule_broken` text,
	`distractor_family` text,
	`note` text,
	`resolved` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`exam_id`) REFERENCES `exams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`question_id`) REFERENCES `questions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `__new_sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`exam_id` integer NOT NULL,
	`kind` text NOT NULL,
	`started_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`ended_at` text,
	`config_json` text,
	`state_json` text,
	`score_pct` real,
	FOREIGN KEY (`exam_id`) REFERENCES `exams`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_sessions`("id","exam_id","kind","started_at","ended_at","config_json","state_json","score_pct") SELECT "id", 1, "kind", "started_at", "ended_at", "config_json", NULL, "score_pct" FROM `sessions`;
--> statement-breakpoint
DROP TABLE `sessions`;
--> statement-breakpoint
ALTER TABLE `__new_sessions` RENAME TO `sessions`;
--> statement-breakpoint
CREATE TABLE `__new_study_days` (
	`exam_id` integer NOT NULL,
	`day` integer NOT NULL,
	`date` text NOT NULL,
	`phase` text NOT NULL,
	`focus` text NOT NULL,
	`done` integer DEFAULT false NOT NULL,
	`hours` real,
	`notes` text,
	PRIMARY KEY(`exam_id`, `day`),
	FOREIGN KEY (`exam_id`) REFERENCES `exams`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_study_days`("exam_id","day","date","phase","focus","done","hours","notes") SELECT 1, "day", "date", "phase", "focus", "done", "hours", "notes" FROM `study_days`;
--> statement-breakpoint
DROP TABLE `study_days`;
--> statement-breakpoint
ALTER TABLE `__new_study_days` RENAME TO `study_days`;
--> statement-breakpoint
ALTER TABLE `llm_usage` ADD `exam_id` integer REFERENCES exams(id);
--> statement-breakpoint
ALTER TABLE `llm_usage` ADD `run_id` integer;
--> statement-breakpoint
CREATE INDEX `attempts_session_idx` ON `attempts` (`session_id`);
--> statement-breakpoint
CREATE INDEX `attempts_question_idx` ON `attempts` (`question_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `exams_code_unique` ON `exams` (`code`);
--> statement-breakpoint
CREATE INDEX `flashcards_due_idx` ON `flashcards` (`due_at`);
--> statement-breakpoint
CREATE INDEX `questions_item_status_idx` ON `questions` (`syllabus_item_id`,`status`);
--> statement-breakpoint
CREATE INDEX `questions_exam_status_idx` ON `questions` (`exam_id`,`status`);
--> statement-breakpoint
CREATE INDEX `source_chunks_slug_idx` ON `source_chunks` (`source_slug`);
--> statement-breakpoint
CREATE UNIQUE INDEX `syllabus_exam_code_idx` ON `syllabus_items` (`exam_id`,`code`);
--> statement-breakpoint
CREATE INDEX `idx_chunks_vec` ON `source_chunks` (libsql_vector_idx(`embedding`));
--> statement-breakpoint
CREATE VIRTUAL TABLE `source_chunks_fts` USING fts5(`text`, content='source_chunks', content_rowid='id');
--> statement-breakpoint
CREATE TRIGGER `source_chunks_ai` AFTER INSERT ON `source_chunks` BEGIN INSERT INTO source_chunks_fts(rowid, text) VALUES (new.id, new.text); END;
--> statement-breakpoint
CREATE TRIGGER `source_chunks_ad` AFTER DELETE ON `source_chunks` BEGIN INSERT INTO source_chunks_fts(source_chunks_fts, rowid, text) VALUES ('delete', old.id, old.text); END;
--> statement-breakpoint
CREATE TRIGGER `source_chunks_au` AFTER UPDATE OF text ON `source_chunks` BEGIN INSERT INTO source_chunks_fts(source_chunks_fts, rowid, text) VALUES ('delete', old.id, old.text); INSERT INTO source_chunks_fts(rowid, text) VALUES (new.id, new.text); END;
--> statement-breakpoint
CREATE VIEW `eco_tasks` AS SELECT s.id, s.domain, s.task_number, s.title, s.weight_pct, s.plan_day, s.studied, s.studied_at FROM syllabus_items s JOIN exams e ON e.id = s.exam_id WHERE e.code = 'PMP';
--> statement-breakpoint
PRAGMA foreign_keys=ON;
