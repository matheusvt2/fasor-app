# Secrets in SSM Parameter Store SecureString under the AWS-managed key (free standard
# tier) instead of Secrets Manager. The values are generated here, so they exist only in
# AWS and in the private, encrypted state bucket, never in git.
resource "random_password" "session_secret" {
  length  = 64
  special = false
}

resource "aws_ssm_parameter" "database_url" {
  name        = "${local.ssm_prefix}/database-url"
  description = "DATABASE_URL of the api: RDS over TLS, verify-full"
  type        = "SecureString"
  value       = "postgres://${aws_db_instance.this.username}:${random_password.database.result}@${aws_db_instance.this.address}:${aws_db_instance.this.port}/${aws_db_instance.this.db_name}?sslmode=verify-full"
}

resource "aws_ssm_parameter" "session_secret" {
  name        = "${local.ssm_prefix}/session-secret"
  description = "SESSION_SECRET of the api (better-auth)"
  type        = "SecureString"
  value       = random_password.session_secret.result
}

# Security review 2026-09-30 (I-8): the header CloudFront sends to the origin and Caddy's
# fallback site requires. Always generated (free), read only when the fallback is on.
resource "random_password" "fallback_origin" {
  length  = 48
  special = false
}

resource "aws_ssm_parameter" "fallback_origin_secret" {
  name        = "${local.ssm_prefix}/fallback-origin-secret"
  description = "X-Origin-Verify value shared by the CloudFront fallback and Caddy"
  type        = "SecureString"
  value       = random_password.fallback_origin.result
}

# The tag of the last deploy. The deploy script writes it after a successful roll, so a
# later apply without -var image_tag keeps the running images.
resource "aws_ssm_parameter" "image_tag" {
  name           = "${local.ssm_prefix}/image-tag"
  description    = "Image tag (commit SHA) of the last deploy, written by infra/bin/deploy"
  type           = "String"
  insecure_value = "none"

  lifecycle {
    ignore_changes = [insecure_value, value]
  }
}

data "aws_ssm_parameter" "image_tag" {
  name = aws_ssm_parameter.image_tag.name
}
