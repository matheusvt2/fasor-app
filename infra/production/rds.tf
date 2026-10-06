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

# 2026-10-06 (Matheus): the first database, `fasor-production` (db.t4g.micro in the second
# private subnet's zone), left Terraform's state. It could not be started after a night stop
# and RDS no longer offers db.t4g.micro for PostgreSQL in us-east-1, so the api moved to
# `fasor-production-a` below. `destroy = false` only forgets the instance, so its
# `prevent_destroy` and deletion protection need no change here; Matheus deletes it by hand
# (disable deletion protection, then `delete-db-instance` with a final snapshot; the
# commands are in `infra/README.md`). RDS restarts a database left stopped for seven days,
# so it has to go by 2026-10-12.
removed {
  from = aws_db_instance.this

  lifecycle {
    destroy = false
  }
}

# 2026-10-05 (Matheus): the first database, in the second private subnet's zone, could not
# be started after the night stop three mornings out of five (InsufficientDBInstanceCapacity
# for db.t4g.micro in that zone), and RDS cannot move a stopped instance. This one is a
# point-in-time restore of it, at its latest restorable time, in the first private subnet's
# zone, the instance's own. The api uses this one (`ssm.tf`).
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
    source_db_instance_identifier = local.name
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
