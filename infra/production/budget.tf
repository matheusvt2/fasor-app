# The budget action (source-deltas 2026-09-30 cost measures): when the actual spend of the
# month reaches 100 % of fasor-monthly (infra/bootstrap/budget.tf), AWS Budgets attaches a
# deny policy on Bedrock and Textract to both app roles, automatically. The app keeps
# running; readings fall back to manual entry. Detach the policy (or let Budgets reset it
# next month) to lift it: see infra/README.md, runbook.
resource "aws_iam_policy" "deny_ai" {
  name        = "${local.name}-deny-bedrock-textract"
  description = "Attached by the fasor-monthly budget action at 100 %: no Bedrock, no Textract"
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid      = "DenyPaidAiOverBudget"
      Effect   = "Deny"
      Action   = ["bedrock:InvokeModel*", "bedrock:Converse*", "textract:*"]
      Resource = "*"
    }]
  })
}

resource "aws_iam_role" "budget_action" {
  name        = "${local.name}-budget-action"
  description = "AWS Budgets: attach the Bedrock/Textract deny policy to the app roles"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "budgets.amazonaws.com" }
      Action    = "sts:AssumeRole"
      Condition = { StringEquals = { "aws:SourceAccount" = var.account_id } }
    }]
  })
}

resource "aws_iam_role_policy" "budget_action" {
  name = "attach-deny-policy"
  role = aws_iam_role.budget_action.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid    = "AttachOnlyTheDenyPolicy"
      Effect = "Allow"
      Action = ["iam:AttachRolePolicy", "iam:DetachRolePolicy"]
      Resource = [
        "arn:aws:iam::${var.account_id}:role/${var.bootstrap_app_role_name}",
        aws_iam_role.app.arn,
      ]
      Condition = { ArnEquals = { "iam:PolicyARN" = aws_iam_policy.deny_ai.arn } }
    }]
  })
}

resource "aws_budgets_budget_action" "deny_ai" {
  budget_name        = var.budget_name
  action_type        = "APPLY_IAM_POLICY"
  approval_model     = "AUTOMATIC"
  notification_type  = "ACTUAL"
  execution_role_arn = aws_iam_role.budget_action.arn

  action_threshold {
    action_threshold_type  = "PERCENTAGE"
    action_threshold_value = 100
  }

  definition {
    iam_action_definition {
      policy_arn = aws_iam_policy.deny_ai.arn
      roles      = [var.bootstrap_app_role_name, aws_iam_role.app.name]
    }
  }

  subscriber {
    subscription_type = "EMAIL"
    address           = var.budget_alert_email
  }
}
