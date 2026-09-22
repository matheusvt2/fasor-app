# Epic 1 Context: Sign in and work on the device (offline-first foundation)

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

This epic stands up everything the rest of the product depends on: a runnable monorepo and Docker stack, the shared component library built from the mockups' CSS, sign-in with a session that survives being offline, the local-first operation log every write flows through, the sync engine that reconciles device and server, and the Home/Account surfaces showing a user what is on their device. It matters because the product's central bet — a field engineer capturing a multi-day job with no signal, on a tablet, in an ordinary browser tab — must be proven on real hardware before any capture feature is built on top of it; the epic closes with a hands-on offline proof (tab closed mid-sheet, network dropped mid-upload, storage exhausted) on a real iPad that gates everything after it. The MVP runs 100% locally in Docker; AWS is deferred to post-MVP.

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

- Offline is a correctness property: capture screens render only from the local store, never await the network to display or persist a value, and each write is durable on the device before any network call.
- Sign-in is e-mail and password only, no signup, no outbound e-mail; accounts are provisioned by a seed CLI and carry name, council (CREA or CRT), registration number and title. A session must work offline indefinitely, resume sending once online, and never discard queued work on expiry.
- Every table is scoped to a company (tenant); one automated test must prove no data crosses tenants.
- Web-only, no native install (no app store, no home-screen prompt, no Background Sync, no persistent-storage request). Targets: Android Chrome, iPadOS Safari, desktop Chrome/Edge, tablet-first.
- Configuration is environment variables validated at boot; a missing or malformed one halts startup naming it.
- Accessibility floor (WCAG 2.2 AA): minimum hit areas (48px general, 56px field controls), disabled controls carry an adjacent reason and stay in the accessibility tree, live regions announce transitions not counts, reduced motion honored, text enlarges 200% without loss.
- Interface, documents and stored labels are pt-BR; comma decimals, dd/mm dates; timestamps wired as UTC, displayed in America/Sao_Paulo.
- The user-visible product name comes from one config constant; no internal codename, partner brand or emoji may appear anywhere user-visible.
- A fast local test/lint run is the merge gate; there is no CI pipeline in the MVP.
- The manual offline proof must pass before capture features are built on it; if iPadOS Safari fails, supported platforms narrow to Android Chrome and desktop only, with the zero-photo-loss guarantee unchanged.

## Technical Decisions

- **Local-first reads, ops for writes.** Every screen reads from the local store via a live query; every committed write becomes an op applied locally through one reducer before anything touches the network. Only the sync engine, file uploads and a small typed API surface (sign-in/out, generate, preview, reread) may call the network.
- **One operation log is the source of truth.** An op carries a client-generated id, a kind (create/put/remove), a scope, a versioned path, a value, a "previous op" pointer, actor/device/timestamp, and a server-assigned monotonic sequence per company; last-writer-wins by sequence. Bulk actions share a batch id; undo is inverse ops in a new batch. Replaying the log through the device layer and the server layer must yield byte-equal results.
- **IDs are client-generated (uuidv7)**, minted wherever a row is born; the server mints ids only for rows it creates itself.
- **Sync is a fixed cycle** — push pending ops, pull company scope, pull each in-progress relatório — run on launch, on reconnect, every 60 seconds, and on demand. Pulled ops rebase on pending local ops. Errors retry with backoff except 4xx, which never retries except session-expiry (re-auth, local data kept). A rejected op is marked dead with its error code without blocking other ops or users.
- **Auth and session.** The API serves the built web app on one origin (no CORS); e-mail+password issues an httpOnly, secure, 30-day sliding cookie; the per-user local database is keyed by user id and never dropped on sign-out.
- **Offline vehicle.** A service worker precaches only the app shell and activates a new version only when the outbox is empty. Uncommitted UI state is captured on tab hide/close and offered back on reopen, never applied silently. Storage pressure and long-unsynced conditions surface as banners, never a silent capture failure.
- **Relatório status** is driven by one small state table that only client operations can advance; the server never writes it directly.
- **Everything runs in Docker**, including local development. A local reverse-proxy with a locally-trusted certificate exposes the stack over HTTPS to real tablets on the LAN so camera, geolocation and service-worker APIs are available for the offline proof. AWS is out of scope for this epic.
- **Conventions.** TypeScript camelCase, DB snake_case, files kebab-case. The shared component styling layer is copied verbatim from the mockups' CSS, with accessible behavior layered on from a headless component library mapped onto those class names — no second design system.

## UX & Interaction Patterns

- Reference mockups: login, home, account and the sync badge/counts screens, plus their annotated "key" variants.
- Login is minimal: wordmark, two large inputs, one primary button, no imagery; offline with no session shows an explanatory message and disables submit with a stated reason rather than spinning.
- Home shows an app bar (wordmark, title, sync badge, avatar), a status board of four tiles (draft, in-field, in-review, issued) with live counts that filter the list on tap, and relatório cards showing client/site, status, progress, sync state and on-device availability; the relatório currently in-field on this device sorts first with a "Continue" affordance.
- The sync badge is a single always-labeled state (ok, pending, offline, error, conflict) announcing only transitions, not counts; one fixed priority order governs which single banner shows at a time (conflict, re-auth, draft-found, suggestions-ready, relatório-exported, offline, long-unsynced).
- Account lists name, professional registration (editable), a theme switch, a link to sync status, on-device storage usage, and sign-out; there is no "install app" affordance.
- Shared components must match their mockup frames in light and dark at tablet, phone and desktop widths, using only strings from the shared pt-BR copy module.

## Cross-Story Dependencies

- Stories 1.1 and 1.2 (monorepo/Docker and shared components) are foundational to every later story in every epic.
- Story 1.4 (the operation log and its reducer) is the architecture's core invariant: Stories 1.3, 1.5 and 1.6, and all of Epics 2 through 10, depend on it being correct.
- Story 1.5 (sync push/pull/rebase) depends on Story 1.4's op log and feeds the sync badge and device-availability states built in Story 1.6.
- Story 1.7 (HTTPS access from a tablet) is a precondition for Story 1.8's manual offline proof on real hardware; that proof is repeated at the close of every later epic that touches capture or sync (Epics 5, 6 and 8).
- Story 1.3's session and tenant scoping underpin every company-scoped feature from Epic 2 onward; Epic 3's seed-data story is explicitly parallelizable with this epic and does not block on it.
