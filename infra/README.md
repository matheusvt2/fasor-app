# infra

Cloud infrastructure as Terraform (AD-27, `source-deltas.md` 2026-09-29). Terraform and the AWS CLI run in containers, never on the host: `infra/bin/tf <stack> <terraform args>` exports the `aws login` session of `AWS_PROFILE` (default `fasor-admin`) through the pinned `amazon/aws-cli` image and runs the pinned `hashicorp/terraform` image in `infra/<stack>`; `infra/bin/aws <args>` runs the pinned AWS CLI the same way.

The whole project's AWS spend stays below USD 100 per month (AGENTS.md Policy); every change here is costed against that ceiling first (see "Cost" below).

## Stacks

- `bootstrap/` (applied 2026-09-29, state in `s3://fasor-tfstate-673409896745/bootstrap/terraform.tfstate`): the AWS Organization with the AI services opt-out policy on its root, the Terraform state bucket (versioned, encrypted, private, S3-native locking), the `fasor-admin` user (console password and MFA, no access keys), the `fasor-app` role that only `fasor-admin` may assume (Bedrock `InvokeModel` on the Story 11.6 evaluation candidates, Claude, Nova, Qwen3 VL and Mistral Large 3, narrowed once the evaluation picks; Textract `DetectDocumentText` in `us-east-1`; one-hour sessions), and the `fasor-monthly` budget (alerts at 50/80/100 % actual and 100 % forecast). Cost Anomaly Detection waits behind `enable_anomaly_detection` until Cost Explorer is enabled on the account.
- `production/` (Story 11.8, state in `s3://fasor-tfstate-673409896745/production/terraform.tfstate`): the only environment. There is no `staging` and no CI (`source-deltas.md` 2026-09-30).
- `caddy/`: the production Caddy image (Dockerfile and Caddyfile), built and pushed by the deploy script.

Each stack reads its e-mail recipients from an untracked `terraform.tfvars` in its own directory (`*.tfvars` is git-ignored; security review 2026-09-30, I-1): copy `terraform.tfvars.example` beside it and put the real addresses there before any `plan` or `apply`. `budget_alert_emails` is a list, so the operator and the client can both receive the budget alerts; `acme_email` (production) is the Let's Encrypt contact. None of them has a default.

## Profiles

```ini
[profile fasor-admin]
region = us-east-1
# login_session is written by `aws login --profile fasor-admin` (passkey MFA); the root user is never used

[profile fasor-app]
role_arn = arn:aws:iam::673409896745:role/fasor-app
source_profile = fasor-admin
region = us-east-1
duration_seconds = 3600
```

The local api gets short-lived `fasor-app` credentials from this profile; no access key exists for it. On AWS the api uses the ECS task role `fasor-production-app`, which carries the same Bedrock/Textract policy (`fasor-app-bedrock-textract`, attached by name) plus the files bucket.

## The production stack

Region `us-east-1`, sized for at most ten concurrent users.

