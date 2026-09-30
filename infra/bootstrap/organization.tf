# The account becomes the management account of its own organization so the AI
# services opt-out policy (Story 11.7) can apply: AWS never uses our content
# (plates, displays, readings) to improve its AI services.
resource "aws_organizations_organization" "this" {
  feature_set          = "ALL"
  enabled_policy_types = ["AISERVICES_OPT_OUT_POLICY"]
}

resource "aws_organizations_policy" "ai_opt_out" {
  name        = "ai-services-opt-out-all"
  description = "Opt out of content use by every AWS AI service"
  type        = "AISERVICES_OPT_OUT_POLICY"
  depends_on  = [aws_organizations_organization.this]
  content = jsonencode({
    services = {
      default = {
        opt_out_policy = { "@@assign" = "optOut" }
      }
    }
  })
}

resource "aws_organizations_policy_attachment" "ai_opt_out_root" {
  policy_id = aws_organizations_policy.ai_opt_out.id
  target_id = aws_organizations_organization.this.roots[0].id
}
