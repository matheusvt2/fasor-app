output "state_bucket" {
  value = aws_s3_bucket.tfstate.bucket
}

output "admin_user_arn" {
  value = aws_iam_user.admin.arn
}

output "app_role_arn" {
  value = aws_iam_role.app.arn
}

output "organization_root_id" {
  value = aws_organizations_organization.this.roots[0].id
}