| Area | What `infra/production` declares |
| --- | --- |
| Network (`network.tf`) | VPC `10.40.0.0/16`: one public subnet for the instance, two private subnets in two zones for the database, an internet gateway, no NAT gateway, no ALB. An S3 gateway endpoint on both route tables. The instance's security group opens 80 and 443 only; the database's accepts 5432 from the instance only. |
| Compute (`compute.tf`) | One ECS cluster (Container Insights off) and one EC2 instance from the ECS-optimized Amazon Linux 2023 AMI: `t3a.medium` for `architecture = "x86_64"` (the default) or `t4g.medium` for `arm64`, overridable with `instance_type`; gp3 30 GB encrypted root; IMDSv2 required (hop limit 1); standard CPU credits; an Elastic IP; no SSH key (Session Manager instead). The ECS agent runs with `ECS_ENABLE_TASK_IAM_ROLE_NETWORK_HOST=true` and `ECS_IMAGE_PULL_BEHAVIOR=prefer-cached`. |
| Services (`ecs.tf`) | Three host-network services with one task each: `api` (the api image, with its in-process workers, `WORKER=1`), `ocr` (the sidecar, behind `enable_ocr_service`) and `caddy`; plus the one-shot `migrate` task definition (the api image running `src/db/migrate-cli.ts`). Caddy reaches the api on `127.0.0.1:3000`, the api reaches ocr on `127.0.0.1:8000`. A roll stops the old task before it starts the new one (minimum healthy 0 %, maximum 100 %). |
| Database (`rds.tf`) | RDS for PostgreSQL 18, `db.t4g.micro`, 20 GB gp3 encrypted, single-AZ, private, 7-day backups, deletion protection, a final snapshot, no Performance Insights. The api connects with `sslmode=verify-full` against the RDS CA bundle baked into its image (`NODE_EXTRA_CA_CERTS`). |
| Files (`storage.tf`) | Bucket `fasor-files-673409896745`: versioned, SSE-S3, public access blocked, bucket owner enforced, noncurrent versions expire after 30 days, incomplete multipart uploads abort after 7. Terraform owns the bucket; the api only probes it at boot. |
| Images (`storage.tf`) | ECR repositories `fasor/api`, `fasor/ocr`, `fasor/caddy`, scan on push, a lifecycle keeping the last 5 images. |
| Secrets (`ssm.tf`) | SSM Parameter Store SecureString (AWS-managed key): `/fasor/production/database-url` and `/fasor/production/session-secret`, both generated with `random_password`; the String `/fasor/production/image-tag` records the last deployed tag. |
| Logs (`storage.tf`) | CloudWatch log groups `/fasor/production/{api,ocr,caddy,migrate}`, kept 14 days. |
| IAM (`iam.tf`) | Execution role (image pull, logs, `ssm:GetParameters` on `/fasor/production/*`, `kms:Decrypt` through SSM only); task role `fasor-production-app` (the bootstrap Bedrock/Textract policy, `s3:ListBucket` on the bucket, `s3:GetObject`/`s3:PutObject` on its objects, nothing else); the instance role keeps only the ECS agent and Session Manager policies. |
| Night schedule (`schedule.tf`) | EventBridge Scheduler, America/Sao_Paulo: stop the instance 00:00, stop the database 00:05, start the database 04:40, start the instance 05:00 (`enable_night_schedule`). |
| Budget action (`budget.tf`) | On `fasor-monthly` at 90 % of actual spend (security review 2026-09-30, I-3: actual spend lags up to a day), automatically: attach a deny policy on `bedrock:InvokeModel*`, `bedrock:Converse*` and `textract:*` to `fasor-app` and `fasor-production-app`. |
| HTTPS fallback (`cloudfront.tf`) | Off by default (`enable_cloudfront_fallback`): a CloudFront distribution on its default `*.cloudfront.net` name in front of the instance. |

The api's configuration on AWS sets no `S3_ENDPOINT` and no static keys: the S3 client then gets only its region, reaches S3 virtual-hosted style, and the AWS SDK default credential chain supplies the task role's credentials (`apps/api/src/storage/s3.ts`). Locally, compose keeps MinIO with its endpoint and static keys, unchanged.

### AI features flag

