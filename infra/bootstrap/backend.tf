# Added after the first apply created the bucket; the state was then migrated
# with `terraform init -migrate-state`.
terraform {
  backend "s3" {
    bucket       = "fasor-tfstate-673409896745"
    key          = "bootstrap/terraform.tfstate"
    region       = "us-east-1"
    encrypt      = true
    use_lockfile = true
  }
}
