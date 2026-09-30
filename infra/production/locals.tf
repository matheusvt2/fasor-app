locals {
  name   = "fasor-production"
  region = "us-east-1"

  instance_types = {
    x86_64 = "t3a.medium"
    arm64  = "t4g.medium"
  }
  instance_type = coalesce(var.instance_type, local.instance_types[var.architecture])

  # The ECS-optimized Amazon Linux 2023 AMI, one public SSM parameter per architecture.
  ami_parameters = {
    x86_64 = "/aws/service/ecs/optimized-ami/amazon-linux-2023/recommended/image_id"
    arm64  = "/aws/service/ecs/optimized-ami/amazon-linux-2023/arm64/recommended/image_id"
  }

  # The deploy script builds every image for this platform.
  platforms = {
    x86_64 = "linux/amd64"
    arm64  = "linux/arm64"
  }

  # The tag of the running images: the one this apply deploys, else the last deploy's.
  image_tag = coalesce(var.image_tag, data.aws_ssm_parameter.image_tag.insecure_value)

  public_ip      = aws_eip.this.public_ip
  public_url     = "https://${aws_eip.this.public_ip}"
  cloudfront_url = var.enable_cloudfront_fallback ? "https://${aws_cloudfront_distribution.fallback[0].domain_name}" : null
  # Caddy answers the CloudFront Host on plain HTTP; unset, the site name matches nothing.
  fallback_host = var.enable_cloudfront_fallback ? aws_cloudfront_distribution.fallback[0].domain_name : "fallback.invalid"

  ssm_prefix = "/fasor/production"
}
