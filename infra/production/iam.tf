# Two task roles, as ECS separates them: the execution role lets the ECS agent pull
# images, write logs and read the SSM secrets into the containers; the task role is what
# the api itself calls AWS with (the SDK default credential chain, Story 11.8).

data "aws_iam_policy_document" "ecs_tasks_trust" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [var.account_id]
    }
  }
}

resource "aws_iam_role" "execution" {
  name               = "${local.name}-execution"
  description        = "ECS agent: pull images, write logs, read /fasor/production/* secrets"
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_trust.json
}

resource "aws_iam_role_policy_attachment" "execution" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy" "execution_secrets" {
  name = "read-production-parameters"
  role = aws_iam_role.execution.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "ReadProductionParameters"
        Effect   = "Allow"
        Action   = "ssm:GetParameters"
        Resource = "arn:aws:ssm:${local.region}:${var.account_id}:parameter${local.ssm_prefix}/*"
      },
      {
        # SecureString under the AWS-managed key aws/ssm, decrypted only through SSM.
        Sid       = "DecryptThroughSsm"
        Effect    = "Allow"
        Action    = "kms:Decrypt"
        Resource  = "arn:aws:kms:${local.region}:${var.account_id}:key/*"
        Condition = { StringEquals = { "kms:ViaService" = "ssm.${local.region}.amazonaws.com" } }
      },
    ]
  })
}

# fasor-production-app: the bootstrap Bedrock/Textract policy (the same statements the
# local fasor-app role carries, attached by name so Story 11.6's narrowing reaches both)
# plus the files bucket, nothing else.
resource "aws_iam_role" "app" {
  name               = "${local.name}-app"
  description        = "The api on ECS: Bedrock and Textract as fasor-app, plus the files bucket"
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_trust.json
}

resource "aws_iam_role_policy_attachment" "app_bedrock_textract" {
  role       = aws_iam_role.app.name
  policy_arn = "arn:aws:iam::${var.account_id}:policy/${var.bootstrap_app_policy_name}"
}

resource "aws_iam_role_policy" "app_files" {
  name = "files-bucket"
  role = aws_iam_role.app.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        # HeadBucket (the boot and health probe) is authorized by ListBucket.
        Sid      = "ListFilesBucket"
        Effect   = "Allow"
        Action   = "s3:ListBucket"
        Resource = aws_s3_bucket.files.arn
      },
      {
        # AD-7: immutable keys and no delete in the MVP.
        Sid      = "ReadWriteFiles"
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:PutObject"]
        Resource = "${aws_s3_bucket.files.arn}/*"
      },
    ]
  })
}
