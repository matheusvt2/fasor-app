CREATE TABLE "sync_device_push" (
	"company_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"device_id" text NOT NULL,
	"last_push_at" timestamp with time zone NOT NULL,
	CONSTRAINT "sync_device_push_company_id_user_id_device_id_pk" PRIMARY KEY("company_id","user_id","device_id")
);
--> statement-breakpoint
CREATE INDEX "ops_company_path_seq_idx" ON "ops" USING btree ("company_id","path","seq");