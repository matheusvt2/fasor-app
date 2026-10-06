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

  # Security review 2026-09-30 (I-4): like the buckets, the database is never destroyed by a
  # plan; deletion_protection alone lets a destroy tear its dependents down first.
  lifecycle {
    prevent_destroy = true
  }
}

# 2026-10-05 (Matheus): the database above, in the second private subnet's zone, could not
# be started after the night stop three mornings out of five (InsufficientDBInstanceCapacity
# for db.t4g.micro in that zone), and RDS cannot move a stopped instance. This one is a
# point-in-time restore of it, at its latest restorable time, in the first private subnet's
# zone, the instance's own. The api uses this one (`ssm.tf`); the old one stays stopped and
# untouched until a later change removes it (it has deletion protection and prevent_destroy).
# The night schedule no longer stops any database (`schedule.tf`).
# db.t3.micro (Matheus, 2026-10-05): RDS no longer offers db.t4g.micro for PostgreSQL in
# us-east-1 (describe-orderable-db-instance-options lists none in any zone or version, while
# us-east-2 and sa-east-1 still do), which is why the old instance could not be placed again
# after a stop. db.t3.micro is offered in every zone here, about USD 13 a month always on.
resource "aws_db_instance" "main" {
  identifier        = "${local.name}-a"
  instance_class    = "db.t3.micro"
  availability_zone = aws_subnet.private[0].availability_zone

  restore_to_point_in_time {
    source_db_instance_identifier = aws_db_instance.this.identifier
    use_latest_restorable_time    = true
  }

  storage_type      = "gp3"
  storage_encrypted = true
  password          = random_password.database.result
  port              = 5432

  multi_az               = false
  publicly_accessible    = false
  db_subnet_group_name   = aws_db_subnet_group.this.name
  vpc_security_group_ids = [aws_security_group.database.id]

  backup_retention_period      = 7
  backup_window                = "08:00-08:30"
  maintenance_window           = "sun:08:40-sun:09:10"
  copy_tags_to_snapshot        = true
  deletion_protection          = true
  skip_final_snapshot          = false
  final_snapshot_identifier    = "${local.name}-a-final"
  performance_insights_enabled = false
  auto_minor_version_upgrade   = true

  lifecycle {
    prevent_destroy = true
    # The restore block only matters at creation.
    ignore_changes = [restore_to_point_in_time]
  }
}
