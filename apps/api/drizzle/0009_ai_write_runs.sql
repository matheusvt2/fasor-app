ALTER TABLE "transcription_runs" ALTER COLUMN "audio_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "transcription_runs" ALTER COLUMN "speech_provider" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "transcription_runs" ADD COLUMN "kind" text DEFAULT 'transcription' NOT NULL;--> statement-breakpoint
ALTER TABLE "transcription_runs" ADD COLUMN "user_id" text;--> statement-breakpoint
ALTER TABLE "transcription_runs" ADD COLUMN "target" jsonb;--> statement-breakpoint
ALTER TABLE "transcription_runs" ADD CONSTRAINT "transcription_runs_kind_check" CHECK ("transcription_runs"."kind" in ('transcription', 'ai_write'));