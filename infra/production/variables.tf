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
  description = "LLM_PROVIDER of the api. Stays fake until Story 11.6 passes its Definition of Ready."
  type        = string
  default     = "fake"

  validation {
    condition     = contains(["fake", "bedrock"], var.llm_provider)
    error_message = "llm_provider must be fake or bedrock (the anthropic value is dropped by Story 11.6)."
  }
}

variable "ai_features" {
  description = "AI_FEATURES of the api. off refuses the readings that need the LLM step (plate, panel, caption, NC draft) and hides their entry points; on waits for Story 11.6 (Bedrock quota)."
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

variable "acme_email" {
  description = "Contact address of the Let's Encrypt ACME account Caddy creates."
  type        = string
  default     = "bruno@fasorengenharia.com.br"
}

variable "budget_name" {
  description = "The monthly budget of infra/bootstrap that carries the 100 % action."
  type        = string
  default     = "fasor-monthly"
}

variable "budget_alert_email" {
  description = "Notified when the budget action runs."
  type        = string
  default     = "bruno@fasorengenharia.com.br"
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
