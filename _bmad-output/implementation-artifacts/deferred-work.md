- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-run-the-whole-stack-with-one-command.md`
  summary: Align scripts/test-reset.ts table names with the real schema and add a two-company integration test.
  evidence: The script guesses ops, files, revisions, generation_jobs, reading_runs and skips missing tables while printing success; deletion scoping by company_id and S3 prefix is untested. Unverified until the schema stories create the tables.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-run-the-whole-stack-with-one-command.md`
  summary: Refresh the AGENTS.md "Running and verifying" section with the docker compose forms of verify.
  evidence: It still says TODO until Story 1.1; the host pnpm is broken, so verify runs as docker compose --profile tools run --rm tools pnpm verify. AGENTS.md is agent context, refreshed by bmad-project-context.
- source_spec: `_bmad-output/implementation-artifacts/spec-epic-1-fix-identity-and-kernel.md`
  summary: Migration 0003 drops the identity registration columns without copying them into a user entity.
  evidence: Pre-change users have slug ids and must be re-keyed by a re-seed, which re-applies the CLI registration; only values edited through the removed PUT on a local dev volume are lost. No production data exists before the MVP.
- source_spec: `_bmad-output/implementation-artifacts/spec-epic-1-fix-identity-and-kernel.md`
  summary: Pre-change devices of a re-keyed slug user are stranded (releng-{slug} database, unreadable slug pointer, outbox with the slug actor).
  evidence: userProfileSchema.id is uuidv7 now; the transition is signing in again after the re-seed. Local dev devices only.
- source_spec: `_bmad-output/implementation-artifacts/spec-epic-1-fix-identity-and-kernel.md`
  summary: projectUser checks the entity outside the per-company lock, so parallel seeds on a brand-new volume can log two user creates; a concurrent re-seed can put back a title a sync test changed.
  evidence: State is unaffected (second create is a no-op); the exactly-one-create assertion or the sync title test could flake on a fresh volume.
