- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-run-the-whole-stack-with-one-command.md`
  summary: Align scripts/test-reset.ts table names with the real schema and add a two-company integration test.
  evidence: The script guesses ops, files, revisions, generation_jobs, reading_runs and skips missing tables while printing success; deletion scoping by company_id and S3 prefix is untested. Unverified until the schema stories create the tables.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-run-the-whole-stack-with-one-command.md`
  summary: Refresh the AGENTS.md "Running and verifying" section with the docker compose forms of verify.
  evidence: It still says TODO until Story 1.1; the host pnpm is broken, so verify runs as docker compose --profile tools run --rm tools pnpm verify. AGENTS.md is agent context, refreshed by bmad-project-context.
- source_spec: `_bmad-output/implementation-artifacts/spec-epic-1-fix-sw-hold-persisted.md`
  summary: Make the shell pin name the shell the page is actually running, not the cache of the worker that receives hold-shell.
  evidence: sw.js pinIfAbsent writes the receiving worker's CACHE_NAME. A tab that loaded a new build from the network before its worker installed, or an old tab under a browser-activated worker after a drain, can pin the other shell. Pre-existing in PR #8's design (the page never reported its shell); the fix needs the page to report its shell identity (for example its entry script path) in hold-shell. Severity medium.
- source_spec: `_bmad-output/implementation-artifacts/spec-epic-1-fix-sw-hold-persisted.md`
  summary: Scope the shell pin per user, or hold while any user on the device has a backlog.
  evidence: The pin is one sentinel per origin while the outbox is per user (releng-{user_id}). User B signing in with an empty outbox posts hold:false and promotes the waiting worker, releasing user A's pin. PR #8's promotion already behaved this way. Severity medium.
