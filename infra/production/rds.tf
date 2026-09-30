# PostgreSQL 18 on the smallest Graviton class, single-AZ, private, reachable from the
# instance only. RDS for PostgreSQL forces TLS; the api connects with
# sslmode=verify-full against the RDS CA bundle baked into its image.
resource "random_password" "database" {
  length  = 40
  special = false
}

resource "aws_db_subnet_group" "this" {
  name       = local.name
  subnet_ids = aws_subnet.private[*].id
}

resource "aws_db_instance" "this" {
  identifier     = local.name
  engine         = "postgres"
  engine_version = "18"
  instance_class = "db.t4g.micro"

  allocated_storage = 20
  storage_type      = "gp3"
  storage_encrypted = true

  db_name  = "app"
  username = "app"
  password = random_password.database.result
  port     = 5432

  multi_az               = false
  publicly_accessible    = false
  db_subnet_group_name   = aws_db_subnet_group.this.name
  vpc_security_group_ids = [aws_security_group.database.id]

  backup_retention_period = 7
  # UTC, after the 05:00 America/Sao_Paulo start (07:40 UTC): the default us-east-1 windows
  # overlap the night stop, when no backup or maintenance can run.
  backup_window                = "08:00-08:30"
  maintenance_window           = "sun:08:40-sun:09:10"
  copy_tags_to_snapshot        = true
  deletion_protection          = true
  skip_final_snapshot          = false
  final_snapshot_identifier    = "${local.name}-final"
  performance_insights_enabled = false
  auto_minor_version_upgrade   = true
}
