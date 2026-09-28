CREATE TABLE "reading_runs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"photo_id" uuid NOT NULL,
	"relatorio_id" uuid,
	"reading_kind" text NOT NULL,
	"job_id" text,
	"attempt" integer NOT NULL,
	"outcome" text NOT NULL,
	"error" text,
	"ocr_provider" text NOT NULL,
	"ocr_result" jsonb,
	"model" text,
	"prompt_version" text,
	"llm_usage" jsonb,
	"duration_ms" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "reading_runs_outcome_check" CHECK ("reading_runs"."outcome" in ('ok', 'error'))
);
--> statement-breakpoint
CREATE INDEX "reading_runs_company_photo_idx" ON "reading_runs" USING btree ("company_id","photo_id");