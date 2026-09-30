# tflint configuration for every stack (infra/bin/check). Only the bundled Terraform
# ruleset, so the check needs no plugin download.
config {
  format = "compact"
}

plugin "terraform" {
  enabled = true
  preset  = "recommended"
}
