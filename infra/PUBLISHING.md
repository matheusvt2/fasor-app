# Publishing

How to take a merged `main` to production on AWS. What the stack contains, its cost and its runbook are in [README.md](README.md); this guide is the procedure.

Production is the only environment. There is no staging and no CI: you publish from your own machine, from a clean checkout of `main`, with Docker and an AWS login. Terraform, the AWS CLI and every image build run in containers.

## Before the first publish (once per machine)

1. **AWS profile.** Add the `fasor-admin` and `fasor-app` profiles from README.md, "Profiles", to `~/.aws/config`. There are no access keys: the login is `aws login` with a passkey.
2. **Variable files.** Both stacks read their e-mail addresses from an untracked `terraform.tfvars` (`*.tfvars` is git-ignored):

   ```sh
   cp infra/bootstrap/terraform.tfvars.example infra/bootstrap/terraform.tfvars
   cp infra/production/terraform.tfvars.example infra/production/terraform.tfvars
   ```

   Put the real addresses in them: `budget_alert_emails` (a list; the operator and the client can both receive the budget alerts) and, in production, `acme_email` (the Let's Encrypt contact). Neither has a default, so a plan without them stops.
3. **Docker buildx** must be available (`docker buildx version`), or **Podman** where there is no `docker` (an Apple silicon Mac with Podman): `infra/bin/lib.sh` picks `docker`, else `podman`, and `CONTAINER_CLI=<name>` overrides it; with Podman the deploy uses `podman build --platform` in place of buildx. The deploy builds for the instance's platform, `linux/amd64` by default.

## Every publish

### 1. Start from a green, clean main

```sh
git switch main && git pull --ff-only
git status --short          # must print nothing tracked
```

The deploy refuses uncommitted changes and tags the images with the HEAD commit, so publish only a commit whose pull request carried a green `pnpm verify` ([docs/TESTING.md](../docs/TESTING.md)).

### 2. Check the infrastructure offline

```sh
infra/bin/check
```

`terraform fmt`, `validate` for both stacks, tflint and ShellCheck. No AWS login needed.

### 3. Log in

```sh
aws login --profile fasor-admin
infra/bin/aws sts get-caller-identity
```

The second command must print the `fasor-admin` user. The session lasts a few hours; log in again if a step answers "Your session has expired".

### 4. Apply the bootstrap stack, only when it changed

The bootstrap stack holds the account-wide pieces: the AWS Organization and its AI opt-out policy, the state bucket, the IAM user and role, the monthly budget. The deploy never touches it. When a merged change edits `infra/bootstrap/`, review and apply it first:

```sh
infra/bin/tf bootstrap plan
infra/bin/tf bootstrap apply
```

Read the plan. A budget or an IAM change is expected there; a replacement of the state bucket or the organization never is.

### 5. Preview the deploy

```sh
infra/bin/deploy --dry-run
```

It prints every command the real run would execute, with placeholder outputs, and touches nothing. To see what Terraform would change in production, also run:

```sh
infra/bin/tf production plan
```

Stop if the plan replaces the database (`aws_db_instance.this`) or the instance (`aws_instance.this`): both are protected, and replacing them is a deliberate runbook step (README.md, "Runbook").

### 6. Deploy

```sh
infra/bin/deploy
```

In order, it builds the api, ocr and caddy images and pushes them to ECR under the commit SHA. It then runs the database migrations as a one-shot ECS task, applies the production stack with the new tag, so the services roll, and waits for `GET https://<public address>/api/health` to report every component up. Only then does it record the tag in SSM, so a later plain `terraform apply` keeps a tag that proved healthy.

Expect 20 to 40 minutes. The OCR image is the largest; a first build downloads its models. A failed migration stops the deploy before any service rolls and prints its CloudWatch log stream.

The app is down for a few seconds while a service rolls (the old task stops before the new one starts). Publish outside field hours.

### 7. Check it

```sh
curl -s https://<public_url>/api/health
infra/bin/aws logs tail /fasor/production/api --since 15m
```

`<public_url>` is the stack's `public_url` output (`infra/bin/tf production output public_url`); with `app_domain` set, `app_url` is the domain's URL and answers the same health check once its certificate is issued (the first request can take a minute). Then sign in from a tablet and open one relatório. A sign-in answering 429 after several wrong passwords is the rate limit working; it is on in production.

### 8. Tag the release

After a healthy deploy, tag the commit you published:

```sh
git tag -a v0.1.1 -m "v0.1.1" <sha>
git push origin v0.1.1
gh release create v0.1.1 --title "v0.1.1" --notes-file <notes.md>
```

Versions follow semantic versioning: the minor number for a new epic or a contract change, the patch number for fixes.

## Rolling back

ECR keeps the last five images of each repository, and tags are immutable, so an earlier tag is exactly the image that ran:

```sh
infra/bin/deploy --skip-build --tag <previous sha>
```

Migrations are forward-only. Roll back across a migration only when the older code tolerates the newer schema; otherwise fix forward.

## Things that are not part of a publish

- **Secrets.** The database password and the session secret are generated by Terraform and stored in SSM. Rotating them is a runbook step (README.md, "Rotate a secret"); rotating the session secret signs every user out.
- **Users.** Production users are provisioned with `scripts/seed-users.ts` through an ECS one-shot task. Pass the password through `SEED_USER_PASSWORD` from SSM, never as a command-line argument or a task override: overrides are readable through `ecs:DescribeTasks`.
- **The AI features.** Production runs with `ai_features = "off"` until Bedrock has a quota (README.md, "AI features flag").
- **Cost.** The whole project stays under USD 100 per month. A change that adds a resource is costed in README.md, "Cost", before it is applied. The budget alerts at 50, 80 and 100 % of actual spend and blocks Bedrock and Textract at 90 %.
