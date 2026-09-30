# The three services and the one-shot migration task, all in host network mode on the one
# instance: Caddy reaches the api at 127.0.0.1:3000, the api reaches ocr at
# 127.0.0.1:8000, and only 80 and 443 are open (network.tf). A roll stops the old task
# before it starts the new one (minimum healthy 0 %, maximum 100 %): seconds of downtime,
# acceptable for at most ten users, and the only way two tasks never want one host port.
#
# Memory: soft reservations (memoryReservation) sized for the 4 GiB instance from the
# measurements in infra/README.md; no hard limit, so a burst (a LibreOffice conversion,
# an OCR pass) may borrow what another container leaves free.

locals {
  images = {
    for name, repository in aws_ecr_repository.this : name => "${repository.repository_url}:${local.image_tag}"
  }

  logs = {
    for name, group in aws_cloudwatch_log_group.this : name => {
      logDriver = "awslogs"
      options = {
        awslogs-group         = group.name
        awslogs-region        = local.region
        awslogs-stream-prefix = name
      }
    }
  }

  trusted_origins = compact([local.public_url, local.cloudfront_url])

  # The api's environment, shared by the service and the migration task (migrate-cli.ts
  # loads the full configuration). No S3_ENDPOINT and no static keys: the SDK default
  # chain supplies the task role (apps/api/src/storage/s3.ts).
  api_environment = [
    for name, value in {
      NODE_ENV        = "production"
      PORT            = "3000"
      WORKER          = "1"
      S3_BUCKET       = aws_s3_bucket.files.bucket
      S3_REGION       = local.region
      AUTH_BASE_URL   = local.public_url
      TRUSTED_ORIGINS = join(",", local.trusted_origins)
      OCR_PROVIDER    = var.ocr_provider
      OCR_SERVICE_URL = "http://127.0.0.1:8000"
      LLM_PROVIDER    = var.llm_provider
      AWS_REGION      = local.region
    } : { name = name, value = value }
  ]

  api_secrets = [
    { name = "DATABASE_URL", valueFrom = aws_ssm_parameter.database_url.arn },
    { name = "SESSION_SECRET", valueFrom = aws_ssm_parameter.session_secret.arn },
  ]
}

resource "aws_ecs_task_definition" "api" {
  family                   = "${local.name}-api"
  requires_compatibilities = ["EC2"]
  network_mode             = "host"
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.app.arn

  container_definitions = jsonencode([{
    name              = "api"
    image             = local.images["api"]
    essential         = true
    memoryReservation = 1024
    portMappings      = [{ containerPort = 3000, hostPort = 3000, protocol = "tcp" }]
    environment       = local.api_environment
    secrets           = local.api_secrets
    # docker-compose.yml `api` healthcheck, within the ECS limits (at most 10 retries).
    healthCheck = {
      command     = ["CMD", "node", "-e", "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
      interval    = 10
      timeout     = 5
      retries     = 10
      startPeriod = 60
    }
    logConfiguration = local.logs["api"]
  }])
}

resource "aws_ecs_task_definition" "ocr" {
  family                   = "${local.name}-ocr"
  requires_compatibilities = ["EC2"]
  network_mode             = "host"
  execution_role_arn       = aws_iam_role.execution.arn

  container_definitions = jsonencode([{
    name              = "ocr"
    image             = local.images["ocr"]
    essential         = true
    memoryReservation = 1536
    portMappings      = [{ containerPort = 8000, hostPort = 8000, protocol = "tcp" }]
    # Host networking: the sidecar listens on loopback only (the security group does not
    # open 8000 either). Two vCPUs on the instance.
    command     = ["uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000"]
    environment = [{ name = "OMP_NUM_THREADS", value = "2" }]
    # docker-compose.yml `ocr` healthcheck.
    healthCheck = {
      command     = ["CMD", "python", "-c", "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://localhost:8000/health', timeout=4).status == 200 else 1)"]
      interval    = 10
      timeout     = 5
      retries     = 10
      startPeriod = 60
    }
    logConfiguration = local.logs["ocr"]
  }])
}

resource "aws_ecs_task_definition" "caddy" {
  family                   = "${local.name}-caddy"
  requires_compatibilities = ["EC2"]
  network_mode             = "host"
  execution_role_arn       = aws_iam_role.execution.arn

  # Caddy's ACME account and certificates live on the instance's root volume, which the
  # night stop keeps (compute.tf), so a restart never asks Let's Encrypt again.
  volume {
    name      = "caddy-data"
    host_path = "/var/lib/caddy/data"
  }

  volume {
    name      = "caddy-config"
    host_path = "/var/lib/caddy/config"
  }

  container_definitions = jsonencode([{
    name              = "caddy"
    image             = local.images["caddy"]
    essential         = true
    memoryReservation = 64
    portMappings = [
      { containerPort = 80, hostPort = 80, protocol = "tcp" },
      { containerPort = 443, hostPort = 443, protocol = "tcp" },
    ]
    environment = [
      { name = "PUBLIC_IP", value = local.public_ip },
      { name = "ACME_EMAIL", value = var.acme_email },
      { name = "FALLBACK_HOST", value = local.fallback_host },
    ]
    mountPoints = [
      { sourceVolume = "caddy-data", containerPath = "/data", readOnly = false },
      { sourceVolume = "caddy-config", containerPath = "/config", readOnly = false },
    ]
    logConfiguration = local.logs["caddy"]
  }])
}

# The one-shot migration task the deploy script runs before it rolls the services.
resource "aws_ecs_task_definition" "migrate" {
  family                   = "${local.name}-migrate"
  requires_compatibilities = ["EC2"]
  network_mode             = "host"
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.app.arn

  container_definitions = jsonencode([{
    name              = "migrate"
    image             = local.images["api"]
    essential         = true
    memoryReservation = 256
    # The `migrate` script of apps/api/package.json, without pnpm at run time.
    command          = ["./node_modules/.bin/tsx", "src/db/migrate-cli.ts"]
    environment      = local.api_environment
    secrets          = local.api_secrets
    logConfiguration = local.logs["migrate"]
  }])
}

locals {
  services = merge(
    {
      api   = aws_ecs_task_definition.api.arn
      caddy = aws_ecs_task_definition.caddy.arn
    },
    var.enable_ocr_service ? { ocr = aws_ecs_task_definition.ocr.arn } : {},
  )
}

resource "aws_ecs_service" "this" {
  for_each = local.services

  name            = each.key
  cluster         = aws_ecs_cluster.this.id
  task_definition = each.value
  launch_type     = "EC2"
  desired_count   = 1

  deployment_minimum_healthy_percent = 0
  deployment_maximum_percent         = 100

  # The deploy script waits for services-stable itself and then checks /api/health.
  wait_for_steady_state = false
}
