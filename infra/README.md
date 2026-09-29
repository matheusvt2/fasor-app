# infra

Cloud infrastructure as Terraform (AD-27, `source-deltas.md` 2026-09-29). Terraform and the AWS CLI run in containers, never on the host: `infra/bin/tf <stack> <terraform args>` exports the `aws login` session of `AWS_PROFILE` (default `fasor-admin`) through the pinned `amazon/aws-cli` image and runs the pinned `hashicorp/terraform` image in `infra/<stack>`.

The whole project's AWS spend stays below USD 100 per month (AGENTS.md Policy); every change here is costed against that ceiling first.

## Stacks

- `bootstrap/` (applied 2026-09-29, state in `s3://fasor-tfstate-673409896745/bootstrap/terraform.tfstate`): the AWS Organization with the AI services opt-out policy on its root, the Terraform state bucket (versioned, encrypted, private, S3-native locking), the `fasor-admin` user (console password and MFA, no access keys), the `fasor-app` role that only `fasor-admin` may assume (Bedrock `InvokeModel` on Claude and Textract `DetectDocumentText` in `us-east-1`, one-hour sessions), and the `fasor-monthly` budget (alerts at 50/80/100 % actual and 100 % forecast). Cost Anomaly Detection waits behind `enable_anomaly_detection` until Cost Explorer is enabled on the account.
- The application stack (Story 11.8) lands beside it with its own state key per environment.

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

The local api gets short-lived `fasor-app` credentials from this profile; no access key exists for it. On AWS the api uses its instance role with the same policy.
