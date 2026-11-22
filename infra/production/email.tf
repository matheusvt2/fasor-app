# Epic 26, Story 26.7: outbound e-mail through Amazon SES, for the invitation and the
# password reset only (Story 26.6). Everything here exists only when `email_domain` is set
# in the untracked terraform.tfvars; ~~with it null the api keeps `EMAIL_PROVIDER=fake`.~~
# (2026-11-22, e26r: with it null the production api does not boot; see below.)
#
# The domain's DNS is not in this account (no Route 53 zone), so Terraform cannot publish the
# three DKIM CNAME records: the `email_dkim_records` output lists them and the domain's owner
# types them at the registrar. The identity verifies by itself once they resolve. Leaving the
# SES sandbox is a request to AWS made once by the account's owner
# (`infra/bin/aws sesv2 put-account-details`, infra/README.md "E-mail"); it is not a resource.
#
# ~~Not here on purpose: the `EMAIL_PROVIDER` and `EMAIL_FROM` entries of the api task. They
# enter `ecs.tf` with the deploy that carries Story 26.6's code, so this apply rolls no task.~~
# (2026-11-22, e26r, review of Epic 26: the two entries are in `ecs.tf` now, `api_email_environment`,
# present only when `email_domain` is set. A production api refuses to boot with the fake mailer or
# the placeholder sender (apps/api/src/config.ts), so with `email_domain` null the api, the
# migration and the smoke seed no longer start: set it before the deploy that carries this.)

locals {
  email_enabled = var.email_domain != null
  email_from    = local.email_enabled ? "${var.email_from_local_part}@${var.email_domain}" : null
}

resource "aws_sesv2_configuration_set" "app" {
  count                  = local.email_enabled ? 1 : 0
  configuration_set_name = "${local.name}-app"

  delivery_options {
    tls_policy = "REQUIRE"
  }

  reputation_options {
    reputation_metrics_enabled = true
  }

  # A hard bounce or a complaint puts the address on this account's suppression list, so the
  # app cannot keep mailing an address that does not exist.
  suppression_options {
    suppressed_reasons = ["BOUNCE", "COMPLAINT"]
  }
}

resource "aws_sesv2_email_identity" "app" {
  count                  = local.email_enabled ? 1 : 0
  email_identity         = var.email_domain
  configuration_set_name = aws_sesv2_configuration_set.app[0].configuration_set_name

  dkim_signing_attributes {
    next_signing_key_length = "RSA_2048_BIT"
  }
}

# The app role sends from the one address, through the one configuration set, and nothing
# else of SES.
resource "aws_iam_role_policy" "app_email" {
  count = local.email_enabled ? 1 : 0
  name  = "send-app-email"
  role  = aws_iam_role.app.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "SendFromTheAppAddress"
        Effect = "Allow"
        Action = "ses:SendEmail"
        Resource = [
          aws_sesv2_email_identity.app[0].arn,
          aws_sesv2_configuration_set.app[0].arn,
        ]
        Condition = { StringEquals = { "ses:FromAddress" = local.email_from } }
      },
    ]
  })
}

# Account-level reputation, as SES publishes it. No action is attached (the stack has no
# notification topic); the alarms show in the console and in the deploy's checks. AWS reviews
# an account at a 5 % bounce rate or a 0.1 % complaint rate; these fire before that.
resource "aws_cloudwatch_metric_alarm" "email_bounce_rate" {
  count               = local.email_enabled ? 1 : 0
  alarm_name          = "${local.name}-email-bounce-rate"
  alarm_description   = "SES bounce rate at or above 4 % (AWS reviews the account at 5 %)"
  namespace           = "AWS/SES"
  metric_name         = "Reputation.BounceRate"
  statistic           = "Average"
  period              = 3600
  evaluation_periods  = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  threshold           = 0.04
  treat_missing_data  = "notBreaching"
}

resource "aws_cloudwatch_metric_alarm" "email_complaint_rate" {
  count               = local.email_enabled ? 1 : 0
  alarm_name          = "${local.name}-email-complaint-rate"
  alarm_description   = "SES complaint rate at or above 0.08 % (AWS reviews the account at 0.1 %)"
  namespace           = "AWS/SES"
  metric_name         = "Reputation.ComplaintRate"
  statistic           = "Average"
  period              = 3600
  evaluation_periods  = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  threshold           = 0.0008
  treat_missing_data  = "notBreaching"
}
