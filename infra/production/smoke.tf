# Story 14.10 part 6: the production smoke after every deploy. A dedicated test company and
# user (fixed id and e-mail, variables.tf) that the smoke may write to, and the one-shot
# `smoke-seed` task (the api image running src/db/smoke-seed-cli.ts) that empties that one
# company and seeds it again: its user, the standard template and one fresh test relatório.
# infra/bin/deploy runs it before the Playwright suite under e2e/production/ and again as the
# cleanup. The task refuses a company holding any user but the smoke e-mail.
#
# The user's password is generated here and kept in AWS Secrets Manager, not in SSM like the
# stack's other secrets: Matheus's decision of 2026-10-15 (option a), USD 0.40 a month plus
# USD 0.05 per 10 000 calls (infra/README.md, "Cost"); switching to an SSM SecureString is a
# change of this file and the execution role's statement. It reaches the task only through
# the task definition's `secrets` (E11-A4: never an environment override or a command
# argument), and the deploy reads it into a shell variable for the suite's container.

resource "random_password" "smoke_user" {
  length  = 40
  special = false
}

resource "aws_secretsmanager_secret" "smoke_user_password" {
  name                    = "${local.name}/smoke-user-password"
  description             = "Password of the production smoke's test user (${var.smoke_user_email}), read by the smoke-seed task and infra/bin/deploy"
  recovery_window_in_days = 7
}

resource "aws_secretsmanager_secret_version" "smoke_user_password" {
  secret_id     = aws_secretsmanager_secret.smoke_user_password.id
  secret_string = random_password.smoke_user.result
}

resource "aws_ecs_task_definition" "smoke_seed" {
  family                   = "${local.name}-smoke-seed"
  requires_compatibilities = ["EC2"]
  network_mode             = "host"
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.app.arn

  container_definitions = jsonencode([{
    name              = "smoke-seed"
    image             = local.images["api"]
    essential         = true
    memoryReservation = 256
    command           = ["./node_modules/.bin/tsx", "src/db/smoke-seed-cli.ts"]
    # The api's whole configuration (the CLI loads it, as migrate-cli.ts does) plus the smoke
    # company and user; the password only through `secrets`.
    environment = concat(local.api_environment, [
      { name = "SMOKE_COMPANY_ID", value = var.smoke_company_id },
      { name = "SMOKE_COMPANY_NAME", value = var.smoke_company_name },
      { name = "SMOKE_USER_EMAIL", value = var.smoke_user_email },
      { name = "SMOKE_USER_NAME", value = var.smoke_user_name },
    ])
    secrets = concat(local.api_secrets, [
      { name = "SMOKE_USER_PASSWORD", valueFrom = aws_secretsmanager_secret.smoke_user_password.arn },
    ])
    logConfiguration = local.logs["smoke"]
  }])

  # A task started before the secret holds a value could not start its container.
  depends_on = [aws_secretsmanager_secret_version.smoke_user_password]
}