Production runs with `ai_features = "off"` (the api's `AI_FEATURES=off`), decided 2026-09-30 because the account has no Bedrock quota yet. The api then refuses every reading whose pipeline needs the LLM step (the plate, the panel photo, the vision caption and the NC draft): nothing is queued, the photo is marked failed, the reread route answers `409 ai_features_off`, and `GET /api/account` answers `features.ai = false`, so the web hides "Fotografar placa", "Fotografar equipamento", the caption suggestion and the NC draft. "Ler visor" (OCR only), dictation (in the browser) and manual entry stay. `llm_provider` stays `fake`, unreachable while the flag is off; a validation refuses `ai_features = "on"` with `llm_provider = "fake"`, and `ocr_provider` accepts only `ocr-svc` or `textract`. Turning the flag on waits for Story 11.6 (the Bedrock provider and its quota, `llm_provider = "bedrock"`).

The generated database password and session secret land in the Terraform state, which lives only in the private, encrypted, versioned state bucket; nothing secret is in git.

### Architecture: x86-64 by default

The coordinator chose Graviton, but the ocr sidecar pins `paddlepaddle==3.3.1`, which publishes no linux aarch64 wheel (checked 2026-09-30: manylinux x86-64, macOS arm64 and Windows only), so the same ocr image cannot be built for arm64. The default is therefore `architecture = "x86_64"` on a `t3a.medium`; `architecture = "arm64"` switches the instance type (`t4g.medium`), the AMI and the deploy's build platform in one line once the ocr image builds for arm64 (or `enable_ocr_service = false` with another OCR provider). The difference is about USD 2-3 per month. The api image builds for both (`TARGETARCH` picks the LibreOffice 26.2.6 `.deb` for x86-64 or aarch64); only the amd64 build was run, since the build host cannot emulate arm64. Recorded in `source-deltas.md` 2026-09-30 (Story 11.8 builder), pending Matheus.

### Memory on the 4 GiB instance

Measured on 2026-09-30 with `docker stats` on the build machine (a shared host, load average about 65 on 8 cores, with swap in use, so durations are not representative and resident numbers may read slightly low):

| Container | Idle | Peak | Measured while |
| --- | --- | --- | --- |
| api (`apps/api/Dockerfile.prod`, `NODE_ENV=production`, `WORKER=1`) | 478 MiB right after boot | 641 MiB | LibreOffice converting a relatório DOCX to PDF inside the container (the generate step's heaviest part) |
| ocr (`services/ocr`, `OMP_NUM_THREADS=2`) | 786 MiB after the models load | about 3.0 GiB (cgroup `memory.peak` 3.57 GB with page cache) | one plate read of a 1600 x 1100 photo (PP-OCRv5 server detection), back to 280 MiB after |
| caddy | under 50 MiB (Caddy's usual footprint; not run here, it needs a public address) | | |

The soft reservations in `ecs.tf` are api 1024 MiB, ocr 1536 MiB, caddy 64 MiB and migrate 256 MiB (2.9 GiB of the about 3.7 GiB ECS can place on a `t3a.medium`). **Risk:** a plate read that coincides with a document generation peaks at about 3.7 GiB for the containers alone, at the edge of 4 GiB once the OS and the ECS agent are counted. The OCR pipeline serializes its reads and the generate worker runs one conversion at a time, so for ten users the overlap is rare; if the instance shows OOM kills (`dmesg` over Session Manager, or a task stopped with exit 137), set `instance_type = "t3a.large"` (8 GiB, +USD 21.73 per month with the night stop, see "Cost") or turn the ocr service off with `OCR_PROVIDER=textract` once Story 11.7 ships.

### HTTPS for the tablets

Caddy serves `https://<Elastic IP>` (the `public_url` output) with a **Let's Encrypt IP address certificate**: Let's Encrypt issues certificates for IP addresses only under its `shortlived` ACME profile (about six days), which Caddy 2.11.4 requests with `issuer acme { profile shortlived }` and renews on its own through the HTTP-01 challenge on port 80. It chains to ISRG Root X1, which Android Chrome and iPadOS Safari trust, so the tablets need no certificate install and the origin is a secure context (service worker, camera, geolocation). Caddy's ACME account and certificate live in `/var/lib/caddy/data` on the instance's root volume, which survives the night stop and every roll, so Let's Encrypt is asked again only when a renewal is due. Port 80 otherwise redirects to HTTPS.

**Fallback:** should a tablet browser reject the IP certificate, set `enable_cloudfront_fallback = true` and apply: a CloudFront distribution on its default `https://<id>.cloudfront.net` name (Amazon's certificate) reaches the instance over plain HTTP on port 80, where Caddy answers that host name; the api adds that origin to its `TRUSTED_ORIGINS`, and the `cloudfront_url` output names it. Nothing is cached. A domain later changes `infra/` only.

## Checks (offline, no AWS login)

```sh
infra/bin/check
```

Runs, each in a pinned container: `terraform fmt -check -recursive`; `terraform init -backend=false` and `validate` for `bootstrap` and `production` (`TF_OFFLINE=1 infra/bin/tf` skips the credential export); tflint (`ghcr.io/terraform-linters/tflint:v0.59.1`, `infra/.tflint.hcl`); ShellCheck (`koalaman/shellcheck:v0.11.0`) over `infra/bin/*`. It exits non-zero when any check fails. The provider versions are locked in each stack's committed `.terraform.lock.hcl`.

## Deploy

The step-by-step publishing procedure (prerequisites, bootstrap, dry run, deploy, checks, release tag, rollback) is [PUBLISHING.md](PUBLISHING.md); this section describes what the script does.

```sh
infra/bin/deploy [--dry-run] [--skip-build] [--tag <sha>]
```

Run it from a clean tree after a story's merge to main, with the `aws login` session of `fasor-admin` active. In order, it:

1. refuses a working tree with uncommitted changes and takes the HEAD commit SHA as the tag;
2. reads the stack's outputs (platform, ECR repositories, cluster, services, migrate task family, public URL);
3. builds `apps/api/Dockerfile.prod` (build context the repository root), `services/ocr` and `infra/caddy` with `docker buildx build --platform <linux/amd64|linux/arm64> --load`;
4. logs Docker in to ECR through the aws-cli container and pushes the three images;
5. applies only the `migrate` task definition with the new tag, waits for the instance's ECS agent to be connected, runs the migration task (EC2 launch type) and waits for it to stop; a non-zero exit stops the deploy before any roll and prints the CloudWatch log stream `migrate/migrate/<task id>` in `/fasor/production/migrate`;
6. applies the whole stack with the new tag (the services roll) and waits for `services-stable`;
7. polls `GET https://<Elastic IP>/api/health` until it answers `status: up` (database, queue, storage and LibreOffice all up); a 503 answer is printed so the down component is named;
8. only then records the tag in `/fasor/production/image-tag`, so a later plain `terraform apply` keeps a tag that proved healthy.

`--dry-run` prints every step's command prefixed `DRY-RUN:` with placeholder outputs and touches nothing: no build, no push, no AWS or Terraform call. `--skip-build --tag <sha>` redeploys images already in ECR (a rollback). The api still migrates at boot, idempotently; after the one-shot task it finds nothing to do.

A plain `infra/bin/tf production apply` without `-var image_tag=...` keeps the running images: the tag defaults to the SSM parameter's value.

## Cost

List prices for `us-east-1` as the builder knows them on 2026-09-30 (not re-read from the AWS price list, which needs the account; re-check them in the AWS Pricing Calculator before the first apply). A month is 730 hours; the night schedule keeps the instance on 19 h a day (577.9 h a month) and the database 19 h 25 min a day (590.6 h).

| Item | Formula | USD per month |
| --- | --- | --- |
| EC2 `t3a.medium` on demand | 577.9 h x 0.0376 | 21.73 |
| EBS gp3 root, 30 GB | 30 x 0.08 | 2.40 |
| Public IPv4 (the Elastic IP, billed also while stopped) | 730 h x 0.005 | 3.65 |
| RDS `db.t4g.micro` PostgreSQL, single-AZ | 590.6 h x 0.016 | 9.45 |
| RDS gp3 storage, 20 GB | 20 x 0.115 | 2.30 |
| RDS backups (7 days, within the free 100 % of storage) | 0 | 0.00 |
| S3 Standard, about 20 GB plus requests | 20 x 0.023 + 0.14 | 0.60 |
| ECR, about 6 GB (5 images of each repository) | 6 x 0.10 | 0.60 |
| CloudWatch Logs, about 1 GB ingested, 14 days kept | 1 x 0.50 + 0.10 | 0.60 |
| SSM Parameter Store standard, AWS-managed KMS key, EventBridge Scheduler, 2 budgets with one action, S3 gateway endpoint, data transfer out under 100 GB | free tiers | 0.00 |
| CloudFront fallback (off by default; within 1 TB and 10 M requests if on) | free tier | 0.00 |
| Textract `DetectDocumentText`, allowance of 5 000 pages | 5 000 / 1 000 x 1.50 | 7.50 |
| Bedrock allowance (Story 11.6 picks the model) | allowance | 30.00 |
| **Total** | | **78.83** |

The total stays below USD 100 with Textract and a Bedrock allowance included; the 90 % budget action stops Bedrock and Textract before the ceiling is crossed. Without the night schedule the instance costs 730 h x 0.0376 = USD 27.45 and the database 730 h x 0.016 = USD 11.68 (total USD 86.78). With `arm64` (`t4g.medium`, 577.9 h x 0.0336) the instance costs USD 19.42. With `t3a.large` (577.9 h x 0.0752 = USD 43.46) the total becomes USD 100.56, so that switch also needs the Bedrock allowance cut to about USD 29 or less.

## Runbook

- **First deploy of an empty stack:** `infra/bin/tf production init`, then `infra/bin/tf production apply` (creates everything; the services cannot start until their images exist), then `infra/bin/deploy`.
- **Logs:** `infra/bin/aws logs tail /fasor/production/api --since 1h` (also `ocr`, `caddy`, `migrate`).
- **A shell on the instance:** Session Manager (the AWS CLI container lacks the Session Manager plugin, so use the console's Session Manager "Connect", which changes nothing); `docker ps`, `docker logs`, `dmesg` for OOM kills.
- **Roll back:** `infra/bin/deploy --skip-build --tag <previous sha>` (ECR keeps the last 5 images). Migrations are forward-only, so a rollback across a migration needs the older code to tolerate the newer schema.
- **Before 05:00 or during the night:** the app is down by design; `infra/bin/aws rds start-db-instance --db-instance-identifier fasor-production`, then `infra/bin/aws ec2 start-instances --instance-ids <instance_id output>` brings it up early; `enable_night_schedule = false` removes the schedule.
- **Budget action fired:** Bedrock and Textract calls fail with AccessDenied and readings fall back to manual entry. Once the spend is understood, detach the policy `fasor-production-deny-bedrock-textract` from both roles with `infra/bin/aws iam detach-role-policy` (or reset the action in AWS Budgets); it applies again at the next 90 %.
- **Restore the database:** RDS point-in-time restore or the final snapshot `fasor-production-final` into a new instance, then point `database-url` at it (Terraform import or a changed `identifier`); `deletion_protection` must be turned off and the `prevent_destroy` lifecycle removed in `rds.tf` before any destroy (both guard it since the 2026-09-30 review, I-4).
- **Rotate a secret:** `infra/bin/tf production apply -replace=random_password.session_secret` (signs every user out) or `-replace=random_password.database` (also changes the RDS password), then `infra/bin/deploy --skip-build --tag <current sha>` so the tasks read the new value.
- **Caddy certificate trouble:** `infra/bin/aws logs tail /fasor/production/caddy`; port 80 must stay open for HTTP-01; the fallback above bypasses it.
- **Patch the AMI:** the instance ignores newer AMIs so an unrelated apply never replaces it (and its certificate storage); replace it on purpose with `infra/bin/tf production apply -replace=aws_instance.this` and redeploy.

Known limits: the containers share the host network, so a compromised container could reach the instance metadata service and the instance role (ECS agent and Session Manager permissions only); a roll takes the app down for the seconds between the old task stopping and the new one passing its health check.
