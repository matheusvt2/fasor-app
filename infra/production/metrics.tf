# Story 20.12 (2026-11-04, security pass S6): the paid AI work per company, as custom metrics
# from the api's own log lines (`apps/api/src/jobs/reading/status.ts`, `apps/api/src/http/audit.ts`).
# Every reading started (rereads included) logs `reading_started`, and every reading or audit
# the company's daily ceiling refused logs `quota_exceeded`, each with `company_id` and `kind`.
# The two filters count them on the api log group (`storage.tf`), per company, in the
# `Conforme/Usage` namespace (CloudWatch > Metrics > Conforme/Usage).
#
# Cost: a custom metric is USD 0.30 a month per dimension set that receives data; with a
# handful of companies that is `Readings` per company plus `QuotaExceeded` per company and
# kind, about USD 0.30 x (companies + 2 x companies), under USD 3 a month for five companies.
# The filters themselves are free; no alarm is added here.

resource "aws_cloudwatch_log_metric_filter" "readings_started" {
  name           = "fasor-readings-started"
  log_group_name = aws_cloudwatch_log_group.this["api"].name
  pattern        = "{ $.msg = \"reading_started\" }"

  metric_transformation {
    namespace  = "Conforme/Usage"
    name       = "Readings"
    value      = "1"
    unit       = "Count"
    dimensions = { company_id = "$.company_id" }
  }
}

resource "aws_cloudwatch_log_metric_filter" "quota_exceeded" {
  name           = "fasor-quota-exceeded"
  log_group_name = aws_cloudwatch_log_group.this["api"].name
  pattern        = "{ $.msg = \"quota_exceeded\" }"

  metric_transformation {
    namespace  = "Conforme/Usage"
    name       = "QuotaExceeded"
    value      = "1"
    unit       = "Count"
    dimensions = { company_id = "$.company_id", kind = "$.kind" }
  }
}
