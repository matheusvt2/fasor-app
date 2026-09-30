# The state bucket and its S3-native locking come from infra/bootstrap; this stack has
# its own key. The state holds the generated database password and session secret, so
# the bucket stays private and encrypted (infra/bootstrap/state.tf).
terraform {
  backend "s3" {
    bucket       = "fasor-tfstate-673409896745"
    key          = "production/terraform.tfstate"
    region       = "us-east-1"
    encrypt      = true
    use_lockfile = true
  }
}
