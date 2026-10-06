variable "account_id" {
  description = "The only AWS account this configuration may touch."
  type        = string
  default     = "673409896745"
}

variable "architecture" {
  description = "CPU architecture of the instance, its AMI and the images the deploy script builds. x86_64 by default: the ocr image pins paddlepaddle 3.3.1, which has no linux aarch64 wheel (source-deltas 2026-09-30, Story 11.8)."
  type        = string
  default     = "x86_64"

  validation {
    condition     = contains(["x86_64", "arm64"], var.architecture)
    error_message = "architecture is x86_64 or arm64."
  }
}

variable "instance_type" {
  description = "Overrides the instance type picked for the architecture (t3a.medium or t4g.medium, 2 vCPU and 4 GiB)."
  type        = string
  default     = null
}

variable "image_tag" {
  description = "Image tag (a commit SHA) of api, ocr and caddy. Null keeps the tag of the last deploy, read from the SSM parameter /fasor/production/image-tag."
  type        = string
  default     = null
}

variable "ocr_provider" {
  description = "OCR_PROVIDER of the api (ocr-svc, textract). The fake provider never runs in production."
  type        = string
  default     = "ocr-svc"

  validation {
    condition     = contains(["ocr-svc", "textract"], var.ocr_provider)
    error_message = "ocr_provider must be ocr-svc or textract (fake invents readings and never runs in production)."
  }
}

variable "llm_provider" {
  description = "LLM_PROVIDER of the api: bedrock (Story 11.6, Bedrock Converse) or fake, unreachable while ai_features is off."
  type        = string
  default     = "fake"

  validation {
    condition     = contains(["fake", "bedrock"], var.llm_provider)
    error_message = "llm_provider must be fake or bedrock."
  }
}

variable "bedrock_model_id" {
  description = "BEDROCK_MODEL_ID of the api: the structuring model (plate, panel), a model or inference-profile id the task role may invoke (infra/bootstrap/iam.tf). Claude Haiku 4.5 is the Story 11.6 reference."
  type        = string
  default     = "global.anthropic.claude-haiku-4-5-20251001-v1:0"

  validation {
    condition     = length(var.bedrock_model_id) > 0
    error_message = "bedrock_model_id is a model or inference-profile id."
  }
}

variable "bedrock_panel_model_id" {
  description = "BEDROCK_PANEL_MODEL_ID of the api: the model that reads panel fronts (Matheus, 2026-10-06). Qwen3 VL 235B by default; Haiku 4.5 returned the panel's block type uncited."
  type        = string
  default     = "qwen.qwen3-vl-235b-a22b"
}

variable "bedrock_prose_model_id" {
  description = "BEDROCK_PROSE_MODEL_ID of the api: the caption and NC draft model. Empty uses bedrock_model_id."
  type        = string
  default     = ""
}

variable "bedrock_escalation_model_id" {
  description = "BEDROCK_ESCALATION_MODEL_ID of the api: the model a plate reading more than half Verificar is read again on (Story 11.6). Empty turns the escalation off."
  type        = string
  default     = "us.amazon.nova-pro-v1:0"
}

variable "ai_features" {
  description = "AI_FEATURES of the api. off refuses the readings that need the LLM step (plate, panel, caption, NC draft) and hides their entry points; ~~on waits for Story 11.6 (Bedrock quota).~~ on needs llm_provider = bedrock, applied after the Story 11.6 merge and deploy (2026-10-05)."
  type        = string
  default     = "off"

  validation {
    condition     = contains(["on", "off"], var.ai_features)
    error_message = "ai_features must be on or off."
  }

  validation {
    condition     = var.ai_features == "off" || var.llm_provider != "fake"
    error_message = "ai_features = \"on\" needs llm_provider = \"bedrock\" (the fake provider invents readings and never runs in production)."
  }
}

variable "enable_ocr_service" {
  description = "Runs the ocr sidecar service (services/ocr). Off frees its memory when OCR_PROVIDER is not ocr-svc."
  type        = bool
  default     = true

  validation {
    condition     = var.enable_ocr_service || var.ocr_provider != "ocr-svc"
    error_message = "ocr_provider = \"ocr-svc\" needs enable_ocr_service = true (the api would call a dead 127.0.0.1:8000)."
  }
}

variable "enable_night_schedule" {
  description = "Stops the instance at 00:00 and the database at 00:05, starts the database at 04:40 and the instance at 05:00, America/Sao_Paulo."
  type        = bool
  default     = true
}

variable "enable_cloudfront_fallback" {
  description = "A CloudFront distribution on its default *.cloudfront.net name in front of the instance, for when a browser rejects the IP certificate."
  type        = bool
  default     = false
}

variable "app_domain" {
  description = "Host name the app is served under (for example app.example.com), with an A record to the Elastic IP in the domain's DNS. Caddy gets a regular Let's Encrypt certificate for it and the api takes it as its own origin; the IP URL keeps working. Null serves the IP URL only. Set in the untracked terraform.tfvars; apply only once the A record resolves, or the ACME validation fails."
  type        = string
  default     = null

  validation {
    condition     = var.app_domain == null || can(regex("^([a-z0-9]([a-z0-9-]*[a-z0-9])?\\.)+[a-z]{2,}$", var.app_domain))
    error_message = "app_domain must be a lower-case host name such as app.example.com."
  }
}

variable "acme_email" {
  description = "Contact address of the Let's Encrypt ACME account Caddy creates. No default: set in the untracked terraform.tfvars."
  type        = string

  validation {
    condition     = can(regex("^[^@ ]+@[^@ ]+$", var.acme_email))
    error_message = "acme_email must be an e-mail address."
  }
}

variable "budget_name" {
  description = "The monthly budget of infra/bootstrap that carries the 100 % action."
  type        = string
  default     = "fasor-monthly"
}

variable "budget_alert_emails" {
  description = "Receive the notice when the budget action runs. No default: set in the untracked terraform.tfvars (see terraform.tfvars.example)."
  type        = list(string)

  validation {
    condition     = length(var.budget_alert_emails) > 0 && alltrue([for e in var.budget_alert_emails : can(regex("^[^@ ]+@[^@ ]+$", e))])
    error_message = "budget_alert_emails needs at least one e-mail address."
  }
}

variable "bootstrap_app_role_name" {
  description = "The local api role of infra/bootstrap (referenced by name, never managed here)."
  type        = string
  default     = "fasor-app"
}

variable "bootstrap_app_policy_name" {
  description = "The Bedrock and Textract policy of infra/bootstrap, attached to the task role too."
  type        = string
  default     = "fasor-app-bedrock-textract"
}

variable "log_retention_days" {
  description = "CloudWatch Logs retention of every log group."
  type        = number
  default     = 14
}
