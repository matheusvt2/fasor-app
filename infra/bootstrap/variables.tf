variable "account_id" {
  description = "The only AWS account this configuration may touch."
  type        = string
  default     = "673409896745"
}

variable "budget_alert_email" {
  description = "Receives the monthly budget and anomaly alerts."
  type        = string
  default     = "bruno@fasorengenharia.com.br"
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
