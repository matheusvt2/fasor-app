# Epic 1 Context: Sign in and work on the device (offline-first foundation)

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

A company user signs in once, opens the app on any device, and every relatório already in progress is on that device and keeps working with no signal; whatever is captured lands on the device first and reaches the server by itself. This epic stands up the monorepo, the docker-compose stack, the pure domain kernel with its operation log, the local device database, the sync engine, the app shell (Home and Account) and HTTPS access for tablets on the local network — and proves offline work actually holds up on a real device before anything is built on top of it. The whole MVP runs in Docker on a local machine; cloud deployment is out of scope until after the MVP.

## Stories

- Story 1.1: Run the whole stack with one command
- Story 1.2: Build the shared components from the mockups' CSS
- Story 1.3: Sign in and hold a session that survives offline
- Story 1.4: Every change is an operation applied locally first
- Story 1.5: What I did on the tablet reaches the office by itself
- Story 1.6: Home and Account show what is on this device
- Story 1.7: Reach the local stack from a tablet over HTTPS
- Story 1.8: Nothing captured is lost when the tab closes, the network drops or storage is scarce

## Requirements & Constraints

- Offline is a correctness property, not a fallback: every capture path must work with no connectivity inside an ordinary browser tab; the UI never awaits a network call to render or persist a value.
- Every measurement and photo is durable on the device the instant it is captured; sync is idempotent and resumable; a `401` mid-sync never drops queued local work.
- Responsive web app only — no native install, no manifest prompt, no store — running in-tab on Android Chrome, iPadOS Safari and desktop Chrome/Edge.
- Multi-tenancy is structural: every table carries a company id, every server-side data access requires it as an argument, and a cross-tenant read must be provably impossible.
- Users sign in with e-mail and password; no roles, no self-service signup — accounts are provisioned by a seed script with no outbound e-mail.
- The visible product name comes from one swappable constant; no internal codename, client brand or emoji ever appears in the UI.
- The whole MVP runs 100% locally through Docker Compose, nothing native on a developer's machine, cloud deployment deferred to a later epic; configuration enters only through environment variables validated at boot, and the process refuses to start if one is missing.
- One local command (no CI in the MVP) runs lint, static checks, unit/integration tests and a browser smoke pass in under 15 minutes and gates merging a story, with its output recorded in the PR.
- A relatório carries one of four statuses (Rascunho, Em campo, Em revisão, Emitido); Home groups relatórios by status with live counts, surfacing the one in progress on this device first.

## Technical Decisions

- **Local-first client:** every screen reads only from the on-device database (a live query, never fetch-and-render); every committed write becomes one local "operation" applied immediately, before any network call. Only sync, file upload and a short list of named server actions (sign-in, document generation, etc.) may touch the network — lint-enforced.
- **The operation log is the single source of truth.** Every mutation, on device or server, is a typed operation (id, kind, scope, path, value, actor, device, client timestamp, server-assigned sequence once synced) applied through one reducer shared by client and server, so replaying the log on either side yields byte-identical state. Ids are client-generated except for server-created rows. Bulk actions share one batch id, so undo is the inverse batch.
- **Sessions survive offline.** Server and web app share one origin (no CORS); sign-in needs connectivity and sets a long-lived cookie, but once signed in the app works indefinitely offline from the local database; a session-expired response during sync shows a banner without touching queued work. The per-user local database is never dropped on sign-out.
- **Sync is a fixed cycle:** push pending operations, then pull company-wide changes, then pull each relatório's changes — run on tab launch, on regaining connectivity, on a timer, or on demand. The server rejects a pushed operation only for malformed input or a permissions problem, never a business rule; after every pull, operations still waiting locally are re-applied on top of the pulled state. Retries back off with jitter; a rejected operation stays locally with its error for resend.
- **The relatório status table lives in exactly one place** in shared domain code; every transition is emitted as a normal client operation — the server never writes it directly.
- **The UI is built once from the mockups' CSS**, not a themed component kit: tokens and component stylesheets are copied in unchanged; behavior/accessibility comes from an unstyled component library mapped onto those existing CSS states. One shared input layer owns touch, pointer and press-and-hold handling.
- **Repository shape:** a workspace monorepo with a pure, dependency-free domain package shared by client and server, a web app package, an API server package, and placeholder folders for the future OCR sidecar and cloud infra code. Import-direction rules are lint-enforced (web never imported by server; neither app imported by the shared domain code).
- **Local HTTPS for tablets:** a reverse proxy with a locally-trusted certificate authority puts the docker-compose stack on one secure LAN origin — required for camera/location APIs and realistic offline testing on a real device, no cloud account or CORS involved.
- **Durability under adverse conditions:** a service worker precaches only the app shell, never install prompts or background-sync APIs. Unsaved in-progress state is captured on tab hide/close and offered back explicitly on reopen, never silently applied. The app warns before local storage runs out rather than silently refusing a capture, and recovers if the browser evicted storage while the login session survived.

## UX & Interaction Patterns

- Login is minimal: wordmark, two large inputs, one primary button, no imagery. Offline with no session, sign-in is visibly disabled with the reason stated beside it rather than spinning.
- Home leads with a status board (one tile per relatório status, each toggling the list as a filter) and relatório cards showing client/site, dates, status, progress, a compact sync indicator, and this device's availability (on-device and how fresh, downloading, or unavailable and greyed out). The relatório in progress on this device sorts first with a clear "Continue" action.
- Account surfaces professional registration (editable in a small dialog), a light/dark/system theme switch applying immediately, a link to sync status, storage used on this device, and sign-out that never deletes local data. No "install app" option.
- One sync indicator and one banner slot render once for the whole app from shared status logic; banner priority is fixed (conflict, re-auth, recovered draft, suggestions ready, export done, offline, unsynced for days) so only the most important shows. Toasts show one at a time.
- Shared components (buttons, status pill, overflow menu, confirm dialog, chip rows, toggle, checkbox, segmented control, tabs) are built once here and reused unmodified from Epic 2 on — later UI stories must match the mockups exactly. Touch targets are glove-sized, destructive actions are outline style only, confirm dialogs default focus to "Cancel."
- Baseline accessibility applies everywhere: Portuguese language tag, proper dialog semantics with focus trap/return, live-region announcements limited to state transitions, reduced-motion respected, text scales to 200% without breaking layout.

## Cross-Story Dependencies

- Story 1.1 (monorepo, docker-compose, lint rules, the verify gate) is the prerequisite every other story here, and every later epic, builds on.
- Story 1.2 (shared components) must exist before Story 1.3 and Story 1.6 can build Login, Home and Account.
- Story 1.4 (the operation log) is the invariant everything else depends on; Story 1.5's sync engine builds directly on it, as does every write in every later epic.
- Story 1.5 (push/pull/rebase sync) feeds the sync indicator and status surface built in Story 1.6.
- Story 1.7 (HTTPS tablet access) must land before Story 1.8's manual offline-proof script can run on a real device; that script is repeated at the close of every later epic touching capture or sync.
- The post-MVP cloud deployment story depends on this epic's local-only Docker foundation being in place first.
