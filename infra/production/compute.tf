# One EC2 instance registered to one ECS cluster runs the three services (ecs.tf) in host
# network mode. It is a plain instance, not an Auto Scaling group: the night schedule
# stops and starts it (schedule.tf), so its root volume keeps Caddy's ACME account and
# certificate and the cached images, and its Elastic IP keeps the address.
resource "aws_ecs_cluster" "this" {
  name = local.name

  # No Container Insights (source-deltas 2026-09-30 cost measures).
  setting {
    name  = "containerInsights"
    value = "disabled"
  }
}

data "aws_ssm_parameter" "ecs_ami" {
  name = local.ami_parameters[var.architecture]
}

resource "aws_iam_role" "instance" {
  name        = "${local.name}-instance"
  description = "ECS container instance: the ECS agent and SSM Session Manager"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "instance_ecs" {
  role       = aws_iam_role.instance.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonEC2ContainerServiceforEC2Role"
}

resource "aws_iam_role_policy_attachment" "instance_ssm" {
  role       = aws_iam_role.instance.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_instance_profile" "instance" {
  name = "${local.name}-instance"
  role = aws_iam_role.instance.name
}

resource "aws_instance" "this" {
  ami                    = data.aws_ssm_parameter.ecs_ami.insecure_value
  instance_type          = local.instance_type
  subnet_id              = aws_subnet.public.id
  vpc_security_group_ids = [aws_security_group.instance.id]
  iam_instance_profile   = aws_iam_instance_profile.instance.name

  # Standard credits: CPU above the baseline is throttled instead of billed.
  credit_specification {
    cpu_credits = "standard"
  }

  root_block_device {
    volume_type = "gp3"
    volume_size = 30
    encrypted   = true
  }

  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"
    http_put_response_hop_limit = 1
  }

  user_data = <<-EOT
    #!/bin/bash
    set -euo pipefail
    cat >> /etc/ecs/ecs.config <<'CONFIG'
    ECS_CLUSTER=${aws_ecs_cluster.this.name}
    ECS_ENABLE_TASK_IAM_ROLE=true
    ECS_ENABLE_TASK_IAM_ROLE_NETWORK_HOST=true
    ECS_IMAGE_PULL_BEHAVIOR=prefer-cached
    CONFIG
    mkdir -p /var/lib/caddy/data /var/lib/caddy/config
  EOT

  tags = { Name = local.name }

  lifecycle {
    # A newer ECS-optimized AMI must never replace the instance (and lose Caddy's
    # certificate storage) on an unrelated apply; patch by replacing it on purpose.
    ignore_changes = [ami]
  }
}

resource "aws_eip" "this" {
  domain   = "vpc"
  instance = aws_instance.this.id

  tags = { Name = local.name }

  depends_on = [aws_internet_gateway.this]
}
