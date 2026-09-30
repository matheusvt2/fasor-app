# HTTPS fallback, off by default. If a tablet browser rejects the Let's Encrypt IP
# certificate Caddy serves on https://<Elastic IP>, turn this on: CloudFront serves the
# app on its own default name (https://<id>.cloudfront.net, Amazon's certificate) and
# reaches the instance over plain HTTP on port 80, where Caddy answers that Host name
# (infra/caddy/Caddyfile). Nothing is cached. The api adds the CloudFront origin to its
# TRUSTED_ORIGINS (ecs.tf). Cost: the free tier's 1 TB and 10 M requests per month.
data "aws_cloudfront_cache_policy" "caching_disabled" {
  count = var.enable_cloudfront_fallback ? 1 : 0
  name  = "Managed-CachingDisabled"
}

data "aws_cloudfront_origin_request_policy" "all_viewer" {
  count = var.enable_cloudfront_fallback ? 1 : 0
  name  = "Managed-AllViewer"
}

resource "aws_cloudfront_distribution" "fallback" {
  count           = var.enable_cloudfront_fallback ? 1 : 0
  enabled         = true
  comment         = "${local.name} HTTPS fallback"
  price_class     = "PriceClass_100"
  is_ipv6_enabled = true

  origin {
    origin_id   = "instance"
    domain_name = aws_eip.this.public_dns

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "http-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  default_cache_behavior {
    target_origin_id         = "instance"
    viewer_protocol_policy   = "redirect-to-https"
    allowed_methods          = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods           = ["GET", "HEAD"]
    cache_policy_id          = data.aws_cloudfront_cache_policy.caching_disabled[0].id
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.all_viewer[0].id
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }
}
