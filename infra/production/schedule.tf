# Night schedule (source-deltas 2026-09-30 cost measures): nobody tests a cabine between
# midnight and five in the morning. The instance stops (not terminates, so its root
# volume and Elastic IP stay) at 00:00 and starts at 05:00, America/Sao_Paulo. ECS places
# the tasks again once the agent reconnects, a few minutes after 05:00.
# 2026-10-05 (Matheus): the database is no longer stopped at night. Its 04:40 start failed
# three mornings out of five with InsufficientDBInstanceCapacity, leaving production down
# all day, for a saving of about USD 2 per month.
locals {
  night_actions = {
    stop-instance = {
      cron   = "cron(0 0 * * ? *)"
      target = "arn:aws:scheduler:::aws-sdk:ec2:stopInstances"
      input  = { InstanceIds = [aws_instance.this.id] }
    }
    start-instance = {
      cron   = "cron(0 5 * * ? *)"
      target = "arn:aws:scheduler:::aws-sdk:ec2:startInstances"
      input  = { InstanceIds = [aws_instance.this.id] }
    }
  }
  night_schedule = { for name, action in local.night_actions : name => action if var.enable_night_schedule }
}

resource "aws_iam_role" "scheduler" {
  count       = var.enable_night_schedule ? 1 : 0
  name        = "${local.name}-night-schedule"
  description = "EventBridge Scheduler: stop and start the production instance"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "scheduler.amazonaws.com" }
      Action    = "sts:AssumeRole"
      Condition = { StringEquals = { "aws:SourceAccount" = var.account_id } }
    }]
  })
}

resource "aws_iam_role_policy" "scheduler" {
  count = var.enable_night_schedule ? 1 : 0
  name  = "stop-start-production"
  role  = aws_iam_role.scheduler[0].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "StopStartInstance"
        Effect   = "Allow"
        Action   = ["ec2:StopInstances", "ec2:StartInstances"]
        Resource = aws_instance.this.arn
      },
      {
        # Starting an instance whose root volume is encrypted lets EC2 create a grant on
        # the volume's key for the caller.
        Sid      = "StartEncryptedRootVolume"
        Effect   = "Allow"
        Action   = "kms:CreateGrant"
        Resource = "arn:aws:kms:${local.region}:${var.account_id}:key/*"
        Condition = {
          StringEquals = { "kms:ViaService" = "ec2.${local.region}.amazonaws.com" }
          Bool         = { "kms:GrantIsForAWSResource" = "true" }
        }
      },
    ]
  })
}

resource "aws_scheduler_schedule" "night" {
  for_each = local.night_schedule

  name                         = "${local.name}-${each.key}"
  schedule_expression          = each.value.cron
  schedule_expression_timezone = "America/Sao_Paulo"

  flexible_time_window {
    mode = "OFF"
  }

  target {
    arn      = each.value.target
    role_arn = aws_iam_role.scheduler[0].arn
    input    = jsonencode(each.value.input)

    retry_policy {
      maximum_retry_attempts       = 3
      maximum_event_age_in_seconds = 900
    }
  }
}
