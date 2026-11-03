# Epic 18, Story 18.2 (AD-28): usage events. `POST /api/telemetry` writes one JSON line per
# event to this group (`TELEMETRY_SINK=cloudwatch`, `ecs.tf`), in one stream per api process
# (`api/<start instant>/<pid>`, created by the api at first use). Kept 90 days, apart from the
# 14 days of the service logs; Story 18.3 reads it through a dashboard and saved queries.
resource "aws_cloudwatch_log_group" "ux_events" {
  name              = "${local.ssm_prefix}/ux-events"
  retention_in_days = var.ux_events_retention_days
}

# The app role writes its own streams on that group and nothing else of CloudWatch Logs:
# CreateLogStream and PutLogEvents on the group and its streams. 2026-11-03 (E18-A2, review
# R-A11): no DescribeLogStreams, which the sink never calls (`apps/api/src/telemetry/sink.ts`
# creates its stream and counts an existing one as created).
resource "aws_iam_role_policy" "app_ux_events" {
  name = "ux-events-log-group"
  role = aws_iam_role.app.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "WriteUxEvents"
        Effect   = "Allow"
        Action   = ["logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = [aws_cloudwatch_log_group.ux_events.arn, "${aws_cloudwatch_log_group.ux_events.arn}:*"]
      },
    ]
  })
}
