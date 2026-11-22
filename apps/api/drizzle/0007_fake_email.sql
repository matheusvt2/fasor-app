CREATE TABLE "fake_email" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"to_email" text NOT NULL,
	"purpose" text NOT NULL,
	"subject" text NOT NULL,
	"text_body" text NOT NULL,
	"html_body" text NOT NULL,
	CONSTRAINT "fake_email_purpose_check" CHECK ("fake_email"."purpose" in ('invitation', 'reset'))
);
--> statement-breakpoint
CREATE INDEX "fake_email_to_created_idx" ON "fake_email" USING btree ("to_email","created_at");