# fasor-admin: the human administrator. Signs in with a console password and MFA
# through `aws login`; it has no access keys. The password is set outside
# Terraform so it never lands in the state.
resource "aws_iam_user" "admin" {
  name = "fasor-admin"
}

resource "aws_iam_user_policy_attachment" "admin" {
  user       = aws_iam_user.admin.name
  policy_arn = "arn:aws:iam::aws:policy/AdministratorAccess"
}

# fasor-app: what the api needs from AWS while it runs locally (Stories 11.6 and
# 11.7), nothing more. Only fasor-admin may assume it, and each session lasts
# at most one hour, so no long-lived key exists. On AWS the app gets the same
# policy through its instance role (Story 11.8).
resource "aws_iam_policy" "app" {
  name        = "fasor-app-bedrock-textract"
  description = "Invoke the Story 11.6 Bedrock models and detect text with Textract in us-east-1"
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        # Story 11.6 (2026-10-05): exactly the reference model (Claude Haiku 4.5), the escalation
        # model (Nova Pro) and the evaluation candidates (Nova 2 Lite, Qwen3 VL 235B, Mistral
        # Large 3), by exact ARN; Converse needs bedrock:InvokeModel (the api never streams). A cross-Region inference
        # profile (us. and global.) is invoked in us-east-1 and routes to the foundation model in
        # another Region, so its foundation model is allowed in every Region (`*`, which also
        # matches the Region-less ARN a global. profile routes to); Qwen3 VL and Mistral Large 3
        # have no profile and run in us-east-1 only.
        Sid    = "InvokeStory116Models"
        Effect = "Allow"
        Action = ["bedrock:InvokeModel"]
        Resource = [
          "arn:aws:bedrock:us-east-1:${var.account_id}:inference-profile/global.anthropic.claude-haiku-4-5-20251001-v1:0",
          "arn:aws:bedrock:us-east-1:${var.account_id}:inference-profile/us.anthropic.claude-haiku-4-5-20251001-v1:0",
          "arn:aws:bedrock:*::foundation-model/anthropic.claude-haiku-4-5-20251001-v1:0",
          "arn:aws:bedrock:us-east-1:${var.account_id}:inference-profile/us.amazon.nova-pro-v1:0",
          "arn:aws:bedrock:*::foundation-model/amazon.nova-pro-v1:0",
          "arn:aws:bedrock:us-east-1:${var.account_id}:inference-profile/global.amazon.nova-2-lite-v1:0",
          "arn:aws:bedrock:us-east-1:${var.account_id}:inference-profile/us.amazon.nova-2-lite-v1:0",
          "arn:aws:bedrock:*::foundation-model/amazon.nova-2-lite-v1:0",
          "arn:aws:bedrock:us-east-1::foundation-model/qwen.qwen3-vl-235b-a22b",
          "arn:aws:bedrock:us-east-1::foundation-model/mistral.mistral-large-3-675b-instruct",
        ]
      },
      {
        Sid       = "TextractDetectTextUsEast1"
        Effect    = "Allow"
        Action    = "textract:DetectDocumentText"
        Resource  = "*"
        Condition = { StringEquals = { "aws:RequestedRegion" = "us-east-1" } }
      },
    ]
  })
}

resource "aws_iam_role" "app" {
  name                 = "fasor-app"
  description          = "Local api access to Bedrock and Textract, assumed from fasor-admin"
  max_session_duration = 3600
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { AWS = "arn:aws:iam::${var.account_id}:root" }
      Action    = ["sts:AssumeRole", "sts:SetSourceIdentity"]
      Condition = { ArnEquals = { "aws:PrincipalArn" = aws_iam_user.admin.arn } }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "app" {
  role       = aws_iam_role.app.name
  policy_arn = aws_iam_policy.app.arn
}
