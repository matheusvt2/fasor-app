CREATE TABLE "ai_answers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"relatorio_id" uuid NOT NULL,
	"use" text NOT NULL,
	"run_table" text NOT NULL,
	"run_id" uuid NOT NULL,
	"target" jsonb,
	"target_path" text,
	"item_key" text,
	"suggestion_id" uuid,
	"watch_paths" jsonb,
	"input_text" text,
	"input_file_id" uuid,
	"answer" jsonb,
	"shown" jsonb,
	"shown_reason" text,
	"confidence" double precision,
	"model" text,
	"prompt_version" text,
	"run_usd" double precision,
	"created_at" timestamp with time zone NOT NULL,
	"outcome" text,
	"action" text,
	"final_value" jsonb,
	"settled_by" text,
	"settled_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	CONSTRAINT "ai_answers_use_check" CHECK ("ai_answers"."use" in ('plate', 'display', 'caption', 'nc_obs', 'panel', 'audio_text', 'audio_reading', 'ai_write', 'audit_finding')),
	CONSTRAINT "ai_answers_run_table_check" CHECK ("ai_answers"."run_table" in ('reading_runs', 'transcription_runs', 'audit_run')),
	CONSTRAINT "ai_answers_outcome_check" CHECK ("ai_answers"."outcome" in ('kept', 'changed', 'refused', 'unanswered'))
);
--> statement-breakpoint
CREATE INDEX "ai_answers_company_relatorio_open_idx" ON "ai_answers" USING btree ("company_id","relatorio_id") WHERE "ai_answers"."closed_at" is null;--> statement-breakpoint
CREATE INDEX "ai_answers_company_created_idx" ON "ai_answers" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_answers_company_run_idx" ON "ai_answers" USING btree ("company_id","run_id");