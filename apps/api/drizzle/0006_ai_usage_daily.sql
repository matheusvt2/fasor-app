CREATE TABLE "ai_usage_daily" (
	"company_id" uuid NOT NULL,
	"day" date NOT NULL,
	"kind" text NOT NULL,
	"count" integer NOT NULL,
	CONSTRAINT "ai_usage_daily_company_id_day_kind_pk" PRIMARY KEY("company_id","day","kind"),
	CONSTRAINT "ai_usage_daily_kind_check" CHECK ("ai_usage_daily"."kind" in ('reading', 'audit'))
);
