variable "account_id" {
  description = "The only AWS account this configuration may touch."
  type        = string
  default     = "673409896745"
}

variable "budget_alert_emails" {
  description = "Receive the monthly budget and anomaly alerts. No default: set in the untracked terraform.tfvars (see terraform.tfvars.example)."
  type        = list(string)

  validation {
    condition     = length(var.budget_alert_emails) > 0 && alltrue([for e in var.budget_alert_emails : can(regex("^[^@ ]+@[^@ ]+$", e))])
    error_message = "budget_alert_emails needs at least one e-mail address."
  }
}

variable "monthly_budget_usd" {
  description = "Ceiling for the whole project's AWS spend (AGENTS.md Policy, 2026-09-29)."
  type        = number
  default     = 100
}

variable "enable_anomaly_detection" {
  description = "Cost Anomaly Detection needs Cost Explorer, which a new account enables up to 24 h after its first visit."
  type        = bool
  default     = false
}
