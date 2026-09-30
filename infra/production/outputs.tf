# Read by infra/bin/deploy (`terraform output -raw <name>`).
output "architecture" {
  value = var.architecture
}

output "platform" {
  description = "docker buildx --platform of every image."
  value       = local.platforms[var.architecture]
}

output "instance_type" {
  value = local.instance_type
}

output "instance_id" {
  value = aws_instance.this.id
}

output "ecr_registry" {
  value = split("/", aws_ecr_repository.this["api"].repository_url)[0]
}

output "ecr_api_url" {
  value = aws_ecr_repository.this["api"].repository_url
}

output "ecr_ocr_url" {
  value = aws_ecr_repository.this["ocr"].repository_url
}

output "ecr_caddy_url" {
  value = aws_ecr_repository.this["caddy"].repository_url
}

output "cluster_name" {
  value = aws_ecs_cluster.this.name
}

output "service_names" {
  description = "Space separated, for `aws ecs wait services-stable --services`."
  value       = join(" ", sort([for service in aws_ecs_service.this : service.name]))
}

output "migrate_task_family" {
  value = aws_ecs_task_definition.migrate.family
}

output "migrate_log_group" {
  value = aws_cloudwatch_log_group.this["migrate"].name
}

output "public_ip" {
  value = aws_eip.this.public_ip
}

output "public_url" {
  value = local.public_url
}

output "cloudfront_url" {
  value = local.cloudfront_url == null ? "" : local.cloudfront_url
}

output "image_tag" {
  value = local.image_tag
}

output "image_tag_parameter" {
  value = aws_ssm_parameter.image_tag.name
}

output "files_bucket" {
  value = aws_s3_bucket.files.bucket
}

output "database_identifier" {
  value = aws_db_instance.this.identifier
}
