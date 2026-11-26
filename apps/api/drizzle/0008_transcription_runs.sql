CREATE TABLE "transcription_runs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"audio_id" uuid NOT NULL,
	"relatorio_id" uuid,
	"job_id" text,
	"attempt" integer NOT NULL,
	"outcome" text NOT NULL,
	"error" text,
	"level" text,
	"speech_provider" text NOT NULL,
	"speech_model" text,
	"writing_provider" text,
	"model" text,
	"prompt_version" text,
	"audio_seconds" double precision,
	"input_tokens" integer,
	"output_tokens" integer,
	"usd" double precision,
	"duration_ms" integer NOT NULL,
	"guard_outcome" text,
	"fallback_reason" text,
	"not_a_reading" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "transcription_runs_outcome_check" CHECK ("transcription_runs"."outcome" in ('ok', 'error'))
);
--> statement-breakpoint
CREATE INDEX "transcription_runs_company_audio_idx" ON "transcription_runs" USING btree ("company_id","audio_id");