CREATE TABLE "entities" (
	"company_id" uuid NOT NULL,
	"entity" text NOT NULL,
	"id" uuid NOT NULL,
	"relatorio_id" uuid,
	"project_id" uuid,
	"row" jsonb NOT NULL,
	"removed_at" timestamp with time zone,
	"updated_seq" bigint NOT NULL,
	CONSTRAINT "entities_company_id_entity_id_pk" PRIMARY KEY("company_id","entity","id")
);
--> statement-breakpoint
CREATE TABLE "ops" (
	"seq" bigserial PRIMARY KEY NOT NULL,
	"op_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"scope" text NOT NULL,
	"project_id" uuid,
	"relatorio_id" uuid,
	"kind" text NOT NULL,
	"path" text NOT NULL,
	"value" jsonb,
	"prev_op_id" uuid,
	"batch_id" uuid,
	"meta" jsonb,
	"actor_id" text NOT NULL,
	"device_id" text NOT NULL,
	"client_ts" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	CONSTRAINT "ops_op_id_unique" UNIQUE("op_id")
);
--> statement-breakpoint
CREATE INDEX "entities_company_relatorio_idx" ON "entities" USING btree ("company_id","relatorio_id");--> statement-breakpoint
CREATE INDEX "entities_company_project_idx" ON "entities" USING btree ("company_id","project_id");--> statement-breakpoint
CREATE INDEX "ops_company_seq_idx" ON "ops" USING btree ("company_id","seq");--> statement-breakpoint
CREATE INDEX "ops_company_relatorio_seq_idx" ON "ops" USING btree ("company_id","relatorio_id","seq");--> statement-breakpoint
CREATE INDEX "ops_company_project_seq_idx" ON "ops" USING btree ("company_id","project_id","seq");